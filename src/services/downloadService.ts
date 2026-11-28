import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { Track } from '../store/useAudioStore';
import {
  getUniversalStudioArtwork,
  resolveLockScreenSquareArtworkAsync,
} from '../utils/artworkHelper';
import { auth } from '../lib/firebase';
import {
  addFirebaseDownloadedCatalogItem,
} from './firebaseMusicDb';

// ── Directory & Storage Constants ──
const DOWNLOAD_BASE_DIR = `${FileSystem.documentDirectory}a7flow_download_music/`;
const TRACKS_DIR = `${DOWNLOAD_BASE_DIR}tracks/`;
const MANIFEST_FILE_PATH = `${DOWNLOAD_BASE_DIR}a7flow_manifest.json`;

// Minimum physical sizes to reject empty / 403 HTML responses while keeping valid short tracks
const MIN_AUDIO_BYTES = 150 * 1024;
const MIN_VIDEO_BYTES = 250 * 1024;
const MAX_LOCAL_MANIFEST_ITEMS = 500;

// Global device-level key (NOT user specific: local phone files work across accounts & offline)
export const DEVICE_OFFLINE_MANIFEST_KEY = '@a7flow_device_offline_manifest';

// Kept for type compatibility; downloads select highest reliable native stream automatically
export type AudioQualityOption = 'auto' | 'high' | 'medium';
export type DownloadMediaMode = 'audio' | 'video' | 'full';

export interface DownloadTrackOptions {
  quality?: AudioQualityOption;
  mode?: DownloadMediaMode;
  onProgressUpdate?: (progress: number) => void;
}

export interface DownloadedTrack {
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  thumbnail: string;
  artworkLocalUri: string;
  audioLocalUri: string;
  videoLocalUri?: string;
  mediaType?: DownloadMediaMode;
  duration: number; // in milliseconds
  quality: AudioQualityOption;
  bitrateLabel: string;
  videoQualityLabel?: string;
  audioFileSizeBytes?: number;
  videoFileSizeBytes?: number;
  fileSizeBytes: number;
  fileSizeMB: string; // e.g. "5.2 MB"
  downloadedAt: number;
}

export function resolveDownloadedMediaMode(track?: DownloadedTrack | null): DownloadMediaMode {
  if (!track) return 'audio';
  const hasAudio = Boolean(track.audioLocalUri);
  const hasVideo = Boolean(track.videoLocalUri);
  if (hasAudio && hasVideo) return 'full';
  if (hasVideo) return 'video';
  return track.mediaType || 'audio';
}

export interface DownloadProgressState {
  videoId: string;
  progress: number; // 0.0 -> 1.0
  totalBytes: number;
  writtenBytes: number;
  downloadingMode?: DownloadMediaMode;
  status: 'probing' | 'downloading' | 'completed' | 'error';
  error?: string;
}

interface DownloadStoreState {
  downloadedTracks: DownloadedTrack[];
  activeDownloads: Record<string, DownloadProgressState>;
  totalStorageMB: string;
  totalTrackCount: number;
  isLoadingManifest: boolean;

  loadManifest: () => Promise<void>;
  getDownloadedTrack: (videoId?: string | null) => DownloadedTrack | undefined;
  isTrackDownloaded: (videoId?: string | null) => boolean;
  hasAudioDownloaded: (videoId?: string | null) => boolean;
  hasVideoDownloaded: (videoId?: string | null) => boolean;
  isFullyDownloaded: (videoId?: string | null) => boolean;
  getTrackProgress: (videoId?: string | null) => DownloadProgressState | undefined;
}

export const useDownloadStore = create<DownloadStoreState>((set, get) => ({
  downloadedTracks: [],
  activeDownloads: {},
  totalStorageMB: '0.0 MB',
  totalTrackCount: 0,
  isLoadingManifest: true,

  loadManifest: async () => {
    try {
      const tracks = await downloadService.getDownloadedTracks();
      const totalBytes = tracks.reduce((sum, t) => sum + (t.fileSizeBytes || 0), 0);
      const mb = (totalBytes / (1024 * 1024)).toFixed(1);

      set({
        downloadedTracks: tracks,
        totalStorageMB: `${mb} MB`,
        totalTrackCount: tracks.length,
        isLoadingManifest: false,
      });
    } catch {
      set({ isLoadingManifest: false });
    }
  },

  getDownloadedTrack: (videoId) => {
    if (!videoId) return undefined;
    return get().downloadedTracks.find((t) => t.videoId === videoId);
  },

  isTrackDownloaded: (videoId) => {
    if (!videoId) return false;
    return get().downloadedTracks.some((t) => t.videoId === videoId);
  },

  hasAudioDownloaded: (videoId) => {
    const found = get().getDownloadedTrack(videoId);
    return Boolean(found?.audioLocalUri);
  },

  hasVideoDownloaded: (videoId) => {
    const found = get().getDownloadedTrack(videoId);
    return Boolean(found?.videoLocalUri);
  },

  isFullyDownloaded: (videoId) => {
    const found = get().getDownloadedTrack(videoId);
    return Boolean(found?.audioLocalUri && found?.videoLocalUri);
  },

  getTrackProgress: (videoId) => {
    if (!videoId) return undefined;
    return get().activeDownloads[videoId];
  },
}));

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.private.coffee',
  'https://piped-api.lunar.icu',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
];

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
];

function isValidYouTubeId(id?: string | null): boolean {
  return Boolean(id && /^[a-zA-Z0-9_-]{11}$/.test(id.trim()));
}

interface ResolvedStreamCandidate {
  url: string;
  kind?: 'direct' | 'hls_m4a' | 'hls_mp3';
  ext?: 'm4a' | 'mp3' | 'mp4';
  qualityLabel?: string;
  headers?: Record<string, string>;
}

const IOS_CLIENT_VERSION = '20.03.2';
const IOS_CLIENT_USER_AGENT =
  'com.google.ios.youtube/20.03.2 (iPhone16,2; U; CPU iOS 18_2_0 like Mac OS X; en_US)';
const ANDROID_VR_USER_AGENT =
  'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';
const ANDROID_CLIENT_VERSION = '20.10.38';
const ANDROID_CLIENT_USER_AGENT =
  'com.google.android.youtube/20.10.38 (Linux; U; Android 14; en_US) gzip';
const BROWSER_WATCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MOBILE_SAFARI_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function uint8ToBase64(bytes: Uint8Array): string {
  const len = bytes.length;
  const parts: string[] = [];
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < len;
    const hasB2 = i + 2 < len;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;

    const c0 = b0 >> 2;
    const c1 = ((b0 & 0x03) << 4) | (b1 >> 4);
    const c2 = ((b1 & 0x0f) << 2) | (b2 >> 6);
    const c3 = b2 & 0x3f;

    parts.push(
      BASE64_CHARS[c0] +
        BASE64_CHARS[c1] +
        (hasB1 ? BASE64_CHARS[c2] : '=') +
        (hasB2 ? BASE64_CHARS[c3] : '=')
    );
  }
  return parts.join('');
}

let cachedScClientId: { clientId: string; fetchedAt: number } | null = null;

async function fetchSoundCloudClientId(forceRefresh = false): Promise<string | null> {
  if (
    !forceRefresh &&
    cachedScClientId &&
    Date.now() - cachedScClientId.fetchedAt < 30 * 60 * 1000
  ) {
    return cachedScClientId.clientId;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5500);
  try {
    const homeRes = await fetch('https://soundcloud.com/', {
      signal: controller.signal,
      headers: { 'User-Agent': BROWSER_WATCH_USER_AGENT },
    });
    if (!homeRes.ok) return cachedScClientId?.clientId || null;
    const html = await homeRes.text();
    const scriptMatches = Array.from(
      html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)
    ).map((m) => m[1]);

    for (const scriptUrl of scriptMatches.slice(-4).reverse()) {
      const sController = new AbortController();
      const sTimeout = setTimeout(() => sController.abort(), 4500);
      try {
        const jsRes = await fetch(scriptUrl, {
          signal: sController.signal,
          headers: { 'User-Agent': BROWSER_WATCH_USER_AGENT },
        });
        if (!jsRes.ok) continue;
        const js = await jsRes.text();
        const match = js.match(/client_id\s*:\s*"([a-zA-Z0-9]{20,40})"/);
        if (match?.[1]) {
          cachedScClientId = { clientId: match[1], fetchedAt: Date.now() };
          return match[1];
        }
      } finally {
        clearTimeout(sTimeout);
      }
    }
    return cachedScClientId?.clientId || null;
  } catch {
    return cachedScClientId?.clientId || null;
  } finally {
    clearTimeout(timeout);
  }
}

