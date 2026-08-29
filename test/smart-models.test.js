const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

let mockOpenAIHandler = null;
let mockAnthropicHandler = null;
let mockGeminiHandler = null;
let mockFetchHandler = null;

const originalModuleLoad = Module._load;
const originalFetch = globalThis.fetch;

Module._load = function (request, parent, isMain) {
  if (request === 'openai') {
    return class MockOpenAI {
      constructor(clientOptions) {
        this.clientOptions = clientOptions;
        this.chat = {
          completions: {
            create: async (req) => {
              if (mockOpenAIHandler) return mockOpenAIHandler(clientOptions, req);
              return [{ choices: [{ delta: { content: 'openai-default-resp' } }] }];
            }
          }
        };
      }
      static AzureOpenAI = class MockAzureOpenAI {
        constructor(clientOptions) {
          this.clientOptions = clientOptions;
          this.chat = {
            completions: {
              create: async (req) => {
                if (mockOpenAIHandler) return mockOpenAIHandler(clientOptions, req);
                return [{ choices: [{ delta: { content: 'azure-default-resp' } }] }];
              }
            }
          };
        }
      };
    };
  }
  if (request === '@anthropic-ai/sdk') {
    return class MockAnthropic {
      constructor(clientOptions) {
        this.clientOptions = clientOptions;
        this.messages = {
          create: async (req) => {
            if (mockAnthropicHandler) return mockAnthropicHandler(clientOptions, req);
            return [
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'anthropic-default-resp' } }
            ];
          }
        };
      }
    };
  }
  if (request === '@google/genai') {
    return {
      GoogleGenAI: class MockGoogleGenAI {
        constructor(clientOptions) {
          this.clientOptions = clientOptions;
          this.models = {
            generateContentStream: async (req) => {
              if (mockGeminiHandler) return mockGeminiHandler(clientOptions, req);
              return [{ text: 'gemini-default-resp' }];
            }
          };
        }
      }
    };
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};

globalThis.fetch = async function (url, init) {
  if (mockFetchHandler) return mockFetchHandler(url, init);
  return originalFetch.apply(this, arguments);
};

test.after(() => {
  Module._load = originalModuleLoad;
  globalThis.fetch = originalFetch;
});

test.beforeEach(() => {
  mockOpenAIHandler = null;
  mockAnthropicHandler = null;
  mockGeminiHandler = null;
  mockFetchHandler = null;
});

const {
  createLLM,
  formatProviderErrorMessage,
  isQuotaError,
  isNotFoundError,
  CURRENT_GEMINI_DEFAULT,
  DEFAULT_MODELS,
  DEFAULT_FAST_MODELS,
  DEFAULT_SMART_MODELS
} = require('../src/llm');

// ── 1. Default Model Matrix & Resolution Across All 8 Providers ──────────────

test('exports complete DEFAULT_FAST_MODELS and DEFAULT_SMART_MODELS for all 8 providers', () => {
  const expectedFast = {
    gemini: 'gemini-2.5-flash',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-latest',
    groq: 'llama-3.1-8b-instant',
    ollama: 'llama3.2',
    minimax: 'MiniMax-M2.7',
    azure: 'gpt-4o-mini',
    custom: ''
  };

  const expectedSmart = {
    gemini: 'gemini-2.5-flash',
    openai: 'gpt-4o',
    anthropic: 'claude-3-5-sonnet-latest',
    groq: 'llama-3.3-70b-versatile',
    ollama: 'llama3.3',
    minimax: 'MiniMax-M3',
    azure: 'gpt-4o',
    custom: ''
  };

  for (const [provider, model] of Object.entries(expectedFast)) {
    assert.equal(DEFAULT_FAST_MODELS[provider], model, `Fast model mismatch for ${provider}`);
  }
  for (const [provider, model] of Object.entries(expectedSmart)) {
    assert.equal(DEFAULT_SMART_MODELS[provider], model, `Smart model mismatch for ${provider}`);
  }
  assert.equal(DEFAULT_MODELS.gemini, CURRENT_GEMINI_DEFAULT);
});

