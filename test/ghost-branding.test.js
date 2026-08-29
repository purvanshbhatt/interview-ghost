const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');

const pkg = require('../package.json');
const builder = require('../electron-builder.cjs');
const { MODES } = require('../src/prompts');

test('package.json & electron-builder metadata are branded as Ghost', () => {
  assert.equal(pkg.name, 'ghost');
  assert.equal(pkg.author, 'ghost');
  assert.match(pkg.description, /ghost/i);
  assert.equal(builder.appId, 'com.ghost.overlay');
  assert.equal(builder.productName, 'Ghost');
  assert.equal(builder.nsis.shortcutName, 'Ghost');
  assert.equal(builder.linux.maintainer, 'ghost');
  assert.equal(builder.linux.desktop.entry.Name, 'Ghost');
  assert.equal(builder.linux.desktop.entry.StartupWMClass, 'ghost');
});

test('prompts.js system prompts identify as Ghost across conversational modes', () => {
  const ghostModes = ['assist', 'say', 'followup', 'recap', 'ask', 'answerThis', 'mock', 'coffee', 'phoneCall', 'notes'];
  for (const modeKey of ghostModes) {
    const mode = MODES[modeKey];
    assert.ok(mode, `Mode ${modeKey} should exist`);
    const systemPrompt = mode.buildSystem('');
    assert.match(systemPrompt, /You are Ghost/i, `Mode ${modeKey} should identify as Ghost`);
  }
});

test('store.js transparently migrates cue-data.json to ghost-data.json if missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-store-test-'));
  const cueFile = path.join(tmpDir, 'cue-data.json');
  const ghostFile = path.join(tmpDir, 'ghost-data.json');

  // Seed legacy cue-data.json
  const legacyData = {
    apiKeyOpenAI: 'sk-legacy-test-key',
    activeMode: 'coffee',
    saveTranscripts: true,
    aiRules: 'Legacy rules'
  };
  fs.writeFileSync(cueFile, JSON.stringify(legacyData, null, 2), 'utf8');

  // Create a temporary mock file for electron
  const mockElectronPath = path.join(tmpDir, 'mock-electron.js');
  fs.writeFileSync(
    mockElectronPath,
    `module.exports = { app: { getPath: (n) => ${JSON.stringify(tmpDir)} } };`,
    'utf8'
  );

  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'electron') {
      return mockElectronPath;
    }
    return originalResolve.call(this, request, ...rest);
  };

  try {
    delete require.cache[require.resolve('../src/store')];
    const store = require('../src/store');
    const settings = store.getSettings();
    assert.equal(settings.apiKeyOpenAI, 'sk-legacy-test-key');
    assert.equal(settings.activeMode, 'coffee');
    assert.equal(settings.aiRules, 'Legacy rules');

    // Modifying settings should write to ghost-data.json
    store.setSettings({ activeMode: 'assist' });
    assert.ok(fs.existsSync(ghostFile), 'ghost-data.json should be created');
    const savedGhost = JSON.parse(fs.readFileSync(ghostFile, 'utf8'));
    assert.equal(savedGhost.activeMode, 'assist');
    assert.equal(savedGhost.apiKeyOpenAI, 'sk-legacy-test-key');
  } finally {
    Module._resolveFilename = originalResolve;
    delete require.cache[require.resolve('../src/store')];
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
});
