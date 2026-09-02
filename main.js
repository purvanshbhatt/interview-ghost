const { app, BrowserWindow, ipcMain, globalShortcut, screen, session, desktopCapturer, shell, dialog, systemPreferences } = require('electron');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (dashboardWin && !dashboardWin.isDestroyed()) {
      if (dashboardWin.isMinimized()) dashboardWin.restore();
      dashboardWin.show();
      dashboardWin.focus();
    } else if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.showInactive();
      win.focus();
    }
  });
}

const path = require('path');
const os = require('os');
const store = require('./src/store');
const { captureScreenshot } = require('./src/screen');
const { createSTT } = require('./src/stt');
const { parseDocumentFile } = require('./src/resume');
const { createLLM } = require('./src/llm');
const { MODES } = require('./src/prompts');
const { rms16 } = require('./src/wav');
const { createStreamingSTT } = require('./src/stt-streaming');
const { AdaptiveVAD, AudioRingBuffer } = require('./src/vad');
const { buildInterviewContext, detectCategory } = require('./src/interview-context');
const { startAppLink, stopAppLink, recordEvent, appLinkConsentState, revokeAppLinkCaller } = require('./src/applink');
const { createTranscriptPersistence } = require('./src/transcript-persistence');
const { getModeContextStore, addFileToModeContext, removeFileFromModeContext, clearModeContext } = require('./src/mode-context-store');
const { getAndroidInfo, listDevices, captureAndroidScreen } = require('./src/android-bridge');

if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride');
}
const { WhisperModelManager } = require('./src/whisper-model-manager');
const { requireWhisperModel } = require('./src/whisper-model-catalog');
const { locateWhisperRuntime } = require('./src/whisper-runtime');
const { LocalWhisperTranscriber } = require('./src/local-whisper-transcriber');

let win = null;
let dashboardWin = null;

const fullTranscript = [];
let currentSession = null;
let transcriptPersistence = null;

const shortcutState = { assist: false, say: false, leetcode: false, quit: false };
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';

function getWindowsBuild() {
  if (!isWindows) return 0;
  const parts = os.release().split('.').map(Number);
  return parts[2] || 0;
}
const WIN_BUILD = getWindowsBuild();
const WIN_SUPPORTS_CONTENT_PROTECTION = !isWindows || WIN_BUILD >= 19041;

function applyContentProtection(targetWin, name = 'window') {
  if (!targetWin || targetWin.isDestroyed()) return;
  const shouldProtect = !process.env.GHOST_NO_PROTECT && !process.env.CUE_NO_PROTECT;
  if (!shouldProtect || !WIN_SUPPORTS_CONTENT_PROTECTION) return;

  const enforce = () => {
    try {
      if (!targetWin || targetWin.isDestroyed()) return;
      targetWin.setContentProtection(true);
    } catch (e) {
      console.warn('[ghost] Failed to set content protection on ' + name + ':', e && e.message);
    }
  };

  enforce();

  if (targetWin.webContents) {
    targetWin.webContents.on('did-finish-load', enforce);
    targetWin.webContents.on('dom-ready', enforce);
  }
  targetWin.on('ready-to-show', enforce);
  targetWin.on('show', enforce);
  targetWin.on('restore', enforce);
}

let permWin = null;

const state = { capturing: false, busy: false, transcribing: { you: false, them: false } };
let sttDisabled = false;
const buffers = { you: [], them: [] };
const transcript = [];
const MAX_TRANSCRIPT_TURNS = 200;
const MAX_FULL_TRANSCRIPT_TURNS = 60000;
const TRANSCRIPT_WINDOW_MS = 90 * 1000;
const FLUSH_MS = 900;
const STREAM_INACTIVITY_MS = 25000;
const MIN_BYTES = Math.floor(16000 * 2 * 0.10);
const RMS_GATE = 90;
let flushTimer = null;
let whisperModelManager = null;
let localWhisperTranscriber = null;
let activeWhisperModelId = null;
let desiredCaptureState = false;
let captureTransition = Promise.resolve(false);

let streamingSTT = { you: null, them: null };
let streamingMode = false;
const vad = {
  you: new AdaptiveVAD({
    onsetThreshold: 220,
    offsetThreshold: 130,
    silenceFrames: 18,
    onSpeechStart: () => send('vad:state', { channel: 'you', speaking: true }),
    onSpeechEnd: (dur) => send('vad:state', { channel: 'you', speaking: false, durationMs: dur })
  }),
  them: new AdaptiveVAD({
    onsetThreshold: 200,
    offsetThreshold: 120,
    silenceFrames: 20,
    onSpeechStart: () => send('vad:state', { channel: 'them', speaking: true }),
    onSpeechEnd: (dur) => send('vad:state', { channel: 'them', speaking: false, durationMs: dur })
  })
};

const ringBuffers = {
  you: new AudioRingBuffer(300, 16000),
  them: new AudioRingBuffer(300, 16000)
};

function pushTranscript(turn) {
  transcript.push(turn);
  if (transcript.length > MAX_TRANSCRIPT_TURNS) transcript.shift();
  fullTranscript.push(turn);
  if (fullTranscript.length > MAX_FULL_TRANSCRIPT_TURNS) fullTranscript.shift();
}

function send(channel, data) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

