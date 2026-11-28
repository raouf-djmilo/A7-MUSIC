import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  useWindowDimensions,
  Platform,
  Share,
  Alert,
  NativeModules,
} from 'react-native';
import { Image } from 'expo-image';
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
import { useAudioStore, Track, getLastUserToggleTimestamp, setLastUserToggleTimestamp } from '../store/useAudioStore';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../providers/AuthProvider';
import {
  getUniversalStudioArtwork,
  getUniversalStudioArtworkSource,
  getUniversalArtistAvatar,
  STUDIO_IMAGE_PROPS,
} from '../utils/artworkHelper';
import {
  useDownloadStore,
  downloadService,
  resolveDownloadedMediaMode,
  type DownloadMediaMode,
} from '../services/downloadService';
import { nativeAudioService } from '../services/nativeAudioService';
import { DownloadOptionsModal } from '../features/downloads/components/DownloadOptionsModal';
import { OfflineVideoStage } from '../features/player/components/OfflineVideoStage';
import { useNetworkStore } from '../services/networkService';
import { isNativeLiquidTabsAvailable } from '../navigation/navigationConfig';
import { LiquidGlassSurface } from './LiquidGlassSurface';
import { MarqueeText } from './MarqueeText';
import { CircularDownloadProgress } from './CircularDownloadProgress';
import { PlayerArtworkStage } from '../features/player/components/PlayerArtworkStage';
import { AppleTimelineScrubber } from '../features/player/components/AppleTimelineScrubber';
import { FullscreenVideoModal } from '../features/player/components/FullscreenVideoModal';
import { InPlaceFullscreenHud } from '../features/player/components/InPlaceFullscreenHud';
import { TrackOptionsModal } from '../features/player/components/TrackOptionsModal';
import { YoutubeAudioEngine } from '../features/player/engines/YoutubeAudioEngine';
import { ToastManager } from './InAppToast';
import { playerModalTranslateY, PLAYER_SPRING_CONFIG, DEFAULT_HIDDEN_OFFSET } from '../utils/playerMotion';
import {
  cleanArtistForLockScreen,
  getActivePlayerBridge,
  isVideoUnembeddable,
  pauseSilentBackgroundKeepAlive,
  prepareNativeEngineForYouTube,
  startSilentBackgroundKeepAlive,
} from '../services/audioSessionService';
import { useLanguageStore } from '../store/useLanguageStore';
import { resolveTrackAlbumAsync } from '../services/youtubeMusicService';
import {
  getFirebasePlaylists,
  addTrackToFirebasePlaylist,
  UserPlaylist,
} from '../services/firebaseMusicDb';
import { navigationRef } from '../navigation/navigationService';
import { AtmosphericPalette, getTrackAtmosphericTint } from '../services/atmosphericColorEngine';
export { AtmosphericPalette, getTrackAtmosphericTint };

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// ── Docking & Layout Constants ──
const TAB_BAR_HEIGHT = 56;
const MINI_PLAYER_HEIGHT = 50;
const COMPACT_DOCK_HEIGHT = 46;
const DOCK_CIRCLE_SIZE = 46;
const DOCK_MARGIN = 10;
const MINI_MARGIN_H = 14;

// ── Optimal Snappy 120 FPS Spring Configuration (Zero Sluggish Lag) ──
const SPRING_CONFIG = {
  damping: 32,
  stiffness: 420,
  mass: 0.65,
};

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
  accentColor?: string;
}

