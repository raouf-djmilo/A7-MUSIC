import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { Track } from '../store/useAudioStore';
import { getUniversalStudioArtwork } from '../utils/artworkHelper';
import { auth } from '../lib/firebase';
import {
  addFirebaseDownloadedCatalogItem,
} from './firebaseMusicDb';

// ── Directory & Storage Constants ──
const DOWNLOAD_BASE_DIR = `${FileSystem.documentDirectory}a7flow_download_music/`;
const TRACKS_DIR = `${DOWNLOAD_BASE_DIR}tracks/`;
const MANIFEST_FILE_PATH = `${DOWNLOAD_BASE_DIR}a7flow_manifest.json`;

// Minimum physical size to reject empty / 403 error responses while keeping valid short tracks
const MIN_AUDIO_BYTES = 150 * 1024;
const MAX_LOCAL_MANIFEST_ITEMS = 500;

// Global device-level key (NOT user specific: local phone audio files work across accounts & offline)
export const DEVICE_OFFLINE_MANIFEST_KEY = '@a7flow_device_offline_manifest';

// Kept for type compatibility; downloads now use a single native stream quality automatically
export type AudioQualityOption = 'auto' | 'high' | 'medium';

export interface DownloadedTrack {
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  thumbnail: string;
  artworkLocalUri: string;
  audioLocalUri: string;
  duration: number; // in milliseconds
  quality: AudioQualityOption;
  bitrateLabel: string;
  fileSizeBytes: number;
  fileSizeMB: string; // e.g. "5.2 MB"
  downloadedAt: number;
}

export interface DownloadProgressState {
  videoId: string;
  progress: number; // 0.0 -> 1.0
  totalBytes: number;
  writtenBytes: number;
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
  isTrackDownloaded: (videoId?: string | null) => boolean;
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

