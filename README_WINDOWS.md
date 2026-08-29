# Ghost on Windows 11

This workspace build optimizes Ghost for Windows 11 with full hardware acceleration, stealth window exclusion, and multi-provider AI streaming.

---

## Prerequisites

- Windows 10 (Build 2004+) or Windows 11 x64
- Node.js 22.12 or newer
- npm
- At least one LLM API key (Google Gemini, OpenAI, Anthropic Claude, Groq, MiniMax, Azure, or local Ollama)
- Optional: a Deepgram API key for ultra-low latency streaming transcription, or local `whisper.cpp`

---

## Setup & Quickstart

```powershell
# Navigate into the project folder
cd ghost

# Install dependencies
npm install

# Copy environment configuration
Copy-Item .env.example .env

# Configure your API keys
notepad .env
```

Set at least:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

You can also paste API keys directly into the app UI under **Settings → Keys**. All keys and profiles are stored securely in per-user local storage and never committed or transmitted to telemetry servers.

---

## Run In Development

```powershell
npm start
```

### Windows Feature Defaults:
- **AI Provider**: Google Gemini (with self-healing fallback to Fast tier on 404/429)
- **Fast Model**: `gemini-2.5-flash`
- **Smart Model**: `gemini-2.5-pro`
- **Transcript Prompt Window**: Rolling active conversation history
- **Context Profile**: Local résumé, STAR stories, target job description, and custom AI prompt rules
- **Stealth Protection**: Active by default (`WDA_EXCLUDEFROMCAPTURE`)

---

## Audio Capture on Windows

Ghost captures two independent audio channels on Windows:
1. **Microphone (You)**: Captured via standard Chromium `getUserMedia` API.
2. **System / Meeting Audio (Them)**: Captured via Windows display media loopback. Start listening from the toolbar button so Windows receives the required gesture for display/audio capture.

For lower-latency cloud transcription, add:
```env
DEEPGRAM_API_KEY=your_deepgram_key_here
```
Then select **Deepgram** or **Auto** in **Settings → Audio**.

For fully offline transcription, select **Local (whisper.cpp)** in **Settings → Audio** and download your preferred model (e.g. `base.en`).

---

## Stealth Screen Protection on Windows

Ghost utilizes the Windows desktop compositor's `SetWindowDisplayAffinity` API with `WDA_EXCLUDEFROMCAPTURE` (`setContentProtection(true)` in Electron). This completely excludes the Ghost window from:
- Zoom Meetings
- Microsoft Teams
- Google Meet (Chrome / Edge tab & screen sharing)
- Screen recording tools (OBS Studio, Snipping Tool, Xbox Game Bar)

> **Note for Zoom**: Ensure Zoom is set to *"Advanced capture with window filtering"* under **Zoom → Settings → Share Screen → Advanced**.

---

## Packaging Windows Binaries

### Package Unpacked Directory
```powershell
npm run pack:win
```
Outputs unpacked executable to `dist/win-unpacked/Ghost.exe`.

### Build NSIS Installer (.exe)
```powershell
npm run dist:win
```
Outputs standalone setup executable to `dist/Ghost-Setup-x64.exe`.

---

## Notes & Security
- `.env` is ignored by Git and never committed.
- Ghost operates 100% client-side with zero telemetry.
