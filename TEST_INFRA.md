# Ghost Testing Infrastructure

## Overview
Ghost maintains a comprehensive test suite executed with the native Node.js test runner (`node:test` and `node:assert/strict`).

## Test Execution
```bash
npm test
```

## Structure
- `test/llm.test.js`: LLM streaming, self-healing model resolution, and error formatting.
- `test/stt.test.js` & `test/stt-streaming.js`: Multi-provider speech-to-text pipeline (Deepgram, Gemini Transcribe, Local Whisper, OpenAI).
- `test/transcription-stability.test.js`: UI layout stability and transcription containment tests.
- `test/repo-sanitization.test.js`: Security, secret detection, and PII audit.
- `test/e2e/`: Tier 1-4 End-to-end integration and scenario tests.
