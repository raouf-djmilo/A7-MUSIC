import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  Share,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useAudioStore, Track } from '../store/useAudioStore';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../providers/AuthProvider';
import {
  getUniversalStudioArtwork,
  getUniversalArtistAvatar,
  STUDIO_IMAGE_PROPS,
} from '../utils/artworkHelper';
import { useDownloadStore, downloadService, AudioQualityOption } from '../services/downloadService';
import { ToastManager } from './InAppToast';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Docking & Layout Constants ──
const TAB_BAR_HEIGHT = 56;
const MINI_PLAYER_HEIGHT = 58;
const DOCK_MARGIN = 10;
const MINI_MARGIN_H = 12;

// ── Optimal Snappy Spring Configuration (Pure 120 FPS GPU) ──
const SPRING_CONFIG = {
  damping: 26,
  stiffness: 320,
  mass: 0.7,
};

// ── Deterministic 0ms Atmospheric Tint Engine ──
interface AtmosphericPalette {
  top: string;
  mid: string;
  bottom: string;
  accent: string;
}

export function getTrackAtmosphericTint(track?: Track | null, isDark = true): AtmosphericPalette {
  if (!track) {
    return isDark
      ? { top: '#1c2e24', mid: '#131e18', bottom: '#0b100d', accent: '#1DB954' }
      : { top: '#e0ece4', mid: '#edf4ef', bottom: '#f8faf8', accent: '#1DB954' };
  }

  const titleAndArtist = `${track.title || ''} ${track.artist || ''}`.toLowerCase();

  // 1. Khaled / Rai / 1,2,3 Soleils: Exact Sage Moss Green from Spotify Screenshots
  if (
    titleAndArtist.includes('khaled') ||
    titleAndArtist.includes('soleils') ||
    titleAndArtist.includes('rai') ||
    titleAndArtist.includes('mami') ||
    titleAndArtist.includes('hasni') ||
    titleAndArtist.includes('aicha') ||
    titleAndArtist.includes('abdel kader')
  ) {
    return isDark
      ? { top: '#3e5c4a', mid: '#253a2f', bottom: '#111b15', accent: '#1DB954' }
      : { top: '#cfe3d6', mid: '#e1ede5', bottom: '#f3f8f5', accent: '#1DB954' };
  }

  // 2. High-Cadence Running / 160 BPM / Cardio / Workout
  if (
    titleAndArtist.includes('bpm') ||
    titleAndArtist.includes('cadence') ||
    titleAndArtist.includes('workout') ||
    titleAndArtist.includes('cardio') ||
    titleAndArtist.includes('stride')
  ) {
    return isDark
      ? { top: '#462719', mid: '#2c1810', bottom: '#130a07', accent: '#FF6B00' }
      : { top: '#f8dfd0', mid: '#faede4', bottom: '#fdf7f3', accent: '#FF6B00' };
  }

  // 3. Rap / Trap / Phonk
  if (
    titleAndArtist.includes('phonk') ||
    titleAndArtist.includes('rap') ||
    titleAndArtist.includes('trap') ||
    titleAndArtist.includes('drill')
  ) {
    return isDark
      ? { top: '#36224c', mid: '#231533', bottom: '#11091a', accent: '#8e2de2' }
      : { top: '#e5d7f7', mid: '#f0e8fa', bottom: '#faf6fd', accent: '#8e2de2' };
  }

  // 4. Deterministic Hash Palette for any other song
  let hash = 0;
  const str = track.videoId || track.title || 'default';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  if (isDark) {
    return {
      top: `hsl(${hue}, 36%, 20%)`,
      mid: `hsl(${hue}, 28%, 13%)`,
      bottom: `hsl(${hue}, 22%, 8%)`,
      accent: '#1DB954',
    };
  } else {
    return {
      top: `hsl(${hue}, 40%, 88%)`,
      mid: `hsl(${hue}, 30%, 94%)`,
      bottom: `hsl(${hue}, 18%, 98%)`,
      accent: '#1DB954',
    };
  }
}