function cleanTrackSearchText(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/\(.*?official.*?\)|\[.*?official.*?\]|\(audio\)|\[audio\]|\(lyrics.*?\)|\[lyrics.*?\]|\(feat\..*?\)|\(ft\..*?\)/gi, ' ')
    .replace(/official music video|official video|official audio|hq audio|hd/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreSoundCloudMatch(
  sc: any,
  targetTitle: string,
  targetArtist: string,
  targetDurMs: number
): number {
  const dur = sc?.duration || 0;
  if (dur < 45000 || sc?.policy === 'SNIP' || sc?.policy === 'BLOCK') return -9999;
  const trs: any[] = sc?.media?.transcodings || [];
  if (trs.length === 0) return -9999;

  const hay = `${sc?.title || ''} ${sc?.user?.username || ''}`.toLowerCase();
  const orig = `${targetTitle} ${targetArtist}`.toLowerCase();
  let score = 0;

  const badKeywords = [
    'instrumental',
    'karaoke',
    'remix',
    'slowed',
    'reverb',
    'nightcore',
    '8d ',
    'type beat',
    'cover',
    'acapella',
    'speed up',
    'sped up',
  ];
  for (const kw of badKeywords) {
    if (hay.includes(kw) && !orig.includes(kw)) score -= 420;
  }
  if (hay.includes(' live') && !orig.includes('live')) score -= 90;

  const tokenize = (str: string) =>
    str
      .toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
      .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);

  const cleanTitle = cleanTrackSearchText(targetTitle).toLowerCase();
  if (cleanTitle.length >= 3 && hay.includes(cleanTitle)) {
    score += 140;
  }

  const titleWords = tokenize(targetTitle);
  const artistWords = tokenize(targetArtist);
  if (titleWords.length > 0) {
    const titleHits = titleWords.filter((w) => hay.includes(w)).length;
    score += Math.round((titleHits / titleWords.length) * 180);
  }
  if (artistWords.length > 0) {
    const artistHits = artistWords.filter((w) => hay.includes(w)).length;
    score += Math.round((artistHits / artistWords.length) * 120);
  }

  if (targetDurMs > 30000) {
    const diffRatio = Math.abs(dur - targetDurMs) / targetDurMs;
    if (diffRatio <= 0.08) score += 130;
    else if (diffRatio <= 0.2) score += 75;
    else if (diffRatio > 0.55) score -= 200;
  }

  if (trs.some((tr) => tr?.format?.protocol === 'progressive' && !tr?.snipped)) score += 65;
  else if (trs.some((tr) => `${tr?.format?.mime_type || ''}`.includes('mp4') && !tr?.snipped)) score += 50;

  return score;
}

/**
 * ⚡ Stage 1 (Primary Reliable Full-Song Engine): Smart Audio Stream Extractor
 * Fetches complete MP3 progressive or fMP4 (M4A) segmented audio streams with zero HTTP 403 throttling.
 */
async function extractSoundCloudAudioCandidates(track: Track): Promise<ResolvedStreamCandidate[]> {
  const clientId = await fetchSoundCloudClientId(false);
  if (!clientId) return [];

  const cleanTitle = cleanTrackSearchText(track.title);
  const cleanArtist = cleanTrackSearchText(track.artist);
  if (!cleanTitle) return [];

  const queries = Array.from(
    new Set(
      [`${cleanArtist} ${cleanTitle}`.trim(), cleanTitle].filter((q) => q.length >= 2)
    )
  );

  const collected: any[] = [];
  const seenScIds = new Set<number | string>();

  for (const q of queries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(
        `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${encodeURIComponent(clientId)}&limit=15`,
        { signal: controller.signal, headers: { 'User-Agent': BROWSER_WATCH_USER_AGENT } }
      );
      if (res.status === 401 || res.status === 403) {
        const refreshed = await fetchSoundCloudClientId(true);
        if (!refreshed) return [];
      }
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of data?.collection || []) {
        if (item?.id && !seenScIds.has(item.id)) {
          seenScIds.add(item.id);
          collected.push(item);
        }
      }
      if (collected.length >= 10) break;
    } catch {
      // Try next query
    } finally {
      clearTimeout(timeout);
    }
  }

  const ranked = collected
    .map((sc) => ({ sc, score: scoreSoundCloudMatch(sc, cleanTitle, cleanArtist, track.duration || 0) }))
    .filter((entry) => entry.score > 140)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const candidates: ResolvedStreamCandidate[] = [];
  const activeClientId = cachedScClientId?.clientId || clientId;

  for (const { sc } of ranked) {
    const trs: any[] = sc.media?.transcodings || [];
    const orderedTrs = [
      ...trs.filter((tr) => tr?.format?.protocol === 'progressive' && !tr?.snipped),
      ...trs.filter(
        (tr) =>
          tr?.format?.protocol === 'hls' &&
          `${tr?.format?.mime_type || ''}`.includes('mp4') &&
          !tr?.snipped
      ),
      ...trs.filter(
        (tr) =>
          tr?.format?.protocol === 'hls' &&
          `${tr?.format?.mime_type || ''}`.includes('mpeg') &&
          !tr?.snipped &&
          !`${tr?.preset || ''}`.includes('abr')
      ),
    ];

    for (const tr of orderedTrs) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      try {
        const authParam = sc.track_authorization
          ? `&track_authorization=${encodeURIComponent(sc.track_authorization)}`
          : '';
        const res = await fetch(
          `${tr.url}?client_id=${encodeURIComponent(activeClientId)}${authParam}`,
          { signal: controller.signal, headers: { 'User-Agent': BROWSER_WATCH_USER_AGENT } }
        );
        if (!res.ok) continue;
        const json = await res.json();
        if (typeof json?.url !== 'string' || !json.url.startsWith('http')) continue;

        if (tr.format?.protocol === 'progressive') {
          candidates.push({
            url: json.url,
            kind: 'direct',
            ext: 'mp3',
            headers: { 'User-Agent': BROWSER_WATCH_USER_AGENT },
          });
        } else if (`${tr.format?.mime_type || ''}`.includes('mp4')) {
          candidates.push({
            url: json.url,
            kind: 'hls_m4a',
            ext: 'm4a',
            headers: { 'User-Agent': BROWSER_WATCH_USER_AGENT },
          });
        } else {
          candidates.push({
            url: json.url,
            kind: 'hls_mp3',
            ext: 'mp3',
            headers: { 'User-Agent': BROWSER_WATCH_USER_AGENT },
          });
        }
      } catch {
        // Try next transcoding
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  return candidates;
}

async function downloadHlsSegmentsToFile(
  m3u8Url: string,
  tempPartUri: string,
  onProgress: (ratio: number, writtenBytes: number, totalBytes: number) => void
): Promise<void> {
  const m3u8Res = await fetch(m3u8Url, {
    headers: { 'User-Agent': BROWSER_WATCH_USER_AGENT },
  });
  if (!m3u8Res.ok) throw new Error(`Playlist HTTP ${m3u8Res.status}`);
  const playlistText = await m3u8Res.text();
  const lines = playlistText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const mapMatch = playlistText.match(/#EXT-X-MAP:URI="([^"]+)"/);
  const initUrl = mapMatch?.[1] || null;
  const segUrls = lines.filter((l) => l.startsWith('http'));
  if (segUrls.length === 0) {
    throw new Error('No audio segments in HLS stream');
  }

  const allUrls = initUrl ? [initUrl, ...segUrls] : segUrls;
  const buffers: Array<Uint8Array | null> = new Array(allUrls.length).fill(null);
  let completedCount = 0;
  let downloadedBytes = 0;

  const CONCURRENCY = 3;
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= allUrls.length) break;
      const segUrl = allUrls[idx];
      const segRes = await fetch(segUrl, {
        headers: { 'User-Agent': BROWSER_WATCH_USER_AGENT },
      });
      if (!segRes.ok) {
        throw new Error(`Segment ${idx + 1} HTTP ${segRes.status}`);
      }
      const arrBuf = await segRes.arrayBuffer();
      const u8 = new Uint8Array(arrBuf);
      buffers[idx] = u8;
      completedCount += 1;
      downloadedBytes += u8.byteLength;

      const avgBytes = downloadedBytes / completedCount;
      const estTotal = Math.round(avgBytes * allUrls.length);
      const ratio = 0.35 + (completedCount / allUrls.length) * 0.61;
      onProgress(Math.min(0.96, ratio), downloadedBytes, estTotal);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, allUrls.length) }, () => worker())
  );

  let totalLength = 0;
  for (const b of buffers) {
    if (!b) throw new Error('Incomplete audio segment');
    totalLength += b.byteLength;
  }

  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const b of buffers) {
    merged.set(b!, offset);
    offset += b!.byteLength;
  }

  const b64 = uint8ToBase64(merged);
  await FileSystem.writeAsStringAsync(tempPartUri, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

interface InnerTubeSessionContext {
  apiKey: string;
  visitorData: string;
  fetchedAt: number;
}

let cachedInnerTubeSession: InnerTubeSessionContext | null = null;

async function fetchInnerTubeSession(cleanId: string, forceRefresh = false): Promise<InnerTubeSessionContext | null> {
  if (
    !forceRefresh &&
    cachedInnerTubeSession &&
    Date.now() - cachedInnerTubeSession.fetchedAt < 15 * 60 * 1000
  ) {
    return cachedInnerTubeSession;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${cleanId}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_WATCH_USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return cachedInnerTubeSession;
    const html = await res.text();
    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
    const visitorMatch = html.match(/"VISITOR_DATA"\s*:\s*"([^"]+)"/);
    if (apiKeyMatch?.[1]) {
      cachedInnerTubeSession = {
        apiKey: apiKeyMatch[1],
        visitorData: visitorMatch?.[1] || cachedInnerTubeSession?.visitorData || '',
        fetchedAt: Date.now(),
      };
      return cachedInnerTubeSession;
    }
    return cachedInnerTubeSession;
  } catch {
    return cachedInnerTubeSession;
  } finally {
    clearTimeout(timeout);
  }
}

function pickBestAudioUrls(streams: Array<{ url?: string; mimeType?: string; type?: string; format?: string; bitrate?: number | string }>): string[] {
  const valid = streams.filter(
    (s) =>
      typeof s?.url === 'string' &&
      s.url.startsWith('http') &&
      !s.url.includes('.m3u8')
  );
  const ranked = [...valid].sort((a, b) => {
    const aMime = `${a.mimeType || a.type || a.format || ''}`.toLowerCase();
    const bMime = `${b.mimeType || b.type || b.format || ''}`.toLowerCase();
    const aIsM4a = aMime.includes('mp4') || aMime.includes('m4a') ? 1 : 0;
    const bIsM4a = bMime.includes('mp4') || bMime.includes('m4a') ? 1 : 0;
    if (aIsM4a !== bIsM4a) return bIsM4a - aIsM4a;
    return (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0);
  });
  return Array.from(new Set(ranked.map((s) => s.url!)));
}

