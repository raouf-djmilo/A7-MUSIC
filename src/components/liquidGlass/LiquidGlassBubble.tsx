import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

interface LiquidGlassBubbleProps {
  indicatorX: SharedValue<number>;
  scaleX: SharedValue<number>;
  scaleY: SharedValue<number>;
  width: number;
  height: number;
  borderRadius?: number;
  isDark?: boolean;
  glowTint?: string;
}

export const LiquidGlassBubble: React.FC<LiquidGlassBubbleProps> = ({
  indicatorX,
  scaleX,
  scaleY,
  width,
  height,
  borderRadius = height / 2,
  isDark = true,
  glowTint = 'rgba(252, 82, 0, 0.15)',
}) => {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: indicatorX.value },
      { scaleX: scaleX.value },
      { scaleY: scaleY.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.outerPill,
        {
          width,
          height,
          borderRadius,
        },
        isDark ? styles.darkShadow : styles.lightShadow,
        animatedStyle,
      ]}
      pointerEvents="none"
    >
      {/* ── 1. Frosted Glass Diffusion Layer ── */}
      <View style={[styles.innerSurface, { borderRadius }]}>
        <BlurView
          intensity={Platform.OS === 'ios' ? (isDark ? 55 : 85) : 40}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />

        {/* ── 2. Molten Translucent Body ── */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isDark
                ? 'rgba(255, 255, 255, 0.14)'
                : 'rgba(255, 255, 255, 0.88)',
            },
          ]}
        />

        {/* ── 2.5 Luminous Inner Core Ambient Glow ── */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: glowTint,
              borderRadius,
            },
          ]}
        />

        {/* ── 3. Specular Curved Glass Glare (Upper Reflection Arc) ── */}
        <LinearGradient
          colors={
            isDark
              ? ['rgba(255, 255, 255, 0.45)', 'rgba(255, 255, 255, 0.08)', 'transparent']
              : ['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.40)', 'transparent']
          }
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.65 }}
          style={[styles.glareArc, { borderRadius }]}
        />

        {/* ── 4. Prismatic Chromatic Dispersion Fringe (Bottom Refraction Edge) ── */}
        <LinearGradient
          colors={[
            'rgba(255, 80, 80, 0.18)',
            'rgba(255, 200, 50, 0.22)',
            'rgba(80, 200, 255, 0.20)',
            'rgba(180, 100, 255, 0.16)',
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.prismaticRim}
        />

        {/* ── 5. Optical Rim Highlight (Double-Lensed Bevel) ── */}
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.beveledRim,
            {
              borderRadius,
              borderColor: isDark
                ? 'rgba(255, 255, 255, 0.32)'
                : 'rgba(255, 255, 255, 0.95)',
            },
          ]}
        />

        {/* ── 6. Lower Convex Refraction Shadow ── */}
        <LinearGradient
          colors={
            isDark
              ? ['transparent', 'rgba(0, 0, 0, 0.30)']
              : ['transparent', 'rgba(0, 0, 0, 0.05)']
          }
          start={{ x: 0.5, y: 0.6 }}
          end={{ x: 0.5, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  outerPill: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  innerSurface: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  glareArc: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  beveledRim: {
    borderWidth: 1.2,
    borderTopWidth: 1.8,
  },
  prismaticRim: {
    position: 'absolute',
    bottom: 0,
    left: 4,
    right: 4,
    height: 3,
    borderRadius: 1.5,
  },
  lightShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.14,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  darkShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.40,
        shadowRadius: 14,
      },
      android: {
        elevation: 8,
      },
    }),
  },
});

export default LiquidGlassBubble;
