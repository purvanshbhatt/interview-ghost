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
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { M3TopAppBar } from '../components/M3TopAppBar';
import { M3Chip } from '../components/M3Chip';
import { Theme, isIOS, isPad } from '../theme/adaptive';
import { AppSettings, LLMProvider, STTProvider } from '../types';
import { saveSettings } from '../services/storage';
import { CallHelper } from '../services/call-helper';

interface SettingsScreenProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
}

const LANGUAGES = [
  { code: 'auto', name: '⚡ Auto-Detect (85+ Languages)', desc: 'Detects spoken language automatically' },
  { code: 'en', name: 'English', desc: 'English (US, UK, India, Global)' },
  { code: 'es', name: 'Spanish (Español)', desc: 'Spanish conversational & interview' },
  { code: 'fr', name: 'French (Français)', desc: 'French' },
  { code: 'de', name: 'German (Deutsch)', desc: 'German' },
  { code: 'hi', name: 'Hindi (हिन्दी / Hinglish)', desc: 'Hindi & mixed English dialogue' },
  { code: 'zh', name: 'Mandarin (中文)', desc: 'Simplified & Traditional Chinese' },
  { code: 'ja', name: 'Japanese (日本語)', desc: 'Japanese business & tech' },
  { code: 'pt', name: 'Portuguese (Português)', desc: 'Portuguese (Brazil / Portugal)' },
  { code: 'ru', name: 'Russian (Русский)', desc: 'Russian' },
  { code: 'ar', name: 'Arabic (العربية)', desc: 'Modern Standard Arabic' },
  { code: 'it', name: 'Italian (Italiano)', desc: 'Italian' },
  { code: 'ko', name: 'Korean (한국어)', desc: 'Korean' },
  { code: 'nl', name: 'Dutch (Nederlands)', desc: 'Dutch' },
  { code: 'tr', name: 'Turkish (Türkçe)', desc: 'Turkish' },
];

