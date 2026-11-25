import { NativeModules, Platform } from 'react-native';
import TrackPlayer, { Event } from 'react-native-track-player';
import * as FileSystem from 'expo-file-system/legacy';
import type { Track } from '../store/useAudioStore';
import { getUniversalStudioArtwork, resolveLockScreenSquareArtworkAsync } from '../utils/artworkHelper';

export type PlayerControlsBridge = {
  play: () => void;
  pause: () => void;
  seekTo?: (sec: number) => void;
};

let _activePlayerBridge: PlayerControlsBridge | null = null;

export const registerActivePlayerBridge = (bridge: PlayerControlsBridge | null): void => {
  _activePlayerBridge = bridge;
};

export const getActivePlayerBridge = (): PlayerControlsBridge | null => {
  return _activePlayerBridge;
};

// Standard MPEG-1 Layer 3 silent frame in Base64 (150 bytes binary = 26.1ms)
const SILENT_FRAME_BASE64 =
  '//PAxAAM4AGkAW4AABAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg';

let _cachedSilentAudioUri: string | null = null;

export const getOrGenerateSilentAudioUri = async (): Promise<string> => {
  if (_cachedSilentAudioUri) return _cachedSilentAudioUri;
  try {
    const silentPath = `${FileSystem.documentDirectory}a7_silent_loop_v2.mp3`;
    const info = await FileSystem.getInfoAsync(silentPath);
    if (!info.exists || ((info as any).size || 0) < 50000) {
      // Build a robust ~22-second silent MP3 buffer (800 valid MPEG-1 Layer 3 frames)
      // Eliminates rapid looping and prevents iOS AVPlayer buffer underflow / freeze at 23 seconds!
      const multiFrameBase64 = SILENT_FRAME_BASE64.repeat(800);
      await FileSystem.writeAsStringAsync(silentPath, multiFrameBase64, {
        encoding: FileSystem.EncodingType?.Base64 || 'base64',
      });
    }
    _cachedSilentAudioUri = silentPath;
    return silentPath;
  } catch (e) {
    return `data:audio/mp3;base64,${SILENT_FRAME_BASE64}`;
  }
};

/**
 * 🎵 AudioSessionService
 * Enterprise-grade Background Audio & Lock Screen Architecture:
 * 1. Safely detects & configures native audio sessions (staysActiveInBackground: true) in custom builds,
 *    while providing zero-crash graceful fallback in Expo Go.
 * 2. Manages Lock Screen & Control Center NowPlaying metadata (Title, Artist, HD Artwork, Duration).
 * 3. Handles Becoming Noisy (Headphone unplugging) and Phone Call interruptions.
 */

let isSessionConfigured = false;
let lastLockScreenSyncTime = 0;
let lastLockScreenTrackId: string | null = null;
const resolvedArtworkCache = new Map<string, string>();
let _cachedAudioModule: any = undefined;

/**
 * Safe getter for native audio session module.
 * Prevents "[runtime not ready]: Cannot find native module 'ExponentAV'" in Expo Go.
 */
const getSafeAudioModule = () => {
  if (_cachedAudioModule !== undefined) {
    return _cachedAudioModule;
  }

  try {
    // Check if ExponentAV native module is registered in NativeModules or TurboModules
    const hasExponentAV = !!(
      NativeModules?.ExponentAV ||
      (globalThis as any)?.expo?.modules?.ExponentAV ||
      (globalThis as any)?.__expo?.modules?.ExponentAV
    );

    if (!hasExponentAV) {
      _cachedAudioModule = null;
      return null;
    }

    // Safe require inside try/catch only if native module is present
    const expoAv = require('expo-av');
    _cachedAudioModule = expoAv?.Audio || null;
    return _cachedAudioModule;
  } catch {
    _cachedAudioModule = null;
    return null;
  }
};

let lastConfiguredBgSetting: boolean | null = null;

export const configureAudioSession = async (
  backgroundEnabled: boolean = true,
  isPlaying: boolean = false
): Promise<void> => {
  try {
    // Only skip if already configured with the exact same background playback setting
    if (isSessionConfigured && lastConfiguredBgSetting === backgroundEnabled) {
      return;
    }

    const audioModule = getSafeAudioModule();
    if (audioModule?.setAudioModeAsync) {
      await audioModule.setAudioModeAsync({
        staysActiveInBackground: backgroundEnabled,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false, // Prevent dynamic compression & volume swings on Android
        interruptionModeIOS: 1, // InterruptionModeIOS.DoNotMix (1) - Exclusive music app priority on iOS Lock Screen
        interruptionModeAndroid: 1, // InterruptionModeAndroid.DoNotMix (1)
        playThroughEarpieceAndroid: false,
      });
      isSessionConfigured = true;
      lastConfiguredBgSetting = backgroundEnabled;
      console.log('[AudioSessionService] Native Audio mode configured. Background playback:', backgroundEnabled);
    } else {
      isSessionConfigured = true;
      lastConfiguredBgSetting = backgroundEnabled;
      console.log('[AudioSessionService] ExponentAV native module not present. Running in fallback mode.');
    }
  } catch (err) {
    console.warn('[AudioSessionService] configureAudioSession warning:', err);
  }
};

/**
 * Updates Lock Screen, Dynamic Island, and Notification Center media metadata
 */
