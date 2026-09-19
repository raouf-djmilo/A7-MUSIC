/**
 * 🏃 Athletic Running Core Engine (State Machine, Auto-Lap & Deep Telemetry)
 * 
 * Continuous Telemetry & Full Manual Control Architecture:
 * 1. Finite State Machine (IDLE -> COUNTDOWN -> RECORDING <-> MANUAL_PAUSED -> COMPLETED)
 *    * NO Auto-Pause state: Zero GPS stream interruption, zero haptic flapping.
 * 2. Continuous Dual-Time & Deep Stoppage Tracking:
 *    * elapsedTime: Total session wall-clock time
 *    * movingTime: Increments only when rollingSpeedMs >= 0.5 m/s
 *    * stoppedTime: Increments when rollingSpeedMs < 0.5 m/s (or during manual pause)
 *    * restTimeRatio: (stoppedTime / elapsedTime) * 100
 *    * StoppageEvents: Structured ledger of every rest stop / traffic light / hydration pause
 * 3. Dual Pace Analytics:
 *    * Moving Pace (pure athletic moving speed)
 *    * Overall Session Pace (real race pace taking stops into account)
 * 4. Auto-Lap Split Engine (1.00 km precision splits with haptic & telemetry metrics)
 * 5. ACSM MET Running/Walking Calorie Combustion Formula
 * 6. Cadence (SPM) tracker & target zone evaluator
 * 7. Crash-Proof Recovery Storage (5s snapshots via AsyncStorage)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

export type RunningState =
  | 'IDLE'
  | 'COUNTDOWN'
  | 'RECORDING'
  | 'MANUAL_PAUSED'
  | 'COMPLETED';

export type SportActivityType = 'run' | 'walk' | 'trail';

export interface SportProfileConfig {
  maxSpeedMs: number;
  motionThresholdSpeedMs: number; // 0.5 m/s boundary between moving and stopped
  targetCadenceMin: number;
  targetCadenceMax: number;
  color: string;
  minPolylineDistanceMeters: number;
  curvePolylineDistanceMeters: number;
  minDistanceThresholdMeters: number;
}

/** 📊 معايير القياس الرياضية الميدانية المعتمدة (تحكم يدوي كامل دون تقطيع) */
export const SPORT_CONFIGS: Record<SportActivityType, SportProfileConfig> = {
  run: {
    maxSpeedMs: 11.5, // 41.4 km/h (أقصى سرعة جري واقعية)
    motionThresholdSpeedMs: 0.5, // عتبة التفريق بين الركض والوقوف
    targetCadenceMin: 160,
    targetCadenceMax: 185,
    color: '#FC5200', // برتقالي Strava
    minPolylineDistanceMeters: 2.5,
    curvePolylineDistanceMeters: 0.8,
    minDistanceThresholdMeters: 1.0,
  },
  walk: {
    maxSpeedMs: 3.5, // 12.6 km/h (سقف المشي السريع)
    motionThresholdSpeedMs: 0.4,
    targetCadenceMin: 100,
    targetCadenceMax: 125,
    color: '#00A3FF', // أزرق سماوي نيون
    minPolylineDistanceMeters: 2.0,
    curvePolylineDistanceMeters: 0.8,
    minDistanceThresholdMeters: 0.8,
  },
  trail: {
    maxSpeedMs: 11.5,
    motionThresholdSpeedMs: 0.4, // يناسب صعود المنحدرات الوعرة مشياً (Power-hiking)
    targetCadenceMin: 155,
    targetCadenceMax: 180,
    color: '#00D084', // أخضر زمردي
    minPolylineDistanceMeters: 2.5,
    curvePolylineDistanceMeters: 0.8,
    minDistanceThresholdMeters: 0.6,
  },
};

export interface LapSplit {
  lapNumber: number;
  distanceKm: number;
  splitDistanceMeters: number;
  splitTimeSeconds: number;
  splitPaceFormatted: string;
  cumulativeTimeSeconds: number;
  elevationDeltaMeters: number;
  avgSpeedKmh: number;
  avgCadenceSpm: number;
  caloriesBurned: number;
  timestamp: number;
}

export interface StoppageEvent {
  id: string;
  startTimestamp: number;
  durationSeconds: number;
  location?: { latitude: number; longitude: number };
  type: 'motion_rest' | 'manual_pause';
}

