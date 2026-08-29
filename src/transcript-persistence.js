// End-of-session transcript persistence.
//
// Composes the existing meetings.js JSON store with a plain-text exporter so
// every finished session leaves two artifacts on disk under <userData>:
//
//   <userData>/transcripts/meeting_YYYY-MM-DD_HHMM.txt
//       Human-readable transcript + final summary in the format the dashboard
//       "Past Sessions" tab reads back.
//
//   <userData>/meetings.json
//       Structured meeting history (meetings.js) used for memory injection and
//       structured search. Already persisted; we just add hooks.
//
// The full-transcript log is held in-process in main.js (uncapped, unpruned)
// and passed in here only when the user clicks End Session — so the live
// rolling-window behavior in main.js is not affected.
//
// saveTranscripts setting (default true) opts out of writing the .txt file
// entirely. The JSON meeting record is always created; it's the same shape
// meetings.js has always produced and it's how memory injection reads history.

const fs = require('fs');
const path = require('path');
const { createMeetingStore } = require('./meetings');

const TRANSCRIPT_DIR_NAME = 'transcripts';
const MEETINGS_FILE_NAME = 'meetings.json';

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function transcriptFileName(date) {
  const d = date || new Date();
  return 'meeting_' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
    + '_' + pad2(d.getHours()) + pad2(d.getMinutes());
}

// Pick a free filename inside `dir` based on `baseName` (without extension).
// Appends `-2`, `-3`, ... until an unused path is found. Avoids overwriting
// when two sessions end in the same minute.
function pickFreeTranscriptPath(dir, baseName) {
  for (let attempt = 1; attempt < 1000; attempt++) {
    const suffix = attempt === 1 ? '' : '-' + attempt;
    const candidate = path.join(dir, baseName + suffix + '.txt');
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Could not find a free transcript filename after 1000 attempts.');
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

// Render a transcript array [{channel, text, ts}] into readable plain text.
// Channels labelled "Them" / "You" to match the in-app labelling.
function renderTranscriptBody(transcript) {
  return (transcript || []).map((turn) => {
    const speaker = turn.channel === 'them' ? 'Them' : 'You';
    return speaker + ': ' + String(turn.text || '').trim();
  }).filter(Boolean).join('\n');
}

function renderSummaryBlock(meeting) {
  const lines = [];
  lines.push('---');
  lines.push('SUMMARY');
  if (meeting.summary) {
    lines.push(meeting.summary);
  } else {
    lines.push('(no summary generated)');
  }
  const sections = [
    ['Key Points', meeting.keyPoints],
    ['Questions Asked', meeting.questionsAsked],
    ['Action Items', meeting.actionItems],
    ['Decisions', meeting.decisions],
  ];
  for (const [label, items] of sections) {
    if (!items || !items.length) continue;
    lines.push('');
    lines.push(label + ':');
    for (const item of items) lines.push('- ' + item);
  }
  if (meeting.followUp) {
    if (Array.isArray(meeting.followUp)) {
      lines.push('');
      lines.push('Follow-Up:');
      for (const f of meeting.followUp) lines.push('- ' + f);
    } else {
      lines.push('');
      lines.push('Follow-Up:');
      lines.push(meeting.followUp);
    }
  }
  return lines.join('\n');
}

function renderFullTranscriptFile(meeting, transcript) {
  const started = new Date(meeting.startedAt || Date.now());
  const ended = new Date(meeting.endedAt || Date.now());
  const header = [
    'Mode:        ' + (meeting.mode || 'unspecified'),
    'Started:     ' + started.toISOString(),
    'Ended:       ' + ended.toISOString(),
    'Duration:    ' + formatDuration(meeting.startedAt, meeting.endedAt),
    'Channels:    ' + (meeting.channels || 'you,them'),
    'MeetingId:   ' + (meeting.id || '(no id)'),
    'Source:      cue end-of-session export',
  ].join('\n');

  return header + '\n\n'
    + 'TRANSCRIPT\n'
    + renderTranscriptBody(transcript)
    + '\n\n'
    + renderSummaryBlock(meeting)
    + '\n';
}

function formatDuration(start, end) {
  // Use nullish-ish check so an honest start=0 / end=0 is treated as a real
  // timestamp, not "unset". Falling back to Date.now() only when the caller
  // passed undefined / null.
  const s = (typeof start === 'number') ? start : Date.now();
  const e = (typeof end === 'number') ? end : Date.now();
  const ms = Math.max(0, e - s);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  if (h > 0) return h + 'h ' + m + 'm ' + sec + 's';
  if (m > 0) return m + 'm ' + sec + 's';
  return sec + 's';
}

// listPastSessions() returns lightweight metadata for the Past Sessions tab
// to render without loading the full body of each file. Sorted newest-first.
function listPastSessions(transcriptsDir) {
  if (!fs.existsSync(transcriptsDir)) return [];
  const entries = fs.readdirSync(transcriptsDir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!/^meeting_\d{4}-\d{2}-\d{2}_\d{4}(?:-\d+)?\.txt$/.test(e.name)) continue;
    const full = path.join(transcriptsDir, e.name);
    const stat = fs.statSync(full);
    out.push({
      fileName: e.name,
      path: full,
      sizeBytes: stat.size,
      startedAt: parseStartFromFileName(e.name) || stat.mtimeMs,
      mtimeMs: stat.mtimeMs,
    });
  }
  out.sort((a, b) => b.startedAt - a.startedAt);
  return out;
}

function parseStartFromFileName(name) {
  const stripped = name.replace(/(?:-\d+)?\.txt$/, '');
  const m = /^meeting_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})$/.exec(stripped);
  if (!m) return null;
  const ts = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Number.isFinite(ts) ? ts : null;
}

function readSessionFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  // Split the rendered file at the "TRANSCRIPT" marker and the "---" divider
  // before the SUMMARY block. Tolerates older files that may not have the
  // markers — returns the whole file as the transcriptBlock and an empty
  // summaryBlock in that case.
  const transcriptSplit = raw.split(/^TRANSCRIPT\s*$/m);
  const tail = transcriptSplit.length > 1 ? transcriptSplit[1] : raw;
  const summaryIdx = tail.indexOf('\n---\nSUMMARY');
  const transcriptBlock = summaryIdx >= 0 ? tail.slice(0, summaryIdx) : tail;
  const summaryBlock = summaryIdx >= 0 ? tail.slice(summaryIdx) : '';

  // Recover `MeetingId:` from the header so callers can link back to the
  // structured record in meetings.json. Older files without it return null.
  const idMatch = /^MeetingId:\s*(\S+)\s*$/m.exec(raw);
  const meetingId = idMatch ? idMatch[1] : null;

  return { raw, transcriptBlock, summaryBlock, meetingId };
}

function deleteSessionFile(filePath) {
  try { fs.unlinkSync(filePath); return true; }
  catch (_) { return false; }
}

function createTranscriptPersistence(userDataPath) {
  if (!userDataPath) throw new Error('userDataPath is required.');
  const transcriptsDir = path.join(userDataPath, TRANSCRIPT_DIR_NAME);
  const meetingsFile = path.join(userDataPath, MEETINGS_FILE_NAME);
  ensureDir(transcriptsDir);
  const meetingStore = createMeetingStore({ file: meetingsFile });

  return {
    transcriptsDir,
    meetingsFile,
    meetingStore,

    // Start a new meeting record. Returns the meeting object so the caller
    // can stash the id and update it as the session progresses.
    startMeeting({ mode, channels }) {
      const m = meetingStore.add();
      meetingStore.update(m.id, {
        title: mode ? (mode + ' session') : 'Untitled meeting',
        startedAt: Date.now(),
        channels: channels || 'you,them',
        mode: mode || null,
      });
      return m;
    },

    // End an existing meeting, run an LLM summary, and (if saveTranscripts
    // is true) write the human-readable transcript file.
    //
    //   options:
    //     meetingId      — required
    //     mode           — required (for the file header + recap prompt)
    //     fullTranscript — required, the uncapped log collected during the session
    //     modeContext    — optional array of file names dropped on this mode card
    //     saveTranscripts — optional, default true. Skips the .txt export when false.
    //     generateSummary — fn(prompt) => string | Promise<string>. Awaited so an
    //                      async LLM wrapper (e.g. runEndOfSessionSummary) resolves
    //                      before summaryText is committed. Without the await the
    //                      return value is a Promise and String(promise) serialises
    //                      as the "[object Promise]" bug.
    //     buildSummaryPrompt — optional ({mode, transcript, modeContext}) =>
    //                      { system, turns }. If omitted, no summary is generated.
    //
    // Returns a Promise<{ meeting, transcriptPath, summaryText }> — must be awaited
    // by every caller (the sync callers were updated when this went async).
    async endMeeting(opts) {
      const meetingId = opts && opts.meetingId;
      if (!meetingId) throw new Error('endMeeting: meetingId is required.');
      const meeting = meetingStore.get(meetingId);
      if (!meeting) throw new Error('endMeeting: unknown meeting id.');

      const endedAt = Date.now();
      meetingStore.update(meetingId, { endedAt });
      const updated = meetingStore.get(meetingId);

      let summaryText = '';
      if (typeof opts.buildSummaryPrompt === 'function' && typeof opts.generateSummary === 'function') {
        const prompt = opts.buildSummaryPrompt({
          mode: opts.mode || updated.mode,
          transcript: opts.fullTranscript || [],
          modeContext: opts.modeContext || [],
        });
        // Await so async generateSummary (the real LLM path) resolves to a
        // string. String() is still applied for safety against callers that
        // return non-strings; String(resolvedString) is a no-op.
        const resolved = await opts.generateSummary(prompt);
        summaryText = String(resolved || '');
        const notes = require('./notes').parseNotes(summaryText);
        meetingStore.update(meetingId, {
          summary: notes.summary,
          keyPoints: notes.keyPoints,
          decisions: notes.decisions,
          actionItems: notes.actionItems,
          followUp: notes.followUp,
          context: (opts.modeContext || []).join(', '),
        });
      }

      const finalMeeting = meetingStore.get(meetingId);
      let transcriptPath = null;
      if (opts.saveTranscripts !== false) {
        ensureDir(transcriptsDir);
        const baseName = transcriptFileName(new Date(endedAt));
        transcriptPath = pickFreeTranscriptPath(transcriptsDir, baseName);
        const body = renderFullTranscriptFile(finalMeeting, opts.fullTranscript || []);
        fs.writeFileSync(transcriptPath, body, 'utf8');
      }

      return { meeting: finalMeeting, transcriptPath, summaryText };
    },

    listPastSessions() { return listPastSessions(transcriptsDir); },

    readSession(filePath) { return readSessionFile(filePath); },

    deleteSession(filePath) {
      // Read the MeetingId from the file BEFORE unlinking it, so we can also
      // remove the structured record from meetings.json. Best-effort:
      // a missing/unparseable file just deletes the file (or no-ops).
      let meetingId = null;
      try {
        const parsed = readSessionFile(filePath);
        meetingId = parsed.meetingId;
      } catch (_) { /* file already gone */ }

      const ok = deleteSessionFile(filePath);
      if (ok && meetingId && meetingId !== '(no id)') {
        try { meetingStore.remove(meetingId); } catch (_) {}
      }
      return ok;
    },
  };
}

module.exports = {
  TRANSCRIPT_DIR_NAME,
  MEETINGS_FILE_NAME,
  transcriptFileName,
  pickFreeTranscriptPath,
  renderTranscriptBody,
  renderFullTranscriptFile,
  formatDuration,
  listPastSessions,
  readSessionFile,
  deleteSessionFile,
  createTranscriptPersistence,
};
