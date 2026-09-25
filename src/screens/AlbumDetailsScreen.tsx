import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { fetchPlaylistOrAlbumDetails, PlaylistAlbumDetails } from '../services/youtubeMusicService';
import { useAudioStore, Track } from '../store/useAudioStore';
import { useTheme } from '../theme/ThemeContext';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import { getUniversalStudioArtwork, getUniversalArtistAvatar } from '../utils/artworkHelper';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const AlbumDetailsScreen = ({ route, navigation }: any) => {
  const {
    listId,
    playlistId,
    albumId,
    id,
    album,
    albumTitle,
    artistName,
    cover,
    type: paramType,
  } = route.params || {};

  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  // Audio store state & actions
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const playAlbumContext = useAudioStore((s) => s.playAlbumContext);
  const loadingTrackId = useAudioStore((s) => s.loadingTrackId);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);
  const likedTrackIds = useAudioStore((s) => s.likedTrackIds);
  const toggleLike = useAudioStore((s) => s.toggleLike);

  const [details, setDetails] = useState<PlaylistAlbumDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAlbumLiked, setIsAlbumLiked] = useState(false);

  // Resolved identity fallbacks
  const resolvedTitle = albumTitle || album?.title || 'Album';
  const resolvedArtist = artistName || album?.artist || 'Artist';
  const resolvedCover = cover || album?.thumbnail || album?.cover || '';
  const resolvedType = paramType || album?.type || 'album';
  const targetId = playlistId || listId || albumId || id || album?.id || '';

  useEffect(() => {
    let isMounted = true;
    const loadAlbumData = async () => {
      setLoading(true);
      try {
        const res = await fetchPlaylistOrAlbumDetails(
          targetId,
          resolvedTitle,
          resolvedArtist,
          resolvedCover,
          resolvedType
        );
        if (isMounted) {
          setDetails(res);
        }
      } catch (err) {
        console.warn('[AlbumDetailsScreen] Error fetching details:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadAlbumData();
    return () => {
      isMounted = false;
    };
  }, [targetId, resolvedTitle, resolvedArtist]);

  const totalDurationText = useMemo(() => {
    const ms = details?.totalDurationMs || 0;
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hrs > 0) {
      return `${hrs} hr ${remMins} min`;
    }
    return `${mins || 35} min`;
  }, [details?.totalDurationMs]);

  const handlePlayAll = () => {
    if (details?.tracks && details.tracks.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      playAlbumContext(details.tracks, 0, details.title);
      setPlayerModalVisible(true);
    }
  };

  const handleShuffle = () => {
    if (details?.tracks && details.tracks.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const shuffled = [...details.tracks].sort(() => Math.random() - 0.5);
      playAlbumContext(shuffled, 0, details.title);
      setPlayerModalVisible(true);
    }
  };

  const formatTrackDuration = (ms?: number) => {
    if (!ms) return '3:30';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const artworkUrl = getUniversalStudioArtwork(details?.cover || resolvedCover);
  const artistAvatarUrl = getUniversalArtistAvatar(
    details?.artistAvatar,
    details?.artist || resolvedArtist
  );

  const isCurrentAlbumPlaying = useMemo(() => {
    if (!isPlaying || !currentTrack) return false;
    return details?.tracks?.some((t) => t.videoId === currentTrack.videoId) ?? false;
  }, [isPlaying, currentTrack, details?.tracks]);

  const typeBadgeLabel = useMemo(() => {
    const t = details?.type || resolvedType;
    if (t === 'playlist') return 'OFFICIAL PLAYLIST';
    if (t === 'single' || (details?.trackCount && details.trackCount <= 3)) return 'SINGLE & EP';
    return 'ALBUM';
  }, [details?.type, details?.trackCount, resolvedType]);

  const renderTrackItem = ({ item, index }: { item: Track; index: number }) => {
    const isCurrent = currentTrack?.videoId === item.videoId;
    const isLoadingTrack = loadingTrackId === item.videoId;
    const isLiked = likedTrackIds.includes(item.videoId);

    return (
      <TouchableOpacity
        style={[
          styles.trackRow,
          {
            borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
            backgroundColor: isCurrent ? (isDark ? 'rgba(29, 185, 84, 0.08)' : 'rgba(29, 185, 84, 0.05)') : 'transparent',
          },
        ]}
        activeOpacity={0.7}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (isCurrent) {
            setPlayerModalVisible(true);
          } else if (details?.tracks) {
            playAlbumContext(details.tracks, index, details.title);
            setPlayerModalVisible(true);
          }
        }}
      >
        {/* Track Index or Equalizer */}
        <View style={styles.trackIndexWrapper}>
          {isLoadingTrack ? (
            <ActivityIndicator size="small" color="#1DB954" />
          ) : isCurrent && isPlaying ? (
            <Ionicons name="volume-high" size={16} color="#1DB954" />
          ) : (
            <Text style={[styles.trackIndex, isCurrent && { color: '#1DB954', fontWeight: '800' }]}>
              {index + 1}
            </Text>
          )}
        </View>

        {/* Track Thumbnail */}
        <Image
          source={{ uri: getUniversalStudioArtwork(item.thumbnail || artworkUrl) }}
          style={styles.trackThumb}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
        />

        {/* Track Title & Artist */}
        <View style={styles.trackInfo}>
          <Text
            style={[
              styles.trackTitle,
              { color: isDark ? '#FFFFFF' : theme.textPrimary },
              isCurrent && { color: '#1DB954' },
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text
            style={[styles.trackArtist, { color: isDark ? 'rgba(255,255,255,0.5)' : theme.textSecondary }]}
            numberOfLines={1}
          >
            {item.artist || details?.artist || resolvedArtist}
          </Text>
        </View>

        {/* Track Duration */}
        <Text style={[styles.trackDuration, { color: isDark ? 'rgba(255,255,255,0.4)' : theme.textMuted }]}>
          {formatTrackDuration(item.duration)}
        </Text>

        {/* Heart / Favorite Button */}
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          activeOpacity={0.7}
          onPress={(e) => {
            e.stopPropagation();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleLike(item);
          }}
          style={styles.heartBtn}
        >
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={18}
            color={isLiked ? '#1DB954' : (isDark ? 'rgba(255,255,255,0.35)' : theme.textMuted)}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Album Artwork with Glow Backdrop */}
      <View style={styles.artworkWrapper}>
        <Image
          source={{ uri: artworkUrl }}
          style={styles.artworkBackdrop}
          contentFit="cover"
          blurRadius={30}
          cachePolicy="memory-disk"
        />
        <Image
          source={{ uri: artworkUrl }}
          style={styles.artworkImage}
          contentFit="cover"
          priority="high"
          cachePolicy="memory-disk"
          transition={200}
        />
      </View>

      {/* Album / Playlist Info */}
      <View style={styles.metaContainer}>
        {/* Type Badge */}
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{typeBadgeLabel}</Text>
        </View>

        {/* Album Title */}
        <Text
          style={[styles.albumTitleText, { color: isDark ? '#FFFFFF' : theme.textPrimary }]}
          numberOfLines={2}
          adjustsFontSizeToFit={true}
          minimumFontScale={0.8}
        >
          {details?.title || resolvedTitle}
        </Text>

        {/* Artist Row */}
        <TouchableOpacity
          style={styles.artistRow}
          activeOpacity={0.75}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate('ArtistDetail', {
              artistName: details?.artist || resolvedArtist,
            });
          }}
        >
          {artistAvatarUrl ? (
            <Image
              source={{ uri: artistAvatarUrl }}
              style={styles.artistAvatarSmall}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.artistAvatarSmall, { backgroundColor: '#1DB954', justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="person" size={14} color="#000" />
            </View>
          )}
          <Text style={[styles.artistNameText, { color: isDark ? '#FFFFFF' : theme.textPrimary }]}>
            {details?.artist || resolvedArtist}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={isDark ? 'rgba(255,255,255,0.4)' : theme.textMuted}
          />
        </TouchableOpacity>

        {/* Stats Row */}
        <Text style={[styles.statsText, { color: isDark ? 'rgba(255,255,255,0.5)' : theme.textSecondary }]}>
          {details?.year ? `${details.year} • ` : ''}
          {details?.tracks?.length || 0} songs • {totalDurationText}
        </Text>
      </View>

      {/* Action Controls Bar */}
      <View style={styles.actionsBar}>
        <View style={styles.actionsLeft}>
          {/* Big Green Play All Button */}
          <TouchableOpacity
            style={styles.playAllBtn}
            activeOpacity={0.85}
            onPress={handlePlayAll}
          >
            <Ionicons
              name={isCurrentAlbumPlaying ? 'pause' : 'play'}
              size={22}
              color="#000000"
              style={{ marginLeft: isCurrentAlbumPlaying ? 0 : 2 }}
            />
            <Text style={styles.playAllText}>
              {isCurrentAlbumPlaying ? 'Playing' : 'Play All'}
            </Text>
          </TouchableOpacity>

          {/* Shuffle Button */}
          <TouchableOpacity
            style={[
              styles.actionCircleBtn,
              {
                borderColor: isDark ? 'rgba(255,255,255,0.15)' : theme.border,
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
              },
            ]}
            activeOpacity={0.7}
            onPress={handleShuffle}
          >
            <Ionicons name="shuffle" size={20} color={isDark ? '#FFFFFF' : theme.textPrimary} />
          </TouchableOpacity>

          {/* Like Album Button */}
          <TouchableOpacity
            style={[
              styles.actionCircleBtn,
              {
                borderColor: isAlbumLiked ? '#1DB954' : (isDark ? 'rgba(255,255,255,0.15)' : theme.border),
                backgroundColor: isAlbumLiked
                  ? 'rgba(29, 185, 84, 0.12)'
                  : isDark
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(0,0,0,0.03)',
              },
            ]}
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsAlbumLiked((prev) => !prev);
            }}
          >
            <Ionicons
              name={isAlbumLiked ? 'heart' : 'heart-outline'}
              size={20}
              color={isAlbumLiked ? '#1DB954' : (isDark ? '#FFFFFF' : theme.textPrimary)}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tracklist Column Header */}
      <View
        style={[
          styles.tracklistHeader,
          { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' },
        ]}
      >
        <Text style={[styles.tracklistHeaderLabel, { color: isDark ? 'rgba(255,255,255,0.4)' : theme.textMuted }]}>
          #   TITLE
        </Text>
        <Ionicons
          name="time-outline"
          size={14}
          color={isDark ? 'rgba(255,255,255,0.4)' : theme.textMuted}
        />
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0A0A0A' : theme.background }]}>
      {/* Ambient Top Glow */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image
          source={{ uri: artworkUrl }}
          style={styles.ambientTopGlow}
          contentFit="cover"
          blurRadius={50}
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={['transparent', isDark ? '#0A0A0A' : theme.background]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Floating Back Navigation Button */}
      <TouchableOpacity
        style={[styles.floatingBackBtn, { top: insets.top + 8 }]}
        activeOpacity={0.8}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.goBack();
        }}
      >
        <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#1DB954" />
          <Text style={[styles.loadingText, { color: isDark ? 'rgba(255,255,255,0.6)' : theme.textSecondary }]}>
            Loading studio tracks...
          </Text>
        </View>
      ) : (
        <FlatList
          data={details?.tracks || []}
          keyExtractor={(item, index) => `${item.videoId || index}-${index}`}
          ListHeaderComponent={renderHeader}
          renderItem={renderTrackItem}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingTop: insets.top + 50,
              paddingBottom: miniPlayerBottomGap + 40,
            },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  ambientTopGlow: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.9,
    opacity: 0.35,
  },
  floatingBackBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 99,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 20,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  artworkWrapper: {
    width: SCREEN_WIDTH * 0.58,
    aspectRatio: 1,
    marginBottom: 20,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artworkBackdrop: {
    ...StyleSheet.absoluteFill,
    borderRadius: 16,
    transform: [{ scale: 1.08 }],
    opacity: 0.5,
  },
  artworkImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 12,
  },
  metaContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 18,
  },
  typeBadge: {
    backgroundColor: 'rgba(29, 185, 84, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(29, 185, 84, 0.3)',
  },
  typeBadgeText: {
    color: '#1DB954',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  albumTitleText: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  artistAvatarSmall: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  artistNameText: {
    fontSize: 14,
    fontWeight: '700',
  },
  statsText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionsBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1DB954',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 30,
    gap: 8,
    shadowColor: '#1DB954',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  playAllText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 15,
  },
  actionCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  tracklistHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    marginBottom: 6,
  },
  tracklistHeaderLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderBottomWidth: 1,
    gap: 12,
  },
  trackIndexWrapper: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackIndex: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(128,128,128,0.7)',
  },
  trackThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: 'rgba(128,128,128,0.2)',
  },
  trackInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  trackArtist: {
    fontSize: 12,
    fontWeight: '500',
  },
  trackDuration: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 4,
  },
  heartBtn: {
    padding: 4,
  },
});
