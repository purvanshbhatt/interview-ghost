import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ModeId } from '../types';
import { M3Colors, M3Shapes, M3Typography } from '../theme/material3';
import { AppIcon } from './AppIcon';

interface FloatingOverlayProps {
  visible: boolean;
  activeAnswer: string;
  isListening: boolean;
  onTriggerMode: (mode: ModeId) => void;
  onClose: () => void;
}

export const FloatingOverlay: React.FC<FloatingOverlayProps> = ({
  visible,
  activeAnswer,
  isListening,
  onTriggerMode,
  onClose,
}) => {
  if (!visible || Platform.OS !== 'android') return null;

  return (
    <View style={styles.floatingContainer}>
      <View style={styles.header}>
        <View style={[styles.statusDot, isListening ? styles.dotActive : styles.dotIdle]} />
        <Text style={styles.title}>Cue Call Copilot</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <AppIcon name="close" size={16} color={M3Colors.onSurfaceVariant} />
        </TouchableOpacity>
      </View>

      {activeAnswer ? (
        <View style={styles.answerBox}>
          <Text style={styles.answerText}>{activeAnswer}</Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.btn, styles.primaryBtn]} onPress={() => onTriggerMode('say')}>
          <Text style={[styles.btnText, styles.primaryBtnText]}>Say</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => onTriggerMode('phoneCall')}>
          <Text style={styles.btnText}>Phone</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => onTriggerMode('assist')}>
          <Text style={styles.btnText}>Assist</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    top: 50,
    right: 16,
    left: 16,
    backgroundColor: M3Colors.surfaceContainerHigh,
    borderRadius: M3Shapes.large,
    borderWidth: 1,
    borderColor: M3Colors.outlineVariant,
    padding: 14,
    zIndex: 9999,
    shadowColor: M3Colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: M3Shapes.full,
    marginRight: 8,
  },
  dotActive: {
    backgroundColor: M3Colors.live,
  },
  dotIdle: {
    backgroundColor: M3Colors.outline,
  },
  title: {
    ...M3Typography.labelLarge,
    color: M3Colors.onSurface,
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    color: M3Colors.onSurfaceVariant,
    fontSize: 14,
  },
  answerBox: {
    backgroundColor: M3Colors.primaryContainer,
    borderRadius: M3Shapes.medium,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: M3Colors.primary,
  },
  answerText: {
    ...M3Typography.bodyMedium,
    color: M3Colors.onPrimaryContainer,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: M3Shapes.full,
    backgroundColor: M3Colors.surfaceContainerHighest,
    alignItems: 'center',
  },
  primaryBtn: {
    backgroundColor: M3Colors.primary,
  },
  btnText: {
    ...M3Typography.labelSmall,
    color: M3Colors.onSurface,
  },
  primaryBtnText: {
    color: M3Colors.onPrimary,
  },
});