const MiniProgressBar: React.FC<MiniProgressBarProps> = React.memo(({ isDark }) => {
  const positionMillis = useAudioStore((s) => s.positionMillis);
  const durationMillis = useAudioStore((s) => s.durationMillis);
  const trackDuration = useAudioStore((s) => s.currentTrack?.duration || 180000);

  const validDuration = durationMillis > 0 ? durationMillis : trackDuration;
  const progressPercent = Math.min(100, Math.max(0, (positionMillis / validDuration) * 100));

  const progressColor = isDark ? '#FFFFFF' : '#1C1C1E';

  return (
    <View
      style={[
        styles.miniProgressBg,
        { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)' },
      ]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.miniProgressFill,
          {
            width: `${progressPercent}%`,
            backgroundColor: progressColor,
            shadowColor: isDark ? '#FFFFFF' : '#000000',
            shadowOpacity: isDark ? 0.60 : 0.20,
            shadowRadius: 4,
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
  accentColor?: string;
  onSeek?: (millis: number) => void;
  onScrubbingChange?: (isScrubbing: boolean) => void;
}

const PlayerScrubber: React.FC<PlayerScrubberProps> = React.memo(({ isDark, themeMuted, accentColor = '#1DB954', onSeek, onScrubbingChange }) => {
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
          onScrubbingChange?.(true);
        }}
        onValueChange={(val) => {
          setIsScrubbing(true);
          setScrubValue(val);
        }}
        onSlidingComplete={async (val) => {
          setIsScrubbing(false);
          onScrubbingChange?.(false);
          Haptics.selectionAsync();
          if (onSeek) {
            onSeek(val);
          } else {
            await seekTo(val);
          }
        }}
        minimumTrackTintColor={isDark ? '#FFFFFF' : '#111111'}
        maximumTrackTintColor={isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(0, 0, 0, 0.12)'}
        thumbTintColor={isDark ? '#FFFFFF' : '#111111'}
      />
      <View style={styles.timeRow}>
        <Text style={[styles.timeText, { color: isDark ? 'rgba(255, 255, 255, 0.65)' : themeMuted }]}>
          {formatTime(displayPosition)}
        </Text>
        <Text style={[styles.timeText, { color: isDark ? 'rgba(255, 255, 255, 0.65)' : themeMuted }]}>
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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isDeviceLandscape = windowWidth > windowHeight;
  const fullscreenVideoDims = isDeviceLandscape
    ? {
      width: windowWidth,
      height: windowHeight,
    }
    : {
      width: windowWidth,
      height: Math.round((windowWidth * 9) / 16),
    };

  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const { user, session } = useAuth();
  const language = useLanguageStore((s) => s.language);
  const isAr = language === 'ar';

  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const nextTrack = useAudioStore((s) => s.nextTrack);
  const prevTrack = useAudioStore((s) => s.prevTrack);
  const stopTrack = useAudioStore((s) => s.stopTrack);
  const likedTrackIds = useAudioStore((s) => s.likedTrackIds);
  const toggleLike = useAudioStore((s) => s.toggleLike);
  const savedLibraryTrackIds = useAudioStore((s) => s.savedLibraryTrackIds);
  const toggleSaveTrackToLibrary = useAudioStore((s) => s.toggleSaveTrackToLibrary);
  const isDockMinimized = useAudioStore((s) => s.isDockMinimized);
  const currentContextName = useAudioStore((s) => s.currentContextName);
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
  const playerMediaMode = useAudioStore((s) => s.playerMediaMode);
  const setPlayerMediaMode = useAudioStore((s) => s.setPlayerMediaMode);
  const videoAspectMode = useAudioStore((s) => s.videoAspectMode);
  const setVideoAspectMode = useAudioStore((s) => s.setVideoAspectMode);
  const isVideoFullscreen = useAudioStore((s) => s.isVideoFullscreen);
  const setVideoFullscreen = useAudioStore((s) => s.setVideoFullscreen);
  const activeEngine = useAudioStore((s) => s.activeEngine);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const downloadedTracks = useDownloadStore((s) => s.downloadedTracks);
  const currentDownloadedTrack = useMemo(
    () => (currentTrack?.videoId ? downloadedTracks.find((d) => d.videoId === currentTrack.videoId) : undefined),
    [downloadedTracks, currentTrack?.videoId]
  );
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const mediaContainerRef = useRef<any>(null);
  const [isScrubbingFullscreen, setIsScrubbingFullscreen] = useState(false);

  const cardWidth = Math.min(windowWidth - 48, windowHeight * 0.39, 360);
  const cardVideoHeight = Math.round((cardWidth * 9) / 16);
  const normalVideoLeft = Math.round((windowWidth - cardWidth) / 2);
  const [normalStageTop, setNormalStageTop] = useState(Math.max(insets.top, 16) + 68);
  const isVideoFullscreenSV = useSharedValue(false);
  useEffect(() => {
    isVideoFullscreenSV.value = isVideoFullscreen;
  }, [isVideoFullscreen]);

  const durationMillis = useAudioStore((s) => s.durationMillis);
  const seekTo = useAudioStore((s) => s.seekTo);

  const handleScrubberSeek = useCallback(async (millis: number) => {
    await seekTo(millis);
  }, [seekTo]);

  const renderFullscreenTimeline = useCallback(
    () => (
      <AppleTimelineScrubber
        onSeekCommit={handleScrubberSeek}
        isDark={true}
        themeMuted="rgba(255,255,255,0.6)"
        onScrubbingStateChange={setIsScrubbingFullscreen}
      />
    ),
    [handleScrubberSeek]
  );

  const seekBackward10 = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const pos = useAudioStore.getState().positionMillis;
    const target = Math.max(0, pos - 10000);
    await seekTo(target);
  }, [seekTo]);

  const seekForward10 = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { positionMillis: pos, durationMillis: dur, currentTrack: track } = useAudioStore.getState();
    const validDuration = dur > 0 ? dur : (track?.duration || 180000);
    const target = Math.min(validDuration, pos + 10000);
    await seekTo(target);
  }, [seekTo]);

  // ── Unified Play / Pause Action (Single Source of Truth in useAudioStore) ──
  const handlePlayPausePress = useCallback(async () => {
    await togglePlay();
  }, [togglePlay]);

  // ── Unified Next / Prev Handlers ──
  const handleNextPress = useCallback(async () => {
    await nextTrack();
  }, [nextTrack]);

  const handlePrevPress = useCallback(async () => {
    await prevTrack();
  }, [prevTrack]);

  // ── Navigation-Aware Docking Guard ──
  const TAB_BAR_SCREENS = [
    'DashboardTab',
    'Dashboard',
    'MusicTab',
    'SearchTab',
    'LibraryTab',
    'MusicHome',
    'MusicSearch',
    'MusicLibrary',
    'ProfileTab',
    'Profile',
    'Tabs',
  ];
  const isTabBarVisible = !currentRouteName || TAB_BAR_SCREENS.includes(currentRouteName);

  // ── Navigation Change Guard ──
  const prevRouteRef = React.useRef(currentRouteName);
  useEffect(() => {
    if (prevRouteRef.current && prevRouteRef.current !== currentRouteName) {
      if (isPlayerModalVisible) {
        setPlayerModalVisible(false);
      }
    }
    prevRouteRef.current = currentRouteName;
  }, [currentRouteName, isPlayerModalVisible, setPlayerModalVisible]);

  // ── Precise Dynamic Geometry Offsets (Apple Music Standard) ──
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 16 : 10);
  const tabBarTop = Math.max(insets.bottom + 6, 22) + 60;
  const useNativeTabs = isNativeLiquidTabsAvailable();
  const baseMiniBottom = useNativeTabs
    ? (Platform.OS === 'ios' ? Math.max(insets.bottom + 49 + 12, 95) : 95)
    : tabBarTop + 8; // Exactly 8px safety clearance above tab bar
  const stackDockBottom = Math.max(insets.bottom + 8, 22);
  const HIDDEN_OFFSET = DEFAULT_HIDDEN_OFFSET;

  // ── UI-Thread Shared Values (GPU Transform Only) ──
  // playerModalTranslateY coordinates both the player sheet and the GlobalAudioBridge video in 120 FPS hardware lockstep
  const fullTranslateY = playerModalTranslateY;
  const fullStartY = useSharedValue(0);
  const shouldDockAtBottom = !isTabBarVisible || isDockMinimized;
  const dockTranslateY = useSharedValue(
    shouldDockAtBottom ? Math.max(0, baseMiniBottom - stackDockBottom) : 0
  );
  const miniDockMorph = useSharedValue(isDockMinimized ? 1 : 0);
  const isScrubbingTimeline = useSharedValue(false);

  // Smooth segmented control indicator with Apple spring physics (0 = Cover, 1 = Video)
  const modeTranslate = useSharedValue(playerMediaMode === 'video' ? 1 : 0);
  useEffect(() => {
    modeTranslate.value = withSpring(playerMediaMode === 'video' ? 1 : 0, {
      stiffness: 280,
      damping: 26,
      mass: 0.8,
    });
  }, [playerMediaMode]);

  // 120 FPS hardware-accelerated sliding indicator style (Pure smooth glide, zero bounce)
  const slidingIndicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: modeTranslate.value * 99 }],
    };
  });

  // ── Intelligent Seamless Timeline Switchers (Music ◄──► Video) ──
  const handleSwitchToCover = useCallback(async () => {
    Haptics.selectionAsync();
    setLastUserToggleTimestamp(Date.now());

    modeTranslate.value = withSpring(0, {
      stiffness: 280,
      damping: 26,
      mass: 0.8,
    });

    const latest = useAudioStore.getState();
    const trk = latest.currentTrack;
    const onlineNow = useNetworkStore.getState().isOnline;
    const localRecord = trk?.videoId ? await downloadService.getLocalTrack(trk.videoId).catch(() => null) : null;
    const localMode = localRecord ? resolveDownloadedMediaMode(localRecord) : trk?.offlineMode;

    // Video-Only offline track: switching to Music prompts user to download Music Audio
    if (!onlineNow && localMode === 'video' && !localRecord?.audioLocalUri) {
      if (latest.isPlaying) {
        latest.pauseTrack();
      }
      setPlayerMediaMode('cover');
      return;
    }

    // Expo Go Full offline track: only swap if audio URI differs from active video player URI
    if (
      localRecord?.audioLocalUri &&
      latest.activeEngine === 'native' &&
      !NativeModules.TrackPlayerModule &&
      nativeAudioService.getCurrentUri() !== localRecord.audioLocalUri
    ) {
      const posSec = Math.max(0, (latest.positionMillis || 0) / 1000);
      await nativeAudioService
        .swapMediaUri(localRecord.audioLocalUri, posSec, latest.isPlaying, {
          title: trk?.title || 'Track',
          artist: cleanArtistForLockScreen(trk?.artist),
          artwork: localRecord.artworkLocalUri || trk?.thumbnail || undefined,
        })
        .catch(() => {});
    } else if (
      onlineNow &&
      trk?.videoId &&
      latest.activeEngine === 'native' &&
      !localRecord?.audioLocalUri &&
      localMode === 'video'
    ) {
      // Online Video-Only track: allow switching to online YouTube stream cleanly for Music
      const posSec = Math.max(0, Math.floor(latest.positionMillis / 1000));
      nativeAudioService.stop().catch(() => {});
      await prepareNativeEngineForYouTube();
      if (latest.backgroundAudioEnabled) {
        startSilentBackgroundKeepAlive().catch(() => {});
      }
      const bridge = getActivePlayerBridge();
      bridge?.loadVideo?.(trk.videoId, posSec, latest.isPlaying, {
        videoId: trk.videoId,
        title: trk.title || 'A7 MUSIC',
        artist: cleanArtistForLockScreen(trk.artist),
        artworkUrl: getUniversalStudioArtwork(trk.thumbnail, trk.title, trk.artist, trk.videoId),
        durationSec: trk.duration ? Math.floor(trk.duration / 1000) : undefined,
      });
      useAudioStore.setState({
        activeEngine: 'youtube',
        isOfflinePlayback: false,
      });
    }

    setPlayerMediaMode('cover');
  }, [setPlayerMediaMode]);

  const handleSwitchToVideo = useCallback(async () => {
    Haptics.selectionAsync();
    setLastUserToggleTimestamp(Date.now());

    modeTranslate.value = withSpring(1, {
      stiffness: 280,
      damping: 26,
      mass: 0.8,
    });

    const latest = useAudioStore.getState();
    const trk = latest.currentTrack;
    const onlineNow = useNetworkStore.getState().isOnline;
    const localRecord = trk?.videoId ? await downloadService.getLocalTrack(trk.videoId).catch(() => null) : null;

    // 1. Offline / Local Video Ready ('video' or 'full'): switch to OfflineVideoStage with zero network request
    if (localRecord?.videoLocalUri && trk) {
      const posSec = Math.max(0, (latest.positionMillis || 0) / 1000);
      if (latest.activeEngine === 'youtube') {
        getActivePlayerBridge()?.pause?.();
        pauseSilentBackgroundKeepAlive();
      }
      useAudioStore.setState({
        activeEngine: 'native',
        isOfflinePlayback: true,
        currentTrack: {
          ...trk,
          audioUrl: localRecord.audioLocalUri || localRecord.videoLocalUri,
          videoUrl: localRecord.videoLocalUri,
          offlineMode: resolveDownloadedMediaMode(localRecord),
        },
      });
      if (!NativeModules.TrackPlayerModule && nativeAudioService.getCurrentUri() !== localRecord.videoLocalUri) {
        await nativeAudioService
          .swapMediaUri(localRecord.videoLocalUri, posSec, latest.isPlaying, {
            title: trk.title || 'Track',
            artist: cleanArtistForLockScreen(trk.artist),
            artwork: localRecord.artworkLocalUri || trk.thumbnail || undefined,
          })
          .catch(() => {});
      }
      setPlayerMediaMode('video');
      return;
    }

    // 2. Offline & NO Video Downloaded ('audio' only): keep audio playing cleanly & show "Video Not Downloaded" card
    if (!onlineNow) {
      setPlayerMediaMode('video');
      return;
    }

    // 3. Online: seamless handover to YouTube embed video
    if (
      trk?.videoId &&
      latest.activeEngine === 'native' &&
      !isVideoUnembeddable(trk.videoId)
    ) {
      const posSec = Math.max(0, Math.floor(latest.positionMillis / 1000));
      await prepareNativeEngineForYouTube();
      if (latest.backgroundAudioEnabled) {
        startSilentBackgroundKeepAlive().catch(() => {});
      }
      const bridge = getActivePlayerBridge();
      bridge?.loadVideo?.(trk.videoId, posSec, latest.isPlaying, {
        videoId: trk.videoId,
        title: trk.title || 'A7 MUSIC',
        artist: cleanArtistForLockScreen(trk.artist),
        artworkUrl: getUniversalStudioArtwork(trk.thumbnail, trk.title, trk.artist, trk.videoId),
        durationSec: trk.duration ? Math.floor(trk.duration / 1000) : undefined,
      });
      useAudioStore.setState({
        activeEngine: 'youtube',
        audioEngineAction: bridge?.loadVideo ? null : { type: 'play', videoId: trk.videoId, position: posSec, id: Date.now() },
      });
    }

    setPlayerMediaMode('video');
  }, [setPlayerMediaMode]);

  // Smooth 220ms glide synchronized with native tab bar minimize/show across Tabs & Stack screens
  useEffect(() => {
    const targetOffset = shouldDockAtBottom ? Math.max(0, baseMiniBottom - stackDockBottom) : 0;
    dockTranslateY.value = withTiming(targetOffset, {
      duration: 220,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [shouldDockAtBottom, baseMiniBottom, stackDockBottom]);

  // Smooth spring morph into slim [Home Circle] [MiniPlayer] [Search Circle] whenever scrolled down or at bottom
  const isCompactDockActive = isDockMinimized;
  useEffect(() => {
    miniDockMorph.value = withSpring(isCompactDockActive ? 1 : 0, {
      stiffness: 360,
      damping: 30,
      mass: 0.7,
    });
  }, [isCompactDockActive]);

// ── Player Action Menu (... Liquid Glass Sheet) & Album Resolution State ──
const [trackMenuVisible, setTrackMenuVisible] = useState(false);
const [resolvingAlbum, setResolvingAlbum] = useState(false);
const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>([]);
const [loadingPlaylists, setLoadingPlaylists] = useState(false);
const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);

// ── Download & Hardware Offline Storage State ──
const isDownloaded = useDownloadStore((s) => s.isTrackDownloaded(currentTrack?.videoId));
const downloadProgress = useDownloadStore((s) => s.getTrackProgress(currentTrack?.videoId));
const isDownloading = downloadProgress?.status === 'downloading' || downloadProgress?.status === 'probing';
const downloadPct = Math.round((downloadProgress?.progress || 0) * 100);

const startDirectDownload = useCallback(async (trackToSave: Track, mode: DownloadMediaMode = 'audio') => {
  if (!trackToSave) return;
  if (!useNetworkStore.getState().isOnline) {
    ToastManager.show({
      title: isAr ? 'أنت في وضع الأوفلاين' : 'Offline Mode',
      subtitle: isAr
        ? 'يرجى الاتصال بالإنترنت لتحميل المقطع على هاتفك'
        : 'Connect to the internet to download this track',
      icon: 'cloud-offline-outline',
      duration: 2800,
    });
    return;
  }

  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  const modeToast =
    mode === 'full'
      ? isAr
        ? 'جاري تحميل الموسيقى + الفيديو + الغلاف بجودة عالية...'
        : 'Downloading Full Music (Audio + Video + HD Cover)...'
      : mode === 'video'
        ? isAr
          ? 'جاري تحميل الفيديو بجودة عالية مع الغلاف...'
          : 'Downloading Video Only + HD Cover...'
        : isAr
          ? 'جاري تحميل الموسيقى بنفس الجودة الأصلية...'
          : 'Downloading studio Music Audio + HD Cover...';

  ToastManager.show({
    title: isAr ? 'بدأ التحميل' : 'Downloading',
    subtitle: modeToast,
    icon: 'arrow-down-circle',
    duration: 2500,
  });

  try {
    const saved = await downloadService.downloadTrack(trackToSave, { mode, quality: 'auto' });
    const curState = useAudioStore.getState();
    if (curState.currentTrack?.videoId === saved.videoId) {
      useAudioStore.setState({
        currentTrack: {
          ...curState.currentTrack,
          audioUrl: saved.audioLocalUri || curState.currentTrack.audioUrl,
          videoUrl: saved.videoLocalUri || curState.currentTrack.videoUrl,
          offlineMode: resolveDownloadedMediaMode(saved),
          thumbnail: saved.artworkLocalUri || curState.currentTrack.thumbnail,
        },
      });
    }
    ToastManager.show({
      title: isAr ? 'تم التنزيل بنجاح!' : 'Downloaded!',
      subtitle:
        saved.mediaType === 'full'
          ? isAr
            ? 'الموسيقى + الفيديو جاهزان للتشغيل أوفلاين'
            : 'Music + Video saved for seamless offline playback'
          : saved.mediaType === 'video'
            ? isAr
              ? 'تم حفظ الفيديو أوفلاين في قسم الفيديو'
              : 'Video saved offline for Video mode playback'
            : isAr
              ? 'الموسيقى الصوتية جاهزة للتشغيل بدون إنترنت'
              : 'Music Audio saved in Downloads for offline playback',
      icon: 'checkmark-circle',
      duration: 3200,
    });
  } catch (e: any) {
    ToastManager.show({
      title: isAr ? 'تعذر التنزيل' : 'Download Failed',
      subtitle: e?.message || (isAr ? 'يرجى المحاولة مجدداً' : 'Please try again'),
      icon: 'alert-circle',
      duration: 3200,
    });
  }
}, [isAr]);

const handleRemoveDownload = useCallback(async (removeMode: 'audio' | 'video' | 'all') => {
  if (!currentTrack?.videoId) return;
  const ok = await downloadService.deleteDownloadedTrack(currentTrack.videoId, removeMode);
  if (!ok) return;
  const remaining = await downloadService.getLocalTrack(currentTrack.videoId).catch(() => null);
  const curState = useAudioStore.getState();
  if (curState.currentTrack?.videoId === currentTrack.videoId) {
    if (removeMode === 'video' && curState.playerMediaMode === 'video') {
      curState.setVideoFullscreen(false);
      curState.setPlayerMediaMode('cover');
    }
    if (
      removeMode === 'video' &&
      remaining?.audioLocalUri &&
      !NativeModules.TrackPlayerModule &&
      nativeAudioService.getCurrentUri() !== remaining.audioLocalUri
    ) {
      await nativeAudioService
        .swapMediaUri(
          remaining.audioLocalUri,
          Math.max(0, (curState.positionMillis || 0) / 1000),
          curState.isPlaying,
          {
            title: curState.currentTrack.title || 'Track',
            artist: cleanArtistForLockScreen(curState.currentTrack.artist),
            artwork: remaining.artworkLocalUri || curState.currentTrack.thumbnail || undefined,
          }
        )
        .catch(() => {});
    }
    useAudioStore.setState({
      currentTrack: {
        ...curState.currentTrack,
        audioUrl: remaining?.audioLocalUri || undefined,
        videoUrl: remaining?.videoLocalUri || undefined,
        offlineMode: remaining ? resolveDownloadedMediaMode(remaining) : undefined,
      },
    });
  }
  ToastManager.show({
    title: isAr ? 'تم التحديث' : 'Download Updated',
    subtitle:
      removeMode === 'video'
        ? isAr
          ? 'تم حذف الفيديو مع الإبقاء على الموسيقى'
          : 'Removed Video • Kept Music Audio'
        : isAr
          ? 'تم حذف التحميل من الهاتف'
          : 'Removed from device storage',
    icon: 'trash-outline',
    duration: 2400,
  });
}, [currentTrack?.videoId, isAr]);

const handleDownloadPress = useCallback(() => {
  if (!currentTrack || isDownloading) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  setDownloadModalVisible(true);
}, [currentTrack, isDownloading]);

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
  // Start 120 FPS UI-thread spring IMMEDIATELY before syncing React visibility state
  fullTranslateY.value = withSpring(0, SPRING_CONFIG);
  requestAnimationFrame(() => {
    setPlayerModalVisible(true);
  });
}, [setPlayerModalVisible]);

