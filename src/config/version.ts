import * as Application from 'expo-application';

/**
 * 🏷️ Single Source of Truth for Application Versioning
 */
export const APP_VERSION = '1.4.8';
export const APP_BUILD_NAME = 'Glass-Matte Unified Engine';
export const APP_RELEASE_YEAR = '2026';

export const GITHUB_REPO_OWNER = 'raouf-djmilo';
export const GITHUB_REPO_NAME = 'A7-MUSIC';
export const GITHUB_RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;
export const GITHUB_RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`;
export const GITHUB_RAW_VERSION_URL = `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/main/version.json`;

/**
 * Returns the active native application version or falls back to APP_VERSION
 */
export const getInstalledAppVersion = (): string => {
  try {
    return Application?.nativeApplicationVersion || APP_VERSION;
  } catch {
    return APP_VERSION;
  }
};

/**
 * Clean version string (strips 'v', tags like '-beta', etc.)
 * e.g., "v1.4.8" -> "1.4.8"
 */
export const sanitizeVersion = (versionStr: string): string => {
  if (!versionStr) return '0.0.0';
  return versionStr.trim().replace(/^v/i, '').split('-')[0];
};

/**
 * Compares two semantic version strings (e.g. "1.4.8" and "1.4.9").
 * Returns:
 *   1  if v1 > v2
 *  -1  if v1 < v2
 *   0  if v1 == v2
 */
export const compareVersions = (v1: string, v2: string): number => {
  const clean1 = sanitizeVersion(v1);
  const clean2 = sanitizeVersion(v2);

  const parts1 = clean1.split('.').map((p) => parseInt(p, 10) || 0);
  const parts2 = clean2.split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
};
