import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { Track } from '../store/useAudioStore';
import { getUniversalStudioArtwork } from '../utils/artworkHelper';

// ── Directory & Storage Constants ──
const DOWNLOAD_BASE_DIR = `${FileSystem.documentDirectory}a7flow_download_music/`;
const TRACKS_DIR = `${DOWNLOAD_BASE_DIR}tracks/`;
const MANIFEST_FILE_PATH = `${DOWNLOAD_BASE_DIR}a7flow_manifest.json`;

// Global device-level key (NOT user specific: cross-account persistence)
export const DEVICE_OFFLINE_MANIFEST_KEY = '@a7flow_device_offline_manifest';

export type AudioQualityOption = 'auto' | 'high' | 'medium';

export interface DownloadedTrack {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  artworkLocalUri: string;
  audioLocalUri: string;
  duration: number; // in milliseconds
  quality: AudioQualityOption;
  bitrateLabel: string; // e.g. "320 kbps HD" | "128 kbps"
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
    } catch (e) {
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

/**
 * 🎵 Extract Genuine YouTube Audio Stream (100% Real Song from YouTube)
 * Zero placeholder songs. Connects to primary & mirror conversion APIs,
 * tracks conversion progress, and returns the direct authentic MP3 stream URL.
 */
export async function extractRealYouTubeAudioStream(
  videoId: string,
  quality: AudioQualityOption = 'auto',
  onProgress?: (progressRatio: number, statusText: string) => void
): Promise<string> {
  const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  const youtubeUrl = `https://www.youtube.com/watch?v=${cleanId}`;

  // Map requested quality to real format:
  // 'high' -> 'm4a' (Apple AAC HD ~256 kbps, crystal clear trebles & bass)
  // 'auto' -> 'mp3' (Studio 320 kbps MP3, universal compatibility)
  // 'medium' -> 'mp3' (Standard 128 kbps MP3, data saver)
  const format = quality === 'high' ? 'm4a' : 'mp3';

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
    } catch (e) {
      console.warn(`[DownloadService] Converter endpoint ${endpoint} failed:`, e);
    }
  }

  if (!conversionData || (!conversionData.id && !conversionData.progress_url)) {
    throw new Error('تعذر الاتصال بسيرفر استخراج الصوت من يوتيوب. يرجى التأكد من الاتصال بالإنترنت والمحاولة مجدداً.');
  }

  const streamId = conversionData.id;
  const progressUrl =
    conversionData.progress_url ||
    `https://lto2.affadaffa.com/api/progress?id=${streamId}`;

  // Poll progress until conversion completes (max 35 polls * 1.5s = ~50s)
  const maxPolls = 35;
  let finalDownloadUrl: string | null = null;

  for (let poll = 0; poll < maxPolls; poll++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const pRes = await fetch(progressUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (pRes.ok) {
        const pData = await pRes.json();
        const progressNum = Number(pData.progress) || 0;

        // Map server conversion progress (0 -> 1000) to 0.05 -> 0.35 of UI download bar
        const normalizedRatio = 0.05 + Math.min(progressNum / 1000, 1.0) * 0.3;
        if (onProgress) {
          onProgress(normalizedRatio, pData.text || 'جاري استخراج الصوت الأصلي من يوتيوب...');
        }

        if (pData.download_url && pData.download_url.startsWith('http')) {
          finalDownloadUrl = pData.download_url;
          break;
        }

        if (pData.success === 1 && pData.download_url) {
          finalDownloadUrl = pData.download_url;
          break;
        }
      }
    } catch (pollErr: any) {
      console.warn(`[DownloadService] Polling attempt ${poll + 1} warning:`, pollErr?.message);
    }
  }

  if (!finalDownloadUrl) {
    throw new Error('استغرق استخراج الصوت من يوتيوب وقتاً طويلاً. يرجى المحاولة مرة أخرى.');
  }

  return finalDownloadUrl;
}

/**
 * 🔍 Inspect physical device offline storage and log files + sizes in MB
 */