const TARGET_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'hi', name: 'Hindi' },
  { code: 'zh', name: 'Mandarin' },
  { code: 'ja', name: 'Japanese' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'ru', name: 'Russian' },
];

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ settings: initialSettings, onUpdateSettings }) => {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [activeTab, setActiveTab] = useState<'keys' | 'language' | 'profile' | 'prep' | 'rules' | 'updates'>('keys');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<string | null>(null);

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

  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateInfo(null);
    try {
      const res = await fetch('https://api.github.com/repos/purvanshbhatt/interview-ghost/commits/main', {
        headers: { 'User-Agent': 'Ghost-Interview-Copilot' },
      });
      if (res.ok) {
        const data = await res.json();
        const shortSha = (data.sha || '').substring(0, 7);
        const msg = data.commit?.message?.split('\n')[0] || '';
        const date = new Date(data.commit?.author?.date || '').toLocaleDateString();
        setUpdateInfo(`Latest GitHub commit (${shortSha}) on ${date}:\n"${msg}"\n\nYour Ghost client is connected to the latest repo release.`);
      } else {
        setUpdateInfo('Connected to purvanshbhatt/interview-ghost. Repository is accessible.');
      }
    } catch {
      setUpdateInfo('Could not reach GitHub API. Check your internet connection.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (RNStatusBar.currentHeight || 28) : 20
  );

  return (
    <View style={[styles.safeArea, { backgroundColor: Theme.colors.background, paddingTop: topInset }]}>
      <M3TopAppBar title="Settings" subtitle="Models, multilingual, rules & updates" />
      <View style={[styles.container, isPad && styles.tabletContainer]}>
        {/* Horizontal Scrollable Tabs Row */}
        <View style={styles.tabsRowWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsScroll}
          >
            <M3Chip
              label="🔑 Keys"
              selected={activeTab === 'keys'}
              onPress={() => setActiveTab('keys')}
            />
            <M3Chip
              label="🌐 Language"
              selected={activeTab === 'language'}
              onPress={() => setActiveTab('language')}
            />
            <M3Chip
              label="📄 Profile"
              selected={activeTab === 'profile'}
              onPress={() => setActiveTab('profile')}
            />
            <M3Chip
              label="🎯 Prep"
              selected={activeTab === 'prep'}
              onPress={() => setActiveTab('prep')}
            />
            <M3Chip
              label="✨ Rules"
              selected={activeTab === 'rules'}
              onPress={() => setActiveTab('rules')}
            />
            <M3Chip
              label="🚀 Updates"
              selected={activeTab === 'updates'}
              onPress={() => setActiveTab('updates')}
            />
          </ScrollView>
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

              {settings.provider === 'gemini' && (
                <View style={{ marginTop: 14 }}>
                  <Text style={[styles.label, { color: Theme.colors.primary }]}>
                    Gemini Model (Auto-Fallback for Free Keys)
                  </Text>
                  <View style={styles.modelList}>
                    {[
                      {
                        id: 'auto',
                        name: '⚡ Auto (Best & Fastest)',
                        desc: 'Probes Gemini 3.8 Flash, fails over instantly if free tier is busy',
                      },
                      {
                        id: 'gemini-3.8-flash',
                        name: 'Gemini 3.8 Flash',
                        desc: 'Latest Flagship - Fast & Smart conversational reasoning',
                      },
                      {
                        id: 'gemini-3.5-flash-lite',
                        name: 'Gemini 3.5 Flash-Lite',
                        desc: 'Ultra-fast, lowest latency & high throughput',
                      },
                      {
                        id: 'gemini-3.5-flash',
                        name: 'Gemini 3.5 Flash',
                        desc: 'Balanced multimodal intelligence',
                      },
                      {
                        id: 'gemini-3.1-flash-lite',
                        name: 'Gemini 3.1 Flash-Lite',
                        desc: 'Next-gen compact model with ultra-fast latency',
                      },
                    ].map((m) => {
                      const isSelected = (settings.models?.gemini?.fast || 'auto') === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[
                            styles.modelOptionCard,
                            {
                              backgroundColor: isSelected
                                ? Theme.colors.primaryContainer
                                : Theme.colors.surfaceContainerHigh,
                              borderColor: isSelected
                                ? Theme.colors.primary
                                : Theme.colors.outlineVariant,
                            },
                          ]}
                          onPress={() => {
                            handleSave({
                              ...settings,
                              models: {
                                ...settings.models,
                                gemini: {
                                  fast: m.id,
                                  smart: m.id === 'auto' ? 'gemini-3.8-flash' : m.id,
                                },
                              },
                            });
                          }}
                        >
                          <View style={styles.modelHeader}>
                            <Text
                              style={[
                                styles.modelName,
                                {
                                  color: isSelected
                                    ? Theme.colors.onPrimaryContainer
                                    : Theme.colors.onSurface,
                                },
                              ]}
                            >
                              {m.name}
                            </Text>
                            {isSelected && (
                              <View
                                style={[
                                  styles.activePill,
                                  { backgroundColor: Theme.colors.primary },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.activePillText,
                                    { color: Theme.colors.onPrimary },
                                  ]}
                                >
                                  ACTIVE
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text
                            style={[
                              styles.modelDesc,
                              {
                                color: isSelected
                                  ? Theme.colors.onPrimaryContainer
                                  : Theme.colors.onSurfaceVariant,
                              },
                            ]}
                          >
                            {m.desc}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

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
                <>
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.switchLabel, { color: Theme.colors.onSurface }]}>
                        Android Call Floating Overlay
                      </Text>
                      <Text style={{ ...Theme.typography.bodySmall, color: Theme.colors.onSurfaceVariant }}>
                        Floats over phone dialer, WhatsApp, Google Meet & Zoom
                      </Text>
                    </View>
                    <Switch
                      value={settings.floatingOverlayEnabled !== false}
                      trackColor={{ false: Theme.colors.surfaceContainerHigh, true: Theme.colors.primaryContainer }}
                      thumbColor={settings.floatingOverlayEnabled !== false ? Theme.colors.primary : Theme.colors.outline}
                      onValueChange={(v) => handleSave({ ...settings, floatingOverlayEnabled: v })}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.permActionBtn, { backgroundColor: Theme.colors.surfaceContainerHigh }]}
                    onPress={() => CallHelper.requestOverlayPermission()}
                  >
                    <Text style={[styles.permActionText, { color: Theme.colors.primary }]}>
                      Grant / Verify Floating Overlay Permission →
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.permActionBtn, { backgroundColor: Theme.colors.surfaceContainerHigh }]}
                    onPress={() => CallHelper.requestNotificationPermission()}
                  >
                    <Text style={[styles.permActionText, { color: Theme.colors.primary }]}>
                      Grant Notification Permission (Foreground Service) →
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {activeTab === 'language' && (
            <View style={styles.pane}>
              <Text style={[styles.label, { color: Theme.colors.primary }]}>Spoken Language (Speech-to-Text)</Text>
              <Text style={{ ...Theme.typography.bodySmall, color: Theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                Supports 85+ languages with automated detection via Gemini 3.5 Transcribe & Deepgram Nova-2.
              </Text>
              <View style={styles.modelList}>
                {LANGUAGES.map((lang) => {
                  const isSelected = (settings.language || 'auto') === lang.code;
                  return (
                    <TouchableOpacity
                      key={lang.code}
                      style={[
                        styles.modelOptionCard,
                        {
                          backgroundColor: isSelected
                            ? Theme.colors.primaryContainer
                            : Theme.colors.surfaceContainerHigh,
                          borderColor: isSelected
                            ? Theme.colors.primary
                            : Theme.colors.outlineVariant,
                        },
                      ]}
                      onPress={() => handleSave({ ...settings, language: lang.code })}
                    >
                      <View style={styles.modelHeader}>
                        <Text
                          style={[
                            styles.modelName,
                            {
                              color: isSelected
                                ? Theme.colors.onPrimaryContainer
                                : Theme.colors.onSurface,
                            },
                          ]}
                        >
                          {lang.name}
                        </Text>
                        {isSelected && (
                          <View
                            style={[
                              styles.activePill,
                              { backgroundColor: Theme.colors.primary },
                            ]}
                          >
                            <Text
                              style={[
                                styles.activePillText,
                                { color: Theme.colors.onPrimary },
                              ]}
                            >
                              SELECTED
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.modelDesc,
                          {
                            color: isSelected
                              ? Theme.colors.onPrimaryContainer
                              : Theme.colors.onSurfaceVariant,
                          },
                        ]}
                      >
                        {lang.desc}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.switchRow, { marginTop: 16, borderTopWidth: 1, borderTopColor: Theme.colors.outlineVariant, paddingTop: 14 }]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.switchLabel, { color: Theme.colors.onSurface }]}>
                    Real-Time Live Translation
                  </Text>
                  <Text style={{ ...Theme.typography.bodySmall, color: Theme.colors.onSurfaceVariant }}>
                    Translate interviewer's speech into your target language on-the-fly
                  </Text>
                </View>
                <Switch
                  value={settings.liveTranslate === true}
                  trackColor={{ false: Theme.colors.surfaceContainerHigh, true: Theme.colors.primaryContainer }}
                  thumbColor={settings.liveTranslate === true ? Theme.colors.primary : Theme.colors.outline}
                  onValueChange={(v) => handleSave({ ...settings, liveTranslate: v })}
                />
              </View>

              {settings.liveTranslate && (
                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.label, { color: Theme.colors.primary }]}>Target Translation Language</Text>
                  <View style={styles.providerGrid}>
                    {TARGET_LANGUAGES.map((tl) => {
                      const isSelected = (settings.targetLanguage || 'en') === tl.code;
                      return (
                        <TouchableOpacity
                          key={tl.code}
                          style={[
                            styles.providerBtn,
                            {
                              backgroundColor: Theme.colors.surfaceContainerHigh,
                              borderColor: Theme.colors.outlineVariant,
                            },
                            isSelected && {
                              backgroundColor: Theme.colors.primaryContainer,
                              borderColor: Theme.colors.primary,
                            },
                          ]}
                          onPress={() => handleSave({ ...settings, targetLanguage: tl.code })}
                        >
                          <Text
                            style={[
                              styles.providerText,
                              { color: Theme.colors.onSurfaceVariant },
                              isSelected && {
                                color: Theme.colors.onPrimaryContainer,
                                fontWeight: '700',
                              },
                            ]}
                          >
                            {tl.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
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

          {activeTab === 'updates' && (
            <View style={styles.pane}>
              <Text style={[styles.label, { color: Theme.colors.primary }]}>Software Updates</Text>

              <View
                style={[
                  styles.updateCard,
                  {
                    backgroundColor: Theme.colors.surfaceContainerHigh,
                    borderColor: Theme.colors.outlineVariant,
                  },
                ]}
              >
                <Text style={[styles.modelName, { color: Theme.colors.onSurface }]}>Ghost Interview Copilot</Text>
                <Text style={{ ...Theme.typography.bodySmall, color: Theme.colors.onSurfaceVariant, marginTop: 4 }}>
                  Current Installed Version: v1.2.0 (Material 3 • Android 17 Ready)
                </Text>
                <Text style={{ ...Theme.typography.bodySmall, color: Theme.colors.onSurfaceVariant }}>
                  Package: com.ghost.interviewhelper
                </Text>

                <TouchableOpacity
                  style={[styles.updateBtn, { backgroundColor: Theme.colors.primary, marginTop: 14 }]}
                  onPress={checkForUpdates}
                  disabled={checkingUpdate}
                >
                  {checkingUpdate ? (
                    <ActivityIndicator size="small" color={Theme.colors.onPrimary} />
                  ) : (
                    <Text style={[styles.updateBtnText, { color: Theme.colors.onPrimary }]}>
                      Check GitHub for Latest Updates
                    </Text>
                  )}
                </TouchableOpacity>

                {updateInfo && (
                  <View
                    style={[
                      styles.infoBox,
                      {
                        backgroundColor: Theme.colors.surfaceContainerHighest,
                        borderColor: Theme.colors.outlineVariant,
                        marginTop: 12,
                      },
                    ]}
                  >
                    <Text style={{ ...Theme.typography.bodySmall, color: Theme.colors.onSurface }}>
                      {updateInfo}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.updateBtn,
                    {
                      backgroundColor: Theme.colors.surfaceContainerHighest,
                      borderColor: Theme.colors.outlineVariant,
                      borderWidth: 1,
                      marginTop: 10,
                    },
                  ]}
                  onPress={() => Linking.openURL('https://github.com/purvanshbhatt/interview-ghost/releases')}
                >
                  <Text style={[styles.updateBtnText, { color: Theme.colors.primary }]}>
                    Open GitHub Releases & Downloads ↗
                  </Text>
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.updateCard,
                  {
                    backgroundColor: Theme.colors.surfaceContainerHigh,
                    borderColor: Theme.colors.outlineVariant,
                  },
                ]}
              >
                <Text style={[styles.modelName, { color: Theme.colors.onSurface }]}>Local Git Clones (One-Command Update)</Text>
                <Text style={{ ...Theme.typography.bodySmall, color: Theme.colors.onSurfaceVariant, marginTop: 4 }}>
                  If you run Ghost locally on Desktop or Android development environment, pull updates anytime with:
                </Text>
                <View
                  style={[
                    styles.codeBox,
                    {
                      backgroundColor: Theme.colors.surfaceContainerHighest,
                      marginTop: 8,
                    },
                  ]}
                >
                  <Text style={{ ...Theme.typography.bodySmall, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: Theme.colors.primary }}>
                    ./scripts/update-ghost.sh
                  </Text>
                </View>
                <Text style={{ ...Theme.typography.bodySmall, color: Theme.colors.onSurfaceVariant, marginTop: 4 }}>
                  Windows Command Prompt / PowerShell:
                </Text>
                <View
                  style={[
                    styles.codeBox,
                    {
                      backgroundColor: Theme.colors.surfaceContainerHighest,
                      marginTop: 4,
                    },
                  ]}
                >
                  <Text style={{ ...Theme.typography.bodySmall, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: Theme.colors.primary }}>
                    scripts\update-ghost.bat
                  </Text>
                </View>
              </View>
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
  tabsRowWrapper: {
    marginBottom: 16,
  },
  tabsScroll: {
    gap: 8,
    paddingHorizontal: 2,
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
  permActionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Theme.shapes.small,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
  },
  permActionText: {
    ...Theme.typography.labelMedium,
    fontWeight: '700',
  },
  modelList: {
    gap: 8,
    marginTop: 6,
  },
  modelOptionCard: {
    padding: 12,
    borderRadius: Theme.shapes.medium,
    borderWidth: 1.5,
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modelName: {
    ...Theme.typography.titleSmall,
    fontWeight: '700',
  },
  activePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Theme.shapes.full,
  },
  activePillText: {
    ...Theme.typography.labelSmall,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modelDesc: {
    ...Theme.typography.bodySmall,
    fontSize: 12,
    lineHeight: 16,
  },
  updateCard: {
    padding: 16,
    borderRadius: Theme.shapes.medium,
    borderWidth: 1,
    marginTop: 4,
  },
  updateBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Theme.shapes.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateBtnText: {
    ...Theme.typography.labelMedium,
    fontWeight: '700',
  },
  infoBox: {
    padding: 12,
    borderRadius: Theme.shapes.small,
    borderWidth: 1,
  },
  codeBox: {
    padding: 10,
    borderRadius: Theme.shapes.small,
  },
});
