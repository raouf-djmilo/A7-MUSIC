import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../providers/AuthProvider';
import { useAudioStore, Track } from '../store/useAudioStore';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';

const { width } = Dimensions.get('window');

// Curated Workout & Running Playlists
const WORKOUT_PLAYLISTS = [
  {
    id: 'pl-run-160',
    title: '🏃 160 BPM Cadence Run',
    subtitle: 'إيقاع مثالي لركض مسافات طويلة',
    color: ['#FF416C', '#FF4B2B'],
    tracks: [
      {
        videoId: 'run_bpm_1',
        title: 'High Cadence Running Beats',
        artist: 'Running Motivation',
        thumbnail: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=300',
        duration: 185000,
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      },
      {
        videoId: 'run_bpm_2',
        title: 'Electric Sprint Cardio',
        artist: 'Workout Beats',
        thumbnail: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300',
        duration: 210000,
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
      },
    ],
  },
  {
    id: 'pl-cardio-hiit',
    title: '⚡ Cardio & HIIT Energy',
    subtitle: 'حماس ونبض عالي لتمارين الكارديو',
    color: ['#8A2387', '#E94057'],
    tracks: [
      {
        videoId: 'hiit_1',
        title: 'Adrenaline Rush',
        artist: 'Fitness EDM',
        thumbnail: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300',
        duration: 195000,
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
      },
    ],
  },
  {
    id: 'pl-walk-chill',
    title: '🚶 Morning Walk & Chill',
    subtitle: 'موسيقى هادئة ومنعشة للمشي الصباحي',
    color: ['#11998e', '#38ef7d'],
    tracks: [
      {
        videoId: 'walk_1',
        title: 'Morning Breeze Walk',
        artist: 'Lofi Athletics',
        thumbnail: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=300',
        duration: 240000,
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
      },
    ],
  },
];

