/**
 * Ghost Chrome Web Extension — Storage Wrapper
 * Manages configuration (chrome.storage.local) and runtime session states (chrome.storage.session)
 */

export const DEFAULT_SETTINGS = {
  // AI Providers & Keys
  provider: 'gemini',
  geminiApiKey: '',
  geminiModelFast: 'gemini-2.5-flash',
  geminiModelSmart: 'gemini-2.5-pro',
  
  openaiApiKey: '',
  openaiModelFast: 'gpt-4o-mini',
  openaiModelSmart: 'gpt-4o',
  
  anthropicApiKey: '',
  anthropicModelFast: 'claude-3-5-haiku-20241022',
  anthropicModelSmart: 'claude-3-5-sonnet-20241022',
  
  groqApiKey: '',
  groqModelFast: 'llama-3.3-70b-versatile',
  groqModelSmart: 'deepseek-r1-distill-llama-70b',
  
  customEndpoint: 'http://127.0.0.1:11434/v1',
  customApiKey: '',
  customModel: 'llama3.2',

  // Mode & Reasoning
  activeMode: 'assist', // 'assist' | 'say' | 'code' | 'notes' | 'followup'
  smart: false,

  // Speech-to-Text Configuration
  sttEngine: 'webspeech', // 'webspeech' | 'groq' | 'deepgram' | 'openai'
  sttLanguage: 'en-US',
  autoSuggestOnSpeechEnd: true,
  speechSilenceThresholdMs: 1500,

  // Persona & Context Injection
  candidateResume: '',
  jobDescription: '',
  customAiRules: '',

  // UI & Overlay Customization
  overlayTheme: 'cyan', // 'cyan' | 'emerald' | 'violet'
  overlayOpacity: 0.85,
  fontSize: 'medium', // 'small' | 'medium' | 'large'
  showTranscriptDrawer: true,
  autoScroll: true
};

export const DEFAULT_SESSION_STATE = {
  recordingState: 'idle', // 'idle' | 'starting' | 'recording' | 'stopping'
  activeTabId: null,
  activeStreamId: null,
  lastTranscript: '',
  lastSuggestion: '',
  isGenerating: false,
  error: null
};

// In-memory fallback for test or non-chrome environments
const memoryLocal = new Map();
const memorySession = new Map();

/**
 * Get extension settings from chrome.storage.local
 */
export async function getSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const data = await chrome.storage.local.get(null);
    return { ...DEFAULT_SETTINGS, ...data };
  }
  const obj = {};
  for (const [k, v] of memoryLocal.entries()) obj[k] = v;
  return { ...DEFAULT_SETTINGS, ...obj };
}

/**
 * Update extension settings in chrome.storage.local
 */
export async function setSettings(patch) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    await chrome.storage.local.set(patch);
    const updated = await getSettings();
    return updated;
  }
  for (const [k, v] of Object.entries(patch)) {
    memoryLocal.set(k, v);
  }
  const obj = {};
  for (const [k, v] of memoryLocal.entries()) obj[k] = v;
  return { ...DEFAULT_SETTINGS, ...obj };
}

/**
 * Get transient session state from chrome.storage.session
 */
export async function getSessionState() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
    const data = await chrome.storage.session.get(null);
    return { ...DEFAULT_SESSION_STATE, ...data };
  }
  const obj = {};
  for (const [k, v] of memorySession.entries()) obj[k] = v;
  return { ...DEFAULT_SESSION_STATE, ...obj };
}

/**
 * Update transient session state in chrome.storage.session
 */
export async function setSessionState(patch) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
    await chrome.storage.session.set(patch);
    const updated = await getSessionState();
    return updated;
  }
  for (const [k, v] of Object.entries(patch)) {
    memorySession.set(k, v);
  }
  const obj = {};
  for (const [k, v] of memorySession.entries()) obj[k] = v;
  return { ...DEFAULT_SESSION_STATE, ...obj };
}

/**
 * Reset memory stores (useful in test runner)
 */
export function resetMemoryStores() {
  memoryLocal.clear();
  memorySession.clear();
}