  isTrackDownloaded: (videoId) => {
    if (!videoId) return false;
    return get().downloadedTracks.some((t) => t.videoId === videoId);
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
  headers?: Record<string, string>;
}

const IOS_CLIENT_VERSION = '20.03.2';
const IOS_CLIENT_USER_AGENT =
  'com.google.ios.youtube/20.03.2 (iPhone16,2; U; CPU iOS 18_2_0 like Mac OS X; en_US)';
const ANDROID_VR_USER_AGENT =
  'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 14; en_US; Quest 3 Build/SQ3A.220605.009.A1) gzip';
const BROWSER_WATCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MOBILE_SAFARI_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

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

/**
 * ⚡ Stage 1: Verified YouTube InnerTube Player API (iOS 20.03.2 with live API key & visitorData + Android VR)
 */
async function extractInnerTubeAudioCandidates(cleanId: string): Promise<ResolvedStreamCandidate[]> {
  const queryWithSession = async (session: InnerTubeSessionContext | null): Promise<ResolvedStreamCandidate[]> => {
    const clients = [
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
        androidSdkVersion: 34,
        hl: 'en',
        gl: 'US',
        ua: ANDROID_VR_USER_AGENT,
      },
    ];

    const playerEndpoint = session?.apiKey
      ? `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(session.apiKey)}&prettyPrint=false`
      : 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';

    const settled = await Promise.allSettled(
      clients.map(async (c) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
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
          const formats = json?.streamingData?.adaptiveFormats || [];
          const audioFormats = formats.filter(
            (f: any) => typeof f?.url === 'string' && `${f?.mimeType || ''}`.startsWith('audio/')
          );
          const urls = pickBestAudioUrls(audioFormats);
          if (urls.length === 0) throw new Error('No direct audio formats');
          return {
            priority: c.priority,
            candidates: urls.map((url) => ({ url, headers: { 'User-Agent': c.ua } })),
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

  const session = await fetchInnerTubeSession(cleanId, false);
  const firstPass = await queryWithSession(session);
  if (firstPass.length > 0) return firstPass;

  // Retry once with a fresh watch-page InnerTube API key & visitorData if cached session expired
  const refreshedSession = await fetchInnerTubeSession(cleanId, true);
  if (refreshedSession && refreshedSession !== session) {
    return queryWithSession(refreshedSession);
  }
  return [];
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

/**
 * ⚡ Stage 3: Converter Mirror Fallback
 */
async function extractMirrorAudioStream(
  cleanId: string,
  onProgress?: (progressRatio: number, statusText: string) => void
): Promise<string> {
  const youtubeUrl = `https://www.youtube.com/watch?v=${cleanId}`;
  const endpoints = [
    `https://loader.to/ajax/download.php?format=m4a&url=${encodeURIComponent(youtubeUrl)}`,
    `https://en.loader.to/ajax/download.php?format=m4a&url=${encodeURIComponent(youtubeUrl)}`,
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
  return extractMirrorAudioStream(cleanId, onProgress);
}

/**
 * Verify downloaded file is genuine audio (not HTML error or empty blob)
 */
async function verifyAudioFileIntegrity(uri: string): Promise<{ ok: boolean; size: number }> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    const size = (info as any).size || 0;
    if (!info.exists || size < MIN_AUDIO_BYTES) {
      return { ok: false, size };
    }
    const headerSnippet = await FileSystem.readAsStringAsync(uri, { length: 128, position: 0 }).catch(() => '');
    const lower = headerSnippet.trim().toLowerCase();
    if (
      lower.startsWith('<!doctype') ||
      lower.startsWith('<html') ||
      lower.startsWith('<head') ||
      lower.startsWith('{"error"')
    ) {
      return { ok: false, size };
    }
    return { ok: true, size };
  } catch {
    return { ok: false, size: 0 };
  }
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
      if (!track?.videoId || !track?.audioLocalUri) {
        hasChanged = true;
        continue;
      }
      const { ok, size } = await verifyAudioFileIntegrity(track.audioLocalUri);
      if (ok) {
        let validArtworkUri = track.artworkLocalUri || '';
        if (validArtworkUri) {
          const artInfo = await FileSystem.getInfoAsync(validArtworkUri).catch(() => ({ exists: false } as any));
          if (!artInfo.exists || (artInfo.size || 0) < 512) {
            validArtworkUri = '';
          }
        }
        validTracks.push({
          ...track,
          artworkLocalUri: validArtworkUri,
          fileSizeBytes: size,
          fileSizeMB: `${(size / (1024 * 1024)).toFixed(1)} MB`,
        });
      } else {
        hasChanged = true;
        await FileSystem.deleteAsync(track.audioLocalUri, { idempotent: true }).catch(() => {});
      }
    }

    if (hasChanged) {
      await this.saveManifest(validTracks);
    }

    return validTracks;
  }

  private async saveManifest(tracks: DownloadedTrack[]): Promise<void> {
    const trimmed = tracks.slice(0, MAX_LOCAL_MANIFEST_ITEMS);
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
    const tracks = await this.getDownloadedTracks();
    const found = tracks.find((t) => t.videoId === videoId);
    if (!found) return null;

    const { ok } = await verifyAudioFileIntegrity(found.audioLocalUri);
    return ok ? found : null;
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
      addCandidate({ url: track.audioUrl, headers: { 'User-Agent': MOBILE_SAFARI_USER_AGENT } });
    }

    if (isValidYouTubeId(track.videoId)) {
      const cleanId = track.videoId.trim();
      const innerTubeCandidates = await extractInnerTubeAudioCandidates(cleanId);
      for (const c of innerTubeCandidates) {
        addCandidate(c);
      }

      if (candidates.length === 0) {
        const pipedUrl = await extractPipedDirectAudioStream(cleanId);
        if (pipedUrl) {
          addCandidate({ url: pipedUrl, headers: { 'User-Agent': MOBILE_SAFARI_USER_AGENT } });
        }
      }

      if (candidates.length === 0) {
        const mirrorUrl = await extractMirrorAudioStream(cleanId, onProgress);
        if (mirrorUrl) {
          addCandidate({ url: mirrorUrl, headers: { 'User-Agent': MOBILE_SAFARI_USER_AGENT } });
        }
      } else {
        onProgress?.(0.32, 'تم تجهيز مصادر الصوت الأصلية');
      }
    }

    if (candidates.length === 0) {
      throw new Error('تعذر العثور على رابط الصوت الأصلي لهذا المقطع.');
    }

    return {
      streamUrl: candidates[0].url,
      candidateUrls: candidates.map((c) => c.url),
      candidates,
      bitrateLabel,
    };
  }

  /**
   * 📥 Single-flight atomic track download to device storage + lightweight cloud catalog metadata sync
   */
  async downloadTrack(
    track: Track,
    quality: AudioQualityOption = 'auto',
    onProgressUpdate?: (progress: number) => void
  ): Promise<DownloadedTrack> {
    const videoId = track.videoId || String((track as any).id || '').trim();
    if (!videoId) {
      throw new Error('Track must have a valid videoId to download.');
    }

    const existingPromise = this.inFlightDownloads.get(videoId);
    if (existingPromise) {
      return existingPromise;
    }

    const downloadPromise = this.executeDownloadTrack(track, videoId, quality, onProgressUpdate);
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
      progress: 0.05,
      totalBytes: 0,
      writtenBytes: 0,
      status: 'probing',
    });

