import React from 'react';
import { Platform } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

export type IconName =
  | 'bolt'
  | 'history'
  | 'settings'
  | 'mic'
  | 'mic-off'
  | 'stop'
  | 'send'
  | 'sparkles'
  | 'phone'
  | 'chatbubble'
  | 'document'
  | 'coffee'
  | 'help-circle'
  | 'notes'
  | 'close'
  | 'chevron-forward';

const IOS_MAP = {
  bolt: 'flash',
  history: 'time',
  settings: 'settings',
  mic: 'mic',
  'mic-off': 'mic-off',
  stop: 'stop-circle',
  send: 'paper-plane',
  sparkles: 'sparkles',
  phone: 'call',
  chatbubble: 'chatbubbles',
  document: 'document-text',
  coffee: 'cafe',
  'help-circle': 'help-circle',
  notes: 'create',
  close: 'close',
  'chevron-forward': 'chevron-forward',
} as const;

const ANDROID_MAP = {
  bolt: 'bolt',
  history: 'history',
  settings: 'settings',
  mic: 'mic',
  'mic-off': 'mic-off',
  stop: 'stop_circle',
  send: 'send',
  sparkles: 'auto_awesome',
  phone: 'call',
  chatbubble: 'forum',
  document: 'description',
  coffee: 'local_cafe',
  'help-circle': 'help',
  notes: 'edit_note',
  close: 'close',
  'chevron-forward': 'chevron_right',
} as const;

interface AppIconProps {
  name: IconName;
  size?: number;
  color?: string;
}

export const AppIcon: React.FC<AppIconProps> = ({ name, size = 22, color }) => {
  if (Platform.OS === 'ios') {
    return <Ionicons name={(IOS_MAP[name] ?? 'ellipse') as any} size={size} color={color} />;
  }
  return (
    <MaterialIcons name={(ANDROID_MAP[name] ?? 'circle') as any} size={size} color={color} />
  );
};
