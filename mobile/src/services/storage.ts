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

export async function loadSessions(): Promise<Session[]> {
  try {
    const raw = await SecureStore.getItemAsync(SESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
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
    await SecureStore.setItemAsync(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 50)));
    return true;
  } catch {
    return false;
  }
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    const sessions = await loadSessions();
    const filtered = sessions.filter((s) => s.id !== id);
    await SecureStore.setItemAsync(SESSIONS_KEY, JSON.stringify(filtered));
    return true;
  } catch {
    return false;
  }
}
