const fs = require('fs');
const path = require('path');

function loadEnvFile(rootDir) {
  const filePath = path.join(rootDir, '.env');
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function keyFromEnv(provider) {
  const names = {
    gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    deepgram: ['DEEPGRAM_API_KEY'],
    openai: ['OPENAI_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'],
    groq: ['GROQ_API_KEY'],
    minimax: ['MINIMAX_API_KEY'],
    azure: ['AZURE_OPENAI_API_KEY', 'AZURE_AI_FOUNDRY_API_KEY'],
  }[provider] || [];
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return '';
}

module.exports = { loadEnvFile, keyFromEnv };
