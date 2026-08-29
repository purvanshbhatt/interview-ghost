import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { M3TopAppBar } from '../components/M3TopAppBar';
import { M3Chip } from '../components/M3Chip';
import { Theme, isIOS, isPad } from '../theme/adaptive';
import { AppSettings, LLMProvider, STTProvider } from '../types';
import { saveSettings } from '../services/storage';

interface SettingsScreenProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ settings: initialSettings, onUpdateSettings }) => {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [activeTab, setActiveTab] = useState<'keys' | 'profile' | 'prep' | 'rules'>('keys');

  const handleSave = async (updated: AppSettings) => {
    setSettings(updated);
    await saveSettings(updated);
    onUpdateSettings(updated);
  };

  const updateApiKey = (provider: string, key: string) => {
    const next = {
      ...settings,
      apiKeys: { ...settings.apiKeys, [provider]: key },
    };
    handleSave(next);
  };

  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (RNStatusBar.currentHeight || 28) : 20
  );

  return (
    <View style={[styles.safeArea, { backgroundColor: Theme.colors.background, paddingTop: topInset }]}>
      <M3TopAppBar title="Settings" subtitle="Models, keys & interview grounding" />
      <View style={[styles.container, isPad && styles.tabletContainer]}>
        {/* Tabs Row */}
        <View style={styles.tabsRow}>
          <M3Chip
            label="🔑 Keys"
            selected={activeTab === 'keys'}
            onPress={() => setActiveTab('keys')}
            style={styles.tabChip}
          />
          <M3Chip
            label="📄 Profile"
            selected={activeTab === 'profile'}
            onPress={() => setActiveTab('profile')}
            style={styles.tabChip}
          />
          <M3Chip
            label="🎯 Prep"
            selected={activeTab === 'prep'}
            onPress={() => setActiveTab('prep')}
            style={styles.tabChip}
          />
          <M3Chip
            label="✨ Rules"
            selected={activeTab === 'rules'}
            onPress={() => setActiveTab('rules')}
            style={styles.tabChip}
          />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 70 },
          ]}
        >
          {activeTab === 'keys' && (
            <View style={styles.pane}>
              <Text style={[styles.label, { color: Theme.colors.primary }]}>AI LLM Provider</Text>
              <View style={styles.providerGrid}>
                {(['openai', 'anthropic', 'gemini', 'groq'] as LLMProvider[]).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.providerBtn,
                      {
                        backgroundColor: Theme.colors.surfaceContainerHigh,
                        borderColor: Theme.colors.outlineVariant,
                      },
                      settings.provider === p && {
                        backgroundColor: Theme.colors.primaryContainer,
                        borderColor: Theme.colors.primary,
                      },
                    ]}
                    onPress={() => handleSave({ ...settings, provider: p })}
                  >
                    <Text
                      style={[
                        styles.providerText,
                        { color: Theme.colors.onSurfaceVariant },
                        settings.provider === p && {
                          color: Theme.colors.onPrimaryContainer,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      {p.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { color: Theme.colors.primary }]}>Speech-to-Text Provider</Text>
              <View style={styles.providerGrid}>
                {(['deepgram', 'openai', 'gemini', 'gemini-transcribe'] as STTProvider[]).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.providerBtn,
                      {
                        backgroundColor: Theme.colors.surfaceContainerHigh,
                        borderColor: Theme.colors.outlineVariant,
                      },
                      settings.sttProvider === s && {
                        backgroundColor: Theme.colors.primaryContainer,
                        borderColor: Theme.colors.primary,
                      },
                    ]}
                    onPress={() => handleSave({ ...settings, sttProvider: s })}
                  >
                    <Text
                      style={[
                        styles.providerText,
                        { color: Theme.colors.onSurfaceVariant },
                        settings.sttProvider === s && {
                          color: Theme.colors.onPrimaryContainer,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      {s === 'gemini-transcribe' ? 'GEMINI TRANSCRIBE' : s.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { color: Theme.colors.primary }]}>API Keys</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: Theme.colors.surfaceContainerHighest,
                    borderColor: Theme.colors.outlineVariant,
                    color: Theme.colors.onSurface,
                  },
                ]}
                placeholder="OpenAI API Key (sk-...)"
                placeholderTextColor={Theme.colors.onSurfaceVariant}
                secureTextEntry
                value={settings.apiKeys?.openai || ''}
                onChangeText={(t) => updateApiKey('openai', t)}
              />
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: Theme.colors.surfaceContainerHighest,
                    borderColor: Theme.colors.outlineVariant,
                    color: Theme.colors.onSurface,
                  },
                ]}
                placeholder="Google Gemini Key (AIza...)"
                placeholderTextColor={Theme.colors.onSurfaceVariant}
                secureTextEntry
                value={settings.apiKeys?.gemini || ''}
                onChangeText={(t) => updateApiKey('gemini', t)}
              />
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: Theme.colors.surfaceContainerHighest,
                    borderColor: Theme.colors.outlineVariant,
                    color: Theme.colors.onSurface,
                  },
                ]}
                placeholder="Anthropic Key (sk-ant-...)"
                placeholderTextColor={Theme.colors.onSurfaceVariant}
                secureTextEntry
                value={settings.apiKeys?.anthropic || ''}
                onChangeText={(t) => updateApiKey('anthropic', t)}
              />
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: Theme.colors.surfaceContainerHighest,
                    borderColor: Theme.colors.outlineVariant,
                    color: Theme.colors.onSurface,
                  },
                ]}
                placeholder="Deepgram Key (dg-...)"
                placeholderTextColor={Theme.colors.onSurfaceVariant}
                secureTextEntry
                value={settings.apiKeys?.deepgram || ''}
                onChangeText={(t) => updateApiKey('deepgram', t)}
              />
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: Theme.colors.surfaceContainerHighest,
                    borderColor: Theme.colors.outlineVariant,
                    color: Theme.colors.onSurface,
                  },
                ]}
                placeholder="Groq API Key (gsk_...)"
                placeholderTextColor={Theme.colors.onSurfaceVariant}
                secureTextEntry
                value={settings.apiKeys?.groq || ''}
                onChangeText={(t) => updateApiKey('groq', t)}
              />

              {!isIOS && (
                <View style={styles.switchRow}>
                  <Text style={[styles.switchLabel, { color: Theme.colors.onSurface }]}>
                    Android Call Floating Overlay
                  </Text>
                  <Switch
                    value={settings.floatingOverlayEnabled !== false}
                    trackColor={{ false: Theme.colors.surfaceContainerHigh, true: Theme.colors.primaryContainer }}
                    thumbColor={settings.floatingOverlayEnabled !== false ? Theme.colors.primary : Theme.colors.outline}
                    onValueChange={(v) => handleSave({ ...settings, floatingOverlayEnabled: v })}
                  />
                </View>
              )}
            </View>
          )}

          {activeTab === 'profile' && (
            <View style={styles.pane}>
              <Text style={[styles.label, { color: Theme.colors.primary }]}>Your Résumé</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  {
                    backgroundColor: Theme.colors.surfaceContainerHighest,
                    borderColor: Theme.colors.outlineVariant,
                    color: Theme.colors.onSurface,
                  },
                ]}
                multiline
                numberOfLines={8}
                placeholder="Paste your full résumé text here for tailored interview answers..."
                placeholderTextColor={Theme.colors.onSurfaceVariant}
                value={settings.resumeText || ''}
                onChangeText={(t) => handleSave({ ...settings, resumeText: t })}
              />

              <Text style={[styles.label, { color: Theme.colors.primary }]}>Target Job Description</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  {
                    backgroundColor: Theme.colors.surfaceContainerHighest,
                    borderColor: Theme.colors.outlineVariant,
                    color: Theme.colors.onSurface,
                  },
                ]}
                multiline
                numberOfLines={6}
                placeholder="Paste target job description..."
                placeholderTextColor={Theme.colors.onSurfaceVariant}
                value={settings.jobDescription || ''}
                onChangeText={(t) => handleSave({ ...settings, jobDescription: t })}
              />
            </View>
          )}

          {activeTab === 'prep' && (
            <View style={styles.pane}>
              <Text style={[styles.label, { color: Theme.colors.primary }]}>STAR Behavioral Stories</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  {
                    backgroundColor: Theme.colors.surfaceContainerHighest,
                    borderColor: Theme.colors.outlineVariant,
                    color: Theme.colors.onSurface,
                  },
                ]}
                multiline
                numberOfLines={8}
                placeholder="Situation, Task, Action, Result stories..."
                placeholderTextColor={Theme.colors.onSurfaceVariant}
                value={settings.starStories || ''}
                onChangeText={(t) => handleSave({ ...settings, starStories: t })}
              />

              <Text style={[styles.label, { color: Theme.colors.primary }]}>Why This Company / Motivation</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  {
                    backgroundColor: Theme.colors.surfaceContainerHighest,
                    borderColor: Theme.colors.outlineVariant,
                    color: Theme.colors.onSurface,
                  },
                ]}
                multiline
                numberOfLines={4}
                placeholder="Why do you want this role..."
                placeholderTextColor={Theme.colors.onSurfaceVariant}
                value={settings.whyCompany || ''}
                onChangeText={(t) => handleSave({ ...settings, whyCompany: t })}
              />

              <Text style={[styles.label, { color: Theme.colors.primary }]}>Salary Target</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: Theme.colors.surfaceContainerHighest,
                    borderColor: Theme.colors.outlineVariant,
                    color: Theme.colors.onSurface,
                  },
                ]}
                placeholder="e.g. $140k - $160k"
                placeholderTextColor={Theme.colors.onSurfaceVariant}
                value={settings.salaryTarget || ''}
                onChangeText={(t) => handleSave({ ...settings, salaryTarget: t })}
              />
            </View>
          )}

          {activeTab === 'rules' && (
            <View style={styles.pane}>
              <Text style={[styles.label, { color: Theme.colors.primary }]}>AI Behavioral & Style Rules</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  {
                    backgroundColor: Theme.colors.surfaceContainerHighest,
                    borderColor: Theme.colors.outlineVariant,
                    color: Theme.colors.onSurface,
                  },
                ]}
                multiline
                numberOfLines={8}
                placeholder="- Reply in 2-3 short bullet points&#10;- Use a confident first-person tone&#10;- Avoid technical jargon"
                placeholderTextColor={Theme.colors.onSurfaceVariant}
                value={settings.aiRules || ''}
                onChangeText={(t) => handleSave({ ...settings, aiRules: t })}
              />
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 16,
  },
  tabletContainer: {
    paddingHorizontal: 32,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tabChip: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  pane: {
    gap: 12,
  },
  label: {
    ...Theme.typography.labelSmall,
    textTransform: 'uppercase',
    marginTop: 6,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  providerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  providerBtn: {
    flex: 1,
    minWidth: '22%',
    paddingVertical: 10,
    borderRadius: Theme.shapes.small,
    borderWidth: 1,
    alignItems: 'center',
  },
  providerText: {
    ...Theme.typography.labelSmall,
  },
  input: {
    borderWidth: 1,
    borderRadius: Theme.shapes.medium,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 8,
  },
  switchLabel: {
    ...Theme.typography.bodyLarge,
  },
});
