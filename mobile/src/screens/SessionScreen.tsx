import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppSettings, ModeId, Session, Turn } from '../types';
import { ActionPills } from '../components/ActionPills';
import { TranscriptList } from '../components/TranscriptList';
import { FloatingOverlay } from '../components/FloatingOverlay';
import { DynamicIslandPill } from '../components/DynamicIslandPill';
import { GlassCard } from '../components/GlassCard';
import { AppIcon } from '../components/AppIcon';
import { Theme, isIOS } from '../theme/adaptive';
import { MobileAudioCapture } from '../services/audio-capture';
import { streamLLMResponse } from '../services/llm-service';
import { transcribeAudioFile } from '../services/stt-service';
import { saveSession } from '../services/storage';

interface SessionScreenProps {
  mode: ModeId;
  settings: AppSettings;
  onEndSession: () => void;
}

export const SessionScreen: React.FC<SessionScreenProps> = ({ mode: initialMode, settings, onEndSession }) => {
  const insets = useSafeAreaInsets();
  const [currentMode, setCurrentMode] = useState<ModeId>(initialMode);
  const [isListening, setIsListening] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeAnswer, setActiveAnswer] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [overlayVisible, setOverlayVisible] = useState(true);

  const audioCaptureRef = useRef(new MobileAudioCapture());
  const turnsRef = useRef<Turn[]>([]);
  const sessionIdRef = useRef(Math.random().toString(36).substring(2, 9));
  const startTimeRef = useRef(Date.now());
  // Keeps the latest settings for async transcription callbacks
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const appendTurn = (turn: Turn) => {
    setTurns((prev) => [...prev, turn]);
    turnsRef.current = [...turnsRef.current, turn];
  };

  const transcribeSegment = async (uri: string) => {
    try {
      const turn = await transcribeAudioFile(uri, settingsRef.current, 'you');
      if (turn) appendTurn(turn);
    } catch (err: any) {
      setSttError(err.message);
    }
  };

  useEffect(() => {
    startListening();
    return () => {
      audioCaptureRef.current.stop();
    };
  }, []);

  const startListening = async () => {
    const ok = await audioCaptureRef.current.startSegmented({
      onSegment: transcribeSegment,
      onError: (err) => Alert.alert('Audio Error', err.message),
    });
    setIsListening(ok);
  };

  const toggleListening = async () => {
    if (isListening) {
      const trailingUri = await audioCaptureRef.current.stop();
      setIsListening(false);
      if (trailingUri) await transcribeSegment(trailingUri);
    } else {
      setSttError(null);
      await startListening();
    }
  };

  const handleTriggerMode = (selectedMode: ModeId, customQuery?: string) => {
    setCurrentMode(selectedMode);
    setBusy(true);
    setActiveAnswer('');

    streamLLMResponse({
      mode: selectedMode,
      turns: turnsRef.current,
      userQuery: customQuery || userQuery,
      settings,
      onToken: (token) => {
        setActiveAnswer(token);
      },
      onDone: (full) => {
        setBusy(false);
        setActiveAnswer(full);
        if (customQuery || userQuery) setUserQuery('');
      },
      onError: (err) => {
        setBusy(false);
        Alert.alert('AI Error', err.message);
      },
    });
  };

  const handleEnd = async () => {
    await audioCaptureRef.current.stop();
    const session: Session = {
      id: sessionIdRef.current,
      title: `${currentMode} session`,
      mode: currentMode,
      startedAt: startTimeRef.current,
      endedAt: Date.now(),
      turns: turnsRef.current,
      summary: activeAnswer || 'Session completed.',
    };
    await saveSession(session);
    onEndSession();
  };

  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (RNStatusBar.currentHeight || 28) : 20
  );

  return (
    <View style={[styles.container, { backgroundColor: Theme.colors.background }]}>
      {/* iOS Dynamic Island Floating Pill */}
      <DynamicIslandPill
        mode={currentMode}
        isListening={isListening}
        activeAnswer={activeAnswer}
        onTriggerMode={(m) => handleTriggerMode(m)}
      />

      {/* Android Floating Picture-in-Picture Overlay */}
      <FloatingOverlay
        visible={overlayVisible && !isIOS && !!settings.floatingOverlayEnabled}
        activeAnswer={activeAnswer}
        isListening={isListening}
        onTriggerMode={(m) => handleTriggerMode(m)}
        onClose={() => setOverlayVisible(false)}
      />

      {/* Top Bar with Dynamic Status Bar Safe Padding */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: topInset + 8,
            backgroundColor: Theme.colors.surface,
            borderBottomColor: Theme.colors.outlineVariant,
          },
        ]}
      >
        <View style={styles.modeBadgeWrap}>
          <View
            style={[
              styles.liveDot,
              { backgroundColor: isListening ? Theme.colors.live : Theme.colors.outline },
            ]}
          />
          <Text style={[styles.modeText, { color: Theme.colors.onSurface }]}>
            {currentMode.toUpperCase()}
          </Text>
        </View>
        <View style={styles.topActions}>
          <TouchableOpacity
            style={[
              styles.listenBtn,
              {
                backgroundColor: isListening
                  ? Theme.colors.liveContainer
                  : Theme.colors.surfaceContainerHighest,
              },
            ]}
            onPress={toggleListening}
          >
            <AppIcon
              name={isListening ? 'mic' : 'mic-off'}
              size={16}
              color={isListening ? Theme.colors.live : Theme.colors.onSurface}
            />
            <Text style={[styles.btnText, { color: Theme.colors.onSurface }]}>
              {isListening ? 'Live' : 'Paused'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.endBtn,
              { backgroundColor: Theme.colors.errorContainer },
            ]}
            onPress={handleEnd}
          >
            <Text
              style={[
                styles.endBtnText,
                { color: Theme.colors.onErrorContainer },
              ]}
            >
              End Session
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* AI Live Suggestion Card */}
      <View style={styles.cardContainer}>
        <GlassCard
          style={[
            styles.answerCard,
            isIOS
              ? { borderColor: 'rgba(255, 255, 255, 0.2)' }
              : { backgroundColor: Theme.colors.surfaceContainer },
          ]}
        >
          <View style={styles.answerHeader}>
            <Text style={[styles.answerTitle, { color: Theme.colors.primary }]}>
              Cue Live Copilot
            </Text>
            {busy && <ActivityIndicator size="small" color={Theme.colors.primary} />}
          </View>
          <Text style={[styles.answerBody, { color: Theme.colors.onSurface }]}>
            {activeAnswer || (busy ? 'Generating answer...' : 'Tap an action below to get an instant answer.')}
          </Text>
        </GlassCard>
      </View>

      {/* Action Pills */}
      <ActionPills onSelectMode={(m) => handleTriggerMode(m)} busy={busy} />

      {/* Live Conversation Transcript */}
      <View style={styles.transcriptSection}>
        <Text style={[styles.sectionHeader, { color: Theme.colors.onSurfaceVariant }]}>
          Live Conversation
        </Text>
        {!!sttError && (
          <Text style={[styles.sttError, { color: Theme.colors.error }]}>
            Transcription: {sttError}
          </Text>
        )}
        <TranscriptList turns={turns} />
      </View>

      {/* Manual Input Bar */}
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: Theme.colors.surfaceContainer,
            borderTopColor: Theme.colors.outlineVariant,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: Theme.colors.surfaceContainerHighest,
              color: Theme.colors.onSurface,
            },
          ]}
          placeholder="Ask Cue anything about the conversation..."
          placeholderTextColor={Theme.colors.onSurfaceVariant}
          value={userQuery}
          onChangeText={setUserQuery}
          onSubmitEditing={() => userQuery.trim() && handleTriggerMode(currentMode, userQuery)}
        />
        <TouchableOpacity
          style={[
            styles.sendBtn,
            { backgroundColor: Theme.colors.primary },
            !userQuery.trim() && styles.disabledSend,
          ]}
          disabled={!userQuery.trim() || busy}
          onPress={() => handleTriggerMode(currentMode, userQuery)}
        >
          <AppIcon name="send" size={18} color={Theme.colors.onPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modeBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  modeText: {
    ...Theme.typography.labelLarge,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  topActions: {
    flexDirection: 'row',
    gap: 8,
  },
  listenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Theme.shapes.full,
  },
  btnText: {
    ...Theme.typography.labelMedium,
  },
  endBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Theme.shapes.full,
  },
  endBtnText: {
    ...Theme.typography.labelMedium,
    fontWeight: '700',
  },
  cardContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  answerCard: {
    borderWidth: 1,
    minHeight: 90,
  },
  answerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  answerTitle: {
    ...Theme.typography.labelMedium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  answerBody: {
    ...Theme.typography.bodyLarge,
    lineHeight: 22,
  },
  transcriptSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    ...Theme.typography.labelSmall,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sttError: {
    ...Theme.typography.bodySmall,
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: Theme.shapes.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendBtn: {
    borderRadius: Theme.shapes.full,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledSend: {
    opacity: 0.4,
  },
  sendText: {
    ...Theme.typography.labelLarge,
    fontWeight: '700',
  },
});
