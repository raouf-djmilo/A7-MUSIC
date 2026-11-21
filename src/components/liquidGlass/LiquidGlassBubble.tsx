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
  isDark = false,
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
      <View style={[styles.innerSurface, { borderRadius }]}>
        {/* ── Layer 1: Directional Frosted Blur (Underlying bar texture refracts through) ── */}
        <BlurView
          intensity={Platform.OS === 'ios' ? (isDark ? 35 : 45) : 25}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />

        {/* ── Layer 2: Highly Translucent Glass Substrate (18% - 22% Opacity - NOT Opaque White!) ── */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isDark
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(255, 255, 255, 0.20)',
            },
          ]}
        />

        {/* ── Layer 3: Specular Curved Glass Glare (Upper Refraction Arc) ── */}
        <LinearGradient
          colors={
            isDark
              ? ['rgba(255, 255, 255, 0.35)', 'rgba(255, 255, 255, 0.05)', 'transparent']
              : ['rgba(255, 255, 255, 0.70)', 'rgba(255, 255, 255, 0.12)', 'transparent']
          }
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.55 }}
          style={[styles.glareArc, { borderRadius }]}
        />

        {/* ── Layer 4: Double Specular Rim (Ultra-thin 0.8px Beveled Highlight) ── */}
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.beveledRim,
            {
              borderRadius,
              borderColor: isDark
                ? 'rgba(255, 255, 255, 0.18)'
                : 'rgba(255, 255, 255, 0.65)',
            },
          ]}
        />

        {/* ── Layer 5: Subtle Lower Convex Refraction Shadow ── */}
        <LinearGradient
          colors={
            isDark
              ? ['transparent', 'rgba(0, 0, 0, 0.22)']
              : ['transparent', 'rgba(0, 0, 0, 0.04)']
          }
          start={{ x: 0.5, y: 0.65 }}
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
    height: '55%',
  },
  beveledRim: {
    borderWidth: 0.8,
    borderTopWidth: 1.2,
  },
  lightShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
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
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.30,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
    }),
  },
});

export default LiquidGlassBubble;