    try {
      const { candidates, bitrateLabel } = await this.probeAudioStream(
        track,
        quality,
        (ratio) => {
          updateStoreProgress({
            videoId,
            progress: Math.min(0.32, Math.max(0.05, ratio)),
            totalBytes: 0,
            writtenBytes: 0,
            status: 'probing',
          });
        }
      );

      const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const artworkTargetUri = `${TRACKS_DIR}${cleanId}_art.jpg`;
      let verifiedArtworkUri = '';

      // Download cover art locally in parallel with probing completion
      const remoteArt = getUniversalStudioArtwork(track.thumbnail, track.title, track.artist, videoId) || track.thumbnail;
      const artPromise = (async () => {
        if (remoteArt && remoteArt.startsWith('http')) {
          try {
            const artRes = await FileSystem.downloadAsync(remoteArt, artworkTargetUri);
            if (artRes?.uri) {
              const artInfo = await FileSystem.getInfoAsync(artRes.uri);
              if (artInfo.exists && ((artInfo as any).size || 0) >= 512) {
                verifiedArtworkUri = artRes.uri;
              }
            }
          } catch {
            // Artwork cache optional
          }
        }
      })();

      const audioLocalUri = `${TRACKS_DIR}${cleanId}.m4a`;
      const tempPartUri = `${TRACKS_DIR}${cleanId}.m4a.part`;

      let finalSizeBytes = 0;
      let downloadSucceeded = false;
      let lastError: any = null;

      for (let i = 0; i < candidates.length; i++) {
        const { url: streamUrl, headers: candidateHeaders } = candidates[i];
        updateStoreProgress({
          videoId,
          progress: 0.35,
          totalBytes: 0,
          writtenBytes: 0,
          status: 'downloading',
        });

        try {
          await FileSystem.deleteAsync(tempPartUri, { idempotent: true }).catch(() => {});

          if (streamUrl.startsWith('file://')) {
            await FileSystem.copyAsync({ from: streamUrl, to: tempPartUri });
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
                const pct = expected > 0 ? Math.min(0.35 + (written / expected) * 0.63, 0.98) : 0.62;
                updateStoreProgress({
                  videoId,
                  progress: pct,
                  totalBytes: expected,
                  writtenBytes: written,
                  status: 'downloading',
                });
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

          const { ok, size } = await verifyAudioFileIntegrity(tempPartUri);
          if (!ok) {
            await FileSystem.deleteAsync(tempPartUri, { idempotent: true }).catch(() => {});
            lastError = new Error(`Downloaded file invalid (${(size / 1024).toFixed(1)} KB)`);
            continue;
          }

          // Atomic swap temp -> final path
          await FileSystem.deleteAsync(audioLocalUri, { idempotent: true }).catch(() => {});
          await FileSystem.moveAsync({ from: tempPartUri, to: audioLocalUri });
          finalSizeBytes = size;
          downloadSucceeded = true;
          break;
        } catch (candidateErr: any) {
          lastError = candidateErr;
          await FileSystem.deleteAsync(tempPartUri, { idempotent: true }).catch(() => {});
        }
      }

      // Wait briefly for artwork cache before saving manifest
      await Promise.race([artPromise, new Promise((r) => setTimeout(r, 1500))]);

      if (!downloadSucceeded || finalSizeBytes < MIN_AUDIO_BYTES) {
        throw lastError || new Error('تعذر تحميل الملف الصوتي بشكل سليم.');
      }

      const sizeMB = `${(finalSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
      const newDownloadedTrack: DownloadedTrack = {
        videoId,
        title: track.title || 'Track',
        artist: track.artist || 'Artist',
        album: track.album,
        thumbnail: track.thumbnail || '',
        artworkLocalUri: verifiedArtworkUri,
        audioLocalUri,
        duration: track.duration || 180000,
        quality,
        bitrateLabel,
        fileSizeBytes: finalSizeBytes,
        fileSizeMB: sizeMB,
        downloadedAt: Date.now(),
      };

      const currentList = await this.getDownloadedTracks();
      const updatedList = [
        newDownloadedTrack,
        ...currentList.filter((t) => t.videoId !== videoId),
      ];
      await this.saveManifest(updatedList);

      // Sync lightweight track metadata (no audio file) to user's Firestore catalog
      // so logging in on another phone shows previously downloaded tracks to re-download
      const currentUid = auth.currentUser?.uid;
      if (currentUid) {
        addFirebaseDownloadedCatalogItem(currentUid, newDownloadedTrack).catch(() => {});
      }

      updateStoreProgress({
        videoId,
        progress: 1.0,
        totalBytes: finalSizeBytes,
        writtenBytes: finalSizeBytes,
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

  async deleteDownloadedTrack(videoId: string): Promise<boolean> {
    try {
      const currentList = await this.getDownloadedTracks();
      const target = currentList.find((t) => t.videoId === videoId);
      if (!target) return false;

      await FileSystem.deleteAsync(target.audioLocalUri, { idempotent: true }).catch(() => {});
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
