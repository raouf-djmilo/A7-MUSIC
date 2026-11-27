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
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../providers/AuthProvider';
import { useAudioStore } from '../store/useAudioStore';
import { useLanguageStore } from '../store/useLanguageStore';
import { useTheme } from '../theme/ThemeContext';
import { CURATED_TRACKS, searchCuratedMusic } from '../data/curatedMusic';
import {
  searchUnifiedMusicCatalog,
  searchYouTubePlaylists,
  ArtistMatch,
  ArtistAlbumItem,
  AccountKind,
} from '../services/youtubeMusicService';
import {
  ArtistMusicShort,
  fetchOfficialArtistShorts,
} from '../services/youtubeShortsService';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import {
  getUniversalStudioArtworkSource,
  getUniversalArtistAvatar,
} from '../utils/artworkHelper';
import { addToSearchHistory, cleanSearchHistory } from '../features/music/engines/searchHistory.engine';
import { LiquidGlassSurface } from '../components/LiquidGlassSurface';
import { ShortsReelsModal } from '../components/ShortsReelsModal';
import { YouTubeShortWebView, YouTubeShortWebViewHandle } from '../components/YouTubeShortWebView';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RECENT_SEARCHES_KEY = '@nouble_recent_searches';
const MAX_RECENT_CHIPS = 5;

const SHORT_CARD_WIDTH = 152;
const SHORT_CARD_HEIGHT = 248;
const SHORT_CARD_GAP = 12;

function getAccountBadgeMeta(kind: AccountKind | undefined, isAr: boolean) {
  switch (kind) {
    case 'official_artist':
      return {
        label: isAr ? 'فنان رسمي' : 'Official Artist',
        icon: 'musical-note' as const,
        color: '#38BDF8',
        tint: 'rgba(56, 189, 248, 0.24)',
        border: 'rgba(56, 189, 248, 0.50)',
      };
    case 'music_studio':
      return {
        label: isAr ? 'ستوديو / إنتاج' : 'Music Studio',
        icon: 'disc' as const,
        color: '#C084FC',
        tint: 'rgba(167, 139, 250, 0.24)',
        border: 'rgba(192, 132, 252, 0.50)',
      };
    case 'verified_channel':
      return {
        label: isAr ? 'قناة موثّقة' : 'Verified Channel',
        icon: 'checkmark-circle' as const,
        color: '#34D399',
        tint: 'rgba(52, 211, 153, 0.22)',
        border: 'rgba(52, 211, 153, 0.48)',
      };
    default:
      return {
        label: isAr ? 'قناة يوتيوب' : 'YouTube Channel',
        icon: 'logo-youtube' as const,
        color: '#E2E8F0',
        tint: 'rgba(148, 163, 184, 0.20)',
        border: 'rgba(255, 255, 255, 0.28)',
      };
  }
}

/** 3D Liquid Glass Circular Avatar Ring — strict 1:1 aspect ratio, zero distortion */
const LiquidGlassCircleAvatar: React.FC<{
  uri?: string | null;
  name?: string;
  size: number;
  ringColor?: string;
  isDark: boolean;
}> = ({ uri, name, size, ringColor = 'rgba(255,255,255,0.34)', isDark }) => {
  const resolvedUri = getUniversalArtistAvatar(uri, name) || uri || '';
  const radius = size / 2;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        padding: 2,
        backgroundColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.68)',
        borderWidth: 1.25,
        borderColor: ringColor,
        borderTopColor: 'rgba(255,255,255,0.72)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: isDark ? 0.42 : 0.16,
        shadowRadius: 10,
        elevation: 6,
      }}
    >
      <View
        style={{
          width: '100%',
          height: '100%',
          borderRadius: radius - 2,
          overflow: 'hidden',
          backgroundColor: isDark ? '#151B28' : '#E2E8F0',
        }}
      >
        {resolvedUri ? (
          <Image
            source={{ uri: resolvedUri }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            contentPosition="top"
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : null}
        <LinearGradient
          colors={['rgba(255,255,255,0.28)', 'transparent']}
          locations={[0, 0.45]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>
    </View>
  );
};

/** 3D Liquid Glass Account Badge Pill */
const LiquidGlassAccountBadge: React.FC<{
  kind?: AccountKind;
  isAr: boolean;
  isDark: boolean;
  compact?: boolean;
}> = ({ kind, isAr, isDark, compact = false }) => {
  const meta = getAccountBadgeMeta(kind, isAr);
  return (
    <LiquidGlassSurface
      glassStyle="regular"
      isDark={isDark}
      isInteractive={false}
      tintColor={meta.tint}
      borderRadius={12}
      style={[
        compact ? styles.accountMiniBadgeGlass : styles.accountTypeBadgeGlass,
        {
          borderColor: meta.border,
          borderTopColor: 'rgba(255,255,255,0.52)',
          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.48)',
        },
      ]}
    >
      <Ionicons name={meta.icon} size={compact ? 10 : 12} color={meta.color} />
      <Text
        style={[
          compact ? styles.accountMiniBadgeText : styles.accountTypeBadgeText,
          { color: isDark ? '#FFFFFF' : '#0F172A' },
        ]}
        numberOfLines={1}
      >
        {meta.label}
      </Text>
    </LiquidGlassSurface>
  );
};

