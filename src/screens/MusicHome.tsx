import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../providers/AuthProvider';
import { useAudioStore, Track } from '../store/useAudioStore';
import { supabase } from '../lib/supabase';
import { cleanArtistName } from '../services/youtubeMusicService';
import { useTheme } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import {
  getUniversalStudioArtwork,
  getUniversalStudioArtworkSource,
  getUniversalArtistAvatar,
} from '../utils/artworkHelper';
import { musicDnaService, DynamicHomeSections, MoodCluster } from '../services/musicDnaService';
import { ToastManager } from '../components/InAppToast';

const { width } = Dimensions.get('window');
const CARD_SIZE = 144;
const QUICK_TILE_WIDTH = (width - 40) / 2;

const cleanText = (str?: string): string => {
  if (!str) return '';
  return str
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
    .trim();
};

const FILTER_PILLS = ['All', 'Music', 'Workout 160 BPM', 'Rai DZ', 'Chill'];

export const MusicHome = ({ navigation }: any) => {
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  // Audio Store state
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const loadingTrackId = useAudioStore((s) => s.loadingTrackId);
  const history = useAudioStore((s) => s.history);
  const likedTrackIds = useAudioStore((s) => s.likedTrackIds);
  const playTrack = useAudioStore((s) => s.playTrack);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);
  const setActiveUserId = useAudioStore((s) => s.setActiveUserId);

  const [activeFilter, setActiveFilter] = useState('All');
  const [refreshing, setRefreshing] = useState(false);

  // 0ms instant synchronous initial state via Music DNA Engine
  const [sections, setSections] = useState<DynamicHomeSections>(() =>
    musicDnaService.getSectionsSync('All', history)
  );

  const isInitialFetchDone = useRef(false);

  // Synchronize active user with Music DNA engine
  useEffect(() => {
    if (user?.id) {
      setActiveUserId(user.id);
      musicDnaService.setUserId(user.id);
    }
  }, [user?.id]);

  // Contextual Greeting based on time of day
  const timeContext = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return { greeting: 'Good morning', subtitle: 'Morning Cadence & Energy' };
    }
    if (hour >= 12 && hour < 18) {
      return { greeting: 'Good afternoon', subtitle: 'Peak Workout & Rhythm' };
    }
    if (hour >= 18 && hour < 23) {
      return { greeting: 'Good evening', subtitle: 'Sunset Beats & Recovery' };
    }
    return { greeting: 'Late night', subtitle: 'Night Focus & Cool Down' };
  }, []);

  // Fetch enriched dynamic sections from Music DNA Engine
  const loadDynamicFeeds = useCallback(
    async (filter: string = activeFilter) => {
      try {
        const enriched = await musicDnaService.getDynamicHomeSections(
          filter,
          history,
          likedTrackIds
        );
        setSections(enriched);
      } catch (err) {
        console.warn('[MusicHome] DNA Feed error:', err);
      } finally {
        setRefreshing(false);
      }
    },
    [activeFilter, history, likedTrackIds]
  );

  // Mount effect: load enriched feeds once
  useEffect(() => {
    if (!isInitialFetchDone.current) {
      isInitialFetchDone.current = true;
      loadDynamicFeeds(activeFilter);
    }
  }, [loadDynamicFeeds, activeFilter]);

  // Handle filter selection with 0ms sync preview then async enrichment
  const handleSelectFilter = (pill: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFilter(pill);
    // Instant synchronous UI filtering
    setSections(musicDnaService.getSectionsSync(pill, history));
    // Asynchronous enriched update
    loadDynamicFeeds(pill);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const refreshed = await musicDnaService.refreshLiveFeeds(activeFilter);
      setSections(refreshed);
    } catch (e) {
      console.warn('[MusicHome] Pull-to-refresh failed, retaining cached feed:', e);
      // Offline / Weak Network Guard: Keep cards intact and show polite toast
      ToastManager.show({
        title: 'تعذر التحديث',
        subtitle: 'يتم عرض آخر محتوى محفوظ',
        icon: 'cloud-offline-outline',
        duration: 3500,
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handlePlaySong = async (
    track: Track,
    contextQueue: Track[] = [],
    contextName: string = 'home'
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const idx = contextQueue.findIndex((t) => t.videoId === track.videoId);
    await playTrack(track, contextQueue, idx >= 0 ? idx : 0, contextName);
    setPlayerModalVisible(true);
  };

  const handlePlayMix = async (cluster: MoodCluster) => {
    if (!cluster.tracks || cluster.tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await playTrack(cluster.tracks[0], cluster.tracks, 0, cluster.title);
    setPlayerModalVisible(true);
  };

  const handlePlayLikedSongs = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const likedSet = new Set(likedTrackIds);
    let likedTracks = history.filter((t) => likedSet.has(t.videoId));

    if (likedTracks.length === 0 && user?.id) {
      try {
        const { data } = await supabase
          .from('music_likes')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (data && data.length > 0) {
          likedTracks = data.map((d: any): Track => ({
            videoId: d.video_id,
            title: d.title,
            artist: d.artist || 'Artist',
            thumbnail: d.thumbnail,
            duration: (d.duration || 0) * 1000,
          }));
        }
      } catch (e) {
        console.warn('[MusicHome] Fetch liked tracks for playback error:', e);
      }
    }

    if (likedTracks.length > 0) {
      await playTrack(likedTracks[0], likedTracks, 0, 'Liked Songs');
      setPlayerModalVisible(true);
    } else if (sections.quickJump.length > 0) {
      // Fallback to top favorite tracks
      await playTrack(sections.quickJump[0], sections.quickJump, 0, 'Liked Anthems');
      setPlayerModalVisible(true);
    }
  };

  const styles = useMemo(() => createThemedStyles(theme, isDark), [theme, isDark]);

  // ── 1. Quick Jump 2x3 Grid Items ──
  const quickJumpList = useMemo(() => {
    // Top 5 tracks for slots 1 to 5 (Slot 0 is "Liked Songs")
    return sections.quickJump.slice(0, 5);
  }, [sections.quickJump]);

  const renderQuickJumpTile = (item: Track, index: number) => {
    const isCurrent = currentTrack?.videoId === item.videoId;
    const isLoading = loadingTrackId === item.videoId;

    return (
      <TouchableOpacity
        key={`quick-jump-${item.videoId || index}`}
        style={[styles.quickTile, isCurrent && styles.quickTileCurrent]}
        activeOpacity={0.82}
        onPress={() => handlePlaySong(item, sections.quickJump, 'quick_jump')}
      >
        <Image
          source={getUniversalStudioArtworkSource(item.thumbnail, item.title, item.artist)}
          style={styles.quickTileImg}
          contentFit="cover"
          priority="high"
          cachePolicy="memory-disk"
          transition={120}
        />
        <View style={styles.quickTileInfo}>
          <Text
            style={[styles.quickTileTitle, isCurrent && styles.activeAccentText]}
            numberOfLines={2}
          >
            {cleanText(item.title)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.quickTilePlayBtn}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={(e) => {
            e.stopPropagation();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (isCurrent) {
              togglePlay();
            } else {
              playTrack(item, sections.quickJump, index, 'quick_jump');
            }
          }}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Ionicons
              name={isCurrent && isPlaying ? 'pause' : 'play'}
              size={14}
              color="#000"
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // ── 2. "Your top mixes" Spotify 1:1 Card (Images 3 & 4) ──
  const renderTopMixCard = ({ item }: { item: MoodCluster }) => {
    const isPlayingThisMix =
      isPlaying && item.tracks.some((t) => t.videoId === currentTrack?.videoId);

    return (
      <TouchableOpacity
        key={`mix-${item.id}`}
        style={styles.mixCardContainer}
        activeOpacity={0.85}
        onPress={() => handlePlayMix(item)}
      >
        {/* Artwork with Bottom Pill Badge & Spotify Glyph */}
        <View style={styles.mixArtworkWrap}>
          <Image
            source={getUniversalStudioArtworkSource(item.artwork)}
            style={styles.mixArtwork}
            contentFit="cover"
            priority="high"
            cachePolicy="memory-disk"
            transition={150}
          />

          {/* Top-Left Spotify Glyph */}
          <View style={styles.mixSpotifyBadge}>
            <Ionicons name="musical-notes" size={11} color="#FFF" />
          </View>

          {/* Bottom Pill Badge with Vertical Accent Line */}
          <View style={styles.mixBottomPill}>
            <View style={[styles.mixPillStripe, { backgroundColor: item.badgeColor }]} />
            <Text style={styles.mixPillText} numberOfLines={1}>
              {item.title}
            </Text>
          </View>

          {/* Floating Play Button */}
          <TouchableOpacity
            style={[
              styles.mixFloatingPlayBtn,
              isPlayingThisMix && { backgroundColor: '#1DB954' },
            ]}
            activeOpacity={0.85}
            onPress={(e) => {
              e.stopPropagation();
              handlePlayMix(item);
            }}
          >
            <Ionicons
              name={isPlayingThisMix ? 'pause' : 'play'}
              size={16}
              color="#000"
            />
          </TouchableOpacity>
        </View>

        {/* Title & Artist List */}
        <Text style={styles.mixTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.mixSubtitle} numberOfLines={2}>
          {item.subtitle}
        </Text>
      </TouchableOpacity>
    );
  };

  // ── 3. Standard 140x140 Track Card ──
  const renderTrackCard = (item: Track, index: number, queue: Track[]) => {
    const isCurrent = currentTrack?.videoId === item.videoId;
    const isLoading = loadingTrackId === item.videoId;

    return (
      <TouchableOpacity
        key={`card-${item.videoId || index}`}
        style={styles.trackCardContainer}
        activeOpacity={0.85}
        onPress={() => handlePlaySong(item, queue, 'recommendation')}
      >
        <View style={styles.trackCoverWrapper}>
          <Image
            source={getUniversalStudioArtworkSource(item.thumbnail, item.title, item.artist)}
            style={styles.trackCover}
            contentFit="cover"
            priority="high"
            cachePolicy="memory-disk"
            transition={150}
          />
          <TouchableOpacity
            style={[styles.trackPlayBadge, isCurrent && { backgroundColor: '#1DB954' }]}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (isCurrent) {
                togglePlay();
              } else {
                playTrack(item, queue, index, 'recommendation');
              }
            }}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Ionicons
                name={isCurrent && isPlaying ? 'pause' : 'play'}
                size={16}
                color="#000"
              />
            )}
          </TouchableOpacity>
        </View>

        <Text
          style={[styles.trackCardTitle, isCurrent && styles.activeAccentText]}
          numberOfLines={1}
        >
          {cleanText(item.title)}
        </Text>

        <TouchableOpacity
          style={styles.trackArtistRow}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.7}
          onPress={(e) => {
            e.stopPropagation();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate('ArtistDetail', {
              artistName: cleanArtistName(item.artist),
              artistId: (item as any).channelId || (item as any).artistId,
            });
          }}
        >
          <Text style={styles.trackArtist} numberOfLines={1}>
            {cleanArtistName(item.artist)}
          </Text>
          {item.isOfficial && (
            <Ionicons
              name="checkmark-circle"
              size={12}
              color="#458eff"
              style={{ marginLeft: 3 }}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // ── 4. Favourite Artists Circular Row (Image 5) ──
  const renderArtistCircle = (artist: any, index: number) => {
    const avatarUri = getUniversalArtistAvatar(artist.avatar || artist.thumbnail, artist.name);
    return (
      <TouchableOpacity
        key={`artist-${artist.name}-${index}`}
        style={styles.artistCircleContainer}
        activeOpacity={0.85}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate('ArtistDetail', {
            artistName: artist.name,
            artistId: artist.channelId || artist.id,
          });
        }}
      >
        <View style={styles.artistAvatarWrapper}>
          <Image
            source={{ uri: avatarUri }}
            style={styles.artistAvatar}
            contentFit="cover"
            priority="high"
            cachePolicy="memory-disk"
            transition={150}
          />
        </View>
        <View style={styles.artistNameRow}>
          <Text style={styles.artistCircleName} numberOfLines={1}>
            {artist.name}
          </Text>
          {artist.isOfficial && (
            <Ionicons
              name="checkmark-circle"
              size={11}
              color="#458eff"
              style={{ marginLeft: 2 }}
            />
          )}
        </View>
        <Text style={styles.artistCircleBadge}>Artist</Text>
      </TouchableOpacity>
    );
  };

  const isLikedAnthemPlaying =
    isPlaying && likedTrackIds.includes(currentTrack?.videoId || '');

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#1DB954"
        />
      }
    >
      {/* ── Top Header with Greeting & Avatar ── */}
      <View style={styles.header}>
        <View style={styles.headerTitleCol}>
          <Text style={styles.greetingText}>{timeContext.greeting}</Text>
          <Text style={styles.greetingSub}>{timeContext.subtitle}</Text>
        </View>

        <TouchableOpacity
          style={styles.avatarBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('ProfileTab')}
        >
          <Image
            source={{ uri: user?.avatar_url || undefined }}
            style={styles.avatarImg}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
        </TouchableOpacity>
      </View>

      {/* ── Top Filter Pills: [All], [Music], [Workout 160 BPM], [Rai DZ], [Chill] ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
      >
        {FILTER_PILLS.map((pill) => {
          const isSelected = activeFilter === pill;
          return (
            <TouchableOpacity
              key={`pill-${pill}`}
              style={[styles.filterChip, isSelected && styles.filterChipActive]}
              activeOpacity={0.75}
              onPress={() => handleSelectFilter(pill)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isSelected && styles.filterChipTextActive,
                ]}
              >
                {pill}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Spotify Quick Jump 2x3 Grid (Image 2 & 3) ── */}
      <View style={styles.quickGrid}>
        {/* Card 0: "Liked Songs" with Violet Gradient */}
        <TouchableOpacity
          key="quick-liked-songs"
          style={[styles.quickTile, styles.likedSongsTile]}
          activeOpacity={0.82}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate('MusicLibrary');
          }}
        >
          <LinearGradient
            colors={['#450af5', '#8e8ee5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.likedSongsArtwork}
          >
            <Ionicons name="heart" size={20} color="#FFF" />
          </LinearGradient>
          <View style={styles.quickTileInfo}>
            <Text style={styles.quickTileTitle} numberOfLines={1}>
              Liked Songs
            </Text>
            <Text style={styles.quickTileSubtitle} numberOfLines={1}>
              {likedTrackIds.length} {likedTrackIds.length === 1 ? 'song' : 'songs'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.quickTilePlayBtn}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={(e) => {
              e.stopPropagation();
              handlePlayLikedSongs();
            }}
          >
            <Ionicons
              name={isLikedAnthemPlaying ? 'pause' : 'play'}
              size={14}
              color="#000"
            />
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Cards 1 to 5: DNA Derived Anthems */}
        {quickJumpList.map(renderQuickJumpTile)}
      </View>

      {/* ── "Picked for you" Featured Wide Banner (Images 2 & 3) ── */}
      {sections.pickedForYou && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Picked for you</Text>
          </View>
          <TouchableOpacity
            style={styles.pickedBannerCard}
            activeOpacity={0.88}
            onPress={() =>
              handlePlaySong(
                sections.pickedForYou!,
                sections.quickJump,
                'picked_for_you'
              )
            }
          >
            <Image
              source={getUniversalStudioArtworkSource(
                sections.pickedForYou.thumbnail,
                sections.pickedForYou.title,
                sections.pickedForYou.artist
              )}
              style={styles.pickedArtwork}
              contentFit="cover"
              priority="high"
              cachePolicy="memory-disk"
              transition={150}
            />
            <View style={styles.pickedContent}>
              <View style={styles.pickedTopRow}>
                <Text style={styles.pickedBadge}>RECOMMENDED FOR YOU</Text>
                <Ionicons
                  name="ellipsis-horizontal"
                  size={16}
                  color={theme.textMuted}
                />
              </View>
              <Text style={styles.pickedTitle} numberOfLines={1}>
                {cleanText(sections.pickedForYou.title)}
              </Text>
              <Text style={styles.pickedArtist} numberOfLines={1}>
                {cleanArtistName(sections.pickedForYou.artist)} • Album
              </Text>
              <View style={styles.pickedActionRow}>
                <TouchableOpacity
                  style={styles.pickedPlayBtn}
                  activeOpacity={0.8}
                  onPress={(e) => {
                    e.stopPropagation();
                    handlePlaySong(
                      sections.pickedForYou!,
                      sections.quickJump,
                      'picked_for_you'
                    );
                  }}
                >
                  <Ionicons
                    name={
                      currentTrack?.videoId === sections.pickedForYou.videoId &&
                      isPlaying
                        ? 'pause'
                        : 'play'
                    }
                    size={18}
                    color="#000"
                  />
                </TouchableOpacity>
                <Text style={styles.pickedPrompt}>Tap to stream in 320kbps HD</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* ── "Your top mixes" Carousel (Images 3 & 4) ── */}
      {sections.topMixes.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your top mixes</Text>
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={sections.topMixes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.cardsScroll}
            renderItem={renderTopMixCard}
          />
        </View>
      )}

      {/* ── "Workout Cadence" 160 BPM Stride Anthems ── */}
      {sections.energyWorkout.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <View style={styles.cadenceTitleRow}>
                <Ionicons
                  name="flash"
                  size={18}
                  color="#FFD700"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.sectionTitle}>Workout Cadence</Text>
              </View>
              <Text style={styles.sectionSubtitle}>
                160 BPM Stride Sync • 155–165 SPM
              </Text>
            </View>
            <View style={styles.cadenceBadge}>
              <Text style={styles.cadenceBadgeText}>160 BPM</Text>
            </View>
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={sections.energyWorkout}
            keyExtractor={(item, idx) => `cadence-${item.videoId}-${idx}`}
            contentContainerStyle={styles.cardsScroll}
            renderItem={({ item, index }) =>
              renderTrackCard(item, index, sections.energyWorkout)
            }
          />
        </View>
      )}

      {/* ── "Your favourite artists" Row (Image 5) ── */}
      {sections.favouriteArtists.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your favourite artists</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardsScroll}
          >
            {sections.favouriteArtists.map(renderArtistCircle)}
          </ScrollView>
        </View>
      )}

      {/* ── "Recently played" History ── */}
      {sections.recentlyPlayed.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recently played</Text>
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={sections.recentlyPlayed}
            keyExtractor={(item, idx) => `hist-${item.videoId}-${idx}`}
            contentContainerStyle={styles.cardsScroll}
            renderItem={({ item, index }) =>
              renderTrackCard(item, index, sections.recentlyPlayed)
            }
          />
        </View>
      )}

      {/* Safe bottom spacing for Mini Player & Apple Liquid Glass Tab Bar */}
      <View style={{ height: miniPlayerBottomGap }} />
    </ScrollView>
  );
};