// ── Intelligent Zero-Cut Collapse Handover ──
// Keeps UnifiedPlayerSheet persistent audio uninterrupted when collapsing to mini player
const triggerCollapseHandover = useCallback(() => {
  setPlayerModalVisible(false);
}, [setPlayerModalVisible]);

const collapseToMini = useCallback(() => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  // Launch closing spring on GPU thread first, deferring React tree updates so closing never drops frames
  fullTranslateY.value = withSpring(HIDDEN_OFFSET, SPRING_CONFIG);
  setTimeout(() => {
    triggerCollapseHandover();
  }, 170);
}, [triggerCollapseHandover, HIDDEN_OFFSET]);

// ── FullPlayer Downward Pan Dismiss Gesture (Full Viewport Coverage) ──
const fullPanGesture = Gesture.Pan()
  .activeOffsetY([8, 8])
  .failOffsetX([-24, 24])
  .onStart(() => {
    'worklet';
    fullStartY.value = fullTranslateY.value;
  })
  .onUpdate((event) => {
    'worklet';
    if (isScrubbingTimeline.value || isVideoFullscreenSV.value) return;
    if (event.translationY > 0) {
      fullTranslateY.value = event.translationY;
    }
  })
  .onEnd((event) => {
    'worklet';
    if (isScrubbingTimeline.value || isVideoFullscreenSV.value) {
      fullTranslateY.value = withSpring(0, SPRING_CONFIG);
      return;
    }
    if (event.translationY > 95 || event.velocityY > 320) {
      fullTranslateY.value = withSpring(HIDDEN_OFFSET, SPRING_CONFIG);
      runOnJS(triggerCollapseHandover)();
    } else {
      fullTranslateY.value = withSpring(0, SPRING_CONFIG, (finished?: boolean) => {
        if (finished) {
          runOnJS(syncModalState)(true);
        }
      });
    }
  });

