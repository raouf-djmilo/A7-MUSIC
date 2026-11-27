import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Animated,
  Share,
  Modal,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import { useAudioStore, Track } from '../store/useAudioStore';
import { useLanguageStore } from '../store/useLanguageStore';
import { fetchPlaylistOrAlbumDetails, PlaylistAlbumDetails } from '../services/youtubeMusicService';
import { getTrackAtmosphericTint } from '../services/atmosphericColorEngine';
import {
  getUniversalStudioArtworkSource,
  getUniversalStudioArtwork,
  STUDIO_IMAGE_PROPS,
} from '../utils/artworkHelper';
import { LiquidGlassSurface } from '../components/LiquidGlassSurface';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import { useDockScrollTracker } from '../utils/scrollDockTracker';
import { downloadService, useDownloadStore } from '../services/downloadService';
import { useNetworkStore } from '../services/networkService';
import { ToastManager } from '../components/InAppToast';
import { CircularDownloadProgress } from '../components/CircularDownloadProgress';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_COVER_SIZE = Math.min(256, Math.round(SCREEN_WIDTH * 0.64));

type CollectionKind = 'album' | 'single' | 'ep' | 'playlist' | 'mix';

function resolveCollectionType(
  rawType?: string,
  title?: string
): CollectionKind {
  const normalizedType = (rawType || '').toLowerCase().trim();
  const normalizedTitle = (title || '').toLowerCase().trim();

  if (normalizedType === 'mix' || /\b(mix|ميكس|radio)\b/i.test(normalizedTitle)) {
    return 'mix';
  }
  if (normalizedType === 'ep' || /\bep\b/i.test(normalizedTitle)) {
    return 'ep';
  }
  if (normalizedType === 'single' || /-\s*single\b/i.test(normalizedTitle)) {
    return 'single';
  }
  if (normalizedType === 'playlist') {
    return 'playlist';
  }
  return 'album';
}

function isRemoteFetchableListId(listId?: string): boolean {
  if (!listId) return false;
  const clean = listId.trim();
  if (!clean) return false;
  const syntheticPrefixes = ['alb-', 'artist-', 'sng-', 'djk-', 'kh-', 'mix-', 'dna-mix-', 'radio-', 'local-'];
  if (syntheticPrefixes.some((p) => clean.startsWith(p))) return false;
  return (
    clean.startsWith('MPREb_') ||
    clean.startsWith('OLAK5uy_') ||
    clean.startsWith('VL') ||
    clean.startsWith('PL') ||
    clean.startsWith('RD')
  );
}

function buildCanonicalCollectionId(
  rawId: string | undefined,
  type: CollectionKind,
  title: string,
  artist: string
): string {
  const cleanId = (rawId || '').trim();
  if (cleanId) return cleanId;
  const norm = `${title}::${artist}`
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return `local-${type}-${norm || 'collection'}`;
}

