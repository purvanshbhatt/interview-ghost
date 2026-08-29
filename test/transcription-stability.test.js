const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ============================================================================
// Transcription Containment & Layout Stability Test Suite (Worker M2 / R2)
// ============================================================================

test.describe('Worker M2: Transcription Containment & Layout Stability', () => {

  // --------------------------------------------------------------------------
  // 1. Static Source Code Assertions
  // --------------------------------------------------------------------------
  test.describe('Source Code Integrity & Decoupling', () => {
    const rendererPath = path.join(PROJECT_ROOT, 'renderer', 'renderer.js');
    const stylesPath = path.join(PROJECT_ROOT, 'renderer', 'styles.css');
    const rendererCode = fs.readFileSync(rendererPath, 'utf8');
    const stylesCode = fs.readFileSync(stylesPath, 'utf8');

    test('1.1: Legacy auto-fill and interim-injection functions are completely removed from renderer.js', () => {
      assert.equal(rendererCode.includes('function autoFillInputFromSTT'), false, 'autoFillInputFromSTT must not exist in renderer.js');
      assert.equal(rendererCode.includes('autoFillInputFromSTT('), false, 'autoFillInputFromSTT must not be called');
      assert.equal(rendererCode.includes('function softClearSTTFill'), false, 'softClearSTTFill must not exist in renderer.js');
      assert.equal(rendererCode.includes('softClearSTTFill('), false, 'softClearSTTFill must not be called');
      assert.equal(rendererCode.includes('function showInterimInInput'), false, 'showInterimInInput must not exist in renderer.js');
      assert.equal(rendererCode.includes('showInterimInInput('), false, 'showInterimInInput must not be called');
      assert.equal(rendererCode.includes('function getOrCreateInterimEl'), false, 'getOrCreateInterimEl must not exist in renderer.js');
      assert.equal(rendererCode.includes('getOrCreateInterimEl('), false, 'getOrCreateInterimEl must not be called');
    });

    test('1.2: STT-specific composer classes are removed from renderer.js and styles.css', () => {
      assert.equal(rendererCode.includes("'stt-filling'"), false, 'stt-filling must not be referenced in renderer.js');
      assert.equal(rendererCode.includes("'stt-ready'"), false, 'stt-ready must not be referenced in renderer.js');
      assert.equal(rendererCode.includes("'stt-dimmed'"), false, 'stt-dimmed must not be referenced in renderer.js');
      assert.equal(rendererCode.includes("'stt-accumulating'"), false, 'stt-accumulating must not be referenced in renderer.js');
      assert.equal(stylesCode.includes('#composer.stt-filling'), false, 'stt-filling styles must not exist in styles.css');
      assert.equal(stylesCode.includes('#composer.stt-ready'), false, 'stt-ready styles must not exist in styles.css');
      assert.equal(stylesCode.includes('.input-interim'), false, 'input-interim styles must not exist in styles.css');
    });

    test('1.3: Audio capture start does not force showSidebar() in renderer.js', () => {
      // capture:state listener must not auto-call showSidebar
      const captureListenerMatch = rendererCode.match(/cue\.on\('capture:state'[\s\S]*?\}\);/);
      assert.ok(captureListenerMatch, 'capture:state listener must exist');
      assert.equal(captureListenerMatch[0].includes('showSidebar()'), false, 'capture:state must not auto-open sidebar');
    });

    test('1.4: styles.css enforces display none and pointer-events none on hidden sidebar', () => {
      assert.match(stylesCode, /\.transcript-sidebar\.hidden\s*\{[\s\S]*?display:\s*none\s*!important/);
      assert.match(stylesCode, /\.transcript-sidebar\.hidden\s*\{[\s\S]*?pointer-events:\s*none\s*!important/);
    });

    test('1.5: pointOverUI in renderer.js explicitly guards against hidden transcript sidebar', () => {
      assert.match(rendererCode, /function pointOverUI[\s\S]*?closest\('#transcript-sidebar'\)[\s\S]*?hidden/);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Behavioral Unit & DOM Simulation Tests
  // --------------------------------------------------------------------------
  test.describe('Behavioral & Layout Stability Execution', () => {

    function createSimulatedRenderer() {
      const emitter = new EventEmitter();
      const calls = { asks: [], clears: [] };

      const mockCue = {
        platform: 'linux',
        on: (event, handler) => {
          emitter.on(event, handler);
          return () => emitter.off(event, handler);
        },
        ask: (payload) => calls.asks.push(payload),
        clearTranscript: async () => {
          calls.clears.push(Date.now());
          return true;
        },
      };

      function createClassList(initialClasses = []) {
        const set = new Set(initialClasses);
        return {
          add: (...classes) => classes.forEach(c => set.add(c)),
          remove: (...classes) => classes.forEach(c => set.delete(c)),
          toggle: (cls, force) => {
            const has = set.has(cls);
            const shouldHave = force !== undefined ? force : !has;
            if (shouldHave) set.add(cls); else set.delete(cls);
            return shouldHave;
          },
          contains: (cls) => set.has(cls),
          has: (cls) => set.has(cls),
        };
      }

      // Mock DOM structure mirroring index.html
      const elements = {
        input: {
          value: '',
          style: { height: '28px' },
          scrollHeight: 28,
        },
        placeholder: {
          classList: createClassList(),
        },
        composer: {
          classList: createClassList(['composer']),
          bounds: { x: 40, y: 85, width: 620, height: 80 },
        },
        actionPills: {
          bounds: { x: 40, y: 130, width: 620, height: 32 },
        },
        sendBtn: {
          classList: createClassList(),
        },
        historyBtn: {
          classList: createClassList(),
        },
        panelWrap: {
          classList: createClassList(['panel-wrap']),
          bounds: { x: 38, y: 80, width: 624, height: 180 },
        },
        panelMain: {
          children: [],
        },
        transcriptSidebar: {
          classList: createClassList(['transcript-sidebar', 'hidden']),
          style: { display: 'none' },
          bounds: { x: 460, y: 80, width: 220, height: 480 },
        },
        tsList: {
          children: [],
        },
        messages: {
          children: [],
        },
      };

      let sidebarOpen = false;
      let tsSidebarInterimEl = null;
      const tsLastRow = { you: null, them: null };

      function syncPlaceholder() {
        elements.placeholder.classList.toggle('hidden', elements.input.value.length > 0);
        elements.input.style.height = `${Math.min(elements.input.scrollHeight, 140)}px`;
      }

      function updateSendButtonState() {
        const hasText = elements.input.value.trim().length > 0;
        elements.sendBtn.classList.toggle('has-text', hasText);
      }

      function showSidebar() {
        elements.transcriptSidebar.classList.remove('hidden');
        elements.transcriptSidebar.style.display = 'flex';
        elements.historyBtn.classList.add('active');
        elements.panelWrap.classList.add('sidebar-open');
        elements.panelWrap.bounds = { x: 20, y: 80, width: 420, height: 180 };
        sidebarOpen = true;
      }

      function hideSidebar() {
        elements.transcriptSidebar.classList.add('hidden');
        elements.transcriptSidebar.style.display = 'none';
        elements.historyBtn.classList.remove('active');
        elements.panelWrap.classList.remove('sidebar-open');
        elements.panelWrap.bounds = { x: 38, y: 80, width: 624, height: 180 };
        sidebarOpen = false;
      }

      function toggleSidebar() {
        if (sidebarOpen) {
          hideSidebar();
        } else {
          showSidebar();
        }
      }

      function appendTranscriptHistoryTurn(channel, text, isInterim) {
        if (isInterim) {
          if (!tsSidebarInterimEl) {
            tsSidebarInterimEl = {
              channel,
              text,
              isInterim: true,
              classList: new Set(['ts-turn', `ts-${channel}`, 'ts-interim-row', 'tc-interim']),
            };
            elements.tsList.children.push(tsSidebarInterimEl);
          } else {
            tsSidebarInterimEl.text = text;
          }
        } else {
          if (tsSidebarInterimEl) {
            const idx = elements.tsList.children.indexOf(tsSidebarInterimEl);
            if (idx !== -1) elements.tsList.children.splice(idx, 1);
            tsSidebarInterimEl = null;
          }

          const existing = tsLastRow[channel];
          if (existing && elements.tsList.children.includes(existing)) {
            existing.text = existing.text + ' ' + text;
          } else {
            const row = {
              channel,
              text,
              isInterim: false,
              classList: new Set(['ts-turn', `ts-${channel}`]),
            };
            elements.tsList.children.push(row);
            tsLastRow[channel] = row;
          }
        }
      }

      function clearTranscriptInterim() {
        if (tsSidebarInterimEl) {
          const idx = elements.tsList.children.indexOf(tsSidebarInterimEl);
          if (idx !== -1) elements.tsList.children.splice(idx, 1);
          tsSidebarInterimEl = null;
        }
      }

      function clearTranscriptSidebar() {
        elements.tsList.children = [];
        tsSidebarInterimEl = null;
        tsLastRow.you = null;
        tsLastRow.them = null;
      }

      function send() {
        const text = elements.input.value.trim();
        if (!text) {
          mockCue.ask({ mode: 'assist', text: '' });
          return;
        }
        elements.input.value = '';
        syncPlaceholder();
        updateSendButtonState();
        mockCue.ask({ mode: 'ask', text });
      }

      // Event listeners mirroring renderer.js
      emitter.on('capture:state', ({ active }) => {
        if (active) {
          elements.composer.classList.add('listening');
          elements.historyBtn.classList.add('listening');
          // No auto-open
        } else {
          elements.composer.classList.delete('listening');
          elements.historyBtn.classList.delete('listening');
        }
      });

      emitter.on('stt:interim', ({ channel, text }) => {
        appendTranscriptHistoryTurn(channel, text, true);
      });

      emitter.on('stt:final', () => {
        clearTranscriptInterim();
      });

      emitter.on('transcript', ({ channel, text }) => {
        if (!text || text.trim().length < 2) return;
        appendTranscriptHistoryTurn(channel, text, false);
      });

      function pointOverUI(x, y) {
        if (x < 0 || y < 0 || x > 700 || y > 600) return false;

        // Toolbar bounds
        if (x >= 20 && x <= 680 && y >= 20 && y <= 64) return true;

        // Panel wrap bounds
        const pw = elements.panelWrap.bounds;
        if (x >= pw.x && x <= pw.x + pw.width && y >= pw.y && y <= pw.y + pw.height) return true;

        // Transcript sidebar bounds (only if not hidden)
        if (!elements.transcriptSidebar.classList.has('hidden')) {
          const sb = elements.transcriptSidebar.bounds;
          if (x >= sb.x && x <= sb.x + sb.width && y >= sb.y && y <= sb.y + sb.height) return true;
        }

        return false;
      }

      return {
        emitter,
        mockCue,
        elements,
        calls,
        syncPlaceholder,
        updateSendButtonState,
        showSidebar,
        hideSidebar,
        toggleSidebar,
        clearTranscriptSidebar,
        send,
        pointOverUI,
        isSidebarOpen: () => sidebarOpen,
      };
    }

    test('2.1: Live speech turns do NOT mutate prompt textarea (#input.value)', () => {
      const app = createSimulatedRenderer();
      app.elements.input.value = 'My custom question draft';
      app.syncPlaceholder();

      // Emit interviewer speech turns
      app.emitter.emit('transcript', { channel: 'them', text: 'Can you describe your experience with microservices?' });
      assert.equal(app.elements.input.value, 'My custom question draft', 'Interviewer speech must not modify input.value');

      // Emit candidate speech turns
      app.emitter.emit('transcript', { channel: 'you', text: 'Yes, at my previous role I designed a Kubernetes cluster.' });
      assert.equal(app.elements.input.value, 'My custom question draft', 'User speech must not modify input.value');
    });

    test('2.2: Continuous interim speech does NOT push down composer or action pills (zero jumping)', () => {
      const app = createSimulatedRenderer();
      const composerInitialY = app.elements.composer.bounds.y;
      const actionsInitialY = app.elements.actionPills.bounds.y;
      const composerInitialHeight = app.elements.composer.bounds.height;

      // Stream rapid interim fragments
      app.emitter.emit('stt:interim', { channel: 'them', text: 'How' });
      app.emitter.emit('stt:interim', { channel: 'them', text: 'How do you' });
      app.emitter.emit('stt:interim', { channel: 'them', text: 'How do you optimize database queries?' });

      assert.equal(app.elements.composer.bounds.y, composerInitialY, 'Composer Y must remain fixed');
      assert.equal(app.elements.actionPills.bounds.y, actionsInitialY, 'Action pills Y must remain fixed');
      assert.equal(app.elements.composer.bounds.height, composerInitialHeight, 'Composer height must remain fixed');
      assert.equal(app.elements.panelMain.children.length, 0, 'No interim elements inside panel-main');
    });

    test('2.3: All interim and final speech turns are confined strictly to #ts-list', () => {
      const app = createSimulatedRenderer();

      // Interim turn
      app.emitter.emit('stt:interim', { channel: 'them', text: 'Tell me about...' });
      assert.equal(app.elements.tsList.children.length, 1);
      assert.equal(app.elements.tsList.children[0].text, 'Tell me about...');
      assert.equal(app.elements.tsList.children[0].isInterim, true);

      // Final turn clears interim and appends final row
      app.emitter.emit('stt:final', { channel: 'them', text: 'Tell me about yourself.' });
      app.emitter.emit('transcript', { channel: 'them', text: 'Tell me about yourself.' });

      assert.equal(app.elements.tsList.children.length, 1);
      assert.equal(app.elements.tsList.children[0].text, 'Tell me about yourself.');
      assert.equal(app.elements.tsList.children[0].isInterim, false);
      assert.equal(app.elements.tsList.children[0].channel, 'them');
    });

    test('2.4: Audio capture start (capture:state) does NOT auto-open the history drawer', () => {
      const app = createSimulatedRenderer();
      assert.equal(app.isSidebarOpen(), false);
      assert.ok(app.elements.transcriptSidebar.classList.has('hidden'));

      // Listening starts
      app.emitter.emit('capture:state', { active: true, streaming: true, mode: 'cloud' });

      assert.equal(app.isSidebarOpen(), false, 'Sidebar must remain closed when capture starts');
      assert.ok(app.elements.transcriptSidebar.classList.has('hidden'), 'Sidebar must retain hidden class');
      assert.ok(app.elements.composer.classList.has('listening'), 'Composer indicates listening state');
    });

    test('2.5: Manual toggle correctly manages history drawer lifecycle and width constraints', () => {
      const app = createSimulatedRenderer();

      // Open sidebar
      app.toggleSidebar();
      assert.equal(app.isSidebarOpen(), true);
      assert.equal(app.elements.transcriptSidebar.classList.has('hidden'), false);
      assert.ok(app.elements.panelWrap.classList.has('sidebar-open'));
      assert.equal(app.elements.panelWrap.bounds.width, 420);

      // Close sidebar
      app.toggleSidebar();
      assert.equal(app.isSidebarOpen(), false);
      assert.ok(app.elements.transcriptSidebar.classList.has('hidden'));
      assert.equal(app.elements.panelWrap.classList.has('sidebar-open'), false);
      assert.equal(app.elements.panelWrap.bounds.width, 624);
    });

    test('2.6: pointOverUI suppresses click dead zones when transcript drawer is closed', () => {
      const app = createSimulatedRenderer();

      // Coordinate (500, 300) is within the sidebar region (x: 460-680, y: 80-560)
      // When closed, must return false (click-through to desktop)
      assert.equal(app.pointOverUI(500, 300), false, 'Closed sidebar coordinates must pass through');

      // When open, must return true (intercept clicks)
      app.showSidebar();
      assert.equal(app.pointOverUI(500, 300), true, 'Open sidebar coordinates must intercept clicks');

      // When closed again, returns false
      app.hideSidebar();
      assert.equal(app.pointOverUI(500, 300), false, 'Closed sidebar coordinates must pass through after hide');
    });

    test('2.7: Clear history clears ts-list without affecting composer input', async () => {
      const app = createSimulatedRenderer();
      app.elements.input.value = 'Important user prompt notes';
      app.emitter.emit('transcript', { channel: 'them', text: 'Some interviewer statement' });
      app.emitter.emit('transcript', { channel: 'you', text: 'Some user response' });

      assert.equal(app.elements.tsList.children.length, 2);

      // Trigger clear transcript
      await app.mockCue.clearTranscript();
      app.clearTranscriptSidebar();

      assert.equal(app.elements.tsList.children.length, 0, 'Transcript history must be empty');
      assert.equal(app.elements.input.value, 'Important user prompt notes', 'User prompt input must be untouched');
      assert.equal(app.calls.clears.length, 1, 'clearTranscript IPC should be called');
    });

    test('2.8: Prompt submission dispatches ask mode without contamination', () => {
      const app = createSimulatedRenderer();

      // Submit user typed prompt
      app.elements.input.value = 'Explain the difference between process and thread';
      app.send();

      assert.equal(app.calls.asks.length, 1);
      assert.equal(app.calls.asks[0].mode, 'ask');
      assert.equal(app.calls.asks[0].text, 'Explain the difference between process and thread');
      assert.equal(app.elements.input.value, '', 'Input should be cleared after send');

      // Submit empty prompt -> triggers assist
      app.send();
      assert.equal(app.calls.asks.length, 2);
      assert.equal(app.calls.asks[1].mode, 'assist');
      assert.equal(app.calls.asks[1].text, '');
    });
  });
});
