import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Dimensions,
  StatusBar,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchYouTubeMusicWithArtist } from '../services/youtubeMusicService';
import { useAudioStore } from '../store/useAudioStore';
import { colors } from '../theme/colors';

const { width } = Dimensions.get('window');

/**
 * Shimmer Component for Skeleton Loading
 */
const Shimmer = ({ style }: any) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return <Animated.View style={[style, { opacity, backgroundColor: 'rgba(255,255,255,0.1)' }]} />;
};

export const ArtistDetailsScreen = ({ route, navigation }: any) => {
  const { artistName, artist } = route.params || {};
  const insets = useSafeAreaInsets();
  const { playAlbum, currentTrack } = useAudioStore();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArtistData = async () => {
      setLoading(true);
      try {
        const query = artistName || artist?.name || artist?.title || 'Artist';
        const res = await searchYouTubeMusicWithArtist(query);
        const ytTracks = res.tracks.length > 0 ? res.tracks : [];
        const finalArtist = res.artist || artist;
        
        setData({
          name: finalArtist?.name || query,
          subCount: finalArtist?.subscriberCount || 'Official Artist',
          subscriberCount: finalArtist?.subscriberCount || 'Official Artist',
          banner: finalArtist?.avatar || ytTracks[0]?.thumbnail || artist?.avatar || artist?.thumbnail,
          avatar: finalArtist?.avatar || ytTracks[0]?.thumbnail || artist?.avatar || artist?.thumbnail,
          topTracks: ytTracks,
          albums: [],
        });
      } catch (err) {
        setData({
          name: artistName || 'Artist',
          subCount: 'Official Artist',
          subscriberCount: 'Official Artist',
          avatar: artist?.avatar || artist?.thumbnail,
          topTracks: [],
          albums: [],
        });
      } finally {
        setLoading(false);
      }
    };
    fetchArtistData();
  }, [artistName, artist?.name]);

  const formatSubscribers = (count: any) => {
    if (typeof count === 'string') return count;
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return count;
  };

  const calculateNoubleListeners = (tracks: any[]) => {
    if (!tracks) return '0';
    const totalViews = tracks.reduce((sum, t) => sum + (t.views || 0), 0);
    const simulated = Math.floor(totalViews / 100);
    return formatSubscribers(simulated);
  };

  const renderTrackItem = ({ item, index }: any) => {
    const isCurrent = currentTrack?.videoId === item.videoId;
    return (
      <TouchableOpacity 
        style={styles.trackRow} 
        onPress={() => playAlbum(data.topTracks, index)}
      >
        <Text style={[styles.trackIndex, isCurrent && { color: colors.primary }]}>{index + 1}</Text>
        <Image source={{ uri: item.thumbnail }} style={styles.trackThumb} />
        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, isCurrent && { color: colors.primary }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.trackStats}>{formatSubscribers(item.views || 0)} plays</Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={20} color="rgba(255,255,255,0.3)" />
      </TouchableOpacity>
    );
  };

  const renderAlbumCard = ({ item }: any) => (
    <TouchableOpacity 
      style={styles.albumMiniCard}
      onPress={() => navigation.navigate('AlbumDetails', { listId: item.listId, album: item })}
    >
      <Image source={{ uri: item.thumbnail }} style={styles.albumMiniArt} />
      <Text style={styles.albumMiniTitle} numberOfLines={1}>{item.title}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Immersive Header */}
      <View style={styles.header}>
        <Image 
          source={{ uri: data?.topTracks?.[0]?.thumbnail || artist?.thumbnail }} 
          style={styles.artistHero} 
        />
        <LinearGradient
          colors={['transparent', 'rgba(18,18,18,0.6)', '#121212']}
          style={styles.heroGradient}
        />
        
        <TouchableOpacity 
          style={[styles.backBtn, { top: insets.top + 10 }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={28} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.heroContent}>
            <View style={styles.verifiedRow}>
                <Ionicons name="checkmark-circle" size={16} color="#458eff" />
                <Text style={styles.verifiedText}>Verified Artist</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={styles.artistMainTitle}>{artistName || artist?.title}</Text>
                <Ionicons name="checkmark-done-circle" size={32} color={colors.primary} />
            </View>
        </View>
      </View>

      <FlatList
        data={loading ? [1, 2, 3, 4] : data?.topTracks}
        keyExtractor={(item, index) => loading ? `skel-${index}` : (item.videoId || String(index))}
        renderItem={loading ? () => (
          <View style={styles.trackRow}>
            <Shimmer style={{ width: 25, height: 14, borderRadius: 4 }} />
            <Shimmer style={styles.trackThumb} />
            <View style={styles.trackInfo}>
              <Shimmer style={{ width: '80%', height: 16, borderRadius: 4, marginBottom: 8 }} />
              <Shimmer style={{ width: '40%', height: 12, borderRadius: 4 }} />
            </View>
          </View>
        ) : renderTrackItem}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.statsRow}>
                <View style={{ gap: 4 }}>
                    {loading ? (
                      <>
                        <Shimmer style={{ width: 80, height: 22, borderRadius: 6 }} />
                        <Shimmer style={{ width: 120, height: 14, borderRadius: 4 }} />
                      </>
                    ) : (
                      <>
                        <Text style={styles.statVal}>{formatSubscribers(data?.subscriberCount || '10M')}</Text>
                        <Text style={styles.statLabel}>YouTube Subscribers</Text>
                        <View style={styles.noubleStat}>
                            <Ionicons name="flash" size={12} color={colors.primary} />
                            <Text style={styles.noubleStatText}>{calculateNoubleListeners(data?.topTracks)} Nouble Listeners</Text>
                        </View>
                      </>
                    )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                  <TouchableOpacity style={styles.followBtn}>
                      <Text style={styles.followText}>Follow</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                      style={styles.mainPlayBtn}
                      onPress={() => !loading && playAlbum(data.topTracks, 0)}
                  >
                      <Ionicons name="play" size={28} color="#000" />
                  </TouchableOpacity>
                </View>
            </View>

            <Text style={styles.sectionTitle}>Popular Tracks</Text>
          </>
        }
        ListFooterComponent={
            <View style={styles.footer}>
                {!loading && (
                  <>
                    <Text style={styles.sectionTitle}>Discography</Text>
                    <FlatList
                        data={data?.albums}
                        horizontal
                        renderItem={renderAlbumCard}
                        keyExtractor={(item) => item.listId}
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.albumList}
                    />
                  </>
                )}
                <View style={{ height: 120 }} />
            </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  loader: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' },
  header: { width: width, height: width * 1.0, position: 'relative' },
  artistHero: { width: '100%', height: '100%' },
  heroGradient: { ...StyleSheet.absoluteFill },
  backBtn: {
    position: 'absolute',
    left: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroContent: {
    position: 'absolute',
    bottom: 20,
    left: 20,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  verifiedText: {
    color: '#458eff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  artistMainTitle: {
    color: '#FFF',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    justifyContent: 'space-between',
  },
  statVal: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  statLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  noubleStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  noubleStatText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  followBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  followText: { color: '#FFF', fontWeight: 'bold' },
  mainPlayBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 20,
    marginTop: 10,
    marginBottom: 15,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 15,
  },
  trackIndex: { color: 'rgba(255,255,255,0.3)', width: 25, fontSize: 14, fontWeight: 'bold' },
  trackThumb: { width: 48, height: 48, borderRadius: 4 },
  trackInfo: { flex: 1 },
  trackTitle: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  trackStats: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  footer: { marginTop: 10 },
  albumList: { paddingLeft: 20, gap: 16 },
  albumMiniCard: { width: 140 },
  albumMiniArt: { width: 140, height: 140, borderRadius: 8 },
  albumMiniTitle: { color: '#FFF', fontSize: 13, marginTop: 8, fontWeight: '600' },
});