test('resolves default Fast and Smart models correctly across all 8 providers', () => {
  const providers = [
    { provider: 'gemini', fast: 'gemini-2.5-flash', smart: 'gemini-2.5-flash', extra: { apiKeys: { gemini: 'k' } } },
    { provider: 'openai', fast: 'gpt-4o-mini', smart: 'gpt-4o', extra: { apiKeys: { openai: 'k' } } },
    { provider: 'anthropic', fast: 'claude-3-5-haiku-latest', smart: 'claude-3-5-sonnet-latest', extra: { apiKeys: { anthropic: 'k' } } },
    { provider: 'groq', fast: 'llama-3.1-8b-instant', smart: 'llama-3.3-70b-versatile', extra: { apiKeys: { groq: 'k' } } },
    { provider: 'ollama', fast: 'llama3.2', smart: 'llama3.3', extra: {} },
    { provider: 'minimax', fast: 'MiniMax-M2.7', smart: 'MiniMax-M3', extra: { apiKeys: { minimax: 'k' } } },
    { provider: 'azure', fast: 'gpt-4o-mini', smart: 'gpt-4o', extra: { apiKeys: { azure: 'k' }, azureEndpoint: 'https://test.openai.azure.com' } }
  ];

  for (const item of providers) {
    const fastLLM = createLLM({ provider: item.provider, smart: false, ...item.extra });
    assert.equal(fastLLM.model, item.fast, `Fast model mismatch for ${item.provider}`);
    assert.equal(fastLLM.ready, true, `Provider ${item.provider} should be ready in fast mode`);

    const smartLLM = createLLM({ provider: item.provider, smart: true, ...item.extra });
    assert.equal(smartLLM.model, item.smart, `Smart model mismatch for ${item.provider}`);
    assert.equal(smartLLM.ready, true, `Provider ${item.provider} should be ready in smart mode`);
  }

  // Custom provider with user-configured models
  const customFast = createLLM({
    provider: 'custom',
    smart: false,
    baseUrl: 'https://api.example.com/v1',
    models: { custom: { fast: 'my-custom-fast', smart: 'my-custom-smart' } }
  });
  assert.equal(customFast.model, 'my-custom-fast');
  assert.equal(customFast.ready, true);

  const customSmart = createLLM({
    provider: 'custom',
    smart: true,
    baseUrl: 'https://api.example.com/v1',
    models: { custom: { fast: 'my-custom-fast', smart: 'my-custom-smart' } }
  });
  assert.equal(customSmart.model, 'my-custom-smart');
  assert.equal(customSmart.ready, true);
});

// ── 2. Self-Healing Fallback on 404 (Model Retired / Not Found) ──────────────

test('OpenAI: smart model 404 gracefully falls back to fast model with 700 tokens', async () => {
  const attempts = [];
  mockOpenAIHandler = (clientOptions, req) => {
    attempts.push({ model: req.model, max_tokens: req.max_tokens });
    if (req.model === 'gpt-4o') {
      const err = new Error('404 The model `gpt-4o` does not exist');
      err.status = 404;
      err.code = 'model_not_found';
      throw err;
    }
    return [{ choices: [{ delta: { content: 'openai-healed' } }] }];
  };

  const tokens = [];
  const llm = createLLM({
    provider: 'openai',
    smart: true,
    apiKeys: { openai: 'test-key' }
  });

  assert.equal(llm.model, 'gpt-4o');
  const result = await llm.stream({
    system: 'system-prompt',
    turns: [{ role: 'user', text: 'hello' }],
    onToken: (t) => tokens.push(t)
  });

  assert.equal(result, 'openai-healed');
  assert.deepEqual(tokens, ['openai-healed']);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'gpt-4o');
  assert.equal(attempts[0].max_tokens, 1400);
  assert.equal(attempts[1].model, 'gpt-4o-mini');
  assert.equal(attempts[1].max_tokens, 700);
});

