import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
  Share,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { useAudioStore, Track } from '../store/useAudioStore';
import { getUniversalStudioArtwork, getUniversalStudioArtworkSource } from '../utils/artworkHelper';
import { cleanArtistName } from '../services/youtubeMusicService';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import { CoverFlowMusicCarousel } from '../components/CoverFlowMusicCarousel';
import { getTrackAtmosphericTint } from '../services/atmosphericColorEngine';
import {
  fetchInitialInfiniteRadio,
  fetchInfiniteRadioNextBatch,
  getCachedInfiniteRadio,
  analyzeUserVibe,
  recordUserSignal,
} from '../services/infiniteRecommendationEngine';
import { musicDnaService } from '../services/musicDnaService';

const { width } = Dimensions.get('window');

interface DashboardTrack extends Track {
  id: string;
}

const cleanText = (str?: string): string => {
  if (!str) return '';
  return str
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
    .trim();
};

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.background,
    },
    scrollContent: {
      paddingBottom: 20,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginBottom: 8,
    },
    avatarWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1.2,
      borderColor: theme.border,
    },
    avatarImg: {
      width: '100%',
      height: '100%',
    },
    avatarFallback: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.surfaceSubtle,
      justifyContent: 'center',
      alignItems: 'center',
    },
    ultraMinimalPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      height: 38,
      borderRadius: 19,
      overflow: 'hidden',
      position: 'relative',
      gap: 7,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      ...Platform.select({
        ios: {
          shadowColor: theme.cardShadow.shadowColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: theme.cardShadow.shadowOpacity,
          shadowRadius: 8,
        },
        android: {
          elevation: theme.cardShadow.elevation,
        },
      }),
    },
    pillGlassOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor:
        Platform.OS === 'ios'
          ? (theme.mode === 'light' ? 'rgba(240, 239, 234, 0.82)' : 'rgba(18, 18, 24, 0.78)')
          : theme.androidSurfaceFallback,
    },
    pillMetricText: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    pillDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: theme.textMuted,
    },
    pillRunsText: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    // ── Compact Smart Music Widget Styles (~110px) ──
    smartWidgetContainer: {
      marginHorizontal: 16,
      marginTop: 4,
      marginBottom: 10,
      height: 106,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      ...Platform.select({
        ios: {
          shadowColor: theme.cardShadow.shadowColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: theme.cardShadow.shadowOpacity,
          shadowRadius: 8,
        },
        android: {
          elevation: theme.cardShadow.elevation,
        },
      }),
    },
    smartWidgetArtworkWrap: {
      width: 82,
      height: 82,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: theme.surfaceSubtle,
      position: 'relative',
    },
    smartWidgetArtwork: {
      width: '100%',
      height: '100%',
    },
    smartWidgetPlayBadge: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    smartWidgetInfo: {
      flex: 1,
      paddingHorizontal: 12,
      justifyContent: 'center',
    },
    smartWidgetBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 3,
    },
    smartWidgetTag: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    smartWidgetTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: -0.2,
      marginBottom: 2,
    },
    smartWidgetArtistRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    smartWidgetArtist: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '500',
      maxWidth: 130,
    },
    smartWidgetProgressTrack: {
      height: 3,
      borderRadius: 1.5,
      backgroundColor: theme.surfaceSubtle,
      overflow: 'hidden',
      width: '100%',
    },
    smartWidgetProgressFill: {
      height: '100%',
      backgroundColor: '#1DB954',
      borderRadius: 1.5,
    },
    smartWidgetControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    smartWidgetControlBtn: {
      padding: 4,
      justifyContent: 'center',
      alignItems: 'center',
    },
    smartWidgetPlayBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: '#1DB954',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 3,
      elevation: 3,
    },
  });

// ── "Your Vibe" Dynamic Initial Queue Builder (Zero Hardcoded Injections) ──
const buildInitialQueue = (
  activeTrack: Track | null,
  history: Track[],
  likedIds: string[]
): DashboardTrack[] => {
  const result: DashboardTrack[] = [];
  const seenIds = new Set<string>();

  const addTrack = (t?: Track | null) => {
    if (!t) return;
    const vid = t.videoId || (t as any).id;
    if (!vid || seenIds.has(vid)) return;
    seenIds.add(vid);
    result.push({
      ...t,
      id: vid,
      videoId: vid,
      duration: t.duration || 180000,
    });
  };

  // Prioritize active listening track
  if (activeTrack) addTrack(activeTrack);

  // Add recent history tracks
  if (history && history.length > 0) {
    history.slice(0, 15).forEach(addTrack);
  }

  return result;
};

interface HomeAmbientCanvasProps {
  track?: Track;
  isDark: boolean;
}

