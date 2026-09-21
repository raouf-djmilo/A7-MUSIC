import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { create } from 'zustand';

import {
  getInstalledAppVersion,
  getInstalledBuildNumber,
  compareVersions,
  sanitizeVersion,
  GITHUB_RELEASES_API_URL,
  GITHUB_RELEASES_PAGE_URL,
  GITHUB_RAW_VERSION_URL,
} from '../config/version';

const UPDATE_CACHE_KEY = '@a7music_cached_update_info';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours cache for silent background checks

export interface ReleaseAsset {
  name: string;
  size: number;
  downloadUrl: string;
  sizeFormatted: string;
}

export type UpdateUrgency = 'critical' | 'recommended' | 'optional';

export interface ReleaseInfo {
  version: string;
  date: string;
  type: 'major' | 'minor' | 'patch';
  title: string;
  highlights: string[];
  apk_url?: string;
  ipa_url?: string;
  apk_size?: number;
  ipa_size?: number;
}

export interface AppUpdateInfo {
  latestVersion: string;
  currentVersion: string;
  currentBuildNumber: string;
  minSupportedVersion: string;
  isUpdateAvailable: boolean;
  missedUpdatesCount: number;
  urgency: UpdateUrgency;
  missedReleases: ReleaseInfo[];
  allReleases: ReleaseInfo[];
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
 * Version Diffing Engine: Filters releases that are strictly newer than the installed app version,
 * sorts them descending (latest first), and classifies update urgency.
 */
export const getMissedUpdates = (
  installedVersion: string,
  allReleases: ReleaseInfo[],
  minSupportedVersion = '1.4.0'
): { missedReleases: ReleaseInfo[]; urgency: UpdateUrgency } => {
  const missed = allReleases.filter(
    (rel) => compareVersions(rel.version, installedVersion) > 0
  );

  // Sort descending (latest version first)
  missed.sort((a, b) => compareVersions(b.version, a.version));

  // Determine urgency
  let urgency: UpdateUrgency = 'optional';
  const isBelowMin = compareVersions(installedVersion, minSupportedVersion) < 0;
  const hasMajor = missed.some((r) => r.type === 'major');
  const hasMinor = missed.some((r) => r.type === 'minor');

  if (isBelowMin || hasMajor) {
    urgency = 'critical';
  } else if (hasMinor) {
    urgency = 'recommended';
  } else {
    urgency = 'optional';
  }

  return { missedReleases: missed, urgency };
};

/**
 * Fetch latest release with 2-Tier Architecture:
 * Tier 1: Fastly CDN (raw.githubusercontent.com/version.json) -> Zero REST API rate limit!
 * Tier 2: GitHub Releases REST API (with HTTP 403 Rate Limit catch and 6-hour cache)
 */
export const checkForAppUpdate = async (forceRefresh = false): Promise<AppUpdateInfo> => {
  const currentVersion = getInstalledAppVersion();
  const currentBuildNumber = getInstalledBuildNumber();

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
          parsed.currentBuildNumber = currentBuildNumber;
          const { missedReleases, urgency } = getMissedUpdates(
            currentVersion,
            parsed.allReleases || [],
            parsed.minSupportedVersion || '1.4.0'
          );
          parsed.missedReleases = missedReleases;
          parsed.missedUpdatesCount = missedReleases.length;
          parsed.urgency = urgency;
          parsed.isUpdateAvailable = compareVersions(parsed.latestVersion, currentVersion) > 0;
          return parsed;
        }
      }
    } catch (e) {
      // Ignore cache read errors and proceed to network fetch
    }
  }

  // 2. Tier 1: Fast CDN fetch from raw.githubusercontent.com (No Rate Limits)
  try {
    const cdnController = new AbortController();
    const cdnTimeout = setTimeout(() => cdnController.abort(), 8000);

    const cdnResponse = await fetch(GITHUB_RAW_VERSION_URL, {
      signal: cdnController.signal,
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
    clearTimeout(cdnTimeout);

    if (cdnResponse.ok) {
      const rawData = await cdnResponse.json();
      const latestVersion = sanitizeVersion(rawData.latest || rawData.version || '1.4.8');
      const minSupportedVersion = sanitizeVersion(rawData.min_supported_version || '1.4.0');
      const isUpdateAvailable = compareVersions(latestVersion, currentVersion) > 0;

      // Parse releases array or synthesize one
      let allReleases: ReleaseInfo[] = [];
      if (Array.isArray(rawData.releases) && rawData.releases.length > 0) {
        allReleases = rawData.releases.map((r: any) => ({
          version: sanitizeVersion(r.version),
          date: r.date || '',
          type: (r.type === 'major' || r.type === 'minor' || r.type === 'patch') ? r.type : 'patch',
          title: r.title || `إصدار v${r.version}`,
          highlights: Array.isArray(r.highlights) ? r.highlights : [],
          apk_url: r.apk_url,
          ipa_url: r.ipa_url,
          apk_size: r.apk_size,
          ipa_size: r.ipa_size,
        }));
      } else {
        allReleases = [
          {
            version: latestVersion,
            date: rawData.publishedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
            type: 'minor',
            title: rawData.title || `A7 MUSIC v${latestVersion}`,
            highlights: [
              'تحسينات عامة في الأداء واستقرار النظام',
              'دعم كامل للتثبيت المباشر على Android و iOS',
            ],
            apk_url: rawData.apk?.url,
            ipa_url: rawData.ipa?.url,
            apk_size: rawData.apk?.size,
            ipa_size: rawData.ipa?.size,
          }
        ];
      }

      const { missedReleases, urgency } = getMissedUpdates(
        currentVersion,
        allReleases,
        minSupportedVersion
      );

      const latestReleaseObj = allReleases.find((r) => r.version === latestVersion) || allReleases[0];

      const ipaAsset: ReleaseAsset | null = rawData.ipa ? {
        name: rawData.ipa.name || 'A7-MUSIC.ipa',
        size: rawData.ipa.size || latestReleaseObj?.ipa_size || 0,
        downloadUrl: rawData.ipa.url || latestReleaseObj?.ipa_url || '',
        sizeFormatted: formatBytes(rawData.ipa.size || latestReleaseObj?.ipa_size || 0),
      } : (latestReleaseObj?.ipa_url ? {
        name: 'A7-MUSIC.ipa',
        size: latestReleaseObj.ipa_size || 0,
        downloadUrl: latestReleaseObj.ipa_url,
        sizeFormatted: formatBytes(latestReleaseObj.ipa_size || 0),
      } : null);

      const apkAsset: ReleaseAsset | null = rawData.apk ? {
        name: rawData.apk.name || 'A7-MUSIC.apk',
        size: rawData.apk.size || latestReleaseObj?.apk_size || 0,
        downloadUrl: rawData.apk.url || latestReleaseObj?.apk_url || '',
        sizeFormatted: formatBytes(rawData.apk.size || latestReleaseObj?.apk_size || 0),
      } : (latestReleaseObj?.apk_url ? {
        name: 'A7-MUSIC.apk',
        size: latestReleaseObj.apk_size || 0,
        downloadUrl: latestReleaseObj.apk_url,
        sizeFormatted: formatBytes(latestReleaseObj.apk_size || 0),
      } : null);

      const info: AppUpdateInfo = {
        latestVersion,
        currentVersion,
        currentBuildNumber,
        minSupportedVersion,
        isUpdateAvailable,
        missedUpdatesCount: missedReleases.length,
        urgency,
        missedReleases,
        allReleases,
        releaseTitle: rawData.title || `A7 MUSIC v${latestVersion}`,
        releaseNotes: sanitizeReleaseNotes(rawData.notes),
        publishedAt: rawData.publishedAt || new Date().toISOString(),
        publishedAtFormatted: formatReleaseDate(rawData.publishedAt),
        ipaAsset,
        apkAsset,
        htmlUrl: rawData.htmlUrl || GITHUB_RELEASES_PAGE_URL,
        checkedAt: Date.now(),
      };

      await AsyncStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify(info));
      return info;
    }
  } catch (cdnErr) {
    // CDN fetch failed or offline; continue to Tier 2 GitHub REST API
  }

  // 3. Tier 2: Fallback to GitHub Releases REST API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(GITHUB_RELEASES_API_URL, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'A7-MUSIC-Mobile-App',
      },
    });
    clearTimeout(timeoutId);

    // Handle Rate Limit 403 gracefully
    if (response.status === 403 || response.status === 429) {
      console.warn('GitHub API rate limit reached, falling back to cache');
      const cached = await AsyncStorage.getItem(UPDATE_CACHE_KEY);
      if (cached) {
        const parsed: AppUpdateInfo = JSON.parse(cached);
        parsed.currentVersion = currentVersion;
        parsed.currentBuildNumber = currentBuildNumber;
        const { missedReleases, urgency } = getMissedUpdates(
          currentVersion,
          parsed.allReleases || [],
          parsed.minSupportedVersion || '1.4.0'
        );
        parsed.missedReleases = missedReleases;
        parsed.missedUpdatesCount = missedReleases.length;
        parsed.urgency = urgency;
        parsed.isUpdateAvailable = compareVersions(parsed.latestVersion, currentVersion) > 0;
        return parsed;
      }
    }

    if (!response.ok) {
      throw new Error(`GitHub API HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawTag: string = data.tag_name || data.name || 'v1.4.8';
    const latestVersion = sanitizeVersion(rawTag);
    const isUpdateAvailable = compareVersions(latestVersion, currentVersion) > 0;

    let ipaAsset: ReleaseAsset | null = null;
    let candidateApks: ReleaseAsset[] = [];

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
        } else if (name.toLowerCase().endsWith('.apk')) {
          candidateApks.push({
            name,
            size,
            downloadUrl,
            sizeFormatted: formatBytes(size),
          });
        }
      }
    }

    // Prioritize optimized release APKs: A7-MUSIC.apk > *release*.apk > non-debug > any
    const apkAsset: ReleaseAsset | null =
      candidateApks.find((a) => a.name === 'A7-MUSIC.apk') ||
      candidateApks.find((a) => a.name.toLowerCase().includes('release')) ||
      candidateApks.find((a) => !a.name.toLowerCase().includes('debug')) ||
      candidateApks[0] ||
      null;

    // Extract bullet highlights from markdown body
    const bodyText: string = data.body || '';
    const extractedHighlights: string[] = bodyText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- ') || l.startsWith('* '))
      .map((l) => l.replace(/^[-*]\s*/, ''));

    const allReleases: ReleaseInfo[] = [
      {
        version: latestVersion,
        date: data.published_at?.split('T')[0] || new Date().toISOString().split('T')[0],
        type: 'minor',
        title: data.name || `A7 MUSIC v${latestVersion}`,
        highlights: extractedHighlights.length > 0 ? extractedHighlights : [
          'تحديث رسمي مستقر يتضمن تحسينات هندسية',
          'تحسينات في استقرار الصوت وأداء النظام',
        ],
        apk_url: apkAsset?.downloadUrl,
        ipa_url: ipaAsset?.downloadUrl,
        apk_size: apkAsset?.size,
        ipa_size: ipaAsset?.size,
      },
    ];

    const minSupportedVersion = '1.4.0';
    const { missedReleases, urgency } = getMissedUpdates(
      currentVersion,
      allReleases,
      minSupportedVersion
    );

    const info: AppUpdateInfo = {
      latestVersion,
      currentVersion,
      currentBuildNumber,
      minSupportedVersion,
      isUpdateAvailable,
      missedUpdatesCount: missedReleases.length,
      urgency,
      missedReleases,
      allReleases,
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
    // 4. Graceful Fallback if offline
    try {
      const cached = await AsyncStorage.getItem(UPDATE_CACHE_KEY);
      if (cached) {
        const parsed: AppUpdateInfo = JSON.parse(cached);
        parsed.currentVersion = currentVersion;
        parsed.currentBuildNumber = currentBuildNumber;
        const { missedReleases, urgency } = getMissedUpdates(
          currentVersion,
          parsed.allReleases || [],
          parsed.minSupportedVersion || '1.4.0'
        );
        parsed.missedReleases = missedReleases;
        parsed.missedUpdatesCount = missedReleases.length;
        parsed.urgency = urgency;
        parsed.isUpdateAvailable = compareVersions(parsed.latestVersion, currentVersion) > 0;
        return parsed;
      }
    } catch {}

    // Pure safe fallback
    return {
      latestVersion: currentVersion,
      currentVersion,
      currentBuildNumber,
      minSupportedVersion: '1.4.0',
      isUpdateAvailable: false,
      missedUpdatesCount: 0,
      urgency: 'optional',
      missedReleases: [],
      allReleases: [],
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
 * Downloads Android APK with live progress reporting and File Integrity Verification
 */
export const downloadApkWithProgress = async (
  downloadUrl: string,
  expectedBytes: number,
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
      const expected = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : expectedBytes;
      const progress = expected > 0 ? totalBytesWritten / expected : 0;
      const writtenMB = (totalBytesWritten / (1024 * 1024)).toFixed(1);
      const totalMB = expected > 0 ? (expected / (1024 * 1024)).toFixed(1) : '?';

      onProgress(progress, writtenMB, totalMB);
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result || !result.uri) {
    throw new Error('فشل تنزيل ملف التحديث.');
  }

  // 🛡️ Integrity Check: Verify downloaded file size on disk matches expected size
  const finalFileInfo = await FileSystem.getInfoAsync(result.uri);
  if (!finalFileInfo.exists) {
    throw new Error('ملف التحديث غير موجود في الذاكرة بعد انتهاء التنزيل.');
  }

  if (expectedBytes > 0 && finalFileInfo.size > 0 && finalFileInfo.size !== expectedBytes) {
    // If the difference is significant (> 1KB), file is corrupted or truncated
    const sizeDiff = Math.abs(finalFileInfo.size - expectedBytes);
    if (sizeDiff > 1024) {
      await FileSystem.deleteAsync(result.uri, { idempotent: true });
      throw new Error(
        `ملف التحديث غير مكتمل (تم تنزيل ${formatBytes(finalFileInfo.size)} من أصل ${formatBytes(expectedBytes)}). يرجى التأكد من استقرار الاتصال بالإنترنت والمحاولة مجدداً.`
      );
    }
  }

  return result.uri;
};

/**
 * Launch Android package installation via strict APK mimeType
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
