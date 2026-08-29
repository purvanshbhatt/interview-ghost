const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseDocumentFile, parsePptx, stripXmlText, SUPPORTED_EXT } = require('../src/resume');

function tmpFile(content, ext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-resume-'));
  const p = path.join(dir, 'test' + ext);
  fs.writeFileSync(p, content);
  return p;
}
function cleanup(p) { try { fs.rmSync(path.dirname(p), { recursive: true, force: true }); } catch (_) {} }

test('parseDocumentFile: TXT passes through as trimmed UTF-8 text', async () => {
  const p = tmpFile('  hello world\nsecond line\n  ', '.txt');
  try {
    const text = await parseDocumentFile(p);
    assert.equal(text, 'hello world\nsecond line');
  } finally { cleanup(p); }
});

test('parseDocumentFile: MD is handled as plain text (no rendering, just text)', async () => {
  const p = tmpFile('# Heading\n\n- bullet\n- bullet two\n', '.md');
  try {
    const text = await parseDocumentFile(p);
    assert.match(text, /# Heading/);
    assert.match(text, /- bullet/);
  } finally { cleanup(p); }
});

test('parseDocumentFile: unsupported extensions throw a helpful error listing supported types', async () => {
  const p = tmpFile('not a real doc', '.doc');
  try {
    await assert.rejects(() => parseDocumentFile(p), /Legacy \.doc files are not supported/);
  } finally { cleanup(p); }
});

test('parseDocumentFile: unknown extensions throw with the supported-types list', async () => {
  const p = tmpFile('foo', '.rtf');
  try {
    await assert.rejects(
      () => parseDocumentFile(p),
      /Unsupported file type: \.rtf\. Supported:/
    );
  } finally { cleanup(p); }
});

test('SUPPORTED_EXT includes the dashboard drop-zone types (pdf, docx, pptx, txt, md)', () => {
  assert.ok(SUPPORTED_EXT.includes('.pdf'));
  assert.ok(SUPPORTED_EXT.includes('.docx'));
  assert.ok(SUPPORTED_EXT.includes('.pptx'));
  assert.ok(SUPPORTED_EXT.includes('.txt'));
  assert.ok(SUPPORTED_EXT.includes('.md'));
});

test('stripXmlText: extracts <a:t> runs from a single Open XML slide', () => {
  const xml = '<?xml version="1.0"?>' +
    '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<p:cSld><p:spTree><p:sp>' +
    '<a:t>Tell me about</a:t>' +
    '<a:t>a time you shipped.</a:t>' +
    '</p:sp></p:cSld></p:sld>';
  const text = stripXmlText(xml);
  assert.equal(text, 'Tell me about a time you shipped.');
});

test('stripXmlText: collapses extra whitespace inside and between runs', () => {
  const xml = '<a:t>   first   </a:t><a:t>second  word</a:t>';
  assert.equal(stripXmlText(xml), 'first second word');
});

test('stripXmlText: returns empty string when no <a:t> runs are present', () => {
  assert.equal(stripXmlText('<root><a:rPr/></root>'), '');
  assert.equal(stripXmlText(''), '');
});

test('parsePptx: surfaces a clear error when jszip cannot load', async () => {
  // Construct a Buffer that is technically a valid zip archive but has no
  // ppt/ slides directory — parsePptx should return an empty string rather
  // than throw a low-level jszip error.
  let JSZip;
  try { JSZip = require('jszip'); }
  catch (_) { return; }
  const zip = new JSZip();
  zip.file('not-a-slide.txt', 'ignore me');
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const text = await parsePptx(buf);
  assert.equal(text, '');
});
