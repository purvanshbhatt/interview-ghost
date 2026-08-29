const test = require('node:test');
const assert = require('node:assert/strict');
const { buildResumeContext, parseResume } = require('../src/resume-context');
const { buildInterviewContext, detectCategory } = require('../src/interview-context');

// ── buildResumeContext (backward-compat shim) ─────────────────────────────────
test('buildResumeContext returns a structured prompt block for resume text', () => {
  const resume = 'Jane Doe\nSoftware Engineer\n\nSkills\nJavaScript, Node.js\n\nExperience\n3 years at Acme Corp';
  const result = buildResumeContext(resume, '', 'say');
  assert.ok(result !== null, 'should not be null');
  assert.match(result, /Your Background/i);
  assert.match(result, /Jane Doe/);
  assert.match(result, /JavaScript/);
});

test('buildResumeContext returns null for empty input', () => {
  assert.equal(buildResumeContext('', '', 'say'), null);
  assert.equal(buildResumeContext(null, '', 'say'), null);
});

test('buildResumeContext still works with legacy (text, limit) signature', () => {
  const resume = 'Jane Doe\nSoftware Engineer\nSkills: JavaScript, Node.js';
  const result = buildResumeContext(resume, 200);
  assert.ok(result !== null);
  assert.match(result, /Jane Doe/);
});

// ── parseResume ───────────────────────────────────────────────────────────────
test('parseResume detects structured sections', () => {
  const resume = 'Jane Doe\n\nSummary\nExperienced engineer.\n\nSkills\nJavaScript, Node.js\n\nExperience\nAcme Corp 2020-2023';
  const parsed = parseResume(resume);
  assert.ok(parsed.parsed, 'should detect structured resume');
  assert.ok(parsed.sections.name, 'should extract name');
  assert.ok(parsed.sections.skills, 'should extract skills');
});

// ── detectCategory ────────────────────────────────────────────────────────────
test('detectCategory: behavioral questions', () => {
  assert.equal(detectCategory([{ channel: 'them', text: 'Tell me about a time you failed.' }]), 'behavioral');
  assert.equal(detectCategory([{ channel: 'them', text: 'Give me an example of when you led a team.' }]), 'behavioral');
});

test('detectCategory: motivation questions', () => {
  assert.equal(detectCategory([{ channel: 'them', text: 'Why do you want to work here?' }]), 'motivation');
  assert.equal(detectCategory([{ channel: 'them', text: 'Why should we hire you?' }]), 'motivation');
  assert.equal(detectCategory([{ channel: 'them', text: 'Why are you looking for a new opportunity?' }]), 'motivation');
});

test('detectCategory: experience questions', () => {
  assert.equal(detectCategory([{ channel: 'them', text: 'Walk me through your role at PayCo.' }]), 'experience');
  assert.equal(detectCategory([{ channel: 'them', text: 'Tell me about yourself.' }]), 'experience');
  assert.equal(detectCategory([{ channel: 'them', text: 'Tell me about your current role.' }]), 'experience');
});

test('detectCategory: compensation questions', () => {
  assert.equal(detectCategory([{ channel: 'them', text: 'What are your salary expectations?' }]), 'compensation');
  assert.equal(detectCategory([{ channel: 'them', text: 'Do you have any questions for me?' }]), 'compensation');
});

test('detectCategory: technical questions', () => {
  assert.equal(detectCategory([{ channel: 'them', text: 'How would you design a distributed cache?' }]), 'technical');
  assert.equal(detectCategory([{ channel: 'them', text: 'What is the difference between SQL and NoSQL?' }]), 'technical');
});

test('detectCategory: returns general for empty transcript', () => {
  assert.equal(detectCategory([]), 'general');
  assert.equal(detectCategory(null), 'general');
});

test('detectCategory: only checks "them" channel, not "you" channel', () => {
  // "You" channel saying a behavioral phrase should NOT trigger behavioral detection
  const result = detectCategory([{ channel: 'you', text: 'Tell me about a time you failed.' }]);
  assert.equal(result, 'general');
});

// ── buildInterviewContext ─────────────────────────────────────────────────────
const fullSettings = {
  resumeText: 'Jane Doe\nEngineer\n\nSkills\nPython, Go\n\nExperience\nPayCo 2021-2024, built payment pipeline',
  jobDescription: 'Senior Backend Engineer, Python, distributed systems',
  starStories: 'At PayCo, Black Friday outage. I fixed Redis exhaustion in 12 min. Incidents dropped 80%.',
  whyCompany: 'Love the engineering culture here.',
  whyLeaving: 'Ready for a bigger challenge.',
  workStyle: 'Autonomous, data-driven, direct feedback.',
  salaryTarget: '$170k-$200k',
  questionsToAsk: '1. What does success look like in 90 days?'
};

test('buildInterviewContext: behavioral injects STAR stories', () => {
  const ctx = buildInterviewContext(fullSettings, 'say',
    [{ channel: 'them', text: 'Tell me about a time you faced a major outage.' }]);
  assert.ok(ctx !== null);
  assert.ok(ctx.includes('STAR'), 'should include STAR stories');
  assert.ok(ctx.includes('PayCo'), 'should include resume');
});

test('buildInterviewContext: motivation injects why company / why leaving', () => {
  const ctx = buildInterviewContext(fullSettings, 'say',
    [{ channel: 'them', text: 'Why do you want to work here?' }]);
  assert.ok(ctx !== null);
  assert.ok(ctx.includes('Why This Company'), 'should include why company');
  assert.ok(ctx.includes('Why Leaving'), 'should include why leaving');
});

test('buildInterviewContext: compensation injects salary and questions', () => {
  const ctx = buildInterviewContext(fullSettings, 'say',
    [{ channel: 'them', text: 'What are your salary expectations?' }]);
  assert.ok(ctx !== null);
  assert.ok(ctx.includes('170k'), 'should include salary target');
  assert.ok(ctx.includes('success look like'), 'should include questions to ask');
});

test('buildInterviewContext: leetcode returns null', () => {
  assert.equal(buildInterviewContext(fullSettings, 'leetcode', []), null);
});

test('buildInterviewContext: returns null with no settings data', () => {
  const empty = { resumeText: '', jobDescription: '', starStories: '', whyCompany: '', whyLeaving: '', workStyle: '', salaryTarget: '', questionsToAsk: '' };
  assert.equal(buildInterviewContext(empty, 'say', [{ channel: 'them', text: 'Tell me about yourself.' }]), null);
});

test('buildInterviewContext: JD tailor note included when JD is set', () => {
  const ctx = buildInterviewContext(fullSettings, 'say', []);
  assert.ok(ctx !== null);
  assert.ok(ctx.includes('Tailor'), 'should include tailor note when JD is set');
});
