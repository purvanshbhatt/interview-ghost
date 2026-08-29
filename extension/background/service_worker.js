/**
 * Ghost Chrome Web Extension — Background Service Worker (Manifest V3)
 * Orchestrates tab audio capture, offscreen document lifecycle, state machine locking,
 * and AI suggestion streaming.
 */

import { getSettings, setSettings, getSessionState, setSessionState } from '../lib/storage.js';
import { streamLLM } from '../lib/llm-client.js';

const OFFSCREEN_PATH = 'offscreen/offscreen.html';

/**
 * Checks if an offscreen document is already created.
 */
async function hasOffscreenDocument() {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
    });
    return contexts.length > 0;
  }
  return false;
}

/**
 * Creates the offscreen document for Web Audio capture and STT.
 */
async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    justification: 'Meeting tab audio transcription and speaker loopback playback'
  });
}

/**
 * Closes the offscreen document if active.
 */
async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    try {
      await chrome.offscreen.closeDocument();
    } catch (err) {
      console.warn('[Ghost SW] Error closing offscreen document:', err);
    }
  }
}

/**
 * Sets extension action badge and colors.
 */
async function updateBadge(state) {
  if (typeof chrome === 'undefined' || !chrome.action) return;

  if (state === 'recording') {
    await chrome.action.setBadgeText({ text: 'REC' });
    await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // vibrant red
  } else if (state === 'starting' || state === 'stopping') {
    await chrome.action.setBadgeText({ text: '...' });
    await chrome.action.setBadgeBackgroundColor({ color: '#06b6d4' }); // cyan
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

/**
 * Starts audio capture on the target tab.
 * State transitions: 'idle' -> 'starting' -> 'recording' (or 'idle' on error).
 */
export async function startRecording(targetTabId = null) {
  const session = await getSessionState();
  if (session.recordingState !== 'idle') {
    console.warn(`[Ghost SW] Cannot start recording in state: ${session.recordingState}`);
    return { success: false, state: session.recordingState, error: `Already in state ${session.recordingState}` };
  }

  await setSessionState({ recordingState: 'starting', error: null });
  await updateBadge('starting');

  try {
    let tabId = targetTabId;
    if (!tabId) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) throw new Error('No active tab detected.');
      tabId = tab.id;
    }

    // Acquire stream ID for tabCapture
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    if (!streamId) throw new Error('Failed to acquire tabCapture stream ID.');

    // Ensure offscreen document is ready
    await ensureOffscreenDocument();

    const settings = await getSettings();

    // Send stream ID and configuration to offscreen document
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'START_CAPTURE',
      data: {
        streamId,
        tabId,
        settings
      }
    });

    await setSessionState({
      recordingState: 'recording',
      activeTabId: tabId,
      activeStreamId: streamId,
      error: null
    });
    await updateBadge('recording');

    // Notify content script in the active meeting tab
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'CAPTURE_STATE_CHANGED',
        state: 'recording'
      });
    } catch {
      // Content script may not be injected on non-meeting tabs
    }

    return { success: true, state: 'recording', tabId };
  } catch (err) {
    console.error('[Ghost SW] Failed to start recording:', err);
    await closeOffscreenDocument();
    await setSessionState({ recordingState: 'idle', activeTabId: null, activeStreamId: null, error: err.message });
    await updateBadge('idle');
    return { success: false, state: 'idle', error: err.message };
  }
}

/**
 * Stops audio capture.
 * State transitions: 'recording' -> 'stopping' -> 'idle'.
 */
export async function stopRecording() {
  const session = await getSessionState();
  if (session.recordingState === 'idle') {
    return { success: true, state: 'idle' };
  }

  await setSessionState({ recordingState: 'stopping' });
  await updateBadge('stopping');

  try {
    // Notify offscreen document to stop audio tracks and recognition
    if (await hasOffscreenDocument()) {
      try {
        await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'STOP_CAPTURE'
        });
      } catch (err) {
        console.warn('[Ghost SW] Failed to notify offscreen document:', err);
      }
    }

    await closeOffscreenDocument();

    if (session.activeTabId) {
      try {
        await chrome.tabs.sendMessage(session.activeTabId, {
          type: 'CAPTURE_STATE_CHANGED',
          state: 'idle'
        });
      } catch {
        // Tab may have closed
      }
    }

    await setSessionState({
      recordingState: 'idle',
      activeTabId: null,
      activeStreamId: null,
      error: null
    });
    await updateBadge('idle');
    return { success: true, state: 'idle' };
  } catch (err) {
    console.error('[Ghost SW] Error stopping recording:', err);
    await setSessionState({ recordingState: 'idle', error: err.message });
    await updateBadge('idle');
    return { success: false, state: 'idle', error: err.message };
  }
}

