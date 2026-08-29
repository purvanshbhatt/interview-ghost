export type ModeId = 'say' | 'assist' | 'phoneCall' | 'mock' | 'coffee' | 'followup' | 'recap' | 'notes';

export interface Turn {
  id: string;
  channel: 'you' | 'them';
  text: string;
  ts: number;
  isInterim?: boolean;
}

export interface Session {
  id: string;
  title: string;
  mode: ModeId;
  startedAt: number;
  endedAt?: number;
  turns: Turn[];
  summary?: string;
  keyPoints?: string[];
  actionItems?: string[];
  decisions?: string[];
  followUp?: string[];
}

export type LLMProvider = 'openai' | 'anthropic' | 'gemini' | 'groq' | 'ollama' | 'custom' | 'minimax' | 'azure';
export type STTProvider = 'deepgram' | 'openai' | 'gemini' | 'gemini-transcribe';

export interface AppSettings {
  provider: LLMProvider;
  sttProvider: STTProvider;
  apiKeys: {
    openai?: string;
    anthropic?: string;
    gemini?: string;
    deepgram?: string;
    groq?: string;
    ollama?: string;
    custom?: string;
    minimax?: string;
    azure?: string;
  };
  models: {
    [key: string]: {
      fast?: string;
      smart?: string;
    };
  };
  baseUrl?: string;
  resumeText?: string;
  resumeFilename?: string;
  jobDescription?: string;
  starStories?: string;
  whyCompany?: string;
  whyLeaving?: string;
  workStyle?: string;
  salaryTarget?: string;
  questionsToAsk?: string;
  aiRules?: string;
  saveTranscripts?: boolean;
  floatingOverlayEnabled?: boolean;
}
