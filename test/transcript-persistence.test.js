const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  TRANSCRIPT_DIR_NAME,
  MEETINGS_FILE_NAME,
  transcriptFileName,
  renderTranscriptBody,
  renderFullTranscriptFile,
  formatDuration,
  listPastSessions,
  readSessionFile,
  deleteSessionFile,
  createTranscriptPersistence,
} = require('../src/transcript-persistence');

function tmpUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cue-transcripts-'));
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

test('transcriptFileName follows meeting_YYYY-MM-DD_HHMM (base, no extension)', () => {
  const fixed = new Date('2026-08-10T09:07:00Z');
  const expected = 'meeting_' + fixed.getFullYear() + '-' +
    String(fixed.getMonth() + 1).padStart(2, '0') + '-' +
    String(fixed.getDate()).padStart(2, '0') + '_' +
    String(fixed.getHours()).padStart(2, '0') +
    String(fixed.getMinutes()).padStart(2, '0');
  assert.equal(transcriptFileName(fixed), expected);
});

test('renderTranscriptBody labels speakers and joins with newlines', () => {
  const body = renderTranscriptBody([
    { channel: 'them', text: 'hello' },
    { channel: 'you',  text: 'hi there' },
    { channel: 'them', text: 'tell me about a time' },
  ]);
  assert.equal(body, 'Them: hello\nYou: hi there\nThem: tell me about a time');
});

test('renderFullTranscriptFile includes header, transcript block, and summary sections', () => {
  const meeting = {
    startedAt: Date.UTC(2026, 7, 10, 9, 0),
    endedAt:   Date.UTC(2026, 7, 10, 9, 30),
    mode: 'mock',
    channels: 'you,them',
    summary: 'Short conversation about a backend migration.',
    keyPoints: ['Use feature flags', 'Phased rollout'],
    actionItems: ['Send follow-up doc'],
    decisions: [],
    followUp: [],
  };
  const transcript = [
    { channel: 'them', text: 'Tell me about a time you led a migration.' },
    { channel: 'you',  text: 'I led the React 18 migration at my last job.' },
  ];
  const out = renderFullTranscriptFile(meeting, transcript);

  assert.match(out, /^Mode:\s+mock/m);
  assert.match(out, /^TRANSCRIPT\s*$/m);
  assert.match(out, /^SUMMARY\s*$/m);
  assert.match(out, /Key Points:/);
  assert.match(out, /- Use feature flags/);
  assert.match(out, /- Send follow-up doc/);
  assert.ok(out.includes('Them: Tell me about a time you led a migration.'));
  assert.ok(out.includes('You: I led the React 18 migration at my last job.'));
});

test('formatDuration covers hours, minutes, seconds', () => {
  assert.equal(formatDuration(0, 1000), '1s');
  assert.equal(formatDuration(0, 65 * 1000), '1m 5s');
  assert.equal(formatDuration(0, (3 * 3600 + 5 * 60 + 9) * 1000), '3h 5m 9s');
});

test('createTranscriptPersistence lays down transcripts/ + meetings.json on start', () => {
  const ud = tmpUserData();
  try {
    const p = createTranscriptPersistence(ud);
    assert.ok(fs.existsSync(path.join(ud, TRANSCRIPT_DIR_NAME)));
    assert.ok(fs.existsSync(p.transcriptsDir));
    assert.equal(p.meetingsFile, path.join(ud, MEETINGS_FILE_NAME));
  } finally { cleanup(ud); }
});

test('startMeeting writes a new entry to meetings.json and returns it', () => {
  const ud = tmpUserData();
  try {
    const p = createTranscriptPersistence(ud);
    const m = p.startMeeting({ mode: 'mock' });
    assert.ok(m && m.id);
    assert.equal(m.mode, 'mock');
    assert.ok(m.startedAt > 0);
    assert.deepEqual(p.meetingStore.list().length, 1);
  } finally { cleanup(ud); }
});

test('endMeeting without an LLM still writes the .txt transcript when saveTranscripts is true', async () => {
  const ud = tmpUserData();
  try {
    const p = createTranscriptPersistence(ud);
    const m = p.startMeeting({ mode: 'mock' });
    const fullTranscript = [
      { channel: 'them', text: 'Hello.', ts: Date.now() },
      { channel: 'you',  text: 'Hi.',     ts: Date.now() + 1 },
    ];
    // endMeeting is async (it awaits the optional generateSummary LLM call),
    // so callers must await it — without await, out.transcriptPath is undefined
    // on a Promise and the assertions below would silently pass on undefined.
    const out = await p.endMeeting({
      meetingId: m.id,
      mode: 'mock',
      fullTranscript,
      saveTranscripts: true,
    });
    assert.ok(out.transcriptPath, 'expected a transcript path');
    assert.ok(fs.existsSync(out.transcriptPath));
    const onDisk = fs.readFileSync(out.transcriptPath, 'utf8');
    assert.ok(onDisk.includes('Them: Hello.'));
    assert.ok(onDisk.includes('You: Hi.'));
  } finally { cleanup(ud); }
});

