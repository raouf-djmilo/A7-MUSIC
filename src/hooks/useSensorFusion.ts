/**
 * 🏃 useSensorFusion - Athletic-Grade Sensor Engine (Strava / Garmin Level)
 * 
 * الميزات:
 * 1. دمج GPS مع مقياس الخطوات (Pedometer) لكشف الارتجاج المكتبي (Jitter).
 * 2. دمج البارومتر (Barometer) مع عتبة صعود صافية (+3.5m Elevation Deadband) لمنع الارتفاع الوهمي.
 * 3. فلتر كالمان الحركي (2D Kalman Filter) مع صمام أمان الأنفاق (Tunnel Guard) والتثبيت الأولي (3-Point Consensus).
 * 4. حساب السرعة والـ Pace بالنافذة المتحركة لآخر 6 ثوانٍ (Rolling Window Pace) مع تنسيق MM:SS /km.
 * 5. بوابات فيزيائية صارمة: إسقاط الدقة الضعيفة، إسقاط قفزات الـ GPS، وتجميد السكون.
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
  speed:              number;    // كم/س لحظي
  heading:            number;
  timestamp:          number;

  // ── Rolling Metrics (6-Second Window) ──
  rollingSpeedMs:     number;    // متوسط سرعة آخر 6 ثوانٍ بالمتر/ثانية
  rollingSpeedKmh:    number;    // متوسط سرعة آخر 6 ثوانٍ بالكم/ساعة
  instantPace:        string;    // Pace اللحظي المنسق (MM:SS /km)

  // ── Pedometer ──
  steps:              number;
  totalSessionSteps:  number;

  // ── Barometer & Elevation (Deadband +3.5m & % Grade) ──
  altitude:           number;    // يفضل Barometer على GPS altitude
  altitudeDelta:      number;    // الفرق عن نقطة البداية
  elevationGain:      number;    // إجمالي الصعود التراكمي المفلتر بعتبة +3.5م
  pressure:           number;    // hPa
  gradePercent:       number;    // نسبة انحدار التلال اللحظية % Grade = (Δalt / Δdist) * 100

  // ── Fusion Status ──
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
  heading:            0,
  timestamp:          0,
  rollingSpeedMs:     0,
  rollingSpeedKmh:    0,
  instantPace:        '-:--',
  steps:              0,
  totalSessionSteps:  0,
  altitude:           0,
  altitudeDelta:      0,
  elevationGain:      0,
  pressure:           0,
  gradePercent:       0,
  isGPSJitter:        false,
  hasValidFix:        false,
  gpsStrength:        'none',
  isBlackoutRecovery: false,
};

// ─────────────────────────────────────────────────────────────────
// Helpers
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
            setState(prev => ({
              ...prev,
              data: {
                ...prev.data,
                speed: 0,
                rollingSpeedMs: avgSpeedMs,
                rollingSpeedKmh: avgSpeedMs * 3.6,
                instantPace: speedToPace(avgSpeedMs),
                heading: heading ?? prev.data.heading,
                timestamp: location.timestamp,
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

        // ── حساب السرعة والـ Pace بالنافذة المتحركة (Rolling 6s Buffer) ──
        const rawSpeedMs = Math.max(0, speed ?? 0);
        if (smoothed.isBlackoutRecovery) {
          speedBufferRef.current = [rawSpeedMs];
        } else {
          speedBufferRef.current = [...speedBufferRef.current.slice(-5), rawSpeedMs];
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

        const fallbackAltitude = altitude ?? 0;
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
            const smoothed = smoothedGradeRef.current * 0.75 + clampedRaw * 0.25;
            smoothedGradeRef.current = Math.round(smoothed * 10) / 10;
            computedGradePercent = smoothedGradeRef.current;
          }
        }

        setState(prev => ({
          ...prev,
          data: {
            ...prev.data,
            latitude:           smoothed.latitude,
            longitude:          smoothed.longitude,
            accuracy:           accuracy,
            speed:              Math.max(0, rawSpeedMs * 3.6),
            rollingSpeedMs:     rollingSpeedMs,
            rollingSpeedKmh:    rollingSpeedKmh,
            instantPace:        instantPace,
            heading:            heading ?? prev.data.heading,
            timestamp:          location.timestamp,
            isGPSJitter:        isJitter,
            hasValidFix:        accuracy <= maxAccuracyMeters,
            gpsStrength:        getGPSStrength(accuracy),
            altitude:           effectiveAltitude,
            elevationGain:      currentElevationGain,
            gradePercent:       computedGradePercent,
            isBlackoutRecovery: smoothed.isBlackoutRecovery,
          },
        }));
      }
    );
  }, [gpsAccuracy, activityType, gpsInterval, minDistanceFilter, maxAccuracyMeters, maxSpeedMetersPerSecond, processElevationDeadband, state.data.pressure]);

  // ── Pedometer Subscription ────────────────────────────────────
  const startPedometer = useCallback((available: boolean) => {
    if (!available) return;
    if (pedSubscription.current) { pedSubscription.current.remove(); }

    let sessionBase = 0;

    pedSubscription.current = Pedometer.watchStepCount((result) => {
      if (sessionBase === 0) sessionBase = result.steps;

      const sessionSteps = result.steps - sessionBase;
      liveStepsRef.current = result.steps;

      setState(prev => ({
        ...prev,
        data: {
          ...prev.data,
          steps:             sessionSteps,
          totalSessionSteps: sessionSteps,
        },
      }));
    });
  }, []);

  // ── Barometer Subscription (مع عتبة Deadband +3.5m) ───────────
  const startBarometer = useCallback(async (): Promise<boolean> => {
    try {
      const available = await Barometer.isAvailableAsync();
      if (!available) return false;

      Barometer.setUpdateInterval(200);

      baroSubscription.current = Barometer.addListener((data) => {
        const { pressure } = data;
        if (!pressure || pressure < 800 || pressure > 1100) return;

        const absoluteAltitude = pressureToAltitude(pressure);

        if (baseBaroPressureRef.current === null) {
          baseBaroPressureRef.current = pressure;
          baseBaroAltitudeRef.current = absoluteAltitude;
        }

        const relativeAltitude = absoluteAltitude - baseBaroAltitudeRef.current;
        const gain = processElevationDeadband(absoluteAltitude);

        setState(prev => ({
          ...prev,
          data: {
            ...prev.data,
            altitude:      absoluteAltitude,
            altitudeDelta: relativeAltitude,
            elevationGain: gain,
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
    lastGPSPositionRef.current        = null;
    baseBaroPressureRef.current       = null;
    baseBaroAltitudeRef.current       = 0;
    elevationMinRef.current           = null;
    elevationMaxRef.current           = null;
    elevationCommittedGainRef.current = 0;
    totalElevationGainRef.current     = 0;
    gradePointsRef.current            = [];
    cumulativeDistRef.current         = 0;
    smoothedGradeRef.current          = 0;
    speedBufferRef.current            = [];
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
    elevationMinRef.current           = null;
    elevationMaxRef.current           = null;
    elevationCommittedGainRef.current = 0;
    totalElevationGainRef.current     = 0;
    gradePointsRef.current            = [];
    cumulativeDistRef.current         = 0;
    smoothedGradeRef.current          = 0;
    setState(prev => ({
      ...prev,
      data: { ...prev.data, altitudeDelta: 0, elevationGain: 0, gradePercent: 0 },
    }));
  }, []);

  /** إعادة ضبط عداد الخطوات */
  const resetStepCounter = useCallback(() => {
    liveStepsRef.current = 0;
    baseStepsRef.current = 0;
    setState(prev => ({
      ...prev,
      data: { ...prev.data, steps: 0, totalSessionSteps: 0 },
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
