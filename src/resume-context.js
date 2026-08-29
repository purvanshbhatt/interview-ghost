// resume-context.js — thin re-export shim.
// All logic now lives in interview-context.js.
// This file is kept only for backward compatibility with tests.
const { buildResumeContext, parseResume } = require('./interview-context');

// Legacy single-arg form still supported via the backward-compat path in interview-context.js
function buildResumeContextLegacy(resumeText, limit = 1200) {
  return buildResumeContext(resumeText, limit);
}

module.exports = { buildResumeContext, parseResume, buildResumeContextLegacy };
