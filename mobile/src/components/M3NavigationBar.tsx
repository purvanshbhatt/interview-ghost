import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Theme } from '../theme/adaptive';
import { AppIcon } from './AppIcon';
import type { IconName } from './AppIcon';

export interface NavItem {
  id: string;
  label: string;
  icon: IconName;
}

interface M3NavigationBarProps {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export const M3NavigationBar: React.FC<M3NavigationBarProps> = ({
  items,
  activeId,
  onSelect,
}) => {
  return (
    <View style={styles.container}>
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.8}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onSelect(item.id);
            }}
            style={styles.item}
          >
            <View style={[styles.indicator, isActive && styles.activeIndicator]}>
              <AppIcon
                name={item.icon}
                size={22}
                color={isActive ? Theme.colors.onSecondaryContainer : Theme.colors.onSurfaceVariant}
              />
            </View>
            <Text style={[styles.label, isActive && styles.activeLabel]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 80,
    backgroundColor: Theme.colors.surfaceContainer,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: Theme.colors.surfaceContainerHigh,
    paddingBottom: 8,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  indicator: {
    width: 64,
    height: 32,
    borderRadius: Theme.shapes.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  activeIndicator: {
    backgroundColor: Theme.colors.secondaryContainer,
  },
  label: {
    ...Theme.typography.labelSmall,
    color: Theme.colors.onSurfaceVariant,
  },
  activeLabel: {
    color: Theme.colors.onSurface,
    fontWeight: '700',
  },
});
