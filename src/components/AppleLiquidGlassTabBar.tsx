import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { LiquidGlassBubble } from './liquidGlass/LiquidGlassBubble';
import {
  APPLE_BAR_METRICS,
  APPLE_LIQUID_COLORS,
} from '../theme/AppleLiquidTokens';

const { width } = Dimensions.get('window');

const TAB_METAS: { [key: string]: { label: string; outlineIcon: string; filledIcon: string } } = {
  DashboardTab: {
    label: 'الرئيسية',
    outlineIcon: 'home-outline',
    filledIcon: 'home',
  },
  MusicTab: {
    label: 'الموسيقى',
    outlineIcon: 'musical-notes-outline',
    filledIcon: 'musical-notes',
  },
  ProfileTab: {
    label: 'حسابي',
    outlineIcon: 'person-outline',
    filledIcon: 'person',
  },
};

const DEFAULT_ROUTES = [
  { name: 'DashboardTab', key: 'DashboardTab' },
  { name: 'MusicTab', key: 'MusicTab' },
  { name: 'ProfileTab', key: 'ProfileTab' },
];

interface TabItemProps {
  route: any;
  index: number;
  isActive: boolean;
  onPressTab: (index: number) => void;
  label: string;
  outlineIcon: string;
  filledIcon: string;
  indicatorX: SharedValue<number>;
  tabWidth: number;
  isDark: boolean;
}