test('endMeeting with saveTranscripts:false persists the meeting JSON but skips the .txt export', async () => {
  const ud = tmpUserData();
  try {
    const p = createTranscriptPersistence(ud);
    const m = p.startMeeting({ mode: 'mock' });
    const out = await p.endMeeting({
      meetingId: m.id,
      mode: 'mock',
      fullTranscript: [{ channel: 'them', text: 'x', ts: 0 }],
      saveTranscripts: false,
    });
    assert.equal(out.transcriptPath, null);
    const meetingsOnDisk = JSON.parse(fs.readFileSync(p.meetingsFile, 'utf8'));
    assert.equal(meetingsOnDisk.length, 1);
    assert.equal(meetingsOnDisk[0].id, m.id);
  } finally { cleanup(ud); }
});

test('endMeeting integrates the LLM summary via buildNotesPrompt/parseNotes round-trip', async () => {
  const ud = tmpUserData();
  try {
    const p = createTranscriptPersistence(ud);
    const m = p.startMeeting({ mode: 'mock' });
    const notes = require('../src/notes');
    const out = await p.endMeeting({
      meetingId: m.id,
      mode: 'mock',
      fullTranscript: [
        { channel: 'them', text: 'tell me about a migration' },
        { channel: 'you',  text: 'phased rollout with feature flags' },
      ],
      modeContext: ['behavioral-questions.pdf'],
      saveTranscripts: true,
      buildSummaryPrompt: ({ transcript, modeContext }) => ({
        system: 'You write meeting notes.',
        turns: [{ role: 'user', text: notes.buildNotesPrompt(transcript) + '\nContext files: ' + modeContext.join(', ') }],
      }),
      // Async stub mirrors the real runEndOfSessionSummary (an async LLM stream).
      // Waiting on this is what the [object Promise] regression exercised.
      generateSummary: async () => (
        'Meeting Summary:\n' +
        'Phased rollout for the React 18 migration using feature flags.\n\n' +
        'Key Points:\n- Used feature flags\n- Phased rollout\n\n' +
        'Action Items:\n- Send follow-up doc'
      ),
    });
    assert.ok(out.summaryText.includes('Phased rollout'));
    const persisted = p.meetingStore.get(m.id);
    assert.equal(persisted.summary, 'Phased rollout for the React 18 migration using feature flags.');
    assert.deepEqual(persisted.keyPoints, ['Used feature flags', 'Phased rollout']);
    assert.deepEqual(persisted.actionItems, ['Send follow-up doc']);
    assert.equal(persisted.context, 'behavioral-questions.pdf');
    // And the .txt must include the rendered summary, not just the raw transcript.
    const onDisk = fs.readFileSync(out.transcriptPath, 'utf8');
    assert.ok(onDisk.includes('SUMMARY'));
    assert.ok(onDisk.includes('Key Points:'));
  } finally { cleanup(ud); }
});

test('endMeeting throws on unknown meetingId', async () => {
  const ud = tmpUserData();
  try {
    const p = createTranscriptPersistence(ud);
    // endMeeting is async — a sync throw from inside it surfaces as a rejected
    // Promise, not as a sync exception, so assert.rejects is the right checker.
    await assert.rejects(
      () => p.endMeeting({ meetingId: 'not-real', mode: 'mock', fullTranscript: [] }),
      /unknown meeting id/
    );
  } finally { cleanup(ud); }
});

test('listPastSessions returns sessions newest-first, skipping unrelated files', async () => {
  const ud = tmpUserData();
  try {
    const p = createTranscriptPersistence(ud);
    const m1 = p.startMeeting({ mode: 'mock' });
    const m2 = p.startMeeting({ mode: 'coffee' });
    await p.endMeeting({ meetingId: m1.id, mode: 'mock', fullTranscript: [{ channel: 'them', text: 'a', ts: 0 }], saveTranscripts: true });
    // Force a different timestamp on the second file by advancing the clock by 1 min
    const second = await p.endMeeting({
      meetingId: m2.id,
      mode: 'coffee',
      fullTranscript: [{ channel: 'them', text: 'b', ts: 0 }],
      saveTranscripts: true,
    });
    // Drop an unrelated file in there — must be ignored
    fs.writeFileSync(path.join(p.transcriptsDir, 'random-notes.txt'), 'ignore me');

    const sessions = p.listPastSessions();
    assert.equal(sessions.length, 2);
    // Newest-first ordering
    assert.ok(sessions[0].startedAt >= sessions[1].startedAt);
    // File names may end in `.txt` or `-N.txt` (collision); both are valid.
    assert.match(sessions[0].fileName, /^meeting_\d{4}-\d{2}-\d{2}_\d{4}(?:-\d+)?\.txt$/);
    assert.ok(!sessions.some((s) => s.fileName === 'random-notes.txt'));
    assert.ok(sessions.some((s) => s.path === second.transcriptPath));
  } finally { cleanup(ud); }
});

