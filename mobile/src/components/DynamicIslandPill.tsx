import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ModeId } from '../types';
import { Theme, isIOS } from '../theme/adaptive';
import { AppIcon } from './AppIcon';

interface DynamicIslandPillProps {
  mode: ModeId;
  isListening: boolean;
  activeAnswer?: string;
  onTriggerMode: (mode: ModeId) => void;
}

export const DynamicIslandPill: React.FC<DynamicIslandPillProps> = ({
  mode,
  isListening,
  activeAnswer,
  onTriggerMode,
}) => {
  const [expanded, setExpanded] = useState(false);
  const insets = useSafeAreaInsets();

  if (!isIOS) return null;

  const topPos = Math.max(insets.top - 38, 8);

  return (
    <View style={[styles.wrapper, { top: topPos }]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setExpanded(!expanded)}
        style={[styles.islandContainer, expanded && styles.islandExpanded]}
      >
        {/* Compact Dynamic Island Row */}
        <View style={styles.compactRow}>
          <View style={styles.leftGroup}>
            <View style={[styles.micDot, isListening && styles.micDotActive]} />
            <Text style={styles.islandTitle}>Cue</Text>
            <View style={styles.modeBadge}>
              <Text style={styles.modeText}>{mode.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.rightGroup}>
            <Text style={styles.liveIndicatorText}>
              {isListening ? 'LIVE' : 'PAUSED'}
            </Text>
            <Text style={styles.expandChevron}>{expanded ? '▲' : '▼'}</Text>
          </View>
        </View>

        {/* Expanded Dynamic Island / Live Activity Drawer */}
        {expanded && (
          <View style={styles.expandedContent}>
            {activeAnswer ? (
              <View style={styles.answerBox}>
                <Text style={styles.answerLabel}>AI COPILOT</Text>
                <Text style={styles.answerText} numberOfLines={4}>
                  {activeAnswer}
                </Text>
              </View>
            ) : (
              <Text style={styles.listeningHint}>
                {isListening ? 'Listening to speech...' : 'Microphone paused.'}
              </Text>
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.pillBtn, styles.primaryPill]}
                onPress={() => onTriggerMode('say')}
              >
                <AppIcon name="bolt" size={13} color={styles.primaryPillText.color} />
                <Text style={styles.primaryPillText}> Say</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pillBtn}
                onPress={() => onTriggerMode('phoneCall')}
              >
                <AppIcon name="phone" size={13} color={Theme.colors.onSurface} />
                <Text style={styles.pillBtnText}> Phone</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pillBtn}
                onPress={() => onTriggerMode('assist')}
              >
                <AppIcon name="sparkles" size={13} color={Theme.colors.onSurface} />
                <Text style={styles.pillBtnText}> Assist</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10000,
  },
  islandContainer: {
    backgroundColor: '#000000',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 9,
    width: 220,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  islandExpanded: {
    width: '92%',
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(10, 10, 12, 0.96)',
    borderColor: 'rgba(10, 132, 255, 0.35)',
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  micDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8E8E93',
  },
  micDotActive: {
    backgroundColor: '#34C759',
    shadowColor: '#34C759',
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  islandTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  modeBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  modeText: {
    color: '#70B6FF',
    fontSize: 9,
    fontWeight: '700',
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveIndicatorText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
    fontWeight: '700',
  },
  expandChevron: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 9,
  },
  expandedContent: {
    marginTop: 12,
    gap: 10,
  },
  answerBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  answerLabel: {
    color: '#70B6FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  answerText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
  },
  listeningHint: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pillBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primaryPill: {
    backgroundColor: '#0A84FF',
  },
  pillBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  primaryPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
