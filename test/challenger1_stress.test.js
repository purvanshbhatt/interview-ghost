/**
 * Challenger 1: Empirical Stress Test Harness
 * 
 * Scope:
 * 1. High-frequency rapid speech streaming & DOM/Composer isolation
 * 2. Drawer toggle state transitions & pointOverUI click-through hit-testing
 * 3. 8-Provider Smart model resolution & simulated fault injection matrix (404, 429, timeout, malformed errors)
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

// ── Mock Setup for LLM Providers ─────────────────────────────────────────────

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
              return [{ choices: [{ delta: { content: 'mock-openai-default' } }] }];
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
                return [{ choices: [{ delta: { content: 'mock-azure-default' } }] }];
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
              { type: 'content_block_delta', delta: { type: 'text_delta', text: 'mock-anthropic-default' } }
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
              return [{ text: 'mock-gemini-default' }];
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
  DEFAULT_FAST_MODELS,
  DEFAULT_SMART_MODELS,
  CURRENT_GEMINI_DEFAULT
} = require('../src/llm');

const { createDOMSimulator } = require('./e2e/harness');

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 1: High-Frequency Rapid Speech Streaming & DOM / Composer Isolation
// ═════════════════════════════════════════════════════════════════════════════

test('SUITE 1: Desktop UI & Rapid Speech Streaming Isolation Stress Tests', async (t) => {

  await t.test('1.1: Rapid speech burst (100 interim + 50 final turns) leaves #input untouched & static', () => {
    const dom = createDOMSimulator();
    
    // Baseline state
    assert.equal(dom.elements.input.value, '');
    assert.equal(dom.elements.input.style.height, '28px');
    const initialComposerBounds = { ...dom.elements.composer.bounds };
    const initialActionPillsBounds = { ...dom.elements.actionPills.bounds };

    // Simulate 100 rapid interim events and 50 final turns
    for (let i = 0; i < 100; i++) {
      const channel = i % 2 === 0 ? 'you' : 'them';
      dom.appendTranscriptTurn(channel, `Interim transcription update chunk ${i}...`, true);
      
      // Assert invariants at each step
      assert.equal(dom.elements.input.value, '', `Step ${i}: #input value must remain strictly empty`);
      assert.equal(dom.elements.input.style.height, '28px', `Step ${i}: #input height must not jitter`);
      assert.deepEqual(dom.elements.composer.bounds, initialComposerBounds, `Step ${i}: composer bounds shifted`);
      assert.deepEqual(dom.elements.actionPills.bounds, initialActionPillsBounds, `Step ${i}: action pills shifted`);
      assert.equal(dom.elements.panelMain.children.length, 0, `Step ${i}: panelMain must not receive STT`);
    }

    for (let i = 0; i < 50; i++) {
      const channel = i % 2 === 0 ? 'you' : 'them';
      dom.appendTranscriptTurn(channel, `Final committed speech turn ${i}.`, false);
      
      assert.equal(dom.elements.input.value, '', `Final step ${i}: #input value must remain empty`);
      assert.equal(dom.elements.input.style.height, '28px', `Final step ${i}: #input height must not jitter`);
      assert.deepEqual(dom.elements.composer.bounds, initialComposerBounds);
      assert.deepEqual(dom.elements.actionPills.bounds, initialActionPillsBounds);
      assert.equal(dom.elements.panelMain.children.length, 0);
    }

    // Verify all 150 turns were strictly confined to tsList
    assert.equal(dom.elements.tsList.children.length, 150);
  });

  await t.test('1.2: Active user composer typing concurrent with 200 speech events preserves text & isolation', () => {
    const dom = createDOMSimulator();
    
    // User types partial prompt
    const userPrompt = 'Explain the difference between Arc<Mutex<T>> and RwLock<T> in Rust.';
    dom.setUserInput(userPrompt);

    assert.equal(dom.elements.input.value, userPrompt);
    const expectedHeight = dom.elements.input.style.height;

    // Concurrently blast 200 speech events
    for (let i = 0; i < 200; i++) {
      dom.appendTranscriptTurn(i % 2 === 0 ? 'them' : 'you', `Interfering background speech utterance #${i}`, i % 3 !== 0);
      
      // Assert user typed content is 100% untouched
      assert.equal(dom.elements.input.value, userPrompt, `Step ${i}: User prompt was corrupted!`);
      assert.equal(dom.elements.input.style.height, expectedHeight, `Step ${i}: Input height jittered`);
    }

    // User finishes typing additional text
    const completedPrompt = userPrompt + ' Also include benchmarking code.';
    dom.setUserInput(completedPrompt);
    assert.equal(dom.elements.input.value, completedPrompt);
    assert.equal(dom.elements.tsList.children.length, 200);
  });

  await t.test('1.3: Extended meeting simulation (600 turns) maintains DOM integrity and clean bounds', () => {
    const dom = createDOMSimulator();

    for (let i = 1; i <= 600; i++) {
      const channel = i % 2 === 0 ? 'you' : 'them';
      dom.appendTranscriptTurn(channel, `Simulated technical turn ${i}: Discussing distributed consensus algorithms.`, false);
    }

    assert.equal(dom.elements.tsList.children.length, 600);
    assert.equal(dom.elements.input.value, '');
    assert.equal(dom.elements.panelMain.children.length, 0);

    // Clear history simulation
    dom.elements.tsList.children = [];
    assert.equal(dom.elements.tsList.children.length, 0);
    assert.equal(dom.elements.input.value, '');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 2: Drawer Toggle Transitions & pointOverUI Hit-Testing Stress Tests
// ═════════════════════════════════════════════════════════════════════════════

test('SUITE 2: Drawer Toggle State & pointOverUI Hit-Testing Stress Tests', async (t) => {

  await t.test('2.1: 100 rapid drawer toggle state cycles maintain synchronization', () => {
    const dom = createDOMSimulator();

    // Initially closed
    assert.equal(dom.hasClass('transcriptSidebar', 'hidden'), true);
    assert.equal(dom.hasClass('panelWrap', 'sidebar-open'), false);

    for (let i = 0; i < 100; i++) {
      if (i % 2 === 0) {
        // Open
        dom.removeClass('transcriptSidebar', 'hidden');
        dom.addClass('panelWrap', 'sidebar-open');
        assert.equal(dom.hasClass('transcriptSidebar', 'hidden'), false, `Cycle ${i}: sidebar must be open`);
        assert.equal(dom.hasClass('panelWrap', 'sidebar-open'), true, `Cycle ${i}: panel must be shifted`);
        assert.equal(dom.elements.transcriptSidebar.style.display, 'flex');
      } else {
        // Close
        dom.addClass('transcriptSidebar', 'hidden');
        dom.removeClass('panelWrap', 'sidebar-open');
        assert.equal(dom.hasClass('transcriptSidebar', 'hidden'), true, `Cycle ${i}: sidebar must be hidden`);
        assert.equal(dom.hasClass('panelWrap', 'sidebar-open'), false, `Cycle ${i}: panel must be reset`);
        assert.equal(dom.elements.transcriptSidebar.style.display, 'none');
      }
    }
  });

  await t.test('2.2: Systematic coordinate hit-testing matrix for Open vs Closed Drawer', () => {
    const dom = createDOMSimulator();

    // Coordinates in dedicated Sidebar area (below panelWrap y: 80-260, x in 460-680, y in 261-560)
    const sidebarExclusivePoints = [
      { x: 500, y: 350, desc: 'Sidebar center' },
      { x: 550, y: 300, desc: 'Sidebar upper-mid' },
      { x: 600, y: 450, desc: 'Sidebar lower-mid' },
      { x: 670, y: 550, desc: 'Sidebar bottom-right' },
    ];

    // 1. When sidebar is CLOSED (default) -> ALL exclusive sidebar points must return FALSE (click-through)
    assert.equal(dom.hasClass('transcriptSidebar', 'hidden'), true);
    for (const pt of sidebarExclusivePoints) {
      assert.equal(
        dom.pointOverUI(pt.x, pt.y),
        false,
        `CLOSED sidebar: ${pt.desc} (${pt.x}, ${pt.y}) must be click-through (false)`
      );
    }

    // 2. When sidebar is OPEN -> ALL sidebar points (including upper area when panelWrap shifts left) must return TRUE
    dom.removeClass('transcriptSidebar', 'hidden');
    dom.addClass('panelWrap', 'sidebar-open');
    assert.equal(dom.hasClass('transcriptSidebar', 'hidden'), false);

    const openSidebarPoints = [
      ...sidebarExclusivePoints,
      { x: 460, y: 80, desc: 'Sidebar top-left when shifted' },
      { x: 500, y: 150, desc: 'Sidebar mid-top when shifted' }
    ];

    for (const pt of openSidebarPoints) {
      assert.equal(
        dom.pointOverUI(pt.x, pt.y),
        true,
        `OPEN sidebar: ${pt.desc} (${pt.x}, ${pt.y}) must intercept clicks (true)`
      );
    }

    // 3. Toolbar and Composer areas must always be interactive regardless of sidebar state
    const coreUIPoints = [
      { x: 50, y: 30, desc: 'Toolbar center' },
      { x: 100, y: 100, desc: 'Composer area' },
      { x: 25, y: 25, desc: 'Toolbar left edge' },
    ];
    for (const pt of coreUIPoints) {
      assert.equal(dom.pointOverUI(pt.x, pt.y), true, `Core UI: ${pt.desc} must be interactive`);
    }

    // 4. Transparent margins must always be click-through
    const transparentPoints = [
      { x: 5, y: 5, desc: 'Top-left corner margin' },
      { x: 695, y: 595, desc: 'Bottom-right corner margin' },
      { x: 10, y: 300, desc: 'Left edge margin' },
    ];
    for (const pt of transparentPoints) {
      assert.equal(dom.pointOverUI(pt.x, pt.y), false, `Margin: ${pt.desc} must be click-through`);
    }
  });

  await t.test('2.3: Boundary, negative, infinite, and degenerate coordinates handling in pointOverUI', () => {
    const dom = createDOMSimulator();

    const extremeCoordinates = [
      [-1, -1],
      [-500, 100],
      [100, -500],
      [701, 300],
      [300, 601],
      [10000, 10000],
      [NaN, NaN],
      [NaN, 100],
      [100, NaN],
      [Infinity, Infinity],
      [-Infinity, -Infinity],
      [Infinity, 100],
      [100, -Infinity],
      [null, null],
      [undefined, undefined]
    ];

    for (const [x, y] of extremeCoordinates) {
      assert.equal(
        dom.pointOverUI(x, y),
        false,
        `Extreme coordinate (${x}, ${y}) must safely return false without throwing`
      );
    }
  });

  await t.test('2.4: Modal scrim precedence over drawer hit testing', () => {
    const dom = createDOMSimulator();

    // With settings scrim open, entire window becomes interactive
    dom.removeClass('settingsScrim', 'hidden');
    assert.equal(dom.pointOverUI(5, 5), true, 'Settings scrim open -> (5,5) must be interactive');
    assert.equal(dom.pointOverUI(500, 350), true, 'Settings scrim open -> (500,350) must be interactive');
    assert.equal(dom.pointOverUI(695, 595), true, 'Settings scrim open -> (695,595) must be interactive');

    // Close settings scrim -> returns to normal transparent geometry
    dom.addClass('settingsScrim', 'hidden');
    assert.equal(dom.pointOverUI(5, 5), false, 'Settings scrim closed -> (5,5) must be click-through');
    assert.equal(dom.pointOverUI(500, 350), false, 'Settings scrim closed & sidebar closed -> (500,350) click-through');
  });

  await t.test('2.5: High-throughput hit-testing benchmark (10,000 queries)', () => {
    const dom = createDOMSimulator();
    const start = performance.now();

    for (let i = 0; i < 10000; i++) {
      const x = (i * 17) % 800 - 50;
      const y = (i * 31) % 700 - 50;
      dom.pointOverUI(x, y);
    }

    const duration = performance.now() - start;
    assert.ok(duration < 200, `10,000 hit tests took ${duration.toFixed(2)}ms (expected < 200ms)`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 3: 8-Provider Smart Model Resolution & Fault Injection Matrix
// ═════════════════════════════════════════════════════════════════════════════

test('SUITE 3: 8-Provider Smart Model Resolution & Fault Injection Matrix', async (t) => {

  const allProviders = [
    { provider: 'gemini', fast: 'gemini-2.5-flash', smart: 'gemini-2.5-flash', config: { apiKeys: { gemini: 'mock-key' } } },
    { provider: 'openai', fast: 'gpt-4o-mini', smart: 'gpt-4o', config: { apiKeys: { openai: 'mock-key' } } },
    { provider: 'anthropic', fast: 'claude-3-5-haiku-latest', smart: 'claude-3-5-sonnet-latest', config: { apiKeys: { anthropic: 'mock-key' } } },
    { provider: 'groq', fast: 'llama-3.1-8b-instant', smart: 'llama-3.3-70b-versatile', config: { apiKeys: { groq: 'mock-key' } } },
    { provider: 'ollama', fast: 'llama3.2', smart: 'llama3.3', config: { apiKeys: { ollama: 'http://localhost:11434' } } },
    { provider: 'minimax', fast: 'MiniMax-M2.7', smart: 'MiniMax-M3', config: { apiKeys: { minimax: 'mock-key' } } },
    { provider: 'azure', fast: 'gpt-4o-mini', smart: 'gpt-4o', config: { apiKeys: { azure: 'mock-key' }, azureEndpoint: 'https://test.openai.azure.com' } },
    { provider: 'custom', fast: 'custom-fast-v1', smart: 'custom-smart-v1', config: { baseUrl: 'https://api.custom.ai/v1', apiKeys: { custom: 'key' }, models: { custom: { fast: 'custom-fast-v1', smart: 'custom-smart-v1' } } } }
  ];

  await t.test('3.1: Resolution verification across all 8 providers in Fast and Smart modes', () => {
    for (const p of allProviders) {
      // Fast mode
      const fastLLM = createLLM({ provider: p.provider, smart: false, ...p.config });
      assert.equal(fastLLM.model, p.fast, `${p.provider}: fast model mismatch`);
      assert.equal(fastLLM.ready, true, `${p.provider}: must be ready in fast mode`);

      // Smart mode
      const smartLLM = createLLM({ provider: p.provider, smart: true, ...p.config });
      assert.equal(smartLLM.model, p.smart, `${p.provider}: smart model mismatch`);
      assert.equal(smartLLM.ready, true, `${p.provider}: must be ready in smart mode`);
    }
  });

  await t.test('3.2: 404 Model Retirement Fault Injection across all 8 providers', async () => {
    for (const p of allProviders) {
      let attempts = [];

      if (p.provider === 'openai' || p.provider === 'groq' || p.provider === 'minimax' || p.provider === 'azure' || p.provider === 'custom') {
        mockOpenAIHandler = (clientOptions, req) => {
          attempts.push({ model: req.model, max_tokens: req.max_tokens || req.max_completion_tokens });
          if (attempts.length === 1 && req.model === p.smart && p.smart !== p.fast) {
            const err = new Error(`404 Model ${req.model} not found`);
            err.status = 404;
            err.code = 'model_not_found';
            throw err;
          }
          return [{ choices: [{ delta: { content: `${p.provider}-404-healed` } }] }];
        };
      } else if (p.provider === 'anthropic') {
        mockAnthropicHandler = (clientOptions, req) => {
          attempts.push({ model: req.model, max_tokens: req.max_tokens });
          if (attempts.length === 1 && req.model === p.smart) {
            const err = new Error(`404 Not Found: ${req.model}`);
            err.status = 404;
            err.type = 'not_found_error';
            throw err;
          }
          return [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'anthropic-404-healed' } }];
        };
      } else if (p.provider === 'gemini') {
        mockGeminiHandler = (clientOptions, req) => {
          attempts.push({ model: req.model, maxTokens: req.config?.maxOutputTokens });
          if (attempts.length === 1 && req.model === 'gemini-smart-custom') {
            const err = new Error('404 models/gemini-smart-custom is not found for api version');
            err.status = 404;
            throw err;
          }
          return [{ text: 'gemini-404-healed' }];
        };
      } else if (p.provider === 'ollama') {
        mockFetchHandler = async (url, init) => {
          const parsed = JSON.parse(init.body);
          attempts.push({ model: parsed.model });
          if (attempts.length === 1 && parsed.model === p.smart) {
            return { ok: false, status: 404, statusText: 'Not Found', body: [] };
          }
          const chunk = Buffer.from(JSON.stringify({ message: { content: 'ollama-404-healed' } }) + '\n');
          return { ok: true, status: 200, statusText: 'OK', body: (async function* () { yield chunk; })() };
        };
      }

      const overrideConfig = p.provider === 'gemini'
        ? { models: { gemini: { fast: 'gemini-2.5-flash', smart: 'gemini-smart-custom' } } }
        : {};

      const llm = createLLM({
        provider: p.provider,
        smart: true,
        ...p.config,
        ...overrideConfig
      });

      const tokens = [];
      const result = await llm.stream({
        system: 'System prompt',
        turns: [{ role: 'user', text: 'Test query' }],
        onToken: (t) => tokens.push(t)
      });

      assert.ok(result.includes('healed'), `${p.provider} 404 fallback result unexpected: ${result}`);
      assert.ok(tokens.length > 0, `${p.provider} 404 fallback must emit tokens`);
      
      // If smart != fast, must have made exactly 2 attempts (1 failed smart, 1 successful fast)
      if (p.smart !== p.fast || p.provider === 'gemini') {
        assert.equal(attempts.length, 2, `${p.provider} must attempt smart model then fallback to fast`);
        assert.equal(attempts[0].model, p.provider === 'gemini' ? 'gemini-smart-custom' : p.smart);
        assert.equal(attempts[1].model, p.fast);
      }
    }
  });

  await t.test('3.3: 429 Rate Limit / Quota Exhaustion Fault Injection across all 8 providers', async () => {
    for (const p of allProviders) {
      let attempts = [];

      if (p.provider === 'openai' || p.provider === 'groq' || p.provider === 'minimax' || p.provider === 'azure' || p.provider === 'custom') {
        mockOpenAIHandler = (clientOptions, req) => {
          attempts.push({ model: req.model, max_tokens: req.max_tokens || req.max_completion_tokens });
          if (attempts.length === 1 && req.model === p.smart && p.smart !== p.fast) {
            const err = new Error('429 Rate limit exceeded / insufficient_quota');
            err.status = 429;
            err.code = 'insufficient_quota';
            throw err;
          }
          return [{ choices: [{ delta: { content: `${p.provider}-429-healed` } }] }];
        };
      } else if (p.provider === 'anthropic') {
        mockAnthropicHandler = (clientOptions, req) => {
          attempts.push({ model: req.model });
          if (attempts.length === 1 && req.model === p.smart) {
            const err = new Error('429 Rate limit exceeded');
            err.status = 429;
            err.type = 'rate_limit_error';
            throw err;
          }
          return [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'anthropic-429-healed' } }];
        };
      } else if (p.provider === 'gemini') {
        mockGeminiHandler = (clientOptions, req) => {
          attempts.push({ model: req.model });
          if (attempts.length === 1 && req.model === 'gemini-smart-custom') {
            const err = new Error('429 Resource exhausted (quota exceeded)');
            err.status = 429;
            err.code = 'RESOURCE_EXHAUSTED';
            throw err;
          }
          return [{ text: 'gemini-429-healed' }];
        };
      } else if (p.provider === 'ollama') {
        mockFetchHandler = async (url, init) => {
          const parsed = JSON.parse(init.body);
          attempts.push({ model: parsed.model });
          if (attempts.length === 1 && parsed.model === p.smart) {
            return { ok: false, status: 429, statusText: 'Too Many Requests', body: [] };
          }
          const chunk = Buffer.from(JSON.stringify({ message: { content: 'ollama-429-healed' } }) + '\n');
          return { ok: true, status: 200, statusText: 'OK', body: (async function* () { yield chunk; })() };
        };
      }

      const overrideConfig = p.provider === 'gemini'
        ? { models: { gemini: { fast: 'gemini-2.5-flash', smart: 'gemini-smart-custom' } } }
        : {};

      const llm = createLLM({
        provider: p.provider,
        smart: true,
        ...p.config,
        ...overrideConfig
      });

      const tokens = [];
      const result = await llm.stream({
        system: 'System prompt',
        turns: [{ role: 'user', text: 'Quota test query' }],
        onToken: (t) => tokens.push(t)
      });

      assert.ok(result.includes('healed'), `${p.provider} 429 fallback result unexpected: ${result}`);
      assert.ok(tokens.length > 0);
    }
  });

  await t.test('3.4: Non-recoverable fatal errors (401 Unauthorized, 500 Server Error) throw without fallback', async () => {
    // 401 Unauthorized on OpenAI
    mockOpenAIHandler = () => {
      const err = new Error('401 Incorrect API key provided');
      err.status = 401;
      throw err;
    };

    const openaiLLM = createLLM({
      provider: 'openai',
      smart: true,
      apiKeys: { openai: 'invalid-key' }
    });

    await assert.rejects(
      async () => openaiLLM.stream({ system: '', turns: [{ role: 'user', text: 'hi' }], onToken: () => {} }),
      /401 Incorrect API key provided/
    );

    // 500 Internal Server Error on Anthropic
    mockAnthropicHandler = () => {
      const err = new Error('500 Internal Server Error in cluster');
      err.status = 500;
      throw err;
    };

    const anthropicLLM = createLLM({
      provider: 'anthropic',
      smart: true,
      apiKeys: { anthropic: 'key' }
    });

    await assert.rejects(
      async () => anthropicLLM.stream({ system: '', turns: [{ role: 'user', text: 'hi' }], onToken: () => {} }),
      /500 Internal Server Error/
    );
  });

  await t.test('3.5: Double fault injection (smart 404/429 -> fast 404/429) cleanly formats secondary error', async () => {
    mockOpenAIHandler = (clientOptions, req) => {
      if (req.model === 'gpt-4o') {
        const err = new Error('404 smart model not found');
        err.status = 404;
        throw err;
      }
      if (req.model === 'gpt-4o-mini') {
        const err = new Error('429 fast model also exhausted');
        err.status = 429;
        throw err;
      }
    };

    const llm = createLLM({
      provider: 'openai',
      smart: true,
      apiKeys: { openai: 'key' }
    });

    await assert.rejects(
      async () => llm.stream({ system: '', turns: [{ role: 'user', text: 'hi' }], onToken: () => {} }),
      /quota exhausted \(429 Too Many Requests\)/
    );
  });

  await t.test('3.6: Malformed error objects in formatProviderErrorMessage & isQuotaError / isNotFoundError', () => {
    const malformedErrors = [
      null,
      undefined,
      {},
      { message: null },
      { code: 429 },
      { status: 404 },
      'Raw string error',
      429,
      404,
      new Error(''),
      { error: { message: 'nested message' } }
    ];

    for (const err of malformedErrors) {
      assert.doesNotThrow(() => {
        isQuotaError(err);
        isNotFoundError(err);
        const msg = formatProviderErrorMessage(err, 'openai', 'gpt-4o');
        assert.equal(typeof msg, 'string');
      }, `Failed on malformed error: ${JSON.stringify(err)}`);
    }
  });

  await t.test('3.7: Rapid concurrent streams with alternating smart toggles execute reliably', async () => {
    mockOpenAIHandler = (clientOptions, req) => {
      return [{ choices: [{ delta: { content: `resp-${req.model}` } }] }];
    };

    const promises = [];
    for (let i = 0; i < 20; i++) {
      const isSmart = i % 2 === 0;
      const llm = createLLM({
        provider: 'openai',
        smart: isSmart,
        apiKeys: { openai: 'test-key' }
      });
      promises.push(
        llm.stream({
          system: 'sys',
          turns: [{ role: 'user', text: `query ${i}` }],
          onToken: () => {}
        }).then(res => {
          assert.equal(res, isSmart ? 'resp-gpt-4o' : 'resp-gpt-4o-mini');
        })
      );
    }

    await Promise.all(promises);
  });
});