const HomeAmbientCanvas: React.FC<HomeAmbientCanvasProps> = React.memo(({ track, isDark }) => {
  const ambientArtworkSources = useMemo(() => {
    return getUniversalStudioArtworkSource(
      track?.thumbnail,
      track?.title,
      track?.artist,
      track?.videoId
    );
  }, [track?.videoId, track?.thumbnail, track?.title, track?.artist]);

  const homeTint = useMemo(
    () => getTrackAtmosphericTint(track, isDark),
    [track?.videoId, isDark]
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Foundation Base Ground */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? (homeTint.bottom || '#080A10') : '#F4F3EE' },
        ]}
      />

      {/* Layer A: Full-Bleed GPU Blurred Artwork (100% True Authentic Colors of Focused Card) */}
      {ambientArtworkSources && ambientArtworkSources.length > 0 && (
        <Image
          source={ambientArtworkSources}
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [{ scale: 1.5 }],
              opacity: isDark ? 0.75 : 0.55,
            },
          ]}
          contentFit="cover"
          blurRadius={Platform.OS === 'ios' ? 60 : 38}
          priority="high"
          cachePolicy="memory-disk"
          transition={500}
        />
      )}

      {/* Layer B: Apple Music Frosted Glass Diffusion Veil */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 45 : 30}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />

      {/* Layer C: Cinematic Vignette (Preserves Text, Stats Pill & Workout Feed Contrast) */}
      <LinearGradient
        colors={
          isDark
            ? [
                'rgba(8, 10, 16, 0.60)',
                'rgba(8, 10, 16, 0.12)',
                'rgba(8, 10, 16, 0.00)',
                'rgba(8, 10, 16, 0.50)',
                'rgba(8, 10, 16, 0.95)',
              ]
            : [
                'rgba(255, 255, 255, 0.70)',
                'rgba(255, 255, 255, 0.15)',
                'rgba(255, 255, 255, 0.00)',
                'rgba(244, 243, 238, 0.55)',
                'rgba(244, 243, 238, 0.95)',
              ]
        }
        locations={[0, 0.18, 0.38, 0.65, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
});