/**
 * Generates an AI suggestion for the specified prompt / transcript turn.
 */
export async function generateSuggestion({ prompt, tabId = null, mode = null, smart = null }) {
  const settings = await getSettings();
  const session = await getSessionState();
  const targetTabId = tabId || session.activeTabId;

  const activeMode = mode || settings.activeMode || 'assist';
  const activeSmart = smart !== null ? smart : settings.smart;

  const messages = [
    { role: 'user', content: prompt }
  ];

  await setSessionState({ isGenerating: true });

  const notifyTab = async (msg) => {
    if (!targetTabId) return;
    try {
      await chrome.tabs.sendMessage(targetTabId, msg);
    } catch {
      // Content script may not be connected
    }
  };

  try {
    await notifyTab({ type: 'STREAM_START', mode: activeMode, smart: activeSmart });

    const fullResponse = await streamLLM({
      provider: settings.provider,
      smart: activeSmart,
      messages,
      mode: activeMode,
      settings,
      onToken: (chunk) => {
        notifyTab({ type: 'STREAM_CHUNK', chunk });
      },
      onDone: (fullText) => {
        notifyTab({ type: 'STREAM_DONE', fullText });
        setSessionState({ isGenerating: false, lastSuggestion: fullText });
      },
      onError: (err) => {
        notifyTab({ type: 'STREAM_ERROR', error: err.message });
        setSessionState({ isGenerating: false, error: err.message });
      }
    });

    return { success: true, response: fullResponse };
  } catch (err) {
    await notifyTab({ type: 'STREAM_ERROR', error: err.message });
    await setSessionState({ isGenerating: false, error: err.message });
    return { success: false, error: err.message };
  }
}

// -----------------------------------------------------------------------------
// Message Dispatcher
// -----------------------------------------------------------------------------
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Ignore messages intended for other components
    if (message.target === 'offscreen' || message.target === 'content') {
      return false;
    }

    const handle = async () => {
      switch (message.type) {
        case 'START_RECORDING': {
          const res = await startRecording(message.tabId || sender.tab?.id);
          sendResponse(res);
          break;
        }

        case 'STOP_RECORDING': {
          const res = await stopRecording();
          sendResponse(res);
          break;
        }

        case 'GET_STATE': {
          const session = await getSessionState();
          const settings = await getSettings();
          sendResponse({ session, settings });
          break;
        }

        case 'UPDATE_SETTINGS': {
          const updated = await setSettings(message.settings || {});
          sendResponse({ success: true, settings: updated });
          break;
        }

        case 'OPEN_OPTIONS': {
          chrome.runtime.openOptionsPage();
          sendResponse({ success: true });
          break;
        }

        case 'GENERATE_SUGGESTION': {
          const res = await generateSuggestion({
            prompt: message.prompt,
            tabId: message.tabId || sender.tab?.id,
            mode: message.mode,
            smart: message.smart
          });
          sendResponse(res);
          break;
        }

        case 'TRANSCRIPT_SEGMENT': {
          // Received from offscreen document
          const session = await getSessionState();
          const targetTabId = message.tabId || session.activeTabId;
          const { text, isFinal } = message;

          if (targetTabId) {
            try {
              await chrome.tabs.sendMessage(targetTabId, {
                type: 'TRANSCRIPT_SEGMENT',
                text,
                isFinal,
                timestamp: Date.now()
              });
            } catch {
              // tab not responding
            }
          }

          // Auto-trigger suggestion if speech is finalized and setting is enabled
          const settings = await getSettings();
          if (isFinal && settings.autoSuggestOnSpeechEnd && text && text.trim().length > 10) {
            generateSuggestion({
              prompt: `Interviewer: "${text.trim()}"`,
              tabId: targetTabId
            });
          }

          sendResponse({ received: true });
          break;
        }

        case 'TOGGLE_OVERLAY': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.id) {
            try {
              await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' });
              sendResponse({ success: true });
            } catch (err) {
              sendResponse({ success: false, error: err.message });
            }
          } else {
            sendResponse({ success: false, error: 'No active tab' });
          }
          break;
        }

        default:
          sendResponse({ error: `Unknown message type: ${message.type}` });
          break;
      }
    };

    handle();
    return true; // Keep message channel open for async response
  });
}