test('Anthropic: smart model 404 gracefully falls back to fast model with 700 tokens', async () => {
  const attempts = [];
  mockAnthropicHandler = (clientOptions, req) => {
    attempts.push({ model: req.model, max_tokens: req.max_tokens });
    if (req.model === 'claude-3-5-sonnet-latest') {
      const err = new Error('model: claude-3-5-sonnet-latest not found');
      err.status = 404;
      err.type = 'not_found_error';
      throw err;
    }
    return [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'anthropic-healed' } }];
  };

  const tokens = [];
  const llm = createLLM({
    provider: 'anthropic',
    smart: true,
    apiKeys: { anthropic: 'test-key' }
  });

  assert.equal(llm.model, 'claude-3-5-sonnet-latest');
  const result = await llm.stream({
    system: 'sys',
    turns: [{ role: 'user', text: 'hi' }],
    onToken: (t) => tokens.push(t)
  });

  assert.equal(result, 'anthropic-healed');
  assert.deepEqual(tokens, ['anthropic-healed']);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'claude-3-5-sonnet-latest');
  assert.equal(attempts[0].max_tokens, 1400);
  assert.equal(attempts[1].model, 'claude-3-5-haiku-latest');
  assert.equal(attempts[1].max_tokens, 700);
});

test('Groq: smart model 404 gracefully falls back to fast model with 700 tokens', async () => {
  const attempts = [];
  mockOpenAIHandler = (clientOptions, req) => {
    attempts.push({ model: req.model, max_tokens: req.max_tokens, baseURL: clientOptions.baseURL });
    if (req.model === 'llama-3.3-70b-versatile') {
      const err = new Error('404 Model not found');
      err.status = 404;
      throw err;
    }
    return [{ choices: [{ delta: { content: 'groq-healed' } }] }];
  };

  const llm = createLLM({
    provider: 'groq',
    smart: true,
    apiKeys: { groq: 'test-groq-key' }
  });

  assert.equal(llm.model, 'llama-3.3-70b-versatile');
  const result = await llm.stream({
    system: '',
    turns: [{ role: 'user', text: 'hi' }],
    onToken: () => {}
  });

  assert.equal(result, 'groq-healed');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'llama-3.3-70b-versatile');
  assert.equal(attempts[0].max_tokens, 1400);
  assert.equal(attempts[1].model, 'llama-3.1-8b-instant');
  assert.equal(attempts[1].max_tokens, 700);
});

test('Ollama: smart model 404 gracefully falls back to fast model with 700 tokens', async () => {
  const attempts = [];
  mockFetchHandler = async (url, init) => {
    const parsed = JSON.parse(init.body);
    attempts.push({ model: parsed.model });
    if (parsed.model === 'llama3.3') {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        body: []
      };
    }
    const chunk = Buffer.from(JSON.stringify({ message: { content: 'ollama-healed' } }) + '\n');
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: (async function* () { yield chunk; })()
    };
  };

  const tokens = [];
  const llm = createLLM({
    provider: 'ollama',
    smart: true,
    apiKeys: { ollama: 'http://localhost:11434' }
  });

  assert.equal(llm.model, 'llama3.3');
  const result = await llm.stream({
    system: '',
    turns: [{ role: 'user', text: 'hello' }],
    onToken: (t) => tokens.push(t)
  });

  assert.equal(result, 'ollama-healed');
  assert.deepEqual(tokens, ['ollama-healed']);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'llama3.3');
  assert.equal(attempts[1].model, 'llama3.2');
});

test('MiniMax: smart model 404 gracefully falls back to fast model with 700 tokens', async () => {
  const attempts = [];
  mockOpenAIHandler = (clientOptions, req) => {
    attempts.push({ model: req.model, max_tokens: req.max_tokens });
    if (req.model === 'MiniMax-M3') {
      const err = new Error('404 Model does not exist');
      err.status = 404;
      throw err;
    }
    return [{ choices: [{ delta: { content: 'minimax-healed' } }] }];
  };

  const llm = createLLM({
    provider: 'minimax',
    smart: true,
    apiKeys: { minimax: 'test-key' }
  });

  assert.equal(llm.model, 'MiniMax-M3');
  const result = await llm.stream({
    system: '',
    turns: [{ role: 'user', text: 'hello' }],
    onToken: () => {}
  });

  assert.equal(result, 'minimax-healed');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'MiniMax-M3');
  assert.equal(attempts[0].max_tokens, 1400);
  assert.equal(attempts[1].model, 'MiniMax-M2.7');
  assert.equal(attempts[1].max_tokens, 700);
});

