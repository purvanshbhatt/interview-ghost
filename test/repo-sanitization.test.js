/**
 * Automated Repository Sanitization & Open-Source Cleanliness Test Suite
 *
 * Scans the repository for:
 * 1. Hardcoded live API keys, tokens, and private keys
 * 2. Personal candidate names and PII in test fixtures
 * 3. Hardcoded Windows/Linux absolute machine paths
 * 4. Banned shortcut/binary files (*.lnk)
 * 5. .gitignore completeness (ignoring dist-test/, copilot_env/, .ai-memory/, *.lnk, local.properties)
 * 6. .env.example template coverage across all 8 LLM providers and STT engines
 * 7. README.md open-source documentation completeness and Ghost branding
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Directories and files to exclude from recursive scanning
const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  '.agents',
  'dist',
  'dist-test',
  'copilot_env',
  '.venv',
  'venv',
  '.ai-memory',
  '.cache',
  'out',
  '.gradle',
  'build',
  'Pods',
]);

const EXCLUDED_SCAN_FILES = new Set([
  path.join(PROJECT_ROOT, 'test', 'repo-sanitization.test.js'),
  path.join(PROJECT_ROOT, 'test', 'e2e', 'harness.js'),
  path.join(PROJECT_ROOT, 'test', 'e2e', 'tier1_features.test.js'),
  path.join(PROJECT_ROOT, 'test', 'e2e', 'tier2_boundaries.test.js'),
  path.join(PROJECT_ROOT, 'test', 'e2e', 'tier3_combinations.test.js'),
  path.join(PROJECT_ROOT, 'test', 'e2e', 'tier4_invariants.test.js'),
  path.join(PROJECT_ROOT, 'test', 'e2e', 'tier5_adversarial.test.js'),
]);

// Live secret detection regexes
const LIVE_SECRET_PATTERNS = [
  { name: 'Live Google API Key', regex: /AIzaSy[A-Za-z0-9_-]{33}/ },
  { name: 'Live OpenAI API Key', regex: /sk-proj-[A-Za-z0-9_-]{40,}/ },
  { name: 'GitHub Personal Token', regex: /ghp_[A-Za-z0-9]{36}/ },
  { name: 'Private Key Block', regex: /-----BEGIN (?:RSA|OPENSSH) PRIVATE KEY-----/ },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
];

// Absolute machine paths
const MACHINE_PATH_PATTERNS = [
  { name: 'P: Drive Project Path', regex: /[A-Z]:\\projects\\interview-helper\\cue/i },
  { name: 'Local Purvansh Android SDK Path', regex: /\/home\/purvansh\/Android\/Sdk/i },
];

// Personal PII patterns
const PII_PATTERNS = [
  { name: 'Personal Candidate Name', regex: /Mann\s+Bellani/i },
];

function getAllFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else if (entry.isFile()) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

test('Repository Sanitization Test Suite', async (t) => {
  const allRepoFiles = getAllFiles(PROJECT_ROOT);

  await t.test('1. Zero live secret keys across all repository files', () => {
    const violations = [];

    for (const filePath of allRepoFiles) {
      if (EXCLUDED_SCAN_FILES.has(filePath)) continue;
      // Skip binary files
      if (/\.(png|jpg|jpeg|gif|ico|exe|zip|tar|gz|bin)$/i.test(filePath)) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      for (const pattern of LIVE_SECRET_PATTERNS) {
        if (pattern.regex.test(content)) {
          violations.push({
            file: path.relative(PROJECT_ROOT, filePath),
            pattern: pattern.name,
          });
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Found leaked live secrets in repository files: ${JSON.stringify(violations, null, 2)}`
    );
  });

  await t.test('2. Zero personal names or candidate PII across repository files', () => {
    const violations = [];

    for (const filePath of allRepoFiles) {
      if (EXCLUDED_SCAN_FILES.has(filePath)) continue;
      if (/\.(png|jpg|jpeg|gif|ico|exe|zip|tar|gz|bin)$/i.test(filePath)) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      for (const pattern of PII_PATTERNS) {
        if (pattern.regex.test(content)) {
          violations.push({
            file: path.relative(PROJECT_ROOT, filePath),
            pattern: pattern.name,
          });
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Found leaked personal PII in repository files: ${JSON.stringify(violations, null, 2)}`
    );
  });

  await t.test('3. Zero hardcoded local machine paths in documentation and configuration files', () => {
    const targetDocsAndConfigs = [
      'README.md',
      'README_WINDOWS.md',
      'PROJECT.md',
      'mobile/README.md',
      'mobile/android/local.properties',
      'package.json',
      '.env.example',
    ];

    const violations = [];

    for (const relPath of targetDocsAndConfigs) {
      const fullPath = path.join(PROJECT_ROOT, relPath);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of MACHINE_PATH_PATTERNS) {
        if (pattern.regex.test(content)) {
          violations.push({
            file: relPath,
            pattern: pattern.name,
          });
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Found hardcoded machine paths in docs/config: ${JSON.stringify(violations, null, 2)}`
    );
  });

  await t.test('4. No banned Windows shortcut (*.lnk) files exist in repository', () => {
    const bannedFiles = allRepoFiles.filter((f) => f.endsWith('.lnk'));
    assert.deepEqual(
      bannedFiles,
      [],
      `Found banned shortcut files: ${bannedFiles.map((f) => path.relative(PROJECT_ROOT, f)).join(', ')}`
    );
    assert.equal(fs.existsSync(path.join(PROJECT_ROOT, 'interview-helper.lnk')), false);
  });

  await t.test('5. .gitignore properly excludes build dists, python environments, memory, and local properties', () => {
    const gitignorePath = path.join(PROJECT_ROOT, '.gitignore');
    assert.ok(fs.existsSync(gitignorePath), '.gitignore must exist at repository root');
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');

    const requiredPatterns = [
      'node_modules/',
      'dist-test/',
      'copilot_env/',
      '.ai-memory/',
      '*.lnk',
      'local.properties',
      'ghost-data.json',
      'cue-data.json',
      '!.env.example',
    ];

    for (const req of requiredPatterns) {
      assert.ok(
        gitignoreContent.includes(req),
        `.gitignore must contain rule: ${req}`
      );
    }
  });

  await t.test('6. .env.example comprehensively defines all 8 LLM providers, STT, and toggles without real secrets', () => {
    const envExamplePath = path.join(PROJECT_ROOT, '.env.example');
    assert.ok(fs.existsSync(envExamplePath), '.env.example must exist at repository root');
    const envContent = fs.readFileSync(envExamplePath, 'utf8');

    // Verify all 8 providers are present
    const expectedProviders = [
      'GEMINI_API_KEY',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'GROQ_API_KEY',
      'MINIMAX_API_KEY',
      'AZURE_OPENAI_API_KEY',
      'AZURE_OPENAI_ENDPOINT',
      'OLLAMA_BASE_URL',
      'CUSTOM_LLM_BASE_URL',
    ];

    for (const key of expectedProviders) {
      assert.ok(envContent.includes(key), `.env.example must define ${key}`);
    }

    // Verify STT services
    assert.ok(envContent.includes('DEEPGRAM_API_KEY'), '.env.example must define DEEPGRAM_API_KEY');
    assert.ok(envContent.includes('WHISPER_URL') || envContent.includes('LOCAL_WHISPER_ENABLED'), '.env.example must define Whisper settings');

    // Verify environment toggles
    assert.ok(envContent.includes('ENABLE_STEALTH_MODE'), '.env.example must define ENABLE_STEALTH_MODE');
    assert.ok(envContent.includes('DEFAULT_PROVIDER'), '.env.example must define DEFAULT_PROVIDER');

    // Verify no real keys are included
    for (const pattern of LIVE_SECRET_PATTERNS) {
      assert.equal(
        pattern.regex.test(envContent),
        false,
        `.env.example must not contain live secret matching ${pattern.name}`
      );
    }
  });

  await t.test('7. README.md contains complete open-source Ghost documentation across all 3 platforms', () => {
    const readmePath = path.join(PROJECT_ROOT, 'README.md');
    assert.ok(fs.existsSync(readmePath), 'README.md must exist at repository root');
    const readmeContent = fs.readFileSync(readmePath, 'utf8');

    // Branding & Title
    assert.match(readmeContent, /#.*Ghost/i);
    assert.match(readmeContent, /Stealth AI/i);

    // Multi-surface coverage
    assert.match(readmeContent, /Desktop/i);
    assert.match(readmeContent, /Chrome/i);
    assert.match(readmeContent, /Manifest V3|MV3/i);
    assert.match(readmeContent, /Mobile/i);
    assert.match(readmeContent, /iOS/i);
    assert.match(readmeContent, /Android/i);

    // Stealth protection
    assert.match(readmeContent, /setContentProtection/);
    assert.match(readmeContent, /WDA_EXCLUDEFROMCAPTURE|Zoom/);

    // LLM Provider & STT Matrix
    assert.match(readmeContent, /Gemini/i);
    assert.match(readmeContent, /OpenAI/i);
    assert.match(readmeContent, /Anthropic/i);
    assert.match(readmeContent, /Groq/i);
    assert.match(readmeContent, /whisper\.cpp/i);

    // Security & License
    assert.match(readmeContent, /Privacy|Security/i);
    assert.match(readmeContent, /GPL-3\.0/i);
  });

  await t.test('8. test/applink.test.js uses sanitized synthetic fixtures', () => {
    const applinkTestPath = path.join(PROJECT_ROOT, 'test', 'applink.test.js');
    assert.ok(fs.existsSync(applinkTestPath));
    const content = fs.readFileSync(applinkTestPath, 'utf8');

    assert.equal(/Mann\s+Bellani/i.test(content), false, 'Personal name must not be in test/applink.test.js');
    assert.equal(/sk-proj-realkey/i.test(content), false, 'Real-looking OpenAI key must not be in test/applink.test.js');
    assert.equal(/AIzaSyRealKey/i.test(content), false, 'Real-looking Gemini key must not be in test/applink.test.js');
  });
});