function sendToDashboard(channel, data) {
  if (dashboardWin && !dashboardWin.isDestroyed()) {
    dashboardWin.webContents.send(channel, data);
  }
}

function getWhisperRuntime() {
  return locateWhisperRuntime({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath()
  });
}

async function getWhisperOverview() {
  if (!whisperModelManager) throw new Error('The local Whisper model manager is not ready.');
  const runtime = getWhisperRuntime();
  const models = await whisperModelManager.listModels();
  return {
    runtime: {
      available: runtime.available,
      version: runtime.version,
      target: runtime.target,
      message: runtime.message || null
    },
    models
  };
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const W = 700, H = 600;

  const savedSettings = store.getSettings();
  let startX = Math.round(workArea.x + (workArea.width - W) / 2);
  let startY = workArea.y + 6;

  if (savedSettings.windowX !== null && savedSettings.windowY !== null) {
    const clampedX = Math.max(workArea.x - W + 100, Math.min(savedSettings.windowX, workArea.x + workArea.width - 100));
    const clampedY = Math.max(workArea.y, Math.min(savedSettings.windowY, workArea.y + workArea.height - 40));
    startX = clampedX;
    startY = clampedY;
  }

  const winOptions = {
    width: W,
    height: H,
    x: startX,
    y: startY,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    show: false,
    minWidth: 360,
    minHeight: 300,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };

  if (isWindows) {
    winOptions.type = 'toolbar';
  }

  win = new BrowserWindow(winOptions);

  applyContentProtection(win, 'overlayWin');

  win.setAlwaysOnTop(true, 'screen-saver', 1);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (isMac && typeof win.setHiddenInMissionControl === 'function') win.setHiddenInMissionControl(true);

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  let moveSaveTimer = null;
  win.on('moved', () => {
    clearTimeout(moveSaveTimer);
    moveSaveTimer = setTimeout(() => {
      if (win && !win.isDestroyed()) {
        const [x, y] = win.getPosition();
        store.setSettings({ windowX: x, windowY: y });
      }
    }, 500);
  });

  win.setTitle('Microsoft Edge Update');

  win.webContents.on('did-finish-load', () => {
    win.setTitle('Microsoft Edge Update');
    if (isWindows && !WIN_SUPPORTS_CONTENT_PROTECTION) {
      send('status', {
        message: `Heads up: your Windows version (build ${WIN_BUILD}) does not support screen-share hiding. Upgrade to Windows 10 build 19041+ or Windows 11 to enable invisibility in screen shares.`
      });
    }
  });

  win.on('closed', () => {
    win = null;
  });

  win.webContents.on('render-process-gone', (_e, d) => {
    console.log('[ghost] renderer gone', JSON.stringify(d));
    recordEvent({ level: 'fatal', event: 'renderer_gone', code: d && d.reason, msg: 'renderer process ended: ' + JSON.stringify(d), frame: 'BrowserWindow' });
  });
}

async function flushChannel(channel) {
  if (state.transcribing[channel]) return;
  const chunks = buffers[channel];
  if (!chunks.length) return;
  const pcm = Buffer.concat(chunks);
  buffers[channel] = [];
  if (pcm.length < MIN_BYTES) return;
  if (rms16(pcm) < RMS_GATE) return;

  state.transcribing[channel] = true;
  try {
    const settings = store.getSettings();
    const stt = createSTT(settings);
    if (!stt.available) {
      if (!sttDisabled) { sttDisabled = true; send('status', { message: 'No transcription key set. Add an OpenAI (Whisper), Deepgram, or Gemini key in Settings to enable listening. Screen/LeetCode features work without it.' }); }
      return;
    }
    const res = await stt.transcribe(pcm);
    if (res.error) {
      handleSttError(res.error, settings);
      return;
    }
    if (res.text && res.text.trim() && res.text.trim().length > 1 && !/^[?!.,;:\-…]+$/.test(res.text.trim())) {
      const turn = { channel, text: res.text.trim(), ts: Date.now() };
      pushTranscript(turn);
      send('transcript', turn);
    }
  } catch (e) {
    console.log('[stt] error', e && e.message);
    recordEvent({ level: 'error', event: 'stt_failed', msg: e && e.message ? e.message : String(e), frame: 'flushChannel', context: { channel } });
  } finally {
    state.transcribing[channel] = false;
  }
}

function handleSttError(err, settings) {
  console.log('[stt] error', err.provider, err.status, err.code, err.message);
  recordEvent({
    level: 'error',
    event: 'stt_rejected',
    code: err.code || (err.status ? 'http_' + err.status : null),
    msg: err.message,
    frame: 'handleSttError',
    context: { provider: err.provider, status: err.status || null, alreadyDisabled: sttDisabled },
  });
  if (sttDisabled) return;
  const isQuota = err.status === 429 || err.code === 'RESOURCE_EXHAUSTED' || (err.message && err.message.includes('Quota exceeded'));
  const noAccess = err.status === 403 || err.status === 401 || err.code === 'model_not_found' || isQuota;
  sttDisabled = true;
  if (noAccess) {
    send('status', { message: `Transcription off: your ${err.provider} key was rejected or hit a quota limit. Update your key in Settings to resume.` });
  } else {
    send('status', { message: 'Transcription error (' + err.provider + '): ' + err.message });
  }
}