test('Azure: smart model 404 gracefully falls back to fast model with 700 tokens', async () => {
  const attempts = [];
  mockOpenAIHandler = (clientOptions, req) => {
    attempts.push({ model: req.model, max_tokens: req.max_completion_tokens || req.max_tokens });
    if (req.model === 'gpt-4o') {
      const err = new Error('404 Resource Not Found');
      err.status = 404;
      throw err;
    }
    return [{ choices: [{ delta: { content: 'azure-healed' } }] }];
  };

  const llm = createLLM({
    provider: 'azure',
    smart: true,
    apiKeys: { azure: 'azure-key' },
    azureEndpoint: 'https://example.openai.azure.com'
  });

  assert.equal(llm.model, 'gpt-4o');
  const result = await llm.stream({
    system: '',
    turns: [{ role: 'user', text: 'hello' }],
    onToken: () => {}
  });

  assert.equal(result, 'azure-healed');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'gpt-4o');
  assert.equal(attempts[0].max_tokens, 1400);
  assert.equal(attempts[1].model, 'gpt-4o-mini');
  assert.equal(attempts[1].max_tokens, 700);
});

test('Gemini: configured smart model 404 gracefully falls back to fast model', async () => {
  const attempts = [];
  mockGeminiHandler = (clientOptions, req) => {
    attempts.push({ model: req.model, maxOutputTokens: req.config?.maxOutputTokens });
    if (req.model === 'gemini-2.5-pro') {
      const err = new Error('got status: 404 Not Found. {"error":{"code":404,"message":"models/gemini-2.5-pro is not found"}}');
      err.status = 404;
      throw err;
    }
    return [{ text: 'gemini-healed' }];
  };

  const tokens = [];
  const llm = createLLM({
    provider: 'gemini',
    smart: true,
    apiKeys: { gemini: 'gemini-key' },
    models: { gemini: { fast: 'gemini-2.5-flash', smart: 'gemini-2.5-pro' } }
  });

  assert.equal(llm.model, 'gemini-2.5-pro');
  const result = await llm.stream({
    system: 'sys',
    turns: [{ role: 'user', text: 'hello' }],
    onToken: (t) => tokens.push(t)
  });

  assert.equal(result, 'gemini-healed');
  assert.deepEqual(tokens, ['gemini-healed']);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'gemini-2.5-pro');
  assert.equal(attempts[0].maxOutputTokens, 1400);
  assert.equal(attempts[1].model, 'gemini-2.5-flash');
  assert.equal(attempts[1].maxOutputTokens, 700);
});

test('Custom: configured smart model 404 gracefully falls back to fast model', async () => {
  const attempts = [];
  mockOpenAIHandler = (clientOptions, req) => {
    attempts.push({ model: req.model, max_tokens: req.max_tokens });
    if (req.model === 'custom-smart-model') {
      const err = new Error('404 Custom Model Not Found');
      err.status = 404;
      throw err;
    }
    return [{ choices: [{ delta: { content: 'custom-healed' } }] }];
  };

  const llm = createLLM({
    provider: 'custom',
    smart: true,
    baseUrl: 'https://api.custom.com/v1',
    apiKeys: { custom: 'key' },
    models: { custom: { fast: 'custom-fast-model', smart: 'custom-smart-model' } }
  });

  assert.equal(llm.model, 'custom-smart-model');
  const result = await llm.stream({
    system: '',
    turns: [{ role: 'user', text: 'hi' }],
    onToken: () => {}
  });

  assert.equal(result, 'custom-healed');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'custom-smart-model');
  assert.equal(attempts[0].max_tokens, 1400);
  assert.equal(attempts[1].model, 'custom-fast-model');
  assert.equal(attempts[1].max_tokens, 700);
});

// ── 3. Self-Healing Fallback on 429 (Quota / Rate Limit) ─────────────────────

