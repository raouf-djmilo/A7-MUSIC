import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import YoutubePlayer from 'react-native-youtube-iframe';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAudioStore } from '../store/useAudioStore';
import { useLanguageStore } from '../store/useLanguageStore';
import { useTheme } from '../theme/ThemeContext';
import { CURATED_TRACKS, searchCuratedMusic } from '../data/curatedMusic';
import { searchYouTubeMusicWithArtist, ArtistMatch } from '../services/youtubeMusicService';
import {
  ArtistMusicShort,
  fetchOfficialArtistShorts,
} from '../services/youtubeShortsService';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import { getUniversalStudioArtwork, getUniversalArtistAvatar } from '../utils/artworkHelper';
import { addToSearchHistory, cleanSearchHistory } from '../features/music/engines/searchHistory.engine';
import { LiquidGlassSurface } from '../components/LiquidGlassSurface';
import { ShortsReelsModal } from '../components/ShortsReelsModal';

const RECENT_SEARCHES_KEY = '@nouble_recent_searches';
const MAX_RECENT_CHIPS = 5;

const SHORT_CARD_WIDTH = 152;
const SHORT_CARD_HEIGHT = 248;
const SHORT_CARD_GAP = 12;

const CAROUSEL_PLAYER_PARAMS = {
  controls: false,
  modestbranding: true,
  rel: false,
  fs: false,
  iv_load_policy: 3,
  preventFullScreen: true,
  showClosedCaptions: false,
  loop: false,
};