test('listPastSessions: two meetings ending in the same minute do not overwrite (collision suffix)', async () => {
  const ud = tmpUserData();
  try {
    const p = createTranscriptPersistence(ud);
    const m1 = p.startMeeting({ mode: 'mock' });
    const m2 = p.startMeeting({ mode: 'coffee' });
    // Both end in the same logical minute — must NOT collide
    const out1 = await p.endMeeting({ meetingId: m1.id, mode: 'mock',        fullTranscript: [{ channel: 'them', text: 'one', ts: 0 }], saveTranscripts: true });
    const out2 = await p.endMeeting({ meetingId: m2.id, mode: 'coffee',     fullTranscript: [{ channel: 'them', text: 'two', ts: 0 }], saveTranscripts: true });
    assert.notEqual(out1.transcriptPath, out2.transcriptPath);
    assert.ok(fs.existsSync(out1.transcriptPath));
    assert.ok(fs.existsSync(out2.transcriptPath));
    assert.equal(p.listPastSessions().length, 2);
  } finally { cleanup(ud); }
});

test('readSessionFile splits the rendered file into transcript + summary blocks', async () => {
  const ud = tmpUserData();
  try {
    const p = createTranscriptPersistence(ud);
    const m = p.startMeeting({ mode: 'mock' });
    const out = await p.endMeeting({
      meetingId: m.id,
      mode: 'mock',
      fullTranscript: [{ channel: 'them', text: 'Hello.' }],
      saveTranscripts: true,
      buildSummaryPrompt: () => ({ system: '', turns: [{ role: 'user', text: '' }] }),
      generateSummary: async () => 'Meeting Summary:\nA short meeting.',
    });
    const parsed = readSessionFile(out.transcriptPath);
    assert.ok(parsed.transcriptBlock.includes('Them: Hello.'));
    assert.ok(parsed.summaryBlock.includes('SUMMARY'));
    assert.ok(parsed.summaryBlock.includes('A short meeting.'));
  } finally { cleanup(ud); }
});

test('deleteSession removes the .txt file and the JSON record', async () => {
  const ud = tmpUserData();
  try {
    const p = createTranscriptPersistence(ud);
    const m = p.startMeeting({ mode: 'mock' });
    const out = await p.endMeeting({
      meetingId: m.id,
      mode: 'mock',
      fullTranscript: [{ channel: 'them', text: 'x', ts: 0 }],
      saveTranscripts: true,
    });
    assert.ok(fs.existsSync(out.transcriptPath));
    assert.equal(p.meetingStore.list().length, 1);
    const ok = p.deleteSession(out.transcriptPath);
    assert.equal(ok, true);
    assert.ok(!fs.existsSync(out.transcriptPath));
    assert.equal(p.meetingStore.list().length, 0);
  } finally { cleanup(ud); }
});

test('endMeeting awaits an async generateSummary (no [object Promise] serialisation)', async () => {
  const ud = tmpUserData();
  try {
    const p = createTranscriptPersistence(ud);
    const m = p.startMeeting({ mode: 'mock' });
    const out = await p.endMeeting({
      meetingId: m.id,
      mode: 'mock',
      fullTranscript: [{ channel: 'them', text: 'hi', ts: 0 }],
      saveTranscripts: true,
      buildSummaryPrompt: () => ({ system: '', turns: [{ role: 'user', text: 'x' }] }),
      // Async — the pre-fix code returned a Promise here and String(promise)
      // became "[object Promise]" which then landed in meetings.json.summary.
      generateSummary: async () => 'Meeting Summary:\nResolved text body.',
    });
    // Must be the awaited string, never the literal "[object Promise]".
    assert.equal(out.summaryText, 'Meeting Summary:\nResolved text body.');
    assert.doesNotMatch(out.summaryText, /\[object Promise\]/);
    const persisted = p.meetingStore.get(m.id);
    assert.equal(persisted.summary, 'Resolved text body.');
    assert.doesNotMatch(persisted.summary, /\[object Promise\]/);
    const onDisk = fs.readFileSync(out.transcriptPath, 'utf8');
    assert.ok(onDisk.includes('Resolved text body.'));
    assert.ok(!onDisk.includes('[object Promise]'));
  } finally { cleanup(ud); }
});

test('deleteSessionFile returns false on a missing path (no throw)', () => {
  assert.equal(deleteSessionFile('/nope/does/not/exist.txt'), false);
});
