import { Platform } from 'react-native';

export interface ResolvedAudioStream {
  url: string;
  mimeType: string;
  bitrate: number;
  durationSec?: number;
  source: 'innertube_ios' | 'innertube_ios_music' | 'hls' | 'piped';
  expiresAt: number;
}

const STREAM_CACHE = new Map<string, ResolvedAudioStream>();
const IN_FLIGHT_RESOLVES = new Map<string, Promise<ResolvedAudioStream | null>>();
const CACHE_MAX_ENTRIES = 120;

const IOS_PLAYER_UA =
  'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)';
const IOS_MUSIC_UA =
  'com.google.ios.youtube.music/7.29.2 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)';

function parseExpiryFromUrl(url: string): number {
  const defaultExpiry = Date.now() + 90 * 60 * 1000; // 90 mins safe fallback
  try {
    const match = /[?&]expire=(\d+)/.exec(url);
    if (match && match[1]) {
      const expireMs = Number(match[1]) * 1000;
      if (expireMs > Date.now() + 120_000) {
        // Subtract 10 minutes safety buffer so we never feed near-expiry URLs to AVPlayer
        return expireMs - 10 * 60 * 1000;
      }
    }
  } catch {
    // Ignore malformed query string
  }
  return defaultExpiry;
}

function storeCachedStream(videoId: string, resolved: ResolvedAudioStream): void {
  if (STREAM_CACHE.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = STREAM_CACHE.keys().next().value;
    if (oldestKey) STREAM_CACHE.delete(oldestKey);
  }
  STREAM_CACHE.set(videoId, resolved);
}

/**
 * 0ms synchronous cache lookup for an active direct AAC stream URL
 */
export function getCachedDirectAudioStream(videoId?: string | null): ResolvedAudioStream | null {
  if (!videoId) return null;
  const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  const entry = STREAM_CACHE.get(cleanId);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    STREAM_CACHE.delete(cleanId);
    return null;
  }
  return entry;
}

/**
 * Invalidate cached URL (e.g. if playback returns HTTP 403/410)
 */
export function invalidateCachedAudioStream(videoId?: string | null): void {
  if (!videoId) return;
  const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  STREAM_CACHE.delete(cleanId);
}

function selectBestAudioFormat(
  formats: any[],
  quality: string = 'hd320'
): { url: string; mimeType: string; bitrate: number; durationSec?: number } | null {
  if (!Array.isArray(formats) || formats.length === 0) return null;

  // On iOS AVPlayer, strictly require MP4/AAC containers (mp4a) — WebM/Opus is rejected natively.
  const aacFormats = formats.filter(
    (f) =>
      typeof f?.url === 'string' &&
      f.url.startsWith('http') &&
      typeof f?.mimeType === 'string' &&
      (f.mimeType.includes('audio/mp4') || f.mimeType.includes('mp4a'))
  );

  // Android ExoPlayer also handles WebM/Opus if MP4 wasn't returned
  const usable =
    aacFormats.length > 0
      ? aacFormats
      : Platform.OS === 'android'
      ? formats.filter(
          (f) =>
            typeof f?.url === 'string' &&
            f.url.startsWith('http') &&
            typeof f?.mimeType === 'string' &&
            f.mimeType.startsWith('audio/')
        )
      : [];

  if (usable.length === 0) return null;

  const sorted = [...usable].sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
  const chosen = quality === 'saver' ? sorted[sorted.length - 1] : sorted[0];

  const approxMs = Number(chosen.approxDurationMs || 0);
  return {
    url: chosen.url,
    mimeType: chosen.mimeType || 'audio/mp4',
    bitrate: Number(chosen.bitrate) || 128000,
    durationSec: approxMs > 0 ? Math.round(approxMs / 1000) : undefined,
  };
}