export const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── Audio Store & State ──
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const audioQueue = useAudioStore((s) => s.queue);
  const currentContextName = useAudioStore((s) => s.currentContextName);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const toggleLike = useAudioStore((s) => s.toggleLike);
  const likedTrackIds = useAudioStore((s) => s.likedTrackIds);
  const playTrack = useAudioStore((s) => s.playTrack);
  const nextTrack = useAudioStore((s) => s.nextTrack);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);
  const history = useAudioStore((s) => s.history);

  // ── 1. "Your Vibe" Dynamic Infinite Radio Queue ──
  const [tracks, setTracks] = useState<DashboardTrack[]>(() =>
    buildInitialQueue(currentTrack, history, likedTrackIds)
  );

  // 🚀 Live Background Discovery: Loads cache with 0ms delay then queries fresh YouTube Music radio
  useEffect(() => {
    let isMounted = true;
    const loadDynamicRadio = async () => {
      try {
        // Fast 0ms cache load
        const cached = await getCachedInfiniteRadio();
        if (cached && cached.length > 0 && isMounted) {
          setTracks((prev) => {
            const seen = new Set(prev.map((t) => t.videoId));
            const toAdd = cached.filter((t) => t.videoId && !seen.has(t.videoId));
            return toAdd.length > 0
              ? [...prev, ...toAdd.map((t) => ({ ...t, id: t.videoId }))]
              : prev;
          });
        }

        // Live YouTube Music dynamic radio generation (tailored to user taste & Algerian/Athletic vibes)
        const fresh = await fetchInitialInfiniteRadio(currentTrack, history, likedTrackIds);
        if (fresh && fresh.length > 0 && isMounted) {
          setTracks((prev) => {
            const seen = new Set<string>();
            const merged: DashboardTrack[] = [];

            // Maintain current playing track at position 0
            if (currentTrack?.videoId) {
              seen.add(currentTrack.videoId);
              merged.push({ ...currentTrack, id: currentTrack.videoId });
            } else if (prev.length > 0 && prev[0]?.videoId) {
              seen.add(prev[0].videoId);
              merged.push(prev[0]);
            }

            for (const t of fresh) {
              if (t.videoId && !seen.has(t.videoId)) {
                seen.add(t.videoId);
                merged.push({ ...t, id: t.videoId });
              }
            }

            return merged.length > 0 ? merged : prev;
          });
        }
      } catch (err) {
        console.warn('[DashboardScreen] Dynamic radio load warning:', err);
      }
    };

    loadDynamicRadio();
    return () => {
      isMounted = false;
    };
  }, []);

  // 🔄 Infinite Auto-Append: Called when user swipes within 4 cards of the end
  const isFetchingMoreRef = useRef(false);
  const handleLoadMoreTracks = useCallback(async () => {
    if (isFetchingMoreRef.current) return;
    isFetchingMoreRef.current = true;

    try {
      const activeFocal = currentTrack || tracks[tracks.length - 1];
      if (!activeFocal) return;

      const existingIds = new Set(tracks.map((t) => t.videoId).filter(Boolean) as string[]);
      const newBatch = await fetchInfiniteRadioNextBatch(activeFocal, existingIds);

      if (newBatch.length > 0) {
        setTracks((prev) => {
          const seen = new Set(prev.map((t) => t.videoId));
          const toAdd: DashboardTrack[] = [];
          for (const nb of newBatch) {
            if (nb.videoId && !seen.has(nb.videoId)) {
              seen.add(nb.videoId);
              toAdd.push({ ...nb, id: nb.videoId });
            }
          }
          const updated = toAdd.length > 0 ? [...prev, ...toAdd] : prev;
          if (useAudioStore.getState().currentContextName === 'Dashboard' && toAdd.length > 0) {
            useAudioStore.setState({ queue: updated, currentQueue: updated });
          }
          return updated;
        });
      }
    } catch (e) {
      console.warn('[DashboardScreen] Infinite radio load more error:', e);
    } finally {
      isFetchingMoreRef.current = false;
    }
  }, [tracks, currentTrack]);

  // 🔄 Synchronize audio store queue into Cover Flow cards when in Dashboard context
  useEffect(() => {
    if (currentContextName === 'Dashboard' && audioQueue.length > tracks.length) {
      setTracks((prev) => {
        const seen = new Set(prev.map((t) => t.videoId));
        const missing = audioQueue.filter((t) => t.videoId && !seen.has(t.videoId));
        if (missing.length > 0) {
          return [...prev, ...missing.map((t) => ({ ...t, id: t.videoId }))];
        }
        return prev;
      });
    }
  }, [audioQueue, currentContextName, tracks.length]);

  useEffect(() => {
    if (currentTrack?.videoId) {
      const foundIdx = tracks.findIndex((t) => t.videoId === currentTrack.videoId);
      if (foundIdx === -1) {
        const newTrack: DashboardTrack = {
          ...currentTrack,
          id: currentTrack.videoId,
        };
        // Append to the end so existing card queue indices are never shifted or scrambled
        setTracks((prev) => [...prev, newTrack]);
      }
    }
  }, [currentTrack?.videoId]);

  // 🎨 Real-time Focused Card in Carousel for Dynamic Home Ambient Canvas
  const [activeCarouselTrack, setActiveCarouselTrack] = useState<Track | null>(null);

  const handleActiveCardChange = useCallback((track: Track) => {
    if (!track?.videoId) return;
    setActiveCarouselTrack((prev) => (prev?.videoId === track.videoId ? prev : track));
  }, []);

  // Synchronize activeCarouselTrack when currentTrack changes externally (Mini Player, Lock Screen)
  useEffect(() => {
    if (currentTrack?.videoId) {
      setActiveCarouselTrack(currentTrack);
    }
  }, [currentTrack?.videoId]);

  const homeAmbientTrack: Track | undefined = activeCarouselTrack || currentTrack || tracks[0];

  const handleSelectCarouselTrack = useCallback(
    (selected: Track) => {
      handleActiveCardChange(selected);
      const idx = tracks.findIndex((t) => t.videoId === selected.videoId);
      const resolvedIdx = idx !== -1 ? idx : 0;
      recordUserSignal(selected, 'play');
      musicDnaService.recordListeningSignal(selected, 'play');
      // 🚀 Direct automatic playback on card swipe!
      playTrack(selected, tracks, resolvedIdx, 'Dashboard');
    },
    [tracks, handleActiveCardChange, playTrack]
  );

  const miniBottomGap = useMiniPlayerBottomGap();

  const activeTrack: Track | undefined = currentTrack || tracks[0];
  const isLiked = activeTrack?.videoId ? likedTrackIds.includes(activeTrack.videoId) : false;

  const handlePressPlay = useCallback(
    (track: Track) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      if (currentTrack?.videoId === track.videoId) {
        togglePlay();
      } else {
        playTrack(track, tracks, 0, 'Dashboard');
      }
    },
    [currentTrack?.videoId, togglePlay, playTrack, tracks]
  );

  const handlePressLike = useCallback(
    (track: Track) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleLike(track);
    },
    [toggleLike]
  );

  const fetchData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();
      if (prof) setProfile(prof);
    } catch (err) {
      // Non-blocking: network timeout or offline boot
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  return (
    <View style={styles.container}>
      {/* ── 0. Home Screen Dynamic Ambient Canvas (Pure 1:1 Cover Art Reflection) ── */}
      <HomeAmbientCanvas track={homeAmbientTrack} isDark={isDark} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            flexGrow: 1,
            justifyContent: 'center',
            paddingTop: insets.top + 8,
            paddingBottom: Math.max(miniBottomGap, 60),
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textPrimary}
          />
        }
      >
        {/* ── 3D Arc Cover Flow Carousel (5-Cards in Perspective, Zero Clutter) ── */}
        <CoverFlowMusicCarousel
          tracks={tracks}
          onActiveCardChange={handleActiveCardChange}
          onTrackSelect={handleSelectCarouselTrack}
          onLoadMore={handleLoadMoreTracks}
        />

        <View style={{ height: miniPlayerBottomGap }} />
      </ScrollView>
    </View>
  );
};

export default DashboardScreen;