export const MusicLibrary = () => {
  const { user } = useAuth();
  const { playTrack, playAlbumContext, currentTrack, isPlaying, toggleLike } = useAudioStore();

  const [savedTracks, setSavedTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLibrary = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('music_likes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setSavedTracks(data);
      }
    } catch (e) {
      console.warn('Error fetching music library:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLibrary();
  };

  const filteredTracks = savedTracks.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.artist && t.artist.toLowerCase().includes(q))
    );
  });

  const handlePlayAll = () => {
    if (savedTracks.length === 0) return;
    const trackQueue: Track[] = savedTracks.map((t) => ({
      videoId: t.video_id,
      title: t.title,
      artist: t.artist || 'فنان',
      thumbnail: t.thumbnail,
      duration: (t.duration || 0) * 1000,
    }));
    playAlbumContext(trackQueue, 0, 'Liked Songs');
  };

  const renderHeader = () => (
    <View style={styles.header}>
      {/* ── Liked Songs Hero Banner ── */}
      <LinearGradient
        colors={['#450af5', '#8e2de2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroBanner}
      >
        <View style={styles.heroContent}>
          <View style={styles.heartCircle}>
            <Ionicons name="heart" size={36} color="#FFF" />
          </View>
          <View style={styles.heroTexts}>
            <Text style={styles.heroTitle}>الأغاني المفضلة</Text>
            <Text style={styles.heroSubtitle}>
              {savedTracks.length} {savedTracks.length === 1 ? 'أغنية محفوظة' : 'أغانٍ محفوظة'}
            </Text>
          </View>
        </View>

        {savedTracks.length > 0 && (
          <TouchableOpacity style={styles.heroPlayBtn} onPress={handlePlayAll}>
            <Ionicons name="play" size={26} color="#000" />
          </TouchableOpacity>
        )}
      </LinearGradient>

      {/* ── Workout Curated Playlists Section ── */}
      <View style={styles.sectionHeader}>
        <Ionicons name="flame" size={18} color="#FF4B2B" style={{ marginRight: 6 }} />
        <Text style={styles.sectionTitle}>قوائم تشغيل التمارين الرياضية</Text>
      </View>

      <FlatList
        data={WORKOUT_PLAYLISTS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.playlistsScroll}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              if (item.tracks.length > 0) {
                playAlbumContext(item.tracks, 0, item.title);
              }
            }}
          >
            <LinearGradient
              colors={item.color as any}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.playlistCard}
            >
              <View style={styles.playlistTop}>
                <Ionicons name="musical-note" size={24} color="rgba(255,255,255,0.7)" />
                <View style={styles.miniPlayCircle}>
                  <Ionicons name="play" size={14} color="#000" />
                </View>
              </View>
              <View>
                <Text style={styles.playlistTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.playlistSub} numberOfLines={1}>{item.subtitle}</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}
      />

      {/* ── Search Within Library ── */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#888" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="ابحث في أغانيك المحفوظة..."
          placeholderTextColor="#666"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#888" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.sectionHeader}>
        <Ionicons name="list" size={18} color={colors.primary} style={{ marginRight: 6 }} />
        <Text style={styles.sectionTitle}>
          قائمتي ({filteredTracks.length})
        </Text>
      </View>
    </View>
  );

  const renderTrackItem = ({ item, index }: { item: any; index: number }) => {
    const isCurrent = currentTrack?.videoId === item.video_id;

    return (
      <TouchableOpacity
        style={[styles.trackRow, isCurrent && styles.trackRowActive]}
        activeOpacity={0.7}
        onPress={() => {
          const trackQueue: Track[] = savedTracks.map((t) => ({
            videoId: t.video_id,
            title: t.title,
            artist: t.artist || 'فنان',
            thumbnail: t.thumbnail,
            duration: (t.duration || 0) * 1000,
          }));
          playAlbumContext(trackQueue, index, 'My Library');
        }}
      >
        <Image
          source={{
            uri: item.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200',
          }}
          style={styles.trackThumb}
        />
        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, isCurrent && { color: colors.primary }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {item.artist || 'فنان'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.heartBtn}
          onPress={() => {
            toggleLike({
              videoId: item.video_id,
              title: item.title,
              artist: item.artist,
              thumbnail: item.thumbnail,
            });
            // Update local view optimistically
            setSavedTracks((prev) => prev.filter((t) => t.video_id !== item.video_id));
          }}
        >
          <Ionicons name="heart" size={22} color={colors.primary} />
        </TouchableOpacity>

        <View style={styles.playIconBox}>
          <Ionicons
            name={isCurrent && isPlaying ? 'pause' : 'play'}
            size={18}
            color={isCurrent ? colors.primary : '#FFF'}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredTracks}
          keyExtractor={(item) => item.id || item.video_id}
          ListHeaderComponent={renderHeader}
          renderItem={renderTrackItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="musical-notes-outline" size={56} color="#333" />
              <Text style={styles.emptyTitle}>
                {searchQuery ? 'لا توجد نتائج تطابق بحثك' : 'مكتبتك فارغة حالياً'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? 'جرب البحث باسم أغنية أو فنان آخر.'
                  : 'اضغط على رمز القلب ❤️ عند تشغيل أي أغنية لحفظها هنا في مكتبتك!'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0E0E0E',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  heroBanner: {
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    shadowColor: '#8e2de2',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heartCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTexts: {},
  heroTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
  },
  heroPlayBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  playlistsScroll: {
    paddingRight: 16,
    gap: 12,
    marginBottom: 20,
  },
  playlistCard: {
    width: width * 0.42,
    height: 110,
    borderRadius: 16,
    padding: 12,
    justifyContent: 'space-between',
  },
  playlistTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  miniPlayCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  playlistSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#262626',
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 110,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#202020',
  },
  trackRowActive: {
    borderColor: colors.primary + '77',
    backgroundColor: '#1C1C1C',
  },
  trackThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#222',
  },
  trackInfo: {
    flex: 1,
    marginLeft: 12,
  },
  trackTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  trackArtist: {
    color: '#888',
    fontSize: 13,
  },
  heartBtn: {
    padding: 8,
    marginRight: 4,
  },
  playIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: 'bold',
    marginTop: 14,
    marginBottom: 6,
  },
  emptySubtitle: {
    color: '#777',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default MusicLibrary;
