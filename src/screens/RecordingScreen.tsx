import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Dimensions,
  TouchableOpacity,
  Platform,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, {
  Polyline,
  Marker,
  PROVIDER_GOOGLE,
  Region,
} from 'react-native-maps';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
  FadeInDown,
  FadeOutUp,
} from 'react-native-reanimated';
import {
  GestureHandlerRootView,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { useSensorFusion } from '../hooks/useSensorFusion';
import { calculateHaversineDistanceMeters } from '../utils/KalmanGPS';
import { LapSplit } from '../utils/RunningEngine';
import { supabase } from '../lib/supabase';
import MapSettingsModal, { MapSettings } from '../components/MapSettingsModal';
import { useAudioStore } from '../store/useAudioStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const LOCATION_TASK_NAME = 'nouble-bg-location-task';
const KEEP_AWAKE_TAG = 'NOUBLE_STRAVA_TRACKING';

// ── Strava Palette Tokens ──
const STRAVA_ORANGE = '#FC5200';
const STRAVA_BLUE = '#00A3FF';
const STRAVA_GREEN = '#2ECC71';
const STRAVA_EMERALD = '#00D084';
const STRAVA_CARD_BG = '#18191E';
const STRAVA_MAP_BASE = '#12161A';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const CIRCLE_RADIUS = 32;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS; // ~201.06

// ── Instant Fallback Initial Region (Prevents Black Map on Start) ──
const DEFAULT_INITIAL_REGION: Region = {
  latitude: 36.7538,
  longitude: 3.0588,
  latitudeDelta: 0.009,
  longitudeDelta: 0.009,
};

// ─────────────────────────────────────────────────────────────────
// Background Location Task Definition
// ─────────────────────────────────────────────────────────────────
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) return;
});

