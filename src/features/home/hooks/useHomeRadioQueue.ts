import { useEffect, useState, useCallback, useRef } from 'react';
import { useAudioStore, Track } from '../../../store/useAudioStore';
import {
  fetchInitialInfiniteRadio,
  fetchInfiniteRadioNextBatch,
  getCachedInfiniteRadio,
  recordUserSignal,
} from '../../../services/infiniteRecommendationEngine';
import { musicDnaService } from '../../../services/musicDnaService';
import { useNetworkStore } from '../../../services/networkService';
import { useDownloadStore, DownloadedTrack, downloadedTrackToQueueTrack } from '../../../services/downloadService';
import type { HomeTrack } from '../types/home.types';
import { buildInitialHomeQueue } from '../utils/homeTrackUtils';

function mapDownloadedToHomeTracks(list: DownloadedTrack[]): HomeTrack[] {
  return list
    .filter((d) => Boolean(d?.videoId && (d?.audioLocalUri || d?.videoLocalUri)))
    .map((d) => ({
      ...downloadedTrackToQueueTrack(d),
      id: d.videoId,
    }));
}

/**
 * Manages the Home screen's dynamic infinite radio queue and bidirectional sync
 * with the global audio store (e.g., when tracks start from MusicTab or MiniPlayer).
 */
