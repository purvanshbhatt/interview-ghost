/* Ghost dashboard renderer — launch surface for mode cards, file context, past
 * sessions, and the full Settings surface.
 *
 * Uses the same preload bridge as the overlay (preload.js). All IPC calls go
 * through window.ghost.* / window.cue.* — see preload.js for the IPC name list.
 */
(function () {
  const cue = window.ghost || window.cue;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const isMac = cue.platform === 'darwin';
  const isWindows = cue.platform === 'win32';
  const usesCtrl = !isMac;

  let modesCache = [];
  let cardState = {}; // mode id -> { files: [...] }
  let settings = {};
  let whisperOverview = null;

  // ---- toast -------------------------------------------------------------
  let toastTimer = null;
  function showToast(text, ms) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), ms || 2000);
  }

  function textEscape(s) { return String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  // ---- navigation tabs ---------------------------------------------------
  const navModes = $('#nav-modes');
  const navGuide = $('#nav-guide');
  const navSessions = $('#nav-sessions');
  const navSettings = $('#nav-settings');
  const modesView = $('#modes-view');
  const guideView = $('#guide-view');
  const sessionsDrawer = $('#past-sessions-drawer');
  const settingsDrawer = $('#settings-drawer');

  function switchMainView(viewName) {
    if (viewName === 'modes') {
      modesView.classList.remove('hidden');
      guideView.classList.add('hidden');
      navModes.classList.add('active');
      navGuide.classList.remove('active');
    } else if (viewName === 'guide') {
      modesView.classList.add('hidden');
      guideView.classList.remove('hidden');
      navModes.classList.remove('active');
      navGuide.classList.add('active');
      updateReadinessChecklist();
    }
  }

  navModes.addEventListener('click', () => switchMainView('modes'));
  navGuide.addEventListener('click', () => switchMainView('guide'));

  navSessions.addEventListener('click', async () => {
    sessionsDrawer.classList.toggle('hidden');
    if (!sessionsDrawer.classList.contains('hidden')) {
      settingsDrawer.classList.add('hidden');
      await loadPastSessionsList();
    }
  });

  navSettings.addEventListener('click', async () => {
    settingsDrawer.classList.toggle('hidden');
    if (!settingsDrawer.classList.contains('hidden')) {
      sessionsDrawer.classList.add('hidden');
      settings = await cue.settingsGet();
      fillSettings();
      refreshWhisperModels();
      refreshAndroidStatus();
    }
  });

  $('#hero-quick-launch').addEventListener('click', () => {
    cue.modeStart('assist').then(onStartResult, onStartError);
  });

  // ---- window controls & maximize ----------------------------------------
  $('#win-minimize').addEventListener('click', () => { if (cue.dashboardMinimize) cue.dashboardMinimize(); });
  const maxBtn = $('#win-maximize');
  if (maxBtn) {
    maxBtn.addEventListener('click', async () => {
      if (cue.dashboardMaximize) {
        const res = await cue.dashboardMaximize();
        if (res && res.isMaximized) {
          maxBtn.textContent = '❐';
          maxBtn.title = 'Restore Window';
        } else {
          maxBtn.textContent = '□';
          maxBtn.title = 'Maximize Window';
        }
      }
    });
  }
  $('#win-close').addEventListener('click', () => cue.quit());

  // Double click header to toggle maximize
  const header = $('.dash-header');
  if (header) {
    header.addEventListener('dblclick', async (e) => {
      if (e.target.closest('button, nav, input, a')) return;
      if (cue.dashboardMaximize) {
        const res = await cue.dashboardMaximize();
        if (maxBtn) maxBtn.textContent = (res && res.isMaximized) ? '❐' : '□';
      }
    });
  }

  cue.on('dashboard:maximized-changed', ({ isMaximized }) => {
    if (maxBtn) {
      maxBtn.textContent = isMaximized ? '❐' : '□';
      maxBtn.title = isMaximized ? 'Restore Window' : 'Maximize Window';
    }
  });

  // ---- Mode Cards with Personality ---------------------------------------
  const MODE_METADATA = {
    assist: {
      icon: '⚡',
      badge: 'STEALTH COPILOT',
      title: 'Ghost Assist',
      desc: 'Omnipresent stealth copilot. Continuously analyzes your screen and conversation to give you instant situational context, live hints, and answers.',
      accent: 'cyan'
    },
    say: {
      icon: '🎙️',
      badge: 'VERBAL PRO',
      title: 'What Should I Say?',
      desc: 'Verbal superpower on demand. Generates crisp, articulate, high-conviction talking points the moment the interviewer finishes their question.',
      accent: 'violet'
    },
    leetcode: {
      icon: '💻',
      badge: 'CODE SOLVER',
      title: 'Coding & LeetCode Slayer',
      desc: 'Algorithmic dominance. Instant time/space complexity analysis, edge-case traps, optimal data structures, and production-ready code.',
      accent: 'emerald'
    },
    mock: {
      icon: '🎭',
      badge: 'SPARRING',
      title: 'Mock Interview Sparring',
      desc: 'Realistic interview sparring partner. Fires sharp follow-up questions, evaluates STAR story structure, and polishes your delivery.',
      accent: 'amber'
    },
    phoneCall: {
      icon: '📱',
      badge: 'MOBILE LINK',
      title: 'Phone Call & Mobile Interview',
      desc: 'Low-profile guidance for phone screeners and mobile recruiter calls via Windows Phone Link or ADB audio bridge.',
      accent: 'blue'
    },
    coffee: {
      icon: '☕',
      badge: 'NETWORKING',
      title: 'Coffee Chat & Networking',
      desc: 'Effortless rapport builder. Generates insightful questions, shared-interest hooks, and smooth conversational transitions.',
      accent: 'rose'
    },
    followup: {
      icon: '🎯',
      badge: 'REVERSE Q&A',
      title: 'Follow-up Interrogator',
      desc: 'Turns the tables. Produces thoughtful, high-leverage questions for the interviewer that showcase deep senior leadership.',
      accent: 'indigo'
    },
    recap: {
      icon: '📋',
      badge: 'SYNTHESIS',
      title: 'Executive Meeting Recap',
      desc: 'Instant synthesis. Distills complex discussions into key decisions, numerical facts, action items, and next steps.',
      accent: 'teal'
    },
    notes: {
      icon: '📝',
      badge: 'SCRATCHPAD',
      title: 'Meeting Notes & Scratchpad',
      desc: 'Quietly tracks key facts, numbers, dates, and commitments made throughout the call.',
      accent: 'slate'
    }
  };

  async function loadModes() {
    const res = await cue.modeList();
    if (!res || !res.ok) {
      $('#mode-cards').innerHTML = '<p class="dash-loading">Failed to load modes.</p>';
      return;
    }
    modesCache = res.modes;
    renderModeCards();
  }

  function renderModeCards() {
    const root = $('#mode-cards');
    root.innerHTML = '';
    for (const mode of modesCache) {
      const meta = MODE_METADATA[mode.id] || {
        icon: '✨',
        badge: mode.id.toUpperCase(),
        title: mode.id,
        desc: 'Custom tactical mode grounded in your dropped context files.',
        accent: 'cyan'
      };

      const card = document.createElement('div');
      card.className = `mode-card accent-${meta.accent}`;
      card.dataset.mode = mode.id;
      card.innerHTML = (
        '<div class="card-glow-bg"></div>' +
        '<div class="mode-header-row">' +
          '<div class="mode-icon-badge">' + meta.icon + '</div>' +
          '<div class="mode-badge-group">' +
            '<span class="mode-tag">' + meta.badge + (mode.needsScreen ? ' · SCREEN' : '') + '</span>' +
            '<span class="mode-files-pill">0 files</span>' +
          '</div>' +
        '</div>' +
        '<h3 class="mode-title">' + meta.title + '</h3>' +
        '<p class="mode-desc">' + meta.desc + '</p>' +
        '<div class="drop-zone">' +
          '<span class="drop-icon">📎</span>' +
          '<span>Drop PDF/DOCX/TXT context files, or use Add file…</span>' +
        '</div>' +
        '<div class="file-list"></div>' +
        '<div class="custom-prompt">' +
          '<button class="cp-toggle" type="button">✏️ Tweak custom prompt</button>' +
          '<textarea class="cp-text hidden" spellcheck="false" placeholder="Optional: replace this mode\'s built-in instruction with your own prompt. It is used alongside your context files."></textarea>' +
          '<div class="cp-meta hidden"><span class="cp-status">Saved</span><button class="cp-clear" type="button">Clear</button></div>' +
        '</div>' +
        '<div class="card-actions">' +
          '<button class="add-file-btn">+ Add file</button>' +
          '<button class="start-btn">Start ' + meta.title + ' &rarr;</button>' +
        '</div>'
      );
      wireModeCard(card, mode);
      root.appendChild(card);
      loadModeContext(mode.id);
    }
  }

  function wireModeCard(card, mode) {
    card.querySelector('.start-btn').addEventListener('click', () => cue.modeStart(mode.id).then(onStartResult, onStartError));
    card.querySelector('.add-file-btn').addEventListener('click', () => cue.modeContextPickAndAdd(mode.id).then((r) => {
      if (r && r.canceled) return showToast('Cancelled', 1200);
      if (r && r.full) return showToast('Max files reached for ' + mode.id + '. Remove one first.', 2500);
      if (r && r.ok) return loadModeContext(mode.id);
      showToast(r && r.error ? r.error : 'Failed to add file', 2500);
    }));

    const dz = card.querySelector('.drop-zone');
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', async (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (!files.length) return showToast('Drop files onto the card.', 2000);
      let added = 0;
      for (const f of files) {
        const filePath = cue.getPathForFile(f);
        if (!filePath) { showToast('Could not read the dropped file path.', 2200); continue; }
        const r = await cue.modeContextAddFile(mode.id, filePath);
        if (r && r.ok) added += 1;
        else if (r && r.full) { showToast('Max files reached for ' + mode.id + '. Remove one first.', 2500); break; }
        else showToast((r && r.error) || 'Failed to add ' + f.name, 2500);
      }
      if (added) { showToast('Added ' + added + ' file' + (added > 1 ? 's' : '') + '.', 1500); loadModeContext(mode.id); }
    });

    const toggle = card.querySelector('.cp-toggle');
    const textarea = card.querySelector('.cp-text');
    const meta = card.querySelector('.cp-meta');
    const status = card.querySelector('.cp-status');
    const clearBtn = card.querySelector('.cp-clear');
    let loaded = false;
    let saveTimer = null;
    function setHasPrompt(has) {
      toggle.classList.toggle('has-prompt', !!has);
      toggle.title = has ? 'Custom prompt active — edit it' : 'Tweak this mode\'s prompt';
    }
    toggle.addEventListener('click', async () => {
      const open = textarea.classList.contains('hidden');
      if (open && !loaded) {
        const r = await cue.modePromptGet(mode.id);
        if (r && r.ok) { textarea.value = r.prompt || ''; setHasPrompt(!!(r.prompt && r.prompt.trim())); loaded = true; }
      }
      textarea.classList.toggle('hidden', !open);
      meta.classList.toggle('hidden', !open);
      if (open) textarea.focus();
    });
    textarea.addEventListener('input', () => {
      clearTimeout(saveTimer);
      status.textContent = 'Saving…';
      saveTimer = setTimeout(async () => {
        const r = await cue.modePromptSet(mode.id, textarea.value);
        status.textContent = (r && r.ok) ? 'Saved' : 'Save failed';
        setHasPrompt(!!(textarea.value && textarea.value.trim()));
      }, 350);
    });
    clearBtn.addEventListener('click', async () => {
      textarea.value = '';
      const r = await cue.modePromptSet(mode.id, '');
      status.textContent = (r && r.ok) ? 'Cleared' : 'Failed';
      setHasPrompt(false);
    });
  }

  async function loadModeContext(modeId) {
    const res = await cue.modeContextList(modeId, false);
    if (!res || !res.ok) return;
    cardState[modeId] = res;
    renderFilesFor(modeId);
  }

  function renderFilesFor(modeId) {
    const card = $('.mode-card[data-mode="' + modeId + '"]');
    if (!card) return;
    const files = (cardState[modeId] && cardState[modeId].files) || [];
    const list = card.querySelector('.file-list');
    list.innerHTML = '';
    for (const f of files) {
      const row = document.createElement('div');
      row.className = 'file-row';
      row.innerHTML = '<span>📄 ' + textEscape(f.name) + ' · ' + (f.sizeChars || 0).toLocaleString() + ' chars</span><button class="file-remove" title="Remove file">✕</button>';
      row.querySelector('.file-remove').addEventListener('click', async () => {
        const res = await cue.modeContextRemoveFile(modeId, f.name);
        if (res && res.ok) loadModeContext(modeId);
        else showToast(res && res.error ? res.error : 'Failed to remove file', 2000);
      });
      list.appendChild(row);
    }
    const cap = (cardState[modeId] && cardState[modeId].max) || 5;
    const pill = card.querySelector('.mode-files-pill');
    if (pill) pill.textContent = files.length + ' / ' + cap + ' files';
    const addBtn = card.querySelector('.add-file-btn');
    if (addBtn) addBtn.disabled = files.length >= cap;
  }

  function onStartResult(res) {
    if (res && res.ok) return showToast('⚡ Stealth Overlay launched.', 1800);
    showToast((res && res.error) || 'Could not start session.', 2500);
  }
  function onStartError(err) { showToast(String(err && err.message || err), 2500); }

  // ---- Setup & Readiness Guide Controller --------------------------------
  function openSettingsTab(tabName) {
    settingsDrawer.classList.remove('hidden');
    sessionsDrawer.classList.add('hidden');
    document.querySelectorAll('#settings-tabs .s-tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tabName));
    document.querySelectorAll('#settings-drawer .s-tab-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== tabName));
    if (tabName === 'audio') refreshWhisperModels();
    if (tabName === 'android') refreshAndroidStatus();
  }

  $('#guide-goto-keys').addEventListener('click', () => openSettingsTab('keys'));
  $('#guide-goto-audio').addEventListener('click', () => openSettingsTab('audio'));
  $('#guide-goto-profile').addEventListener('click', () => openSettingsTab('profile'));
  const guideAndroidBtn = $('#guide-open-android-settings');
  if (guideAndroidBtn) guideAndroidBtn.addEventListener('click', () => openSettingsTab('android'));

  const guidePhoneLinkBtn = $('#guide-open-phonelink');
  if (guidePhoneLinkBtn) {
    guidePhoneLinkBtn.addEventListener('click', () => {
      if (isWindows) cue.openPane('ms-phone-link:');
      else showToast('Phone Link is available on Windows 10/11.', 2500);
    });
  }

  async function updateReadinessChecklist() {
    if (!settings || !settings.apiKeys) settings = await cue.settingsGet();
    let score = 0;

    // Check 1: Key
    const provider = settings.provider || 'gemini';
    const key = (settings.apiKeys && settings.apiKeys[provider]) || '';
    const hasKey = !!(key.trim()) || provider === 'ollama';
    const keyBadge = $('#check-key-badge');
    if (keyBadge) {
      keyBadge.className = hasKey ? 'check-badge ready' : 'check-badge error';
      keyBadge.textContent = hasKey ? `✓ ${provider.toUpperCase()} Connected` : `⚠️ ${provider.toUpperCase()} Key Missing`;
    }
    if (hasKey) score++;

    // Check 2: Audio
    const audioBadge = $('#check-audio-badge');
    const stt = settings.sttProvider || 'auto';
    if (audioBadge) {
      audioBadge.className = 'check-badge ready';
      audioBadge.textContent = `✓ STT: ${stt.toUpperCase()}`;
    }
    score++; // Loopback audio is built-in

    // Check 3: Profile
    const hasResume = !!(settings.resumeText && settings.resumeText.trim());
    const profileBadge = $('#check-profile-badge');
    if (profileBadge) {
      profileBadge.className = hasResume ? 'check-badge ready' : 'check-badge warn';
      profileBadge.textContent = hasResume ? '✓ Resume Loaded' : '⚠️ No Resume (Optional)';
    }
    if (hasResume) score++;

    // Check 4: Stealth Screen Protection
    const stealthBadge = $('#check-stealth-badge');
    const invisibility = await cue.invisibilityStatus();
    if (stealthBadge) {
      stealthBadge.className = (invisibility && invisibility.protected) ? 'check-badge ready' : 'check-badge warn';
      stealthBadge.textContent = (invisibility && invisibility.protected) ? '🛡️ Protected (Invisible)' : '⚠️ Standard Window';
    }
    if (invisibility && invisibility.protected) score++;

    // Update summary
    const scoreEl = $('#readiness-score');
    if (scoreEl) scoreEl.textContent = `${score}/4`;
    const headlineEl = $('#readiness-headline');
    if (headlineEl) {
      if (score === 4) headlineEl.textContent = 'Ready for Live Interviews';
      else if (!hasKey) headlineEl.textContent = 'API Key Required to Answer Questions';
      else headlineEl.textContent = 'Setup Recommended';
    }

    const guideBadge = $('#guide-badge');
    if (guideBadge) guideBadge.classList.toggle('hidden', hasKey);

    // Update telemetry header
    const teleProvider = $('#tele-provider-name');
    if (teleProvider) teleProvider.textContent = provider.toUpperCase();
  }

  // Set shortcut keys based on platform
  function updateShortcutKeycaps() {
    const keyMod = usesCtrl ? '<kbd>Ctrl</kbd>' : '<kbd>⌘</kbd>';
    const shiftMod = usesCtrl ? '<kbd>Ctrl</kbd> + <kbd>Shift</kbd>' : '<kbd>⌘</kbd> + <kbd>Shift</kbd>';

    const assistKeys = $('#sc-assist-keys');
    if (assistKeys) assistKeys.innerHTML = `${keyMod} + <kbd>Enter</kbd>`;

    const sayKeys = $('#sc-say-keys');
    if (sayKeys) sayKeys.innerHTML = `${shiftMod} + <kbd>Enter</kbd>`;

    const solveKeys = $('#sc-solve-keys');
    if (solveKeys) solveKeys.innerHTML = `${keyMod} + <kbd>H</kbd>`;

    const hideKeys = $('#sc-hide-keys');
    if (hideKeys) hideKeys.innerHTML = `${shiftMod} + <kbd>/</kbd>`;

    const quitKeys = $('#sc-quit-keys');
    if (quitKeys) quitKeys.innerHTML = `${shiftMod} + <kbd>X</kbd>`;
  }

  // ---- past sessions -----------------------------------------------------
  const listView = $('#past-sessions-list');
  const viewPane = $('#past-session-view');
  const body = $('#past-session-body');
  $('#close-past-sessions').addEventListener('click', () => sessionsDrawer.classList.add('hidden'));

  async function loadPastSessionsList() {
    listView.innerHTML = '';
    const res = await cue.transcriptsList();
    if (!res || !res.ok) {
      const li = document.createElement('li');
      li.textContent = 'Failed to list sessions.';
      listView.appendChild(li);
      return;
    }
    if (!res.sessions || !res.sessions.length) {
      const li = document.createElement('li');
      li.className = 'past-empty';
      li.textContent = 'No sessions yet. End a session to create your first one.';
      listView.appendChild(li);
      return;
    }
    for (const s of res.sessions) {
      const li = document.createElement('li');
      const date = new Date(s.startedAt);
      li.innerHTML = '<span>📄 ' + textEscape(s.fileName) + '</span><span>' + date.toLocaleString() + '</span>';
      li.addEventListener('click', async () => {
        const resp = await cue.transcriptsRead(s.path);
        if (resp && resp.ok) {
          viewPane.classList.remove('hidden');
          body.textContent = resp.raw || '';
        } else {
          showToast(resp && resp.error ? resp.error : 'Could not read this session.', 2000);
        }
      });
      listView.appendChild(li);
    }
  }

  cue.on('transcripts:changed', () => loadPastSessionsList());

  // ---- settings drawer & sync --------------------------------------------
  const settingsSaved = $('#settings-saved');

  function showSaved() {
    settingsSaved.classList.add('show');
    clearTimeout(showSaved._t);
    showSaved._t = setTimeout(() => settingsSaved.classList.remove('show'), 900);
  }

  $('#close-settings').addEventListener('click', () => settingsDrawer.classList.add('hidden'));

  // Tabs
  document.querySelectorAll('#settings-tabs .s-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('on')) return;
      document.querySelectorAll('#settings-tabs .s-tab').forEach((t) => t.classList.remove('on'));
      document.querySelectorAll('#settings-drawer .s-tab-pane').forEach((p) => p.classList.add('hidden'));
      tab.classList.add('on');
      const pane = settingsDrawer.querySelector('.s-tab-pane[data-pane="' + tab.dataset.tab + '"]');
      if (pane) pane.classList.remove('hidden');
      if (tab.dataset.tab === 'audio') refreshWhisperModels();
      if (tab.dataset.tab === 'android') refreshAndroidStatus();
    });
  });

  function updateCustomProviderFields() {
    $('#custom-endpoint-settings').classList.toggle('hidden', settings.provider !== 'custom');
  }

  function fillSettings() {
    document.querySelectorAll('#provider-seg button').forEach((b) => b.classList.toggle('on', b.dataset.provider === settings.provider));
    $('#key-openai').value = (settings.apiKeys && settings.apiKeys.openai) || '';
    $('#key-anthropic').value = (settings.apiKeys && settings.apiKeys.anthropic) || '';
    $('#key-gemini').value = (settings.apiKeys && settings.apiKeys.gemini) || '';
    $('#key-deepgram').value = (settings.apiKeys && settings.apiKeys.deepgram) || '';
    $('#key-custom').value = (settings.apiKeys && settings.apiKeys.custom) || '';
    $('#base-url').value = settings.baseUrl || '';
    updateCustomProviderFields();
    $('#key-ollama').value = (settings.apiKeys && settings.apiKeys.ollama) || '';
    $('#key-groq').value = (settings.apiKeys && settings.apiKeys.groq) || '';
    $('#key-minimax').value = (settings.apiKeys && settings.apiKeys.minimax) || '';
    document.querySelectorAll('#minimax-region-seg button').forEach((b) => b.classList.toggle('on', b.dataset.region === (settings.minimaxRegion || 'global_en')));
    $('#key-azure').value = (settings.apiKeys && settings.apiKeys.azure) || '';
    $('#azure-endpoint').value = settings.azureEndpoint || '';
    const m = (settings.models && settings.models[settings.provider]) || { fast: '', smart: '' };
    $('#model-fast').value = m.fast || ''; $('#model-smart').value = m.smart || '';
    document.querySelectorAll('#stt-provider-seg button').forEach((b) => b.classList.toggle('on', b.dataset.sttProvider === (settings.sttProvider || 'auto')));
    const localWhisper = settings.localWhisper || { modelId: 'base.en', language: 'auto', threads: 0 };
    $('#whisper-language').value = localWhisper.language || 'auto';
    $('#whisper-threads').value = Number(localWhisper.threads) || 0;
    $('#resume-text').value = settings.resumeText || '';
    $('#job-description').value = settings.jobDescription || '';
    $('#star-stories').value = settings.starStories || '';
    $('#why-company').value = settings.whyCompany || '';
    $('#why-leaving').value = settings.whyLeaving || '';
    $('#work-style').value = settings.workStyle || '';
    $('#ai-rules').value = settings.aiRules || '';
    updateAiRulesCounter();
    $('#salary-target').value = settings.salaryTarget || '';
    $('#questions-to-ask').value = settings.questionsToAsk || '';
    const toggle = $('#save-transcripts-toggle');
    if (toggle) toggle.checked = settings.saveTranscripts !== false;
    updateReadinessChecklist();
  }

  function collectSettings() {
    if (!settings.apiKeys) settings.apiKeys = {};
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
    if (!settings.models) settings.models = {};
    if (!settings.models[settings.provider]) settings.models[settings.provider] = {};
    settings.models[settings.provider].fast = $('#model-fast').value.trim();
    settings.models[settings.provider].smart = $('#model-smart').value.trim();
    if (!settings.localWhisper) settings.localWhisper = {};
    settings.localWhisper.modelId = $('#whisper-model').value || settings.localWhisper.modelId || 'base.en';
    settings.localWhisper.language = $('#whisper-language').value || 'auto';
    settings.localWhisper.threads = Math.max(0, Math.min(64, Number.parseInt($('#whisper-threads').value, 10) || 0));
    settings.resumeText = $('#resume-text').value.trim();
    settings.jobDescription = $('#job-description').value.trim();
    settings.starStories = $('#star-stories').value.trim();
    settings.whyCompany = $('#why-company').value.trim();
    settings.whyLeaving = $('#why-leaving').value.trim();
    settings.workStyle = $('#work-style').value.trim();
    settings.aiRules = $('#ai-rules').value.trim();
    settings.salaryTarget = $('#salary-target').value.trim();
    settings.questionsToAsk = $('#questions-to-ask').value.trim();
    const toggle = $('#save-transcripts-toggle');
    if (toggle) settings.saveTranscripts = toggle.checked;
  }

  let autosaveTimer = null;
  function autosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(async () => {
      collectSettings();
      try {
        settings = await cue.settingsSet(settings);
        showSaved();
        updateReadinessChecklist();
      } catch (_) { /* keep local */ }
    }, 400);
  }

  document.querySelectorAll('#provider-seg button').forEach((b) => b.addEventListener('click', () => {
    settings.provider = b.dataset.provider;
    document.querySelectorAll('#provider-seg button').forEach((x) => x.classList.toggle('on', x === b));
    updateCustomProviderFields();
    const m = (settings.models && settings.models[settings.provider]) || { fast: '', smart: '' };
    $('#model-fast').value = m.fast || ''; $('#model-smart').value = m.smart || '';
    cue.settingsSet({ provider: settings.provider });
    updateReadinessChecklist();
  }));

  document.querySelectorAll('#minimax-region-seg button').forEach((b) => b.addEventListener('click', () => {
    settings.minimaxRegion = b.dataset.region;
    document.querySelectorAll('#minimax-region-seg button').forEach((x) => x.classList.toggle('on', x === b));
    cue.settingsSet({ minimaxRegion: settings.minimaxRegion });
  }));

  document.querySelectorAll('#stt-provider-seg button').forEach((b) => b.addEventListener('click', () => {
    settings.sttProvider = b.dataset.sttProvider;
    document.querySelectorAll('#stt-provider-seg button').forEach((x) => x.classList.toggle('on', x === b));
    cue.settingsSet({ sttProvider: settings.sttProvider });
    updateReadinessChecklist();
  }));

  const autosaveFields = [
    'key-openai', 'key-anthropic', 'key-gemini', 'key-deepgram', 'key-custom',
    'base-url', 'key-ollama', 'key-groq', 'key-minimax', 'key-azure',
    'azure-endpoint', 'model-fast', 'model-smart', 'whisper-language', 'whisper-threads',
    'resume-text', 'job-description', 'star-stories', 'why-company', 'why-leaving',
    'work-style', 'ai-rules', 'salary-target', 'questions-to-ask'
  ];
  for (const id of autosaveFields) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', autosave);
  }
  $('#ai-rules').addEventListener('input', () => { updateAiRulesCounter(); autosave(); });

  function updateAiRulesCounter() {
    const el = $('#ai-rules-count');
    if (el) el.textContent = ($('#ai-rules').value || '').length;
  }

  const saveTranscriptsToggle = $('#save-transcripts-toggle');
  if (saveTranscriptsToggle) {
    saveTranscriptsToggle.addEventListener('change', (e) => {
      cue.settingsSet({ saveTranscripts: e.target.checked });
    });
  }

  $('#upload-resume-btn').addEventListener('click', async () => {
    const res = await cue.pickProfileDocument();
    if (!res || res.canceled) return;
    if (res.error) { showToast('Resume import failed: ' + res.error, 3000); return; }
    $('#resume-text').value = res.text || '';
    $('#resume-filename').textContent = res.fileName || '';
    autosave();
    showToast('Imported ' + (res.fileName || 'file') + ' — saved.', 2000);
  });
  $('#upload-jd-btn').addEventListener('click', async () => {
    const res = await cue.pickProfileDocument();
    if (!res || res.canceled) return;
    if (res.error) { showToast('Job description import failed: ' + res.error, 3000); return; }
    $('#job-description').value = res.text || '';
    $('#jd-filename').textContent = res.fileName || '';
    autosave();
    showToast('Imported ' + (res.fileName || 'file') + ' — saved.', 2000);
  });

  // ---- Android Device Bridge ---------------------------------------------
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
        infoEl.textContent = 'Android Debug Bridge (ADB) not found in PATH or standard SDK locations.';
      }

      if (info.devices && info.devices.length) {
        listEl.innerHTML = '';
        info.devices.forEach((dev) => {
          const item = document.createElement('div');
          item.className = 'android-device-item';
          item.innerHTML = `
            <div class="device-icon">📱</div>
            <div class="device-meta">
              <div class="device-name">${textEscape(dev.model || 'Android Phone')} <span class="device-state ${textEscape(dev.state)}">${textEscape(dev.state)}</span></div>
              <div class="device-serial">Serial: ${textEscape(dev.serial)}</div>
            </div>
            <button class="s-action compact-btn screencap-dev-btn" data-serial="${textEscape(dev.serial)}">Snapshot</button>
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
                showToast('Screen capture failed. Ensure device screen is unlocked.', 3000);
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
        listEl.innerHTML = `<div class="s-note">No Android devices connected. Plug in your phone via USB with USB Debugging enabled, or pair via Wi-Fi ADB.</div>`;
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
          showToast('No Android device responded.', 3000);
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
      if (isWindows) cue.openPane('ms-phone-link:');
      else showToast('Phone Link is available on Windows 10/11.', 2500);
    });
  }

  // ---- Whisper Model Management ------------------------------------------
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
      const previousSelection = $('#whisper-model').value || (settings.localWhisper && settings.localWhisper.modelId) || 'base.en';
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
    cue.settingsSet({ localWhisper: settings.localWhisper });
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

  // Real-time synchronization if settings are edited elsewhere
  cue.on('settings:changed', (updated) => {
    if (updated) {
      settings = updated;
      fillSettings();
      updateReadinessChecklist();
    }
  });

  // ---- boot -------------------------------------------------------------
  async function boot() {
    settings = await cue.settingsGet();
    updateShortcutKeycaps();
    loadModes();
    updateReadinessChecklist();
  }

  boot();
})();
