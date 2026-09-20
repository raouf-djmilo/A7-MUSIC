/**
 * 🏆 WorkoutSummaryScreen - Strava-Grade Athletic Workout Summary (1:1 UI)
 * 
 * الميزات والمعايير الرياضية:
 * 1. Athlete Identity & Context:
 *    - صورة الرياضي الشخصية واسم العدّاء.
 *    - تاريخ وتوقيت الانطلاق الدقيق واسم المنطقة الجغرافية (e.g. Ouled Chebel, Algiers).
 * 2. Editable Activity Title & Notes:
 *    - عنوان النشاط التلقائي الذكي (e.g. Afternoon Run / Morning Trail) القابل للتعديل الفوري.
 *    - كابشن/ملاحظات اختيارية لوصف المشاعر ومعدات الجري وحالة الطقس.
 * 3. Hero Metrics Row (Strava Benchmark):
 *    - Distance (km) بتنسيق عشري بارز.
 *    - Pace الحركي الفعلي (/km).
 *    - Time الفعلي (Moving Time) بتنسيق Strava (e.g. 2h 5m أو MM:SS).
 *    - Elevation Gain (+D) أو وسام الإنجاز الرياضي.
 * 4. Auto Bounding Box Map:
 *    - خريطة مسار Polyline بدقة متناهية مع ماركر البداية الأخضر وماركر النهاية.
 *    - توسيط تلقائي لكامل المسار عبر fitToCoordinates.
 * 5. Deep Athletic Telemetry:
 *    - Moving Time vs Elapsed Time و Rest Time Ratio %.
 *    - Avg Cadence (SPM) وتقييم المنطقة الرياضية.
 *    - Max Altitude و ACSM Calorie Burn.
 * 6. Interactive Splits Table:
 *    - جدول الكيلومترات التفاعلي مع أشرطة المقارنة البصرية للسرعة (Pace Bars).
 * 7. Action Buttons:
 *    - Save Activity إلى جدول activities في Supabase مع تحديث إحصائيات الرياضي.
 *    - Share Card لمشاركة إنجاز الجري.
 *    - Discard Workout مع تأكيد آمن.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Dimensions,
  Platform,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import MapView, { Polyline, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../providers/AuthProvider';
import { supabase } from '../lib/supabase';
import { LapSplit } from '../utils/RunningEngine';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Color Tokens (Strava Dark/Athletic Aesthetic) ──
const STRAVA_ORANGE = '#FC5200';
const STRAVA_EMERALD = '#00D084';
const STRAVA_BLUE = '#00A3FF';
const STRAVA_BG = '#0E1015';
const STRAVA_CARD_BG = '#1A1D24';
const STRAVA_CARD_BORDER = 'rgba(255, 255, 255, 0.08)';

export interface WorkoutSummaryParams {
  workout?: any;
  workoutId?: string;
  isExistingWorkout?: boolean;
  route?: { latitude: number; longitude: number }[];
  sportType?: 'run' | 'trail' | 'walk';
  distanceKm?: number;
  movingTimeSeconds?: number;
  elapsedTimeSeconds?: number;
  stoppedTimeSeconds?: number;
  avgPace?: string;
  avgCadence?: number;
  maxAltitude?: number;
  elevationGain?: number;
  calories?: number;
  splits?: LapSplit[];
  startTime?: string;
  startLocationName?: string;
  initialLocation?: { latitude: number; longitude: number };
}

// ─────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────

const formatStravaDuration = (totalSeconds: number): string => {
  if (!totalSeconds || totalSeconds <= 0) return '0s';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
};

const formatFullTime = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const formatStravaPace = (totalSeconds: number): string => {
  if (!totalSeconds || totalSeconds <= 0) return '-:--';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const getDefaultActivityTitle = (sportType: string, date: Date): string => {
  const hour = date.getHours();
  let timeOfDay = 'Afternoon';
  if (hour >= 5 && hour < 12) timeOfDay = 'Morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'Afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'Evening';
  else timeOfDay = 'Night';

  const typeStr = sportType === 'trail' ? 'Trail Run' : (sportType === 'walk' ? 'Walk' : 'Run');
  return `${timeOfDay} ${typeStr}`;
};

export const WorkoutSummaryScreen = () => {
  const navigation = useNavigation<any>();
  const rawParams = (useRoute().params as any) || {};
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // ── Existing vs Fresh Workout Discrimination ──
  const existingWorkout = rawParams.workout;
  const existingWorkoutId = rawParams.workoutId || existingWorkout?.id;
  const isExistingWorkout = Boolean(existingWorkoutId);

  // ── Safe Params Extraction with Fallbacks ──
  const route = existingWorkout?.route_coordinates || rawParams.route || [];
  const sportType: 'run' | 'trail' | 'walk' = existingWorkout?.activity_type || rawParams.sportType || 'run';
  const distanceKm: number = Number(existingWorkout?.total_distance ?? rawParams.distanceKm ?? 0);
  const movingTimeSeconds: number = Number(existingWorkout?.moving_time ?? existingWorkout?.total_time ?? rawParams.movingTimeSeconds ?? 0);
  const elapsedTimeSeconds: number = Number(existingWorkout?.elapsed_time ?? existingWorkout?.total_time ?? rawParams.elapsedTimeSeconds ?? 0);
  const stoppedTimeSeconds: number = Number(existingWorkout?.stopped_time ?? rawParams.stoppedTimeSeconds ?? 0);
  const avgPace: string = existingWorkout?.average_pace || rawParams.avgPace || '-:--';
  const avgCadence: number = Number(existingWorkout?.avg_cadence ?? rawParams.avgCadence ?? 0);
  const maxAltitude: number = Number(existingWorkout?.max_altitude ?? existingWorkout?.altitude ?? rawParams.maxAltitude ?? 0);
  const elevationGain: number = Number(existingWorkout?.elevation_gain ?? rawParams.elevationGain ?? 0);
  const calories: number = Number(existingWorkout?.calories ?? rawParams.calories ?? 0);
  const splits: LapSplit[] = existingWorkout?.splits || rawParams.splits || [];
  const startTime: string = existingWorkout?.created_at || rawParams.startTime || new Date().toISOString();
  const startLocationName: string = rawParams.startLocationName || 'Ouled Chebel, Algiers';
  const initialLocation = rawParams.initialLocation;

  // 🚀 CRITICAL FIX: Pace Sanitization - Strictly '-:--' when distance < 50m or moving time = 0
  const isPaceValid = distanceKm >= 0.05 && movingTimeSeconds > 0 && avgPace !== '-:--' && Boolean(avgPace);
  const sanitizedAvgPace = isPaceValid ? avgPace : '-:--';

  const startDate = useMemo(() => new Date(startTime), [startTime]);

  // Dynamic Theme Accent based on sport
  const accent = sportType === 'trail' ? STRAVA_EMERALD : (sportType === 'walk' ? STRAVA_BLUE : STRAVA_ORANGE);

  // ── Editable State ──
  const defaultInitialTitle = existingWorkout?.notes?.split(' — ')[0] || getDefaultActivityTitle(sportType, startDate);
  const defaultInitialNotes = existingWorkout?.notes?.includes(' — ') ? existingWorkout.notes.split(' — ')[1] : '';
  const [title, setTitle] = useState(defaultInitialTitle);
  const [notes, setNotes] = useState(defaultInitialNotes);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');

  const mapRef = useRef<MapView | null>(null);

  // Resolved single or starting location coordinate for map centering
  const mapInitialCoordinate = useMemo(() => {
    if (route.length > 0 && route[0].latitude !== 0) {
      return route[0];
    }
    if (initialLocation && initialLocation.latitude !== 0) {
      return initialLocation;
    }
    return null;
  }, [route, initialLocation]);

  // Formatted Date matching Strava: "5 September 2026 at 17:34 · Strava App"
  const formattedDateStr = useMemo(() => {
    const day = startDate.getDate();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = months[startDate.getMonth()];
    const year = startDate.getFullYear();
    const hours = startDate.getHours();
    const mins = startDate.getMinutes();
    const timeStr = `${hours}:${mins < 10 ? '0' : ''}${mins}`;
    return `${day} ${month} ${year} at ${timeStr} · Nouble Athletic`;
  }, [startDate]);

  // Auto-fit Map to Coordinates on Load ONLY when at least 2 points exist
  const fitMapToRoute = () => {
    if (mapRef.current && route.length >= 2) {
      try {
        mapRef.current.fitToCoordinates(route, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      } catch {}
    } else if (mapRef.current && mapInitialCoordinate) {
      mapRef.current.animateCamera({
        center: {
          latitude: mapInitialCoordinate.latitude,
          longitude: mapInitialCoordinate.longitude,
        },
        altitude: 1000,
        zoom: 17,
      }, { duration: 400 });
    }
  };

  useEffect(() => {
    if (route.length >= 2) {
      const timer = setTimeout(fitMapToRoute, 400);
      return () => clearTimeout(timer);
    }
  }, [route]);

  // ── Synthesize Splits Breakdown if empty ──
  const displaySplits: LapSplit[] = useMemo(() => {
    if (splits && splits.length > 0) return splits;
    if (distanceKm <= 0.1) return [];

    // Synthetic split for short or un-split sessions
    return [{
      lapNumber: 1,
      distanceKm: Math.round(distanceKm * 100) / 100,
      splitDistanceMeters: Math.round(distanceKm * 1000),
      splitTimeSeconds: movingTimeSeconds,
      splitPaceFormatted: sanitizedAvgPace,
      cumulativeTimeSeconds: movingTimeSeconds,
      elevationDeltaMeters: Math.round(elevationGain * 10) / 10,
      avgSpeedKmh: distanceKm > 0 && movingTimeSeconds > 0 ? Math.round(((distanceKm * 1000) / movingTimeSeconds) * 3.6 * 10) / 10 : 0,
      avgCadenceSpm: avgCadence,
      caloriesBurned: calories,
      timestamp: Date.now(),
    }];
  }, [splits, distanceKm, movingTimeSeconds, sanitizedAvgPace, elevationGain, avgCadence, calories]);

  // Calculate Rest Ratio
  const restRatioPercent = elapsedTimeSeconds > 0
    ? Math.min(100, Math.round((stoppedTimeSeconds / elapsedTimeSeconds) * 100))
    : 0;

  // ── Actions ──

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        throw new Error('يرجى تسجيل الدخول لحفظ النشاط في سجلك الرياضي');
      }

      // Payload شامل لجميع القياسات الرياضية المتقدمة
      const fullActivityData = {
        user_id: authUser.id,
        activity_type: sportType,
        total_time: elapsedTimeSeconds > 0 ? elapsedTimeSeconds : movingTimeSeconds,
        moving_time: movingTimeSeconds,
        elapsed_time: elapsedTimeSeconds,
        stopped_time: stoppedTimeSeconds,
        total_distance: Math.round(distanceKm * 100) / 100,
        total_steps: avgCadence > 0 ? Math.round((avgCadence / 60) * movingTimeSeconds) : 0,
        average_pace: sanitizedAvgPace,
        average_speed: movingTimeSeconds > 0 ? Math.round((distanceKm / (movingTimeSeconds / 3600)) * 10) / 10 : 0,
        avg_cadence: avgCadence,
        max_altitude: Math.round(maxAltitude * 10) / 10,
        elevation_gain: Math.round(elevationGain * 10) / 10,
        route_coordinates: route,
        splits: displaySplits,
        calories: calories,
        notes: notes.trim() ? `${title.trim()} — ${notes.trim()}` : title.trim(),
        altitude: maxAltitude,
      };

      let saveError: any = null;
      const { error: primaryError } = await supabase.from('activities').insert(fullActivityData);
      saveError = primaryError;

      // 🛡️ Smart Schema Fallback: إذا لم تُطبّق أعمدة الـ SQL المتقدمة بعد في Supabase
      // (PGRST204 أو 42703 أو schema cache missing column)، نحفظ بالأعمدة الأساسية فوراً لحماية تمرين المستخدم
      if (
        saveError &&
        (saveError.code === 'PGRST204' ||
          saveError.code === '42703' ||
          saveError.message?.includes('schema cache') ||
          saveError.message?.includes('column'))
      ) {
        console.warn('⚠️ Supabase schema cache missing advanced columns. Retrying with legacy base columns...');
        const legacyActivityData = {
          user_id: authUser.id,
          activity_type: sportType,
          total_time: elapsedTimeSeconds > 0 ? elapsedTimeSeconds : movingTimeSeconds,
          total_distance: Math.round(distanceKm * 100) / 100,
          total_steps: avgCadence > 0 ? Math.round((avgCadence / 60) * movingTimeSeconds) : 0,
          average_pace: sanitizedAvgPace,
          average_speed: movingTimeSeconds > 0 ? Math.round((distanceKm / (movingTimeSeconds / 3600)) * 10) / 10 : 0,
          route_coordinates: route,
          calories: calories,
          notes: notes.trim() ? `${title.trim()} — ${notes.trim()}` : title.trim(),
          altitude: maxAltitude,
        };

        const { error: fallbackError } = await supabase.from('activities').insert(legacyActivityData);
        saveError = fallbackError;
      }

      if (saveError) throw saveError;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('تم الحفظ بنجاح! 🏆', 'تمت إضافة تمرينك إلى سجلك الرياضي وتحديث إحصائياتك.', [
        {
          text: 'الانتقال إلى الرئيسية',
          onPress: () => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'Tabs' }],
            });
          },
        },
      ]);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('خطأ أثناء الحفظ', err.message || 'تعذر حفظ النشاط في قاعدة البيانات.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const message = `🏃 ${title}\n📍 ${startLocationName}\n📏 Distance: ${distanceKm.toFixed(2)} km\n⏱️ Moving Time: ${formatStravaDuration(movingTimeSeconds)}\n⚡ Pace: ${sanitizedAvgPace} /km\n⛰️ Elevation: +${Math.round(elevationGain)}m\n🔥 Calories: ${calories} kcal\n\nTracked with Nouble Athletic (Strava-Grade Engine)`;
      await Share.share({ message });
    } catch {}
  };

  const handleDeleteWorkout = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'حذف النشاط',
      'هل أنت متأكد من رغبتك في حذف هذا التمرين نهائياً من السجل؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف النشاط',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true);
              if (existingWorkoutId) {
                await supabase.from('activities').delete().eq('id', existingWorkoutId);
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              navigation.goBack();
            } catch (err: any) {
              Alert.alert('خطأ', 'تعذر حذف النشاط من قاعدة البيانات');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleDiscard = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'تجاهل التمرين؟ (Discard)',
      'هل أنت متأكد من رغبتك في تجاهل هذا النشاط؟ لن يتم تسجيل المسار أو الإحصائيات.',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تجاهل النشاط',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            navigation.reset({
              index: 0,
              routes: [{ name: 'Tabs' }],
            });
          },
        },
      ]
    );
  };

  return (
    <View style={styles.safeArea}>
      {/* ── Top Header Navigation Bar (Close purely goes back) ── */}
      <View
        style={[
          styles.navBar,
          { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 48 : 16) },
        ]}
      >
        <TouchableOpacity
          style={styles.navBackBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Workout Summary</Text>
        <TouchableOpacity
          style={styles.navShareBtn}
          onPress={handleShare}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="share-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Athlete Identity & Context Header (Strava 1:1) ── */}
        <View style={styles.athleteHeader}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.athleteAvatar} />
          ) : (
            <View style={[styles.athleteAvatarFallback, { borderColor: accent }]}>
              <Ionicons name="person" size={24} color="#FFFFFF" />
            </View>
          )}
          <View style={styles.athleteInfo}>
            <Text style={styles.athleteName}>
              {user?.full_name || user?.username || 'Athlete'}
            </Text>
            <Text style={styles.athleteDate}>{formattedDateStr}</Text>
            <View style={styles.locationBadgeRow}>
              <Ionicons
                name={sportType === 'trail' ? 'trail-sign' : (sportType === 'run' ? 'walk' : 'footsteps')}
                size={13}
                color={accent}
              />
              <Text style={styles.locationBadgeText}>{startLocationName}</Text>
            </View>
          </View>
        </View>

        {/* ── 2. Editable Activity Title & Notes ── */}
        <View style={styles.titleCard}>
          <View style={styles.titleRow}>
            {isEditingTitle ? (
              <TextInput
                style={styles.titleInput}
                value={title}
                onChangeText={setTitle}
                autoFocus
                onBlur={() => setIsEditingTitle(false)}
                onSubmitEditing={() => setIsEditingTitle(false)}
                returnKeyType="done"
              />
            ) : (
              <TouchableOpacity
                style={styles.titleTouchable}
                onPress={() => setIsEditingTitle(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.activityTitle}>{title}</Text>
                <Ionicons name="pencil" size={16} color="#8E929B" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            )}
          </View>

          <TextInput
            style={styles.notesInput}
            placeholder="How did it feel? Add notes, weather, or shoes..."
            placeholderTextColor="#636773"
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={300}
          />
        </View>

        {/* ── 3. Hero Metrics Row (4 Columns - Strava Image 5 1:1) ── */}
        <View style={styles.heroMetricsCard}>
          <View style={styles.heroCol}>
            <Text style={styles.heroColLbl}>Distance</Text>
            <Text style={styles.heroColVal}>{distanceKm.toFixed(2)} km</Text>
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.heroCol}>
            <Text style={styles.heroColLbl}>Pace</Text>
            <Text style={styles.heroColVal}>
              {sanitizedAvgPace}
              {sanitizedAvgPace !== '-:--' ? ' /km' : ''}
            </Text>
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.heroCol}>
            <Text style={styles.heroColLbl}>Time</Text>
            <Text style={styles.heroColVal}>{formatStravaDuration(movingTimeSeconds)}</Text>
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.heroCol}>
            <Text style={styles.heroColLbl}>{elevationGain > 0 ? 'Elev Gain' : 'Effort'}</Text>
            <Text style={[styles.heroColVal, { color: distanceKm >= 0.1 ? accent : '#8E929B' }]}>
              {elevationGain > 0 ? `+${Math.round(elevationGain)}m` : (distanceKm >= 0.1 ? '⚡ Optimal' : '--')}
            </Text>
          </View>
        </View>

        {/* ── 4. Achievement / Cadence Banner ── */}
        {distanceKm >= 0.10 ? (
          <View style={styles.achievementBanner}>
            <View style={styles.achievementIconWrap}>
              <Ionicons
                name={avgCadence >= 160 ? 'ribbon' : (elevationGain > 50 ? 'trending-up' : 'flame')}
                size={20}
                color={accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.achievementTitle}>
                {avgCadence >= 160
                  ? 'Optimal Cadence Target Zone!'
                  : (elevationGain > 50 ? 'Elevation Climber Workout!' : 'High-Efficiency Athletic Burn')}
              </Text>
              <Text style={styles.achievementDesc}>
                {avgCadence > 0 ? `${avgCadence} SPM Rhythm · ${calories} kcal consumed` : `${calories} kcal ACSM Energy Burned`}
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.achievementBanner, { backgroundColor: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255, 255, 255, 0.05)' }]}>
            <View style={[styles.achievementIconWrap, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#8E929B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.achievementTitle, { color: '#8E929B' }]}>Stationary / Short Workout</Text>
              <Text style={styles.achievementDesc}>Distance is below 0.10 km · Kinematic filter engaged</Text>
            </View>
          </View>
        )}

        {/* ── 5. Auto Bounding Box Map View ── */}
        <View style={styles.mapCard}>
          <View style={styles.mapHeaderRow}>
            <Text style={styles.mapCardTitle}>Route Map</Text>
            <TouchableOpacity
              style={styles.mapToggleBtn}
              onPress={() => setMapType((p) => (p === 'standard' ? 'satellite' : 'standard'))}
            >
              <Ionicons
                name={mapType === 'satellite' ? 'map-outline' : 'earth'}
                size={14}
                color="#FFFFFF"
              />
              <Text style={styles.mapToggleText}>
                {mapType === 'satellite' ? 'Map' : 'Satellite'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.mapCanvasWrap}>
            {mapInitialCoordinate ? (
              <>
                <MapView
                  ref={mapRef}
                  style={styles.mapView}
                  provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                  mapType={mapType}
                  userInterfaceStyle="dark"
                  scrollEnabled={true}
                  zoomEnabled={true}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  initialRegion={{
                    latitude: mapInitialCoordinate.latitude,
                    longitude: mapInitialCoordinate.longitude,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                  }}
                  onMapReady={fitMapToRoute}
                >
                  {route.length >= 2 && (
                    <Polyline
                      coordinates={route}
                      strokeColor={accent}
                      strokeWidth={4.5}
                      lineCap="round"
                      lineJoin="round"
                      geodesic={true}
                      zIndex={10}
                    />
                  )}

                  {/* Start / Single Location Marker */}
                  <Marker
                    coordinate={mapInitialCoordinate}
                    anchor={{ x: 0.5, y: 0.5 }}
                    centerOffset={Platform.OS === 'ios' ? { x: 0, y: 9 } : undefined}
                    zIndex={15}
                  >
                    <View style={styles.startMarkerPuck} />
                  </Marker>

                  {/* Finish Dot if route has 2+ points */}
                  {route.length >= 2 && (
                    <Marker
                      coordinate={route[route.length - 1]}
                      anchor={{ x: 0.5, y: 0.5 }}
                      centerOffset={Platform.OS === 'ios' ? { x: 0, y: 9 } : undefined}
                      zIndex={20}
                    >
                      <View style={[styles.finishMarkerPuck, { borderColor: accent }]}>
                        <Ionicons name="flag" size={11} color="#FFFFFF" />
                      </View>
                    </Marker>
                  )}
                </MapView>

                {route.length < 2 && (
                  <View style={styles.indoorRouteBadge}>
                    <Ionicons name="walk-outline" size={14} color="#FFAA00" />
                    <Text style={styles.indoorRouteBadgeText}>
                      Stationary / Indoor Session (No GPS Track)
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.noRoutePlaceholder}>
                <Ionicons name="map-outline" size={36} color="#4E5360" />
                <Text style={styles.noRouteTitle}>No Route Recorded</Text>
                <Text style={styles.noRouteSub}>Indoor or Stationary Workout</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── 6. Deep Athletic Telemetry Cards (2x3 Grid) ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Performance Analytics</Text>
        </View>

        <View style={styles.telemetryGrid}>
          {/* Card 1: Moving Time vs Elapsed Time */}
          <View style={styles.telemetryCard}>
            <Text style={styles.telemetryCardLbl}>Moving Time</Text>
            <Text style={styles.telemetryCardVal}>{formatFullTime(movingTimeSeconds)}</Text>
            <Text style={styles.telemetryCardSub}>Elapsed: {formatFullTime(elapsedTimeSeconds)}</Text>
          </View>

          {/* Card 2: Rest Time & Ratio */}
          <View style={styles.telemetryCard}>
            <Text style={styles.telemetryCardLbl}>Rest Time</Text>
            <Text style={styles.telemetryCardVal}>{formatFullTime(stoppedTimeSeconds)}</Text>
            <Text style={styles.telemetryCardSub}>{restRatioPercent}% of session</Text>
          </View>

          {/* Card 3: Avg Cadence */}
          <View style={styles.telemetryCard}>
            <Text style={styles.telemetryCardLbl}>Avg Cadence</Text>
            <Text style={styles.telemetryCardVal}>{avgCadence > 0 ? `${avgCadence} SPM` : '--'}</Text>
            <Text style={[styles.telemetryCardSub, { color: avgCadence >= 160 ? STRAVA_EMERALD : '#8E929B' }]}>
              {avgCadence >= 160 ? 'Optimal Rhythm' : 'Natural Stride'}
            </Text>
          </View>

          {/* Card 4: Max Altitude */}
          <View style={styles.telemetryCard}>
            <Text style={styles.telemetryCardLbl}>Max Altitude</Text>
            <Text style={styles.telemetryCardVal}>{maxAltitude > 0 ? `${Math.round(maxAltitude)} m` : '--'}</Text>
            <Text style={styles.telemetryCardSub}>+D: +{Math.round(elevationGain)}m</Text>
          </View>

          {/* Card 5: Calories */}
          <View style={styles.telemetryCard}>
            <Text style={styles.telemetryCardLbl}>Calories Burned</Text>
            <Text style={styles.telemetryCardVal}>{calories} kcal</Text>
            <Text style={styles.telemetryCardSub}>ACSM MET Formula</Text>
          </View>

          {/* Card 6: Average Speed */}
          <View style={styles.telemetryCard}>
            <Text style={styles.telemetryCardLbl}>Avg Speed</Text>
            <Text style={styles.telemetryCardVal}>
              {movingTimeSeconds > 0 ? ((distanceKm / (movingTimeSeconds / 3600)).toFixed(1)) : '0.0'} km/h
            </Text>
            <Text style={styles.telemetryCardSub}>Moving velocity</Text>
          </View>
        </View>

        {/* ── 7. Interactive Kilometer Splits Table ── */}
        <View style={styles.splitsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Kilometer Splits</Text>
            <Text style={styles.splitsSubTitle}>1.00 km intervals</Text>
          </View>

          <View style={styles.splitsCard}>
            <View style={styles.splitsTableHeader}>
              <Text style={[styles.splitsTh, { width: 44 }]}>KM</Text>
              <Text style={[styles.splitsTh, { flex: 1 }]}>PACE</Text>
              <Text style={[styles.splitsTh, { width: 75, textAlign: 'center' }]}>ELEV</Text>
              <Text style={[styles.splitsTh, { width: 65, textAlign: 'right' }]}>CADENCE</Text>
            </View>

            {displaySplits.length > 0 ? (
              displaySplits.map((split, idx) => {
                // Relative pace bar calculation
                const paceMatch = split.splitPaceFormatted.match(/^(\d+):(\d+)$/);
                let paceSec = 360;
                if (paceMatch) paceSec = parseInt(paceMatch[1], 10) * 60 + parseInt(paceMatch[2], 10);
                const barWidthPercent = Math.max(20, Math.min(100, (600 / Math.max(240, paceSec)) * 75));

                return (
                  <View key={idx} style={[styles.splitsRow, idx === displaySplits.length - 1 ? { borderBottomWidth: 0 } : null]}>
                    <Text style={[styles.splitsTdKm, { width: 44 }]}>{split.lapNumber || idx + 1}</Text>
                    
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.splitsTdPace}>{split.splitPaceFormatted} /km</Text>
                      <View style={styles.splitsBarBg}>
                        <View style={[styles.splitsBarFill, { width: `${barWidthPercent}%`, backgroundColor: accent }]} />
                      </View>
                    </View>

                    <Text style={[styles.splitsTdElev, { width: 75, textAlign: 'center' }]}>
                      {split.elevationDeltaMeters >= 0 ? `+${Math.round(split.elevationDeltaMeters)}m` : `${Math.round(split.elevationDeltaMeters)}m`}
                    </Text>

                    <Text style={[styles.splitsTdCadence, { width: 65, textAlign: 'right' }]}>
                      {split.avgCadenceSpm > 0 ? `${split.avgCadenceSpm}` : '--'}
                    </Text>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptySplitsWrap}>
                <Ionicons name="speedometer-outline" size={20} color="#636773" style={{ marginBottom: 4 }} />
                <Text style={styles.emptySplitsText}>
                  No splits recorded (Distance &lt; 1.00 km)
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── 8. Action Buttons Dock ── */}
        <View style={styles.actionSection}>
          {!isExistingWorkout && (
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: accent }]}
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.88}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.saveButtonText}>حفظ النشاط في سجلك</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.secondaryActionRow}>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShare}
              activeOpacity={0.8}
            >
              <Ionicons name="share-social-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.shareButtonText}>مشاركة</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.discardButton}
              onPress={isExistingWorkout ? handleDeleteWorkout : handleDiscard}
              disabled={isDeleting}
              activeOpacity={0.8}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#FF4D4D" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={18} color="#FF4D4D" style={{ marginRight: 6 }} />
                  <Text style={styles.discardButtonText}>
                    {isExistingWorkout ? 'حذف النشاط' : 'تجاهل'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────
// Stylesheet
// ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: STRAVA_BG,
  },
  container: {
    flex: 1,
    backgroundColor: STRAVA_BG,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // ── Nav Bar ──
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: STRAVA_CARD_BORDER,
  },
  navBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: STRAVA_CARD_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  navShareBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: STRAVA_CARD_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── 1. Athlete Header ──
  athleteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 14,
  },
  athleteAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  athleteAvatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: STRAVA_CARD_BG,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  athleteInfo: {
    marginLeft: 14,
    flex: 1,
  },
  athleteName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  athleteDate: {
    color: '#8E929B',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  locationBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  locationBadgeText: {
    color: '#8E929B',
    fontSize: 12,
    fontWeight: '600',
  },

  // ── 2. Title & Notes Card ──
  titleCard: {
    backgroundColor: STRAVA_CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: STRAVA_CARD_BORDER,
    padding: 16,
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  titleTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activityTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  titleInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    borderBottomWidth: 1.5,
    borderBottomColor: STRAVA_ORANGE,
    paddingVertical: 4,
  },
  notesInput: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    paddingTop: 4,
  },

  // ── 3. Hero Metrics Row (4 Columns) ──
  heroMetricsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: STRAVA_CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: STRAVA_CARD_BORDER,
    paddingVertical: 18,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  heroCol: {
    flex: 1,
    alignItems: 'center',
  },
  heroColLbl: {
    color: '#8E929B',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  heroColVal: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  heroDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },

  // ── 4. Achievement Banner ──
  achievementBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 12,
    marginBottom: 16,
    gap: 12,
  },
  achievementIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  achievementTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  achievementDesc: {
    color: '#8E929B',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },

  // ── 5. Map Card ──
  mapCard: {
    backgroundColor: STRAVA_CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: STRAVA_CARD_BORDER,
    overflow: 'hidden',
    marginBottom: 16,
  },
  mapHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  mapCardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  mapToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  mapToggleText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  mapCanvasWrap: {
    width: '100%',
    height: 240,
    backgroundColor: '#1E232B',
  },
  mapView: {
    ...StyleSheet.absoluteFill,
  },
  startMarkerPuck: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2ECC71',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  finishMarkerPuck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#111317',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indoorRouteBadge: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(14, 16, 21, 0.90)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 170, 0, 0.35)',
  },
  indoorRouteBadgeText: {
    color: '#FFAA00',
    fontSize: 11,
    fontWeight: '700',
  },
  noRoutePlaceholder: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#14171E',
  },
  noRouteTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  noRouteSub: {
    color: '#8E929B',
    fontSize: 12,
    marginTop: 4,
  },
  emptySplitsWrap: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySplitsText: {
    color: '#8E929B',
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Section Titles ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  // ── 6. Telemetry Grid (2x3) ──
  telemetryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  telemetryCard: {
    width: (SCREEN_WIDTH - 32 - 10) / 2,
    backgroundColor: STRAVA_CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: STRAVA_CARD_BORDER,
    padding: 14,
  },
  telemetryCardLbl: {
    color: '#8E929B',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  telemetryCardVal: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  telemetryCardSub: {
    color: '#8E929B',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },

  // ── 7. Splits Table ──
  splitsSection: {
    marginBottom: 20,
  },
  splitsSubTitle: {
    color: '#8E929B',
    fontSize: 12,
    fontWeight: '500',
  },
  splitsCard: {
    backgroundColor: STRAVA_CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: STRAVA_CARD_BORDER,
    overflow: 'hidden',
  },
  splitsTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: STRAVA_CARD_BORDER,
  },
  splitsTh: {
    color: '#8E929B',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  splitsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  splitsTdKm: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  splitsTdPace: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  splitsBarBg: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 4,
  },
  splitsBarFill: {
    height: 4,
    borderRadius: 2,
  },
  splitsTdElev: {
    color: '#8E929B',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  splitsTdCadence: {
    color: '#8E929B',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // ── 8. Action Buttons Dock ──
  actionSection: {
    marginTop: 10,
    gap: 10,
  },
  saveButton: {
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: STRAVA_ORANGE,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  secondaryActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shareButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: STRAVA_CARD_BG,
    borderWidth: 1,
    borderColor: STRAVA_CARD_BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  discardButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 77, 77, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 77, 0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardButtonText: {
    color: '#FF4D4D',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default WorkoutSummaryScreen;
