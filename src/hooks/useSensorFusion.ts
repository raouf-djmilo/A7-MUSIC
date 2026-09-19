/**
 * 🏃 useSensorFusion - Athletic-Grade Sensor Engine (Strava / Garmin Level)
 * 
 * الميزات والبروتوكول التكيفي:
 * 1. الدمج التكيفي للسرعة (Adaptive Dynamic Weighting / Adaptive Trust Gate):
 *    - دقة ممتازة (accuracy <= 5m): اعتماد بنسبة 80% على GPS و 20% على CoreMotion.
 *    - دقة متدهورة (accuracy > 10m أو انعدام السرعة): رفع اعتماد CoreMotion إلى 85% لحماية المسار في الأنفاق وبين العمارات.
 *    - بين 5م و 10م: انتقال خطي تدريجي وسلس (Linear Interpolation).
 * 2. تنعيم حزم الـ Cadence (Pedometer Burst Smoothing):
 *    - امتصاص دفعات CMPedometer في iOS (Batches كل 2-4 ثوانٍ) عبر Exponential Moving Average (EMA):
 *      smoothedCadence = 0.25 * instantSPM + 0.75 * prevSmoothedCadence
 *    - تصفير فوري إلى 0 عند توقف الخطوات لأكثر من 4 ثوانٍ متصلة.
 * 3. حماية انحراف البارومتر من السخونة والطقس (Barometer Thermal & Weather Drift Shield):
 *    - فلترة الارتفاع البارومتري بـ IIR Low-Pass Filter (α = 0.15) وتتبع أقصى ارتفاع (maxAltitude).
 *    - معايرة بطيئة ودقيقة لخط الأساس مع إحداثيات GPS الدقيقة لمنع الانحراف في الماراثون والمسافات الطويلة.
 * 4. بوابة الحركة الهستيريسية (Hysteresis Moving Gate):
 *    - تحديد حالة الحركة عند سرعة >= 0.55 م/ث أو إيقاع >= 55 SPM مع عازل تباطؤ 3 ثوانٍ لمنع الارتجاج عند إشارات المرور.
 * 5. فلتر كالمان الحركي (2D Kalman Filter) مع صمام أمان الأنفاق (Tunnel Guard) والنافذة المتحركة لـ 6 ثوانٍ.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import { Pedometer, Barometer } from 'expo-sensors';
import { PermissionStatus } from 'expo-modules-core';
import { KalmanGPS, calculateHaversineDistanceMeters } from '../utils/KalmanGPS';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface RawGPSPoint {
  latitude:  number;
  longitude: number;
  accuracy:  number;
  altitude:  number | null;
  speed:     number | null;
  heading:   number | null;
  timestamp: number;
}

export interface BarometerReading {
  pressure:         number;  // hPa
  relativeAltitude: number;  // الارتفاع بالنسبة لنقطة البداية (م)
  absoluteAltitude: number;  // الارتفاع المحسوب من الضغط المطلق
}

/** بيانات المستشعرات المدموجة */
export interface SensorFusionData {
  // ── GPS ──
  latitude:           number;
  longitude:          number;
  accuracy:           number;
  speed:              number;    // كم/س لحظي مدمج
  rawGpsSpeedMs:      number;    // سرعة GPS الخام بالمتر/ثانية
  heading:            number;
  timestamp:          number;

  // ── Adaptive Dynamic Weighting Telemetry (Adaptive Trust Gate) ──
  fusedSpeedMs:       number;    // السرعة المدمجة اللحظية بالمتر/ثانية
  motionSpeedMs:      number;    // سرعة الحركة المقدرة من Pedometer
  gpsWeight:          number;    // وزن الـ GPS الحالي (0.15 - 0.80)
  motionWeight:       number;    // وزن الـ CoreMotion الحالي (0.20 - 0.85)

  // ── Rolling Metrics (6-Second Window) ──
  rollingSpeedMs:     number;    // متوسط سرعة آخر 6 ثوانٍ بالمتر/ثانية
  rollingSpeedKmh:    number;    // متوسط سرعة آخر 6 ثوانٍ بالكم/ساعة
  instantPace:        string;    // Pace اللحظي المنسق (MM:SS /km)

  // ── Pedometer & Cadence (Burst-Smoothed EMA) ──
  steps:              number;
  totalSessionSteps:  number;
  cadenceSpm:         number;    // معدل الخطوات في الدقيقة المنعم بـ EMA
  strideLengthMeters: number;    // طول الخطوة الديناميكي المحسوب بالمتر
  stepDistanceMeters: number;    // المسافة المحسوبة من الخطوات كاحتياط للأنفاق

  // ── Barometer & Elevation (Deadband +3.5m & Thermal Drift Shield) ──
  altitude:           number;    // يفضل Barometer على GPS altitude
  altitudeDelta:      number;    // الفرق عن نقطة البداية
  elevationGain:      number;    // إجمالي الصعود التراكمي المفلتر بعتبة +3.5م
  maxAltitude:        number;    // أقصى ارتفاع تم تسجيله في الجلسة (م)
  pressure:           number;    // hPa
  gradePercent:       number;    // نسبة انحدار التلال اللحظية % Grade = (Δalt / Δdist) * 100

