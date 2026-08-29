import { ModeId, Turn } from '../types';

export function formatTranscript(turns: Turn[], limit = 16): string {
  const recent = limit ? turns.slice(-limit) : turns;
  return recent.map((t) => (t.channel === 'them' ? 'Them: ' : 'You: ') + t.text).join('\n');
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

export function buildSystemPrompt(mode: ModeId, contextBlock: string | null, aiRules?: string): string {
  let base = '';
  switch (mode) {
    case 'say':
      base = 'You are Cue, a discreet real-time copilot whispering natural replies to a candidate during an interview. Draft ONE natural, confident reply in first person. 2-4 sentences. Never echo the question back.';
      break;
    case 'phoneCall':
      base = 'You are Cue assisting the user during a live phone screening call. Responses must be punchy (2-3 sentences), energetic, and use vocal signposting (e.g., "First... Next... The outcome was..."). Speak in first person.';
      break;
    case 'assist':
      base = 'You are Cue, a real-time interview copilot. Look at the conversation, determine the question category (STAR behavioral, technical, motivation, compensation), and deliver the answer directly in first person with metrics.';
      break;
    case 'mock':
      base = 'You are Cue acting as a professional mock interviewer. Ask ONE question at a time in 1-2 sentences and wait for the candidate to respond. Do not answer questions yourself.';
      break;
    case 'coffee':
      base = 'You are Cue roleplaying a casual coffee-chat networking conversation. Trade short, warm, curious conversational turns (1-2 sentences).';
      break;
    case 'followup':
      base = 'Suggest 3 clever follow-up questions or insights the candidate can ask to impress the interviewer.';
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
  return full;
}
