import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { ToastManager } from '../components/InAppToast';
import {
  getNotifications,
  safeGetPermissionsAsync,
  safeRequestPermissionsAsync,
} from './notificationService';

import {
  getInstalledAppVersion,
  getInstalledBuildNumber,
  compareVersions,
  sanitizeVersion,
  GITHUB_PAGES_OTA_LATEST_URL,
  GITHUB_RELEASES_API_URL,
  GITHUB_RELEASES_PAGE_URL,
} from '../config/version';

const UPDATE_CACHE_KEY = '@a7music_cached_ios_update_v2';
const NOTIFIED_OTA_ID_KEY = '@a7music_last_notified_ota_id_v1';
const NOTIFICATIONS_OPT_IN_KEY = '@a7music_notifications_opt_in';
const SCHEMA_VERSION_KEY = '@a7music_data_schema_version';
const CURRENT_DATA_SCHEMA_VERSION = 2;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache for silent checks

/**
 * Smart local storage migration when an OTA/native update changes data structures
 * or fixes stale caches, without erasing user history, likes, or offline downloads.
 */
export async function runSmartOtaMigrationIfNeeded(): Promise<void> {
  try {
    const rawVer = await AsyncStorage.getItem(SCHEMA_VERSION_KEY);
    const prevVer = rawVer ? Number(rawVer) : 1;
    if (prevVer >= CURRENT_DATA_SCHEMA_VERSION) return;

    const allKeys = await AsyncStorage.getAllKeys();
    // Schema v2: purge legacy artwork cache that could hold mismatched iTunes covers
    const staleArtworkKeys = allKeys.filter((k) => k.startsWith('@a7_art_'));
    if (staleArtworkKeys.length > 0) {
      await AsyncStorage.multiRemove(staleArtworkKeys);
    }

    await AsyncStorage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_DATA_SCHEMA_VERSION));
  } catch {
    // Non-fatal migration guard
  }
}

async function sendOtaSystemNotification(details: OtaUpdateDetails): Promise<void> {
  try {
    const optIn = await AsyncStorage.getItem(NOTIFICATIONS_OPT_IN_KEY);
    if (optIn === 'false') return;

    const notif = getNotifications();
    if (!notif?.scheduleNotificationAsync) return;

    const lastNotifiedId = await AsyncStorage.getItem(NOTIFIED_OTA_ID_KEY);
    if (details.updateId && lastNotifiedId === details.updateId) {
      return;
    }

    const perms = await safeGetPermissionsAsync();
    if (!perms.granted) {
      return;
    }

    await notif.scheduleNotificationAsync({
      content: {
        title: 'A7-MUSIC • تحديث جديد متاح ✨',
        body: `${details.title} — افتح التطبيق لتثبيت التحديث وتحسينات الأداء.`,
        sound: 'default',
        data: { action: 'ota_update', updateId: details.updateId },
      },
      trigger: null,
    });

    if (details.updateId) {
      await AsyncStorage.setItem(NOTIFIED_OTA_ID_KEY, details.updateId);
    }
  } catch {
    // Non-fatal if notifications are unavailable
  }
}

export type OtaStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'up_to_date'
  | 'unsupported';

export interface OtaUpdateDetails {
  updateId: string;
  otaVersion: string;
  runtimeVersion: string;
  title: string;
  highlights: string[];
  publishedAt: string;
  publishedAtFormatted: string;
  bundleSizeFormatted: string;
}

export interface ReleaseAsset {
  name: string;
  size: number;
  downloadUrl: string;
  sizeFormatted: string;
}

export interface AppUpdateInfo {
  latestVersion: string;
  currentVersion: string;
  currentBuildNumber: string;
  runtimeVersion: string;
  isUpdateAvailable: boolean;
  isNativeUpdateAvailable: boolean;
  releaseTitle: string;
  releaseNotes: string;
  highlights: string[];
  publishedAt: string;
  publishedAtFormatted: string;
  ipaAsset: ReleaseAsset | null;
  htmlUrl: string;
  checkedAt: number;
}

export const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

export const formatReleaseDate = (isoString?: string): string => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('ar-DZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoString;
  }
};