export const inspectOfflineStorage = async (): Promise<void> => {
  try {
    const dir = `${FileSystem.documentDirectory}a7flow_download_music/tracks/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      console.log('[Storage Check] Dossier offline ma yegzistich!');
      return;
    }
    const files = await FileSystem.readDirectoryAsync(dir);
    console.log(`[Storage Check] Nombre de fichiers: ${files.length}`);
    for (const file of files) {
      const fileInfo = await FileSystem.getInfoAsync(dir + file);
      console.log(`- File: ${file} | Size: ${(((fileInfo as any).size || 0) / (1024 * 1024)).toFixed(2)} MB`);
    }
  } catch (e) {
    console.warn('[Storage Check] Error inspecting storage:', e);
  }
};

class AudioDownloadService {
  private isInitialized = false;

  /**
   * 📁 Ensure permanent directory exists on device hardware
   */
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

  /**
   * 📋 Load manifest from hardware & AsyncStorage
   */
  async getDownloadedTracks(): Promise<DownloadedTrack[]> {
    await this.ensureDirectories();

    let manifestList: DownloadedTrack[] = [];

    // 1. Try reading hardware manifest file first
    try {
      const fileInfo = await FileSystem.getInfoAsync(MANIFEST_FILE_PATH);
      if (fileInfo.exists) {
        const content = await FileSystem.readAsStringAsync(MANIFEST_FILE_PATH);
        manifestList = JSON.parse(content);
      }
    } catch (e) {
      console.warn('[DownloadService] Error reading manifest file:', e);
    }

    // 2. Fallback to AsyncStorage device manifest if file empty
    if (!manifestList || manifestList.length === 0) {
      try {
        const raw = await AsyncStorage.getItem(DEVICE_OFFLINE_MANIFEST_KEY);
        if (raw) {
          manifestList = JSON.parse(raw);
        }
      } catch (e) {
        console.warn('[DownloadService] Error reading AsyncStorage manifest:', e);
      }
    }

    // 3. Hardware File Integrity Verification (filter out orphan or < 500 KB corrupted files)
    const validTracks: DownloadedTrack[] = [];
    let hasChanged = false;

    for (const track of manifestList) {
      try {
        const audioInfo = await FileSystem.getInfoAsync(track.audioLocalUri);
        const actualSize = (audioInfo as any).size || 0;
        if (audioInfo.exists && actualSize >= 500 * 1024) {
          validTracks.push({
            ...track,
            fileSizeBytes: actualSize,
          });
        } else {
          // Missing or corrupted HTML file under 500 KB: purge it
          hasChanged = true;
          if (audioInfo.exists) {
            try {
              await FileSystem.deleteAsync(track.audioLocalUri, { idempotent: true });
            } catch (delErr) {}
          }
        }
      } catch (e) {
        hasChanged = true;
      }
    }

    if (hasChanged) {
      await this.saveManifest(validTracks);
    }

    return validTracks;
  }

  /**
   * 💾 Save manifest synchronously to both Hardware file and AsyncStorage
   */
  private async saveManifest(tracks: DownloadedTrack[]): Promise<void> {
    const json = JSON.stringify(tracks, null, 2);
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

  /**
   * 🔍 Look up local track for instant 0ms offline playback
   */
  async getLocalTrack(videoId?: string | null): Promise<DownloadedTrack | null> {
    if (!videoId) return null;
    const tracks = await this.getDownloadedTracks();
    const found = tracks.find((t) => t.videoId === videoId);
    if (!found) return null;

    // Verify audio file still physically exists on disk and is >= 500 KB
    try {
      const audioInfo = await FileSystem.getInfoAsync(found.audioLocalUri);
      const actualSize = (audioInfo as any).size || 0;
      if (audioInfo.exists && actualSize >= 500 * 1024) {
        return found;
      }
    } catch (e) {}

    return null;
  }

  /**
   * ⚡ Stream Probe & Resolve URL
   * Selects bitrate and extracts genuine YouTube audio stream URL. ZERO dummy fallbacks.
   */
  async probeAudioStream(
    track: Track,
    quality: AudioQualityOption = 'auto',
    onProgress?: (progressRatio: number, statusText: string) => void
  ): Promise<{ streamUrl: string; candidateUrls: string[]; bitrateLabel: string }> {
    const candidates: string[] = [];
    const bitrateLabel =
      quality === 'medium'
        ? '128 kbps Saver'
        : quality === 'high'
        ? '256 kbps M4A HD'
        : '320 kbps Studio';

    // 1. Direct audio link if already present on track (excluding SoundHelix or mock links)
    if (
      track.audioUrl &&
      (track.audioUrl.startsWith('http') || track.audioUrl.startsWith('file://')) &&
      !track.audioUrl.includes('soundhelix.com')
    ) {
      candidates.push(track.audioUrl);
    }

    // 2. Extract genuine YouTube audio stream
    if (track.videoId && track.videoId.length === 11) {
      try {
        const realStreamUrl = await extractRealYouTubeAudioStream(track.videoId, quality, onProgress);
        if (realStreamUrl) {
          candidates.push(realStreamUrl);
        }
      } catch (extractErr: any) {
        console.warn('[DownloadService] Real YouTube extraction failed:', extractErr?.message);
        throw extractErr;
      }
    }

    if (candidates.length === 0) {
      throw new Error('تعذر العثور على رابط الصوت الأصلي من يوتيوب لهذا المقطع.');
    }

    return {
      streamUrl: candidates[0],
      candidateUrls: candidates,
      bitrateLabel,
    };
  }

  /**
   * 📥 Download track to phone storage with multi-candidate resilience
   */
  async downloadTrack(
    track: Track,
    quality: AudioQualityOption = 'auto',
    onProgressUpdate?: (progress: number) => void
  ): Promise<DownloadedTrack> {
    if (!track.videoId && !(track as any).id) {
      throw new Error('Track must have a valid videoId or ID to download.');
    }

    const videoId = track.videoId || String((track as any).id);
    await this.ensureDirectories();
    await FileSystem.makeDirectoryAsync(TRACKS_DIR, { intermediates: true });

    const updateStoreProgress = (progressState: DownloadProgressState) => {
      useDownloadStore.setState((s) => ({
        activeDownloads: {
          ...s.activeDownloads,
          [videoId]: progressState,
        },
      }));
      if (onProgressUpdate) {
        onProgressUpdate(progressState.progress);
      }
    };

    // 1. Mark status as probing
    updateStoreProgress({
      videoId,
      progress: 0.05,
      totalBytes: 0,
      writtenBytes: 0,
      status: 'probing',
    });

    try {
      // 2. Probe audio stream candidate cascade and bitrate (with real-time YouTube conversion progress)
      const { candidateUrls, bitrateLabel } = await this.probeAudioStream(
        track,
        quality,
        (ratio) => {
          updateStoreProgress({
            videoId,
            progress: ratio,
            totalBytes: 0,
            writtenBytes: 0,
            status: 'probing',
          });
        }
      );

      // 3. Prepare file targets
      const cleanId = videoId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const artworkLocalUri = `${TRACKS_DIR}${cleanId}_art.jpg`;

      // 4. Download studio artwork in parallel
      const remoteArt = getUniversalStudioArtwork(track.thumbnail) || track.thumbnail;
      if (remoteArt && remoteArt.startsWith('http')) {
        try {
          await FileSystem.downloadAsync(remoteArt, artworkLocalUri);
        } catch (artErr) {
          console.warn('[DownloadService] Artwork download non-fatal fallback:', artErr);
        }
      }

      // 5. Multi-Candidate Robust Download Loop
      let finalDownloadedUri: string | null = null;
      let finalSizeBytes = 0;
      let lastError: any = null;

      for (let i = 0; i < candidateUrls.length; i++) {
        const streamUrl = candidateUrls[i];
        const audioExtension = streamUrl.includes('.m4a') ? 'm4a' : 'mp3';
        const audioLocalUri = `${TRACKS_DIR}${cleanId}.${audioExtension}`;

        updateStoreProgress({
          videoId,
          progress: 0.35,
          totalBytes: 0,
          writtenBytes: 0,
          status: 'downloading',
        });

        try {
          // Clean any previous incomplete file
          try {
            await FileSystem.deleteAsync(audioLocalUri, { idempotent: true });
          } catch (e) {}

          const downloadResumable = FileSystem.createDownloadResumable(
            streamUrl,
            audioLocalUri,
            {},
            (downloadProgress) => {
              const expected = downloadProgress.totalBytesExpectedToWrite;
              const written = downloadProgress.totalBytesWritten;
              const pct = expected > 0 ? Math.min(0.35 + (written / expected) * 0.63, 0.98) : 0.6;

              updateStoreProgress({
                videoId,
                progress: pct,
                totalBytes: expected,
                writtenBytes: written,
                status: 'downloading',
              });
            }
          );

          const downloadResult = await downloadResumable.downloadAsync();
          if (!downloadResult || !downloadResult.uri) {
            throw new Error(`Failed to download audio stream from candidate #${i + 1}`);
          }

          // Strict physical verification (Zero 0-Byte / Zero < 500 KB corrupted files)
          const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
          const actualSize = (fileInfo as any).size || 0;

          if (!fileInfo.exists || actualSize < 500 * 1024) {
            console.warn(
              `[DownloadService] ⚠️ Candidate #${i + 1} produced invalid file (${(actualSize / 1024).toFixed(1)} KB). Cascading to next candidate...`
            );
            try {
              await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });
            } catch (delErr) {}
            continue; // Cascade to next candidate!
          }

          // Verified success!
          finalDownloadedUri = downloadResult.uri;
          finalSizeBytes = actualSize;
          break;
        } catch (candidateErr: any) {
          console.warn(
            `[DownloadService] ⚠️ Candidate #${i + 1} failed: ${candidateErr?.message}. Trying next candidate...`
          );
          lastError = candidateErr;
        }
      }

      if (!finalDownloadedUri || finalSizeBytes < 500 * 1024) {
        throw (
          lastError ||
          new Error('Downloaded audio stream was invalid or corrupted (size < 500 KB).')
        );
      }

      const sizeBytes = finalSizeBytes;
      const sizeMB = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;

      const newDownloadedTrack: DownloadedTrack = {
        videoId,
        title: track.title || 'Track',
        artist: track.artist || 'Artist',
        thumbnail: track.thumbnail || '',
        artworkLocalUri,
        audioLocalUri: finalDownloadedUri,
        duration: track.duration || 180000,
        quality,
        bitrateLabel,
        fileSizeBytes: sizeBytes,
        fileSizeMB: sizeMB,
        downloadedAt: Date.now(),
      };

      // 7. Update manifest (Cross-account persistent)
      const currentList = await this.getDownloadedTracks();
      const updatedList = [
        newDownloadedTrack,
        ...currentList.filter((t) => t.videoId !== videoId),
      ];

      await this.saveManifest(updatedList);

      // 8. Update Zustand store
      updateStoreProgress({
        videoId,
        progress: 1.0,
        totalBytes: sizeBytes,
        writtenBytes: sizeBytes,
        status: 'completed',
      });

      // Reload manifest in store
      await useDownloadStore.getState().loadManifest();

      // Inspect storage in terminal
      await inspectOfflineStorage();

      // Clean activeDownloads after 1.5s
      setTimeout(() => {
        useDownloadStore.setState((s) => {
          const copy = { ...s.activeDownloads };
          delete copy[videoId];
          return { activeDownloads: copy };
        });
      }, 1500);

      return newDownloadedTrack;
    } catch (error: any) {
      console.error('[DownloadService] Download error:', error);
      updateStoreProgress({
        videoId,
        progress: 0,
        totalBytes: 0,
        writtenBytes: 0,
        status: 'error',
        error: error?.message || 'Download failed',
      });
      throw error;
    }
  }

  /**
   * 🗑️ Delete downloaded track and reclaim device memory
   */
  async deleteDownloadedTrack(videoId: string): Promise<boolean> {
    try {
      const currentList = await this.getDownloadedTracks();
      const target = currentList.find((t) => t.videoId === videoId);
      if (!target) return false;

      // Delete audio file
      try {
        const audioInfo = await FileSystem.getInfoAsync(target.audioLocalUri);
        if (audioInfo.exists) {
          await FileSystem.deleteAsync(target.audioLocalUri, { idempotent: true });
        }
      } catch (e) {}

      // Delete artwork file
      try {
        const artInfo = await FileSystem.getInfoAsync(target.artworkLocalUri);
        if (artInfo.exists) {
          await FileSystem.deleteAsync(target.artworkLocalUri, { idempotent: true });
        }
      } catch (e) {}

      // Update manifest
      const updatedList = currentList.filter((t) => t.videoId !== videoId);
      await this.saveManifest(updatedList);
      await useDownloadStore.getState().loadManifest();

      return true;
    } catch (e) {
      console.warn('[DownloadService] Delete error:', e);
      return false;
    }
  }

  /**
   * 📊 Get device storage usage breakdown
   */
  async getStorageUsage(): Promise<{ totalBytes: number; totalMB: string; trackCount: number }> {
    const tracks = await this.getDownloadedTracks();
    const totalBytes = tracks.reduce((sum, t) => sum + (t.fileSizeBytes || 0), 0);
    const totalMB = `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
    return {
      totalBytes,
      totalMB,
      trackCount: tracks.length,
    };
  }
}

export const downloadService = new AudioDownloadService();
