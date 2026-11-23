// src/features/player/hooks/useFreeTimelineScrubber.ts

import { useState, useRef, useCallback } from 'react';

interface UseFreeScrubberProps {
  /** الوقت الحالي القادم من محرك الصوت (بالثواني أو بالمللي ثانية) */
  currentTime: number;
  /** المدة الكلية للأغنية (بنفس وحدة currentTime) */
  duration: number;
  /** دالة القفز في محرك الصوت */
  onSeekCommit: (targetValue: number) => void;
  /** مدة القفل بعد الإفلات لمنع ارتداد المؤشر قبل استجابة الصوت (بالملي ثانية) */
  seekLockMs?: number;
}

export function useFreeTimelineScrubber({
  currentTime,
  duration,
  onSeekCommit,
  seekLockMs = 400,
}: UseFreeScrubberProps) {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);

  // نحتفظ بالوقت المتوقع مؤقتاً بعد الإفلات حتى لا يقفز المؤشر للخلف
  const [pendingSeekTime, setPendingSeekTime] = useState<number | null>(null);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeDuration = Math.max(duration, 1);

  // 1. بداية لمس التايملاين: نفصل الواجهة عن تحديثات الصوت فوراً
  const handleScrubStart = useCallback(
    (initialValue?: number) => {
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      setIsScrubbing(true);
      setScrubTime(initialValue ?? currentTime);
    },
    [currentTime]
  );

  // 2. أثناء السحب الحر: تحديث محلي فوري (يعمل في Play و Pause بدون أي Glitch)
  const handleScrubChange = useCallback(
    (nextValue: number) => {
      const clamped = Math.max(0, Math.min(safeDuration, nextValue));
      setScrubTime(clamped);
    },
    [safeDuration]
  );

  // 3. لحظة رفع الإصبع أو النقر المباشر على أي نقطة: نُثبّت الوقت ونرسل أمر القفز
  const handleScrubComplete = useCallback(
    (finalValue: number) => {
      const clamped = Math.max(0, Math.min(safeDuration, finalValue));
      setIsScrubbing(false);
      setPendingSeekTime(clamped);

      // إرسال أمر القفز لمحرك الصوت/الفيديو مرة واحدة فقط
      onSeekCommit(clamped);

      // إبقاء المؤشر ثابتاً على المكان الجديد لمدة 400ms ريثما يستجيب المشغل
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      lockTimerRef.current = setTimeout(() => {
        setPendingSeekTime(null);
      }, seekLockMs);
    },
    [safeDuration, onSeekCommit, seekLockMs]
  );

  // الوقت النهائي الذي يُعرض على الشريط والعدّاد
  const displayTime = isScrubbing
    ? scrubTime
    : pendingSeekTime !== null
    ? pendingSeekTime
    : currentTime;

  const progressRatio = Math.max(0, Math.min(1, displayTime / safeDuration));

  return {
    displayTime,
    progressRatio,
    isScrubbing,
    handleScrubStart,
    handleScrubChange,
    handleScrubComplete,
  };
}

export default useFreeTimelineScrubber;
