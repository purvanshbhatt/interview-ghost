import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Theme, isIOS } from '../theme/adaptive';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, style, intensity }) => {
  if (isIOS) {
    return (
      <View
        style={[
          styles.glassWrap,
          {
            borderRadius: Theme.shapes.large,
            borderColor: 'rgba(255, 255, 255, 0.18)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.35,
            shadowRadius: 20,
          },
          style,
        ]}
      >
        <BlurView
          intensity={intensity ?? (Theme.isPad ? 55 : 45)}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={styles.blurFill}
        />
        <View pointerEvents="none" style={styles.specularEdge} />
        <View style={styles.content}>{children}</View>
      </View>
    );
  }

  // Android — solid M3 surface container (Material has no glass idiom)
  return (
    <View
      style={[
        styles.androidCard,
        {
          backgroundColor: Platform.select({
            android: Theme.colors.surfaceContainer,
            default: Theme.colors.surfaceContainer,
          }),
          borderRadius: Theme.shapes.large,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  glassWrap: {
    overflow: 'hidden',
    borderWidth: 1,
    elevation: 8,
  },
  blurFill: {
    ...StyleSheet.absoluteFillObject,
  },
  // Thin bright edge at the top to mimic the specular highlight of Liquid Glass
  specularEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  content: {
    padding: 16,
  },
  androidCard: {
    padding: 16,
    elevation: 2,
  },
});
