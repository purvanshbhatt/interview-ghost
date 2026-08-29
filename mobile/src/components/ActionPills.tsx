import React from 'react';
import { StyleSheet, ScrollView } from 'react-native';
import { ModeId } from '../types';
import { MODES_META } from '../services/prompts';
import { M3Chip } from './M3Chip';

interface ActionPillsProps {
  onSelectMode: (mode: ModeId) => void;
  busy?: boolean;
}

export const ActionPills: React.FC<ActionPillsProps> = ({ onSelectMode, busy }) => {
  const modes: ModeId[] = ['say', 'phoneCall', 'assist', 'followup', 'recap', 'mock', 'coffee', 'notes'];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      {modes.map((mode) => {
        const meta = MODES_META[mode];
        const isPrimary = mode === 'say' || mode === 'phoneCall';
        return (
          <M3Chip
            key={mode}
            label={meta.title}
            selected={isPrimary}
            onPress={() => !busy && onSelectMode(mode)}
            style={styles.chip}
          />
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
  },
});