export interface RunningSessionSnapshot {
  id: string;
  state: RunningState;
  activityType: SportActivityType;
  startTime: number;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number;
  stoppedTimeSeconds: number;
  distanceKm: number;
  elevationGainMeters: number;
  calories: number;
  splits: LapSplit[];
  stoppageEvents: StoppageEvent[];
  lastSavedAt: number;
}

export const CRASH_RECOVERY_STORAGE_KEY = '@nouble_running_session_recovery_v1';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

export const formatEnginePace = (paceSecondsPerKm: number): string => {
  if (!isFinite(paceSecondsPerKm) || paceSecondsPerKm <= 0 || paceSecondsPerKm > 3600) {
    return '-:--';
  }
  const mins = Math.floor(paceSecondsPerKm / 60);
  const secs = Math.round(paceSecondsPerKm % 60);
  if (mins >= 60) return '-:--';
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const formatEngineDuration = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

/**
 * ⚡ ACSM Energy Expenditure Calculator (الكلية الأمريكية للطب الرياضي)
 * حساب دقيق للسعرات المحروقة استناداً إلى الوزن، السرعة، ونسبة الانحدار:
 * Running (> 8 km/h): VO2 = (0.2 * speed_m_min) + (0.9 * speed_m_min * grade) + 3.5
 * Walking (<= 8 km/h): VO2 = (0.1 * speed_m_min) + (1.8 * speed_m_min * grade) + 3.5
 * METs = VO2 / 3.5
 * Calories/min = (MET * 3.5 * weightKg) / 200
 */
export const calculateACSMCaloriesBurned = (
  speedKmh: number,
  durationSeconds: number,
  gradePercent: number = 0,
  weightKg: number = 72,
  activityType: SportActivityType = 'run'
): number => {
  if (speedKmh <= 0.5 || durationSeconds <= 0) return 0;

  const speedMetersPerMin = (speedKmh * 1000) / 60;
  const gradeDecimal = Math.max(0, gradePercent / 100);

  let vo2 = 3.5;
  if (activityType === 'walk' || speedKmh < 7.5) {
    vo2 = 0.1 * speedMetersPerMin + 1.8 * speedMetersPerMin * gradeDecimal + 3.5;
  } else {
    vo2 = 0.2 * speedMetersPerMin + 0.9 * speedMetersPerMin * gradeDecimal + 3.5;
  }

  const mets = Math.max(1.5, vo2 / 3.5);
  const caloriesPerMinute = (mets * 3.5 * weightKg) / 200;
  return (caloriesPerMinute * durationSeconds) / 60;
};

// ─────────────────────────────────────────────────────────────────
// Athletic Running Core Engine Class
// ─────────────────────────────────────────────────────────────────

export interface RunningEngineCallbacks {
  onStateChange?: (newState: RunningState, prevState: RunningState) => void;
  onCountdownTick?: (secondsRemaining: number) => void;
  onLapCompleted?: (split: LapSplit) => void;
  onStoppageDetected?: (event: StoppageEvent) => void;
}

export class RunningEngine {
  private state: RunningState = 'IDLE';
  private activityType: SportActivityType = 'run';
  private userWeightKg: number = 72;

  // Timers & Timekeeping
  private startTimestamp: number = 0;
  private movingTimeSeconds: number = 0;
  private stoppedTimeSeconds: number = 0;
  private elapsedTimeSeconds: number = 0;

  // Continuous Telemetry Velocity
  private currentRollingSpeedMs: number = 0;

  // Stoppage Events Ledger
  private stoppageEvents: StoppageEvent[] = [];
  private activeStoppage: StoppageEvent | null = null;

  // Auto-Lap Split Engine
  private cumulativeDistanceMeters: number = 0;
  private lastLapDistanceMeters: number = 0;
  private lastLapMovingTimeSeconds: number = 0;
  private lastLapElevationMeters: number = 0;
  private lastLapCalories: number = 0;
  private splits: LapSplit[] = [];
  private readonly LAP_INTERVAL_METERS: number = 1000; // 1.00 km standard split

  // Cadence tracking
  private recentCadenceBuffer: number[] = [];
  private currentCadenceSpm: number = 0;

  // Calories accumulation
  private totalCaloriesBurned: number = 0;
  private currentElevationGainMeters: number = 0;

  // Countdown timer ref
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private countdownValue: number = 3;

  // Callbacks
  private callbacks: RunningEngineCallbacks = {};

  constructor(
    activityType: SportActivityType = 'run',
    userWeightKg: number = 72,
    callbacks?: RunningEngineCallbacks
  ) {
    this.activityType = activityType;
    this.userWeightKg = userWeightKg;
    if (callbacks) this.callbacks = callbacks;
  }

  // ── Configuration & Setters ──

  public setActivityType(type: SportActivityType) {
    this.activityType = type;
  }

  public getActivityType(): SportActivityType {
    return this.activityType;
  }

  public getConfig(): SportProfileConfig {
    return SPORT_CONFIGS[this.activityType];
  }

  public setUserWeight(weightKg: number) {
    this.userWeightKg = Math.max(35, Math.min(180, weightKg));
  }

  public setCallbacks(callbacks: RunningEngineCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public getState(): RunningState {
    return this.state;
  }

  public isTracking(): boolean {
    return this.state === 'RECORDING' || this.state === 'MANUAL_PAUSED';
  }

  // ── 1. Finite State Machine Transitions (Full Manual Control) ──

  /**
   * البدء بالعد التنازلي التفاعلي (3.. 2.. 1) لتهيئة أجهزة الاستشعار
   */
  public startCountdown(onComplete?: () => void) {
    if (this.state !== 'IDLE') return;

    this.transitionTo('COUNTDOWN');
    this.countdownValue = 3;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    this.callbacks.onCountdownTick?.(this.countdownValue);

    if (this.countdownTimer) clearInterval(this.countdownTimer);

    this.countdownTimer = setInterval(() => {
      this.countdownValue -= 1;

      if (this.countdownValue > 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        this.callbacks.onCountdownTick?.(this.countdownValue);
      } else {
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        this.startRecording();
        onComplete?.();
      }
    }, 1000);
  }

  public cancelCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.transitionTo('IDLE');
  }

  /**
   * بدء التسجيل الفعلي
   */
  public startRecording() {
    if (this.state === 'RECORDING') return;

    if (this.startTimestamp === 0) {
      this.startTimestamp = Date.now();
    }
    this.transitionTo('RECORDING');
  }

  /**
   * إيقاف مؤقت يدوي حصراً (Manual Pause)
   */
  public pause(currentLocation?: { latitude: number; longitude: number }) {
    if (this.state !== 'RECORDING') return;

    // إغلاق أي توقف حركي طبيعي قبل فتح التوقف اليدوي
    this.closeActiveStoppage();

    this.activeStoppage = {
      id: `manual_pause_${Date.now()}`,
      startTimestamp: Date.now(),
      durationSeconds: 0,
      location: currentLocation,
      type: 'manual_pause',
    };

    this.transitionTo('MANUAL_PAUSED');
  }

  /**
   * استئناف التسجيل يدوياً حصراً (Manual Resume)
   */
  public resume() {
    if (this.state !== 'MANUAL_PAUSED') return;

    this.closeActiveStoppage();
    this.transitionTo('RECORDING');
  }

  /**
   * إنهاء النشاط
   */
  public complete() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.closeActiveStoppage();
    this.transitionTo('COMPLETED');
  }

  /**
   * إعادة الضبط لوضع الاستعداد
   */
  public reset() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.startTimestamp = 0;
    this.movingTimeSeconds = 0;
    this.stoppedTimeSeconds = 0;
    this.elapsedTimeSeconds = 0;
    this.currentRollingSpeedMs = 0;
    this.cumulativeDistanceMeters = 0;
    this.lastLapDistanceMeters = 0;
    this.lastLapMovingTimeSeconds = 0;
    this.lastLapElevationMeters = 0;
    this.lastLapCalories = 0;
    this.splits = [];
    this.stoppageEvents = [];
    this.activeStoppage = null;
    this.recentCadenceBuffer = [];
    this.currentCadenceSpm = 0;
    this.totalCaloriesBurned = 0;
    this.currentElevationGainMeters = 0;
    this.transitionTo('IDLE');
  }

  private transitionTo(newState: RunningState) {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    this.callbacks.onStateChange?.(newState, oldState);
  }

  private closeActiveStoppage() {
    if (this.activeStoppage) {
      if (this.activeStoppage.durationSeconds >= 2) {
        this.stoppageEvents.push({ ...this.activeStoppage });
        this.callbacks.onStoppageDetected?.(this.activeStoppage);
      }
      this.activeStoppage = null;
    }
  }

  // ── 2. Time & Continuous Heartbeat Tick ──

  /**
   * نبضة الثانية الرياضية (تُستدعى كل ثانية عندما يكون التمرين نشطاً)
   * تحسب بدقة متناهية:
   * - الوقت الإجمالي (elapsedTime)
   * - وقت الحركة الفعلي (movingTime) عند السرعة >= 0.5 m/s
   * - وقت التوقف والراحة (stoppedTime) عند السرعة < 0.5 m/s أو التوقف اليدوي
   */
  public tickSecond(currentLocation?: { latitude: number; longitude: number }): {
    movingTime: number;
    stoppedTime: number;
    elapsedTime: number;
  } {
    if (!this.isTracking()) {
      return {
        movingTime: this.movingTimeSeconds,
        stoppedTime: this.stoppedTimeSeconds,
        elapsedTime: this.elapsedTimeSeconds,
      };
    }

    this.elapsedTimeSeconds += 1;

    if (this.state === 'RECORDING') {
      const threshold = this.getConfig().motionThresholdSpeedMs;

      if (this.currentRollingSpeedMs >= threshold) {
        // العدّاء يتحرك فعلياً
        this.movingTimeSeconds += 1;
        if (this.activeStoppage && this.activeStoppage.type === 'motion_rest') {
          this.closeActiveStoppage();
        }
      } else {
        // سرعة منخفضة جداً (< 0.5 m/s) أثناء التسجيل = توقف مؤقت (إشارة مرور، شرب ماء، أو وقوف)
        this.stoppedTimeSeconds += 1;
        if (!this.activeStoppage) {
          this.activeStoppage = {
            id: `motion_rest_${Date.now()}`,
            startTimestamp: Date.now(),
            durationSeconds: 1,
            location: currentLocation,
            type: 'motion_rest',
          };
        } else {
          this.activeStoppage.durationSeconds += 1;
        }
      }
    } else if (this.state === 'MANUAL_PAUSED') {
      // أثناء التوقف اليدوي يزداد وقت التوقف الكلي
      this.stoppedTimeSeconds += 1;
      if (this.activeStoppage) {
        this.activeStoppage.durationSeconds += 1;
      }
    }

    return {
      movingTime: this.movingTimeSeconds,
      stoppedTime: this.stoppedTimeSeconds,
      elapsedTime: this.elapsedTimeSeconds,
    };
  }

  // ── 3. Continuous Telemetry Speed Processing ──

  /**
   * تغذية السرعة اللحظية المفلترة دون قطع تدفق الـ GPS إطلاقاً
   */
  public processSpeed(rollingSpeedMs: number) {
    this.currentRollingSpeedMs = Math.max(0, rollingSpeedMs);
  }

  // ── 4. Distance Ingestion & Auto-Lap Split Engine ──

  /**
   * إضافة مسافة محققة وفحص حدوث الكيلومتر التلقائي (Auto-Lap)
   */
  public addDistanceMeters(
    deltaMeters: number,
    currentSpeedKmh: number,
    elevationMeters: number = 0,
    gradePercent: number = 0
  ): { currentDistanceKm: number; newLapSplit: LapSplit | null } {
    if (this.state !== 'RECORDING' || deltaMeters <= 0) {
      return { currentDistanceKm: this.cumulativeDistanceMeters / 1000, newLapSplit: null };
    }

    this.cumulativeDistanceMeters += deltaMeters;
    this.currentElevationGainMeters = elevationMeters;

    // حساب السعرات اللحظية لهذه النقلة
    const intervalSeconds = currentSpeedKmh > 0 ? (deltaMeters / ((currentSpeedKmh * 1000) / 3600)) : 1;
    const deltaCalories = calculateACSMCaloriesBurned(
      currentSpeedKmh,
      intervalSeconds,
      gradePercent,
      this.userWeightKg,
      this.activityType
    );
    this.totalCaloriesBurned += deltaCalories;

    // 🚀 Auto-Lap Detection (كل 1000 متر = 1.00 كم)
    let newLapSplit: LapSplit | null = null;
    const currentLapTarget = (this.splits.length + 1) * this.LAP_INTERVAL_METERS;

    if (this.cumulativeDistanceMeters >= currentLapTarget) {
      const lapNumber = this.splits.length + 1;
      const splitDistMeters = this.cumulativeDistanceMeters - this.lastLapDistanceMeters;
      const splitTime = this.movingTimeSeconds - this.lastLapMovingTimeSeconds;
      const splitElevDelta = this.currentElevationGainMeters - this.lastLapElevationMeters;
      const splitCalories = this.totalCaloriesBurned - this.lastLapCalories;

      const splitPaceSecondsPerKm = splitDistMeters > 0 ? (splitTime / (splitDistMeters / 1000)) : 0;
      const splitPaceStr = formatEnginePace(splitPaceSecondsPerKm);

      const avgSpeedKmh = splitTime > 0 ? (splitDistMeters / 1000) / (splitTime / 3600) : 0;

      newLapSplit = {
        lapNumber,
        distanceKm: lapNumber,
        splitDistanceMeters: Math.round(splitDistMeters),
        splitTimeSeconds: splitTime,
        splitPaceFormatted: splitPaceStr,
        cumulativeTimeSeconds: this.movingTimeSeconds,
        elevationDeltaMeters: Math.round(splitElevDelta * 10) / 10,
        avgSpeedKmh: Math.round(avgSpeedKmh * 10) / 10,
        avgCadenceSpm: this.currentCadenceSpm,
        caloriesBurned: Math.round(splitCalories),
        timestamp: Date.now(),
      };

      this.splits.push(newLapSplit);
      this.lastLapDistanceMeters = this.cumulativeDistanceMeters;
      this.lastLapMovingTimeSeconds = this.movingTimeSeconds;
      this.lastLapElevationMeters = this.currentElevationGainMeters;
      this.lastLapCalories = this.totalCaloriesBurned;

      // Haptic alert
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      this.callbacks.onLapCompleted?.(newLapSplit);
    }

    return {
      currentDistanceKm: this.cumulativeDistanceMeters / 1000,
      newLapSplit,
    };
  }

  // ── 5. Cadence & Step Integration ──

  /**
   * تحديث الـ Cadence اللحظي (خطوة/دقيقة)
   */
  public updateCadence(spm: number) {
    if (spm <= 0) return;
    this.recentCadenceBuffer.push(spm);
    if (this.recentCadenceBuffer.length > 8) {
      this.recentCadenceBuffer.shift();
    }
    const avg = this.recentCadenceBuffer.reduce((a, b) => a + b, 0) / this.recentCadenceBuffer.length;
    this.currentCadenceSpm = Math.round(avg);
  }

  public getCadenceSpm(): number {
    return this.currentCadenceSpm;
  }

  /**
   * تقييم تناغم الـ Cadence مع الهدف الرياضي
   */
  public evaluateCadenceZone(): 'under' | 'optimal' | 'high' {
    const cfg = this.getConfig();
    if (this.currentCadenceSpm < cfg.targetCadenceMin) return 'under';
    if (this.currentCadenceSpm > cfg.targetCadenceMax) return 'high';
    return 'optimal';
  }

  // ── 6. Metrics & Deep Analytics Aggregations ──

  public getDistanceKm(): number {
    return this.cumulativeDistanceMeters / 1000;
  }

  public getMovingTimeSeconds(): number {
    return this.movingTimeSeconds;
  }

  public getStoppedTimeSeconds(): number {
    return this.stoppedTimeSeconds;
  }

  public getElapsedTimeSeconds(): number {
    return this.elapsedTimeSeconds;
  }

  /**
   * نسبة وقت التوقف والراحة من إجمالي وقت التمرين (%)
   */
  public getRestTimeRatioPercent(): number {
    if (this.elapsedTimeSeconds <= 0) return 0;
    return Math.round((this.stoppedTimeSeconds / this.elapsedTimeSeconds) * 100);
  }

  public getCaloriesBurned(): number {
    return Math.round(this.totalCaloriesBurned);
  }

  /**
   * معدل السرعة الحركي الفعلي (Moving Pace)
   */
  public getMovingPaceFormatted(): string {
    const distKm = this.getDistanceKm();
    if (distKm <= 0.05 || this.movingTimeSeconds <= 0) return '-:--';
    const paceSecondsPerKm = this.movingTimeSeconds / distKm;
    return formatEnginePace(paceSecondsPerKm);
  }

  /**
   * معدل السرعة الإجمالي الشامل لجميع التوقفات (Overall Elapsed Session Pace)
   */
  public getOverallSessionPaceFormatted(): string {
    const distKm = this.getDistanceKm();
    if (distKm <= 0.05 || this.elapsedTimeSeconds <= 0) return '-:--';
    const paceSecondsPerKm = this.elapsedTimeSeconds / distKm;
    return formatEnginePace(paceSecondsPerKm);
  }

  public getSplits(): LapSplit[] {
    return [...this.splits];
  }

  public getStoppageEvents(): StoppageEvent[] {
    return [...this.stoppageEvents];
  }

  // ── 7. Crash-Proof Recovery Storage (AsyncStorage) ──

  /**
   * حفظ لقطة فورية (Snapshot) للجلسة لاستعادتها في حال انطفاء الهاتف
   */
  public async saveCrashRecoverySnapshot(sessionId: string): Promise<boolean> {
    try {
      if (!this.isTracking() || this.cumulativeDistanceMeters <= 50) return false;

      const snapshot: RunningSessionSnapshot = {
        id: sessionId,
        state: this.state,
        activityType: this.activityType,
        startTime: this.startTimestamp,
        movingTimeSeconds: this.movingTimeSeconds,
        elapsedTimeSeconds: this.elapsedTimeSeconds,
        stoppedTimeSeconds: this.stoppedTimeSeconds,
        distanceKm: this.getDistanceKm(),
        elevationGainMeters: this.currentElevationGainMeters,
        calories: this.getCaloriesBurned(),
        splits: this.splits,
        stoppageEvents: this.stoppageEvents,
        lastSavedAt: Date.now(),
      };

      await AsyncStorage.setItem(CRASH_RECOVERY_STORAGE_KEY, JSON.stringify(snapshot));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * استعادة الجلسة في حال العثور على تمرين غير مكتمل
   */
  public static async loadCrashRecoverySnapshot(): Promise<RunningSessionSnapshot | null> {
    try {
      const data = await AsyncStorage.getItem(CRASH_RECOVERY_STORAGE_KEY);
      if (!data) return null;
      const snapshot: RunningSessionSnapshot = JSON.parse(data);

      // لا تستعد جلسات أقدم من 12 ساعة
      const ageHours = (Date.now() - snapshot.lastSavedAt) / (1000 * 3600);
      if (ageHours > 12) {
        await AsyncStorage.removeItem(CRASH_RECOVERY_STORAGE_KEY);
        return null;
      }
      return snapshot;
    } catch {
      return null;
    }
  }

  /**
   * مسح لقطة الاستعادة بعد الحفظ النهائي أو التراجع
   */
  public static async clearCrashRecoverySnapshot(): Promise<void> {
    try {
      await AsyncStorage.removeItem(CRASH_RECOVERY_STORAGE_KEY);
    } catch {}
  }

  /**
   * تهيئة المحرك ببيانات اللقطة المستعادة
   */
  public restoreFromSnapshot(snapshot: RunningSessionSnapshot) {
    this.activityType = snapshot.activityType;
    this.startTimestamp = snapshot.startTime;
    this.movingTimeSeconds = snapshot.movingTimeSeconds;
    this.elapsedTimeSeconds = snapshot.elapsedTimeSeconds;
    this.stoppedTimeSeconds = snapshot.stoppedTimeSeconds || 0;
    this.cumulativeDistanceMeters = snapshot.distanceKm * 1000;
    this.totalCaloriesBurned = snapshot.calories;
    this.currentElevationGainMeters = snapshot.elevationGainMeters;
    this.splits = snapshot.splits || [];
    this.stoppageEvents = snapshot.stoppageEvents || [];
    this.lastLapDistanceMeters = this.splits.length * this.LAP_INTERVAL_METERS;
    this.lastLapMovingTimeSeconds = this.splits.length > 0
      ? this.splits[this.splits.length - 1].cumulativeTimeSeconds
      : 0;

    this.transitionTo('MANUAL_PAUSED');
  }
}
