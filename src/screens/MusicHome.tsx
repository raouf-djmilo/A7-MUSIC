import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { useAuth } from '../providers/AuthProvider';
import { useAudioStore, Track } from '../store/useAudioStore';
import { searchYouTubeMusic, cleanArtistName } from '../services/youtubeMusicService';

const { width } = Dimensions.get('window');
const CARD_SIZE = 144;
const QUICK_TILE_WIDTH = (width - 48) / 2;

// Utility to clean any emojis from titles or names
const cleanText = (str?: string): string => {
  if (!str) return '';
  return str
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
    .trim();
};

const FILTER_PILLS = ['All', 'Workout', 'Rai', 'Rap DZ', 'Chill'];

const STARTER_TILES = [
  {
    videoId: '5dWeeUIZFgA',
    title: "C'Est La Vie",
    artist: 'Cheb Khaled',
    thumbnail: 'https://i.ytimg.com/vi/5dWeeUIZFgA/hqdefault.jpg',
    duration: 237000,
    isOfficial: true,
  },
  {
    videoId: 'vU6qmNxOa44',
    title: 'Courage',
    artist: 'Djalil Palermo',
    thumbnail: 'https://i.ytimg.com/vi/vU6qmNxOa44/hqdefault.jpg',
    duration: 205000,
    isOfficial: true,
  },
  {
    videoId: '_Yhyp-_hX2s',
    title: 'Lose Yourself',
    artist: 'Eminem',
    thumbnail: 'https://i.ytimg.com/vi/_Yhyp-_hX2s/hqdefault.jpg',
    duration: 326000,
    isOfficial: true,
  },
  {
    videoId: 'V8nz0DSKw7I',
    title: '160 BPM Cadence',
    artist: 'Sport Beats',
    thumbnail: 'https://i.ytimg.com/vi/V8nz0DSKw7I/hqdefault.jpg',
    duration: 240000,
  },
  {
    videoId: '5qap5aO4i9A',
    title: 'Morning Forest Walk',
    artist: 'Lofi Stride',
    thumbnail: 'https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg',
    duration: 210000,
  },
  {
    videoId: '2hFcy3S7Pbg',
    title: 'Hyper Cardio Burst',
    artist: 'Gym Phonk',
    thumbnail: 'https://i.ytimg.com/vi/2hFcy3S7Pbg/hqdefault.jpg',
    duration: 180000,
  },
];

