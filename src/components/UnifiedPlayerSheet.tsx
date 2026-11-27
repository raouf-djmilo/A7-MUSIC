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
  Modal,
  ActivityIndicator,
  Alert,
  AppState,
  NativeModules,
} from 'react-native';
import TrackPlayer, { State } from 'react-native-track-player';
import { startSilentBackgroundKeepAlive, pauseSilentBackgroundKeepAlive } from '../services/audioSessionService';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import YoutubePlayer, { YoutubeIframeRef } from 'react-native-youtube-iframe';
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
import { useDownloadStore, downloadService, AudioQualityOption } from '../services/downloadService';
import { isNativeLiquidTabsAvailable } from '../navigation/navigationConfig';
import { LiquidGlassSurface } from './LiquidGlassSurface';
import { MarqueeText } from './MarqueeText';
import { PlayerArtworkStage } from '../features/player/components/PlayerArtworkStage';
import { AppleTimelineScrubber } from '../features/player/components/AppleTimelineScrubber';
import { FullscreenVideoModal } from '../features/player/components/FullscreenVideoModal';
import { InPlaceFullscreenHud } from '../features/player/components/InPlaceFullscreenHud';
import { ToastManager } from './InAppToast';
import { playerModalTranslateY, PLAYER_SPRING_CONFIG, DEFAULT_HIDDEN_OFFSET } from '../utils/playerMotion';
import { registerActivePlayerBridge } from '../services/audioSessionService';
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
  const mediaContainerRef = useRef<any>(null);
  const youtubePlayerRef = useRef<YoutubeIframeRef>(null);
  const isSwitchingModeRef = useRef<boolean>(false);
  // Tracks which videoId has actually emitted 'playing' in YoutubePlayer (avoids time-based lockouts)
  const startedYoutubeVideoIdRef = useRef<string | null>(null);
  const bgRecoveryTimerRef = useRef<any>(null);
  const pendingYoutubeSeekSecRef = useRef<number | null>(null);
  const enteredBackgroundAtRef = useRef<number>(0);
  const bgAutoNudgeCountRef = useRef<number>(0);
  const retriedVideoIdRef = useRef<string | null>(null);
  const [youtubeRemountKey, setYoutubeRemountKey] = useState(0);
  const [isScrubbingFullscreen, setIsScrubbingFullscreen] = useState(false);

  useEffect(() => {
    startedYoutubeVideoIdRef.current = null;
    retriedVideoIdRef.current = null;
    bgAutoNudgeCountRef.current = 0;
    if (bgRecoveryTimerRef.current) {
      clearTimeout(bgRecoveryTimerRef.current);
      bgRecoveryTimerRef.current = null;
    }
  }, [currentTrack?.videoId]);

  const cardWidth = Math.min(windowWidth - 48, windowHeight * 0.39, 360);
  const cardVideoHeight = Math.round((cardWidth * 9) / 16);
  const normalVideoLeft = Math.round((windowWidth - cardWidth) / 2);
  const [normalStageTop, setNormalStageTop] = useState(Math.max(insets.top, 16) + 68);
  const isVideoFullscreenSV = useSharedValue(false);
  useEffect(() => {
    isVideoFullscreenSV.value = isVideoFullscreen;
  }, [isVideoFullscreen]);

  // 1. تثبيت إعدادات المشغل بـ useMemo لمنع إعادة بناء WebView نهائياً عند التكبير أو الإغلاق
  const stablePlayerParams = useMemo(
    () => ({
      controls: false,
      modestbranding: true,
      rel: false,
      fs: false,
      iv_load_policy: 3,
      preventFullScreen: true,
      showClosedCaptions: false,
    }),
    []
  );

  // 2. حقن CSS لإخفاء شعار وعنوان وأزرار يوتيوب بالكامل ليظهر الفيديو كأنه من مصدرنا الشخصي
  const cleanYoutubeWebViewProps = useMemo(
    () => ({
      androidLayerType: 'hardware' as const,
      allowsInlineMediaPlayback: true,
      mediaPlaybackRequiresUserAction: false,
      allowsPictureInPictureMediaPlayback: true,
      allowsAirPlayForMediaPlayback: true,
      scrollEnabled: false,
      injectedJavaScriptForMainFrameOnly: false,
      injectedJavaScriptBeforeContentLoadedForMainFrameOnly: false,
      injectedJavaScriptBeforeContentLoaded: `
        (function() {
          if (navigator.audioSession) {
            try { navigator.audioSession.type = 'playback'; } catch(e) {}
          }
          try {
            Object.defineProperty(document, 'hidden', { get: function() { return false; }, configurable: true });
            Object.defineProperty(document, 'visibilityState', { get: function() { return 'visible'; }, configurable: true });
            Object.defineProperty(document, 'webkitVisibilityState', { get: function() { return 'visible'; }, configurable: true });
          } catch(e) {}
          try {
            var origAddEventListener = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function(type, listener, options) {
              if (
                type === 'visibilitychange' || 
                type === 'webkitvisibilitychange' || 
                type === 'pagehide' || 
                type === 'blur' || 
                type === 'freeze'
              ) {
                return;
              }
              return origAddEventListener.call(this, type, listener, options);
            };
          } catch(e) {}
          try {
            Object.defineProperty(document, 'onvisibilitychange', { get: function() { return null; }, set: function() {}, configurable: true });
            Object.defineProperty(window, 'onpagehide', { get: function() { return null; }, set: function() {}, configurable: true });
            Object.defineProperty(window, 'onblur', { get: function() { return null; }, set: function() {}, configurable: true });
          } catch(e) {}
          try {
            var origPlay = HTMLMediaElement.prototype.play;
            HTMLMediaElement.prototype.play = function() {
              this.setAttribute('playsinline', 'true');
              this.setAttribute('webkit-playsinline', 'true');
              return origPlay.call(this);
            };
          } catch(e) {}
          var css = [
            '.ytp-chrome-top',
            '.ytp-chrome-bottom',
            '.ytp-watermark',
            '.ytp-pause-overlay',
            '.ytp-pause-overlay-container',
            '.ytp-gradient-top',
            '.ytp-gradient-bottom',
            '.ytp-show-cards-title',
            '.ytp-youtube-button',
            '.ytp-title',
            '.ytp-title-link',
            '.ytp-title-text',
            '.ytp-title-channel',
            '.ytp-share-button',
            '.ytp-share-panel',
            '.ytp-large-play-button',
            '.ytp-contextmenu',
            '.ytp-cued-thumbnail-overlay',
            '.ytp-impression-link',
            '.ytm-paused-overlay',
            '.player-controls-content',
            '.fullscreen-overlay',
            '.ytp-ce-element',
            '.ytp-paid-content-overlay',
            '[class*="ytp-pause-overlay"]',
            '[class*="ytp-title"]',
            '[class*="ytp-watermark"]',
            '[class*="ytp-chrome"]',
            '[class*="ytp-button"]',
            'a[href*="youtube.com"]'
          ].join(', ') + ' { display: none !important; opacity: 0 !important; pointer-events: none !important; visibility: hidden !important; }';
          var el = document.createElement('style');
          el.id = 'ag-anti-chrome';
          el.innerHTML = css;
          (document.head || document.documentElement).appendChild(el);
        })();
        true;
      `,
      injectedJavaScript: `
        (function() {
          if (navigator.audioSession) {
            try { navigator.audioSession.type = 'playback'; } catch(e) {}
          }
          try {
            Object.defineProperty(document, 'hidden', { get: function() { return false; }, configurable: true });
            Object.defineProperty(document, 'visibilityState', { get: function() { return 'visible'; }, configurable: true });
            Object.defineProperty(document, 'webkitVisibilityState', { get: function() { return 'visible'; }, configurable: true });
          } catch(e) {}
          
          // 🛡️ CSS injection: مسح شامل لجميع عناصر وواجهات يوتيوب وشعاراته
          var css = [
            '.ytp-chrome-top',
            '.ytp-chrome-bottom',
            '.ytp-watermark',
            '.ytp-pause-overlay',
            '.ytp-pause-overlay-container',
            '.ytp-gradient-top',
            '.ytp-gradient-bottom',
            '.ytp-show-cards-title',
            '.ytp-youtube-button',
            '.ytp-title',
            '.ytp-title-link',
            '.ytp-title-text',
            '.ytp-title-channel',
            '.ytp-share-button',
            '.ytp-share-panel',
            '.ytp-large-play-button',
            '.ytp-contextmenu',
            '.ytp-cued-thumbnail-overlay',
            '.ytp-impression-link',
            '.ytm-paused-overlay',
            '.player-controls-content',
            '.fullscreen-overlay',
            '.ytp-ce-element',
            '.ytp-paid-content-overlay',
            '[class*="ytp-pause-overlay"]',
            '[class*="ytp-title"]',
            '[class*="ytp-watermark"]',
            '[class*="ytp-chrome"]',
            '[class*="ytp-button"]',
            'a[href*="youtube.com"]'
          ].join(', ') + ' { display: none !important; opacity: 0 !important; pointer-events: none !important; visibility: hidden !important; }';

          function applyAntiChrome() {
            var existing = document.getElementById('ag-anti-chrome');
            if (!existing) {
              var el = document.createElement('style');
              el.id = 'ag-anti-chrome';
              el.innerHTML = css;
              (document.head || document.documentElement).appendChild(el);
            }
          }
          applyAntiChrome();
          setInterval(applyAntiChrome, 350);

          function hookVideos() {
            var videos = document.querySelectorAll('video');
            for (var i = 0; i < videos.length; i++) {
              var v = videos[i];
              if (!v._bgHooked) {
                v._bgHooked = true;
                v.setAttribute('playsinline', 'true');
                v.setAttribute('webkit-playsinline', 'true');
              }
            }
          }
          hookVideos();
          setInterval(hookVideos, 500);
        })();
        true;
      `,
      onContentProcessDidTerminate: () => {
        const s = useAudioStore.getState();
        const curSec = Math.max(0, Math.floor(s.positionMillis / 1000));
        if (curSec > 0) pendingYoutubeSeekSecRef.current = curSec;
        setYoutubeRemountKey((k) => k + 1);
      },
    }),
    []
  );

  // 3. حاوية الفيديو الثابتة في الشجرة (Direct Root Child - Zero Unmount)
  const unifiedVideoWrapperStyle = isVideoFullscreen
    ? {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
      backgroundColor: '#000000',
      zIndex: 99999,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    }
    : playerMediaMode === 'video'
      ? {
        position: 'absolute' as const,
        top: normalStageTop,
        left: normalVideoLeft,
        width: cardWidth,
        height: cardVideoHeight,
        borderRadius: 18,
        overflow: 'hidden' as const,
        zIndex: 20,
      }
      : {
        position: 'absolute' as const,
        left: -9999,
        top: 0,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: 'none' as const,
      };

  const durationMillis = useAudioStore((s) => s.durationMillis);
  const seekTo = useAudioStore((s) => s.seekTo);

  const handleScrubberSeek = useCallback(async (millis: number) => {
    const sec = Math.floor(millis / 1000);
    if (activeEngine === 'youtube') {
      youtubePlayerRef.current?.seekTo(sec, true);
    }
    await seekTo(millis);
  }, [activeEngine, seekTo]);

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
    const sec = Math.floor(target / 1000);
    if (activeEngine === 'youtube') {
      youtubePlayerRef.current?.seekTo(sec, true);
    }
    await seekTo(target);
  }, [activeEngine, seekTo]);

  const seekForward10 = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { positionMillis: pos, durationMillis: dur, currentTrack: track } = useAudioStore.getState();
    const validDuration = dur > 0 ? dur : (track?.duration || 180000);
    const target = Math.min(validDuration, pos + 10000);
    const sec = Math.floor(target / 1000);
    if (activeEngine === 'youtube') {
      youtubePlayerRef.current?.seekTo(sec, true);
    }
    await seekTo(target);
  }, [activeEngine, seekTo]);

  // ── Unified Play / Pause Action (Single Source of Truth in useAudioStore) ──
  const handlePlayPausePress = useCallback(async () => {
    await togglePlay();
  }, [togglePlay]);

  // ── 🛡️ Direct Native Remote Control & Audio Session Bridge ──
  useEffect(() => {
    registerActivePlayerBridge({
      play: () => {
        (youtubePlayerRef.current as any)?.playVideo?.();
      },
      pause: () => {
        (youtubePlayerRef.current as any)?.pauseVideo?.();
      },
      seekTo: (sec: number) => {
        youtubePlayerRef.current?.seekTo?.(sec, true);
      },
    });

    return () => {
      registerActivePlayerBridge(null);
    };
  }, []);

  // ── 🛡️ Guarantee YouTube WebView stays silent whenever Native Engine owns playback ──
  useEffect(() => {
    if (activeEngine !== 'youtube') {
      (youtubePlayerRef.current as any)?.pauseVideo?.();
    }
  }, [activeEngine]);

  // ── 🛡️ Startup Watchdog: auto-recover only if YoutubePlayer genuinely stalls without ever starting ──
  useEffect(() => {
    if (activeEngine !== 'youtube' || !isPlaying || !currentTrack?.videoId) return;
    const targetVid = currentTrack.videoId;

    const nudgeTimer = setTimeout(() => {
      const latest = useAudioStore.getState();
      if (
        startedYoutubeVideoIdRef.current !== targetVid &&
        latest.activeEngine === 'youtube' &&
        latest.isPlaying &&
        !latest.isUserPauseAction &&
        latest.currentTrack?.videoId === targetVid
      ) {
        (youtubePlayerRef.current as any)?.playVideo?.();
      }
    }, 2200);

    const remountTimer = setTimeout(() => {
      const latest = useAudioStore.getState();
      if (
        startedYoutubeVideoIdRef.current !== targetVid &&
        latest.activeEngine === 'youtube' &&
        latest.isPlaying &&
        !latest.isUserPauseAction &&
        latest.currentTrack?.videoId === targetVid
      ) {
        if (retriedVideoIdRef.current !== targetVid) {
          retriedVideoIdRef.current = targetVid;
          setYoutubeRemountKey((k) => k + 1);
        }
      }
    }, 8000);

    return () => {
      clearTimeout(nudgeTimer);
      clearTimeout(remountTimer);
    };
  }, [activeEngine, isPlaying, currentTrack?.videoId]);

  // ── 📱 AppState Lifecycle: Background Keep-Alive + Non-Glitching Control Center + Instant Foreground Recovery ──
  useEffect(() => {
    let prevAppState = AppState.currentState;
    const timers: any[] = [];
    const clearTimers = () => {
      while (timers.length > 0) {
        clearTimeout(timers.pop());
      }
    };

    const sub = AppState.addEventListener('change', (nextState) => {
      const cameFromState = prevAppState;
      prevAppState = nextState;
      const latest = useAudioStore.getState();

      if (nextState === 'background') {
        enteredBackgroundAtRef.current = Date.now();
        bgAutoNudgeCountRef.current = 0;

        if (
          latest.backgroundAudioEnabled &&
          latest.isPlaying &&
          !latest.isUserPauseAction &&
          latest.activeEngine === 'youtube' &&
          latest.currentTrack?.videoId
        ) {
          startSilentBackgroundKeepAlive().catch(() => { });
          try {
            (youtubePlayerRef.current as any)?.playVideo?.();
          } catch { }
          clearTimers();
          timers.push(
            setTimeout(() => {
              const s = useAudioStore.getState();
              if (s.backgroundAudioEnabled && s.isPlaying && !s.isUserPauseAction && s.activeEngine === 'youtube') {
                (youtubePlayerRef.current as any)?.playVideo?.();
              }
            }, 150),
            setTimeout(() => {
              const s = useAudioStore.getState();
              if (s.backgroundAudioEnabled && s.isPlaying && !s.isUserPauseAction && s.activeEngine === 'youtube') {
                (youtubePlayerRef.current as any)?.playVideo?.();
              }
            }, 420)
          );
        }
      } else if (nextState === 'active') {
        clearTimers();
        enteredBackgroundAtRef.current = 0;
        bgAutoNudgeCountRef.current = 0;

        if (latest.activeEngine === 'youtube' && latest.currentTrack?.videoId) {
          const yt = youtubePlayerRef.current as any;
          if (yt) {
            Promise.all([yt.getCurrentTime?.(), yt.getDuration?.()])
              .then(([curSec, durSec]: any[]) => {
                if (typeof curSec === 'number' && !isNaN(curSec) && curSec >= 0) {
                  const curMs = Math.round(curSec * 1000);
                  const durMs =
                    typeof durSec === 'number' && durSec > 0
                      ? Math.round(durSec * 1000)
                      : latest.durationMillis;
                  useAudioStore.getState().updateProgress(curMs, durMs);
                }

                // Only auto-nudge & freeze-verify when actually returning from 'background' (screen lock / other app),
                // NEVER when merely closing Control Center ('inactive' -> 'active'), so Control Center Pause never bounces!
                if (cameFromState === 'background') {
                  const s = useAudioStore.getState();
                  if (s.isPlaying && !s.isUserPauseAction && s.activeEngine === 'youtube') {
                    yt.playVideo?.();
                    const baselineSec = typeof curSec === 'number' ? curSec : Math.floor(s.positionMillis / 1000);
                    const targetVid = s.currentTrack?.videoId;
                    timers.push(
                      setTimeout(() => {
                        const after = useAudioStore.getState();
                        if (
                          AppState.currentState !== 'active' ||
                          !after.isPlaying ||
                          after.isUserPauseAction ||
                          after.activeEngine !== 'youtube' ||
                          after.currentTrack?.videoId !== targetVid ||
                          startedYoutubeVideoIdRef.current !== targetVid
                        ) {
                          return;
                        }
                        yt.getCurrentTime?.()
                          .then((nowSec: number) => {
                            if (typeof nowSec === 'number' && Math.abs(nowSec - baselineSec) < 0.15) {
                              // Media decoder froze in backgrounded WebKit -> cleanly remount & seek to exact second
                              pendingYoutubeSeekSecRef.current = Math.max(0, Math.floor(baselineSec));
                              setYoutubeRemountKey((k) => k + 1);
                            }
                          })
                          .catch(() => { });
                      }, 2200)
                    );
                  }
                }
              })
              .catch(() => { });
          }
        } else if (NativeModules?.TrackPlayerModule && latest.activeEngine === 'native' && latest.currentTrack) {
          Promise.all([
            TrackPlayer.getProgress().catch(() => null),
            TrackPlayer.getPlaybackState().catch(() => null),
          ])
            .then(([prog, pb]) => {
              const cur = useAudioStore.getState();
              if (cur.activeEngine !== 'native') return;
              if (prog && typeof prog.position === 'number' && prog.position >= 0) {
                const durMs =
                  typeof prog.duration === 'number' && prog.duration > 2
                    ? Math.round(prog.duration * 1000)
                    : cur.durationMillis;
                useAudioStore.setState({
                  positionMillis: Math.round(prog.position * 1000),
                  durationMillis: durMs,
                });
              }
              if (pb?.state === State.Playing) {
                useAudioStore.setState({ isPlaying: true, isLoading: false, loadingTrackId: null });
              } else if (pb?.state === State.Paused || pb?.state === State.Stopped) {
                if (!cur.isLoading) {
                  useAudioStore.setState({ isPlaying: false });
                }
              }
            })
            .catch(() => { });
        }
      }
    });
    return () => {
      clearTimers();
      sub.remove();
    };
  }, []);

  // ── 🛡️ Foreground Playback Progress Monitor: auto-recovers only an already-started WebView that freezes ──
  useEffect(() => {
    if (!isPlaying || activeEngine !== 'youtube' || !currentTrack?.videoId) return;
    let lastCheckedPos = useAudioStore.getState().positionMillis;
    let stagnantTicks = 0;
    let recoveredOnceForPos = -1;

    const monitor = setInterval(() => {
      if (AppState.currentState !== 'active') {
        stagnantTicks = 0;
        return;
      }
      const s = useAudioStore.getState();
      if (
        !s.isPlaying ||
        s.isUserPauseAction ||
        s.activeEngine !== 'youtube' ||
        startedYoutubeVideoIdRef.current !== s.currentTrack?.videoId
      ) {
        stagnantTicks = 0;
        return;
      }
      if (Math.abs(s.positionMillis - lastCheckedPos) > 150) {
        lastCheckedPos = s.positionMillis;
        stagnantTicks = 0;
        return;
      }
      stagnantTicks += 1;
      if (stagnantTicks === 4) {
        (youtubePlayerRef.current as any)?.playVideo?.();
      } else if (stagnantTicks >= 9 && recoveredOnceForPos !== Math.floor(s.positionMillis / 1000)) {
        const sec = Math.max(0, Math.floor(s.positionMillis / 1000));
        recoveredOnceForPos = sec;
        stagnantTicks = 0;
        pendingYoutubeSeekSecRef.current = sec;
        setYoutubeRemountKey((k) => k + 1);
      }
    }, 1000);

    return () => clearInterval(monitor);
  }, [isPlaying, activeEngine, currentTrack?.videoId]);

  // ── Unified Next / Prev Handlers (Avoids async seekTo collision before track switch) ──
  const handleNextPress = useCallback(async () => {
    await nextTrack();
  }, [nextTrack]);

  const handlePrevPress = useCallback(async () => {
    await prevTrack();
  }, [prevTrack]);

  // ── Sync Scrubber & Time during YouTube Playback (500ms low-overhead polling) ──
  useEffect(() => {
    if (!isPlaying || activeEngine !== 'youtube') return;
    const interval = setInterval(async () => {
      try {
        const activeRef = youtubePlayerRef.current;
        if (activeRef) {
          const [curSec, durSec] = await Promise.all([
            activeRef.getCurrentTime(),
            activeRef.getDuration(),
          ]);
          if (typeof curSec === 'number' && !isNaN(curSec) && curSec >= 0) {
            const curMs = Math.round(curSec * 1000);
            const durMs = typeof durSec === 'number' && durSec > 0 ? Math.round(durSec * 1000) : (currentTrack?.duration || 0);
            useAudioStore.getState().updateProgress(curMs, durMs);
          }
        }
      } catch (e) { }
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying, activeEngine, currentTrack?.duration]);

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
  const handleSwitchToCover = useCallback(() => {
    Haptics.selectionAsync();
    setLastUserToggleTimestamp(Date.now());
    isSwitchingModeRef.current = true;
    setTimeout(() => {
      isSwitchingModeRef.current = false;
    }, 600);

    modeTranslate.value = withSpring(0, {
      stiffness: 280,
      damping: 26,
      mass: 0.8,
    });

    setPlayerMediaMode('cover');
  }, [setPlayerMediaMode]);

  const handleSwitchToVideo = useCallback(() => {
    Haptics.selectionAsync();
    setLastUserToggleTimestamp(Date.now());
    isSwitchingModeRef.current = true;
    setTimeout(() => {
      isSwitchingModeRef.current = false;
    }, 600);

    modeTranslate.value = withSpring(1, {
      stiffness: 280,
      damping: 26,
      mass: 0.8,
    });

    const latest = useAudioStore.getState();
    if (latest.currentTrack?.videoId && latest.activeEngine === 'native') {
      const posSec = Math.max(0, Math.floor(latest.positionMillis / 1000));
      pendingYoutubeSeekSecRef.current = posSec;
      if (NativeModules?.TrackPlayerModule) {
        TrackPlayer.pause().catch(() => { });
      }
      useAudioStore.setState({ activeEngine: 'youtube' });
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
  // Start 120 FPS UI-thread spring IMMEDIATELY before syncing React visibility state
  fullTranslateY.value = withSpring(0, SPRING_CONFIG);
  requestAnimationFrame(() => {
    setPlayerModalVisible(true);
  });
}, [setPlayerModalVisible]);

// ── Intelligent Zero-Cut Collapse Handover ──
// Keeps UnifiedPlayerSheet persistent audio uninterrupted when collapsing to mini player
const triggerCollapseHandover = useCallback(() => {
  isSwitchingModeRef.current = true;
  setPlayerModalVisible(false);
  setTimeout(() => {
    isSwitchingModeRef.current = false;
  }, 450);
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
if (isMiniPlayerSuppressed || isAuthScreen) return null;

// Render at minimum the scroll-collapsed [Home] & [Search] quick dock on Artist/Album/Music screens even when no song is queued
const showQuickDockWithoutTrack =
  !currentTrack && isCompactDockActive && currentRouteName !== 'DashboardTab';
if (!currentTrack && !showQuickDockWithoutTrack) return null;

const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.videoId) : false;
const isSavedInLibrary = currentTrack ? savedLibraryTrackIds.includes(currentTrack.videoId) : false;
const resolvedArtistAvatar = getUniversalArtistAvatar(
  currentTrack?.artistAvatar,
  currentTrack?.artist
);

return (
  <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents="box-none">
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

                <View style={[styles.headerSlotSide, { alignItems: 'flex-end' }]}>
                  <TouchableOpacity
                    onPress={handleDownloadPress}
                    disabled={isDownloading}
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
                    {isDownloading ? (
                      <View style={styles.downloadSpinnerWrap}>
                        <ActivityIndicator size="small" color="#10B981" />
                      </View>
                    ) : isDownloaded ? (
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    ) : (
                      <Ionicons
                        name="arrow-down-outline"
                        size={19}
                        color={isDark ? '#FFFFFF' : theme.textPrimary}
                      />
                    )}
                  </TouchableOpacity>
                </View>
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

        {/* ════════════════════════════════════════════════════════════════════════
            3. UNIFIED ZERO-UNMOUNT VIDEO STAGE (Direct Root Child of fullPlayerOverlay)
            - Cover Mode: Placed offscreen (left: -9999), audio plays with 0 interruption
            - Normal Video Mode: Absolute positioned right above the center stage placeholder
            - Fullscreen Video Mode: 100% viewport coverage, covers header, grabs full screen
           ════════════════════════════════════════════════════════════════════════ */}
        {/* 🛡️ Zero-Glitch Fullscreen Solid Black Curtain (Blocks any rotation gradient flash 100%) */}
        {isVideoFullscreen && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: '#000000',
                zIndex: 99998,
              },
            ]}
            pointerEvents="none"
          />
        )}

        <View
          style={unifiedVideoWrapperStyle}
          pointerEvents={
            isVideoFullscreen
              ? 'box-none'
              : playerMediaMode === 'video'
                ? 'auto'
                : 'none'
          }
        >
          {/* Clean 16:9 Cinema Video Box (Spotify & YouTube Music Standard) OR Edge-to-Edge Fullscreen Frame */}
          <View
            style={
              isVideoFullscreen
                ? [
                  styles.videoFullscreenFrame,
                  {
                    width: fullscreenVideoDims.width,
                    height: fullscreenVideoDims.height,
                  },
                ]
                : [
                  styles.videoFrameContainer,
                  {
                    width: cardWidth,
                    height: cardVideoHeight,
                  },
                ]
            }
            pointerEvents={isVideoFullscreen ? 'none' : 'auto'}
          >
            {activeEngine === 'youtube' && currentTrack?.videoId ? (
              <TouchableOpacity
                activeOpacity={1}
                onPress={handlePlayPausePress}
                style={[
                  styles.videoPlayerInnerWrapper,
                  isVideoFullscreen && { borderRadius: 0 },
                ]}
                disabled={playerMediaMode === 'cover' || isVideoFullscreen}
              >
                <YoutubePlayer
                  key={youtubeRemountKey}
                  ref={youtubePlayerRef}
                  height={isVideoFullscreen ? fullscreenVideoDims.height : cardVideoHeight}
                  width={isVideoFullscreen ? fullscreenVideoDims.width : cardWidth}
                  play={activeEngine === 'youtube' && isPlaying}
                  videoId={currentTrack.videoId}
                  initialPlayerParams={stablePlayerParams}
                  onReady={() => {
                    const seekSec = pendingYoutubeSeekSecRef.current;
                    if (typeof seekSec === 'number' && seekSec > 0) {
                      pendingYoutubeSeekSecRef.current = null;
                      youtubePlayerRef.current?.seekTo?.(seekSec, true);
                    }
                    const latest = useAudioStore.getState();
                    if (latest.activeEngine === 'youtube' && latest.isPlaying && !latest.isUserPauseAction) {
                      (youtubePlayerRef.current as any)?.playVideo?.();
                    }
                  }}
                  onChangeState={(state: string) => {
                    if (state === 'ended') {
                      if (bgRecoveryTimerRef.current) {
                        clearTimeout(bgRecoveryTimerRef.current);
                        bgRecoveryTimerRef.current = null;
                      }
                      useAudioStore.getState().handleTrackEnded();
                    } else if (state === 'playing') {
                      bgAutoNudgeCountRef.current = 0;
                      if (bgRecoveryTimerRef.current) {
                        clearTimeout(bgRecoveryTimerRef.current);
                        bgRecoveryTimerRef.current = null;
                      }
                      if (typeof pendingYoutubeSeekSecRef.current === 'number' && pendingYoutubeSeekSecRef.current > 0) {
                        const seekSec = pendingYoutubeSeekSecRef.current;
                        pendingYoutubeSeekSecRef.current = null;
                        youtubePlayerRef.current?.seekTo?.(seekSec, true);
                      }
                      startedYoutubeVideoIdRef.current = currentTrack?.videoId || null;
                      const storeState = useAudioStore.getState();
                      if (storeState.backgroundAudioEnabled) {
                        startSilentBackgroundKeepAlive().catch(() => { });
                      }
                      useAudioStore.setState({
                        isPlaying: true,
                        isUserPauseAction: false,
                        isLoading: false,
                        loadingTrackId: null,
                      });
                    } else if (state === 'paused') {
                      if (isSwitchingModeRef.current) return;
                      const storeState = useAudioStore.getState();
                      if (storeState.isUserPauseAction || !storeState.isPlaying) {
                        pauseSilentBackgroundKeepAlive();
                        useAudioStore.setState({ isPlaying: false, isLoading: false });
                        return;
                      }
                      // Ignore transient 'paused' emitted while unloading previous video before new videoId starts
                      if (startedYoutubeVideoIdRef.current !== currentTrack?.videoId) {
                        return;
                      }

                      // Background Audio Guard: ONLY fight WebKit's automatic background suspension during the initial 1800ms
                      // right after AppState === 'background'. In 'inactive' (Control Center white badge) or after 1800ms (Lock Screen pause),
                      // ALWAYS respect the user's Pause command cleanly without bounce-back glitching!
                      if (AppState.currentState === 'background') {
                        if (!storeState.backgroundAudioEnabled) {
                          storeState.pauseTrack();
                          return;
                        }
                        const inBgTransitionWindow =
                          enteredBackgroundAtRef.current > 0 &&
                          Date.now() - enteredBackgroundAtRef.current < 1800;

                        if (inBgTransitionWindow && bgAutoNudgeCountRef.current < 3) {
                          bgAutoNudgeCountRef.current += 1;
                          startSilentBackgroundKeepAlive().catch(() => { });
                          try {
                            (youtubePlayerRef.current as any)?.playVideo?.();
                          } catch { }
                          return;
                        }
                      }

                      // User tapped Pause in Control Center ('inactive'), Lock Screen, or App
                      pauseSilentBackgroundKeepAlive();
                      useAudioStore.setState({ isPlaying: false, isUserPauseAction: true, isLoading: false });
                    }
                  }}
                  onError={(err: string) => {
                    // Only trigger native embed fallback on fatal embed copyright blocks (101/150/embed_not_allowed)
                    if (err === 'embed_not_allowed' || err === 'video_not_found') {
                      useAudioStore.getState().handlePlaybackFallback();
                    }
                  }}
                  webViewProps={cleanYoutubeWebViewProps}
                />

                {/* YouTube Style Fullscreen Expand Icon (Bottom-Right Corner Only, Video Mode Only, Not in Fullscreen) */}
                {playerMediaMode === 'video' && !isVideoFullscreen && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      isSwitchingModeRef.current = true;
                      setVideoFullscreen(true);
                      setTimeout(() => {
                        isSwitchingModeRef.current = false;
                      }, 800);
                    }}
                    style={styles.youtubeFullscreenBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="scan-outline" size={17} color="#FFFFFF" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ) : (
              /* Clean Minimal Fallback if offline */
              <View style={styles.videoNativeFallbackWrap}>
                <Ionicons name="musical-notes" size={32} color={tint.accent || '#1DB954'} />
                <TouchableOpacity
                  style={styles.videoReturnCoverBtn}
                  onPress={handleSwitchToCover}
                >
                  <Text style={styles.videoReturnCoverBtnText}>Music</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ── IN-PLACE FULLSCREEN HUD OVERLAY (Mounted directly above single uninterrupted YouTube player) ── */}
          {isVideoFullscreen && (
            <InPlaceFullscreenHud
              visible={isVideoFullscreen}
              screenWidth={windowWidth}
              screenHeight={windowHeight}
              onClose={() => {
                isSwitchingModeRef.current = true;
                setVideoFullscreen(false);
                setTimeout(() => {
                  isSwitchingModeRef.current = false;
                }, 500);
              }}
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
          )}
        </View>
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
                  {heroArtworkSources && heroArtworkSources.length > 0 ? (
                    <Image
                      source={heroArtworkSources}
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

        {/* ════════════════════════════════════════════════════════════════════════
            Apple Music Liquid Glass Options Sheet (... Context Menu)
           ════════════════════════════════════════════════════════════════════════ */}
        <Modal
          visible={trackMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setTrackMenuVisible(false)}
        >
          <TouchableOpacity
            style={styles.trackMenuBackdrop}
            activeOpacity={1}
            onPress={() => setTrackMenuVisible(false)}
          >
            <BlurView
              intensity={isDark ? 35 : 28}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={[styles.trackMenuCardWrap, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}
            >
              <LiquidGlassSurface
                glassStyle="regular"
                isInteractive={false}
                isDark={isDark}
                borderRadius={26}
                style={[
                  styles.trackMenuCard,
                  {
                    backgroundColor: isDark ? 'rgba(24, 26, 36, 0.88)' : 'rgba(255, 255, 255, 0.92)',
                    borderColor: isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.08)',
                  },
                ]}
              >
                {/* Track Preview Header */}
                <View
                  style={[
                    styles.trackMenuHeader,
                    {
                      flexDirection: isAr ? 'row-reverse' : 'row',
                      borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                    },
                  ]}
                >
                  <Image
                    source={heroArtworkSources}
                    style={styles.trackMenuThumb}
                    {...STUDIO_IMAGE_PROPS}
                  />
                  <View style={[styles.trackMenuMeta, { marginHorizontal: 12 }]}>
                    <MarqueeText
                      text={currentTrack.title || 'Track'}
                      style={[
                        styles.trackMenuTitle,
                        { color: isDark ? '#FFFFFF' : '#0F172A', writingDirection: isAr ? 'rtl' : 'ltr' },
                      ]}
                      speedPxPerSec={26}
                    />
                    <Text
                      style={[
                        styles.trackMenuArtist,
                        {
                          color: isDark ? 'rgba(255,255,255,0.68)' : 'rgba(15,23,42,0.65)',
                          textAlign: isAr ? 'right' : 'left',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {currentTrack.artist || 'Artist'}
                    </Text>
                  </View>
                </View>

                {/* 1. Go to Artist */}
                <TouchableOpacity
                  style={[styles.trackMenuRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                  activeOpacity={0.75}
                  onPress={handleGoToArtist}
                >
                  <Ionicons
                    name="person-circle-outline"
                    size={22}
                    color={isDark ? '#FFFFFF' : '#0F172A'}
                  />
                  <Text
                    style={[
                      styles.trackMenuRowText,
                      { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: isAr ? 'right' : 'left' },
                    ]}
                  >
                    {isAr ? 'الانتقال إلى الفنان' : 'Go to Artist'}
                  </Text>
                  <Ionicons
                    name={isAr ? 'chevron-back' : 'chevron-forward'}
                    size={16}
                    color={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.40)'}
                  />
                </TouchableOpacity>

                {/* 2. Go to Album */}
                <TouchableOpacity
                  style={[styles.trackMenuRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                  activeOpacity={0.75}
                  disabled={resolvingAlbum}
                  onPress={handleGoToAlbum}
                >
                  {resolvingAlbum ? (
                    <ActivityIndicator size="small" color={isDark ? '#FFFFFF' : '#0F172A'} />
                  ) : (
                    <Ionicons
                      name="disc-outline"
                      size={22}
                      color={isDark ? '#FFFFFF' : '#0F172A'}
                    />
                  )}
                  <Text
                    style={[
                      styles.trackMenuRowText,
                      { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: isAr ? 'right' : 'left' },
                    ]}
                  >
                    {isAr ? 'الانتقال إلى الألبوم' : 'Go to Album'}
                  </Text>
                  <Ionicons
                    name={isAr ? 'chevron-back' : 'chevron-forward'}
                    size={16}
                    color={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.40)'}
                  />
                </TouchableOpacity>

                {/* 3. Add to Library + Quick Playlists */}
                <TouchableOpacity
                  style={[styles.trackMenuRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                  activeOpacity={0.75}
                  onPress={async () => {
                    await handleAddToLibraryPress();
                    setTrackMenuVisible(false);
                  }}
                >
                  <Ionicons
                    name={isSavedInLibrary ? 'checkmark-circle' : 'add-circle-outline'}
                    size={22}
                    color={isSavedInLibrary ? '#34D399' : isDark ? '#FFFFFF' : '#0F172A'}
                  />
                  <Text
                    style={[
                      styles.trackMenuRowText,
                      { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: isAr ? 'right' : 'left' },
                    ]}
                  >
                    {isSavedInLibrary
                      ? isAr
                        ? 'مضافة في مكتبتك (إزالة)'
                        : 'Saved in Library (Remove)'
                      : isAr
                        ? 'إضافة إلى المكتبة'
                        : 'Add to Library'}
                  </Text>
                </TouchableOpacity>

                {user?.id && (
                  <TouchableOpacity
                    style={[styles.trackMenuRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                    activeOpacity={0.75}
                    onPress={() => setShowPlaylistPicker((prev) => !prev)}
                  >
                    <Ionicons
                      name="list-outline"
                      size={22}
                      color={isDark ? '#FFFFFF' : '#0F172A'}
                    />
                    <Text
                      style={[
                        styles.trackMenuRowText,
                        { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: isAr ? 'right' : 'left' },
                      ]}
                    >
                      {isAr ? 'إضافة إلى قائمة تشغيل' : 'Add to Playlist'}
                    </Text>
                    <Ionicons
                      name={showPlaylistPicker ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.40)'}
                    />
                  </TouchableOpacity>
                )}

                {showPlaylistPicker && (
                  <View style={styles.playlistSubList}>
                    {loadingPlaylists ? (
                      <ActivityIndicator size="small" color="#0A84FF" style={{ marginVertical: 8 }} />
                    ) : userPlaylists.length === 0 ? (
                      <Text
                        style={{
                          fontSize: 12.5,
                          color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.55)',
                          paddingVertical: 6,
                          textAlign: isAr ? 'right' : 'left',
                        }}
                      >
                        {isAr ? 'لا توجد قوائم تشغيل بعد — أنشئ واحدة من المكتبة' : 'No playlists yet — create one in Library'}
                      </Text>
                    ) : (
                      userPlaylists.slice(0, 5).map((pl) => (
                        <TouchableOpacity
                          key={pl.id}
                          activeOpacity={0.75}
                          onPress={() => handleAddTrackToPlaylist(pl)}
                          style={[
                            styles.playlistSubRow,
                            {
                              flexDirection: isAr ? 'row-reverse' : 'row',
                              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)',
                            },
                          ]}
                        >
                          <Ionicons name="musical-notes" size={16} color="#0A84FF" />
                          <Text
                            style={{
                              flex: 1,
                              color: isDark ? '#FFFFFF' : '#0F172A',
                              fontSize: 13.5,
                              fontWeight: '600',
                              marginHorizontal: 10,
                              textAlign: isAr ? 'right' : 'left',
                            }}
                            numberOfLines={1}
                          >
                            {pl.name}
                          </Text>
                          <Ionicons name="add" size={18} color="#0A84FF" />
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}

                {/* 4. Favorite */}
                <TouchableOpacity
                  style={[styles.trackMenuRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                  activeOpacity={0.75}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    toggleLike(currentTrack);
                    setTrackMenuVisible(false);
                  }}
                >
                  <Ionicons
                    name={isLiked ? 'heart' : 'heart-outline'}
                    size={22}
                    color={isLiked ? '#FF375F' : isDark ? '#FFFFFF' : '#0F172A'}
                  />
                  <Text
                    style={[
                      styles.trackMenuRowText,
                      { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: isAr ? 'right' : 'left' },
                    ]}
                  >
                    {isLiked
                      ? isAr
                        ? 'إزالة من المفضلة'
                        : 'Remove from Favorites'
                      : isAr
                        ? 'إضافة إلى المفضلة'
                        : 'Favorite'}
                  </Text>
                </TouchableOpacity>

                {/* 5. Share */}
                <TouchableOpacity
                  style={[styles.trackMenuRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                  activeOpacity={0.75}
                  onPress={() => {
                    setTrackMenuVisible(false);
                    handleShare();
                  }}
                >
                  <Ionicons
                    name="share-outline"
                    size={22}
                    color={isDark ? '#FFFFFF' : '#0F172A'}
                  />
                  <Text
                    style={[
                      styles.trackMenuRowText,
                      { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: isAr ? 'right' : 'left' },
                    ]}
                  >
                    {isAr ? 'مشاركة' : 'Share'}
                  </Text>
                </TouchableOpacity>

                {/* 6. Cancel */}
                <TouchableOpacity
                  style={[
                    styles.trackMenuCancelBtn,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' },
                  ]}
                  activeOpacity={0.75}
                  onPress={() => setTrackMenuVisible(false)}
                >
                  <Text style={[styles.trackMenuCancelTxt, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </Text>
                </TouchableOpacity>
              </LiquidGlassSurface>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </Animated.View>
    </>
  )
}
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
  videoFullscreenFrame: {
    overflow: 'hidden',
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoFrameContainer: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 18,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  videoPlayerInnerWrapper: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  youtubeFullscreenBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  videoNativeFallbackWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
  },
  videoReturnCoverBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  videoReturnCoverBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
  trackMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  trackMenuCardWrap: {
    paddingHorizontal: 14,
  },
  trackMenuCard: {
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    overflow: 'hidden',
  },
  trackMenuHeader: {
    alignItems: 'center',
    paddingBottom: 14,
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  trackMenuThumb: {
    width: 50,
    height: 50,
    borderRadius: 10,
  },
  trackMenuMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  trackMenuTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  trackMenuArtist: {
    fontSize: 13.5,
    fontWeight: '500',
    marginTop: 2,
  },
  trackMenuRow: {
    alignItems: 'center',
    gap: 13,
    paddingVertical: 13,
  },
  trackMenuRowText: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '600',
  },
  playlistSubList: {
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 8,
    gap: 6,
  },
  playlistSubRow: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },
  trackMenuCancelBtn: {
    marginTop: 8,
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: 'center',
  },
  trackMenuCancelTxt: {
    fontSize: 15.5,
    fontWeight: '700',
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
