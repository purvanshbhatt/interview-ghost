import { Platform, Dimensions } from 'react-native';
import { M3Colors, M3Shapes, M3Typography } from './material3';

export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';

const { width, height } = Dimensions.get('window');
export const isPad = Platform.OS === 'ios' && (width >= 768 || height >= 768);

// iOS 18 / iPadOS 18 Cupertino Glass System
export const IOSColors = {
  primary: '#0A84FF',
  onPrimary: '#FFFFFF',
  primaryContainer: 'rgba(10, 132, 255, 0.22)',
  onPrimaryContainer: '#70B6FF',

  secondary: '#5E5CE6',
  onSecondary: '#FFFFFF',
  secondaryContainer: 'rgba(94, 92, 230, 0.22)',
  onSecondaryContainer: '#9D9BF6',

  tertiary: '#FF9F0A',
  onTertiary: '#000000',
  tertiaryContainer: 'rgba(255, 159, 10, 0.22)',
  onTertiaryContainer: '#FFC875',

  background: isPad ? '#08090C' : '#000000',
  onBackground: '#FFFFFF',

  surface: isPad ? 'rgba(28, 28, 32, 0.85)' : 'rgba(22, 22, 26, 0.82)',
  onSurface: '#FFFFFF',
  surfaceVariant: 'rgba(44, 44, 48, 0.75)',
  onSurfaceVariant: 'rgba(235, 235, 245, 0.6)',

  surfaceContainerLowest: '#000000',
  surfaceContainerLow: 'rgba(28, 28, 30, 0.65)',
  surfaceContainer: 'rgba(36, 36, 40, 0.78)',
  surfaceContainerHigh: 'rgba(44, 44, 48, 0.88)',
  surfaceContainerHighest: 'rgba(58, 58, 62, 0.95)',

  outline: 'rgba(235, 235, 245, 0.28)',
  outlineVariant: 'rgba(235, 235, 245, 0.14)',

  live: '#34C759',
  liveContainer: 'rgba(52, 199, 89, 0.2)',
  onLiveContainer: '#34C759',

  error: '#FF453A',
  errorContainer: 'rgba(255, 69, 58, 0.2)',
  onErrorContainer: '#FF6961',

  shadow: '#000000',
  dynamicIslandBg: '#000000',
};

// Adaptive active theme
export const Theme = {
  colors: isIOS ? IOSColors : M3Colors,
  shapes: isIOS
    ? {
        none: 0,
        extraSmall: 6,
        small: 10,
        medium: 14,
        large: isPad ? 22 : 18,
        extraLarge: isPad ? 32 : 24,
        full: 9999,
      }
    : M3Shapes,
  typography: M3Typography,
  isIOS,
  isAndroid,
  isPad,
};
