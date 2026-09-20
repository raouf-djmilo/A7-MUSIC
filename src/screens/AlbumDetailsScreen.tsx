import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { searchYouTubeMusic } from '../services/youtubeMusicService';
import { CURATED_TRACKS } from '../data/curatedMusic';
import { useAudioStore } from '../store/useAudioStore';
import { useTheme } from '../theme/ThemeContext';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import { getUniversalStudioArtwork } from '../utils/artworkHelper';

const { width } = Dimensions.get('window');

export const AlbumDetailsScreen = ({ route, navigation }: any) => {
  const { listId, album, albumTitle, artistName, cover } = route.params || {};
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const miniPlayerBottomGap = useMiniPlayerBottomGap();
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const playAlbumContext = useAudioStore((s) => s.playAlbumContext);
  const loadingTrackId = useAudioStore((s) => s.loadingTrackId);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Support both old params (album.title) and new direct params (albumTitle, artistName, cover)
  const resolvedTitle = albumTitle || album?.title || 'Album';
  const resolvedArtist = artistName || album?.artist || 'Artist';
  const resolvedCover = cover || album?.thumbnail;

  useEffect(() => {
    const fetchAlbum = async () => {
      setLoading(true);
      try {
        const cleanQuery = resolvedTitle
          .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
          .replace(/[^\w\s\u0600-\u06FF]/g, ' ')
          .trim();
        const ytTracks = await searchYouTubeMusic(`${resolvedArtist} ${cleanQuery || 'songs'}`);
        const tracks = ytTracks.length > 0 ? ytTracks : CURATED_TRACKS;
        setData({ title: resolvedTitle, artist: resolvedArtist, thumbnail: resolvedCover || tracks[0]?.thumbnail, tracks });
      } catch (err) {
        setData({
          title: resolvedTitle,
          artist: resolvedArtist,
          thumbnail: resolvedCover || CURATED_TRACKS[0].thumbnail,
          tracks: CURATED_TRACKS,
        });
      } finally {
        setLoading(false);
      }
    };
    fetchAlbum();
  }, [listId, resolvedTitle]);

  const handlePlayAll = () => {
    if (data?.tracks?.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      playAlbumContext(data.tracks, 0, data.title);
      setPlayerModalVisible(true);
    }
  };

  const handleShuffle = () => {
    if (data?.tracks?.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const shuffled = [...data.tracks].sort(() => Math.random() - 0.5);
      playAlbumContext(shuffled, 0, data.title);
      setPlayerModalVisible(true);
    }
  };

  const renderTrackItem = ({ item, index }: any) => {
    const isCurrent = currentTrack?.videoId === item.videoId;
    const isLoadingTrack = loadingTrackId === item.videoId;

    return (
      <TouchableOpacity
        style={[styles.trackRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)' }]}
        activeOpacity={0.7}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (isCurrent) {
            setPlayerModalVisible(true);
          } else {
            playAlbumContext(data.tracks, index, data.title);
            setPlayerModalVisible(true);
          }
        }}
      >
        <View style={styles.trackIndexWrapper}>
          {isLoadingTrack ? (
            <ActivityIndicator size="small" color="#1DB954" />
          ) : (
            <Text style={[styles.trackIndex, isCurrent && { color: '#1DB954' }]}>
              {index + 1}
            </Text>
          )}
        </View>

        {/* HD thumbnail for each track */}
        <Image
          source={{ uri: getUniversalStudioArtwork(item.thumbnail) }}
          style={styles.trackThumb}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
        />

        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, { color: isDark ? '#FFFFFF' : theme.textPrimary }, isCurrent && { color: '#1DB954' }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.trackArtist, { color: isDark ? 'rgba(255,255,255,0.5)' : theme.textSecondary }]} numberOfLines={1}>
            {item.artist}
          </Text>
        </View>

        {isCurrent && !isLoadingTrack && (
          <TouchableOpacity
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
          >
            <Ionicons
              name={isPlaying ? 'pause-circle' : 'play-circle'}
              size={26}
              color="#1DB954"
            />
          </TouchableOpacity>
        )}
        <Ionicons name="ellipsis-vertical" size={18} color={isDark ? 'rgba(255,255,255,0.3)' : theme.textMuted} />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loader, { backgroundColor: isDark ? '#0A0A0A' : theme.background }]}>
        <ActivityIndicator size="large" color="#1DB954" />
      </View>
    );
  }

  const artworkUrl = getUniversalStudioArtwork(data?.thumbnail || resolvedCover);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0A0A0A' : theme.background }]}>
      {/* Header Image with Parallax Gradient */}
      <View style={styles.header}>
        <Image
          source={{ uri: artworkUrl }}
          style={styles.headerImage}
          contentFit="cover"
          priority="high"
          cachePolicy="memory-disk"
          transition={200}
        />
        <LinearGradient
          colors={['transparent', 'rgba(10,10,10,0.5)', isDark ? '#0A0A0A' : theme.background]}
          style={styles.gradient}
        />

        {/* Back Button */}
        <TouchableOpacity
          style={[styles.backBtn, { top: insets.top + 10 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
        >
          <Ionicons name="chevron-back" size={26} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={[styles.content, { backgroundColor: isDark ? '#0A0A0A' : theme.background }]}>
        <Text style={[styles.albumTitle, { color: isDark ? '#FFFFFF' : theme.textPrimary }]} numberOfLines={2}>
          {data?.title}
        </Text>
        <Text style={styles.albumSub}>
          {data?.artist} • {data?.tracks?.length} tracks
        </Text>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.playBtn} onPress={handlePlayAll}>
            <Ionicons name="play" size={22} color="#000" />
            <Text style={styles.playText}>Play All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.circleBtn, { borderColor: isDark ? 'rgba(255,255,255,0.15)' : theme.border }]} onPress={handleShuffle}>
            <Ionicons name="shuffle" size={22} color={isDark ? '#FFFFFF' : theme.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.circleBtn, { borderColor: isDark ? 'rgba(255,255,255,0.15)' : theme.border }]}>
            <Ionicons name="heart-outline" size={22} color={isDark ? '#FFFFFF' : theme.textPrimary} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={data?.tracks}
          keyExtractor={(it, index) => `${it.videoId}-${index}`}
          renderItem={renderTrackItem}
          contentContainerStyle={{ paddingBottom: miniPlayerBottomGap }}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    width: width,
    height: width * 0.82,
    position: 'relative',
  },
  headerImage: { width: '100%', height: '100%' },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
  },
  backBtn: {
    position: 'absolute',
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    marginTop: -50,
  },
  albumTitle: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  albumSub: {
    color: '#1DB954',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1DB954',
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 30,
    gap: 8,
    shadowColor: '#1DB954',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  playText: { color: '#000', fontWeight: '900', fontSize: 16 },
  circleBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  trackIndexWrapper: {
    width: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackIndex: {
    color: 'rgba(128,128,128,0.6)',
    fontSize: 14,
    fontWeight: '700',
  },
  trackThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: 'rgba(128,128,128,0.2)',
  },
  trackInfo: { flex: 1 },
  trackTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  trackArtist: { fontSize: 12, fontWeight: '500' },
});
