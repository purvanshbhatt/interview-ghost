import React from 'react';
import { TouchableOpacity, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Theme } from '../theme/adaptive';

interface M3ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const M3Chip: React.FC<M3ChipProps> = ({
  label,
  selected = false,
  onPress,
  icon,
  style,
}) => {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.chip, selected && styles.selectedChip, style]}
    >
      {icon}
      <Text style={[styles.label, selected && styles.selectedLabel]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  chip: {
    height: 36,
    borderRadius: Theme.shapes.small,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
    gap: 6,
  },
  selectedChip: {
    backgroundColor: Theme.colors.secondaryContainer,
    borderColor: Theme.colors.secondary,
  },
  label: {
    ...Theme.typography.labelMedium,
    color: Theme.colors.onSurfaceVariant,
  },
  selectedLabel: {
    color: Theme.colors.onSecondaryContainer,
    fontWeight: '700',
  },
});
