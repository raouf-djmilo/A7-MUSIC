// src/features/player/hooks/useFullscreenHudLogic.ts

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import * as ScreenOrientation from 'expo-screen-orientation';

export interface UseFullscreenHudLogicProps {
  visible: boolean;
  isPlaying?: boolean;
  isScrubbing?: boolean;
  autoHideMs?: number;
}

/**
 * 🎬 Bulletproof Fullscreen HUD State Machine Hook — Pure Event-Driven Edition
 *
 * 1. Unconditional 3s Auto-Hide (3000ms):
 *    - Starts immediately upon entering fullscreen or manual reveal.
 *    - Runs whether the video is playing or paused!
 *    - Freezes ONLY when user's finger is actively scrubbing the timeline (isScrubbing).
 *    - Restarts clean 3000ms countdown immediately upon finger release.
 *
 * 2. True Tap-to-Toggle (YouTube-Style):
 *    - If HUD is visible: tap empty space -> hides immediately + cancels timer.
 *    - If HUD is hidden: tap empty space -> reveals immediately + starts 3000ms timer.
 *
 * 3. Zero Render-Loop Resets:
 *    - Timers are managed exclusively via explicit event calls and stable refs.
 *    - No useEffect re-runs from state changes or re-renders!
 *
 * 4. Strict Orientation Isolation:
 *    - ScreenOrientation lock/unlock is bound exclusively to [visible].
 */
export function useFullscreenHudLogic({
  visible,
  isPlaying,
  isScrubbing = false,
  autoHideMs = 3000,
}: UseFullscreenHudLogicProps) {
  const [hudVisible, setHudVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 60/120 FPS Reanimated UI values
  const hudOpacity = useSharedValue(1);
  const closeOpacity = useSharedValue(1);

  // Refs to avoid recreating functions and prevent render loops
  const hudVisibleRef = useRef(true);
  hudVisibleRef.current = hudVisible;

  const isScrubbingRef = useRef(isScrubbing);
  isScrubbingRef.current = isScrubbing;

  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // 🛡️ Cancel active memory timer
  const clearTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  // 🎥 Asymmetric Hide (300ms) - Close button dims to 0.40
  const hideHud = useCallback(() => {
    clearTimer();
    setHudVisible(false);
    hudVisibleRef.current = false;
    hudOpacity.value = withTiming(0, { duration: 300 });
    closeOpacity.value = withTiming(0.40, { duration: 300 });
  }, [clearTimer, hudOpacity, closeOpacity]);

  // ⚡ Asymmetric Show (150ms) - Close button lights to 1.0
  const showHud = useCallback(() => {
    setHudVisible(true);
    hudVisibleRef.current = true;
    hudOpacity.value = withTiming(1, { duration: 150 });
    closeOpacity.value = withTiming(1, { duration: 150 });
  }, [hudOpacity, closeOpacity]);

  // ⏱️ Unconditional 3000ms Auto-Hide Timer (Pure Event-Driven)
  const startAutoTimer = useCallback(
    (durationMs: number = 3000) => {
      clearTimer();
      if (!visibleRef.current) return;
      if (isScrubbingRef.current) return; // Freeze while finger is on scrubber

      hideTimerRef.current = setTimeout(() => {
        if (isScrubbingRef.current) return;
        hideHud();
      }, durationMs);
    },
    [clearTimer, hideHud]
  );

  // 🔄 Explicit Reset Timer: Call on button press, rotate, or scrubber release
  const resetTimer = useCallback(
    (durationMs: number = 3000) => {
      if (!visibleRef.current) return;
      if (!hudVisibleRef.current) {
        showHud();
      }
      startAutoTimer(durationMs);
    },
    [showHud, startAutoTimer]
  );

  // 👆 True Tap-to-Toggle (YouTube-Style)
  const toggleHud = useCallback(() => {
    if (hudVisibleRef.current) {
      hideHud();
    } else {
      showHud();
      startAutoTimer(autoHideMs);
    }
  }, [hideHud, showHud, startAutoTimer, autoHideMs]);

  // Stable refs for orientation listener
  const showHudRef = useRef(showHud);
  showHudRef.current = showHud;
  const startAutoTimerRef = useRef(startAutoTimer);
  startAutoTimerRef.current = startAutoTimer;

  // 1. Fullscreen Lifecycle: Runs ONLY on visible change (Entering / Exiting Fullscreen)
  useEffect(() => {
    if (!visible) {
      clearTimer();
      return;
    }
    showHudRef.current();
    startAutoTimerRef.current(autoHideMs);

    return () => {
      clearTimer();
    };
  }, [visible, clearTimer, autoHideMs]); // Strictly [visible, clearTimer, autoHideMs]

  // 2. Strict Orientation Isolation: Bound ONLY to [visible]
  useEffect(() => {
    if (!visible) return;

    ScreenOrientation.unlockAsync().catch(() => {});

    const subscription = ScreenOrientation.addOrientationChangeListener(() => {
      showHudRef.current();
      startAutoTimerRef.current(3000);
    });

    return () => {
      ScreenOrientation.removeOrientationChangeListener(subscription);
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [visible]);

  // 3. Scrubbing Transition:
  // While scrubbing -> freeze timer, keep HUD visible
  // When released -> start 3000ms countdown immediately!
  const prevScrubbingRef = useRef(isScrubbing);
  useEffect(() => {
    if (!visible) return;

    if (isScrubbing) {
      clearTimer();
      if (!hudVisibleRef.current) {
        showHudRef.current();
      }
    } else if (prevScrubbingRef.current && !isScrubbing) {
      startAutoTimerRef.current(autoHideMs);
    }
    prevScrubbingRef.current = isScrubbing;
  }, [visible, isScrubbing, clearTimer, autoHideMs]);

  return {
    hudVisible,
    hudOpacity,
    closeOpacity,
    showHud,
    hideHud,
    toggleHud,
    resetTimer,
  };
}

export default useFullscreenHudLogic;
