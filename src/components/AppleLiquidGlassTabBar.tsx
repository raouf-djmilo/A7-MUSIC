import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { useAudioStore } from '../store/useAudioStore';

const { width } = Dimensions.get('window');

// ── Perfect Mathematical Geometry & Physics Constants ──
const TAB_BAR_HEIGHT = 60;
const HORIZONTAL_MARGIN = 16;
const PILL_PADDING = 5;
const PILL_H_MARGIN = 2;
const STRAVA_ORANGE = '#FC5200';

// 🚀 Silky Apple Liquid Motion Curve (Fast acceleration, buttery smooth deceleration)
const TRANSITION_DURATION = 230;
const TRANSITION_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

interface TabItemProps {
  route: any;
  index: number;
  activeProgress: Animated.SharedValue<number>;
  onPress: () => void;
  label: string;
  outlineIcon: string;
  filledIcon: string;
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
    activeIndicator: {
      position: 'absolute',
      top: PILL_PADDING,
      left: PILL_PADDING + PILL_H_MARGIN,
      height: TAB_BAR_HEIGHT - PILL_PADDING * 2,
      borderRadius: (TAB_BAR_HEIGHT - PILL_PADDING * 2) / 2,
      backgroundColor:
        theme.mode === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.12)',
      borderWidth: 1,
      borderColor:
        theme.mode === 'light' ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)',
      zIndex: 1,
      ...Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: theme.mode === 'light' ? 0.04 : 0.10,
          shadowRadius: 3,
        },
        android: {
          elevation: 1,
        },
      }),
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
      position: 'relative',
    },
    tabContentLayer: {
      justifyContent: 'center',
      alignItems: 'center',
      width: '100%',
    },
    tabContentLayerActive: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
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