async function queryInnertubeClient(
  videoId: string,
  clientName: 'IOS' | 'IOS_MUSIC',
  quality: string,
  timeoutMs: number
): Promise<ResolvedAudioStream | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const isMusic = clientName === 'IOS_MUSIC';
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': isMusic ? IOS_MUSIC_UA : IOS_PLAYER_UA,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName,
            clientVersion: isMusic ? '7.29.2' : '20.10.4',
            deviceMake: 'Apple',
            deviceModel: 'iPhone16,2',
            osName: 'iPhone',
            osVersion: '18.3.2.22D82',
            hl: 'en',
            gl: 'US',
          },
        },
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const status = data?.playabilityStatus?.status;
    if (status && status !== 'OK' && status !== 'CONTENT_CHECK_REQUIRED') {
      return null;
    }

    const adaptiveFormats = data?.streamingData?.adaptiveFormats || [];
    const formats = data?.streamingData?.formats || [];
    const picked = selectBestAudioFormat(adaptiveFormats, quality) || selectBestAudioFormat(formats, quality);

    if (picked?.url) {
      const durFromVideo = Number(data?.videoDetails?.lengthSeconds || 0);
      return {
        url: picked.url,
        mimeType: picked.mimeType,
        bitrate: picked.bitrate,
        durationSec: picked.durationSec || (durFromVideo > 0 ? durFromVideo : undefined),
        source: isMusic ? 'innertube_ios_music' : 'innertube_ios',
        expiresAt: parseExpiryFromUrl(picked.url),
      };
    }

    const hlsUrl = data?.streamingData?.hlsManifestUrl;
    if (typeof hlsUrl === 'string' && hlsUrl.startsWith('http')) {
      const durFromVideo = Number(data?.videoDetails?.lengthSeconds || 0);
      return {
        url: hlsUrl,
        mimeType: 'application/x-mpegURL',
        bitrate: 128000,
        durationSec: durFromVideo > 0 ? durFromVideo : undefined,
        source: 'hls',
        expiresAt: parseExpiryFromUrl(hlsUrl),
      };
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves a direct native-compatible YouTube AAC (.m4a) audio stream via iOS InnerTube.
 * Single-flight deduplicated per videoId, cached in memory until 10m before expiry.
 */
export async function resolveDirectAudioStreamFast(
  videoId: string,
  quality: string = 'hd320',
  timeoutMs: number = 3500
): Promise<ResolvedAudioStream | null> {
  if (!videoId || videoId.startsWith('http') || videoId.length < 5) return null;
  const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');

  const cached = getCachedDirectAudioStream(cleanId);
  if (cached) return cached;

  const existing = IN_FLIGHT_RESOLVES.get(cleanId);
  if (existing) return existing;

  const promise = (async (): Promise<ResolvedAudioStream | null> => {
    try {
      const primary = await queryInnertubeClient(cleanId, 'IOS', quality, timeoutMs);
      if (primary) {
        storeCachedStream(cleanId, primary);
        return primary;
      }

      const fallback = await queryInnertubeClient(cleanId, 'IOS_MUSIC', quality, timeoutMs);
      if (fallback) {
        storeCachedStream(cleanId, fallback);
        return fallback;
      }

      return null;
    } finally {
      IN_FLIGHT_RESOLVES.delete(cleanId);
    }
  })();

  IN_FLIGHT_RESOLVES.set(cleanId, promise);
  return promise;
}

/**
 * Pre-warms only the stream metadata (~5KB JSON) for upcoming queue tracks so
 * Next/Previous skips from Lock Screen / Control Center start instantaneously natively.
 */
export function prefetchDirectAudioStream(videoId?: string | null, quality: string = 'hd320'): void {
  if (!videoId || videoId.startsWith('http') || videoId.length < 5) return;
  const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (getCachedDirectAudioStream(cleanId) || IN_FLIGHT_RESOLVES.has(cleanId)) return;
  resolveDirectAudioStreamFast(cleanId, quality, 3500).catch(() => {});
}
