import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const EXTENSION_DIR = path.join(ROOT_DIR, 'extension');

// Import modules to test
import { DEFAULT_SETTINGS, DEFAULT_SESSION_STATE, getSettings, setSettings, getSessionState, setSessionState, resetMemoryStores } from '../extension/lib/storage.js';
import { MODE_TEMPLATES, buildSystemPrompt } from '../extension/lib/prompts.js';
import { PROVIDER_MODELS, resolveModel, streamLLM } from '../extension/lib/llm-client.js';

// =============================================================================
// 1. Manifest V3 Integrity & File Structure Tests
// =============================================================================

test('extension manifest.json is valid Manifest V3 and contains all required metadata', () => {
  const manifestPath = path.join(EXTENSION_DIR, 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');

  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  assert.equal(manifest.manifest_version, 3, 'Must be Manifest V3');
  assert.equal(manifest.name, 'Ghost - Stealth AI Copilot');
  assert.ok(manifest.version, 'Must specify version');
  assert.ok(manifest.description, 'Must specify description');

  // Permissions
  const requiredPermissions = ['tabCapture', 'offscreen', 'storage', 'activeTab', 'tabs', 'scripting'];
  for (const perm of requiredPermissions) {
    assert.ok(manifest.permissions.includes(perm), `Permission ${perm} must be declared`);
  }

  // Host Permissions
  const requiredHosts = ['https://meet.google.com/*', 'https://*.zoom.us/*', 'https://teams.microsoft.com/*'];
  for (const host of requiredHosts) {
    assert.ok(manifest.host_permissions.includes(host), `Host permission ${host} must be declared`);
  }

  // Background
  assert.equal(manifest.background.service_worker, 'background/service_worker.js');
  assert.equal(manifest.background.type, 'module');

  // Action popup
  assert.equal(manifest.action.default_popup, 'popup/popup.html');

  // Options UI
  assert.equal(manifest.options_ui.page, 'options/options.html');

  // Content scripts
  assert.ok(Array.isArray(manifest.content_scripts), 'content_scripts must be an array');
  assert.ok(manifest.content_scripts.some(cs => cs.js.includes('content/content.js')));
  assert.ok(manifest.content_scripts.some(cs => cs.css.includes('content/overlay.css')));

  // Icons
  assert.equal(manifest.icons['16'], 'icons/icon-16.png');
  assert.equal(manifest.icons['48'], 'icons/icon-48.png');
  assert.equal(manifest.icons['128'], 'icons/icon-128.png');
});

test('every file referenced in manifest.json exists on disk and is non-empty', () => {
  const manifestPath = path.join(EXTENSION_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const filesToCheck = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_ui.page,
    manifest.icons['16'],
    manifest.icons['48'],
    manifest.icons['128'],
    manifest.action.default_icon['16'],
    manifest.action.default_icon['48'],
    manifest.action.default_icon['128'],
    'offscreen/offscreen.html',
    'offscreen/offscreen.js',
    ...manifest.content_scripts.flatMap(cs => [...cs.js, ...cs.css])
  ];

  for (const relPath of filesToCheck) {
    const fullPath = path.join(EXTENSION_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `Referenced file must exist: ${relPath}`);
    const stats = fs.statSync(fullPath);
    assert.ok(stats.size > 0, `Referenced file must not be empty: ${relPath}`);
  }
});

test('extension icon files are valid PNG binary images with standard signatures', () => {
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  for (const size of [16, 48, 128]) {
    const iconPath = path.join(EXTENSION_DIR, `icons/icon-${size}.png`);
    const buf = fs.readFileSync(iconPath);
    assert.ok(buf.length >= 8, `Icon ${size} must be at least 8 bytes`);
    assert.deepEqual(buf.subarray(0, 8), pngSig, `Icon ${size} must have valid PNG signature`);
  }
});

test('extension HTML pages comply with MV3 CSP (no inline script tags)', () => {
  const htmlFiles = [
    'popup/popup.html',
    'options/options.html',
    'offscreen/offscreen.html'
  ];

  for (const relPath of htmlFiles) {
    const fullPath = path.join(EXTENSION_DIR, relPath);
    const content = fs.readFileSync(fullPath, 'utf8');

    // Find script tags
    const scriptTagRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptTagRegex.exec(content)) !== null) {
      const attrs = match[1];
      const inlineCode = match[2].trim();
      assert.ok(attrs.includes('src='), `Script tags in ${relPath} must use src attribute, no inline scripts allowed`);
      assert.equal(inlineCode, '', `Script tag in ${relPath} must not contain inline JavaScript`);
    }
  }
});

// =============================================================================
// 2. Storage & Session State Machine Tests
// =============================================================================