export const MusicHome = ({ navigation }: any) => {
  const { user } = useAuth();
  const { 
    setActiveUserId, 
    playTrack, 
    setPlayerModalVisible, 
    loadingTrackId, 
    currentTrack,
    isPlaying,
    history,
    getUserTopVibe,
  } = useAudioStore();

  const [activeFilter, setActiveFilter] = useState('All');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Dynamic recommendation feed
  const [madeForYouTracks, setMadeForYouTracks] = useState<Track[]>([]);
  const [vibeLabel, setVibeLabel] = useState('Workout');
  const [newReleases, setNewReleases] = useState<Track[]>([]);
  const [workoutCadence, setWorkoutCadence] = useState<Track[]>([]);
  const [topArtists, setTopArtists] = useState<any[]>([]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  useEffect(() => {
    if (user?.id) {
      setActiveUserId(user.id);
    }
  }, [user]);

  // Khwarzmiya: Load personalized recommendations based on user listening history & vibe
  const loadHomeFeeds = useCallback(async () => {
    try {
      const { vibeName, query } = getUserTopVibe();
      setVibeLabel(vibeName);

      const [madeForYou, releases, cadence, raiArtists] = await Promise.all([
        searchYouTubeMusic(query),
        searchYouTubeMusic('Official new music releases 2025 trending'),
        searchYouTubeMusic('160 BPM running cadence cardio workout music'),
        searchYouTubeMusic('Cheb Khaled Djalil Palermo Soolking Rai'),
      ]);

      if (madeForYou.length > 0) setMadeForYouTracks(madeForYou.slice(0, 10));
      if (releases.length > 0) setNewReleases(releases.slice(0, 10));
      if (cadence.length > 0) setWorkoutCadence(cadence.slice(0, 10));

      // Extract unique artists for the artists row
      const uniqueArtistsMap = new Map<string, any>();
      [...madeForYou, ...releases, ...raiArtists].forEach((tr) => {
        const cleanA = cleanArtistName(tr.artist);
        if (cleanA && !uniqueArtistsMap.has(cleanA) && uniqueArtistsMap.size < 8) {
          uniqueArtistsMap.set(cleanA, {
            name: cleanA,
            thumbnail: tr.thumbnail,
            isOfficial: tr.isOfficial ?? true,
          });
        }
      });
      setTopArtists(Array.from(uniqueArtistsMap.values()));
    } catch (err) {
      console.warn('[MusicHome] Feed load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getUserTopVibe]);

  useEffect(() => {
    loadHomeFeeds();
  }, [loadHomeFeeds]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadHomeFeeds();
  };

  const handlePlaySong = async (track: Track, contextQueue: Track[] = []) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await playTrack(track, user?.id || null, 0, contextQueue);
    setPlayerModalVisible(true);
  };

  // Quick 6-Grid Tiles (Spotify style 2-column)
  const quickTiles = history.length >= 6 ? history.slice(0, 6) : STARTER_TILES;

  const renderQuickTile = (item: Track, index: number) => {
    const isCurrent = currentTrack?.videoId === item.videoId;
    const isLoading = loadingTrackId === item.videoId;

    return (
      <TouchableOpacity
        key={`quick-${item.videoId || index}`}
        style={styles.quickTile}
        activeOpacity={0.8}
        onPress={() => handlePlaySong(item, quickTiles)}
      >
        <Image 
          source={{ uri: item.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150' }} 
          style={styles.quickTileImg} 
        />
        <View style={styles.quickTileInfo}>
          <Text style={[styles.quickTileTitle, isCurrent && { color: colors.primary }]} numberOfLines={2}>
            {cleanText(item.title)}
          </Text>
        </View>
        <View style={styles.quickTilePlayBtn}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Ionicons 
              name={isCurrent && isPlaying ? "pause" : "play"} 
              size={14} 
              color="#000" 
            />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderCard = ({ item, index }: { item: Track; index: number }, queue: Track[]) => {
    const isCurrent = currentTrack?.videoId === item.videoId;
    const isLoading = loadingTrackId === item.videoId;

    return (
      <TouchableOpacity
        key={`card-${item.videoId || index}`}
        style={styles.cardContainer}
        activeOpacity={0.85}
        onPress={() => handlePlaySong(item, queue)}
      >
        <View style={styles.cardCoverWrapper}>
          <Image 
            source={{ uri: item.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300' }} 
            style={styles.cardCover} 
          />
          {/* Subtle Spotify-style play overlay badge */}
          <View style={[styles.cardPlayBadge, isCurrent && { opacity: 1, backgroundColor: '#FFF' }]}>
            {isLoading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Ionicons 
                name={isCurrent && isPlaying ? "pause" : "play"} 
                size={16} 
                color="#000" 
              />
            )}
          </View>
        </View>

        <Text style={[styles.cardTitle, isCurrent && { color: colors.primary }]} numberOfLines={1}>
          {cleanText(item.title)}
        </Text>

        <TouchableOpacity 
          style={styles.cardArtistRow}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          onPress={() => navigation.navigate('ArtistDetails', { artistName: item.artist })}
        >
          <Text style={styles.cardArtist} numberOfLines={1}>
            {cleanArtistName(item.artist)}
          </Text>
          {item.isOfficial && (
            <Ionicons name="checkmark-circle" size={12} color="#458eff" style={{ marginLeft: 3 }} />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderArtistCircle = (artist: any, index: number) => (
    <TouchableOpacity
      key={`artist-${artist.name}-${index}`}
      style={styles.artistCircleContainer}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('ArtistDetails', { artistName: artist.name })}
    >
      <View style={styles.artistAvatarWrapper}>
        <Image 
          source={{ uri: artist.thumbnail || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300' }} 
          style={styles.artistAvatar} 
        />
      </View>
      <View style={styles.artistNameRow}>
        <Text style={styles.artistCircleName} numberOfLines={1}>
          {artist.name}
        </Text>
        {artist.isOfficial && (
          <Ionicons name="checkmark-circle" size={11} color="#458eff" style={{ marginLeft: 2 }} />
        )}
      </View>
      <Text style={styles.artistCircleBadge}>Artist</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl 
          refreshing={refreshing} 
          onRefresh={onRefresh} 
          tintColor={colors.primary} 
        />
      }
    >
      {/* Top Header & Greeting (No emojis) */}
      <View style={styles.header}>
        <View style={styles.headerTitleCol}>
          <Text style={styles.greetingText}>{getGreeting()}</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.headerActionBtn}
            onPress={() => navigation.navigate('MusicSearch')}
          >
            <Ionicons name="search" size={20} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.avatarBtn}
            onPress={() => navigation.navigate('ProfileTab')}
          >
            <Image 
              source={{ uri: user?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120' }} 
              style={styles.avatarImg} 
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Chips */}
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
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveFilter(pill);
                if (pill !== 'All') {
                  navigation.navigate('MusicSearch', { initialQuery: pill });
                }
              }}
            >
              <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                {pill}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Spotify 6-Grid Quick Access */}
      <View style={styles.quickGrid}>
        {quickTiles.map(renderQuickTile)}
      </View>

      {/* 1. History Line: Jump Back In (If User Has History) */}
      {history.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recently played</Text>
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={history.slice(0, 10)}
            keyExtractor={(item, idx) => `hist-${item.videoId}-${idx}`}
            contentContainerStyle={styles.cardsScroll}
            renderItem={(props) => renderCard(props, history)}
          />
        </View>
      )}

      {/* 2. Made For You (Vibe Algorithm) */}
      {madeForYouTracks.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Made for you</Text>
            <Text style={styles.sectionSubtitle}>{vibeLabel} mix</Text>
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={madeForYouTracks}
            keyExtractor={(item, idx) => `mfy-${item.videoId}-${idx}`}
            contentContainerStyle={styles.cardsScroll}
            renderItem={(props) => renderCard(props, madeForYouTracks)}
          />
        </View>
      )}

      {/* 3. New Releases & Trending */}
      {newReleases.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>New releases</Text>
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={newReleases}
            keyExtractor={(item, idx) => `new-${item.videoId}-${idx}`}
            contentContainerStyle={styles.cardsScroll}
            renderItem={(props) => renderCard(props, newReleases)}
          />
        </View>
      )}

      {/* 4. Workout & Running Cadence */}
      {workoutCadence.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Workout cadence</Text>
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={workoutCadence}
            keyExtractor={(item, idx) => `cadence-${item.videoId}-${idx}`}
            contentContainerStyle={styles.cardsScroll}
            renderItem={(props) => renderCard(props, workoutCadence)}
          />
        </View>
      )}

      {/* 5. Top Artists */}
      {topArtists.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Featured artists</Text>
          </View>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.cardsScroll}
          >
            {topArtists.map(renderArtistCircle)}
          </ScrollView>
        </View>
      )}

      {/* Bottom spacer so docked mini player and bottom tab bar never obscure content */}
      <View style={{ height: 160 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  loaderContainer: {
    flex: 1,
    backgroundColor: '#0E0E0E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  headerTitleCol: {
    flex: 1,
  },
  greetingText: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  filterScroll: {
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 18,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  filterChipActive: {
    backgroundColor: '#FFF',
  },
  filterChipText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    gap: 8,
    marginBottom: 24,
  },
  quickTile: {
    width: QUICK_TILE_WIDTH,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  quickTileImg: {
    width: 52,
    height: 52,
    backgroundColor: '#2A2A2A',
  },
  quickTileInfo: {
    flex: 1,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  quickTileTitle: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 15,
  },
  quickTilePlayBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  section: {
    marginBottom: 26,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
  cardsScroll: {
    paddingLeft: 20,
    paddingRight: 8,
    gap: 14,
  },
  cardContainer: {
    width: CARD_SIZE,
  },
  cardCoverWrapper: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1C1C1C',
    position: 'relative',
    marginBottom: 8,
  },
  cardCover: {
    width: '100%',
    height: '100%',
  },
  cardPlayBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  cardTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  cardArtistRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardArtist: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '500',
  },
  artistCircleContainer: {
    width: 108,
    alignItems: 'center',
  },
  artistAvatarWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    backgroundColor: '#1C1C1C',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  artistAvatar: {
    width: '100%',
    height: '100%',
  },
  artistNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 96,
  },
  artistCircleName: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  artistCircleBadge: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
});

export default MusicHome;
