/* Ghost renderer — UI state, mic capture, IPC, streaming render. */
(function () {
  const { icon } = window.ICONS;
  const cue = window.ghost || window.cue; // exposed by preload
  const $ = (s) => document.querySelector(s);
  const isWindows = cue.platform === 'win32';
  const isMac = cue.platform === 'darwin';
  const isLinux = cue.platform === 'linux';
  // Windows and Linux both use Ctrl-based shortcuts; macOS uses ⌘.
  const usesCtrl = !isMac;

  // ---- paint icons -------------------------------------------------------
  $('#logo-btn').innerHTML = icon('logo', { size: 18 });
  $('.tb-hide .chev').innerHTML = icon('chevron-down', { size: 14 });
  $('#stop-btn').innerHTML = icon('stop-square', { size: 15 });
  $('#quit-btn').innerHTML = icon('x', { size: 14 });
  document.querySelector('.act[data-mode="assist"] .ic').innerHTML = icon('sparkles', { size: 14 });
  document.querySelector('.act[data-mode="say"] .ic').innerHTML = icon('wand-sparkles', { size: 14 });
  document.querySelector('.act[data-mode="followup"] .ic').innerHTML = icon('message-circle', { size: 14 });
  document.querySelector('.act[data-mode="recap"] .ic').innerHTML = icon('refresh-cw', { size: 14 });
  document.querySelector('.act[data-mode="mock"] .ic').innerHTML = icon('mic', { size: 14 });
  const phoneIC = document.querySelector('.act[data-mode="phoneCall"] .ic');
  if (phoneIC) phoneIC.innerHTML = icon('phone', { size: 14 });
  document.querySelector('.act[data-mode="coffee"] .ic').innerHTML = icon('coffee', { size: 14 });
  const copyIC = document.querySelector('#copy-btn .ic');
  if (copyIC) copyIC.innerHTML = icon('copy', { size: 14 });
  $('#smart-toggle .ic').innerHTML = icon('zap', { size: 14 });
  const histIC = document.querySelector('#history-btn .ic');
  if (histIC) histIC.innerHTML = icon('history', { size: 15 });
  $('#more-btn').innerHTML = icon('more-horizontal', { size: 18 });
  $('#send-btn').innerHTML = icon('play', { size: 15 });
  const clearIC = document.querySelector('#clear-transcript-btn .ic');
  if (clearIC) clearIC.innerHTML = icon('trash-2', { size: 15 });

  // ---- state -------------------------------------------------------------
  let settings = null;
  let whisperOverview = null;
  let busy = false;
  let aiEl = null;       // current streaming <div class="ai-text">
  let caretEl = null;
  let responseCount = 0;
  const MAX_RESPONSES = 20;

  const messages = $('#messages');

  function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // minimal, safe markdown: fenced code, bullets, inline code, bold, paragraphs
  function renderMarkdown(text) {
    const lines = text.split('\n');
    let html = '', inCode = false, inList = false, buf = [];
    const flushP = () => { if (buf.length) { html += '<p>' + inline(buf.join(' ')) + '</p>'; buf = []; } };
    const inline = (s) => esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    for (const raw of lines) {
      const line = raw;
      if (/^```/.test(line.trim())) {
        if (!inCode) { flushP(); if (inList) { html += '</ul>'; inList = false; } html += '<pre><code>'; inCode = true; }
        else { html += '</code></pre>'; inCode = false; }
        continue;
      }
      if (inCode) { html += esc(line) + '\n'; continue; }
      if (/^\s*[-*]\s+/.test(line)) { flushP(); if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</li>'; continue; }
      if (line.trim() === '') { flushP(); if (inList) { html += '</ul>'; inList = false; } continue; }
      buf.push(line.trim());
    }
    flushP(); if (inList) html += '</ul>'; if (inCode) html += '</code></pre>';
    return html;
  }

  function clearMessages() { messages.innerHTML = ''; aiEl = null; caretEl = null; }

  function addUserBubble(text) {
    const b = document.createElement('div');
    b.className = 'user-bubble';
    b.textContent = text;
    messages.appendChild(b);
    messages.scrollTop = messages.scrollHeight;
  }

  function startAi(small) {
    aiEl = document.createElement('div');
    aiEl.className = 'ai-text' + (small ? ' small' : '');
    aiEl.dataset.raw = '';
    caretEl = document.createElement('span');
    caretEl.className = 'ai-caret';
    aiEl.appendChild(caretEl);
    messages.appendChild(aiEl);
    messages.scrollTop = messages.scrollHeight;
  }

  function appendToken(t) {
    if (t === undefined || t === null) return;
    if (typeof t !== 'string') t = String(t);
    if (!t) return;
    if (!aiEl) startAi(false);
    aiEl.dataset.raw += t;
    const span = document.createElement('span');
    span.className = 'w';
    span.textContent = t;
    // Guard: caretEl must be a child of aiEl
    if (caretEl && caretEl.parentNode === aiEl) {
      aiEl.insertBefore(span, caretEl);
    } else {
      aiEl.appendChild(span);
    }
    messages.scrollTop = messages.scrollHeight;
  }

  function finalizeAi(overrideText) {
    if (!aiEl) return;
    const raw = (overrideText !== undefined && overrideText !== null) ? overrideText : (aiEl.dataset.raw || '');
    aiEl.innerHTML = renderMarkdown(raw);
    aiEl = null; caretEl = null;
    messages.scrollTop = messages.scrollHeight;
  }

  let busyFailsafe = null;
  function setBusy(v) {
    busy = v;
    $('#send-btn').classList.toggle('busy', v);
    clearTimeout(busyFailsafe);
    // Failsafe: main has a 25s stream watchdog that always sends llm:done/llm:error, but if a
    // terminal event is ever lost the whole UI stays frozen — self-clear after a generous window.
    if (v) busyFailsafe = setTimeout(() => { busy = false; $('#send-btn').classList.toggle('busy', false); }, 40000);
  }

  // ---- transcript helpers ------------------------------------------------
  // NOTE: The old transcript-list element was renamed to ts-list.
  // These helpers are now deprecated but kept for compatibility.
  // The main sidebar uses appendTranscriptHistoryTurn() instead.
  let transcriptInterimEl = null;

  // FIX #1: Updated to use ts-list instead of non-existent transcript-list

  function clearTranscriptInterim() {
    if (transcriptInterimEl) {
      transcriptInterimEl.remove();
      transcriptInterimEl = null;
    }
  }

  // ---- toast helper ------------------------------------------------------
  // FIX #7: Toast queue system — ensures latest toast wins cleanly without stacking
  let toastTimer = null;
  let toastFadeTimer = null;
  function showToast(message, ms) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.getElementById('app').appendChild(el);
    }
    // Clear any pending timers to prevent overlap
    clearTimeout(toastTimer);
    clearTimeout(toastFadeTimer);
    // Immediately update content (no stacking)
    el.textContent = message;
    el.classList.add('show');
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
    }, ms);
  }

  // ---- actions -----------------------------------------------------------
  function runMode(mode, text) {
    if (busy) return;
    setBusy(true);
    cue.ask({ mode, text: text || '' });
  }

  document.querySelectorAll('.act').forEach((btn) => {
    btn.addEventListener('click', () => runMode(btn.dataset.mode, ''));
  });

  const input = $('#input');
  const placeholder = $('#placeholder');
  const composer = $('#composer');

  function syncPlaceholder() {
    placeholder.classList.toggle('hidden', input.value.length > 0 || document.activeElement === input);
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  }

  function updateSendButtonState() {
    const sendBtn = document.getElementById('send-btn');
    if (!sendBtn) return;
    const hasText = input.value.trim().length > 0;
    sendBtn.classList.toggle('has-text', hasText);
  }

  input.addEventListener('input', () => {
    syncPlaceholder();
    updateSendButtonState();
  });
  input.addEventListener('focus', () => { composer.classList.add('focused'); placeholder.classList.add('hidden'); });
  input.addEventListener('blur', () => { composer.classList.remove('focused'); syncPlaceholder(); });
  $('#input-area').addEventListener('click', () => input.focus());

  function send() {
    const text = input.value.trim();
    if (!text) { runMode('assist', ''); return; }
    input.value = '';
    syncPlaceholder();
    updateSendButtonState();
    runMode('ask', text);
  }
  $('#send-btn').addEventListener('click', send);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value.trim()) {
      e.preventDefault();
      input.value = '';
      syncPlaceholder();
      updateSendButtonState();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); send(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runMode('assist', ''); }
  });

  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+A / Cmd+Shift+A: Force answer / send current input
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      if (input.value.trim()) {
        send();
      } else {
        showToast('No question to answer', 1500);
      }
    }
  });

  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) {
    const forceKey = usesCtrl ? 'Ctrl+Shift+A' : '⌘⇧A';
    sendBtn.title = `Send · ${forceKey} to force answer`;
  }

  // Smart toggle
  const smartBtn = $('#smart-toggle');
  smartBtn.addEventListener('click', async () => {
    settings.smart = !settings.smart;
    smartBtn.classList.toggle('on', settings.smart);
    await cue.settingsSet({ smart: settings.smart });
  });

  // Hide / collapse
  function toggleHide() {
    const collapsed = $('#panel').classList.toggle('collapsed');
    $('#hide-btn').classList.toggle('collapsed', collapsed);
    $('#live-dot').style.display = collapsed ? 'none' : '';
    if (cue.windowSetCollapsed) {
      cue.windowSetCollapsed(collapsed);
    }
  }
  $('#hide-btn').addEventListener('click', toggleHide);
  cue.on('hide:toggle', toggleHide);

  // Copy latest answer
  const copyBtn = $('#copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const aiTexts = Array.from(document.querySelectorAll('.ai-text'));
      const lastAi = aiTexts[aiTexts.length - 1];
      const textToCopy = lastAi ? (lastAi.dataset.raw || lastAi.innerText || '').trim() : '';
      if (!textToCopy) {
        showToast('No answer to copy yet', 2000);
        return;
      }
      try {
        await navigator.clipboard.writeText(textToCopy);
        const span = copyBtn.querySelector('span:not(.ic)');
        if (span) span.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          if (span) span.textContent = 'Copy';
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Clipboard copy failed', err);
        showToast('Copy failed', 2000);
      }
    });
  }

  // End Session — stops capture, asks main to write the transcript file +
  // run the recap, then re-shows the dashboard. The overlay itself stays
  // loaded (so it can re-appear fast on the next Start Mode) but is hidden
  // by main. We confirm before ending so a stray click does not discard a
  // multi-hour session's transcript-writing + recap.
  const endBtn = document.getElementById('end-session-btn');
  if (endBtn) {
    endBtn.addEventListener('click', async () => {
      const ok = window.confirm('End this session? Transcripts will be saved and a recap generated.');
      if (!ok) return;
      endBtn.disabled = true;
      endBtn.textContent = 'Ending...';
      try {
        // Stop listening first so the overlay's stop button reflects state.
        if ($('#stop-btn').classList.contains('active')) {
          $('#stop-btn').click();
        }
        const res = await cue.sessionEnd();
        if (res && res.ok) {
          showToast('Session ended. Transcript saved.', 2500);
        } else {
          showToast('Session ended (no transcript saved).', 2500);
        }
      } catch (err) {
        console.error('[cue] end-session failed', err);
        showToast('End session failed: ' + ((err && err.message) || err), 3500);
      } finally {
        endBtn.disabled = false;
        endBtn.textContent = 'End Session';
      }
    });
  }

  // Stop = start/stop listening. Kick off system-audio capture straight from the click so
  // the user-gesture is fresh for getDisplayMedia (loopback capture needs it).
  $('#stop-btn').addEventListener('click', async () => {
    const turningOn = !$('#stop-btn').classList.contains('active');
    if (turningOn) {
      // startSystemAudio may fail (user cancels, no permission) — that's OK,
      // mic will still work and capture will toggle regardless
      try { await startSystemAudio(); } catch (_) { /* handled inside startSystemAudio */ }
    }
    const active = await cue.captureToggle();
    if (turningOn && !active) stopSystemAudio();
  });

  // Transcript toggle removed — sidebar now auto-opens with listening

  // Clear transcript
  const clearTranscriptBtn = document.getElementById('clear-transcript-btn');
  if (clearTranscriptBtn) {
    clearTranscriptBtn.addEventListener('click', async () => {
      await cue.clearTranscript();
      clearMessages();
      const list = document.getElementById('ts-list');
      if (list) list.innerHTML = '<div class="ts-placeholder">Conversation history will appear here when listening.</div>';
      clearTranscriptSidebar();
      showToast('Transcript cleared', 2500);
    });
  }

  // ---- capture: mic (renderer side) — uses AudioWorklet (modern, off-main-thread) ----
  let audioCtx = null, micStream = null, micWorklet = null;
  async function startMic() {
    if (micStream) return;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      // getUserMedia can resolve with a stream that has no usable audio track
      // (e.g. a virtual/placeholder device, or a device that was unplugged
      // between permission grant and capture start). Fail loudly here instead
      // of silently wiring up an AudioWorklet to nothing — that produces the
      // "cue never hears me, no error shown" symptom with no diagnostic at all.
      const [track] = micStream.getAudioTracks();
      if (!track) {
        micStream.getTracks().forEach((t) => t.stop());
        micStream = null;
        showStatus('No microphone audio track was available. Check Windows Sound settings for a working default input device, then try again.');
        return;
      }
      cue.log('mic stream started: track=' + (track.label || '(no label — permission may be stale)') + ' muted=' + track.muted);
      audioCtx = new AudioContext({ sampleRate: 16000 });
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // Use AudioWorklet for low-latency, off-main-thread processing
      try {
        await audioCtx.audioWorklet.addModule('audio-worklet-processor.js');
        const source = audioCtx.createMediaStreamSource(micStream);
        micWorklet = new AudioWorkletNode(audioCtx, 'cue-audio-processor');
        micWorklet.port.onmessage = (e) => {
          cue.micPcm(e.data);
        };
        source.connect(micWorklet);
        // Do NOT connect to audioCtx.destination — that would play mic back to earphones/speakers (echo)
        cue.log('mic AudioWorklet processor attached and active');
      } catch (workletErr) {
        // Fallback to ScriptProcessor if AudioWorklet fails (shouldn't happen in Electron 33+)
        cue.log('AudioWorklet failed, falling back to ScriptProcessor: ' + workletErr.message);
        const micNode = audioCtx.createMediaStreamSource(micStream);
        const micProc = audioCtx.createScriptProcessor(4096, 1, 1);
        micNode.connect(micProc);
        micProc.onaudioprocess = (e) => {
          const f = e.inputBuffer.getChannelData(0);
          const out = new Int16Array(f.length);
          for (let i = 0; i < f.length; i++) { const s = Math.max(-1, Math.min(1, f[i])); out[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
          cue.micPcm(out.buffer);
        };
        micWorklet = { _legacy: true, proc: micProc, node: micNode };
      }
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      const name = err && err.name;
      cue.log('mic error: ' + name + ' — ' + message);
      // getUserMedia's DOMException.name is the reliable signal here — the
      // .message text varies by Chromium version and isn't meant for users.
      // Distinguishing "no device" from "denied" from "in use elsewhere"
      // turns one generic dead end into three different next actions.
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        showStatus('No microphone was found. Plug one in, or pick a default input device in your OS sound settings, then try again.');
      } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
        showStatus(isWindows
          ? 'Microphone permission was denied. Settings → Privacy & security → Microphone → allow cue, then try again.'
          : isLinux
            ? 'Microphone access was denied. Check your sound settings (pavucontrol → Input Devices, or GNOME Settings → Privacy) and make sure cue is not muted, then try again.'
            : 'Microphone permission was denied. System Settings → Privacy & Security → Microphone → allow cue, then try again.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        showStatus('The microphone could not be started — another application may be using it exclusively. Close other apps using the mic and try again.');
      } else {
        showStatus('Microphone capture could not be started. Check your mic permissions and try again.');
      }
    }
  }
  function stopMic() {
    if (micWorklet) {
      if (micWorklet._legacy) {
        micWorklet.proc.disconnect(); micWorklet.proc.onaudioprocess = null;
        micWorklet.node.disconnect();
      } else {
        micWorklet.disconnect();
      }
      micWorklet = null;
    }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  }

  // ---- capture: system/meeting audio (getDisplayMedia loopback, in cue's process) ----
  let sysStream = null, sysCtx = null, sysWorklet = null, sysStarting = false;
  // Chromium's first getDisplayMedia call on Windows occasionally returns a
  // video-only stream because the WASAPI loopback endpoint isn't allocated
  // in time on cold start; an immediate retry resolves that. Single retry
  // only — thrashing the picker three times would be hostile.
  const SYSTEM_AUDIO_MAX_ATTEMPTS = 2;
  async function startSystemAudio() {
    // Called both from the stop-btn click (fresh user gesture for getDisplayMedia) and from the
    // capture:state handler. getDisplayMedia is async, so `if (sysStream) return` alone loses the
    // race and can open a second loopback stream that is then orphaned.
    if (sysStream || sysStarting) return;
    sysStarting = true;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      cue.log('system audio unavailable: getDisplayMedia not supported');
      showStatus('Meeting audio capture is not available on this device build.');
      sysStarting = false;
      return;
    }

    let stream = null;
    let tracks = [];
    let lastErr = null;
    for (let attempt = 1; attempt <= SYSTEM_AUDIO_MAX_ATTEMPTS; attempt++) {
      try {
        // Electron/Chromium's getDisplayMedia ignores the legacy
        // `mandatory.chromeMediaSource:'desktop'` constraints shape — that
        // syntax was for the old chromeMediaSource API. The loopback source is
        // instead provided by setDisplayMediaRequestHandler in the main
        // process, which is already configured to attach audio and set
        // enableLocalEcho:false. Passing {video:true, audio:true} here is the
        // supported contract; audio:true is what makes the OS-grant attach a
        // loopback track.
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        // Stop the video track immediately — we only want audio. Done BEFORE
        // the audio-track check so a failed attempt doesn't leak a video
        // source grant that would block the next getDisplayMedia.
        stream.getVideoTracks().forEach((t) => t.stop());
        tracks = stream.getAudioTracks();
        if (tracks.length) break; // success
        cue.log('system audio: no loopback track on attempt ' + attempt);
        // Release the (audio-less) stream before retrying.
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      } catch (err) {
        lastErr = err;
        cue.log('system audio attempt ' + attempt + ' error: ' + (err && err.message ? err.message : err));
        // NotAllowedError == user dismissed the picker — retrying would just
        // re-prompt them, so bail out immediately rather than spamming OS UI.
        if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) break;
      }
    }

    try {
      if (!stream || !tracks.length) {
        // Persistent banner instead of a transient toast — the failure was
        // easy to miss in the floating status line and users kept thinking
        // cue could hear the interviewer when it couldn't.
        const reason = lastErr
          ? ('Sharing prompt was cancelled or denied: ' + (lastErr.message || lastErr.name || 'permission denied') + '.')
          : (cue.platform === 'win32'
              ? 'No system-audio loopback track detected. Make sure "Share audio" is checked in the screen share dialog, and that your audio device is not in exclusive mode.'
              : isLinux
                ? 'No system-audio loopback track detected. On Linux, set your output device\'s monitor as an input source: pactl load-module module-loopback latency_msec=1, or select "Monitor of <your speakers>" in PulseAudio/pipewire settings — your screen and microphone still work.'
                : 'No system-audio loopback track detected. Meeting audio needs macOS 14.4+ — your screen and microphone still work.');
        cue.log('system audio: giving up — ' + reason);
        showSystemAudioBanner(reason);
        if (stream) stream.getTracks().forEach((t) => t.stop());
        return;
      }

      // We have a real loopback audio track — clear any stale banner from a
      // prior failed attempt so the UI doesn't keep warning about an issue
      // that's now resolved.
      hideSystemAudioBanner();
      sysStream = stream;
      sysCtx = new AudioContext({ sampleRate: 16000 });
      if (sysCtx.state === 'suspended') {
        await sysCtx.resume();
      }

      // Use AudioWorklet for system audio too
      try {
        await sysCtx.audioWorklet.addModule('audio-worklet-processor.js');
        const source = sysCtx.createMediaStreamSource(new MediaStream(tracks));
        sysWorklet = new AudioWorkletNode(sysCtx, 'cue-audio-processor');
        sysWorklet.port.onmessage = (e) => {
          cue.systemPcm(e.data);
        };
        source.connect(sysWorklet);
        // Do NOT connect to sysCtx.destination — that causes loopback echo
        cue.log('system audio: AudioWorklet capturing loopback (' + tracks.length + ' track(s), label="' + (tracks[0].label || '(unlabelled)') + '")');
      } catch (workletErr) {
        // Fallback to ScriptProcessor
        cue.log('system audio AudioWorklet failed, using ScriptProcessor: ' + workletErr.message);
        const sysNode = sysCtx.createMediaStreamSource(new MediaStream(tracks));
        const sysProc = sysCtx.createScriptProcessor(4096, 1, 1);
        sysNode.connect(sysProc);
        sysProc.onaudioprocess = (e) => {
          const f = e.inputBuffer.getChannelData(0);
          const out = new Int16Array(f.length);
          for (let i = 0; i < f.length; i++) { const s = Math.max(-1, Math.min(1, f[i])); out[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
          cue.systemPcm(out.buffer);
        };
        sysWorklet = { _legacy: true, proc: sysProc, node: sysNode };
      }
    } catch (outerErr) {
      const message = outerErr && outerErr.message ? outerErr.message : String(outerErr);
      cue.log('system audio error: ' + message);
      showSystemAudioBanner('Meeting audio could not be started: ' + message);
    } finally {
      sysStarting = false;
    }
  }
  function stopSystemAudio() {
    if (sysWorklet) {
      if (sysWorklet._legacy) {
        sysWorklet.proc.disconnect(); sysWorklet.proc.onaudioprocess = null;
        sysWorklet.node.disconnect();
      } else {
        sysWorklet.disconnect();
      }
      sysWorklet = null;
    }
    if (sysCtx) { sysCtx.close(); sysCtx = null; }
    if (sysStream) { sysStream.getTracks().forEach((t) => t.stop()); sysStream = null; }
  }

  // ---- STT / VAD status helpers ------------------------------------------
  // Live dot states: 'off' | 'idle' | 'speaking' | 'transcribing'
  function setLiveDotState(dotState) {
    const dot = document.getElementById('live-dot');
    if (!dot) return;
    dot.classList.remove('off', 'idle', 'speaking', 'transcribing');
    dot.classList.add(dotState);
    const labels = {
      off:          'Not listening',
      idle:         'Listening — silence detected',
      speaking:     'Speech detected',
      transcribing: 'Transcribing…'
    };
    dot.title = labels[dotState] || '';
  }

  let sttState = 'disconnected';

  function updateSttStatus({ active, streaming } = {}) {
    const label = document.getElementById('stt-status');
    if (!label) return;
    if (active === false) {
      sttState = 'disconnected';
      label.textContent = 'off';
    } else if (active === true) {
      sttState = streaming ? 'connecting' : 'batch';
      label.textContent = sttState;
    }
    label.className = 'stt-status stt-' + sttState;
  }

  // ---- transcript history sidebar (hidden by default, manual toggle) ----
  let tsSidebarInterimEl = null;
  let sidebarOpen = false;
  // Track last committed row per channel — all chunks from same speaker go in one row
  const tsLastRow = { you: null, them: null };
  const tsRowTimer = { you: null, them: null };
  const TS_SENTENCE_GAP_MS = 10000; // 10s silence = new row

  function showSidebar() {
    const sidebar = document.getElementById('transcript-sidebar');
    const historyBtn = document.getElementById('history-btn');
    if (sidebar) sidebar.classList.remove('hidden');
    if (historyBtn) historyBtn.classList.add('active');
    const panelWrap = document.getElementById('panel-wrap');
    if (panelWrap) panelWrap.classList.add('sidebar-open');
    sidebarOpen = true;
  }

  function hideSidebar() {
    const sidebar = document.getElementById('transcript-sidebar');
    const historyBtn = document.getElementById('history-btn');
    if (sidebar) sidebar.classList.add('hidden');
    if (historyBtn) historyBtn.classList.remove('active');
    const panelWrap = document.getElementById('panel-wrap');
    if (panelWrap) panelWrap.classList.remove('sidebar-open');
    sidebarOpen = false;
  }

  function toggleSidebar() {
    if (sidebarOpen) {
      hideSidebar();
    } else {
      showSidebar();
      // FIX #7: Scroll to bottom when opening sidebar
      const list = document.getElementById('ts-list');
      if (list) {
        requestAnimationFrame(() => {
          list.scrollTop = list.scrollHeight;
        });
      }
    }
  }

  // History button toggle
  const historyBtn = document.getElementById('history-btn');
  if (historyBtn) {
    historyBtn.innerHTML = icon('message-square-text', { size: 15 });
    historyBtn.addEventListener('click', toggleSidebar);
  }

  // Close sidebar button
  const closeSidebarBtn = document.getElementById('close-sidebar-btn');
  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener('click', hideSidebar);
  }

  cue.on('history:toggle', toggleSidebar);
  cue.on('sidebar:toggle', toggleSidebar);

  function appendTranscriptHistoryTurn(channel, text, isInterim) {
    const list = document.getElementById('ts-list');
    if (!list) return;

    // Remove placeholder on first real turn
    const ph = list.querySelector('.ts-placeholder');
    if (ph) ph.remove();

    if (isInterim) {
      // Update the single floating interim row
      if (!tsSidebarInterimEl) {
        tsSidebarInterimEl = document.createElement('div');
        tsSidebarInterimEl.className = 'ts-turn ts-' + channel + ' ts-interim-row tc-interim';
        const chLabel = document.createElement('span');
        chLabel.className = 'ts-channel';
        chLabel.textContent = channel === 'them' ? 'Them' : 'You';
        const txt = document.createElement('span');
        txt.className = 'ts-text ts-interim';
        tsSidebarInterimEl.appendChild(chLabel);
        tsSidebarInterimEl.appendChild(txt);
        list.appendChild(tsSidebarInterimEl);
      }
      const txt = tsSidebarInterimEl.querySelector('.ts-text');
      if (txt) txt.textContent = text;
    } else {
      // Remove interim row
      if (tsSidebarInterimEl) { tsSidebarInterimEl.remove(); tsSidebarInterimEl = null; }

      const existingRow = tsLastRow[channel];
      const useExisting = existingRow && existingRow.isConnected;

      if (useExisting) {
        // Append to existing row — accumulates sentence fragments
        const txt = existingRow.querySelector('.ts-text');
        if (txt) {
          txt.textContent = txt.textContent ? txt.textContent + ' ' + text : text;
        }
      } else {
        // Start a new row (no buttons — just clean history view)
        const row = document.createElement('div');
        row.className = 'ts-turn ts-' + channel;

        const chLabel = document.createElement('span');
        chLabel.className = 'ts-channel';
        chLabel.textContent = channel === 'them' ? 'Them' : 'You';

        const txt = document.createElement('span');
        txt.className = 'ts-text';
        txt.textContent = text;

        row.appendChild(chLabel);
        row.appendChild(txt);
        list.appendChild(row);
        tsLastRow[channel] = row;

        // Bound the transcript history DOM so a long session can't grow it
        // without limit (each turn is a node + growing text). Keep the most
        // recent rows; drop the oldest past the cap.
        const TS_MAX_ROWS = 400;
        const count = list.querySelectorAll('.ts-turn').length;
        if (count > TS_MAX_ROWS) {
          const drop = count - TS_MAX_ROWS;
          for (let i = 0; i < drop; i++) {
            const first = list.querySelector('.ts-turn');
            if (!first) break;
            if (tsLastRow.you === first) tsLastRow.you = null;
            if (tsLastRow.them === first) tsLastRow.them = null;
            first.remove();
          }
        }
      }

      // Reset silence timer
      clearTimeout(tsRowTimer[channel]);
      tsRowTimer[channel] = setTimeout(() => { tsLastRow[channel] = null; }, TS_SENTENCE_GAP_MS);

      // When THIS channel speaks, reset the OTHER channel's row
      const other = channel === 'you' ? 'them' : 'you';
      clearTimeout(tsRowTimer[other]);
      tsLastRow[other] = null;

      list.scrollTop = list.scrollHeight;
    }
  }

  function clearTranscriptSidebar() {
    const list = document.getElementById('ts-list');
    if (list) list.innerHTML = '<div class="ts-placeholder">Conversation history will appear here when listening.</div>';
    tsSidebarInterimEl = null;
    tsLastRow.you = null; tsLastRow.them = null;
    clearTimeout(tsRowTimer.you); clearTimeout(tsRowTimer.them);
  }

  function clearTranscriptInterim() {
    if (tsSidebarInterimEl) {
      tsSidebarInterimEl.remove();
      tsSidebarInterimEl = null;
    }
    const list = document.getElementById('ts-list');
    if (!list) return;
    const interims = list.querySelectorAll('.tc-interim, .ts-interim-row');
    interims.forEach(el => el.remove());
  }

  // ---- events from main --------------------------------------------------
  cue.on('capture:state', ({ active, streaming, mode }) => {
    setLiveDotState(active ? 'idle' : 'off');
    $('#stop-btn').classList.toggle('active', active);
    composer.classList.toggle('listening', active);
    const historyBtn = document.getElementById('history-btn');
    if (historyBtn) {
      historyBtn.classList.toggle('listening', active);
    }
    if (active) {
      startMic();
      startSystemAudio();
      // NOTE: History sidebar opens manually when user clicks history button
    } else {
      stopMic();
      stopSystemAudio();
      hideSystemAudioBanner();
    }
    if (active && mode === 'local') {
      sttState = 'local';
      const label = document.getElementById('stt-status');
      if (label) { label.textContent = 'local'; label.className = 'stt-status stt-local'; }
    } else {
      updateSttStatus({ active, streaming });
    }
  });

  // ---- real-time transcript display (interim + final) ----
  cue.on('stt:interim', ({ channel, text }) => {
    setLiveDotState('transcribing');
    appendTranscriptHistoryTurn(channel, text, true);
  });

  cue.on('stt:final', ({ channel, text }) => {
    setLiveDotState('idle');
    clearTranscriptInterim();
  });

  cue.on('stt:status', ({ channel, status, provider }) => {
    cue.log(`[stt] ${provider || channel || 'unknown'} ${status}`);
    if (provider === 'local') {
      const label = document.getElementById('stt-status');
      const localLabels = {
        loading: 'loading local',
        ready: 'local',
        transcribing: 'local',
        stopping: 'stopping',
        off: 'off',
        error: 'error'
      };
      sttState = status === 'ready' || status === 'transcribing' ? 'local' : status;
      if (label) {
        label.textContent = localLabels[status] || status;
        label.className = 'stt-status stt-' + sttState;
      }
      if (status === 'loading') $('#stop-btn').classList.add('active');
      if (status === 'off' || status === 'error') $('#stop-btn').classList.remove('active');
      if (status === 'loading' || status === 'transcribing' || status === 'stopping') setLiveDotState('transcribing');
      if (status === 'ready') setLiveDotState('idle');
      if (status === 'off') setLiveDotState('off');
      return;
    }
    if (status === 'connected') {
      sttState = 'streaming';
      const label = document.getElementById('stt-status');
      if (label) { label.textContent = sttState; label.className = 'stt-status stt-streaming'; }
    }
  });
  cue.on('vad:state', ({ channel, speaking }) => {
    setLiveDotState(speaking ? 'speaking' : 'idle');
  });
  cue.on('llm:start', ({ userBubble, small, category }) => {
    // Clear initial demo/example message if present
    const exampleAi = messages.querySelector('.ai-text:not(.response-group .ai-text)');
    const exampleUser = messages.querySelector('.user-bubble:not(.response-group .user-bubble)');
    if (exampleAi || exampleUser) {
      clearMessages();
      responseCount = 0;
    }
    responseCount++;
    if (responseCount > MAX_RESPONSES) {
      const oldest = messages.querySelector('.response-group');
      if (oldest) oldest.remove();
      responseCount = MAX_RESPONSES;
    }
    const group = document.createElement('div');
    group.className = 'response-group';
    const sep = document.createElement('div');
    sep.className = 'response-sep';
    sep.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    group.appendChild(sep);
    if (userBubble) {
      const b = document.createElement('div');
      b.className = 'user-bubble';
      b.textContent = userBubble;
      group.appendChild(b);
    }
    if (category) {
      const pill = document.createElement('div');
      pill.className = 'category-pill';
      pill.textContent = category.charAt(0).toUpperCase() + category.slice(1);
      group.appendChild(pill);
    }
    aiEl = document.createElement('div');
    aiEl.className = 'ai-text' + (small ? ' small' : '');
    aiEl.dataset.raw = '';
    caretEl = document.createElement('span');
    caretEl.className = 'ai-caret';
    aiEl.appendChild(caretEl);
    group.appendChild(aiEl);
    messages.appendChild(group);
    // Use requestAnimationFrame so the DOM is fully updated before scrolling
    requestAnimationFrame(() => {
      if (sep && sep.isConnected) sep.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    setBusy(true);
  });
  cue.on('llm:token', (data) => {
    const text = (data && (data.text !== undefined ? data.text : data.token)) !== undefined
      ? (data.text !== undefined ? data.text : data.token)
      : (typeof data === 'string' ? data : '');
    appendToken(text);
  });
  cue.on('llm:done', (data) => { finalizeAi(data?.text); setBusy(false); });
  cue.on('llm:error', (data) => {
    const message = data?.message || data?.error || (typeof data === 'string' ? data : 'Request failed');
    if (!aiEl) startAi(true);
    aiEl.dataset.raw = message; finalizeAi(); setBusy(false);
  });
  cue.on('transcript', ({ channel, text }) => {
    if (!text || text.trim().length < 2 || /^[?!.,;:\-…]+$/.test(text.trim())) return;
    appendTranscriptHistoryTurn(channel, text, false);
  });
  let statusTimer = null;
  function showStatus(message) {
    let el = document.getElementById('cue-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cue-status';
      // Insert into panel-main before the action row
      const panelMain = document.getElementById('panel-main');
      const actionRow = document.getElementById('action-row');
      if (panelMain && actionRow && actionRow.parentNode === panelMain) {
        panelMain.insertBefore(el, actionRow);
      } else if (panelMain) {
        panelMain.appendChild(el);
      } else {
        document.getElementById('panel').appendChild(el);
      }
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => el.classList.remove('show'), 11000);
  }
  cue.on('status', ({ message }) => {
    cue.log('[status] ' + message);
    showStatus(message);
    if (sttState !== 'disconnected') {
      const lower = message.toLowerCase();
      if (lower.includes('error') || lower.includes(' off')) {
        sttState = 'error';
        const label = document.getElementById('stt-status');
        if (label) { label.textContent = sttState; label.className = 'stt-status stt-error'; }
      }
    }
  });

  // ---- prep status & smart tooltip helpers -------------------------------


  // ---- AI rules: live char counter + soft cap ---------------------------
  function updateAiRulesCounter() {
    const el = document.getElementById('ai-rules');
    const counter = document.getElementById('ai-rules-count');
    if (!el || !counter) return;
    const n = el.value.length;
    const cap = 2000;
    counter.textContent = String(n);
    counter.classList.toggle('over', n >= cap);
    counter.parentElement.classList.toggle('s-counter-warn', n >= cap - 100);
  }
  const aiRulesEl = document.getElementById('ai-rules');
  if (aiRulesEl) aiRulesEl.addEventListener('input', updateAiRulesCounter);
  function updatePrepStatus() {
    if (!settings) return;
    const fields = {
      resume:  !!(settings.resumeText && settings.resumeText.trim()),
      jd:      !!(settings.jobDescription && settings.jobDescription.trim()),
      stories: !!(settings.starStories && settings.starStories.trim()),
      salary:  !!(settings.salaryTarget && settings.salaryTarget.trim())
    };
    document.querySelectorAll('#prep-status .prep-item').forEach((el) => {
      const loaded = fields[el.dataset.field];
      el.classList.toggle('loaded', loaded);
      el.classList.toggle('missing', !loaded);
      el.title = loaded
        ? el.textContent.trim() + ' loaded'
        : el.textContent.trim() + ' not set — add in Settings';
    });
  }

  function updateSmartTooltip() {
    if (!settings) return;
    const m = settings.models[settings.provider] || { fast: '', smart: '' };
    const fast = m.fast || 'fast model';
    const smart = m.smart || 'smart model';
    const btn = document.getElementById('smart-toggle');
    if (btn) btn.title = 'Fast: ' + fast + ' · Smart: ' + smart + ' (higher quality, ~2× slower)';
  }

  // ---- microphone permission banner --------------------------------------
  function showMicPermissionBanner() {
    let banner = document.getElementById('mic-perm-banner');
    if (banner) { banner.classList.add('show'); return; }
    banner = document.createElement('div');
    banner.id = 'mic-perm-banner';
    banner.className = 'show';
    banner.innerHTML =
      '<div class="mic-perm-text">' +
        '<strong>🎙️ Microphone access required</strong><br>' +
        'cue needs microphone permission to hear you during calls. Grant access in System Settings, then restart cue.' +
      '</div>' +
      '<div class="mic-perm-actions"></div>';
    const actions = banner.querySelector('.mic-perm-actions');
    if (cue.platform === 'darwin') {
      const openBtn = document.createElement('button');
      openBtn.textContent = 'Open Microphone Settings';
      openBtn.addEventListener('click', () => cue.openPane('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'));
      actions.appendChild(openBtn);
    }
    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.className = 'dismiss';
    dismissBtn.addEventListener('click', () => banner.classList.remove('show'));
    actions.appendChild(dismissBtn);
    const panel = document.getElementById('panel');
    panel.insertBefore(banner, document.getElementById('action-row'));
  }

  // ---- system audio loopback banner --------------------------------------
  // Persistent (not a transient toast) warning shown when getDisplayMedia
  // returns zero loopback audio tracks — i.e. the "them" channel is silent.
  // Showed instead of the previous one-line toast because the failure was
  // easy to miss and the user didn't realise cue couldn't hear the AI
  // interviewer. The banner has a Retry button so the user can re-trigger a
  // fresh getDisplayMedia without restarting listening.
  function showSystemAudioBanner(reason) {
    let banner = document.getElementById('sys-audio-banner');
    if (banner) {
      if (reason) banner.querySelector('.sys-audio-text .reason') &&
        (banner.querySelector('.sys-audio-text .reason').textContent = reason);
      banner.classList.add('show');
      return;
    }
    banner = document.createElement('div');
    banner.id = 'sys-audio-banner';
    banner.className = 'show';
    const isWin = cue.platform === 'win32';
    const text = isWin
      ? 'cue cannot hear the other person\'s audio. When the screen-share prompt appears, tick "Share audio" (or pick your speakers as the audio source). If it never appears, check Windows Settings → Privacy & security → Allow desktop apps to capture audio.'
      : isLinux
        ? 'cue cannot hear the other person\'s audio. Linux has no built-in app-audio loopback — route your speakers\' monitor into cue: run `pactl load-module module-loopback`, or set cue\'s input to "Monitor of <your speakers>" with pavucontrol. Your screen and microphone still work.'
        : 'cue cannot hear the other person\'s audio. Meeting-audio loopback needs macOS 14.4+ and Screen Recording permission for cue. Your screen and microphone still work.';
    banner.innerHTML =
      '<div class="sys-audio-text">' +
        '<strong>🔊 System audio not captured</strong><br>' +
        '<span class="reason">' + text + '</span>' +
      '</div>' +
      '<div class="sys-audio-actions"></div>';
    const actions = banner.querySelector('.sys-audio-actions');
    const retryBtn = document.createElement('button');
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', async () => {
      banner.classList.remove('show');
      try { await startSystemAudio(); } catch (_) { /* startSystemAudio shows its own banner */ }
    });
    actions.appendChild(retryBtn);
    if (isWin) {
      const helpBtn = document.createElement('button');
      helpBtn.textContent = 'Open Sound settings';
      helpBtn.addEventListener('click', () => cue.openPane('ms-settings:sound'));
      actions.appendChild(helpBtn);
    }
    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.className = 'dismiss';
    dismissBtn.addEventListener('click', () => banner.classList.remove('show'));
    actions.appendChild(dismissBtn);
    const panel = document.getElementById('panel');
    panel.insertBefore(banner, document.getElementById('action-row'));
  }
  function hideSystemAudioBanner() {
    const banner = document.getElementById('sys-audio-banner');
    if (banner) banner.classList.remove('show');
  }

  // ---- settings ----------------------------------------------------------
  const scrim = $('#settings-scrim');
  function openSettings() {
    fillSettings();
    scrim.classList.remove('hidden');
    refreshWhisperModels();
    refreshAndroidStatus();
  }
  async function closeSettings() {
    if (await saveSettings()) scrim.classList.add('hidden');
  }
  $('#more-btn').addEventListener('click', openSettings);
  $('#s-close').addEventListener('click', () => { void closeSettings(); });
  scrim.addEventListener('click', (e) => { if (e.target === scrim) void closeSettings(); });

  // Tab switching
  document.querySelectorAll('.s-tab').forEach((tab) => {
    tab.addEventListener('click', async () => {
      if (tab.classList.contains('on')) return;
      saveSettings().catch(() => {});
      document.querySelectorAll('.s-tab').forEach(t => t.classList.remove('on'));
      document.querySelectorAll('.s-tab-pane').forEach(p => p.classList.add('hidden'));
      tab.classList.add('on');
      const pane = document.querySelector(`.s-tab-pane[data-pane="${tab.dataset.tab}"]`);
      if (pane) pane.classList.remove('hidden');
    });
  });

  function updateCustomProviderFields() {
    $('#custom-endpoint-settings').classList.toggle('hidden', settings.provider !== 'custom');
  }

  function fillSettings() {
    // Keys tab
    document.querySelectorAll('#provider-seg button').forEach((b) => b.classList.toggle('on', b.dataset.provider === settings.provider));
    $('#key-openai').value = settings.apiKeys.openai || '';
    $('#key-anthropic').value = settings.apiKeys.anthropic || '';
    $('#key-gemini').value = settings.apiKeys.gemini || '';
    $('#key-deepgram').value = settings.apiKeys.deepgram || '';
    $('#key-custom').value = settings.apiKeys.custom || '';
    $('#base-url').value = settings.baseUrl || '';
    updateCustomProviderFields();
    $('#key-ollama').value = settings.apiKeys.ollama || '';
    $('#key-groq').value = settings.apiKeys.groq || '';
    $('#key-minimax').value = settings.apiKeys.minimax || '';
    document.querySelectorAll('#minimax-region-seg button').forEach((b) => b.classList.toggle('on', b.dataset.region === (settings.minimaxRegion || 'global_en')));
    $('#key-azure').value = settings.apiKeys.azure || '';
    $('#azure-endpoint').value = settings.azureEndpoint || '';
    const m = settings.models[settings.provider] || { fast: '', smart: '' };
    $('#model-fast').value = m.fast; $('#model-smart').value = m.smart;
    fillAppLinkCallers();
    $('#s-status').textContent = statusText();
    // Transcription tab
    document.querySelectorAll('#stt-provider-seg button').forEach((button) => {
      button.classList.toggle('on', button.dataset.sttProvider === (settings.sttProvider || 'auto'));
    });
    const localWhisper = settings.localWhisper || { modelId: 'base.en', language: 'auto', threads: 0 };
    $('#whisper-language').value = localWhisper.language || 'auto';
    $('#whisper-threads').value = Number(localWhisper.threads) || 0;
    // Profile tab
    $('#resume-text').value = settings.resumeText || '';
    $('#job-description').value = settings.jobDescription || '';
    // Interview Prep tab
    $('#star-stories').value = settings.starStories || '';
    $('#why-company').value = settings.whyCompany || '';
    $('#why-leaving').value = settings.whyLeaving || '';
    $('#work-style').value = settings.workStyle || '';
    // Style tab
    $('#ai-rules').value = settings.aiRules || '';
    updateAiRulesCounter();
    // Q&A tab
    $('#salary-target').value = settings.salaryTarget || '';
    $('#questions-to-ask').value = settings.questionsToAsk || '';
  }

  // Whoever cue has been told it may answer questions for. Empty is the normal
  // state — nothing appears here until something has asked and been allowed.
  async function fillAppLinkCallers() {
    const host = $('#applink-callers');
    if (!host || !cue.appLinkState) return;
    let state;
    try { state = await cue.appLinkState(); } catch (_) { return; }
    const callers = Object.entries((state && state.callers) || {});
    if (!callers.length) {
      host.innerHTML = '<div class="s-caller-empty">Nothing has asked yet.</div>';
      return;
    }
    host.innerHTML = '';
    for (const [id, scopes] of callers) {
      const allowed = Object.entries(scopes)
        .filter(([, record]) => record && record.decision === 'granted')
        .map(([scope]) => (scope === 'action' ? 'control' : 'read'));
      const name = (scopes.read && scopes.read.callerName) || (scopes.action && scopes.action.callerName) || id;

      const row = document.createElement('div');
      row.className = 's-caller';
      const label = document.createElement('span');
      label.textContent = name + ' — ' + (allowed.length ? allowed.join(' + ') : 'denied');
      label.title = id;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Forget';
      button.addEventListener('click', async () => {
        await cue.appLinkRevoke(id);
        fillAppLinkCallers();
      });
      row.append(label, button);
      host.append(row);
    }
  }

  const uploadResumeBtn = document.getElementById('upload-resume-btn');
  if (uploadResumeBtn) uploadResumeBtn.addEventListener('click', async () => {
    const res = await cue.pickProfileDocument();
    if (!res || res.canceled) return;
    if (res.error) { showStatus('Resume import failed: ' + res.error); return; }
    $('#resume-text').value = res.text || '';
    showStatus('Imported ' + res.fileName + ' — press Save to keep it.');
  });
  const uploadJdBtn = document.getElementById('upload-jd-btn');
  if (uploadJdBtn) uploadJdBtn.addEventListener('click', async () => {
    const res = await cue.pickProfileDocument();
    if (!res || res.canceled) return;
    if (res.error) { showStatus('Job description import failed: ' + res.error); return; }
    $('#job-description').value = res.text || '';
    showStatus('Imported ' + res.fileName + ' — press Save to keep it.');
  });

  function statusText() {
    const k = settings.apiKeys;
    const labels = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', deepgram: 'Deepgram', custom: 'Custom', ollama: 'Ollama', groq: 'Groq', minimax: 'MiniMax', azure: 'Azure AI Foundry' };
    const has = Object.keys(labels).filter((p) => k[p]).map((p) => labels[p]);
    // 'auto' walks the same fallback chain src/stt.js builds; an explicit choice
    // is reported as-is so the status line matches what will actually be used.
    const selectedSttProvider = settings.sttProvider || 'auto';
    const automaticStt = k.deepgram ? 'Deepgram (streaming)' : (k.openai ? 'OpenAI Realtime' : (k.groq ? 'Groq Whisper' : (k.gemini ? 'Gemini (batch)' : 'none')));
    const stt = selectedSttProvider === 'auto' ? automaticStt : selectedSttProvider;
    const ready = [
      settings.resumeText ? '✓ resume' : null,
      settings.jobDescription ? '✓ JD' : null,
      settings.starStories ? '✓ stories' : null,
      settings.salaryTarget ? '✓ salary' : null
    ].filter(Boolean);
    return `${labels[settings.provider] || settings.provider} · STT: ${stt}` + (ready.length ? ' · ' + ready.join(' · ') : '');
  }

  document.querySelectorAll('#provider-seg button').forEach((b) => b.addEventListener('click', () => {
    settings.provider = b.dataset.provider;
    document.querySelectorAll('#provider-seg button').forEach((x) => x.classList.toggle('on', x === b));
    updateCustomProviderFields();
    const m = settings.models[settings.provider] || { fast: '', smart: '' };
    $('#model-fast').value = m.fast; $('#model-smart').value = m.smart;
    $('#s-status').textContent = statusText();
    updateSmartTooltip();
  }));
  document.querySelectorAll('#minimax-region-seg button').forEach((b) => b.addEventListener('click', () => {
    settings.minimaxRegion = b.dataset.region;
    document.querySelectorAll('#minimax-region-seg button').forEach((x) => x.classList.toggle('on', x === b));
  }));

  document.querySelectorAll('#stt-provider-seg button').forEach((button) => button.addEventListener('click', () => {
    settings.sttProvider = button.dataset.sttProvider;
    document.querySelectorAll('#stt-provider-seg button').forEach((candidate) => {
      candidate.classList.toggle('on', candidate === button);
    });
    $('#s-status').textContent = statusText();
  }));

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    const units = ['B', 'KB', 'MB', 'GB'];
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** unitIndex);
    return `${value >= 10 || unitIndex < 2 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
  }

  function getSelectedWhisperModel() {
    if (!whisperOverview) return null;
    return whisperOverview.models.find((model) => model.id === $('#whisper-model').value) || null;
  }

  function renderWhisperModelState() {
    const model = getSelectedWhisperModel();
    if (!model) return;
    const language = model.englishOnly ? 'English only' : 'Multilingual';
    const recommendation = model.recommended ? ' · recommended default' : '';
    const partial = model.partialBytes > 0 && !model.installed
      ? ` · ${formatBytes(model.partialBytes)} ready to resume`
      : '';
    $('#whisper-model-detail').textContent = `${formatBytes(model.bytes)} · ${language} · ${model.quantization} · ${model.hardwareTier}${recommendation}${partial}`;

    const progressWrap = $('#whisper-progress-wrap');
    const progressPercent = model.bytes > 0 ? Math.floor((model.partialBytes / model.bytes) * 100) : 0;
    progressWrap.classList.toggle('hidden', !model.downloading);
    $('#whisper-progress').value = progressPercent;
    $('#whisper-progress-label').textContent = `${progressPercent}%`;
    $('#whisper-download').disabled = model.installed || model.downloading;
    $('#whisper-download').textContent = model.installed ? 'Installed' : (model.partialBytes ? 'Resume' : 'Download');
    $('#whisper-cancel').classList.toggle('hidden', !model.downloading);
    $('#whisper-import').disabled = model.downloading;
    $('#whisper-delete').disabled = (model.installedBytes === 0 && model.partialBytes === 0) || model.downloading;
  }

  async function refreshWhisperModels() {
    const status = $('#whisper-status');
    try {
      const previousSelection = $('#whisper-model').value || settings.localWhisper?.modelId || 'base.en';
      whisperOverview = await cue.whisperModels();
      const runtimeBadge = $('#whisper-runtime-status');
      runtimeBadge.classList.toggle('ready', whisperOverview.runtime.available);
      runtimeBadge.classList.toggle('error', !whisperOverview.runtime.available);
      runtimeBadge.textContent = whisperOverview.runtime.available
        ? `Ready · v${whisperOverview.runtime.version} · ${whisperOverview.runtime.target}`
        : 'Not prepared';
      runtimeBadge.title = whisperOverview.runtime.message || '';

      const select = $('#whisper-model');
      select.innerHTML = '';
      for (const model of whisperOverview.models) {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = `${model.label} — ${formatBytes(model.bytes)}${model.recommended ? ' (recommended)' : ''}${model.installed ? ' ✓' : ''}`;
        select.appendChild(option);
      }
      const selectionExists = whisperOverview.models.some((model) => model.id === previousSelection);
      select.value = selectionExists ? previousSelection : 'base.en';
      if (!settings.localWhisper) settings.localWhisper = {};
      settings.localWhisper.modelId = select.value;
      status.textContent = whisperOverview.runtime.available
        ? 'Model files are verified before they can be loaded.'
        : whisperOverview.runtime.message;
      renderWhisperModelState();
    } catch (error) {
      status.textContent = `Could not load local model information: ${error.message}`;
    }
  }

  $('#whisper-model').addEventListener('change', () => {
    if (!settings.localWhisper) settings.localWhisper = {};
    settings.localWhisper.modelId = $('#whisper-model').value;
    renderWhisperModelState();
  });

  $('#whisper-download').addEventListener('click', async () => {
    const model = getSelectedWhisperModel();
    if (!model) return;
    model.downloading = true;
    renderWhisperModelState();
    $('#whisper-status').textContent = `Downloading ${model.id}. You can cancel and resume later.`;
    try {
      await cue.whisperModelDownload(model.id);
      $('#whisper-status').textContent = `${model.id} downloaded and verified.`;
    } catch (error) {
      $('#whisper-status').textContent = error.message.includes('cancelled')
        ? `${model.id} download paused. Progress was kept.`
        : `Download failed: ${error.message}`;
    } finally {
      await refreshWhisperModels();
    }
  });

  $('#whisper-cancel').addEventListener('click', async () => {
    const model = getSelectedWhisperModel();
    if (model) await cue.whisperModelCancel(model.id);
  });

  $('#whisper-import').addEventListener('click', async () => {
    const model = getSelectedWhisperModel();
    if (!model) return;
    $('#whisper-status').textContent = `Verifying imported ${model.id}…`;
    try {
      const result = await cue.whisperModelImport(model.id);
      $('#whisper-status').textContent = result.cancelled ? 'Import cancelled.' : `${model.id} imported and verified.`;
    } catch (error) {
      $('#whisper-status').textContent = `Import failed: ${error.message}`;
    } finally {
      await refreshWhisperModels();
    }
  });

  $('#whisper-delete').addEventListener('click', async () => {
    const model = getSelectedWhisperModel();
    if (!model || !window.confirm(`Delete the ${model.id} model (${formatBytes(model.bytes)}) from this computer?`)) return;
    try {
      await cue.whisperModelDelete(model.id);
      $('#whisper-status').textContent = `${model.id} deleted.`;
    } catch (error) {
      $('#whisper-status').textContent = `Delete failed: ${error.message}`;
    } finally {
      await refreshWhisperModels();
    }
  });

  cue.on('whisper:download-progress', (progress) => {
    if (!whisperOverview) return;
    const model = whisperOverview.models.find((candidate) => candidate.id === progress.modelId);
    if (!model) return;
    model.partialBytes = progress.receivedBytes;
    model.downloading = true;
    if ($('#whisper-model').value === progress.modelId) {
      $('#whisper-progress-wrap').classList.remove('hidden');
      $('#whisper-progress').value = progress.percent;
      $('#whisper-progress-label').textContent = `${progress.percent}%`;
      $('#whisper-model-detail').textContent = `${formatBytes(progress.receivedBytes)} of ${formatBytes(progress.totalBytes)}`;
    }
  });
  cue.on('whisper:models-changed', () => refreshWhisperModels());

  // ---- Android CLI & ADB device bridge ----------------------------------
  async function refreshAndroidStatus() {
    const statusBadge = document.getElementById('android-cli-status');
    const infoEl = document.getElementById('android-cli-info');
    const listEl = document.getElementById('android-device-list');
    if (!statusBadge || !infoEl || !listEl || typeof cue.androidInfo !== 'function') return;

    statusBadge.textContent = 'Scanning…';
    statusBadge.className = 'whisper-badge';

    try {
      const info = await cue.androidInfo();
      if (info.available) {
        statusBadge.textContent = 'Ready (ADB Connected)';
        statusBadge.className = 'whisper-badge ready';
        infoEl.textContent = `ADB Bridge: ${info.adbPath}`;
      } else {
        statusBadge.textContent = 'ADB Not Detected';
        statusBadge.className = 'whisper-badge error';
        infoEl.textContent = 'Android Debug Bridge (ADB) or Android CLI not found in PATH or standard SDK locations.';
      }

      if (info.devices && info.devices.length) {
        listEl.innerHTML = '';
        info.devices.forEach((dev) => {
          const item = document.createElement('div');
          item.className = 'android-device-item';
          item.innerHTML = `
            <div class="device-icon">📱</div>
            <div class="device-meta">
              <div class="device-name">${dev.model || 'Android Phone'} <span class="device-state ${dev.state}">${dev.state}</span></div>
              <div class="device-serial">Serial: ${dev.serial}</div>
            </div>
            <button class="s-action compact-btn screencap-dev-btn" data-serial="${dev.serial}">Snapshot</button>
          `;
          listEl.appendChild(item);
        });

        listEl.querySelectorAll('.screencap-dev-btn').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const serial = btn.dataset.serial;
            btn.disabled = true;
            btn.textContent = 'Capturing…';
            try {
              const imgUrl = await cue.androidScreenCap(serial);
              if (imgUrl) {
                showToast('Android screen captured successfully!', 2000);
              } else {
                showToast('Screen capture failed. Check device screen lock.', 3000);
              }
            } catch (err) {
              showToast('Error: ' + (err.message || err), 3000);
            } finally {
              btn.disabled = false;
              btn.textContent = 'Snapshot';
            }
          });
        });
      } else {
        listEl.innerHTML = `<div class="s-note">No Android devices connected. Connect via USB with USB Debugging enabled, or pair via Wi-Fi ADB (<code>adb connect &lt;ip&gt;:5555</code>).</div>`;
      }
    } catch (err) {
      statusBadge.textContent = 'Error';
      statusBadge.className = 'whisper-badge error';
      infoEl.textContent = 'Failed to query Android environment: ' + (err.message || err);
    }
  }

  const androidRefreshBtn = document.getElementById('android-refresh-btn');
  if (androidRefreshBtn) {
    androidRefreshBtn.addEventListener('click', () => refreshAndroidStatus());
  }

  const androidScreencapBtn = document.getElementById('android-screencap-btn');
  if (androidScreencapBtn) {
    androidScreencapBtn.addEventListener('click', async () => {
      androidScreencapBtn.disabled = true;
      androidScreencapBtn.textContent = 'Capturing…';
      try {
        const imgUrl = await cue.androidScreenCap();
        if (imgUrl) {
          showToast('Android screen capture received!', 2000);
        } else {
          showToast('No Android device responded. Ensure phone is unlocked.', 3000);
        }
      } catch (err) {
        showToast('Screen capture error: ' + (err.message || err), 3000);
      } finally {
        androidScreencapBtn.disabled = false;
        androidScreencapBtn.textContent = 'Test Screen Capture';
      }
    });
  }

  const openPhoneLinkBtn = document.getElementById('open-phonelink-btn');
  if (openPhoneLinkBtn) {
    openPhoneLinkBtn.addEventListener('click', () => {
      if (cue.platform === 'win32') {
        cue.openPane('ms-phone-link:');
      } else {
        showToast('Phone Link is available on Windows 10/11.', 2500);
      }
    });
  }

  async function saveSettings() {
    // Keys
    settings.apiKeys.openai = $('#key-openai').value.trim();
    settings.apiKeys.anthropic = $('#key-anthropic').value.trim();
    settings.apiKeys.gemini = $('#key-gemini').value.trim();
    settings.apiKeys.deepgram = $('#key-deepgram').value.trim();
    settings.apiKeys.custom = $('#key-custom').value.trim();
    settings.baseUrl = $('#base-url').value.trim();
    settings.apiKeys.ollama = $('#key-ollama').value.trim();
    settings.apiKeys.groq = $('#key-groq').value.trim();
    settings.apiKeys.minimax = $('#key-minimax').value.trim();
    settings.apiKeys.azure = $('#key-azure').value.trim();
    settings.azureEndpoint = $('#azure-endpoint').value.trim();
    if (!settings.models[settings.provider]) settings.models[settings.provider] = {};
    settings.models[settings.provider].fast = $('#model-fast').value.trim();
    settings.models[settings.provider].smart = $('#model-smart').value.trim();
    // Transcription
    if (!settings.localWhisper) settings.localWhisper = {};
    settings.localWhisper.modelId = $('#whisper-model').value || settings.localWhisper.modelId || 'base.en';
    settings.localWhisper.language = $('#whisper-language').value || 'auto';
    settings.localWhisper.threads = Math.max(0, Math.min(64, Number.parseInt($('#whisper-threads').value, 10) || 0));
    // Profile
    settings.resumeText = $('#resume-text').value.trim();
    settings.jobDescription = $('#job-description').value.trim();
    // Interview Prep
    settings.starStories = $('#star-stories').value.trim();
    settings.whyCompany = $('#why-company').value.trim();
    settings.whyLeaving = $('#why-leaving').value.trim();
    settings.workStyle = $('#work-style').value.trim();
    // Style tab
    settings.aiRules = $('#ai-rules').value.trim();
    // Q&A
    settings.salaryTarget = $('#salary-target').value.trim();
    settings.questionsToAsk = $('#questions-to-ask').value.trim();
    try {
      settings = await cue.settingsSet(settings);
      $('#s-status').textContent = statusText();
      updatePrepStatus();
      updateSmartTooltip();
      return true;
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      $('#s-status').textContent = message;
      $('#base-url').focus();
      return false;
    }
  }

  // ---- example conversation (matches the reference screenshot) ------------
  function showExample() {
    clearMessages();
    addUserBubble('What should I say?');
    const ai = document.createElement('div');
    ai.className = 'ai-text';
    ai.textContent = '“A discounted cash flow model values a company by projecting future free cash flows and discounting them to present value using the weighted average cost of capital.”';
    messages.appendChild(ai);
  }

  // ---- global keys -------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !scrim.classList.contains('hidden')) closeSettings();
    if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); openSettings(); }
  });

  // ---- smooth window dragging via drag-pill -----------------------------
  const dragPills = Array.from(document.querySelectorAll('.drag-pill, .drag-handle'));
  dragPills.forEach((pill) => {
    let isDragging = false;
    let startScreenX = 0, startScreenY = 0;
    pill.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button, input, textarea, a')) return;
      isDragging = true;
      startScreenX = e.screenX;
      startScreenY = e.screenY;
      setIgnore(false);
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.screenX - startScreenX;
      const dy = e.screenY - startScreenY;
      startScreenX = e.screenX;
      startScreenY = e.screenY;
      cue.windowMoveBy(dx, dy);
    });
    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  });

  // ---- click-through & mouse interactivity ---------------------------------
  let ignoring = false;
  function setIgnore(v) {
    if (cue && cue.platform === 'linux') return;
    if (v !== ignoring) {
      ignoring = v;
      cue.setIgnoreMouse(v);
    }
  }

  // Self-healing: Windows can stop forwarding mousemove events while
  // click-through is active, which used to leave the overlay stuck in an
  // unclickable state (the "pill disappeared" bug). We track the last known
  // cursor position from real events AND from the main-process watchdog
  // ('cursor:pos', polled via screen.getCursorScreenPoint), and periodically
  let lastCursor = { x: -1, y: -1 };
  function pointOverUI(x, y) {
    if (x < 0 || y < 0) return false;
    const el = document.elementFromPoint(x, y);
    if (!el || typeof el.closest !== 'function') return false;

    const settingsScrim = el.closest('#settings-scrim');
    if (settingsScrim && settingsScrim.classList.contains('hidden')) return false;

    const onboardScrim = el.closest('#onboard-scrim');
    if (onboardScrim && onboardScrim.classList.contains('hidden')) return false;

    const consentScrim = el.closest('#consent-scrim');
    if (consentScrim && consentScrim.classList.contains('hidden')) return false;

    const sidebar = el.closest('#transcript-sidebar');
    if (sidebar && (sidebar.classList.contains('hidden') || sidebar.style.display === 'none')) {
      return false;
    }

    return !!el.closest('#toolbar, #panel-wrap, #transcript-sidebar, #settings-scrim, #onboard-scrim, #consent-scrim, #resize-grip');
  }
  document.addEventListener('mousemove', (e) => {
    lastCursor = { x: e.clientX, y: e.clientY };
    setIgnore(!pointOverUI(e.clientX, e.clientY));
  });
  document.addEventListener('mouseenter', () => setIgnore(false));
  cue.on('cursor:pos', ({ x, y }) => {
    lastCursor = { x, y };
    setIgnore(!pointOverUI(x, y));
  });
  setInterval(() => {
    if (!ignoring) return;
    if (pointOverUI(lastCursor.x, lastCursor.y)) setIgnore(false);
  }, 400);
  setIgnore(false);

  // ---- manual resize (frameless window has no native edge handles) -------
  const grip = $('#resize-grip');
  if (grip) {
    let resizing = false;
    let startX = 0, startY = 0, startW = 0, startH = 0;
    grip.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      resizing = true;
      startX = e.screenX; startY = e.screenY;
      startW = window.outerWidth; startH = window.outerHeight;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!resizing) return;
      const w = startW + (e.screenX - startX);
      const h = startH + (e.screenY - startY);
      cue.windowResize(w, h);
    });
    document.addEventListener('mouseup', () => { resizing = false; });
  }

  // ---- assistant access request ------------------------------------------
  // Shown here rather than as a native dialog because cue hides its dock icon:
  // an OS panel from an accessory app never comes forward and cannot be
  // clicked. Note the scrim is registered in the click-through selector above
  // and in styles.css — without both, this window stays transparent to the
  // mouse and the buttons do nothing.
  const consentScrim = $('#consent-scrim');
  let pendingConsentId = null;

  function answerConsent(allowed) {
    if (!pendingConsentId) return;
    cue.appLinkConsentRespond(pendingConsentId, allowed);
    pendingConsentId = null;
    consentScrim.classList.add('hidden');
  }

  cue.on('applink:consent-request', (request) => {
    pendingConsentId = request.id;
    $('#cs-title').textContent = request.message;
    $('#cs-body').textContent = request.detail;
    $('#cs-allow').textContent = request.allowLabel;
    consentScrim.classList.remove('hidden');
    // Do not wait for a mousemove to turn the mouse back on: the pointer may
    // already be still, and the sheet would be unclickable until it moved.
    setIgnore(false);
    $('#cs-deny').focus();
  });

  $('#cs-allow').addEventListener('click', () => answerConsent(true));
  $('#cs-deny').addEventListener('click', () => answerConsent(false));
  // Anything other than a deliberate Allow is a no, including Escape and
  // clicking away.
  consentScrim.addEventListener('click', (e) => { if (e.target === consentScrim) answerConsent(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pendingConsentId) { e.preventDefault(); answerConsent(false); }
  });

  // ---- onboarding / first-run tutorial -----------------------------------
  const obScrim = $('#onboard-scrim');
  const permissionHelp = isWindows
    ? 'cue needs permission to see and hear. Open Windows Privacy & security settings, allow <strong>Microphone</strong> and <strong>Screen recording</strong> for cue, then come back here.'
    : isLinux
      ? 'On Linux there is no permission prompt to accept — just make sure your microphone is not muted (check <strong>pavucontrol</strong> or GNOME Settings → Privacy → Microphone) and that a screen is available to capture. Wayland users: X11 or XWayland gives the most reliable capture.'
      : 'cue needs two macOS permissions. Click each button, turn <strong>cue</strong> ON in the window that opens, then come back here.';
  const permissionButtons = isWindows
    ? [
        { label: 'Open Microphone settings', action: () => cue.openPane('ms-settings:privacy-microphone') },
        { label: 'Open Screen recording settings', action: () => cue.openPane('ms-settings:privacy-screenrecorder') }
      ]
    : isLinux
      ? []
      : [
          { label: 'Open Microphone settings', action: () => cue.openPane('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone') },
          { label: 'Open Screen Recording settings', action: () => cue.openPane('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture') }
        ];
  const assistShortcut = usesCtrl ? '<span class="kbd">Ctrl</span> <span class="kbd">↵</span>' : '<span class="kbd">⌘</span> <span class="kbd">↵</span>';
  const solveShortcut = usesCtrl ? '<span class="kbd">Ctrl</span> <span class="kbd">H</span>' : '<span class="kbd">⌘</span> <span class="kbd">H</span>';
  const quitShortcut = usesCtrl ? '<span class="kbd">Ctrl</span><span class="kbd">⇧</span><span class="kbd">X</span>' : '<span class="kbd">⌘</span><span class="kbd">⇧</span><span class="kbd">X</span>';
  const OB_STEPS = [
    {
      icon: '👋',
      title: 'Welcome to cue',
      body: 'cue is a private AI copilot that floats over your screen. It can <strong>see your screen</strong>, <strong>hear your meetings</strong>, and help you answer questions or solve coding problems — while staying hidden from most screen shares.<br><br>This quick guide gets you running in about a minute.'
    },
    {
      icon: '🔐',
      title: 'Allow cue to see & hear',
      body: permissionHelp + '<ul><li><strong>Microphone</strong> — to hear you</li><li><strong>Screen recording</strong> — to see your screen and hear meeting audio</li></ul>',
      buttons: permissionButtons
    },
    {
      icon: '🔑',
      title: 'Connect an AI provider',
      body: 'cue uses <strong>your own</strong> API key — pick <span class="hl">OpenAI</span>, <span class="hl">Anthropic</span>, <span class="hl">Google Gemini</span>, or <span class="hl">Azure AI Foundry</span>. Get a key from your provider, then paste it into cue\'s Settings.<br><br><strong>Tip:</strong> For the <em>best</em> real-time listening, add a <span class="hl">Deepgram</span> key (lowest latency streaming transcription). Otherwise, an OpenAI key enables streaming via the Realtime API, and Gemini/Whisper work as batch fallbacks.',
      buttons: [{ label: 'Open cue Settings', action: () => { finishOnboard(); openSettings(); } }]
    },
    {
      icon: '🫥',
      title: 'Stay hidden in Zoom',
      body: 'cue is hidden from most screen shares automatically (Google Meet, Teams, QuickTime — nothing to do). <strong>Zoom needs one setting:</strong><br><br>Zoom → <span class="hl">Settings</span> → <span class="hl">Share Screen</span> → <span class="hl">Advanced</span> → <strong>Screen capture mode</strong> → choose <strong>“Advanced capture with window filtering.”</strong><br><br>Avoid “<strong>without</strong> window filtering” — that mode reveals cue.'
    },
    {
      icon: '✨',
      title: 'You’re all set',
      body: 'How to use cue:<ul><li>' + assistShortcut + ' — <strong>Assist</strong> with whatever\'s on screen or being said</li><li>' + solveShortcut + ' — solve a coding problem on screen</li><li>Click <strong>▢</strong> in the top bar to start listening to a meeting</li><li>Type a question and press <span class="kbd">↵</span></li></ul>Reopen this guide anytime by clicking the <strong>cue logo</strong>. Quit with ' + quitShortcut + '.'
    }
  ];
  let obIndex = 0;
  function renderOnboard() {
    const step = OB_STEPS[obIndex];
    $('#ob-icon').textContent = step.icon;
    $('#ob-title').textContent = step.title;
    $('#ob-body').innerHTML = step.body;
    const btns = $('#ob-buttons'); btns.innerHTML = '';
    (step.buttons || []).forEach((b) => { const el = document.createElement('button'); el.textContent = b.label; el.addEventListener('click', b.action); btns.appendChild(el); });
    const dots = $('#ob-dots'); dots.innerHTML = '';
    OB_STEPS.forEach((_, i) => { const d = document.createElement('span'); if (i === obIndex) d.className = 'on'; dots.appendChild(d); });
    $('#ob-back').style.visibility = obIndex === 0 ? 'hidden' : 'visible';
    $('#ob-next').textContent = obIndex === OB_STEPS.length - 1 ? 'Done' : 'Next';
    $('#ob-skip').style.visibility = obIndex === OB_STEPS.length - 1 ? 'hidden' : 'visible';
  }
  function showOnboard() { obIndex = 0; renderOnboard(); obScrim.classList.remove('hidden'); setIgnore(false); }
  async function finishOnboard() {
    obScrim.classList.add('hidden');
    if (settings && !settings.onboarded) { settings.onboarded = true; await cue.settingsSet({ onboarded: true }); }
  }
  $('#ob-next').addEventListener('click', () => { if (obIndex === OB_STEPS.length - 1) finishOnboard(); else { obIndex++; renderOnboard(); } });
  $('#ob-back').addEventListener('click', () => { if (obIndex > 0) { obIndex--; renderOnboard(); } });
  $('#ob-skip').addEventListener('click', finishOnboard);
  $('#logo-btn').addEventListener('click', showOnboard);

  // ---- boot --------------------------------------------------------------
  (async function boot() {
    settings = await cue.settingsGet();
    const platformInfo = await cue.platformInfo();

    // R4: shortcut hints
    const sayHintEl = document.getElementById('say-shortcut-hint');
    const assistHintEl = document.getElementById('assist-shortcut-hint');
    if (sayHintEl) sayHintEl.textContent = usesCtrl ? 'Ctrl+Shift+↵' : '⌘⇧↵';
    if (assistHintEl) assistHintEl.textContent = usesCtrl ? 'Ctrl+↵' : '⌘↵';

    // R5: prep status
    updatePrepStatus();
    // R6: smart tooltip
    updateSmartTooltip();
    // Fix 3: Adjust permission buttons based on actual Windows version.
    // ms-settings:privacy-screenrecorder only exists on Windows 11.
    // On Windows 10, screen capture needs no permission — so replace the button
    // with a more helpful note instead of an invalid settings link.
    if (isWindows && platformInfo.winBuild > 0 && platformInfo.winBuild < 22000) {
      // Windows 10: update the onboarding screen recording button to be more helpful
      const ob = OB_STEPS[1];
      ob.buttons = ob.buttons.filter((b) => !b.label.toLowerCase().includes('screen'));
      ob.body = 'cue needs microphone permission to hear you. Click the button below to open Windows microphone settings and allow cue.<br><br><strong>Screen capture works automatically on Windows 10</strong> — no additional permission needed.<ul><li><strong>Microphone</strong> — to hear you</li><li><strong>Screen recording</strong> — works automatically on Windows 10</li></ul>';
    }

    smartBtn.classList.toggle('on', !!settings.smart);
    showExample();
    syncPlaceholder();
    updateHistoryBadge(); // FIX #3: Initialize badge on boot
    updateSendButtonState(); // Initialize send button state

    // Fix placeholder shortcut hint to match platform
    if (usesCtrl) {
      placeholder.innerHTML = 'Ask about your screen or conversation, or <span class="keycap">Ctrl</span><span class="keycap">⏎</span> for Assist';
    }

    const st = await cue.captureState();
    $('#live-dot').classList.toggle('off', !st.active);
    $('#stop-btn').classList.toggle('active', st.active);
    if (!settings.onboarded) showOnboard();
  })();
})();