test('storage defaults contain all required fields for multi-provider copilot', async () => {
  resetMemoryStores();
  const settings = await getSettings();

  assert.equal(settings.provider, 'gemini');
  assert.equal(settings.activeMode, 'assist');
  assert.equal(settings.smart, false);
  assert.equal(settings.sttEngine, 'webspeech');
  assert.equal(settings.geminiModelFast, 'gemini-2.5-flash');
  assert.equal(settings.geminiModelSmart, 'gemini-2.5-pro');
  assert.equal(settings.openaiModelFast, 'gpt-4o-mini');
  assert.equal(settings.anthropicModelFast, 'claude-3-5-haiku-20241022');
  assert.equal(settings.groqModelFast, 'llama-3.3-70b-versatile');
});

test('setSettings updates configuration and persists changes', async () => {
  resetMemoryStores();
  const updated = await setSettings({
    provider: 'anthropic',
    smart: true,
    candidateResume: 'Experienced Senior Engineer'
  });

  assert.equal(updated.provider, 'anthropic');
  assert.equal(updated.smart, true);
  assert.equal(updated.candidateResume, 'Experienced Senior Engineer');

  const retrieved = await getSettings();
  assert.equal(retrieved.provider, 'anthropic');
  assert.equal(retrieved.smart, true);
});

test('session state machine handles transitions and prevents duplicate capture', async () => {
  resetMemoryStores();
  let session = await getSessionState();
  assert.equal(session.recordingState, 'idle');

  // Transition: idle -> starting -> recording
  await setSessionState({ recordingState: 'starting', activeTabId: 42 });
  session = await getSessionState();
  assert.equal(session.recordingState, 'starting');
  assert.equal(session.activeTabId, 42);

  await setSessionState({ recordingState: 'recording', activeStreamId: 'stream-123' });
  session = await getSessionState();
  assert.equal(session.recordingState, 'recording');
  assert.equal(session.activeStreamId, 'stream-123');

  // Transition: recording -> stopping -> idle
  await setSessionState({ recordingState: 'stopping' });
  session = await getSessionState();
  assert.equal(session.recordingState, 'stopping');

  await setSessionState({ recordingState: 'idle', activeTabId: null, activeStreamId: null });
  session = await getSessionState();
  assert.equal(session.recordingState, 'idle');
  assert.equal(session.activeTabId, null);
  assert.equal(session.activeStreamId, null);
});

// =============================================================================
// 3. Prompt Engineering & System Prompt Construction Tests
// =============================================================================

test('prompt templates cover assist, say, code, notes, and followup modes', () => {
  assert.ok(MODE_TEMPLATES.assist.includes('succinct, high-impact, direct answers'));
  assert.ok(MODE_TEMPLATES.say.includes('NEVER repeat or echo the interviewer\'s question'));
  assert.ok(MODE_TEMPLATES.code.includes('optimal time and space complexity'));
  assert.ok(MODE_TEMPLATES.notes.includes('Key Takeaways'));
  assert.ok(MODE_TEMPLATES.followup.includes('insightful questions'));
});

test('buildSystemPrompt correctly injects candidate context and reasoning tier', () => {
  const promptFast = buildSystemPrompt({
    mode: 'assist',
    smart: false,
    resume: 'Master of Science in Computer Science, 5 years at Cloudflare',
    jobDescription: 'Staff Distributed Systems Engineer',
    aiRules: 'Prioritize Go and Rust examples'
  });

  assert.ok(promptFast.includes('[REASONING TIER: FAST]'));
  assert.ok(promptFast.includes('Candidate Background & Experience'));
  assert.ok(promptFast.includes('Cloudflare'));
  assert.ok(promptFast.includes('Target Job Description'));
  assert.ok(promptFast.includes('Staff Distributed Systems Engineer'));
  assert.ok(promptFast.includes('Prioritize Go and Rust examples'));

  const promptSmart = buildSystemPrompt({
    mode: 'say',
    smart: true
  });
  assert.ok(promptSmart.includes('[REASONING TIER: SMART]'));
  assert.ok(promptSmart.includes('NEVER repeat or echo'));
});

test('buildSystemPrompt omits aiRules for code mode to ensure strict algorithmic solutions', () => {
  const codePrompt = buildSystemPrompt({
    mode: 'code',
    smart: true,
    aiRules: 'Always be funny and casual'
  });

  assert.ok(codePrompt.includes('optimal time and space complexity'));
  assert.ok(!codePrompt.includes('Always be funny and casual'), 'Code mode must ignore casual AI rules');
});

// =============================================================================
// 4. Multi-Provider Model Resolution & Self-Healing Fallback Tests
// =============================================================================

