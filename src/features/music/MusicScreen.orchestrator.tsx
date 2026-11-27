import React, { useState, useEffect, useCallback, useMemo, useRef, startTransition } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../providers/AuthProvider';
import { useAudioStore, Track } from '../../store/useAudioStore';
import { useLanguageStore } from '../../store/useLanguageStore';
import { useTheme } from '../../theme/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMiniPlayerBottomGap } from '../../hooks/useMiniPlayerBottomGap';
import { useDockScrollTracker } from '../../utils/scrollDockTracker';
import { ToastManager } from '../../components/InAppToast';
import { LiquidGlassSurface } from '../../components/LiquidGlassSurface';
import { DynamicHomeSections, musicDnaService } from '../../services/musicDnaService';
import { promptForRegionAccessIfNeeded } from '../../services/regionService';
import { useNetworkStore } from '../../services/networkService';
import { useDownloadStore } from '../../services/downloadService';
import { getUniversalStudioArtworkSource } from '../../utils/artworkHelper';

import { MusicDataEngine, TimeContextInfo } from './engines/musicData.engine';
import { createMusicThemedStyles } from './styles/musicThemedStyles';

import { MoodFilterBarSection } from './sections/MoodFilterBar.section';
import { QuickGridSection } from './sections/QuickGrid.section';
import { PickedForYouSection } from './sections/PickedForYou.section';
import { TopMixesRailSection } from './sections/TopMixesRail.section';
import { ArtistRadiosRailSection } from './sections/ArtistRadiosRail.section';
import { WorkoutCadenceSection } from './sections/WorkoutCadence.section';
import { FavoriteArtistsRailSection } from './sections/FavoriteArtistsRail.section';
import { RecentlyPlayedRailSection } from './sections/RecentlyPlayedRail.section';

interface MusicScreenOrchestratorProps {
  navigation: any;
}

/**
 * ⚡ MusicScreen Orchestrator
 * High-performance, lightweight coordinator (< 160 lines).
 * - Zero subscriptions to playback state (Zero root re-renders).
 * - Progressive Mounting: Frame 0 renders above-the-fold immediately (0ms).
 * - Below-the-fold rails mount deferred via React 19 startTransition + requestAnimationFrame.
 * - Hardware-accelerated memory conservation with removeClippedSubviews.
 */
