const test = require('node:test');
const assert = require('node:assert/strict');
const { MODES } = require('../src/prompts');

test('assist mode gives a direct answer in first person', () => {
  const system = MODES.assist.buildSystem(null);
  const text = system + '\n' + MODES.assist.build({ transcript: [], userText: '' });
  // System prompt must instruct to answer in first person with no preamble
  assert.match(text, /first person/i);
  assert.match(text, /no preamble|preamble/i);
});

test('say mode produces a spoken answer not a question', () => {
  const system = MODES.say.buildSystem(null);
  const text = system + '\n' + MODES.say.build({ transcript: [], userText: '' });
  assert.match(text, /say out loud|in first person/i);
  // Must instruct to write actual spoken words (not meta-instructions)
  assert.match(text, /actual words|Write the|2.5 sentences/i);
});

test('say mode explicitly forbids echoing the interviewer question', () => {
  const system = MODES.say.buildSystem(null);
  assert.match(system, /never repeat|restate|echo/i);
});

test('notes mode produces structured meeting notes and uses AI rules', () => {
  const system = MODES.notes.buildSystem(null, RULES);
  assert.match(system, /meeting|notes/i);
  assert.match(system, /action items/i);
  assert.match(system, /--- USER RULES ---/);
});

test('leetcode mode ignores context block and returns coding prompt', () => {
  const system = MODES.leetcode.buildSystem('IGNORED_CONTEXT');
  assert.match(system, /competitive programmer|coding problem/i);
  assert.ok(!system.includes('IGNORED_CONTEXT'), 'leetcode should not include context block');
});

test('followup mode returns a bullet list', () => {
  const system = MODES.followup.buildSystem(null);
  assert.match(system, /bullet list|bullets/i);
});

test('all modes have a build function', () => {
  for (const [name, mode] of Object.entries(MODES)) {
    assert.equal(typeof mode.build, 'function', `${name}.build must be a function`);
    assert.equal(typeof mode.buildSystem, 'function', `${name}.buildSystem must be a function`);
  }
});

// ── AI rules ────────────────────────────────────────────────────────────────
const RULES = 'Never use em-dashes.\nReply in 2-3 short bullet points.\nUse a casual tone.';

test('every non-leetcode mode injects AI rules into its system prompt', () => {
  for (const [name, mode] of Object.entries(MODES)) {
    if (name === 'leetcode') continue;
    const withRules = mode.buildSystem(null, RULES);
    assert.match(withRules, /--- USER RULES ---/, `${name}.buildSystem should append USER RULES block`);
    assert.ok(withRules.includes(RULES), `${name}.buildSystem should include the user's rules verbatim`);
  }
});

test('every non-leetcode mode returns the base prompt unchanged when no rules are set', () => {
  for (const [name, mode] of Object.entries(MODES)) {
    if (name === 'leetcode') continue;
    const without = mode.buildSystem(null, '');
    const blank = mode.buildSystem(null, null);
    assert.ok(!without.includes('USER RULES'), `${name} should not include USER RULES when aiRules is empty`);
    assert.ok(!blank.includes('USER RULES'), `${name} should not include USER RULES when aiRules is null`);
  }
});

test('leetcode mode never applies AI rules (coding answers stay strict)', () => {
  const withRules = MODES.leetcode.buildSystem(null, RULES);
  assert.ok(!withRules.includes('USER RULES'), 'leetcode must not include USER RULES');
  assert.ok(!withRules.includes(RULES), 'leetcode must not leak user rules into the prompt');
  assert.match(withRules, /competitive programmer/);
});

// ── Latest question isolation & anti-repetition tests ───────────────────────
test('assist mode spotlights the latest interviewer question when multiple questions are present', () => {
  const turns = [
    { channel: 'them', text: 'Tell me about yourself.' },
    { channel: 'you', text: 'I am a full stack engineer.' },
    { channel: 'them', text: 'How do you optimize slow database queries?' }
  ];
  const built = MODES.assist.build({ transcript: turns, userText: '' });
  assert.ok(built.includes('🎯 LATEST INTERVIEWER QUESTION TO ANSWER:'));
  assert.ok(built.includes('How do you optimize slow database queries?'));
  assert.match(built, /Do NOT repeat answers to previous questions/i);
});

test('say mode targets the most recent interviewer turn and forbids repetition', () => {
  const turns = [
    { channel: 'them', text: 'What is your biggest weakness?' },
    { channel: 'you', text: 'I sometimes get into the weeds.' },
    { channel: 'them', text: 'How do you handle team conflict?' }
  ];
  const built = MODES.say.build({ transcript: turns, userText: '' });
  assert.ok(built.includes('🎯 LATEST INTERVIEWER QUESTION TO ANSWER:'));
  assert.ok(built.includes('How do you handle team conflict?'));
  assert.match(built, /Do NOT repeat answers/i);
});

test('ask mode falls back to latest interviewer turn when userText is empty', () => {
  const turns = [
    { channel: 'them', text: 'Explain the difference between TCP and UDP.' }
  ];
  const built = MODES.ask.build({ transcript: turns, userText: '' });
  assert.ok(built.includes('Explain the difference between TCP and UDP.'));
});

test('assist and say prioritize userText when custom query is provided', () => {
  const turns = [
    { channel: 'them', text: 'Tell me about your background.' }
  ];
  const assistBuilt = MODES.assist.build({ transcript: turns, userText: 'Focus on my Python microservices experience.' });
  assert.ok(assistBuilt.includes('🎯 TARGET QUESTION / TASK:'));
  assert.ok(assistBuilt.includes('Focus on my Python microservices experience.'));

  const sayBuilt = MODES.say.build({ transcript: turns, userText: 'Explain it simply without jargon.' });
  assert.ok(sayBuilt.includes('🎯 TARGET QUESTION / TASK:'));
  assert.ok(sayBuilt.includes('Explain it simply without jargon.'));
});