// ── MiniPlayer Upward Pan Expand Gesture (Continuous 120 FPS Touch Tracking) ──
const miniPanGesture = Gesture.Pan()
  .activeOffsetY([-12, 12])
  .failOffsetX([-25, 25])
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
    if (event.translationY < -45 || event.velocityY < -280) {
      fullTranslateY.value = withSpring(0, SPRING_CONFIG, (finished?: boolean) => {
        if (finished) {
          runOnJS(syncModalState)(true);
        }
      });
    } else {
      fullTranslateY.value = withSpring(HIDDEN_OFFSET, SPRING_CONFIG);
      runOnJS(triggerCollapseHandover)();
    }
  });

// ── 120 FPS GPU FullPlayer Animated Style (Hardware Display & Z-Index Guard) ──
const animatedFullStyle = useAnimatedStyle(() => {
  const isVisible = fullTranslateY.value < (SCREEN_HEIGHT > 0 ? SCREEN_HEIGHT * 0.92 : 750);
  return {
    transform: [{ translateY: fullTranslateY.value }],
    opacity: 1, // 🛡️ Keep opacity 1 so WebKit never suspends/freezes media decoding when sheet is collapsed
    zIndex: isVisible ? 100000 : -10, // 🛡️ Send far behind when collapsed so it never shows behind mini player
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
  const horizontalEdge = interpolate(
    miniDockMorph.value,
    [0, 1],
    [MINI_MARGIN_H, MINI_MARGIN_H + DOCK_CIRCLE_SIZE + 8],
    Extrapolation.CLAMP
  );
  const dynamicHeight = interpolate(
    miniDockMorph.value,
    [0, 1],
    [MINI_PLAYER_HEIGHT, COMPACT_DOCK_HEIGHT],
    Extrapolation.CLAMP
  );

  return {
    opacity: progress,
    left: horizontalEdge,
    right: horizontalEdge,
    height: dynamicHeight,
    borderRadius: dynamicHeight / 2,
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

const animatedSideCircleLeftStyle = useAnimatedStyle(() => {
  const progress = interpolate(
    fullTranslateY.value,
    [0, SCREEN_HEIGHT * 0.35, SCREEN_HEIGHT * 0.85],
    [0, 0, 1],
    Extrapolation.CLAMP
  );
  const morph = miniDockMorph.value;
  return {
    opacity: progress * morph,
    transform: [
      { scale: interpolate(morph, [0, 1], [0.55, 1], Extrapolation.CLAMP) },
      { translateX: interpolate(morph, [0, 1], [-22, 0], Extrapolation.CLAMP) },
    ],
  };
});

const animatedSideCircleRightStyle = useAnimatedStyle(() => {
  const progress = interpolate(
    fullTranslateY.value,
    [0, SCREEN_HEIGHT * 0.35, SCREEN_HEIGHT * 0.85],
    [0, 0, 1],
    Extrapolation.CLAMP
  );
  const morph = miniDockMorph.value;
  return {
    opacity: progress * morph,
    transform: [
      { scale: interpolate(morph, [0, 1], [0.55, 1], Extrapolation.CLAMP) },
      { translateX: interpolate(morph, [0, 1], [22, 0], Extrapolation.CLAMP) },
    ],
  };
});

const animatedMiniNextStyle = useAnimatedStyle(() => {
  const morph = miniDockMorph.value;
  return {
    opacity: interpolate(morph, [0, 0.55], [1, 0], Extrapolation.CLAMP),
    width: interpolate(morph, [0, 0.7], [30, 0], Extrapolation.CLAMP),
    marginLeft: interpolate(morph, [0, 0.7], [6, 0], Extrapolation.CLAMP),
    overflow: 'hidden' as const,
  };
});

const tint = useMemo(() => getTrackAtmosphericTint(currentTrack, isDark), [currentTrack, isDark]);

// ── YouTube Music Ultra-HD Studio Artwork Cascade (1200x1200bb / 1080p HD, zero black bars) ──
const heroArtworkSources = useMemo(() => {
  return getUniversalStudioArtworkSource(
    currentTrack?.thumbnail,
    currentTrack?.title,
    currentTrack?.artist,
    currentTrack?.videoId
  );
}, [currentTrack?.videoId, currentTrack?.thumbnail, currentTrack?.title, currentTrack?.artist]);

const heroArtworkUrl = useMemo(() => {
  return getUniversalStudioArtwork(
    currentTrack?.thumbnail,
    currentTrack?.title,
    currentTrack?.artist,
    currentTrack?.videoId
  );
}, [currentTrack?.videoId, currentTrack?.thumbnail, currentTrack?.title, currentTrack?.artist]);

const handleShare = async () => {
  if (!currentTrack) return;
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({
      title: currentTrack.title,
      message: `${currentTrack.title} — ${currentTrack.artist}\nhttps://music.youtube.com/watch?v=${currentTrack.videoId}`,
    });
  } catch (e) { }
};

const navigateToStackOrTab = useCallback(
  (screen: string, params?: any) => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('MainTabs', { screen, params });
    } else {
      navigation.navigate(screen, params);
    }
  },
  [navigation]
);

const handleDockNavigateTab = useCallback(
  (tabKey: 'DashboardTab' | 'SearchTab') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useAudioStore.getState().setCurrentRouteName(tabKey);
    useAudioStore.getState().requestTabSwitch(tabKey);
    if (navigationRef.isReady()) {
      navigationRef.navigate('MainTabs', {
        screen: 'Tabs',
        params: { screen: tabKey },
      });
    } else {
      navigation.navigate('Tabs', { screen: tabKey });
    }
  },
  [navigation]
);

const handleAddToLibraryPress = useCallback(async () => {
  if (!currentTrack) return;
  const savedNow = await toggleSaveTrackToLibrary(currentTrack);
  ToastManager.show({
    title: savedNow
      ? isAr
        ? 'تمت الإضافة إلى مكتبتك'
        : 'Added to Library'
      : isAr
        ? 'تمت الإزالة من مكتبتك'
        : 'Removed from Library',
    subtitle: currentTrack.title,
    icon: savedNow ? 'checkmark-circle' : 'remove-circle-outline',
    duration: 2200,
  });
}, [currentTrack, toggleSaveTrackToLibrary, isAr]);

