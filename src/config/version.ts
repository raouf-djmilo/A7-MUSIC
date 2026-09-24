import * as Application from 'expo-application';

/**
 * 🏷️ Single Source of Truth for Application Versioning
 */
export const APP_VERSION = '1.5.0';
export const APP_BUILD_NAME = 'Production iOS IPA Fix: Clean Audio DAC & Video Sync';
export const APP_RELEASE_YEAR = '2026';

export const GITHUB_REPO_OWNER = 'raouf-djmilo';
export const GITHUB_REPO_NAME = 'A7-MUSIC';
export const GITHUB_RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;
export const GITHUB_RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`;
export const GITHUB_RAW_VERSION_URL = `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/main/version.json`;

/**
 * Returns the active native application version or falls back to APP_VERSION
 * Application.nativeApplicationVersion is the absolute source of truth for the installed binary.
 */
export const getInstalledAppVersion = (): string => {
  try {
    return Application?.nativeApplicationVersion || APP_VERSION;
  } catch {
    return APP_VERSION;
  }
};

/**
 * Returns the native build number (e.g., '14' or '1')
 */
export const getInstalledBuildNumber = (): string => {
  try {
    return Application?.nativeBuildVersion || '1';
  } catch {
    return '1';
  }
};

/**
 * Clean version string with robust Semver Dirty String Parsing:
 * - Strips leading 'v' / 'V' and whitespace
 * - Strips build metadata (+build.12, +20260921)
 * - Strips pre-release tags (-rc1, -beta.2, -alpha)
 * - Extracts strict dot-separated numeric segments (e.g., "1.4.8" or "1.4.8.12")
 * - Handles dirty strings like "v1.4.8-rc1+build.14", "1.4.8.1", etc.
 */
export const sanitizeVersion = (versionStr: string): string => {
  if (!versionStr || typeof versionStr !== 'string') return '0.0.0';

  // 1. Trim whitespace and leading 'v' or 'V'
  let clean = versionStr.trim().replace(/^v+/i, '');

  // 2. Remove build metadata after '+'
  clean = clean.split('+')[0];

  // 3. Remove pre-release / rc / beta after '-'
  clean = clean.split('-')[0];

  // 4. Extract continuous dot-separated digits
  const matched = clean.match(/^\d+(\.\d+)*/);
  if (matched && matched[0]) {
    return matched[0];
  }

  return '0.0.0';
};

/**
 * Compares two semantic version strings (e.g. "1.4.8" and "1.4.9").
 * Robust against NaN, build numbers, and varying segment counts.
 * Returns:
 *   1  if v1 > v2
 *  -1  if v1 < v2
 *   0  if v1 == v2
 */
export const compareVersions = (v1: string, v2: string): number => {
  const clean1 = sanitizeVersion(v1);
  const clean2 = sanitizeVersion(v2);

  const parts1 = clean1.split('.').map((p) => {
    const n = parseInt(p, 10);
    return isNaN(n) ? 0 : n;
  });
  const parts2 = clean2.split('.').map((p) => {
    const n = parseInt(p, 10);
    return isNaN(n) ? 0 : n;
  });

  const maxLen = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] ?? 0;
    const num2 = parts2[i] ?? 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
};