export const sanitizeReleaseNotes = (notes?: string): string => {
  if (!notes) return 'تحسينات عامة في الأداء واستقرار الصوت على أجهزة iOS.';
  return notes
    .replace(/^##+\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
};

/**
 * Returns the active installed OTA label (if running an OTA update) or null for embedded binary.
 */
export const getRunningOtaLabel = (): string | null => {
  try {
    if (!Updates.isEnabled) return null;
    if (Updates.isEmbeddedLaunch) return null;
    const manifestExtra = (Updates.manifest as any)?.extra?.a7Update;
    if (manifestExtra?.otaVersion) return String(manifestExtra.otaVersion);
    if (Updates.updateId) return `OTA-${Updates.updateId.slice(0, 8)}`;
    return null;
  } catch {
    return null;
  }
};

/**
 * TrollStore Direct Install URL Scheme (for Native IPA upgrades only)
 */
export const getTrollStoreUrl = (ipaDownloadUrl: string): string => {
  return `apple-magnifier://install?url=${encodeURIComponent(ipaDownloadUrl)}`;
};

/**
 * Checks GitHub Pages latest.json -> fallback GitHub Releases API to detect
 * whether a major native .ipa upgrade (higher runtime/app version) exists.
 */
export const checkForAppUpdate = async (forceRefresh = false): Promise<AppUpdateInfo> => {
  const currentVersion = getInstalledAppVersion();
  const currentBuildNumber = getInstalledBuildNumber();
  const runtimeVersion = Updates.runtimeVersion || currentVersion;

  if (!forceRefresh) {
    try {
      const cached = await AsyncStorage.getItem(UPDATE_CACHE_KEY);
      if (cached) {
        const parsed: AppUpdateInfo = JSON.parse(cached);
        if (Date.now() - (parsed.checkedAt || 0) < CACHE_TTL_MS) {
          const isNative = compareVersions(parsed.latestVersion, currentVersion) > 0;
          return {
            ...parsed,
            currentVersion,
            currentBuildNumber,
            runtimeVersion,
            isNativeUpdateAvailable: isNative,
            isUpdateAvailable: isNative,
          };
        }
      }
    } catch {}
  }

  // Tier 1: GitHub Pages Fast CDN (ota/ios/latest.json - zero rate limit)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const url = forceRefresh
      ? `${GITHUB_PAGES_OTA_LATEST_URL}?_t=${Date.now()}`
      : GITHUB_PAGES_OTA_LATEST_URL;

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
    clearTimeout(timer);

    if (resp.ok) {
      const data = await resp.json();
      const latestVersion = sanitizeVersion(data.latestNativeVersion || currentVersion);
      const isNativeUpdateAvailable = compareVersions(latestVersion, currentVersion) > 0;
      const highlights: string[] = Array.isArray(data.highlights)
        ? data.highlights
        : ['تحسينات مستمرة في الأداء وتجربة الاستماع على iOS'];

      const ipaUrl =
        data.ipaUrl ||
        `https://github.com/raouf-djmilo/A7-MUSIC/releases/latest/download/A7-MUSIC.ipa`;

      const info: AppUpdateInfo = {
        latestVersion,
        currentVersion,
        currentBuildNumber,
        runtimeVersion,
        isUpdateAvailable: isNativeUpdateAvailable,
        isNativeUpdateAvailable,
        releaseTitle: data.title || `A7 MUSIC v${latestVersion}`,
        releaseNotes: highlights.join('\n• '),
        highlights,
        publishedAt: data.publishedAt || new Date().toISOString(),
        publishedAtFormatted: formatReleaseDate(data.publishedAt),
        ipaAsset: isNativeUpdateAvailable
          ? {
              name: 'A7-MUSIC.ipa',
              size: Number(data.ipaSize) || 0,
              downloadUrl: ipaUrl,
              sizeFormatted: data.ipaSize ? formatBytes(Number(data.ipaSize)) : 'IPA',
            }
          : null,
        htmlUrl: data.releasesPageUrl || GITHUB_RELEASES_PAGE_URL,
        checkedAt: Date.now(),
      };

      await AsyncStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify(info));
      return info;
    }
  } catch {}

  // Tier 2: GitHub Releases API fallback
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(GITHUB_RELEASES_API_URL, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'A7-MUSIC-iOS-App',
      },
    });
    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json();
      const latestVersion = sanitizeVersion(data.tag_name || data.name || currentVersion);
      const isNativeUpdateAvailable = compareVersions(latestVersion, currentVersion) > 0;

      let ipaAsset: ReleaseAsset | null = null;
      if (Array.isArray(data.assets)) {
        const ipa = data.assets.find(
          (a: any) =>
            String(a.name || '').toLowerCase().endsWith('.ipa') ||
            String(a.name || '').includes('A7-MUSIC.ipa')
        );
        if (ipa) {
          ipaAsset = {
            name: ipa.name,
            size: ipa.size || 0,
            downloadUrl: ipa.browser_download_url || '',
            sizeFormatted: formatBytes(ipa.size || 0),
          };
        }
      }

      const bodyText: string = data.body || '';
      const highlights = bodyText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('- ') || l.startsWith('* '))
        .map((l) => l.replace(/^[-*]\s*/, ''));

      const info: AppUpdateInfo = {
        latestVersion,
        currentVersion,
        currentBuildNumber,
        runtimeVersion,
        isUpdateAvailable: isNativeUpdateAvailable,
        isNativeUpdateAvailable,
        releaseTitle: data.name || `A7 MUSIC v${latestVersion}`,
        releaseNotes: sanitizeReleaseNotes(bodyText),
        highlights:
          highlights.length > 0
            ? highlights
            : ['تحسينات مستمرة في الأداء واستقرار المشغّل على iOS'],
        publishedAt: data.published_at || new Date().toISOString(),
        publishedAtFormatted: formatReleaseDate(data.published_at),
        ipaAsset,
        htmlUrl: data.html_url || GITHUB_RELEASES_PAGE_URL,
        checkedAt: Date.now(),
      };

      await AsyncStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify(info));
      return info;
    }
  } catch {}

  return {
    latestVersion: currentVersion,
    currentVersion,
    currentBuildNumber,
    runtimeVersion,
    isUpdateAvailable: false,
    isNativeUpdateAvailable: false,
    releaseTitle: `A7 MUSIC v${currentVersion}`,
    releaseNotes: 'نسختك محدثة بالكامل.',
    highlights: [],
    publishedAt: new Date().toISOString(),
    publishedAtFormatted: 'الآن',
    ipaAsset: null,
    htmlUrl: GITHUB_RELEASES_PAGE_URL,
    checkedAt: Date.now(),
  };
};