test('OpenAI: smart model 429 quota exhaustion gracefully falls back to fast model', async () => {
  const attempts = [];
  mockOpenAIHandler = (clientOptions, req) => {
    attempts.push({ model: req.model, max_tokens: req.max_tokens });
    if (req.model === 'gpt-4o') {
      const err = new Error('429 You exceeded your current quota, please check your plan and billing details.');
      err.status = 429;
      err.code = 'insufficient_quota';
      throw err;
    }
    return [{ choices: [{ delta: { content: 'openai-quota-healed' } }] }];
  };

  const tokens = [];
  const llm = createLLM({
    provider: 'openai',
    smart: true,
    apiKeys: { openai: 'test-key' }
  });

  const result = await llm.stream({
    system: 'system-prompt',
    turns: [{ role: 'user', text: 'hello' }],
    onToken: (t) => tokens.push(t)
  });

  assert.equal(result, 'openai-quota-healed');
  assert.deepEqual(tokens, ['openai-quota-healed']);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'gpt-4o');
  assert.equal(attempts[1].model, 'gpt-4o-mini');
  assert.equal(attempts[1].max_tokens, 700);
});

test('Anthropic: smart model 429 rate limit gracefully falls back to fast model', async () => {
  const attempts = [];
  mockAnthropicHandler = (clientOptions, req) => {
    attempts.push({ model: req.model, max_tokens: req.max_tokens });
    if (req.model === 'claude-3-5-sonnet-latest') {
      const err = new Error('Rate limit exceeded: 429 Too Many Requests');
      err.status = 429;
      err.type = 'rate_limit_error';
      throw err;
    }
    return [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'anthropic-quota-healed' } }];
  };

  const tokens = [];
  const llm = createLLM({
    provider: 'anthropic',
    smart: true,
    apiKeys: { anthropic: 'test-key' }
  });

  const result = await llm.stream({
    system: 'sys',
    turns: [{ role: 'user', text: 'hello' }],
    onToken: (t) => tokens.push(t)
  });

  assert.equal(result, 'anthropic-quota-healed');
  assert.deepEqual(tokens, ['anthropic-quota-healed']);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'claude-3-5-sonnet-latest');
  assert.equal(attempts[1].model, 'claude-3-5-haiku-latest');
  assert.equal(attempts[1].max_tokens, 700);
});

test('Groq: smart model 429 rate limit gracefully falls back to fast model', async () => {
  const attempts = [];
  mockOpenAIHandler = (clientOptions, req) => {
    attempts.push({ model: req.model, max_tokens: req.max_tokens });
    if (req.model === 'llama-3.3-70b-versatile') {
      const err = new Error('429 Rate limit reached on 70b model');
      err.status = 429;
      throw err;
    }
    return [{ choices: [{ delta: { content: 'groq-quota-healed' } }] }];
  };

  const llm = createLLM({
    provider: 'groq',
    smart: true,
    apiKeys: { groq: 'test-key' }
  });

  const result = await llm.stream({
    system: '',
    turns: [{ role: 'user', text: 'hi' }],
    onToken: () => {}
  });

  assert.equal(result, 'groq-quota-healed');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'llama-3.3-70b-versatile');
  assert.equal(attempts[1].model, 'llama-3.1-8b-instant');
});

test('MiniMax: smart model 429 rate limit gracefully falls back to fast model', async () => {
  const attempts = [];
  mockOpenAIHandler = (clientOptions, req) => {
    attempts.push({ model: req.model });
    if (req.model === 'MiniMax-M3') {
      const err = new Error('429 Too Many Requests (RPM limit)');
      err.status = 429;
      throw err;
    }
    return [{ choices: [{ delta: { content: 'minimax-quota-healed' } }] }];
  };

  const llm = createLLM({
    provider: 'minimax',
    smart: true,
    apiKeys: { minimax: 'test-key' }
  });

  const result = await llm.stream({
    system: '',
    turns: [{ role: 'user', text: 'hi' }],
    onToken: () => {}
  });

  assert.equal(result, 'minimax-quota-healed');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'MiniMax-M3');
  assert.equal(attempts[1].model, 'MiniMax-M2.7');
});

test('Azure: smart model 429 rate limit gracefully falls back to fast model', async () => {
  const attempts = [];
  mockOpenAIHandler = (clientOptions, req) => {
    attempts.push({ model: req.model });
    if (req.model === 'gpt-4o') {
      const err = new Error('429 Requests to the ChatCompletions Operation under Azure OpenAI API have exceeded token rate limit');
      err.status = 429;
      throw err;
    }
    return [{ choices: [{ delta: { content: 'azure-quota-healed' } }] }];
  };

  const llm = createLLM({
    provider: 'azure',
    smart: true,
    apiKeys: { azure: 'azure-key' },
    azureEndpoint: 'https://example.openai.azure.com'
  });

  const result = await llm.stream({
    system: '',
    turns: [{ role: 'user', text: 'hi' }],
    onToken: () => {}
  });

  assert.equal(result, 'azure-quota-healed');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'gpt-4o');
  assert.equal(attempts[1].model, 'gpt-4o-mini');
});

