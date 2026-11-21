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
}

export const LiquidGlassBubble: React.FC<LiquidGlassBubbleProps> = ({
  indicatorX,
  scaleX,
  scaleY,
  width,
  height,
  borderRadius = height / 2,
  isDark = true,
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
      {/* ── 1. Frosted Liquid Glass Diffusion Layer ── */}
      <View style={[styles.innerSurface, { borderRadius }]}>
        <BlurView
          intensity={Platform.OS === 'ios' ? (isDark ? 45 : 50) : 30}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />

        {/* ── 2. Pure Transparent Liquid Body (No Solid or Orange Color) ── */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isDark
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(255, 255, 255, 0.45)',
            },
          ]}
        />

        {/* ── 3. Specular Curved Glass Glare (Upper Reflection Arc) ── */}
        <LinearGradient
          colors={
            isDark
              ? ['rgba(255, 255, 255, 0.38)', 'rgba(255, 255, 255, 0.06)', 'transparent']
              : ['rgba(255, 255, 255, 0.80)', 'rgba(255, 255, 255, 0.18)', 'transparent']
          }
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.60 }}
          style={[styles.glareArc, { borderRadius }]}
        />

        {/* ── 4. Optical Rim Highlight (Double-Lensed Bevel) ── */}
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.beveledRim,
            {
              borderRadius,
              borderColor: isDark
                ? 'rgba(255, 255, 255, 0.22)'
                : 'rgba(255, 255, 255, 0.75)',
            },
          ]}
        />

        {/* ── 5. Lower Convex Refraction Shadow ── */}
        <LinearGradient
          colors={
            isDark
              ? ['transparent', 'rgba(0, 0, 0, 0.25)']
              : ['transparent', 'rgba(0, 0, 0, 0.04)']
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
    borderTopWidth: 1.6,
  },
  lightShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.07,
        shadowRadius: 5,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  darkShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
});