function pickBestMuxedVideoFormats(
  streams: Array<{
    url?: string;
    mimeType?: string;
    type?: string;
    container?: string;
    qualityLabel?: string;
    quality?: string;
    height?: number;
    itag?: number;
    videoOnly?: boolean;
  }>
): Array<{ url: string; qualityLabel: string }> {
  const valid = streams.filter((s) => {
    if (typeof s?.url !== 'string' || !s.url.startsWith('http') || s.url.includes('.m3u8')) {
      return false;
    }
    if (s.videoOnly === true) return false;
    const mime = `${s.mimeType || s.type || s.container || ''}`.toLowerCase();
    return mime.includes('mp4') || mime.includes('video');
  });

  const ranked = [...valid].sort((a, b) => {
    const aHeight = Number(a.height) || parseInt(`${a.qualityLabel || a.quality || '0'}`, 10) || 0;
    const bHeight = Number(b.height) || parseInt(`${b.qualityLabel || b.quality || '0'}`, 10) || 0;
    const aIsMp4 = `${a.mimeType || a.type || a.container || ''}`.toLowerCase().includes('mp4') ? 1 : 0;
    const bIsMp4 = `${b.mimeType || b.type || b.container || ''}`.toLowerCase().includes('mp4') ? 1 : 0;
    if (aIsMp4 !== bIsMp4) return bIsMp4 - aIsMp4;
    if (bHeight !== aHeight) return bHeight - aHeight;
    return (Number(b.itag) || 0) - (Number(a.itag) || 0);
  });

  const seen = new Set<string>();
  const out: Array<{ url: string; qualityLabel: string }> = [];
  for (const s of ranked) {
    if (s.url && !seen.has(s.url)) {
      seen.add(s.url);
      out.push({
        url: s.url,
        qualityLabel: s.qualityLabel || (s.height ? `${s.height}p MP4` : 'HD MP4'),
      });
    }
  }
  return out;
}

/**
 * Queries YouTube InnerTube player API for direct audio or progressive muxed video+audio streams
 * tied strictly to the exact videoId.
 */
async function queryInnerTubeMediaCandidates(
  cleanId: string,
  mediaKind: 'audio' | 'video'
): Promise<ResolvedStreamCandidate[]> {
  const queryWithSession = async (session: InnerTubeSessionContext | null): Promise<ResolvedStreamCandidate[]> => {
    const clients =
      mediaKind === 'video'
        ? [
            {
              priority: 0,
              clientName: 'ANDROID_VR',
              clientVersion: '1.60.19',
              clientNameId: '28',
              deviceMake: 'Oculus',
              deviceModel: 'Quest 3',
              osName: 'Android',
              osVersion: '12L',
              androidSdkVersion: 32,
              hl: 'en',
              gl: 'US',
              ua: ANDROID_VR_USER_AGENT,
            },
            {
              priority: 1,
              clientName: 'ANDROID',
              clientVersion: ANDROID_CLIENT_VERSION,
              clientNameId: '3',
              androidSdkVersion: 34,
              hl: 'en',
              gl: 'US',
              ua: ANDROID_CLIENT_USER_AGENT,
            },
          ]
        : [
            {
              priority: 0,
              clientName: 'IOS',
              clientVersion: IOS_CLIENT_VERSION,
              clientNameId: '5',
              deviceMake: 'Apple',
              deviceModel: 'iPhone16,2',
              osName: 'iPhone',
              osVersion: '18.2.0.22C152',
              hl: 'en',
              gl: 'US',
              ua: IOS_CLIENT_USER_AGENT,
            },
            {
              priority: 1,
              clientName: 'ANDROID_VR',
              clientVersion: '1.60.19',
              clientNameId: '28',
              deviceMake: 'Oculus',
              deviceModel: 'Quest 3',
              osName: 'Android',
              osVersion: '12L',
              androidSdkVersion: 32,
              hl: 'en',
              gl: 'US',
              ua: ANDROID_VR_USER_AGENT,
            },
            {
              priority: 2,
              clientName: 'ANDROID',
              clientVersion: ANDROID_CLIENT_VERSION,
              clientNameId: '3',
              androidSdkVersion: 34,
              hl: 'en',
              gl: 'US',
              ua: ANDROID_CLIENT_USER_AGENT,
            },
          ];

    const playerEndpoint = session?.apiKey
      ? `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(session.apiKey)}&prettyPrint=false`
      : 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';

    const settled = await Promise.allSettled(
      clients.map(async (c: any) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': c.ua,
            'X-YouTube-Client-Name': c.clientNameId,
            'X-YouTube-Client-Version': c.clientVersion,
          };
          if (session?.visitorData) {
            headers['X-Goog-Visitor-Id'] = session.visitorData;
          }
          const res = await fetch(playerEndpoint, {
            method: 'POST',
            signal: controller.signal,
            headers,
            body: JSON.stringify({
              videoId: cleanId,
              context: {
                client: {
                  clientName: c.clientName,
                  clientVersion: c.clientVersion,
                  ...(c.deviceMake ? { deviceMake: c.deviceMake } : {}),
                  ...(c.deviceModel ? { deviceModel: c.deviceModel } : {}),
                  ...(c.osName ? { osName: c.osName } : {}),
                  ...(c.osVersion ? { osVersion: c.osVersion } : {}),
                  ...(c.androidSdkVersion ? { androidSdkVersion: c.androidSdkVersion } : {}),
                  ...(session?.visitorData ? { visitorData: session.visitorData } : {}),
                  hl: c.hl,
                  gl: c.gl,
                },
              },
              contentCheckOk: true,
              racyCheckOk: true,
            }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          const streamingData = json?.streamingData || {};

          if (mediaKind === 'video') {
            const muxed = pickBestMuxedVideoFormats(streamingData.formats || []);
            if (muxed.length === 0) throw new Error('No direct muxed video formats');
            return {
              priority: c.priority,
              candidates: muxed.map((item) => ({
                url: item.url,
                kind: 'direct' as const,
                ext: 'mp4' as const,
                qualityLabel: item.qualityLabel,
                headers: { 'User-Agent': c.ua },
              })),
            };
          }

          const adaptive = streamingData.adaptiveFormats || [];
          const audioFormats = adaptive.filter(
            (f: any) => typeof f?.url === 'string' && `${f?.mimeType || ''}`.startsWith('audio/')
          );
          const urls = pickBestAudioUrls(audioFormats);
          if (urls.length === 0) throw new Error('No direct audio formats');
          return {
            priority: c.priority,
            candidates: urls.map((url) => ({
              url,
              kind: 'direct' as const,
              ext: 'm4a' as const,
              headers: { 'User-Agent': c.ua },
            })),
          };
        } finally {
          clearTimeout(timeout);
        }
      })
    );

    const groups: Array<{ priority: number; candidates: ResolvedStreamCandidate[] }> = [];
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value.candidates.length > 0) {
        groups.push(r.value);
      }
    }
    groups.sort((a, b) => a.priority - b.priority);
    return groups.flatMap((g) => g.candidates);
  };

  // Run fast direct query first (proven HTTP 206 across iOS/Android InnerTube), retry with watch session if needed
  const directPass = await queryWithSession(null);
  if (directPass.length > 0) return directPass;

  const session = await fetchInnerTubeSession(cleanId, false);
  const firstPass = await queryWithSession(session);
  if (firstPass.length > 0) return firstPass;

  const refreshedSession = await fetchInnerTubeSession(cleanId, true);
  if (refreshedSession && refreshedSession !== session) {
    return queryWithSession(refreshedSession);
  }
  return [];
}

/**
 * Stage 1 Audio: Direct InnerTube (exact videoId)
 */
async function extractInnerTubeAudioCandidates(cleanId: string): Promise<ResolvedStreamCandidate[]> {
  return queryInnerTubeMediaCandidates(cleanId, 'audio');
}

/**
 * Stage 1 Video: Direct InnerTube progressive MP4 with video + AAC audio (exact videoId)
 */
async function extractInnerTubeVideoCandidates(cleanId: string): Promise<ResolvedStreamCandidate[]> {
  return queryInnerTubeMediaCandidates(cleanId, 'video');
}

/**
 * ⚡ Stage 2: Fast Parallel Stream Resolver via Piped & Invidious APIs
 */
