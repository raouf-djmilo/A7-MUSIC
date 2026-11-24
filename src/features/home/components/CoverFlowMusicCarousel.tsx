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

import { useAudioStore } from '../../../store/useAudioStore';
import type { CoverFlowMusicCarouselProps } from '../types/home.types';
import { wrapCircularIndex, shortestCircularDelta } from '../utils/homeTrackUtils';
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
const PLAY_SETTLE_DEBOUNCE_MS = 190;

/**
 * 120fps Apple Liquid Glass circular cover-flow carousel.
 * - Persistent 5-slot pool guarantees zero mount/unmount frame drops.
 * - Free 1:1 finger tracking with light responsive spring physics.
 * - Defers ambient/audio work until settle so animations never drop frames.
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
  const [settledIndex, setSettledIndex] = useState(initialIndex);

  const settledIndexRef = useRef(initialIndex);
  const isSelfTriggeredRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
    };
  }, []);

  const handleSettle = useCallback(
    (targetVirtualInt: number, immediatePlay = false) => {
      if (numTracks === 0) return;
      const normalizedTarget = numTracks === 1 ? 0 : targetVirtualInt;
      const wrappedArrayIdx = wrapCircularIndex(normalizedTarget, numTracks);

      settledIndexRef.current = normalizedTarget;
      setSettledIndex(normalizedTarget);

      const targetTrack = tracks[wrappedArrayIdx];
      if (!targetTrack) return;

      isSelfTriggeredRef.current = true;

      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }

      const dispatchEffects = () => {
        onActiveCardChange?.(targetTrack);
        const latestState = useAudioStore.getState();
        if (!(latestState.currentTrack?.videoId === targetTrack.videoId && latestState.isPlaying)) {
          onTrackSelect?.(targetTrack);
        }
        if (numTracks > 1 && wrappedArrayIdx >= numTracks - 4 && onLoadMore) {
          onLoadMore();
        }
      };

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (immediatePlay) {
        dispatchEffects();
      } else {
        // Defer ambient canvas & audio fetch briefly so spring animation finishes at locked 60/120fps
        settleTimerRef.current = setTimeout(dispatchEffects, PLAY_SETTLE_DEBOUNCE_MS);
      }
    },
    [numTracks, tracks, onTrackSelect, onActiveCardChange, onLoadMore]
  );

  const handleSettleRef = useRef(handleSettle);
  handleSettleRef.current = handleSettle;

  const onSettleFromWorklet = useCallback((targetInt: number) => {
    handleSettleRef.current(targetInt, false);
  }, []);

  // Sync smoothly via shortest circular path when track changes externally (MusicTab / MiniPlayer)
  useEffect(() => {
    if (isSelfTriggeredRef.current) {
      isSelfTriggeredRef.current = false;
      return;
    }
    if (currentTrack?.videoId && numTracks > 0) {
      const found = tracks.findIndex((t) => t.videoId === currentTrack.videoId);
      const currentWrapped = wrapCircularIndex(settledIndexRef.current, numTracks);
      if (found !== -1 && found !== currentWrapped) {
        const delta = shortestCircularDelta(settledIndexRef.current, found, numTracks);
        const nextVirtual = settledIndexRef.current + delta;
        settledIndexRef.current = nextVirtual;
        setSettledIndex(nextVirtual);
        virtualIndex.value = withSpring(nextVirtual, CAROUSEL_SPRING);
      }
    }
  }, [currentTrack?.videoId, numTracks, tracks, virtualIndex]);

  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-5, 5])
      .onBegin(() => {
        'worklet';
        cancelAnimation(virtualIndex);
        dragStartVirtual.value = virtualIndex.value;
      })
      .onUpdate((e) => {
        'worklet';
        if (numTracks <= 1) return;
        virtualIndex.value = dragStartVirtual.value - e.translationX / DRAG_UNIT_PX;
      })
      .onEnd((e) => {
        'worklet';
        if (numTracks <= 1) {
          virtualIndex.value = withSpring(0, CAROUSEL_SPRING);
          return;
        }

        const startInt = Math.round(dragStartVirtual.value);
        const rawProjected = virtualIndex.value - (e.velocityX / DRAG_UNIT_PX) * 0.12;
        const delta = Math.max(-2, Math.min(2, Math.round(rawProjected - startInt)));
        let targetInt = startInt + delta;

        if (targetInt === startInt) {
          if (e.translationX < -18 || e.velocityX < -150) {
            targetInt = startInt + 1;
          } else if (e.translationX > 18 || e.velocityX > 150) {
            targetInt = startInt - 1;
          }
        }

        virtualIndex.value = withSpring(targetInt, {
          ...CAROUSEL_SPRING,
          velocity: -e.velocityX / DRAG_UNIT_PX,
        });
        runOnJS(onSettleFromWorklet)(targetInt);
      });
  }, [numTracks, onSettleFromWorklet, virtualIndex, dragStartVirtual]);

  const handleCardTap = useCallback(
    (targetVirtualPos: number) => {
      if (numTracks === 0) return;
      const currentCameraInt = Math.round(virtualIndex.value);
      const isCenter = currentCameraInt === targetVirtualPos;
      const wrappedArrayIdx = wrapCircularIndex(targetVirtualPos, numTracks);
      const tappedTrack = tracks[wrappedArrayIdx];
      if (!tappedTrack) return;

      if (isCenter) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (currentTrack?.videoId !== tappedTrack.videoId) {
          playTrack(tappedTrack, tracks, wrappedArrayIdx, 'Dashboard');
        } else if (!useAudioStore.getState().isPlaying) {
          useAudioStore.getState().resumeTrack();
        }
        setPlayerModalVisible(true);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        virtualIndex.value = withSpring(targetVirtualPos, CAROUSEL_SPRING);
        handleSettle(targetVirtualPos, true);
      }
    },
    [currentTrack?.videoId, handleSettle, numTracks, playTrack, setPlayerModalVisible, tracks, virtualIndex]
  );

  // Stable callback map per slot virtual pos avoids breaking React.memo on re-render
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
      const poolIdx = wrapCircularIndex(cardVirtualPos, SLOT_POOL_SIZE);
      const arrayIdx = wrapCircularIndex(cardVirtualPos, numTracks);
      return {
        poolKey: `slot-pool-${poolIdx}`,
        cardVirtualPos,
        track: tracks[arrayIdx],
        isCenter: offset === 0,
      };
    }).filter((item) => Boolean(item.track));

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
