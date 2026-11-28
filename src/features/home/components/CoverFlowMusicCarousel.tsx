import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import {
  useSharedValue,
  withSpring,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';

import { useAudioStore } from '../../../store/useAudioStore';
import type { CoverFlowMusicCarouselProps } from '../types/home.types';
import { wrapCircularIndex } from '../utils/homeTrackUtils';
import { getUniversalStudioArtworkSource } from '../../../utils/artworkHelper';
import {
  LiquidGlassDiscCard,
  HERO_CARD_HEIGHT,
  HERO_CARD_SPACING,
} from './LiquidGlassDiscCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Fast, crisp Apple spring (high stiffness, light mass -> zero sluggish tail)
const CAROUSEL_SPRING = {
  damping: 28,
  stiffness: 360,
  mass: 0.55,
};

// 5-slot persistent pool (Left-2, Left-1, Center, Right+1, Right+2) minimizes GPU draw cost
const SLOT_OFFSETS = [-2, -1, 0, 1, 2];
const SLOT_POOL_SIZE = SLOT_OFFSETS.length;
const DRAG_UNIT_PX = Math.round(HERO_CARD_SPACING * 0.85);
// Trigger background prefetch 8 cards before the end so forward discovery never runs dry or loops
const PREFETCH_AHEAD_THRESHOLD = 8;

const clampIndex = (idx: number, length: number): number => {
  'worklet';
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, idx));
};

/**
 * 120fps Apple Liquid Glass timeline-radio cover-flow carousel.
 * - Bounded-left history: swipe left anytime to revisit previously heard cards.
 * - Infinite-right discovery: proactively prefetches new smart recommendations 8 cards ahead,
 *   never looping back to index 0 when reaching the end.
 */