test('Gemini: configured smart model 429 quota exhaustion gracefully falls back to fast model', async () => {
  const attempts = [];
  mockGeminiHandler = (clientOptions, req) => {
    attempts.push({ model: req.model, maxOutputTokens: req.config?.maxOutputTokens });
    if (req.model === 'gemini-2.5-pro') {
      const err = new Error('got status: 429 Too Many Requests. {"error":{"code":429,"message":"Resource has been exhausted","status":"RESOURCE_EXHAUSTED"}}');
      err.status = 429;
      throw err;
    }
    return [{ text: 'gemini-quota-healed' }];
  };

  const tokens = [];
  const llm = createLLM({
    provider: 'gemini',
    smart: true,
    apiKeys: { gemini: 'gemini-key' },
    models: { gemini: { fast: 'gemini-2.5-flash', smart: 'gemini-2.5-pro' } }
  });

  const result = await llm.stream({
    system: 'sys',
    turns: [{ role: 'user', text: 'hello' }],
    onToken: (t) => tokens.push(t)
  });

  assert.equal(result, 'gemini-quota-healed');
  assert.deepEqual(tokens, ['gemini-quota-healed']);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'gemini-2.5-pro');
  assert.equal(attempts[1].model, 'gemini-2.5-flash');
  assert.equal(attempts[1].maxOutputTokens, 700);
});

test('Ollama: smart model 429 rate limit gracefully falls back to fast model', async () => {
  const attempts = [];
  mockFetchHandler = async (url, init) => {
    const parsed = JSON.parse(init.body);
    attempts.push({ model: parsed.model });
    if (parsed.model === 'llama3.3') {
      return {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        body: []
      };
    }
    const chunk = Buffer.from(JSON.stringify({ message: { content: 'ollama-429-healed' } }) + '\n');
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: (async function* () { yield chunk; })()
    };
  };

  const tokens = [];
  const llm = createLLM({
    provider: 'ollama',
    smart: true,
    apiKeys: { ollama: 'http://localhost:11434' }
  });

  assert.equal(llm.model, 'llama3.3');
  const result = await llm.stream({
    system: '',
    turns: [{ role: 'user', text: 'hello' }],
    onToken: (t) => tokens.push(t)
  });

  assert.equal(result, 'ollama-429-healed');
  assert.deepEqual(tokens, ['ollama-429-healed']);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'llama3.3');
  assert.equal(attempts[1].model, 'llama3.2');
});

test('Custom: configured smart model 429 quota exhaustion gracefully falls back to fast model', async () => {
  const attempts = [];
  mockOpenAIHandler = (clientOptions, req) => {
    attempts.push({ model: req.model, max_tokens: req.max_tokens });
    if (req.model === 'custom-smart-model') {
      const err = new Error('429 Too Many Requests / Quota Exceeded');
      err.status = 429;
      err.code = 'insufficient_quota';
      throw err;
    }
    return [{ choices: [{ delta: { content: 'custom-429-healed' } }] }];
  };

  const llm = createLLM({
    provider: 'custom',
    smart: true,
    baseUrl: 'https://api.custom.com/v1',
    apiKeys: { custom: 'key' },
    models: { custom: { fast: 'custom-fast-model', smart: 'custom-smart-model' } }
  });

  assert.equal(llm.model, 'custom-smart-model');
  const result = await llm.stream({
    system: '',
    turns: [{ role: 'user', text: 'hi' }],
    onToken: () => {}
  });

  assert.equal(result, 'custom-429-healed');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].model, 'custom-smart-model');
  assert.equal(attempts[0].max_tokens, 1400);
  assert.equal(attempts[1].model, 'custom-fast-model');
  assert.equal(attempts[1].max_tokens, 700);
});

