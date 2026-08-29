import React from 'react';
import { TouchableOpacity, Text, StyleSheet, StyleProp, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import { M3Colors, M3Shapes, M3Typography } from '../theme/material3';

interface M3ButtonProps {
  label: string;
  variant?: 'filled' | 'tonal' | 'outlined' | 'text';
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  icon?: React.ReactNode;
}

export const M3Button: React.FC<M3ButtonProps> = ({
  label,
  variant = 'filled',
  onPress,
  disabled = false,
  loading = false,
  style,
  labelStyle,
  icon,
}) => {
  const containerStyles = [
    styles.base,
    variant === 'filled' && styles.filled,
    variant === 'tonal' && styles.tonal,
    variant === 'outlined' && styles.outlined,
    variant === 'text' && styles.text,
    disabled && styles.disabled,
    style,
  ];

  const textStyles = [
    styles.labelBase,
    variant === 'filled' && styles.filledText,
    variant === 'tonal' && styles.tonalText,
    variant === 'outlined' && styles.outlinedText,
    variant === 'text' && styles.textButtonText,
    disabled && styles.disabledText,
    labelStyle,
  ];

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      style={containerStyles}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'filled' ? M3Colors.onPrimary : M3Colors.primary}
        />
      ) : (
        <>
          {icon}
          <Text style={textStyles}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    height: 44,
    borderRadius: M3Shapes.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },
  filled: {
    backgroundColor: M3Colors.primary,
  },
  tonal: {
    backgroundColor: M3Colors.secondaryContainer,
  },
  outlined: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: M3Colors.outline,
  },
  text: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
  },
  disabled: {
    opacity: 0.38,
  },
  labelBase: {
    ...M3Typography.labelLarge,
  },
  filledText: {
    color: M3Colors.onPrimary,
  },
  tonalText: {
    color: M3Colors.onSecondaryContainer,
  },
  outlinedText: {
    color: M3Colors.primary,
  },
  textButtonText: {
    color: M3Colors.primary,
  },
  disabledText: {
    color: M3Colors.onSurface,
  },
});