export const CoverFlowMusicCarousel: React.FC<CoverFlowMusicCarouselProps> = React.memo(({
  tracks,
  onTrackSelect,
  onActiveCardChange,
  onLoadMore,
}) => {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const playTrack = useAudioStore((s) => s.playTrack);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);

  const numTracks = tracks.length;

  const initialIndex = useMemo(() => {
    if (!currentTrack?.videoId || numTracks === 0) return 0;
    const found = tracks.findIndex((t) => t.videoId === currentTrack.videoId);
    return found !== -1 ? found : 0;
  }, []);

  const virtualIndex = useSharedValue(initialIndex);
  const dragStartVirtual = useSharedValue(initialIndex);
  const didSettleInEnd = useSharedValue(false);
  const [settledIndex, setSettledIndex] = useState(initialIndex);

  const settledIndexRef = useRef(initialIndex);
  const lastSelfSelectedIdRef = useRef<string | null>(null);

  const handleSettle = useCallback(
    (targetVirtualInt: number) => {
      if (numTracks === 0) return;
      const clampedIdx = Math.max(0, Math.min(numTracks - 1, targetVirtualInt));

      settledIndexRef.current = clampedIdx;
      setSettledIndex(clampedIdx);

      const targetTrack = tracks[clampedIdx];
      if (!targetTrack) return;

      lastSelfSelectedIdRef.current = targetTrack.videoId || null;

      // Proactive lookahead prefetch so forward swipes always have fresh smart cards ready
      if (numTracks > 1 && clampedIdx >= numTracks - PREFETCH_AHEAD_THRESHOLD && onLoadMore) {
        onLoadMore();
      }

      // Pre-warm artwork for the next 3 cards ahead so rapid swipes never flash empty covers
      for (let ahead = 1; ahead <= 3; ahead++) {
        const nextTrack = tracks[clampedIdx + ahead];
        if (nextTrack?.thumbnail) {
          const sources = getUniversalStudioArtworkSource(
            nextTrack.thumbnail,
            nextTrack.title,
            nextTrack.artist,
            nextTrack.videoId
          );
          const firstUrl = typeof sources?.[0] === 'string' ? sources[0] : (sources?.[0] as any)?.uri;
          if (firstUrl) {
            Image.prefetch(firstUrl).catch(() => {});
          }
        }
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Direct Home Tab rule: any card landing in center plays immediately without delay
      onActiveCardChange?.(targetTrack);
      const latestState = useAudioStore.getState();
      const isAlreadyPlayingThis =
        latestState.currentTrack?.videoId === targetTrack.videoId &&
        latestState.isPlaying;
      if (!isAlreadyPlayingThis) {
        onTrackSelect?.(targetTrack);
      }
    },
    [numTracks, tracks, onTrackSelect, onActiveCardChange, onLoadMore]
  );

  const handleSettleRef = useRef(handleSettle);
  handleSettleRef.current = handleSettle;

  const onSettleFromWorklet = useCallback((targetInt: number) => {
    handleSettleRef.current(targetInt);
  }, []);

  // Ensure initial prefetch if queue starts short
  useEffect(() => {
    if (numTracks > 0 && settledIndexRef.current >= numTracks - PREFETCH_AHEAD_THRESHOLD && onLoadMore) {
      onLoadMore();
    }
  }, [numTracks, onLoadMore]);

  // Sync smoothly to exact history/queue index when track changes externally (MusicTab / MiniPlayer / Next)
  useEffect(() => {
    if (!currentTrack?.videoId || numTracks === 0) return;
    if (lastSelfSelectedIdRef.current === currentTrack.videoId) {
      lastSelfSelectedIdRef.current = null;
      return;
    }
    const found = tracks.findIndex((t) => t.videoId === currentTrack.videoId);
    if (found !== -1 && found !== settledIndexRef.current) {
      settledIndexRef.current = found;
      setSettledIndex(found);
      virtualIndex.value = withSpring(found, CAROUSEL_SPRING);
    }
  }, [currentTrack?.videoId, numTracks, tracks, virtualIndex]);

  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-6, 6])
      .failOffsetY([-24, 24])
      .onBegin(() => {
        'worklet';
        didSettleInEnd.value = false;
        cancelAnimation(virtualIndex);
        dragStartVirtual.value = virtualIndex.value;
      })
      .onUpdate((e) => {
        'worklet';
        if (numTracks <= 1) return;
        const raw = dragStartVirtual.value - e.translationX / DRAG_UNIT_PX;
        const maxIdx = numTracks - 1;
        // Soft Apple rubber-band resistance at index 0 (start of history) and current buffer tip
        if (raw < 0) {
          virtualIndex.value = raw * 0.28;
        } else if (raw > maxIdx) {
          virtualIndex.value = maxIdx + (raw - maxIdx) * 0.28;
        } else {
          virtualIndex.value = raw;
        }
      })
      .onEnd((e) => {
        'worklet';
        didSettleInEnd.value = true;
        if (numTracks <= 1) {
          virtualIndex.value = withSpring(0, CAROUSEL_SPRING);
          return;
        }

        const startInt = clampIndex(Math.round(dragStartVirtual.value), numTracks);
        const rawProjected = virtualIndex.value - (e.velocityX / DRAG_UNIT_PX) * 0.12;
        const delta = Math.max(-2, Math.min(2, Math.round(rawProjected - startInt)));
        let targetInt = clampIndex(startInt + delta, numTracks);

        if (targetInt === startInt) {
          if (e.translationX < -18 || e.velocityX < -150) {
            targetInt = clampIndex(startInt + 1, numTracks);
          } else if (e.translationX > 18 || e.velocityX > 150) {
            targetInt = clampIndex(startInt - 1, numTracks);
          }
        }

        virtualIndex.value = withSpring(targetInt, {
          ...CAROUSEL_SPRING,
          velocity: -e.velocityX / DRAG_UNIT_PX,
        });
        runOnJS(onSettleFromWorklet)(targetInt);
      })
      .onFinalize(() => {
        'worklet';
        // Recover cleanly if iOS ScrollView or a system gesture interrupted Pan before onEnd
        if (!didSettleInEnd.value && numTracks > 0) {
          const fallbackInt = clampIndex(Math.round(virtualIndex.value), numTracks);
          virtualIndex.value = withSpring(fallbackInt, CAROUSEL_SPRING);
          runOnJS(onSettleFromWorklet)(fallbackInt);
        }
      });
  }, [numTracks, onSettleFromWorklet, virtualIndex, dragStartVirtual, didSettleInEnd]);

  const handleCardTap = useCallback(
    (targetVirtualPos: number) => {
      if (numTracks === 0) return;
      const clampedIdx = Math.max(0, Math.min(numTracks - 1, targetVirtualPos));
      const currentCameraInt = Math.round(virtualIndex.value);
      const isCenter = currentCameraInt === clampedIdx;
      const tappedTrack = tracks[clampedIdx];
      if (!tappedTrack) return;

      if (isCenter) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (currentTrack?.videoId !== tappedTrack.videoId) {
          playTrack(tappedTrack, tracks, clampedIdx, 'Dashboard');
        } else if (!useAudioStore.getState().isPlaying) {
          playTrack(tappedTrack, tracks, clampedIdx, 'Dashboard');
        }
        setPlayerModalVisible(true);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        virtualIndex.value = withSpring(clampedIdx, CAROUSEL_SPRING);
        handleSettle(clampedIdx);
      }
    },
    [currentTrack?.videoId, handleSettle, numTracks, playTrack, setPlayerModalVisible, tracks, virtualIndex]
  );

  // Persistent 5-slot pool along the timeline (never wraps past 0 or past numTracks-1)
  const pooledCards = useMemo(() => {
    if (numTracks === 0) return [];
    if (numTracks === 1) {
      return [{
        poolKey: 'slot-pool-0',
        cardVirtualPos: 0,
        track: tracks[0],
        isCenter: true,
      }];
    }

    const items = SLOT_OFFSETS.map((offset) => {
      const cardVirtualPos = settledIndex + offset;
      if (cardVirtualPos < 0 || cardVirtualPos >= numTracks) return null;
      const poolIdx = wrapCircularIndex(cardVirtualPos, SLOT_POOL_SIZE);
      return {
        poolKey: `slot-pool-${poolIdx}`,
        cardVirtualPos,
        track: tracks[cardVirtualPos],
        isCenter: offset === 0,
      };
    }).filter((item): item is NonNullable<typeof item> => Boolean(item && item.track));

    items.sort((a, b) => a.poolKey.localeCompare(b.poolKey));
    return items;
  }, [numTracks, settledIndex, tracks]);

  if (numTracks === 0) return null;

  return (
    <View style={styles.rootWrapper}>
      <GestureDetector gesture={panGesture}>
        <View style={styles.carouselContainer}>
          {pooledCards.map((item) => (
            <LiquidGlassDiscCard
              key={item.poolKey}
              track={item.track}
              cardVirtualPos={item.cardVirtualPos}
              virtualIndex={virtualIndex}
              isCenter={item.isCenter}
              isPlayingThisTrack={false}
              onPress={handleCardTap}
            />
          ))}
        </View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  rootWrapper: {
    width: '100%',
    alignItems: 'center',
    position: 'relative',
    marginTop: 8,
    marginBottom: 8,
  },
  carouselContainer: {
    width: SCREEN_WIDTH,
    height: HERO_CARD_HEIGHT + 34,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'visible',
    zIndex: 2,
  },
});

export default CoverFlowMusicCarousel;
