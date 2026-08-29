// Extracts plain text from a resume/job-description file (PDF or DOCX) so it can be
// dropped into the existing Settings textareas. No OCR — text layer only.
//
// Extended for the dashboard mode cards: also handles TXT, MD (plain-text passthrough)
// and PPTX (Open XML zip; parsed via the in-repo jszip, no native deps). DOC is a
// legacy binary format that has no clean pure-JS reader, so it's reported as unsupported
// with a clear message rather than silently mis-parsed.
const fs = require('fs');
const path = require('path');

const SUPPORTED_EXT = ['.pdf', '.docx', '.pptx', '.txt', '.md'];

function stripXmlText(xml) {
  // Pull visible text out of Open XML slide XML. <a:t>…</a:t> holds the run text.
  // Robust enough for slide parsing; not a general XML parser. Whitespace collapse.
  const matches = String(xml || '').match(/<a:t>([^<]*)<\/a:t>/g) || [];
  return matches
    .map((m) => m.replace(/^<a:t>|<\/a:t>$/g, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function parsePptx(buf) {
  let JSZip;
  try { JSZip = require('jszip'); }
  catch (err) { throw new Error('PPTX parsing needs the "jszip" package. Install it and retry.'); }
  const zip = await JSZip.loadAsync(buf);
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml$/i)[1], 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml$/i)[1], 10);
      return na - nb;
    });
  const slides = [];
  for (const name of slideFiles) {
    const xml = await zip.files[name].async('string');
    const text = stripXmlText(xml);
    if (text) slides.push(text);
  }
  return slides.join('\n\n').trim();
}

async function parseDocumentFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buf = fs.readFileSync(filePath);

  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const res = await pdfParse(buf);
    return (res.text || '').trim();
  }
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const res = await mammoth.extractRawText({ buffer: buf });
    return (res.value || '').trim();
  }
  if (ext === '.pptx') {
    return await parsePptx(buf);
  }
  if (ext === '.txt' || ext === '.md') {
    return String(buf.toString('utf8')).trim();
  }
  // DOC (legacy binary) is intentionally unsupported: the well-known pure-JS
  // readers are unreliable or commercial. Surface a clear message instead of
  // silently returning empty text or partial garbage.
  if (ext === '.doc') {
    throw new Error('Legacy .doc files are not supported. Save as .docx, .pdf, or .txt and try again.');
  }
  throw new Error('Unsupported file type: ' + (ext || '(none)') + '. Supported: ' + SUPPORTED_EXT.join(', ') + '.');
}

module.exports = { parseDocumentFile, parsePptx, stripXmlText, SUPPORTED_EXT };