function startFlushLoop() {
  if (flushTimer) return;
  flushTimer = setInterval(() => { flushChannel('you'); flushChannel('them'); }, FLUSH_MS);
}
function stopFlushLoop() { if (flushTimer) { clearInterval(flushTimer); flushTimer = null; } }

function initStreamingSTT() {
  const settings = store.getSettings();
  if (settings.sttProvider === 'local') {
    streamingMode = false;
    return;
  }

  const callbacks = {
    onTranscript: (channel, text) => {
      if (!text || !text.trim()) return;
      const turn = { channel, text: text.trim(), ts: Date.now() };
      pushTranscript(turn);
      send('transcript', turn);
    },
    onInterim: (channel, text) => send('stt:interim', { channel, text }),
    onError: (err) => {
      handleSttError(err, settings);
      fallbackToBatch();
    },
    onStatusChange: (channel, status) => send('stt:status', { channel, connected: status === 'connected' })
  };

  for (const ch of ['you', 'them']) {
    try {
      const res = createStreamingSTT(settings, ch, callbacks);
      if (res && res.type === 'streaming' && res.instance) {
        res.instance.connect();
        streamingSTT[ch] = res.instance;
      } else {
        streamingSTT[ch] = null;
      }
    } catch (e) {
      console.log('[streaming] failed to init ' + ch + ':', e && e.message);
      streamingSTT[ch] = null;
    }
  }

  const activeCount = Object.values(streamingSTT).filter(Boolean).length;
  streamingMode = activeCount > 0;
  if (!streamingMode) {
    startFlushLoop();
  }
}

function fallbackToBatch() {
  for (const ch of ['you', 'them']) {
    if (streamingSTT[ch]) {
      try { streamingSTT[ch].close(); } catch (_) {}
      streamingSTT[ch] = null;
    }
  }
  streamingMode = false;
  startFlushLoop();
}

function stopStreamingSTT() {
  for (const ch of ['you', 'them']) {
    if (streamingSTT[ch]) {
      try { streamingSTT[ch].close(); } catch (_) {}
      streamingSTT[ch] = null;
    }
  }
  streamingMode = false;
}

async function startLocalWhisperCapture(settings) {
  const modelId = settings.whisperModel || 'base.en';
  if (!whisperModelManager) whisperModelManager = new WhisperModelManager({ userDataPath: app.getPath('userData') });
  const models = await whisperModelManager.listModels();
  const found = models.find(m => m.id === modelId);
  if (!found || !found.installed) {
    send('status', { message: `Local Whisper model "${modelId}" is not downloaded. Download it in Settings to transcribe locally.` });
    return;
  }
  const runtime = getWhisperRuntime();
  if (!runtime || !runtime.available) {
    send('status', { message: `Local Whisper runtime is not available: ${runtime?.message || 'missing runtime'}` });
    return;
  }
  localWhisperTranscriber = new LocalWhisperTranscriber({
    sessionOptions: {
      executablePath: runtime.executablePath,
      runtimeDirectory: runtime.runtimeDirectory,
      modelPath: whisperModelManager.getModelPath(found.id),
      language: settings.whisperLanguage || 'auto'
    },
    onTranscript: (channel, text) => {
      const turn = {
        speaker: channel === 'you' ? 'You' : 'Them',
        text,
        timestamp: Date.now(),
        final: true
      };
      pushTranscript(turn);
      send('transcript', turn);
      sendToDashboard('transcript', turn);
    },
    onSpeechState: (channel, speaking) => {
      send('vad:state', { channel, speaking });
    },
    onStatus: (st) => {
      if (st.status === 'ready' || st.status === 'transcribing') {
        send('stt:status', { status: 'connected' });
      }
    },
    onError: (err) => {
      send('status', { message: `Local Whisper error: ${err.message}` });
    }
  });
  activeWhisperModelId = modelId;
  await localWhisperTranscriber.start();
}

async function stopLocalWhisperCapture() {
  if (localWhisperTranscriber) {
    await localWhisperTranscriber.stop();
    localWhisperTranscriber = null;
    activeWhisperModelId = null;
  }
}

async function performCaptureTransition(targetActive) {
  if (state.capturing === targetActive) return state.capturing;
  const settings = store.getSettings();

  if (targetActive) {
    if (settings.sttProvider === 'local') {
      await startLocalWhisperCapture(settings);
    } else {
      initStreamingSTT();
      if (!streamingMode) startFlushLoop();
    }
    state.capturing = true;
    send('capture:state', { capturing: true, active: true, streaming: streamingMode, mode: settings.sttProvider === 'local' ? 'local' : undefined });
    return true;
  } else {
    stopFlushLoop();
    stopStreamingSTT();
    await stopLocalWhisperCapture();
    state.capturing = false;
    send('capture:state', { capturing: false, active: false, streaming: false });
    return false;
  }
}

function setCapturing(active) {
  desiredCaptureState = !!active;
  captureTransition = captureTransition.then(() => performCaptureTransition(desiredCaptureState)).catch((err) => {
    console.error('[capture] transition failed:', err);
    return state.capturing;
  });
  return captureTransition;
}

// -------- ask / streaming LLM --------
let activeStreamAbort = null;
let streamInactivityTimer = null;

