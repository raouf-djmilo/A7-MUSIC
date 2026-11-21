import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';
import { LiquidGlassBubble } from './LiquidGlassBubble';

export interface LiquidGlassSegmentedControlProps {
  options: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  height?: number;
  style?: StyleProp<ViewStyle>;
  activeColor?: string;
  inactiveColor?: string;
}

const PADDING = 4;

export const LiquidGlassSegmentedControl: React.FC<LiquidGlassSegmentedControlProps> = ({
  options,
  selectedIndex,
  onChange,
  height = 44,
  style,
  activeColor,
  inactiveColor,
}) => {
  const { theme, isDark } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);

  const numSegments = options.length || 1;
  const innerWidth = Math.max(containerWidth - PADDING * 2, 0);
  const segmentWidth = innerWidth / numSegments;
  const bubbleHeight = height - PADDING * 2;

  const indicatorX = useSharedValue(selectedIndex * segmentWidth);
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const prevIndexRef = useRef(selectedIndex);

  const resolvedActiveColor = activeColor || (isDark ? '#FFFFFF' : '#000000');
  const resolvedInactiveColor =
    inactiveColor || (isDark ? 'rgba(255, 255, 255, 0.50)' : 'rgba(0, 0, 0, 0.45)');

  const animateTo = useCallback(
    (index: number) => {
      const distance = Math.abs(index - prevIndexRef.current);
      prevIndexRef.current = index;

      // 🌊 Liquid Stretch & Squash Physics
      const stretchRatio = Math.min(1 + distance * 0.14, 1.28);
      const squashRatio = Math.max(1 - distance * 0.08, 0.88);

      scaleX.value = withSequence(
        withTiming(stretchRatio, { duration: 110 }),
        withSpring(1, { damping: 15, stiffness: 280, mass: 0.5 })
      );

      scaleY.value = withSequence(
        withTiming(squashRatio, { duration: 110 }),
        withSpring(1, { damping: 15, stiffness: 280, mass: 0.5 })
      );

      indicatorX.value = withSpring(index * segmentWidth, {
        damping: 22,
        stiffness: 280,
        mass: 0.55,
        overshootClamping: false,
      });
    },
    [segmentWidth, indicatorX, scaleX, scaleY]
  );

  useEffect(() => {
    if (containerWidth > 0) {
      animateTo(selectedIndex);
    }
  }, [selectedIndex, containerWidth, animateTo]);

  const handlePress = (index: number) => {
    if (index === selectedIndex) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(index);
  };

  return (
    <View
      style={[
        styles.trackContainer,
        {
          height,
          borderRadius: height / 2,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.06)',
          backgroundColor: isDark
            ? 'rgba(255, 255, 255, 0.06)'
            : 'rgba(0, 0, 0, 0.04)',
        },
        style,
      ]}
      onLayout={(e) => {
        setContainerWidth(e.nativeEvent.layout.width);
      }}
    >
      {/* ── Base Track Frosted Blur ── */}
      <BlurView
        intensity={Platform.OS === 'ios' ? (isDark ? 35 : 50) : 25}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Floating Liquid Glass Selection Bubble ── */}
      {containerWidth > 0 && (
        <View style={{ position: 'absolute', top: PADDING, left: PADDING }}>
          <LiquidGlassBubble
            indicatorX={indicatorX}
            scaleX={scaleX}
            scaleY={scaleY}
            width={segmentWidth}
            height={bubbleHeight}
            borderRadius={bubbleHeight / 2}
            isDark={isDark}
          />
        </View>
      )}

      {/* ── Option Labels Row ── */}
      <View style={[styles.optionsRow, { paddingHorizontal: PADDING }]}>
        {options.map((option, index) => {
          const isSelected = selectedIndex === index;
          return (
            <TouchableOpacity
              key={`${option}-${index}`}
              activeOpacity={0.75}
              onPress={() => handlePress(index)}
              style={styles.segmentButton}
            >
              <Text
                style={[
                  styles.segmentText,
                  {
                    color: isSelected ? resolvedActiveColor : resolvedInactiveColor,
                    fontWeight: isSelected ? '700' : '500',
                  },
                ]}
                numberOfLines={1}
              >
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  trackContainer: {
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    justifyContent: 'center',
  },
  optionsRow: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },
  segmentButton: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 13,
    letterSpacing: -0.2,
  },
});

export default LiquidGlassSegmentedControl;
