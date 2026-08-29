/**
 * Ghost Chrome Web Extension — In-Meeting Floating HUD Content Script
 * Injected into Google Meet, Zoom Web, Microsoft Teams, and other meeting tabs.
 * Encapsulated inside an isolated Shadow DOM to guarantee zero host page style collision.
 */

(function () {
  // Prevent duplicate injection
  if (document.getElementById('ghost-copilot-root')) return;

  const host = document.createElement('div');
  host.id = 'ghost-copilot-root';
  host.style.position = 'fixed';
  host.style.top = '24px';
  host.style.right = '24px';
  host.style.zIndex = '2147483647';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // Load isolated stylesheet
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('content/overlay.css');
  shadow.appendChild(styleLink);

  // Template Structure
  const template = `
    <div class="ghost-hud-container" id="ghostContainer">
      <!-- Header / Drag Bar -->
      <div class="ghost-header" id="ghostHeader">
        <div class="ghost-brand">
          <svg class="ghost-logo-icon" viewBox="0 0 128 128" fill="none">
            <path d="M64 24 C44 24 32 40 32 60 V92 C32 95 35 98 38 96 C42 93 46 93 50 96 C54 99 60 99 64 96 C68 93 74 93 78 96 C82 99 88 99 90 96 C93 94 96 95 96 92 V60 C96 40 84 24 64 24 Z" fill="#06b6d4" />
            <ellipse cx="50" cy="54" rx="5" ry="6" fill="#0b0f17" />
            <ellipse cx="78" cy="54" rx="5" ry="6" fill="#0b0f17" />
          </svg>
          <span class="ghost-title">GHOST</span>
          <span class="ghost-status-badge" id="statusBadge">
            <span class="ghost-status-dot"></span>
            <span id="statusText">Idle</span>
          </span>
        </div>
        <div class="ghost-controls">
          <button class="ghost-btn-icon" id="btnToggleRecord" title="Start/Stop Tab Capture">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>
          </button>
          <button class="ghost-btn-icon" id="btnToggleDrawer" title="Toggle Live Transcript Drawer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button class="ghost-btn-icon" id="btnOptions" title="Ghost Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button class="ghost-btn-icon" id="btnMinimize" title="Minimize">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="ghost-btn-icon" id="btnClose" title="Hide Overlay">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <!-- Mode & Reasoning Toolbar -->
      <div class="ghost-toolbar">
        <div class="ghost-mode-pills" id="modePills">
          <button class="ghost-mode-pill active" data-mode="assist">Assist</button>
          <button class="ghost-mode-pill" data-mode="say">Say</button>
          <button class="ghost-mode-pill" data-mode="code">Code</button>
          <button class="ghost-mode-pill" data-mode="notes">Notes</button>
          <button class="ghost-mode-pill" data-mode="followup">Follow-up</button>
        </div>
        <button class="ghost-smart-toggle" id="smartToggle" title="Toggle Smart Reasoning Tier">
          <span>🧠</span>
          <span id="smartLabel">Fast</span>
        </button>
      </div>

      <!-- Body / Suggestions & Transcripts -->
      <div class="ghost-body">
        <!-- Live Transcription Drawer -->
        <div class="ghost-transcript-drawer" id="transcriptDrawer">
          <div class="ghost-transcript-header">
            <span>Live Transcript</span>
            <button class="ghost-btn-icon" id="btnClearTranscript" style="width:18px;height:18px;" title="Clear Transcript">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
          <div class="ghost-transcript-content" id="transcriptContent">
            <span class="ghost-transcript-interim">Waiting for meeting speech...</span>
          </div>
        </div>

        <!-- AI Suggestion Viewport -->
        <div class="ghost-suggestion-view" id="suggestionView">
          <div class="ghost-empty-state" id="emptyState">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 14a1 1 0 1 1 1-1 1 1 0 0 1-1 1zm1-5a1 1 0 0 1-2 0V7a1 1 0 0 1 2 0z"/>
            </svg>
            <span>Ghost is ready. Start meeting audio or ask a question.</span>
          </div>
          <div id="suggestionContent" style="display:none;"></div>
        </div>
      </div>

      <!-- Footer & Prompt Composer -->
      <div class="ghost-footer">
        <div class="ghost-quick-actions">
          <button class="ghost-action-chip" data-prompt="Provide a succinct, confident answer to the current question with key metrics.">Direct Answer</button>
          <button class="ghost-action-chip" data-prompt="Solve this coding problem with optimal time/space complexity and clean code.">Optimal Solution</button>
          <button class="ghost-action-chip" data-prompt="Frame this using a concise STAR story (Situation, Task, Action, Result).">STAR Story</button>
          <button class="ghost-action-chip" data-prompt="Give me 2 sharp follow-up questions to ask the interviewer next.">Follow Up</button>
        </div>
        <div class="ghost-input-wrapper">
          <input type="text" class="ghost-prompt-input" id="promptInput" placeholder="Ask Ghost or command in real-time... (Enter)" />
          <button class="ghost-send-btn" id="btnSend" title="Send to Ghost">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;
  shadow.appendChild(wrapper);

  // Element Selectors inside Shadow DOM
  const container = shadow.getElementById('ghostContainer');
  const header = shadow.getElementById('ghostHeader');
  const statusBadge = shadow.getElementById('statusBadge');
  const statusText = shadow.getElementById('statusText');
  const btnToggleRecord = shadow.getElementById('btnToggleRecord');
  const btnToggleDrawer = shadow.getElementById('btnToggleDrawer');
  const btnOptions = shadow.getElementById('btnOptions');
  const btnMinimize = shadow.getElementById('btnMinimize');
  const btnClose = shadow.getElementById('btnClose');
  const smartToggle = shadow.getElementById('smartToggle');
  const smartLabel = shadow.getElementById('smartLabel');
  const transcriptDrawer = shadow.getElementById('transcriptDrawer');
  const transcriptContent = shadow.getElementById('transcriptContent');
  const btnClearTranscript = shadow.getElementById('btnClearTranscript');
  const suggestionView = shadow.getElementById('suggestionView');
  const emptyState = shadow.getElementById('emptyState');
  const suggestionContent = shadow.getElementById('suggestionContent');
  const promptInput = shadow.getElementById('promptInput');
  const btnSend = shadow.getElementById('btnSend');
  const modePills = shadow.querySelectorAll('.ghost-mode-pill');
  const actionChips = shadow.querySelectorAll('.ghost-action-chip');

  let activeMode = 'assist';
  let isSmart = false;
  let isRecording = false;
  let accumulatedTranscript = '';
  let streamText = '';

  // ---------------------------------------------------------------------------
  // Smooth Drag & Move Handling
  // ---------------------------------------------------------------------------
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.ghost-controls')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = host.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;

    // Viewport clamping
    const maxLeft = window.innerWidth - host.offsetWidth - 8;
    const maxTop = window.innerHeight - host.offsetHeight - 8;

    newLeft = Math.max(8, Math.min(newLeft, maxLeft));
    newTop = Math.max(8, Math.min(newTop, maxTop));

    host.style.left = `${newLeft}px`;
    host.style.top = `${newTop}px`;
    host.style.right = 'auto';
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // ---------------------------------------------------------------------------
  // UI Interactions & Controls
  // ---------------------------------------------------------------------------
  btnToggleRecord.addEventListener('click', async () => {
    if (isRecording) {
      chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    } else {
      chrome.runtime.sendMessage({ type: 'START_RECORDING' });
    }
  });

  btnToggleDrawer.addEventListener('click', () => {
    transcriptDrawer.classList.toggle('hidden');
    btnToggleDrawer.classList.toggle('active', !transcriptDrawer.classList.contains('hidden'));
  });

  btnOptions.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
  });

  btnMinimize.addEventListener('click', () => {
    container.classList.toggle('minimized');
  });

  btnClose.addEventListener('click', () => {
    host.style.display = 'none';
  });

  smartToggle.addEventListener('click', () => {
    isSmart = !isSmart;
    smartToggle.classList.toggle('active', isSmart);
    smartLabel.textContent = isSmart ? 'Smart' : 'Fast';
    chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { smart: isSmart } });
  });

  modePills.forEach((pill) => {
    pill.addEventListener('click', () => {
      modePills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      activeMode = pill.dataset.mode;
      chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { activeMode } });
    });
  });

  btnClearTranscript.addEventListener('click', () => {
    accumulatedTranscript = '';
    transcriptContent.innerHTML = '<span class="ghost-transcript-interim">Transcript cleared.</span>';
  });

  const sendPrompt = (prompt) => {
    if (!prompt || !prompt.trim()) return;
    emptyState.style.display = 'none';
    suggestionContent.style.display = 'block';
    suggestionContent.innerHTML = `<div style="color:#06b6d4;font-weight:500;">Thinking...</div>`;
    streamText = '';

    chrome.runtime.sendMessage({
      type: 'GENERATE_SUGGESTION',
      prompt: prompt.trim(),
      mode: activeMode,
      smart: isSmart
    });
    promptInput.value = '';
  };

  btnSend.addEventListener('click', () => sendPrompt(promptInput.value));
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendPrompt(promptInput.value);
    }
  });

  actionChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      sendPrompt(chip.dataset.prompt);
    });
  });

  // ---------------------------------------------------------------------------
  // Markdown / Format Helper
  // ---------------------------------------------------------------------------
  function formatMarkdown(text) {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    html = html.replace(/```([a-z]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Bullet items
    html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Paragraph breaks
    html = html.replace(/\n\n/g, '<br/><br/>');

    return html;
  }

  // ---------------------------------------------------------------------------
  // Message Listener from Background
  // ---------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case 'CAPTURE_STATE_CHANGED': {
        isRecording = message.state === 'recording';
        container.classList.toggle('recording', isRecording);
        statusBadge.classList.toggle('active', isRecording);
        statusText.textContent = isRecording ? 'Listening' : 'Idle';
        btnToggleRecord.classList.toggle('active', isRecording);
        break;
      }

      case 'TRANSCRIPT_SEGMENT': {
        const { text, isFinal } = message;
        if (isFinal) {
          accumulatedTranscript += ` ${text.trim()}`;
          transcriptContent.textContent = accumulatedTranscript.trim();
        } else {
          transcriptContent.innerHTML = `${accumulatedTranscript} <span class="ghost-transcript-interim">${text}</span>`;
        }
        transcriptDrawer.scrollTop = transcriptDrawer.scrollHeight;
        break;
      }

      case 'STREAM_START': {
        emptyState.style.display = 'none';
        suggestionContent.style.display = 'block';
        streamText = '';
        suggestionContent.innerHTML = '<span style="color:#38bdf8;">•</span>';
        break;
      }

      case 'STREAM_CHUNK': {
        streamText += message.chunk;
        suggestionContent.innerHTML = formatMarkdown(streamText);
        suggestionView.scrollTop = suggestionView.scrollHeight;
        break;
      }

      case 'STREAM_DONE': {
        suggestionContent.innerHTML = formatMarkdown(message.fullText || streamText);
        break;
      }

      case 'STREAM_ERROR': {
        emptyState.style.display = 'none';
        suggestionContent.style.display = 'block';
        suggestionContent.innerHTML = `<div style="color:#ef4444;font-weight:500;">Error: ${message.error}</div>`;
        break;
      }

      case 'TOGGLE_OVERLAY': {
        host.style.display = host.style.display === 'none' ? 'block' : 'none';
        break;
      }
    }
  });

  // Fetch initial state
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
    if (res && res.session) {
      isRecording = res.session.recordingState === 'recording';
      container.classList.toggle('recording', isRecording);
      statusBadge.classList.toggle('active', isRecording);
      statusText.textContent = isRecording ? 'Listening' : 'Idle';
      btnToggleRecord.classList.toggle('active', isRecording);
    }
    if (res && res.settings) {
      activeMode = res.settings.activeMode || 'assist';
      modePills.forEach((p) => p.classList.toggle('active', p.dataset.mode === activeMode));
      isSmart = !!res.settings.smart;
      smartToggle.classList.toggle('active', isSmart);
      smartLabel.textContent = isSmart ? 'Smart' : 'Fast';
    }
  });
})();
