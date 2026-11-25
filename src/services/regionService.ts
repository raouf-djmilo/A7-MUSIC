import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

const REGION_PREF_KEY = '@a7music_region_profile_v1';

export type RegionPermissionMode = 'pending' | 'granted' | 'auto_random';

export interface RegionProfile {
  mode: RegionPermissionMode;
  countryCode: string; // e.g. 'DZ', 'MA', 'FR', 'GLOBAL'
  countryName: string;
  updatedAt: number;
}

const DEFAULT_AUTO_REGION: RegionProfile = {
  mode: 'auto_random',
  countryCode: 'GLOBAL',
  countryName: 'Global',
  updatedAt: 0,
};

let inMemoryRegion: RegionProfile | null = null;
let promptInFlight: Promise<RegionProfile> | null = null;

function inferCountryFromTimezone(): { code: string; name: string } {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Algiers')) return { code: 'DZ', name: 'Algeria' };
    if (tz.includes('Casablanca')) return { code: 'MA', name: 'Morocco' };
    if (tz.includes('Tunis')) return { code: 'TN', name: 'Tunisia' };
    if (tz.includes('Cairo')) return { code: 'EG', name: 'Egypt' };
    if (tz.includes('Paris')) return { code: 'FR', name: 'France' };
    if (tz.includes('Riyadh')) return { code: 'SA', name: 'Saudi Arabia' };
    if (tz.includes('Dubai')) return { code: 'AE', name: 'UAE' };
  } catch {
    // Ignore Intl errors
  }
  return { code: 'GLOBAL', name: 'Global' };
}

async function detectCountryLive(): Promise<{ code: string; name: string }> {
  // 1. Try native expo-location if available in the binary
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Location = require('expo-location');
    if (Location?.requestForegroundPermissionsAsync) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted' && Location.getCurrentPositionAsync && Location.reverseGeocodeAsync) {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy?.Low || 2 });
        const places = await Location.reverseGeocodeAsync(pos.coords);
        const iso = places?.[0]?.isoCountryCode;
        const country = places?.[0]?.country;
        if (iso) {
          return { code: iso.toUpperCase(), name: country || iso.toUpperCase() };
        }
      }
    }
  } catch {
    // Fallback gracefully if expo-location native module is not bundled
  }

  // 2. Lightweight IP geolocation with 2.5s timeout
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch('https://ipwho.is/', { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.country_code) {
        return {
          code: String(data.country_code).toUpperCase(),
          name: String(data.country || data.country_code),
        };
      }
    }
  } catch {
    // Fallback to device timezone
  }

  return inferCountryFromTimezone();
}

export async function getRegionProfile(): Promise<RegionProfile> {
  if (inMemoryRegion) return inMemoryRegion;
  try {
    const raw = await AsyncStorage.getItem(REGION_PREF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RegionProfile;
      if (parsed?.mode) {
        inMemoryRegion = parsed;
        return parsed;
      }
    }
  } catch {
    // Ignore storage read error
  }
  return { ...DEFAULT_AUTO_REGION, mode: 'pending' };
}

/**
 * Prompts the user once for Location/Region permission so Top Music can tailor
 * regional charts & artists (e.g. Algeria) or fall back to Auto Random if declined.
 */
export async function promptForRegionAccessIfNeeded(): Promise<RegionProfile> {
  const existing = await getRegionProfile();
  if (existing.mode !== 'pending') return existing;

  if (promptInFlight) return promptInFlight;

  promptInFlight = new Promise<RegionProfile>((resolve) => {
    Alert.alert(
      'تخصيص الموسيقى حسب موقعك 📍',
      'هل تسمح باستخدام منطقتك لاقتراح أحدث الأغاني والفنانين الرائجين بالقرب منك؟ إذا اخترت الرفض، سيعمل التطبيق بالوضع العشوائي التلقائي.',
      [
        {
          text: 'عشوائي تلقائي',
          style: 'cancel',
          onPress: async () => {
            const profile: RegionProfile = {
              mode: 'auto_random',
              countryCode: 'GLOBAL',
              countryName: 'Global',
              updatedAt: Date.now(),
            };
            inMemoryRegion = profile;
            await AsyncStorage.setItem(REGION_PREF_KEY, JSON.stringify(profile)).catch(() => {});
            promptInFlight = null;
            resolve(profile);
          },
        },
        {
          text: 'السماح بالموقع',
          onPress: async () => {
            const detected = await detectCountryLive();
            const profile: RegionProfile = {
              mode: 'granted',
              countryCode: detected.code,
              countryName: detected.name,
              updatedAt: Date.now(),
            };
            inMemoryRegion = profile;
            await AsyncStorage.setItem(REGION_PREF_KEY, JSON.stringify(profile)).catch(() => {});
            promptInFlight = null;
            resolve(profile);
          },
        },
      ],
      { cancelable: false }
    );
  });

  return promptInFlight;
}

/**
 * Builds 100% dynamic, ZERO-hardcoded-artist search vectors based on user's region.
 */
export function getRegionSeedQueries(region: RegionProfile): {
  trending: string[];
  stations: string[];
  chill: string[];
  energy: string[];
} {
  if (region.mode === 'granted') {
    const code = region.countryCode;
    if (code === 'DZ') {
      return {
        trending: [
          'top music algeria trending 2026',
          'nouveautes rai algerien officiel',
          'rap dz trending hits 2026',
          'musique algerienne populaire charts',
        ],
        stations: [
          'rai algerien radio mix',
          'rap dz official playlist',
          'maghreb pop hits station',
          'algerian chaabi modern mix',
        ],
        chill: [
          'acoustic rai chill algeria',
          'maghreb lofi chill sessions',
          'arabic acoustic guitar vibes',
        ],
        energy: [
          'rap dz workout energy',
          'high energy cardio beats 160 bpm',
          'afro maghreb club rhythm',
        ],
      };
    }

    if (code === 'MA' || code === 'TN' || code === 'EG' || code === 'SA' || code === 'AE') {
      const country = region.countryName || code;
      return {
        trending: [
          `top music ${country} trending 2026`,
          `arabic pop hits ${country}`,
          `top rap ${country} official`,
        ],
        stations: [
          `arabic hits radio mix`,
          `maghreb & orient vibes station`,
          `top charts ${country} playlist`,
        ],
        chill: [
          'arabic acoustic chill sessions',
          'oriental lofi chill beats',
        ],
        energy: [
          'arabic workout hip hop energy',
          '160 bpm running cardio beats',
        ],
      };
    }

    if (code !== 'GLOBAL') {
      const country = region.countryName || code;
      return {
        trending: [
          `top music ${country} trending`,
          `new official music ${country}`,
          `popular charts ${country}`,
        ],
        stations: [
          `${country} hits radio mix`,
          `popular pop & hip hop station`,
        ],
        chill: ['acoustic chill sessions official', 'lofi chill beats'],
        energy: ['workout energy hits', '160 bpm running cardio'],
      };
    }
  }

  // Auto Random Global Mode (when user declines location)
  return {
    trending: [
      'top global music trending official',
      'new music releases official audio',
      'worldwide top charts music',
      'popular hip hop & pop hits',
    ],
    stations: [
      'global hits radio mix',
      'indie & pop discovery station',
      'electronic & afrobeats radio',
    ],
    chill: [
      'acoustic chill sessions official',
      'ambient lofi chill beats',
      'late night acoustic vibes',
    ],
    energy: [
      '160 bpm running cardio workout',
      'high energy gym motivation beats',
      'electronic workout rhythm',
    ],
  };
}
