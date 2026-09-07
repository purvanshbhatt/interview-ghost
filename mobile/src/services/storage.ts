import * as SecureStore from 'expo-secure-store';
import { AppSettings, Session } from '../types';

const SETTINGS_KEY = 'cue_settings_v1';
const SESSIONS_KEY = 'cue_sessions_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'openai',
  sttProvider: 'deepgram',
  apiKeys: {},
  models: {
    openai: { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
    anthropic: { fast: 'claude-3-5-haiku-latest', smart: 'claude-3-5-sonnet-latest' },
    gemini: { fast: 'gemini-1.5-flash', smart: 'gemini-1.5-pro' },
    groq: { fast: 'llama-3.1-8b-instant', smart: 'llama-3.3-70b-versatile' },
  },
  aiRules: '- Keep replies concise (2-3 sentences).\n- Speak in first person.\n- Avoid unnecessary jargon.',
  saveTranscripts: true,
  floatingOverlayEnabled: true,
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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

import * as FileSystem from 'expo-file-system';

const SESSIONS_FILE = `${FileSystem.documentDirectory || ''}cue_sessions_v1.json`;

export async function loadSessions(): Promise<Session[]> {
  try {
    if (FileSystem.documentDirectory) {
      const info = await FileSystem.getInfoAsync(SESSIONS_FILE);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(SESSIONS_FILE);
        return JSON.parse(raw);
      }
    }

    // Migration fallback from SecureStore
    const raw = await SecureStore.getItemAsync(SESSIONS_KEY);
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