export const updateNowPlayingLockScreen = async (
  track: Track | null,
  positionMillis: number = 0,
  durationMillis: number = 0,
  forceUpdate: boolean = false
): Promise<void> => {
  if (!track || !NativeModules.TrackPlayerModule) return;

  const now = Date.now();
  const isNewTrack = lastLockScreenTrackId !== track.videoId;
  // Only sync on forceUpdate, track change, or periodic 10s drift correction to avoid iOS NowPlaying flicker
  if (!forceUpdate && !isNewTrack && now - lastLockScreenSyncTime < 10000) return;
  lastLockScreenSyncTime = now;
  lastLockScreenTrackId = track.videoId;

  try {
    const validDurationSec = Math.max(1, Math.floor(
      (durationMillis > 0 ? durationMillis : track.duration || 180000) / 1000
    ));
    const elapsedSec = Math.max(0, Math.floor(positionMillis / 1000));

    // Resolve pristine 1:1 square artwork without black bars / letterbox (cached per videoId)
    let artworkUrl = resolvedArtworkCache.get(track.videoId);
    if (!artworkUrl) {
      artworkUrl = (await resolveLockScreenSquareArtworkAsync(
        track.thumbnail,
        track.title,
        track.artist,
        track.videoId
      )) || '';
      if (artworkUrl) {
        resolvedArtworkCache.set(track.videoId, artworkUrl);
      }
    }

    await TrackPlayer.updateNowPlayingMetadata({
      title: track.title,
      artist: track.artist,
      artwork: artworkUrl || undefined,
      duration: validDurationSec,
      elapsedTime: elapsedSec,
    });
  } catch (e) {
    // Graceful fallback if TrackPlayer is in fallback mode
  }
};

let _interruptionCallback: (() => void) | null = null;

export const setAudioInterruptionHandler = (handler: () => void): void => {
  _interruptionCallback = handler;
};

/**
 * Sets up phone call interruption and headphone unplugging protection (Becoming Noisy)
 */
export const setupAudioInterruptionListeners = (onInterrupt?: () => void): void => {
  if (onInterrupt) {
    _interruptionCallback = onInterrupt;
  }
  if (!NativeModules.TrackPlayerModule) return;

  try {
    TrackPlayer.addEventListener(Event.RemoteDuck, (event) => {
      const store = require('../store/useAudioStore').useAudioStore;
      if (event.permanent) {
        console.log('[AudioSessionService] Permanent audio focus loss. Pausing playback.');
        if (_interruptionCallback) {
          _interruptionCallback();
        } else {
          try {
            store.getState().pauseTrack();
          } catch (e) { }
        }
      }
      // Do NOT bounce pauseTrack/resumeTrack on transient ducks (event.paused),
      // which causes rapid stop-start loops between TrackPlayer and WKWebView on iOS.
    });
  } catch (e) {
    // Handled safely
  }
};

// ── TrackPlayer Transition & Ownership Guard (Prevents spurious end/pause events during track load/reset) ──
let _isTrackPlayerTransitioning = false;
let _transitionClearTimer: any = null;
let _lastTrackEndHandledId: string | null = null;
let _lastTrackEndTimestamp = 0;

export const beginTrackPlayerTransition = (durationMs: number = 1400): void => {
  _isTrackPlayerTransitioning = true;
  if (_transitionClearTimer) clearTimeout(_transitionClearTimer);
  _transitionClearTimer = setTimeout(() => {
    _isTrackPlayerTransitioning = false;
    _transitionClearTimer = null;
  }, durationMs);
};

export const endTrackPlayerTransition = (): void => {
  _isTrackPlayerTransitioning = false;
  if (_transitionClearTimer) {
    clearTimeout(_transitionClearTimer);
    _transitionClearTimer = null;
  }
};

export const isTrackPlayerTransitioning = (): boolean => _isTrackPlayerTransitioning;

export const markTrackEndHandled = (trackKey: string): boolean => {
  const now = Date.now();
  if (_lastTrackEndHandledId === trackKey && now - _lastTrackEndTimestamp < 2500) {
    return false;
  }
  _lastTrackEndHandledId = trackKey;
  _lastTrackEndTimestamp = now;
  return true;
};

// ── Silent Native Background Keep-Alive (expo-video mixWithOthers + NO NowPlaying takeover) ──
let _silentAnchorPlayer: any = null;
let _isStartingAnchor = false;

export const startSilentBackgroundKeepAlive = async (): Promise<void> => {
  if (_isStartingAnchor) return;
  try {
    if (_silentAnchorPlayer) {
      _silentAnchorPlayer.staysActiveInBackground = true;
      _silentAnchorPlayer.showNowPlayingNotification = false;
      _silentAnchorPlayer.audioMixingMode = 'mixWithOthers';
      _silentAnchorPlayer.isMuted = false;
      _silentAnchorPlayer.volume = 0.0;
      _silentAnchorPlayer.play();
      return;
    }
    _isStartingAnchor = true;
    const expoVideo = require('expo-video');
    if (typeof expoVideo?.createVideoPlayer !== 'function') return;
    const silentUri = await getOrGenerateSilentAudioUri();
    const anchor = expoVideo.createVideoPlayer({ uri: silentUri });
    anchor.loop = true;
    anchor.volume = 0.0;
    anchor.isMuted = false;
    anchor.staysActiveInBackground = true;
    anchor.showNowPlayingNotification = false;
    anchor.audioMixingMode = 'mixWithOthers';
    anchor.play();
    _silentAnchorPlayer = anchor;
  } catch {
    // Non-fatal fallback
  } finally {
    _isStartingAnchor = false;
  }
};

export const pauseSilentBackgroundKeepAlive = (): void => {
  try {
    if (_silentAnchorPlayer) {
      _silentAnchorPlayer.pause();
    }
  } catch {}
};

export const stopSilentBackgroundKeepAlive = (): void => {
  try {
    if (_silentAnchorPlayer) {
      const p = _silentAnchorPlayer;
      _silentAnchorPlayer = null;
      p.pause();
      if (typeof p.release === 'function') {
        p.release();
      }
    }
  } catch {}
};