export const MusicScreenOrchestrator: React.FC<MusicScreenOrchestratorProps> = ({
  navigation,
}) => {
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const miniPlayerBottomGap = useMiniPlayerBottomGap();
  const { onScroll: onDockScroll } = useDockScrollTracker();

  // Stable static data selectors (does NOT subscribe to isPlaying / currentTrack)
  const history = useAudioStore((s) => s.history);
  const likedTrackIds = useAudioStore((s) => s.likedTrackIds);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const downloadedTracks = useDownloadStore((s) => s.downloadedTracks);
  const isAr = useLanguageStore((s) => s.language) === 'ar';

  const offlineReadyTracks: Track[] = useMemo(
    () =>
      downloadedTracks.map((d) => ({
        ...d,
        thumbnail: d.artworkLocalUri || d.thumbnail,
        audioUrl: d.audioLocalUri,
      })),
    [downloadedTracks]
  );

  const [activeFilter, setActiveFilter] = useState('All');
  const [refreshing, setRefreshing] = useState(false);

  // Progressive Mounting: false at Frame 0, flips to true after initial frame
  const [isDeferredMounted, setIsDeferredMounted] = useState(false);

  // 0ms instant synchronous initial state via Music DNA Engine
  const [sections, setSections] = useState<DynamicHomeSections>(() =>
    MusicDataEngine.getSectionsSync('All', history)
  );

  const timeContext: TimeContextInfo = useMemo(
    () => MusicDataEngine.getTimeContext(),
    []
  );

  const styles = useMemo(() => createMusicThemedStyles(theme, isDark), [theme, isDark]);

  // Sync active user with DNA engine
  useEffect(() => {
    if (user?.id) {
      useAudioStore.getState().setActiveUserId(user.id);
      musicDnaService.setUserId(user.id);
    }
  }, [user?.id]);

  // Progressive Mounting Trigger: mount bottom sections smoothly after initial paint
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(() => {
        setIsDeferredMounted(true);
      });
    }, 80);
    return () => clearTimeout(timer);
  }, []);

  // Async enrichment
  const loadDynamicFeeds = useCallback(
    async (filter: string = activeFilter) => {
      try {
        const enriched = await MusicDataEngine.fetchEnrichedSections(
          filter,
          history,
          likedTrackIds
        );
        setSections(enriched);
      } catch (err) {
        console.warn('[MusicOrchestrator] Feed error:', err);
      } finally {
        setRefreshing(false);
      }
    },
    [activeFilter, history, likedTrackIds]
  );

  const isInitialFetchDone = useRef(false);
  const wasOfflineRef = useRef(!isOnline);
  useEffect(() => {
    if (!isInitialFetchDone.current) {
      isInitialFetchDone.current = true;
      if (!useNetworkStore.getState().isOnline) {
        loadDynamicFeeds(activeFilter);
        return;
      }
      promptForRegionAccessIfNeeded()
        .then(() => loadDynamicFeeds(activeFilter))
        .catch(() => loadDynamicFeeds(activeFilter));
    }
  }, [loadDynamicFeeds, activeFilter]);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      promptForRegionAccessIfNeeded()
        .then(() => loadDynamicFeeds(activeFilter))
        .catch(() => loadDynamicFeeds(activeFilter));
    }
  }, [isOnline, loadDynamicFeeds, activeFilter]);

  const handleSelectFilter = useCallback(
    (pill: string) => {
      setActiveFilter(pill);
      // Instant 0ms synchronous UI filter
      setSections(MusicDataEngine.getSectionsSync(pill, history));
      // Asynchronous enriched update
      loadDynamicFeeds(pill);
    },
    [history, loadDynamicFeeds]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!useNetworkStore.getState().isOnline) {
      await useDownloadStore.getState().loadManifest().catch(() => {});
      setRefreshing(false);
      ToastManager.show({
        title: isAr ? 'أنت في وضع الأوفلاين' : 'Offline Mode',
        subtitle: isAr ? 'تم تحديث المقاطع المحمّلة محلياً' : 'Local downloaded tracks refreshed',
        icon: 'cloud-offline-outline',
        duration: 2400,
      });
      return;
    }
    try {
      const refreshed = await MusicDataEngine.refreshFeeds(activeFilter);
      setSections(refreshed);
    } catch {
      ToastManager.show({
        title: 'تعذر التحديث',
        subtitle: 'يتم عرض آخر محتوى محفوظ',
        icon: 'cloud-offline-outline',
        duration: 3500,
      });
    } finally {
      setRefreshing(false);
    }
  }, [activeFilter, isAr]);

  const handleNavigateArtist = useCallback(
    (artistName: string, artistId?: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      navigation.navigate('ArtistDetail', { artistName, artistId });
    },
    [navigation]
  );

  const handleOpenArtistRadio = useCallback(
    (radio: any) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      navigation.navigate('AlbumDetails', {
        albumTitle: `${radio.artistName} Radio`,
        artistName: radio.artistName,
        cover: radio.topArtworks?.[0] || '',
        type: 'playlist',
        album: {
          title: `${radio.artistName} Radio`,
          artist: radio.artistName,
          thumbnail: radio.topArtworks?.[0] || '',
          tracks: radio.tracks || [],
        },
      });
    },
    [navigation]
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 12 }}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={onDockScroll}
      contentInsetAdjustmentBehavior="never"
      removeClippedSubviews={true}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#0A84FF"
        />
      }
    >
      {/* ── Frame 0: Above-the-fold sections (0ms instant render directly into music) ── */}
      <MoodFilterBarSection
        activeFilter={activeFilter}
        onSelectFilter={handleSelectFilter}
      />

      {!isOnline && (
        <View style={{ marginBottom: 18 }}>
          <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
            <LiquidGlassSurface
              glassStyle="regular"
              isDark={isDark}
              isInteractive={false}
              borderRadius={20}
              style={{
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.08)',
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.75)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                overflow: 'hidden',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: 'rgba(10, 132, 255, 0.16)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="cloud-offline-outline" size={18} color="#0A84FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textPrimary, fontSize: 14.5, fontWeight: '800' }} numberOfLines={1}>
                    {isAr
                      ? `المحمّل أوفلاين (${offlineReadyTracks.length})`
                      : `Offline Downloads (${offlineReadyTracks.length})`}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                    {offlineReadyTracks.length > 0
                      ? isAr
                        ? 'جاهز للتشغيل بدون إنترنت'
                        : 'Ready to play without internet'
                      : isAr
                        ? 'حمّل مقاطعك لتشغيلها أوفلاين'
                        : 'Download tracks to play offline'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (offlineReadyTracks.length > 0) {
                    useAudioStore
                      .getState()
                      .playTrack(offlineReadyTracks[0], offlineReadyTracks, 0, 'Downloads');
                  } else {
                    navigation.navigate('LibraryTab');
                  }
                }}
                style={{
                  backgroundColor: '#0A84FF',
                  paddingHorizontal: 13,
                  paddingVertical: 7,
                  borderRadius: 16,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' }}>
                  {offlineReadyTracks.length > 0
                    ? isAr
                      ? 'تشغيل الكل'
                      : 'Play All'
                    : isAr
                      ? 'التحميلات'
                      : 'Downloads'}
                </Text>
              </TouchableOpacity>
            </LiquidGlassSurface>
          </View>

          {offlineReadyTracks.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            >
              {offlineReadyTracks.map((item, idx) => (
                <TouchableOpacity
                  key={`offline-rail-${item.videoId}-${idx}`}
                  activeOpacity={0.84}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    useAudioStore.getState().playTrack(item, offlineReadyTracks, idx, 'Downloads');
                  }}
                  style={{ width: 132 }}
                >
                  <View
                    style={{
                      width: 132,
                      height: 132,
                      borderRadius: 16,
                      overflow: 'hidden',
                      marginBottom: 7,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                    }}
                  >
                    <Image
                      source={getUniversalStudioArtworkSource(
                        item.thumbnail,
                        item.title,
                        item.artist,
                        item.videoId
                      )}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                  </View>
                  <Text
                    style={{ color: theme.textPrimary, fontSize: 13, fontWeight: '700' }}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={{ color: theme.textSecondary, fontSize: 11.5, marginTop: 1 }}
                    numberOfLines={1}
                  >
                    {item.artist}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      <QuickGridSection
        tracks={sections.quickJump}
        likedSongsCount={likedTrackIds.length}
        userId={user?.id}
        onNavigateLibrary={() => navigation.navigate('LibraryTab')}
      />

      {/* ── Frame 1+: Deferred Rails (Mounts smoothly without blocking UI) ── */}
      {isDeferredMounted && (
        <>
          <PickedForYouSection
            track={sections.pickedForYou}
            contextQueue={sections.quickJump}
          />

          <TopMixesRailSection topMixes={sections.topMixes} />

          <ArtistRadiosRailSection
            radios={sections.artistRadios || []}
            onOpenRadio={handleOpenArtistRadio}
          />

          <WorkoutCadenceSection
            tracks={sections.energyWorkout}
            onNavigateArtist={handleNavigateArtist}
          />

          <FavoriteArtistsRailSection
            artists={sections.favouriteArtists}
            onNavigateArtist={handleNavigateArtist}
          />

          <RecentlyPlayedRailSection
            tracks={sections.recentlyPlayed}
            onNavigateArtist={handleNavigateArtist}
          />
        </>
      )}

      {/* Safe bottom spacing for Mini Player & Tab Bar */}
      <View style={{ height: miniPlayerBottomGap }} />
    </ScrollView>
  );
};

export default MusicScreenOrchestrator;
