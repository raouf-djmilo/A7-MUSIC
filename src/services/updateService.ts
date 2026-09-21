import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { create } from 'zustand';

import {
  getInstalledAppVersion,
  compareVersions,
  sanitizeVersion,
  GITHUB_RELEASES_API_URL,
  GITHUB_RELEASES_PAGE_URL,
} from '../config/version';

const UPDATE_CACHE_KEY = '@a7music_cached_update_info';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

export interface ReleaseAsset {
  name: string;
  size: number;
  downloadUrl: string;
  sizeFormatted: string;
}

export interface AppUpdateInfo {
  latestVersion: string;
  currentVersion: string;
  isUpdateAvailable: boolean;
  releaseTitle: string;
  releaseNotes: string;
  publishedAt: string;
  publishedAtFormatted: string;
  ipaAsset: ReleaseAsset | null;
  apkAsset: ReleaseAsset | null;
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

/**
 * Clean markdown for mobile presentation
 */
export const sanitizeReleaseNotes = (notes?: string): string => {
  if (!notes) return 'تحسينات عامة في الأداء واستقرار النظام وإصلاح الأخطاء.';
  return notes
    .replace(/^##+\s+/gm, '') // Remove markdown headers ##
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Strip links to text
    .trim();
};

/**
 * Fetch latest release from GitHub API with caching & semver comparison
 */
export const checkForAppUpdate = async (forceRefresh = false): Promise<AppUpdateInfo> => {
  const currentVersion = getInstalledAppVersion();

  // 1. Check local cache if not forcing refresh
  if (!forceRefresh) {
    try {
      const cached = await AsyncStorage.getItem(UPDATE_CACHE_KEY);
      if (cached) {
        const parsed: AppUpdateInfo = JSON.parse(cached);
        const age = Date.now() - (parsed.checkedAt || 0);
        if (age < CACHE_TTL_MS) {
          // Re-evaluate against active currentVersion in case app was updated
          parsed.currentVersion = currentVersion;
          parsed.isUpdateAvailable = compareVersions(parsed.latestVersion, currentVersion) > 0;
          return parsed;
        }
      }
    } catch (e) {
      // Ignore cache read errors and proceed to network fetch
    }
  }

  // 2. Fetch from GitHub API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(GITHUB_RELEASES_API_URL, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'A7-MUSIC-Mobile-App',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`GitHub API HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawTag: string = data.tag_name || data.name || 'v1.4.8';
    const latestVersion = sanitizeVersion(rawTag);
    const isUpdateAvailable = compareVersions(latestVersion, currentVersion) > 0;

    let ipaAsset: ReleaseAsset | null = null;
    let apkAsset: ReleaseAsset | null = null;

    if (Array.isArray(data.assets)) {
      for (const a of data.assets) {
        const name: string = a.name || '';
        const size: number = a.size || 0;
        const downloadUrl: string = a.browser_download_url || '';

        if (name.toLowerCase().endsWith('.ipa') || name.includes('A7-MUSIC.ipa')) {
          ipaAsset = {
            name,
            size,
            downloadUrl,
            sizeFormatted: formatBytes(size),
          };
        } else if (name.toLowerCase().endsWith('.apk') || name.includes('apk')) {
          apkAsset = {
            name,
            size,
            downloadUrl,
            sizeFormatted: formatBytes(size),
          };
        }
      }
    }

    const info: AppUpdateInfo = {
      latestVersion,
      currentVersion,
      isUpdateAvailable,
      releaseTitle: data.name || `A7 MUSIC v${latestVersion}`,
      releaseNotes: sanitizeReleaseNotes(data.body),
      publishedAt: data.published_at || new Date().toISOString(),
      publishedAtFormatted: formatReleaseDate(data.published_at),
      ipaAsset,
      apkAsset,
      htmlUrl: data.html_url || GITHUB_RELEASES_PAGE_URL,
      checkedAt: Date.now(),
    };

    // Save to cache
    await AsyncStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify(info));
    return info;
  } catch (error) {
    // 3. Graceful Fallback if offline or rate-limited
    try {
      const cached = await AsyncStorage.getItem(UPDATE_CACHE_KEY);
      if (cached) {
        const parsed: AppUpdateInfo = JSON.parse(cached);
        parsed.currentVersion = currentVersion;
        parsed.isUpdateAvailable = compareVersions(parsed.latestVersion, currentVersion) > 0;
        return parsed;
      }
    } catch {}

    // Pure safe fallback
    return {
      latestVersion: currentVersion,
      currentVersion,
      isUpdateAvailable: false,
      releaseTitle: `A7 MUSIC v${currentVersion}`,
      releaseNotes: 'لا يمكن الاتصال بخادم التحديثات حالياً. يرجى التحقق من اتصال الإنترنت.',
      publishedAt: new Date().toISOString(),
      publishedAtFormatted: 'الآن',
      ipaAsset: null,
      apkAsset: null,
      htmlUrl: GITHUB_RELEASES_PAGE_URL,
      checkedAt: Date.now(),
    };
  }
};

/**
 * TrollStore Direct Install URL Scheme
 */
export const getTrollStoreUrl = (ipaDownloadUrl: string): string => {
  return `apple-magnifier://install?url=${encodeURIComponent(ipaDownloadUrl)}`;
};

/**
 * Downloads Android APK with live progress reporting
 */
export const downloadApkWithProgress = async (
  downloadUrl: string,
  onProgress: (progress: number, writtenMB: string, totalMB: string) => void
): Promise<string> => {
  const fileUri = `${FileSystem.cacheDirectory}A7-MUSIC-latest.apk`;

  // Remove previous temp apk if exists
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (fileInfo.exists) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  }

  const downloadResumable = FileSystem.createDownloadResumable(
    downloadUrl,
    fileUri,
    {},
    (downloadProgress) => {
      const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
      const progress = totalBytesExpectedToWrite > 0
        ? totalBytesWritten / totalBytesExpectedToWrite
        : 0;
      const writtenMB = (totalBytesWritten / (1024 * 1024)).toFixed(1);
      const totalMB = totalBytesExpectedToWrite > 0
        ? (totalBytesExpectedToWrite / (1024 * 1024)).toFixed(1)
        : '?';

      onProgress(progress, writtenMB, totalMB);
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result || !result.uri) {
    throw new Error('فشل تنزيل ملف التحديث.');
  }

  return result.uri;
};

/**
 * Launch Android package installation via Share sheet / System handler
 */
export const launchApkInstall = async (localFileUri: string): Promise<void> => {
  if (Platform.OS !== 'android') return;

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(localFileUri, {
      mimeType: 'application/vnd.android.package-archive',
      dialogTitle: 'تثبيت تحديث A7 MUSIC',
      UTI: 'com.android.package-archive',
    });
  }
};

// ─────────────────────────────────────────────────────────
// Zustand Global State for Live Update Badge across App
// ─────────────────────────────────────────────────────────
interface UpdateStoreState {
  updateInfo: AppUpdateInfo | null;
  isChecking: boolean;
  hasUpdate: boolean;
  checkUpdates: (force?: boolean) => Promise<AppUpdateInfo>;
}

export const useUpdateStore = create<UpdateStoreState>((set, get) => ({
  updateInfo: null,
  isChecking: false,
  hasUpdate: false,

  checkUpdates: async (force = false) => {
    set({ isChecking: true });
    try {
      const info = await checkForAppUpdate(force);
      set({
        updateInfo: info,
        hasUpdate: info.isUpdateAvailable,
        isChecking: false,
      });
      return info;
    } catch (e) {
      set({ isChecking: false });
      throw e;
    }
  },
}));
