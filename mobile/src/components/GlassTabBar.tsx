import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Theme, isPad } from '../theme/adaptive';
import { AppIcon, IconName } from './AppIcon';

export interface GlassTab {
  id: string;
  label: string;
  icon: IconName;
}

interface GlassTabBarProps {
  tabs: GlassTab[];
  activeId: string;
  onSelect: (id: string) => void;
}

export const GlassTabBar: React.FC<GlassTabBarProps> = ({ tabs, activeId, onSelect }) => {
  return (
    <View style={styles.outer} pointerEvents="box-none">
      <View style={styles.pill}>
        <BlurView
          intensity={Theme.isPad ? 65 : 50}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.specular} />
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, isPad && styles.padTab]}
              activeOpacity={0.7}
              onPress={() => onSelect(tab.id)}
            >
              <AppIcon
                name={tab.icon}
                size={isPad ? 26 : 22}
                color={isActive ? Theme.colors.primary : Theme.colors.onSurfaceVariant}
              />
              {isActive && (
                <Text style={[styles.label, { color: Theme.colors.onBackground }]}>
                  {tab.label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Theme.shapes.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 10,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 64,
    height: 44,
    borderRadius: Theme.shapes.full,
    paddingHorizontal: 14,
  },
  padTab: {
    minWidth: 84,
    height: 48,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  specular: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
});
