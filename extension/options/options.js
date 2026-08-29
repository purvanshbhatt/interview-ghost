/**
 * Ghost Chrome Web Extension — Options Page Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const tabs = document.querySelectorAll('.nav-tab');
  const panes = document.querySelectorAll('.tab-pane');
  const btnSave = document.getElementById('btnSaveBottom');
  const saveToast = document.getElementById('saveToast');

  // Input Elements
  const providerSelect = document.getElementById('providerSelect');
  const geminiApiKey = document.getElementById('geminiApiKey');
  const geminiModelFast = document.getElementById('geminiModelFast');
  const geminiModelSmart = document.getElementById('geminiModelSmart');

  const openaiApiKey = document.getElementById('openaiApiKey');
  const openaiModelFast = document.getElementById('openaiModelFast');
  const openaiModelSmart = document.getElementById('openaiModelSmart');

  const anthropicApiKey = document.getElementById('anthropicApiKey');
  const anthropicModelFast = document.getElementById('anthropicModelFast');
  const anthropicModelSmart = document.getElementById('anthropicModelSmart');

  const groqApiKey = document.getElementById('groqApiKey');
  const groqModelFast = document.getElementById('groqModelFast');
  const groqModelSmart = document.getElementById('groqModelSmart');

  const customEndpoint = document.getElementById('customEndpoint');
  const customApiKey = document.getElementById('customApiKey');
  const customModel = document.getElementById('customModel');

  const sttEngine = document.getElementById('sttEngine');
  const sttLanguage = document.getElementById('sttLanguage');
  const autoSuggest = document.getElementById('autoSuggest');

  const candidateResume = document.getElementById('candidateResume');
  const jobDescription = document.getElementById('jobDescription');
  const customAiRules = document.getElementById('customAiRules');

  const overlayTheme = document.getElementById('overlayTheme');
  const fontSize = document.getElementById('fontSize');
  const showTranscriptDrawer = document.getElementById('showTranscriptDrawer');

  // 1. Tab Switching
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      panes.forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(`tab-${tab.dataset.tab}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // 2. Load Stored Settings
  const loadSettings = async () => {
    chrome.storage.local.get(null, (items) => {
      if (chrome.runtime.lastError || !items) return;

      if (items.provider) providerSelect.value = items.provider;
      if (items.geminiApiKey) geminiApiKey.value = items.geminiApiKey;
      if (items.geminiModelFast) geminiModelFast.value = items.geminiModelFast;
      if (items.geminiModelSmart) geminiModelSmart.value = items.geminiModelSmart;

      if (items.openaiApiKey) openaiApiKey.value = items.openaiApiKey;
      if (items.openaiModelFast) openaiModelFast.value = items.openaiModelFast;
      if (items.openaiModelSmart) openaiModelSmart.value = items.openaiModelSmart;

      if (items.anthropicApiKey) anthropicApiKey.value = items.anthropicApiKey;
      if (items.anthropicModelFast) anthropicModelFast.value = items.anthropicModelFast;
      if (items.anthropicModelSmart) anthropicModelSmart.value = items.anthropicModelSmart;

      if (items.groqApiKey) groqApiKey.value = items.groqApiKey;
      if (items.groqModelFast) groqModelFast.value = items.groqModelFast;
      if (items.groqModelSmart) groqModelSmart.value = items.groqModelSmart;

      if (items.customEndpoint) customEndpoint.value = items.customEndpoint;
      if (items.customApiKey) customApiKey.value = items.customApiKey;
      if (items.customModel) customModel.value = items.customModel;

      if (items.sttEngine) sttEngine.value = items.sttEngine;
      if (items.sttLanguage) sttLanguage.value = items.sttLanguage;
      if (typeof items.autoSuggestOnSpeechEnd === 'boolean') {
        autoSuggest.checked = items.autoSuggestOnSpeechEnd;
      }

      if (items.candidateResume) candidateResume.value = items.candidateResume;
      if (items.jobDescription) jobDescription.value = items.jobDescription;
      if (items.customAiRules) customAiRules.value = items.customAiRules;

      if (items.overlayTheme) overlayTheme.value = items.overlayTheme;
      if (items.fontSize) fontSize.value = items.fontSize;
      if (typeof items.showTranscriptDrawer === 'boolean') {
        showTranscriptDrawer.checked = items.showTranscriptDrawer;
      }
    });
  };

  // 3. Save Settings
  const saveSettings = () => {
    const settings = {
      provider: providerSelect.value,
      geminiApiKey: geminiApiKey.value.trim(),
      geminiModelFast: geminiModelFast.value.trim() || 'gemini-2.5-flash',
      geminiModelSmart: geminiModelSmart.value.trim() || 'gemini-2.5-pro',

      openaiApiKey: openaiApiKey.value.trim(),
      openaiModelFast: openaiModelFast.value.trim() || 'gpt-4o-mini',
      openaiModelSmart: openaiModelSmart.value.trim() || 'gpt-4o',

      anthropicApiKey: anthropicApiKey.value.trim(),
      anthropicModelFast: anthropicModelFast.value.trim() || 'claude-3-5-haiku-20241022',
      anthropicModelSmart: anthropicModelSmart.value.trim() || 'claude-3-5-sonnet-20241022',

      groqApiKey: groqApiKey.value.trim(),
      groqModelFast: groqModelFast.value.trim() || 'llama-3.3-70b-versatile',
      groqModelSmart: groqModelSmart.value.trim() || 'deepseek-r1-distill-llama-70b',

      customEndpoint: customEndpoint.value.trim() || 'http://127.0.0.1:11434/v1',
      customApiKey: customApiKey.value.trim(),
      customModel: customModel.value.trim() || 'llama3.2',

      sttEngine: sttEngine.value,
      sttLanguage: sttLanguage.value,
      autoSuggestOnSpeechEnd: autoSuggest.checked,

      candidateResume: candidateResume.value,
      jobDescription: jobDescription.value,
      customAiRules: customAiRules.value,

      overlayTheme: overlayTheme.value,
      fontSize: fontSize.value,
      showTranscriptDrawer: showTranscriptDrawer.checked
    };

    chrome.storage.local.set(settings, () => {
      saveToast.style.display = 'block';
      setTimeout(() => {
        saveToast.style.display = 'none';
      }, 2500);
    });
  };

  btnSave.addEventListener('click', saveSettings);
  loadSettings();
});