export async function extractPipedDirectAudioStream(videoId: string): Promise<string | null> {
  const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  const pipedTasks = PIPED_INSTANCES.map(async (instance) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${instance}/streams/${cleanId}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const urls = pickBestAudioUrls(data?.audioStreams || []);
      if (urls.length > 0) return urls[0];
      throw new Error('No audio streams');
    } finally {
      clearTimeout(timeout);
    }
  });

  const invidiousTasks = INVIDIOUS_INSTANCES.map(async (instance) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3200);
    try {
      const res = await fetch(`${instance}/api/v1/videos/${cleanId}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const audioFormats = (data?.adaptiveFormats || []).filter(
        (f: any) => typeof f?.type === 'string' && f.type.startsWith('audio/')
      );
      const urls = pickBestAudioUrls(audioFormats);
      if (urls.length > 0) return urls[0];
      throw new Error('No invidious audio streams');
    } finally {
      clearTimeout(timeout);
    }
  });

  try {
    return await Promise.any([...pipedTasks, ...invidiousTasks]);
  } catch {
    return null;
  }
}

async function extractPipedDirectVideoCandidates(videoId: string): Promise<ResolvedStreamCandidate[]> {
  const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  const pipedTasks = PIPED_INSTANCES.map(async (instance) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3200);
    try {
      const res = await fetch(`${instance}/streams/${cleanId}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const muxed = pickBestMuxedVideoFormats(data?.videoStreams || []);
      if (muxed.length > 0) {
        return muxed.map((m) => ({
          url: m.url,
          kind: 'direct' as const,
          ext: 'mp4' as const,
          qualityLabel: m.qualityLabel,
          headers: { 'User-Agent': MOBILE_SAFARI_USER_AGENT },
        }));
      }
      throw new Error('No muxed video streams');
    } finally {
      clearTimeout(timeout);
    }
  });

  const invidiousTasks = INVIDIOUS_INSTANCES.map(async (instance) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3400);
    try {
      const res = await fetch(`${instance}/api/v1/videos/${cleanId}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const muxed = pickBestMuxedVideoFormats(data?.formatStreams || []);
      if (muxed.length > 0) {
        return muxed.map((m) => ({
          url: m.url,
          kind: 'direct' as const,
          ext: 'mp4' as const,
          qualityLabel: m.qualityLabel,
          headers: { 'User-Agent': MOBILE_SAFARI_USER_AGENT },
        }));
      }
      throw new Error('No invidious muxed video streams');
    } finally {
      clearTimeout(timeout);
    }
  });

  try {
    return await Promise.any([...pipedTasks, ...invidiousTasks]);
  } catch {
    return [];
  }
}

/**
 * Converter Mirror Fallback (supports both audio m4a & muxed mp4 video)
 */
async function extractMirrorMediaStream(
  cleanId: string,
  format: 'm4a' | '720' | '360' = 'm4a',
  onProgress?: (progressRatio: number, statusText: string) => void
): Promise<string> {
  const youtubeUrl = `https://www.youtube.com/watch?v=${cleanId}`;
  const endpoints = [
    `https://loader.to/ajax/download.php?format=${format}&url=${encodeURIComponent(youtubeUrl)}`,
    `https://en.loader.to/ajax/download.php?format=${format}&url=${encodeURIComponent(youtubeUrl)}`,
  ];

  let conversionData: any = null;
  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        if (data.id || data.success) {
          conversionData = data;
          break;
        }
      }
    } catch {
      // Try next mirror
    }
  }

  if (!conversionData || (!conversionData.id && !conversionData.progress_url)) {
    throw new Error('تعذر استخراج الصوت من السيرفر. تأكد من الاتصال بالإنترنت وحاول مجدداً.');
  }

  const progressUrl =
    conversionData.progress_url ||
    `https://lto2.affadaffa.com/api/progress?id=${conversionData.id}`;

  for (let poll = 0; poll < 12; poll++) {
    await new Promise((resolve) => setTimeout(resolve, 1400));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const pRes = await fetch(progressUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (pRes.ok) {
        const pData = await pRes.json();
        const progressNum = Number(pData.progress) || 0;
        const normalizedRatio = 0.08 + Math.min(progressNum / 1000, 1.0) * 0.25;
        onProgress?.(normalizedRatio, pData.text || 'جاري تجهيز الملف الصوتي...');
        if (typeof pData.download_url === 'string' && pData.download_url.startsWith('http')) {
          return pData.download_url;
        }
      }
    } catch {
      // Retry poll
    }
  }

  throw new Error('استغرق تجهيز المقطع وقتاً طويلاً. يرجى المحاولة مرة أخرى.');
}

/**
 * 🎵 Extract Genuine Audio Stream (InnerTube + Piped/Invidious + Mirror Cascade)
 */
export async function extractRealYouTubeAudioStream(
  videoId: string,
  _quality: AudioQualityOption = 'auto',
  onProgress?: (progressRatio: number, statusText: string) => void
): Promise<string> {
  const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');

  // 1. Direct InnerTube (fastest native bitrate match)
  const innerTubeCandidates = await extractInnerTubeAudioCandidates(cleanId);
  if (innerTubeCandidates.length > 0) {
    onProgress?.(0.32, 'تم العثور على البث الصوتي الأصلي');
    return innerTubeCandidates[0].url;
  }

  // 2. Piped + Invidious parallel race
  const mirrorStreamUrl = await extractPipedDirectAudioStream(cleanId);
  if (mirrorStreamUrl) {
    onProgress?.(0.32, 'تم تجهيز التدفق الصوتي النقي');
    return mirrorStreamUrl;
  }

  // 3. Final converter fallback
  return extractMirrorMediaStream(cleanId, 'm4a', onProgress);
}

/**
 * Verify downloaded media file is genuine audio/video (not HTML error or empty blob)
 */
async function verifyMediaFileIntegrity(
  uri: string,
  minBytes: number = MIN_AUDIO_BYTES
): Promise<{ ok: boolean; size: number }> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    const size = (info as any).size || 0;
    if (!info.exists || size < minBytes) {
      return { ok: false, size };
    }
    const headerSnippet = await FileSystem.readAsStringAsync(uri, { length: 128, position: 0 }).catch(() => '');
    const lower = headerSnippet.trim().toLowerCase();
    if (
      lower.startsWith('<!doctype') ||
      lower.startsWith('<html') ||
      lower.startsWith('<head') ||
      lower.startsWith('{"error"') ||
      lower.startsWith('#extm3u')
    ) {
      return { ok: false, size };
    }
    return { ok: true, size };
  } catch {
    return { ok: false, size: 0 };
  }
}

async function verifyAudioFileIntegrity(uri: string): Promise<{ ok: boolean; size: number }> {
  return verifyMediaFileIntegrity(uri, MIN_AUDIO_BYTES);
}

/**
 * Persist crisp High-Definition square/HD cover art locally for offline UI & White Widget.
 */
async function persistLocalHqArtwork(
  track: Track,
  cleanId: string
): Promise<string> {
  const artworkTargetUri = `${TRACKS_DIR}${cleanId}_art.jpg`;
  const remoteArt =
    getUniversalStudioArtwork(track.thumbnail, track.title, track.artist, track.videoId) ||
    track.thumbnail ||
    '';

  try {
    const squareUri = await resolveLockScreenSquareArtworkAsync(
      remoteArt,
      track.title,
      track.artist,
      track.videoId
    ).catch(() => '');

    if (squareUri) {
      if (squareUri.startsWith('file://')) {
        await FileSystem.copyAsync({ from: squareUri, to: artworkTargetUri }).catch(() => {});
        const info = await FileSystem.getInfoAsync(artworkTargetUri).catch(() => ({ exists: false } as any));
        if (info.exists && (info.size || 0) >= 512) {
          return artworkTargetUri;
        }
      } else if (squareUri.startsWith('http')) {
        const res = await FileSystem.downloadAsync(squareUri, artworkTargetUri).catch(() => null);
        if (res?.uri) {
          const info = await FileSystem.getInfoAsync(res.uri).catch(() => ({ exists: false } as any));
          if (info.exists && (info.size || 0) >= 512) {
            return res.uri;
          }
        }
      }
    }
  } catch {
    // Fall through to direct candidate URLs
  }

  const artCandidates = Array.from(
    new Set(
      [
        remoteArt,
        track.thumbnail || '',
        isValidYouTubeId(track.videoId)
          ? `https://i.ytimg.com/vi/${track.videoId.trim()}/maxresdefault.jpg`
          : '',
        isValidYouTubeId(track.videoId)
          ? `https://i.ytimg.com/vi/${track.videoId.trim()}/hqdefault.jpg`
          : '',
      ].filter((u) => Boolean(u && u.startsWith('http')))
    )
  );

  for (const artUrl of artCandidates) {
    try {
      const res = await FileSystem.downloadAsync(artUrl, artworkTargetUri);
      if (res?.uri && (!res.status || res.status < 400)) {
        const info = await FileSystem.getInfoAsync(res.uri).catch(() => ({ exists: false } as any));
        if (info.exists && (info.size || 0) >= 1024) {
          return res.uri;
        }
      }
    } catch {
      // Try next candidate
    }
  }
  return '';
}

/**
 * Fast preflight verification: aborts unreachable / HTTP 403 PO-Token-gated streams
 * in ~150ms before entering file download, keeping only streams that serve real bytes.
 */
