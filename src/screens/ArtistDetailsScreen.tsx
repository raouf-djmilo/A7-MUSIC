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
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { fetchArtistFullProfile, ArtistFullProfile, ArtistAlbumItem } from '../services/youtubeMusicService';
import { useAudioStore, Track } from '../store/useAudioStore';
import { useTheme } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import { getUniversalStudioArtwork, getUniversalArtistAvatar } from '../utils/artworkHelper';

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
  const [showAllTracks, setShowAllTracks] = useState(false);
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

  const displayedTracks = useMemo(() => {
    const all = data?.topTracks || [];
    if (activeFilter === 'popular') return all;
    return showAllTracks ? all : all.slice(0, 5);
  }, [data?.topTracks, showAllTracks, activeFilter]);

  const displayedAlbums = useMemo(() => {
    const all = data?.albums || [];
    if (activeFilter === 'albums') return all;
    return showAllAlbums ? all : all.slice(0, 6);
  }, [data?.albums, showAllAlbums, activeFilter]);

  const displayedSingles = useMemo(() => {
    const all = data?.singlesAndEPs || [];
    if (activeFilter === 'singles') return all;
    return showAllSingles ? all : all.slice(0, 6);
  }, [data?.singlesAndEPs, showAllSingles, activeFilter]);

  const displayedPlaylists = useMemo(() => {
    const all = data?.playlists || [];
    if (activeFilter === 'playlists') return all;
    return showAllPlaylists ? all : all.slice(0, 6);
  }, [data?.playlists, showAllPlaylists, activeFilter]);

  const renderTrackRow = (track: Track, index: number) => {
    const isCurrent = currentTrack?.videoId === track.videoId;
    const isLiked = likedTrackIds.includes(track.videoId);

    return (
      <TouchableOpacity
        key={`pop-${track.videoId || index}`}
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
          source={{ uri: getUniversalStudioArtwork(track.thumbnail || data?.avatar) }}
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

        {/* ── 6. "Popular" Top Tracks ── */}
        {(activeFilter === 'all' || activeFilter === 'popular') && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderTitle}>Popular</Text>
              {activeFilter === 'popular' && (
                <Text style={styles.sectionSubtitle}>Top releases & trending</Text>
              )}
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

            {activeFilter === 'all' && data && data.topTracks && data.topTracks.length > 5 && (
              <View style={styles.seeAllWrapper}>
                <TouchableOpacity
                  style={styles.seeAllPill}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowAllTracks((prev) => !prev);
                  }}
                >
                  <Text style={styles.seeAllPillText}>
                    {showAllTracks ? 'Show less' : 'See all songs'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
                          source={{ uri: getUniversalStudioArtwork(album.cover) }}
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
                          source={{ uri: getUniversalStudioArtwork(single.cover) }}
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
                          source={{ uri: getUniversalStudioArtwork(playlist.cover) }}
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
              <Text style={styles.channelProtocolText}>Official YouTube Music & Spotify Catalog</Text>
            </View>
          </View>
        </View>
      </Animated.ScrollView>
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
  });

export default ArtistDetailsScreen;