export const useHomeRadioQueue = () => {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const audioQueue = useAudioStore((s) => s.queue);
  const currentContextName = useAudioStore((s) => s.currentContextName);
  const likedTrackIds = useAudioStore((s) => s.likedTrackIds);
  const playTrack = useAudioStore((s) => s.playTrack);
  const history = useAudioStore((s) => s.history);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const downloadedTracks = useDownloadStore((s) => s.downloadedTracks);

  const [tracks, setTracks] = useState<HomeTrack[]>(() =>
    buildInitialHomeQueue(currentTrack, history)
  );
  const [activeCarouselTrack, setActiveCarouselTrack] = useState<Track | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const isFetchingMoreRef = useRef(false);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;
  const lastFocusedRef = useRef<{ track: Track; focusedAt: number } | null>(null);

  const wasOfflineRef = useRef(!isOnline);

  const loadDynamicRadio = useCallback(async () => {
    try {
      const onlineNow = useNetworkStore.getState().isOnline;
      if (!onlineNow) {
        await useDownloadStore.getState().loadManifest().catch(() => {});
        const localHomeTracks = mapDownloadedToHomeTracks(
          useDownloadStore.getState().downloadedTracks
        );
        const cached = await getCachedInfiniteRadio().catch(() => [] as Track[]);
        const storeState = useAudioStore.getState();

        setTracks((prev) => {
          const seen = new Set<string>();
          const merged: HomeTrack[] = [];
          const pushUnique = (item?: Track | HomeTrack | null) => {
            if (!item?.videoId || seen.has(item.videoId)) return;
            seen.add(item.videoId);
            merged.push({ ...item, id: item.videoId });
          };

          if (storeState.currentTrack?.videoId) pushUnique(storeState.currentTrack);
          localHomeTracks.forEach(pushUnique);
          prev.forEach(pushUnique);
          (cached || []).forEach(pushUnique);
          return merged.length > 0 ? merged : prev;
        });
        return;
      }

      const cached = await getCachedInfiniteRadio();
      if (cached && cached.length > 0) {
        setTracks((prev) => {
          const seen = new Set(prev.map((t) => t.videoId));
          const toAdd = cached.filter((t) => t.videoId && !seen.has(t.videoId));
          return toAdd.length > 0
            ? [...prev, ...toAdd.map((t) => ({ ...t, id: t.videoId }))]
            : prev;
        });
      }

      const storeState = useAudioStore.getState();
      const fresh = await fetchInitialInfiniteRadio(
        storeState.currentTrack,
        storeState.history,
        storeState.likedTrackIds
      );
      if (fresh && fresh.length > 0) {
        // Append fresh personalized tracks while preserving any existing session history cards
        setTracks((prev) => {
          const seen = new Set<string>();
          const merged: HomeTrack[] = [];

          for (const existing of prev) {
            if (existing?.videoId && !seen.has(existing.videoId)) {
              seen.add(existing.videoId);
              merged.push(existing);
            }
          }

          if (storeState.currentTrack?.videoId && !seen.has(storeState.currentTrack.videoId)) {
            seen.add(storeState.currentTrack.videoId);
            merged.unshift({ ...storeState.currentTrack, id: storeState.currentTrack.videoId });
          }

          for (const t of fresh) {
            if (t.videoId && !seen.has(t.videoId)) {
              seen.add(t.videoId);
              merged.push({ ...t, id: t.videoId });
            }
          }

          return merged.length > 0 ? merged : prev;
        });
      }
    } catch (err) {
      console.warn('[useHomeRadioQueue] Dynamic radio load warning:', err);
    }
  }, []);

  useEffect(() => {
    loadDynamicRadio();
  }, [loadDynamicRadio]);

  // Keep downloaded tracks prioritized at the front when offline, and auto-refresh on reconnect
  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      const localHomeTracks = mapDownloadedToHomeTracks(downloadedTracks);
      if (localHomeTracks.length > 0) {
        setTracks((prev) => {
          const seen = new Set<string>();
          const merged: HomeTrack[] = [];
          localHomeTracks.forEach((t) => {
            if (t.videoId && !seen.has(t.videoId)) {
              seen.add(t.videoId);
              merged.push(t);
            }
          });
          prev.forEach((t) => {
            if (t.videoId && !seen.has(t.videoId)) {
              seen.add(t.videoId);
              merged.push(t);
            }
          });
          return merged;
        });
      }
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      loadDynamicRadio();
    }
  }, [isOnline, downloadedTracks, loadDynamicRadio]);

  const handleLoadMoreTracks = useCallback(async () => {
    if (!useNetworkStore.getState().isOnline) return;
    if (isFetchingMoreRef.current) return;
    isFetchingMoreRef.current = true;

    try {
      const latestTracks = tracksRef.current;
      const activeFocal = currentTrackRef.current || latestTracks[latestTracks.length - 1];
      if (!activeFocal) return;

      const existingIds = new Set(
        latestTracks.map((t) => t.videoId).filter(Boolean) as string[]
      );
      const newBatch = await fetchInfiniteRadioNextBatch(activeFocal, existingIds);

      if (newBatch.length > 0) {
        setTracks((prev) => {
          const seen = new Set(prev.map((t) => t.videoId));
          const toAdd: HomeTrack[] = [];
          for (const nb of newBatch) {
            if (nb.videoId && !seen.has(nb.videoId)) {
              seen.add(nb.videoId);
              toAdd.push({ ...nb, id: nb.videoId });
            }
          }
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });
      }
    } catch (e) {
      console.warn('[useHomeRadioQueue] Infinite radio load more error:', e);
    } finally {
      isFetchingMoreRef.current = false;
    }
  }, []);

  // Keep Zustand Dashboard playback queue synced cleanly AFTER render (never inside setTracks updater!)
  useEffect(() => {
    if (currentContextName === 'Dashboard' && tracks.length > audioQueue.length) {
      useAudioStore.setState({ queue: tracks, currentQueue: tracks });
    }
  }, [tracks, audioQueue.length, currentContextName]);

  // Sync audio store queue into Home cards when playing in Dashboard context
  useEffect(() => {
    if (currentContextName === 'Dashboard' && audioQueue.length > tracks.length) {
      setTracks((prev) => {
        const seen = new Set(prev.map((t) => t.videoId));
        const missing = audioQueue.filter((t) => t.videoId && !seen.has(t.videoId));
        if (missing.length > 0) {
          return [...prev, ...missing.map((t) => ({ ...t, id: t.videoId }))];
        }
        return prev;
      });
    }
  }, [audioQueue, currentContextName, tracks.length]);

  // Keep externally started tracks (from MusicTab, Search, MiniPlayer) represented as a Home card
  useEffect(() => {
    if (currentTrack?.videoId) {
      setActiveCarouselTrack(currentTrack);
      setTracks((prev) => {
        const exists = prev.some((t) => t.videoId === currentTrack.videoId);
        if (exists) return prev;
        return [...prev, { ...currentTrack, id: currentTrack.videoId }];
      });
    }
  }, [currentTrack?.videoId]);

  const handleActiveCardChange = useCallback((track: Track) => {
    if (!track?.videoId) return;
    const now = Date.now();
    const prevFocus = lastFocusedRef.current;
    if (prevFocus && prevFocus.track.videoId !== track.videoId) {
      const dwellMs = now - prevFocus.focusedAt;
      // Fast swipe-past (< 3.5s) teaches the engine to explore elsewhere
      if (dwellMs < 3500) {
        recordUserSignal(prevFocus.track, 'skip');
      }
    }
    lastFocusedRef.current = { track, focusedAt: now };
    setActiveCarouselTrack((prev) => (prev?.videoId === track.videoId ? prev : track));
  }, []);

  const handleSelectCarouselTrack = useCallback(
    (selected: Track) => {
      handleActiveCardChange(selected);
      const latestTracks = tracksRef.current;
      const idx = latestTracks.findIndex((t) => t.videoId === selected.videoId);
      const resolvedIdx = idx !== -1 ? idx : 0;
      recordUserSignal(selected, 'play');
      musicDnaService.recordListeningSignal(selected, 'play');
      playTrack(selected, latestTracks, resolvedIdx, 'Dashboard');
    },
    [handleActiveCardChange, playTrack]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDynamicRadio();
    setRefreshing(false);
  }, [loadDynamicRadio]);

  const homeAmbientTrack: Track | undefined = activeCarouselTrack || currentTrack || tracks[0];

  return {
    tracks,
    likedTrackIds,
    homeAmbientTrack,
    refreshing,
    onRefresh,
    handleActiveCardChange,
    handleSelectCarouselTrack,
    handleLoadMoreTracks,
  };
};
