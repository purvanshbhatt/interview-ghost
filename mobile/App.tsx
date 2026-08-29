import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeScreen } from './src/screens/HomeScreen';
import { SessionScreen } from './src/screens/SessionScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { M3NavigationBar, NavItem } from './src/components/M3NavigationBar';
import { GlassTabBar, GlassTab } from './src/components/GlassTabBar';
import { IPadSidebar } from './src/components/IPadSidebar';
import { Theme, isIOS, isPad } from './src/theme/adaptive';
import { AppSettings, ModeId } from './src/types';
import { loadSettings } from './src/services/storage';

type TabId = 'home' | 'history' | 'settings';

const NAV_ICONS = {
  home: 'bolt',
  history: 'history',
  settings: 'settings',
} as const;

function MainApp() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [activeSessionMode, setActiveSessionMode] = useState<ModeId | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  if (!settings) {
    return <View style={[styles.loadingContainer, { backgroundColor: Theme.colors.background }]} />;
  }

  if (activeSessionMode) {
    return (
      <View style={[styles.container, { backgroundColor: Theme.colors.background }]}>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <SessionScreen
          mode={activeSessionMode}
          settings={settings}
          onEndSession={() => setActiveSessionMode(null)}
        />
      </View>
    );
  }

  if (isPad) {
    return (
      <View style={[styles.row, { backgroundColor: Theme.colors.background }]}>
        <StatusBar style="light" backgroundColor="transparent" />
        <IPadSidebar
          items={[
            { id: 'home', label: 'Copilot', icon: NAV_ICONS.home },
            { id: 'history', label: 'Sessions', icon: NAV_ICONS.history },
            { id: 'settings', label: 'Settings', icon: NAV_ICONS.settings },
          ]}
          activeId={activeTab}
          onSelect={(id) => setActiveTab(id as TabId)}
          header={{ title: 'Cue', subtitle: 'Interview Copilot' }}
        />
        <View style={styles.screenArea}>
          {activeTab === 'home' && <HomeScreen onStartSession={(m) => setActiveSessionMode(m)} />}
          {activeTab === 'history' && <HistoryScreen />}
          {activeTab === 'settings' && (
            <SettingsScreen settings={settings} onUpdateSettings={setSettings} />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Theme.colors.background }]}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <View style={styles.screenArea}>
        {activeTab === 'home' && <HomeScreen onStartSession={(m) => setActiveSessionMode(m)} />}
        {activeTab === 'history' && <HistoryScreen />}
        {activeTab === 'settings' && (
          <SettingsScreen settings={settings} onUpdateSettings={setSettings} />
        )}
      </View>

      {isIOS ? (
        <GlassTabBar
          tabs={
            [
              { id: 'home', label: 'Copilot', icon: 'bolt' },
              { id: 'history', label: 'Sessions', icon: 'history' },
              { id: 'settings', label: 'Settings', icon: 'settings' },
            ] as GlassTab[]
          }
          activeId={activeTab}
          onSelect={(id) => setActiveTab(id as TabId)}
        />
      ) : (
        <View
          style={{
            paddingBottom: Math.max(insets.bottom, 6),
            backgroundColor: Theme.colors.surfaceContainer,
          }}
        >
          <M3NavigationBar
            items={
              [
                { id: 'home', label: 'Copilot', icon: NAV_ICONS.home },
                { id: 'history', label: 'Sessions', icon: NAV_ICONS.history },
                { id: 'settings', label: 'Settings', icon: NAV_ICONS.settings },
              ] as NavItem[]
            }
            activeId={activeTab}
            onSelect={(id) => setActiveTab(id as TabId)}
          />
        </View>
      )}

      {/* Floating glass tab bar needs breathing room over content */}
      <View style={{ height: isIOS ? Math.max(insets.bottom + 4, 12) : 0 }} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
  },
  screenArea: {
    flex: 1,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
});
