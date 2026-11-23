// src/features/player/components/AppleTimelineScrubber.tsx

import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  interpolateColor,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAudioStore } from '../../../store/useAudioStore';
import { useFreeTimelineScrubber } from '../hooks/useFreeTimelineScrubber';

export interface AppleTimelineScrubberProps {
  onSeekCommit?: (targetMillis: number) => void;
  isDark?: boolean;
  themeMuted?: string;
  onScrubbingStateChange?: (isScrubbing: boolean) => void;
}

/** 
 * مواصفات التصميم الأصلي لزجاج كبسولة أبل (Apple Dynamic Expanding Scrubber)
 * وضع السكون: كبسولة نحيفة (7pt) شبه شفافة
 * وضع اللمس/السحب: تتمدد رأسياً إلى (15pt) ويشتعل لون التعبئة للأبيض الناصع
 */
const BAR_IDLE_HEIGHT = 7;
const BAR_ACTIVE_HEIGHT = 15;

const SPRING_CONFIG = {
  stiffness: 420,
  damping: 28,
  mass: 0.75,
};

function formatTime(millis: number): string {
  if (!millis || isNaN(millis) || millis < 0) return '0:00';
  const totalSeconds = Math.max(0, Math.floor(millis / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const AppleTimelineScrubber: React.FC<AppleTimelineScrubberProps> = React.memo(({
  onSeekCommit,
  isDark = true,
  themeMuted,
  onScrubbingStateChange,
}) => {
  // اشتراك ذاتي معزول في متجر الصوت لمنع إعادة رسم شاشة المشغل بالكامل
  const storePosition = useAudioStore((s) => s.positionMillis);
  const storeDuration = useAudioStore((s) => s.durationMillis);
  const trackDuration = useAudioStore((s) => s.currentTrack?.duration || 180000);
  const seekTo = useAudioStore((s) => s.seekTo);

  const totalDuration = storeDuration > 0 ? storeDuration : trackDuration;
  const safeDuration = Math.max(totalDuration, 1);

  const handleSeekCommit = useCallback((targetMs: number) => {
    if (onSeekCommit) {
      onSeekCommit(targetMs);
    } else {
      seekTo(targetMs);
    }
  }, [onSeekCommit, seekTo]);

  const {
    displayTime,
    progressRatio,
    handleScrubStart,
    handleScrubChange,
    handleScrubComplete,
  } = useFreeTimelineScrubber({
    currentTime: storePosition,
    duration: safeDuration,
    onSeekCommit: handleSeekCommit,
    seekLockMs: 400,
  });

  // قيم متحركة على الـ UI Thread بسرعة 120 FPS
  const trackWidth = useSharedValue(0);
  const visualRatio = useSharedValue(progressRatio);
  const dragProgress = useSharedValue(0); // 0 = idle, 1 = active expanding
  const isDraggingInternal = useSharedValue(0);

  const [liveTimeMillis, setLiveTimeMillis] = useState(displayTime);

  // مزامنة التايملاين مع حركة الأغنية في حالة عدم لمس المستخدم للشاشة
  useEffect(() => {
    if (isDraggingInternal.value === 0) {
      visualRatio.value = progressRatio;
      setLiveTimeMillis(displayTime);
    }
  }, [progressRatio, displayTime]);

  const handleLayout = (e: LayoutChangeEvent) => {
    trackWidth.value = e.nativeEvent.layout.width;
  };

  const triggerLightHaptic = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }, []);

  const notifyScrubStart = useCallback(
    (ratio: number) => {
      triggerLightHaptic();
      const targetMs = ratio * safeDuration;
      setLiveTimeMillis(targetMs);
      handleScrubStart(targetMs);
      onScrubbingStateChange?.(true);
    },
    [safeDuration, handleScrubStart, onScrubbingStateChange, triggerLightHaptic]
  );

  const notifyScrubMove = useCallback(
    (ratio: number) => {
      const targetMs = ratio * safeDuration;
      setLiveTimeMillis(targetMs);
      handleScrubChange(targetMs);
    },
    [safeDuration, handleScrubChange]
  );

  const notifyScrubEnd = useCallback(
    (ratio: number) => {
      const targetMs = ratio * safeDuration;
      setLiveTimeMillis(targetMs);
      handleScrubComplete(targetMs);
      onScrubbingStateChange?.(false);
    },
    [safeDuration, handleScrubComplete, onScrubbingStateChange]
  );

  const ensureScrubFinished = useCallback(() => {
    onScrubbingStateChange?.(false);
  }, [onScrubbingStateChange]);

  // إيماءة اللمس والسحب الفوري (Apple Tap & Hold Drag)
  const scrubGesture = Gesture.Pan()
    .minDistance(0)
    .hitSlop({ top: 22, bottom: 22, left: 10, right: 10 })
    .onBegin((event) => {
      if (trackWidth.value <= 0) return;
      isDraggingInternal.value = 1;
      dragProgress.value = withSpring(1, SPRING_CONFIG);
      const ratio = Math.max(0, Math.min(1, event.x / trackWidth.value));
      visualRatio.value = ratio;
      runOnJS(notifyScrubStart)(ratio);
    })
    .onUpdate((event) => {
      if (trackWidth.value <= 0) return;
      const ratio = Math.max(0, Math.min(1, event.x / trackWidth.value));
      visualRatio.value = ratio;
      runOnJS(notifyScrubMove)(ratio);
    })
    .onEnd((event) => {
      if (trackWidth.value <= 0) return;
      const ratio = Math.max(0, Math.min(1, event.x / trackWidth.value));
      visualRatio.value = ratio;
      runOnJS(notifyScrubEnd)(ratio);
    })
    .onFinalize(() => {
      isDraggingInternal.value = 0;
      dragProgress.value = withSpring(0, SPRING_CONFIG);
      runOnJS(ensureScrubFinished)();
    });

  // أنيميشن تمدد المسار الخلفي (Idle 7pt -> Active 15pt)
  const animatedTrackStyle = useAnimatedStyle(() => {
    const height = interpolate(dragProgress.value, [0, 1], [BAR_IDLE_HEIGHT, BAR_ACTIVE_HEIGHT]);
    const backgroundColor = interpolateColor(
      dragProgress.value,
      [0, 1],
      isDark
        ? ['rgba(255, 255, 255, 0.18)', 'rgba(255, 255, 255, 0.28)']
        : ['rgba(0, 0, 0, 0.10)', 'rgba(0, 0, 0, 0.18)']
    );

    return {
      height,
      borderRadius: height / 2,
      backgroundColor,
    };
  });

  // أنيميشن كبسولة التقدم الممتلئة (تصبح ناصعة 100% عند اللمس)
  const animatedFillStyle = useAnimatedStyle(() => {
    const height = interpolate(dragProgress.value, [0, 1], [BAR_IDLE_HEIGHT, BAR_ACTIVE_HEIGHT]);
    const backgroundColor = interpolateColor(
      dragProgress.value,
      [0, 1],
      isDark
        ? ['rgba(255, 255, 255, 0.52)', '#FFFFFF']
        : ['rgba(0, 0, 0, 0.45)', '#000000']
    );

    return {
      width: `${visualRatio.value * 100}%`,
      borderRadius: height / 2,
      backgroundColor,
    };
  });

  // أنيميشن إضاءة أرقام الوقت بالتزامن مع تمدد الكبسولة
  const animatedTimeTextStyle = useAnimatedStyle(() => {
    const color = interpolateColor(
      dragProgress.value,
      [0, 1],
      isDark
        ? ['rgba(255, 255, 255, 0.65)', '#FFFFFF']
        : ['rgba(0, 0, 0, 0.65)', '#000000']
    );

    return { color };
  });

  const remainingMillis = Math.max(0, safeDuration - liveTimeMillis);

  return (
    <View style={styles.container}>
      {/* 1. عدّاد الوقت المنقضي (أقصى اليسار) */}
      <Animated.Text
        style={[styles.timeText, styles.timeTextLeft, animatedTimeTextStyle]}
        numberOfLines={1}
      >
        {formatTime(liveTimeMillis)}
      </Animated.Text>

      {/* 2. شريط كبسولة أبل المتمددة بالكامل بدون مقبض (Thumb-less Expanding Pill) */}
      <GestureDetector gesture={scrubGesture}>
        <View style={styles.touchArea} onLayout={handleLayout}>
          <Animated.View style={[styles.capsuleTrack, animatedTrackStyle]}>
            <Animated.View style={[styles.capsuleFill, animatedFillStyle]} />
          </Animated.View>
        </View>
      </GestureDetector>

      {/* 3. عدّاد الوقت المتبقي بالسالب (أقصى اليمين - نمط Apple Music الأصلي) */}
      <Animated.Text
        style={[styles.timeText, styles.timeTextRight, animatedTimeTextStyle]}
        numberOfLines={1}
      >
        {`-${formatTime(remainingMillis)}`}
      </Animated.Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
    marginTop: 2,
    marginBottom: 4,
  },
  touchArea: {
    flex: 1,
    height: 40, // مساحة لمس مريحة جداً للإصبع لسهولة السحب
    justifyContent: 'center',
    marginHorizontal: 10,
  },
  capsuleTrack: {
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  capsuleFill: {
    height: '100%',
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  timeTextLeft: {
    width: 44,
    textAlign: 'left',
  },
  timeTextRight: {
    width: 48,
    textAlign: 'right',
  },
});

export default AppleTimelineScrubber;
