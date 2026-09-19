import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioStore } from '../store/useAudioStore';
import { colors } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CURATED_TRACKS, searchCuratedMusic } from '../data/curatedMusic';
import { searchYouTubeMusicWithArtist, ArtistMatch } from '../services/youtubeMusicService';

const { width } = Dimensions.get('window');
const RECENT_SEARCHES_KEY = '@nouble_recent_searches';

const GENRES = [
  { id: '1', title: 'Running 🏃 160 BPM', query: '160 BPM running cadence music', color: '#ff4b2b' },
  { id: '2', title: 'Cardio & HIIT ⚡', query: 'Cardio HIIT workout electronic music', color: '#ff416c' },
  { id: '3', title: 'Rai Algérien 🇩🇿', query: 'Cheb Khaled Djalil Palermo Rai', color: '#1db954' },
  { id: '4', title: 'Rap DZ & FR 🎤', query: 'Rap Algerien Rap Francais', color: '#9d4edd' },
  { id: '5', title: 'Gym Phonk 🥊', query: 'Gym Phonk workout motivation', color: '#e71d36' },
  { id: '6', title: 'Walking 🚶 10k Steps', query: 'Morning walk lofi chill music', color: '#2ec4b6' },
  { id: '7', title: 'Pop & English Hits 🎧', query: 'Top english pop hits', color: '#458eff' },
  { id: '8', title: 'Deep Focus & Chill 🧘', query: 'Cool down stretching lofi focus', color: '#ff9f1c' },
];

