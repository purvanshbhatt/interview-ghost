const { contextBridge, ipcRenderer, webUtils } = require('electron');
const platform = process.platform;

const ghostBridge = {
  platform,
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch),
  modePromptGet: (mode) => ipcRenderer.invoke('mode-prompt:get', { mode }),
  modePromptSet: (mode, prompt) => ipcRenderer.invoke('mode-prompt:set', { mode, prompt }),
  whisperModels: () => ipcRenderer.invoke('whisper:models'),
  whisperModelDownload: (modelId) => ipcRenderer.invoke('whisper:model-download', modelId),
  whisperModelCancel: (modelId) => ipcRenderer.invoke('whisper:model-cancel', modelId),
  whisperModelDelete: (modelId) => ipcRenderer.invoke('whisper:model-delete', modelId),
  whisperModelImport: (modelId) => ipcRenderer.invoke('whisper:model-import', modelId),
  platformInfo: () => ipcRenderer.invoke('platform:info'),
  invisibilityStatus: () => ipcRenderer.invoke('invisibility:status'),
  ask: (payload) => ipcRenderer.send('ask', payload),
  captureToggle: () => ipcRenderer.invoke('capture:toggle').catch((err) => {
    console.error('[ghost] captureToggle error', err);
    return false;
  }),
  captureState: () => ipcRenderer.invoke('capture:state'),
  micPcm: (arrayBuffer) => ipcRenderer.send('mic:pcm', arrayBuffer),
  systemPcm: (arrayBuffer) => ipcRenderer.send('system:pcm', arrayBuffer),
  setIgnoreMouse: (v) => ipcRenderer.send('mouse:ignore', v),
  clearTranscript: () => ipcRenderer.invoke('transcript:clear'),
  openPane: (url) => ipcRenderer.send('open-pane', url),
  appLinkState: () => ipcRenderer.invoke('applink:state'),
  appLinkRevoke: (callerId) => ipcRenderer.invoke('applink:revoke', callerId),
  appLinkConsentRespond: (id, allowed) => ipcRenderer.send('applink:consent-response', { id, allowed }),
  pickProfileDocument: () => ipcRenderer.invoke('profile:pickDocument'),
  quit: () => ipcRenderer.send('app:quit'),
  permissionsCheck: () => ipcRenderer.invoke('permissions:check'),
  permissionsRequest: () => ipcRenderer.invoke('permissions:request'),
  permissionsContinue: () => ipcRenderer.send('permissions:continue'),
  log: (msg) => ipcRenderer.send('log', msg),
  androidInfo: () => ipcRenderer.invoke('android:info'),
  androidDevices: () => ipcRenderer.invoke('android:devices'),
  androidScreenCap: (serial) => ipcRenderer.invoke('android:screencap', serial),

  // ── Dashboard surface IPC ────────────────────────────────────────────────
  modeList: () => ipcRenderer.invoke('mode:list'),
  modeStart: (mode) => ipcRenderer.invoke('mode:start', { mode }),
  sessionEnd: () => ipcRenderer.invoke('session:end'),
  getPathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch (_) { return null; } },
  modeContextList: (mode, withText) => ipcRenderer.invoke('mode-context:list', { mode, withText }),
  modeContextAddFile: (mode, filePath) => ipcRenderer.invoke('mode-context:add-file', { mode, filePath }),
  modeContextPickAndAdd: (mode) => ipcRenderer.invoke('mode-context:pick-and-add', { mode }),
  modeContextRemoveFile: (mode, name) => ipcRenderer.invoke('mode-context:remove-file', { mode, name }),
  modeContextClear: (mode) => ipcRenderer.invoke('mode-context:clear', { mode }),
  transcriptsList: () => ipcRenderer.invoke('transcripts:list'),
  transcriptsRead: (filePath) => ipcRenderer.invoke('transcripts:read', { path: filePath }),
  transcriptsDelete: (filePath) => ipcRenderer.invoke('transcripts:delete', { path: filePath }),
  dashboardToggle: () => ipcRenderer.invoke('dashboard:toggle'),
  dashboardHide: () => ipcRenderer.invoke('dashboard:hide'),
  dashboardMinimize: () => ipcRenderer.invoke('dashboard:minimize'),
  dashboardMaximize: () => ipcRenderer.invoke('dashboard:maximize'),
  dashboardToggleFullscreen: () => ipcRenderer.invoke('dashboard:toggle-fullscreen'),
  dashboardIsMaximized: () => ipcRenderer.invoke('dashboard:is-maximized'),
  windowResize: (width, height) => ipcRenderer.send('window:resize', { width, height }),
  windowSetCollapsed: (collapsed) => ipcRenderer.send('window:set-collapsed', { collapsed }),
  windowMoveBy: (dx, dy) => ipcRenderer.send('window:move-by', { dx, dy }),

  on: (channel, cb) => {
    const allowed = [
      'capture:state', 'llm:start', 'llm:token', 'llm:done', 'llm:error',
      'status', 'transcript', 'stt:interim', 'stt:final', 'stt:status',
      'vad:state', 'applink:consent-request', 'hide:toggle',
      'whisper:download-progress', 'whisper:models-changed',
      'transcripts:changed', 'transcript:cleared', 'cursor:pos',
      'settings:changed', 'dashboard:maximized-changed',
    ];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, (_e, data) => cb(data));
  }
};

contextBridge.exposeInMainWorld('ghost', ghostBridge);
contextBridge.exposeInMainWorld('cue', ghostBridge);