  // ── Fusion Status & Hysteresis Moving Gate ──
  isMoving:           boolean;   // حالة الحركة الهستيريسية (3s debounce)
  isGPSJitter:        boolean;   // true إذا GPS يرتجف (تحرك بدون خطوات)
  hasValidFix:        boolean;   // true إذا accuracy < maxAccuracyMeters
  gpsStrength:        'excellent' | 'good' | 'poor' | 'none';
  isBlackoutRecovery: boolean;   // true عند أول نقطة بعد انقطاع طويل للـ GPS (> 8s)
}

export interface SensorFusionState {
  data:        SensorFusionData;
  permissions: {
    foreground: PermissionStatus;
    background: PermissionStatus;
    motion:     PermissionStatus;
  };
  isReady:        boolean;   // true بعد منح الصلاحيات وتهيئة المستشعرات
  hasBarometer:   boolean;   // بعض الأجهزة لا تملك بارومتر
  hasPedometer:   boolean;
  error:          string | null;
}

export interface UseSensorFusionOptions {
  /** الدقة الجغرافية المطلوبة للـ GPS (default: BestForNavigation) */
  gpsAccuracy?: Location.Accuracy;
  /** نوع النشاط المخصص لـ iOS (default: Fitness لأعلى دقة جري ومشي) */
  activityType?: Location.ActivityType;
  /** الحد الأقصى للدقة المقبولة بالمتر. فوق هذا الحد = قراءة مرفوضة (default: 14م) */
  maxAccuracyMeters?: number;
  /** الحد الأدنى للمسافة بالمتر كي تُقبل القراءة (default: 1م) */
  minDistanceFilter?: number;
  /** الفترة الزمنية بين قراءات GPS بالمللي ثانية (default: 500ms) */
  gpsInterval?: number;
  /** تفعيل وضع الخلفية (default: true) */
  enableBackground?: boolean;
  /** إظهار نافذة إعدادات المستخدم إن لزم (default: true) */
  mayShowUserSettingsDialog?: boolean;
  /** أقصى سرعة بشرية مقبولة بالمتر/ثانية (default: 11.5 m/s ≈ 41.4 km/h) لمنع قفزات الـ GPS */
  maxSpeedMetersPerSecond?: number;
}

// القيم الافتراضية
const DEFAULT_DATA: SensorFusionData = {
  latitude:           0,
  longitude:          0,
  accuracy:           0,
  speed:              0,
  rawGpsSpeedMs:      0,
  heading:            0,
  timestamp:          0,
  fusedSpeedMs:       0,
  motionSpeedMs:      0,
  gpsWeight:          0.80,
  motionWeight:       0.20,
  rollingSpeedMs:     0,
  rollingSpeedKmh:    0,
  instantPace:        '-:--',
  steps:              0,
  totalSessionSteps:  0,
  cadenceSpm:         0,
  strideLengthMeters: 0.75,
  stepDistanceMeters: 0,
  altitude:           0,
  altitudeDelta:      0,
  elevationGain:      0,
  maxAltitude:        0,
  pressure:           0,
  gradePercent:       0,
  isMoving:           false,
  isGPSJitter:        false,
  hasValidFix:        false,
  gpsStrength:        'none',
  isBlackoutRecovery: false,
};

// ─────────────────────────────────────────────────────────────────
// Biomechanical & Fusion Helpers
// ─────────────────────────────────────────────────────────────────

/** تحويل ضغط جوي (hPa) إلى ارتفاع (م) باستخدام معادلة بارومترية */
const pressureToAltitude = (pressure: number): number => {
  return 44307.69 * (1 - Math.pow(pressure / 1013.25, 0.190284));
};

/** تحويل دقة GPS إلى مستوى نصي */
const getGPSStrength = (accuracy: number): SensorFusionData['gpsStrength'] => {
  if (accuracy <= 0)   return 'none';
  if (accuracy <= 5)   return 'excellent';
  if (accuracy <= 14)  return 'good';
  if (accuracy <= 30)  return 'poor';
  return 'none';
};

