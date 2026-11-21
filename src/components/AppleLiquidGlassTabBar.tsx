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
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { LiquidGlassBubble } from './liquidGlass/LiquidGlassBubble';

const { width } = Dimensions.get('window');

// ── Perfect Mathematical Geometry Constants ──
const TAB_BAR_HEIGHT = 60;
const HORIZONTAL_MARGIN = 16;
const PILL_PADDING = 5;
const PILL_H_MARGIN = 2;

interface TabItemProps {
  route: any;
  index: number;
  isActive: boolean;
  onPressTab: (route: any, index: number) => void;
  label: string;
  outlineIcon: string;
  filledIcon: string;
  indicatorX: SharedValue<number>;
  tabWidth: number;
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    outerContainer: {
      position: 'absolute',
      left: HORIZONTAL_MARGIN,
      right: HORIZONTAL_MARGIN,
      height: TAB_BAR_HEIGHT,
      zIndex: 1000,
    },
    mattePillContainer: {
      flex: 1,
      height: TAB_BAR_HEIGHT,
      borderRadius: TAB_BAR_HEIGHT / 2,
      overflow: 'hidden',
      position: 'relative',
      borderWidth: 1,
      borderColor: theme.border,
      ...Platform.select({
        ios: {
          shadowColor: theme.cardShadow.shadowColor,
          shadowOffset: theme.cardShadow.shadowOffset,
          shadowOpacity: theme.cardShadow.shadowOpacity,
          shadowRadius: theme.cardShadow.shadowRadius,
        },
        android: {
          elevation: theme.cardShadow.elevation,
        },
      }),
    },
    matteBackground: {
      ...StyleSheet.absoluteFill,
      backgroundColor:
        Platform.OS === 'ios'
          ? (theme.mode === 'light' ? 'rgba(240, 239, 234, 0.82)' : 'rgba(18, 18, 24, 0.78)')
          : theme.androidSurfaceFallback,
    },
    tabsRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: PILL_PADDING,
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
      marginBottom: 3,
    },
    tabLabel: {
      fontSize: 10.5,
      letterSpacing: -0.2,
    },
  });