export const MusicSearch = ({ navigation, route }: any) => {
  const insets = useSafeAreaInsets();
  const isScreenFocused = useIsFocused();
  const { isDark } = useTheme();
  const language = useLanguageStore((s) => s.language);
  const isAr = language === 'ar';
  const rowDirection = isAr ? 'row-reverse' : 'row';
  const textAlign = isAr ? 'right' : 'left';
  const writingDirection = isAr ? 'rtl' : 'ltr';
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ artist: ArtistMatch | null; tracks: any[] } | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'tracks' | 'artists'>('all');

  // Official Artist Shorts Carousel States
  const [shorts, setShorts] = useState<ArtistMusicShort[]>([]);
  const [loadingShorts, setLoadingShorts] = useState(true);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);
  const [carouselMuted, setCarouselMuted] = useState(true);
  const [endedCarouselVideoId, setEndedCarouselVideoId] = useState<string | null>(null);

  // Fullscreen TikTok/Reels Shorts Modal States
  const [reelsOpen, setReelsOpen] = useState(false);
  const [reelsInitialIndex, setReelsInitialIndex] = useState(0);

  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const currentRouteName = useAudioStore((s) => s.currentRouteName);
  const followedArtists = useAudioStore((s) => s.followedArtists);
  const playTrack = useAudioStore((s) => s.playTrack);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);

  const isSearchTabActive = isScreenFocused && currentRouteName === 'SearchTab';

  const palette = isDark
    ? {
        baseBg: '#070A12',
        orbTop: ['rgba(0, 122, 255, 0.2)', 'rgba(56, 189, 248, 0.06)', 'transparent'] as const,
        orbBottom: ['transparent', 'rgba(139, 92, 246, 0.1)', 'rgba(0, 80, 200, 0.14)'] as const,
        textPrimary: '#FFFFFF',
        textSecondary: 'rgba(255, 255, 255, 0.62)',
        textMuted: 'rgba(255, 255, 255, 0.42)',
        cardBg: 'rgba(18, 22, 30, 0.48)',
        cardBorder: 'rgba(255, 255, 255, 0.14)',
        cardTopBorder: 'rgba(255, 255, 255, 0.34)',
        pillBorder: 'rgba(255, 255, 255, 0.2)',
        inputBg: 'rgba(255, 255, 255, 0.07)',
        inputBorder: 'rgba(255, 255, 255, 0.14)',
        accentBlue: '#38BDF8',
      }
    : {
        baseBg: '#F2F5FA',
        orbTop: ['rgba(0, 122, 255, 0.16)', 'rgba(56, 189, 248, 0.07)', 'transparent'] as const,
        orbBottom: ['transparent', 'rgba(99, 102, 241, 0.09)', 'rgba(0, 122, 255, 0.12)'] as const,
        textPrimary: '#0F172A',
        textSecondary: 'rgba(15, 23, 42, 0.65)',
        textMuted: 'rgba(15, 23, 42, 0.44)',
        cardBg: 'rgba(255, 255, 255, 0.72)',
        cardBorder: 'rgba(15, 23, 42, 0.08)',
        cardTopBorder: 'rgba(255, 255, 255, 0.95)',
        pillBorder: 'rgba(15, 23, 42, 0.12)',
        inputBg: 'rgba(255, 255, 255, 0.75)',
        inputBorder: 'rgba(15, 23, 42, 0.1)',
        accentBlue: '#007AFF',
      };

  const t = isAr
    ? {
        searchPlaceholder: 'ماذا تريد أن تسمع؟',
        recentSearches: 'عمليات البحث الأخيرة',
        clear: 'مسح',
        discoverShorts: 'اكتشف مقاطع الفنانين',
        loadingShorts: 'جاري تحميل مقاطع الفنانين...',
        all: 'الكل',
        songs: 'الأغاني',
        artists: 'الفنانون',
        searching: 'جاري البحث...',
        verifiedArtist: 'فنان رسمي',
        viewProfile: 'عرض صفحة الفنان',
        songsHeader: 'الأغاني',
        nothingFound: `لا توجد نتائج لـ "${query}"`,
        tryAnother: 'جرّب البحث عن فنان أو أغنية أخرى.',
        shortsSubtitle: 'مقاطع موسيقية قصيرة من القنوات الرسمية',
      }
    : {
        searchPlaceholder: 'What do you want to listen to?',
        recentSearches: 'Recent Searches',
        clear: 'Clear',
        discoverShorts: 'Discover something new',
        loadingShorts: 'Loading official artist shorts...',
        all: 'All',
        songs: 'Songs',
        artists: 'Artists',
        searching: 'Searching Music...',
        verifiedArtist: 'Official Artist',
        viewProfile: 'View Artist Profile',
        songsHeader: 'Songs',
        nothingFound: `Nothing found for "${query}"`,
        tryAnother: 'Try searching for another artist or song.',
        shortsSubtitle: 'Official artist music shorts',
      };

  // Load Recent Searches (capped at MAX_RECENT_CHIPS = 5)
  useEffect(() => {
    const loadRecent = async () => {
      try {
        const data = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
        if (data) {
          const parsed = JSON.parse(data);
          const cleaned = cleanSearchHistory(parsed).slice(0, MAX_RECENT_CHIPS);
          setRecentSearches(cleaned);
        }
      } catch {
        // Ignore history error
      }
    };
    loadRecent();
  }, []);

  // Fetch Official Artist Shorts tailored to user's followed artists & region
  const followedNamesKey = useMemo(
    () => (followedArtists || []).map((a) => a.name).slice(0, 4).join('|'),
    [followedArtists]
  );

  useEffect(() => {
    let active = true;
    setLoadingShorts(true);
    const names = followedNamesKey ? followedNamesKey.split('|').filter(Boolean) : [];
    fetchOfficialArtistShorts(names)
      .then((list) => {
        if (active) {
          setShorts(list);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingShorts(false);
      });
    return () => {
      active = false;
    };
  }, [followedNamesKey]);

  // Consume initialQuery from navigation params if any
  useEffect(() => {
    const initialQuery = route?.params?.initialQuery;
    if (initialQuery && typeof initialQuery === 'string' && initialQuery.trim()) {
      setQuery(initialQuery.trim());
    }
  }, [route?.params?.initialQuery]);

  // Debounce live search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 420);
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
        const formatted = tracks.map((item) => ({
          ...item,
          durationFormatted: `${Math.floor((item.duration || 180000) / 60000)}:${String(
            Math.floor(((item.duration || 180000) % 60000) / 1000)
          ).padStart(2, '0')}`,
        }));
        setResults({
          artist: artist || null,
          tracks: formatted,
        });
      } else {
        const localMatches = searchCuratedMusic(searchTerm);
        const fallbackList = (localMatches.length > 0 ? localMatches : CURATED_TRACKS.slice(0, 8)).map(
          (item) => ({
            ...item,
            durationFormatted: `${Math.floor(item.duration / 60000)}:${String(
              Math.floor((item.duration % 60000) / 1000)
            ).padStart(2, '0')}`,
          })
        );
        setResults({
          artist: null,
          tracks: fallbackList,
        });
      }
    } catch {
      // Keep last state
    } finally {
      setLoading(false);
    }
  };

  const handleCommitSearch = useCallback((term: string) => {
    if (!term || typeof term !== 'string') return;
    setRecentSearches((prev) => {
      const updated = addToSearchHistory(prev, term).slice(0, MAX_RECENT_CHIPS);
      AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const clearHistory = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRecentSearches([]);
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  // Track which Short card is centered/visible so ONLY ONE plays at a time
  const onCarouselViewableChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const idx = viewableItems[0]?.index;
      if (typeof idx === 'number') {
        setActiveCarouselIndex((prev) => {
          if (prev !== idx) {
            setEndedCarouselVideoId(null);
          }
          return idx;
        });
      }
    }
  }).current;

  const carouselViewabilityConfig = useRef({
    itemVisiblePercentThreshold: 65,
    minimumViewTime: 180,
  }).current;

  const handleToggleCarouselSound = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCarouselMuted((prev) => {
      const nextMuted = !prev;
      if (!nextMuted && isPlaying) {
        togglePlay();
      }
      return nextMuted;
    });
  };

  const renderShortCard = ({ item, index }: { item: ArtistMusicShort; index: number }) => {
    const isCardActive =
      isSearchTabActive &&
      !query.trim() &&
      !reelsOpen &&
      index === activeCarouselIndex &&
      endedCarouselVideoId !== item.videoId;

    // 16:9 YouTube embed scaled to cover 9:16 card smoothly
    const embedWidth = Math.ceil(SHORT_CARD_HEIGHT * (16 / 9));

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setReelsInitialIndex(index);
          setReelsOpen(true);
        }}
      >
        <LiquidGlassSurface
          glassStyle="regular"
          isDark={isDark}
          isInteractive
          borderRadius={20}
          style={[
            styles.shortCard,
            {
              borderColor: isCardActive ? '#38BDF8' : palette.cardBorder,
              borderTopColor: palette.cardTopBorder,
            },
          ]}
        >
          {/* Poster Cover */}
          <Image
            source={{ uri: item.thumbnail }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />

          {/* Active Video Player (strictly ONE mounted at a time on scroll) */}
          {isCardActive && (
            <View style={styles.shortVideoClip} pointerEvents="none">
              <YoutubePlayer
                height={SHORT_CARD_HEIGHT}
                width={embedWidth}
                play={isCardActive}
                mute={carouselMuted}
                videoId={item.videoId}
                initialPlayerParams={CAROUSEL_PLAYER_PARAMS}
                onChangeState={(state: string) => {
                  if (state === 'ended') {
                    setEndedCarouselVideoId(item.videoId);
                  }
                }}
              />
            </View>
          )}

          {/* Subtle Glass Bottom Gradient Overlay */}
          <LinearGradient
            colors={['rgba(0,0,0,0.2)', 'transparent', 'rgba(0,0,0,0.85)']}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Top Artist Verified Indicator & Sound Toggle on Active Card */}
          <View style={styles.shortCardTop}>
            <View style={styles.artistTinyPill}>
              <Ionicons name="checkmark-circle" size={12} color="#38BDF8" />
              <Text style={styles.artistTinyName} numberOfLines={1}>
                {item.artist}
              </Text>
            </View>

            {index === activeCarouselIndex && !query.trim() && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleToggleCarouselSound();
                }}
                style={styles.cardMuteBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={carouselMuted ? 'volume-mute' : 'volume-high'}
                  size={14}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            )}
          </View>

          {/* Bottom Hashtag Overlay */}
          <View style={styles.shortCardBottom}>
            <Text style={styles.shortHashtag} numberOfLines={1}>
              {item.hashtag}
            </Text>
            <Text style={styles.shortTitle} numberOfLines={1}>
              {item.title}
            </Text>
          </View>
        </LiquidGlassSurface>
      </TouchableOpacity>
    );
  };

  const renderTrackItem = ({ item, index }: any) => {
    const isCurrent = currentTrack?.videoId === item.videoId;
    return (
      <TouchableOpacity
        activeOpacity={0.78}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (query.trim()) handleCommitSearch(query);
          if (isCurrent) {
            setPlayerModalVisible(true);
          } else {
            playTrack(item, results?.tracks || [], index, 'Search');
            setPlayerModalVisible(true);
          }
        }}
      >
        <LiquidGlassSurface
          glassStyle="regular"
          isDark={isDark}
          isInteractive
          borderRadius={18}
          style={[
            styles.trackRowGlass,
            {
              backgroundColor: palette.cardBg,
              borderColor: isCurrent ? '#38BDF8' : palette.cardBorder,
              borderTopColor: palette.cardTopBorder,
              flexDirection: rowDirection,
            },
          ]}
        >
          <Image
            source={{ uri: getUniversalStudioArtwork(item.thumbnail) }}
            style={styles.trackThumb}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <View style={styles.trackInfo}>
            <Text
              style={[
                styles.trackTitle,
                { color: isCurrent ? palette.accentBlue : palette.textPrimary, textAlign, writingDirection },
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <View style={[styles.artistRow, { flexDirection: rowDirection }]}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate('ArtistDetail', {
                    artistName: item.artist,
                    artistId: item.channelId || item.artistId,
                  });
                }}
              >
                <Text style={[styles.clickableArtist, { color: palette.textSecondary }]}>
                  {item.artist}
                </Text>
              </TouchableOpacity>
              {item.isOfficial && <Ionicons name="checkmark-circle" size={13} color="#38BDF8" />}
              <Text style={[styles.trackDuration, { color: palette.textMuted }]}>
                {item.durationFormatted ? `• ${item.durationFormatted}` : ''}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (query.trim()) handleCommitSearch(query);
              if (isCurrent) {
                togglePlay();
              } else {
                playTrack(item, results?.tracks || [], index, 'Search');
              }
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={isCurrent && isPlaying ? 'pause-circle' : 'play-circle'}
              size={30}
              color={isCurrent ? palette.accentBlue : palette.textMuted}
            />
          </TouchableOpacity>
        </LiquidGlassSurface>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.baseBg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* ── Ambient Liquid Gradient Background ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.baseBg }]} />
        <LinearGradient
          colors={palette.orbTop}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.85, y: 0.75 }}
          style={styles.ambientTop}
        />
        <LinearGradient
          colors={palette.orbBottom}
          start={{ x: 0.2, y: 0.3 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.ambientBottom}
        />
      </View>

      {/* ── Top Liquid Glass Search Bar ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <LiquidGlassSurface
          glassStyle="regular"
          isDark={isDark}
          isInteractive={false}
          borderRadius={18}
          style={[
            styles.searchBarGlass,
            {
              backgroundColor: palette.inputBg,
              borderColor: palette.cardBorder,
              borderTopColor: palette.cardTopBorder,
              flexDirection: rowDirection,
            },
          ]}
        >
          <Ionicons name="search" size={20} color={palette.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: palette.textPrimary, textAlign, writingDirection }]}
            placeholder={t.searchPlaceholder}
            placeholderTextColor={palette.textMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => {
              if (query.trim()) {
                handleCommitSearch(query);
                performSearch(query.trim());
              }
            }}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={20} color={palette.textSecondary} />
            </TouchableOpacity>
          )}
        </LiquidGlassSurface>

        {/* Filter Pills when searching */}
        {query.trim().length > 0 && (
          <View style={[styles.filterRow, { flexDirection: rowDirection }]}>
            {(
              [
                { key: 'all', label: t.all },
                { key: 'tracks', label: t.songs },
                { key: 'artists', label: t.artists },
              ] as const
            ).map((f) => {
              const active = activeFilter === f.key;
              return (
                <TouchableOpacity key={f.key} onPress={() => setActiveFilter(f.key)} activeOpacity={0.8}>
                  <LiquidGlassSurface
                    glassStyle="regular"
                    isDark={isDark}
                    isInteractive
                    tintColor={active ? 'rgba(0, 122, 255, 0.4)' : undefined}
                    borderRadius={18}
                    style={[
                      styles.filterPill,
                      {
                        backgroundColor: active ? '#007AFF' : palette.inputBg,
                        borderColor: active ? '#38BDF8' : palette.pillBorder,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        { color: active ? '#FFFFFF' : palette.textSecondary, writingDirection },
                      ]}
                    >
                      {f.label}
                    </Text>
                  </LiquidGlassSurface>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.accentBlue} />
          <Text style={[styles.loadingText, { color: palette.textSecondary, writingDirection }]}>
            {t.searching}
          </Text>
        </View>
      ) : !query.trim() ? (
        /* ── Default Search View: Compact Recent Searches + Official Artist Shorts Carousel ── */
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: miniPlayerBottomGap + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Compact Recent Searches (Max 5) */}
          {recentSearches.length > 0 && (
            <View style={styles.recentSection}>
              <View style={[styles.sectionHeaderRow, { flexDirection: rowDirection }]}>
                <Text style={[styles.sectionTitle, { color: palette.textPrimary, writingDirection }]}>
                  {t.recentSearches}
                </Text>
                <TouchableOpacity onPress={clearHistory}>
                  <Text style={[styles.clearText, { color: palette.accentBlue, writingDirection }]}>
                    {t.clear}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.historyRow, { flexDirection: rowDirection }]}>
                {recentSearches.slice(0, MAX_RECENT_CHIPS).map((s, i) => (
                  <TouchableOpacity
                    key={`${s}-${i}`}
                    activeOpacity={0.8}
                    onPress={() => {
                      setQuery(s);
                      handleCommitSearch(s);
                      performSearch(s);
                    }}
                  >
                    <LiquidGlassSurface
                      glassStyle="regular"
                      isDark={isDark}
                      isInteractive
                      borderRadius={18}
                      style={[
                        styles.historyChip,
                        { backgroundColor: palette.inputBg, borderColor: palette.pillBorder },
                      ]}
                    >
                      <Text style={[styles.historyText, { color: palette.textPrimary }]} numberOfLines={1}>
                        {s}
                      </Text>
                    </LiquidGlassSurface>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ── Discover Something New: Official Artist Music Shorts Carousel ── */}
          <View style={styles.shortsSectionHeader}>
            <Text style={[styles.discoverTitle, { color: palette.textPrimary, textAlign, writingDirection }]}>
              {t.discoverShorts}
            </Text>
            <Text style={[styles.discoverSub, { color: palette.textSecondary, textAlign, writingDirection }]}>
              {t.shortsSubtitle}
            </Text>
          </View>

          {loadingShorts && shorts.length === 0 ? (
            <View style={styles.shortsLoader}>
              <ActivityIndicator size="small" color={palette.accentBlue} />
              <Text style={[styles.loadingSubText, { color: palette.textSecondary, writingDirection }]}>
                {t.loadingShorts}
              </Text>
            </View>
          ) : (
            <FlatList
              data={shorts}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item, idx) => `short-card-${item.videoId}-${idx}`}
              renderItem={renderShortCard}
              contentContainerStyle={styles.shortsCarouselList}
              snapToInterval={SHORT_CARD_WIDTH + SHORT_CARD_GAP}
              decelerationRate="fast"
              onViewableItemsChanged={onCarouselViewableChanged}
              viewabilityConfig={carouselViewabilityConfig}
            />
          )}
        </ScrollView>
      ) : results ? (
        /* ── Search Results UI (Liquid Glass) ── */
        <FlatList
          data={activeFilter === 'artists' ? [] : results.tracks}
          keyExtractor={(it, index) => `${it.videoId}-${index}`}
          renderItem={renderTrackItem}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: miniPlayerBottomGap + 24 }}
          ListHeaderComponent={
            <View style={{ marginBottom: 6 }}>
              {results.artist && activeFilter !== 'tracks' && (
                <View style={styles.artistSection}>
                  <Text
                    style={[
                      styles.sectionTitleHeader,
                      { color: palette.textSecondary, textAlign, writingDirection },
                    ]}
                  >
                    {t.verifiedArtist}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (query.trim()) handleCommitSearch(query);
                      navigation.navigate('ArtistDetail', {
                        artistName: results.artist?.name,
                        artist: results.artist,
                      });
                    }}
                  >
                    <LiquidGlassSurface
                      glassStyle="regular"
                      isDark={isDark}
                      isInteractive
                      borderRadius={22}
                      style={[
                        styles.artistFeaturedGlass,
                        {
                          backgroundColor: palette.cardBg,
                          borderColor: palette.cardBorder,
                          borderTopColor: palette.cardTopBorder,
                          flexDirection: rowDirection,
                        },
                      ]}
                    >
                      <Image
                        source={{
                          uri:
                            getUniversalArtistAvatar(results.artist.avatar, results.artist.name) ||
                            results.artist.avatar,
                        }}
                        style={styles.artistAvatar}
                        contentFit="cover"
                      />
                      <View style={styles.artistMeta}>
                        <View style={[styles.artistTitleRow, { flexDirection: rowDirection }]}>
                          <Text
                            style={[styles.artistName, { color: palette.textPrimary, textAlign }]}
                            numberOfLines={1}
                          >
                            {results.artist.name}
                          </Text>
                          <Ionicons name="checkmark-circle" size={17} color="#38BDF8" />
                        </View>
                        <Text
                          style={[
                            styles.artistSubText,
                            { color: palette.textSecondary, textAlign, writingDirection },
                          ]}
                        >
                          {results.artist.subscriberCount || t.verifiedArtist}
                        </Text>
                        <View style={[styles.artistActionBtn, { flexDirection: rowDirection }]}>
                          <Text style={[styles.artistActionText, { color: palette.accentBlue, writingDirection }]}>
                            {t.viewProfile}
                          </Text>
                          <Ionicons
                            name={isAr ? 'chevron-back' : 'chevron-forward'}
                            size={14}
                            color={palette.accentBlue}
                          />
                        </View>
                      </View>
                    </LiquidGlassSurface>
                  </TouchableOpacity>
                </View>
              )}

              {activeFilter !== 'artists' && (
                <Text
                  style={[
                    styles.sectionTitleHeader,
                    { color: palette.textSecondary, textAlign, writingDirection },
                  ]}
                >
                  {t.songsHeader}
                </Text>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centerEmpty}>
              <Ionicons name="search-outline" size={54} color={palette.textMuted} />
              <Text style={[styles.emptyTitle, { color: palette.textPrimary, writingDirection }]}>
                {t.nothingFound}
              </Text>
              <Text style={[styles.emptySub, { color: palette.textSecondary, writingDirection }]}>
                {t.tryAnother}
              </Text>
            </View>
          }
        />
      ) : null}

      {/* ── Fullscreen TikTok/Reels-Style Official Artist Shorts Modal ── */}
      <ShortsReelsModal
        visible={reelsOpen}
        shorts={shorts}
        initialIndex={reelsInitialIndex}
        onClose={() => setReelsOpen(false)}
        onSelectArtist={(artistName, artistId) => {
          navigation.navigate('ArtistDetail', { artistName, artistId });
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  ambientTop: {
    position: 'absolute',
    top: -60,
    left: -50,
    width: 400,
    height: 400,
    borderRadius: 200,
  },
  ambientBottom: {
    position: 'absolute',
    bottom: -80,
    right: -50,
    width: 420,
    height: 420,
    borderRadius: 210,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchBarGlass: {
    height: 50,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    fontWeight: '600',
  },
  filterRow: {
    marginTop: 12,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    paddingTop: 6,
  },
  recentSection: {
    marginBottom: 18,
  },
  sectionHeaderRow: {
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  clearText: {
    fontSize: 13,
    fontWeight: '700',
  },
  historyRow: {
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
  },
  historyChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  historyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  shortsSectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  discoverTitle: {
    fontSize: 20,
    fontWeight: '900',
  },
  discoverSub: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 3,
  },
  shortsLoader: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 10,
  },
  loadingSubText: {
    fontSize: 13,
    fontWeight: '600',
  },
  shortsCarouselList: {
    paddingHorizontal: 16,
    gap: SHORT_CARD_GAP,
    paddingBottom: 10,
  },
  shortCard: {
    width: SHORT_CARD_WIDTH,
    height: SHORT_CARD_HEIGHT,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 18,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  shortVideoClip: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shortCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    zIndex: 4,
  },
  artistTinyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.52)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
    maxWidth: 104,
  },
  artistTinyName: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  cardMuteBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.58)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shortCardBottom: {
    padding: 10,
    zIndex: 4,
  },
  shortHashtag: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '900',
  },
  shortTitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  centerEmpty: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
  },
  artistSection: {
    marginBottom: 16,
  },
  sectionTitleHeader: {
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 8,
  },
  artistFeaturedGlass: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
  },
  artistAvatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
  },
  artistMeta: {
    flex: 1,
  },
  artistTitleRow: {
    alignItems: 'center',
    gap: 6,
  },
  artistName: {
    fontSize: 17,
    fontWeight: '800',
    flexShrink: 1,
  },
  artistSubText: {
    fontSize: 12.5,
    marginTop: 2,
  },
  artistActionBtn: {
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  artistActionText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  trackRowGlass: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  trackThumb: {
    width: 50,
    height: 50,
    borderRadius: 12,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  artistRow: {
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  clickableArtist: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  trackDuration: {
    fontSize: 12,
  },
});

export default MusicSearch;
