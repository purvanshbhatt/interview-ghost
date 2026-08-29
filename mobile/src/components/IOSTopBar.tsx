import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Theme } from '../theme/adaptive';

interface IOSTopBarProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export const IOSTopBar: React.FC<IOSTopBarProps> = ({ title, subtitle, right }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.wrap}>
      <BlurView
        intensity={50}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.row,
          {
            paddingTop: insets.top + 6,
            borderBottomColor: 'rgba(255, 255, 255, 0.12)',
          },
        ]}
      >
        <View style={styles.titles}>
          <Text style={[styles.title, { color: Theme.colors.onBackground }]}>{title}</Text>
          {!!subtitle && (
            <Text style={[styles.subtitle, { color: Theme.colors.onSurfaceVariant }]}>
              {subtitle}
            </Text>
          )}
        </View>
        {right && <View style={styles.right}>{right}</View>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: 'rgba(20, 20, 24, 0.55)',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  titles: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  subtitle: {
    ...Theme.typography.bodySmall,
    marginTop: 2,
  },
  right: {
    marginLeft: 12,
  },
});
