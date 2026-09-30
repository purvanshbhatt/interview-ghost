// In React Native / Expo environments, use native globalThis.fetch
const nativeFetch: typeof fetch = typeof fetch !== 'undefined' ? fetch : (globalThis as any).fetch;
import { AppSettings, ModeId, Turn } from '../types';
import { buildSystemPrompt, formatTranscript } from './prompts';
import { buildInterviewContext } from './context-builder';

export interface StreamLLMOptions {
  mode: ModeId;
  turns: Turn[];
  userQuery?: string;
  settings: AppSettings;
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
}

/**
 * Parses a byte stream of Server-Sent Events and extracts delta text.
 * Handles multi-line data frames and [DONE] terminators.
 */
async function consumeSSEStream(
  body: ReadableStream<Uint8Array>,
  extractDelta: (json: any) => string,
  onToken: (token: string) => void
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line
    let sepIndex: number;
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);

      const dataLines = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());
      if (dataLines.length === 0) continue;
      const data = dataLines.join('\n');
      if (data === '[DONE]') return full;

      try {
        const json = JSON.parse(data);
        const delta = extractDelta(json);
        if (delta) {
          full += delta;
          onToken(delta);
        }
      } catch {
        // Ignore malformed keep-alive fragments
      }
    }
  }

  return full;
}

/**
 * Parses an SSE text string (common in React Native where fetch() returns text rather than a ReadableStream).
 */
function parseSSEText(
  rawText: string,
  extractDelta: (json: any) => string,
  onToken: (token: string) => void
): string {
  let full = '';
  const lines = rawText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const dataContent = trimmed.slice(5).trim();
    if (dataContent === '[DONE]') break;
    try {
      const json = JSON.parse(dataContent);
      const delta = extractDelta(json);
      if (delta) {
        full += delta;
        onToken(delta);
      }
    } catch {
      // Ignore malformed fragments
    }
  }
  return full;
}

/**
 * Universal stream processor: reads from ReadableStream if available, or decodes SSE text / JSON payload.
 */
async function processStreamOrTextResponse(
  response: Response,
  extractDelta: (json: any) => string,
  onToken: (token: string) => void,
  extractFullJsonFallback?: (json: any) => string
): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (
    response.body &&
    typeof (response.body as any).getReader === 'function' &&
    contentType.includes('event-stream')
  ) {
    return consumeSSEStream(
      response.body as unknown as ReadableStream<Uint8Array>,
      extractDelta,
      onToken
    );
  }

  const rawText = await response.text();
  if (rawText.includes('data:')) {
    const sseResult = parseSSEText(rawText, extractDelta, onToken);
    if (sseResult) return sseResult;
  }

  try {
    const json = JSON.parse(rawText);
    const directText = extractFullJsonFallback ? extractFullJsonFallback(json) : extractDelta(json);
    if (directText) {
      onToken(directText);
      return directText;
    }
  } catch {}

  return '';
}

/** Non-streaming fallback used when the provider/stream fails mid-flight. */
async function nonStreamingFallback(
  options: StreamLLMOptions,
  endpointKind: 'openai' | 'gemini' | 'anthropic',
  args: { endpoint: string; headers: Record<string, string>; body: any }
): Promise<void> {
  const { onToken, onDone } = options;
  const response = await nativeFetch(args.endpoint, {
    method: 'POST',
    headers: args.headers,
    body: JSON.stringify({ ...args.body, stream: undefined }),
  });
  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error?.message || 'HTTP ' + response.status + ': Failed to generate reply');
  }
  const data = await response.json();
  let answer = '';
  if (endpointKind === 'openai') answer = data.choices?.[0]?.message?.content || '';
  else if (endpointKind === 'gemini') answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  else if (endpointKind === 'anthropic') answer = data.content?.[0]?.text || '';
  if (answer) onToken(answer);
  onDone(answer);
}

export const GEMINI_FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
];

async function streamGeminiWithAutoFallback(
  apiKey: string,
  userSelectedModel: string | undefined,
  systemPrompt: string,
  promptContent: string,
  onToken: (token: string) => void,
  onDone: (full: string) => void
): Promise<void> {
  const deadRegex = /^gemini-(1\.0|1\.5|2\.0|2\.5)(?:-|$)/i;
  let candidateModels: string[];

  if (!userSelectedModel || userSelectedModel === 'auto' || deadRegex.test(userSelectedModel)) {
    candidateModels = [...GEMINI_FALLBACK_MODELS];
  } else {
    // Put user choice first, followed by others as fallback in case of 429/traffic
    candidateModels = [
      userSelectedModel,
      ...GEMINI_FALLBACK_MODELS.filter((m) => m !== userSelectedModel),
    ];
  }

  let lastError: Error | null = null;

  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];
    try {
      const base =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        model +
        ':streamGenerateContent?alt=sse&key=' +
        apiKey;

      const response = await nativeFetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: systemPrompt + '\n\n---\n\n' + promptContent }] },
          ],
          generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `HTTP ${response.status}`;
        // If it's a rate limit (429), server overloaded (503), quota exceeded, or not found (404), try next model
        if (response.status === 429 || response.status === 503 || response.status === 404 || response.status === 400) {
          console.warn(`[Gemini AutoSelector] Model ${model} returned ${response.status} (${errMsg}). Failing over to next candidate...`);
          lastError = new Error(`Model ${model}: ${errMsg}`);
          continue;
        }
        throw new Error(errMsg);
      }

      const full = await processStreamOrTextResponse(
        response,
        (json) => json.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '',
        onToken,
        (json) => json.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || ''
      );

      if (full) {
        onDone(full);
        return;
      }
    } catch (err: any) {
      console.warn(`[Gemini AutoSelector] Failed with ${model}:`, err.message);
      lastError = err;
      if (i < candidateModels.length - 1) {
        continue;
      }
    }
  }
  throw lastError || new Error('All Gemini fallback models exhausted.');
}

