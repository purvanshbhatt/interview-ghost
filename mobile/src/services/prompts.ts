import { ModeId, Turn } from '../types';

const QUESTION_PATTERNS = [
  /\?(\s*)$/,
  /\b(can|could|would|will|do|did|are|is|have|has|should|what|how|why|where|when|who|which)\b.*\?/i,
  /^(can|could|would|will|do|did|are|is|have|has|should|what|how|why|where|when|who|which)\b/i,
  /\b(tell me about|walk me through|describe|explain|give me an example|what is your|what are your|how do you|how would you|what's your|why did you|why would you)\b/i,
  /\b(salary expectation|compensation expectation|years of experience|familiar with|worked with)\b/i
];

export function isQuestionLike(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 5) return false;
  if (trimmed.includes('?')) return true;
  return QUESTION_PATTERNS.some((re) => re.test(trimmed));
}

export function formatTranscript(turns: Turn[], limit = 16): string {
  if (!turns || !turns.length) return '';
  const recent = limit ? turns.slice(-limit) : turns;
  const hasThem = recent.some((t) => t.channel === 'them');

  if (hasThem) {
    return recent.map((t) => (t.channel === 'them' ? 'Them: ' : 'You: ') + t.text).join('\n');
  }

  // Single-channel / microphone-only fallback:
  // Identify interviewer questions vs candidate answers to prevent self-monologue confusion
  return recent.map((t) => {
    const text = (t.text || '').trim();
    const isQ = isQuestionLike(text);
    return (isQ ? 'Them (Interviewer): ' : 'You (Candidate): ') + text;
  }).join('\n');
}

export function getLatestThemTurn(turns: Turn[]): string | null {
  if (!turns || !turns.length) return null;
  // 1. Explicit channel 'them'
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (t.channel === 'them' && t.text && t.text.trim()) {
      return t.text.trim();
    }
  }
  // 2. Single-channel fallback: extract the latest question asked
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    const text = (t.text || '').trim();
    if (isQuestionLike(text)) {
      return text;
    }
  }
  return null;
}

export const MODES_META: { [key in ModeId]: { title: string; subtitle: string; icon: string; small?: boolean } } = {
  say: {
    title: 'What should I say?',
    subtitle: 'Direct spoken answer based on the ongoing conversation',
    icon: 'MessageSquare',
  },
  assist: {
    title: 'Assist',
    subtitle: 'Smart detection of question type and tailored coaching',
    icon: 'Sparkles',
  },
  phoneCall: {
    title: 'Phone Call Helper',
    subtitle: 'Ultra-concise, conversational guidance for phone screenings',
    icon: 'PhoneCall',
  },
  mock: {
    title: 'Mock Interview',
    subtitle: 'Practice with an AI interviewer across technical and behavioral stages',
    icon: 'Users',
  },
  coffee: {
    title: 'Coffee Chat',
    subtitle: 'Casual, low-pressure networking roleplay',
    icon: 'Coffee',
  },
  followup: {
    title: 'Follow-up Questions',
    subtitle: 'Clever clarifying and probing questions to ask them',
    icon: 'HelpCircle',
    small: true,
  },
  recap: {
    title: 'Recap',
    subtitle: 'Instant summary of topics covered so far',
    icon: 'FileText',
    small: true,
  },
  notes: {
    title: 'Meeting Notes',
    subtitle: 'Auto-structured action items, decisions, and takeaways',
    icon: 'CheckSquare',
  },
};

export function buildSystemPrompt(
  mode: ModeId,
  contextBlock: string | null,
  aiRules?: string,
  language?: string,
  liveTranslate?: boolean,
  targetLanguage?: string
): string {
  let base = '';
  switch (mode) {
    case 'say':
      base = 'You are Ghost, whispering the perfect reply to a candidate during a live interview. Grounded in Google, Meta, and Amazon interview rubrics: for behavioral questions, apply strict STAR (~90s, 3-4 sentences, "I" statements, Google XYZ format "Accomplished X measured by Y doing Z" with metrics). For technical questions, explain trade-offs and architecture first. Draft ONE natural, confident reply in first person. Never echo the question back. Always answer the MOST RECENT interviewer question directly.';
      break;
    case 'phoneCall':
      base = 'You are Ghost assisting the candidate during a live phone screening call. Because phone calls have zero visual feedback, keep answers ultra-punchy (30-60 seconds, 2-3 sentences), energetic, and use vocal signposting ("First, ... Second, ... The outcome was..."). Speak in first person with zero filler.';
      break;
    case 'assist':
      base = 'You are Ghost, an autonomous real-time interview copilot. Look at the conversation, identify question type (STAR behavioral, technical trade-offs, motivation, compensation), and deliver the answer directly in first person with metrics. Focus on answering the newest question without repeating previous answers.';
      break;
    case 'mock':
      base = 'You are Ghost acting as a FAANG-level mock interviewer (Google/Meta/Amazon style). Ask ONE realistic behavioral or technical question at a time in 1-2 sentences and wait for candidate reply. Probe depth on actions and metrics.';
      break;
    case 'coffee':
      base = 'You are Ghost roleplaying a casual coffee-chat networking conversation. Trade short, warm, curious conversational turns (1-2 sentences).';
      break;
    case 'followup':
      base = 'Suggest 3 clever, high-signal follow-up questions the candidate can ask to impress the interviewer based on the technical architecture and team roadmap discussed.';
      break;
    case 'recap':
      base = 'Provide a concise 3-bullet recap of what has been discussed so far.';
      break;
    case 'notes':
      base = 'Extract structured meeting notes: Key Points, Decisions, Action Items, and Next Steps.';
      break;
  }

  let full = contextBlock ? contextBlock + '\n\n' + base : base;
  if (aiRules && aiRules.trim()) {
    full += '\n\nAI Style & Behavioral Rules:\n' + aiRules.trim();
  }
  if (language && language !== 'auto') {
    full += `\n\nMultilingual Mode: The user's active language is "${language}". Provide suggestions and answers in this language unless requested otherwise.`;
  }
  if (liveTranslate) {
    const target = targetLanguage || 'en';
    full += `\n\nLive Translation Active: If non-${target} speech is detected in the transcript, deliver all translations and answers translated into ${target}.`;
  }
  return full;
}
