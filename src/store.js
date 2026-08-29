// Simple JSON-file settings store (avoids native modules so `npm install` stays clean).
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { normalizeBaseUrl } = require('./openai-compatible');
const { keyFromEnv } = require('./env');

const GHOST_FILE = path.join(app.getPath('userData'), 'ghost-data.json');
const CUE_FILE = path.join(app.getPath('userData'), 'cue-data.json');
const FILE = GHOST_FILE;

// Cap on the user's custom response rules. Generous but bounded: anything longer
// should live in a real prompt file, not in a settings field.
const MAX_AI_RULES_CHARS = 2000;

const DEFAULTS = {
  provider: 'gemini',
  sttProvider: 'auto',
  localWhisper: {
    modelId: 'base.en',
    language: 'auto',
    threads: 0
  },
  smart: false,
  baseUrl: '',
  minimaxRegion: 'global_en',
  apiKeys: { openai: '', anthropic: '', gemini: '', deepgram: '', custom: '', ollama: '', groq: '', minimax: '' , azure: '' },
  azureEndpoint: '',
  // ── Session persistence (dashboard + end-of-session transcript file).
  // saveTranscripts: when true, each completed session saves a plain-text
  // transcript file under <userData>/transcripts/meeting_YYYY-MM-DD_HHMM.txt
  // (plus a structured meeting record in <userData>/meetings.json). When
  // false, meetings.json is still kept for memory injection but no .txt file
  // is written to disk. The structured record mirrors what meetings.js has
  // always stored since its introduction.
  saveTranscripts: true,
  // The active mode picked from the dashboard's "Start Mode" button. The overlay
  // uses it to label the end-of-session transcript file and to scope the file
  // RAG context. Persisted so a closed dashboard remembers the last pick.
  activeMode: 'assist',
  // Tab 2: Profile
  resumeText: '',
  jobDescription: '',
  // Tab 3: Interview Prep
  starStories: '',       // 3-5 behavioral STAR stories in plain English
  whyCompany: '',        // Why do you want to work here?
  whyLeaving: '',        // Why are you leaving your current job?
  workStyle: '',         // How you work, decision-making style, values
  // Tab 4: Q&A
  salaryTarget: '',      // e.g. "$150k-$180k base + equity"
  questionsToAsk: '',    // Questions to ask the interviewer
  // Tab 5: Style — custom response rules
  // The user writes how the AI should write: e.g. "no em-dashes", "use bullet
  // points", "casual tone". Applied to every LLM mode EXCEPT LeetCode (kept
  // strict for coding problems).
  aiRules: '',
  // Per-mode custom prompts. modePrompts[modeId] is an optional prompt the user
  // wrote for a specific mode (e.g. a tweaked mock-interview script). When a
  // non-empty prompt exists for a mode, it replaces that mode's built-in
  // instruction in the live agent (the interview context block + AI rules are
  // still applied on top; the recent transcript is still sent as context).
  modePrompts: {},
  // Window position
  windowX: null,
  windowY: null,
  models: {
    openai: { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
    anthropic: { fast: 'claude-3-5-haiku-latest', smart: 'claude-3-5-sonnet-latest' },
    gemini: { fast: 'gemini-2.5-flash', smart: 'gemini-2.5-flash' },
    custom: { fast: '', smart: '' },
    ollama: { fast: 'llama3.2', smart: 'llama3.3' },
    groq: { fast: 'llama-3.1-8b-instant', smart: 'llama-3.3-70b-versatile' },
    minimax: { fast: 'MiniMax-M2.7', smart: 'MiniMax-M3' },
    azure: { fast: 'gpt-4o-mini', smart: 'gpt-4o' }
  }
};

let data = null;

function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(over || {})) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], over[k]);
    } else {
      if (k === 'aiRules' && typeof over[k] === 'string') {
        out[k] = over[k].slice(0, MAX_AI_RULES_CHARS);
      } else {
        out[k] = over[k];
      }
    }
  }
  return out;
}

function load() {
  if (data) return data;
  let raw = null;
  if (fs.existsSync(GHOST_FILE)) {
    try { raw = fs.readFileSync(GHOST_FILE, 'utf8'); } catch (_) {}
  } else if (fs.existsSync(CUE_FILE)) {
    try {
      raw = fs.readFileSync(CUE_FILE, 'utf8');
      if (raw) {
        try { fs.writeFileSync(GHOST_FILE, raw); } catch (_) {}
      }
    } catch (_) {}
  }

  if (raw) {
    try { data = deepMerge(DEFAULTS, JSON.parse(raw)); }
    catch { data = deepMerge(DEFAULTS, {}); }
  } else {
    data = deepMerge(DEFAULTS, {});
  }

  data.apiKeys = data.apiKeys || {};
  for (const provider of Object.keys(DEFAULTS.apiKeys)) {
    if (!data.apiKeys[provider]) data.apiKeys[provider] = keyFromEnv(provider);
  }
  if (!data.azureEndpoint && process.env.AZURE_OPENAI_ENDPOINT) {
    data.azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  }

  return data;
}

function save() {
  try {
    fs.writeFileSync(GHOST_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    /* ignore */
  }
}

module.exports = {
  MAX_AI_RULES_CHARS,
  DEFAULTS,
  getSettings() { return load(); },
  setSettings(patch) {
    load();
    const nextSettings = deepMerge(data, patch || {});
    nextSettings.baseUrl = normalizeBaseUrl(nextSettings.baseUrl);
    data = nextSettings;
    save();
    return data;
  }
};
