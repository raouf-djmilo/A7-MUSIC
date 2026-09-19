import React, { useEffect } from 'react';
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
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';

const { width } = Dimensions.get('window');

// ── Minimal Warm Floating Bar Geometry ──
const TAB_BAR_HEIGHT = 64;
const HORIZONTAL_MARGIN = 16;
const PILL_PADDING = 6;

interface TabItemProps {
  route: any;
  index: number;
  isFocused: boolean;
  onPress: () => void;
  label: string;
  iconName: string;
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
      left: PILL_PADDING,
      height: TAB_BAR_HEIGHT - PILL_PADDING * 2,
      borderRadius: (TAB_BAR_HEIGHT - PILL_PADDING * 2) / 2,
      backgroundColor: theme.activePill,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
      zIndex: 1,
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
    iconWrapper: {
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 3,
    },
    tabLabel: {
      fontSize: 10.5,
      letterSpacing: -0.2,
    },
    tabLabelActive: {
      color: theme.textPrimary,
      fontWeight: '700',
    },
    tabLabelInactive: {
      color: theme.textMuted,
      fontWeight: '500',
    },
  });

const AnimatedTabItem = ({
  isFocused,
  onPress,
  label,
  iconName,
}: TabItemProps) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const focusAnim = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    focusAnim.value = withSpring(isFocused ? 1 : 0, {
      damping: 20,
      stiffness: 180,
    });
  }, [isFocused]);

  const animatedIconStyle = useAnimatedStyle(() => {
    const scale = interpolate(focusAnim.value, [0, 1], [0.96, 1.06]);
    return {
      transform: [{ scale }],
    };
  });

  const animatedTextStyle = useAnimatedStyle(() => {
    const opacity = interpolate(focusAnim.value, [0, 1], [0.45, 1.0]);
    return { opacity };
  });

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={styles.tabButton}
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
    >
      <Animated.View style={[styles.iconWrapper, animatedIconStyle]}>
        <Ionicons
          name={iconName as any}
          size={21}
          color={isFocused ? theme.textPrimary : theme.textMuted}
        />
      </Animated.View>
      <Animated.Text
        style={[
          styles.tabLabel,
          isFocused ? styles.tabLabelActive : styles.tabLabelInactive,
          animatedTextStyle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Animated.Text>
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
  const indicatorWidth = tabWidth;

  const indicatorX = useSharedValue(state.index * tabWidth);
  const activeIndex = state.index;

  useEffect(() => {
    const targetX = activeIndex * tabWidth;
    indicatorX.value = withSpring(targetX, {
      damping: 20,
      stiffness: 180,
      mass: 0.8,
    });
  }, [activeIndex, tabWidth]);

  const animatedIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  const getTabMeta = (routeName: string, isFocused: boolean) => {
    switch (routeName) {
      case 'DashboardTab':
        return {
          label: 'الرئيسية',
          iconName: isFocused ? 'home' : 'home-outline',
        };
      case 'RecordTab':
        return {
          label: 'تسجيل',
          iconName: isFocused ? 'fitness' : 'fitness-outline',
        };
      case 'MusicTab':
        return {
          label: 'الموسيقى',
          iconName: isFocused ? 'musical-notes' : 'musical-notes-outline',
        };
      case 'ProfileTab':
        return {
          label: 'حسابي',
          iconName: isFocused ? 'person' : 'person-outline',
        };
      default:
        return {
          label: routeName,
          iconName: 'ellipse-outline',
        };
    }
  };

  const handlePress = (route: any, index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (route.name === 'RecordTab') {
      navigation.navigate('Recording');
      return;
    }

    if (!event.defaultPrevented && state.index !== index) {
      navigation.navigate(route.name);
    }
  };

  return (
    <View
      style={[styles.outerContainer, { bottom: bottomOffset }]}
      pointerEvents="box-none"
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

        {/* Soft Dynamic Sliding Indicator */}
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
            const isFocused = state.index === index;
            const meta = getTabMeta(route.name, isFocused);

            return (
              <AnimatedTabItem
                key={route.key}
                route={route}
                index={index}
                isFocused={isFocused}
                label={meta.label}
                iconName={meta.iconName}
                onPress={() => handlePress(route, index)}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
};

export default AppleLiquidGlassTabBar;



