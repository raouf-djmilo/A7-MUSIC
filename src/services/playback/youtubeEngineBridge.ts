/**
 * Typed bridge between useAudioStore / remote session events and the persistent
 * WKWebView YouTube audio/video engine.
 */

export interface YoutubeTrackMetadata {
  videoId: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  durationSec?: number;
}

export interface YoutubeEngineSnapshot {
  videoId: string | null;
  ytState: number; // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
  videoPaused: boolean | null;
  userPaused?: boolean;
  videoReadyState: number;
  currentTime: number;
  duration: number;
  mediaSessionState?: 'none' | 'paused' | 'playing';
  isReady: boolean;
}

export type PlayerControlsBridge = {
  play: () => void;
  pause: () => void;
  seekTo?: (sec: number) => void;
  loadVideo?: (
    videoId: string,
    startSec?: number,
    autoplay?: boolean,
    meta?: YoutubeTrackMetadata
  ) => void;
  syncMetadata?: (meta: YoutubeTrackMetadata, isPlaying?: boolean) => void;
  getSnapshot?: () => Promise<YoutubeEngineSnapshot | null>;
  remount?: () => void;
};

let _activePlayerBridge: PlayerControlsBridge | null = null;
let _lastBridgeCommandTimestamp = 0;
let _lastEngineLoadTimestamp = 0;
const _unembeddableVideoIds = new Set<string>();

export const markVideoUnembeddable = (videoId?: string | null): void => {
  if (videoId) _unembeddableVideoIds.add(videoId);
};

export const isVideoUnembeddable = (videoId?: string | null): boolean => {
  return Boolean(videoId && _unembeddableVideoIds.has(videoId));
};

export const registerActivePlayerBridge = (bridge: PlayerControlsBridge | null): void => {
  _activePlayerBridge = bridge;
};

export const getActivePlayerBridge = (): PlayerControlsBridge | null => {
  return _activePlayerBridge;
};

export const markBridgeCommandTimestamp = (): void => {
  _lastBridgeCommandTimestamp = Date.now();
};

export const getLastBridgeCommandTimestamp = (): number => {
  return _lastBridgeCommandTimestamp;
};

export const markEngineLoadTimestamp = (): void => {
  _lastEngineLoadTimestamp = Date.now();
};

export const getLastEngineLoadTimestamp = (): number => {
  return _lastEngineLoadTimestamp;
};

/**
 * Strips YouTube Music auto-generated " - Topic" channel suffixes so Lock Screen
 * and Control Center widgets show clean artist names matching the in-app UI.
 */
export const cleanArtistForLockScreen = (artist?: string | null): string => {
  if (!artist) return 'A7 MUSIC';
  const cleaned = artist
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s*VEVO$/i, '')
    .trim();
  return cleaned || 'A7 MUSIC';
};
