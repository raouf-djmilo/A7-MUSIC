import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
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
 * 🔮 Apple Liquid Glass 3D Optical Lens Pill
 * Combines:
 * 1. Rest State: Pristine frosted glass with Retina hairline border (StyleSheet.hairlineWidth)
 * 2. Active / Drag State (Optical Lift):
 *    - Subtle translateY elevation (-2.5pt) toward the finger
 *    - Ambient diffuse shadow expansion (radius: 8 -> 16)
 *    - Fluid volume-preserving stretch (scaleX * scaleY = 1.0)
 *    - Zero skeuomorphic plastic gradient shine!
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

  const animatedStyle = useAnimatedStyle(() => {
    // Optical Lift: detect when user is interacting / stretching the bubble
    const isInteracting = Math.abs(scaleX.value - 1) > 0.015;

    return {
      transform: [
        { translateX: indicatorX.value },
        { translateY: isInteracting ? -2.5 : 0 },
        { scaleX: scaleX.value },
        { scaleY: scaleY.value },
      ],
      shadowOpacity: isDark
        ? 0.45 + (isInteracting ? 0.25 : 0)
        : 0.12 + (isInteracting ? 0.14 : 0),
      shadowRadius: isInteracting ? 16 : 8,
    };
  });

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
      <View
        style={[
          styles.innerSurface,
          {
            borderRadius,
            borderColor: colors.bubbleBorder,
            borderWidth: StyleSheet.hairlineWidth,
            backgroundColor: isDark ? 'transparent' : colors.bubbleBg,
          },
        ]}
      >
        {/* ── 1. Frosted Liquid Glass Substrate on Metal GPU ── */}
        <BlurView
          intensity={Platform.OS === 'ios' ? (isDark ? 50 : 65) : 30}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />

        {/* ── 2. Pure Optical Glass Core ── */}
        {isDark && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: colors.bubbleBg,
              },
            ]}
          />
        )}
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
  lightShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
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
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
});

export default LiquidGlassBubble;