// ─────────────────────────────────────────────────────────────────
// Strava Dark Minimalist Map Style (Google Maps Android only)
// ─────────────────────────────────────────────────────────────────
const STRAVA_DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#12161A' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7E8B9B' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#12161A' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#252F3B' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#CFD7E2' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#242D38' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#667484' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#12161A' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#2A3542' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#334050' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#212A35' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17262B' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#455E6B' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#152522', visibility: 'simplified' }] },
];

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
const formatTime = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${m < 10 ? '0' : ''}${m}:${sec < 10 ? '0' : ''}${sec}`
    : `${m < 10 ? '0' : ''}${m}:${sec < 10 ? '0' : ''}${sec}`;
};

const formatPace = (speedKmh: number): string => {
  if (speedKmh < 0.3) return "0:00";
  const paceMin = 60 / speedKmh;
  const mins = Math.floor(paceMin);
  const secs = Math.round((paceMin - mins) * 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const formatAveragePace = (movingSeconds: number, distanceKm: number): string => {
  if (distanceKm <= 0 || movingSeconds <= 0) return "-:--";
  const paceSecondsPerKm = movingSeconds / distanceKm;
  const mins = Math.floor(paceSecondsPerKm / 60);
  const secs = Math.round(paceSecondsPerKm % 60);
  if (mins >= 60) return "-:--";
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};


// ─────────────────────────────────────────────────────────────────
// Memoized Tracking Map Component (100% iOS & Android Safe)
// ─────────────────────────────────────────────────────────────────
interface ThemedTrackingMapProps {
  userLocation: { latitude: number; longitude: number } | null;
  compassHeading: number;
  route: { latitude: number; longitude: number }[];
  accentColor: string;
  mapType: 'standard' | 'satellite';
  isFollowingUser: boolean;
  is3D: boolean;
  onPanDrag: () => void;
  onMapBearingChange?: (bearing: number) => void;
  mapRef: React.RefObject<MapView | null>;
}

const ThemedTrackingMap = React.memo<ThemedTrackingMapProps>(
  ({
    userLocation,
    compassHeading,
    route,
    accentColor,
    mapType,
    isFollowingUser,
    is3D,
    onPanDrag,
    onMapBearingChange,
    mapRef,
  }) => {
    const [isMapReady, setIsMapReady] = useState(false);
    const [currentMapBearing, setCurrentMapBearing] = useState(0);

    // Initial camera region with immediate fallback
    const initialRegion: Region = useMemo(() => {
      if (userLocation && userLocation.latitude !== 0) {
        return {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.009,
          longitudeDelta: 0.009,
        };
      }
      return DEFAULT_INITIAL_REGION;
    }, []);

    // 🚀 Camera Flight Control: Distinguishes programmatic animation from user gesture
    const isProgrammaticFlightRef = useRef(false);
    const flightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const triggerFlight = useCallback((cameraConfig: any, duration = 400) => {
      if (!mapRef.current) return;
      isProgrammaticFlightRef.current = true;
      if (flightTimerRef.current) clearTimeout(flightTimerRef.current);
      mapRef.current.animateCamera(cameraConfig, { duration });
      flightTimerRef.current = setTimeout(() => {
        isProgrammaticFlightRef.current = false;
      }, duration + 150);
    }, [mapRef]);

    // 🚀 Auto-Follow Physics: Only animates when isFollowingUser is explicitly TRUE
    const prevCameraCenterRef = useRef<{ latitude: number; longitude: number } | null>(null);

    useEffect(() => {
      if (!isMapReady || !isFollowingUser || !userLocation || !mapRef.current) return;

      const hasMoved =
        !prevCameraCenterRef.current ||
        Math.abs(prevCameraCenterRef.current.latitude - userLocation.latitude) > 0.00001 ||
        Math.abs(prevCameraCenterRef.current.longitude - userLocation.longitude) > 0.00001;

      if (hasMoved) {
        prevCameraCenterRef.current = userLocation;
        if (Platform.OS === 'ios') {
          triggerFlight(
            {
              center: {
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
              },
              altitude: 800, // Standard street/building athletic view (Strava benchmark)
              pitch: is3D ? 50 : 0,
              heading: is3D ? (compassHeading || 0) : 0,
            },
            400
          );
        } else {
          triggerFlight(
            {
              center: {
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
              },
              zoom: 17.5,
              pitch: is3D ? 50 : 0,
              heading: is3D ? (compassHeading || 0) : 0,
            },
            400
          );
        }
      }
    }, [isMapReady, isFollowingUser, userLocation?.latitude, userLocation?.longitude, is3D, compassHeading, triggerFlight]);

    return (
      <MapView
        ref={mapRef}
        style={[
          StyleSheet.absoluteFillObject,
          { width: SCREEN_WIDTH, height: '100%' },
        ]}
        // 🚀 CRITICAL FIX: Use undefined on iOS so Apple Maps uses native Metal rendering (NO BLACK SCREEN)
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        // 🚀 CRITICAL FIX: Only pass Google customMapStyle on Android. iOS Apple Maps natively uses userInterfaceStyle="dark"
        customMapStyle={
          Platform.OS === 'android' && mapType === 'standard'
            ? STRAVA_DARK_MAP_STYLE
            : undefined
        }
        userInterfaceStyle="dark"
        mapType={mapType}
        initialRegion={initialRegion}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsPointsOfInterest={false}
        showsBuildings={true}
        userLocationPriority="high"
        userLocationUpdateInterval={1000}
        userLocationFastestInterval={500}
        loadingEnabled={Platform.OS === 'android'}
        loadingIndicatorColor={STRAVA_ORANGE}
        loadingBackgroundColor={Platform.OS === 'android' ? STRAVA_MAP_BASE : undefined}
        onMapReady={() => setIsMapReady(true)}
        onTouchStart={() => {
          onPanDrag();
        }}
        onPanDrag={() => {
          onPanDrag();
        }}
        onDoublePress={() => {
          onPanDrag();
        }}
        onRegionChangeStart={() => {
          if (!isProgrammaticFlightRef.current) {
            onPanDrag();
          }
        }}
        onRegionChange={() => {
          if (!isProgrammaticFlightRef.current) {
            onPanDrag();
          }
        }}
        onRegionChangeComplete={async () => {
          if (!isProgrammaticFlightRef.current) {
            onPanDrag();
          }
          if (mapRef.current) {
            try {
              const camera = await mapRef.current.getCamera();
              if (camera && typeof camera.heading === 'number') {
                setCurrentMapBearing(camera.heading);
                onMapBearingChange?.(camera.heading);
              }
            } catch {}
          }
        }}
      >
        {/* Strava Polyline */}
        {route.length > 1 && (
          <Polyline
            coordinates={route}
            strokeColor={accentColor}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            zIndex={10}
            geodesic={true}
          />
        )}

        {/* Start Point Marker (Iconic Strava Green Dot) */}
        {route.length > 0 && (
          <Marker
            coordinate={route[0]}
            anchor={{ x: 0.5, y: 0.5 }}
            centerOffset={Platform.select({
              ios: { x: 0, y: 9 }, // 🚀 Counter-balances MapKit's default -9px (-18/2) pin offset on iOS
              android: { x: 0, y: 0 },
            })}
            flat={Platform.OS === 'android'}
            zIndex={15}
            tracksViewChanges={false}
          >
            <View style={mapMarkerStyles.startGreenPuck} />
          </Marker>
        )}
      </MapView>
    );
  },
  (prev, next) => {
    if (prev.accentColor !== next.accentColor) return false;
    if (prev.mapType !== next.mapType) return false;
    if (prev.isFollowingUser !== next.isFollowingUser) return false;
    if (prev.is3D !== next.is3D) return false;
    if (prev.compassHeading !== next.compassHeading) return false;
    if (prev.route.length !== next.route.length) return false;
    if (prev.userLocation?.latitude !== next.userLocation?.latitude) return false;
    if (prev.userLocation?.longitude !== next.userLocation?.longitude) return false;
    return true;
  }
);

const mapMarkerStyles = StyleSheet.create({
  startGreenPuck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: STRAVA_GREEN,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.45,
        shadowRadius: 4,
      },
      android: {
        elevation: 6,
      },
    }),
  },
});

// ─────────────────────────────────────────────────────────────────
// Save Activity Modal
// ─────────────────────────────────────────────────────────────────
interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  onShare: (caption: string) => void;
  isSaving: boolean;
  data: {
    type: 'run' | 'walk' | 'trail';
    time: number;
    distance: number;
    steps: number;
    pace: string;
  };
}

const ShareModal = ({ visible, onClose, onShare, isSaving, data }: ShareModalProps) => {
  const [caption, setCaption] = useState('');
  const accent = data.type === 'trail' ? STRAVA_EMERALD : (data.type === 'run' ? STRAVA_ORANGE : STRAVA_BLUE);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
      <SafeAreaView style={sms.wrap}>
        <View style={sms.sheet}>
          <View style={sms.hdr}>
            <Text style={sms.title}>حفظ النشاط في سجلي {data.type === 'trail' ? '🏔️' : (data.type === 'run' ? '🏃' : '🚶')}</Text>
            <TouchableOpacity onPress={onClose} style={sms.closeBtn} disabled={isSaving}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={[sms.statsCard, { borderColor: accent + '55' }]}>
            <View style={sms.statsRow}>
              {[
                { v: data.distance.toFixed(2), l: 'KM', c: accent },
                { v: formatTime(data.time), l: 'TIME', c: '#fff' },
                {
                  v: (data.type === 'run' || data.type === 'trail') ? data.pace : data.steps.toLocaleString(),
                  l: (data.type === 'run' || data.type === 'trail') ? 'PACE' : 'STEPS',
                  c: '#fff',
                },
              ].map(({ v, l, c }) => (
                <View key={l} style={sms.statItem}>
                  <Text style={[sms.statV, { color: c }]}>{v}</Text>
                  <Text style={sms.statL}>{l}</Text>
                </View>
              ))}
            </View>
            <View style={[sms.badge, { backgroundColor: accent + '20', borderColor: accent + '44' }]}>
              <Text style={[sms.badgeT, { color: accent }]}>
                {data.type === 'trail' ? '🏔️ Trail Run' : (data.type === 'run' ? '🏃 Run' : '🚶 Walk')}
              </Text>
            </View>
          </View>

          <TextInput
            style={sms.input}
            placeholder="أضف وصفاً أو عنواناً للنشاط (اختياري)..."
            placeholderTextColor="#888"
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={280}
          />

          <View style={sms.actions}>
            <TouchableOpacity
              style={[sms.btn, { backgroundColor: accent, flex: 1 }]}
              onPress={() => onShare(caption)}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={19} color="#fff" />
                  <Text style={sms.btnT}>حفظ النشاط (Save Activity)</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const sms = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#18191E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  hdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  title: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  statsCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 20, padding: 16, borderWidth: 1, marginBottom: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  statItem: { alignItems: 'center' },
  statV: { fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statL: { color: '#888', fontSize: 10, fontWeight: '700', marginTop: 4 },
  badge: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1, marginTop: 12 },
  badgeT: { fontSize: 12, fontWeight: '800' },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 14, color: '#fff', fontSize: 14, minHeight: 70, textAlignVertical: 'top', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 20 },
  actions: { flexDirection: 'row', gap: 12 },
  btn: { height: 52, borderRadius: 26, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  btnT: { color: '#fff', fontSize: 15, fontWeight: '800' },
});

// ─────────────────────────────────────────────────────────────────
// Main RecordingScreen Component
// ─────────────────────────────────────────────────────────────────
export const RecordingScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  // ── Audio Store ──
  const {
    currentTrack,
    isPlaying,
    togglePlay,
    nextTrack,
    setPlayerModalVisible,
    setMiniPlayerSuppressed,
  } = useAudioStore();

  // Suppress global root mini-player while in full-screen recording screen
  useEffect(() => {
    setMiniPlayerSuppressed(true);
    return () => {
      setMiniPlayerSuppressed(false);
    };
  }, [setMiniPlayerSuppressed]);

  // Fast-boot initial GPS fix only if strictly fresh (< 10,000ms old)
  const [cachedLocation, setCachedLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    Location.getLastKnownPositionAsync({ maxAge: 10000 })
      .then((loc) => {
        if (loc?.coords && loc.timestamp && Math.abs(Date.now() - loc.timestamp) < 10000) {
          setCachedLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      })
      .catch(() => {});
  }, []);

  // ── Activity Telemetry & State ──
  const [activityType, setActivityType] = useState<'run' | 'walk' | 'trail'>('run');
  const [trackingStatus, setTrackingStatus] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [route, setRoute] = useState<{ latitude: number; longitude: number }[]>([]);
  const [distance, setDistance] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [movingTime, setMovingTime] = useState(0);
  const [stoppedTime, setStoppedTime] = useState(0);
  const timer = movingTime; // Unified athletic moving time
  const [pace, setPace] = useState("-:--");
  const [showShare, setShowShare] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFollowingUser, setIsFollowingUser] = useState(true);
  const [is3D, setIs3D] = useState(false);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [compassHeading, setCompassHeading] = useState(0);
  const [currentMapBearing, setCurrentMapBearing] = useState(0);
  const [regionName, setRegionName] = useState<string | null>(null);
  const [showMapSettings, setShowMapSettings] = useState(false);
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);

  // ── Auto-Lap Alert ──
  const [lapAlert, setLapAlert] = useState<{ lap: number; pace: string } | null>(null);
  const lastLapRef = useRef<number>(0);

  // ── Sensor Fusion Engine (Hardware-level Tuning: BestForNavigation + Fitness) ──
  const sensor = useSensorFusion({
    gpsAccuracy: Location.Accuracy.BestForNavigation,
    activityType: Location.ActivityType.Fitness,
    maxAccuracyMeters: 14,
    minDistanceFilter: 1,
    gpsInterval: 500,
    enableBackground: true,
    mayShowUserSettingsDialog: true,
  });

  // 🚀 User Location for Map & Marker: Derived strictly from GPS Kalman fix with fast-boot cached fallback
  const userMapLocation = useMemo(() => {
    if (sensor.data.latitude !== 0 && sensor.data.longitude !== 0) {
      return {
        latitude: sensor.data.latitude,
        longitude: sensor.data.longitude,
      };
    }
    return cachedLocation;
  }, [sensor.data.latitude, sensor.data.longitude, cachedLocation]);

  // Animate camera smoothly to true location upon first verified live fix
  const hasAnimatedToFirstFixRef = useRef(false);
  useEffect(() => {
    if (!hasAnimatedToFirstFixRef.current && userMapLocation && mapRef.current) {
      hasAnimatedToFirstFixRef.current = true;
      if (Platform.OS === 'ios') {
        mapRef.current.animateCamera(
          {
            center: userMapLocation,
            altitude: 800,
            pitch: 0,
            heading: 0,
          },
          { duration: 800 }
        );
      } else {
        mapRef.current.animateCamera(
          {
            center: userMapLocation,
            zoom: 17.5,
            pitch: 0,
            heading: 0,
          },
          { duration: 800 }
        );
      }
    }
  }, [userMapLocation]);

  // Reverse Geocoding for Top Header Region Name
  useEffect(() => {
    if (userMapLocation && !regionName) {
      Location.reverseGeocodeAsync({
        latitude: userMapLocation.latitude,
        longitude: userMapLocation.longitude,
      })
        .then((places) => {
          if (places && places.length > 0) {
            const p = places[0];
            const name = p.city || p.subregion || p.district || p.name || 'Douéra';
            setRegionName(name);
          }
        })
        .catch(() => {
          setRegionName('Douéra');
        });
    }
  }, [userMapLocation, regionName]);

  // ── Stable Refs ──
  const statusRef = useRef<'idle' | 'recording' | 'paused'>('idle');
  const actTypeRef = useRef<'run' | 'walk' | 'trail'>('run');
  const lastDistancePointRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastPolylinePointRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastHeadingRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const stoppagesRef = useRef<{ id: string; start: number; duration: number; type: string }[]>([]);
  const sensorDataRef = useRef(sensor.data);
  const lastStepDistanceSnapshotRef = useRef<number>(0);
  const splitsRef = useRef<LapSplit[]>([]);
  const lastLapMovingTimeRef = useRef<number>(0);
  const lastLapElevRef = useRef<number>(0);

  useEffect(() => { statusRef.current = trackingStatus; }, [trackingStatus]);
  useEffect(() => { actTypeRef.current = activityType; }, [activityType]);
  useEffect(() => { sensorDataRef.current = sensor.data; }, [sensor.data]);

  // ─────────────────────────────────────────────────────────────────
  // 1. GPS Engine & Sequential Permission Protocol
  // ─────────────────────────────────────────────────────────────────
  const verifyGPSProtocol = useCallback(async (): Promise<boolean> => {
    try {
      const hasServices = await Location.hasServicesEnabledAsync();
      if (!hasServices) {
        setGpsErrorMsg('خدمات الموقع (GPS) معطلة على هاتفك. يرجى تفعيلها للبدء.');
        if (Platform.OS === 'android') {
          try {
            await Location.enableNetworkProviderAsync();
          } catch {}
        }
        return false;
      }

      if (Platform.OS === 'android') {
        try {
          await Location.enableNetworkProviderAsync();
        } catch {}
      }

      const fgStatus = await Location.getForegroundPermissionsAsync();
      if (fgStatus.status !== 'granted') {
        const reqFg = await Location.requestForegroundPermissionsAsync();
        if (reqFg.status !== 'granted') {
          setGpsErrorMsg('إذن الموقع مطلوب لتسجيل مسار الجري والسرعة على الخريطة.');
          return false;
        }
      }

      try {
        const bgStatus = await Location.getBackgroundPermissionsAsync();
        if (bgStatus.status !== 'granted') {
          await Location.requestBackgroundPermissionsAsync();
        }
      } catch {}

      setGpsErrorMsg(null);
      return true;
    } catch (err: any) {
      setGpsErrorMsg('حدث خطأ أثناء فحص خدمات الـ GPS: ' + (err.message ?? ''));
      return false;
    }
  }, []);

  useEffect(() => {
    verifyGPSProtocol();
  }, [verifyGPSProtocol]);

  // ─────────────────────────────────────────────────────────────────
  // 2. Compass Heading Watcher (True Heading with Mag Fallback)
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    let headingSub: Location.LocationSubscription | null = null;
    Location.watchHeadingAsync((h) => {
      // 🚀 CRITICAL: Prioritize trueHeading; fallback to magHeading if no geographical fix
      const angle = (h.trueHeading >= 0 ? h.trueHeading : h.magHeading) || 0;
      setCompassHeading(Math.round(angle));
    })
      .then((sub) => { headingSub = sub; })
      .catch(() => {});

    return () => {
      headingSub?.remove();
    };
  }, []);

  const resetToNorth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (mapRef.current) {
      mapRef.current.animateCamera({ heading: 0 }, { duration: 400 });
      setCurrentMapBearing(0);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // 3. Keep-Awake Lifecycle
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (trackingStatus === 'recording') {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } else {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    }

    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [trackingStatus]);

  // ─────────────────────────────────────────────────────────────────
  // 4. Background Location Updates
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (trackingStatus === 'recording') {
      Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).then((started) => {
        if (!started) {
          Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 500,
            distanceInterval: 1,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: 'Nouble Track (Strava Engine)',
              notificationBody: 'تسجيل مسار الجري نشط في الخلفية...',
              notificationColor: STRAVA_ORANGE,
            },
          }).catch(() => {});
        }
      }).catch(() => {});
    } else if (trackingStatus === 'idle') {
      Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).then((started) => {
        if (started) {
          Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
        }
      }).catch(() => {});
    }

    return () => {
      Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).then((started) => {
        if (started) {
          Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
        }
      }).catch(() => {});
    };
  }, [trackingStatus]);

  // ── Reanimated Values for Hold-to-Finish ──
  const holdProgress = useSharedValue(0);
  const animatedCircleProps = useAnimatedProps(() => ({
    strokeDashoffset: (1 - holdProgress.value) * CIRCLE_CIRCUMFERENCE,
  }));

  // ── Auto-Lap Split Detector (Each 1.0 km) ──
  useEffect(() => {
    if (trackingStatus !== 'recording') return;
    const currentKm = Math.floor(distance);
    if (currentKm > 0 && currentKm > lastLapRef.current) {
      lastLapRef.current = currentKm;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLapAlert({ lap: currentKm, pace });

      const lapTime = movingTime - (lastLapMovingTimeRef.current || 0);
      lastLapMovingTimeRef.current = movingTime;
      const elevDelta = sensor.data.elevationGain - (lastLapElevRef.current || 0);
      lastLapElevRef.current = sensor.data.elevationGain;

      const splitLap: LapSplit = {
        lapNumber: currentKm,
        distanceKm: currentKm,
        splitDistanceMeters: 1000,
        splitTimeSeconds: Math.max(1, lapTime),
        splitPaceFormatted: pace !== '-:--' ? pace : '5:30',
        cumulativeTimeSeconds: movingTime,
        elevationDeltaMeters: Math.round(elevDelta * 10) / 10,
        avgSpeedKmh: Math.round(sensor.data.rollingSpeedKmh * 10) / 10,
        avgCadenceSpm: sensor.data.cadenceSpm,
        caloriesBurned: Math.round(1000 * (activityType === 'trail' ? 0.09 : 0.075)),
        timestamp: Date.now(),
      };
      splitsRef.current.push(splitLap);

      const hideTimer = setTimeout(() => {
        setLapAlert(null);
      }, 4500);
      return () => clearTimeout(hideTimer);
    }
  }, [distance, trackingStatus, pace]);

  // ── Rolling Pace Calculator (Synchronized with 6-Second Window) ──
  useEffect(() => {
    if (statusRef.current === 'recording') {
      setPace(sensor.data.instantPace);
    } else if (statusRef.current === 'paused') {
      setPace("-:--");
    }
  }, [sensor.data.instantPace, trackingStatus]);

  // ── GPS Telemetry: Decoupled Outdoor Distance Accumulator & Polyline Decimation Gate ──
  useEffect(() => {
    const sd = sensor.data;
    if (statusRef.current !== 'recording') return;
    if (sd.latitude === 0 && sd.longitude === 0) return;
    if (!sd.hasValidFix) return;
    if (sd.isGPSJitter) return; // حماية صارمة من ارتعاش الـ GPS المكتبي

    const currentPoint = { latitude: sd.latitude, longitude: sd.longitude };

    // 0. التهيئة على النقطة الأولى
    if (lastDistancePointRef.current === null) {
      lastDistancePointRef.current = currentPoint;
      lastPolylinePointRef.current = currentPoint;
      lastHeadingRef.current = sd.heading || 0;
      lastStepDistanceSnapshotRef.current = sd.steps;
      setRoute([currentPoint]);
      return;
    }

    // 🚀 1. صمام أمان الأنفاق وانقطاع الإشارة (Tunnel & Blackout Guard):
    // عند الخروج من نفق أو انقطاع طويل، لا تجمع مسافة القفزة الوهمية عبر المباني
    if (sd.isBlackoutRecovery) {
      lastDistancePointRef.current = currentPoint;
      lastPolylinePointRef.current = currentPoint;
      lastHeadingRef.current = sd.heading || 0;
      lastStepDistanceSnapshotRef.current = sd.steps;
      setRoute((prev) => [...prev, currentPoint]);
      return;
    }

    // 🚀 2. حساب المسافة التراكمية الحقيقية عبر الـ GPS في الهواء الطلق
    if (sd.accuracy <= 10) {
      const distDeltaMeters = calculateHaversineDistanceMeters(lastDistancePointRef.current, currentPoint);
      lastStepDistanceSnapshotRef.current = sd.steps; // مزامنة الخطوات لمنع الازدواجية
      const minDistThreshold = (actTypeRef.current === 'trail') ? 0.6 : 1.0;
      if (distDeltaMeters >= minDistThreshold) {
        setDistance((prev) => prev + distDeltaMeters / 1000);
        lastDistancePointRef.current = currentPoint;
      }
    }

    // 🚀 3. تفريغ نقاط العرض للخريطة (Polyline Decimation Gate - Switchbacks Preservation):
    if (lastPolylinePointRef.current) {
      const renderDeltaMeters = calculateHaversineDistanceMeters(lastPolylinePointRef.current, currentPoint);
      const deltaHeading = Math.abs((sd.heading || 0) - (lastHeadingRef.current || 0));

      const isTrail = actTypeRef.current === 'trail';
      const isCurve = deltaHeading > 12;
      const isLowSpeedSharpTurn = sd.rollingSpeedMs < 2.2 && deltaHeading > 20;

      const isSwitchback = (isTrail || isLowSpeedSharpTurn) && isCurve && renderDeltaMeters >= 0.8;
      const isStandardSignificantTurn = deltaHeading > 15 && renderDeltaMeters >= 1.2;

      if (renderDeltaMeters >= 2.5 || isSwitchback || isStandardSignificantTurn) {
        lastPolylinePointRef.current = currentPoint;
        lastHeadingRef.current = sd.heading || 0;
        setRoute((prev) => [...prev, currentPoint]);
      }
    }
  }, [
    sensor.data.latitude,
    sensor.data.longitude,
    sensor.data.isBlackoutRecovery,
    sensor.data.rollingSpeedMs,
    sensor.data.heading,
    sensor.data.isGPSJitter,
    sensor.data.hasValidFix,
    sensor.data.accuracy,
  ]);

  // ── 🏃 Indoor & Degraded GPS Fallback: Pedometer Step Distance Accumulator ──
  useEffect(() => {
    if (statusRef.current !== 'recording') return;
    const sd = sensor.data;
    const currentSteps = sd.steps;

    // إذا كانت دقة الـ GPS متدهورة (> 10م) أو منعدمة (داخل الشقق والمباني والممرات)
    const isGpsDegraded = !sd.hasValidFix || sd.accuracy > 10;
    if (isGpsDegraded) {
      const stepDelta = Math.max(0, currentSteps - lastStepDistanceSnapshotRef.current);
      if (stepDelta > 0) {
        const stride = sd.strideLengthMeters || 0.75;
        const stepDistMeters = stepDelta * stride;
        setDistance((prev) => prev + stepDistMeters / 1000);
        lastStepDistanceSnapshotRef.current = currentSteps;
      }
    } else {
      // إشارة GPS قوية وموثوقة: مزامنة لقطة الخطوات لحماية المسافة من أي احتساب مزدوج
      lastStepDistanceSnapshotRef.current = currentSteps;
    }
  }, [sensor.data.steps, sensor.data.hasValidFix, sensor.data.accuracy, sensor.data.strideLengthMeters]);

  // ─────────────────────────────────────────────────────────────────
  // Workout Actions (Full Manual Control & Continuous Telemetry)
  // ─────────────────────────────────────────────────────────────────
  const startTracking = async () => {
    const ok = await verifyGPSProtocol();
    if (!ok) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setRoute([]);
    setDistance(0);
    setElapsedTime(0);
    setMovingTime(0);
    setStoppedTime(0);
    setPace("-:--");
    lastLapRef.current = 0;
    setLapAlert(null);
    lastDistancePointRef.current = null;
    lastPolylinePointRef.current = null;
    lastHeadingRef.current = 0;
    lastStepDistanceSnapshotRef.current = 0;
    splitsRef.current = [];
    lastLapMovingTimeRef.current = 0;
    lastLapElevRef.current = 0;
    stoppagesRef.current = [];
    sensor.resetKalman?.();

    sensor.resetStepCounter();
    sensor.resetAltitudeBaseline();

    setIsFollowingUser(true);
    setTrackingStatus('recording');

    timerRef.current = setInterval(() => {
      setElapsedTime((p) => p + 1);
      if (statusRef.current === 'recording') {
        const sd = sensorDataRef.current;
        // إذا كان العداء في حالة حركة مثبتة (بوابة الحركة الهستيريسية، أو سرعة حركية >= 0.35 m/s، أو وتيرة خطوات >= 35)
        if (sd.isMoving || sd.rollingSpeedMs >= 0.35 || sd.cadenceSpm >= 35) {
          setMovingTime((p) => p + 1);
        } else {
          // التوقف الطبيعي عند الإشارات أو الاستراحة دون قطع مسار الـ GPS
          setStoppedTime((p) => p + 1);
        }
      } else if (statusRef.current === 'paused') {
        setStoppedTime((p) => p + 1);
      }
    }, 1000);
  };

  const togglePause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const next = statusRef.current === 'recording' ? 'paused' : 'recording';
    setTrackingStatus(next);

    if (next === 'paused') {
      stoppagesRef.current.push({
        id: `stop_${Date.now()}`,
        start: Date.now(),
        duration: 0,
        type: 'manual_pause',
      });
    } else if (stoppagesRef.current.length > 0) {
      const last = stoppagesRef.current[stoppagesRef.current.length - 1];
      if (last && last.duration === 0) {
        last.duration = Math.max(1, Math.round((Date.now() - last.start) / 1000));
      }
    }
  };

  const stopAll = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    sensor.cleanup();
  };

  const handleFinish = () => {
    setTrackingStatus('idle');
    stopAll();

    const caloriesRate = activityType === 'trail' ? 90 : (activityType === 'run' ? 75 : 60);
    const calculatedCalories = Math.round(distance * caloriesRate);
    const calculatedAvgPace = (distance >= 0.05 && movingTime > 0)
      ? formatAveragePace(movingTime, distance)
      : '-:--';

    // Add remainder split if distance > 50m
    const currentKm = Math.floor(distance);
    const remainderDistance = distance - currentKm;
    if (remainderDistance > 0.05) {
      const lapTime = movingTime - (lastLapMovingTimeRef.current || 0);
      const elevDelta = sensor.data.elevationGain - (lastLapElevRef.current || 0);
      splitsRef.current.push({
        lapNumber: splitsRef.current.length + 1,
        distanceKm: Math.round(distance * 100) / 100,
        splitDistanceMeters: Math.round(remainderDistance * 1000),
        splitTimeSeconds: Math.max(1, lapTime),
        splitPaceFormatted: pace !== '-:--' ? pace : calculatedAvgPace,
        cumulativeTimeSeconds: movingTime,
        elevationDeltaMeters: Math.round(elevDelta * 10) / 10,
        avgSpeedKmh: Math.round(sensor.data.rollingSpeedKmh * 10) / 10,
        avgCadenceSpm: sensor.data.cadenceSpm,
        caloriesBurned: Math.round(remainderDistance * 1000 * (activityType === 'trail' ? 0.09 : 0.075)),
        timestamp: Date.now(),
      });
    }

    const workoutPayload = {
      route: [...route],
      sportType: activityType,
      distanceKm: Math.round(distance * 100) / 100,
      movingTimeSeconds: movingTime,
      elapsedTimeSeconds: elapsedTime,
      stoppedTimeSeconds: stoppedTime,
      avgPace: calculatedAvgPace,
      avgCadence: sensor.data.cadenceSpm,
      maxAltitude: sensor.data.maxAltitude || sensor.data.altitude,
      elevationGain: sensor.data.elevationGain,
      calories: calculatedCalories,
      splits: [...splitsRef.current],
      startTime: new Date(Date.now() - Math.max(1, elapsedTime) * 1000).toISOString(),
      startLocationName: regionName || 'Ouled Chebel, Algiers',
      initialLocation: userMapLocation || (route.length > 0 ? route[0] : (cachedLocation || undefined)),
    };

    // 🚀 CRITICAL FIX: Replace RecordingScreen with WorkoutSummary so underlying screen & buttons are completely unmounted
    navigation.replace('WorkoutSummary', workoutPayload);
  };

  // ── Hold-to-Finish Safe Gesture (1.8s with Immediate Cancellation) ──
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick3Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoldingRef = useRef(false);

  const clearHoldTimers = () => {
    isHoldingRef.current = false;
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (tick1Ref.current) { clearTimeout(tick1Ref.current); tick1Ref.current = null; }
    if (tick2Ref.current) { clearTimeout(tick2Ref.current); tick2Ref.current = null; }
    if (tick3Ref.current) { clearTimeout(tick3Ref.current); tick3Ref.current = null; }
  };

  const startHoldHaptics = () => {
    clearHoldTimers();
    isHoldingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    tick1Ref.current = setTimeout(() => {
      if (isHoldingRef.current) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 550);

    tick2Ref.current = setTimeout(() => {
      if (isHoldingRef.current) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, 1100);

    tick3Ref.current = setTimeout(() => {
      if (isHoldingRef.current) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, 1550);

    holdTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current) {
        clearHoldTimers();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        handleFinish();
      }
    }, 1800);
  };

  const cancelHoldFinish = () => {
    clearHoldTimers();
  };

  const holdToFinishGesture = Gesture.Pan()
    .onBegin(() => {
      runOnJS(startHoldHaptics)();
      holdProgress.value = withTiming(1, { duration: 1800, easing: Easing.linear });
    })
    .onFinalize(() => {
      runOnJS(cancelHoldFinish)();
      if (holdProgress.value < 0.99) {
        holdProgress.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
      }
    });

  // ── Save Activity to Supabase ──
  const saveActivity = async (caption: string) => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('يرجى تسجيل الدخول لحفظ النشاط');

      const finalSteps = sensor.data.totalSessionSteps;
      const finalSpeed = sensor.data.speed;
      const finalAlt = sensor.data.altitude;
      const finalPressure = sensor.data.pressure;
      const caloriesRate = activityType === 'trail' ? 90 : (activityType === 'run' ? 75 : 60);
      const calculatedCalories = Math.round(distance * caloriesRate);
      const calculatedAvgPace = (distance > 0 && movingTime > 0)
        ? formatAveragePace(movingTime, distance)
        : pace;

      const { error: ae } = await supabase.from('activities').insert({
        user_id: user.id,
        activity_type: activityType,
        total_time: elapsedTime > 0 ? elapsedTime : movingTime,
        total_distance: distance,
        total_steps: finalSteps,
        average_pace: calculatedAvgPace,
        average_speed: finalSpeed,
        route_coordinates: route,
        calories: calculatedCalories,
        notes: caption.trim() ? `${caption.trim()} (Elevation Gain: +${Math.round(sensor.data.elevationGain)}m)` : (sensor.data.elevationGain > 0 ? `Elevation Gain: +${Math.round(sensor.data.elevationGain)}m` : null),
        altitude: finalAlt,
        pressure: finalPressure,
      });

      if (ae) throw ae;

      setShowShare(false);
      setTimeout(() => navigation.navigate('Dashboard'), 250);
    } catch (err: any) {
      Alert.alert('خطأ في الحفظ', err.message ?? 'فشل حفظ النشاط.');
    } finally {
      setIsSaving(false);
    }
  };

  const accent = activityType === 'trail' ? STRAVA_EMERALD : (activityType === 'run' ? STRAVA_ORANGE : STRAVA_BLUE);
  const isPaused = trackingStatus === 'paused' || trackingStatus === 'auto-paused';

  // ─────────────────────────────────────────────────────────────────
  // Right Action Stack Handlers
  // ─────────────────────────────────────────────────────────────────
  const toggleMapType = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMapType((prev) => (prev === 'standard' ? 'satellite' : 'standard'));
  };

  const toggle3DView = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !is3D;
    setIs3D(next);
    if (mapRef.current) {
      const targetHeading = next ? (compassHeading || 0) : 0;
      mapRef.current.animateCamera(
        {
          pitch: next ? 50 : 0,
          heading: targetHeading,
        },
        { duration: 500 }
      );
      setCurrentMapBearing(targetHeading);
    }
  };

  const handleRecenter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsFollowingUser(true);
    setIs3D(false);
    setCurrentMapBearing(0);
    if (userMapLocation && mapRef.current) {
      if (Platform.OS === 'ios') {
        mapRef.current.animateCamera(
          {
            center: {
              latitude: userMapLocation.latitude,
              longitude: userMapLocation.longitude,
            },
            altitude: 800, // Standard street/building athletic view (Strava benchmark)
            pitch: 0,
            heading: 0,
          },
          { duration: 800 }
        );
      } else {
        mapRef.current.animateCamera(
          {
            center: {
              latitude: userMapLocation.latitude,
              longitude: userMapLocation.longitude,
            },
            zoom: 17.5,
            pitch: 0,
            heading: 0,
          },
          { duration: 800 }
        );
      }
    }
  };

  // Safe bottom offset calculations
  const safeBottom = Math.max(insets.bottom, 18);
  const hudBottomOffset = safeBottom + 138; // 🚀 FIX: Generous 16px+ floating gap above dock preventing any clipping
  const musicBarBottomOffset = hudBottomOffset + 116; // Sits cleanly above HUD
  const rightStackBottomOffset = hudBottomOffset + (currentTrack ? 176 : 118);

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* ── 1. Strava Dark Map Engine ── */}
      <View
        style={styles.mapContainer}
        onTouchStart={() => {
          if (isFollowingUser) {
            setIsFollowingUser(false);
          }
        }}
      >
        <ThemedTrackingMap
          mapRef={mapRef}
          userLocation={userMapLocation}
          compassHeading={compassHeading}
          route={route}
          accentColor={accent}
          mapType={mapType}
          isFollowingUser={isFollowingUser}
          is3D={is3D}
          onPanDrag={() => setIsFollowingUser(false)}
          onMapBearingChange={(b) => setCurrentMapBearing(b)}
        />
      </View>

      {/* ── 2. Top Header Bar ── */}
      <View
        style={[
          styles.topSafeArea,
          { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 48 : 16) },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <TouchableOpacity
              style={styles.circleIconBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-down" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            {regionName && (
              <Text style={styles.topRegionTitle} numberOfLines={1}>
                {regionName}
              </Text>
            )}
          </View>

          {trackingStatus === 'recording' && (
            <View style={styles.liveIndicatorPill}>
              <View style={[styles.liveDot, { backgroundColor: accent }]} />
              <Text style={[styles.liveText, { color: accent }]}>REC</Text>
            </View>
          )}

          {isPaused && (
            <View style={styles.liveIndicatorPill}>
              <View style={[styles.liveDot, { backgroundColor: '#FFAA00' }]} />
              <Text style={[styles.liveText, { color: '#FFAA00' }]}>PAUSED</Text>
            </View>
          )}

          {/* North-pointing Strava compass button with resetToNorth tap */}
          <TouchableOpacity
            style={styles.circleIconBtn}
            onPress={resetToNorth}
            activeOpacity={0.8}
          >
            <Ionicons
              name="navigate"
              size={18}
              color="#FFFFFF"
              style={{ transform: [{ rotate: `${-currentMapBearing}deg` }] }}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 3. Right Floating Action Stack (Layers, 3D, Recenter Crosshair) ── */}
      {!showMapSettings && (
        <View
          style={[styles.rightActionStack, { bottom: rightStackBottomOffset }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={styles.actionCircleBtn}
            onPress={toggleMapType}
            activeOpacity={0.8}
          >
            <Ionicons name="layers-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCircleBtn, is3D && { borderColor: STRAVA_ORANGE }]}
            onPress={toggle3DView}
            activeOpacity={0.8}
          >
            <Text style={[styles.action3DText, is3D && { color: STRAVA_ORANGE }]}>3D</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCircleBtn, isFollowingUser && { borderColor: STRAVA_ORANGE }]}
            onPress={handleRecenter}
            activeOpacity={0.8}
          >
            <Ionicons
              name="locate-outline"
              size={22}
              color={isFollowingUser ? STRAVA_ORANGE : '#FFFFFF'}
            />
          </TouchableOpacity>
        </View>
      )}

      {/* ── 4. Auto-Lap Toast Alert ── */}
      {lapAlert && (
        <Animated.View
          entering={FadeInDown.duration(300).springify()}
          exiting={FadeOutUp.duration(250)}
          style={styles.lapToast}
        >
          <Ionicons name="flash" size={18} color="#FFD60A" />
          <View>
            <Text style={styles.lapToastTitle}>KM {lapAlert.lap} COMPLETED</Text>
            <Text style={styles.lapToastSub}>Split Pace: {lapAlert.pace} /km</Text>
          </View>
        </Animated.View>
      )}

      {/* ── 5. In-Run Compact Music Bar (Floats above HUD) ── */}
      {currentTrack && (
        <View style={[styles.musicBarContainer, { bottom: musicBarBottomOffset }]}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPlayerModalVisible(true);
            }}
          >
            <Image
              source={{
                uri:
                  currentTrack.thumbnail ||
                  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100',
              }}
              style={styles.musicThumb}
              contentFit="cover"
            />
            <View style={styles.musicInfo}>
              <Text style={styles.musicTitle} numberOfLines={1}>
                {currentTrack.title}
              </Text>
              <Text style={styles.musicArtist} numberOfLines={1}>
                {currentTrack.artist}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.musicControls}>
            <TouchableOpacity
              style={styles.musicMiniBtn}
              onPress={() => togglePlay()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={16}
                color="#FFFFFF"
                style={{ marginLeft: isPlaying ? 0 : 1 }}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.musicMiniBtn}
              onPress={() => nextTrack()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="play-skip-forward" size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── 6. Central Strava Floating HUD (Raised with Clean Breathing Margin) ── */}
      <View style={[styles.stravaHudCard, { bottom: hudBottomOffset }]}>
        <View style={styles.hudTopRow}>
          <Text style={styles.hudActivityTitle}>
            {activityType === 'trail' ? 'Trail Run 🏔️' : (activityType === 'run' ? 'Run' : 'Walk')}
            {trackingStatus === 'paused' ? ' • Paused' : ''}
          </Text>
          {activityType === 'trail' ? (
            <View style={styles.trailSlopeBadge}>
              <Ionicons name="trending-up" size={13} color={STRAVA_EMERALD} />
              <Text style={styles.trailSlopeText}>
                {sensor.data.gradePercent >= 0 ? `+${sensor.data.gradePercent.toFixed(1)}%` : `${sensor.data.gradePercent.toFixed(1)}%`}
              </Text>
            </View>
          ) : (stoppedTime > 0 && trackingStatus === 'recording') ? (
            <View style={[styles.trailSlopeBadge, { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' }]}>
              <Ionicons name="timer-outline" size={12} color="#8E929B" />
              <Text style={[styles.trailSlopeText, { color: '#8E929B' }]}>
                Rest: {formatTime(stoppedTime)}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="expand-outline" size={16} color="#8E929B" />
          </TouchableOpacity>
        </View>

        <View style={styles.hudStatsRow}>
          {/* Column 1: Time */}
          <View style={styles.hudCol}>
            <Text style={styles.hudColVal}>{formatTime(movingTime)}</Text>
            <Text style={styles.hudColLbl}>{trackingStatus === 'paused' ? 'Paused' : 'Moving Time'}</Text>
          </View>

          {/* Column 2: Center Hero Pace */}
          <View style={styles.hudColCenter}>
            <Text style={styles.hudColCenterVal}>{pace}</Text>
            <Text style={styles.hudColLbl}>Pace (/km)</Text>
          </View>

          {/* Column 3: Distance */}
          <View style={styles.hudCol}>
            <Text style={styles.hudColVal}>{distance.toFixed(2)}</Text>
            <Text style={styles.hudColLbl}>Distance (km)</Text>
          </View>
        </View>

        {/* Trail Mode: Elevation Gain & % Slope Sub-Row */}
        {activityType === 'trail' && (
          <View style={styles.trailStatsSubRow}>
            <View style={styles.trailSubItem}>
              <Text style={styles.trailSubLbl}>+D GAIN</Text>
              <Text style={[styles.trailSubVal, { color: STRAVA_EMERALD }]}>
                +{Math.round(sensor.data.elevationGain)}m
              </Text>
            </View>
            <View style={styles.trailSubDivider} />
            <View style={styles.trailSubItem}>
              <Text style={styles.trailSubLbl}>SLOPE %</Text>
              <Text style={[styles.trailSubVal, { color: sensor.data.gradePercent >= 0 ? '#FFFFFF' : '#FF6B6B' }]}>
                {sensor.data.gradePercent >= 0 ? `+${sensor.data.gradePercent.toFixed(1)}%` : `${sensor.data.gradePercent.toFixed(1)}%`}
              </Text>
            </View>
            <View style={styles.trailSubDivider} />
            <View style={styles.trailSubItem}>
              <Text style={styles.trailSubLbl}>ELEVATION</Text>
              <Text style={styles.trailSubVal}>
                {Math.round(sensor.data.altitude)}m
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ── 7. Bottom Control Dock (Iconic Strava Button) ── */}
      <View style={[styles.bottomDock, { paddingBottom: safeBottom + 6 }]}>
        <View style={styles.dockGrabHandle} />

        {trackingStatus === 'idle' ? (
          <View style={styles.dockIdleRow}>
            {/* Activity Switcher (Run 🏃 -> Trail 🏔️ -> Walk 🚶) */}
            <TouchableOpacity
              style={styles.dockSideBtnWrap}
              onPress={() => {
                Haptics.selectionAsync();
                setActivityType((prev) => (prev === 'run' ? 'trail' : (prev === 'trail' ? 'walk' : 'run')));
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.dockSideCircle, {
                backgroundColor: activityType === 'trail' ? '#142A22' : (activityType === 'run' ? '#2E221C' : '#142230'),
                borderColor: activityType === 'trail' ? 'rgba(0,208,132,0.35)' : (activityType === 'run' ? 'rgba(252,82,0,0.35)' : 'rgba(0,163,255,0.35)'),
              }]}>
                <Ionicons
                  name={activityType === 'trail' ? 'trending-up' : (activityType === 'run' ? 'footsteps' : 'walk')}
                  size={24}
                  color={accent}
                />
                <View style={styles.checkedBadge}>
                  <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                </View>
              </View>
              <Text style={styles.dockSideLbl}>
                {activityType === 'trail' ? 'Trail' : (activityType === 'run' ? 'Run' : 'Walk')}
              </Text>
            </TouchableOpacity>

            {/* Giant Iconic Strava Start Button */}
            <TouchableOpacity
              style={styles.stravaPlayButton}
              onPress={startTracking}
              activeOpacity={0.9}
            >
              <Ionicons name="play" size={32} color="#FFFFFF" style={{ marginLeft: 4 }} />
            </TouchableOpacity>

            {/* Add Route Button */}
            <TouchableOpacity
              style={styles.dockSideBtnWrap}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowMapSettings(true);
              }}
              activeOpacity={0.8}
            >
              <View style={styles.dockSideCircle}>
                <Ionicons name="git-branch-outline" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.dockSideLbl}>Add Route</Text>
            </TouchableOpacity>
          </View>
        ) : trackingStatus === 'recording' ? (
          <View style={styles.dockActiveRow}>
            <TouchableOpacity
              style={styles.stravaActivePauseBtn}
              onPress={togglePause}
              activeOpacity={0.88}
            >
              <Ionicons name="pause" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.dockPausedRow}>
            <TouchableOpacity
              style={styles.resumeCircleBtn}
              onPress={togglePause}
              activeOpacity={0.85}
            >
              <Ionicons name="play" size={28} color="#FFFFFF" style={{ marginLeft: 3 }} />
              <Text style={styles.resumeBtnText}>RESUME</Text>
            </TouchableOpacity>

            <GestureDetector gesture={holdToFinishGesture}>
              <View style={styles.holdFinishContainer}>
                <Svg width={74} height={74} style={styles.holdSvg}>
                  <Circle
                    cx={37}
                    cy={37}
                    r={CIRCLE_RADIUS}
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth={4}
                    fill="transparent"
                  />
                  <AnimatedCircle
                    cx={37}
                    cy={37}
                    r={CIRCLE_RADIUS}
                    stroke={STRAVA_ORANGE}
                    strokeWidth={4.5}
                    fill="transparent"
                    strokeDasharray={CIRCLE_CIRCUMFERENCE}
                    animatedProps={animatedCircleProps}
                    strokeLinecap="round"
                    transform="rotate(-90 37 37)"
                  />
                </Svg>

                <View style={styles.holdCoreBtn}>
                  <Ionicons name="stop" size={22} color="#FFFFFF" />
                </View>
                <Text style={styles.holdTooltip}>HOLD TO FINISH</Text>
              </View>
            </GestureDetector>
          </View>
        )}
      </View>

      {/* ── 8. GPS Permission Alert Modal ── */}
      {gpsErrorMsg && (
        <Modal visible={true} transparent animationType="fade">
          <View style={styles.errorBackdrop}>
            <View style={styles.errorCard}>
              <Ionicons name="location-outline" size={38} color={STRAVA_ORANGE} />
              <Text style={styles.errorTitle}>خدمات الموقع (GPS) مطلوبة</Text>
              <Text style={styles.errorDesc}>{gpsErrorMsg}</Text>
              <View style={styles.errorActions}>
                <TouchableOpacity
                  style={[styles.errorBtn, { backgroundColor: STRAVA_ORANGE }]}
                  onPress={() => Linking.openSettings()}
                >
                  <Text style={styles.errorBtnText}>فتح إعدادات الهاتف</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.errorBtn, { backgroundColor: 'rgba(255,255,255,0.08)' }]}
                  onPress={() => verifyGPSProtocol()}
                >
                  <Text style={[styles.errorBtnText, { color: '#FFFFFF' }]}>إعادة الفحص</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ── 9. Map Settings Modal ── */}

      <MapSettingsModal
        visible={showMapSettings}
        settings={{
          mapType: mapType === 'satellite' ? 'satellite' : 'standard',
          activeHeatmap: null,
          showWaymarks: false,
          showTerrain: false,
        }}
        onClose={() => setShowMapSettings(false)}
        onChange={(s) => setMapType(s.mapType === 'satellite' ? 'satellite' : 'standard')}
      />
    </GestureHandlerRootView>
  );
};

// ─────────────────────────────────────────────────────────────────
// StyleSheet (Strava Design System 1:1)
// ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: STRAVA_MAP_BASE,
  },
  mapContainer: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    backgroundColor: STRAVA_MAP_BASE,
  },

  // ── Top Header Bar ──
  topSafeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  topRegionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 10,
    maxWidth: SCREEN_WIDTH * 0.45,
    letterSpacing: -0.2,
  },
  circleIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1E242B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  liveIndicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#1E242B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // ── Right Action Stack (Layers, 3D, Recenter Crosshair) ──
  rightActionStack: {
    position: 'absolute',
    right: 16,
    zIndex: 120,
    gap: 12,
  },
  actionCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E242B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: {
        elevation: 7,
      },
    }),
  },
  action3DText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // ── Auto-Lap Toast Alert ──
  lapToast: {
    position: 'absolute',
    top: 110,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: STRAVA_CARD_BG,
    borderWidth: 1,
    borderColor: 'rgba(252, 82, 0, 0.4)',
    zIndex: 250,
    ...Platform.select({
      ios: {
        shadowColor: STRAVA_ORANGE,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  lapToastTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  lapToastSub: {
    color: '#A0A6B2',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  // ── In-Run Compact Music Bar ──
  musicBarContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 52,
    borderRadius: 26,
    backgroundColor: STRAVA_CARD_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    zIndex: 110,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  musicThumb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#252930',
  },
  musicInfo: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },
  musicTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  musicArtist: {
    color: '#8E929B',
    fontSize: 11,
    fontWeight: '500',
  },
  musicControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  musicMiniBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#252930',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Central Strava Floating HUD ──
  stravaHudCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: STRAVA_CARD_BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingTop: 14,
    paddingBottom: 16,
    paddingHorizontal: 16,
    zIndex: 110,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  hudTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  hudActivityTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  hudStatsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  hudCol: {
    flex: 1,
    alignItems: 'center',
  },
  hudColCenter: {
    flex: 1.2,
    alignItems: 'center',
  },
  hudColVal: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    lineHeight: 28,
  },
  hudColCenterVal: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  hudColLbl: {
    color: '#8E929B',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 14,
  },
  trailSlopeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 208, 132, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 208, 132, 0.3)',
  },
  trailSlopeText: {
    color: STRAVA_EMERALD,
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  trailStatsSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  trailSubItem: {
    alignItems: 'center',
  },
  trailSubLbl: {
    color: '#8E929B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  trailSubVal: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  trailSubDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },

  // ── Bottom Control Dock ──
  bottomDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: STRAVA_CARD_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingTop: 10,
    paddingHorizontal: 24,
    zIndex: 130,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
      },
      android: {
        elevation: 14,
      },
    }),
  },
  dockGrabHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignSelf: 'center',
    marginBottom: 14,
  },

  // Idle Row
  dockIdleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  dockSideBtnWrap: {
    alignItems: 'center',
    width: 68,
  },
  dockSideCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#252930',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  checkedBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: STRAVA_ORANGE,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: STRAVA_CARD_BG,
  },
  dockSideLbl: {
    color: '#8E929B',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  stravaPlayButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: STRAVA_ORANGE,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: STRAVA_ORANGE,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.55,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
  },

  // Active In-Run Pause Bar
  dockActiveRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
  },
  stravaActivePauseBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: STRAVA_ORANGE,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: STRAVA_ORANGE,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 14,
      },
      android: {
        elevation: 10,
      },
    }),
  },

  // Paused Dual Row
  dockPausedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 8,
  },
  resumeCircleBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: STRAVA_ORANGE,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: STRAVA_ORANGE,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  resumeBtnText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  holdFinishContainer: {
    width: 74,
    height: 74,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  holdSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  holdCoreBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#252930',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  holdTooltip: {
    position: 'absolute',
    bottom: -18,
    color: '#8E929B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ── GPS Error Modal ──
  errorBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: STRAVA_CARD_BG,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorDesc: {
    color: '#A0A6B2',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  errorActions: {
    width: '100%',
    gap: 10,
  },
  errorBtn: {
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default RecordingScreen;
