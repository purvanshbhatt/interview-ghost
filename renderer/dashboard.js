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

  let modesCache = [];
  let cardState = {}; // mode id -> { files: [...] }

  // ---- toast -------------------------------------------------------------
  let toastTimer = null;
  function showToast(text, ms) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), ms || 2000);
  }

  function textEscape(s) { return String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&', '<': '<', '>': '>' }[c])); }

  // ---- mode cards -------------------------------------------------------
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
      const card = document.createElement('div');
      card.className = 'mode-card';
      card.dataset.mode = mode.id;
      card.innerHTML = (
        '<div class="mode-tag">' + mode.id + (mode.needsScreen ? ' · screen' : '') + '</div>' +
        '<div class="mode-title">' + titleFor(mode.id) + '</div>' +
        '<div class="mode-files"></div>' +
        '<div class="drop-zone">Drop PDF/DOCX/PPTX/TXT/MD here, or use Add file…</div>' +
        '<div class="file-list"></div>' +
        '<div class="custom-prompt">' +
          '<button class="cp-toggle" type="button">Custom prompt</button>' +
          '<textarea class="cp-text hidden" spellcheck="false" placeholder="Optional: replace this mode\'s built-in instruction with your own prompt. It is used any time you start this mode, alongside your context files."></textarea>' +
          '<div class="cp-meta hidden"><span class="cp-status">Saved</span><button class="cp-clear" type="button">Clear</button></div>' +
        '</div>' +
        '<div class="card-actions">' +
          '<button class="add-file-btn">Add file...</button>' +
          '<button class="start-btn">Start Mode</button>' +
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

    // Real drag-and-drop: webUtils.getPathForFile converts each dropped DOM
    // File to an absolute path the main process can parse + store.
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

    // Per-mode custom prompt. Loaded lazily when the toggle is first opened;
    // auto-saved (debounced) as the user types.
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

  function titleFor(id) {
    const map = {
      assist: 'Assist',
      say: 'What should I say?',
      mock: 'Mock Interview',
      phoneCall: 'Phone Call / Mobile Interview',
      coffee: 'Coffee Chat',
      followup: 'Follow-up questions',
      recap: 'Recap',
      ask: 'Ask',
      answerThis: 'Answer This',
      leetcode: 'Coding Solver (LeetCode)',
      notes: 'General Meeting Notes',
    };
    return map[id] || id;
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
      row.innerHTML = '<span>' + textEscape(f.name) + ' · ' + (f.sizeChars || 0).toLocaleString() + ' chars</span><button class="file-remove">remove</button>';
      row.querySelector('.file-remove').addEventListener('click', async () => {
        const res = await cue.modeContextRemoveFile(modeId, f.name);
        if (res && res.ok) loadModeContext(modeId);
        else showToast(res && res.error ? res.error : 'Failed to remove file', 2000);
      });
      list.appendChild(row);
    }
    const cap = (cardState[modeId] && cardState[modeId].max) || 5;
    card.querySelector('.mode-files').textContent = files.length + ' / ' + cap + ' files';
    const addBtn = card.querySelector('.add-file-btn');
    if (addBtn) addBtn.disabled = files.length >= cap;
  }

  function onStartResult(res) {
    if (res && res.ok) return showToast('Session started.', 1500);
    showToast((res && res.error) || 'Could not start session.', 2500);
  }
  function onStartError(err) { showToast(String(err && err.message || err), 2500); }

  // ---- past sessions -----------------------------------------------------
  const pastBtn = $('#past-sessions-btn');
  const drawer = $('#past-sessions-drawer');
  const listView = $('#past-sessions-list');
  const viewPane = $('#past-session-view');
  const body = $('#past-session-body');
  pastBtn.addEventListener('click', async () => {
    drawer.classList.remove('hidden');
    await loadPastSessionsList();
  });
  $('#close-past-sessions').addEventListener('click', () => drawer.classList.add('hidden'));

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
      li.innerHTML = '<span>' + textEscape(s.fileName) + '</span><span>' + date.toLocaleString() + '</span>';
      li.title = 'Click to view; click again to delete. (No delete yet — this is a test build.)';
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

  // Live-refresh the past sessions list when a new transcript is written.
  cue.on('transcripts:changed', () => loadPastSessionsList());

  // ---- window controls ---------------------------------------------------
  $('#win-minimize').addEventListener('click', () => { if (cue.dashboardMinimize) cue.dashboardMinimize(); });
  $('#win-close').addEventListener('click', () => cue.quit());

  // ---- settings drawer ---------------------------------------------------
  const settingsBtn = $('#settings-btn');
  const settingsDrawer = $('#settings-drawer');
  const settingsSaved = $('#settings-saved');
  let settings = {};
  let whisperOverview = null;

  function showSaved() {
    settingsSaved.classList.add('show');
    clearTimeout(showSaved._t);
    showSaved._t = setTimeout(() => settingsSaved.classList.remove('show'), 900);
  }

  settingsBtn.addEventListener('click', async () => {
    settingsDrawer.classList.remove('hidden');
    settings = await cue.settingsGet();
    const toggle = $('#save-transcripts-toggle');
    toggle.checked = settings.saveTranscripts !== false;
    fillSettings();
    refreshWhisperModels();
  });
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
    });
  });

  function updateCustomProviderFields() {
    $('#custom-endpoint-settings').classList.toggle('hidden', settings.provider !== 'custom');
  }

  function fillSettings() {
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
  }

  function collectSettings() {
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
  }

  // Debounced autosave — the dashboard persists settings as you type, same as
  // the overlay's "Done" flow but without requiring a button.
  let autosaveTimer = null;
  function autosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(async () => {
      collectSettings();
      try { settings = await cue.settingsSet(settings); showSaved(); } catch (_) { /* keep local edits */ }
    }, 400);
  }

  // Fields that change structure save immediately.
  document.querySelectorAll('#provider-seg button').forEach((b) => b.addEventListener('click', () => {
    settings.provider = b.dataset.provider;
    document.querySelectorAll('#provider-seg button').forEach((x) => x.classList.toggle('on', x === b));
    updateCustomProviderFields();
    const m = settings.models[settings.provider] || { fast: '', smart: '' };
    $('#model-fast').value = m.fast; $('#model-smart').value = m.smart;
    cue.settingsSet({ provider: settings.provider });
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
  }));

  // Text / number inputs autosave.
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

  $('#save-transcripts-toggle').addEventListener('change', (e) => {
    cue.settingsSet({ saveTranscripts: e.target.checked });
  });

  // Resume / JD import (dialog runs in the main process).
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

  // ---- local Whisper model management (ported from the overlay) ----------
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

  // ---- boot -------------------------------------------------------------
  loadModes();
})();
