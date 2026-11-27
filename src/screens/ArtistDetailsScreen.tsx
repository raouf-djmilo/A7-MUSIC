import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Animated,
  ScrollView,
  Modal,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
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
  getUniversalStudioArtworkSource,
  getUniversalArtistAvatar,
} from '../utils/artworkHelper';
import { LiquidGlassSurface } from '../components/LiquidGlassSurface';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = 430;

// ── Skeleton Shimmer Placeholder ──
const SkeletonItem: React.FC<{ style: any }> = ({ style }) => {
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.7, duration: 750, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return <Animated.View style={[style, { opacity: anim, backgroundColor: 'rgba(255, 255, 255, 0.14)' }]} />;
};

export const ArtistDetailsScreen = ({ route, navigation }: any) => {
  const { artistName, artist, artistId } = route.params || {};
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const language = useLanguageStore((s) => s.language);
  const isAr = language === 'ar';
  const rowDirection = isAr ? 'row-reverse' : 'row';
  const textAlign = isAr ? 'right' : 'left';
  const writingDirection = isAr ? 'rtl' : 'ltr';
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  // Audio store
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
  const [refreshing, setRefreshing] = useState(false);

  // Sub-views (Image 4: Top Songs full list, Image 5: Albums 2-col grid, Info sheet)
  const [topSongsModalVisible, setTopSongsModalVisible] = useState(false);
  const [albumsModalVisible, setAlbumsModalVisible] = useState(false);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [loadingMoreTracks, setLoadingMoreTracks] = useState(false);
  const moreTracksPageRef = useRef(0);

  const scrollY = useRef(new Animated.Value(0)).current;
  const resolvedName = artistName || artist?.name || artist?.title || 'Artist';
  const preferredChannelId: string | undefined = artist?.channelId || artistId || undefined;

  const isFollowing = useMemo(() => {
    const targetName = data?.name || resolvedName;
    return followedArtistIds.includes(targetName);
  }, [followedArtistIds, data?.name, resolvedName]);

  const loadArtistProfile = useCallback(
    async (isPullRefresh = false) => {
      moreTracksPageRef.current = 0;
      if (isPullRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const profile = await fetchArtistFullProfile(resolvedName, preferredChannelId);
        setData(profile);
      } catch (err) {
        console.warn('[ArtistDetailsScreen] Fetch error:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [resolvedName, preferredChannelId]
  );

  useEffect(() => {
    loadArtistProfile(false);
  }, [loadArtistProfile]);

  const styles = useMemo(() => createThemedStyles(theme, isDark), [theme, isDark]);

  // Sticky top header opacity on scroll up
  const stickyHeaderOpacity = scrollY.interpolate({
    inputRange: [HERO_HEIGHT - 170, HERO_HEIGHT - 95],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Smooth Apple-style elastic stretch on pull-down (scrollY < 0) + parallax slide on scroll up
  const heroLayerTranslateY = scrollY.interpolate({
    inputRange: [-240, 0, HERO_HEIGHT],
    outputRange: [120, 0, -HERO_HEIGHT * 0.55],
    extrapolate: 'clamp',
  });

  const heroLayerScale = scrollY.interpolate({
    inputRange: [-240, 0, 120],
    outputRange: [1 + 240 / HERO_HEIGHT, 1, 1],
    extrapolate: 'clamp',
  });

  const heroLayerOpacity = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT * 0.55, HERO_HEIGHT * 0.92],
    outputRange: [1, 0.72, 0.08],
    extrapolate: 'clamp',
  });

  const heroPortraitUri = useMemo(() => {
    // Once official profile loads, prefer data?.avatar (matched to YouTube Music official portrait);
    // while loading, display Search artist?.avatar instantaneously for 0ms visual handoff.
    const raw = data?.avatar || artist?.avatar || data?.banner || '';
    const resolved = getUniversalArtistAvatar(raw, data?.name || resolvedName) || raw;
    const hasPortraitCrop = /=w\d+-h\d+[^?&]*-p\b/.test(resolved);
    if (resolved.includes('=s')) {
      return resolved.replace(/=s\d+[^?&]*/, '=s1200-c-k-c0x00ffffff-no-rj');
    }
    if (resolved.includes('=w')) {
      return resolved.replace(
        /=w\d+-h\d+[^?&]*/,
        hasPortraitCrop ? '=w1200-h1200-p-l90-rj' : '=w1200-h1200-l90-rj'
      );
    }
    return resolved;
  }, [data?.avatar, data?.banner, data?.name, artist?.avatar, resolvedName]);

  const isArtistCatalogPlaying = useMemo(() => {
    if (!isPlaying || !currentTrack) return false;
    const nameLower = (data?.name || resolvedName).toLowerCase();
    return Boolean(currentTrack.artist?.toLowerCase().includes(nameLower));
  }, [isPlaying, currentTrack, data?.name, resolvedName]);

  const handlePlayArtistCatalog = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isArtistCatalogPlaying) {
      togglePlay();
      return;
    }
    const tracksToPlay: Track[] = data?.topTracks || [];
    if (tracksToPlay.length > 0) {
      playAlbumContext(tracksToPlay, 0, `${data?.name || resolvedName}`);
      setPlayerModalVisible(true);
    }
  }, [
    isArtistCatalogPlaying,
    togglePlay,
    data?.topTracks,
    data?.name,
    resolvedName,
    playAlbumContext,
    setPlayerModalVisible,
  ]);

  const handleToggleFollow = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const targetName = data?.name || resolvedName;
    toggleFollowArtist({
      id: targetName,
      name: targetName,
      avatar: heroPortraitUri || '',
    });
  }, [data?.name, resolvedName, toggleFollowArtist, heroPortraitUri]);

  const handleShareArtist = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const name = data?.name || resolvedName;
      await Share.share({
        message: isAr ? `استمع إلى ${name} على A7 Music` : `Listen to ${name} on A7 Music`,
      });
    } catch {}
  }, [data?.name, resolvedName, isAr]);

  const handleShowMoreTracks = useCallback(async () => {
    if (loadingMoreTracks || !data?.name) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoadingMoreTracks(true);
    try {
      const existing = data.topTracks || [];
      const more = await fetchArtistMoreTracks(
        data.name,
        moreTracksPageRef.current,
        existing.map((t) => t.videoId),
        data.channelId
      );
      moreTracksPageRef.current += 1;
      if (more.length > 0) {
        setData((prev) =>
          prev ? { ...prev, topTracks: [...prev.topTracks, ...more] } : prev
        );
      }
    } catch {
      // Non-fatal pagination error
    } finally {
      setLoadingMoreTracks(false);
    }
  }, [loadingMoreTracks, data?.name, data?.topTracks, data?.channelId]);

  const openAlbumDetails = useCallback(
    (item: ArtistAlbumItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      navigation.navigate('AlbumDetails', {
        playlistId: item.id,
        albumTitle: item.title,
        artistName: data?.name || resolvedName,
        cover: item.cover,
        type: item.type || 'album',
      });
    },
    [navigation, data?.name, resolvedName]
  );

  // Derived sections
  const previewTopSongs = useMemo(() => (data?.topTracks || []).slice(0, 5), [data?.topTracks]);
  const essentialAlbums = useMemo(
    () => (data?.essentialAlbums || data?.albums || []).slice(0, 3),
    [data?.essentialAlbums, data?.albums]
  );
  const allAlbums = useMemo(() => data?.albums || [], [data?.albums]);
  const isOfficialArtist = data?.isOfficialArtist ?? artist?.isOfficialArtist ?? true;
  const channelBadgeLabel = useMemo(() => {
    if (artist?.accountKind === 'music_studio') {
      return isAr ? 'ستوديو / إنتاج موسيقي' : 'Music Studio';
    }
    if (artist?.accountKind === 'verified_channel') {
      return isAr ? 'قناة موثّقة' : 'Verified Channel';
    }
    return isAr ? 'قناة يوتيوب' : 'YouTube Channel';
  }, [artist?.accountKind, isAr]);

  const renderTopSongRow = useCallback(
    (track: Track, index: number, showDivider: boolean = true) => {
      const isCurrent = currentTrack?.videoId === track.videoId;
      const isLiked = likedTrackIds.includes(track.videoId);
      const subParts: string[] = [];
      if (track.album) subParts.push(track.album);
      else subParts.push(track.artist || data?.name || resolvedName);
      if (track.year) subParts.push(track.year);

      return (
        <View key={`top-song-${track.videoId || index}-${index}`}>
          <TouchableOpacity
            style={[styles.songRow, { flexDirection: rowDirection }]}
            activeOpacity={0.72}
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
            <Image
              source={getUniversalStudioArtworkSource(
                track.thumbnail || heroPortraitUri,
                track.title,
                track.artist || resolvedName,
                track.videoId
              )}
              style={styles.songCover}
              contentFit="cover"
              priority="high"
              cachePolicy="memory-disk"
              transition={140}
            />

            <View style={styles.songInfo}>
              <Text
                style={[
                  styles.songTitle,
                  { textAlign, writingDirection },
                  isCurrent && { color: '#FA2D48' },
                ]}
                numberOfLines={1}
              >
                {track.title}
              </Text>
              <Text
                style={[styles.songSubtitle, { textAlign, writingDirection }]}
                numberOfLines={1}
              >
                {subParts.join(' · ')}
              </Text>
            </View>

            <TouchableOpacity
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggleLike(track);
              }}
              style={styles.songMoreBtn}
            >
              <Ionicons
                name={isLiked ? 'heart' : 'ellipsis-horizontal'}
                size={18}
                color={isLiked ? '#FA2D48' : theme.textSecondary}
              />
            </TouchableOpacity>
          </TouchableOpacity>
          {showDivider && <View style={styles.songDivider} />}
        </View>
      );
    },
    [
      currentTrack?.videoId,
      likedTrackIds,
      data?.name,
      data?.topTracks,
      resolvedName,
      heroPortraitUri,
      rowDirection,
      textAlign,
      writingDirection,
      theme.textSecondary,
      setPlayerModalVisible,
      playTrack,
      toggleLike,
      styles,
    ]
  );

  const albumGridWidth = (SCREEN_WIDTH - 46) / 2;
  const solidBgColor = isDark ? '#0B0D13' : '#F2F4F8';

  return (
    <View style={[styles.container, { backgroundColor: solidBgColor }]}>
      <StatusBar barStyle="light-content" />

      {/* ── Ambient Atmospheric Liquid Backdrop (Seamless Behind Entire Screen) ── */}
      {heroPortraitUri ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Image
            source={{ uri: heroPortraitUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <BlurView
            intensity={isDark ? 95 : 85}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={
              isDark
                ? ['rgba(18, 22, 30, 0.38)', 'rgba(11, 13, 19, 0.88)', solidBgColor]
                : ['rgba(110, 118, 128, 0.42)', 'rgba(242, 244, 248, 0.90)', solidBgColor]
            }
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}

      {/* ── Pinned Elastic Stretchy Hero Portrait Layer (Never Shows Top or Bottom Crop Cuts!) ── */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pinnedHeroWrapper,
          {
            opacity: heroLayerOpacity,
            transform: [{ translateY: heroLayerTranslateY }, { scale: heroLayerScale }],
          },
        ]}
      >
        {loading && !heroPortraitUri ? (
          <SkeletonItem style={StyleSheet.absoluteFill} />
        ) : heroPortraitUri ? (
          <Image
            source={{ uri: heroPortraitUri }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            priority="high"
            cachePolicy="memory-disk"
            transition={220}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1E2430' }]} />
        )}

        {/* Multi-stop Silky Bottom Feather Blending 100% Seamlessly Into Ambient Liquid Glass */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.20)',
            'rgba(0,0,0,0.02)',
            'transparent',
            isDark ? 'rgba(11, 13, 19, 0.14)' : 'rgba(242, 244, 248, 0.14)',
            isDark ? 'rgba(11, 13, 19, 0.42)' : 'rgba(242, 244, 248, 0.42)',
            isDark ? 'rgba(11, 13, 19, 0.78)' : 'rgba(242, 244, 248, 0.78)',
            isDark ? 'rgba(11, 13, 19, 0.96)' : 'rgba(242, 244, 248, 0.96)',
            solidBgColor,
          ]}
          locations={[0, 0.14, 0.40, 0.56, 0.72, 0.85, 0.94, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* ── Sticky Frosted Header on Scroll Up ── */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.stickyHeader,
          {
            paddingTop: insets.top,
            height: insets.top + 52,
            opacity: stickyHeaderOpacity,
          },
        ]}
      >
        <BlurView intensity={78} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <Text style={styles.stickyHeaderTitle} numberOfLines={1}>
          {data?.name || resolvedName}
        </Text>
      </Animated.View>

      {/* ── Floating Top Liquid Glass Controls (< | Share & ...) ── */}
      <View style={[styles.floatingTopBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
        >
          <LiquidGlassSurface
            glassStyle="regular"
            isDark={true}
            isInteractive
            borderRadius={20}
            style={styles.glassCircleNav}
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </LiquidGlassSurface>
        </TouchableOpacity>

        <LiquidGlassSurface
          glassStyle="regular"
          isDark={true}
          isInteractive
          borderRadius={22}
          style={styles.glassRightPill}
        >
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={handleShareArtist}
            style={styles.glassPillIconBtn}
          >
            <Ionicons name="share-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setInfoModalVisible(true);
            }}
            style={styles.glassPillIconBtn}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </LiquidGlassSurface>
      </View>

      {/* ── Scrollable Foreground Content with Pull-to-Refresh ── */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadArtistProfile(true)}
            tintColor="#FFFFFF"
            progressViewOffset={insets.top + 48}
          />
        }
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        contentContainerStyle={{ paddingBottom: miniPlayerBottomGap + 28 }}
      >
        {/* Transparent Spacer letting Pinned Portrait shine cleanly */}
        <View style={{ height: HERO_HEIGHT - 135 }} pointerEvents="none" />

        {/* Soft Feather Behind Name & Action Controls into Solid Body Backdrop */}
        <LinearGradient
          colors={[
            'transparent',
            isDark ? 'rgba(11, 13, 19, 0.58)' : 'rgba(242, 244, 248, 0.58)',
            solidBgColor,
          ]}
          locations={[0, 0.52, 1]}
          style={styles.heroOverlayContent}
        >
          <View style={styles.artistNameRow}>
            <Text
              style={styles.heroArtistName}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {data?.name || resolvedName}
            </Text>
            {isOfficialArtist && (
              <Ionicons name="musical-note" size={18} color="#FFFFFF" style={{ marginLeft: 6, opacity: 0.92 }} />
            )}
          </View>

          {!loading && !isOfficialArtist && (
            <View style={styles.normalChannelBadge}>
              <Text style={styles.normalChannelBadgeText}>
                {channelBadgeLabel}
              </Text>
            </View>
          )}

          {/* ( i )   ( ▶ )   ( ☆ ) */}
          <View style={styles.heroActionsRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setInfoModalVisible(true);
              }}
            >
              <LiquidGlassSurface
                glassStyle="regular"
                isDark={true}
                isInteractive
                borderRadius={24}
                style={styles.heroSecondaryCircle}
              >
                <Ionicons name="information" size={22} color="#FFFFFF" />
              </LiquidGlassSurface>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={handlePlayArtistCatalog}
              style={styles.heroPlayCircle}
            >
              <Ionicons
                name={isArtistCatalogPlaying ? 'pause' : 'play'}
                size={28}
                color="#111111"
                style={{ marginLeft: isArtistCatalogPlaying ? 0 : 3 }}
              />
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.8} onPress={handleToggleFollow}>
              <LiquidGlassSurface
                glassStyle="regular"
                isDark={true}
                isInteractive
                borderRadius={24}
                tintColor={isFollowing ? 'rgba(250, 45, 72, 0.45)' : undefined}
                style={styles.heroSecondaryCircle}
              >
                <Ionicons
                  name={isFollowing ? 'star' : 'star-outline'}
                  size={21}
                  color={isFollowing ? '#FFD60A' : '#FFFFFF'}
                />
              </LiquidGlassSurface>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Continuous Body Surface (Zero Seam Below Hero) */}
        <View style={[styles.bodySurface, { backgroundColor: solidBgColor }]}>
          {/* Top Songs > Section (Image 1 & 2) */}
          <View style={styles.sectionBlock}>
            <TouchableOpacity
              style={[styles.sectionHeaderBtn, { flexDirection: rowDirection }]}
              activeOpacity={0.75}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setTopSongsModalVisible(true);
              }}
            >
              <Text style={[styles.sectionTitle, { writingDirection }]}>
                {isAr ? 'أشهر الأغاني' : 'Top Songs'}
              </Text>
              <Ionicons
                name={isAr ? 'chevron-back' : 'chevron-forward'}
                size={20}
                color={theme.textSecondary}
                style={{ marginTop: 2 }}
              />
            </TouchableOpacity>

            {loading ? (
              <View style={{ paddingHorizontal: 18, gap: 12 }}>
                {[1, 2, 3, 4, 5].map((k) => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <SkeletonItem style={{ width: 50, height: 50, borderRadius: 8 }} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <SkeletonItem style={{ width: '68%', height: 15, borderRadius: 4 }} />
                      <SkeletonItem style={{ width: '42%', height: 12, borderRadius: 4 }} />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View>
                {previewTopSongs.map((t, idx) =>
                  renderTopSongRow(t, idx, idx < previewTopSongs.length - 1)
                )}
              </View>
            )}
          </View>

          {/* Essential Albums Carousel (1 to 3 Most-Viewed Flagship Albums — Image 2) */}
          {(loading || essentialAlbums.length > 0) && (
            <View style={styles.sectionBlock}>
              <View style={[styles.sectionHeaderBtn, { flexDirection: rowDirection }]}>
                <Text style={[styles.sectionTitle, { writingDirection }]}>
                  {isAr ? 'الألبومات الأساسية' : 'Essential Albums'}
                </Text>
              </View>

              {loading ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                >
                  {[1, 2].map((k) => (
                    <View key={k} style={{ width: 174 }}>
                      <SkeletonItem style={{ width: 174, height: 174, borderRadius: 14, marginBottom: 8 }} />
                      <SkeletonItem style={{ width: '75%', height: 14, borderRadius: 4, marginBottom: 4 }} />
                      <SkeletonItem style={{ width: '40%', height: 12, borderRadius: 4 }} />
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                >
                  {essentialAlbums.map((alb, idx) => (
                    <TouchableOpacity
                      key={`ess-${alb.id || idx}`}
                      style={styles.essentialCard}
                      activeOpacity={0.85}
                      onPress={() => openAlbumDetails(alb)}
                    >
                      <Image
                        source={getUniversalStudioArtworkSource(
                          alb.cover || heroPortraitUri,
                          alb.title,
                          data?.name || resolvedName
                        )}
                        style={styles.essentialCover}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={150}
                      />
                      <Text style={[styles.carouselTitle, { textAlign, writingDirection }]} numberOfLines={1}>
                        {alb.title}
                      </Text>
                      <Text style={[styles.carouselYear, { textAlign, writingDirection }]} numberOfLines={1}>
                        {alb.year}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {/* Albums > Carousel (Image 2 & 3 -> Opens Image 5 Grid) */}
          {(loading || allAlbums.length > 0) && (
            <View style={styles.sectionBlock}>
              <TouchableOpacity
                style={[styles.sectionHeaderBtn, { flexDirection: rowDirection }]}
                activeOpacity={0.75}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAlbumsModalVisible(true);
                }}
              >
                <Text style={[styles.sectionTitle, { writingDirection }]}>
                  {isAr ? 'الألبومات' : 'Albums'}
                </Text>
                <Ionicons
                  name={isAr ? 'chevron-back' : 'chevron-forward'}
                  size={20}
                  color={theme.textSecondary}
                  style={{ marginTop: 2 }}
                />
              </TouchableOpacity>

              {loading ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                >
                  {[1, 2, 3].map((k) => (
                    <View key={k} style={{ width: 158 }}>
                      <SkeletonItem style={{ width: 158, height: 158, borderRadius: 14, marginBottom: 8 }} />
                      <SkeletonItem style={{ width: '75%', height: 14, borderRadius: 4, marginBottom: 4 }} />
                      <SkeletonItem style={{ width: '40%', height: 12, borderRadius: 4 }} />
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}
                >
                  {allAlbums.map((alb, idx) => (
                    <TouchableOpacity
                      key={`alb-${alb.id || idx}`}
                      style={styles.albumCarouselCard}
                      activeOpacity={0.85}
                      onPress={() => openAlbumDetails(alb)}
                    >
                      <Image
                        source={getUniversalStudioArtworkSource(
                          alb.cover || heroPortraitUri,
                          alb.title,
                          data?.name || resolvedName
                        )}
                        style={styles.albumCarouselCover}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={150}
                      />
                      <Text style={[styles.carouselTitle, { textAlign, writingDirection }]} numberOfLines={1}>
                        {alb.title}
                      </Text>
                      <Text style={[styles.carouselYear, { textAlign, writingDirection }]} numberOfLines={1}>
                        {alb.year}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* ── MODAL 1 (Image 4): Full Top Songs List with Show More Pagination ── */}
      <Modal
        visible={topSongsModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTopSongsModalVisible(false)}
      >
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: solidBgColor,
              paddingTop: Math.max(insets.top, 16),
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity activeOpacity={0.75} onPress={() => setTopSongsModalVisible(false)}>
              <LiquidGlassSurface
                glassStyle="regular"
                isDark={isDark}
                isInteractive
                borderRadius={20}
                style={styles.modalBackCircle}
              >
                <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
              </LiquidGlassSurface>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
              {isAr ? 'أشهر الأغاني' : 'Top Songs'}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <FlatList
            data={data?.topTracks || []}
            keyExtractor={(item, idx) => `modal-song-${item.videoId || idx}-${idx}`}
            renderItem={({ item, index }) =>
              renderTopSongRow(item, index, index < (data?.topTracks?.length || 0) - 1)
            }
            contentContainerStyle={{ paddingBottom: insets.bottom + 36, paddingTop: 6 }}
            ListFooterComponent={
              <View style={styles.showMoreWrapper}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={loadingMoreTracks}
                  onPress={handleShowMoreTracks}
                >
                  <LiquidGlassSurface
                    glassStyle="regular"
                    isDark={isDark}
                    isInteractive
                    borderRadius={22}
                    style={styles.showMorePill}
                  >
                    {loadingMoreTracks ? (
                      <ActivityIndicator size="small" color={theme.textPrimary} />
                    ) : (
                      <Text style={[styles.showMoreText, { color: theme.textPrimary }]}>
                        {isAr ? 'عرض المزيد' : 'Show more'}
                      </Text>
                    )}
                  </LiquidGlassSurface>
                </TouchableOpacity>
              </View>
            }
          />
        </View>
      </Modal>

      {/* ── MODAL 2 (Image 5): Full Albums 2-Column Grid ── */}
      <Modal
        visible={albumsModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAlbumsModalVisible(false)}
      >
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: solidBgColor,
              paddingTop: Math.max(insets.top, 16),
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity activeOpacity={0.75} onPress={() => setAlbumsModalVisible(false)}>
              <LiquidGlassSurface
                glassStyle="regular"
                isDark={isDark}
                isInteractive
                borderRadius={20}
                style={styles.modalBackCircle}
              >
                <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
              </LiquidGlassSurface>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
              {isAr ? 'الألبومات' : 'Albums'}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <FlatList
            data={allAlbums}
            numColumns={2}
            keyExtractor={(item, idx) => `modal-alb-${item.id || idx}-${idx}`}
            columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 16 }}
            contentContainerStyle={{ paddingBottom: insets.bottom + 36, paddingTop: 8, gap: 18 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={{ width: albumGridWidth }}
                activeOpacity={0.85}
                onPress={() => {
                  setAlbumsModalVisible(false);
                  openAlbumDetails(item);
                }}
              >
                <Image
                  source={getUniversalStudioArtworkSource(
                    item.cover || heroPortraitUri,
                    item.title,
                    data?.name || resolvedName
                  )}
                  style={{ width: albumGridWidth, height: albumGridWidth, borderRadius: 14, marginBottom: 8 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <Text style={[styles.carouselTitle, { textAlign, writingDirection }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.carouselYear, { textAlign, writingDirection }]} numberOfLines={1}>
                  {item.year}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* ── MODAL 3: Official Artist Channel Info Sheet ── */}
      <Modal
        visible={infoModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setInfoModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.infoBackdrop}
          activeOpacity={1}
          onPress={() => setInfoModalVisible(false)}
        >
          <LiquidGlassSurface
            glassStyle="regular"
            isDark={isDark}
            isInteractive={false}
            borderRadius={24}
            style={[
              styles.infoCard,
              {
                backgroundColor: isDark ? 'rgba(22, 26, 36, 0.92)' : 'rgba(255, 255, 255, 0.94)',
                borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.1)',
              },
            ]}
          >
            <View style={{ flexDirection: rowDirection, alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <Image
                source={{ uri: heroPortraitUri }}
                style={{ width: 62, height: 62, borderRadius: 31 }}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: rowDirection, alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.infoName, { color: theme.textPrimary }]} numberOfLines={1}>
                    {data?.name || resolvedName}
                  </Text>
                  {isOfficialArtist && (
                    <Ionicons name="checkmark-circle" size={17} color="#0A84FF" />
                  )}
                </View>
                <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>
                  {isOfficialArtist
                    ? isAr
                      ? 'فنان رسمي معتمد على YouTube Music'
                      : 'Official Music Artist Channel'
                    : isAr
                      ? 'قناة يوتيوب'
                      : 'YouTube Channel'}
                </Text>
              </View>
            </View>

            <View style={styles.infoStatsRow}>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                {data?.subCount || 'Official Artist'}
              </Text>
              {data?.handle ? (
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{data.handle}</Text>
              ) : null}
            </View>

            <View style={styles.infoStatsRow}>
              <Text style={{ color: theme.textPrimary, fontSize: 13, fontWeight: '600' }}>
                {isAr
                  ? `${data?.topTracks?.length || 0} أغنية • ${allAlbums.length} ألبوم`
                  : `${data?.topTracks?.length || 0} Songs · ${allAlbums.length} Albums`}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.infoCloseBtn}
              activeOpacity={0.8}
              onPress={() => setInfoModalVisible(false)}
            >
              <Text style={styles.infoCloseBtnText}>{isAr ? 'إغلاق' : 'Done'}</Text>
            </TouchableOpacity>
          </LiquidGlassSurface>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const createThemedStyles = (theme: ThemeTokens, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    pinnedHeroWrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: HERO_HEIGHT,
      zIndex: 0,
    },
    stickyHeader: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 40,
      justifyContent: 'center',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
      overflow: 'hidden',
    },
    stickyHeaderTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.textPrimary,
      maxWidth: SCREEN_WIDTH - 180,
    },
    floatingTopBar: {
      position: 'absolute',
      left: 16,
      right: 16,
      zIndex: 50,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    glassCircleNav: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(120, 120, 128, 0.34)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      overflow: 'hidden',
    },
    glassRightPill: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 40,
      paddingHorizontal: 6,
      borderRadius: 20,
      backgroundColor: 'rgba(120, 120, 128, 0.34)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      overflow: 'hidden',
      gap: 4,
    },
    glassPillIconBtn: {
      width: 34,
      height: 34,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroOverlayContent: {
      alignItems: 'center',
      paddingTop: 18,
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    artistNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    heroArtistName: {
      fontSize: 33,
      fontWeight: '800',
      color: '#FFFFFF',
      textAlign: 'center',
      letterSpacing: -0.5,
      textShadowColor: 'rgba(0,0,0,0.4)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 10,
    },
    normalChannelBadge: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.16)',
      marginBottom: 10,
    },
    normalChannelBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    heroActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
    },
    heroSecondaryCircle: {
      width: 46,
      height: 46,
      borderRadius: 23,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.26)',
      overflow: 'hidden',
    },
    heroPlayCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: '#FFFFFF',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 12,
      elevation: 6,
    },
    bodySurface: {
      paddingTop: 6,
    },
    sectionBlock: {
      marginBottom: 24,
    },
    sectionHeaderBtn: {
      paddingHorizontal: 18,
      marginBottom: 12,
      alignItems: 'center',
      gap: 4,
    },
    sectionTitle: {
      fontSize: 21,
      fontWeight: '800',
      color: theme.textPrimary,
      letterSpacing: -0.3,
    },
    songRow: {
      paddingHorizontal: 18,
      paddingVertical: 8,
      alignItems: 'center',
      gap: 12,
    },
    songCover: {
      width: 50,
      height: 50,
      borderRadius: 8,
    },
    songInfo: {
      flex: 1,
    },
    songTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.textPrimary,
      marginBottom: 2,
    },
    songSubtitle: {
      fontSize: 13,
      fontWeight: '400',
      color: theme.textSecondary,
    },
    songMoreBtn: {
      padding: 6,
    },
    songDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
      marginLeft: 80,
      marginRight: 18,
    },
    carouselContent: {
      paddingHorizontal: 18,
      gap: 14,
    },
    essentialCard: {
      width: 174,
    },
    essentialCover: {
      width: 174,
      height: 174,
      borderRadius: 14,
      marginBottom: 8,
    },
    albumCarouselCard: {
      width: 158,
    },
    albumCarouselCover: {
      width: 158,
      height: 158,
      borderRadius: 14,
      marginBottom: 8,
    },
    carouselTitle: {
      fontSize: 14.5,
      fontWeight: '600',
      color: theme.textPrimary,
      marginBottom: 2,
    },
    carouselYear: {
      fontSize: 13,
      fontWeight: '400',
      color: theme.textSecondary,
    },
    modalContainer: {
      flex: 1,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    },
    modalBackCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)',
      overflow: 'hidden',
    },
    modalTitle: {
      fontSize: 17.5,
      fontWeight: '700',
    },
    showMoreWrapper: {
      alignItems: 'center',
      marginTop: 18,
      marginBottom: 10,
    },
    showMorePill: {
      paddingHorizontal: 26,
      paddingVertical: 11,
      borderRadius: 22,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)',
      overflow: 'hidden',
    },
    showMoreText: {
      fontSize: 14,
      fontWeight: '700',
    },
    infoBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    infoCard: {
      padding: 20,
      borderRadius: 24,
      borderWidth: 1,
      overflow: 'hidden',
    },
    infoName: {
      fontSize: 18,
      fontWeight: '800',
    },
    infoStatsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    },
    infoCloseBtn: {
      marginTop: 14,
      backgroundColor: '#007AFF',
      paddingVertical: 11,
      borderRadius: 14,
      alignItems: 'center',
    },
    infoCloseBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
  });

export default ArtistDetailsScreen;