test('logs a graceful degradation warning when self-healing fallback is triggered', async () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));

  try {
    mockOpenAIHandler = (clientOptions, req) => {
      if (req.model === 'gpt-4o') {
        const err = new Error('404 Model retired');
        err.status = 404;
        throw err;
      }
      return [{ choices: [{ delta: { content: 'warn-test-ok' } }] }];
    };

    const llm = createLLM({
      provider: 'openai',
      smart: true,
      apiKeys: { openai: 'test-key' }
    });

    await llm.stream({ system: '', turns: [{ role: 'user', text: 'hi' }], onToken: () => {} });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\[LLM Self-Healing\]/);
    assert.match(warnings[0], /Gracefully degrading to fast model "gpt-4o-mini"/);
    assert.match(warnings[0], /maxTokens: 700/);
  } finally {
    console.warn = originalWarn;
  }
});

// ── 4. Edge Cases, chatStream Integration & Fatal Error Passthrough ─────────

test('chatStream: integrates turns conversion and triggers self-healing fallback', async () => {
  mockOpenAIHandler = (clientOptions, req) => {
    if (req.model === 'gpt-4o') {
      const err = new Error('404 Not Found');
      err.status = 404;
      throw err;
    }
    return [{ choices: [{ delta: { content: 'chat-stream-healed' } }] }];
  };

  const tokens = [];
  const llm = createLLM({
    provider: 'openai',
    smart: true,
    apiKeys: { openai: 'test-key' }
  });

  const result = await llm.chatStream({
    systemPrompt: 'You are helpful.',
    messages: [
      { role: 'user', content: 'What is 2+2?' },
      { role: 'assistant', content: '4' },
      { role: 'user', content: 'Add 3' }
    ],
    onToken: (t) => tokens.push(t)
  });

  assert.equal(result, 'chat-stream-healed');
  assert.deepEqual(tokens, ['chat-stream-healed']);
});

test('non-recoverable errors (401 Unauthorized) do NOT trigger fallback and throw immediately', async () => {
  let callCount = 0;
  mockOpenAIHandler = () => {
    callCount++;
    const err = new Error('401 Incorrect API key provided');
    err.status = 401;
    throw err;
  };

  const llm = createLLM({
    provider: 'openai',
    smart: true,
    apiKeys: { openai: 'bad-key' }
  });

  await assert.rejects(
    async () => {
      await llm.stream({ system: '', turns: [{ role: 'user', text: 'hi' }], onToken: () => {} });
    },
    /401 Incorrect API key provided/
  );

  assert.equal(callCount, 1, 'Should not attempt retry on 401 error');
});

test('fast mode (smart: false) does NOT attempt fallback and throws formatted error on 404', async () => {
  let callCount = 0;
  mockOpenAIHandler = () => {
    callCount++;
    const err = new Error('404 Model not found');
    err.status = 404;
    throw err;
  };

  const llm = createLLM({
    provider: 'openai',
    smart: false,
    apiKeys: { openai: 'test-key' }
  });

  await assert.rejects(
    async () => {
      await llm.stream({ system: '', turns: [{ role: 'user', text: 'hi' }], onToken: () => {} });
    },
    /OpenAI model "gpt-4o-mini" is unavailable \(404\)/
  );

  assert.equal(callCount, 1, 'Fast mode should fail immediately without fallback');
});

test('if fallback fast model also fails, surfaces the fallback formatted error', async () => {
  let callCount = 0;
  mockOpenAIHandler = (clientOptions, req) => {
    callCount++;
    if (req.model === 'gpt-4o') {
      const err = new Error('404 Smart model retired');
      err.status = 404;
      throw err;
    }
    const fallbackErr = new Error('429 Fast model quota exceeded');
    fallbackErr.status = 429;
    throw fallbackErr;
  };

  const llm = createLLM({
    provider: 'openai',
    smart: true,
    apiKeys: { openai: 'test-key' }
  });

  await assert.rejects(
    async () => {
      await llm.stream({ system: '', turns: [{ role: 'user', text: 'hi' }], onToken: () => {} });
    },
    /OpenAI free-tier quota exhausted \(429/
  );

  assert.equal(callCount, 2, 'Should attempt smart model and then fast model');
});
