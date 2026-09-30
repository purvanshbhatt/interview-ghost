import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  StatusBar as RNStatusBar,
  Modal,
  ScrollView,
  Share,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { M3Card } from '../components/M3Card';
import { M3TopAppBar } from '../components/M3TopAppBar';
import { M3Button } from '../components/M3Button';
import { M3Chip } from '../components/M3Chip';
import { AppIcon } from '../components/AppIcon';
import { Theme, isPad } from '../theme/adaptive';
import { Session } from '../types';
import { loadSessions, saveSession, deleteSession, loadSettings } from '../services/storage';
import { streamLLMResponse } from '../services/llm-service';
import { CallHelper } from '../services/call-helper';

export const HistoryScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [liveSummary, setLiveSummary] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    const list = await loadSessions();
    setSessions(list);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete Session', 'Are you sure you want to remove this session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSession(id);
          if (selectedSession?.id === id) setSelectedSession(null);
          fetchSessions();
        },
      },
    ]);
  };

  const formatFullTranscript = (session: Session): string => {
    const dateStr = new Date(session.startedAt).toLocaleString();
    const header = `=== Ghost Session Transcript ===\nTitle: ${session.title}\nDate: ${dateStr}\nMode: ${session.mode.toUpperCase()}\nTurns: ${session.turns.length}\n================================\n\n`;
    const summaryPart = session.summary
      ? `AI SUMMARY & KEY TAKEAWAYS:\n${session.summary}\n\n================================\nTRANSCRIPT:\n`
      : 'TRANSCRIPT:\n';
    const body = session.turns
      .map((t) => {
        const time = new Date(t.ts).toLocaleTimeString();
        const speaker = t.channel === 'you' ? 'You' : 'Them';
        return `[${time}] ${speaker}: ${t.text}`;
      })
      .join('\n\n');
    return header + summaryPart + body;
  };

  const copyTranscript = async (session: Session) => {
    const text = formatFullTranscript(session);
    try {
      await CallHelper.copyToClipboard(text);
    } catch {}
    showToast('✓ Full transcript copied to clipboard!');
  };

  const copySummary = async (session: Session) => {
    if (!session.summary) return;
    try {
      await CallHelper.copyToClipboard(session.summary);
    } catch {}
    showToast('✓ AI summary copied to clipboard!');
  };

  const shareTranscript = async (session: Session) => {
    const text = formatFullTranscript(session);
    try {
      await Share.share({
        title: session.title,
        message: text,
      });
    } catch {}
  };

  const generateAiSummary = async (session: Session) => {
    if (isGeneratingSummary) return;
    if (session.turns.length === 0) {
      Alert.alert('No Turns', 'This session has no recorded dialogue turns to summarize.');
      return;
    }
    setIsGeneratingSummary(true);
    let accumulated = '';
    try {
      const activeSettings = await loadSettings();
      await streamLLMResponse({
        mode: 'notes',
        turns: session.turns,
        settings: activeSettings,
        onToken: (tok) => {
          accumulated += tok;
          setLiveSummary(accumulated);
        },
        onDone: async (fullText) => {
          const updated: Session = { ...session, summary: fullText };
          setSelectedSession(updated);
          await saveSession(updated);
          await fetchSessions();
          setIsGeneratingSummary(false);
          setLiveSummary(null);
          showToast('✓ AI Summary generated and saved!');
        },
        onError: (err) => {
          Alert.alert('Summary Error', err.message || 'Failed to generate summary');
          setIsGeneratingSummary(false);
          setLiveSummary(null);
        },
      });
    } catch (err: any) {
      Alert.alert('Summary Error', err.message || 'Failed to generate summary');
      setIsGeneratingSummary(false);
      setLiveSummary(null);
    }
  };

  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (RNStatusBar.currentHeight || 28) : 20
  );

  return (
    <View style={[styles.safeArea, { backgroundColor: Theme.colors.background, paddingTop: topInset }]}>
      <M3TopAppBar title="Past Sessions" subtitle="View scripts, copy transcripts & AI summaries" />

      {toastMsg && (
        <View style={[styles.toastBanner, { backgroundColor: Theme.colors.primaryContainer, borderColor: Theme.colors.primary }]}>
          <Text style={[styles.toastText, { color: Theme.colors.onPrimaryContainer }]}>{toastMsg}</Text>
        </View>
      )}

      <View style={[styles.container, isPad && styles.tabletContainer]}>
        {sessions.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyIcon]}>🎙️</Text>
            <Text style={[styles.emptyText, { color: Theme.colors.onSurfaceVariant }]}>
              No saved interview or call sessions yet.
            </Text>
            <Text style={[styles.emptySubtext, { color: Theme.colors.outline }]}>
              Start a Phone Call, Say, or Assist session to record dialogue and generate AI summaries.
            </Text>
          </View>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 16) + 70 }]}
            renderItem={({ item }) => {
              const dateStr = new Date(item.startedAt).toLocaleString();
              const turnCount = item.turns?.length || 0;
              return (
                <M3Card
                  variant="filled"
                  style={[styles.sessionCard, { backgroundColor: Theme.colors.surfaceContainer }]}
                  onPress={() => setSelectedSession(item)}
                >
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.sessionTitle, { color: Theme.colors.onSurface }]}>{item.title}</Text>
                      <Text style={[styles.sessionDate, { color: Theme.colors.onSurfaceVariant }]}>
                        {dateStr} • {turnCount} {turnCount === 1 ? 'turn' : 'turns'}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                      <AppIcon name="close" size={16} color={Theme.colors.error} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.cardBadgeRow}>
                    <M3Chip
                      label={item.mode === 'phoneCall' ? '📞 Phone Call' : `🎙️ ${item.mode.toUpperCase()}`}
                      selected={false}
                      onPress={() => setSelectedSession(item)}
                      style={styles.modeChip}
                    />
                    {item.summary && (
                      <View style={[styles.summaryIndicator, { backgroundColor: Theme.colors.secondaryContainer }]}>
                        <Text style={[styles.summaryIndicatorText, { color: Theme.colors.onSecondaryContainer }]}>
                          ✓ AI Summarized
                        </Text>
                      </View>
                    )}
                  </View>

                  {item.summary ? (
                    <View style={[styles.summaryBox, { borderTopColor: Theme.colors.outlineVariant }]}>
                      <Text style={[styles.summaryLabel, { color: Theme.colors.primary }]}>Key Takeaways Preview</Text>
                      <Text
                        numberOfLines={3}
                        style={[styles.summaryText, { color: Theme.colors.onSurface }]}
                      >
                        {item.summary}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.cardActionRow}>
                    <TouchableOpacity
                      style={[styles.viewScriptBtn, { backgroundColor: Theme.colors.surfaceContainerHigh }]}
                      onPress={() => setSelectedSession(item)}
                    >
                      <Text style={[styles.viewScriptText, { color: Theme.colors.primary }]}>
                        📖 Open Full Script & Audio Log →
                      </Text>
                    </TouchableOpacity>
                  </View>
                </M3Card>
              );
            }}
          />
        )}
      </View>

      {/* Full-Screen Material 3 Script & Transcript Viewer Modal */}
      {selectedSession && (
        <Modal
          visible={true}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            if (!isGeneratingSummary) setSelectedSession(null);
          }}
        >
          <View style={[styles.modalContainer, { backgroundColor: Theme.colors.background }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: Theme.colors.outlineVariant }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: Theme.colors.onSurface }]}>
                  {selectedSession.title}
                </Text>
                <Text style={[styles.modalSubtitle, { color: Theme.colors.onSurfaceVariant }]}>
                  {new Date(selectedSession.startedAt).toLocaleString()} • {selectedSession.turns.length} turns
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.closeModalBtn, { backgroundColor: Theme.colors.surfaceContainerHigh }]}
                onPress={() => setSelectedSession(null)}
              >
                <AppIcon name="close" size={20} color={Theme.colors.onSurface} />
              </TouchableOpacity>
            </View>

            {/* In-Modal Action Toolbar */}
            <View style={[styles.modalToolbar, { backgroundColor: Theme.colors.surfaceContainerLow }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarScroll}>
                <TouchableOpacity
                  style={[styles.toolbarActionBtn, { backgroundColor: Theme.colors.primary }]}
                  onPress={() => copyTranscript(selectedSession)}
                >
                  <Text style={[styles.toolbarActionText, { color: Theme.colors.onPrimary }]}>
                    📋 Copy Transcript
                  </Text>
                </TouchableOpacity>

                {selectedSession.summary && (
                  <TouchableOpacity
                    style={[styles.toolbarActionBtn, { backgroundColor: Theme.colors.secondaryContainer }]}
                    onPress={() => copySummary(selectedSession)}
                  >
                    <Text style={[styles.toolbarActionText, { color: Theme.colors.onSecondaryContainer }]}>
                      📝 Copy Summary
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.toolbarActionBtn,
                    {
                      backgroundColor: Theme.colors.surfaceContainerHighest,
                      borderColor: Theme.colors.outlineVariant,
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => generateAiSummary(selectedSession)}
                  disabled={isGeneratingSummary}
                >
                  {isGeneratingSummary ? (
                    <ActivityIndicator size="small" color={Theme.colors.primary} />
                  ) : (
                    <Text style={[styles.toolbarActionText, { color: Theme.colors.primary }]}>
                      {selectedSession.summary ? '🔄 Re-run AI Summary' : '✨ Generate AI Summary'}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.toolbarActionBtn,
                    {
                      backgroundColor: Theme.colors.surfaceContainerHighest,
                      borderColor: Theme.colors.outlineVariant,
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => shareTranscript(selectedSession)}
                >
                  <Text style={[styles.toolbarActionText, { color: Theme.colors.onSurface }]}>
                    📤 Share
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* Scrollable Script & Summary Body */}
            <ScrollView
              contentContainerStyle={[
                styles.modalScrollBody,
                { paddingBottom: Math.max(insets.bottom, 24) + 40 },
              ]}
            >
              {/* Summary Card if available or generating */}
              {(selectedSession.summary || liveSummary || isGeneratingSummary) && (
                <View
                  style={[
                    styles.summaryCard,
                    {
                      backgroundColor: Theme.colors.surfaceContainerHigh,
                      borderColor: Theme.colors.primary,
                    },
                  ]}
                >
                  <View style={styles.summaryCardHeader}>
                    <Text style={[styles.summaryCardTitle, { color: Theme.colors.primary }]}>
                      ✨ Executive AI Summary & Notes
                    </Text>
                    {isGeneratingSummary && (
                      <View style={styles.generatingBadge}>
                        <ActivityIndicator size="small" color={Theme.colors.primary} />
                        <Text style={[styles.generatingText, { color: Theme.colors.primary }]}>
                          Generating...
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    selectable
                    style={[styles.summaryFullText, { color: Theme.colors.onSurface }]}
                  >
                    {liveSummary || selectedSession.summary}
                  </Text>
                </View>
              )}

              {/* Transcript Section Header */}
              <View style={styles.transcriptSectionHeader}>
                <Text style={[styles.transcriptSectionTitle, { color: Theme.colors.onSurfaceVariant }]}>
                  RECORDED SCRIPT ({selectedSession.turns.length} TURNS)
                </Text>
              </View>

              {/* Turns List */}
              {selectedSession.turns.length === 0 ? (
                <View style={styles.emptyTurnsBox}>
                  <Text style={{ ...Theme.typography.bodyMedium, color: Theme.colors.onSurfaceVariant }}>
                    No spoken turns were recorded during this session.
                  </Text>
                </View>
              ) : (
                selectedSession.turns.map((turn, index) => {
                  const isYou = turn.channel === 'you';
                  const time = new Date(turn.ts).toLocaleTimeString();
                  return (
                    <View
                      key={turn.id || `turn-${index}`}
                      style={[
                        styles.turnCard,
                        {
                          backgroundColor: isYou
                            ? Theme.colors.primaryContainer
                            : Theme.colors.surfaceContainerHigh,
                          borderColor: isYou
                            ? Theme.colors.primary
                            : Theme.colors.outlineVariant,
                          alignSelf: isYou ? 'flex-end' : 'flex-start',
                          width: '94%',
                        },
                      ]}
                    >
                      <View style={styles.turnMetaRow}>
                        <View
                          style={[
                            styles.speakerPill,
                            {
                              backgroundColor: isYou ? Theme.colors.primary : Theme.colors.secondary,
                            },
                          ]}
                        >
                          <Text style={[styles.speakerPillText, { color: Theme.colors.onPrimary }]}>
                            {isYou ? 'YOU' : 'INTERVIEWER / THEM'}
                          </Text>
                        </View>
                        <Text style={[styles.turnTimeText, { color: Theme.colors.onSurfaceVariant }]}>
                          {time}
                        </Text>
                      </View>
                      <Text
                        selectable
                        style={[
                          styles.turnBodyText,
                          {
                            color: isYou
                              ? Theme.colors.onPrimaryContainer
                              : Theme.colors.onSurface,
                          },
                        ]}
                      >
                        {turn.text}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 16,
  },
  tabletContainer: {
    paddingHorizontal: 32,
  },
  toastBanner: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    zIndex: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Theme.shapes.medium,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  toastText: {
    ...Theme.typography.labelMedium,
    fontWeight: '700',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    ...Theme.typography.titleMedium,
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySubtext: {
    ...Theme.typography.bodySmall,
    textAlign: 'center',
    lineHeight: 18,
  },
  listContent: {
    gap: 12,
  },
  sessionCard: {
    marginBottom: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  sessionTitle: {
    ...Theme.typography.titleMedium,
    fontWeight: '700',
  },
  sessionDate: {
    ...Theme.typography.bodySmall,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 6,
  },
  cardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  modeChip: {
    height: 28,
  },
  summaryIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Theme.shapes.full,
  },
  summaryIndicatorText: {
    ...Theme.typography.labelSmall,
    fontSize: 10,
    fontWeight: '700',
  },
  summaryBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  summaryLabel: {
    ...Theme.typography.labelSmall,
    textTransform: 'uppercase',
    marginBottom: 4,
    fontWeight: '700',
  },
  summaryText: {
    ...Theme.typography.bodyMedium,
    lineHeight: 20,
  },
  cardActionRow: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.outlineVariant,
  },
  viewScriptBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Theme.shapes.small,
    alignItems: 'center',
  },
  viewScriptText: {
    ...Theme.typography.labelMedium,
    fontWeight: '700',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    ...Theme.typography.titleLarge,
    fontWeight: '700',
  },
  modalSubtitle: {
    ...Theme.typography.bodySmall,
    marginTop: 2,
  },
  closeModalBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalToolbar: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  toolbarScroll: {
    gap: 8,
    alignItems: 'center',
  },
  toolbarActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Theme.shapes.small,
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolbarActionText: {
    ...Theme.typography.labelMedium,
    fontWeight: '700',
  },
  modalScrollBody: {
    padding: 16,
    gap: 12,
  },
  summaryCard: {
    padding: 16,
    borderRadius: Theme.shapes.medium,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryCardTitle: {
    ...Theme.typography.titleMedium,
    fontWeight: '700',
  },
  generatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  generatingText: {
    ...Theme.typography.labelSmall,
    fontWeight: '700',
  },
  summaryFullText: {
    ...Theme.typography.bodyMedium,
    lineHeight: 22,
  },
  transcriptSectionHeader: {
    marginTop: 8,
    marginBottom: 4,
  },
  transcriptSectionTitle: {
    ...Theme.typography.labelSmall,
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  turnCard: {
    padding: 12,
    borderRadius: Theme.shapes.medium,
    borderWidth: 1,
    marginVertical: 4,
  },
  turnMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  speakerPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Theme.shapes.full,
  },
  speakerPillText: {
    ...Theme.typography.labelSmall,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  turnTimeText: {
    ...Theme.typography.bodySmall,
    fontSize: 11,
  },
  turnBodyText: {
    ...Theme.typography.bodyMedium,
    lineHeight: 20,
  },
  emptyTurnsBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
