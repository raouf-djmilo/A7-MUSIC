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

const CAROUSEL_SPRING = {
  damping: 26,
  stiffness: 280,
  mass: 0.45,
};

/**
 * 3D Apple Liquid Glass circular cover-flow disc carousel.
 * Supports unlimited seamless swiping in both directions and direct tap-to-center playback.
 */
export const CoverFlowMusicCarousel: React.FC<CoverFlowMusicCarouselProps> = React.memo(({
  tracks,
  onTrackSelect,
  onActiveCardChange,
  onLoadMore,
}) => {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const playTrack = useAudioStore((s) => s.playTrack);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);

  const numTracks = tracks.length;

  const initialIndex = useMemo(() => {
    if (!currentTrack?.videoId || numTracks === 0) return 0;
    const found = tracks.findIndex((t) => t.videoId === currentTrack.videoId);
    return found !== -1 ? found : 0;
  }, []);

  // Unbounded continuous virtual index enabling infinite circular swiping in either direction
  const virtualIndex = useSharedValue(initialIndex);
  const dragStartVirtual = useSharedValue(initialIndex);
  const [settledIndex, setSettledIndex] = useState(initialIndex);

  const settledIndexRef = useRef(initialIndex);
  const isSelfTriggeredRef = useRef(false);

  const handleSettle = useCallback(
    (targetVirtualInt: number) => {
      if (numTracks === 0) return;
      const normalizedTarget = numTracks === 1 ? 0 : targetVirtualInt;
      const wrappedArrayIdx = wrapCircularIndex(normalizedTarget, numTracks);

      settledIndexRef.current = normalizedTarget;
      setSettledIndex(normalizedTarget);

      const targetTrack = tracks[wrappedArrayIdx];
      if (!targetTrack) return;

      isSelfTriggeredRef.current = true;
      onActiveCardChange?.(targetTrack);

      const isSame = currentTrack?.videoId === targetTrack.videoId;
      if (isSame && useAudioStore.getState().isPlaying) {
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onTrackSelect?.(targetTrack);

      // Dynamically expand the circular pool as user explores deeper
      if (numTracks > 1 && wrappedArrayIdx >= numTracks - 4 && onLoadMore) {
        onLoadMore();
      }
    },
    [numTracks, tracks, currentTrack?.videoId, onTrackSelect, onActiveCardChange, onLoadMore]
  );

  const handleSettleRef = useRef(handleSettle);
  handleSettleRef.current = handleSettle;

  const onSettleFromWorklet = useCallback((targetInt: number) => {
    handleSettleRef.current(targetInt);
  }, []);

  // Sync smoothly via shortest circular path when track changes from MusicTab / MiniPlayer / LockScreen
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
        virtualIndex.value = withSpring(nextVirtual, {
          damping: 26,
          stiffness: 280,
          mass: 0.5,
        });
      }
    }
  }, [currentTrack?.videoId, numTracks, tracks, virtualIndex]);

  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-6, 6])
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
        const dragDist = e.translationX;
        const dragVel = e.velocityX;

        let targetInt = startInt;
        if (dragDist < -18 || dragVel < -150) {
          targetInt = startInt + 1;
        } else if (dragDist > 18 || dragVel > 150) {
          targetInt = startInt - 1;
        } else {
          targetInt = Math.round(virtualIndex.value);
        }

        virtualIndex.value = withSpring(targetInt, CAROUSEL_SPRING);
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
        handleSettle(targetVirtualPos);
      }
    },
    [currentTrack?.videoId, handleSettle, numTracks, playTrack, setPlayerModalVisible, tracks, virtualIndex]
  );

  const slots = useMemo(
    () => (numTracks <= 1 ? [0] : [-3, -2, -1, 0, 1, 2, 3]),
    [numTracks]
  );

  if (numTracks === 0) return null;

  return (
    <View style={styles.rootWrapper}>
      <GestureDetector gesture={panGesture}>
        <View style={styles.carouselContainer}>
          {slots.map((offset) => {
            const cardVirtualPos = settledIndex + offset;
            const wrappedArrayIdx = wrapCircularIndex(cardVirtualPos, numTracks);
            const t = tracks[wrappedArrayIdx];
            if (!t) return null;

            const isPlayingThisTrack = isPlaying && currentTrack?.videoId === t.videoId;

            return (
              <LiquidGlassDiscCard
                key={`slot-${cardVirtualPos}`}
                track={t}
                cardVirtualPos={cardVirtualPos}
                virtualIndex={virtualIndex}
                isCenter={offset === 0}
                isPlayingThisTrack={isPlayingThisTrack}
                onPress={() => handleCardTap(cardVirtualPos)}
              />
            );
          })}
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