export const MusicSearch = ({ route }: any) => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const isScreenFocused = useIsFocused();
  const { isDark } = useTheme();
  const language = useLanguageStore((s) => s.language);
  const isAr = language === 'ar';
  const rowDirection = isAr ? 'row-reverse' : 'row';
  const textAlign = isAr ? 'right' : 'left';
  const writingDirection = isAr ? 'rtl' : 'ltr';
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    artist: ArtistMatch | null;
    accounts: ArtistMatch[];
    tracks: any[];
    albums: ArtistAlbumItem[];
  } | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'tracks' | 'albums' | 'artists'>('all');

  // Official Artist Shorts Carousel States
  const [shorts, setShorts] = useState<ArtistMusicShort[]>([]);
  const [loadingShorts, setLoadingShorts] = useState(true);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);
  const [settledCarouselIndex, setSettledCarouselIndex] = useState(0);
  const [carouselMuted, setCarouselMuted] = useState(true);
  const [endedCarouselVideoId, setEndedCarouselVideoId] = useState<string | null>(null);

  // Fullscreen TikTok/Reels Shorts Modal States
  const [reelsOpen, setReelsOpen] = useState(false);
  const [reelsInitialIndex, setReelsInitialIndex] = useState(0);
  const carouselWebViewRef = useRef<YouTubeShortWebViewHandle>(null);

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
        albums: 'الألبومات',
        artists: 'الفنانون والقنوات',
        searching: 'جاري البحث...',
        topResult: 'أفضل نتيجة',
        artistsAndChannels: 'الفنانون والاستوديوهات والقنوات',
        viewProfile: 'فتح البروفايل',
        albumsHeader: 'الألبومات والإصدارات',
        songsHeader: 'الأغاني',
        nothingFound: `لا توجد نتائج لـ "${query}"`,
        tryAnother: 'جرّب البحث عن فنان أو استوديو أو أغنية أخرى.',
        shortsSubtitle: 'مقاطع موسيقية قصيرة من القنوات الرسمية',
      }
    : {
        searchPlaceholder: 'Artists, Studios, Songs, or Albums...',
        recentSearches: 'Recent Searches',
        clear: 'Clear',
        discoverShorts: 'Discover something new',
        loadingShorts: 'Loading official artist shorts...',
        all: 'All',
        songs: 'Songs',
        albums: 'Albums',
        artists: 'Artists & Channels',
        searching: 'Searching Music...',
        topResult: 'Top Result',
        artistsAndChannels: 'Artists, Studios & Channels',
        viewProfile: 'Open Profile',
        albumsHeader: 'Albums & Releases',
        songsHeader: 'Songs',
        nothingFound: `Nothing found for "${query}"`,
        tryAnother: 'Try searching for another artist, channel, or song.',
        shortsSubtitle: 'Official artist music shorts',
      };

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

  const followedNamesList = useMemo(
    () => (followedArtists || []).map((a) => a.name).filter(Boolean),
    [followedArtists]
  );
  const followedNamesKey = useMemo(
    () => followedNamesList.slice(0, 4).join('|'),
    [followedNamesList]
  );

  useEffect(() => {
    let active = true;
    setLoadingShorts(true);
    const names = followedNamesKey ? followedNamesKey.split('|').filter(Boolean) : [];
    fetchOfficialArtistShorts(names, user?.id || 'guest')
      .then((list) => {
        if (active) setShorts(list);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingShorts(false);
      });
    return () => {
      active = false;
    };
  }, [followedNamesKey, user?.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSettledCarouselIndex(activeCarouselIndex);
    }, 120);
    return () => clearTimeout(timer);
  }, [activeCarouselIndex]);

  useEffect(() => {
    const initialQuery = route?.params?.initialQuery;
    if (initialQuery && typeof initialQuery === 'string' && initialQuery.trim()) {
      setQuery(initialQuery.trim());
    }
  }, [route?.params?.initialQuery]);

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
      const unified = await searchUnifiedMusicCatalog(searchTerm);
      const tracks = unified.tracks || [];
      const albumsList = unified.albums || (await searchYouTubePlaylists(searchTerm).catch(() => [] as ArtistAlbumItem[]));
      const accountsList = unified.accounts || (unified.artist ? [unified.artist] : []);

      if (tracks.length > 0 || accountsList.length > 0 || albumsList.length > 0) {
        const formatted = tracks.map((item) => ({
          ...item,
          durationFormatted: `${Math.floor((item.duration || 180000) / 60000)}:${String(
            Math.floor(((item.duration || 180000) % 60000) / 1000)
          ).padStart(2, '0')}`,
        }));
        setResults({
          artist: unified.artist || accountsList[0] || null,
          accounts: accountsList,
          tracks: formatted,
          albums: albumsList,
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
          accounts: [],
          tracks: fallbackList,
          albums: [],
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

  const openAccountProfile = useCallback(
    (acc: ArtistMatch) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (query.trim()) handleCommitSearch(query);
      navigation.navigate('ArtistDetail', {
        artistName: acc.name,
        artistId: acc.channelId,
        artist: acc,
      });
    },
    [query, handleCommitSearch, navigation]
  );

  const openAlbumDetails = useCallback(
    (alb: ArtistAlbumItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (query.trim()) handleCommitSearch(query);
      navigation.navigate('AlbumDetails', {
        playlistId: alb.id,
        albumTitle: alb.title,
        artistName: alb.artist || results?.artist?.name || query.trim(),
        cover: alb.cover,
        type: alb.type || 'album',
      });
    },
    [query, handleCommitSearch, navigation, results?.artist?.name]
  );

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
      carouselWebViewRef.current?.setMuted(nextMuted);
      if (!nextMuted && isPlaying) {
        togglePlay();
      }
      return nextMuted;
    });
  };

  useEffect(() => {
    if (!isSearchTabActive || reelsOpen || query.trim().length > 0) {
      carouselWebViewRef.current?.pauseAndMute();
      setCarouselMuted(true);
    }
  }, [isSearchTabActive, reelsOpen, query]);

  const renderShortCard = ({ item, index }: { item: ArtistMusicShort; index: number }) => {
    const isActive =
      isSearchTabActive &&
      !query.trim() &&
      !reelsOpen &&
      index === settledCarouselIndex;
    const isEnded = endedCarouselVideoId === item.videoId;
    const isCardPlaying = isActive && !isEnded;
    const embedWidth = Math.ceil(SHORT_CARD_HEIGHT * (16 / 9));

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          carouselWebViewRef.current?.pauseAndMute();
          setCarouselMuted(true);
          setReelsInitialIndex(index);
          setReelsOpen(true);
        }}
      >
        <LiquidGlassSurface
          glassStyle="regular"
          isDark={isDark}
          isInteractive
          borderRadius={22}
          style={[
            styles.shortCard,
            {
              borderColor: isActive ? '#38BDF8' : palette.cardBorder,
              borderTopColor: 'rgba(255, 255, 255, 0.42)',
            },
          ]}
        >
          <Image
            source={{ uri: item.thumbnail }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
          />

          {isActive && (
            <View style={styles.shortVideoClip} pointerEvents="none">
              <YouTubeShortWebView
                ref={carouselWebViewRef}
                height={SHORT_CARD_HEIGHT}
                width={embedWidth}
                play={isCardPlaying}
                muted={carouselMuted}
                videoId={item.videoId}
                onStateChange={(state) => {
                  if (state === 'ended' && isActive) {
                    setEndedCarouselVideoId(item.videoId);
                  }
                }}
              />
            </View>
          )}

          <LinearGradient
            colors={['rgba(255,255,255,0.14)', 'transparent', 'rgba(0,0,0,0.84)']}
            locations={[0, 0.42, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={styles.shortCardTop}>
            <View />
            {index === activeCarouselIndex && !query.trim() && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleToggleCarouselSound();
                }}
                activeOpacity={0.8}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <LiquidGlassSurface
                  glassStyle="regular"
                  isDark
                  isInteractive
                  borderRadius={15}
                  style={styles.cardMuteBtn}
                >
                  <Ionicons
                    name={carouselMuted ? 'volume-mute' : 'volume-high'}
                    size={15}
                    color="#FFFFFF"
                  />
                </LiquidGlassSurface>
              </TouchableOpacity>
            )}
          </View>

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

  const renderAccountRow = (acc: ArtistMatch, idx: number) => {
    const meta = getAccountBadgeMeta(acc.accountKind, isAr);
    return (
      <TouchableOpacity
        key={`acc-row-${acc.channelId || acc.name}-${idx}`}
        activeOpacity={0.85}
        onPress={() => openAccountProfile(acc)}
      >
        <LiquidGlassSurface
          glassStyle="regular"
          isDark={isDark}
          isInteractive
          borderRadius={20}
          style={[
            styles.accountRowGlass,
            {
              backgroundColor: palette.cardBg,
              borderColor: palette.cardBorder,
              borderTopColor: palette.cardTopBorder,
              flexDirection: rowDirection,
            },
          ]}
        >
          <LiquidGlassCircleAvatar
            uri={acc.avatar}
            name={acc.name}
            size={58}
            ringColor={meta.border}
            isDark={isDark}
          />
          <View style={styles.artistMeta}>
            <View style={[styles.artistTitleRow, { flexDirection: rowDirection }]}>
              <Text
                style={[styles.artistName, { color: palette.textPrimary, textAlign }]}
                numberOfLines={1}
              >
                {acc.name}
              </Text>
              <Ionicons name={meta.icon} size={16} color={meta.color} />
            </View>
            <View style={[styles.accountSubRow, { flexDirection: rowDirection }]}>
              <LiquidGlassAccountBadge kind={acc.accountKind} isAr={isAr} isDark={isDark} />
              {acc.subscriberCount ? (
                <Text style={[styles.accountAudienceTxt, { color: palette.textSecondary }]} numberOfLines={1}>
                  {acc.subscriberCount}
                </Text>
              ) : null}
            </View>
          </View>
          <Ionicons
            name={isAr ? 'chevron-back' : 'chevron-forward'}
            size={18}
            color={palette.textMuted}
          />
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
          <View
            style={[
              styles.trackThumbFrame,
              {
                borderColor: isDark ? 'rgba(255,255,255,0.20)' : 'rgba(15,23,42,0.10)',
                backgroundColor: isDark ? '#151B28' : '#E2E8F0',
              },
            ]}
          >
            <Image
              source={getUniversalStudioArtworkSource(item.thumbnail, item.title, item.artist, item.videoId)}
              style={styles.trackThumbImg}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          </View>
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
              {item.isOfficial && <Ionicons name="musical-note" size={13} color="#38BDF8" />}
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

  const otherAccounts = useMemo(() => {
    if (!results?.accounts) return [];
    const primaryKey = results.artist?.channelId || results.artist?.name?.toLowerCase();
    return results.accounts.filter((acc) => {
      const k = acc.channelId || acc.name?.toLowerCase();
      return k !== primaryKey;
    });
  }, [results?.accounts, results?.artist]);

  const albumGridWidth = (SCREEN_WIDTH - 44) / 2;

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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.filterRow, { flexDirection: rowDirection }]}
          >
            {(
              [
                { key: 'all', label: t.all },
                { key: 'tracks', label: t.songs },
                { key: 'albums', label: t.albums },
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
          </ScrollView>
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
              data={shorts.slice(0, 10)}
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
        /* ── Search Results UI (Apple Music + YouTube Multi-Type Display) ── */
        <FlatList
          data={activeFilter === 'artists' || activeFilter === 'albums' ? [] : results.tracks}
          keyExtractor={(it, index) => `${it.videoId}-${index}`}
          renderItem={renderTrackItem}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: miniPlayerBottomGap + 24 }}
          ListHeaderComponent={
            <View style={{ marginBottom: 6 }}>
              {/* 1. Featured Top Result Account Card (All tab) */}
              {results.artist && activeFilter === 'all' && (() => {
                const topAcc = results.artist!;
                const meta = getAccountBadgeMeta(topAcc.accountKind, isAr);
                return (
                  <View style={styles.artistSection}>
                    <Text
                      style={[
                        styles.sectionTitleHeader,
                        { color: palette.textSecondary, textAlign, writingDirection },
                      ]}
                    >
                      {t.topResult}
                    </Text>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => openAccountProfile(topAcc)}>
                      <LiquidGlassSurface
                        glassStyle="regular"
                        isDark={isDark}
                        isInteractive
                        borderRadius={22}
                        style={[
                          styles.artistFeaturedGlass,
                          {
                            backgroundColor: palette.cardBg,
                            borderColor: meta.border,
                            borderTopColor: palette.cardTopBorder,
                            flexDirection: rowDirection,
                          },
                        ]}
                      >
                        <LiquidGlassCircleAvatar
                          uri={topAcc.avatar}
                          name={topAcc.name}
                          size={70}
                          ringColor={meta.border}
                          isDark={isDark}
                        />
                        <View style={styles.artistMeta}>
                          <View style={[styles.artistTitleRow, { flexDirection: rowDirection }]}>
                            <Text
                              style={[styles.artistName, { color: palette.textPrimary, textAlign }]}
                              numberOfLines={1}
                            >
                              {topAcc.name}
                            </Text>
                            <Ionicons name={meta.icon} size={17} color={meta.color} />
                          </View>

                          <View style={[styles.accountSubRow, { flexDirection: rowDirection }]}>
                            <LiquidGlassAccountBadge kind={topAcc.accountKind} isAr={isAr} isDark={isDark} />
                            {topAcc.subscriberCount ? (
                              <Text style={[styles.accountAudienceTxt, { color: palette.textSecondary }]} numberOfLines={1}>
                                {topAcc.subscriberCount}
                              </Text>
                            ) : null}
                          </View>

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
                );
              })()}

              {/* 2A. Matching Artists, Studios & YouTube Channels Carousel (All tab) */}
              {activeFilter === 'all' && otherAccounts.length > 0 && (
                <View style={styles.artistSection}>
                  <View style={[styles.sectionHeaderRowInline, { flexDirection: rowDirection }]}>
                    <Text
                      style={[
                        styles.sectionTitleHeader,
                        { color: palette.textSecondary, textAlign, writingDirection, marginBottom: 0 },
                      ]}
                    >
                      {t.artistsAndChannels}
                    </Text>
                    <TouchableOpacity onPress={() => setActiveFilter('artists')}>
                      <Text style={{ color: palette.accentBlue, fontSize: 12.5, fontWeight: '700' }}>
                        {isAr ? 'عرض الكل' : 'See all'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 10, paddingVertical: 6 }}
                  >
                    {otherAccounts.map((acc, idx) => {
                      const meta = getAccountBadgeMeta(acc.accountKind, isAr);
                      return (
                        <TouchableOpacity
                          key={`acc-card-${acc.channelId || acc.name}-${idx}`}
                          activeOpacity={0.85}
                          onPress={() => openAccountProfile(acc)}
                        >
                          <LiquidGlassSurface
                            glassStyle="regular"
                            isDark={isDark}
                            isInteractive
                            borderRadius={20}
                            style={[
                              styles.accountCarouselCard,
                              {
                                backgroundColor: palette.cardBg,
                                borderColor: palette.cardBorder,
                                borderTopColor: palette.cardTopBorder,
                              },
                            ]}
                          >
                            <LiquidGlassCircleAvatar
                              uri={acc.avatar}
                              name={acc.name}
                              size={76}
                              ringColor={meta.border}
                              isDark={isDark}
                            />
                            <Text
                              style={[styles.accountCarouselName, { color: palette.textPrimary }]}
                              numberOfLines={1}
                            >
                              {acc.name}
                            </Text>
                            <LiquidGlassAccountBadge kind={acc.accountKind} isAr={isAr} isDark={isDark} compact />
                          </LiquidGlassSurface>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* 2B. Full Artists, Studios & Channels List (Artists & Channels tab) */}
              {activeFilter === 'artists' && (
                <View style={{ gap: 10, marginTop: 4 }}>
                  <Text
                    style={[
                      styles.sectionTitleHeader,
                      { color: palette.textSecondary, textAlign, writingDirection },
                    ]}
                  >
                    {t.artistsAndChannels} ({results.accounts.length})
                  </Text>
                  {results.accounts.length > 0 ? (
                    results.accounts.map((acc, idx) => renderAccountRow(acc, idx))
                  ) : (
                    <View style={styles.centerEmpty}>
                      <Ionicons name="people-outline" size={48} color={palette.textMuted} />
                      <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>{t.nothingFound}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* 3A. Search Albums & Releases Carousel (All tab) */}
              {results.albums && results.albums.length > 0 && activeFilter === 'all' && (
                <View style={styles.artistSection}>
                  <View style={[styles.sectionHeaderRowInline, { flexDirection: rowDirection }]}>
                    <Text
                      style={[
                        styles.sectionTitleHeader,
                        { color: palette.textSecondary, textAlign, writingDirection, marginBottom: 0 },
                      ]}
                    >
                      {t.albumsHeader}
                    </Text>
                    <TouchableOpacity onPress={() => setActiveFilter('albums')}>
                      <Text style={{ color: palette.accentBlue, fontSize: 12.5, fontWeight: '700' }}>
                        {isAr ? 'عرض الكل' : 'See all'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 12, paddingVertical: 6 }}
                  >
                    {results.albums.map((alb, idx) => (
                      <TouchableOpacity
                        key={`srch-alb-${alb.id}-${idx}`}
                        activeOpacity={0.85}
                        onPress={() => openAlbumDetails(alb)}
                      >
                        <LiquidGlassSurface
                          glassStyle="regular"
                          isDark={isDark}
                          isInteractive
                          borderRadius={18}
                          style={[
                            styles.searchAlbumCard,
                            {
                              backgroundColor: palette.cardBg,
                              borderColor: palette.cardBorder,
                              borderTopColor: palette.cardTopBorder,
                            },
                          ]}
                        >
                          <Image
                            source={getUniversalStudioArtworkSource(
                              alb.cover || results.tracks[0]?.thumbnail,
                              alb.title,
                              alb.artist || results.artist?.name || ''
                            )}
                            style={styles.searchAlbumCover}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                          />
                          <Text
                            style={[
                              styles.searchAlbumTitle,
                              { color: palette.textPrimary, textAlign, writingDirection },
                            ]}
                            numberOfLines={1}
                          >
                            {alb.title}
                          </Text>
                          <Text
                            style={[
                              styles.searchAlbumYear,
                              { color: palette.textSecondary, textAlign, writingDirection },
                            ]}
                            numberOfLines={1}
                          >
                            {alb.artist ? `${alb.artist} · ${alb.year}` : alb.year}
                          </Text>
                        </LiquidGlassSurface>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* 3B. Albums 2-Column Grid (Albums tab) */}
              {activeFilter === 'albums' && (
                <View style={{ marginTop: 4 }}>
                  <Text
                    style={[
                      styles.sectionTitleHeader,
                      { color: palette.textSecondary, textAlign, writingDirection },
                    ]}
                  >
                    {t.albumsHeader} ({results.albums.length})
                  </Text>
                  {results.albums.length > 0 ? (
                    <View style={styles.albumsGridWrap}>
                      {results.albums.map((alb, idx) => (
                        <TouchableOpacity
                          key={`grid-alb-${alb.id}-${idx}`}
                          style={{ width: albumGridWidth }}
                          activeOpacity={0.85}
                          onPress={() => openAlbumDetails(alb)}
                        >
                          <LiquidGlassSurface
                            glassStyle="regular"
                            isDark={isDark}
                            isInteractive
                            borderRadius={18}
                            style={[
                              styles.searchAlbumGridCard,
                              {
                                width: albumGridWidth,
                                backgroundColor: palette.cardBg,
                                borderColor: palette.cardBorder,
                                borderTopColor: palette.cardTopBorder,
                              },
                            ]}
                          >
                            <Image
                              source={getUniversalStudioArtworkSource(
                                alb.cover || results.tracks[0]?.thumbnail,
                                alb.title,
                                alb.artist || results.artist?.name || ''
                              )}
                              style={{
                                width: albumGridWidth - 18,
                                height: albumGridWidth - 18,
                                borderRadius: 12,
                                marginBottom: 8,
                              }}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                            />
                            <Text
                              style={[
                                styles.searchAlbumTitle,
                                { color: palette.textPrimary, textAlign, writingDirection },
                              ]}
                              numberOfLines={1}
                            >
                              {alb.title}
                            </Text>
                            <Text
                              style={[
                                styles.searchAlbumYear,
                                { color: palette.textSecondary, textAlign, writingDirection },
                              ]}
                              numberOfLines={1}
                            >
                              {alb.artist ? `${alb.artist} · ${alb.year}` : alb.year}
                            </Text>
                          </LiquidGlassSurface>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.centerEmpty}>
                      <Ionicons name="albums-outline" size={48} color={palette.textMuted} />
                      <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>{t.nothingFound}</Text>
                    </View>
                  )}
                </View>
              )}

              {activeFilter !== 'artists' && activeFilter !== 'albums' && (
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
            activeFilter === 'albums' || activeFilter === 'artists' ? undefined : (
              <View style={styles.centerEmpty}>
                <Ionicons name="search-outline" size={54} color={palette.textMuted} />
                <Text style={[styles.emptyTitle, { color: palette.textPrimary, writingDirection }]}>
                  {t.nothingFound}
                </Text>
                <Text style={[styles.emptySub, { color: palette.textSecondary, writingDirection }]}>
                  {t.tryAnother}
                </Text>
              </View>
            )
          }
        />
      ) : null}

      {/* ── Fullscreen TikTok/Reels-Style Unlimited Official Artist Shorts Modal ── */}
      <ShortsReelsModal
        visible={reelsOpen}
        shorts={shorts}
        initialIndex={reelsInitialIndex}
        userId={user?.id || 'guest'}
        followedArtistNames={followedNamesList}
        onFeedGrow={(updatedFeed) => setShorts(updatedFeed)}
        onClose={() => setReelsOpen(false)}
        onSelectArtist={(artistObj) => {
          navigation.navigate('ArtistDetail', {
            artistName: artistObj.name,
            artistId: artistObj.id,
            artist: {
              name: artistObj.name,
              avatar: artistObj.avatar,
              channelId: artistObj.id,
              isOfficial: artistObj.isOfficial,
              isOfficialArtist: artistObj.isOfficial,
              accountKind: artistObj.isOfficial ? 'official_artist' : 'channel',
            },
          });
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
    paddingHorizontal: 15,
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
  sectionHeaderRowInline: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
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
  cardMuteBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
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
    width: 68,
    height: 68,
    borderRadius: 34,
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
  accountSubRow: {
    alignItems: 'center',
    gap: 8,
    marginTop: 5,
    flexWrap: 'wrap',
  },
  accountTypeBadgeGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accountTypeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  accountAudienceTxt: {
    fontSize: 12,
    flexShrink: 1,
  },
  artistActionBtn: {
    alignItems: 'center',
    gap: 4,
    marginTop: 7,
  },
  artistActionText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  accountCarouselCard: {
    width: 142,
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    overflow: 'hidden',
  },
  accountCarouselName: {
    fontSize: 13.5,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 9,
    marginBottom: 6,
  },
  accountMiniBadgeGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 12,
    borderWidth: 1,
    maxWidth: 122,
    overflow: 'hidden',
  },
  accountMiniBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    flexShrink: 1,
  },
  accountRowGlass: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  searchAlbumCard: {
    width: 136,
    borderRadius: 18,
    borderWidth: 1,
    padding: 9,
    overflow: 'hidden',
  },
  searchAlbumCover: {
    width: 116,
    height: 116,
    borderRadius: 12,
    marginBottom: 7,
  },
  albumsGridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  searchAlbumGridCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 9,
    overflow: 'hidden',
  },
  searchAlbumTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  searchAlbumYear: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
  },
  trackRowGlass: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  trackThumbFrame: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  trackThumbImg: {
    width: '100%',
    height: '100%',
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
