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
import * as Haptics from 'expo-haptics';

import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { useAudioStore, Track } from '../store/useAudioStore';
import { CURATED_TRACKS, CuratedTrack } from '../data/curatedMusic';
import { getUniversalStudioArtwork } from '../utils/artworkHelper';
import { cleanArtistName } from '../services/youtubeMusicService';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';

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
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Audio Store & State ──
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const positionMillis = useAudioStore((s) => s.positionMillis);
  const durationMillis = useAudioStore((s) => s.durationMillis);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const toggleLike = useAudioStore((s) => s.toggleLike);
  const likedTrackIds = useAudioStore((s) => s.likedTrackIds);
  const playTrack = useAudioStore((s) => s.playTrack);
  const nextTrack = useAudioStore((s) => s.nextTrack);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);
  const history = useAudioStore((s) => s.history);

  // ── 1. "Your Vibe" Intelligent Recommendation Queue ──
  const [tracks, setTracks] = useState<DashboardTrack[]>(() =>
    buildYourVibeQueue(currentTrack, history, likedTrackIds)
  );

  useEffect(() => {
    if (currentTrack?.videoId) {
      const foundIdx = tracks.findIndex((t) => t.videoId === currentTrack.videoId);
      if (foundIdx === -1) {
        const newTrack: DashboardTrack = {
          ...currentTrack,
          id: currentTrack.videoId,
        };
        setTracks((prev) => [newTrack, ...prev.filter((t) => t.videoId !== currentTrack.videoId)]);
      }
    }
  }, [currentTrack?.videoId]);

  const activeTrack: Track = currentTrack || tracks[0] || CURATED_TRACKS[0];
  const isLiked = activeTrack?.videoId ? likedTrackIds.includes(activeTrack.videoId) : false;
  const progressPercent =
    (durationMillis || 0) > 0
      ? Math.min(100, Math.max(0, (positionMillis / (durationMillis || 180000)) * 100))
      : 0;

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

        {/* ── 2. Compact Smart Music Widget (~110px) ── */}
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (currentTrack?.videoId !== activeTrack.videoId) {
              if (isPlaying) {
                playTrack(activeTrack, tracks, 0, 'Dashboard');
              } else {
                useAudioStore.setState({
                  currentTrack: activeTrack,
                  positionMillis: 0,
                  durationMillis: activeTrack.duration || 180000,
                });
              }
            }
            setPlayerModalVisible(true);
          }}
          style={styles.smartWidgetContainer}
        >
          <BlurView
            intensity={Platform.OS === 'ios' ? 45 : 40}
            tint={theme.blurTint}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* 82x82 Square Studio Artwork (contentFit="cover" without black bars) */}
          <View style={styles.smartWidgetArtworkWrap}>
            <Image
              source={{ uri: getUniversalStudioArtwork(activeTrack?.thumbnail) }}
              style={styles.smartWidgetArtwork}
              contentFit="cover"
              priority="high"
              cachePolicy="memory-disk"
              transition={120}
            />
            {isPlaying && (
              <View style={styles.smartWidgetPlayBadge}>
                <Ionicons name="musical-notes" size={11} color="#1DB954" />
              </View>
            )}
          </View>

          {/* Center Info with Verification Badge & Mini Progress Bar */}
          <View style={styles.smartWidgetInfo}>
            <View style={styles.smartWidgetBadgeRow}>
              <Text
                style={[
                  styles.smartWidgetTag,
                  { color: isPlaying ? '#1DB954' : theme.textMuted },
                ]}
              >
                {isPlaying ? 'NOW PLAYING' : 'RECOMMENDED CADENCE'}
              </Text>
            </View>

            <Text style={styles.smartWidgetTitle} numberOfLines={1}>
              {cleanText(activeTrack?.title)}
            </Text>

            <View style={styles.smartWidgetArtistRow}>
              <Text style={styles.smartWidgetArtist} numberOfLines={1}>
                {cleanArtistName(activeTrack?.artist)}
              </Text>
              {activeTrack?.isOfficial && (
                <Ionicons
                  name="checkmark-circle"
                  size={12}
                  color="#458eff"
                  style={{ marginLeft: 3 }}
                />
              )}
            </View>

            {/* Mini Progress Bar */}
            <View style={styles.smartWidgetProgressTrack}>
              <View
                style={[
                  styles.smartWidgetProgressFill,
                  { width: `${progressPercent}%` },
                ]}
              />
            </View>
          </View>

          {/* Fast Controls (Like, Play/Pause, Next) */}
          <View style={styles.smartWidgetControls}>
            <TouchableOpacity
              style={styles.smartWidgetControlBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              onPress={(e) => {
                e.stopPropagation();
                handlePressLike(activeTrack);
              }}
            >
              <Ionicons
                name={isLiked ? 'heart' : 'heart-outline'}
                size={22}
                color={isLiked ? '#E91E63' : theme.textMuted}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.smartWidgetPlayBtn}
              activeOpacity={0.8}
              onPress={(e) => {
                e.stopPropagation();
                handlePressPlay(activeTrack);
              }}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={18}
                color="#000"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.smartWidgetControlBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                nextTrack();
              }}
            >
              <Ionicons
                name="play-skip-forward"
                size={20}
                color={theme.textPrimary}
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

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

        <View style={{ height: miniPlayerBottomGap }} />
      </ScrollView>
    </View>
  );
};

export default DashboardScreen;
