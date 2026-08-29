import { fetch } from 'expo/fetch';
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

/** Non-streaming fallback used when the provider/stream fails mid-flight. */
async function nonStreamingFallback(
  options: StreamLLMOptions,
  endpointKind: 'openai' | 'gemini' | 'anthropic',
  args: { endpoint: string; headers: Record<string, string>; body: any }
): Promise<void> {
  const { onToken, onDone } = options;
  const response = await fetch(args.endpoint, {
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

export async function streamLLMResponse(options: StreamLLMOptions): Promise<void> {
  const { mode, turns, userQuery, settings, onToken, onDone, onError } = options;
  const context = buildInterviewContext(settings, mode, turns);
  const systemPrompt = buildSystemPrompt(mode, context, settings.aiRules);
  const transcriptText = formatTranscript(turns, 16);

  const promptContent = userQuery
    ? 'Recent conversation:\n' + (transcriptText || '(none)') + '\n\nCandidate Request: ' + userQuery
    : 'Recent conversation:\n' + (transcriptText || '(none)') + '\n\nProvide the immediate spoken response.';

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

      const response = await fetch(endpoint, {
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

      const contentType = response.headers.get('content-type') || '';
      if (response.body && contentType.includes('event-stream')) {
        const full = await consumeSSEStream(
          response.body as unknown as ReadableStream<Uint8Array>,
          (json) => json.choices?.[0]?.delta?.content || '',
          onToken
        );
        onDone(full);
      } else {
        // Some gateways ignore stream:true and return plain JSON
        const data = await response.json();
        const answer = data.choices?.[0]?.message?.content || '';
        if (answer) onToken(answer);
        onDone(answer);
      }
    } else if (provider === 'gemini') {
      const model = settings.models?.gemini?.fast || 'gemini-1.5-flash';
      const base =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        model +
        ':streamGenerateContent?alt=sse&key=' +
        apiKey;

      const response = await fetch(base, {
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
        throw new Error(errJson.error?.message || 'Gemini API error (' + response.status + ')');
      }

      const full = await consumeSSEStream(
        response.body as unknown as ReadableStream<Uint8Array>,
        (json) => json.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '',
        onToken
      );
      onDone(full);
    } else if (provider === 'anthropic') {
      const model = settings.models?.anthropic?.fast || 'claude-3-5-haiku-latest';
      const endpoint = 'https://api.anthropic.com/v1/messages';

      const response = await fetch(endpoint, {
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

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('event-stream')) {
        const full = await consumeSSEStream(
          response.body as unknown as ReadableStream<Uint8Array>,
          (json) =>
            json.type === 'content_block_delta' && json.delta?.type === 'text_delta'
              ? json.delta.text
              : '',
          onToken
        );
        onDone(full);
      } else {
        const data = await response.json();
        const answer = data.content?.[0]?.text || '';
        if (answer) onToken(answer);
        onDone(answer);
      }
    } else {
      // Providers without streaming support wired yet — graceful message.
      onError(new Error('Provider "' + provider + '" is not supported on mobile yet.'));
    }
  } catch (err: any) {
    // If streaming broke mid-way we surface the error; callers already have partial text.
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