export const MusicSearch = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ artist: ArtistMatch | null; tracks: any[] } | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'tracks' | 'artists'>('all');
  
  const { playTrack, currentTrack, isPlaying, setPlayerModalVisible } = useAudioStore();

  // Load Recent Searches
  useEffect(() => {
    const loadRecent = async () => {
      const data = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      if (data) setRecentSearches(JSON.parse(data));
    };
    loadRecent();
  }, []);

  // Sync Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 450);
    return () => clearTimeout(timer);
  }, [query]);

  // Execute Search
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults(null);
      return;
    }
    performSearch(debouncedQuery);
  }, [debouncedQuery]);

  const performSearch = async (searchTerm: string) => {
    if (!searchTerm.trim()) return;
    setLoading(true);
    try {
      // 1. Live search directly on YouTube with Artist extraction
      const { artist, tracks } = await searchYouTubeMusicWithArtist(searchTerm);
      if (tracks && tracks.length > 0) {
        const formatted = tracks.map(t => ({
          ...t,
          durationFormatted: `${Math.floor((t.duration || 180000) / 60000)}:${String(Math.floor(((t.duration || 180000) % 60000) / 1000)).padStart(2, '0')}`
        }));
        setResults({
          artist,
          tracks: formatted,
        });
        saveRecentSearch(searchTerm);
      } else {
        // Fallback to local curated search if network is offline
        const localMatches = searchCuratedMusic(searchTerm);
        const fallbackList = (localMatches.length > 0 ? localMatches : CURATED_TRACKS.slice(0, 8)).map(t => ({
          ...t,
          durationFormatted: `${Math.floor(t.duration / 60000)}:${String(Math.floor((t.duration % 60000) / 1000)).padStart(2, '0')}`
        }));
        setResults({
          artist: null,
          tracks: fallbackList,
        });
      }
    } catch (err) {
      console.warn('[MusicSearch] Error during search:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveRecentSearch = async (term: string) => {
    let updated = [term, ...recentSearches.filter(s => s !== term)].slice(0, 5);
    setRecentSearches(updated);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  const clearHistory = async () => {
    setRecentSearches([]);
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  const renderTrackItem = ({ item }: any) => {
    const isCurrent = currentTrack?.videoId === item.videoId;
    return (
      <TouchableOpacity 
        style={styles.trackRow} 
        activeOpacity={0.7}
        onPress={async () => {
          await playTrack(item, null, 0, results?.tracks || []);
          setPlayerModalVisible(true);
        }}
      >
        <Image source={{ uri: item.thumbnail }} style={styles.trackThumb} />
        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, isCurrent && { color: colors.primary }]} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={styles.artistRow}>
            <TouchableOpacity 
              onPress={() => navigation.navigate('ArtistDetails', { artistName: item.artist })}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={styles.clickableArtist}>{item.artist}</Text>
            </TouchableOpacity>
            {item.isOfficial && (
              <Ionicons name="checkmark-circle" size={13} color="#458eff" />
            )}
            <Text style={styles.trackDuration}>
              {item.durationFormatted ? `• ${item.durationFormatted}` : ''}
            </Text>
            <View style={styles.hdBadgeSmall}>
              <Text style={styles.hdBadgeSmallText}>HD</Text>
            </View>
          </View>
        </View>
        <Ionicons 
          name={isCurrent && isPlaying ? "pause-circle" : "play-circle"} 
          size={28} 
          color={isCurrent ? colors.primary : "rgba(255,255,255,0.4)"} 
        />
      </TouchableOpacity>
    );
  };

  const renderGenreCard = ({ item }: any) => (
    <TouchableOpacity 
      style={[styles.genreCard, { backgroundColor: item.color }]}
      onPress={() => {
        setQuery(item.title);
        performSearch(item.query || item.title);
      }}
    >
      <Text style={styles.genreText}>{item.title}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Search Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.searchBarContainer}>
          <Ionicons name="search" size={20} color="rgba(255,255,255,0.5)" style={{ marginLeft: 15 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search artists, songs, workout beats..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={20} color="#FFF" style={{ marginRight: 15 }} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Pills */}
        {query.trim().length > 0 && (
          <View style={styles.filterRow}>
            <TouchableOpacity 
              style={[styles.filterPill, activeFilter === 'all' && styles.filterPillActive]}
              onPress={() => setActiveFilter('all')}
            >
              <Text style={[styles.filterPillText, activeFilter === 'all' && styles.filterPillTextActive]}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.filterPill, activeFilter === 'tracks' && styles.filterPillActive]}
              onPress={() => setActiveFilter('tracks')}
            >
              <Text style={[styles.filterPillText, activeFilter === 'tracks' && styles.filterPillTextActive]}>Songs</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.filterPill, activeFilter === 'artists' && styles.filterPillActive]}
              onPress={() => setActiveFilter('artists')}
            >
              <Text style={[styles.filterPillText, activeFilter === 'artists' && styles.filterPillTextActive]}>Artists</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Searching High-Fidelity Music...</Text>
        </View>
      ) : !query.trim() ? (
        /* Zero State: Recent & Browse */
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {recentSearches.length > 0 && (
            <View style={styles.sectionHeaderRow}>
               <Text style={styles.sectionTitle}>Recent Searches</Text>
               <TouchableOpacity onPress={clearHistory}>
                 <Text style={styles.clearText}>Clear</Text>
               </TouchableOpacity>
            </View>
          )}
          <View style={styles.historyRow}>
            {recentSearches.map((s, i) => (
              <TouchableOpacity key={i} style={styles.historyChip} onPress={() => setQuery(s)}>
                <Text style={styles.historyText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Browse Workout Music</Text>
          <FlatList
            data={GENRES}
            renderItem={renderGenreCard}
            keyExtractor={it => it.id}
            numColumns={2}
            scrollEnabled={false}
            columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 20 }}
          />
          <View style={{ height: 120 }} />
        </ScrollView>
      ) : results ? (
        /* Search Results UI */
        <FlatList
          data={activeFilter === 'artists' ? [] : results.tracks}
          keyExtractor={(it, index) => `${it.videoId}-${index}`}
          renderItem={renderTrackItem}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 20 }}>
              {/* Verified Artist Card */}
              {results.artist && activeFilter !== 'tracks' && (
                <View style={styles.artistSection}>
                  <Text style={styles.sectionTitleHeader}>Verified Artist</Text>
                  <TouchableOpacity 
                    style={styles.artistFeaturedCard}
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('ArtistDetails', { 
                      artistName: results.artist?.name, 
                      artist: results.artist 
                    })}
                  >
                    <Image source={{ uri: results.artist.avatar }} style={styles.artistAvatar} />
                    <View style={styles.artistMeta}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.artistName} numberOfLines={1}>{results.artist.name}</Text>
                        <Ionicons name="checkmark-circle" size={18} color="#458eff" />
                      </View>
                      <Text style={styles.artistSubText}>{results.artist.subscriberCount || 'Official Artist Channel'}</Text>
                      <View style={styles.artistActionBtn}>
                        <Text style={styles.artistActionText}>View Official Profile</Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              )}

              {activeFilter !== 'artists' && (
                <Text style={styles.sectionTitleHeader}>Songs (High Quality 320kbps)</Text>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
               <Ionicons name="search-outline" size={64} color="rgba(255,255,255,0.1)" />
               <Text style={styles.emptyTitle}>Nothing found for "{query}"</Text>
               <Text style={styles.emptySub}>Try searching for another artist, song, or workout genre.</Text>
            </View>
          }
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: { paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#121212' },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchInput: {
    flex: 1,
    height: '100%',
    paddingLeft: 10,
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  filterPillActive: {
    backgroundColor: colors.primary,
  },
  filterPillText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '700',
  },
  filterPillTextActive: {
    color: '#000',
  },
  scrollContent: { paddingTop: 10 },
  sectionTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 15,
  },
  sectionTitleHeader: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 20,
  },
  clearText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginTop: 5,
  },
  historyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 8,
  },
  historyChip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  historyText: { color: '#FFF', fontSize: 13 },
  genreCard: {
    width: (width - 50) / 2,
    height: 90,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    justifyContent: 'flex-end',
  },
  genreText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  loadingText: { color: colors.primary, marginTop: 15, fontWeight: 'bold' },
  
  // Verified Artist Card
  artistSection: {
    marginBottom: 15,
  },
  artistFeaturedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 16,
  },
  artistAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  artistMeta: {
    flex: 1,
    gap: 4,
  },
  artistName: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
  },
  artistSubText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
  artistActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  artistActionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },

  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  trackThumb: { width: 50, height: 50, borderRadius: 8 },
  trackInfo: { flex: 1 },
  trackTitle: { color: '#FFF', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  clickableArtist: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  trackDuration: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  hdBadgeSmall: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  hdBadgeSmallText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '900',
  },

  emptyTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 20 },
  emptySub: { color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center', paddingHorizontal: 40, marginTop: 10 },
});
