// Per-mode file RAG store.
//
// Each mode (assist, say, mock, coffee, leetcode, ...) gets its own JSON file
// under <userData>/mode-context/<mode>.json containing the parsed text of up to
// MAX_FILES_PER_MODE files dropped on its mode card in the dashboard.
//
// Files are parsed once on import (PDF/DOCX via resume.js + the new TXT/MD/PPTX
// paths) and the extracted text is stored verbatim. At query time the chunks
// are merged into the same in-memory corpus that local-rag.js already builds,
// so a mode's uploaded files are searched with the same token-overlap scorer
// without touching scoreChunk or buildRagBlock.
//
// Native-module-free by design: JSON on disk, no SQLite. atomic write via
// tmp+rename (same trick used by whisper-model-manager).

const fs = require('fs');
const path = require('path');

const MAX_FILES_PER_MODE = 5;
const STORE_DIR_NAME = 'mode-context';
const MAX_EXTRACTED_TEXT_CHARS = 200_000; // ~50k tokens of headroom per file

const VALID_MODE_RE = /^[a-z][a-z0-9_-]{0,31}$/;

// Basename that splits on both separators. path.basename alone leaks full
// Windows paths ("C:\Users\me\Resume.docx") when cue runs on Linux, because
// backslash is not a separator there.
function baseName(name) {
  const s = String(name);
  const idx = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return idx >= 0 ? s.slice(idx + 1) : s;
}

function storeDir(userDataPath) {
  return path.join(userDataPath, STORE_DIR_NAME);
}

function storePathFor(userDataPath, mode) {
  if (!VALID_MODE_RE.test(mode)) throw new Error('Invalid mode id: ' + mode);
  return path.join(storeDir(userDataPath), mode + '.json');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Read the on-disk store for a mode. Returns { files: [] } on any read failure
// (file missing, parse error, bad shape). Never throws — the caller can always
// treat the result as an empty corpus.
function loadModeContextSafe(userDataPath, mode) {
  try {
    const p = storePathFor(userDataPath, mode);
    if (!fs.existsSync(p)) return { files: [] };
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!parsed || !Array.isArray(parsed.files)) return { files: [] };
    return { files: parsed.files.filter(isValidFileEntry).slice(0, MAX_FILES_PER_MODE) };
  } catch (err) {
    console.log('[mode-context-store] load failed', mode, err && err.message);
    return { files: [] };
  }
}

function isValidFileEntry(entry) {
  return entry
    && typeof entry.name === 'string' && entry.name.trim()
    && typeof entry.text === 'string'
    && typeof entry.addedAt === 'number' && Number.isFinite(entry.addedAt);
}

// Atomic write: tmp+rename. Same trick whisper-model-manager uses. Throws on
// write failure — the dashboard surfaces it as a non-fatal error toast.
function saveModeContext(userDataPath, mode, context) {
  const dir = storeDir(userDataPath);
  ensureDir(dir);
  const target = storePathFor(userDataPath, mode);
  const tmp = target + '.tmp.' + process.pid + '.' + Date.now();
  const payload = { files: (context && context.files || []).filter(isValidFileEntry).slice(0, MAX_FILES_PER_MODE) };
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, target);
  return payload;
}

// Add one parsed file to a mode's store. Refuses to exceed MAX_FILES_PER_MODE
// (returns { replaced: false, full: true }). Refuses duplicate names (same
// basename already stored) by replacing the existing entry in place, so
// re-uploading a refreshed version of a file updates rather than duplicating.
function addFile(userDataPath, mode, { name, text, addedAt }) {
  const ctx = loadModeContextSafe(userDataPath, mode);
  const cleanedText = String(text || '').slice(0, MAX_EXTRACTED_TEXT_CHARS);
  const entry = { name: baseName(name), text: cleanedText, addedAt: addedAt || Date.now() };

  const existingIdx = ctx.files.findIndex((f) => f.name === entry.name);
  let replaced = false;
  if (existingIdx >= 0) {
    ctx.files[existingIdx] = entry;
    replaced = true;
  } else if (ctx.files.length >= MAX_FILES_PER_MODE) {
    return { full: true, replaced: false, files: ctx.files };
  } else {
    ctx.files.push(entry);
    replaced = false;
  }
  const saved = saveModeContext(userDataPath, mode, ctx);
  return { full: false, replaced, files: saved.files };
}

function removeFile(userDataPath, mode, name) {
  const ctx = loadModeContextSafe(userDataPath, mode);
  const before = ctx.files.length;
  ctx.files = ctx.files.filter((f) => f.name !== baseName(name));
  saveModeContext(userDataPath, mode, ctx);
  return { removed: ctx.files.length < before, files: ctx.files };
}

function clearMode(userDataPath, mode) {
  saveModeContext(userDataPath, mode, { files: [] });
  return { files: [] };
}

module.exports = {
  MAX_FILES_PER_MODE,
  MAX_EXTRACTED_TEXT_CHARS,
  storeDir,
  storePathFor,
  loadModeContextSafe,
  saveModeContext,
  addFile,
  removeFile,
  clearMode,
};
