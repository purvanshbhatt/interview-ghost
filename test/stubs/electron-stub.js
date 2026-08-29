// Stub the 'electron' module for unit tests that need to require src/store.js
// (which calls `require('electron').app.getPath('userData')` lazily).
//
// The stub returns a stable temp path under the OS tmpdir. store.js only
// touches `app.getPath('userData')` inside load()/save(); tests trigger them,
// so the path must be writable. We do NOT mock anything else — every other
// electron export stays undefined so missing surface area fails loudly if
// store.js ever reaches for it in a unit-test path.
const os = require('os');
const path = require('path');
const fs = require('fs');

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-store-test-'));
process.on('exit', () => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }); } catch (_) {}
});

module.exports = {
  app: {
    getPath(name) {
      if (name === 'userData') return userDataPath;
      throw new Error('electron-stub only implements app.getPath("userData"). Got: ' + name);
    },
  },
};
