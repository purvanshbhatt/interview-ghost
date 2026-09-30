import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import { AppSettings, Session } from '../types';

const SETTINGS_KEY = 'ghost_settings_v1';
const LEGACY_SETTINGS_KEY = 'cue_settings_v1';
const SESSIONS_KEY = 'ghost_sessions_v1';
const LEGACY_SESSIONS_KEY = 'cue_sessions_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'openai',
  sttProvider: 'deepgram',
  apiKeys: {},
  models: {
    openai: { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
    anthropic: { fast: 'claude-3-5-haiku-latest', smart: 'claude-3-5-sonnet-latest' },
    gemini: { fast: 'auto', smart: 'gemini-3.8-flash' },
    groq: { fast: 'llama-3.1-8b-instant', smart: 'llama-3.3-70b-versatile' },
  },
  aiRules: '- Keep replies concise (2-3 sentences).\n- Speak in first person.\n- Avoid unnecessary jargon.',
  saveTranscripts: true,
  floatingOverlayEnabled: true,
  language: 'auto',
  liveTranslate: false,
  targetLanguage: 'en',
};

const DEAD_GEMINI_MODEL_RE = /^gemini-(1\.0|1\.5|2\.0|2\.5)(?:-|$)/i;

export async function loadSettings(): Promise<AppSettings> {
  try {
    let raw = await SecureStore.getItemAsync(SETTINGS_KEY);
    if (!raw) {
      // Check legacy migration
      raw = await SecureStore.getItemAsync(LEGACY_SETTINGS_KEY);
      if (raw) {
        await SecureStore.setItemAsync(SETTINGS_KEY, raw);
        try {
          await SecureStore.deleteItemAsync(LEGACY_SETTINGS_KEY);
        } catch {}
      }
    }
    if (!raw) return DEFAULT_SETTINGS;
    const loaded: AppSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    if (loaded.models?.gemini) {
      if (DEAD_GEMINI_MODEL_RE.test(loaded.models.gemini.fast || '')) {
        loaded.models.gemini.fast = 'auto';
      }
      if (DEAD_GEMINI_MODEL_RE.test(loaded.models.gemini.smart || '')) {
        loaded.models.gemini.smart = 'gemini-3.8-flash';
      }
    }
    return loaded;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

const SESSIONS_FILE = `${FileSystem.documentDirectory || ''}ghost_sessions_v1.json`;
const LEGACY_SESSIONS_FILE = `${FileSystem.documentDirectory || ''}cue_sessions_v1.json`;

export async function loadSessions(): Promise<Session[]> {
  try {
    if (FileSystem.documentDirectory) {
      const info = await FileSystem.getInfoAsync(SESSIONS_FILE);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(SESSIONS_FILE);
        return JSON.parse(raw);
      }
      // Migrate legacy file if present
      const legacyInfo = await FileSystem.getInfoAsync(LEGACY_SESSIONS_FILE);
      if (legacyInfo.exists) {
        const legacyRaw = await FileSystem.readAsStringAsync(LEGACY_SESSIONS_FILE);
        const parsed = JSON.parse(legacyRaw);
        await FileSystem.writeAsStringAsync(SESSIONS_FILE, legacyRaw);
        try {
          await FileSystem.deleteAsync(LEGACY_SESSIONS_FILE);
        } catch {}
        return parsed;
      }
    }

    // Migration fallback from SecureStore
    let raw = await SecureStore.getItemAsync(SESSIONS_KEY);
    if (!raw) {
      raw = await SecureStore.getItemAsync(LEGACY_SESSIONS_KEY);
      if (raw) {
        try {
          await SecureStore.deleteItemAsync(LEGACY_SESSIONS_KEY);
        } catch {}
      }
    }
    if (!raw) return [];
    const sessions = JSON.parse(raw);
    if (FileSystem.documentDirectory) {
      await FileSystem.writeAsStringAsync(SESSIONS_FILE, JSON.stringify(sessions));
      try {
        await SecureStore.deleteItemAsync(SESSIONS_KEY);
      } catch {}
    }
    return sessions;
  } catch {
    return [];
  }
}

export async function saveSession(session: Session): Promise<boolean> {
  try {
    const sessions = await loadSessions();
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      sessions[idx] = session;
    } else {
      sessions.unshift(session);
    }
    const sliced = sessions.slice(0, 50);
    if (FileSystem.documentDirectory) {
      await FileSystem.writeAsStringAsync(SESSIONS_FILE, JSON.stringify(sliced));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    const sessions = await loadSessions();
    const filtered = sessions.filter((s) => s.id !== id);
    if (FileSystem.documentDirectory) {
      await FileSystem.writeAsStringAsync(SESSIONS_FILE, JSON.stringify(filtered));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
