import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioStore } from '../store/useAudioStore';
import { CURATED_TRACKS, searchCuratedMusic } from '../data/curatedMusic';
import { searchYouTubeMusicWithArtist, ArtistMatch } from '../services/youtubeMusicService';
import { useTheme } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import { getUniversalStudioArtwork, getUniversalArtistAvatar } from '../utils/artworkHelper';

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

export const MusicSearch = ({ navigation, route }: any) => {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createThemedStyles(theme, isDark), [theme, isDark]);
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ artist: ArtistMatch | null; tracks: any[] } | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'tracks' | 'artists'>('all');
  
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const playTrack = useAudioStore((s) => s.playTrack);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);

  useEffect(() => {
    const loadRecent = async () => {
      const data = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      if (data) setRecentSearches(JSON.parse(data));
    };
    loadRecent();
  }, []);

  // Reactively consume initialQuery passed from MusicHome filter chips
  useEffect(() => {
    const initialQuery = route?.params?.initialQuery;
    if (initialQuery && typeof initialQuery === 'string' && initialQuery.trim()) {
      setQuery(initialQuery.trim());
    }
  }, [route?.params?.initialQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 450);
    return () => clearTimeout(timer);
  }, [query]);

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
      const { artist, tracks } = await searchYouTubeMusicWithArtist(searchTerm);
      if (tracks && tracks.length > 0) {
        const formatted = tracks.map(t => ({
          ...t,
          durationFormatted: `${Math.floor((t.duration || 180000) / 60000)}:${String(Math.floor(((t.duration || 180000) % 60000) / 1000)).padStart(2, '0')}`
        }));
        setResults({
          artist: artist || null,
          tracks: formatted,
        });
        saveRecentSearch(searchTerm);
      } else {
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
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (isCurrent) {
            setPlayerModalVisible(true);
          } else {
            await playTrack(item, null, 0, results?.tracks || []);
            setPlayerModalVisible(true);
          }
        }}
      >
        <Image
          source={{ uri: getUniversalStudioArtwork(item.thumbnail) }}
          style={styles.trackThumb}
          contentFit="cover"
          priority="high"
          cachePolicy="memory-disk"
          transition={150}
        />
        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, isCurrent && { color: '#1DB954' }]} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={styles.artistRow}>
            <TouchableOpacity 
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('ArtistDetail', { 
                  artistName: item.artist,
                  artistId: item.channelId || item.artistId,
                });
              }}
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
        {/* Isolated Play/Pause Icon Button (Audio toggle only, does not open modal) */}
        <TouchableOpacity
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={(e) => {
            e.stopPropagation();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (isCurrent) {
              togglePlay();
            } else {
              playTrack(item, null, 0, results?.tracks || []);
            }
          }}
        >
          <Ionicons 
            name={isCurrent && isPlaying ? "pause-circle" : "play-circle"} 
            size={28} 
            color={isCurrent ? '#1DB954' : theme.textMuted} 
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderGenreCard = ({ item }: any) => (
    <TouchableOpacity 
      style={[styles.genreCard, { backgroundColor: item.color }]}
      onPress={() => {
        // Bug 4 fix: use clean query string, not emoji-polluted display title
        const cleanQuery = item.query || item.title;
        setQuery(cleanQuery);
        performSearch(cleanQuery);
      }}
    >
      <Text style={styles.genreText}>{item.title}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      
      {/* Search Header */}
      <View style={styles.header}>
        <View style={styles.searchBarContainer}>
          <Ionicons name="search" size={20} color={theme.textMuted} style={{ marginLeft: 15 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search artists, songs, workout beats..."
            placeholderTextColor={theme.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={20} color={theme.textSecondary} style={{ marginRight: 15 }} />
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
          <ActivityIndicator size="large" color="#1DB954" />
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
          <View style={{ height: miniPlayerBottomGap }} />
        </ScrollView>
      ) : results ? (
        /* Search Results UI */
        <FlatList
          data={activeFilter === 'artists' ? [] : results.tracks}
          keyExtractor={(it, index) => `${it.videoId}-${index}`}
          renderItem={renderTrackItem}
          contentContainerStyle={{ paddingBottom: miniPlayerBottomGap }}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 20 }}>
              {/* Verified Artist Card */}
              {results.artist && activeFilter !== 'tracks' && (
                <View style={styles.artistSection}>
                  <Text style={styles.sectionTitleHeader}>Verified Artist</Text>
                  <TouchableOpacity 
                    style={styles.artistFeaturedCard}
                    activeOpacity={0.85}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      navigation.navigate('ArtistDetail', { 
                        artistName: results.artist?.name, 
                        artist: results.artist 
                      });
                    }}
                  >
                    <Image
                      source={{ uri: getUniversalArtistAvatar(results.artist.avatar, results.artist.name) || results.artist.avatar }}
                      style={styles.artistAvatar}
                      contentFit="cover"
                      priority="high"
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                    <View style={styles.artistMeta}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.artistName} numberOfLines={1}>{results.artist.name}</Text>
                        <Ionicons name="checkmark-circle" size={18} color="#458eff" />
                      </View>
                      <Text style={styles.artistSubText}>{results.artist.subscriberCount || 'Official Artist Channel'}</Text>
                      <View style={styles.artistActionBtn}>
                        <Text style={styles.artistActionText}>View Official Profile</Text>
                        <Ionicons name="chevron-forward" size={14} color="#1DB954" />
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
               <Ionicons name="search-outline" size={64} color={theme.textMuted} />
               <Text style={styles.emptyTitle}>Nothing found for "{query}"</Text>
               <Text style={styles.emptySub}>Try searching for another artist, song, or workout genre.</Text>
            </View>
          }
        />
      ) : null}
    </View>
  );
};