function parseOtaManifestDetails(manifest: any): OtaUpdateDetails {
  const a7 = manifest?.extra?.a7Update || {};
  const sizeBytes = Number(a7.bundleSizeBytes) || 0;
  return {
    updateId: String(manifest?.id || ''),
    otaVersion: String(a7.otaVersion || (manifest?.id ? `OTA-${String(manifest.id).slice(0, 8)}` : 'تحديث فوري')),
    runtimeVersion: String(manifest?.runtimeVersion || Updates.runtimeVersion || getInstalledAppVersion()),
    title: String(a7.title || 'تحديث سريع متاح لـ A7 MUSIC'),
    highlights: Array.isArray(a7.highlights) && a7.highlights.length > 0
      ? a7.highlights
      : ['تحسينات فورية في الأداء واستقرار الصوت على iOS'],
    publishedAt: String(a7.publishedAt || manifest?.createdAt || new Date().toISOString()),
    publishedAtFormatted: formatReleaseDate(a7.publishedAt || manifest?.createdAt),
    bundleSizeFormatted: sizeBytes > 0 ? formatBytes(sizeBytes) : '~2.5 MB',
  };
}

// ─────────────────────────────────────────────────────────
// Zustand Global Store for iOS Fast OTA + Native Fallback
// ─────────────────────────────────────────────────────────
interface UpdateStoreState {
  updateInfo: AppUpdateInfo | null;
  isChecking: boolean;
  hasUpdate: boolean;

  // Fast OTA (expo-updates + GitHub Pages)
  otaStatus: OtaStatus;
  otaDetails: OtaUpdateDetails | null;
  isDownloadingOta: boolean;
  otaError: string | null;
  otaModalVisible: boolean;
  otaProgress: number;
  otaStageText: string;

  openOtaModal: () => void;
  closeOtaModal: () => void;
  checkUpdates: (force?: boolean, silent?: boolean) => Promise<AppUpdateInfo>;
  installOtaUpdate: () => Promise<void>;
  checkAndStageOtaInBackground: () => Promise<void>;
}

