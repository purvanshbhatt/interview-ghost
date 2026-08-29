/**
 * Ghost Chrome Web Extension — Multi-Provider LLM Client
 * Supports Google Gemini, OpenAI, Anthropic, Groq, and OpenAI-Compatible Custom Endpoints.
 * Implements real-time SSE streaming and self-healing fallback from Smart -> Fast tier on 404/429.
 */

import { buildSystemPrompt } from './prompts.js';

export const PROVIDER_MODELS = {
  gemini: {
    fast: 'gemini-2.5-flash',
    smart: 'gemini-2.5-pro'
  },
  openai: {
    fast: 'gpt-4o-mini',
    smart: 'gpt-4o'
  },
  anthropic: {
    fast: 'claude-3-5-haiku-20241022',
    smart: 'claude-3-5-sonnet-20241022'
  },
  groq: {
    fast: 'llama-3.3-70b-versatile',
    smart: 'deepseek-r1-distill-llama-70b'
  },
  custom: {
    fast: 'llama3.2',
    smart: 'llama3.3'
  }
};

/**
 * Resolves the active model name based on provider, smart flag, and custom user overrides.
 */
export function resolveModel({ provider = 'gemini', smart = false, settings = {} } = {}) {
  const defaults = PROVIDER_MODELS[provider] || PROVIDER_MODELS.gemini;
  if (provider === 'gemini') {
    return smart ? (settings.geminiModelSmart || defaults.smart) : (settings.geminiModelFast || defaults.fast);
  }
  if (provider === 'openai') {
    return smart ? (settings.openaiModelSmart || defaults.smart) : (settings.openaiModelFast || defaults.fast);
  }
  if (provider === 'anthropic') {
    return smart ? (settings.anthropicModelSmart || defaults.smart) : (settings.anthropicModelFast || defaults.fast);
  }
  if (provider === 'groq') {
    return smart ? (settings.groqModelSmart || defaults.smart) : (settings.groqModelFast || defaults.fast);
  }
  if (provider === 'custom') {
    return settings.customModel || defaults.fast;
  }
  return defaults.fast;
}

/**
 * Executes a streaming LLM request with self-healing fallback.
 */
export async function streamLLM({
  provider = 'gemini',
  smart = false,
  messages = [],
  mode = 'assist',
  settings = {},
  onToken = () => {},
  onDone = () => {},
  onError = () => {}
}) {
  let activeSmart = smart;
  let model = resolveModel({ provider, smart: activeSmart, settings });

  const systemPrompt = buildSystemPrompt({
    mode,
    smart: activeSmart,
    resume: settings.candidateResume,
    jobDescription: settings.jobDescription,
    aiRules: settings.customAiRules
  });

  try {
    const fullText = await executeStream({
      provider,
      model,
      systemPrompt,
      messages,
      settings,
      onToken
    });
    onDone(fullText);
    return fullText;
  } catch (err) {
    const status = err.status || (err.message && err.message.match(/\b(404|429)\b/) ? Number(RegExp.$1) : null);
    const isRetriable = status === 404 || status === 429 || (err.message && (err.message.includes('404') || err.message.includes('429')));

    // Self-healing fallback: if smart tier model fails with 404 or 429, fall back to fast tier
    if (activeSmart && isRetriable) {
      console.warn(`[Ghost LLM] Smart tier ${model} failed with ${err.message}. Self-healing: falling back to Fast tier...`);
      try {
        const fallbackModel = resolveModel({ provider, smart: false, settings });
        const fallbackSystemPrompt = buildSystemPrompt({
          mode,
          smart: false,
          resume: settings.candidateResume,
          jobDescription: settings.jobDescription,
          aiRules: settings.customAiRules
        });

        const fullText = await executeStream({
          provider,
          model: fallbackModel,
          systemPrompt: fallbackSystemPrompt,
          messages,
          settings,
          onToken
        });
        onDone(fullText);
        return fullText;
      } catch (fallbackErr) {
        onError(fallbackErr);
        throw fallbackErr;
      }
    } else {
      onError(err);
      throw err;
    }
  }
}