const createThemedStyles = (theme: ThemeTokens, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 10,
    },
    headerTitleCol: {
      flex: 1,
    },
    greetingText: {
      color: theme.textPrimary,
      fontSize: 23,
      fontWeight: '800',
      letterSpacing: -0.4,
    },
    greetingSub: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 2,
    },
    avatarBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: '#1DB954',
    },
    avatarImg: {
      width: '100%',
      height: '100%',
    },

    // ── Filter Chips ──
    filterScroll: {
      paddingHorizontal: 16,
      gap: 8,
      paddingBottom: 16,
    },
    filterChip: {
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.surfaceSubtle,
      borderWidth: 1,
      borderColor: theme.border,
    },
    filterChipActive: {
      backgroundColor: '#1DB954',
      borderColor: '#1DB954',
    },
    filterChipText: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    filterChipTextActive: {
      color: '#000000',
      fontWeight: '700',
    },

    // ── Quick Jump 2x3 Grid ──
    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 16,
      gap: 8,
      marginBottom: 26,
    },
    quickTile: {
      width: QUICK_TILE_WIDTH,
      height: 54,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.surface,
      borderRadius: 6,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.2 : 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    likedSongsTile: {
      backgroundColor: isDark ? 'rgba(69, 10, 245, 0.22)' : 'rgba(69, 10, 245, 0.12)',
      borderColor: 'rgba(142, 142, 229, 0.4)',
    },
    likedSongsArtwork: {
      width: 54,
      height: 54,
      justifyContent: 'center',
      alignItems: 'center',
    },
    quickTileCurrent: {
      backgroundColor: isDark ? 'rgba(29, 185, 84, 0.18)' : 'rgba(29, 185, 84, 0.12)',
      borderColor: 'rgba(29, 185, 84, 0.5)',
    },
    quickTileImg: {
      width: 54,
      height: 54,
      backgroundColor: theme.surfaceSubtle,
    },
    quickTileInfo: {
      flex: 1,
      paddingHorizontal: 8,
      justifyContent: 'center',
    },
    quickTileTitle: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 15,
    },
    quickTileSubtitle: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 2,
    },
    quickTilePlayBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#1DB954',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 3,
      elevation: 3,
    },
    activeAccentText: {
      color: '#1DB954',
    },

    // ── Sections ──
    section: {
      marginBottom: 26,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    sectionTitle: {
      color: theme.textPrimary,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    sectionSubtitle: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 2,
    },
    cardsScroll: {
      paddingLeft: 16,
      paddingRight: 8,
      gap: 14,
    },

    // ── Spotify "Your Top Mixes" 144x144 Cards ──
    mixCardContainer: {
      width: CARD_SIZE,
    },
    mixArtworkWrap: {
      width: CARD_SIZE,
      height: CARD_SIZE,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: theme.surfaceSubtle,
      position: 'relative',
      marginBottom: 8,
    },
    mixArtwork: {
      width: '100%',
      height: '100%',
    },
    mixSpotifyBadge: {
      position: 'absolute',
      top: 6,
      left: 6,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    mixBottomPill: {
      position: 'absolute',
      bottom: 8,
      left: 6,
      right: 6,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(0, 0, 0, 0.82)',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      overflow: 'hidden',
    },
    mixPillStripe: {
      width: 4,
      height: 14,
      borderRadius: 2,
      marginRight: 6,
    },
    mixPillText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
      flex: 1,
    },
    mixFloatingPlayBtn: {
      position: 'absolute',
      bottom: 38,
      right: 8,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: '#1DB954',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.4,
      shadowRadius: 4,
      elevation: 5,
    },
    mixTitle: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: -0.2,
      marginBottom: 2,
    },
    mixSubtitle: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '500',
      lineHeight: 14,
    },

    // ── "Picked for you" Featured Wide Banner ──
    pickedBannerCard: {
      marginHorizontal: 16,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.07)' : theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      flexDirection: 'row',
      padding: 12,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.06,
      shadowRadius: 6,
      elevation: 3,
    },
    pickedArtwork: {
      width: 90,
      height: 90,
      borderRadius: 8,
      backgroundColor: theme.surfaceSubtle,
    },
    pickedContent: {
      flex: 1,
      marginLeft: 12,
      justifyContent: 'center',
    },
    pickedTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    pickedBadge: {
      color: '#A7A7A7',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
    },
    pickedTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 2,
    },
    pickedArtist: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '500',
      marginBottom: 8,
    },
    pickedActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    pickedPlayBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#1DB954',
      justifyContent: 'center',
      alignItems: 'center',
    },
    pickedPrompt: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '500',
    },

    // ── Standard 140x140 Track Card ──
    trackCardContainer: {
      width: CARD_SIZE,
    },
    trackCoverWrapper: {
      width: CARD_SIZE,
      height: CARD_SIZE,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: theme.surfaceSubtle,
      position: 'relative',
      marginBottom: 8,
    },
    trackCover: {
      width: '100%',
      height: '100%',
    },
    trackPlayBadge: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: '#1DB954',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 5,
      elevation: 6,
    },
    trackCardTitle: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: -0.2,
      marginBottom: 2,
    },
    trackArtistRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    trackArtist: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },

    // ── Workout Cadence ──
    cadenceTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    cadenceBadge: {
      backgroundColor: isDark ? 'rgba(255, 215, 0, 0.15)' : 'rgba(217, 119, 6, 0.12)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 215, 0, 0.3)' : 'rgba(217, 119, 6, 0.25)',
    },
    cadenceBadgeText: {
      color: isDark ? '#FFD700' : '#B45309',
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.2,
    },

    // ── Favourite Artists ──
    artistCircleContainer: {
      width: 104,
      alignItems: 'center',
    },
    artistAvatarWrapper: {
      width: 90,
      height: 90,
      borderRadius: 45,
      overflow: 'hidden',
      backgroundColor: theme.surfaceSubtle,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    artistAvatar: {
      width: '100%',
      height: '100%',
    },
    artistNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      maxWidth: 90,
    },
    artistCircleName: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
    artistCircleBadge: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '500',
      marginTop: 1,
    },
  });

export default MusicHome;
