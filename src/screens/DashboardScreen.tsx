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
import { useNavigation } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { useAudioStore, Track } from '../store/useAudioStore';
import { CURATED_TRACKS, CuratedTrack } from '../data/curatedMusic';
import {
  HomeGlassMusicCard,
  CARD_WIDTH,
  SPACING,
  SNAP_INTERVAL,
} from '../components/HomeGlassMusicCard';

const { width } = Dimensions.get('window');

interface Activity {
  id: string;
  activity_type: 'run' | 'walk';
  total_time: number;
  total_distance: number;
  total_steps: number;
  average_pace: string;
  average_speed: number;
  route_coordinates: { latitude: number; longitude: number }[];
  created_at: string;
}

interface DashboardTrack extends Track {
  id: string;
}

const formatTime = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${m < 10 ? '0' : ''}${m}:${sec < 10 ? '0' : ''}${sec}`
    : `${m < 10 ? '0' : ''}${m}:${sec < 10 ? '0' : ''}${sec}`;
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('ar-DZ', {
    day: 'numeric',
    month: 'short',
  });
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
    musicCardWrapper: {
      marginTop: 6,
      marginBottom: 6,
      width: '100%',
    },
    latestActivityRibbon: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: 20,
      marginTop: 12,
      marginBottom: 4,
      height: 44,
      borderRadius: 20,
      paddingHorizontal: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    ribbonLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    activityIndicatorDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.textPrimary,
    },
    ribbonTitle: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
    },
    ribbonRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    ribbonStats: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    pastFeedContainer: {
      marginTop: 12,
      paddingHorizontal: 20,
    },
    pastFeedHeader: {
      marginBottom: 8,
    },
    pastFeedTitle: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '700',
    },
    pastItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 52,
      borderRadius: 18,
      paddingHorizontal: 12,
      marginBottom: 8,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.borderSubtle,
      backgroundColor: theme.surface,
    },
    pastItemIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: theme.surfaceSubtle,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    pastItemInfo: {
      flex: 1,
    },
    pastItemName: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
    },
    pastItemDate: {
      color: theme.textMuted,
      fontSize: 10,
      marginTop: 1,
    },
    pastItemMetric: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
    },
  });

// ── "Your Vibe" Intelligent Recommendation Engine ──
const buildYourVibeQueue = (
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

  // 1. Card #0: Priority to current track or last played track
  if (activeTrack) {
    addTrack(activeTrack);
  } else if (history && history.length > 0) {
    addTrack(history[0]);
  } else {
    addTrack(CURATED_TRACKS[0]);
  }

  // 2. Vibe Detection: inspect last 3 tracks to determine active user mood
  const recentTracks = [activeTrack, ...(history || [])].filter(Boolean).slice(0, 3) as Track[];
  let dominantCategory: CuratedTrack['category'] = 'cardio';

  for (const t of recentTracks) {
    const title = (t.title || '').toLowerCase();
    const artist = (t.artist || '').toLowerCase();
    const match = CURATED_TRACKS.find((c) => c.videoId === t.videoId);
    if (match) {
      dominantCategory = match.category;
      break;
    } else if (title.includes('phonk') || title.includes('pump') || title.includes('energy')) {
      dominantCategory = 'cardio';
      break;
    } else if (title.includes('run') || title.includes('160') || title.includes('marathon')) {
      dominantCategory = 'running';
      break;
    } else if (title.includes('rai') || artist.includes('khaled') || artist.includes('palermo') || artist.includes('soolking')) {
      dominantCategory = 'rai';
      break;
    } else if (title.includes('walk') || title.includes('step') || title.includes('chill') || title.includes('lofi')) {
      dominantCategory = 'walking';
      break;
    }
  }

  // 3. Add tracks matching dominant vibe
  const vibeTracks = CURATED_TRACKS.filter((c) => c.category === dominantCategory);
  vibeTracks.forEach((vt) => addTrack(vt));

  // 4. Add up to 3 liked tracks
  if (likedIds && likedIds.length > 0) {
    const likedSet = new Set(likedIds);
    (history || []).filter((t) => likedSet.has(t.videoId)).slice(0, 3).forEach((lt) => addTrack(lt));
    CURATED_TRACKS.filter((c) => likedSet.has(c.videoId)).slice(0, 3).forEach((lt) => addTrack(lt));
  }

  // 5. Fill remaining curated tracks
  CURATED_TRACKS.forEach((ct) => addTrack(ct));

  return result;
};

export const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Audio Store & State ──
  const {
    currentTrack,
    isPlaying,
    positionMillis,
    durationMillis,
    togglePlay,
    toggleLike,
    likedTrackIds,
    playTrack,
    setPlayerModalVisible,
    history,
  } = useAudioStore();

  const flatListRef = useRef<any>(null);
  const scrollX = useSharedValue(0);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

  // ── Flag to prevent double execution on programmatic Next/Prev button presses ──
  const isProgrammaticScroll = useRef<boolean>(false);

  // ── 1. "Your Vibe" Intelligent Recommendation Engine (Frozen on mount for 60fps stability) ──
  const [tracks, setTracks] = useState<DashboardTrack[]>(() =>
    buildYourVibeQueue(currentTrack, history, likedTrackIds)
  );

  // ── Explicit Snap Offsets for Mathematical Centering ──
  const snapOffsets = useMemo(
    () => tracks.map((_, i) => i * SNAP_INTERVAL),
    [tracks]
  );

  // ── 3. Bi-directional Sync: Auto-scroll carousel when track changes from MiniPlayer or outside ──
  useEffect(() => {
    if (currentTrack?.videoId) {
      const foundIdx = tracks.findIndex((t) => t.videoId === currentTrack.videoId);
      if (foundIdx !== -1) {
        if (foundIdx !== currentTrackIndex) {
          isProgrammaticScroll.current = true;
          setCurrentTrackIndex(foundIdx);
          flatListRef.current?.scrollToOffset({
            offset: foundIdx * SNAP_INTERVAL,
            animated: true,
          });
        }
      } else {
        // Track was played externally (e.g. Music tab or Search): dynamically add to Card #0
        const newTrack: DashboardTrack = {
          ...currentTrack,
          id: currentTrack.videoId,
        };
        setTracks((prev) => [newTrack, ...prev.filter((t) => t.videoId !== currentTrack.videoId)]);
        setCurrentTrackIndex(0);
        flatListRef.current?.scrollToOffset({
          offset: 0,
          animated: true,
        });
      }
    }
  }, [currentTrack?.videoId]);

  // ── Smooth Reanimated Scroll Handler on UI Thread (Zero State Glitches) ──
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  // ── 2. Smart Audio Switch on Momentum Scroll End ──
  // Respects playback state: If paused, previews silently; if playing, changes audio immediately
  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // If scroll was triggered programmatically (via Next/Prev button), ignore to avoid double fire
      if (isProgrammaticScroll.current) {
        isProgrammaticScroll.current = false;
        return;
      }

      const offsetX = event.nativeEvent.contentOffset.x;
      const newIndex = Math.round(offsetX / SNAP_INTERVAL);
      const clampedIndex = Math.max(0, Math.min(newIndex, tracks.length - 1));

      if (clampedIndex !== currentTrackIndex) {
        setCurrentTrackIndex(clampedIndex);
        Haptics.selectionAsync();
        const selectedTrack = tracks[clampedIndex];

        if (isPlaying) {
          playTrack(selectedTrack);
        } else {
          useAudioStore.setState({
            currentTrack: selectedTrack,
            positionMillis: 0,
            durationMillis: selectedTrack.duration || 180000,
          });
        }
      }
    },
    [currentTrackIndex, tracks, isPlaying, playTrack]
  );

  const handlePressPlay = useCallback(
    (track: Track) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      if (currentTrack?.videoId === track.videoId) {
        togglePlay();
      } else {
        playTrack(track);
      }
    },
    [currentTrack?.videoId, togglePlay, playTrack]
  );

  const handlePressLike = useCallback(
    (track: Track) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleLike(track);
    },
    [toggleLike]
  );

  const handleShare = useCallback(async (track: Track) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({
        message: `Listening to "${track.title}" by ${track.artist} on Nouble!`,
      });
    } catch (e) {}
  }, []);

  // ── 4. Card Controls: Smooth programmatic snapping with debounce flag ──
  const handlePressPrev = useCallback(
    (index: number) => {
      if (index > 0) {
        const prevIdx = index - 1;
        isProgrammaticScroll.current = true;
        flatListRef.current?.scrollToOffset({
          offset: prevIdx * SNAP_INTERVAL,
          animated: true,
        });
        setCurrentTrackIndex(prevIdx);
        Haptics.selectionAsync();
        const selectedTrack = tracks[prevIdx];

        if (isPlaying) {
          playTrack(selectedTrack);
        } else {
          useAudioStore.setState({
            currentTrack: selectedTrack,
            positionMillis: 0,
            durationMillis: selectedTrack.duration || 180000,
          });
        }
      }
    },
    [tracks, isPlaying, playTrack]
  );

  const handlePressNext = useCallback(
    (index: number) => {
      if (index < tracks.length - 1) {
        const nextIdx = index + 1;
        isProgrammaticScroll.current = true;
        flatListRef.current?.scrollToOffset({
          offset: nextIdx * SNAP_INTERVAL,
          animated: true,
        });
        setCurrentTrackIndex(nextIdx);
        Haptics.selectionAsync();
        const selectedTrack = tracks[nextIdx];

        if (isPlaying) {
          playTrack(selectedTrack);
        } else {
          useAudioStore.setState({
            currentTrack: selectedTrack,
            positionMillis: 0,
            durationMillis: selectedTrack.duration || 180000,
          });
        }
      }
    },
    [tracks, isPlaying, playTrack]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: DashboardTrack; index: number }) => {
      const isCurrent = currentTrack?.videoId === item.videoId;
      const isLiked = item.videoId ? likedTrackIds.includes(item.videoId) : false;

      return (
        <HomeGlassMusicCard
          track={item}
          index={index}
          scrollX={scrollX}
          isCurrent={isCurrent}
          isPlaying={isPlaying}
          positionMillis={positionMillis}
          durationMillis={durationMillis}
          isLiked={isLiked}
          onPressArtwork={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (currentTrack?.videoId !== item.videoId) {
              if (isPlaying) {
                playTrack(item);
              } else {
                useAudioStore.setState({
                  currentTrack: item,
                  positionMillis: 0,
                  durationMillis: item.duration || 180000,
                });
              }
            }
            setPlayerModalVisible(true);
          }}
          onPressPlay={() => handlePressPlay(item)}
          onPressLike={() => handlePressLike(item)}
          onPressShare={() => handleShare(item)}
          onPressPrev={() => handlePressPrev(index)}
          onPressNext={() => handlePressNext(index)}
        />
      );
    },
    [
      currentTrack?.videoId,
      likedTrackIds,
      scrollX,
      isPlaying,
      positionMillis,
      durationMillis,
      setPlayerModalVisible,
      handlePressPlay,
      handlePressLike,
      handleShare,
      handlePressPrev,
      handlePressNext,
    ]
  );

  // ── Database activities & Profile Fetch ──
  const totalKm = activities.reduce((s, a) => s + (a.total_distance ?? 0), 0);
  const totalRuns = activities.filter((a) => a.activity_type === 'run').length;

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [{ data: acts }, { data: prof }] = await Promise.all([
        supabase
          .from('activities')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', user.id)
          .single(),
      ]);
      if (acts) setActivities(acts as Activity[]);
      if (prof) setProfile(prof);
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.textPrimary} />
      </View>
    );
  }

  const latestActivity = activities.length > 0 ? activities[0] : null;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textPrimary}
          />
        }
      >
        {/* ── 1. Clean Centered Header: Status Pill & Avatar ── */}
        <View style={styles.topBar}>
          {/* User Profile Avatar */}
          <TouchableOpacity
            onPress={() => navigation.navigate('ProfileTab')}
            style={styles.avatarWrap}
            activeOpacity={0.85}
          >
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="person" size={17} color={theme.textPrimary} />
              </View>
            )}
          </TouchableOpacity>

          {/* Ultra-Compact Clean Centered Sport Stats Pill */}
          <View style={styles.ultraMinimalPill}>
            <BlurView
              intensity={Platform.OS === 'ios' ? 70 : 45}
              tint={theme.blurTint}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.pillGlassOverlay} pointerEvents="none" />
            <Ionicons name="flame" size={14} color={theme.textPrimary} />
            <Text style={styles.pillMetricText}>
              {totalKm > 0 ? totalKm.toFixed(1) : '12.4'} km
            </Text>
            <View style={styles.pillDot} />
            <Text style={styles.pillRunsText}>
              {totalRuns > 0 ? totalRuns : '4'} {totalRuns === 1 ? 'Run' : 'Runs'}
            </Text>
          </View>

          {/* Symmetrical balance spacer for exact center alignment */}
          <View style={{ width: 40 }} />
        </View>

        {/* ── 2. Prominent Visual Focal Center: Apple Music Carousel with Forced LTR and Fixed Snap Offsets ── */}
        <View style={[styles.musicCardWrapper, { direction: 'ltr' }]}>
          <Animated.FlatList
            ref={flatListRef}
            data={tracks}
            keyExtractor={(item) => item.videoId || item.id}
            renderItem={renderItem}
            horizontal={true}
            inverted={false}
            snapToOffsets={snapOffsets}
            snapToAlignment="center"
            decelerationRate="fast"
            disableIntervalMomentum={true}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: (width - CARD_WIDTH) / 2,
            }}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            onMomentumScrollEnd={onMomentumScrollEnd}
            nestedScrollEnabled={true}
          />
        </View>

        {/* ── 3. Subordinate Workout Feed Beneath the Focal Card ── */}
        {latestActivity && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => navigation.navigate('Recording')}
            style={styles.latestActivityRibbon}
          >
            <BlurView
              intensity={Platform.OS === 'ios' ? 50 : 45}
              tint={theme.blurTint}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.ribbonLeft}>
              <View style={styles.activityIndicatorDot} />
              <Text style={styles.ribbonTitle} numberOfLines={1}>
                {latestActivity.activity_type === 'run' ? 'آخر تمرين جري' : 'آخر تمرين مشي'}
              </Text>
            </View>

            <View style={styles.ribbonRight}>
              <Text style={styles.ribbonStats}>
                {latestActivity.total_distance.toFixed(1)} km • {formatTime(latestActivity.total_time)}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={theme.textMuted} />
            </View>
          </TouchableOpacity>
        )}

        {activities.length > 1 && (
          <View style={styles.pastFeedContainer}>
            <View style={styles.pastFeedHeader}>
              <Text style={styles.pastFeedTitle}>السجل السابق</Text>
            </View>

            {activities.slice(1, 4).map((item) => (
              <View key={item.id} style={styles.pastItemRow}>
                <BlurView
                  intensity={Platform.OS === 'ios' ? 45 : 30}
                  tint={theme.blurTint}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={styles.pastItemIcon}>
                  <Ionicons
                    name={item.activity_type === 'run' ? 'fitness' : 'walk'}
                    size={16}
                    color={theme.textPrimary}
                  />
                </View>
                <View style={styles.pastItemInfo}>
                  <Text style={styles.pastItemName}>
                    {item.activity_type === 'run' ? 'Morning Run' : 'Morning Walk'}
                  </Text>
                  <Text style={styles.pastItemDate}>{formatDate(item.created_at)}</Text>
                </View>
                <Text style={styles.pastItemMetric}>
                  {item.total_distance.toFixed(2)} KM
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 100 + insets.bottom }} />
      </ScrollView>
    </View>
  );
};

export default DashboardScreen;