// ── Ultra-Fast Native Tab Item with Dynamic Optical Lens Magnification ──
const AnimatedTabItem = React.memo(({
  index,
  isActive,
  onPressTab,
  label,
  outlineIcon,
  filledIcon,
  indicatorX,
  tabWidth,
  isDark,
}: TabItemProps) => {
  const colors = isDark ? APPLE_LIQUID_COLORS.dark : APPLE_LIQUID_COLORS.light;

  const handleItemPress = useCallback(() => {
    onPressTab(index);
  }, [onPressTab, index]);

  // 🔍 Dynamic Optical Refraction: Magnification, Focus, and Elevation under the Glass Bubble
  const animatedLensStyle = useAnimatedStyle(() => {
    const tabCenterX = index * tabWidth;
    const distance = Math.abs(indicatorX.value - tabCenterX);
    const lensFocus = Math.max(0, 1 - distance / (tabWidth * 0.85));

    return {
      transform: [
        { scale: 1 + lensFocus * 0.08 },
        { translateY: -lensFocus * 1.5 },
      ],
      opacity: 0.55 + lensFocus * 0.45,
    };
  });

  return (
    <Pressable
      onPress={handleItemPress}
      style={styles.tabButton}
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
    >
      <Animated.View style={[styles.tabItemInner, animatedLensStyle]}>
        <View style={styles.iconWrapper}>
          <Ionicons
            name={(isActive ? filledIcon : outlineIcon) as any}
            size={APPLE_BAR_METRICS.iconSize}
            color={isActive ? colors.activeTint : colors.inactiveTint}
          />
        </View>
        <Text
          style={[
            styles.tabLabel,
            {
              color: isActive ? colors.activeTint : colors.inactiveTint,
              fontWeight: isActive ? '700' : '500',
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

export interface AppleLiquidGlassTabBarProps {
  activeIndex?: number;
  onTabChange?: (index: number) => void;
  state?: any;
  navigation?: any;
}

export const AppleLiquidGlassTabBar: React.FC<AppleLiquidGlassTabBarProps> = ({
  activeIndex,
  onTabChange,
  state,
  navigation,
}) => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const colors = isDark ? APPLE_LIQUID_COLORS.dark : APPLE_LIQUID_COLORS.light;

  const routes = state?.routes || DEFAULT_ROUTES;
  const numTabs = routes.length || 3;
  const currentIndex = activeIndex !== undefined ? activeIndex : (state?.index ?? 0);

  // Exact Apple Floating Island Proportions
  const containerWidth = width - APPLE_BAR_METRICS.horizontalMargin * 2;
  const innerWidth = containerWidth - APPLE_BAR_METRICS.innerInset * 2;
  const tabWidth = innerWidth / numTabs;
  const indicatorWidth = tabWidth;

  const bottomOffset = Math.max(insets.bottom + 6, APPLE_BAR_METRICS.bottomOffset);

  // 🚀 Pure GPU Shared Values for Bubble Position & Volume-Preserving Stretch (Sx * Sy = 1.0)
  const indicatorX = useSharedValue(currentIndex * tabWidth);
  const bubbleScaleX = useSharedValue(1);
  const bubbleScaleY = useSharedValue(1);
  const targetIndexRef = useRef(currentIndex);

  // Volume-preserving continuous spring animation
  const animateBubbleTo = useCallback(
    (index: number) => {
      const distance = Math.abs(index - targetIndexRef.current);
      targetIndexRef.current = index;

      const stretchRatio = Math.min(1 + distance * 0.10, 1.20);
      const squashRatio = 1 / stretchRatio; // S_x * S_y = 1.0

      bubbleScaleX.value = withSequence(
        withSpring(stretchRatio, { damping: 14, stiffness: 280, mass: 0.4 }),
        withSpring(1, { damping: 16, stiffness: 300, mass: 0.45 })
      );

      bubbleScaleY.value = withSequence(
        withSpring(squashRatio, { damping: 14, stiffness: 280, mass: 0.4 }),
        withSpring(1, { damping: 16, stiffness: 300, mass: 0.45 })
      );

      indicatorX.value = withSpring(index * tabWidth, {
        damping: 22,
        stiffness: 280,
        mass: 0.5,
        overshootClamping: false,
      });
    },
    [tabWidth, indicatorX, bubbleScaleX, bubbleScaleY]
  );

  // Sync with external state changes gracefully
  useEffect(() => {
    if (targetIndexRef.current !== currentIndex) {
      animateBubbleTo(currentIndex);
    }
  }, [currentIndex, animateBubbleTo]);

  const maxTravel = (numTabs - 1) * tabWidth;
  const startDragX = useSharedValue(0);
  const lastSnappedIdx = useSharedValue(currentIndex);

  const triggerHaptic = (type: 'light' | 'selection') => {
    if (type === 'selection') {
      Haptics.selectionAsync().catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const handleTabSelect = useCallback(
    (index: number) => {
      if (targetIndexRef.current === index && currentIndex === index) return;

      // 1. Instant tactile feedback
      triggerHaptic('selection');
      // 2. Animate bubble immediately on UI thread GPU (0ms delay)
      animateBubbleTo(index);

      // 3. Defer screen switch to next animation frame so bubble glide begins with 0ms freeze
      requestAnimationFrame(() => {
        if (onTabChange) {
          onTabChange(index);
        }
        if (navigation && routes[index]) {
          navigation.navigate(routes[index].name);
        }
      });
    },
    [currentIndex, animateBubbleTo, onTabChange, navigation, routes]
  );

  // 🌊 Continuous Damped Spring & Volume-Preserving Physics
  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-14, 14])
      .failOffsetY([-12, 12])
      .onBegin(() => {
        'worklet';
        startDragX.value = indicatorX.value;
      })
      .onStart(() => {
        'worklet';
        runOnJS(triggerHaptic)('light');
      })
      .onUpdate((e) => {
        'worklet';
        const rawX = startDragX.value + e.translationX;

        // Rubber-band resistance at track boundaries
        let clampedX = rawX;
        if (clampedX < 0) {
          clampedX = clampedX * 0.20;
        } else if (clampedX > maxTravel) {
          clampedX = maxTravel + (clampedX - maxTravel) * 0.20;
        }
        indicatorX.value = clampedX;

        // Volume-Preserving Soft-Body Physics: Sx * Sy = 1.0
        const velocity = Math.abs(e.velocityX);
        const stretch = Math.min(velocity / 1800, 0.24);
        const sx = 1 + stretch;
        const sy = 1 / sx;

        bubbleScaleX.value = withSpring(sx, { damping: 18, stiffness: 280, mass: 0.4 });
        bubbleScaleY.value = withSpring(sy, { damping: 18, stiffness: 280, mass: 0.4 });

        // Magnetic Detent: tactile click when crossing midpoints
        const closest = Math.max(0, Math.min(Math.round(clampedX / tabWidth), numTabs - 1));
        if (closest !== lastSnappedIdx.value) {
          lastSnappedIdx.value = closest;
          runOnJS(triggerHaptic)('selection');
        }
      })
      .onEnd((e) => {
        'worklet';
        // Momentum physics prediction
        const predictedX = indicatorX.value + e.velocityX * 0.08;
        let target = Math.round(predictedX / tabWidth);
        target = Math.max(0, Math.min(target, numTabs - 1));

        lastSnappedIdx.value = target;
        const finalX = target * tabWidth;

        indicatorX.value = withSpring(finalX, {
          damping: 20,
          stiffness: 260,
          mass: 0.5,
        });

        bubbleScaleX.value = withSpring(1.0, { damping: 16, stiffness: 300, mass: 0.4 });
        bubbleScaleY.value = withSpring(1.0, { damping: 16, stiffness: 300, mass: 0.4 });

        runOnJS(handleTabSelect)(target);
      });
  }, [indicatorX, bubbleScaleX, bubbleScaleY, maxTravel, tabWidth, numTabs, handleTabSelect]);

  return (
    <View
      style={[
        styles.outerContainer,
        {
          left: APPLE_BAR_METRICS.horizontalMargin,
          right: APPLE_BAR_METRICS.horizontalMargin,
          bottom: bottomOffset,
        },
      ]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={panGesture}>
        <View
          style={[
            styles.mattePillContainer,
            {
              backgroundColor: colors.barBg,
              borderColor: colors.barBorder,
            },
          ]}
        >
          {/* Frosted Backdrop Blur */}
          <BlurView
            intensity={Platform.OS === 'ios' ? (isDark ? 60 : 75) : 45}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />

          {/* Floating Transparent 3D Liquid Glass Selection Bubble */}
          <View style={{ position: 'absolute', top: APPLE_BAR_METRICS.innerInset, left: APPLE_BAR_METRICS.innerInset }}>
            <LiquidGlassBubble
              indicatorX={indicatorX}
              scaleX={bubbleScaleX}
              scaleY={bubbleScaleY}
              width={indicatorWidth}
              height={APPLE_BAR_METRICS.bubbleHeight}
              borderRadius={APPLE_BAR_METRICS.bubbleHeight / 2}
              isDark={isDark}
            />
          </View>

          {/* 3 Fast Unified Tabs */}
          <View style={[styles.tabsRow, { paddingHorizontal: APPLE_BAR_METRICS.innerInset }]}>
            {routes.map((route: any, index: number) => {
              const meta = TAB_METAS[route.name] || {
                label: route.name,
                outlineIcon: 'ellipse-outline',
                filledIcon: 'ellipse',
              };

              return (
                <AnimatedTabItem
                  key={route.key || route.name}
                  route={route}
                  index={index}
                  isActive={currentIndex === index}
                  label={meta.label}
                  outlineIcon={meta.outlineIcon}
                  filledIcon={meta.filledIcon}
                  indicatorX={indicatorX}
                  tabWidth={tabWidth}
                  isDark={isDark}
                  onPressTab={handleTabSelect}
                />
              );
            })}
          </View>
        </View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    height: APPLE_BAR_METRICS.barHeight,
    zIndex: 1000,
  },
  mattePillContainer: {
    flex: 1,
    height: APPLE_BAR_METRICS.barHeight,
    borderRadius: APPLE_BAR_METRICS.barHeight / 2,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  tabsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
    height: '100%',
  },
  tabButton: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabItemInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2, // 2px gap per Apple spec
  },
  tabLabel: {
    fontSize: APPLE_BAR_METRICS.labelSize,
    letterSpacing: -0.2,
  },
});

export default AppleLiquidGlassTabBar;
