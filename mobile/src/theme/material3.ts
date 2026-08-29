import { Platform } from 'react-native';

export const M3Colors = {
  primary: '#A8C7FA',
  onPrimary: '#083063',
  primaryContainer: '#1D4984',
  onPrimaryContainer: '#D8E2FF',

  secondary: '#7CEAD3',
  onSecondary: '#003730',
  secondaryContainer: '#005047',
  onSecondaryContainer: '#98F7EE',

  tertiary: '#FFB786',
  onTertiary: '#4F2500',
  tertiaryContainer: '#703700',
  onTertiaryContainer: '#FFDCC4',

  error: '#FFB4AB',
  onError: '#690005',
  errorContainer: '#93000A',
  onErrorContainer: '#FFDAD6',

  background: '#111318',
  onBackground: '#E2E2E9',

  surface: '#111318',
  onSurface: '#E2E2E9',
  surfaceVariant: '#44474F',
  onSurfaceVariant: '#C4C6D0',

  surfaceContainerLowest: '#0C0E13',
  surfaceContainerLow: '#17191E',
  surfaceContainer: '#1D1F24',
  surfaceContainerHigh: '#23252B',
  surfaceContainerHighest: '#282A30',

  outline: '#8E9099',
  outlineVariant: '#44474F',
  inverseSurface: '#E2E2E9',
  inverseOnSurface: '#2F3036',
  inversePrimary: '#3A608F',
  shadow: '#000000',
  scrim: '#000000',

  // Status indicators
  live: '#4ADE80',
  liveContainer: '#052E16',
  onLiveContainer: '#86EFAC',
};

export const M3Shapes = {
  none: 0,
  extraSmall: 4,
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 28,
  full: 9999,
};

export const M3Typography = {
  displayLarge: { fontSize: 57, lineHeight: 64, fontWeight: '400' as const, letterSpacing: -0.25 },
  displayMedium: { fontSize: 45, lineHeight: 52, fontWeight: '400' as const },
  displaySmall: { fontSize: 36, lineHeight: 44, fontWeight: '400' as const },

  headlineLarge: { fontSize: 32, lineHeight: 40, fontWeight: '700' as const },
  headlineMedium: { fontSize: 28, lineHeight: 36, fontWeight: '700' as const },
  headlineSmall: { fontSize: 24, lineHeight: 32, fontWeight: '700' as const },

  titleLarge: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const },
  titleMedium: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const, letterSpacing: 0.15 },
  titleSmall: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const, letterSpacing: 0.1 },

  bodyLarge: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const, letterSpacing: 0.5 },
  bodyMedium: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const, letterSpacing: 0.25 },
  bodySmall: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const, letterSpacing: 0.4 },

  labelLarge: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const, letterSpacing: 0.1 },
  labelMedium: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 0.5 },
  labelSmall: { fontSize: 11, lineHeight: 16, fontWeight: '700' as const, letterSpacing: 0.5 },
};

export const isAndroid = Platform.OS === 'android';
