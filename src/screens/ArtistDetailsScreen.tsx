import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Animated,
  Platform,
  ScrollView,
} from 'react-native';
import {
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  fetchArtistFullProfile,
  fetchArtistMoreTracks,
  ArtistFullProfile,
  ArtistAlbumItem,
} from '../services/youtubeMusicService';
import { useAudioStore, Track } from '../store/useAudioStore';
import { useTheme } from '../theme/ThemeContext';
import { useLanguageStore } from '../store/useLanguageStore';
import { ThemeTokens } from '../theme/types';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import {
  getUniversalStudioArtwork,
  getUniversalStudioArtworkSource,
  getUniversalArtistAvatar,
} from '../utils/artworkHelper';
import { LiquidGlassSurface } from '../components/LiquidGlassSurface';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Skeleton Shimmer Placeholder Component ──
const SkeletonItem: React.FC<{ style: any }> = ({ style }) => {
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 0.7,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0.3,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return <Animated.View style={[style, { opacity: anim, backgroundColor: 'rgba(255, 255, 255, 0.12)' }]} />;
};

type FilterTab = 'all' | 'popular' | 'albums' | 'singles' | 'playlists';

export const ArtistDetailsScreen = ({ route, navigation }: any) => {
  const { artistName, artist } = route.params || {};
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const language = useLanguageStore((s) => s.language);
  const isAr = language === 'ar';
  const rowDirection = isAr ? 'row-reverse' : 'row';
  const textAlign = isAr ? 'right' : 'left';
  const writingDirection = isAr ? 'rtl' : 'ltr';
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  // Audio store state & actions
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const playTrack = useAudioStore((s) => s.playTrack);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const playAlbumContext = useAudioStore((s) => s.playAlbumContext);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);
  const followedArtistIds = useAudioStore((s) => s.followedArtistIds);
  const toggleFollowArtist = useAudioStore((s) => s.toggleFollowArtist);
  const likedTrackIds = useAudioStore((s) => s.likedTrackIds);
  const toggleLike = useAudioStore((s) => s.toggleLike);

  const [data, setData] = useState<ArtistFullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [visibleTrackLimit, setVisibleTrackLimit] = useState(10);
  const [loadingMoreTracks, setLoadingMoreTracks] = useState(false);
  const moreTracksPageRef = useRef(0);

  // Releases Discography Modal State (Spotify Releases view)
  const [releasesModalVisible, setReleasesModalVisible] = useState(false);
  const [releasesTab, setReleasesTab] = useState<'albums' | 'singles' | 'playlists'>('albums');
  const [releasesLimit, setReleasesLimit] = useState(30);
  const [showAllAlbums, setShowAllAlbums] = useState(false);
  const [showAllSingles, setShowAllSingles] = useState(false);
  const [showAllPlaylists, setShowAllPlaylists] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;
  const resolvedName = artistName || artist?.name || artist?.title || 'Artist';

  const isFollowing = useMemo(() => {
    const targetName = data?.name || resolvedName;
    return followedArtistIds.includes(targetName);
  }, [followedArtistIds, data?.name, resolvedName]);

  // Tracks by this artist that the user has already liked
  const userLikedTracks = useMemo(() => {
    if (!data?.topTracks) return [];
    return data.topTracks.filter((t) => likedTrackIds.includes(t.videoId));
  }, [data?.topTracks, likedTrackIds]);

  useEffect(() => {
    let isMounted = true;
    const fetchArtist = async () => {
      setLoading(true);
      try {
        const profile = await fetchArtistFullProfile(resolvedName);
        if (!isMounted) return;
        setData(profile);
      } catch (err) {
        console.warn('[ArtistDetailsScreen] Fetch error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchArtist();
    return () => {
      isMounted = false;
    };
  }, [resolvedName]);

  const styles = useMemo(() => createThemedStyles(theme, isDark), [theme, isDark]);

  // Sticky header opacity on scroll
  const stickyHeaderOpacity = scrollY.interpolate({
    inputRange: [180, 240],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const heroImageTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, 240],
    outputRange: [-50, 0, 80],
    extrapolate: 'clamp',
  });

  const handlePlayArtistCatalog = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const tracksToPlay: Track[] = data?.topTracks || [];
    if (tracksToPlay.length > 0) {
      playAlbumContext(tracksToPlay, 0, `${data?.name || resolvedName} Radio`);
      setPlayerModalVisible(true);
    }
  };

  const handlePlayLikedSongs = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (userLikedTracks.length > 0) {
      playAlbumContext(userLikedTracks, 0, `Liked • ${data?.name || resolvedName}`);
      setPlayerModalVisible(true);
    } else {
      handlePlayArtistCatalog();
    }
  };

  const handleToggleFollow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const targetName = data?.name || resolvedName;
    toggleFollowArtist({
      id: targetName,
      name: targetName,
      avatar: data?.avatar || '',
    });
  };

  const handleShowMoreTracks = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextLimit = visibleTrackLimit + 30;
    setVisibleTrackLimit(nextLimit);

    const existing = data?.topTracks || [];
    if (nextLimit >= existing.length && data?.name && !loadingMoreTracks) {
      setLoadingMoreTracks(true);
      try {
        const more = await fetchArtistMoreTracks(
          data.name,
          moreTracksPageRef.current,
          existing.map((t) => t.videoId)
        );
        moreTracksPageRef.current += 1;
        if (more.length > 0) {
          setData((prev) =>
            prev ? { ...prev, topTracks: [...prev.topTracks, ...more] } : prev
          );
        }
      } catch {
        // Ignore pagination network error
      } finally {
        setLoadingMoreTracks(false);
      }
    }
  };

  const displayedTracks = useMemo(() => {
    const all = data?.topTracks || [];
    const cap = activeFilter === 'popular' ? Math.max(visibleTrackLimit, 30) : visibleTrackLimit;
    return all.slice(0, cap);
  }, [data?.topTracks, visibleTrackLimit, activeFilter]);

  const popularReleasesList = useMemo(() => {
    const merged = [...(data?.albums || []), ...(data?.singlesAndEPs || [])];
    return merged.slice(0, 5);
  }, [data?.albums, data?.singlesAndEPs]);

  const displayedAlbums = useMemo(() => {
    const all = data?.albums || [];
    if (activeFilter === 'albums') return all.slice(0, releasesLimit);
    return showAllAlbums ? all : all.slice(0, 6);
  }, [data?.albums, showAllAlbums, activeFilter, releasesLimit]);

  const displayedSingles = useMemo(() => {
    const all = data?.singlesAndEPs || [];
    if (activeFilter === 'singles') return all.slice(0, releasesLimit);
    return showAllSingles ? all : all.slice(0, 6);
  }, [data?.singlesAndEPs, showAllSingles, activeFilter, releasesLimit]);

  const displayedPlaylists = useMemo(() => {
    const all = data?.playlists || [];
    if (activeFilter === 'playlists') return all.slice(0, releasesLimit);
    return showAllPlaylists ? all : all.slice(0, 6);
  }, [data?.playlists, showAllPlaylists, activeFilter, releasesLimit]);

  const renderTrackRow = (track: Track, index: number) => {
    const isCurrent = currentTrack?.videoId === track.videoId;
    const isLiked = likedTrackIds.includes(track.videoId);

    return (
      <TouchableOpacity
        key={`pop-${track.videoId || index}-${index}`}
        style={styles.trackRow}
        activeOpacity={0.7}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (isCurrent) {
            setPlayerModalVisible(true);
          } else {
            playTrack(track, data?.topTracks || [], index, 'artist');
            setPlayerModalVisible(true);
          }
        }}
      >
        {/* Track Rank / Equalizer indicator */}
        <View style={styles.rankWrapper}>
          {isCurrent && isPlaying ? (
            <Ionicons name="volume-high" size={16} color="#1DB954" />
          ) : (
            <Text style={[styles.trackRank, isCurrent && { color: '#1DB954' }]}>
              {index + 1}
            </Text>
          )}
        </View>

        <Image
          source={getUniversalStudioArtworkSource(
            track.thumbnail || data?.avatar,
            track.title,
            track.artist || resolvedName,
            track.videoId
          )}
          style={styles.trackCover}
          contentFit="cover"
          priority="high"
          cachePolicy="memory-disk"
          transition={150}
        />

        <View style={styles.trackDetails}>
          <Text
            style={[styles.trackTitleText, isCurrent && { color: '#1DB954' }]}
            numberOfLines={1}
          >
            {track.title}
          </Text>
          <Text style={styles.trackArtistText} numberOfLines={1}>
            {track.artist || resolvedName}
          </Text>
        </View>

        {/* 💖 Direct Love / Favorite Track Button */}
        <TouchableOpacity
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          onPress={(e) => {
            e.stopPropagation();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleLike(track);
          }}
          style={styles.trackHeartBtn}
        >
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={19}
            color={isLiked ? '#1DB954' : theme.textMuted}
          />
        </TouchableOpacity>

        {/* Play/Pause Button */}
        <TouchableOpacity
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          onPress={(e) => {
            e.stopPropagation();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (isCurrent) {
              togglePlay();
            } else {
              playTrack(track, data?.topTracks || [], index, 'artist');
            }
          }}
          style={styles.trackPlayBtn}
        >
          <Ionicons
            name={isCurrent && isPlaying ? 'pause' : 'play'}
            size={16}
            color={isCurrent ? '#1DB954' : theme.textMuted}
          />
        </TouchableOpacity>

        {/* Options Menu Button */}
        <TouchableOpacity
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          onPress={(e) => {
            e.stopPropagation();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={styles.trackMenuBtn}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const albumColumnWidth = (SCREEN_WIDTH - 48) / 3;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      {/* ── 1. Floating Sticky Top Bar ── */}
      <Animated.View
        style={[
          styles.stickyHeader,
          {
            paddingTop: insets.top,
            opacity: stickyHeaderOpacity,
          },
        ]}
      >
        <Text style={styles.stickyHeaderTitle} numberOfLines={1}>
          {data?.name || resolvedName}
        </Text>
      </Animated.View>

      {/* Back Button Always Clickable */}
      <TouchableOpacity
        style={[styles.floatingBackBtn, { top: insets.top + 6 }]}
        activeOpacity={0.8}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.goBack();
        }}
      >
        <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ── 2. Scrollable Body ── */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        contentContainerStyle={{ paddingBottom: miniPlayerBottomGap }}
      >
        {/* Hero Image Container */}
        <View style={styles.heroContainer}>
          {loading ? (
            <SkeletonItem style={styles.heroImage} />
          ) : (data?.banner || data?.avatar) ? (
            <Animated.View
              style={[
                styles.heroImage,
                {
                  transform: [{ translateY: heroImageTranslateY }],
                },
              ]}
            >
              <Image
                source={{ uri: data.banner || data.avatar }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                priority="high"
                cachePolicy="memory-disk"
                transition={300}
              />
            </Animated.View>
          ) : (
            <View style={[styles.heroImage, { backgroundColor: isDark ? '#1a2620' : '#e6ede8' }]} />
          )}

          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)', isDark ? '#121212' : theme.background]}
            style={styles.heroGradient}
          />

          <View style={styles.heroTextWrapper}>
            {/* Verified Artist Pill Badge */}
            <View style={styles.verifiedRow}>
              <Ionicons name="checkmark-circle" size={15} color="#1DB954" />
              <Text style={styles.verifiedText}>Verified Artist</Text>
              {data?.handle ? (
                <Text style={styles.verifiedHandle}>{data.handle}</Text>
              ) : null}
            </View>

            <Text
              style={styles.heroArtistName}
              numberOfLines={2}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.7}
            >
              {data?.name || resolvedName}
            </Text>

            <Text style={styles.heroSubText}>
              {data?.subCount || 'Official Artist Channel'}
            </Text>
          </View>
        </View>

        {/* ── 3. Action Bar ── */}
        <View style={styles.actionBar}>
          <View style={styles.actionLeft}>
            {/* Spotify-style Following Pill Button */}
            <TouchableOpacity
              style={[
                styles.followingPill,
                isFollowing ? styles.followingPillActive : styles.followingPillInactive,
              ]}
              activeOpacity={0.8}
              onPress={handleToggleFollow}
            >
              {isFollowing ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="checkmark" size={14} color="#1DB954" />
                  <Text style={styles.followingPillTextActive}>Following</Text>
                </View>
              ) : (
                <Text style={styles.followingPillTextInactive}>+ Follow</Text>
              )}
            </TouchableOpacity>

            {/* 3-Dots Action Button */}
            <TouchableOpacity
              style={styles.iconCircleBtn}
              activeOpacity={0.7}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={theme.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.actionRight}>
            {/* Shuffle Icon Button */}
            <TouchableOpacity
              style={styles.iconCircleBtn}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handlePlayArtistCatalog();
              }}
            >
              <Ionicons name="shuffle" size={24} color={theme.textPrimary} />
            </TouchableOpacity>

            {/* Big Green Circular Play Button */}
            <TouchableOpacity
              style={styles.bigGreenPlayBtn}
              activeOpacity={0.85}
              onPress={handlePlayArtistCatalog}
            >
              <Ionicons
                name={isPlaying && currentTrack?.artist?.toLowerCase().includes(resolvedName.toLowerCase()) ? 'pause' : 'play'}
                size={26}
                color="#000000"
                style={{ marginLeft: isPlaying ? 0 : 2 }}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 4. Spotify/YT Music Filter Tabs ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {[
            { key: 'all', label: 'All' },
            { key: 'popular', label: 'Popular Songs' },
            { key: 'albums', label: 'Albums' },
            { key: 'singles', label: 'Singles & EPs' },
            { key: 'playlists', label: 'Playlists' },
          ].map((f) => {
            const isSelected = activeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                activeOpacity={0.75}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveFilter(f.key as FilterTab);
                }}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── 5. "You liked" Section ── */}
        {activeFilter === 'all' && (
          <TouchableOpacity
            style={styles.youLikedCard}
            activeOpacity={0.85}
            onPress={handlePlayLikedSongs}
          >
            <View style={styles.youLikedAvatarWrapper}>
              {loading ? (
                <SkeletonItem style={styles.youLikedAvatar} />
              ) : (
                <Image
                  source={{ uri: getUniversalArtistAvatar(data?.avatar, data?.name) || data?.avatar }}
                  style={styles.youLikedAvatar}
                  contentFit="cover"
                  priority="high"
                  cachePolicy="memory-disk"
                  transition={200}
                />
              )}
              <View style={styles.youLikedHeartBadge}>
                <Ionicons name="heart" size={11} color="#1DB954" />
              </View>
            </View>

            <View style={styles.youLikedInfo}>
              <Text style={styles.youLikedTitle}>
                {userLikedTracks.length > 0
                  ? `You liked ${userLikedTracks.length} song${userLikedTracks.length > 1 ? 's' : ''}`
                  : 'Liked Songs'}
              </Text>
              <Text style={styles.youLikedSub}>
                {userLikedTracks.length > 0
                  ? `Tap to play your favorites by ${data?.name || resolvedName}`
                  : `Tap heart on any track to save to favorites`}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        )}

        {/* ── 6. "Popular" Top Tracks (10 initial -> +30 Show more pagination) ── */}
        {(activeFilter === 'all' || activeFilter === 'popular') && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderTitle}>
                {isAr ? 'الأكثر استماعاً' : 'Popular'}
              </Text>
              <Text style={styles.sectionSubtitle}>
                {isAr
                  ? `${displayedTracks.length} من الأغاني`
                  : `${displayedTracks.length} songs`}
              </Text>
            </View>

            {loading ? (
              <View style={{ paddingHorizontal: 16 }}>
                {[1, 2, 3, 4, 5].map((k) => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                    <SkeletonItem style={{ width: 18, height: 18, borderRadius: 4, marginRight: 12 }} />
                    <SkeletonItem style={{ width: 44, height: 44, borderRadius: 6, marginRight: 12 }} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <SkeletonItem style={{ width: '70%', height: 14, borderRadius: 4 }} />
                      <SkeletonItem style={{ width: '40%', height: 11, borderRadius: 4 }} />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              displayedTracks.map((t: Track, idx: number) => renderTrackRow(t, idx))
            )}

            {data && (
              <View style={styles.seeAllWrapper}>
                <TouchableOpacity
                  style={styles.seeAllPill}
                  activeOpacity={0.8}
                  disabled={loadingMoreTracks}
                  onPress={handleShowMoreTracks}
                >
                  {loadingMoreTracks ? (
                    <ActivityIndicator size="small" color={theme.textPrimary} />
                  ) : (
                    <Text style={styles.seeAllPillText}>
                      {isAr ? 'عرض المزيد (+30)' : 'Show more'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── 6B. "Popular Releases" (Spotify-style Latest Release + Albums + See Discography) ── */}
        {activeFilter === 'all' && !loading && popularReleasesList.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={[styles.sectionHeaderRow, { flexDirection: rowDirection }]}>
              <Text style={[styles.sectionHeaderTitle, { writingDirection }]}>
                {isAr ? 'أشهر الإصدارات' : 'Popular Releases'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setReleasesTab('albums');
                  setReleasesLimit(30);
                  setReleasesModalVisible(true);
                }}
              >
                <Text style={[styles.showAllLinkTxt, { color: isDark ? '#38BDF8' : '#007AFF' }]}>
                  {isAr ? 'عرض الكل' : 'Show all'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: 16, gap: 10 }}>
              {popularReleasesList.map((rel, idx) => (
                <TouchableOpacity
                  key={`pop-rel-${rel.id || idx}`}
                  activeOpacity={0.82}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    navigation.navigate('AlbumDetails', {
                      playlistId: rel.id,
                      albumTitle: rel.title,
                      artistName: data?.name || resolvedName,
                      cover: rel.cover,
                      type: rel.type || 'album',
                    });
                  }}
                >
                  <LiquidGlassSurface
                    glassStyle="regular"
                    isDark={isDark}
                    isInteractive
                    borderRadius={16}
                    style={[
                      styles.releaseRowGlass,
                      {
                        flexDirection: rowDirection,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.75)',
                        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)',
                      },
                    ]}
                  >
                    <Image
                      source={getUniversalStudioArtworkSource(
                        rel.cover || data?.avatar,
                        rel.title,
                        data?.name || resolvedName
                      )}
                      style={styles.releaseThumb}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                    <View style={{ flex: 1 }}>
                      {idx === 0 && (
                        <Text
                          style={[
                            styles.latestReleaseLabel,
                            { color: isDark ? '#38BDF8' : '#007AFF', textAlign, writingDirection },
                          ]}
                        >
                          {isAr ? 'أحدث إصدار' : 'Latest release'}
                        </Text>
                      )}
                      <Text
                        style={[
                          styles.releaseTitleTxt,
                          { color: theme.textPrimary, textAlign, writingDirection },
                        ]}
                        numberOfLines={1}
                      >
                        {rel.title}
                      </Text>
                      <Text
                        style={[
                          styles.releaseMetaTxt,
                          { color: theme.textSecondary, textAlign, writingDirection },
                        ]}
                        numberOfLines={1}
                      >
                        {rel.type === 'single' ? (isAr ? 'أغنية منفردة' : 'Single') : isAr ? 'ألبوم' : 'Album'} • {rel.year}
                      </Text>
                    </View>
                    <Ionicons
                      name={isAr ? 'chevron-back' : 'chevron-forward'}
                      size={18}
                      color={theme.textMuted}
                    />
                  </LiquidGlassSurface>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.seeAllWrapper}>
              <TouchableOpacity
                style={styles.seeAllPill}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setReleasesTab('albums');
                  setReleasesLimit(30);
                  setReleasesModalVisible(true);
                }}
              >
                <Text style={styles.seeAllPillText}>
                  {isAr ? 'عرض جميع الألبومات والإصدارات' : 'See discography'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── 7. "Albums" Section ── */}
        {(activeFilter === 'all' || activeFilter === 'albums') &&
          ((data?.albums && data.albums.length > 0) || loading) && (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderTitle}>Albums</Text>
                {activeFilter === 'albums' && (
                  <Text style={styles.sectionSubtitle}>Studio releases & projects</Text>
                )}
              </View>

              {loading ? (
                <View style={styles.albumsGrid}>
                  {[1, 2, 3, 4, 5, 6].map((k) => (
                    <View key={k} style={{ width: albumColumnWidth, marginBottom: 16 }}>
                      <SkeletonItem style={{ width: '100%', aspectRatio: 1, borderRadius: 8, marginBottom: 6 }} />
                      <SkeletonItem style={{ width: '80%', height: 12, borderRadius: 4, marginBottom: 4 }} />
                      <SkeletonItem style={{ width: '50%', height: 10, borderRadius: 4 }} />
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.albumsGrid}>
                  {displayedAlbums.map((album: ArtistAlbumItem, idx: number) => (
                    <TouchableOpacity
                      key={`album-${album.id || idx}`}
                      style={[styles.albumItem, { width: albumColumnWidth }]}
                      activeOpacity={0.85}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        navigation.navigate('AlbumDetails', {
                          playlistId: album.id,
                          albumTitle: album.title,
                          artistName: data?.name || resolvedName,
                          cover: album.cover,
                          type: 'album',
                        });
                      }}
                    >
                      <View style={styles.albumCoverWrapper}>
                        <Image
                          source={getUniversalStudioArtworkSource(
                            album.cover || data?.avatar,
                            album.title,
                            data?.name || resolvedName
                          )}
                          style={styles.albumCoverImg}
                          contentFit="cover"
                          priority="normal"
                          cachePolicy="memory-disk"
                          transition={150}
                        />
                        <View style={styles.albumPlayBadge}>
                          <Ionicons name="play" size={12} color="#FFFFFF" style={{ marginLeft: 1 }} />
                        </View>
                      </View>
                      <Text style={styles.albumTitle} numberOfLines={1}>
                        {album.title}
                      </Text>
                      <Text style={styles.albumYear} numberOfLines={1}>
                        Album • {album.year}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {activeFilter === 'all' && data && data.albums && data.albums.length > 6 && (
                <View style={styles.seeAllWrapper}>
                  <TouchableOpacity
                    style={styles.seeAllPill}
                    activeOpacity={0.8}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowAllAlbums((prev) => !prev);
                    }}
                  >
                    <Text style={styles.seeAllPillText}>
                      {showAllAlbums ? 'Show less' : 'See all albums'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

        {/* ── 8. "Singles & EPs" Section ── */}
        {(activeFilter === 'all' || activeFilter === 'singles') &&
          ((data?.singlesAndEPs && data.singlesAndEPs.length > 0) || loading) && (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderTitle}>Singles & EPs</Text>
                {activeFilter === 'singles' && (
                  <Text style={styles.sectionSubtitle}>Latest single releases</Text>
                )}
              </View>

              {loading ? (
                <View style={styles.albumsGrid}>
                  {[1, 2, 3].map((k) => (
                    <View key={k} style={{ width: albumColumnWidth, marginBottom: 16 }}>
                      <SkeletonItem style={{ width: '100%', aspectRatio: 1, borderRadius: 8, marginBottom: 6 }} />
                      <SkeletonItem style={{ width: '80%', height: 12, borderRadius: 4, marginBottom: 4 }} />
                      <SkeletonItem style={{ width: '50%', height: 10, borderRadius: 4 }} />
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.albumsGrid}>
                  {displayedSingles.map((single: ArtistAlbumItem, idx: number) => (
                    <TouchableOpacity
                      key={`single-${single.id || idx}`}
                      style={[styles.albumItem, { width: albumColumnWidth }]}
                      activeOpacity={0.85}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        navigation.navigate('AlbumDetails', {
                          playlistId: single.id,
                          albumTitle: single.title,
                          artistName: data?.name || resolvedName,
                          cover: single.cover,
                          type: 'single',
                        });
                      }}
                    >
                      <View style={styles.albumCoverWrapper}>
                        <Image
                          source={getUniversalStudioArtworkSource(
                            single.cover || data?.avatar,
                            single.title,
                            data?.name || resolvedName
                          )}
                          style={styles.albumCoverImg}
                          contentFit="cover"
                          priority="normal"
                          cachePolicy="memory-disk"
                          transition={150}
                        />
                        <View style={styles.singleBadge}>
                          <Text style={styles.singleBadgeText}>Single</Text>
                        </View>
                      </View>
                      <Text style={styles.albumTitle} numberOfLines={1}>
                        {single.title}
                      </Text>
                      <Text style={styles.albumYear} numberOfLines={1}>
                        Single • {single.year}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {activeFilter === 'all' && data && data.singlesAndEPs && data.singlesAndEPs.length > 6 && (
                <View style={styles.seeAllWrapper}>
                  <TouchableOpacity
                    style={styles.seeAllPill}
                    activeOpacity={0.8}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowAllSingles((prev) => !prev);
                    }}
                  >
                    <Text style={styles.seeAllPillText}>
                      {showAllSingles ? 'Show less' : 'See all singles'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

        {/* ── 9. "Playlists" Section ── */}
        {(activeFilter === 'all' || activeFilter === 'playlists') &&
          ((data?.playlists && data.playlists.length > 0) || loading) && (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderTitle}>Official Playlists</Text>
                {activeFilter === 'playlists' && (
                  <Text style={styles.sectionSubtitle}>Curated compilations & video lists</Text>
                )}
              </View>

              {loading ? (
                <View style={styles.albumsGrid}>
                  {[1, 2, 3].map((k) => (
                    <View key={k} style={{ width: albumColumnWidth, marginBottom: 16 }}>
                      <SkeletonItem style={{ width: '100%', aspectRatio: 1, borderRadius: 8, marginBottom: 6 }} />
                      <SkeletonItem style={{ width: '80%', height: 12, borderRadius: 4, marginBottom: 4 }} />
                      <SkeletonItem style={{ width: '50%', height: 10, borderRadius: 4 }} />
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.albumsGrid}>
                  {displayedPlaylists.map((playlist: ArtistAlbumItem, idx: number) => (
                    <TouchableOpacity
                      key={`playlist-${playlist.id || idx}`}
                      style={[styles.albumItem, { width: albumColumnWidth }]}
                      activeOpacity={0.85}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        navigation.navigate('AlbumDetails', {
                          playlistId: playlist.id,
                          albumTitle: playlist.title,
                          artistName: data?.name || resolvedName,
                          cover: playlist.cover,
                          type: 'playlist',
                        });
                      }}
                    >
                      <View style={styles.albumCoverWrapper}>
                        <Image
                          source={getUniversalStudioArtworkSource(
                            playlist.cover || data?.avatar,
                            playlist.title,
                            data?.name || resolvedName
                          )}
                          style={styles.albumCoverImg}
                          contentFit="cover"
                          priority="normal"
                          cachePolicy="memory-disk"
                          transition={150}
                        />
                        <View style={styles.playlistBadge}>
                          <Ionicons name="list" size={10} color="#FFFFFF" style={{ marginRight: 2 }} />
                          <Text style={styles.playlistBadgeText}>Playlist</Text>
                        </View>
                      </View>
                      <Text style={styles.albumTitle} numberOfLines={1}>
                        {playlist.title}
                      </Text>
                      <Text style={styles.albumYear} numberOfLines={1}>
                        Playlist • {playlist.trackCount || 15} songs
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {activeFilter === 'all' && data && data.playlists && data.playlists.length > 6 && (
                <View style={styles.seeAllWrapper}>
                  <TouchableOpacity
                    style={styles.seeAllPill}
                    activeOpacity={0.8}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowAllPlaylists((prev) => !prev);
                    }}
                  >
                    <Text style={styles.seeAllPillText}>
                      {showAllPlaylists ? 'Show less' : 'See all playlists'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

        {/* ── 9. "Fans Also Like" / Related Artists ── */}
        {activeFilter === 'all' && ((data?.relatedArtists && data.relatedArtists.length > 0) || loading) && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeaderTitle}>Fans also like</Text>
            {loading ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedScroll}>
                {[1, 2, 3, 4].map((k) => (
                  <View key={k} style={{ alignItems: 'center', width: 90, marginRight: 14 }}>
                    <SkeletonItem style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 8 }} />
                    <SkeletonItem style={{ width: 60, height: 12, borderRadius: 4 }} />
                  </View>
                ))}
              </ScrollView>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.relatedScroll}
              >
                {data?.relatedArtists?.map((rel) => (
                  <TouchableOpacity
                    key={`rel-${rel.id}`}
                    style={styles.relatedCard}
                    activeOpacity={0.8}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      navigation.push('ArtistDetail', { artistName: rel.name });
                    }}
                  >
                    <Image
                      source={{ uri: rel.avatar || getUniversalArtistAvatar(rel.avatar, rel.name) }}
                      style={styles.relatedAvatar}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={150}
                    />
                    <Text style={styles.relatedName} numberOfLines={1}>
                      {rel.name}
                    </Text>
                    <Text style={styles.relatedTag}>Artist</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* ── 10. Official Channel & Bio Card ── */}
        <View style={styles.channelCard}>
          <View style={styles.channelHeader}>
            <Image
              source={{ uri: data?.avatar || getUniversalArtistAvatar(data?.avatar, data?.name) }}
              style={styles.channelAvatar}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            <View style={styles.channelInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.channelName} numberOfLines={1}>
                  {data?.name || resolvedName}
                </Text>
                <Ionicons name="checkmark-circle" size={15} color="#1DB954" />
              </View>
              <Text style={styles.channelSubText}>{data?.subCount || 'Official Artist Channel'}</Text>
              {data?.handle ? (
                <Text style={styles.channelHandle}>{data.handle}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.channelFooter}>
            <View style={styles.channelProtocolBadge}>
              <Ionicons name="musical-notes" size={13} color="#1DB954" />
              <Text style={styles.channelProtocolText}>Official Music Catalog</Text>
            </View>
          </View>
        </View>
      </Animated.ScrollView>

      {/* ── Fullscreen Spotify-Style "Releases" Discography Modal (30-per-page) ── */}
      <Modal
        visible={releasesModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReleasesModalVisible(false)}
      >
        <View
          style={[
            styles.releasesModalContainer,
            {
              backgroundColor: isDark ? '#070A12' : '#F2F5FA',
              paddingTop: Math.max(insets.top, 18),
            },
          ]}
        >
          {/* Header */}
          <View style={styles.releasesModalHeader}>
            <TouchableOpacity
              onPress={() => setReleasesModalVisible(false)}
              activeOpacity={0.75}
            >
              <LiquidGlassSurface
                glassStyle="regular"
                isDark={isDark}
                isInteractive
                borderRadius={20}
                style={styles.releasesBackBtn}
              >
                <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
              </LiquidGlassSurface>
            </TouchableOpacity>
            <Text style={[styles.releasesModalTitle, { color: theme.textPrimary }]}>
              {isAr ? 'الإصدارات والألبومات' : 'Releases'}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Category Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ maxHeight: 48, flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
          >
            {(
              [
                { key: 'albums', label: isAr ? 'الألبومات' : 'Albums' },
                { key: 'singles', label: isAr ? 'أغاني منفردة' : 'Singles and EPs' },
                { key: 'playlists', label: isAr ? 'قوائم وتجميعات' : 'Playlists' },
              ] as const
            ).map((tab) => {
              const active = releasesTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setReleasesTab(tab.key);
                  }}
                >
                  <LiquidGlassSurface
                    glassStyle="regular"
                    isDark={isDark}
                    isInteractive
                    tintColor={active ? 'rgba(0, 122, 255, 0.35)' : undefined}
                    borderRadius={18}
                    style={[
                      styles.releaseFilterChip,
                      {
                        backgroundColor: active ? '#007AFF' : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                        borderColor: active ? '#38BDF8' : isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? '#FFFFFF' : theme.textPrimary,
                        fontSize: 13,
                        fontWeight: '700',
                      }}
                    >
                      {tab.label}
                    </Text>
                  </LiquidGlassSurface>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Releases List (30 per batch + Show more) */}
          <FlatList
            data={(releasesTab === 'albums'
              ? data?.albums || []
              : releasesTab === 'singles'
              ? data?.singlesAndEPs || []
              : data?.playlists || []
            ).slice(0, releasesLimit)}
            keyExtractor={(item, idx) => `rel-mod-${item.id || idx}-${idx}`}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 30 }}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => {
                  setReleasesModalVisible(false);
                  navigation.navigate('AlbumDetails', {
                    playlistId: item.id,
                    albumTitle: item.title,
                    artistName: data?.name || resolvedName,
                    cover: item.cover,
                    type: item.type || (releasesTab === 'singles' ? 'single' : 'album'),
                  });
                }}
              >
                <LiquidGlassSurface
                  glassStyle="regular"
                  isDark={isDark}
                  isInteractive
                  borderRadius={18}
                  style={[
                    styles.releaseRowGlass,
                    {
                      flexDirection: rowDirection,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.8)',
                      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)',
                    },
                  ]}
                >
                  <Image
                    source={getUniversalStudioArtworkSource(
                      item.cover || data?.avatar,
                      item.title,
                      data?.name || resolvedName
                    )}
                    style={styles.releaseThumbLarge}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <View style={{ flex: 1 }}>
                    {index === 0 && (
                      <Text
                        style={[
                          styles.latestReleaseLabel,
                          { color: isDark ? '#38BDF8' : '#007AFF', textAlign, writingDirection },
                        ]}
                      >
                        {isAr ? 'أحدث إصدار' : 'Latest release'}
                      </Text>
                    )}
                    <Text
                      style={[
                        styles.releaseTitleTxt,
                        { color: theme.textPrimary, textAlign, writingDirection },
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text
                      style={[
                        styles.releaseMetaTxt,
                        { color: theme.textSecondary, textAlign, writingDirection },
                      ]}
                    >
                      {releasesTab === 'singles'
                        ? isAr
                          ? 'أغنية منفردة'
                          : 'Single'
                        : releasesTab === 'playlists'
                        ? isAr
                          ? 'قائمة تشغيل'
                          : 'Playlist'
                        : isAr
                        ? 'ألبوم'
                        : 'Album'}{' '}
                      • {item.year}
                    </Text>
                  </View>
                  <Ionicons
                    name={isAr ? 'chevron-back' : 'chevron-forward'}
                    size={18}
                    color={theme.textMuted}
                  />
                </LiquidGlassSurface>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </View>
  );
};

const createThemedStyles = (theme: ThemeTokens, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#121212' : theme.background,
    },
    stickyHeader: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 90,
      backgroundColor: isDark ? 'rgba(18, 18, 18, 0.95)' : theme.surface,
      zIndex: 50,
      justifyContent: 'center',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : theme.border,
    },
    stickyHeaderTitle: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    floatingBackBtn: {
      position: 'absolute',
      left: 16,
      zIndex: 60,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroContainer: {
      width: SCREEN_WIDTH,
      height: SCREEN_WIDTH * 0.98,
      position: 'relative',
      overflow: 'hidden',
    },
    heroImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    heroGradient: {
      ...StyleSheet.absoluteFill,
    },
    heroTextWrapper: {
      position: 'absolute',
      bottom: 16,
      left: 16,
      right: 16,
    },
    verifiedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 14,
      alignSelf: 'flex-start',
    },
    verifiedText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    verifiedHandle: {
      color: 'rgba(255, 255, 255, 0.7)',
      fontSize: 11,
      fontWeight: '500',
      marginLeft: 2,
    },
    heroArtistName: {
      color: '#FFFFFF',
      fontSize: 34,
      fontWeight: '900',
      letterSpacing: -0.8,
      lineHeight: 40,
      textShadowColor: 'rgba(0, 0, 0, 0.8)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 8,
    },
    heroSubText: {
      color: 'rgba(255, 255, 255, 0.85)',
      fontSize: 13,
      fontWeight: '600',
      marginTop: 4,
    },
    actionBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 14,
    },
    actionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    actionRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    followingPill: {
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1.5,
    },
    followingPillActive: {
      borderColor: '#1DB954',
      backgroundColor: 'rgba(29, 185, 84, 0.12)',
    },
    followingPillInactive: {
      borderColor: isDark ? 'rgba(255,255,255,0.3)' : theme.border,
      backgroundColor: isDark ? '#FFFFFF' : '#111b15',
    },
    followingPillTextActive: {
      color: '#1DB954',
      fontWeight: '700',
      fontSize: 13,
    },
    followingPillTextInactive: {
      color: isDark ? '#000000' : '#FFFFFF',
      fontWeight: '700',
      fontSize: 13,
    },
    iconCircleBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : theme.surfaceSubtle,
    },
    bigGreenPlayBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: '#1DB954',
      justifyContent: 'center',
      alignItems: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#1DB954',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
        },
        android: {
          elevation: 6,
        },
      }),
    },
    filterScroll: {
      paddingHorizontal: 16,
      paddingBottom: 14,
      gap: 8,
    },
    filterChip: {
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.surfaceSubtle,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : theme.border,
    },
    filterChipActive: {
      backgroundColor: '#1DB954',
      borderColor: '#1DB954',
    },
    filterChipText: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    filterChipTextActive: {
      color: '#000000',
      fontWeight: '800',
    },
    youLikedCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginBottom: 20,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : theme.surfaceSubtle,
    },
    youLikedAvatarWrapper: {
      position: 'relative',
      marginRight: 12,
    },
    youLikedAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#262626',
    },
    youLikedHeartBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: '#000000',
      justifyContent: 'center',
      alignItems: 'center',
    },
    youLikedInfo: {
      flex: 1,
    },
    youLikedTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    youLikedSub: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    sectionContainer: {
      marginBottom: 24,
    },
    sectionHeaderRow: {
      paddingHorizontal: 16,
      marginBottom: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionHeaderTitle: {
      color: theme.textPrimary,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    sectionSubtitle: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    trackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    rankWrapper: {
      width: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    trackRank: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    trackCover: {
      width: 46,
      height: 46,
      borderRadius: 6,
      marginRight: 12,
      backgroundColor: '#262626',
    },
    trackDetails: {
      flex: 1,
      marginRight: 8,
    },
    trackTitleText: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 3,
    },
    trackArtistText: {
      color: theme.textMuted,
      fontSize: 12,
    },
    trackHeartBtn: {
      padding: 6,
      marginRight: 2,
    },
    trackPlayBtn: {
      padding: 6,
      marginRight: 2,
    },
    trackMenuBtn: {
      padding: 6,
    },
    seeAllWrapper: {
      alignItems: 'center',
      marginTop: 12,
    },
    seeAllPill: {
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : theme.border,
    },
    seeAllPillText: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
    },
    albumsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 16,
      gap: 8,
    },
    albumItem: {
      marginBottom: 14,
    },
    albumCoverWrapper: {
      position: 'relative',
      width: '100%',
      aspectRatio: 1,
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 6,
      backgroundColor: '#262626',
    },
    albumCoverImg: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    albumPlayBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    singleBadge: {
      position: 'absolute',
      bottom: 6,
      left: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
    },
    singleBadgeText: {
      color: '#FFFFFF',
      fontSize: 9,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    playlistBadge: {
      position: 'absolute',
      bottom: 6,
      left: 6,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
    },
    playlistBadgeText: {
      color: '#FFFFFF',
      fontSize: 9,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    albumTitle: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 2,
    },
    albumYear: {
      color: theme.textMuted,
      fontSize: 11,
    },
    relatedScroll: {
      paddingHorizontal: 16,
      gap: 14,
    },
    relatedCard: {
      alignItems: 'center',
      width: 90,
    },
    relatedAvatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      marginBottom: 8,
      backgroundColor: '#262626',
    },
    relatedName: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 2,
    },
    relatedTag: {
      color: theme.textMuted,
      fontSize: 11,
      textAlign: 'center',
    },
    channelCard: {
      marginHorizontal: 16,
      marginTop: 8,
      marginBottom: 28,
      padding: 16,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : theme.surface,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.border,
    },
    channelHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    channelAvatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: '#262626',
    },
    channelInfo: {
      flex: 1,
    },
    channelName: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '800',
    },
    channelSubText: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    channelHandle: {
      color: '#1DB954',
      fontSize: 11,
      fontWeight: '600',
      marginTop: 2,
    },
    channelFooter: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : theme.border,
    },
    channelProtocolBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    channelProtocolText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    showAllLinkTxt: {
      fontSize: 13.5,
      fontWeight: '700',
    },
    releaseRowGlass: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 10,
      alignItems: 'center',
      gap: 12,
      overflow: 'hidden',
    },
    releaseThumb: {
      width: 56,
      height: 56,
      borderRadius: 10,
    },
    releaseThumbLarge: {
      width: 68,
      height: 68,
      borderRadius: 12,
    },
    latestReleaseLabel: {
      fontSize: 11,
      fontWeight: '800',
      marginBottom: 2,
    },
    releaseTitleTxt: {
      fontSize: 15,
      fontWeight: '700',
    },
    releaseMetaTxt: {
      fontSize: 12.5,
      fontWeight: '500',
      marginTop: 2,
    },
    releasesModalContainer: {
      flex: 1,
    },
    releasesModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    releasesBackBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    releasesModalTitle: {
      fontSize: 18,
      fontWeight: '800',
    },
    releaseFilterChip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 18,
      borderWidth: 1,
      overflow: 'hidden',
    },
  });

export default ArtistDetailsScreen;
