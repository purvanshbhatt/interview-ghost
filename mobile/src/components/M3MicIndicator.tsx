import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Theme } from '../theme/adaptive';
import { AppIcon } from './AppIcon';

interface M3MicIndicatorProps {
  isListening: boolean;
  audioLevel: number; // 0.0 to 1.0
  error?: string | null;
  onToggleListening?: () => void;
  onRequestPermission?: () => void;
}

export const M3MicIndicator: React.FC<M3MicIndicatorProps> = ({
  isListening,
  audioLevel,
  error,
  onToggleListening,
  onRequestPermission,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const barAnim1 = useRef(new Animated.Value(0.2)).current;
  const barAnim2 = useRef(new Animated.Value(0.4)).current;
  const barAnim3 = useRef(new Animated.Value(0.3)).current;
  const barAnim4 = useRef(new Animated.Value(0.5)).current;
  const barAnim5 = useRef(new Animated.Value(0.2)).current;

  // Pulse effect when listening
  useEffect(() => {
    if (isListening && !error) {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();
      return () => pulseLoop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening, error]);

  // Animate audio waveform bars responding to audioLevel
  useEffect(() => {
    if (isListening) {
      const target1 = Math.max(0.15, Math.min(1.0, audioLevel * 1.3));
      const target2 = Math.max(0.25, Math.min(1.0, audioLevel * 1.8));
      const target3 = Math.max(0.35, Math.min(1.0, audioLevel * 2.2));
      const target4 = Math.max(0.2, Math.min(1.0, audioLevel * 1.6));
      const target5 = Math.max(0.15, Math.min(1.0, audioLevel * 1.2));

      Animated.parallel([
        Animated.timing(barAnim1, { toValue: target1, duration: 90, useNativeDriver: false }),
        Animated.timing(barAnim2, { toValue: target2, duration: 80, useNativeDriver: false }),
        Animated.timing(barAnim3, { toValue: target3, duration: 70, useNativeDriver: false }),
        Animated.timing(barAnim4, { toValue: target4, duration: 85, useNativeDriver: false }),
        Animated.timing(barAnim5, { toValue: target5, duration: 100, useNativeDriver: false }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(barAnim1, { toValue: 0.15, duration: 150, useNativeDriver: false }),
        Animated.timing(barAnim2, { toValue: 0.15, duration: 150, useNativeDriver: false }),
        Animated.timing(barAnim3, { toValue: 0.15, duration: 150, useNativeDriver: false }),
        Animated.timing(barAnim4, { toValue: 0.15, duration: 150, useNativeDriver: false }),
        Animated.timing(barAnim5, { toValue: 0.15, duration: 150, useNativeDriver: false }),
      ]).start();
    }
  }, [audioLevel, isListening]);

  const hasVoice = isListening && audioLevel > 0.08;

  if (error) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onRequestPermission || onToggleListening}
        style={[styles.container, { backgroundColor: Theme.colors.errorContainer, borderColor: Theme.colors.error }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: Theme.colors.error }]}>
          <AppIcon name="mic-off" size={16} color={(Theme.colors as any).onError || '#FFFFFF'} />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.statusTitle, { color: Theme.colors.onErrorContainer }]}>
            Microphone Access Required
          </Text>
          <Text style={[styles.statusSub, { color: Theme.colors.onErrorContainer }]}>
            {error} • Tap to grant permission
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onToggleListening}
      style={[
        styles.container,
        {
          backgroundColor: isListening
            ? (hasVoice ? Theme.colors.surfaceContainerHighest : Theme.colors.surfaceContainer)
            : Theme.colors.surfaceContainerLow,
          borderColor: isListening
            ? (hasVoice ? Theme.colors.live : Theme.colors.primary)
            : Theme.colors.outlineVariant,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.iconWrap,
          {
            backgroundColor: isListening
              ? (hasVoice ? Theme.colors.liveContainer : Theme.colors.primaryContainer)
              : Theme.colors.surfaceContainerHigh,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <AppIcon
          name={isListening ? 'mic' : 'mic-off'}
          size={18}
          color={isListening ? (hasVoice ? Theme.colors.live : Theme.colors.primary) : Theme.colors.outline}
        />
      </Animated.View>

      <View style={styles.textWrap}>
        <View style={styles.titleRow}>
          <View
            style={[
              styles.liveDot,
              { backgroundColor: isListening ? (hasVoice ? Theme.colors.live : Theme.colors.primary) : Theme.colors.outline },
            ]}
          />
          <Text
            style={[
              styles.statusTitle,
              {
                color: isListening
                  ? (hasVoice ? Theme.colors.live : Theme.colors.onSurface)
                  : Theme.colors.onSurfaceVariant,
              },
            ]}
          >
            {isListening
              ? hasVoice
                ? 'Hearing Voice • Active Speech Detected'
                : 'Microphone Active • Listening...'
              : 'Microphone Paused (Tap to Listen)'}
          </Text>
        </View>
        <Text style={[styles.statusSub, { color: Theme.colors.onSurfaceVariant }]}>
          {isListening
            ? 'Real-time 4s speech chunking enabled'
            : 'Tap anywhere on this bar to resume listening'}
        </Text>
      </View>

      {/* Live Equalizer Waveform Bars */}
      {isListening && (
        <View style={styles.waveformContainer}>
          {[barAnim1, barAnim2, barAnim3, barAnim4, barAnim5].map((anim, idx) => (
            <Animated.View
              key={idx}
              style={[
                styles.waveBar,
                {
                  backgroundColor: hasVoice ? Theme.colors.live : Theme.colors.primary,
                  height: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [4, 22],
                  }),
                },
              ]}
            />
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Theme.shapes.large,
    borderWidth: 1.5,
    marginHorizontal: 16,
    marginVertical: 6,
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusTitle: {
    ...Theme.typography.labelMedium,
    fontWeight: '700',
  },
  statusSub: {
    ...Theme.typography.bodySmall,
    fontSize: 11,
    marginTop: 1,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 24,
    paddingRight: 4,
  },
  waveBar: {
    width: 3.5,
    borderRadius: 2,
  },
});
