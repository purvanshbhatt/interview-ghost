import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Platform, StatusBar as RNStatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { M3Card } from '../components/M3Card';
import { M3TopAppBar } from '../components/M3TopAppBar';
import { AppIcon } from '../components/AppIcon';
import { Theme, isPad } from '../theme/adaptive';
import { Session } from '../types';
import { loadSessions, deleteSession } from '../services/storage';

export const HistoryScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    const list = await loadSessions();
    setSessions(list);
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

  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (RNStatusBar.currentHeight || 28) : 20
  );

  return (
    <View style={[styles.safeArea, { backgroundColor: Theme.colors.background, paddingTop: topInset }]}>
      <M3TopAppBar title="Past Sessions" subtitle="Summaries & recordings from your calls" />
      <View style={[styles.container, isPad && styles.tabletContainer]}>
        {sessions.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyText, { color: Theme.colors.onSurfaceVariant }]}>
              No saved interview or call sessions yet.
            </Text>
          </View>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 16) + 70 }]}
            renderItem={({ item }) => {
              const dateStr = new Date(item.startedAt).toLocaleString();
              return (
                <M3Card
                  variant="filled"
                  style={[styles.sessionCard, { backgroundColor: Theme.colors.surfaceContainer }]}
                  onPress={() => setSelectedSession(selectedSession?.id === item.id ? null : item)}
                >
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={[styles.sessionTitle, { color: Theme.colors.onSurface }]}>{item.title}</Text>
                      <Text style={[styles.sessionDate, { color: Theme.colors.onSurfaceVariant }]}>{dateStr}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                      <AppIcon name="close" size={16} color={Theme.colors.error} />
                    </TouchableOpacity>
                  </View>

                  {item.summary ? (
                    <View style={[styles.summaryBox, { borderTopColor: Theme.colors.outlineVariant }]}>
                      <Text style={[styles.summaryLabel, { color: Theme.colors.primary }]}>Summary / Key Takeaways</Text>
                      <Text style={[styles.summaryText, { color: Theme.colors.onSurface }]}>{item.summary}</Text>
                    </View>
                  ) : null}

                  {selectedSession?.id === item.id && item.turns.length > 0 && (
                    <View style={[styles.transcriptBox, { borderTopColor: Theme.colors.outlineVariant }]}>
                      <Text style={[styles.transcriptLabel, { color: Theme.colors.onSurfaceVariant }]}>Transcript</Text>
                      {item.turns.map((t) => (
                        <Text key={t.id} style={[styles.turnLine, { color: Theme.colors.onSurface }]}>
                          <Text
                            style={[
                              styles.speakerText,
                              { color: t.channel === 'you' ? Theme.colors.primary : Theme.colors.secondary },
                            ]}
                          >
                            {t.channel === 'you' ? 'You: ' : 'Them: '}
                          </Text>
                          {t.text}
                        </Text>
                      ))}
                    </View>
                  )}
                </M3Card>
              );
            }}
          />
        )}
      </View>
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
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...Theme.typography.bodyMedium,
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
  },
  sessionDate: {
    ...Theme.typography.bodySmall,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 6,
  },
  deleteText: {
    fontSize: 14,
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
  transcriptBox: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 4,
  },
  transcriptLabel: {
    ...Theme.typography.labelSmall,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  turnLine: {
    ...Theme.typography.bodySmall,
    lineHeight: 18,
  },
  speakerText: {
    fontWeight: '700',
  },
});