const handleOpenTrackMenu = useCallback(() => {
  if (!currentTrack) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  setShowPlaylistPicker(false);
  setTrackMenuVisible(true);
  if (user?.id) {
    setLoadingPlaylists(true);
    getFirebasePlaylists(user.id)
      .then((pls) => setUserPlaylists(pls))
      .catch(() => { })
      .finally(() => setLoadingPlaylists(false));
  }
}, [currentTrack, user?.id]);

const handleGoToArtist = useCallback(() => {
  if (!currentTrack?.artist) return;
  setTrackMenuVisible(false);
  collapseToMini();
  navigateToStackOrTab('ArtistDetail', {
    artistName: currentTrack.artist,
    artistAvatar: currentTrack.artistAvatar,
  });
}, [currentTrack, collapseToMini, navigateToStackOrTab]);

const handleGoToAlbum = useCallback(async () => {
  if (!currentTrack) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  setResolvingAlbum(true);
  try {
    const resolved = await resolveTrackAlbumAsync(currentTrack);
    setTrackMenuVisible(false);
    collapseToMini();
    if (resolved) {
      navigateToStackOrTab('AlbumDetails', {
        playlistId: resolved.id,
        albumTitle: resolved.title,
        artistName: resolved.artist,
        cover: resolved.cover || currentTrack.thumbnail || '',
        type: resolved.type || 'album',
      });
    } else {
      const fallbackTitle = currentTrack.album || currentContextName || currentTrack.title;
      navigateToStackOrTab('AlbumDetails', {
        albumTitle: fallbackTitle,
        artistName: currentTrack.artist || 'Artist',
        cover: currentTrack.thumbnail || '',
        type: 'single',
        album: {
          id: `sng-${currentTrack.videoId}`,
          title: fallbackTitle,
          artist: currentTrack.artist || 'Artist',
          thumbnail: currentTrack.thumbnail || '',
          tracks: [currentTrack],
        },
      });
    }
  } finally {
    setResolvingAlbum(false);
  }
}, [currentTrack, currentContextName, collapseToMini, navigateToStackOrTab]);

const handleAddTrackToPlaylist = useCallback(
  async (pl: UserPlaylist) => {
    if (!user?.id || !currentTrack) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const ok = await addTrackToFirebasePlaylist(user.id, pl.id, currentTrack);
    if (ok) {
      setTrackMenuVisible(false);
      ToastManager.show({
        title: isAr ? `تمت الإضافة إلى "${pl.name}"` : `Added to "${pl.name}"`,
        subtitle: currentTrack.title,
        icon: 'checkmark-circle',
        duration: 2400,
      });
    }
  },
  [user?.id, currentTrack, isAr]
);

const isAuthScreen = currentRouteName === 'Login' || currentRouteName === 'SignUp';
const showQuickDockWithoutTrack =
  !currentTrack && isCompactDockActive && currentRouteName !== 'DashboardTab';
const shouldRenderPlayerUi =
  !isMiniPlayerSuppressed &&
  !isAuthScreen &&
  Boolean(currentTrack || showQuickDockWithoutTrack);

