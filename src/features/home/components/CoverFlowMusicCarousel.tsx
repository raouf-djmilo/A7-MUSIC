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

// Critically damped Apple spring for buttery settle without harsh bounce or jitter
const CAROUSEL_SPRING = {
  damping: 26,
  stiffness: 220,
  mass: 0.7,
};

const SLOT_OFFSETS = [-3, -2, -1, 0, 1, 2, 3];
const SLOT_POOL_SIZE = SLOT_OFFSETS.length;
const PLAY_SETTLE_DEBOUNCE_MS = 180;

/**
 * 3D Apple Liquid Glass circular cover-flow disc carousel.
 * - Uses a persistent 7-slot view pool so native BlurViews never unmount/drop during fast swipes.
 * - Allows free 1:1 finger dragging with smooth velocity projection across cards.
 * - Debounces playback triggers during rapid consecutive flicks to eliminate JS bridge freezes.
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
  const playDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (playDebounceTimerRef.current) {
        clearTimeout(playDebounceTimerRef.current);
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
      onActiveCardChange?.(targetTrack);

      if (playDebounceTimerRef.current) {
        clearTimeout(playDebounceTimerRef.current);
        playDebounceTimerRef.current = null;
      }

      const triggerPlay = () => {
        const latestState = useAudioStore.getState();
        if (latestState.currentTrack?.videoId === targetTrack.videoId && latestState.isPlaying) {
          return;
        }
        onTrackSelect?.(targetTrack);
        if (numTracks > 1 && wrappedArrayIdx >= numTracks - 4 && onLoadMore) {
          onLoadMore();
        }
      };

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (immediatePlay) {
        triggerPlay();
      } else {
        // Wait briefly for rapid consecutive swipes to stop before dispatching native audio fetch
        playDebounceTimerRef.current = setTimeout(triggerPlay, PLAY_SETTLE_DEBOUNCE_MS);
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
        virtualIndex.value = dragStartVirtual.value - e.translationX / HERO_CARD_SPACING;
      })
      .onEnd((e) => {
        'worklet';
        if (numTracks <= 1) {
          virtualIndex.value = withSpring(0, CAROUSEL_SPRING);
          return;
        }

        const startInt = Math.round(dragStartVirtual.value);
        // Smooth free velocity projection capped to at most 3 cards per flick
        const rawProjected = virtualIndex.value - (e.velocityX / HERO_CARD_SPACING) * 0.14;
        const delta = Math.max(-3, Math.min(3, Math.round(rawProjected - startInt)));
        let targetInt = startInt + delta;

        // Ensure quick gentle flicks still advance reliably by 1 card
        if (targetInt === startInt) {
          if (e.translationX < -20 || e.velocityX < -160) {
            targetInt = startInt + 1;
          } else if (e.translationX > 20 || e.velocityX > 160) {
            targetInt = startInt - 1;
          }
        }

        virtualIndex.value = withSpring(targetInt, {
          ...CAROUSEL_SPRING,
          velocity: -e.velocityX / HERO_CARD_SPACING,
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

  // Persistent slot descriptors sorted by pool slot ID so React NEVER unmounts/remounts BlurViews on swipe
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

    // Keep consistent React child order by poolKey so native views stay mounted across swipes
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
              onPress={() => handleCardTap(item.cardVirtualPos)}
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
