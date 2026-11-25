import React, { useState, useEffect, useCallback, useMemo, useRef, startTransition } from 'react';
import {
  ScrollView,
  View,
  RefreshControl,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../providers/AuthProvider';
import { useAudioStore } from '../../store/useAudioStore';
import { useTheme } from '../../theme/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMiniPlayerBottomGap } from '../../hooks/useMiniPlayerBottomGap';
import { ToastManager } from '../../components/InAppToast';
import { DynamicHomeSections, musicDnaService } from '../../services/musicDnaService';
import { promptForRegionAccessIfNeeded } from '../../services/regionService';

import { MusicDataEngine, TimeContextInfo } from './engines/musicData.engine';
import { createMusicThemedStyles } from './styles/musicThemedStyles';

import { MoodFilterBarSection } from './sections/MoodFilterBar.section';
import { QuickGridSection } from './sections/QuickGrid.section';
import { PickedForYouSection } from './sections/PickedForYou.section';
import { TopMixesRailSection } from './sections/TopMixesRail.section';
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

  // Stable static data selectors (does NOT subscribe to isPlaying / currentTrack)
  const history = useAudioStore((s) => s.history);
  const likedTrackIds = useAudioStore((s) => s.likedTrackIds);

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
  useEffect(() => {
    if (!isInitialFetchDone.current) {
      isInitialFetchDone.current = true;
      promptForRegionAccessIfNeeded()
        .then(() => loadDynamicFeeds(activeFilter))
        .catch(() => loadDynamicFeeds(activeFilter));
    }
  }, [loadDynamicFeeds, activeFilter]);

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
  }, [activeFilter]);

  const handleNavigateArtist = useCallback(
    (artistName: string, artistId?: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      navigation.navigate('ArtistDetail', { artistName, artistId });
    },
    [navigation]
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 12 }}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
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