function resetStreamInactivityTimer() {
  clearTimeout(streamInactivityTimer);
  streamInactivityTimer = setTimeout(() => {
    if (state.busy && activeStreamAbort) {
      console.log('[llm] stream inactive for 25s — aborting to unwedge state.busy');
      recordEvent({ level: 'error', event: 'llm_stream_timeout', msg: 'stream produced no tokens for 25s', frame: 'resetStreamInactivityTimer' });
      activeStreamAbort();
    }
  }, STREAM_INACTIVITY_MS);
}

function clearStreamInactivityTimer() {
  clearTimeout(streamInactivityTimer);
  streamInactivityTimer = null;
}

async function runFeature(mode, customQuestion = '') {
  if (state.busy) {
    console.log('[llm] busy — ignoring request for mode:', mode);
    return;
  }
  const modeDef = MODES[mode];
  if (!modeDef) {
    console.log('[llm] unknown mode:', mode);
    return;
  }

  const settings = store.getSettings();
  const llm = createLLM(settings);
  if (!llm.ready && !llm.available) {
    send('status', { message: llm.configurationError || 'No AI key configured. Open Settings (Ctrl+,) to add an API key.' });
    return;
  }

  state.busy = true;
  send('llm:start', { mode, question: customQuestion });

  let screenshot = null;
  if (modeDef.needsScreen) {
    try {
      screenshot = await captureScreenshot();
    } catch (e) {
      console.log('[screen] capture error:', e && e.message);
    }
  }

  const now = Date.now();
  const recentTurns = transcript.filter(t => (now - t.ts) < TRANSCRIPT_WINDOW_MS);

  let interviewCtx = null;
  if (mode !== 'leetcode') {
    const category = detectCategory(recentTurns);
    interviewCtx = buildInterviewContext(settings, category);
  }

  let modeContext = null;
  try {
    const modeStore = getModeContextStore(app.getPath('userData'), mode);
    if (modeStore && modeStore.files && modeStore.files.length) {
      modeContext = modeStore.files.map(f => '--- Context File: ' + f.name + ' ---\n' + f.text).join('\n\n');
    }
  } catch (_) {}

  const customPrompt = (settings.customPrompts && settings.customPrompts[mode]) || null;
  let systemPrompt = '';
  if (customPrompt && customPrompt.trim()) {
    systemPrompt = customPrompt.trim();
    if (interviewCtx) systemPrompt = interviewCtx + '\n\n' + systemPrompt;
    if (modeContext) systemPrompt = modeContext + '\n\n' + systemPrompt;
  } else if (typeof modeDef.buildSystemPrompt === 'function') {
    systemPrompt = modeDef.buildSystemPrompt(settings, interviewCtx, customPrompt, modeContext);
  } else if (typeof modeDef.buildSystem === 'function') {
    let combinedCtx = interviewCtx;
    if (modeContext) combinedCtx = combinedCtx ? combinedCtx + '\n\n' + modeContext : modeContext;
    systemPrompt = modeDef.buildSystem(combinedCtx, settings.aiRules);
  }

  let turns = [];
  if (typeof modeDef.buildUserMessage === 'function') {
    turns = modeDef.buildUserMessage(recentTurns, customQuestion, screenshot);
  } else if (typeof modeDef.build === 'function') {
    const userText = modeDef.build({ transcript: recentTurns, userText: customQuestion });
    turns = [{ role: 'user', text: userText }];
  }

  let fullResponse = '';
  resetStreamInactivityTimer();

  try {
    const response = await llm.stream({
      system: systemPrompt,
      turns,
      imageDataUrl: screenshot,
      onToken: (token) => {
        fullResponse += token;
        resetStreamInactivityTimer();
        send('llm:token', { token, text: token });
      }
    });
    clearStreamInactivityTimer();
    activeStreamAbort = null;
    state.busy = false;
    send('llm:done', { text: response || fullResponse });
  } catch (err) {
    clearStreamInactivityTimer();
    activeStreamAbort = null;
    state.busy = false;
    console.log('[llm] chat error:', err && err.message);
    send('llm:error', { error: (err && err.message) || 'Request failed', message: (err && err.message) || 'Request failed' });
  }
}

// -------- IPC channels --------
ipcMain.on('ask', (_e, payload) => {
  const mode = (payload && payload.mode) || 'say';
  const question = (payload && payload.question) || '';
  runFeature(mode, question);
});

ipcMain.handle('capture:toggle', async () => {
  return await setCapturing(!state.capturing);
});

ipcMain.handle('capture:state', () => ({ capturing: state.capturing, active: state.capturing, busy: state.busy, streaming: streamingMode }));

ipcMain.on('mic:pcm', (_e, arrayBuffer) => {
  const buf = Buffer.from(arrayBuffer);
  buffers.you.push(buf);
  if (streamingMode && streamingSTT.you) {
    streamingSTT.you.sendAudio(buf);
  }
  if (localWhisperTranscriber) {
    localWhisperTranscriber.push('you', buf);
  }
});

ipcMain.on('system:pcm', (_e, arrayBuffer) => {
  const buf = Buffer.from(arrayBuffer);
  buffers.them.push(buf);
  if (streamingMode && streamingSTT.them) {
    streamingSTT.them.sendAudio(buf);
  }
  if (localWhisperTranscriber) {
    localWhisperTranscriber.push('them', buf);
  }
});