const createThemedStyles = (theme: ThemeTokens, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: theme.background },
    searchBarContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 48,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.surfaceSubtle,
      borderWidth: 1,
      borderColor: theme.border,
    },
    searchInput: {
      flex: 1,
      height: '100%',
      paddingLeft: 10,
      color: theme.textPrimary,
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
      backgroundColor: theme.surfaceSubtle,
      borderWidth: 1,
      borderColor: theme.border,
    },
    filterPillActive: {
      backgroundColor: theme.textPrimary,
      borderColor: theme.textPrimary,
    },
    filterPillText: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '700',
    },
    filterPillTextActive: {
      color: isDark ? '#000000' : '#FFFFFF',
    },
    scrollContent: { paddingTop: 10 },
    sectionTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: 'bold',
      marginHorizontal: 20,
      marginTop: 20,
      marginBottom: 15,
    },
    sectionTitleHeader: {
      color: theme.textPrimary,
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
      color: theme.textSecondary,
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
      backgroundColor: theme.surfaceSubtle,
      paddingHorizontal: 15,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
    },
    historyText: { color: theme.textPrimary, fontSize: 13 },
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
    loadingText: { color: '#1DB954', marginTop: 15, fontWeight: 'bold' },
    
    // Verified Artist Card
    artistSection: {
      marginBottom: 15,
    },
    artistFeaturedCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : theme.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 16,
      shadowColor: theme.cardShadow.shadowColor,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    artistAvatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: theme.surfaceSubtle,
    },
    artistMeta: {
      flex: 1,
      gap: 4,
    },
    artistName: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '800',
    },
    artistSubText: {
      color: theme.textSecondary,
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
      color: '#1DB954',
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
      borderBottomColor: theme.borderSubtle,
    },
    trackThumb: { width: 50, height: 50, borderRadius: 8, backgroundColor: theme.surfaceSubtle },
    trackInfo: { flex: 1 },
    trackTitle: { color: theme.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 4 },
    artistRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    clickableArtist: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    trackDuration: {
      color: theme.textMuted,
      fontSize: 12,
    },
    hdBadgeSmall: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
    },
    hdBadgeSmallText: {
      color: '#1DB954',
      fontSize: 9,
      fontWeight: '900',
    },

    emptyTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: 'bold', marginTop: 20 },
    emptySub: { color: theme.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 40, marginTop: 10 },
  });

export default MusicSearch;