const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.videoId) : false;
const isSavedInLibrary = currentTrack ? savedLibraryTrackIds.includes(currentTrack.videoId) : false;
const resolvedArtistAvatar = getUniversalArtistAvatar(
  currentTrack?.artistAvatar,
  currentTrack?.artist
);

    const useOfflineVideoStage = Boolean(
      currentTrack &&
      (Boolean(currentDownloadedTrack?.videoLocalUri) ||
        (!isOnline && playerMediaMode === 'video') ||
        (!isOnline &&
          playerMediaMode === 'cover' &&
          Boolean(currentDownloadedTrack?.videoLocalUri) &&
          !currentDownloadedTrack?.audioLocalUri))
    );

    return (
      <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* Pre-warmed at app launch (opacity 0.015 behind UI in Cover mode) & synchronized 120fps in Video mode */}
        <YoutubeAudioEngine
          isVideoVisible={
            playerMediaMode === 'video' &&
            isPlayerModalVisible &&
            !useOfflineVideoStage
          }
          isVideoFullscreen={isVideoFullscreen && !useOfflineVideoStage}
          stageTop={normalStageTop}
          stageLeft={normalVideoLeft}
          stageWidth={cardWidth}
          stageHeight={cardVideoHeight}
          fullscreenWidth={fullscreenVideoDims.width}
          fullscreenHeight={fullscreenVideoDims.height}
          videoAspectMode={videoAspectMode}
          sheetTranslateY={fullTranslateY}
          onVideoPress={handlePlayPausePress}
          onEnterFullscreen={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setVideoFullscreen(true);
          }}
          onSwitchToCover={handleSwitchToCover}
        />

        {currentTrack && (
          <OfflineVideoStage
            track={currentTrack}
            downloadedTrack={currentDownloadedTrack}
            playerMediaMode={playerMediaMode}
            isPlaying={isPlaying}
            isOnline={isOnline}
            isDark={isDark}
            isAr={isAr}
            videoAspectMode={videoAspectMode}
            isVideoFullscreen={isVideoFullscreen}
            fullscreenWidth={fullscreenVideoDims.width}
            fullscreenHeight={fullscreenVideoDims.height}
            cardWidth={cardWidth}
            cardVideoHeight={cardVideoHeight}
            normalStageTop={normalStageTop}
            normalVideoLeft={normalVideoLeft}
            sheetTranslateY={fullTranslateY}
            isPlayerModalVisible={isPlayerModalVisible}
            onPressTogglePlay={handlePlayPausePress}
            onEnterFullscreen={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setVideoFullscreen(true);
            }}
            onSwitchToCover={handleSwitchToCover}
            onSwitchToVideo={handleSwitchToVideo}
            onRequestDownload={(mode) => startDirectDownload(currentTrack, mode)}
          />
        )}

    {shouldRenderPlayerUi && (
      <>
    {/* ── Flanking Liquid Glass Home Circle (Scroll-Collapsed Dock on Tabs & Stack Screens) ── */}
    <Animated.View
      style={[
        styles.dockSideCircleLeft,
        { bottom: stackDockBottom },
        animatedSideCircleLeftStyle,
      ]}
      pointerEvents={isPlayerModalVisible || !isCompactDockActive ? 'none' : 'box-none'}
    >
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={() => handleDockNavigateTab('DashboardTab')}
      >
        <LiquidGlassSurface
          glassStyle="regular"
          isInteractive
          isDark={isDark}
          borderRadius={DOCK_CIRCLE_SIZE / 2}
          style={[
            styles.dockCircleSurface,
            {
              borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.08)',
            },
          ]}
        >
          <Ionicons name="home" size={20} color={isDark ? '#FFFFFF' : '#0F172A'} />
        </LiquidGlassSurface>
      </TouchableOpacity>
    </Animated.View>

    {/* ── Flanking Liquid Glass Search Circle (Scroll-Collapsed Dock on Tabs & Stack Screens) ── */}
    <Animated.View
      style={[
        styles.dockSideCircleRight,
        { bottom: stackDockBottom },
        animatedSideCircleRightStyle,
      ]}
      pointerEvents={isPlayerModalVisible || !isCompactDockActive ? 'none' : 'box-none'}
    >
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={() => handleDockNavigateTab('SearchTab')}
      >
        <LiquidGlassSurface
          glassStyle="regular"
          isInteractive
          isDark={isDark}
          borderRadius={DOCK_CIRCLE_SIZE / 2}
          style={[
            styles.dockCircleSurface,
            {
              borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.08)',
            },
          ]}
        >
          <Ionicons name="search" size={20} color="#0A84FF" />
        </LiquidGlassSurface>
      </TouchableOpacity>
    </Animated.View>

    {currentTrack && (
      <>
        {/* ════════════════════════════════════════════════════════════════════════
            1. FLOATING PILL MINIPLAYER (Scroll-Reactive Liquid Glass Pill)
           ════════════════════════════════════════════════════════════════════════ */}
      <Animated.View
        style={[
          styles.miniFloatingContainer,
          {
            bottom: baseMiniBottom,
            backgroundColor: 'transparent',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.08)',
            borderTopColor: isDark ? 'rgba(255, 255, 255, 0.34)' : 'rgba(255, 255, 255, 0.90)',
            shadowColor: '#000000',
            shadowOpacity: isDark ? 0.36 : 0.12,
            shadowOffset: { width: 0, height: 6 },
            shadowRadius: 16,
          },
          animatedMiniStyle,
        ]}
        pointerEvents={isPlayerModalVisible ? 'none' : 'box-none'}
      >
        {/* Apple Native Liquid Glass Surface (Metal GPU UIGlassEffect) */}
        <LiquidGlassSurface
          glassStyle="regular"
          isInteractive={true}
          isDark={isDark}
          borderRadius={25}
          style={StyleSheet.absoluteFill}
        >
          {/* Subtle blurred cover image reflection bloom */}
          {heroArtworkSources && heroArtworkSources.length > 0 && (
            <Image
              source={heroArtworkSources}
              style={[
                StyleSheet.absoluteFill,
                {
                  transform: [{ scale: 2.0 }],
                  opacity: isDark ? 0.12 : 0.06,
                },
              ]}
              contentFit="cover"
              blurRadius={Platform.OS === 'ios' ? 28 : 18}
              cachePolicy="memory-disk"
              transition={300}
            />
          )}
        </LiquidGlassSurface>

        <View style={styles.miniInnerRow} pointerEvents="auto">
          {/* Left Display Area (Tap opens FullPlayer) - isolated PanGesture */}
          <GestureDetector gesture={miniPanGesture}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={expandToFull}
              style={styles.miniDisplayArea}
            >
              <Image
                source={heroArtworkSources}
                style={styles.miniCover}
                contentFit="cover"
                priority="high"
                cachePolicy="memory-disk"
                transition={150}
              />

              <View style={styles.miniInfo}>
                <MarqueeText
                  text={currentTrack.title || 'Track Title'}
                  style={[styles.miniTitle, { color: isDark ? '#FFFFFF' : theme.textPrimary }]}
                  speedPxPerSec={26}
                  pauseStartMs={1600}
                  pauseEndMs={1400}
                />
                <View style={styles.miniArtistRow}>
                  <Text
                    style={[styles.miniArtist, { color: isDark ? 'rgba(255,255,255,0.68)' : theme.textMuted }]}
                    numberOfLines={1}
                  >
                    {currentTrack.artist || 'Artist'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </GestureDetector>

          {/* Compact Apple Music Right Controls */}
          <View style={styles.miniControls}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={(e) => {
                e?.stopPropagation?.();
                handlePlayPausePress();
              }}
              style={styles.miniIconActionBtn}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={19}
                color={isDark ? '#FFFFFF' : theme.textPrimary}
                style={{ marginLeft: isPlaying ? 0 : 1 }}
              />
            </TouchableOpacity>

            <Animated.View style={animatedMiniNextStyle}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  handleNextPress();
                }}
                style={styles.miniIconActionBtn}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 8 }}
              >
                <Ionicons name="play-forward" size={18} color={isDark ? '#FFFFFF' : theme.textPrimary} />
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Ultra-thin Micro Progress Hairline */}
          <MiniProgressBar isDark={isDark} accentColor={tint.accent} />
        </View>
      </Animated.View>

      {/* ════════════════════════════════════════════════════════════════════════
          2. VIEWPORT-LOCKED FULL PLAYER (Pure GPU Transform, Full Viewport Pan)
         ════════════════════════════════════════════════════════════════════════ */}
      <Animated.View
        style={[
          styles.fullPlayerOverlay,
          animatedFullStyle,
          {
            backgroundColor: isDark ? tint.bottom : '#F5F4EF',
            overflow: 'hidden',
          },
        ]}
        pointerEvents={isPlayerModalVisible ? 'auto' : 'none'}
      >
        {/* ── 1. High-FPS Pre-Blurred Ambient Cover Backdrop (Zero Real-Time Framebuffer Lag) ── */}
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
          {/* Deep Base Ground */}
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: isDark ? tint.bottom : '#F2F1EC' },
            ]}
          />

          {/* Layer A: Pre-Blurred Cover Art */}
          {heroArtworkSources && heroArtworkSources.length > 0 && (
            <Image
              source={heroArtworkSources}
              style={[
                StyleSheet.absoluteFill,
                {
                  transform: [{ scale: 1.45 }],
                  opacity: isDark ? 0.88 : 0.65,
                },
              ]}
              contentFit="cover"
              blurRadius={Platform.OS === 'ios' ? 54 : 32}
              priority="high"
              cachePolicy="memory-disk"
              transition={220}
            />
          )}

          {/* Layer B: Calibrated Vignette & Contrast Veil */}
          <LinearGradient
            colors={
              isDark
                ? [
                    'rgba(8, 10, 14, 0.52)',
                    'rgba(8, 10, 14, 0.24)',
                    'rgba(8, 10, 14, 0.32)',
                    'rgba(6, 8, 12, 0.68)',
                    'rgba(6, 8, 12, 0.94)',
                  ]
                : [
                    'rgba(248, 250, 252, 0.64)',
                    'rgba(248, 250, 252, 0.38)',
                    'rgba(245, 247, 250, 0.44)',
                    'rgba(240, 242, 245, 0.72)',
                    'rgba(240, 242, 245, 0.94)',
                  ]
            }
            locations={[0, 0.24, 0.48, 0.76, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
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
              isVideoFullscreen && { opacity: 0 },
            ]}
            pointerEvents={isVideoFullscreen ? 'none' : 'auto'}
          >
            {/* 1. Header Row */}
            <View style={styles.fullHeaderWrap}>
              {/* Grab Bar */}
              <View style={styles.grabBarContainer}>
                <View
                  style={[
                    styles.grabBar,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)' },
                  ]}
                />
              </View>

              {/* 1. Balanced 3-Slot Specular Glass Header */}
              <View style={styles.fullHeaderThreeSlot}>
                <View style={styles.headerSlotSide}>
                  <TouchableOpacity
                    onPress={collapseToMini}
                    activeOpacity={0.78}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={[
                      styles.headerGlassCircle,
                      {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.08)',
                        borderColor: isDark ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.08)',
                      },
                    ]}
                  >
                    <Ionicons name="chevron-down" size={22} color={isDark ? '#FFFFFF' : theme.textPrimary} />
                  </TouchableOpacity>
                </View>

                {/* Mathematically Centered Liquid Glass Mode Switcher Pill */}
                <View style={styles.headerSlotCenter}>
                  <LiquidGlassSurface
                    glassStyle="regular"
                    isInteractive={true}
                    isDark={isDark}
                    borderRadius={19}
                    style={[
                      styles.audioVideoPill,
                      {
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.08)',
                      },
                    ]}
                  >
                    {/* Animated sliding background pill indicator (Hardware 120 FPS) */}
                    <Animated.View
                      style={[
                        styles.audioVideoSlidingIndicator,
                        {
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.22)' : '#FFFFFF',
                          borderColor: isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.06)',
                          borderWidth: isDark ? 0.75 : 0.5,
                          shadowColor: isDark ? '#000000' : 'rgba(0, 0, 0, 0.18)',
                        },
                        slidingIndicatorStyle,
                      ]}
                    />

                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.audioVideoSegment}
                      onPress={handleSwitchToCover}
                    >
                      <Ionicons
                        name="musical-notes"
                        size={14}
                        color={
                          playerMediaMode === 'cover'
                            ? (isDark ? '#FFFFFF' : '#000000')
                            : (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)')
                        }
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={[
                          styles.audioVideoSegmentText,
                          playerMediaMode === 'cover'
                            ? (isDark ? styles.audioVideoSegmentTextActiveDark : styles.audioVideoSegmentTextActiveLight)
                            : (isDark ? styles.audioVideoSegmentTextInactiveDark : styles.audioVideoSegmentTextInactiveLight),
                        ]}
                      >
                        Music
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.audioVideoSegment}
                      onPress={handleSwitchToVideo}
                    >
                      <Ionicons
                        name="videocam"
                        size={14}
                        color={
                          playerMediaMode === 'video'
                            ? (isDark ? '#FFFFFF' : '#000000')
                            : (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)')
                        }
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={[
                          styles.audioVideoSegmentText,
                          playerMediaMode === 'video'
                            ? (isDark ? styles.audioVideoSegmentTextActiveDark : styles.audioVideoSegmentTextActiveLight)
                            : (isDark ? styles.audioVideoSegmentTextInactiveDark : styles.audioVideoSegmentTextInactiveLight),
                        ]}
                      >
                        Video
                      </Text>
                    </TouchableOpacity>
                  </LiquidGlassSurface>
                </View>

                <View style={styles.headerSlotSide} />
              </View>
            </View>

            {/* 2. Centered Media Area: Dynamic Breathing Artwork Stage OR 16:9 Synchronized Video */}
            <View
              ref={mediaContainerRef}
              style={[
                styles.artworkCenterWrapper,
                playerMediaMode === 'video' ? styles.videoStageWrapper : styles.coverStageWrapper,
              ]}
              onLayout={(e) => {
                const y = e.nativeEvent.layout.y;
                if (y > 0 && Math.abs(y - normalStageTop) > 2) {
                  setNormalStageTop(y);
                }
              }}
            >
              {/* 2A. Dynamic Artwork Stage (Apple Music Breathing Physics + Nanoglass Rim) */}
              {playerMediaMode === 'cover' ? (
                <PlayerArtworkStage
                  artworkSource={heroArtworkSources}
                  isPlaying={isPlaying}
                  size={cardWidth}
                />
              ) : (
                /* 2B. Video Placeholder: Preserves exact layout height for controls below */
                <View
                  style={{
                    width: cardWidth,
                    height: cardVideoHeight,
                  }}
                  pointerEvents="none"
                />
              )}
            </View>

            {/* 3. Track Metadata + Apple Music Liquid Glass [ + ] [ ♥ ] [ ⋯ ] Row */}
            <View style={styles.metaRow}>
              <View style={styles.metaTextCol}>
                <MarqueeText
                  text={currentTrack.title || 'Track Title'}
                  style={[styles.fullTrackTitle, { color: isDark ? '#FFFFFF' : theme.textPrimary }]}
                  speedPxPerSec={30}
                  pauseStartMs={2000}
                  pauseEndMs={1500}
                />
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleGoToArtist}
                  style={styles.fullArtistRow}
                >
                  <Text
                    style={[
                      styles.fullArtistName,
                      { color: isDark ? 'rgba(255,255,255,0.72)' : 'rgba(0, 0, 0, 0.68)' },
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
                {/* + Add to Library Specular Glass Button */}
                <TouchableOpacity
                  activeOpacity={0.78}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  onPress={handleAddToLibraryPress}
                  style={[
                    styles.metaGlassCircle,
                    {
                      backgroundColor: isSavedInLibrary
                        ? 'rgba(52, 211, 153, 0.24)'
                        : isDark
                          ? 'rgba(255,255,255,0.14)'
                          : 'rgba(15,23,42,0.08)',
                      borderColor: isSavedInLibrary
                        ? 'rgba(52, 211, 153, 0.55)'
                        : isDark
                          ? 'rgba(255,255,255,0.22)'
                          : 'rgba(0,0,0,0.08)',
                    },
                  ]}
                >
                  <Ionicons
                    name={isSavedInLibrary ? 'checkmark' : 'add'}
                    size={20}
                    color={
                      isSavedInLibrary
                        ? '#34D399'
                        : isDark
                          ? '#FFFFFF'
                          : theme.textPrimary
                    }
                  />
                </TouchableOpacity>

                {/* ♥ Favorite Specular Glass Button */}
                <TouchableOpacity
                  activeOpacity={0.78}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    toggleLike(currentTrack);
                  }}
                  style={[
                    styles.metaGlassCircle,
                    {
                      backgroundColor: isLiked
                        ? 'rgba(255, 55, 95, 0.22)'
                        : isDark
                          ? 'rgba(255,255,255,0.14)'
                          : 'rgba(15,23,42,0.08)',
                      borderColor: isLiked
                        ? 'rgba(255, 55, 95, 0.55)'
                        : isDark
                          ? 'rgba(255,255,255,0.22)'
                          : 'rgba(0,0,0,0.08)',
                    },
                  ]}
                >
                  <Ionicons
                    name={isLiked ? 'heart' : 'heart-outline'}
                    size={18}
                    color={isLiked ? '#FF375F' : isDark ? '#FFFFFF' : theme.textPrimary}
                  />
                </TouchableOpacity>

                {/* ↓ Download / Manage Offline Button (shows 2 smart options for Music vs Video section) */}
                <TouchableOpacity
                  activeOpacity={0.78}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  disabled={isDownloading}
                  onPress={handleDownloadPress}
                  style={[
                    styles.metaGlassCircle,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.08)',
                      borderColor: isDownloading
                        ? 'rgba(10, 132, 255, 0.5)'
                        : isDownloaded
                          ? 'rgba(48, 209, 88, 0.45)'
                          : isDark
                            ? 'rgba(255,255,255,0.22)'
                            : 'rgba(0,0,0,0.08)',
                    },
                  ]}
                >
                  {isDownloading || isDownloaded ? (
                    <CircularDownloadProgress
                      status={
                        isDownloading
                          ? ((downloadProgress?.status as 'probing' | 'downloading') || 'downloading')
                          : 'completed'
                      }
                      progress={downloadProgress?.progress || 0}
                      size={20}
                      activeColor="#0A84FF"
                      completedColor="#30D158"
                      trackColor={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.18)'}
                    />
                  ) : (
                    <Ionicons
                      name="cloud-download-outline"
                      size={18}
                      color={isDark ? '#FFFFFF' : theme.textPrimary}
                    />
                  )}
                </TouchableOpacity>

                {/* ⋯ Three-Dot Apple Music Options Menu */}
                <TouchableOpacity
                  activeOpacity={0.78}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
                  onPress={handleOpenTrackMenu}
                  style={[
                    styles.metaGlassCircle,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.08)',
                      borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.08)',
                    },
                  ]}
                >
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={18}
                    color={isDark ? '#FFFFFF' : theme.textPrimary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* 4. High-Precision Free Timeline Scrubber (0ms Latency, Zero Glitch) */}
            <AppleTimelineScrubber
              onSeekCommit={handleScrubberSeek}
              isDark={isDark}
              themeMuted={isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0, 0, 0, 0.65)'}
              onScrubbingStateChange={(scrubbing) => {
                isScrubbingTimeline.value = scrubbing;
              }}
            />

            {/* 5. Main Playback Controls: 5 Apple Music buttons in 'cover', 7 in 'video' */}
            <View style={styles.controlsRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, isShuffle && { opacity: 1 }]}
                onPress={toggleShuffle}
                hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
              >
                <Ionicons
                  name="shuffle"
                  size={22}
                  color={isShuffle ? (isDark ? '#FFFFFF' : '#000000') : isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'}
                />
              </TouchableOpacity>

              {playerMediaMode === 'video' && (
                <TouchableOpacity
                  style={styles.quickSeekBtn}
                  onPress={seekBackward10}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name="rewind-10"
                    size={26}
                    color={isDark ? 'rgba(255,255,255,0.75)' : theme.textPrimary}
                  />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.skipBtn}
                onPress={handlePrevPress}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              >
                <Ionicons name="play-skip-back" size={28} color={isDark ? '#FFFFFF' : theme.textPrimary} />
              </TouchableOpacity>

              {/* Apple Pure White Play / Pause Button */}
              <TouchableOpacity
                onPress={handlePlayPausePress}
                style={[
                  styles.fullPlayPauseBtn,
                  {
                    backgroundColor: isDark ? '#FFFFFF' : '#000000',
                    shadowColor: '#000000',
                    shadowOpacity: isDark ? 0.35 : 0.2,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 12,
                  },
                ]}
                activeOpacity={0.85}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={34}
                  color={isDark ? '#000000' : '#FFFFFF'}
                  style={{ marginLeft: isPlaying ? 0 : 3 }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.skipBtn}
                onPress={handleNextPress}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              >
                <Ionicons name="play-skip-forward" size={28} color={isDark ? '#FFFFFF' : theme.textPrimary} />
              </TouchableOpacity>

              {playerMediaMode === 'video' && (
                <TouchableOpacity
                  style={styles.quickSeekBtn}
                  onPress={seekForward10}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name="fast-forward-10"
                    size={26}
                    color={isDark ? 'rgba(255,255,255,0.75)' : theme.textPrimary}
                  />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={toggleRepeat}
                hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
              >
                <View style={{ position: 'relative' }}>
                  <Ionicons
                    name="repeat"
                    size={22}
                    color={repeatMode !== 'off' ? (isDark ? '#FFFFFF' : '#000000') : isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'}
                  />
                  {repeatMode === 'one' && (
                    <View style={[styles.repeatBadge, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}>
                      <Text style={[styles.repeatBadgeText, { color: isDark ? '#000000' : '#FFFFFF' }]}>1</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {/* 6. Liquid Glass Bottom Artist Card */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={handleGoToArtist}
              style={styles.compactArtistCardWrapper}
            >
              <LiquidGlassSurface
                glassStyle="regular"
                isInteractive={true}
                isDark={isDark}
                borderRadius={18}
                style={[
                  styles.compactArtistCard,
                  {
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
              >
                <View style={styles.compactArtistHeader}>
                  <Text style={[styles.compactArtistHeaderTitle, { color: isDark ? '#FFFFFF' : theme.textPrimary }]}>
                    {isAr ? 'الفنان' : 'Artist'}
                  </Text>
                  <Ionicons
                    name={isAr ? 'chevron-back' : 'chevron-forward'}
                    size={16}
                    color={isDark ? 'rgba(255,255,255,0.6)' : theme.textMuted}
                  />
                </View>

                <View style={styles.compactArtistBody}>
                  {/* Authentic Artist Portrait */}
                  <View style={styles.compactArtistAvatarContainer}>
                    <View style={[styles.compactArtistFallbackBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }]}>
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
                      style={[styles.compactArtistSub, { color: isDark ? 'rgba(255,255,255,0.6)' : theme.textMuted }]}
                      numberOfLines={1}
                    >
                      {isAr ? 'فنان رسمي موثق' : 'Verified Official Artist'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.followingPill,
                      {
                        backgroundColor: currentTrack?.artist && followedArtistIds.includes(currentTrack.artist)
                          ? (isDark ? 'rgba(255, 255, 255, 0.95)' : '#000000')
                          : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.06)'),
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.12)',
                      },
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
                        {
                          color: currentTrack?.artist && followedArtistIds.includes(currentTrack.artist)
                            ? (isDark ? '#000000' : '#FFFFFF')
                            : (isDark ? '#FFFFFF' : '#000000'),
                        },
                      ]}
                    >
                      {currentTrack?.artist && followedArtistIds.includes(currentTrack.artist)
                        ? isAr
                          ? 'تتابع'
                          : 'Following'
                        : isAr
                          ? '+ متابعة'
                          : '+ Follow'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </LiquidGlassSurface>
            </TouchableOpacity>
          </View>
        </GestureDetector>

        <TrackOptionsModal
          visible={trackMenuVisible}
          onClose={() => setTrackMenuVisible(false)}
          currentTrack={currentTrack}
          heroArtworkSources={heroArtworkSources}
          isDark={isDark}
          isAr={isAr}
          bottomInset={insets.bottom}
          hasUser={Boolean(user?.id)}
          isLiked={isLiked}
          isSavedInLibrary={isSavedInLibrary}
          isDownloading={isDownloading}
          isDownloaded={isDownloaded}
          downloadProgress={downloadProgress}
          downloadPct={downloadPct}
          resolvingAlbum={resolvingAlbum}
          showPlaylistPicker={showPlaylistPicker}
          onTogglePlaylistPicker={() => setShowPlaylistPicker((prev) => !prev)}
          loadingPlaylists={loadingPlaylists}
          userPlaylists={userPlaylists}
          onGoToArtist={handleGoToArtist}
          onGoToAlbum={handleGoToAlbum}
          onAddToLibrary={handleAddToLibraryPress}
          onAddTrackToPlaylist={handleAddTrackToPlaylist}
          onToggleLike={() => toggleLike(currentTrack)}
          onDownloadPress={handleDownloadPress}
          onShare={handleShare}
        />

        <DownloadOptionsModal
          visible={downloadModalVisible}
          onClose={() => setDownloadModalVisible(false)}
          track={currentTrack}
          sourceContext={playerMediaMode === 'video' ? 'video' : 'music'}
          downloadedTrack={currentDownloadedTrack}
          isDark={isDark}
          isAr={isAr}
          onSelectDownload={(mode) => startDirectDownload(currentTrack, mode)}
          onSelectRemove={handleRemoveDownload}
        />
      </Animated.View>

      {/* In-Place Fullscreen Video HUD rendered at root stacking context above YoutubeAudioEngine */}
      {isVideoFullscreen && (
        <View style={styles.fullscreenHudOverlay} pointerEvents="box-none">
          <InPlaceFullscreenHud
            visible={isVideoFullscreen}
            screenWidth={windowWidth}
            screenHeight={windowHeight}
            onClose={() => setVideoFullscreen(false)}
            isPlaying={isPlaying}
            onTogglePlay={handlePlayPausePress}
            onSeekRelative={(deltaSec) => {
              if (deltaSec < 0) {
                seekBackward10();
              } else {
                seekForward10();
              }
            }}
            isScrubbing={isScrubbingFullscreen}
            renderTimeline={renderFullscreenTimeline}
          />
        </View>
      )}
    </>
  )
}
    </>
    )}
    </GestureHandlerRootView >
  );
});

const styles = StyleSheet.create({
  // ── Scroll-Collapsed Stack Quick Dock Circles (Home & Search) ──
  dockSideCircleLeft: {
    position: 'absolute',
    left: MINI_MARGIN_H,
    width: DOCK_CIRCLE_SIZE,
    height: DOCK_CIRCLE_SIZE,
    zIndex: 99998,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  dockSideCircleRight: {
    position: 'absolute',
    right: MINI_MARGIN_H,
    width: DOCK_CIRCLE_SIZE,
    height: DOCK_CIRCLE_SIZE,
    zIndex: 99998,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  dockCircleSurface: {
    width: DOCK_CIRCLE_SIZE,
    height: DOCK_CIRCLE_SIZE,
    borderRadius: DOCK_CIRCLE_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },

  // ── MiniPlayer Floating Capsule (Slim Apple Music Edition) ──
  miniFloatingContainer: {
    position: 'absolute',
    left: MINI_MARGIN_H,
    right: MINI_MARGIN_H,
    height: MINI_PLAYER_HEIGHT,
    borderRadius: MINI_PLAYER_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    zIndex: 99999,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
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
    width: 34,
    height: 34,
    borderRadius: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.26,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  miniInfo: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },
  miniTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  miniArtistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  miniArtist: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  miniControls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  miniIconActionBtn: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniProgressBg: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  miniProgressFill: {
    height: '100%',
    borderRadius: 1,
  },

  // ── Viewport-Locked FullPlayer ──
  fullPlayerOverlay: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
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
  fullHeaderThreeSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 44,
  },
  headerSlotSide: {
    width: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerSlotCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullHeaderBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioVideoPill: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    width: 206,
    height: 38,
    borderRadius: 19,
    padding: 3,
    borderWidth: 1,
    overflow: 'hidden',
  },
  audioVideoSlidingIndicator: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 99,
    height: 30,
    borderRadius: 15,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 5,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  audioVideoSegment: {
    flex: 1,
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    zIndex: 1,
  },
  audioVideoSegmentActiveDark: {},
  audioVideoSegmentActiveLight: {},
  audioVideoSegmentText: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  audioVideoSegmentTextActiveDark: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  audioVideoSegmentTextActiveLight: {
    color: '#000000',
    fontWeight: '800',
  },
  audioVideoSegmentTextInactiveDark: {
    color: 'rgba(255, 255, 255, 0.55)',
  },
  audioVideoSegmentTextInactiveLight: {
    color: 'rgba(0, 0, 0, 0.45)',
  },

  // ── Centered Media Area (Spotify & Apple Music Level) ──
  artworkCenterWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  coverStageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoStageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkOuterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderRadius: 18,
    backgroundColor: '#000000',
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.42,
        shadowRadius: 20,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  artworkAmbientGlow: {
    position: 'absolute',
    borderRadius: 30,
    opacity: 0.35,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.5,
        shadowRadius: 36,
      },
      android: {
        elevation: 20,
      },
    }),
  },
  heroArtworkImg: {
    borderRadius: 18,
    borderWidth: 0.75,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  hiddenVideoInCoverMode: {
    position: 'absolute',
    left: -9999,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  videoStageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginVertical: 4,
  },
  videoStageFullscreenRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 99990,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenHudOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100005,
    elevation: 30,
  },

  // ── Fullscreen Cinema Video Theatre ──
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
  },
  fullscreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  fullscreenCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenTitleWrap: {
    flex: 1,
    marginHorizontal: 16,
    alignItems: 'center',
  },
  fullscreenTitleText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  fullscreenArtistText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  fullscreenHdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  fullscreenHdDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  fullscreenHdText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  fullscreenCenterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
  },
  fullscreenSeekBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenPlayPauseBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1DB954',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenFooter: {
    paddingHorizontal: 24,
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
    gap: 9,
  },
  headerGlassCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  metaGlassCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
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

  // Compact Artist Peek Card (Apple Liquid Glass Edition)
  compactArtistCardWrapper: {
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 24,
  },
  compactArtistCard: {
    borderRadius: 18,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
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
    borderWidth: StyleSheet.hairlineWidth,
  },
  followingPillActive: {},
  followingPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  followingPillTextActive: {
    fontWeight: '700',
  },
});

export default UnifiedPlayerSheet;