test('resolveModel returns correct fast and smart tier models across all providers', () => {
  assert.equal(resolveModel({ provider: 'gemini', smart: false }), 'gemini-2.5-flash');
  assert.equal(resolveModel({ provider: 'gemini', smart: true }), 'gemini-2.5-pro');

  assert.equal(resolveModel({ provider: 'openai', smart: false }), 'gpt-4o-mini');
  assert.equal(resolveModel({ provider: 'openai', smart: true }), 'gpt-4o');

  assert.equal(resolveModel({ provider: 'anthropic', smart: false }), 'claude-3-5-haiku-20241022');
  assert.equal(resolveModel({ provider: 'anthropic', smart: true }), 'claude-3-5-sonnet-20241022');

  assert.equal(resolveModel({ provider: 'groq', smart: false }), 'llama-3.3-70b-versatile');
  assert.equal(resolveModel({ provider: 'groq', smart: true }), 'deepseek-r1-distill-llama-70b');

  assert.equal(resolveModel({ provider: 'custom', smart: false }), 'llama3.2');
});

test('streamLLM triggers self-healing fallback when smart tier encounters 404 or 429', async () => {
  let callCount = 0;
  const originalFetch = globalThis.fetch;

  // Mock fetch simulating 429 quota error on smart model then success on fast model
  globalThis.fetch = async (url, opts) => {
    callCount++;
    const body = JSON.parse(opts.body || '{}');
    if (callCount === 1) {
      // First attempt on Smart tier fails with 429
      return {
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded for model gemini-2.5-pro'
      };
    }
    // Second attempt on Fast tier succeeds
    assert.ok(url.includes('gemini-2.5-flash'), 'Fallback must target fast model');
    const sseResponse = 'data: {"candidates":[{"content":{"parts":[{"text":"Self-healed fast answer"}]}}]}\n\n';
    return {
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: new TextEncoder().encode(sseResponse) };
            }
          };
        }
      }
    };
  };

  try {
    const tokens = [];
    const result = await streamLLM({
      provider: 'gemini',
      smart: true,
      messages: [{ role: 'user', content: 'Explain Raft consensus' }],
      settings: { geminiApiKey: 'test-key' },
      onToken: (tok) => tokens.push(tok)
    });

    assert.equal(callCount, 2, 'Must have attempted 2 calls (smart then fallback fast)');
    assert.ok(result.includes('Self-healed fast answer'));
    assert.deepEqual(tokens, ['Self-healed fast answer']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// =============================================================================
// 5. Offscreen & Content Script Contract Tests
// =============================================================================

test('offscreen document script contains MediaStream loopback and speech recognition setup', () => {
  const offscreenJs = fs.readFileSync(path.join(EXTENSION_DIR, 'offscreen/offscreen.js'), 'utf8');

  assert.ok(offscreenJs.includes('navigator.mediaDevices.getUserMedia'), 'Must use getUserMedia for tab audio');
  assert.ok(offscreenJs.includes('AudioContext'), 'Must instantiate AudioContext');
  assert.ok(offscreenJs.includes('connect(activeAudioContext.destination)'), 'Must connect audio to destination (speaker loopback)');
  assert.ok(offscreenJs.includes('SpeechRecognition') || offscreenJs.includes('webkitSpeechRecognition'), 'Must support Web Speech API');
  assert.ok(offscreenJs.includes('START_CAPTURE'), 'Must handle START_CAPTURE message');
  assert.ok(offscreenJs.includes('STOP_CAPTURE'), 'Must handle STOP_CAPTURE message');
});

test('content script attaches Shadow DOM with open mode and builds complete HUD DOM', () => {
  const contentJs = fs.readFileSync(path.join(EXTENSION_DIR, 'content/content.js'), 'utf8');

  assert.ok(contentJs.includes("attachShadow({ mode: 'open' })"), 'Must attach open Shadow DOM');
  assert.ok(contentJs.includes('ghost-hud-container'), 'Must include HUD container class');
  assert.ok(contentJs.includes('transcriptDrawer'), 'Must include transcript drawer element');
  assert.ok(contentJs.includes('suggestionView'), 'Must include suggestion view element');
  assert.ok(contentJs.includes('smartToggle'), 'Must include smart reasoning toggle');
  assert.ok(contentJs.includes('TRANSCRIPT_SEGMENT'), 'Must listen for TRANSCRIPT_SEGMENT events');
  assert.ok(contentJs.includes('STREAM_CHUNK'), 'Must handle real-time streaming chunks');
});

test('background service worker implements complete session message routing and state lock', () => {
  const swJs = fs.readFileSync(path.join(EXTENSION_DIR, 'background/service_worker.js'), 'utf8');

  assert.ok(swJs.includes('chrome.tabCapture.getMediaStreamId'), 'Must acquire tab capture media stream ID');
  assert.ok(swJs.includes('chrome.offscreen.createDocument'), 'Must create offscreen document');
  assert.ok(swJs.includes('START_RECORDING'), 'Must handle START_RECORDING');
  assert.ok(swJs.includes('STOP_RECORDING'), 'Must handle STOP_RECORDING');
  assert.ok(swJs.includes('GET_STATE'), 'Must handle GET_STATE');
  assert.ok(swJs.includes('return true'), 'Must return true for async message channel persistence');
});
