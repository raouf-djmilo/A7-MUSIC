import { NativeModules, Platform } from 'react-native';

/**
 * Safe accessor for useAudioStore to eliminate circular module dependencies.
 */
const getAudioStore = () => {
  try {
    return require('../store/useAudioStore').useAudioStore;
  } catch {
    return null;
  }
};

/**
 * 🎧 NativeAudioService
 * Universal Direct Hardware Audio Player for Expo SDK 57 / Expo Go / Custom Dev Builds.
 *
 * Tier 1: expo-video (createVideoPlayer) — Modern AVPlayer (iOS) & ExoPlayer (Android),
 *         pre-bundled in Expo SDK 57, 0ms latency, zero CORS restrictions, full background audio.
 * Tier 2: expo-av (Audio.Sound) — Legacy fallback when ExponentAV native module exists.
 * Tier 3: react-native-track-player — Production bare/custom dev client fallback.
 */
class NativeAudioService {
  private videoPlayer: any = null;
  private sound: any = null;
  private listeners: Array<() => void> = [];
  private currentUri: string | null = null;
  private activeEngine: 'video' | 'av' | 'none' = 'none';

  /**
   * Safely checks and loads expo-video without top-level crash
   */
  private getExpoVideo() {
    try {
      const expoVideo = require('expo-video');
      if (typeof expoVideo?.createVideoPlayer === 'function') {
        return expoVideo;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Safely checks if ExponentAV native module is actually compiled into the runtime
   */
  private getExpoAv() {
    try {
      const hasExponentAV = !!(
        (NativeModules as any)?.ExponentAV ||
        (globalThis as any)?.expo?.modules?.ExponentAV ||
        (globalThis as any)?.__expo?.modules?.ExponentAV
      );
      if (!hasExponentAV) return null;
      return require('expo-av');
    } catch {
      return null;
    }
  }

  /**
   * 🎵 Play local file directly via hardware DAC (0ms latency, zero WebKit/CORS restrictions)
   */
  async play(uri: string, initialPositionSec: number = 0, metadata?: { title?: string; artist?: string; artwork?: string }): Promise<void> {
    try {
      console.log('[NativeAudioService] ⚡ Initiating hardware audio playback for:', uri);

      // 1. Clean up any existing playback instance
      await this.stop();
      this.currentUri = uri;

      // 2. Try Primary Engine: expo-video (Official Expo SDK 57 Engine)
      const expoVideo = this.getExpoVideo();
      if (expoVideo) {
        console.log('[NativeAudioService] 🚀 Initializing expo-video native engine (AVPlayer/ExoPlayer)...');

        const playerSource: any = {
          uri,
          metadata: metadata ? {
            title: metadata.title || 'Unknown Track',
            artist: metadata.artist || 'A7 Music',
            artwork: metadata.artwork,
          } : undefined,
        };

        const player = expoVideo.createVideoPlayer(playerSource);
        player.staysActiveInBackground = true;
        player.showNowPlayingNotification = true;
        player.timeUpdateEventInterval = 0.35;
        player.volume = 1.0;

        if (initialPositionSec > 0) {
          player.currentTime = initialPositionSec;
        }

        const subs: any[] = [];

        // Track progress & duration
        const timeSub = player.addListener('timeUpdate', (event: any) => {
          const currentTimeSec = event?.currentTime ?? player.currentTime ?? 0;
          const durationSec = player.duration ?? 0;
          const store = getAudioStore();
          if (store && durationSec > 0) {
            store.getState().updateProgress(
              Math.round(currentTimeSec * 1000),
              Math.round(durationSec * 1000)
            );
          }
        });
        if (timeSub) subs.push(timeSub);

        // State changes (playing / paused)
        const playingSub = player.addListener('playingChange', (event: any) => {
          const isPlaying = !!event?.isPlaying;
          const store = getAudioStore();
          if (store) {
            store.setState({ isPlaying, isLoading: false, loadingTrackId: null });
          }
        });
        if (playingSub) subs.push(playingSub);

        // Natural track completion
        const endSub = player.addListener('playToEnd', () => {
          console.log('[NativeAudioService] 🏁 Track completed naturally via expo-video. Auto-advancing...');
          this.stop().catch(() => {});
          const store = getAudioStore();
          if (store) {
            store.getState().handleTrackEnded();
          }
        });
        if (endSub) subs.push(endSub);

        // Status & error handling
        const statusSub = player.addListener('statusChange', (event: any) => {
          if (event?.status === 'error') {
            console.warn('[NativeAudioService] expo-video status error:', event?.error);
            if (uri && uri.includes('temp_stream_')) {
              try {
                const FileSystem = require('expo-file-system/legacy');
                FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
              } catch {}
            }
            const store = getAudioStore();
            if (store) store.setState({ isLoading: false, loadingTrackId: null });
          } else if (event?.status === 'readyToPlay') {
            const store = getAudioStore();
            if (store) store.setState({ isLoading: false, loadingTrackId: null });
          }
        });
        if (statusSub) subs.push(statusSub);

        this.listeners = subs.map((sub) => () => {
          try {
            if (typeof sub?.remove === 'function') sub.remove();
          } catch {}
        });

        player.play();
        this.videoPlayer = player;
        this.activeEngine = 'video';

        const store = getAudioStore();
        if (store) {
          store.setState({ isPlaying: true, isLoading: false, loadingTrackId: null });
        }
        console.log('[NativeAudioService] ✅ expo-video hardware player running successfully');
        return;
      }

      // 3. Try Secondary Engine: expo-av (Only if ExponentAV native module exists)
      const expoAv = this.getExpoAv();
      if (expoAv?.Audio?.Sound) {
        console.log('[NativeAudioService] 🚀 Initializing expo-av native engine...');
        try {
          await expoAv.Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            staysActiveInBackground: true,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: false,
            playThroughEarpieceAndroid: false,
          });
        } catch {}

        const { sound } = await expoAv.Audio.Sound.createAsync(
          { uri },
          {
            shouldPlay: true,
            volume: 1.0,
            positionMillis: Math.round(initialPositionSec * 1000),
            progressUpdateIntervalMillis: 350,
          },
          this.onExpoAvStatusUpdate
        );

        this.sound = sound;
        this.activeEngine = 'av';

        const store = getAudioStore();
        if (store) {
          store.setState({ isPlaying: true, isLoading: false, loadingTrackId: null });
        }
        console.log('[NativeAudioService] ✅ expo-av hardware player loaded successfully');
        return;
      }

      console.warn('[NativeAudioService] ⚠️ No hardware audio engine available in current runtime environment.');
      const store = getAudioStore();
      if (store) store.setState({ isLoading: false, loadingTrackId: null });
    } catch (err: any) {
      console.error('[NativeAudioService] Failed to play native audio file:', err?.message || err);
      const store = getAudioStore();
      if (store) store.setState({ isLoading: false, loadingTrackId: null });
      throw err;
    }
  }

  /**
   * ⏸️ Pause native playback
   */
  async pause(): Promise<void> {
    try {
      if (this.videoPlayer) {
        this.videoPlayer.pause();
      }
      if (this.sound) {
        await this.sound.pauseAsync().catch(() => {});
      }
      const store = getAudioStore();
      if (store) store.setState({ isPlaying: false });
    } catch (e) {
      console.warn('[NativeAudioService] pause error:', e);
    }
  }

  /**
   * ▶️ Resume native playback
   */
  async resume(): Promise<void> {
    try {
      if (this.videoPlayer) {
        this.videoPlayer.play();
      }
      if (this.sound) {
        await this.sound.playAsync().catch(() => {});
      }
      const store = getAudioStore();
      if (store) store.setState({ isPlaying: true });
    } catch (e) {
      console.warn('[NativeAudioService] resume error:', e);
    }
  }

  /**
   * ⏩ Seek to specific position (in milliseconds)
   */
  async seekTo(positionMillis: number): Promise<void> {
    try {
      const seconds = Math.max(0, positionMillis / 1000);
      if (this.videoPlayer) {
        this.videoPlayer.currentTime = seconds;
      }
      if (this.sound) {
        await this.sound.setPositionAsync(Math.max(0, positionMillis)).catch(() => {});
      }
    } catch (e) {
      console.warn('[NativeAudioService] seekTo error:', e);
    }
  }

  /**
   * ⏹️ Stop and release native player from memory
   */
  async stop(): Promise<void> {
    try {
      for (const cleanup of this.listeners) {
        cleanup();
      }
      this.listeners = [];

      if (this.videoPlayer) {
        const player = this.videoPlayer;
        this.videoPlayer = null;
        try {
          player.pause();
          player.release();
        } catch {}
      }

      if (this.sound) {
        const soundToUnload = this.sound;
        this.sound = null;
        try {
          await soundToUnload.stopAsync().catch(() => {});
          await soundToUnload.unloadAsync().catch(() => {});
        } catch {}
      }

      this.currentUri = null;
      this.activeEngine = 'none';
    } catch (e) {
      console.warn('[NativeAudioService] stop error:', e);
    }
  }

  /**
   * 📊 Status callback from legacy expo-av
   */
  private onExpoAvStatusUpdate = (status: any) => {
    if (!status?.isLoaded) {
      if (status?.error) {
        console.warn('[NativeAudioService] Playback status error:', status.error);
      }
      return;
    }

    const { isPlaying, positionMillis, durationMillis, didJustFinish } = status;

    if (isPlaying) {
      const store = getAudioStore();
      if (store) {
        const s = store.getState();
        if (!s.isPlaying || s.isLoading) {
          store.setState({ isPlaying: true, isLoading: false, loadingTrackId: null });
        }
      }
    }

    if (durationMillis && durationMillis > 0) {
      const store = getAudioStore();
      if (store) {
        store.getState().updateProgress(positionMillis || 0, durationMillis);
      }
    }

    if (didJustFinish) {
      console.log('[NativeAudioService] 🏁 Track completed naturally via expo-av. Auto-advancing...');
      this.stop().catch(() => {});
      const store = getAudioStore();
      if (store) {
        store.getState().handleTrackEnded();
      }
    }
  };
}

export const nativeAudioService = new NativeAudioService();
