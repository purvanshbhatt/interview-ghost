const WORD_RE = /[a-z0-9+#.]+/gi;

function tokenize(text) {
  return new Set(String(text || '').toLowerCase().match(WORD_RE) || []);
}

function chunkText(source, text, maxWords = 120, overlapWords = 24) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const chunks = [];
  const step = Math.max(1, maxWords - overlapWords);
  for (let start = 0; start < words.length; start += step) {
    const chunk = words.slice(start, start + maxWords).join(' ').trim();
    if (chunk) chunks.push({ source, text: chunk });
  }
  return chunks;
}

function buildLocalCorpus(settings) {
  return [
    ...chunkText('resume', settings.resumeText || ''),
    ...chunkText('job_description', settings.jobDescription || ''),
    ...chunkText('star_stories', settings.starStories || ''),
    ...chunkText('work_style', settings.workStyle || ''),
    ...chunkText('questions_to_ask', settings.questionsToAsk || ''),
  ];
}

function scoreChunk(queryTerms, chunk) {
  const terms = tokenize(chunk.text);
  if (!queryTerms.size || !terms.size) return 0;
  let overlap = 0;
  for (const term of queryTerms) {
    if (terms.has(term)) overlap++;
  }
  return overlap / Math.sqrt(terms.size);
}

function searchLocalContext(settings, query, limit = 5) {
  const queryTerms = tokenize(query);
  return buildLocalCorpus(settings)
    .map((chunk) => ({ ...chunk, score: scoreChunk(queryTerms, chunk) }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function buildRagBlock(settings, query, limit = 5) {
  const matches = searchLocalContext(settings, query, limit);
  if (!matches.length) return '';
  const lines = matches.map((match, index) => (
    `[${index + 1}] ${match.source} score=${match.score.toFixed(3)}\n${match.text}`
  ));
  return '=== Local Context Matches ===\n' + lines.join('\n\n');
}

module.exports = { buildRagBlock, buildLocalCorpus, searchLocalContext };
