const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');

const {
  DEFAULT_SETTINGS,
  createMockGhostBridge,
  createDOMSimulator,
  createMockLLMProvider,
  createMockAudioPipeline,
  createExtensionMV3Simulator,
  createIOSValidator,
  createSanitizationAuditor,
} = require('./harness');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise & Multi-Feature Interactions)
// ============================================================================

test.describe('Tier 3: Cross-Feature Combinations', () => {

  // --------------------------------------------------------------------------
  // Combination 1: Smart Toggle Active during Continuous Live Transcription
  // --------------------------------------------------------------------------
  test('Combo 1: Smart reasoning toggle active during continuous live speech transcription', async () => {
    const bridge = createMockGhostBridge({ settings: { smart: true } });
    const dom = createDOMSimulator();
    const audio = createMockAudioPipeline();
    const llm = createMockLLMProvider({ provider: 'gemini', smart: true, tokenResponse: ['Solution', ' strategy'] });

    // 1. Audio capture starts
    audio.start();
    assert.equal(audio.isCapturing(), true);

    // 2. Continuous incoming speech arrives from interviewer
    audio.emitSpeech('them', 'Can you design a distributed cache system?');
    dom.appendTranscriptTurn('them', 'Can you design a distributed cache system?');

    // 3. Verify composer input remains pristine and layout has zero vertical bounce
    assert.equal(dom.elements.input.value, '');
    assert.equal(dom.elements.composer.style.height, '80px');
    assert.equal(dom.elements.tsList.children.length, 1);

    // 4. Candidate manually enters prompt
    dom.setUserInput('Key design requirements: high availability, LRU eviction');
    assert.equal(dom.elements.input.value, 'Key design requirements: high availability, LRU eviction');

    // 5. User triggers Ask -> executes Smart model stream
    const tokens = [];
    const response = await llm.stream({
      system: 'You are Ghost copilot.',
      turns: [{ role: 'user', text: dom.elements.input.value }],
      onToken: (t) => tokens.push(t),
    });

    assert.equal(response, 'Solution strategy');
    assert.equal(llm.model, 'gemini-2.5-flash');
    assert.equal(llm.maxTokens, 1400); // Smart tier token limit
  });

  // --------------------------------------------------------------------------
  // Combination 2: Self-Healing 429 Quota Fallback during Active Generation
  // --------------------------------------------------------------------------
  test('Combo 2: Self-healing 429 quota fallback during active prompt generation', async () => {
    const llm = createMockLLMProvider({
      provider: 'openai',
      smart: true,
      simulatedError: { status: 429, message: 'OpenAI quota exceeded' },
      tokenResponse: ['Self', '-', 'healed', ' output'],
    });

    const receivedTokens = [];
    const result = await llm.stream({
      system: 'System instructions',
      turns: [{ role: 'user', text: 'Generate binary search in Rust' }],
      onToken: (t) => receivedTokens.push(t),
    });

    assert.equal(result, 'Self-healed output');
    assert.equal(llm.__isFallbackTriggered(), true);
    assert.equal(llm.__getActiveModelUsed(), 'gpt-4o-mini'); // Fallback model
    assert.deepEqual(receivedTokens, ['Self', '-', 'healed', ' output']);
  });

  // --------------------------------------------------------------------------
  // Combination 3: Transcript Drawer Toggle during Active Speech Streaming
  // --------------------------------------------------------------------------
  test('Combo 3: Toggling transcript drawer visibility during active speech streaming', () => {
    const dom = createDOMSimulator();
    const audio = createMockAudioPipeline();

    audio.start();

    // 1. Drawer is initially hidden
    assert.equal(dom.hasClass('transcriptSidebar', 'hidden'), true);
    assert.equal(dom.pointOverUI(500, 350), false); // Click passes through

    // 2. Speech arrives while drawer is hidden
    dom.appendTranscriptTurn('them', 'Interviewer question while drawer closed');
    assert.equal(dom.elements.tsList.children.length, 1);
    assert.equal(dom.pointOverUI(500, 350), false, 'Still click-through while hidden');

    // 3. User opens drawer
    dom.removeClass('transcriptSidebar', 'hidden');
    assert.equal(dom.hasClass('transcriptSidebar', 'hidden'), false);
    assert.equal(dom.pointOverUI(500, 350), true, 'Intercepts clicks when open');

    // 4. Candidate answers
    dom.appendTranscriptTurn('you', 'Candidate live answer');
    assert.equal(dom.elements.tsList.children.length, 2);

    // 5. User closes drawer again
    dom.addClass('transcriptSidebar', 'hidden');
    assert.equal(dom.pointOverUI(500, 350), false, 'Click-through restored');
    assert.equal(dom.elements.composer.style.height, '80px', 'Zero composer layout impact');
  });

  // --------------------------------------------------------------------------
  // Combination 4: Switching AI Providers in Settings during Active Session
  // --------------------------------------------------------------------------
  test('Combo 4: Switching AI providers in settings during active meeting session', async () => {
    const bridge = createMockGhostBridge({ settings: { provider: 'gemini', smart: false } });

    // Initial session with Gemini
    const initialSettings = await bridge.settingsGet();
    assert.equal(initialSettings.provider, 'gemini');

    // User updates settings to Anthropic in modal
    const updated = await bridge.settingsSet({ provider: 'anthropic', smart: true });
    assert.equal(updated.provider, 'anthropic');
    assert.equal(updated.smart, true);

    // Instantiate new LLM provider with updated settings
    const llm = createMockLLMProvider({
      provider: updated.provider,
      smart: updated.smart,
      tokenResponse: ['Claude', ' response'],
    });

    assert.equal(llm.provider, 'anthropic');
    assert.equal(llm.model, 'claude-3-5-sonnet-latest');

    const result = await llm.stream({ onToken: () => {} });
    assert.equal(result, 'Claude response');
  });

  // --------------------------------------------------------------------------
  // Combination 5: Chrome Web Extension Tab Audio Capture + Shadow DOM HUD
  // --------------------------------------------------------------------------
  test('Combo 5: Chrome Web Extension tab audio capture + Shadow DOM HUD', async () => {
    const ext = createExtensionMV3Simulator();

    // 1. User opens Google Meet tab
    const tabs = await ext.chrome.tabs.query({});
    assert.equal(tabs.length, 1);
    assert.match(tabs[0].url, /meet\.google\.com/);

    // 2. Tab capture requested by background worker
    const streamId = await ext.chrome.tabCapture.getMediaStreamId({ targetTabId: tabs[0].id });
    assert.ok(streamId);

    // 3. Offscreen document initialized for audio processing
    await ext.chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'] });
    assert.equal(await ext.chrome.offscreen.hasDocument(), true);

    // 4. Session state machine transitions to recording
    await ext.chrome.storage.session.set({ state: 'recording', streamId });
    const currentSession = await ext.chrome.storage.session.get('state');
    assert.equal(currentSession.state, 'recording');

    // 5. Shadow DOM HUD receives streaming AI suggestions
    const hudTokens = [];
    const llm = createMockLLMProvider({
      provider: 'gemini',
      tokenResponse: ['Use', ' MapReduce', ' pattern.'],
    });

    await llm.stream({ onToken: (t) => hudTokens.push(t) });
    assert.equal(hudTokens.join(''), 'Use MapReduce pattern.');
  });

  // --------------------------------------------------------------------------
  // Combination 6: Stealth Screen Protection + Click-Through Mouse Transitions
  // --------------------------------------------------------------------------
  test('Combo 6: Stealth screen protection + click-through mouse transitions', async () => {
    const bridge = createMockGhostBridge();
    const dom = createDOMSimulator();

    // 1. Verify screen protection is active
    const status = await bridge.invisibilityStatus();
    assert.equal(status.active, true);

    // 2. Set mouse ignore on
    bridge.setIgnoreMouse(true);
    assert.equal(bridge.__isMouseIgnored(), true);

    // 3. User hovers over toolbar button -> mouse ignore set to false
    bridge.setIgnoreMouse(false);
    assert.equal(bridge.__isMouseIgnored(), false);
    assert.equal(dom.pointOverUI(50, 30), true, 'Toolbar area is clickable');

    // 4. User moves cursor to transparent region -> mouse ignore set to true
    bridge.setIgnoreMouse(true);
    assert.equal(dom.pointOverUI(10, 10), false, 'Background passes clicks through');
  });

  // --------------------------------------------------------------------------
  // Combination 7: Applink Diagnostics & Sanitization under Cross-Surface Session
  // --------------------------------------------------------------------------
  test('Combo 7: Applink diagnostics & sanitization under cross-surface session', () => {
    const { describeState } = require('../../src/applink-state');

    const rawSession = {
      state: { capturing: true, busy: false, transcribing: { you: true, them: true } },
      transcript: [
        { channel: 'them', text: 'Candidate salary expectation is 180k', ts: 1754300000000 },
        { channel: 'you', text: 'Yes, 180k base.', ts: 1754300005000 },
      ],
      settings: {
        provider: 'openai',
        smart: true,
        resumeContext: 'Confidential Candidate - Secret Resume',
        apiKeys: { openai: 'sk-proj-realkey12345678901234567890', gemini: 'AIzaSyKey123' },
        models: { openai: { fast: 'gpt-4o-mini', smart: 'gpt-4o' } },
      },
    };

    const state = describeState(rawSession);
    const serialized = JSON.stringify(state);

    // Diagnostics must expose system state without leaking private data
    assert.equal(state.capturing, true);
    assert.equal(state.transcriptTurns, 2);
    assert.ok(!serialized.includes('180k'), 'Transcript content must not leak');
    assert.ok(!serialized.includes('Secret Resume'), 'Resume context must not leak');
    assert.ok(!serialized.includes('sk-proj-'), 'API keys must not leak');
  });

  // --------------------------------------------------------------------------
  // Combination 8: AI Rules + Résumé Context Injection across Modes
  // --------------------------------------------------------------------------
  test('Combo 8: AI rules + résumé context injection across modes', () => {
    const { MODES } = require('../../src/prompts');
    const { appendAiRules } = require('../../src/profile-context');

    const rules = 'Never use filler words.\nAlways answer in first person.';
    const resumeContext = '--- CANDIDATE PROFILE ---\nName: Jane Doe\nExperience: Senior Backend Engineer at TechCorp';

    // 1. Assist mode applies context and rules
    const assistSystem = MODES.assist.buildSystem(resumeContext, rules);
    assert.ok(assistSystem.includes('TechCorp'));
    assert.ok(assistSystem.includes('Never use filler words'));

    // 2. Say mode applies rules
    const saySystem = MODES.say.buildSystem(resumeContext, rules);
    assert.ok(saySystem.includes('Never use filler words'));

    // 3. LeetCode mode strictly omits user AI rules to keep coding prompt strict
    const leetcodeSystem = MODES.leetcode.buildSystem(resumeContext, rules);
    assert.ok(!leetcodeSystem.includes('Never use filler words'));
    assert.match(leetcodeSystem, /competitive programmer/);
  });

  // --------------------------------------------------------------------------
  // Combination 9: Multi-Channel Simultaneous Speech Burst with Rapid Clear
  // --------------------------------------------------------------------------
  test('Combo 9: Multi-channel simultaneous speech burst with rapid clear', async () => {
    const bridge = createMockGhostBridge();
    const dom = createDOMSimulator();
    const audio = createMockAudioPipeline();

    audio.start();

    // 1. Rapid interleaved speech
    for (let i = 0; i < 10; i++) {
      audio.emitSpeech('them', `Question ${i}`);
      dom.appendTranscriptTurn('them', `Question ${i}`);
      audio.emitSpeech('you', `Answer ${i}`);
      dom.appendTranscriptTurn('you', `Answer ${i}`);
    }

    assert.equal(dom.elements.tsList.children.length, 20);

    // 2. User triggers Clear History
    await bridge.clearTranscript();
    dom.elements.tsList.children = [];
    assert.equal(dom.elements.tsList.children.length, 0);

    // 3. Subsequent speech arrives immediately after clear
    audio.emitSpeech('them', 'Next question after clear');
    dom.appendTranscriptTurn('them', 'Next question after clear');
    assert.equal(dom.elements.tsList.children.length, 1);
    assert.equal(dom.elements.composer.style.height, '80px');
  });

  // --------------------------------------------------------------------------
  // Combination 10: Custom OpenAI-Compatible Local Endpoint with Dynamic Fallback
  // --------------------------------------------------------------------------
  test('Combo 10: Custom OpenAI-compatible local endpoint with dynamic fallback', async () => {
    const customConfig = {
      provider: 'custom',
      smart: true,
      baseUrl: 'http://127.0.0.1:11434/v1',
      modelOverrides: {
        custom: { fast: 'llama3.2:1b', smart: 'llama3.3:70b' },
      },
      simulatedError: { status: 404, message: 'Custom smart model not pulled' },
      tokenResponse: ['Local', ' Ollama', ' fallback'],
    };

    const llm = createMockLLMProvider(customConfig);
    assert.equal(llm.provider, 'custom');
    assert.equal(llm.model, 'llama3.3:70b');

    const result = await llm.stream({ onToken: () => {} });
    assert.equal(result, 'Local Ollama fallback');
    assert.equal(llm.__isFallbackTriggered(), true);
    assert.equal(llm.__getActiveModelUsed(), 'llama3.2:1b');
  });

});
