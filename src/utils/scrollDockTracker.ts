import { useCallback, useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useAudioStore } from '../store/useAudioStore';

/**
 * Lightweight scroll-direction hysteresis detector for driving the dynamic
 * Apple Music MiniPlayer & Quick Dock minimize/expand behavior without re-renders.
 */
export function useDockScrollTracker() {
  const lastYRef = useRef(0);
  const accumDeltaRef = useRef(0);

  const handleScrollOffset = useCallback((offsetY: number) => {
    const safeY = Number.isFinite(offsetY) ? Math.max(0, offsetY) : 0;
    const prevY = lastYRef.current;
    const delta = safeY - prevY;
    lastYRef.current = safeY;

    const store = useAudioStore.getState();

    // Always restore expanded dock right near top of page
    if (safeY <= 18) {
      accumDeltaRef.current = 0;
      if (store.isDockMinimized) {
        store.setDockMinimized(false);
      }
      return;
    }

    // Reset accumulated travel on direction reversal for crisp Apple feel
    if ((delta > 0 && accumDeltaRef.current < 0) || (delta < 0 && accumDeltaRef.current > 0)) {
      accumDeltaRef.current = 0;
    }
    accumDeltaRef.current += delta;

    if (safeY > 44 && accumDeltaRef.current >= 18) {
      if (!store.isDockMinimized) {
        store.setDockMinimized(true);
      }
    } else if (accumDeltaRef.current <= -14) {
      if (store.isDockMinimized) {
        store.setDockMinimized(false);
      }
    }
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      handleScrollOffset(e?.nativeEvent?.contentOffset?.y ?? 0);
    },
    [handleScrollOffset]
  );

  return { onScroll, handleScrollOffset };
}
