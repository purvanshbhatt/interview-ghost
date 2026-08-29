import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, TouchableOpacity } from 'react-native';
import { Theme } from '../theme/adaptive';

interface M3CardProps {
  children: React.ReactNode;
  variant?: 'elevated' | 'filled' | 'outlined';
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

export const M3Card: React.FC<M3CardProps> = ({
  children,
  variant = 'filled',
  style,
  onPress,
}) => {
  const cardStyle = [
    styles.base,
    variant === 'elevated' && styles.elevated,
    variant === 'filled' && styles.filled,
    variant === 'outlined' && styles.outlined,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={cardStyle}>
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{children}</View>;
};

const styles = StyleSheet.create({
  base: {
    borderRadius: Theme.shapes.extraLarge,
    padding: 18,
    overflow: 'hidden',
  },
  elevated: {
    backgroundColor: Theme.colors.surfaceContainerLow,
    shadowColor: Theme.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  filled: {
    backgroundColor: Theme.colors.surfaceContainerHighest,
  },
  outlined: {
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
  },
});
