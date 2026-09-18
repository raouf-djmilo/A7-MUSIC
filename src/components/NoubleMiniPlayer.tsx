import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAudioStore } from '../store/useAudioStore';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';

const { width } = Dimensions.get('window');

// ── Docking Geometry Aligned Exactly with AppleLiquidGlassTabBar ──
const TAB_BAR_HEIGHT = 64;
const DOCKING_GAP = 8;
const PLAYER_HEIGHT = 58;
const HORIZONTAL_MARGIN = 16;

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    container: {
      width: width - HORIZONTAL_MARGIN * 2,
      height: PLAYER_HEIGHT,
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
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
          ? (theme.mode === 'light' ? 'rgba(240, 239, 234, 0.88)' : 'rgba(18, 18, 24, 0.85)')
          : theme.androidSurfaceFallback,
      zIndex: 0,
    },
    touchable: {
      flex: 1,
    },
    blur: {
      flex: 1,
      paddingHorizontal: 10,
      justifyContent: 'center',
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      height: '100%',
      zIndex: 10,
    },
    thumbnail: {
      width: 42,
      height: 42,
      borderRadius: 10,
      backgroundColor: theme.surfaceSubtle,
    },
    info: {
      flex: 1,
      marginLeft: 10,
      justifyContent: 'center',
    },
    title: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    artistRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    artist: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '500',
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingRight: 4,
    },
    playBtn: {
      width: 32,
      height: 32,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.surfaceSubtle,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
    },
    nextBtn: {
      width: 30,
      height: 30,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 15,
      backgroundColor: theme.surfaceSubtle,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
    },
    closeBtn: {
      width: 28,
      height: 28,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 14,
      backgroundColor: 'transparent',
    },
    progressBarBg: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 2.5,
      backgroundColor: theme.surfaceSubtle,
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: theme.textPrimary,
    },
  });

export const NoubleMiniPlayer: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const {
    currentTrack,
    isPlaying,
    isLoading,
    togglePlay,
    nextTrack,
    stopTrack,
    setPlayerModalVisible,
    positionMillis,
    durationMillis,
    isMiniPlayerSuppressed,
  } = useAudioStore();

  const isVisible = useRef<boolean>(false);
  const translateY = useSharedValue(200);
  const opacity = useSharedValue(0);

  // Exact bottom offset matching AppleLiquidGlassTabBar + 8px gap
  const tabBarBottom = Math.max(insets.bottom, Platform.OS === 'ios' ? 16 : 12);
  const bottomOffset = tabBarBottom + TAB_BAR_HEIGHT + DOCKING_GAP;

  // ── Kill Bouncing: Animate in ONLY on first track mount, zero movement on track changes ──
  useEffect(() => {
    if (currentTrack) {
      if (!isVisible.current) {
        isVisible.current = true;
        translateY.value = withTiming(0, {
          duration: 250,
          easing: Easing.out(Easing.quad),
        });
        opacity.value = withTiming(1, { duration: 250 });
      }
    } else {
      if (isVisible.current) {
        isVisible.current = false;
        translateY.value = withTiming(200, {
          duration: 220,
          easing: Easing.in(Easing.quad),
        });
        opacity.value = withTiming(0, { duration: 220 });
      }
    }
  }, [currentTrack ? currentTrack.videoId : null]);

  // Swipe-down gesture to dismiss mini player (activeOffsetY prevents hijacking taps)
  const gesture = Gesture.Pan()
    .activeOffsetY([10, 10])
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 35 || event.velocityY > 350) {
        translateY.value = withTiming(200, { duration: 200 }, () => {
          stopTrack();
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        translateY.value = withTiming(0, { duration: 200 });
      }
    });

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    translateY.value = withTiming(200, { duration: 200 }, () => {
      stopTrack();
    });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!currentTrack || isMiniPlayerSuppressed) return null;

  const validDuration = durationMillis > 0 ? durationMillis : 180000;
  const progressPercent = Math.min(100, Math.max(0, (positionMillis / validDuration) * 100));

  return (
    <GestureHandlerRootView
      style={[
        {
          position: 'absolute',
          bottom: bottomOffset,
          left: 0,
          right: 0,
          alignItems: 'center',
          zIndex: 9999,
        },
      ]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.container, animatedStyle]}>
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPlayerModalVisible(true);
            }}
            style={styles.touchable}
          >
            {/* Frosted Layer */}
            <BlurView
              intensity={Platform.OS === 'ios' ? 70 : 45}
              tint={theme.blurTint}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Dynamic Warm Surface Layer */}
            <View style={styles.matteBackground} pointerEvents="none" />

            <View style={styles.content}>
              {/* Artwork */}
              <Image
                source={{
                  uri:
                    currentTrack.thumbnail ||
                    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200',
                }}
                style={styles.thumbnail}
                contentFit="cover"
              />

              {/* Track Info */}
              <View style={styles.info}>
                <Text style={styles.title} numberOfLines={1}>
                  {currentTrack.title || 'Track Title'}
                </Text>
                <View style={styles.artistRow}>
                  <Text style={styles.artist} numberOfLines={1}>
                    {currentTrack.artist || 'Artist'}
                  </Text>
                  {currentTrack.isOfficial && (
                    <Ionicons
                      name="checkmark-circle"
                      size={12}
                      color="#458eff"
                      style={{ marginLeft: 3 }}
                    />
                  )}
                </View>
              </View>

              {/* Quick Controls */}
              <View style={styles.controls}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={(e) => {
                    e.stopPropagation();
                    togglePlay();
                  }}
                  style={styles.playBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={18}
                    color={theme.textPrimary}
                    style={{ marginLeft: isPlaying ? 0 : 1 }}
                  />
                </TouchableOpacity>

                {/* Next Track Button */}
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    nextTrack();
                  }}
                  style={styles.nextBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="play-skip-forward"
                    size={16}
                    color={theme.textPrimary}
                  />
                </TouchableOpacity>

                {/* Dismiss Button */}
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    handleDismiss();
                  }}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={17} color={theme.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Seamless Bottom Progress Bar */}
            <View style={styles.progressBarBg} pointerEvents="none">
              <View
                style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
              />
            </View>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

export default NoubleMiniPlayer;
