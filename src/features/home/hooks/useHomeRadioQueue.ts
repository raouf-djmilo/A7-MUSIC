import { useEffect, useState, useCallback, useRef } from 'react';
import { useAudioStore, Track } from '../../../store/useAudioStore';
import {
  fetchInitialInfiniteRadio,
  fetchInfiniteRadioNextBatch,
  getCachedInfiniteRadio,
  recordUserSignal,
} from '../../../services/infiniteRecommendationEngine';
import { musicDnaService } from '../../../services/musicDnaService';
import type { HomeTrack } from '../types/home.types';
import { buildInitialHomeQueue } from '../utils/homeTrackUtils';

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

  const [tracks, setTracks] = useState<HomeTrack[]>(() =>
    buildInitialHomeQueue(currentTrack, history)
  );
  const [activeCarouselTrack, setActiveCarouselTrack] = useState<Track | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const isFetchingMoreRef = useRef(false);

  const loadDynamicRadio = useCallback(async () => {
    try {
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
        setTracks((prev) => {
          const seen = new Set<string>();
          const merged: HomeTrack[] = [];

          const active = useAudioStore.getState().currentTrack;
          if (active?.videoId) {
            seen.add(active.videoId);
            merged.push({ ...active, id: active.videoId });
          } else if (prev.length > 0 && prev[0]?.videoId) {
            seen.add(prev[0].videoId);
            merged.push(prev[0]);
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
    let isMounted = true;
    if (isMounted) {
      loadDynamicRadio();
    }
    return () => {
      isMounted = false;
    };
  }, [loadDynamicRadio]);

  const handleLoadMoreTracks = useCallback(async () => {
    if (isFetchingMoreRef.current) return;
    isFetchingMoreRef.current = true;

    try {
      const activeFocal = currentTrack || tracks[tracks.length - 1];
      if (!activeFocal) return;

      const existingIds = new Set(tracks.map((t) => t.videoId).filter(Boolean) as string[]);
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
          const updated = toAdd.length > 0 ? [...prev, ...toAdd] : prev;
          if (useAudioStore.getState().currentContextName === 'Dashboard' && toAdd.length > 0) {
            useAudioStore.setState({ queue: updated, currentQueue: updated });
          }
          return updated;
        });
      }
    } catch (e) {
      console.warn('[useHomeRadioQueue] Infinite radio load more error:', e);
    } finally {
      isFetchingMoreRef.current = false;
    }
  }, [tracks, currentTrack]);

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
    setActiveCarouselTrack((prev) => (prev?.videoId === track.videoId ? prev : track));
  }, []);

  const handleSelectCarouselTrack = useCallback(
    (selected: Track) => {
      handleActiveCardChange(selected);
      const idx = tracks.findIndex((t) => t.videoId === selected.videoId);
      const resolvedIdx = idx !== -1 ? idx : 0;
      recordUserSignal(selected, 'play');
      musicDnaService.recordListeningSignal(selected, 'play');
      playTrack(selected, tracks, resolvedIdx, 'Dashboard');
    },
    [tracks, handleActiveCardChange, playTrack]
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
