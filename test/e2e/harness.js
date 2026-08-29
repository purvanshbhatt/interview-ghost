const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

/**
 * Default mock Ghost settings matching store.js defaults
 */
const DEFAULT_SETTINGS = {
  provider: 'gemini',
  smart: false,
  apiKeys: {
    gemini: 'mock-gemini-key',
    openai: 'mock-openai-key',
    anthropic: 'mock-anthropic-key',
    groq: 'mock-groq-key',
    minimax: 'mock-minimax-key',
    azure: 'mock-azure-key',
    custom: 'mock-custom-key',
  },
  models: {
    gemini: { fast: 'gemini-2.5-flash', smart: 'gemini-2.5-flash' },
    openai: { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
    anthropic: { fast: 'claude-3-5-haiku-latest', smart: 'claude-3-5-sonnet-latest' },
    groq: { fast: 'llama-3.1-8b-instant', smart: 'llama-3.3-70b-versatile' },
    ollama: { fast: 'llama3.2', smart: 'llama3.3' },
    minimax: { fast: 'MiniMax-M2.7', smart: 'MiniMax-M3' },
    azure: { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
    custom: { fast: 'custom-fast', smart: 'custom-smart' },
  },
  baseUrl: '',
  minimaxRegion: 'global_en',
  saveTranscripts: true,
  activeMode: 'assist',
  aiRules: '',
  resumeContext: '',
};

/**
 * 1. Mock Electron Preload IPC Bridge (GhostBridge Contract)
 */
function createMockGhostBridge(initialState = {}) {
  const emitter = new EventEmitter();
  const rawSettings = initialState.settings || {};
  let settings = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(rawSettings)) {
    if (v !== undefined) settings[k] = v;
  }
  let capturing = initialState.capturing || false;
  let mouseIgnored = false;
  let historyCleared = false;
  const asks = [];
  const pcmStreams = { mic: [], system: [] };

  const bridge = {
    platform: process.platform,
    settingsGet: async () => JSON.parse(JSON.stringify(settings)),
    settingsSet: async (patch) => {
      settings = { ...settings, ...patch };
      emitter.emit('settings:changed', settings);
      return JSON.parse(JSON.stringify(settings));
    },
    modePromptGet: async ({ mode }) => ({ mode, prompt: `System prompt for ${mode}` }),
    modePromptSet: async ({ mode, prompt }) => ({ mode, prompt }),
    platformInfo: async () => ({ platform: process.platform, arch: process.arch }),
    invisibilityStatus: async () => ({
      supported: process.platform === 'win32' || process.platform === 'darwin',
      active: !process.env.GHOST_NO_PROTECT && !process.env.CUE_NO_PROTECT,
      platform: process.platform,
    }),
    ask: (payload) => {
      asks.push(payload);
      emitter.emit('ask:dispatched', payload);
    },
    captureToggle: async () => {
      capturing = !capturing;
      emitter.emit('capture:state', { listening: capturing });
      return capturing;
    },
    captureState: async () => ({ listening: capturing }),
    micPcm: (buffer) => {
      pcmStreams.mic.push(buffer);
      emitter.emit('mic:pcm:received', buffer);
    },
    systemPcm: (buffer) => {
      pcmStreams.system.push(buffer);
      emitter.emit('system:pcm:received', buffer);
    },
    setIgnoreMouse: (v) => {
      mouseIgnored = v;
      emitter.emit('mouse:ignore:changed', v);
    },
    clearTranscript: async () => {
      historyCleared = true;
      emitter.emit('transcript:cleared');
      return true;
    },
    openPane: (url) => emitter.emit('open-pane', url),
    quit: () => emitter.emit('app:quit'),

    // Event listener registration
    on: (channel, cb) => {
      emitter.on(channel, cb);
      return () => emitter.off(channel, cb);
    },

    // Test Inspection Helpers
    __emit: (channel, data) => emitter.emit(channel, data),
    __getSettings: () => settings,
    __getAsks: () => asks,
    __isMouseIgnored: () => mouseIgnored,
    __isCapturing: () => capturing,
    __isHistoryCleared: () => historyCleared,
    __getPcmStreams: () => pcmStreams,
  };

  return bridge;
}

/**
 * 2. Mock DOM Simulator for Overlay Layout, Isolation & Hit-Testing
 */
function createDOMSimulator() {
  const elements = {
    app: { id: 'app', classList: new Set(['app']), style: { pointerEvents: 'none' }, bounds: { x: 0, y: 0, width: 700, height: 600 } },
    toolbar: { id: 'toolbar', classList: new Set(['toolbar']), style: { pointerEvents: 'auto' }, bounds: { x: 20, y: 20, width: 660, height: 44 } },
    panelWrap: { id: 'panel-wrap', classList: new Set(['panel-wrap']), style: { width: '624px', transform: 'translateX(0)' }, bounds: { x: 38, y: 80, width: 624, height: 180 } },
    panelMain: { id: 'panel-main', classList: new Set(['panel-main']), style: {}, children: [] },
    composer: { id: 'composer', classList: new Set(['composer']), style: { height: '80px' }, bounds: { x: 40, y: 85, width: 620, height: 80 } },
    input: {
      id: 'input',
      value: '',
      style: { height: '28px' },
      scrollHeight: 28,
      placeholder: 'Ask Ghost anything...',
      classList: new Set(),
      focus: function () { this.focused = true; },
      blur: function () { this.focused = false; },
      focused: false,
    },
    actionPills: { id: 'action-pills', classList: new Set(['composer-actions']), bounds: { x: 40, y: 130, width: 620, height: 32 } },
    transcriptSidebar: {
      id: 'transcript-sidebar',
      classList: new Set(['transcript-sidebar', 'hidden']),
      style: { display: 'none' },
      bounds: { x: 460, y: 80, width: 220, height: 480 },
    },
    tsList: { id: 'ts-list', classList: new Set(['ts-list']), children: [] },
    settingsScrim: { id: 'settings-scrim', classList: new Set(['settings-scrim', 'hidden']), style: { display: 'none' }, bounds: { x: 0, y: 0, width: 700, height: 600 } },
    settingsModal: { id: 'settings-modal', activeTab: 'keys', tabs: ['keys', 'audio', 'profile', 'prep', 'style', 'qa', 'android'] },
  };

  const dom = {
    elements,

    // Class list helpers
    addClass: (id, cls) => {
      elements[id]?.classList.add(cls);
      if (id === 'transcriptSidebar' && cls === 'hidden') elements.transcriptSidebar.style.display = 'none';
      if (id === 'transcriptSidebar' && cls !== 'hidden') elements.transcriptSidebar.style.display = 'flex';
      if (id === 'settingsScrim' && cls === 'hidden') elements.settingsScrim.style.display = 'none';
      if (id === 'settingsScrim' && cls !== 'hidden') elements.settingsScrim.style.display = 'flex';
      if (id === 'panelWrap' && cls === 'sidebar-open') {
        elements.panelWrap.style.width = '420px';
        elements.panelWrap.style.transform = 'translateX(-120px)';
        elements.panelWrap.bounds = { x: 20, y: 80, width: 420, height: 180 };
      }
    },
    removeClass: (id, cls) => {
      elements[id]?.classList.delete(cls);
      if (id === 'transcriptSidebar' && cls === 'hidden') elements.transcriptSidebar.style.display = 'flex';
      if (id === 'settingsScrim' && cls === 'hidden') elements.settingsScrim.style.display = 'flex';
      if (id === 'panelWrap' && cls === 'sidebar-open') {
        elements.panelWrap.style.width = '624px';
        elements.panelWrap.style.transform = 'translateX(0)';
        elements.panelWrap.bounds = { x: 38, y: 80, width: 624, height: 180 };
      }
    },
    hasClass: (id, cls) => elements[id]?.classList.has(cls) || false,

    // Append speech turn into transcript sidebar exclusively
    appendTranscriptTurn: (channel, text, interim = false) => {
      const turn = { channel, text, interim, ts: Date.now() };
      elements.tsList.children.push(turn);
      return turn;
    },

    // User typing into composer input
    setUserInput: (text) => {
      elements.input.value = text;
      // Stable height calculation without jumping
      elements.input.scrollHeight = Math.min(140, Math.max(28, 28 + Math.floor(text.length / 50) * 20));
      elements.input.style.height = `${elements.input.scrollHeight}px`;
    },

    // Point over UI Hit-Testing Algorithm (Mirroring renderer.js pointOverUI)
    pointOverUI: (x, y) => {
      if (x < 0 || y < 0 || x > 700 || y > 600) return false;

      // If settings modal is visible, entire scrim intercepts pointer
      if (!elements.settingsScrim.classList.has('hidden')) return true;

      // Check toolbar
      const tb = elements.toolbar.bounds;
      if (x >= tb.x && x <= tb.x + tb.width && y >= tb.y && y <= tb.y + tb.height) return true;

      // Check panel-wrap (main prompt & response area)
      const pw = elements.panelWrap.bounds;
      if (x >= pw.x && x <= pw.x + pw.width && y >= pw.y && y <= pw.y + pw.height) return true;

      // Check transcript-sidebar (ONLY when not hidden)
      if (!elements.transcriptSidebar.classList.has('hidden')) {
        const sb = elements.transcriptSidebar.bounds;
        if (x >= sb.x && x <= sb.x + sb.width && y >= sb.y && y <= sb.y + sb.height) return true;
      }

      // Background transparent space is click-through
      return false;
    },
  };

  return dom;
}

/**
 * 3. Mock Multi-Provider LLM Streaming Simulator with Self-Healing Fallback
 */
function createMockLLMProvider(config = {}) {
  const {
    provider = 'gemini',
    smart = false,
    modelOverrides = {},
    simulatedError = null, // e.g. { status: 404 } or { status: 429 }
    tokenResponse = ['Hello', ', ', 'I am ', 'Ghost', ' copilot.'],
  } = config;

  const defaultModels = {
    gemini: { fast: 'gemini-2.5-flash', smart: 'gemini-2.5-flash' },
    openai: { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
    anthropic: { fast: 'claude-3-5-haiku-latest', smart: 'claude-3-5-sonnet-latest' },
    groq: { fast: 'llama-3.1-8b-instant', smart: 'llama-3.3-70b-versatile' },
    ollama: { fast: 'llama3.2', smart: 'llama3.3' },
    minimax: { fast: 'MiniMax-M2.7', smart: 'MiniMax-M3' },
    azure: { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
    custom: { fast: 'custom-fast', smart: 'custom-smart' },
  };

  const providerModels = modelOverrides[provider] || defaultModels[provider] || { fast: 'fast-model', smart: 'smart-model' };
  const targetModel = smart ? providerModels.smart : providerModels.fast;
  const maxTokens = smart ? 1400 : 700;

  let streamAttemptCount = 0;
  let activeModelUsed = targetModel;
  let fallbackTriggered = false;

  return {
    provider,
    smart,
    model: targetModel,
    maxTokens,
    ready: true,

    stream: async ({ onToken, onDone, onError, system, turns }) => {
      streamAttemptCount += 1;

      // Simulate 404 or 429 error on smart tier
      if (simulatedError && smart && streamAttemptCount === 1) {
        // Self-healing: Catch 404/429 and fallback to fast tier
        if (simulatedError.status === 404 || simulatedError.status === 429) {
          fallbackTriggered = true;
          activeModelUsed = providerModels.fast;
          // Retry stream on fast tier
          for (const token of tokenResponse) {
            if (onToken) onToken(token);
          }
          if (onDone) onDone();
          return tokenResponse.join('');
        }

        const err = new Error(simulatedError.message || `Provider error ${simulatedError.status}`);
        err.status = simulatedError.status;
        if (onError) onError(err);
        throw err;
      }

      // Normal stream delivery
      for (const token of tokenResponse) {
        if (onToken) onToken(token);
      }
      if (onDone) onDone();
      return tokenResponse.join('');
    },

    __getAttemptCount: () => streamAttemptCount,
    __getActiveModelUsed: () => activeModelUsed,
    __isFallbackTriggered: () => fallbackTriggered,
  };
}

/**
 * 4. Mock Audio Pipeline & Speech-To-Text Streamer
 */
function createMockAudioPipeline() {
  const events = new EventEmitter();
  let capturing = false;

  return {
    start: () => {
      capturing = true;
      events.emit('capture:state', { listening: true });
    },
    stop: () => {
      capturing = false;
      events.emit('capture:state', { listening: false });
    },
    isCapturing: () => capturing,

    // Emit 16kHz PCM audio
    pushPCM: (channel, sampleCount = 3200) => {
      const buffer = Buffer.alloc(sampleCount * 2); // 16-bit PCM
      events.emit(`${channel}:pcm`, buffer);
      return buffer;
    },

    // Emit VAD speech boundaries
    emitVAD: (channel, speaking) => {
      events.emit('vad:state', { channel, speaking });
    },

    // Emit live speech transcript
    emitSpeech: (channel, text, isFinal = true) => {
      if (!isFinal) {
        events.emit('stt:interim', { channel, text });
      } else {
        events.emit('transcript', { channel, text, ts: Date.now() });
        events.emit('stt:final', { channel, text });
      }
    },

    on: (evt, cb) => events.on(evt, cb),
  };
}

/**
 * 5. Mock Chrome Extension MV3 Runtime Simulator
 */
function createExtensionMV3Simulator() {
  const storageLocal = {};
  const storageSession = {};
  let offscreenActive = false;
  let activeTabId = 101;
  let captureStreamId = null;
  const messages = [];

  const chromeMock = {
    runtime: {
      id: 'ghost-extension-id',
      sendMessage: async (msg) => {
        messages.push(msg);
        return { success: true };
      },
      onMessage: {
        addListener: (fn) => {},
      },
    },
    storage: {
      local: {
        get: async (keys) => {
          if (typeof keys === 'string') return { [keys]: storageLocal[keys] };
          return storageLocal;
        },
        set: async (obj) => Object.assign(storageLocal, obj),
      },
      session: {
        get: async (keys) => {
          if (typeof keys === 'string') return { [keys]: storageSession[keys] };
          return storageSession;
        },
        set: async (obj) => Object.assign(storageSession, obj),
      },
    },
    tabCapture: {
      getMediaStreamId: async (opts) => {
        captureStreamId = `stream-${opts.targetTabId || activeTabId}-${Date.now()}`;
        return captureStreamId;
      },
    },
    offscreen: {
      createDocument: async (opts) => {
        offscreenActive = true;
        return true;
      },
      closeDocument: async () => {
        offscreenActive = false;
        return true;
      },
      hasDocument: async () => offscreenActive,
    },
    tabs: {
      query: async (queryInfo) => [{ id: activeTabId, url: 'https://meet.google.com/abc-defg-hij' }],
    },
  };

  return {
    chrome: chromeMock,
    __isOffscreenActive: () => offscreenActive,
    __getCaptureStreamId: () => captureStreamId,
    __getMessages: () => messages,
  };
}

/**
 * 6. Native iOS Project Configuration Validator
 */
function createIOSValidator(projectRoot) {
  const iosPath = path.join(projectRoot, 'mobile', 'ios');

  return {
    hasPodfile: () => fs.existsSync(path.join(iosPath, 'Podfile')),
    hasInfoPlist: () => fs.existsSync(path.join(iosPath, 'Ghost', 'Info.plist')),
    hasXcodeProject: () => fs.existsSync(path.join(iosPath, 'Ghost.xcodeproj', 'project.pbxproj')),
    hasAppDelegate: () =>
      fs.existsSync(path.join(iosPath, 'Ghost', 'AppDelegate.mm')) ||
      fs.existsSync(path.join(iosPath, 'Ghost', 'AppDelegate.m')),

    readInfoPlist: () => {
      const p = path.join(iosPath, 'Ghost', 'Info.plist');
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    },
    readPodfile: () => {
      const p = path.join(iosPath, 'Podfile');
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    },
  };
}

/**
 * 7. Repository Secret & Path Sanitization Auditor
 */
function createSanitizationAuditor(projectRoot) {
  const secretPatterns = [
    /AIzaSy[A-Za-z0-9_-]{33}/, // Live Google API key
    /sk-proj-[A-Za-z0-9_-]{40,}/, // Live OpenAI key
    /ghp_[A-Za-z0-9]{36}/, // GitHub token
    /-----BEGIN (?:RSA|OPENSSH) PRIVATE KEY-----/,
  ];

  const machinePathPatterns = [
    /[A-Z]:\\projects\\interview-helper\\cue/i,
    /\/home\/purvansh\/Android\/Sdk/i,
  ];

  return {
    checkTextForSecrets: (text) => {
      for (const pattern of secretPatterns) {
        if (pattern.test(text)) return { leaked: true, pattern: pattern.toString() };
      }
      return { leaked: false };
    },
    checkTextForMachinePaths: (text) => {
      for (const pattern of machinePathPatterns) {
        if (pattern.test(text)) return { matched: true, pattern: pattern.toString() };
      }
      return { matched: false };
    },
    hasFile: (relPath) => fs.existsSync(path.join(projectRoot, relPath)),
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  createMockGhostBridge,
  createDOMSimulator,
  createMockLLMProvider,
  createMockAudioPipeline,
  createExtensionMV3Simulator,
  createIOSValidator,
  createSanitizationAuditor,
};