// ── Liquid Continuous Tab Item (Zero Hard-Cuts, GPU Smooth Cross-Fade) ──
const AnimatedTabItem = ({
  index,
  activeProgress,
  onPress,
  label,
  outlineIcon,
  filledIcon,
}: TabItemProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const activeColor = STRAVA_ORANGE;
  const inactiveColor =
    theme.mode === 'light' ? 'rgba(17, 24, 39, 0.60)' : 'rgba(255, 255, 255, 0.45)';

  // 🚀 Active layer dissolves in as bubble arrives, with subtle spring expansion
  const activeAnimatedStyle = useAnimatedStyle(() => {
    const dist = Math.abs(activeProgress.value - index);
    const p = Math.max(0, 1 - dist);
    return {
      opacity: p,
      transform: [
        {
          scale: interpolate(p, [0, 1], [0.94, 1.06]),
        },
      ],
    };
  });

  // 🚀 Inactive layer dissolves out as bubble arrives
  const inactiveAnimatedStyle = useAnimatedStyle(() => {
    const dist = Math.abs(activeProgress.value - index);
    const p = Math.max(0, 1 - dist);
    return {
      opacity: 1 - p,
      transform: [
        {
          scale: interpolate(p, [0, 1], [1.0, 0.94]),
        },
      ],
    };
  });

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={styles.tabButton}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    >
      <View style={styles.tabItemInner}>
        {/* 1. Inactive State (Soft Gray, Dissolves out continuously) */}
        <Animated.View style={[styles.tabContentLayer, inactiveAnimatedStyle]}>
          <View style={styles.iconWrapper}>
            <Ionicons name={outlineIcon as any} size={21} color={inactiveColor} />
          </View>
          <Text
            style={[styles.tabLabel, { color: inactiveColor, fontWeight: '500' }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </Animated.View>

        {/* 2. Active State (Athletic Orange, Dissolves in continuously with Bubble) */}
        <Animated.View
          style={[
            styles.tabContentLayer,
            styles.tabContentLayerActive,
            activeAnimatedStyle,
          ]}
        >
          <View style={styles.iconWrapper}>
            <Ionicons name={filledIcon as any} size={21} color={activeColor} />
          </View>
          <Text
            style={[styles.tabLabel, { color: activeColor, fontWeight: '700' }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
};

export const AppleLiquidGlassTabBar = ({
  state,
  navigation,
}: BottomTabBarProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, Platform.OS === 'ios' ? 16 : 12);

  const containerWidth = width - HORIZONTAL_MARGIN * 2;
  const numTabs = state.routes.length || 4;
  const innerWidth = containerWidth - PILL_PADDING * 2;
  const tabWidth = innerWidth / numTabs;
  const indicatorWidth = tabWidth - PILL_H_MARGIN * 2;

  // 🚀 Pure GPU Worklet Values (Bubble Position & Liquid Progress)
  const indicatorX = useSharedValue(state.index * tabWidth);
  const activeProgress = useSharedValue(state.index);

  // Sync with external state changes gracefully (e.g. initial render or programmatic back)
  useEffect(() => {
    const targetX = state.index * tabWidth;
    if (Math.abs(indicatorX.value - targetX) > 1) {
      indicatorX.value = withTiming(targetX, {
        duration: TRANSITION_DURATION,
        easing: TRANSITION_EASING,
      });
      activeProgress.value = withTiming(state.index, {
        duration: TRANSITION_DURATION,
        easing: TRANSITION_EASING,
      });
    }
  }, [state.index, tabWidth]);

  const animatedIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  // 🚀 Liquid Slide Down on Recording Screen Entry
  const currentRouteName = useAudioStore((s) => s.currentRouteName);
  const isRecordingScreen = currentRouteName === 'Recording';

  const tabBarTranslateY = useSharedValue(0);
  const tabBarOpacity = useSharedValue(1);

  useEffect(() => {
    if (isRecordingScreen) {
      tabBarTranslateY.value = withTiming(110, {
        duration: 220,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
      tabBarOpacity.value = withTiming(0, { duration: 180 });
    } else {
      tabBarTranslateY.value = withTiming(0, {
        duration: 200,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
      tabBarOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isRecordingScreen]);

  const animatedTabBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: tabBarTranslateY.value }],
    opacity: tabBarOpacity.value,
  }));

  const getTabMeta = (routeName: string) => {
    switch (routeName) {
      case 'DashboardTab':
        return {
          label: 'الرئيسية',
          outlineIcon: 'home-outline',
          filledIcon: 'home',
        };
      case 'RecordTab':
        return {
          label: 'تسجيل',
          outlineIcon: 'fitness-outline',
          filledIcon: 'fitness',
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

  const handlePress = (route: any, index: number) => {
    // 📳 Tactile selection haptics
    Haptics.selectionAsync().catch(() => {});

    if (route.name === 'RecordTab') {
      tabBarTranslateY.value = withTiming(110, {
        duration: 180,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
      tabBarOpacity.value = withTiming(0, { duration: 150 });
      navigation.navigate('Recording');
      return;
    }

    if (state.index !== index) {
      // 🚀 Move bubble and liquid progress simultaneously with 0ms touch latency
      const targetX = index * tabWidth;
      indicatorX.value = withTiming(targetX, {
        duration: TRANSITION_DURATION,
        easing: TRANSITION_EASING,
      });
      activeProgress.value = withTiming(index, {
        duration: TRANSITION_DURATION,
        easing: TRANSITION_EASING,
      });

      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (!event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    }
  };

  return (
    <Animated.View
      style={[
        styles.outerContainer,
        { bottom: bottomOffset },
        animatedTabBarStyle,
      ]}
      pointerEvents={isRecordingScreen ? 'none' : 'box-none'}
    >
      <View style={styles.mattePillContainer}>
        {/* Dynamic Frosted Blur Layer */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 70 : 45}
          tint={theme.blurTint}
          style={StyleSheet.absoluteFill}
        />

        {/* Dynamic Matte Base Surface */}
        <View style={styles.matteBackground} />

        {/* Perfectly Centered Frosted Sliding Capsule */}
        <Animated.View
          style={[
            styles.activeIndicator,
            { width: indicatorWidth },
            animatedIndicatorStyle,
          ]}
        />

        {/* 4 Unified Tabs */}
        <View style={styles.tabsRow}>
          {state.routes.map((route, index) => {
            const meta = getTabMeta(route.name);

            return (
              <AnimatedTabItem
                key={route.key}
                route={route}
                index={index}
                activeProgress={activeProgress}
                label={meta.label}
                outlineIcon={meta.outlineIcon}
                filledIcon={meta.filledIcon}
                onPress={() => handlePress(route, index)}
              />
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
};

export default AppleLiquidGlassTabBar;
