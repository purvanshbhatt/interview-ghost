import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, StatusBar as RNStatusBar, TouchableOpacity, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { M3Card } from '../components/M3Card';
import { M3TopAppBar } from '../components/M3TopAppBar';
import { Theme, isIOS, isPad } from '../theme/adaptive';
import { ModeId } from '../types';
import { MODES_META } from '../services/prompts';
import { CallHelper } from '../services/call-helper';
import { AppIcon } from '../components/AppIcon';

interface HomeScreenProps {
  onStartSession: (mode: ModeId) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onStartSession }) => {
  const insets = useSafeAreaInsets();
  const [callState, setCallState] = useState<'IDLE' | 'RINGING' | 'OFFHOOK'>('IDLE');
  const [canDrawOverlays, setCanDrawOverlays] = useState(true);
  const [updateInfo, setUpdateInfo] = useState<string | null>(null);
  const modes: ModeId[] = ['phoneCall', 'say', 'assist', 'mock', 'coffee', 'notes'];

  useEffect(() => {
    // Check GitHub commits for mobile app updates
    fetch('https://api.github.com/repos/purvanshbhatt/interview-ghost/commits/main', {
      headers: { 'User-Agent': 'Ghost-Mobile' },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.sha) {
          const msg = data.commit?.message?.split('\n')?.[0] || 'Latest improvements';
          const shortSha = (data.sha || '').slice(0, 7);
          setUpdateInfo(`${shortSha}: ${msg}`);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      CallHelper.getCallState().then((s) => {
        if (s === 'RINGING' || s === 'OFFHOOK') setCallState(s);
      });
      CallHelper.canDrawOverlays().then(setCanDrawOverlays);

      const sub = CallHelper.addCallStateListener((payload) => {
        if (payload.state === 'RINGING' || payload.state === 'OFFHOOK' || payload.state === 'IDLE') {
          setCallState(payload.state);
        }
      });
      return () => {
        sub.remove();
      };
    }
  }, []);

  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (RNStatusBar.currentHeight || 28) : 20
  );

  return (
    <View style={[styles.safeArea, { backgroundColor: Theme.colors.background, paddingTop: topInset }]}>
      <M3TopAppBar
        title="Ghost"
        subtitle={isPad ? "AI Copilot for Meetings, Interviews & Live Coaching" : "AI Copilot for Phone Calls, Meetings & Interviews"}
      />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          isPad && styles.tabletContainer,
          { paddingBottom: Math.max(insets.bottom, 16) + 70 },
        ]}
      >
        {/* GitHub Update Notification Pill */}
        {updateInfo && (
          <TouchableOpacity
            style={[styles.updateBanner, { backgroundColor: Theme.colors.surfaceContainerHigh }]}
            onPress={() => Linking.openURL('https://github.com/purvanshbhatt/interview-ghost/releases')}
          >
            <View style={styles.updateInfo}>
              <View style={styles.updateBadgeRow}>
                <Text style={[styles.updateBadge, { color: Theme.colors.primary }]}>🚀 GHOST UPDATE</Text>
              </View>
              <Text style={[styles.updateDesc, { color: Theme.colors.onSurface }]} numberOfLines={1}>
                {updateInfo}
              </Text>
            </View>
            <Text style={[styles.updateAction, { color: Theme.colors.primary }]}>View →</Text>
          </TouchableOpacity>
        )}

        {/* Live Phone Call Detected Alert Card (Android 17 Material 3) */}
        {callState !== 'IDLE' && (
          <M3Card
            variant="elevated"
            onPress={() => onStartSession('phoneCall')}
            style={[
              styles.callActiveCard,
              {
                backgroundColor: Theme.colors.primaryContainer,
                borderColor: Theme.colors.primary,
              },
            ]}
          >
            <View style={styles.callActiveHeader}>
              <View style={[styles.pulseDot, { backgroundColor: Theme.colors.live }]} />
              <Text style={[styles.callActiveBadge, { color: Theme.colors.onPrimaryContainer }]}>
                {callState === 'RINGING' ? 'INCOMING PHONE CALL' : 'ACTIVE PHONE CALL IN PROGRESS'}
              </Text>
            </View>
            <Text style={[styles.callActiveTitle, { color: Theme.colors.onPrimaryContainer }]}>
              Phone Call Detected
            </Text>
            <Text style={[styles.callActiveSubtitle, { color: Theme.colors.onPrimaryContainer }]}>
              Tap to start Phone Call Helper with floating overlay and speakerphone audio capture.
            </Text>
            <View style={[styles.callActionBtn, { backgroundColor: Theme.colors.primary }]}>
              <Text style={[styles.callActionBtnText, { color: Theme.colors.onPrimary }]}>
                Start Phone Call Copilot →
              </Text>
            </View>
          </M3Card>
        )}

        {/* Floating Overlay Permission Banner if disabled on Android */}
        {Platform.OS === 'android' && !canDrawOverlays && (
          <View style={[styles.permissionBanner, { backgroundColor: Theme.colors.surfaceContainerHigh }]}>
            <View style={styles.permissionInfo}>
              <Text style={[styles.permissionTitle, { color: Theme.colors.onSurface }]}>
                Floating Overlay Recommended
              </Text>
              <Text style={[styles.permissionDesc, { color: Theme.colors.onSurfaceVariant }]}>
                Allows Ghost to float over your phone dialer, Zoom, Google Meet & WhatsApp.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.grantBtn, { backgroundColor: Theme.colors.primary }]}
              onPress={() => {
                CallHelper.requestOverlayPermission();
                setTimeout(() => CallHelper.canDrawOverlays().then(setCanDrawOverlays), 2000);
              }}
            >
              <Text style={[styles.grantBtnText, { color: Theme.colors.onPrimary }]}>Enable</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.modeGrid, isPad && styles.tabletGrid]}>
          {modes.map((mode) => {
            const meta = MODES_META[mode];
            const isFeatured = mode === 'phoneCall' || mode === 'say';
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
                    borderColor: mode === 'phoneCall' ? Theme.colors.primary : Theme.colors.primaryContainer,
                    borderWidth: mode === 'phoneCall' ? 1.5 : 1,
                  },
                ]}
              >
                <View style={styles.modeHeader}>
                  <Text style={[styles.modeBadge, { color: Theme.colors.primary }]}>{mode}</Text>
                  {isFeatured && (
                    <View style={[styles.recBadge, { backgroundColor: Theme.colors.secondaryContainer }]}>
                      <Text style={[styles.recText, { color: Theme.colors.onSecondaryContainer }]}>
                        {mode === 'phoneCall' ? 'CALL & DIALER' : 'RECOMMENDED'}
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
  callActiveCard: {
    marginBottom: 16,
    padding: 18,
    borderWidth: 1.5,
  },
  callActiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  callActiveBadge: {
    ...Theme.typography.labelSmall,
    letterSpacing: 0.8,
    fontWeight: '800',
  },
  callActiveTitle: {
    ...Theme.typography.headlineSmall,
    fontWeight: '700',
    marginBottom: 4,
  },
  callActiveSubtitle: {
    ...Theme.typography.bodyMedium,
    lineHeight: 20,
    marginBottom: 14,
    opacity: 0.9,
  },
  callActionBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: Theme.shapes.full,
  },
  callActionBtnText: {
    ...Theme.typography.labelLarge,
    fontWeight: '700',
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: Theme.shapes.large,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
  },
  permissionInfo: {
    flex: 1,
    marginRight: 12,
  },
  permissionTitle: {
    ...Theme.typography.titleSmall,
    fontWeight: '700',
    marginBottom: 2,
  },
  permissionDesc: {
    ...Theme.typography.bodySmall,
    lineHeight: 16,
  },
  grantBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Theme.shapes.full,
  },
  grantBtnText: {
    ...Theme.typography.labelMedium,
    fontWeight: '700',
  },
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: Theme.shapes.large,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
  },
  updateInfo: {
    flex: 1,
    marginRight: 10,
  },
  updateBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  updateBadge: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  updateDesc: {
    ...Theme.typography.bodySmall,
    fontSize: 12,
  },
  updateAction: {
    ...Theme.typography.labelMedium,
    fontWeight: '700',
  },
});