async function preflightVerifiedCandidates(
  candidates: ResolvedStreamCandidate[],
  minBytes: number
): Promise<ResolvedStreamCandidate[]> {
  if (candidates.length === 0) return [];
  const checks = await Promise.allSettled(
    candidates.map(async (c) => {
      if (c.url.startsWith('file://') || c.kind === 'hls_m4a' || c.kind === 'hls_mp3') {
        return c;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3200);
      try {
        const res = await fetch(c.url, {
          method: 'GET',
          signal: controller.signal,
          headers: c.headers || { 'User-Agent': MOBILE_SAFARI_USER_AGENT },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const cl = Number(res.headers.get('content-length') || 0);
        if (cl > 0 && cl < minBytes) {
          throw new Error(`Content too small (${cl})`);
        }
        return c;
      } finally {
        controller.abort();
        clearTimeout(timeout);
      }
    })
  );

  const valid: ResolvedStreamCandidate[] = [];
  for (const res of checks) {
    if (res.status === 'fulfilled') {
      valid.push(res.value);
    }
  }
  return valid;
}

/**
 * Shared atomic media candidate downloader with range-scaled progress reporting.
 */
async function downloadCandidatesToLocalFile(params: {
  candidates: ResolvedStreamCandidate[];
  cleanId: string;
  mediaKind: 'audio' | 'video';
  progressStart: number;
  progressEnd: number;
  onProgress: (ratio: number, writtenBytes: number, totalBytes: number) => void;
}): Promise<{ localUri: string; size: number; qualityLabel?: string }> {
  const { candidates, cleanId, mediaKind, progressStart, progressEnd, onProgress } = params;
  const tempPartUri = `${TRACKS_DIR}${cleanId}.${mediaKind}.part`;
  const minBytes = mediaKind === 'video' ? MIN_VIDEO_BYTES : MIN_AUDIO_BYTES;
  let lastError: any = null;

  for (let i = 0; i < candidates.length; i++) {
    const { url: streamUrl, kind = 'direct', ext, qualityLabel, headers: candidateHeaders } = candidates[i];
    const resolvedAudioExt = ext || (streamUrl.toLowerCase().includes('.mp3') ? 'mp3' : 'm4a');
    const targetLocalUri =
      mediaKind === 'video'
        ? `${TRACKS_DIR}${cleanId}.mp4`
        : resolvedAudioExt === 'mp4'
          ? `${TRACKS_DIR}${cleanId}_aud.mp4`
          : `${TRACKS_DIR}${cleanId}.${resolvedAudioExt}`;

    onProgress(progressStart, 0, 0);

    try {
      await FileSystem.deleteAsync(tempPartUri, { idempotent: true }).catch(() => {});

      if (streamUrl.startsWith('file://')) {
        await FileSystem.copyAsync({ from: streamUrl, to: tempPartUri });
      } else if (kind === 'hls_m4a' || kind === 'hls_mp3') {
        await downloadHlsSegmentsToFile(streamUrl, tempPartUri, (pct, written, total) => {
          const scaled = progressStart + pct * (progressEnd - progressStart);
          onProgress(Math.min(progressEnd, Math.max(progressStart, scaled)), written, total);
        });
      } else {
        const resumable = FileSystem.createDownloadResumable(
          streamUrl,
          tempPartUri,
          {
            headers: candidateHeaders || {
              'User-Agent': MOBILE_SAFARI_USER_AGENT,
            },
          },
          (downloadProgress) => {
            const expected = downloadProgress.totalBytesExpectedToWrite;
            const written = downloadProgress.totalBytesWritten;
            const rawFraction = expected > 0 ? Math.min(written / expected, 1) : 0.45;
            const scaled = progressStart + rawFraction * (progressEnd - progressStart);
            onProgress(Math.min(progressEnd, Math.max(progressStart, scaled)), written, expected);
          }
        );
        const result = await resumable.downloadAsync();
        if (!result?.uri) {
          throw new Error(`Empty response from source #${i + 1}`);
        }
        if ((result as any).status && (result as any).status >= 400) {
          throw new Error(`HTTP ${(result as any).status} from source #${i + 1}`);
        }
      }

      const { ok, size } = await verifyMediaFileIntegrity(tempPartUri, minBytes);
      if (!ok) {
        await FileSystem.deleteAsync(tempPartUri, { idempotent: true }).catch(() => {});
        lastError = new Error(`Downloaded ${mediaKind} file invalid (${(size / 1024).toFixed(1)} KB)`);
        continue;
      }

      if (mediaKind === 'audio') {
        await FileSystem.deleteAsync(`${TRACKS_DIR}${cleanId}.m4a`, { idempotent: true }).catch(() => {});
        await FileSystem.deleteAsync(`${TRACKS_DIR}${cleanId}.mp3`, { idempotent: true }).catch(() => {});
        await FileSystem.deleteAsync(`${TRACKS_DIR}${cleanId}_aud.mp4`, { idempotent: true }).catch(() => {});
      } else {
        await FileSystem.deleteAsync(`${TRACKS_DIR}${cleanId}.mp4`, { idempotent: true }).catch(() => {});
      }

      await FileSystem.moveAsync({ from: tempPartUri, to: targetLocalUri });
      return { localUri: targetLocalUri, size, qualityLabel };
    } catch (candidateErr: any) {
      lastError = candidateErr;
      await FileSystem.deleteAsync(tempPartUri, { idempotent: true }).catch(() => {});
    }
  }

  throw lastError || new Error(`Could not download ${mediaKind} file`);
}

/**
 * 🔍 Inspect physical device offline storage and log files + sizes
 */
export const inspectOfflineStorage = async (): Promise<void> => {
  try {
    const info = await FileSystem.getInfoAsync(TRACKS_DIR);
    if (!info.exists) return;
    const files = await FileSystem.readDirectoryAsync(TRACKS_DIR);
    console.log(`[Storage Check] Offline files ready: ${files.length}`);
  } catch {
    // Non-blocking
  }
};

class AudioDownloadService {
  private inFlightProbes = new Map<
    string,
    Promise<{
      streamUrl: string;
      candidateUrls: string[];
      candidates: ResolvedStreamCandidate[];
      bitrateLabel: string;
    }>
  >();
  private inFlightDownloads = new Map<string, Promise<DownloadedTrack>>();
  private cachedTracksById = new Map<string, DownloadedTrack>();
  private hasLoadedManifestCache = false;
  private manifestPrimePromise: Promise<void> | null = null;

  private syncCacheFromTracks(tracks: DownloadedTrack[]): void {
    this.cachedTracksById.clear();
    for (const track of tracks) {
      if (track?.videoId) {
        this.cachedTracksById.set(track.videoId, track);
      }
    }
    this.hasLoadedManifestCache = true;
  }

  private async primeManifestCacheFast(): Promise<void> {
    if (this.hasLoadedManifestCache) return;
    if (this.manifestPrimePromise) {
      await this.manifestPrimePromise;
      return;
    }

    this.manifestPrimePromise = (async () => {
      try {
        await this.ensureDirectories();
        let manifestList: DownloadedTrack[] = [];

        try {
          const fileInfo = await FileSystem.getInfoAsync(MANIFEST_FILE_PATH);
          if (fileInfo.exists) {
            const content = await FileSystem.readAsStringAsync(MANIFEST_FILE_PATH);
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) manifestList = parsed;
          }
        } catch {}

        if (manifestList.length === 0) {
          try {
            const raw = await AsyncStorage.getItem(DEVICE_OFFLINE_MANIFEST_KEY);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) manifestList = parsed;
            }
          } catch {}
        }

        this.syncCacheFromTracks(manifestList);
      } finally {
        this.manifestPrimePromise = null;
      }
    })();

    await this.manifestPrimePromise;
  }

  async ensureDirectories(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(TRACKS_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(TRACKS_DIR, { intermediates: true });
      }
    } catch (e) {
      console.warn('[DownloadService] Failed to create directories:', e);
    }
  }

  async getDownloadedTracks(): Promise<DownloadedTrack[]> {
    await this.ensureDirectories();

    let manifestList: DownloadedTrack[] = [];

    try {
      const fileInfo = await FileSystem.getInfoAsync(MANIFEST_FILE_PATH);
      if (fileInfo.exists) {
        const content = await FileSystem.readAsStringAsync(MANIFEST_FILE_PATH);
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) manifestList = parsed;
      }
    } catch (e) {
      console.warn('[DownloadService] Error reading manifest file:', e);
    }

    if (manifestList.length === 0) {
      try {
        const raw = await AsyncStorage.getItem(DEVICE_OFFLINE_MANIFEST_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) manifestList = parsed;
        }
      } catch (e) {
        console.warn('[DownloadService] Error reading AsyncStorage manifest:', e);
      }
    }

    const validTracks: DownloadedTrack[] = [];
    let hasChanged = false;

    for (const track of manifestList) {
      if (!track?.videoId) {
        hasChanged = true;
        continue;
      }

      const audioCheck = track.audioLocalUri
        ? await verifyMediaFileIntegrity(track.audioLocalUri, MIN_AUDIO_BYTES)
        : { ok: false, size: 0 };
      const videoCheck = track.videoLocalUri
        ? await verifyMediaFileIntegrity(track.videoLocalUri, MIN_VIDEO_BYTES)
        : { ok: false, size: 0 };

      if (!audioCheck.ok && track.audioLocalUri) {
        hasChanged = true;
        await FileSystem.deleteAsync(track.audioLocalUri, { idempotent: true }).catch(() => {});
      }
      if (!videoCheck.ok && track.videoLocalUri) {
        hasChanged = true;
        await FileSystem.deleteAsync(track.videoLocalUri, { idempotent: true }).catch(() => {});
      }

      if (audioCheck.ok || videoCheck.ok) {
        let validArtworkUri = track.artworkLocalUri || '';
        if (validArtworkUri) {
          const artInfo = await FileSystem.getInfoAsync(validArtworkUri).catch(() => ({ exists: false } as any));
          if (!artInfo.exists || (artInfo.size || 0) < 512) {
            validArtworkUri = '';
          }
        }
        const resolvedAudioUri = audioCheck.ok ? track.audioLocalUri : '';
        const resolvedVideoUri = videoCheck.ok ? track.videoLocalUri : undefined;
        const resolvedMode: DownloadMediaMode =
          audioCheck.ok && videoCheck.ok ? 'full' : videoCheck.ok ? 'video' : 'audio';
        const isSharedFile = Boolean(
          resolvedAudioUri && resolvedVideoUri && resolvedAudioUri === resolvedVideoUri
        );
        const combinedBytes = isSharedFile
          ? videoCheck.size
          : (audioCheck.ok ? audioCheck.size : 0) + (videoCheck.ok ? videoCheck.size : 0);

        validTracks.push({
          ...track,
          artworkLocalUri: validArtworkUri,
          audioLocalUri: resolvedAudioUri,
          videoLocalUri: resolvedVideoUri,
          mediaType: resolvedMode,
          audioFileSizeBytes: audioCheck.ok ? (isSharedFile ? 0 : audioCheck.size) : 0,
          videoFileSizeBytes: videoCheck.ok ? videoCheck.size : 0,
          fileSizeBytes: combinedBytes,
          fileSizeMB: `${(combinedBytes / (1024 * 1024)).toFixed(1)} MB`,
        });
      } else {
        hasChanged = true;
      }
    }

    if (hasChanged) {
      await this.saveManifest(validTracks);
    } else {
      this.syncCacheFromTracks(validTracks);
    }

    return validTracks;
  }

  private async saveManifest(tracks: DownloadedTrack[]): Promise<void> {
    const trimmed = tracks.slice(0, MAX_LOCAL_MANIFEST_ITEMS);
    this.syncCacheFromTracks(trimmed);
    const json = JSON.stringify(trimmed, null, 2);
    try {
      await FileSystem.writeAsStringAsync(MANIFEST_FILE_PATH, json);
    } catch (e) {
      console.warn('[DownloadService] Failed to write manifest file:', e);
    }
    try {
      await AsyncStorage.setItem(DEVICE_OFFLINE_MANIFEST_KEY, json);
    } catch (e) {
      console.warn('[DownloadService] Failed to save manifest to AsyncStorage:', e);
    }
  }

  async getLocalTrack(videoId?: string | null): Promise<DownloadedTrack | null> {
    if (!videoId) return null;

    if (!this.hasLoadedManifestCache) {
      await this.primeManifestCacheFast();
    }

    const found = this.cachedTracksById.get(videoId);
    if (!found) return null;

    const audioCheck = found.audioLocalUri
      ? await verifyMediaFileIntegrity(found.audioLocalUri, MIN_AUDIO_BYTES)
      : { ok: false, size: 0 };
    const videoCheck = found.videoLocalUri
      ? await verifyMediaFileIntegrity(found.videoLocalUri, MIN_VIDEO_BYTES)
      : { ok: false, size: 0 };

    if (!audioCheck.ok && !videoCheck.ok) {
      this.cachedTracksById.delete(videoId);
      return null;
    }

    if (found.artworkLocalUri) {
      const artInfo = await FileSystem.getInfoAsync(found.artworkLocalUri).catch(() => ({ exists: false } as any));
      if (!artInfo.exists || (artInfo.size || 0) < 512) {
        found.artworkLocalUri = '';
      }
    }

    const mediaType: DownloadMediaMode =
      audioCheck.ok && videoCheck.ok ? 'full' : videoCheck.ok ? 'video' : 'audio';

    return {
      ...found,
      audioLocalUri: audioCheck.ok ? found.audioLocalUri : '',
      videoLocalUri: videoCheck.ok ? found.videoLocalUri : undefined,
      mediaType,
      audioFileSizeBytes: audioCheck.ok ? audioCheck.size : 0,
      videoFileSizeBytes: videoCheck.ok ? videoCheck.size : 0,
    };
  }

  async probeVideoStream(
    track: Track,
    onProgress?: (progressRatio: number, statusText: string) => void
  ): Promise<{
    streamUrl: string;
    candidateUrls: string[];
    candidates: ResolvedStreamCandidate[];
    videoQualityLabel: string;
  }> {
    const probeKey = `video:${track.videoId || 'unknown'}`;
    if (this.inFlightProbes.has(probeKey)) {
      const cached = await this.inFlightProbes.get(probeKey)!;
      return {
        streamUrl: cached.streamUrl,
        candidateUrls: cached.candidateUrls,
        candidates: cached.candidates,
        videoQualityLabel: cached.bitrateLabel,
      };
    }

    const probePromise = this.executeProbeVideoStream(track, onProgress);
    this.inFlightProbes.set(probeKey, probePromise);
    try {
      const resolved = await probePromise;
      return {
        streamUrl: resolved.streamUrl,
        candidateUrls: resolved.candidateUrls,
        candidates: resolved.candidates,
        videoQualityLabel: resolved.bitrateLabel,
      };
    } finally {
      this.inFlightProbes.delete(probeKey);
    }
  }

  private async executeProbeVideoStream(
    track: Track,
    onProgress?: (progressRatio: number, statusText: string) => void
  ): Promise<{
    streamUrl: string;
    candidateUrls: string[];
    candidates: ResolvedStreamCandidate[];
    bitrateLabel: string;
  }> {
    const candidates: ResolvedStreamCandidate[] = [];
    const seenUrls = new Set<string>();
    const addCandidate = (candidate: ResolvedStreamCandidate) => {
      if (!candidate.url || seenUrls.has(candidate.url)) return;
      seenUrls.add(candidate.url);
      candidates.push(candidate);
    };

    const rawVid = track.videoId?.trim() || '';
    if (isValidYouTubeId(rawVid)) {
      onProgress?.(0.12, 'جاري استخراج الفيديو الأصلي...');
      const ytVideoRaw = await extractInnerTubeVideoCandidates(rawVid).catch(() => []);
      const ytVideoVerified = await preflightVerifiedCandidates(ytVideoRaw, MIN_VIDEO_BYTES);
      for (const c of ytVideoVerified) addCandidate(c);

      if (candidates.length === 0) {
        onProgress?.(0.2, 'جاري فحص خوادم الفيديو البديلة...');
        const mirrorVideoRaw = await extractPipedDirectVideoCandidates(rawVid).catch(() => []);
        const mirrorVideoVerified = await preflightVerifiedCandidates(mirrorVideoRaw, MIN_VIDEO_BYTES);
        for (const c of mirrorVideoVerified) addCandidate(c);
      }

      if (candidates.length === 0) {
        onProgress?.(0.26, 'جاري تجهيز ملف الفيديو MP4...');
        const mirrorMp4 = await extractMirrorMediaStream(rawVid, '360', onProgress).catch(() => '');
        if (mirrorMp4) {
          addCandidate({
            url: mirrorMp4,
            kind: 'direct',
            ext: 'mp4',
            qualityLabel: '360p MP4',
            headers: { 'User-Agent': MOBILE_SAFARI_USER_AGENT },
          });
        }
      }
    }

    if (candidates.length === 0) {
      throw new Error('تعذر العثور على مصدر فيديو متاح لهذا المقطع حالياً.');
    }

    onProgress?.(0.32, 'تم تجهيز مصادر الفيديو الأصلية');

    return {
      streamUrl: candidates[0].url,
      candidateUrls: candidates.map((c) => c.url),
      candidates,
      bitrateLabel: candidates[0].qualityLabel || 'HD MP4',
    };
  }

  async probeAudioStream(
    track: Track,
    quality: AudioQualityOption = 'auto',
    onProgress?: (progressRatio: number, statusText: string) => void
  ): Promise<{
    streamUrl: string;
    candidateUrls: string[];
    candidates: ResolvedStreamCandidate[];
    bitrateLabel: string;
  }> {
    const probeKey = track.videoId || track.audioUrl || 'unknown';
    if (this.inFlightProbes.has(probeKey)) {
      return this.inFlightProbes.get(probeKey)!;
    }

    const probePromise = this.executeProbeAudioStream(track, quality, onProgress);
    this.inFlightProbes.set(probeKey, probePromise);
    try {
      return await probePromise;
    } finally {
      this.inFlightProbes.delete(probeKey);
    }
  }

  private async executeProbeAudioStream(
    track: Track,
    _quality: AudioQualityOption = 'auto',
    onProgress?: (progressRatio: number, statusText: string) => void
  ): Promise<{
    streamUrl: string;
    candidateUrls: string[];
    candidates: ResolvedStreamCandidate[];
    bitrateLabel: string;
  }> {
    const candidates: ResolvedStreamCandidate[] = [];
    const seenUrls = new Set<string>();
    const addCandidate = (candidate: ResolvedStreamCandidate) => {
      if (!candidate.url || seenUrls.has(candidate.url)) return;
      seenUrls.add(candidate.url);
      candidates.push(candidate);
    };
    const bitrateLabel = 'AAC Master';

    if (
      track.audioUrl &&
      (track.audioUrl.startsWith('http') || track.audioUrl.startsWith('file://')) &&
      !track.audioUrl.includes('soundhelix.com')
    ) {
      const explicitExt: 'm4a' | 'mp3' = track.audioUrl.toLowerCase().includes('.mp3') ? 'mp3' : 'm4a';
      addCandidate({
        url: track.audioUrl,
        kind: 'direct',
        ext: explicitExt,
        headers: { 'User-Agent': MOBILE_SAFARI_USER_AGENT },
      });
    }

    // 1. Direct InnerTube adaptive audio (verified no-403 preflight)
    if (candidates.length === 0 && isValidYouTubeId(track.videoId)) {
      const cleanId = track.videoId.trim();
      onProgress?.(0.10, 'جاري فحص النسخة الصوتية الأصلية...');
      const ytAudioRaw = await extractInnerTubeAudioCandidates(cleanId).catch(() => []);
      const ytAudioVerified = await preflightVerifiedCandidates(ytAudioRaw, MIN_AUDIO_BYTES);
      for (const c of ytAudioVerified) {
        addCandidate(c);
      }
    }

    // 2. Exact-Track Mirrors: Piped & Invidious audio for exact videoId
    if (candidates.length === 0 && isValidYouTubeId(track.videoId)) {
      const cleanId = track.videoId.trim();
      onProgress?.(0.16, 'جاري الاتصال بمصدر الصوت المباشر...');
      const pipedUrl = await extractPipedDirectAudioStream(cleanId).catch(() => null);
      if (pipedUrl) {
        const verified = await preflightVerifiedCandidates(
          [{ url: pipedUrl, kind: 'direct', ext: 'm4a', headers: { 'User-Agent': MOBILE_SAFARI_USER_AGENT } }],
          MIN_AUDIO_BYTES
        );
        for (const c of verified) addCandidate(c);
      }
    }

    // 3. Exact-Track Converter Mirror (exact videoId -> m4a)
    if (candidates.length === 0 && isValidYouTubeId(track.videoId)) {
      const cleanId = track.videoId.trim();
      const mirrorUrl = await extractMirrorMediaStream(cleanId, 'm4a', onProgress).catch(() => '');
      if (mirrorUrl) {
        const verified = await preflightVerifiedCandidates(
          [{ url: mirrorUrl, kind: 'direct', ext: 'm4a', headers: { 'User-Agent': MOBILE_SAFARI_USER_AGENT } }],
          MIN_AUDIO_BYTES
        );
        for (const c of verified) addCandidate(c);
      }
    }

    // 4. Guaranteed Exact-Track Progressive MP4 Audio+Video (ANDROID itag 18, HTTP 200 verified end-to-end)
    if (candidates.length === 0 && isValidYouTubeId(track.videoId)) {
      const cleanId = track.videoId.trim();
      onProgress?.(0.22, 'جاري تجهيز البث الصوتي المباشر...');
      const ytMuxRaw = await extractInnerTubeVideoCandidates(cleanId).catch(() => []);
      const ytMuxVerified = await preflightVerifiedCandidates(ytMuxRaw, MIN_AUDIO_BYTES);
      for (const c of ytMuxVerified) {
        addCandidate({
          ...c,
          ext: 'mp4',
        });
      }
    }

    // 5. Last-Resort High-Threshold SoundCloud Fallback ONLY when all YouTube exact sources failed
    if (candidates.length === 0) {
      onProgress?.(0.28, 'جاري البحث عن مصدر بديل مطابق...');
      const scCandidates = await extractSoundCloudAudioCandidates(track).catch(() => []);
      for (const c of scCandidates) {
        addCandidate(c);
      }
    }

    if (candidates.length === 0) {
      throw new Error('تعذر العثور على مصدر صوت متاح للتحميل حالياً.');
    }

    onProgress?.(0.32, 'تم تجهيز مصادر الصوت الأصلية');

    return {
      streamUrl: candidates[0].url,
      candidateUrls: candidates.map((c) => c.url),
      candidates,
      bitrateLabel,
    };
  }

  /**
   * Single-flight atomic track download supporting 'audio' (Music Only), 'video' (Video Only),
   * or 'full' (Music + Video), plus incremental upgrades without re-downloading existing media.
   */
  async downloadTrack(
    track: Track,
    qualityOrOptions: AudioQualityOption | DownloadTrackOptions = 'auto',
    onProgressUpdate?: (progress: number) => void
  ): Promise<DownloadedTrack> {
    const videoId = track.videoId || String((track as any).id || '').trim();
    if (!videoId) {
      throw new Error('Track must have a valid videoId to download.');
    }

    const opts: DownloadTrackOptions =
      typeof qualityOrOptions === 'string'
        ? { quality: qualityOrOptions, mode: 'audio', onProgressUpdate }
        : {
            quality: qualityOrOptions?.quality || 'auto',
            mode: qualityOrOptions?.mode || 'audio',
            onProgressUpdate: qualityOrOptions?.onProgressUpdate || onProgressUpdate,
          };

    const existingPromise = this.inFlightDownloads.get(videoId);
    if (existingPromise) {
      return existingPromise;
    }

    const downloadPromise = this.executeDownloadTrack(
      track,
      videoId,
      opts.quality || 'auto',
      opts.mode || 'audio',
      opts.onProgressUpdate
    );
    this.inFlightDownloads.set(videoId, downloadPromise);
    try {
      return await downloadPromise;
    } finally {
      this.inFlightDownloads.delete(videoId);
    }
  }

  private async executeDownloadTrack(
    track: Track,
    videoId: string,
    quality: AudioQualityOption,
    mode: DownloadMediaMode,
    onProgressUpdate?: (progress: number) => void
  ): Promise<DownloadedTrack> {
    await this.ensureDirectories();

    const updateStoreProgress = (progressState: DownloadProgressState) => {
      useDownloadStore.setState((s) => ({
        activeDownloads: {
          ...s.activeDownloads,
          [videoId]: progressState,
        },
      }));
      onProgressUpdate?.(progressState.progress);
    };

    updateStoreProgress({
      videoId,
      progress: 0.04,
      totalBytes: 0,
      writtenBytes: 0,
      downloadingMode: mode,
      status: 'probing',
    });

    try {
      const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const existing = await this.getLocalTrack(videoId);

      const needAudio = (mode === 'audio' || mode === 'full') && !existing?.audioLocalUri;
      const needVideo = (mode === 'video' || mode === 'full') && !existing?.videoLocalUri;

      const existingArtInfo = existing?.artworkLocalUri
        ? await FileSystem.getInfoAsync(existing.artworkLocalUri).catch(() => ({ exists: false } as any))
        : null;
      const hasCrispExistingArt = Boolean(
        existingArtInfo?.exists && ((existingArtInfo as any).size || 0) >= 15 * 1024
      );
      const artPromise = hasCrispExistingArt
        ? Promise.resolve(existing!.artworkLocalUri)
        : persistLocalHqArtwork(track, cleanId);

      let audioLocalUri = existing?.audioLocalUri || '';
      let audioSizeBytes = existing?.audioFileSizeBytes || 0;
      let bitrateLabel = existing?.bitrateLabel || 'AAC Master';

      let videoLocalUri = existing?.videoLocalUri;
      let videoSizeBytes = existing?.videoFileSizeBytes || 0;
      let videoQualityLabel = existing?.videoQualityLabel;

      const bothToFetch = needAudio && needVideo;

      // Upgrade case 1: Audio-Only already saved as `_aud.mp4` -> 0ms promote to Full `.mp4`!
      if (
        !needAudio &&
        needVideo &&
        audioLocalUri.endsWith('_aud.mp4')
      ) {
        const promotedVideoUri = `${TRACKS_DIR}${cleanId}.mp4`;
        await FileSystem.deleteAsync(promotedVideoUri, { idempotent: true }).catch(() => {});
        await FileSystem.moveAsync({ from: audioLocalUri, to: promotedVideoUri });
        const promotedInfo = await verifyMediaFileIntegrity(promotedVideoUri, MIN_VIDEO_BYTES);
        audioLocalUri = promotedVideoUri;
        videoLocalUri = promotedVideoUri;
        audioSizeBytes = 0;
        videoSizeBytes = promotedInfo.size || existing?.fileSizeBytes || 0;
        videoQualityLabel = videoQualityLabel || '360p MP4';
      } else if (bothToFetch) {
        // Fresh Full (Music + Video) download
        const audioProbe = await this.probeAudioStream(track, quality, (ratio) => {
          updateStoreProgress({
            videoId,
            progress: Math.min(0.18, Math.max(0.05, ratio * 0.55)),
            totalBytes: 0,
            writtenBytes: 0,
            downloadingMode: mode,
            status: 'probing',
          });
        });
        bitrateLabel = audioProbe.bitrateLabel;

        const firstAudioExt = audioProbe.candidates[0]?.ext;
        if (firstAudioExt === 'mp4') {
          // Single progressive MP4 (contains both Video + AAC Audio) -> 1 download, 0ms instant Music<->Video sync!
          const videoProbe = await this.probeVideoStream(track, (ratio) => {
            updateStoreProgress({
              videoId,
              progress: Math.min(0.30, 0.18 + ratio * 0.12),
              totalBytes: 0,
              writtenBytes: 0,
              downloadingMode: mode,
              status: 'probing',
            });
          });
          const mergedCandidates =
            videoProbe.candidates.length > 0 ? videoProbe.candidates : audioProbe.candidates;
          videoQualityLabel = videoProbe.videoQualityLabel || mergedCandidates[0]?.qualityLabel || '360p MP4';

          const fullRes = await downloadCandidatesToLocalFile({
            candidates: mergedCandidates,
            cleanId,
            mediaKind: 'video',
            progressStart: 0.32,
            progressEnd: 0.96,
            onProgress: (ratio, written, total) => {
              updateStoreProgress({
                videoId,
                progress: ratio,
                totalBytes: total,
                writtenBytes: written,
                downloadingMode: mode,
                status: 'downloading',
              });
            },
          });
          videoLocalUri = fullRes.localUri;
          audioLocalUri = fullRes.localUri;
          videoSizeBytes = fullRes.size;
          audioSizeBytes = 0;
          if (fullRes.qualityLabel) videoQualityLabel = fullRes.qualityLabel;
        } else {
          // Distinct compact audio (.m4a/.mp3) + video (.mp4)
          const audioRes = await downloadCandidatesToLocalFile({
            candidates: audioProbe.candidates,
            cleanId,
            mediaKind: 'audio',
            progressStart: 0.20,
            progressEnd: 0.48,
            onProgress: (ratio, written, total) => {
              updateStoreProgress({
                videoId,
                progress: ratio,
                totalBytes: total,
                writtenBytes: written,
                downloadingMode: mode,
                status: 'downloading',
              });
            },
          });
          audioLocalUri = audioRes.localUri;
          audioSizeBytes = audioRes.size;

          const videoProbe = await this.probeVideoStream(track, (ratio) => {
            updateStoreProgress({
              videoId,
              progress: Math.min(0.62, 0.50 + ratio * 0.12),
              totalBytes: 0,
              writtenBytes: 0,
              downloadingMode: mode,
              status: 'probing',
            });
          });
          videoQualityLabel = videoProbe.videoQualityLabel;

          const videoRes = await downloadCandidatesToLocalFile({
            candidates: videoProbe.candidates,
            cleanId,
            mediaKind: 'video',
            progressStart: 0.64,
            progressEnd: 0.96,
            onProgress: (ratio, written, total) => {
              updateStoreProgress({
                videoId,
                progress: ratio,
                totalBytes: total,
                writtenBytes: written,
                downloadingMode: mode,
                status: 'downloading',
              });
            },
          });
          videoLocalUri = videoRes.localUri;
          videoSizeBytes = videoRes.size;
          if (videoRes.qualityLabel) videoQualityLabel = videoRes.qualityLabel;
        }
      } else {
        if (needAudio) {
          const audioProbe = await this.probeAudioStream(track, quality, (ratio) => {
            updateStoreProgress({
              videoId,
              progress: Math.min(0.30, Math.max(0.05, ratio)),
              totalBytes: 0,
              writtenBytes: 0,
              downloadingMode: mode,
              status: 'probing',
            });
          });
          bitrateLabel = audioProbe.bitrateLabel;

          // Upgrade case 2: Video Only already downloaded & audio fell back to same MP4 -> unlock in 0ms!
          if (videoLocalUri && audioProbe.candidates[0]?.ext === 'mp4') {
            audioLocalUri = videoLocalUri;
            audioSizeBytes = 0;
          } else {
            const audioRes = await downloadCandidatesToLocalFile({
              candidates: audioProbe.candidates,
              cleanId,
              mediaKind: 'audio',
              progressStart: 0.32,
              progressEnd: 0.96,
              onProgress: (ratio, written, total) => {
                updateStoreProgress({
                  videoId,
                  progress: ratio,
                  totalBytes: total,
                  writtenBytes: written,
                  downloadingMode: mode,
                  status: 'downloading',
                });
              },
            });
            audioLocalUri = audioRes.localUri;
            audioSizeBytes = audioRes.size;
          }
        }

        if (needVideo) {
          const videoProbe = await this.probeVideoStream(track, (ratio) => {
            updateStoreProgress({
              videoId,
              progress: Math.min(0.30, Math.max(0.06, ratio)),
              totalBytes: 0,
              writtenBytes: 0,
              downloadingMode: mode,
              status: 'probing',
            });
          });
          videoQualityLabel = videoProbe.videoQualityLabel;

          const videoRes = await downloadCandidatesToLocalFile({
            candidates: videoProbe.candidates,
            cleanId,
            mediaKind: 'video',
            progressStart: 0.32,
            progressEnd: 0.96,
            onProgress: (ratio, written, total) => {
              updateStoreProgress({
                videoId,
                progress: ratio,
                totalBytes: total,
                writtenBytes: written,
                downloadingMode: mode,
                status: 'downloading',
              });
            },
          });
          videoLocalUri = videoRes.localUri;
          videoSizeBytes = videoRes.size;
          if (videoRes.qualityLabel) videoQualityLabel = videoRes.qualityLabel;
        }
      }

      const verifiedArtworkUri = await Promise.race([
        artPromise,
        new Promise<string>((r) => setTimeout(() => r(''), 2200)),
      ]);

      const resolvedMode: DownloadMediaMode =
        audioLocalUri && videoLocalUri ? 'full' : videoLocalUri ? 'video' : 'audio';
      const isSharedFile = Boolean(audioLocalUri && videoLocalUri && audioLocalUri === videoLocalUri);
      const combinedSizeBytes = isSharedFile
        ? videoSizeBytes
        : (audioLocalUri ? audioSizeBytes : 0) + (videoLocalUri ? videoSizeBytes : 0);

      if (combinedSizeBytes < MIN_AUDIO_BYTES) {
        throw new Error('تعذر حفظ الملف بشكل سليم على ذاكرة الهاتف.');
      }

      const sizeMB = `${(combinedSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
      const newDownloadedTrack: DownloadedTrack = {
        videoId,
        title: track.title || existing?.title || 'Track',
        artist: track.artist || existing?.artist || 'Artist',
        album: track.album || existing?.album,
        thumbnail: track.thumbnail || existing?.thumbnail || '',
        artworkLocalUri: verifiedArtworkUri || existing?.artworkLocalUri || '',
        audioLocalUri,
        videoLocalUri,
        mediaType: resolvedMode,
        duration: track.duration || existing?.duration || 180000,
        quality,
        bitrateLabel,
        videoQualityLabel,
        audioFileSizeBytes: audioSizeBytes,
        videoFileSizeBytes: videoSizeBytes,
        fileSizeBytes: combinedSizeBytes,
        fileSizeMB: sizeMB,
        downloadedAt: Date.now(),
      };

      const currentList = await this.getDownloadedTracks();
      const updatedList = [
        newDownloadedTrack,
        ...currentList.filter((t) => t.videoId !== videoId),
      ];
      await this.saveManifest(updatedList);

      // Sync lightweight track metadata (no media file) to user's Firestore catalog
      const currentUid = auth.currentUser?.uid;
      if (currentUid) {
        addFirebaseDownloadedCatalogItem(currentUid, {
          ...newDownloadedTrack,
          thumbnail: track.thumbnail || newDownloadedTrack.thumbnail,
        }).catch(() => {});
      }

      updateStoreProgress({
        videoId,
        progress: 1.0,
        totalBytes: combinedSizeBytes,
        writtenBytes: combinedSizeBytes,
        downloadingMode: resolvedMode,
        status: 'completed',
      });

      await useDownloadStore.getState().loadManifest();
      await inspectOfflineStorage();

      setTimeout(() => {
        useDownloadStore.setState((s) => {
          const copy = { ...s.activeDownloads };
          delete copy[videoId];
          return { activeDownloads: copy };
        });
      }, 1200);

      return newDownloadedTrack;
    } catch (error: any) {
      updateStoreProgress({
        videoId,
        progress: 0,
        totalBytes: 0,
        writtenBytes: 0,
        downloadingMode: mode,
        status: 'error',
        error: error?.message || 'Download failed',
      });
      setTimeout(() => {
        useDownloadStore.setState((s) => {
          if (s.activeDownloads[videoId]?.status !== 'error') return s;
          const copy = { ...s.activeDownloads };
          delete copy[videoId];
          return { activeDownloads: copy };
        });
      }, 2500);
      throw error;
    }
  }

  async deleteDownloadedTrack(
    videoId: string,
    removeMode: 'audio' | 'video' | 'all' = 'all'
  ): Promise<boolean> {
    try {
      const currentList = await this.getDownloadedTracks();
      const target = currentList.find((t) => t.videoId === videoId);
      if (!target) return false;

      const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const isSharedFile = Boolean(
        target.audioLocalUri && target.videoLocalUri && target.audioLocalUri === target.videoLocalUri
      );

      if (removeMode === 'video' && target.videoLocalUri && target.audioLocalUri) {
        let keptAudioUri = target.audioLocalUri;
        let audioSize = target.audioFileSizeBytes || target.fileSizeBytes || 0;
        if (isSharedFile) {
          // Move shared .mp4 -> _aud.mp4 so Video UI turns off while Music Audio stays intact offline
          const audMp4 = `${TRACKS_DIR}${cleanId}_aud.mp4`;
          await FileSystem.deleteAsync(audMp4, { idempotent: true }).catch(() => {});
          await FileSystem.moveAsync({ from: target.videoLocalUri, to: audMp4 });
          keptAudioUri = audMp4;
          audioSize = target.videoFileSizeBytes || target.fileSizeBytes || 0;
        } else {
          await FileSystem.deleteAsync(target.videoLocalUri, { idempotent: true }).catch(() => {});
        }
        const downgraded: DownloadedTrack = {
          ...target,
          audioLocalUri: keptAudioUri,
          audioFileSizeBytes: audioSize,
          videoLocalUri: undefined,
          videoFileSizeBytes: 0,
          videoQualityLabel: undefined,
          mediaType: 'audio',
          fileSizeBytes: audioSize,
          fileSizeMB: `${(audioSize / (1024 * 1024)).toFixed(1)} MB`,
        };
        const updatedList = currentList.map((t) => (t.videoId === videoId ? downgraded : t));
        await this.saveManifest(updatedList);
        await useDownloadStore.getState().loadManifest();
        return true;
      }

      if (removeMode === 'audio' && target.audioLocalUri && target.videoLocalUri) {
        if (!isSharedFile) {
          await FileSystem.deleteAsync(target.audioLocalUri, { idempotent: true }).catch(() => {});
        }
        const videoSize = target.videoFileSizeBytes || target.fileSizeBytes || 0;
        const downgraded: DownloadedTrack = {
          ...target,
          audioLocalUri: '',
          audioFileSizeBytes: 0,
          mediaType: 'video',
          fileSizeBytes: videoSize,
          fileSizeMB: `${(videoSize / (1024 * 1024)).toFixed(1)} MB`,
        };
        const updatedList = currentList.map((t) => (t.videoId === videoId ? downgraded : t));
        await this.saveManifest(updatedList);
        await useDownloadStore.getState().loadManifest();
        return true;
      }

      if (target.audioLocalUri) {
        await FileSystem.deleteAsync(target.audioLocalUri, { idempotent: true }).catch(() => {});
      }
      if (target.videoLocalUri) {
        await FileSystem.deleteAsync(target.videoLocalUri, { idempotent: true }).catch(() => {});
      }
      if (target.artworkLocalUri) {
        await FileSystem.deleteAsync(target.artworkLocalUri, { idempotent: true }).catch(() => {});
      }

      const updatedList = currentList.filter((t) => t.videoId !== videoId);
      await this.saveManifest(updatedList);
      await useDownloadStore.getState().loadManifest();
      return true;
    } catch (e) {
      console.warn('[DownloadService] Delete error:', e);
      return false;
    }
  }

  async getStorageUsage(): Promise<{ totalBytes: number; totalMB: string; trackCount: number }> {
    const tracks = await this.getDownloadedTracks();
    const totalBytes = tracks.reduce((sum, t) => sum + (t.fileSizeBytes || 0), 0);
    return {
      totalBytes,
      totalMB: `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`,
      trackCount: tracks.length,
    };
  }

  async clearAllDownloads(): Promise<boolean> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(DOWNLOAD_BASE_DIR);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(DOWNLOAD_BASE_DIR, { idempotent: true });
      }
      await AsyncStorage.removeItem(DEVICE_OFFLINE_MANIFEST_KEY);
      this.syncCacheFromTracks([]);
      await this.ensureDirectories();
      await useDownloadStore.getState().loadManifest();
      return true;
    } catch (e) {
      console.warn('[DownloadService] Clear all downloads error:', e);
      return false;
    }
  }
}

export const downloadService = new AudioDownloadService();

/**
 * Shared queue mapper ensuring Audio Only, Video Only, and Full offline items
 * map consistently across Home, Library, Search, and Offline Queues.
 */
export function downloadedTrackToQueueTrack(d: DownloadedTrack): Track {
  const mode = resolveDownloadedMediaMode(d);
  return {
    videoId: d.videoId,
    title: d.title,
    artist: d.artist,
    album: d.album,
    thumbnail: d.artworkLocalUri || d.thumbnail,
    audioUrl: d.audioLocalUri || d.videoLocalUri,
    videoUrl: d.videoLocalUri,
    offlineMode: mode,
    duration: d.duration,
  };
}
