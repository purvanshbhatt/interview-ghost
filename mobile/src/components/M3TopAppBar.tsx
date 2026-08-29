import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Theme, isIOS } from '../theme/adaptive';
import { IOSTopBar } from './IOSTopBar';

interface M3TopAppBarProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const M3TopAppBar: React.FC<M3TopAppBarProps> = ({ title, subtitle, action }) => {
  if (isIOS) {
    return <IOSTopBar title={title} subtitle={subtitle} right={action} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.titleWrap}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    ...Theme.typography.headlineMedium,
    color: Theme.colors.onSurface,
  },
  subtitle: {
    ...Theme.typography.bodySmall,
    color: Theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
});
