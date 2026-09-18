import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchYouTubeMusic } from '../services/youtubeMusicService';
import { CURATED_TRACKS } from '../data/curatedMusic';
import { useAudioStore } from '../store/useAudioStore';
import { colors } from '../theme/colors';

const { width } = Dimensions.get('window');

export const AlbumDetailsScreen = ({ route, navigation }: any) => {
  const { listId, album } = route.params || {};
  const insets = useSafeAreaInsets();
  const { playAlbumContext, currentTrack, isPlaying, loadingTrackId } = useAudioStore();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAlbum = async () => {
      setLoading(true);
      try {
        const rawTitle = album?.title || 'Workout Music';
        const cleanQuery = rawTitle.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').replace(/[^\w\s\u0600-\u06FF]/g, ' ').trim();
        const ytTracks = await searchYouTubeMusic(`${cleanQuery || 'Workout Running'} songs`);
        const tracks = ytTracks.length > 0 ? ytTracks : CURATED_TRACKS;

        setData({
          title: album?.title || 'Workout Album',
          artist: album?.artist || 'Nouble Music',
          thumbnail: album?.thumbnail || tracks[0]?.thumbnail,
          tracks,
        });
      } catch (err) {
        setData({
          title: album?.title || 'Workout Album',
          artist: album?.artist || 'Nouble Music',
          thumbnail: album?.thumbnail || CURATED_TRACKS[0].thumbnail,
          tracks: CURATED_TRACKS,
        });
      } finally {
        setLoading(false);
      }
    };
    fetchAlbum();
  }, [listId, album?.title]);

  const handlePlayAll = () => {
    if (data?.tracks?.length > 0) {
      playAlbumContext(data.tracks, 0, data.title || album?.title);
    }
  };

  const renderTrackItem = ({ item, index }: any) => {
    const isCurrent = currentTrack?.videoId === item.videoId;
    const isLoading = loadingTrackId === item.videoId;

    return (
      <TouchableOpacity 
        style={styles.trackRow} 
        onPress={() => playAlbumContext(data.tracks, index, data.title || album?.title)}
      >

        <View style={styles.trackIndexWrapper}>
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.trackIndex, isCurrent && { color: colors.primary }]}>
              {index + 1}
            </Text>
          )}
        </View>
        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, isCurrent && { color: colors.primary }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.trackArtist}>{item.artist}</Text>
        </View>
        {isCurrent && !isLoading && (
            <Ionicons name="stats-chart" size={16} color={colors.primary} style={{ marginRight: 10 }} />
        )}
        <Ionicons name="ellipsis-vertical" size={20} color="rgba(255,255,255,0.3)" />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header Image */}
      <View style={styles.header}>
        <Image 
          source={{ uri: data?.thumbnail || album?.thumbnail }} 
          style={styles.headerImage} 
        />
        <LinearGradient
          colors={['transparent', 'rgba(10,10,10,0.5)', '#0A0A0A']}
          style={styles.gradient}
        />
        
        {/* Back Button */}
        <TouchableOpacity 
          style={[styles.backBtn, { top: insets.top + 10 }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.albumTitle} numberOfLines={2}>{data?.title || album?.title}</Text>
        <Text style={styles.albumSub}>{data?.artist || album?.artist} • {data?.tracks?.length} tracks</Text>

        <View style={styles.controls}>
          <TouchableOpacity style={styles.playBtn} onPress={handlePlayAll}>
            <Ionicons name="play" size={24} color="#000" />
            <Text style={styles.playText}>Play All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.circleBtn}>
            <Ionicons name="shuffle" size={24} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.circleBtn}>
            <Ionicons name="heart-outline" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        <FlatList
          data={data?.tracks}
          keyExtractor={(it, index) => `${it.videoId}-${index}`}
          renderItem={renderTrackItem}
          contentContainerStyle={{ paddingBottom: 150 }}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  loader: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    width: width,
    height: width * 0.9,
    position: 'relative',
  },
  headerImage: {
    width: '100%',
    height: '100%',
  },
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
    marginTop: -60,
  },
  albumTitle: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  albumSub: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 24,
    textTransform: 'uppercase',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 15,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 30,
    paddingVertical: 14,
    borderRadius: 35,
    gap: 10,
    elevation: 10,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  playText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 18,
  },
  circleBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  trackIndexWrapper: {
    width: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackIndex: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    fontWeight: '700',
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  trackArtist: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
});