// ── Ultra-Fast Native Tab Item with Dynamic Optical Lens Magnification ──
const AnimatedTabItem = React.memo(({
  route,
  index,
  isActive,
  onPressTab,
  label,
  outlineIcon,
  filledIcon,
  indicatorX,
  tabWidth,
}: TabItemProps) => {
  const { isDark } = useTheme();
  const styles = useThemedStyles(createStyles);

  // Strict Monochrome Apple Spec (Rule 8): Pure Obsidian Black (#0A0A0A) / Crisp White (#FFFFFF)
  const activeColor = isDark ? '#FFFFFF' : '#0A0A0A';
  const inactiveColor = isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(60, 60, 67, 0.55)';

  const handleItemPress = useCallback(() => {
    onPressTab(route, index);
  }, [onPressTab, route, index]);

  // 🔍 Dynamic Optical Refraction (Rule 7): 1.08x Magnification, Focus, and Elevation under the Glass Bubble
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
            size={21}
            color={isActive ? activeColor : inactiveColor}
          />
        </View>
        <Text
          style={[
            styles.tabLabel,
            {
              color: isActive ? activeColor : inactiveColor,
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

export const AppleLiquidGlassTabBar = ({
  state,
  navigation,
}: BottomTabBarProps) => {
  const { theme, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, Platform.OS === 'ios' ? 16 : 12);

  const containerWidth = width - HORIZONTAL_MARGIN * 2;
  const numTabs = state.routes.length || 3;
  const innerWidth = containerWidth - PILL_PADDING * 2;
  const tabWidth = innerWidth / numTabs;
  const indicatorWidth = tabWidth - PILL_H_MARGIN * 2;

  // 🚀 Pure GPU Shared Values for Bubble Position & Volume-Preserving Stretch ($S_x \times S_y \approx 1.0$)
  const indicatorX = useSharedValue(state.index * tabWidth);
  const bubbleScaleX = useSharedValue(1);
  const bubbleScaleY = useSharedValue(1);
  const targetIndexRef = useRef(state.index);

  // Volume-preserving continuous spring animation (Rule 4 & 5)
  const animateBubbleTo = useCallback(
    (index: number) => {
      const distance = Math.abs(index - targetIndexRef.current);
      targetIndexRef.current = index;

      const stretchRatio = Math.min(1 + distance * 0.10, 1.20);
      const squashRatio = 1 / stretchRatio; // Volume preserving S_x * S_y = 1.0

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
    if (targetIndexRef.current !== state.index) {
      animateBubbleTo(state.index);
    }
  }, [state.index, animateBubbleTo]);

  const getTabMeta = (routeName: string) => {
    switch (routeName) {
      case 'DashboardTab':
        return {
          label: 'الرئيسية',
          outlineIcon: 'home-outline',
          filledIcon: 'home',
        };
      case 'MusicTab':
        return {
          label: 'الموسيقى',
          outlineIcon: 'musical-notes-outline',
          filledIcon: 'musical-notes',
        };
      case 'ProfileTab':
        return {
          label: 'حسابي',
          outlineIcon: 'person-outline',
          filledIcon: 'person',
        };
      default:
        return {
          label: routeName,
          outlineIcon: 'ellipse-outline',
          filledIcon: 'ellipse',
        };
    }
  };

  const maxTravel = (numTabs - 1) * tabWidth;
  const startDragX = useSharedValue(0);
  const lastSnappedIdx = useSharedValue(state.index);

  const triggerHaptic = (type: 'light' | 'selection') => {
    if (type === 'selection') {
      Haptics.selectionAsync().catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const onDragEndSnap = useCallback(
    (targetIdx: number) => {
      targetIndexRef.current = targetIdx;
      if (state.index !== targetIdx && state.routes[targetIdx]) {
        navigation.navigate(state.routes[targetIdx].name);
      }
    },
    [navigation, state.index, state.routes]
  );

  // 🌊 Continuous Damped Spring & Volume-Preserving Physics (Rule 4, 5 & 6)
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

        // Dynamic Volume-Preserving Soft-Body Physics: S_x * S_y = 1.0 (Rule 4)
        const velocity = Math.abs(e.velocityX);
        const stretch = Math.min(velocity / 1800, 0.24);
        const sx = 1 + stretch;
        const sy = 1 / sx; // Exact inverse preserving volume

        // Continuous spring response to touch direction changes (Rule 5)
        bubbleScaleX.value = withSpring(sx, { damping: 18, stiffness: 280, mass: 0.4 });
        bubbleScaleY.value = withSpring(sy, { damping: 18, stiffness: 280, mass: 0.4 });

        // Magnetic Detent: tactile click when crossing midpoints without blocking JS thread (Rule 6)
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

        // Magnetic Snapping with liquid spring settling
        indicatorX.value = withSpring(finalX, {
          damping: 20,
          stiffness: 260,
          mass: 0.5,
        });

        bubbleScaleX.value = withSpring(1.0, { damping: 16, stiffness: 300, mass: 0.4 });
        bubbleScaleY.value = withSpring(1.0, { damping: 16, stiffness: 300, mass: 0.4 });

        runOnJS(onDragEndSnap)(target);
      });
  }, [indicatorX, bubbleScaleX, bubbleScaleY, maxTravel, tabWidth, numTabs, onDragEndSnap]);

  const stateIndexRef = useRef(state.index);
  stateIndexRef.current = state.index;

  // Rule 3: Decoupled UI-thread First Touch (0ms Latency)
  const handlePress = useCallback(
    (route: any, index: number) => {
      if (stateIndexRef.current !== index) {
        // 📳 Instant tactile click
        Haptics.selectionAsync().catch(() => {});
        // 🚀 Instant 0ms bubble spring on GPU
        animateBubbleTo(index);
        // ⚡ Immediate navigation
        navigation.navigate(route.name);
      }
    },
    [navigation, animateBubbleTo]
  );

  return (
    <View
      style={[
        styles.outerContainer,
        { bottom: bottomOffset },
      ]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={panGesture}>
        <View style={styles.mattePillContainer}>
          {/* Dynamic Frosted Blur Layer */}
          <BlurView
            intensity={Platform.OS === 'ios' ? 70 : 45}
            tint={theme.blurTint}
            style={StyleSheet.absoluteFill}
          />

          {/* Dynamic Matte Base Surface */}
          <View style={styles.matteBackground} />

          {/* Floating Transparent 3D Liquid Glass Selection Bubble */}
          <View style={{ position: 'absolute', top: PILL_PADDING, left: PILL_PADDING + PILL_H_MARGIN }}>
            <LiquidGlassBubble
              indicatorX={indicatorX}
              scaleX={bubbleScaleX}
              scaleY={bubbleScaleY}
              width={indicatorWidth}
              height={TAB_BAR_HEIGHT - PILL_PADDING * 2}
              borderRadius={(TAB_BAR_HEIGHT - PILL_PADDING * 2) / 2}
              isDark={isDark}
            />
          </View>

          {/* 3 Fast Unified Tabs */}
          <View style={styles.tabsRow}>
            {state.routes.map((route, index) => {
              const meta = getTabMeta(route.name);

              return (
                <AnimatedTabItem
                  key={route.key}
                  route={route}
                  index={index}
                  isActive={state.index === index}
                  label={meta.label}
                  outlineIcon={meta.outlineIcon}
                  filledIcon={meta.filledIcon}
                  indicatorX={indicatorX}
                  tabWidth={tabWidth}
                  onPressTab={handlePress}
                />
              );
            })}
          </View>
        </View>
      </GestureDetector>
    </View>
  );
};

export default AppleLiquidGlassTabBar;
