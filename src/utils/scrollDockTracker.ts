import { useCallback, useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useAudioStore } from '../store/useAudioStore';

/**
 * Scroll-direction hysteresis & bottom-of-screen lock tracker:
 * - Minimizes dock when scrolling down smoothly on ANY music/artist/album screen.
 * - Locks minimized dock near/at the very end of the page so iOS rubber-band
 *   bounce-back NEVER pops the bar back into two stacked bars.
 * - Restores expanded bar cleanly when actively scrolling back up or near top.
 */
export function useDockScrollTracker() {
  const lastYRef = useRef(0);
  const accumDeltaRef = useRef(0);

  const handleScrollOffset = useCallback(
    (offsetY: number, contentHeight = 0, viewportHeight = 0) => {
      const safeY = Number.isFinite(offsetY) ? Math.max(0, offsetY) : 0;
      const prevY = lastYRef.current;
      const delta = safeY - prevY;
      lastYRef.current = safeY;

      const store = useAudioStore.getState();

      // Always expand right at the top of a page
      if (safeY <= 16) {
        accumDeltaRef.current = 0;
        if (store.isDockMinimized) {
          store.setDockMinimized(false);
        }
        return;
      }

      const hasBounds = contentHeight > 0 && viewportHeight > 0;
      const distanceFromBottom = hasBounds
        ? contentHeight - (safeY + viewportHeight)
        : 9999;

      // Bottom-of-screen lock: keeps [Home] [MiniPlayer] [Search] accessible at page end & absorbs iOS bounce
      if (hasBounds && safeY > 36 && distanceFromBottom <= 52) {
        accumDeltaRef.current = 0;
        if (!store.isDockMinimized) {
          store.setDockMinimized(true);
        }
        return;
      }

      // Reset accumulated delta on direction change
      if ((delta > 0 && accumDeltaRef.current < 0) || (delta < 0 && accumDeltaRef.current > 0)) {
        accumDeltaRef.current = 0;
      }
      accumDeltaRef.current += delta;

      if (safeY > 34 && accumDeltaRef.current >= 14) {
        if (!store.isDockMinimized) {
          store.setDockMinimized(true);
        }
      } else if (accumDeltaRef.current <= -14 && distanceFromBottom > 72) {
        if (store.isDockMinimized) {
          store.setDockMinimized(false);
        }
      }
    },
    []
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const ne = e?.nativeEvent;
      handleScrollOffset(
        ne?.contentOffset?.y ?? 0,
        ne?.contentSize?.height ?? 0,
        ne?.layoutMeasurement?.height ?? 0
      );
    },
    [handleScrollOffset]
  );

  return { onScroll, handleScrollOffset };
}
