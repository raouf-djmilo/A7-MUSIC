import React, { useEffect } from 'react';
import {
  StyleSheet,
  Pressable,
  Platform,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';

export interface LiquidGlassSwitchProps {
  value: boolean;
  onValueChange: (val: boolean) => void;
  activeTrackColor?: string;
  inactiveTrackColor?: string;
  disabled?: boolean;
}

const WIDTH = 52;
const HEIGHT = 32;
const KNOB_SIZE = 26;
const PADDING = 3;
const TRAVEL = WIDTH - KNOB_SIZE - PADDING * 2;

export const LiquidGlassSwitch: React.FC<LiquidGlassSwitchProps> = ({
  value,
  onValueChange,
  activeTrackColor = '#34C759',
  inactiveTrackColor,
  disabled = false,
}) => {
  const { isDark } = useTheme();

  const progress = useSharedValue(value ? 1 : 0);
  const knobScaleX = useSharedValue(1);

  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, {
      damping: 18,
      stiffness: 280,
      mass: 0.5,
    });
  }, [value, progress]);

  const handleToggle = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    // Stretch knob during flip
    knobScaleX.value = withSequence(
      withTiming(1.22, { duration: 90 }),
      withSpring(1, { damping: 14, stiffness: 300 })
    );

    onValueChange(!value);
  };

  const animatedKnobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * TRAVEL },
      { scaleX: knobScaleX.value },
    ],
  }));

  const fallbackInactive = isDark
    ? 'rgba(255, 255, 255, 0.16)'
    : 'rgba(0, 0, 0, 0.10)';

  return (
    <Pressable
      onPress={handleToggle}
      disabled={disabled}
      style={[
        styles.track,
        {
          borderColor: isDark
            ? 'rgba(255, 255, 255, 0.15)'
            : 'rgba(0, 0, 0, 0.08)',
          backgroundColor: value ? activeTrackColor : (inactiveTrackColor || fallbackInactive),
        },
      ]}
    >
      <BlurView
        intensity={Platform.OS === 'ios' ? 30 : 20}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.knob, animatedKnobStyle]}>
        {/* Knob Glass Base */}
        <View style={styles.knobInner}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.98)', 'rgba(240, 240, 245, 0.92)']}
            style={StyleSheet.absoluteFill}
          />
          {/* Specular Highlight */}
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.90)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.6 }}
            style={styles.knobGlare}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  track: {
    width: WIDTH,
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    paddingHorizontal: PADDING,
  },
  knob: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 5,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  knobInner: {
    flex: 1,
    borderRadius: KNOB_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.90)',
  },
  knobGlare: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
});

export default LiquidGlassSwitch;
