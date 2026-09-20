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
import { fetchArtistFullProfile, ArtistFullProfile } from '../services/youtubeMusicService';
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

export const ArtistDetailsScreen = ({ route, navigation }: any) => {
  const { artistName, artist } = route.params || {};
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const playTrack = useAudioStore((s) => s.playTrack);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const playAlbumContext = useAudioStore((s) => s.playAlbumContext);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);
  const followedArtistIds = useAudioStore((s) => s.followedArtistIds);
  const toggleFollowArtist = useAudioStore((s) => s.toggleFollowArtist);

  const [data, setData] = useState<ArtistFullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllTracks, setShowAllTracks] = useState(false);
  const [showAllAlbums, setShowAllAlbums] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;
  const resolvedName = artistName || artist?.name || artist?.title || 'Khaled';

  const isFollowing = useMemo(() => {
    const targetName = data?.name || resolvedName;
    return followedArtistIds.includes(targetName);
  }, [followedArtistIds, data?.name, resolvedName]);

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

  const handleToggleFollow = () => {
    const targetName = data?.name || resolvedName;
    toggleFollowArtist({
      id: targetName,
      name: targetName,
      avatar: data?.avatar || '',
    });
  };

  const displayedTracks = useMemo(() => {
    const all = data?.topTracks || [];
    return showAllTracks ? all : all.slice(0, 5);
  }, [data?.topTracks, showAllTracks]);

  const displayedAlbums = useMemo(() => {
    const all = data?.albums || [];
    return showAllAlbums ? all : all.slice(0, 6);
  }, [data?.albums, showAllAlbums]);

  const renderTrackRow = (track: Track, index: number) => {
    const isCurrent = currentTrack?.videoId === track.videoId;

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
        <Text style={[styles.trackRank, isCurrent && { color: '#1DB954' }]}>
          {index + 1}
        </Text>

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
                source={{ uri: getUniversalStudioArtwork(data.banner || data.avatar) }}
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
            colors={['transparent', 'rgba(0,0,0,0.4)', isDark ? '#121212' : theme.background]}
            style={styles.heroGradient}
          />

          <View style={styles.heroTextWrapper}>
            <Text
              style={styles.heroArtistName}
              numberOfLines={2}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.7}
            >
              {data?.name || resolvedName}
            </Text>
          </View>
        </View>

        {/* ── 3. Action Bar ── */}
        <View style={styles.actionBar}>
          <View style={styles.actionLeft}>
            {/* Following Pill Button */}
            <TouchableOpacity
              style={[
                styles.followingPill,
                isFollowing ? styles.followingPillActive : styles.followingPillInactive,
              ]}
              activeOpacity={0.8}
              onPress={handleToggleFollow}
            >
              {isFollowing ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
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

        {/* ── 4. "You liked" Section ── */}
        <TouchableOpacity
          style={styles.youLikedCard}
          activeOpacity={0.85}
          onPress={handlePlayArtistCatalog}
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
            <Text style={styles.youLikedTitle}>You liked</Text>
            <Text style={styles.youLikedSub}>
              Popular Tracks • {data?.name || resolvedName}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>

        {/* ── 5. "Popular" Top Tracks ── */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeaderTitle}>Popular</Text>

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

          {data && data.topTracks && data.topTracks.length > 5 && (
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
                  {showAllTracks ? 'Show less' : 'See all'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── 6. "Albums" 3x3 Grid ── */}
        {((data?.albums && data.albums.length > 0) || loading) && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeaderTitle}>Albums</Text>

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
                {displayedAlbums.map((album: any, idx: number) => (
                  <TouchableOpacity
                    key={`album-${album.id || idx}`}
                    style={[styles.albumItem, { width: albumColumnWidth }]}
                    activeOpacity={0.85}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      navigation.navigate('AlbumDetails', {
                        albumTitle: album.title,
                        artistName: data?.name || resolvedName,
                        cover: album.cover,
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
                      {data?.name || resolvedName}, {album.year}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {data && data.albums && data.albums.length > 6 && (
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
                    {showAllAlbums ? 'Show less' : 'See all'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── 7. "Fans Also Like" / Related Artists ── */}
        {((data?.relatedArtists && data.relatedArtists.length > 0) || loading) && (
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
                      source={{ uri: getUniversalArtistAvatar(rel.avatar, rel.name) || rel.avatar }}
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
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroContainer: {
      width: SCREEN_WIDTH,
      height: SCREEN_WIDTH * 0.95,
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
    heroArtistName: {
      color: '#FFFFFF',
      fontSize: 34,
      fontWeight: '900',
      letterSpacing: -0.8,
      lineHeight: 40,
      textShadowColor: 'rgba(0, 0, 0, 0.7)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 8,
    },
    actionBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 16,
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
      backgroundColor: 'transparent',
    },
    followingPillInactive: {
      borderColor: isDark ? 'rgba(255,255,255,0.4)' : theme.border,
      backgroundColor: isDark ? '#FFFFFF' : '#111b15',
    },
    followingPillText: {
      fontSize: 13,
      fontWeight: '700',
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
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
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
      fontSize: 15,
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
    sectionHeaderTitle: {
      color: theme.textPrimary,
      fontSize: 20,
      fontWeight: '800',
      paddingHorizontal: 16,
      marginBottom: 12,
      letterSpacing: -0.3,
    },
    trackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    trackRank: {
      width: 22,
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
      marginRight: 10,
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
      marginRight: 12,
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
    trackPlayBtn: {
      padding: 6,
      marginRight: 4,
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
  });

export default ArtistDetailsScreen;
