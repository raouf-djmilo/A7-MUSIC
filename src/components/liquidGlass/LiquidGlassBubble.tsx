import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { APPLE_LIQUID_COLORS } from '../../theme/AppleLiquidTokens';

interface LiquidGlassBubbleProps {
  indicatorX: SharedValue<number>;
  scaleX: SharedValue<number>;
  scaleY: SharedValue<number>;
  width: number;
  height: number;
  borderRadius?: number;
  isDark?: boolean;
}

/**
 * 🔮 Apple Liquid Glass 3D Optical Lens Bubble
 * Recreates the exact physical realism shown in Apple design specs:
 * 1. 3D sculpted specular bezel catching angled light
 * 2. Top caustic crescent highlight for authentic curved glass sheen
 * 3. Transparent crystal refraction substrate (Zero flat opaque grey)
 * 4. Concentric optical double-edge refraction ring
 * 5. Elevated floating lens drop shadow
 */
export const LiquidGlassBubble: React.FC<LiquidGlassBubbleProps> = ({
  indicatorX,
  scaleX,
  scaleY,
  width,
  height,
  borderRadius = height / 2,
  isDark = false,
}) => {
  const colors = isDark ? APPLE_LIQUID_COLORS.dark : APPLE_LIQUID_COLORS.light;

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
        {/* ── 1. Frosted Liquid Glass Substrate (Backdrop Blur) ── */}
        <BlurView
          intensity={Platform.OS === 'ios' ? (isDark ? 45 : 55) : 30}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />

        {/* ── 2. Crystal Clear Glass Core (Non-opaque, pristine refraction) ── */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: colors.bubbleBg,
            },
          ]}
        />

        {/* ── 3. Top Specular Caustic Crescent (Realistic Curved Glass Reflection) ── */}
        <LinearGradient
          colors={[colors.bubbleInnerHighlight, 'rgba(255, 255, 255, 0.0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            styles.specularCausticArc,
            {
              borderTopLeftRadius: borderRadius,
              borderTopRightRadius: borderRadius,
            },
          ]}
        />

        {/* ── 4. Inset Secondary Refraction Ring (Double-Edge Caustic Thickness) ── */}
        <View
          style={[
            styles.innerCausticRing,
            {
              borderRadius: Math.max(0, borderRadius - 2),
              borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.45)',
            },
          ]}
        />

        {/* ── 5. 3D Refractive Bezel Ring (Angled Specular Light Reflection) ── */}
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.specularBezel,
            {
              borderRadius,
              borderTopColor: colors.bubbleTopRim,
              borderLeftColor: colors.bubbleSideRim,
              borderRightColor: colors.bubbleSideRim,
              borderBottomColor: colors.bubbleBottomRim,
            },
          ]}
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
  specularCausticArc: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '46%',
  },
  innerCausticRing: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
    right: 2,
    borderWidth: 0.75,
  },
  specularBezel: {
    borderWidth: 1.5,
    borderTopWidth: 1.75,
  },
  lightShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.10,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  darkShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.60,
        shadowRadius: 12,
      },
      android: {
        elevation: 5,
      },
    }),
  },
});

export default LiquidGlassBubble;
