/**
 * Ghost Chrome Web Extension — Offscreen Media Pipeline
 * Captures tab audio via getUserMedia, loops back to AudioContext.destination
 * so the user hears meeting audio, and runs real-time speech recognition.
 */

let activeMediaStream = null;
let activeAudioContext = null;
let activeRecognition = null;
let isCapturing = false;
let currentTabId = null;
let activeSettings = null;
let mediaRecorder = null;
let recordedChunks = [];

/**
 * Starts audio capture and transcription.
 */
async function startCapture({ streamId, tabId, settings }) {
  if (isCapturing) {
    await stopCapture();
  }

  isCapturing = true;
  currentTabId = tabId;
  activeSettings = settings || {};

  try {
    // 1. Acquire tab audio stream via chromeMediaSourceId
    activeMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    // 2. Route audio to speaker destination (loopback so tab is not muted)
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      activeAudioContext = new AudioCtx();
      const source = activeAudioContext.createMediaStreamSource(activeMediaStream);
      source.connect(activeAudioContext.destination);
    }

    // 3. Initialize Speech-to-Text Pipeline
    startSpeechRecognition();

    // 4. Initialize Cloud STT recorder if non-webspeech engine configured
    if (activeSettings.sttEngine && activeSettings.sttEngine !== 'webspeech') {
      startCloudAudioRecorder();
    }

    console.log('[Ghost Offscreen] Audio capture & loopback active for tab:', tabId);
    return { success: true };
  } catch (err) {
    console.error('[Ghost Offscreen] Failed to start capture:', err);
    await stopCapture();
    throw err;
  }
}

/**
 * Initializes continuous Web Speech API recognition.
 */
function startSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('[Ghost Offscreen] Web Speech API not supported in this context.');
    return;
  }

  activeRecognition = new SpeechRecognition();
  activeRecognition.continuous = true;
  activeRecognition.interimResults = true;
  activeRecognition.lang = activeSettings?.sttLanguage || 'en-US';

  activeRecognition.onresult = (event) => {
    if (!isCapturing) return;

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const result = event.results[i];
      const text = result[0]?.transcript || '';
      const isFinal = result.isFinal;

      if (text.trim()) {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPT_SEGMENT',
          text,
          isFinal,
          tabId: currentTabId
        });
      }
    }
  };

  activeRecognition.onerror = (event) => {
    if (event.error === 'no-speech') {
      // Normal pause in speech, will auto-continue
      return;
    }
    console.warn('[Ghost Offscreen] Speech recognition event error:', event.error);
  };

  activeRecognition.onend = () => {
    // If still capturing, immediately restart speech recognition
    if (isCapturing && activeRecognition) {
      try {
        activeRecognition.start();
      } catch (err) {
        console.warn('[Ghost Offscreen] Recognition restart throttled:', err);
      }
    }
  };

  try {
    activeRecognition.start();
  } catch (err) {
    console.warn('[Ghost Offscreen] Recognition initial start error:', err);
  }
}

/**
 * Secondary / Fallback Cloud Audio Recorder (e.g. Groq Whisper / Deepgram)
 */
function startCloudAudioRecorder() {
  if (typeof MediaRecorder === 'undefined' || !activeMediaStream) return;

  try {
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    mediaRecorder = new MediaRecorder(activeMediaStream, { mimeType });
    recordedChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      if (recordedChunks.length > 0 && isCapturing && activeSettings?.groqApiKey) {
        const audioBlob = new Blob(recordedChunks, { type: mimeType });
        recordedChunks = [];
        sendCloudSTT(audioBlob);
      }
    };

    // Slice audio every few seconds
    mediaRecorder.start(4000);
  } catch (err) {
    console.warn('[Ghost Offscreen] MediaRecorder initialization error:', err);
  }
}

/**
 * Sends audio blob to Groq / Whisper Cloud STT endpoint
 */
async function sendCloudSTT(audioBlob) {
  if (!activeSettings?.groqApiKey) return;

  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-large-v3');
    formData.append('language', (activeSettings.sttLanguage || 'en').split('-')[0]);

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${activeSettings.groqApiKey}`
      },
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      if (data.text && data.text.trim()) {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPT_SEGMENT',
          text: data.text.trim(),
          isFinal: true,
          tabId: currentTabId
        });
      }
    }
  } catch (err) {
    console.warn('[Ghost Offscreen] Cloud STT error:', err);
  }
}

/**
 * Stops audio capture and cleans up all audio tracks and recognition objects.
 */
async function stopCapture() {
  isCapturing = false;

  if (activeRecognition) {
    try {
      activeRecognition.stop();
    } catch {}
    activeRecognition = null;
  }

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch {}
    mediaRecorder = null;
  }

  if (activeMediaStream) {
    activeMediaStream.getTracks().forEach((track) => track.stop());
    activeMediaStream = null;
  }

  if (activeAudioContext) {
    try {
      await activeAudioContext.close();
    } catch {}
    activeAudioContext = null;
  }

  recordedChunks = [];
  currentTabId = null;
  console.log('[Ghost Offscreen] Capture pipeline cleanly stopped.');
  return { success: true };
}

// -----------------------------------------------------------------------------
// Message Listener
// -----------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  const handle = async () => {
    switch (message.type) {
      case 'START_CAPTURE': {
        const res = await startCapture(message.data);
        sendResponse(res);
        break;
      }

      case 'STOP_CAPTURE': {
        const res = await stopCapture();
        sendResponse(res);
        break;
      }

      default:
        sendResponse({ error: `Unknown offscreen action: ${message.type}` });
        break;
    }
  };

  handle();
  return true;
});