export const AlbumDetailsScreen = ({ route, navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const miniPlayerBottomGap = useMiniPlayerBottomGap();
  const { onScroll: onDockScroll } = useDockScrollTracker();
  const language = useLanguageStore((s) => s.language);
  const isAr = language === 'ar';

  const rowDirection = isAr ? 'row-reverse' : 'row';
  const textAlign = isAr ? 'right' : 'left';
  const writingDirection = isAr ? 'rtl' : 'ltr';

  const {
    listId,
    playlistId,
    albumId,
    id,
    album,
    albumTitle,
    artistName,
    cover,
    type: paramType,
    tracks: paramTracks,
  } = route.params || {};

  const rawListId: string | undefined = listId || playlistId || albumId || id || album?.id;
  const initialTitle: string = albumTitle || album?.title || (isAr ? 'ألبوم' : 'Album');
  const initialArtist: string = artistName || album?.artist || (isAr ? 'فنان' : 'Artist');
  const initialTracks: Track[] = useMemo(() => {
    if (Array.isArray(album?.tracks) && album.tracks.length > 0) return album.tracks;
    if (Array.isArray(paramTracks) && paramTracks.length > 0) return paramTracks;
    return [];
  }, [album?.tracks, paramTracks]);
  const initialCover: string =
    cover || album?.thumbnail || initialTracks[0]?.thumbnail || '';
  const initialCollectionType = resolveCollectionType(paramType || album?.type, initialTitle);

  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const likedTrackIds = useAudioStore((s) => s.likedTrackIds);
  const savedCollections = useAudioStore((s) => s.savedCollections);
  const playAlbumContext = useAudioStore((s) => s.playAlbumContext);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const toggleLike = useAudioStore((s) => s.toggleLike);
  const toggleSaveCollection = useAudioStore((s) => s.toggleSaveCollection);
  const downloadedTracks = useDownloadStore((s) => s.downloadedTracks);
  const activeDownloads = useDownloadStore((s) => s.activeDownloads);

  const [details, setDetails] = useState<PlaylistAlbumDetails | null>(
    initialTracks.length > 0
      ? {
          id: rawListId || '',
          title: initialTitle,
          artist: initialArtist,
          cover: initialCover,
          year: album?.year,
          trackCount: initialTracks.length,
          totalDurationMs: initialTracks.reduce((acc, t) => acc + (t.duration || 0), 0),
          type:
            initialCollectionType === 'mix' || initialCollectionType === 'playlist'
              ? 'playlist'
              : initialCollectionType === 'single' || initialCollectionType === 'ep'
              ? 'single'
              : 'album',
          tracks: initialTracks,
        }
      : null
  );
  const [loading, setLoading] = useState(initialTracks.length === 0);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [selectedTrackMenu, setSelectedTrackMenu] = useState<Track | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const shouldFetchRemote =
      isRemoteFetchableListId(rawListId) && initialTracks.length === 0;

    if (!shouldFetchRemote) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetchPlaylistOrAlbumDetails(
          rawListId || '',
          initialTitle,
          initialArtist,
          initialCover,
          initialCollectionType === 'mix' || initialCollectionType === 'playlist'
            ? 'playlist'
            : initialCollectionType === 'single' || initialCollectionType === 'ep'
            ? 'single'
            : 'album'
        );
        if (mounted) {
          setDetails(res);
        }
      } catch (err) {
        console.warn('[AlbumDetailsScreen] Error fetching details:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [rawListId, initialTitle, initialArtist, initialCover, initialCollectionType, initialTracks.length]);

  const tracks = useMemo(() => {
    const rawList =
      details?.tracks && details.tracks.length > 0 ? details.tracks : initialTracks;
    const seen = new Set<string>();
    return rawList.filter((tr) => {
      if (!tr?.videoId || seen.has(tr.videoId)) return false;
      seen.add(tr.videoId);
      return true;
    });
  }, [details?.tracks, initialTracks]);

  const displayTitle = details?.title || initialTitle;
  const displayArtist = details?.artist || initialArtist;
  const collectionType = resolveCollectionType(
    paramType || album?.type || details?.type,
    displayTitle
  );
  const displayYear = details?.year || album?.year || '';
  const displayCoverRaw = details?.cover || initialCover || tracks[0]?.thumbnail || '';
  const heroArtSource = useMemo(
    () =>
      getUniversalStudioArtworkSource(
        displayCoverRaw,
        displayTitle,
        displayArtist,
        tracks[0]?.videoId
      ),
    [displayCoverRaw, displayTitle, displayArtist, tracks]
  );
  const studioCoverUri = useMemo(
    () =>
      getUniversalStudioArtwork(
        displayCoverRaw,
        displayTitle,
        displayArtist,
        tracks[0]?.videoId
      ),
    [displayCoverRaw, displayTitle, displayArtist, tracks]
  );

  const canonicalId = useMemo(
    () => buildCanonicalCollectionId(rawListId || details?.id, collectionType, displayTitle, displayArtist),
    [rawListId, details?.id, collectionType, displayTitle, displayArtist]
  );

  const isSavedInLibrary = useMemo(() => {
    const normTitle = displayTitle.toLowerCase().trim();
    const normArtist = displayArtist.toLowerCase().trim();
    return savedCollections.some(
      (sc) =>
        sc.id === canonicalId ||
        (sc.type === collectionType &&
          sc.title.toLowerCase().trim() === normTitle &&
          sc.artist.toLowerCase().trim() === normArtist)
    );
  }, [savedCollections, canonicalId, collectionType, displayTitle, displayArtist]);

  // Adaptive color backdrop derived from album identity + full-bleed cover blur with strict WCAG contrast scrims
  const atmosphericTint = useMemo(
    () =>
      getTrackAtmosphericTint(
        {
          videoId: canonicalId,
          title: displayTitle,
          artist: displayArtist,
          thumbnail: studioCoverUri,
          duration: 0,
        },
        isDark
      ),
    [canonicalId, displayTitle, displayArtist, studioCoverUri, isDark]
  );

  const uiColors = useMemo(
    () =>
      isDark
        ? {
            baseBg: '#0B0D12',
            scrimTop: 'rgba(10, 12, 16, 0.44)',
            scrimMid: 'rgba(10, 11, 15, 0.56)',
            scrimBottom: 'rgba(8, 10, 14, 0.74)',
            primaryText: '#FFFFFF',
            secondaryText: 'rgba(255, 255, 255, 0.78)',
            mutedText: 'rgba(255, 255, 255, 0.62)',
            divider: 'rgba(255, 255, 255, 0.14)',
            coverBorder: 'rgba(255, 255, 255, 0.16)',
            glassBtnBg: 'rgba(255, 255, 255, 0.14)',
            glassBtnBorder: 'rgba(255, 255, 255, 0.22)',
            playPillBg: '#FFFFFF',
            playPillText: '#111827',
            stickyBarBg: 'rgba(16, 18, 24, 0.52)',
            sheetBg: 'rgba(22, 25, 34, 0.94)',
            activeRowBg: 'rgba(255, 255, 255, 0.10)',
            savedAccentBg: 'rgba(255, 255, 255, 0.24)',
          }
        : {
            baseBg: '#F4F6FB',
            scrimTop: 'rgba(248, 250, 252, 0.62)',
            scrimMid: 'rgba(244, 246, 250, 0.68)',
            scrimBottom: 'rgba(241, 245, 249, 0.80)',
            primaryText: '#0F172A',
            secondaryText: 'rgba(15, 23, 42, 0.74)',
            mutedText: 'rgba(15, 23, 42, 0.58)',
            divider: 'rgba(15, 23, 42, 0.12)',
            coverBorder: 'rgba(15, 23, 42, 0.12)',
            glassBtnBg: 'rgba(15, 23, 42, 0.08)',
            glassBtnBorder: 'rgba(15, 23, 42, 0.14)',
            playPillBg: '#0F172A',
            playPillText: '#FFFFFF',
            stickyBarBg: 'rgba(248, 250, 252, 0.65)',
            sheetBg: 'rgba(255, 255, 255, 0.96)',
            activeRowBg: 'rgba(15, 23, 42, 0.06)',
            savedAccentBg: 'rgba(15, 23, 42, 0.14)',
          },
    [isDark]
  );

  const typeLabel = useMemo(() => {
    switch (collectionType) {
      case 'single':
        return isAr ? 'أغنية منفردة' : 'Single';
      case 'ep':
        return 'EP';
      case 'playlist':
        return isAr ? 'قائمة تشغيل' : 'Playlist';
      case 'mix':
        return isAr ? 'ميكس موسيقي' : 'Mix';
      default:
        return isAr ? 'ألبوم' : 'Album';
    }
  }, [collectionType, isAr]);

  const totalMinutes = useMemo(() => {
    const ms =
      details?.totalDurationMs && details.totalDurationMs > 0
        ? details.totalDurationMs
        : tracks.reduce((sum, t) => sum + (t.duration || 210000), 0);
    return Math.max(1, Math.round(ms / 60000));
  }, [details?.totalDurationMs, tracks]);

  const isCollectionCurrentlyActive = useMemo(
    () =>
      Boolean(
        currentTrack?.videoId &&
          tracks.some((tr) => tr.videoId === currentTrack.videoId)
      ),
    [currentTrack?.videoId, tracks]
  );

  const canOpenArtistProfile = useMemo(() => {
    const clean = (displayArtist || '').trim();
    if (!clean) return false;
    if (/^\d+\s+(songs?|tracks?|أغنية|أغاني)$/i.test(clean)) return false;
    if (/^(various artists|artist|playlist|mixed for you|مختاراتك)$/i.test(clean)) return false;
    return collectionType === 'album' || collectionType === 'single' || collectionType === 'ep';
  }, [displayArtist, collectionType]);

  const triggerToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setSaveToast(msg);
    toastTimerRef.current = setTimeout(() => setSaveToast(null), 2200);
  }, []);

  const handlePlayAll = useCallback(() => {
    if (tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isCollectionCurrentlyActive) {
      togglePlay();
      return;
    }
    playAlbumContext(tracks, 0, displayTitle);
  }, [tracks, isCollectionCurrentlyActive, togglePlay, playAlbumContext, displayTitle]);

  const handleShufflePlay = useCallback(async () => {
    if (tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    await playAlbumContext(shuffled, 0, displayTitle);
    useAudioStore.setState({ isShuffle: true });
  }, [tracks, playAlbumContext, displayTitle]);

  const handleToggleLibrarySave = useCallback(async () => {
    const savedNow = await toggleSaveCollection({
      id: canonicalId,
      title: displayTitle,
      artist: displayArtist,
      cover: studioCoverUri || displayCoverRaw,
      year: displayYear || undefined,
      type: collectionType,
      tracks,
    });
    Haptics.notificationAsync(
      savedNow ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
    );
    triggerToast(
      savedNow
        ? isAr
          ? 'تمت الإضافة إلى مكتبتك'
          : 'Added to Your Library'
        : isAr
        ? 'تمت الإزالة من مكتبتك'
        : 'Removed from Your Library'
    );
  }, [
    toggleSaveCollection,
    canonicalId,
    displayTitle,
    displayArtist,
    studioCoverUri,
    displayCoverRaw,
    displayYear,
    collectionType,
    tracks,
    triggerToast,
    isAr,
  ]);

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const urlPart = tracks[0]?.videoId
      ? `\nhttps://music.youtube.com/watch?v=${tracks[0].videoId}`
      : '';
    try {
      await Share.share({
        message: `${displayTitle} — ${displayArtist}${urlPart}`,
      });
    } catch {
      // Cancelled
    }
  }, [displayTitle, displayArtist, tracks]);

  const handleOpenArtist = useCallback(() => {
    if (!canOpenArtistProfile) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('ArtistDetail', {
      artistName: displayArtist,
      artistAvatar: studioCoverUri,
    });
  }, [canOpenArtistProfile, navigation, displayArtist, studioCoverUri]);

  const handlePlayTrack = useCallback(
    (idx: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      playAlbumContext(tracks, idx, displayTitle);
    },
    [tracks, playAlbumContext, displayTitle]
  );

  const formatDuration = (ms?: number) => {
    if (!ms || ms <= 0) return '3:30';
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Sticky top bar opacity + elastic overscroll artwork stretch
  const stickyOpacity = scrollY.interpolate({
    inputRange: [170, 235],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const heroScale = scrollY.interpolate({
    inputRange: [-140, 0, 120],
    outputRange: [1.08, 1, 0.96],
    extrapolate: 'clamp',
  });

  const subtitleMeta = useMemo(() => {
    const parts: string[] = [];
    if (collectionType === 'album' || collectionType === 'single' || collectionType === 'ep') {
      if (displayYear) parts.push(displayYear);
      parts.push(typeLabel);
      if (tracks.length > 0 && !displayYear) {
        parts.push(isAr ? `${tracks.length} أغاني` : `${tracks.length} Songs`);
      }
    } else {
      parts.push(typeLabel);
      if (tracks.length > 0) {
        parts.push(isAr ? `${tracks.length} أغاني` : `${tracks.length} Songs`);
      }
    }
    return parts.join(' • ');
  }, [collectionType, displayYear, typeLabel, tracks.length, isAr]);

  return (
    <View style={[styles.container, { backgroundColor: uiColors.baseBg }]}>
      {/* ── Full-Screen Adaptive Cover-Tinted Backdrop ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {studioCoverUri ? (
          <Image
            source={heroArtSource}
            style={[StyleSheet.absoluteFill, { opacity: isDark ? 0.95 : 0.72 }]}
            blurRadius={96}
            contentFit="cover"
          />
        ) : null}

        {/* Subtle atmospheric hue wash so even pure black/monochrome covers gain tonal richness */}
        <LinearGradient
          colors={[atmosphericTint.top, atmosphericTint.mid, atmosphericTint.bottom]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: studioCoverUri ? (isDark ? 0.26 : 0.16) : 0.95 }]}
        />

        {/* WCAG Contrast-Safe Veil ensuring crisp text legibility on BOTH white & dark covers in Light/Dark Mode */}
        <LinearGradient
          colors={[uiColors.scrimTop, uiColors.scrimMid, uiColors.scrimBottom]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── Sticky Frosted Header & Floating Glass Controls ── */}
      <View
        style={[
          styles.floatingHeader,
          { paddingTop: insets.top + 8, flexDirection: rowDirection },
        ]}
        pointerEvents="box-none"
      >
        {/* Blurred sticky title strip revealed while scrolling */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { opacity: stickyOpacity, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: uiColors.divider },
          ]}
          pointerEvents="none"
        >
          <BlurView
            intensity={isDark ? 65 : 80}
            tint={isDark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, { backgroundColor: uiColors.stickyBarBg }]}
          />
          <View
            style={{
              flex: 1,
              justifyContent: 'flex-end',
              alignItems: 'center',
              paddingBottom: 14,
              paddingHorizontal: 112,
            }}
          >
            <Text style={[styles.stickyTitle, { color: uiColors.primaryText }]} numberOfLines={1}>
              {displayTitle}
            </Text>
          </View>
        </Animated.View>

        {/* Back Circle */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
          activeOpacity={0.8}
        >
          <LiquidGlassSurface
            glassStyle="regular"
            isDark={isDark}
            isInteractive
            borderRadius={20}
            style={[
              styles.glassCircleNav,
              {
                backgroundColor: uiColors.glassBtnBg,
                borderColor: uiColors.glassBtnBorder,
              },
            ]}
          >
            <Ionicons
              name={isAr ? 'chevron-forward' : 'chevron-back'}
              size={22}
              color={uiColors.primaryText}
            />
          </LiquidGlassSurface>
        </TouchableOpacity>

        {/* Combined [Share | ...] Pill (Apple Music Liquid Glass Style) */}
        <LiquidGlassSurface
          glassStyle="regular"
          isDark={isDark}
          isInteractive
          borderRadius={20}
          style={[
            styles.glassPillPair,
            {
              flexDirection: rowDirection,
              backgroundColor: uiColors.glassBtnBg,
              borderColor: uiColors.glassBtnBorder,
            },
          ]}
        >
          <TouchableOpacity onPress={handleShare} activeOpacity={0.75} style={styles.pillHalfBtn}>
            <Ionicons name="share-outline" size={20} color={uiColors.primaryText} />
          </TouchableOpacity>
          <View style={[styles.pillDivider, { backgroundColor: uiColors.glassBtnBorder }]} />
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActionSheetOpen(true);
            }}
            activeOpacity={0.75}
            style={styles.pillHalfBtn}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={uiColors.primaryText} />
          </TouchableOpacity>
        </LiquidGlassSurface>
      </View>

      {/* ── Main Scrollable Album / Playlist / Mix Content ── */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false, listener: onDockScroll }
        )}
        contentContainerStyle={{
          paddingTop: insets.top + 66,
          paddingBottom: miniPlayerBottomGap + 36,
        }}
      >
        {/* ── Hero Cover + Metadata + 3 Actions ── */}
        <View style={styles.heroContainer}>
          <Animated.View
            style={[
              styles.coverShadowBox,
              {
                transform: [{ scale: heroScale }],
                shadowColor: '#000',
                shadowOpacity: isDark ? 0.45 : 0.2,
                borderColor: uiColors.coverBorder,
              },
            ]}
          >
            {studioCoverUri ? (
              <Image
                source={heroArtSource}
                style={styles.heroCoverImg}
                {...STUDIO_IMAGE_PROPS}
              />
            ) : (
              <LinearGradient
                colors={[atmosphericTint.accent, '#1E293B']}
                style={[styles.heroCoverImg, styles.coverPlaceholder]}
              >
                <Ionicons name="musical-notes" size={64} color="#FFFFFF" />
              </LinearGradient>
            )}
          </Animated.View>

          <Text
            style={[styles.heroTitle, { color: uiColors.primaryText, writingDirection }]}
            numberOfLines={2}
          >
            {displayTitle}
          </Text>

          <TouchableOpacity
            disabled={!canOpenArtistProfile}
            onPress={handleOpenArtist}
            activeOpacity={0.7}
            style={styles.artistLinkBtn}
          >
            <Text
              style={[
                styles.heroArtist,
                {
                  color: uiColors.secondaryText,
                  writingDirection,
                },
              ]}
              numberOfLines={1}
            >
              {displayArtist}
            </Text>
          </TouchableOpacity>

          <Text
            style={[styles.heroMeta, { color: uiColors.mutedText, writingDirection }]}
            numberOfLines={1}
          >
            {subtitleMeta}
          </Text>

          {/* ── 3-Button Apple Music Control Row: [ Shuffle ] [ ▶ Play ] [ + ] ── */}
          <View style={[styles.actionsRow, { flexDirection: rowDirection }]}>
            <TouchableOpacity
              onPress={handleShufflePlay}
              disabled={tracks.length === 0}
              activeOpacity={0.8}
            >
              <LiquidGlassSurface
                glassStyle="regular"
                isDark={isDark}
                isInteractive
                borderRadius={24}
                style={[
                  styles.roundActionBtn,
                  {
                    backgroundColor: uiColors.glassBtnBg,
                    borderColor: uiColors.glassBtnBorder,
                  },
                ]}
              >
                <Ionicons name="shuffle" size={22} color={uiColors.primaryText} />
              </LiquidGlassSurface>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePlayAll}
              disabled={tracks.length === 0}
              activeOpacity={0.85}
              style={[
                styles.playMainPill,
                {
                  flexDirection: rowDirection,
                  backgroundColor: uiColors.playPillBg,
                  opacity: tracks.length === 0 ? 0.5 : 1,
                },
              ]}
            >
              <Ionicons
                name={isCollectionCurrentlyActive && isPlaying ? 'pause' : 'play'}
                size={20}
                color={uiColors.playPillText}
              />
              <Text style={[styles.playMainText, { color: uiColors.playPillText }]}>
                {isCollectionCurrentlyActive && isPlaying
                  ? isAr
                    ? 'إيقاف'
                    : 'Pause'
                  : isAr
                  ? 'تشغيل'
                  : 'Play'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleToggleLibrarySave} activeOpacity={0.8}>
              <LiquidGlassSurface
                glassStyle="regular"
                isDark={isDark}
                isInteractive
                borderRadius={24}
                style={[
                  styles.roundActionBtn,
                  {
                    backgroundColor: isSavedInLibrary
                      ? uiColors.savedAccentBg
                      : uiColors.glassBtnBg,
                    borderColor: isSavedInLibrary
                      ? uiColors.primaryText
                      : uiColors.glassBtnBorder,
                  },
                ]}
              >
                <Ionicons
                  name={isSavedInLibrary ? 'checkmark' : 'add'}
                  size={24}
                  color={uiColors.primaryText}
                />
              </LiquidGlassSurface>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Track List (Thin Hairline Dividers + Track Cover Thumbnails) ── */}
        {loading && tracks.length === 0 ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={uiColors.primaryText} />
            <Text style={[styles.loadingLabel, { color: uiColors.mutedText }]}>
              {isAr ? 'جاري جلب المقاطع...' : 'Loading tracks...'}
            </Text>
          </View>
        ) : tracks.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="musical-notes-outline" size={38} color={uiColors.mutedText} />
            <Text style={[styles.emptyLabel, { color: uiColors.secondaryText }]}>
              {isAr ? 'لا توجد مقاطع متاحة حالياً' : 'No tracks available'}
            </Text>
          </View>
        ) : (
          <View style={styles.trackListContainer}>
            <View style={[styles.hairlineDivider, { backgroundColor: uiColors.divider }]} />
            {tracks.map((tr, idx) => {
              const isCurrent = currentTrack?.videoId === tr.videoId;
              const isLiked = likedTrackIds.includes(tr.videoId);

              // Preserve each track's unique cover; use album studio cover when an official album track returns blank/16:9 generic YT thumb
              const prefersAlbumCover =
                collectionType === 'album' &&
                Boolean(studioCoverUri) &&
                (!tr.thumbnail || tr.thumbnail.includes('/hqdefault.jpg')) &&
                displayCoverRaw.includes('googleusercontent.com');

              const rowCoverUri = prefersAlbumCover ? studioCoverUri : tr.thumbnail || displayCoverRaw;
              const rowCoverSource = getUniversalStudioArtworkSource(
                rowCoverUri,
                tr.title,
                tr.artist || displayArtist,
                tr.videoId
              );

              const showSubArtist =
                tr.artist &&
                tr.artist.toLowerCase().trim() !== displayArtist.toLowerCase().trim();
              const durationText = formatDuration(tr.duration);
              const subLine = showSubArtist
                ? `${tr.artist} • ${durationText}`
                : durationText;

              const rowDlState = activeDownloads[tr.videoId];
              const isRowDownloading =
                rowDlState?.status === 'probing' || rowDlState?.status === 'downloading';
              const isRowDownloaded = downloadedTracks.some((d) => d.videoId === tr.videoId);

              return (
                <View key={`${tr.videoId}-${idx}`}>
                  <TouchableOpacity
                    activeOpacity={0.72}
                    onPress={() => handlePlayTrack(idx)}
                    style={[
                      styles.trackRow,
                      {
                        flexDirection: rowDirection,
                        backgroundColor: isCurrent ? uiColors.activeRowBg : 'transparent',
                      },
                    ]}
                  >
                    {/* Index / Active Playing Icon */}
                    <View style={styles.indexCol}>
                      {isCurrent ? (
                        <Ionicons
                          name={isPlaying ? 'volume-high' : 'pause'}
                          size={15}
                          color={isDark ? '#FFFFFF' : '#0F172A'}
                        />
                      ) : (
                        <Text style={[styles.trackNumber, { color: uiColors.mutedText }]}>
                          {idx + 1}
                        </Text>
                      )}
                    </View>

                    {/* Track Square Cover Artwork */}
                    <Image
                      source={rowCoverSource}
                      style={[
                        styles.trackCoverThumb,
                        { borderColor: uiColors.coverBorder },
                      ]}
                      {...STUDIO_IMAGE_PROPS}
                    />

                    {/* Title & Subtitle */}
                    <View style={styles.trackTextCol}>
                      <Text
                        style={[
                          styles.trackTitle,
                          {
                            color: uiColors.primaryText,
                            fontWeight: isCurrent ? '700' : '600',
                            textAlign,
                            writingDirection,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {tr.title}
                      </Text>
                      <Text
                        style={[
                          styles.trackSub,
                          {
                            color: uiColors.secondaryText,
                            textAlign,
                            writingDirection,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {subLine}
                      </Text>
                    </View>

                    {/* Quick Download Progress Ring + Favorite Heart + Options Menu (...) */}
                    {(isRowDownloading || isRowDownloaded) && (
                      <View style={styles.rowIconBtn}>
                        <CircularDownloadProgress
                          status={
                            isRowDownloading
                              ? ((rowDlState?.status as 'probing' | 'downloading') || 'downloading')
                              : 'completed'
                          }
                          progress={rowDlState?.progress || 0}
                          size={18}
                          activeColor="#0A84FF"
                          completedColor="#30D158"
                          trackColor={isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.16)'}
                        />
                      </View>
                    )}

                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        toggleLike(tr);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      style={styles.rowIconBtn}
                    >
                      <Ionicons
                        name={isLiked ? 'heart' : 'heart-outline'}
                        size={18}
                        color={isLiked ? '#FB7185' : uiColors.mutedText}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedTrackMenu(tr);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      style={styles.rowIconBtn}
                    >
                      <Ionicons
                        name="ellipsis-horizontal"
                        size={18}
                        color={uiColors.mutedText}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>

                  {/* Thin Hairline Divider Between Songs */}
                  <View
                    style={[
                      styles.rowHairline,
                      isAr ? { marginRight: 51, marginLeft: 18 } : { marginLeft: 51, marginRight: 18 },
                      { backgroundColor: uiColors.divider },
                    ]}
                  />
                </View>
              );
            })}

            {/* Clean Apple Music Footer Metadata (Zero Promo / Zero Worldwide / Zero Store Links) */}
            <View style={[styles.footerSummary, { alignItems: isAr ? 'flex-end' : 'flex-start' }]}>
              {Boolean(displayYear) && (
                <Text style={[styles.footerText, { color: uiColors.mutedText, writingDirection }]}>
                  {displayYear}
                </Text>
              )}
              <Text style={[styles.footerText, { color: uiColors.mutedText, writingDirection }]}>
                {isAr
                  ? `${tracks.length} أغاني، ${totalMinutes} دقيقة`
                  : `${tracks.length} songs, ${totalMinutes} minutes`}
              </Text>
            </View>
          </View>
        )}
      </Animated.ScrollView>

      {/* ── Feedback Toast Pill ── */}
      {Boolean(saveToast) && (
        <View style={[styles.toastWrapper, { bottom: miniPlayerBottomGap + 24 }]} pointerEvents="none">
          <LiquidGlassSurface
            glassStyle="regular"
            isDark={isDark}
            borderRadius={22}
            style={[
              styles.toastPill,
              {
                backgroundColor: isDark ? 'rgba(28, 32, 44, 0.92)' : 'rgba(15, 23, 42, 0.90)',
                borderColor: 'rgba(255,255,255,0.18)',
              },
            ]}
          >
            <Ionicons name="checkmark-circle" size={18} color="#34D399" />
            <Text style={styles.toastTxt}>{saveToast}</Text>
          </LiquidGlassSurface>
        </View>
      )}

      {/* ── Collection Options Modal (... Button) ── */}
      <Modal
        visible={actionSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSheetOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActionSheetOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.sheetCard,
              {
                backgroundColor: uiColors.sheetBg,
                borderColor: uiColors.glassBtnBorder,
                paddingBottom: insets.bottom + 18,
              },
            ]}
          >
            <View style={[styles.sheetHeader, { flexDirection: rowDirection, borderBottomColor: uiColors.divider }]}>
              {studioCoverUri ? (
                <Image source={heroArtSource} style={styles.sheetThumb} {...STUDIO_IMAGE_PROPS} />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: uiColors.primaryText, textAlign }]} numberOfLines={1}>
                  {displayTitle}
                </Text>
                <Text style={[styles.sheetSub, { color: uiColors.secondaryText, textAlign }]} numberOfLines={1}>
                  {displayArtist}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.sheetAction, { flexDirection: rowDirection }]}
              onPress={() => {
                setActionSheetOpen(false);
                handleToggleLibrarySave();
              }}
            >
              <Ionicons
                name={isSavedInLibrary ? 'checkmark-circle-outline' : 'add-circle-outline'}
                size={22}
                color={uiColors.primaryText}
              />
              <Text style={[styles.sheetActionTxt, { color: uiColors.primaryText }]}>
                {isSavedInLibrary
                  ? isAr
                    ? 'إزالة من المكتبة'
                    : 'Remove from Library'
                  : isAr
                  ? 'إضافة إلى المكتبة'
                  : 'Add to Library'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sheetAction, { flexDirection: rowDirection }]}
              onPress={() => {
                setActionSheetOpen(false);
                handleShufflePlay();
              }}
            >
              <Ionicons name="shuffle" size={22} color={uiColors.primaryText} />
              <Text style={[styles.sheetActionTxt, { color: uiColors.primaryText }]}>
                {isAr ? 'تشغيل عشوائي' : 'Shuffle Play'}
              </Text>
            </TouchableOpacity>

            {canOpenArtistProfile && (
              <TouchableOpacity
                style={[styles.sheetAction, { flexDirection: rowDirection }]}
                onPress={() => {
                  setActionSheetOpen(false);
                  handleOpenArtist();
                }}
              >
                <Ionicons name="person-circle-outline" size={22} color={uiColors.primaryText} />
                <Text style={[styles.sheetActionTxt, { color: uiColors.primaryText }]}>
                  {isAr ? `الانتقال إلى ${displayArtist}` : `Go to ${displayArtist}`}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.sheetAction, { flexDirection: rowDirection }]}
              onPress={() => {
                setActionSheetOpen(false);
                handleShare();
              }}
            >
              <Ionicons name="share-outline" size={22} color={uiColors.primaryText} />
              <Text style={[styles.sheetActionTxt, { color: uiColors.primaryText }]}>
                {isAr ? 'مشاركة' : 'Share'}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Track Options Modal (... on Row) ── */}
      <Modal
        visible={selectedTrackMenu !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTrackMenu(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedTrackMenu(null)}>
          {selectedTrackMenu && (
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={[
                styles.sheetCard,
                {
                  backgroundColor: uiColors.sheetBg,
                  borderColor: uiColors.glassBtnBorder,
                  paddingBottom: insets.bottom + 18,
                },
              ]}
            >
              <View style={[styles.sheetHeader, { flexDirection: rowDirection, borderBottomColor: uiColors.divider }]}>
                <Image
                  source={getUniversalStudioArtworkSource(
                    selectedTrackMenu.thumbnail || displayCoverRaw,
                    selectedTrackMenu.title,
                    selectedTrackMenu.artist,
                    selectedTrackMenu.videoId
                  )}
                  style={styles.sheetThumb}
                  {...STUDIO_IMAGE_PROPS}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetTitle, { color: uiColors.primaryText, textAlign }]} numberOfLines={1}>
                    {selectedTrackMenu.title}
                  </Text>
                  <Text style={[styles.sheetSub, { color: uiColors.secondaryText, textAlign }]} numberOfLines={1}>
                    {selectedTrackMenu.artist}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.sheetAction, { flexDirection: rowDirection }]}
                onPress={() => {
                  const idx = tracks.findIndex((x) => x.videoId === selectedTrackMenu.videoId);
                  setSelectedTrackMenu(null);
                  if (idx >= 0) handlePlayTrack(idx);
                }}
              >
                <Ionicons name="play-outline" size={22} color={uiColors.primaryText} />
                <Text style={[styles.sheetActionTxt, { color: uiColors.primaryText }]}>
                  {isAr ? 'تشغيل الآن' : 'Play Now'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sheetAction, { flexDirection: rowDirection }]}
                onPress={() => {
                  toggleLike(selectedTrackMenu);
                  setSelectedTrackMenu(null);
                }}
              >
                <Ionicons
                  name={likedTrackIds.includes(selectedTrackMenu.videoId) ? 'heart' : 'heart-outline'}
                  size={22}
                  color={likedTrackIds.includes(selectedTrackMenu.videoId) ? '#FB7185' : uiColors.primaryText}
                />
                <Text style={[styles.sheetActionTxt, { color: uiColors.primaryText }]}>
                  {likedTrackIds.includes(selectedTrackMenu.videoId)
                    ? isAr
                      ? 'إزالة من المفضلة'
                      : 'Remove from Favorites'
                    : isAr
                    ? 'إضافة إلى المفضلة'
                    : 'Add to Favorites'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sheetAction, { flexDirection: rowDirection }]}
                onPress={() => {
                  const artist = selectedTrackMenu.artist || displayArtist;
                  setSelectedTrackMenu(null);
                  navigation.navigate('ArtistDetail', { artistName: artist });
                }}
              >
                <Ionicons name="person-circle-outline" size={22} color={uiColors.primaryText} />
                <Text style={[styles.sheetActionTxt, { color: uiColors.primaryText }]}>
                  {isAr ? 'الانتقال إلى الفنان' : 'Go to Artist'}
                </Text>
              </TouchableOpacity>

              {(() => {
                const trackVid = selectedTrackMenu.videoId;
                const isTrackDownloaded = downloadedTracks.some((d) => d.videoId === trackVid);
                const dlState = activeDownloads[trackVid];
                const isTrackDownloading = dlState?.status === 'probing' || dlState?.status === 'downloading';
                return (
                  <TouchableOpacity
                    style={[styles.sheetAction, { flexDirection: rowDirection }]}
                    disabled={isTrackDownloading}
                    onPress={async () => {
                      const targetTrack = selectedTrackMenu;
                      setSelectedTrackMenu(null);
                      if (isTrackDownloaded) {
                        await downloadService.deleteDownloadedTrack(targetTrack.videoId);
                        ToastManager.show({
                          title: isAr ? 'تم حذف التحميل' : 'Download Removed',
                          subtitle: targetTrack.title,
                          icon: 'trash-outline',
                          duration: 2400,
                        });
                        return;
                      }
                      if (!useNetworkStore.getState().isOnline) {
                        ToastManager.show({
                          title: isAr ? 'أنت في وضع الأوفلاين' : 'Offline Mode',
                          subtitle: isAr ? 'يتطلب التحميل اتصالاً بالإنترنت' : 'Connect to internet to download',
                          icon: 'cloud-offline-outline',
                          duration: 2600,
                        });
                        return;
                      }
                      ToastManager.show({
                        title: isAr ? 'بدأ تحميل المقطع' : 'Downloading Track',
                        subtitle: targetTrack.title,
                        icon: 'arrow-down-circle',
                        duration: 2200,
                      });
                      downloadService.downloadTrack(targetTrack, 'auto').then(() => {
                        ToastManager.show({
                          title: isAr ? 'تم التنزيل بنجاح!' : 'Downloaded!',
                          subtitle: targetTrack.title,
                          icon: 'checkmark-circle',
                          duration: 2600,
                        });
                      }).catch((err: any) => {
                        ToastManager.show({
                          title: isAr ? 'تعذر التنزيل' : 'Download Failed',
                          subtitle: err?.message || '',
                          icon: 'alert-circle',
                          duration: 2800,
                        });
                      });
                    }}
                  >
                    {isTrackDownloading ? (
                      <CircularDownloadProgress
                        status={(dlState?.status as 'probing' | 'downloading') || 'downloading'}
                        progress={dlState?.progress || 0}
                        size={22}
                        activeColor="#0A84FF"
                        trackColor={isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.16)'}
                      />
                    ) : isTrackDownloaded ? (
                      <CircularDownloadProgress status="completed" size={22} completedColor="#30D158" />
                    ) : (
                      <Ionicons
                        name="cloud-download-outline"
                        size={22}
                        color={uiColors.primaryText}
                      />
                    )}
                    <Text style={[styles.sheetActionTxt, { color: uiColors.primaryText }]}>
                      {isTrackDownloading
                        ? isAr
                          ? `جاري التحميل... ${Math.round((dlState?.progress || 0) * 100)}%`
                          : `Downloading... ${Math.round((dlState?.progress || 0) * 100)}%`
                        : isTrackDownloaded
                        ? isAr
                          ? 'محمّل على الهاتف (حذف)'
                          : 'Downloaded (Remove)'
                        : isAr
                        ? 'تحميل على الهاتف (أوفلاين)'
                        : 'Download for Offline'}
                    </Text>
                  </TouchableOpacity>
                );
              })()}
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: 16,
    paddingBottom: 10,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stickyTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  glassCircleNav: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  glassPillPair: {
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
  },
  pillHalfBtn: {
    width: 40,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillDivider: {
    width: StyleSheet.hairlineWidth,
    height: 18,
  },
  heroContainer: {
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingBottom: 22,
  },
  coverShadowBox: {
    width: HERO_COVER_SIZE,
    height: HERO_COVER_SIZE,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 24,
    elevation: 14,
    marginBottom: 20,
  },
  heroCoverImg: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 4,
  },
  artistLinkBtn: {
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  heroArtist: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  heroMeta: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  actionsRow: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  roundActionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  playMainPill: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 5,
  },
  playMainText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  loadingState: {
    paddingTop: 56,
    alignItems: 'center',
    gap: 12,
  },
  loadingLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    paddingTop: 56,
    alignItems: 'center',
    gap: 10,
  },
  emptyLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  trackListContainer: {
    width: '100%',
  },
  hairlineDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 18,
  },
  trackRow: {
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 18,
    gap: 11,
    minHeight: 62,
  },
  indexCol: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackNumber: {
    fontSize: 14,
    fontWeight: '600',
  },
  trackCoverThumb: {
    width: 44,
    height: 44,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(128,128,128,0.18)',
  },
  trackTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  trackTitle: {
    fontSize: 15,
    marginBottom: 2,
  },
  trackSub: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  rowIconBtn: {
    padding: 6,
  },
  rowHairline: {
    height: StyleSheet.hairlineWidth,
  },
  footerSummary: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    gap: 4,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  toastWrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 60,
  },
  toastPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
  },
  toastTxt: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.48)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 18,
    paddingHorizontal: 20,
  },
  sheetHeader: {
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sheetSub: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  sheetAction: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  sheetActionTxt: {
    fontSize: 16,
    fontWeight: '600',
  },
});
