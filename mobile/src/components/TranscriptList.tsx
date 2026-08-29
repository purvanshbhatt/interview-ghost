import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Turn } from '../types';
import { Theme } from '../theme/adaptive';

interface TranscriptListProps {
  turns: Turn[];
}

export const TranscriptList: React.FC<TranscriptListProps> = ({ turns }) => {
  if (turns.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Listening... Spoken conversation will appear here.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={turns}
      keyExtractor={(item) => item.id}
      style={styles.list}
      contentContainerStyle={styles.content}
      renderItem={({ item }) => {
        const isThem = item.channel === 'them';
        return (
          <View style={[styles.turnRow, isThem ? styles.themRow : styles.youRow]}>
            <Text style={[styles.speakerLabel, isThem ? styles.themLabel : styles.youLabel]}>
              {isThem ? 'Interviewer / Caller' : 'You'}
            </Text>
            <Text style={[styles.turnText, item.isInterim && styles.interimText]}>
              {item.text}
            </Text>
          </View>
        );
      }}
    />
  );
};

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    paddingVertical: 10,
    gap: 10,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...Theme.typography.bodySmall,
    color: Theme.colors.onSurfaceVariant,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  turnRow: {
    padding: 14,
    borderRadius: Theme.shapes.large,
    borderWidth: 1,
  },
  themRow: {
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderColor: Theme.colors.outlineVariant,
  },
  youRow: {
    backgroundColor: Theme.colors.primaryContainer,
    borderColor: Theme.colors.primary,
  },
  speakerLabel: {
    ...Theme.typography.labelSmall,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  themLabel: {
    color: Theme.colors.secondary,
  },
  youLabel: {
    color: Theme.colors.onPrimaryContainer,
  },
  turnText: {
    ...Theme.typography.bodyMedium,
    color: Theme.colors.onSurface,
    lineHeight: 20,
  },
  interimText: {
    fontStyle: 'italic',
    opacity: 0.8,
  },
});