function formatTime(millis: number): string {
  if (!millis || isNaN(millis) || millis < 0) return '0:00';
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// ── Isolated Mini Progress Bar (Zero Parent Re-render) ──
interface MiniProgressBarProps {
  isDark: boolean;
  accentColor: string;
}

const MiniProgressBar: React.FC<MiniProgressBarProps> = React.memo(({ isDark, accentColor }) => {
  const positionMillis = useAudioStore((s) => s.positionMillis);
  const durationMillis = useAudioStore((s) => s.durationMillis);
  const trackDuration = useAudioStore((s) => s.currentTrack?.duration || 180000);

  const validDuration = durationMillis > 0 ? durationMillis : trackDuration;
  const progressPercent = Math.min(100, Math.max(0, (positionMillis / validDuration) * 100));

  return (
    <View style={styles.miniProgressBg} pointerEvents="none">
      <View
        style={[
          styles.miniProgressFill,
          {
            width: `${progressPercent}%`,
            backgroundColor: isDark ? '#FFFFFF' : accentColor,
          },
        ]}
      />
    </View>
  );
});

// ── Isolated Full Player Scrubber (Zero Parent Re-render) ──
interface PlayerScrubberProps {
  isDark: boolean;
  themeMuted: string;
}

const PlayerScrubber: React.FC<PlayerScrubberProps> = React.memo(({ isDark, themeMuted }) => {
  const positionMillis = useAudioStore((s) => s.positionMillis);
  const durationMillis = useAudioStore((s) => s.durationMillis);
  const trackDuration = useAudioStore((s) => s.currentTrack?.duration || 180000);
  const seekTo = useAudioStore((s) => s.seekTo);

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  const validDuration = durationMillis > 0 ? durationMillis : trackDuration;
  const displayPosition = isScrubbing ? scrubValue : positionMillis;

  return (
    <View style={styles.scrubberContainer}>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={validDuration}
        value={Math.min(displayPosition, validDuration)}
        onSlidingStart={() => {
          setIsScrubbing(true);
          setScrubValue(positionMillis);
        }}
        onValueChange={(val) => {
          setIsScrubbing(true);
          setScrubValue(val);
        }}
        onSlidingComplete={async (val) => {
          setIsScrubbing(false);
          await seekTo(val);
          Haptics.selectionAsync();
        }}
        minimumTrackTintColor="#1DB954"
        maximumTrackTintColor={isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.15)'}
        thumbTintColor="#1DB954"
      />
      <View style={styles.timeRow}>
        <Text style={[styles.timeText, { color: isDark ? 'rgba(255,255,255,0.55)' : themeMuted }]}>
          {formatTime(displayPosition)}
        </Text>
        <Text style={[styles.timeText, { color: isDark ? 'rgba(255,255,255,0.55)' : themeMuted }]}>
          {formatTime(validDuration)}
        </Text>
      </View>
    </View>
  );
});

/**
 * 🏆 UnifiedPlayerSheet
 * Complete architectural implementation:
 * 1. 3-State FSM (HIDDEN | COLLAPSED | EXPANDED): Strict deterministic lifecycle.
 * 2. Gliding Navigation Docking: Reanimated dockTranslateY glides 56px in 250ms with zero teleportation.
 * 3. Continuous 120 FPS Pan Tracking: Real-time touch-following on Swipe Up and Swipe Down.
 * 4. Zero-Unmount Architecture: MiniPlayer stays mounted, interpolated via GPU opacity/scale worklets.
 * 5. Universal Studio Artwork Engine: 1000x1000 square covers with zero letterbox black borders.
 * 6. Authentic Spotify 1:1 Artist Card: High-res official portrait, live follow toggle, and tap navigation.
 */
export const UnifiedPlayerSheet: React.FC = React.memo(() => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const { session } = useAuth();

  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const nextTrack = useAudioStore((s) => s.nextTrack);
  const prevTrack = useAudioStore((s) => s.prevTrack);
  const stopTrack = useAudioStore((s) => s.stopTrack);
  const likedTrackIds = useAudioStore((s) => s.likedTrackIds);
  const toggleLike = useAudioStore((s) => s.toggleLike);
  const isShuffle = useAudioStore((s) => s.isShuffle);
  const toggleShuffle = useAudioStore((s) => s.toggleShuffle);
  const repeatMode = useAudioStore((s) => s.repeatMode);
  const toggleRepeat = useAudioStore((s) => s.toggleRepeat);
  const isPlayerModalVisible = useAudioStore((s) => s.isPlayerModalVisible);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);
  const isMiniPlayerSuppressed = useAudioStore((s) => s.isMiniPlayerSuppressed);
  const currentRouteName = useAudioStore((s) => s.currentRouteName);
  const followedArtistIds = useAudioStore((s) => s.followedArtistIds);
  const toggleFollowArtist = useAudioStore((s) => s.toggleFollowArtist);

  const [playerMode, setPlayerMode] = useState<'audio' | 'video'>('audio');

  const positionMillis = useAudioStore((s) => s.positionMillis);
  const durationMillis = useAudioStore((s) => s.durationMillis);
  const seekTo = useAudioStore((s) => s.seekTo);

  const seekBackward10 = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const target = Math.max(0, positionMillis - 10000);
    await seekTo(target);
  }, [positionMillis, seekTo]);

  const seekForward10 = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const validDuration = durationMillis > 0 ? durationMillis : (currentTrack?.duration || 180000);
    const target = Math.min(validDuration, positionMillis + 10000);
    await seekTo(target);
  }, [positionMillis, durationMillis, currentTrack?.duration, seekTo]);

  // ── Navigation-Aware Docking Guard ──
  const TAB_BAR_SCREENS = [
    'DashboardTab',
    'Dashboard',
    'RecordTab',
    'MusicTab',
    'MusicHome',
    'MusicSearch',
    'MusicLibrary',
    'ProfileTab',
    'Profile',
    'Tabs',
  ];
  const isTabBarVisible = !currentRouteName || TAB_BAR_SCREENS.includes(currentRouteName);
  const isWorkoutSummary = currentRouteName === 'WorkoutSummary';

  // ── Navigation Change Guard ──
  // ── Navigation Change Guard & Conditional Mount ──
  const [renderFullPlayer, setRenderFullPlayer] = useState(isPlayerModalVisible);

  useEffect(() => {
    if (isPlayerModalVisible) {
      setRenderFullPlayer(true);
    }
  }, [isPlayerModalVisible]);

  const prevRouteRef = React.useRef(currentRouteName);
  useEffect(() => {
    if (prevRouteRef.current && prevRouteRef.current !== currentRouteName) {
      if (isPlayerModalVisible) {
        setPlayerModalVisible(false);
        setRenderFullPlayer(false);
      }
    }
    prevRouteRef.current = currentRouteName;
  }, [currentRouteName, isPlayerModalVisible, setPlayerModalVisible]);

  // ── Precise Dynamic Geometry Offsets (Spotify & Apple Music Standard) ──
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 16 : 10);
  const baseMiniBottom = bottomInset + TAB_BAR_HEIGHT + DOCK_MARGIN;
  const HIDDEN_OFFSET = Math.max(SCREEN_HEIGHT, 850) + 150;

  // ── UI-Thread Shared Values (GPU Transform Only) ──
  const fullTranslateY = useSharedValue(HIDDEN_OFFSET);
  const fullStartY = useSharedValue(0);
  const dockTranslateY = useSharedValue(isTabBarVisible ? 0 : TAB_BAR_HEIGHT);

  // Smooth 250ms glide when navigating between Tab screens and Stack screens
  useEffect(() => {
    const targetOffset = isTabBarVisible ? 0 : TAB_BAR_HEIGHT;
    dockTranslateY.value = withTiming(targetOffset, {
      duration: 250,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [isTabBarVisible]);

  // ── Download & Hardware Offline Storage State ──
  const [qualityModalVisible, setQualityModalVisible] = useState(false);
  const isDownloaded = useDownloadStore((s) => s.isTrackDownloaded(currentTrack?.videoId));
  const downloadProgress = useDownloadStore((s) => s.getTrackProgress(currentTrack?.videoId));
  const isDownloading = downloadProgress?.status === 'downloading' || downloadProgress?.status === 'probing';

  // ── Dynamic Real Storage Calculation per Track & Quality ──
  const effectiveDurationMs = useMemo(() => {
    if (durationMillis && durationMillis > 1000) return durationMillis;
    if (currentTrack?.duration && currentTrack.duration > 1000) return currentTrack.duration;
    return 210000; // 3:30 fallback
  }, [durationMillis, currentTrack?.duration]);

  const durationSec = Math.max(30, Math.round(effectiveDurationMs / 1000));
  const durationFormatted = useMemo(() => {
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }, [durationSec]);

  // Real formula: (Bitrate kbps * 1000 * seconds) / (8 * 1024 * 1024)
  const autoSizeMB = useMemo(
    () => ((320 * 1000 * durationSec) / (8 * 1024 * 1024)).toFixed(1),
    [durationSec]
  );
  const highSizeMB = useMemo(
    () => ((256 * 1000 * durationSec) / (8 * 1024 * 1024)).toFixed(1),
    [durationSec]
  );
  const mediumSizeMB = useMemo(
    () => ((128 * 1000 * durationSec) / (8 * 1024 * 1024)).toFixed(1),
    [durationSec]
  );

  const handleDownloadPress = () => {
    if (!currentTrack) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isDownloaded) {
      Alert.alert(
        'المقطع محفوظ على الهاتف',
        `تم تنزيل "${currentTrack.title}" في ذاكرة الجهاز وهو متاح بدون إنترنت دائماً وعابر للحسابات.\n\nهل تريد حذفه لتفريغ مساحة الذاكرة؟`,
        [
          { text: 'إغلاق', style: 'cancel' },
          {
            text: 'حذف من الهاتف',
            style: 'destructive',
            onPress: async () => {
              if (currentTrack.videoId) {
                await downloadService.deleteDownloadedTrack(currentTrack.videoId);
                ToastManager.show({
                  title: 'تم حذف المقطع',
                  subtitle: 'تم تفريغ مساحة التخزين على الهاتف',
                  icon: 'trash-outline',
                  duration: 2500,
                });
              }
            },
          },
        ]
      );
    } else {
      setQualityModalVisible(true);
    }
  };

  const startDownloadWithQuality = async (quality: AudioQualityOption) => {
    if (!currentTrack) return;
    setQualityModalVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    ToastManager.show({
      title: 'بدأ تنزيل المقطع',
      subtitle: `جاري الحفظ بجودة ${quality === 'medium' ? '128 kbps' : '320 kbps HD'}`,
      icon: 'arrow-down-circle',
      duration: 2500,
    });

    try {
      await downloadService.downloadTrack(currentTrack, quality);
      ToastManager.show({
        title: 'تم التنزيل بنجاح!',
        subtitle: 'المقطع متاح الآن بدون إنترنت وفي وضع الطيران 0ms',
        icon: 'checkmark-circle',
        duration: 3500,
      });
    } catch (e: any) {
      ToastManager.show({
        title: 'تعذر التنزيل',
        subtitle: e?.message || 'يرجى التحقق من الاتصال والمحاولة لاحقاً',
        icon: 'alert-circle',
        duration: 3500,
      });
    }
  };

  const syncModalState = useCallback(
    (expanded: boolean) => {
      if (isPlayerModalVisible !== expanded) {
        setPlayerModalVisible(expanded);
      }
    },
    [isPlayerModalVisible, setPlayerModalVisible]
  );

  // Sync FullPlayer visibility with useAudioStore isPlayerModalVisible
  useEffect(() => {
    if (isPlayerModalVisible && currentTrack) {
      fullTranslateY.value = withSpring(0, SPRING_CONFIG);
    } else {
      fullTranslateY.value = withSpring(HIDDEN_OFFSET, SPRING_CONFIG);
    }
  }, [isPlayerModalVisible, currentTrack, HIDDEN_OFFSET]);

  const expandToFull = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRenderFullPlayer(true);
    setPlayerModalVisible(true);
    fullTranslateY.value = withSpring(0, SPRING_CONFIG);
  }, [setPlayerModalVisible]);

  const collapseToMini = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fullTranslateY.value = withSpring(HIDDEN_OFFSET, SPRING_CONFIG, (finished) => {
      if (finished) {
        runOnJS(syncModalState)(false);
        runOnJS(setRenderFullPlayer)(false);
      }
    });
  }, [syncModalState, HIDDEN_OFFSET]);

  // ── FullPlayer Downward Pan Dismiss Gesture (Full Viewport Coverage) ──
  const fullPanGesture = Gesture.Pan()
    .activeOffsetY([6, 6])
    .failOffsetX([-18, 18])
    .onStart(() => {
      'worklet';
      fullStartY.value = fullTranslateY.value;
    })
    .onUpdate((event) => {
      'worklet';
      if (event.translationY > 0) {
        fullTranslateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      'worklet';
      if (event.translationY > 100 || event.velocityY > 350) {
        fullTranslateY.value = withSpring(HIDDEN_OFFSET, SPRING_CONFIG, (finished) => {
          if (finished) {
            runOnJS(syncModalState)(false);
            runOnJS(setRenderFullPlayer)(false);
          }
        });
      } else {
        fullTranslateY.value = withSpring(0, SPRING_CONFIG, (finished) => {
          if (finished) {
            runOnJS(syncModalState)(true);
          }
        });
      }
    });

  // ── MiniPlayer Upward Pan Expand Gesture (Continuous 120 FPS Touch Tracking) ──
  const miniPanGesture = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .failOffsetX([-18, 18])
    .onStart(() => {
      'worklet';
      fullStartY.value = fullTranslateY.value;
    })
    .onUpdate((event) => {
      'worklet';
      if (event.translationY < 0) {
        // Dragging UP towards full screen
        const currentY = Math.max(0, HIDDEN_OFFSET + event.translationY * 1.25);
        fullTranslateY.value = currentY;
      }
    })
    .onEnd((event) => {
      'worklet';
      if (event.translationY < -50 || event.velocityY < -300) {
        fullTranslateY.value = withSpring(0, SPRING_CONFIG, (finished) => {
          if (finished) {
            runOnJS(syncModalState)(true);
          }
        });
      } else {
        fullTranslateY.value = withSpring(HIDDEN_OFFSET, SPRING_CONFIG, (finished) => {
          if (finished) {
            runOnJS(syncModalState)(false);
          }
        });
      }
    });

  // ── 120 FPS GPU FullPlayer Animated Style (Hardware Display & Z-Index Guard) ──
  const animatedFullStyle = useAnimatedStyle(() => {
    const isVisible = fullTranslateY.value < (SCREEN_HEIGHT > 0 ? SCREEN_HEIGHT * 0.92 : 750);
    return {
      transform: [{ translateY: fullTranslateY.value }],
      opacity: isVisible ? 1 : 0,
      display: isVisible ? 'flex' : 'none',
      zIndex: isVisible ? 100000 : -1,
    };
  });

  // ── Zero-Unmount 120 FPS GPU MiniPlayer Animated Style ──
  const animatedMiniStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      fullTranslateY.value,
      [0, SCREEN_HEIGHT * 0.35, SCREEN_HEIGHT * 0.85],
      [0, 0.25, 1],
      Extrapolation.CLAMP
    );

    return {
      opacity: progress,
      transform: [
        { translateY: dockTranslateY.value },
        {
          scale: interpolate(
            progress,
            [0, 1],
            [0.92, 1],
            Extrapolation.CLAMP
          ),
        },
      ],
    };
  });

  const tint = useMemo(() => getTrackAtmosphericTint(currentTrack, isDark), [currentTrack, isDark]);

  const handleShare = async () => {
    if (!currentTrack) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({
        title: currentTrack.title,
        message: `Listen to "${currentTrack.title}" by ${currentTrack.artist} on Nouble Running! https://youtube.com/watch?v=${currentTrack.videoId}`,
      });
    } catch (e) {}
  };

  const isAuthScreen = currentRouteName === 'Login' || currentRouteName === 'SignUp';
  if (!session || !currentTrack || isMiniPlayerSuppressed || isWorkoutSummary || isAuthScreen) return null;

  const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.videoId) : false;
  const resolvedArtistAvatar = getUniversalArtistAvatar(
    currentTrack.artistAvatar,
    currentTrack.artist
  );
  // Universal Studio Artwork – zero letterbox, forced 1:1 square
  const heroArtworkUrl = getUniversalStudioArtwork(currentTrack.thumbnail);
  const miniArtworkUrl = getUniversalStudioArtwork(currentTrack.thumbnail);

  // Dynamic Artwork dimension respecting screen height (320 on normal phones, 260 on smaller devices)
  const artworkSize = Math.min(SCREEN_WIDTH - 64, SCREEN_HEIGHT * 0.35, 330);

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* ════════════════════════════════════════════════════════════════════════
          1. FLOATING PILL MINIPLAYER (Zero-Unmount 120 FPS GPU Gliding Pill)
         ════════════════════════════════════════════════════════════════════════ */}
      <Animated.View
        style={[
          styles.miniFloatingContainer,
          {
            bottom: baseMiniBottom,
            backgroundColor: isDark ? 'rgba(20, 24, 32, 0.94)' : 'rgba(255, 255, 255, 0.94)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          },
          animatedMiniStyle,
        ]}
        pointerEvents={isPlayerModalVisible ? 'none' : 'box-none'}
      >
        {/* Glass Frosted Matte Background */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 70 : 45}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <GestureDetector gesture={miniPanGesture}>
          <View style={styles.miniInnerRow} pointerEvents="auto">
            {/* Left Display Area (Tap opens FullPlayer) */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={expandToFull}
              style={styles.miniDisplayArea}
            >
              {/* 42x42 Square Thumbnail – Universal Studio Engine (zero black bars) */}
              <Image
                source={{ uri: miniArtworkUrl || 'https://i.ytimg.com/vi/default/maxresdefault.jpg' }}
                style={styles.miniCover}
                contentFit="cover"
                priority="high"
                cachePolicy="memory-disk"
                transition={150}
              />

              <View style={styles.miniInfo}>
                <Text
                  style={[styles.miniTitle, { color: isDark ? '#FFFFFF' : theme.textPrimary }]}
                  numberOfLines={1}
                >
                  {currentTrack.title || 'Track Title'}
                </Text>
                <View style={styles.miniArtistRow}>
                  <Text
                    style={[styles.miniArtist, { color: isDark ? 'rgba(255,255,255,0.6)' : theme.textMuted }]}
                    numberOfLines={1}
                  >
                    {currentTrack.artist || 'Artist'}
                  </Text>
                  {currentTrack.isOfficial && (
                    <Ionicons name="checkmark-circle" size={12} color="#458eff" style={{ marginLeft: 3 }} />
                  )}
                </View>
              </View>
            </TouchableOpacity>

            {/* Right Isolated Controls */}
            <View style={styles.miniControls}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  togglePlay();
                }}
                style={[styles.miniPlayBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : theme.surfaceSubtle }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={17}
                  color={isDark ? '#FFFFFF' : theme.textPrimary}
                  style={{ marginLeft: isPlaying ? 0 : 1 }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  nextTrack();
                }}
                style={[styles.miniNextBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : theme.surfaceSubtle }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="play-skip-forward" size={15} color={isDark ? '#FFFFFF' : theme.textPrimary} />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  stopTrack();
                }}
                style={styles.miniCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={17} color={isDark ? 'rgba(255,255,255,0.5)' : theme.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Bottom Subtle Progress Bar (Isolated Component) */}
            <MiniProgressBar isDark={isDark} accentColor={theme.textPrimary} />
          </View>
        </GestureDetector>
      </Animated.View>

      {/* ════════════════════════════════════════════════════════════════════════
          2. VIEWPORT-LOCKED FULL PLAYER (Pure GPU Transform, Full Viewport Pan)
         ════════════════════════════════════════════════════════════════════════ */}
      {renderFullPlayer && (
        <Animated.View
          style={[
            styles.fullPlayerOverlay,
            animatedFullStyle,
            {
              backgroundColor: isDark ? tint.bottom : '#F5F4EF',
            },
          ]}
          pointerEvents={isPlayerModalVisible ? 'auto' : 'none'}
        >
        {/* Dynamic Atmospheric Tint Background */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <BlurView
            intensity={Platform.OS === 'ios' ? 65 : 45}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={
              isDark
                ? [tint.top, tint.mid, tint.bottom]
                : ['rgba(245, 245, 240, 0.95)', 'rgba(235, 235, 230, 0.98)', '#F2F1EC']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Viewport-Locked Fixed Content - Full Viewport Swipe-to-Dismiss */}
        <GestureDetector gesture={fullPanGesture}>
          <View
            style={[
              styles.fullFixedContainer,
              {
                paddingTop: Math.max(insets.top, 16),
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            {/* 1. Header Row */}
            <View style={styles.fullHeaderWrap}>
              {/* Grab Bar */}
              <View style={styles.grabBarContainer}>
                <View
                  style={[
                    styles.grabBar,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.22)' },
                  ]}
                />
              </View>

              <View style={styles.fullHeaderRow}>
                <TouchableOpacity
                  onPress={collapseToMini}
                  style={styles.fullHeaderBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="chevron-down" size={28} color={isDark ? '#FFFFFF' : theme.textPrimary} />
                </TouchableOpacity>

                {/* Audio | Video Toggle Pill */}
                <View style={styles.audioVideoPill}>
                  <TouchableOpacity
                    style={[styles.audioVideoSegment, playerMode === 'audio' && styles.audioVideoSegmentActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPlayerMode('audio');
                    }}
                  >
                    <Text
                      style={[
                        styles.audioVideoSegmentText,
                        playerMode === 'audio' && styles.audioVideoSegmentTextActive,
                      ]}
                    >
                      Audio
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.audioVideoSegment, playerMode === 'video' && styles.audioVideoSegmentActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPlayerMode('video');
                    }}
                  >
                    <Text
                      style={[
                        styles.audioVideoSegmentText,
                        playerMode === 'video' && styles.audioVideoSegmentTextActive,
                      ]}
                    >
                      Video
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={handleShare}
                  style={styles.fullHeaderBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="ellipsis-vertical" size={22} color={isDark ? '#FFFFFF' : theme.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* 2. Centered Album Artwork (Square 1:1, Fixed in Flow, Zero Letterbox via artworkHelper) */}
            <View style={styles.artworkCenterWrapper}>
              <Image
                source={{ uri: heroArtworkUrl }}
                style={[styles.heroArtworkImg, { width: artworkSize, height: artworkSize }]}
                contentFit="cover"
                priority="high"
                cachePolicy="memory-disk"
                transition={200}
              />
            </View>

            {/* 3. Track Metadata (Title, Artist, Like Heart) */}
            <View style={styles.metaRow}>
              <View style={styles.metaTextCol}>
                <Text
                  style={[styles.fullTrackTitle, { color: isDark ? '#FFFFFF' : theme.textPrimary }]}
                  numberOfLines={1}
                >
                  {currentTrack.title || 'Track Title'}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    collapseToMini();
                    if (currentTrack.artist) {
                      navigation.navigate('ArtistDetail', { artistName: currentTrack.artist });
                    }
                  }}
                  style={styles.fullArtistRow}
                >
                  <Text
                    style={[
                      styles.fullArtistName,
                      { color: isDark ? 'rgba(255,255,255,0.65)' : theme.textMuted },
                    ]}
                    numberOfLines={1}
                  >
                    {currentTrack.artist || 'Artist'}
                  </Text>
                  {currentTrack.isOfficial && (
                    <Ionicons name="checkmark-circle" size={14} color="#458eff" />
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.metaActionsRow}>
                {/* Download Button */}
                <TouchableOpacity
                  style={styles.fullDownloadBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                  onPress={handleDownloadPress}
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <View style={styles.downloadSpinnerWrap}>
                      <ActivityIndicator size="small" color="#10B981" />
                      <Text style={styles.downloadPctText}>
                        {Math.round((downloadProgress?.progress || 0) * 100)}%
                      </Text>
                    </View>
                  ) : isDownloaded ? (
                    <Ionicons name="checkmark-circle" size={26} color="#10B981" />
                  ) : (
                    <Ionicons
                      name="arrow-down-circle-outline"
                      size={26}
                      color={isDark ? 'rgba(255,255,255,0.7)' : theme.textPrimary}
                    />
                  )}
                </TouchableOpacity>

                {/* Like Button */}
                <TouchableOpacity
                  style={styles.fullLikeBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    toggleLike(currentTrack);
                  }}
                >
                  <Ionicons
                    name={isLiked ? 'heart' : 'heart-outline'}
                    size={26}
                    color={isLiked ? '#1DB954' : isDark ? 'rgba(255,255,255,0.7)' : theme.textPrimary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* 4. High-Precision Scrubber & Timers (Isolated Component) */}
            <PlayerScrubber isDark={isDark} themeMuted={theme.textMuted} />

            {/* 5. Main Playback Controls */}
            <View style={styles.controlsRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, isShuffle && { opacity: 1 }]}
                onPress={toggleShuffle}
                hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
              >
                <Ionicons
                  name="shuffle"
                  size={22}
                  color={isShuffle ? '#1DB954' : isDark ? 'rgba(255,255,255,0.65)' : theme.textMuted}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickSeekBtn}
                onPress={seekBackward10}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name="rewind-10"
                  size={26}
                  color={isDark ? 'rgba(255,255,255,0.85)' : theme.textPrimary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.skipBtn}
                onPress={prevTrack}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              >
                <Ionicons name="play-skip-back" size={28} color={isDark ? '#FFFFFF' : theme.textPrimary} />
              </TouchableOpacity>

              {/* Big Circular Green Play / Pause Button */}
              <TouchableOpacity
                onPress={togglePlay}
                style={styles.fullPlayPauseBtn}
                activeOpacity={0.85}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={34}
                  color="#000000"
                  style={{ marginLeft: isPlaying ? 0 : 3 }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.skipBtn}
                onPress={nextTrack}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              >
                <Ionicons name="play-skip-forward" size={28} color={isDark ? '#FFFFFF' : theme.textPrimary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickSeekBtn}
                onPress={seekForward10}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name="fast-forward-10"
                  size={26}
                  color={isDark ? 'rgba(255,255,255,0.85)' : theme.textPrimary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={toggleRepeat}
                hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
              >
                <View style={{ position: 'relative' }}>
                  <Ionicons
                    name="repeat"
                    size={22}
                    color={repeatMode !== 'off' ? '#1DB954' : isDark ? 'rgba(255,255,255,0.65)' : theme.textMuted}
                  />
                  {repeatMode === 'one' && (
                    <View style={styles.repeatBadge}>
                      <Text style={styles.repeatBadgeText}>1</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {/* 6. Compact Bottom Artist Card Peek (1:1 with Spotify Screenshot 3 & 4) */}
            <TouchableOpacity
              style={[
                styles.compactArtistCard,
                {
                  backgroundColor: isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.65)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                },
              ]}
              activeOpacity={0.85}
              onPress={() => {
                collapseToMini();
                if (currentTrack.artist) {
                  navigation.navigate('ArtistDetail', { artistName: currentTrack.artist });
                }
              }}
            >
              <View style={styles.compactArtistHeader}>
                <Text style={[styles.compactArtistHeaderTitle, { color: isDark ? '#FFFFFF' : theme.textPrimary }]}>
                  Artist
                </Text>
                <Ionicons
                  name="expand-outline"
                  size={16}
                  color={isDark ? 'rgba(255,255,255,0.6)' : theme.textMuted}
                />
              </View>

              <View style={styles.compactArtistBody}>
                {/* Authentic Artist Portrait (Never empty black circle) */}
                <View style={styles.compactArtistAvatarContainer}>
                  <View style={[styles.compactArtistFallbackBadge, { backgroundColor: isDark ? '#2e3a33' : '#e0ece4' }]}>
                    <Text style={[styles.compactArtistFallbackText, { color: isDark ? '#FFFFFF' : '#111b15' }]}>
                      {(currentTrack.artist || 'A').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  {resolvedArtistAvatar ? (
                    <Image
                      source={{ uri: resolvedArtistAvatar }}
                      style={styles.compactArtistAvatar}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : null}
                </View>

                <View style={styles.compactArtistMeta}>
                  <Text
                    style={[styles.compactArtistName, { color: isDark ? '#FFFFFF' : theme.textPrimary }]}
                    numberOfLines={1}
                  >
                    {currentTrack.artist || 'Artist'}
                  </Text>
                  <Text
                    style={[styles.compactArtistSub, { color: isDark ? 'rgba(255,255,255,0.55)' : theme.textMuted }]}
                    numberOfLines={1}
                  >
                    Verified Official Artist
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.followingPill,
                    currentTrack?.artist && followedArtistIds.includes(currentTrack.artist) && styles.followingPillActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    if (currentTrack.artist) {
                      toggleFollowArtist({
                        id: currentTrack.artist,
                        name: currentTrack.artist,
                        avatar: resolvedArtistAvatar,
                      });
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.followingPillText,
                      currentTrack?.artist && followedArtistIds.includes(currentTrack.artist) && styles.followingPillTextActive,
                    ]}
                  >
                    {currentTrack?.artist && followedArtistIds.includes(currentTrack.artist) ? 'Following' : '+ Follow'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </View>
        </GestureDetector>
        {/* ════════════════════════════════════════════════════════════════════════
            Audio Quality Selection Modal (Auto / High 320k / Normal 128k)
           ════════════════════════════════════════════════════════════════════════ */}
        <Modal
          visible={qualityModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setQualityModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.qualityModalBackdrop}
            activeOpacity={1}
            onPress={() => setQualityModalVisible(false)}
          >
            <View style={styles.qualityModalCard}>
              <View style={styles.qualityModalHeader}>
                <View style={styles.qualityModalIndicator} />
                <Text style={[styles.qualityModalTitle, { color: isDark ? '#FFF' : theme.textPrimary }]}>
                  جودة التنزيل
                </Text>
                <Text style={styles.qualityModalSub}>
                  اختر جودة الصوت لحفظ المقطع في ذاكرة الهاتف
                </Text>
              </View>

              {/* Track Preview Pill */}
              {currentTrack && (
                <View style={styles.qualityTrackPill}>
                  {heroArtworkUrl ? (
                    <Image
                      source={{ uri: heroArtworkUrl }}
                      style={styles.qualityTrackThumb}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : (
                    <View style={styles.qualityTrackThumbFallback}>
                      <Ionicons name="musical-notes" size={16} color="#1DB954" />
                    </View>
                  )}
                  <View style={styles.qualityTrackMeta}>
                    <Text style={styles.qualityTrackTitle} numberOfLines={1}>
                      {currentTrack.title || 'Track'}
                    </Text>
                    <Text style={styles.qualityTrackArtist} numberOfLines={1}>
                      {currentTrack.artist || 'Artist'}
                    </Text>
                  </View>
                  <View style={styles.qualityDurationBadge}>
                    <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.7)" style={{ marginRight: 3 }} />
                    <Text style={styles.qualityDurationText}>{durationFormatted}</Text>
                  </View>
                </View>
              )}

              {/* Option 1: Auto (320 kbps MP3 Studio) */}
              <TouchableOpacity
                style={styles.qualityOptionItem}
                activeOpacity={0.75}
                onPress={() => startDownloadWithQuality('auto')}
              >
                <View style={[styles.qualityIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Ionicons name="flash" size={20} color="#10B981" />
                </View>
                <View style={styles.qualityOptionTexts}>
                  <View style={styles.qualityOptionTitleRow}>
                    <Text style={[styles.qualityOptionTitle, { color: isDark ? '#FFF' : theme.textPrimary }]}>
                      تلقائي (Auto)
                    </Text>
                    <View style={styles.recommendedBadge}>
                      <Text style={styles.recommendedBadgeText}>موصى به</Text>
                    </View>
                  </View>
                  <Text style={styles.qualityOptionFormat}>MP3 • 320 kbps Studio</Text>
                </View>
                <View style={styles.qualitySizeBadge}>
                  <Ionicons name="save-outline" size={12} color="#10B981" style={{ marginRight: 4 }} />
                  <Text style={styles.qualitySizeBadgeText}>{autoSizeMB} MB</Text>
                </View>
              </TouchableOpacity>

              {/* Option 2: Studio High (256 kbps M4A / AAC HD) */}
              <TouchableOpacity
                style={styles.qualityOptionItem}
                activeOpacity={0.75}
                onPress={() => startDownloadWithQuality('high')}
              >
                <View style={[styles.qualityIconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                  <Ionicons name="headset" size={20} color="#3B82F6" />
                </View>
                <View style={styles.qualityOptionTexts}>
                  <View style={styles.qualityOptionTitleRow}>
                    <Text style={[styles.qualityOptionTitle, { color: isDark ? '#FFF' : theme.textPrimary }]}>
                      نقاء استوديو (Studio)
                    </Text>
                    <View style={[styles.recommendedBadge, styles.badgeBlue]}>
                      <Text style={[styles.recommendedBadgeText, { color: '#3B82F6' }]}>AAC HD</Text>
                    </View>
                  </View>
                  <Text style={styles.qualityOptionFormat}>M4A • 256 kbps Crystal</Text>
                </View>
                <View style={[styles.qualitySizeBadge, styles.qualitySizeBadgeBlue]}>
                  <Ionicons name="save-outline" size={12} color="#3B82F6" style={{ marginRight: 4 }} />
                  <Text style={[styles.qualitySizeBadgeText, { color: '#3B82F6' }]}>{highSizeMB} MB</Text>
                </View>
              </TouchableOpacity>

              {/* Option 3: Normal / Medium (128 kbps Saver) */}
              <TouchableOpacity
                style={styles.qualityOptionItem}
                activeOpacity={0.75}
                onPress={() => startDownloadWithQuality('medium')}
              >
                <View style={[styles.qualityIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                  <Ionicons name="phone-portrait-outline" size={20} color="#F59E0B" />
                </View>
                <View style={styles.qualityOptionTexts}>
                  <View style={styles.qualityOptionTitleRow}>
                    <Text style={[styles.qualityOptionTitle, { color: isDark ? '#FFF' : theme.textPrimary }]}>
                      موفر المساحة (Saver)
                    </Text>
                    <View style={[styles.recommendedBadge, styles.badgeAmber]}>
                      <Text style={[styles.recommendedBadgeText, { color: '#F59E0B' }]}>توفير 60%</Text>
                    </View>
                  </View>
                  <Text style={styles.qualityOptionFormat}>MP3 • 128 kbps</Text>
                </View>
                <View style={[styles.qualitySizeBadge, styles.qualitySizeBadgeAmber]}>
                  <Ionicons name="save-outline" size={12} color="#F59E0B" style={{ marginRight: 4 }} />
                  <Text style={[styles.qualitySizeBadgeText, { color: '#F59E0B' }]}>{mediumSizeMB} MB</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.qualityCancelBtn}
                activeOpacity={0.7}
                onPress={() => setQualityModalVisible(false)}
              >
                <Text style={styles.qualityCancelText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      </Animated.View>
      )}
    </GestureHandlerRootView>
  );
});

const styles = StyleSheet.create({
  // ── MiniPlayer Floating Capsule ──
  miniFloatingContainer: {
    position: 'absolute',
    left: MINI_MARGIN_H,
    right: MINI_MARGIN_H,
    height: MINI_PLAYER_HEIGHT,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 99999,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 10,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  miniInnerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: '100%',
  },
  miniDisplayArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingRight: 8,
  },
  miniCover: {
    width: 42,
    height: 42,
    borderRadius: 8,
  },
  miniInfo: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },
  miniTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  miniArtistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  miniArtist: {
    fontSize: 12,
    fontWeight: '500',
  },
  miniControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 2,
  },
  miniPlayBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  miniNextBtn: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 15,
  },
  miniCloseBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniProgressBg: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  miniProgressFill: {
    height: '100%',
  },

  // ── Viewport-Locked FullPlayer ──
  fullPlayerOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100000,
  },
  fullFixedContainer: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  fullHeaderWrap: {
    paddingBottom: 4,
  },
  grabBarContainer: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
  grabBar: {
    width: 36,
    height: 4.5,
    borderRadius: 2.5,
  },
  fullHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 44,
  },
  fullHeaderBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioVideoPill: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  audioVideoSegment: {
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 16,
  },
  audioVideoSegmentActive: {
    backgroundColor: '#1DB954',
  },
  audioVideoSegmentText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '700',
  },
  audioVideoSegmentTextActive: {
    color: '#000000',
  },

  // Centered Artwork (Square 1:1)
  artworkCenterWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  heroArtworkImg: {
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 18,
      },
      android: {
        elevation: 12,
      },
    }),
  },

  // Metadata Row
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  metaTextCol: {
    flex: 1,
    marginRight: 16,
  },
  fullTrackTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  fullArtistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  fullArtistName: {
    fontSize: 14,
    fontWeight: '600',
  },
  fullLikeBtn: {
    padding: 4,
  },
  metaActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fullDownloadBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadSpinnerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadPctText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#10B981',
    marginTop: 2,
  },
  // Quality Selection Modal (Apple Liquid Glass)
  qualityModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  qualityModalCard: {
    backgroundColor: '#161B22',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  qualityModalHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  qualityModalIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 10,
  },
  qualityModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 3,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  qualityModalSub: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.55)',
    textAlign: 'center',
  },
  qualityTrackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  qualityTrackThumb: {
    width: 38,
    height: 38,
    borderRadius: 8,
  },
  qualityTrackThumbFallback: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qualityTrackMeta: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  qualityTrackTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  qualityTrackArtist: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.55)',
    marginTop: 1,
  },
  qualityDurationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  qualityDurationText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  qualityOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginBottom: 9,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  qualityIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  qualityOptionTexts: {
    flex: 1,
  },
  qualityOptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  qualityOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  qualityOptionFormat: {
    fontSize: 11.5,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
  recommendedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  recommendedBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#10B981',
  },
  badgeBlue: {
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
    borderColor: 'rgba(59, 130, 246, 0.35)',
  },
  badgeAmber: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  qualitySizeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    marginLeft: 8,
  },
  qualitySizeBadgeBlue: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  qualitySizeBadgeAmber: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  qualitySizeBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#10B981',
  },
  qualityCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
    borderRadius: 12,
  },
  qualityCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.45)',
  },

  // Scrubber
  scrubberContainer: {
    marginVertical: 2,
  },
  slider: {
    width: '100%',
    height: 32,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: -4,
  },
  timeText: {
    fontSize: 11.5,
    fontWeight: '600',
  },

  // Controls Row
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginVertical: 4,
  },
  secondaryBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickSeekBtn: {
    width: 38,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipBtn: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullPlayPauseBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1DB954',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#1DB954',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  repeatBadge: {
    position: 'absolute',
    top: -3,
    right: -5,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatBadgeText: {
    color: '#000',
    fontSize: 8,
    fontWeight: '900',
  },

  // Compact Artist Peek Card (1:1 with Spotify Screenshot 3 & 4)
  compactArtistCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  compactArtistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  compactArtistHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  compactArtistBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactArtistAvatarContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    position: 'relative',
  },
  compactArtistFallbackBadge: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactArtistFallbackText: {
    fontSize: 20,
    fontWeight: '800',
  },
  compactArtistAvatar: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  compactArtistMeta: {
    flex: 1,
    marginLeft: 12,
  },
  compactArtistName: {
    fontSize: 16,
    fontWeight: '800',
  },
  compactArtistSub: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  followingPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: '#1DB954',
  },
  followingPillActive: {
    backgroundColor: '#1DB954',
  },
  followingPillText: {
    color: '#1DB954',
    fontSize: 12,
    fontWeight: '700',
  },
  followingPillTextActive: {
    color: '#000000',
  },
});

export default UnifiedPlayerSheet;
