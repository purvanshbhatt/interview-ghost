const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const store = require('../src/mode-context-store');

function tmpUserData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-mode-context-'));
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

test('loadModeContextSafe returns {files:[]} when nothing is stored yet', () => {
  const ud = tmpUserData();
  try {
    const ctx = store.loadModeContextSafe(ud, 'assist');
    assert.deepEqual(ctx, { files: [] });
    // store dir is NOT lazily created by a read
    assert.ok(!fs.existsSync(store.storeDir(ud)));
  } finally { cleanup(ud); }
});

test('addFile persists a single parsed file and reads it back', () => {
  const ud = tmpUserData();
  try {
    const r = store.addFile(ud, 'mock', { name: 'behavioral-questions.pdf', text: 'Tell me about a time...' });
    assert.equal(r.full, false);
    assert.equal(r.replaced, false);
    assert.equal(r.files.length, 1);
    assert.equal(r.files[0].name, 'behavioral-questions.pdf');

    const ctx = store.loadModeContextSafe(ud, 'mock');
    assert.equal(ctx.files.length, 1);
    assert.equal(ctx.files[0].text, 'Tell me about a time...');
    assert.ok(ctx.files[0].addedAt > 0);
  } finally { cleanup(ud); }
});

test('addFile basenames the stored entry (no path leak)', () => {
  const ud = tmpUserData();
  try {
    store.addFile(ud, 'coffee', { name: 'C:\\Users\\me\\Resume.docx', text: 'x' });
    const ctx = store.loadModeContextSafe(ud, 'coffee');
    assert.equal(ctx.files[0].name, 'Resume.docx');
  } finally { cleanup(ud); }
});

test('addFile replaces by basename instead of duplicating', () => {
  const ud = tmpUserData();
  try {
    store.addFile(ud, 'mock', { name: 'notes.md', text: 'v1' });
    const r = store.addFile(ud, 'mock', { name: '/tmp/notes.md', text: 'v2' });
    assert.equal(r.replaced, true);
    assert.equal(r.full, false);
    assert.equal(r.files.length, 1);

    const ctx = store.loadModeContextSafe(ud, 'mock');
    assert.equal(ctx.files.length, 1);
    assert.equal(ctx.files[0].text, 'v2');
  } finally { cleanup(ud); }
});

test('addFile enforces the MAX_FILES_PER_MODE cap and reports {full:true}', () => {
  const ud = tmpUserData();
  try {
    for (let i = 0; i < store.MAX_FILES_PER_MODE; i++) {
      const r = store.addFile(ud, 'mock', { name: 'f' + i + '.txt', text: 'x' });
      assert.equal(r.full, false, 'should not be full before cap (i=' + i + ')');
    }
    const over = store.addFile(ud, 'mock', { name: 'too-many.txt', text: 'x' });
    assert.equal(over.full, true);
    assert.equal(over.replaced, false);
    assert.equal(over.files.length, store.MAX_FILES_PER_MODE);
    // The over-quota file must not be persisted
    const ctx = store.loadModeContextSafe(ud, 'mock');
    assert.equal(ctx.files.length, store.MAX_FILES_PER_MODE);
    assert.ok(!ctx.files.some((f) => f.name === 'too-many.txt'));
  } finally { cleanup(ud); }
});

test('addFile truncates oversized extracted text to MAX_EXTRACTED_TEXT_CHARS', () => {
  const ud = tmpUserData();
  try {
    const huge = 'y'.repeat(store.MAX_EXTRACTED_TEXT_CHARS + 5000);
    store.addFile(ud, 'mock', { name: 'big.txt', text: huge });
    const ctx = store.loadModeContextSafe(ud, 'mock');
    assert.equal(ctx.files[0].text.length, store.MAX_EXTRACTED_TEXT_CHARS);
  } finally { cleanup(ud); }
});

test('addFile rejects invalid mode ids without writing to disk', () => {
  const ud = tmpUserData();
  try {
    // Relative-traversal slash and an uppercase name should both throw
    assert.throws(() => store.addFile(ud, '../escape', { name: 'a.txt', text: 'x' }), /Invalid mode id/);
    assert.throws(() => store.addFile(ud, 'Mock', { name: 'a.txt', text: 'x' }), /Invalid mode id/);
    const dir = store.storeDir(ud);
    assert.ok(!fs.existsSync(path.join(dir, 'Mock.json')));
  } finally { cleanup(ud); }
});

test('removeFile drops the matching basename and survives a missing entry', () => {
  const ud = tmpUserData();
  try {
    store.addFile(ud, 'mock', { name: 'one.txt', text: 'a' });
    store.addFile(ud, 'mock', { name: 'two.txt', text: 'b' });
    const r = store.removeFile(ud, 'mock', 'one.txt');
    assert.equal(r.removed, true);
    assert.equal(r.files.length, 1);
    assert.equal(r.files[0].name, 'two.txt');

    // Removing something never stored is a no-op (no throw)
    const r2 = store.removeFile(ud, 'mock', 'never-here.txt');
    assert.equal(r2.removed, false);
    assert.equal(r2.files.length, 1);
  } finally { cleanup(ud); }
});

test('clearMode empties the stored files for one mode without touching others', () => {
  const ud = tmpUserData();
  try {
    store.addFile(ud, 'mock', { name: 'a.txt', text: 'a' });
    store.addFile(ud, 'coffee', { name: 'b.txt', text: 'b' });
    const cleared = store.clearMode(ud, 'mock');
    assert.equal(cleared.files.length, 0);
    // The other mode must be untouched — a regression here would silently
    // wipe a user's whole uploaded library when clearing one card.
    const surviving = store.loadModeContextSafe(ud, 'coffee');
    assert.equal(surviving.files.length, 1);
    assert.equal(surviving.files[0].name, 'b.txt');
  } finally { cleanup(ud); }
});

test('loadModeContextSafe resists a corrupted JSON file (returns empty corpus instead of throwing)', () => {
  const ud = tmpUserData();
  try {
    fs.mkdirSync(store.storeDir(ud), { recursive: true });
    fs.writeFileSync(store.storePathFor(ud, 'mock'), '{not json');
    const ctx = store.loadModeContextSafe(ud, 'mock');
    assert.deepEqual(ctx, { files: [] });
  } finally { cleanup(ud); }
});

test('loadModeContextSafe resists a JSON object with the wrong shape (files not an array)', () => {
  const ud = tmpUserData();
  try {
    fs.mkdirSync(store.storeDir(ud), { recursive: true });
    fs.writeFileSync(store.storePathFor(ud, 'ask'), JSON.stringify({ files: 'not-an-array' }));
    const ctx = store.loadModeContextSafe(ud, 'ask');
    assert.deepEqual(ctx, { files: [] });
  } finally { cleanup(ud); }
});

test('saveModeContext writes atomically (no .tmp files left behind on success)', () => {
  const ud = tmpUserData();
  try {
    store.saveModeContext(ud, 'mock', { files: [{ name: 'a.txt', text: 'a', addedAt: 1 }] });
    const dir = store.storeDir(ud);
    const entries = fs.readdirSync(dir);
    assert.deepEqual(entries, ['mock.json']);
  } finally { cleanup(ud); }
});