export async function streamLLMResponse(options: StreamLLMOptions): Promise<void> {
  const { mode, turns, userQuery, settings, onToken, onDone, onError } = options;
  const context = buildInterviewContext(settings, mode, turns);
  const systemPrompt = buildSystemPrompt(
    mode,
    context,
    settings.aiRules,
    settings.language,
    settings.liveTranslate,
    settings.targetLanguage
  );
  const transcriptText = formatTranscript(turns, 16);
  const latestThem = [...turns].reverse().find(t => t.channel === 'them' && t.text && t.text.trim())?.text.trim();

  let targetPrompt = '';
  if (userQuery && userQuery.trim()) {
    targetPrompt = `🎯 TARGET QUESTION / REQUEST:\n"${userQuery.trim()}"\n\nProvide the immediate response the candidate should say right now.`;
  } else if (latestThem) {
    targetPrompt = `🎯 LATEST INTERVIEWER QUESTION TO ANSWER:\n"${latestThem}"\n\nCRITICAL: Answer this latest question directly. Do NOT repeat previous answers or address earlier questions that are already answered. Deliver the exact words to say out loud right now.`;
  } else {
    targetPrompt = 'Provide the immediate spoken response based on the current interview state.';
  }

  const promptContent = (transcriptText ? 'Recent conversation:\n' + transcriptText + '\n\n' : '') + targetPrompt;

  const provider = settings.provider || 'openai';
  const apiKey = settings.apiKeys?.[provider];

  if (!apiKey && provider !== 'ollama' && provider !== 'custom') {
    onError(new Error('API key for ' + provider.toUpperCase() + ' is missing. Add it in Settings.'));
    return;
  }

  try {
    if (provider === 'openai' || provider === 'groq' || provider === 'custom' || provider === 'ollama') {
      const endpoint =
        provider === 'groq'
          ? 'https://api.groq.com/openai/v1/chat/completions'
          : provider === 'ollama'
          ? (settings.baseUrl || 'http://localhost:11434') + '/v1/chat/completions'
          : provider === 'custom'
          ? (settings.baseUrl || 'http://127.0.0.1:18789') + '/chat/completions'
          : 'https://api.openai.com/v1/chat/completions';

      const model =
        settings.models?.[provider]?.fast ||
        (provider === 'groq' ? 'llama-3.1-8b-instant' : 'gpt-4o-mini');

      const requestBody = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptContent },
        ],
        stream: true,
        temperature: 0.3,
      };

      const response = await nativeFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}),
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(
          errJson.error?.message || 'HTTP ' + response.status + ': Failed to generate reply'
        );
      }

      const full = await processStreamOrTextResponse(
        response,
        (json) => json.choices?.[0]?.delta?.content || '',
        onToken,
        (json) => json.choices?.[0]?.message?.content || ''
      );
      onDone(full);
    } else if (provider === 'gemini') {
      const userModel = settings.models?.gemini?.fast;
      await streamGeminiWithAutoFallback(
        apiKey!,
        userModel,
        systemPrompt,
        promptContent,
        onToken,
        onDone
      );
    } else if (provider === 'anthropic') {
      const model = settings.models?.anthropic?.fast || 'claude-3-5-haiku-latest';
      const endpoint = 'https://api.anthropic.com/v1/messages';

      const response = await nativeFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          system: systemPrompt,
          messages: [{ role: 'user', content: promptContent }],
          max_tokens: 600,
          temperature: 0.3,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error?.message || 'Anthropic API error (' + response.status + ')');
      }

      const full = await processStreamOrTextResponse(
        response,
        (json) =>
          json.type === 'content_block_delta' && json.delta?.type === 'text_delta'
            ? json.delta.text
            : '',
        onToken,
        (json) => json.content?.[0]?.text || ''
      );
      onDone(full);
    } else {
      // Providers without streaming support wired yet — graceful message.
      onError(new Error('Provider "' + provider + '" is not supported on mobile yet.'));
    }
  } catch (err: any) {
    // If streaming broke mid-way we surface the error; callers already have partial text.
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
