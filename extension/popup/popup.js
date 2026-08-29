/**
 * Ghost Chrome Web Extension — Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusPill = document.getElementById('statusPill');
  const statusLabel = document.getElementById('statusLabel');
  const meetingBanner = document.getElementById('meetingBanner');
  const meetingText = document.getElementById('meetingText');
  const btnCaptureToggle = document.getElementById('btnCaptureToggle');
  const captureBtnText = document.getElementById('captureBtnText');
  const selectProvider = document.getElementById('selectProvider');
  const selectMode = document.getElementById('selectMode');
  const btnSmartToggle = document.getElementById('btnSmartToggle');
  const smartSubText = document.getElementById('smartSubText');
  const smartBadge = document.getElementById('smartBadge');
  const btnOverlayToggle = document.getElementById('btnOverlayToggle');
  const btnOpenOptions = document.getElementById('btnOpenOptions');

  let activeState = 'idle';
  let isSmart = false;
  let activeTab = null;

  // 1. Detect Active Tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;
    if (tab && tab.url) {
      if (tab.url.includes('meet.google.com')) {
        meetingBanner.classList.add('detected');
        meetingText.textContent = 'Google Meet Detected';
      } else if (tab.url.includes('zoom.us')) {
        meetingBanner.classList.add('detected');
        meetingText.textContent = 'Zoom Meeting Detected';
      } else if (tab.url.includes('teams.microsoft.com') || tab.url.includes('teams.live.com')) {
        meetingBanner.classList.add('detected');
        meetingText.textContent = 'Microsoft Teams Detected';
      } else {
        const domain = new URL(tab.url).hostname || 'Active Tab';
        meetingText.textContent = `Ready: ${domain}`;
      }
    }
  } catch (err) {
    meetingText.textContent = 'Ready on current tab';
  }

  // 2. Fetch State & Settings
  const syncState = () => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
      if (chrome.runtime.lastError || !res) return;

      const { session, settings } = res;
      if (session) {
        activeState = session.recordingState;
        updateUIState(activeState);
      }
      if (settings) {
        selectProvider.value = settings.provider || 'gemini';
        selectMode.value = settings.activeMode || 'assist';
        isSmart = !!settings.smart;
        updateSmartUI(isSmart);
      }
    });
  };

  function updateUIState(state) {
    if (state === 'recording') {
      statusPill.classList.add('recording');
      statusLabel.textContent = 'Recording';
      btnCaptureToggle.classList.add('recording');
      captureBtnText.textContent = 'Stop Tab Capture';
      btnCaptureToggle.disabled = false;
    } else if (state === 'starting' || state === 'stopping') {
      statusPill.classList.remove('recording');
      statusLabel.textContent = state === 'starting' ? 'Starting...' : 'Stopping...';
      btnCaptureToggle.disabled = true;
      captureBtnText.textContent = state === 'starting' ? 'Initializing Audio...' : 'Stopping Audio...';
    } else {
      statusPill.classList.remove('recording');
      statusLabel.textContent = 'Idle';
      btnCaptureToggle.classList.remove('recording');
      captureBtnText.textContent = 'Start Tab Capture';
      btnCaptureToggle.disabled = false;
    }
  }

  function updateSmartUI(smart) {
    btnSmartToggle.classList.toggle('active', smart);
    smartSubText.textContent = smart ? 'Smart Tier (Deep)' : 'Fast Tier (Instant)';
    smartBadge.textContent = smart ? 'Active' : 'Off';
  }

  syncState();

  // 3. Event Listeners
  btnCaptureToggle.addEventListener('click', () => {
    if (activeState === 'recording') {
      updateUIState('stopping');
      chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, () => {
        syncState();
      });
    } else if (activeState === 'idle') {
      updateUIState('starting');
      chrome.runtime.sendMessage({ type: 'START_RECORDING', tabId: activeTab?.id }, () => {
        syncState();
      });
    }
  });

  selectProvider.addEventListener('change', () => {
    chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { provider: selectProvider.value }
    });
  });

  selectMode.addEventListener('change', () => {
    chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { activeMode: selectMode.value }
    });
  });

  btnSmartToggle.addEventListener('click', () => {
    isSmart = !isSmart;
    updateSmartUI(isSmart);
    chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { smart: isSmart }
    });
  });

  btnOverlayToggle.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TOGGLE_OVERLAY' });
  });

  btnOpenOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