/** تحويل سرعة (م/ث) إلى Pace رياضي دقيق (MM:SS /km) مع حماية من السرعات الخاملة */
export const speedToPace = (speedMs: number): string => {
  if (speedMs < 0.4) return '-:--'; // حماية السكون والوقوف
  const paceSecondsPerKm = 1000 / speedMs;
  const mins = Math.floor(paceSecondsPerKm / 60);
  const secs = Math.round(paceSecondsPerKm % 60);
  if (mins >= 60) return '-:--';
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

/**
 * حساب طول الخطوة الرياضي التكيفي (Dynamic Athletic Stride Model)
 * يتغير طول الخطوة طبيعياً مع زيادة الـ Cadence:
 * - مشي هادئ (100 SPM) -> ~0.75m
 * - ركض متوسط (160 SPM) -> ~1.20m
 * - ركض سريع / سبرنت (180+ SPM) -> ~1.35m - 1.45m
 */
export const calculateDynamicStrideLength = (cadenceSpm: number): number => {
  if (cadenceSpm <= 0) return 0.70;
  return Math.max(0.65, Math.min(1.45, 0.0075 * cadenceSpm));
};

/**
 * حساب سرعة الحركة من مستشعر الخطوات (CoreMotion / Pedometer Speed)
 */
export const calculateMotionSpeedMs = (cadenceSpm: number): number => {
  if (cadenceSpm < 35) return 0; // سكون أو حركات لاإرادية
  const stride = calculateDynamicStrideLength(cadenceSpm);
  const stepsPerSec = cadenceSpm / 60;
  return stepsPerSec * stride;
};

/**
 * حساب أوزان الدمج التكيفية بين GPS و CoreMotion استناداً إلى دقة الـ GPS (Adaptive Trust Gate)
 * - دقة ممتازة (accuracy <= 5m): 80% GPS + 20% CoreMotion
 * - دقة متدهورة (accuracy >= 10m أو انعدام السرعة): 15% GPS + 85% CoreMotion
 * - بين 5م و 10م: انتقال خطي تدريجي وسلس (Linear Interpolation)
 */
export const computeAdaptiveWeights = (
  accuracy: number,
  hasGpsSpeed: boolean
): { wGPS: number; wMotion: number } => {
  if (!hasGpsSpeed || accuracy > 12) {
    return { wGPS: 0.15, wMotion: 0.85 };
  }
  if (accuracy <= 5) {
    return { wGPS: 0.80, wMotion: 0.20 };
  }
  if (accuracy >= 10) {
    return { wGPS: 0.15, wMotion: 0.85 };
  }
  // Linear Interpolation: t في المجال [0, 1]
  const t = (accuracy - 5) / (10 - 5);
  const wGPS = 0.80 - t * (0.80 - 0.15);     // من 0.80 إلى 0.15
  const wMotion = 0.20 + t * (0.85 - 0.20); // من 0.20 إلى 0.85
  return { wGPS, wMotion };
};

// ─────────────────────────────────────────────────────────────────
// Main Hook
// ─────────────────────────────────────────────────────────────────

export const useSensorFusion = (options: UseSensorFusionOptions = {}) => {
  const {
    gpsAccuracy                = Location.Accuracy.BestForNavigation,
    activityType               = Location.ActivityType.Fitness,
    maxAccuracyMeters          = 14,
    minDistanceFilter          = 1,
    gpsInterval                = 500,
    enableBackground           = true,
    mayShowUserSettingsDialog = true,
    maxSpeedMetersPerSecond    = 11.5,
  } = options;

  // ── State ─────────────────────────────────────────────────────
  const [state, setState] = useState<SensorFusionState>({
    data:        { ...DEFAULT_DATA },
    permissions: { foreground: 'pending', background: 'pending', motion: 'pending' },
    isReady:     false,
    hasBarometer: false,
    hasPedometer: false,
    error:       null,
  });

  // ── Internal Subscriptions ────────────────────────────────────
  const locSubscription  = useRef<Location.LocationSubscription | null>(null);
  const pedSubscription  = useRef<ReturnType<typeof Pedometer.watchStepCount> | null>(null);
  const baroSubscription = useRef<ReturnType<typeof Barometer.addListener> | null>(null);

  // 🛰️ 2D Kinematic Kalman Filter Ref & Last Accepted Fix
  const kalmanFilter       = useRef(new KalmanGPS()).current;
  const lastValidFixRef    = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);

  // 🏃 Rolling Speed Buffer (Last 6 seconds of valid speeds in m/s)
  const speedBufferRef     = useRef<number[]>([]);

  // 🏔️ Elevation Deadband (+3.5m threshold hysteresis) & % Grade Window
  const elevationMinRef           = useRef<number | null>(null);
  const elevationMaxRef           = useRef<number | null>(null);
  const elevationCommittedGainRef = useRef<number>(0);
  const totalElevationGainRef     = useRef<number>(0);
  const gradePointsRef            = useRef<{ dist: number; alt: number }[]>([]);
  const cumulativeDistRef         = useRef<number>(0);
  const smoothedGradeRef          = useRef<number>(0);

  // 🌡️ Barometer Thermal Drift Shield & Filtered Altitude
  const filteredAltitudeRef       = useRef<number | null>(null);
  const maxAltitudeRef            = useRef<number>(0);
  const baroDriftOffsetRef        = useRef<number>(0); // إزاحة معايرة الـ Drift الحراري مع GPS

  // 🏃 Pedometer Burst Smoothing (EMA) & Cadence Timeout Tracker
  const lastStepTimestampRef      = useRef<number>(0);
  const lastStepCountRef          = useRef<number>(0);
  const smoothedCadenceRef        = useRef<number>(0);
  const pedometerSessionBaseRef   = useRef<number>(0);
  const stepDistanceMetersRef     = useRef<number>(0);

  // 🚶 Hysteresis Moving Gate Refs
  const isMovingRef               = useRef<boolean>(false);
  const lastMoveTimeRef           = useRef<number>(Date.now());

  // بيانات حية بدون re-render — لكشف الـ Jitter
  const liveStepsRef          = useRef<number>(0);       // الخطوات منذ آخر قراءة GPS
  const baseStepsRef          = useRef<number>(0);       // خطوات بداية الجلسة
  const lastGPSPositionRef    = useRef<{ lat: number; lng: number } | null>(null);
  const baseBaroPressureRef   = useRef<number | null>(null); // ضغط نقطة البداية
  const baseBaroAltitudeRef   = useRef<number>(0);           // ارتفاع نقطة البداية

  /**
   * 🏔️ معالجة صعود الارتفاع التراكمي بعتبة عازلة (+3.5m Deadband Threshold)
   * تمنع تراكم ضوضاء البارومتر وحساس الـ GPS في الطرق المستوية.
   */
  const processElevationDeadband = useCallback((currAlt: number): number => {
    if (elevationMinRef.current === null || elevationMaxRef.current === null) {
      elevationMinRef.current = currAlt;
      elevationMaxRef.current = currAlt;
      elevationCommittedGainRef.current = 0;
      return totalElevationGainRef.current;
    }

    // إذا هبط الرياضي إلى وادٍ أعمق
    if (currAlt < elevationMinRef.current) {
      elevationMinRef.current = currAlt;
      elevationMaxRef.current = currAlt;
      elevationCommittedGainRef.current = 0;
    }
    // إذا صعد الرياضي فوق القمة الحالية
    else if (currAlt > elevationMaxRef.current) {
      elevationMaxRef.current = currAlt;
      const climbFromValley = currAlt - elevationMinRef.current;

      // تطبيق عتبة الصعود المستمر: لا يُحسب إلا بعد تجاوز +3.5 متر متصلة
      if (climbFromValley >= 3.5) {
        const uncommittedGain = climbFromValley - elevationCommittedGainRef.current;
        if (uncommittedGain > 0) {
          totalElevationGainRef.current += uncommittedGain;
          elevationCommittedGainRef.current = climbFromValley;
        }
      }
    }
    // إذا هبط الرياضي بمقدار >= 2.0 متر من القمة، تُغلق موجة الصعود وتبدأ عتبة وادٍ جديدة
    else if (elevationMaxRef.current - currAlt >= 2.0) {
      elevationMinRef.current = currAlt;
      elevationMaxRef.current = currAlt;
      elevationCommittedGainRef.current = 0;
    }

    return totalElevationGainRef.current;
  }, []);

  /**
   * ⏱️ فحص انقطاع الخطوات لأكثر من 4 ثوانٍ متصلة (Cadence Silence Timeout)
   * يضمن هبوط الـ Cadence والسرعة الحركية إلى 0 فور توقف العداء
   */
  const checkCadenceTimeout = useCallback(() => {
    const now = Date.now();
    if (lastStepTimestampRef.current > 0 && (now - lastStepTimestampRef.current > 4000)) {
      if (smoothedCadenceRef.current !== 0) {
        smoothedCadenceRef.current = 0;
      }
    }
  }, []);

  // ── Permission Request ────────────────────────────────────────
  const requestPermissions = useCallback(async () => {
    const perms = { foreground: 'pending' as PermissionStatus, background: 'pending' as PermissionStatus, motion: 'pending' as PermissionStatus };

    // 1. Foreground Location
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    perms.foreground = fgStatus === 'granted' ? 'granted' : 'denied';

    // 2. Background Location (اختياري)
    if (perms.foreground === 'granted' && enableBackground) {
      try {
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        perms.background = bgStatus === 'granted' ? 'granted' : 'denied';
      } catch {
        perms.background = 'denied';
      }
    }

    // 3. Pedometer Permissions
    try {
      const motionAvailable = await Pedometer.isAvailableAsync();
      perms.motion = motionAvailable ? 'granted' : 'denied';
    } catch {
      perms.motion = 'denied';
    }

    return perms;
  }, [enableBackground]);

  // ── GPS Subscription with Athletic Pipeline ──────────────────
  const startGPS = useCallback(async () => {
    if (locSubscription.current) {
      locSubscription.current.remove();
      locSubscription.current = null;
    }

    locSubscription.current = await Location.watchPositionAsync(
      {
        accuracy:                          gpsAccuracy,
        activityType:                      activityType,
        timeInterval:                      gpsInterval,
        distanceInterval:                  minDistanceFilter,
        mayShowUserSettingsDialog:        mayShowUserSettingsDialog,
        showsBackgroundLocationIndicator:  true,
      },
      (location) => {
        // ── Drop Stale Point (> 10,000ms old) ──
        const pointAge = Math.abs(Date.now() - location.timestamp);
        if (pointAge > 10000) {
          return;
        }

        const { latitude, longitude, accuracy, altitude, speed, heading } = location.coords;

        // ═══════════════════════════════════════════════════
        // المرحلة 1: بوابة الفحص الفيزيائي (Kinematic Sanity Gate)
        // ═══════════════════════════════════════════════════

        // 1.1 فحص الدقة الأفقية: إسقاط أي قراءة accuracy > 14m
        if (accuracy == null || accuracy > maxAccuracyMeters) {
          return;
        }

        const timeSinceLastFixSec = lastValidFixRef.current
          ? (location.timestamp - lastValidFixRef.current.timestamp) / 1000
          : 0;
        const isBlackoutGap = timeSinceLastFixSec > 8.0;

        // 1.2 فحص القفزات المستحيلة وسكون الحركة:
        if (lastValidFixRef.current && !isBlackoutGap) {
          const deltaDistanceMeters = calculateHaversineDistanceMeters(
            lastValidFixRef.current,
            { latitude, longitude }
          );
          const dtSeconds = Math.max(timeSinceLastFixSec, 0.1);
          const computedSpeedMs = deltaDistanceMeters / dtSeconds;

          // إذا تجاوزت السرعة المحسوبة 11.5 m/s (أقصى سرعة جري بشري) -> قفزة وهمية (Spike) تسقط فوراً
          if (computedSpeedMs > maxSpeedMetersPerSecond) {
            return;
          }

          // 1.3 فحص السكون: إذا كانت الحركة مجهرية (< 1.2m) والسرعة شبه معدومة (< 0.4 m/s)
          // نجمد الإحداثية الحالية لمنع الانجراف المكتبي وتراكم الأمتار الوهمية
          const currentSpeedMs = speed ?? 0;
          if (deltaDistanceMeters < 1.2 && currentSpeedMs < 0.4) {
            speedBufferRef.current = [...speedBufferRef.current.slice(-5), 0];
            const avgSpeedMs = speedBufferRef.current.reduce((a, b) => a + b, 0) / speedBufferRef.current.length;
            isMovingRef.current = false;

            setState(prev => ({
              ...prev,
              data: {
                ...prev.data,
                speed: 0,
                fusedSpeedMs: 0,
                rollingSpeedMs: avgSpeedMs,
                rollingSpeedKmh: avgSpeedMs * 3.6,
                instantPace: speedToPace(avgSpeedMs),
                heading: heading ?? prev.data.heading,
                timestamp: location.timestamp,
                isMoving: false,
              },
            }));
            return;
          }
        }

        // ═══════════════════════════════════════════════════
        // المرحلة 2: فلتر كالمان ثنائي الأبعاد (2D Kalman Filter)
        // مع صمام أمان الأنفاق (Tunnel Guard) والتثبيت الأولي
        // ═══════════════════════════════════════════════════
        const smoothed = kalmanFilter.process(latitude, longitude, accuracy, location.timestamp);
        lastValidFixRef.current = {
          latitude: smoothed.latitude,
          longitude: smoothed.longitude,
          timestamp: location.timestamp,
        };

        // ═══════════════════════════════════════════════════
        // المرحلة 3: الدمج التكيفي للسرعة (Adaptive Dynamic Weighting)
        // ═══════════════════════════════════════════════════
        checkCadenceTimeout();
        const currentCadence = Math.round(smoothedCadenceRef.current);
        const motionSpeedMs = calculateMotionSpeedMs(currentCadence);
        const rawGpsSpeedMs = Math.max(0, speed ?? 0);
        const hasGpsSpeed = speed !== null && speed > 0.2;

        const { wGPS, wMotion } = computeAdaptiveWeights(accuracy, hasGpsSpeed);

        // حساب السرعة المدمجة التكيفية:
        let adaptiveFusedSpeed = (rawGpsSpeedMs * wGPS) + (motionSpeedMs * wMotion);

        // إذا كان العداء متوقفاً تماماً (GPS شبه منعدم وبدون خطوات)
        if (rawGpsSpeedMs < 0.35 && currentCadence < 35) {
          adaptiveFusedSpeed = 0;
        }

        // 🏃 بوابة الحركة الهستيريسية (Hysteresis Moving Gate):
        // تعتبر حركة إذا كانت السرعة المدمجة >= 0.55 م/ث أو معدل الخطوات >= 55 SPM
        const isCurrentlyActive = adaptiveFusedSpeed >= 0.55 || currentCadence >= 55;
        if (isCurrentlyActive) {
          isMovingRef.current = true;
          lastMoveTimeRef.current = Date.now();
        } else {
          // عازل التباطؤ: لا نعتبره متوقفاً إلا بعد مرور 3 ثوانٍ متصلة دون حركة
          if (Date.now() - lastMoveTimeRef.current > 3000) {
            isMovingRef.current = false;
          }
        }

        // ── حساب السرعة والـ Pace بالنافذة المتحركة (Rolling 6s Buffer) ──
        if (smoothed.isBlackoutRecovery) {
          speedBufferRef.current = [adaptiveFusedSpeed];
        } else {
          speedBufferRef.current = [...speedBufferRef.current.slice(-5), adaptiveFusedSpeed];
        }
        const rollingSpeedMs = speedBufferRef.current.reduce((a, b) => a + b, 0) / speedBufferRef.current.length;
        const rollingSpeedKmh = rollingSpeedMs * 3.6;
        const instantPace = speedToPace(rollingSpeedMs);

        // ═══════════════════════════════════════════════════
        // نقطة دمج GPS × Pedometer (Anti-Jitter Logic)
        // ═══════════════════════════════════════════════════
        const currentSteps    = liveStepsRef.current;
        const stepsSinceCheck = currentSteps - baseStepsRef.current;

        let movedDistance = 0;
        if (lastGPSPositionRef.current) {
          movedDistance = calculateHaversineDistanceMeters(
            { latitude: lastGPSPositionRef.current.lat, longitude: lastGPSPositionRef.current.lng },
            { latitude: smoothed.latitude, longitude: smoothed.longitude }
          );
        }

        const movedButNoSteps = movedDistance > 3 && stepsSinceCheck === 0;
        const isJitter        = movedButNoSteps && (accuracy > 10);

        lastGPSPositionRef.current = { lat: smoothed.latitude, lng: smoothed.longitude };
        baseStepsRef.current       = currentSteps;

        // 🌡️ درع الانحراف الحراري (Thermal Drift Anchor):
        // عندما يكون الـ GPS بدقة عالية جداً (<= 5م)، نقوم بضبط هادئ وبطيء جداً (0.5%) لخط الأساس
        if (altitude != null && accuracy <= 5 && filteredAltitudeRef.current !== null) {
          const altitudeDiff = altitude - filteredAltitudeRef.current;
          baroDriftOffsetRef.current = 0.995 * baroDriftOffsetRef.current + 0.005 * altitudeDiff;
        }

        const fallbackAltitude = altitude ?? 0;
        if (fallbackAltitude > maxAltitudeRef.current) {
          maxAltitudeRef.current = fallbackAltitude;
        }

        // معالجة صعود الارتفاع إذا لم يكن هناك بارومتر
        const currentElevationGain = state.data.pressure > 0
          ? totalElevationGainRef.current
          : processElevationDeadband(fallbackAltitude);

        // 🏔️ حساب نسبة انحدار التلال المنعمة % Grade Slope: (Δalt / Δdist) * 100
        // تعتمد على نافذة مسافة حقيقية ممتدة (12-25 متراً) مع تنعيم أسي (EMA) لمنع تذبذب الرياح والسرعات البطيئة
        cumulativeDistRef.current += movedDistance;
        const effectiveAltitude = state.data.pressure > 0 ? state.data.altitude : fallbackAltitude;
        gradePointsRef.current.push({ dist: cumulativeDistRef.current, alt: effectiveAltitude });

        // تقليص النقاط القديمة التي تبعد أكثر من 25 متراً عن الموقع الحالي
        while (
          gradePointsRef.current.length > 2 &&
          cumulativeDistRef.current - gradePointsRef.current[0].dist > 25
        ) {
          gradePointsRef.current.shift();
        }

        let computedGradePercent = smoothedGradeRef.current;
        if (rollingSpeedMs >= 0.4 && gradePointsRef.current.length >= 2) {
          const oldest = gradePointsRef.current[0];
          const newest = gradePointsRef.current[gradePointsRef.current.length - 1];
          const deltaDist = newest.dist - oldest.dist;
          const deltaAlt = newest.alt - oldest.alt;

          // لا يتم حساب الانحدار إلا بعد قطع مسافة أفقية كافية (>= 12م) لمنع قفزات ضوضاء البارومتر
          if (deltaDist >= 12.0) {
            const rawGrade = (deltaAlt / deltaDist) * 100;
            const clampedRaw = Math.max(-45, Math.min(45, rawGrade));
            // تنعيم أسي (EMA: 75% تاريخي + 25% لحظي) لمنع قفزات الرياح وهزات الخطوات
            const smoothedSlope = smoothedGradeRef.current * 0.75 + clampedRaw * 0.25;
            smoothedGradeRef.current = Math.round(smoothedSlope * 10) / 10;
            computedGradePercent = smoothedGradeRef.current;
          }
        }

        const dynamicStride = calculateDynamicStrideLength(currentCadence);

        setState(prev => ({
          ...prev,
          data: {
            ...prev.data,
            latitude:           smoothed.latitude,
            longitude:          smoothed.longitude,
            accuracy:           accuracy,
            speed:              Math.max(0, adaptiveFusedSpeed * 3.6),
            rawGpsSpeedMs:      rawGpsSpeedMs,
            fusedSpeedMs:       adaptiveFusedSpeed,
            motionSpeedMs:      motionSpeedMs,
            gpsWeight:          wGPS,
            motionWeight:       wMotion,
            rollingSpeedMs:     rollingSpeedMs,
            rollingSpeedKmh:    rollingSpeedKmh,
            instantPace:        instantPace,
            heading:            heading ?? prev.data.heading,
            timestamp:          location.timestamp,
            cadenceSpm:         currentCadence,
            strideLengthMeters: Math.round(dynamicStride * 100) / 100,
            isMoving:           isMovingRef.current,
            isGPSJitter:        isJitter,
            hasValidFix:        accuracy <= maxAccuracyMeters,
            gpsStrength:        getGPSStrength(accuracy),
            altitude:           effectiveAltitude,
            elevationGain:      currentElevationGain,
            maxAltitude:        Math.round(maxAltitudeRef.current * 10) / 10,
            gradePercent:       computedGradePercent,
            isBlackoutRecovery: smoothed.isBlackoutRecovery,
          },
        }));
      }
    );
  }, [gpsAccuracy, activityType, gpsInterval, minDistanceFilter, maxAccuracyMeters, maxSpeedMetersPerSecond, processElevationDeadband, checkCadenceTimeout, state.data.pressure]);

  // ── Pedometer Subscription (Burst-Smoothed EMA) ───────────────
  const startPedometer = useCallback((available: boolean) => {
    if (!available) return;
    if (pedSubscription.current) { pedSubscription.current.remove(); }

    pedSubscription.current = Pedometer.watchStepCount((result) => {
      const now = Date.now();
      if (pedometerSessionBaseRef.current === 0) {
        pedometerSessionBaseRef.current = result.steps;
        lastStepCountRef.current = result.steps;
        lastStepTimestampRef.current = now;
      }

      const sessionSteps = result.steps - pedometerSessionBaseRef.current;
      liveStepsRef.current = result.steps;

      const deltaSteps = result.steps - lastStepCountRef.current;
      const deltaSec = (now - lastStepTimestampRef.current) / 1000;

      // 🏃 امتصاص دفعات الخطوات في iOS (Burst Batching Mitigation)
      // أجهزة Apple ترسل الخطوات كـ batch كل 2-4 ثوانٍ
      if (deltaSec >= 0.8 && deltaSteps > 0) {
        const instantSPM = Math.min(240, Math.max(0, (deltaSteps / deltaSec) * 60));
        // Exponential Moving Average (EMA):
        // smoothedCadence = 0.25 * instantSPM + 0.75 * prevSmoothedCadence
        if (smoothedCadenceRef.current === 0) {
          smoothedCadenceRef.current = instantSPM;
        } else {
          smoothedCadenceRef.current = 0.25 * instantSPM + 0.75 * smoothedCadenceRef.current;
        }

        // حساب المسافة الاحتياطية للخطوات (Tunnel / Degraded GPS fallback)
        const currentStride = calculateDynamicStrideLength(smoothedCadenceRef.current);
        stepDistanceMetersRef.current += deltaSteps * currentStride;

        lastStepCountRef.current = result.steps;
        lastStepTimestampRef.current = now;

        // 🏃 تفعيل بوابة الحركة عند المشي (حتى مع غياب إشارة الـ GPS داخل الشقة/المبنى)
        if (instantSPM >= 30) {
          isMovingRef.current = true;
          lastMoveTimeRef.current = now;
        }
      } else if (lastStepCountRef.current === 0) {
        lastStepCountRef.current = result.steps;
        lastStepTimestampRef.current = now;
      }

      const roundedCadence = Math.round(smoothedCadenceRef.current);
      const stride = calculateDynamicStrideLength(roundedCadence);
      const motionSpeedMs = calculateMotionSpeedMs(roundedCadence);

      setState(prev => {
        // إذا كانت دقة الـ GPS متدهورة (> 12م) أو معدومة (داخل المنزل)، نغذي السرعة والـ Pace من حركة الخطوات
        const isGpsDegraded = !prev.data.hasValidFix || prev.data.accuracy > 12;
        const newFusedSpeedMs = isGpsDegraded && roundedCadence >= 30 ? motionSpeedMs : prev.data.fusedSpeedMs;
        const newRollingSpeedMs = isGpsDegraded && roundedCadence >= 30 ? motionSpeedMs : prev.data.rollingSpeedMs;
        const newPace = isGpsDegraded && roundedCadence >= 30 ? speedToPace(motionSpeedMs) : prev.data.instantPace;

        return {
          ...prev,
          data: {
            ...prev.data,
            steps:              sessionSteps,
            totalSessionSteps:  sessionSteps,
            cadenceSpm:         roundedCadence,
            strideLengthMeters: Math.round(stride * 100) / 100,
            stepDistanceMeters: Math.round(stepDistanceMetersRef.current * 10) / 10,
            isMoving:           isMovingRef.current,
            fusedSpeedMs:       newFusedSpeedMs,
            rollingSpeedMs:     newRollingSpeedMs,
            rollingSpeedKmh:    newRollingSpeedMs * 3.6,
            instantPace:        newPace,
          },
        };
      });
    });
  }, []);

  // ── Barometer Subscription (IIR Low-Pass + Thermal Drift Shield) ───────────
  const startBarometer = useCallback(async (): Promise<boolean> => {
    try {
      const available = await Barometer.isAvailableAsync();
      if (!available) return false;

      Barometer.setUpdateInterval(200);

      baroSubscription.current = Barometer.addListener((data) => {
        const { pressure } = data;
        if (!pressure || pressure < 800 || pressure > 1100) return;

        const rawAbsoluteAltitude = pressureToAltitude(pressure);

        // 🏔️ IIR Low-Pass Filter (15% new + 85% historical) لمنع تشويش الرياح وسخونة الجهاز
        if (filteredAltitudeRef.current === null) {
          filteredAltitudeRef.current = rawAbsoluteAltitude;
        } else {
          filteredAltitudeRef.current = 0.15 * rawAbsoluteAltitude + 0.85 * filteredAltitudeRef.current;
        }

        const effectiveAbsoluteAltitude = filteredAltitudeRef.current + baroDriftOffsetRef.current;

        if (baseBaroPressureRef.current === null) {
          baseBaroPressureRef.current = pressure;
          baseBaroAltitudeRef.current = effectiveAbsoluteAltitude;
          maxAltitudeRef.current = effectiveAbsoluteAltitude;
        }

        // تحديث أقصى ارتفاع تم بلوغه في الجلسة (Max Altitude)
        if (effectiveAbsoluteAltitude > maxAltitudeRef.current) {
          maxAltitudeRef.current = effectiveAbsoluteAltitude;
        }

        const relativeAltitude = effectiveAbsoluteAltitude - baseBaroAltitudeRef.current;
        const gain = processElevationDeadband(effectiveAbsoluteAltitude);

        setState(prev => ({
          ...prev,
          data: {
            ...prev.data,
            altitude:      Math.round(effectiveAbsoluteAltitude * 10) / 10,
            altitudeDelta: Math.round(relativeAltitude * 10) / 10,
            elevationGain: gain,
            maxAltitude:   Math.round(maxAltitudeRef.current * 10) / 10,
            pressure,
          },
        }));
      });

      return true;
    } catch {
      return false;
    }
  }, [processElevationDeadband]);

  // ── Master Initialization ─────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        const permissions = await requestPermissions();
        if (!mounted) return;

        if (permissions.foreground !== 'granted') {
          setState(prev => ({
            ...prev,
            permissions,
            error: 'الرجاء منح صلاحية الموقع لتشغيل نظام التتبع',
          }));
          return;
        }

        const [baroOk] = await Promise.all([
          startBarometer(),
          startPedometer(permissions.motion === 'granted'),
          startGPS(),
        ]);

        if (mounted) {
          setState(prev => ({
            ...prev,
            permissions,
            isReady:      true,
            hasBarometer: baroOk,
            hasPedometer: permissions.motion === 'granted',
            error:        null,
          }));
        }
      } catch (err: any) {
        if (mounted) {
          setState(prev => ({
            ...prev,
            error: err.message ?? 'فشل تهيئة مستشعرات التتبع',
          }));
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [startGPS, startPedometer, startBarometer, requestPermissions]);

  // ── Cleanup & Reset Methods ───────────────────────────────────
  const cleanup = useCallback(() => {
    if (locSubscription.current) {
      locSubscription.current.remove();
      locSubscription.current = null;
    }
    if (pedSubscription.current) {
      pedSubscription.current.remove();
      pedSubscription.current = null;
    }
    if (baroSubscription.current) {
      baroSubscription.current.remove();
      baroSubscription.current = null;
    }

    liveStepsRef.current              = 0;
    baseStepsRef.current              = 0;
    lastStepTimestampRef.current      = 0;
    lastStepCountRef.current          = 0;
    smoothedCadenceRef.current        = 0;
    pedometerSessionBaseRef.current   = 0;
    stepDistanceMetersRef.current     = 0;
    lastGPSPositionRef.current        = null;
    baseBaroPressureRef.current       = null;
    baseBaroAltitudeRef.current       = 0;
    filteredAltitudeRef.current       = null;
    maxAltitudeRef.current            = 0;
    baroDriftOffsetRef.current        = 0;
    elevationMinRef.current           = null;
    elevationMaxRef.current           = null;
    elevationCommittedGainRef.current = 0;
    totalElevationGainRef.current     = 0;
    gradePointsRef.current            = [];
    cumulativeDistRef.current         = 0;
    smoothedGradeRef.current          = 0;
    speedBufferRef.current            = [];
    isMovingRef.current               = false;
    lastMoveTimeRef.current           = 0;
    kalmanFilter.reset();
    lastValidFixRef.current           = null;
  }, [kalmanFilter]);

  /** إعادة ضبط فلتر كالمان ونافذة السرعة */
  const resetKalman = useCallback(() => {
    kalmanFilter.reset();
    lastValidFixRef.current = null;
    speedBufferRef.current  = [];
  }, [kalmanFilter]);

  /** إعادة ضبط خط قاعدة الارتفاع وعتبة الـ Deadband التراكمية */
  const resetAltitudeBaseline = useCallback(() => {
    baseBaroPressureRef.current       = null;
    baseBaroAltitudeRef.current       = 0;
    filteredAltitudeRef.current       = null;
    maxAltitudeRef.current            = 0;
    baroDriftOffsetRef.current        = 0;
    elevationMinRef.current           = null;
    elevationMaxRef.current           = null;
    elevationCommittedGainRef.current = 0;
    totalElevationGainRef.current     = 0;
    gradePointsRef.current            = [];
    cumulativeDistRef.current         = 0;
    smoothedGradeRef.current          = 0;
    setState(prev => ({
      ...prev,
      data: { ...prev.data, altitudeDelta: 0, elevationGain: 0, maxAltitude: 0, gradePercent: 0 },
    }));
  }, []);

  /** إعادة ضبط عداد الخطوات */
  const resetStepCounter = useCallback(() => {
    liveStepsRef.current            = 0;
    baseStepsRef.current            = 0;
    lastStepTimestampRef.current    = 0;
    lastStepCountRef.current        = 0;
    smoothedCadenceRef.current      = 0;
    pedometerSessionBaseRef.current = 0;
    stepDistanceMetersRef.current   = 0;
    setState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        steps: 0,
        totalSessionSteps: 0,
        cadenceSpm: 0,
        stepDistanceMeters: 0,
      },
    }));
  }, []);

  return {
    ...state,
    cleanup,
    resetAltitudeBaseline,
    resetStepCounter,
    resetKalman,
  };
};

export default useSensorFusion;

