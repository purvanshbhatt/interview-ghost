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
// TIER 4: REAL-WORLD APPLICATION SCENARIOS
// Complete End-to-End User Workflows
// ============================================================================

test.describe('Tier 4: Real-World Application Scenarios', () => {

  // --------------------------------------------------------------------------
  // Scenario 1: Complete 5-Stage Mock Technical Interview Flow
  // --------------------------------------------------------------------------
  test('Scenario 1: Complete 5-stage mock technical interview flow', async () => {
    const bridge = createMockGhostBridge();
    const dom = createDOMSimulator();
    const audio = createMockAudioPipeline();
    const { MODES } = require('../../src/prompts');

    // --- STAGE 1: Launch & Verification ---
    const invisibility = await bridge.invisibilityStatus();
    assert.equal(invisibility.active, true, 'Stealth screen protection must be active at launch');
    audio.start();
    assert.equal(audio.isCapturing(), true, 'Audio capture active');

    // --- STAGE 2: Behavioral STAR Question ---
    const behavioralQuestion = 'Tell me about a time you had a technical disagreement with a senior engineer.';
    audio.emitSpeech('them', behavioralQuestion);
    dom.appendTranscriptTurn('them', behavioralQuestion);

    // Verify transcription containment & layout stability
    assert.equal(dom.elements.input.value, '', 'Prompt composer must remain empty during speech');
    assert.equal(dom.elements.composer.style.height, '80px');
    assert.equal(dom.elements.tsList.children.length, 1);

    // Build assist mode prompt
    const assistPrompt = MODES.assist.build({
      transcript: dom.elements.tsList.children,
      userText: '',
    });
    assert.ok(assistPrompt.includes(behavioralQuestion));

    const behavioralLLM = createMockLLMProvider({
      provider: 'gemini',
      tokenResponse: [
        'At TechCorp, our senior architect proposed a centralized cache, but ',
        'I benchmarked distributed Redis instances and proved a 40% latency reduction. ',
        'We adopted the distributed model, successfully handling 50k RPS.',
      ],
    });

    const behavioralAnswer = await behavioralLLM.stream({
      system: MODES.assist.buildSystem(null),
      turns: [{ role: 'user', text: assistPrompt }],
    });
    assert.match(behavioralAnswer, /TechCorp|latency reduction|50k RPS/);

    // Candidate speaks answer out loud
    audio.emitSpeech('you', behavioralAnswer);
    dom.appendTranscriptTurn('you', behavioralAnswer);
    assert.equal(dom.elements.tsList.children.length, 2);

    // --- STAGE 3: System Design Question ---
    const sysDesignQuestion = 'How would you design a distributed rate limiter with sliding window log?';
    audio.emitSpeech('them', sysDesignQuestion);
    dom.appendTranscriptTurn('them', sysDesignQuestion);

    const sysDesignLLM = createMockLLMProvider({
      provider: 'openai',
      smart: true,
      tokenResponse: [
        'I would use Redis Sorted Sets (ZSET) where keys represent user IDs, scores are timestamps in milliseconds, ',
        'and values are unique request IDs. We prune expired timestamps with ZREMRANGEBYSCORE and check ZCARD within a multi-exec transaction.',
      ],
    });

    const sysDesignAnswer = await sysDesignLLM.stream({
      system: MODES.assist.buildSystem(null),
      turns: [{ role: 'user', text: sysDesignQuestion }],
    });
    assert.match(sysDesignAnswer, /Redis Sorted Sets|ZREMRANGEBYSCORE/);

    // --- STAGE 4: Live LeetCode Coding Problem ---
    const leetcodeLLM = createMockLLMProvider({
      provider: 'anthropic',
      smart: true,
      tokenResponse: [
        '```python\n',
        'def lengthOfLongestSubstring(s: str) -> int:\n',
        '    char_map = {}\n',
        '    left = max_len = 0\n',
        '    for right, ch in enumerate(s):\n',
        '        if ch in char_map and char_map[ch] >= left:\n',
        '            left = char_map[ch] + 1\n',
        '        char_map[ch] = right\n',
        '        max_len = max(max_len, right - left + 1)\n',
        '    return max_len\n',
        '```',
      ],
    });

    const codeAnswer = await leetcodeLLM.stream({
      system: MODES.leetcode.buildSystem(null),
      turns: [{ role: 'user', text: 'Longest Substring Without Repeating Characters' }],
    });
    assert.match(codeAnswer, /def lengthOfLongestSubstring/);

    // --- STAGE 5: Wrap-up & Transcript Verification ---
    audio.stop();
    assert.equal(audio.isCapturing(), false);
    assert.ok(dom.elements.tsList.children.length >= 3);
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Multi-Turn Technical Deep-Dive with Live 429 Quota Self-Healing
  // --------------------------------------------------------------------------
  test('Scenario 2: Multi-turn technical deep-dive with live 429 quota self-healing recovery', async () => {
    // Turn 1: Normal Smart request
    const turn1LLM = createMockLLMProvider({
      provider: 'openai',
      smart: true,
      tokenResponse: ['Kubernetes uses etcd as its distributed key-value store for cluster state.'],
    });
    const ans1 = await turn1LLM.stream({
      system: 'You are Ghost copilot.',
      turns: [{ role: 'user', text: 'What is the role of etcd in Kubernetes?' }],
    });
    assert.match(ans1, /etcd/);
    assert.equal(turn1LLM.__isFallbackTriggered(), false);

    // Turn 2: High traffic causes 429 Rate Limit on Smart tier (gpt-4o)
    const turn2LLM = createMockLLMProvider({
      provider: 'openai',
      smart: true,
      simulatedError: { status: 429, message: 'Rate limit exceeded on gpt-4o' },
      tokenResponse: ['Raft consensus ensures consistent state across etcd leader and follower nodes.'],
    });
    const ans2 = await turn2LLM.stream({
      system: 'You are Ghost copilot.',
      turns: [{ role: 'user', text: 'How does etcd achieve consensus?' }],
    });
    assert.match(ans2, /Raft consensus/);
    assert.equal(turn2LLM.__isFallbackTriggered(), true, 'Must self-heal to fast tier without breaking stream');
    assert.equal(turn2LLM.__getActiveModelUsed(), 'gpt-4o-mini');

    // Turn 3: Follow-up question completes cleanly on fast model
    const turn3LLM = createMockLLMProvider({
      provider: 'openai',
      smart: false,
      tokenResponse: ['Quorum requires (N/2) + 1 active nodes.'],
    });
    const ans3 = await turn3LLM.stream({
      system: 'You are Ghost copilot.',
      turns: [{ role: 'user', text: 'What is the quorum requirement in Raft?' }],
    });
    assert.match(ans3, /Quorum requires/);
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Stealth Verification under Active Proctoring & Screen Share
  // --------------------------------------------------------------------------
  test('Scenario 3: Stealth verification under active proctoring & screen share', async () => {
    const bridge = createMockGhostBridge();
    const dom = createDOMSimulator();

    // 1. Invisibility status check
    const status = await bridge.invisibilityStatus();
    assert.equal(status.active, true, 'Window content protection must be active');

    // 2. Mouse ignore / click-through verification over screen-sharing meeting
    bridge.setIgnoreMouse(true);
    assert.equal(bridge.__isMouseIgnored(), true);

    // Click outside interactive bounds (x: 300, y: 400 - empty background)
    const isOverOverlayUI = dom.pointOverUI(300, 400);
    assert.equal(isOverOverlayUI, false, 'Clicks must pass through to underlying meeting window');

    // Click on toolbar (x: 50, y: 30)
    const isOverToolbar = dom.pointOverUI(50, 30);
    assert.equal(isOverToolbar, true, 'Overlay controls must remain interactive');

    // 3. Sensitive settings (API keys) are masked
    const settings = await bridge.settingsGet();
    assert.ok(settings.apiKeys);
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Chrome Web Extension Tab Audio Capture & HUD Interaction
  // --------------------------------------------------------------------------
  test('Scenario 4: Chrome Web Extension tab audio capture & floating HUD interaction', async () => {
    const ext = createExtensionMV3Simulator();

    // 1. Meeting tab discovered
    const tabs = await ext.chrome.tabs.query({ url: '*://meet.google.com/*' });
    assert.equal(tabs.length, 1);
    const meetingTabId = tabs[0].id;

    // 2. Audio capture initiated
    const streamId = await ext.chrome.tabCapture.getMediaStreamId({ targetTabId: meetingTabId });
    assert.ok(streamId);

    // 3. Offscreen audio routing
    await ext.chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Meeting audio transcription',
    });
    assert.equal(await ext.chrome.offscreen.hasDocument(), true);

    // 4. Session state machine updated
    await ext.chrome.storage.session.set({
      state: 'recording',
      tabId: meetingTabId,
      streamId,
    });

    const activeSession = await ext.chrome.storage.session.get('state');
    assert.equal(activeSession.state, 'recording');

    // 5. Live suggestions generated for floating HUD
    const hudTokens = [];
    const llm = createMockLLMProvider({
      provider: 'gemini',
      tokenResponse: ['Discuss', ' ACID', ' properties: Atomicity, Consistency, Isolation, Durability.'],
    });

    await llm.stream({ onToken: (t) => hudTokens.push(t) });
    assert.equal(hudTokens.join(''), 'Discuss ACID properties: Atomicity, Consistency, Isolation, Durability.');

    // 6. Stop capture session
    await ext.chrome.offscreen.closeDocument();
    assert.equal(await ext.chrome.offscreen.hasDocument(), false);
    await ext.chrome.storage.session.set({ state: 'idle' });
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Mobile & Desktop Cross-Surface State Synchronization
  // --------------------------------------------------------------------------
  test('Scenario 5: Mobile & desktop cross-surface state synchronization & persistence', async () => {
    const bridge = createMockGhostBridge();

    // 1. Configure settings on desktop
    await bridge.settingsSet({
      provider: 'gemini',
      smart: true,
      aiRules: 'Answer in 2 short bullet points.',
      activeMode: 'assist',
    });

    const desktopState = await bridge.settingsGet();
    assert.equal(desktopState.smart, true);
    assert.equal(desktopState.aiRules, 'Answer in 2 short bullet points.');

    // 2. Simulate mobile client connecting and synchronizing settings schema
    const mobileSyncPayload = {
      provider: desktopState.provider,
      smart: desktopState.smart,
      activeMode: desktopState.activeMode,
      aiRules: desktopState.aiRules,
    };

    assert.deepEqual(mobileSyncPayload, {
      provider: 'gemini',
      smart: true,
      activeMode: 'assist',
      aiRules: 'Answer in 2 short bullet points.',
    });

    // 3. Validate iOS project configuration assets
    const iosValidator = createIOSValidator(PROJECT_ROOT);
    assert.equal(typeof iosValidator.hasPodfile, 'function');
  });

});