export const useUpdateStore = create<UpdateStoreState>((set, get) => ({
  updateInfo: null,
  isChecking: false,
  hasUpdate: false,

  otaStatus: Updates.isEnabled ? 'idle' : 'unsupported',
  otaDetails: null,
  isDownloadingOta: false,
  otaError: null,
  otaModalVisible: false,
  otaProgress: 0,
  otaStageText: '',

  openOtaModal: () => set({ otaModalVisible: true }),
  closeOtaModal: () => {
    if (!get().isDownloadingOta) {
      set({ otaModalVisible: false });
    }
  },

  checkUpdates: async (force = false, silent = false) => {
    if (!silent) {
      set({ isChecking: true, otaError: null });
    }

    // 1. Check Fast OTA via expo-updates (iOS Release build)
    let hasOta = false;
    if (Updates.isEnabled && Platform.OS === 'ios') {
      try {
        if (get().otaStatus !== 'ready') {
          set({ otaStatus: 'checking' });
          const check = await Updates.checkForUpdateAsync();
          if (check.isAvailable && check.manifest) {
            hasOta = true;
            const details = parseOtaManifestDetails(check.manifest);
            set({
              otaStatus: 'available',
              otaDetails: details,
              hasUpdate: true,
            });
          } else {
            set({ otaStatus: 'up_to_date', otaDetails: null });
          }
        } else {
          hasOta = true;
        }
      } catch (err: any) {
        // Non-fatal: e.g. offline or OTA endpoint not published yet
        set({
          otaStatus: 'up_to_date',
          otaError: silent ? null : err?.message || null,
        });
      }
    } else {
      set({ otaStatus: Updates.isEnabled ? 'up_to_date' : 'unsupported' });
    }

    // 2. Check Native IPA version (only triggers if runtimeVersion / major binary changed)
    const nativeInfo = await checkForAppUpdate(force);
    const anyUpdate = hasOta || get().otaStatus === 'ready' || nativeInfo.isNativeUpdateAvailable;

    set({
      updateInfo: {
        ...nativeInfo,
        isUpdateAvailable: anyUpdate,
      },
      hasUpdate: anyUpdate,
      isChecking: false,
    });

    return {
      ...nativeInfo,
      isUpdateAvailable: anyUpdate,
    };
  },

  installOtaUpdate: async () => {
    if (!Updates.isEnabled) {
      ToastManager.show({
        title: 'وضع التطوير المحلي',
        subtitle: 'التحديث الفوري OTA يعمل داخل نسخة IPA المثبّتة على الآيفون.',
        icon: 'information-circle-outline',
      });
      return;
    }

    const { otaStatus } = get();
    set({
      otaError: null,
      otaModalVisible: true,
      isDownloadingOta: true,
      otaStatus: 'downloading',
      otaProgress: 18,
      otaStageText: 'جاري التحقق من حزمة التحديث...',
    });

    let progressTicker: ReturnType<typeof setInterval> | null = null;
    try {
      if (otaStatus === 'ready') {
        set({
          otaProgress: 100,
          otaStageText: 'تم تجهيز التحديث • جاري إعادة تشغيل التطبيق...',
        });
        await new Promise((r) => setTimeout(r, 650));
        await Updates.reloadAsync();
        return;
      }

      progressTicker = setInterval(() => {
        const cur = get().otaProgress;
        if (cur < 86) {
          set({
            otaProgress: Math.min(86, cur + 9),
            otaStageText: cur < 50
              ? 'جاري تحميل ملفات التطبيق والبيانات...'
              : 'جاري تحديث الموارد والملفات المحلية...',
          });
        }
      }, 280);

      const fetched = await Updates.fetchUpdateAsync();
      if (progressTicker) {
        clearInterval(progressTicker);
        progressTicker = null;
      }

      if (fetched.isNew || fetched.manifest) {
        set({
          otaStatus: 'ready',
          otaProgress: 100,
          otaStageText: 'اكتمل التحديث بنجاح • جاري إعادة التشغيل...',
        });
        await new Promise((r) => setTimeout(r, 700));
        await Updates.reloadAsync();
      } else {
        set({
          isDownloadingOta: false,
          otaStatus: 'up_to_date',
          hasUpdate: false,
          otaModalVisible: false,
          otaProgress: 0,
          otaStageText: '',
        });
        ToastManager.show({
          title: 'تطبيقك محدّث بالفعل',
          subtitle: 'أنت تستخدم أحدث نسخة حالياً.',
          icon: 'checkmark-circle-outline',
        });
      }
    } catch (err: any) {
      if (progressTicker) clearInterval(progressTicker);
      set({
        isDownloadingOta: false,
        otaStatus: 'available',
        otaProgress: 0,
        otaStageText: '',
        otaError: err?.message || 'تعذر تحميل التحديث السريع. تأكد من الاتصال بالإنترنت.',
      });
      ToastManager.show({
        title: 'تعذر إكمال التحديث السريع',
        subtitle: 'يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.',
        icon: 'cloud-offline-outline',
      });
    }
  },

  checkAndStageOtaInBackground: async () => {
    if (!Updates.isEnabled || Platform.OS !== 'ios') return;
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable || !check.manifest) {
        await get().checkUpdates(false, true);
        return;
      }

      const details = parseOtaManifestDetails(check.manifest);
      set({
        otaStatus: 'available',
        otaDetails: details,
        hasUpdate: true,
      });

      // Notify the user via native iOS notification (visible on lock screen / outside app with app logo)
      await sendOtaSystemNotification(details);

      set({
        otaStatus: 'downloading',
        isDownloadingOta: true,
      });

      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew || fetched.manifest) {
        set({
          otaStatus: 'ready',
          isDownloadingOta: false,
          hasUpdate: true,
        });

        ToastManager.show({
          title: 'تحديث جديد جاهز للتثبيت ⚡',
          subtitle: `${details.title} • اضغط لبدء التحديث وإعادة التشغيل`,
          icon: 'sparkles',
          duration: 8000,
          onPress: () => {
            set({ otaModalVisible: true });
          },
        });
      } else {
        set({ isDownloadingOta: false, otaStatus: 'up_to_date' });
      }
    } catch {
      set({ isDownloadingOta: false });
    }
  },
}));
