const assert = require('node:assert/strict');
const test = require('node:test');

// store.js requires the Electron `app` module via electron, so we can't load
// it directly in node:test without booting Electron. We test the DEFAULTS
// shape indirectly by requiring the module via a tiny shim that stubs the
// electron dependency. This keeps the test hermetic.

const Module = require('module');
const path = require('path');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'electron') {
    return path.join(__dirname, '..', 'test', 'stubs', 'electron-stub.js');
  }
  return originalResolve.call(this, request, ...rest);
};
try {
  // store.js is lazy about app.getPath('userData') — it only fires inside
  // load()/save(), not on require. So just requiring it is safe.
  const store = require('../src/store');
  test('DEFAULTS.saveTranscripts is true by default', () => {
    // No public access to DEFAULTS; exercise getSettings() via the public
    // API after forcing a fresh load. We can't reach the lazy `data` field
    // directly, so we assert via the documented behaviour setSettings +
    // getSettings round-trip: merging a patch over defaults should preserve
    // saveTranscripts unless explicitly overridden.
    store.setSettings({ aiRules: 'temp-' + Date.now() });
    const s = store.getSettings();
    assert.equal(s.saveTranscripts, true, 'saveTranscripts should default to true');
  });

  test('setSettings can opt out of file transcripts by setting saveTranscripts:false', () => {
    store.setSettings({ saveTranscripts: false, aiRules: 'temp2-' + Date.now() });
    const s = store.getSettings();
    assert.equal(s.saveTranscripts, false);
    // Restore
    store.setSettings({ saveTranscripts: true });
  });

  test('DEFAULTS.activeMode is a string (one of the 9 dashboard mode ids)', () => {
    store.setSettings({ aiRules: 'temp3-' + Date.now() });
    const s = store.getSettings();
    assert.equal(typeof s.activeMode, 'string');
    assert.ok(s.activeMode.length > 0);
  });
} finally {
  Module._resolveFilename = originalResolve;
}