ipcMain.on('mouse:ignore', (_e, v) => {
  if (isLinux) return; // Linux (X11/Wayland) does not support { forward: true } and drops all input permanently
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(!!v, { forward: true });
  }
});

// Cursor watchdog. The renderer toggles click-through based on its own
// mousemove events, but Windows can silently stop forwarding those once
// setIgnoreMouseEvents(true) is active — leaving the overlay permanently
// click-through until the user resizes the window. Polling the OS cursor
// position here is independent of event forwarding, so it always recovers.
setInterval(() => {
  if (isLinux) return;
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  try {
    const p = screen.getCursorScreenPoint();
    const b = win.getContentBounds();
    const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    if (!inside) return;
    win.webContents.send('cursor:pos', { x: Math.round(p.x - b.x), y: Math.round(p.y - b.y) });
  } catch (_) {}
}, 300);

ipcMain.on('window:resize', (_e, { width, height }) => {
  if (win && !win.isDestroyed()) {
    const W = Math.max(360, Math.min(1600, Math.round(width)));
    const H = Math.max(300, Math.min(1200, Math.round(height)));
    win.setSize(W, H);
  }
});

ipcMain.on('window:set-collapsed', (_e, { collapsed }) => {
  if (win && !win.isDestroyed()) {
    if (collapsed) {
      const [w, h] = win.getSize();
      win._uncollapsedWidth = w;
      win._uncollapsedHeight = h;
      win.setSize(Math.min(w, 440), 56);
    } else {
      const w = win._uncollapsedWidth || 700;
      const h = win._uncollapsedHeight || 600;
      win.setSize(w, h);
    }
  }
});

ipcMain.on('window:move-by', (_e, { dx, dy }) => {
  if (win && !win.isDestroyed()) {
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy));
  }
});

ipcMain.handle('transcript:clear', () => {
  transcript.length = 0;
  send('transcript:cleared', {});
  return true;
});

ipcMain.handle('settings:get', () => store.getSettings());
ipcMain.handle('settings:set', (_e, patch) => {
  const updated = store.setSettings(patch);
  send('settings:changed', updated);
  sendToDashboard('settings:changed', updated);
  if (patch.sttProvider !== undefined || patch.whisperModel !== undefined) {
    sttDisabled = false;
    if (state.capturing) {
      setCapturing(false).then(() => setCapturing(true));
    }
  }
  return updated;
});

ipcMain.handle('invisibility:status', () => ({
  // Chromium implements setContentProtection only on Windows and macOS. On
  // Linux the call is a no-op, so reporting "supported" would be a lie that
  // gets people screen-shared.
  supported: !isLinux && WIN_SUPPORTS_CONTENT_PROTECTION,
  build: WIN_BUILD,
  protected: !isLinux && !process.env.GHOST_NO_PROTECT && !process.env.CUE_NO_PROTECT,
  platform: process.platform,
}));

ipcMain.handle('whisper:models', async () => {
  return await getWhisperOverview();
});

ipcMain.handle('whisper:model-download', async (_e, modelId) => {
  if (!whisperModelManager) whisperModelManager = new WhisperModelManager({ userDataPath: app.getPath('userData') });
  return await whisperModelManager.download(modelId, (progress) => {
    send('whisper:download-progress', { modelId, ...progress });
    sendToDashboard('whisper:download-progress', { modelId, ...progress });
  });
});

ipcMain.handle('whisper:model-cancel', (_e, modelId) => {
  if (whisperModelManager) whisperModelManager.cancelDownload(modelId);
  return { ok: true };
});

ipcMain.handle('whisper:model-delete', async (_e, modelId) => {
  if (!whisperModelManager) whisperModelManager = new WhisperModelManager({ userDataPath: app.getPath('userData') });
  return await whisperModelManager.deleteModel(modelId);
});

