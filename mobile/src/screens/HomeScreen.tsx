import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, StatusBar as RNStatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { M3Card } from '../components/M3Card';
import { M3TopAppBar } from '../components/M3TopAppBar';
import { Theme, isIOS, isPad } from '../theme/adaptive';
import { ModeId } from '../types';
import { MODES_META } from '../services/prompts';

interface HomeScreenProps {
  onStartSession: (mode: ModeId) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onStartSession }) => {
  const insets = useSafeAreaInsets();
  const modes: ModeId[] = ['say', 'phoneCall', 'assist', 'mock', 'coffee', 'notes'];

  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (RNStatusBar.currentHeight || 28) : 20
  );

  return (
    <View style={[styles.safeArea, { backgroundColor: Theme.colors.background, paddingTop: topInset }]}>
      <M3TopAppBar
        title="Cue"
        subtitle={isPad ? "AI Copilot for Meetings, Interviews & Live Coaching" : "AI Copilot for Phone Calls & Interviews"}
      />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          isPad && styles.tabletContainer,
          { paddingBottom: Math.max(insets.bottom, 16) + 70 },
        ]}
      >
        <View style={[styles.modeGrid, isPad && styles.tabletGrid]}>
          {modes.map((mode) => {
            const meta = MODES_META[mode];
            const isFeatured = mode === 'say' || mode === 'phoneCall';
            return (
              <M3Card
                key={mode}
                variant={isFeatured ? (isIOS ? 'filled' : 'elevated') : 'filled'}
                onPress={() => onStartSession(mode)}
                style={[
                  styles.cardItem,
                  isPad && styles.tabletCard,
                  isFeatured && {
                    backgroundColor: Theme.colors.surfaceContainerHigh,
                    borderColor: Theme.colors.primaryContainer,
                    borderWidth: 1,
                  },
                ]}
              >
                <View style={styles.modeHeader}>
                  <Text style={[styles.modeBadge, { color: Theme.colors.primary }]}>{mode}</Text>
                  {isFeatured && (
                    <View style={[styles.recBadge, { backgroundColor: Theme.colors.secondaryContainer }]}>
                      <Text style={[styles.recText, { color: Theme.colors.onSecondaryContainer }]}>
                        RECOMMENDED
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.modeTitle, { color: Theme.colors.onSurface }]}>{meta.title}</Text>
                <Text style={[styles.modeSubtitle, { color: Theme.colors.onSurfaceVariant }]}>{meta.subtitle}</Text>
                <View
                  style={[
                    styles.startButton,
                    {
                      backgroundColor: isFeatured
                        ? Theme.colors.primary
                        : Theme.colors.surfaceContainerHighest,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.startBtnText,
                      { color: isFeatured ? Theme.colors.onPrimary : Theme.colors.onSurface },
                    ]}
                  >
                    Start Mode →
                  </Text>
                </View>
              </M3Card>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    padding: 16,
  },
  tabletContainer: {
    paddingHorizontal: 32,
  },
  modeGrid: {
    gap: 14,
  },
  tabletGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cardItem: {
    width: '100%',
  },
  tabletCard: {
    width: '48%',
    marginRight: '2%',
    marginBottom: 14,
  },
  modeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modeBadge: {
    ...Theme.typography.labelMedium,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  recBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Theme.shapes.full,
  },
  recText: {
    ...Theme.typography.labelSmall,
    fontSize: 9,
  },
  modeTitle: {
    ...Theme.typography.titleLarge,
    marginBottom: 4,
  },
  modeSubtitle: {
    ...Theme.typography.bodyMedium,
    lineHeight: 20,
    marginBottom: 14,
  },
  startButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Theme.shapes.full,
  },
  startBtnText: {
    ...Theme.typography.labelMedium,
    fontWeight: '700',
  },
});