/**
 * Internal stream execution router
 */
async function executeStream({ provider, model, systemPrompt, messages, settings, onToken }) {
  if (provider === 'gemini') {
    return streamGemini({ model, systemPrompt, messages, settings, onToken });
  }
  if (provider === 'anthropic') {
    return streamAnthropic({ model, systemPrompt, messages, settings, onToken });
  }
  if (provider === 'openai' || provider === 'groq' || provider === 'custom') {
    return streamOpenAICompatible({ provider, model, systemPrompt, messages, settings, onToken });
  }
  throw new Error(`Unsupported LLM provider: ${provider}`);
}

/**
 * Google Gemini SSE Streaming Implementation
 */
async function streamGemini({ model, systemPrompt, messages, settings, onToken }) {
  const apiKey = settings.geminiApiKey;
  if (!apiKey) throw new Error('Gemini API key is required. Please set it in Ghost Options.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  const contents = [];
  for (const m of messages) {
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    });
  }

  const payload = {
    contents,
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    const err = new Error(`Gemini API error ${response.status}: ${errorText}`);
    err.status = response.status;
    throw err;
  }

  return readSSEStream(response, (data) => {
    try {
      const parsed = JSON.parse(data);
      const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        onToken(text);
        return text;
      }
    } catch {
      // Ignore heartbeat/ping comments
    }
    return '';
  });
}

/**
 * OpenAI / Groq / Custom OpenAI-Compatible SSE Streaming Implementation
 */
async function streamOpenAICompatible({ provider, model, systemPrompt, messages, settings, onToken }) {
  let baseUrl = 'https://api.openai.com/v1';
  let apiKey = settings.openaiApiKey;

  if (provider === 'groq') {
    baseUrl = 'https://api.groq.com/openai/v1';
    apiKey = settings.groqApiKey;
    if (!apiKey) throw new Error('Groq API key is required. Please configure it in Ghost Options.');
  } else if (provider === 'custom') {
    baseUrl = (settings.customEndpoint || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
    apiKey = settings.customApiKey || 'no-key-required';
  } else {
    if (!apiKey) throw new Error('OpenAI API key is required. Please configure it in Ghost Options.');
  }

  const url = `${baseUrl}/chat/completions`;
  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content }))
  ];

  const headers = {
    'Content-Type': 'application/json'
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      temperature: 0.7,
      max_tokens: 1024,
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    const err = new Error(`${provider.toUpperCase()} API error ${response.status}: ${errorText}`);
    err.status = response.status;
    throw err;
  }

  return readSSEStream(response, (data) => {
    if (data === '[DONE]') return '';
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) {
        onToken(delta);
        return delta;
      }
    } catch {
      // Ignore unparseable frames
    }
    return '';
  });
}

/**
 * Anthropic Messages SSE Streaming Implementation
 */
async function streamAnthropic({ model, systemPrompt, messages, settings, onToken }) {
  const apiKey = settings.anthropicApiKey;
  if (!apiKey) throw new Error('Anthropic API key is required. Please configure it in Ghost Options.');

  const url = 'https://api.anthropic.com/v1/messages';
  const anthropicMessages = messages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content
  }));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: anthropicMessages,
      max_tokens: 1024,
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    const err = new Error(`Anthropic API error ${response.status}: ${errorText}`);
    err.status = response.status;
    throw err;
  }

  return readSSEStream(response, (data) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
        const text = parsed.delta.text;
        onToken(text);
        return text;
      }
    } catch {
      // Ignore
    }
    return '';
  });
}

/**
 * Reads and decodes a streaming SSE response body across modern fetch streams.
 */
async function readSSEStream(response, onDataChunk) {
  let accumulated = '';
  
  if (!response.body || !response.body.getReader) {
    // Non-streaming fallback
    const text = await response.text();
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6);
        const chunk = onDataChunk(data);
        if (chunk) accumulated += chunk;
      }
    }
  }

  if (buffer.trim().startsWith('data: ')) {
    const data = buffer.trim().slice(6);
    const chunk = onDataChunk(data);
    if (chunk) accumulated += chunk;
  }

  return accumulated;
}