ipcMain.handle('whisper:model-import', async (_e, modelId) => {
  const res = await dialog.showOpenDialog({
    title: `Import ${modelId}`,
    filters: [{ name: 'Whisper GGML Model', extensions: ['bin'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  if (!whisperModelManager) whisperModelManager = new WhisperModelManager({ userDataPath: app.getPath('userData') });
  return await whisperModelManager.importModel(modelId, res.filePaths[0]);
});

ipcMain.handle('platform:info', () => ({
  platform: process.platform,
  arch: process.arch,
  windowsBuild: WIN_BUILD,
  isMac,
  isWindows,
  isLinux,
  supportsContentProtection: !isLinux && WIN_SUPPORTS_CONTENT_PROTECTION,
  shortcuts: shortcutState,
}));

// -------- Android device bridge (ADB) --------
ipcMain.handle('android:info', () => getAndroidInfo());
ipcMain.handle('android:devices', () => listDevices());
ipcMain.handle('android:screencap', (_e, serial) => captureAndroidScreen(serial));

ipcMain.handle('profile:pickDocument', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Select Resume or Profile Document',
    filters: [{ name: 'Documents', extensions: ['pdf', 'docx', 'pptx', 'txt', 'md'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const filePath = res.filePaths[0];
  try {
    const text = await parseDocumentFile(filePath);
    return { ok: true, path: filePath, name: path.basename(filePath), text };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('applink:state', () => appLinkConsentState());
ipcMain.handle('applink:revoke', (_e, callerId) => revokeAppLinkCaller(callerId));
ipcMain.on('applink:consent-response', (_e, { id, allowed }) => {
  // Handled by applink.js
});

ipcMain.on('open-pane', (_e, url) => { shell.openExternal(url).catch(() => {}); });
ipcMain.on('app:quit', () => { app.quit(); });

// -------- Dashboard Surface IPC --------
ipcMain.handle('mode:list', () => ({
  ok: true,
  modes: Object.keys(MODES).map((id) => ({
    id,
    needsScreen: !!MODES[id].needsScreen,
    userBubble: MODES[id].userBubble,
  }))
}));

ipcMain.handle('mode:start', async (_e, payload) => {
  const mode = payload && payload.mode;
  if (!mode || !MODES[mode]) return { ok: false, error: 'Unknown mode: ' + (mode || '(none)') };
  store.setSettings({ activeMode: mode });

  if (currentSession) {
    await sessionEndInternal(false);
  }
  currentSession = transcriptPersistence.startMeeting({ mode, channels: 'you,them' });

  hideDashboard();
  showOverlayFromDashboard();
  fullTranscript.length = 0;
  return { ok: true, sessionId: currentSession && currentSession.id };
});

ipcMain.handle('session:end', async () => {
  return await sessionEndInternal(true);
});

async function sessionEndInternal(returnToDashboard) {
  try { await setCapturing(false); } catch (_) {}
  desiredCaptureState = false;

  if (!currentSession) {
    if (returnToDashboard) hideOverlayToDashboard();
    return { ok: true, skipped: true, reason: 'no-active-session' };
  }

  const sessionId = currentSession.id;
  const mode = currentSession.mode || store.getSettings().activeMode || 'unspecified';
  const settings = store.getSettings();

  const buildSummaryPrompt = ({ mode: summaryMode, transcript: summaryTranscript, modeContext }) => {
    const { buildNotesPrompt } = require('./src/notes');
    return {
      system: buildNotesPrompt(summaryTranscript, settings.aiRules),
      turns: [{ role: 'user', text: 'Generate a structured end-of-meeting summary from the conversation above.' }]
    };
  };

  const generateSummary = async (prompt) => {
    try {
      const llm = createLLM(settings);
      if (!llm.ready && !llm.available) return '';
      return await llm.stream({
        system: prompt.system,
        turns: prompt.turns,
        onToken: () => {}
      });
    } catch (e) {
      console.log('[summary] error generating recap:', e && e.message);
      return '';
    }
  };

  const result = await transcriptPersistence.endMeeting({
    meetingId: sessionId,
    mode,
    fullTranscript,
    buildSummaryPrompt,
    generateSummary,
    saveTranscripts: settings.saveTranscripts !== false
  });

  currentSession = null;
  fullTranscript.length = 0;

  if (returnToDashboard) {
    hideOverlayToDashboard();
  }
  sendToDashboard('transcripts:changed', {});
  return { ok: true, ...result };
}

ipcMain.handle('mode-prompt:get', (_e, { mode }) => {
  const prompts = store.getSettings().customPrompts || {};
  return { ok: true, prompt: prompts[mode] || null };
});

ipcMain.handle('mode-prompt:set', (_e, { mode, prompt }) => {
  const current = store.getSettings().customPrompts || {};
  const next = { ...current };
  if (prompt && prompt.trim()) next[mode] = prompt.trim();
  else delete next[mode];
  store.setSettings({ customPrompts: next });
  return { ok: true };
});

ipcMain.handle('mode-context:list', (_e, { mode, withText }) => {
  try {
    const data = getModeContextStore(app.getPath('userData'), mode);
    const files = (data.files || []).map(f => withText ? f : { name: f.name, path: f.path, addedAt: f.addedAt, charCount: f.charCount });
    return { ok: true, files };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('mode-context:add-file', async (_e, { mode, filePath }) => {
  try {
    const text = await parseDocumentFile(filePath);
    const res = addFileToModeContext(app.getPath('userData'), mode, {
      name: path.basename(filePath),
      path: filePath,
      text
    });
    return { ok: true, ...res };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('mode-context:pick-and-add', async (_e, { mode }) => {
  const res = await dialog.showOpenDialog({
    title: `Add Context Document to ${mode}`,
    filters: [{ name: 'Documents', extensions: ['pdf', 'docx', 'pptx', 'txt', 'md'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const filePath = res.filePaths[0];
  try {
    const text = await parseDocumentFile(filePath);
    const addRes = addFileToModeContext(app.getPath('userData'), mode, {
      name: path.basename(filePath),
      path: filePath,
      text
    });
    return { ok: true, ...addRes };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('mode-context:remove-file', (_e, { mode, name }) => {
  try {
    removeFileFromModeContext(app.getPath('userData'), mode, name);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('mode-context:clear', (_e, { mode }) => {
  try {
    clearModeContext(app.getPath('userData'), mode);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('transcripts:list', async () => {
  if (!transcriptPersistence) transcriptPersistence = createTranscriptPersistence(app.getPath('userData'));
  const list = transcriptPersistence.listPastSessions();
  return { ok: true, sessions: list };
});

ipcMain.handle('transcripts:read', async (_e, { path: filePath }) => {
  if (!transcriptPersistence) transcriptPersistence = createTranscriptPersistence(app.getPath('userData'));
  const content = transcriptPersistence.readSessionFile(filePath);
  return { ok: true, content };
});

ipcMain.handle('transcripts:delete', async (_e, { path: filePath }) => {
  if (!transcriptPersistence) transcriptPersistence = createTranscriptPersistence(app.getPath('userData'));
  const ok = transcriptPersistence.deleteSession(filePath);
  return { ok };
});

ipcMain.handle('dashboard:toggle', () => {
  if (dashboardWin && dashboardWin.isVisible()) hideDashboard();
  else showDashboard();
  return { ok: true };
});

ipcMain.handle('dashboard:hide', () => { hideDashboard(); return { ok: true }; });
ipcMain.handle('dashboard:minimize', () => {
  if (dashboardWin && !dashboardWin.isDestroyed()) dashboardWin.minimize();
  return { ok: true };
});
ipcMain.handle('dashboard:maximize', () => {
  if (dashboardWin && !dashboardWin.isDestroyed()) {
    if (dashboardWin.isMaximized()) {
      dashboardWin.unmaximize();
    } else {
      dashboardWin.maximize();
    }
    return { ok: true, isMaximized: dashboardWin.isMaximized() };
  }
  return { ok: false };
});
ipcMain.handle('dashboard:toggle-fullscreen', () => {
  if (dashboardWin && !dashboardWin.isDestroyed()) {
    const fs = !dashboardWin.isFullScreen();
    dashboardWin.setFullScreen(fs);
    return { ok: true, isFullScreen: fs };
  }
  return { ok: false };
});
ipcMain.handle('dashboard:is-maximized', () => {
  if (dashboardWin && !dashboardWin.isDestroyed()) {
    return { isMaximized: dashboardWin.isMaximized(), isFullScreen: dashboardWin.isFullScreen() };
  }
  return { isMaximized: false, isFullScreen: false };
});

// -------- Permissions IPC --------
ipcMain.handle('permissions:check', () => getPermissionStatus());
ipcMain.handle('permissions:request', () => requestPermissions());
ipcMain.on('permissions:continue', async () => {
  const status = await getPermissionStatus();
  if (status.mic === 'granted' && status.screen === 'granted') {
    if (permWin) { permWin.close(); permWin = null; }
    launchApp();
  }
});

// -------- Shortcuts --------
function registerShortcuts() {
  shortcutState.assist = globalShortcut.register('CommandOrControl+Return', () => runFeature('assist', ''));
  shortcutState.say = globalShortcut.register('CommandOrControl+Shift+Return', () => runFeature('say', ''));
  shortcutState.leetcode = globalShortcut.register('CommandOrControl+H', () => runFeature('leetcode', ''));
  shortcutState.hide = globalShortcut.register('CommandOrControl+Shift+/', () => send('hide:toggle', {}));
  shortcutState.quit = globalShortcut.register('CommandOrControl+Shift+X', () => app.quit());
  for (const [name, wasRegistered] of Object.entries(shortcutState)) {
    if (!wasRegistered) {
      recordEvent({ level: 'warn', event: 'shortcut_unavailable', msg: 'another application holds the ' + name + ' shortcut', frame: 'registerShortcuts', context: { shortcut: name } });
    }
  }
}

async function verifyScreenAccess() {
  const sysStatus = systemPreferences.getMediaAccessStatus('screen');
  if (sysStatus === 'granted') return 'granted';
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 16, height: 16 } });
    if (sources.length > 0) {
      const bmp = sources[0].thumbnail.toBitmap();
      if (bmp && bmp.some(byte => byte !== 0)) return 'granted';
    }
  } catch (_) {}
  return sysStatus;
}

async function getPermissionStatus() {
  if (process.platform !== 'darwin') return { mic: 'granted', screen: 'granted' };
  return {
    mic: systemPreferences.getMediaAccessStatus('microphone'),
    screen: await verifyScreenAccess(),
  };
}

async function requestPermissions() {
  if (process.platform !== 'darwin') return true;
  const micStatus = systemPreferences.getMediaAccessStatus('microphone');
  if (micStatus !== 'granted') await systemPreferences.askForMediaAccess('microphone');
  const screenStatus = await verifyScreenAccess();
  if (screenStatus !== 'granted') {
    try { await desktopCapturer.getSources({ types: ['screen'] }); } catch (_) {}
  }
  const status = await getPermissionStatus();
  return status.mic === 'granted' && status.screen === 'granted';
}

function createPermissionsWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const W = 500, H = 540;
  permWin = new BrowserWindow({
    width: W,
    height: H,
    x: Math.round(workArea.x + (workArea.width - W) / 2),
    y: Math.round(workArea.y + (workArea.height - H) / 2),
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: false,
    skipTaskbar: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  });
  applyContentProtection(permWin, 'permWin');
  permWin.loadFile(path.join(__dirname, 'renderer', 'permissions.html'));
  permWin.webContents.on('did-finish-load', () => permWin.show());
}

function createDashboardWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const W = 940, H = 660;
  dashboardWin = new BrowserWindow({
    width: W,
    height: H,
    x: Math.round(workArea.x + (workArea.width - W) / 2),
    y: Math.round(workArea.y + (workArea.height - H) / 2),
    frame: false,
    titleBarStyle: 'hiddenInset',
    resizable: true,
    minimizable: true,
    maximizable: true,
    skipTaskbar: false,
    alwaysOnTop: false,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  applyContentProtection(dashboardWin, 'dashboardWin');
  dashboardWin.loadFile(path.join(__dirname, 'renderer', 'dashboard.html'));
  dashboardWin.on('closed', () => {
    dashboardWin = null;
    if (!currentSession && (!win || !win.isVisible())) {
      app.quit();
    }
  });
  dashboardWin.on('maximize', () => sendToDashboard('dashboard:maximized-changed', { isMaximized: true, isFullScreen: dashboardWin ? dashboardWin.isFullScreen() : false }));
  dashboardWin.on('unmaximize', () => sendToDashboard('dashboard:maximized-changed', { isMaximized: false, isFullScreen: dashboardWin ? dashboardWin.isFullScreen() : false }));
  dashboardWin.on('enter-full-screen', () => sendToDashboard('dashboard:maximized-changed', { isMaximized: true, isFullScreen: true }));
  dashboardWin.on('leave-full-screen', () => sendToDashboard('dashboard:maximized-changed', { isMaximized: dashboardWin ? dashboardWin.isMaximized() : false, isFullScreen: false }));
  dashboardWin.webContents.on('did-finish-load', () => dashboardWin.show());
}

function showDashboard() {
  if (!dashboardWin || dashboardWin.isDestroyed()) createDashboardWindow();
  if (dashboardWin && !dashboardWin.isVisible()) dashboardWin.show();
  if (dashboardWin && dashboardWin.isMinimized()) dashboardWin.restore();
  dashboardWin.focus();
}

function hideDashboard() {
  if (dashboardWin && !dashboardWin.isDestroyed()) dashboardWin.hide();
}

function showOverlayFromDashboard() {
  if (!win || win.isDestroyed()) createWindow();
  if (win && !win.isVisible()) {
    win.showInactive();
    win.focus();
  }
}

function hideOverlayToDashboard() {
  if (win && !win.isDestroyed() && win.isVisible()) win.hide();
  showDashboard();
}

// -------- Launch --------
function launchApp() {
  if (isMac && app.dock) app.dock.hide();

  whisperModelManager = new WhisperModelManager({ userDataPath: app.getPath('userData') });

  const allowMedia = (permission) => permission === 'media' || permission === 'microphone' || permission === 'audioCapture' || permission === 'display-capture' || permission === 'screen';
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowMedia(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowMedia(permission));

  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    console.log('[ghost] displayMediaRequestHandler triggered. request:', JSON.stringify(request));
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const picked = (sources.find((s) => s.display_id) || sources[0]);
      if (!picked) {
        console.log('[ghost] displayMediaRequestHandler: no desktop sources enumerated');
        recordEvent({ level: 'warn', event: 'display_media_no_sources', msg: 'desktopCapturer returned no screen/window sources', frame: 'setDisplayMediaRequestHandler' });
        if (win && !win.isDestroyed()) send('status', { message: 'Meeting audio source unavailable — Ghost can hear your mic only. Restart the app if this persists.' });
        return callback({});
      }
      const out = { video: picked, audio: 'loopback', enableLocalEcho: false };
      console.log('[ghost] displayMediaRequestHandler resolving with out:', JSON.stringify({ videoId: out.video?.id, audio: out.audio, enableLocalEcho: out.enableLocalEcho }));
      return callback(out);
    } catch (err) {
      console.log('[ghost] displayMediaRequestHandler error:', err && err.message);
      recordEvent({ level: 'error', event: 'display_media_handler_failed', msg: err && err.message ? err.message : String(err), frame: 'setDisplayMediaRequestHandler' });
      return callback({});
    }
  }, { useSystemPicker: false });

  startAppLink({
    snapshot: () => ({
      state,
      transcript,
      settings: store.getSettings(),
      sttDisabled,
      shortcuts: { ...shortcutState },
      windowAlive: !!(win && !win.isDestroyed()),
    }),
    setCapturing,
    getWindow: () => win,
  });

  createWindow();
  registerShortcuts();

  transcriptPersistence = createTranscriptPersistence(app.getPath('userData'));
  createDashboardWindow();
}

// -------- Lifecycle --------
app.whenReady().then(async () => {
  app.setName('MicrosoftEdgeUpdate');
  if (isWindows) {
    process.title = 'MicrosoftEdgeUpdate';
  }

  if (isMac) {
    const allGranted = await requestPermissions();
    if (!allGranted) {
      createPermissionsWindow();
      app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createPermissionsWindow(); });
      return;
    }
  }

  launchApp();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDashboardWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopAppLink();
  if (whisperModelManager?.activeDownload) {
    whisperModelManager.cancelDownload(whisperModelManager.activeDownload.modelId);
  }
  if (localWhisperTranscriber) localWhisperTranscriber.forceStop().catch(() => {});
});

app.on('window-all-closed', (e) => {
  if (permWin) { e.preventDefault(); return; }
  app.quit();
});
