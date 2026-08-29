import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { Theme } from '../theme/adaptive';
import { AppIcon, IconName } from './AppIcon';

export interface SidebarItem {
  id: string;
  label: string;
  icon: IconName;
}

interface IPadSidebarProps {
  items: SidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  header?: { title: string; subtitle?: string };
}

export const IPadSidebar: React.FC<IPadSidebarProps> = ({ items, activeId, onSelect, header }) => {
  return (
    <View style={styles.wrap}>
      <BlurView
        intensity={55}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner} pointerEvents="box-none">
        {!!header && (
          <View style={styles.header}>
            <Text style={[styles.title, { color: Theme.colors.onBackground }]} numberOfLines={1}>
              {header.title}
            </Text>
            {!!header.subtitle && (
              <Text style={[styles.subtitle, { color: Theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                {header.subtitle}
              </Text>
            )}
          </View>
        )}
        <ScrollView contentContainerStyle={styles.list}>
          {items.map((item) => {
            const isActive = item.id === activeId;
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.row,
                  isActive && [
                    styles.activeRow,
                    { backgroundColor: Theme.colors.primaryContainer },
                  ],
                ]}
                activeOpacity={0.6}
                onPress={() => onSelect(item.id)}
              >
                <AppIcon
                  name={item.icon}
                  size={22}
                  color={
                    isActive ? Theme.colors.onPrimaryContainer : Theme.colors.onSurfaceVariant
                  }
                />
                <Text
                  style={[
                    styles.label,
                    {
                      color: isActive ? Theme.colors.onPrimaryContainer : Theme.colors.onBackground,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
};

const SIDEBAR_WIDTH = 260;

const styles = StyleSheet.create({
  wrap: {
    width: SIDEBAR_WIDTH,
    maxWidth: '30%',
    overflow: 'hidden',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(18, 18, 22, 0.6)',
  },
  inner: {
    flex: 1,
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 12,
  },
  header: {
    paddingHorizontal: 8,
    paddingBottom: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  subtitle: {
    ...Theme.typography.bodySmall,
    marginTop: 2,
  },
  list: {
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 42,
    borderRadius: Theme.shapes.small,
    paddingHorizontal: 10,
  },
  activeRow: {},
  label: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
});
