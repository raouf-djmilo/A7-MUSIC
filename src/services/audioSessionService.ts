import { NativeModules, Platform } from 'react-native';
import TrackPlayer, { Event } from 'react-native-track-player';
import * as FileSystem from 'expo-file-system/legacy';
import type { Track } from '../store/useAudioStore';
import { getUniversalStudioArtwork } from '../utils/artworkHelper';

// Valid 310-byte silent MP3 frame in Base64 (0ms latency, zero cellular data, works offline/airplane mode)
const SILENT_MP3_BASE64 =
  '//PAxAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA//PAxAAM4AGkAW4AABAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg';

let _cachedSilentAudioUri: string | null = null;

export const getOrGenerateSilentAudioUri = async (): Promise<string> => {
  if (_cachedSilentAudioUri) return _cachedSilentAudioUri;
  try {
    const silentPath = `${FileSystem.documentDirectory}a7_silent_loop.mp3`;
    const info = await FileSystem.getInfoAsync(silentPath);
    if (!info.exists || ((info as any).size || 0) < 100) {
      await FileSystem.writeAsStringAsync(silentPath, SILENT_MP3_BASE64, {
        encoding: FileSystem.EncodingType?.Base64 || 'base64',
      });
    }
    _cachedSilentAudioUri = silentPath;
    return silentPath;
  } catch (e) {
    return `data:audio/mp3;base64,${SILENT_MP3_BASE64}`;
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
    // 🛡️ Safety Guard: If the session is already configured with this exact setting,
    // NEVER re-execute setAudioModeAsync because that resets native AVAudioSession/AudioTrack and cuts audio!
    if (isSessionConfigured && lastConfiguredBgSetting === backgroundEnabled) {
      return;
    }

    // 🛡️ Safety Guard: If audio is currently playing, avoid resetting hardware session unless setting changed
    if (isPlaying && isSessionConfigured) {
      // Just persist the preference without dropping active playback
      lastConfiguredBgSetting = backgroundEnabled;
      return;
    }

    const audioModule = getSafeAudioModule();
    if (audioModule?.setAudioModeAsync) {
      await audioModule.setAudioModeAsync({
        staysActiveInBackground: backgroundEnabled,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false, // 🛡️ Prevent dynamic compression & volume swings on Android
        interruptionModeIOS: 1, // InterruptionModeIOS.DoNotMix (1)
        interruptionModeAndroid: 1, // InterruptionModeAndroid.DoNotMix (1)
        playThroughEarpieceAndroid: false,
      });
      isSessionConfigured = true;
      lastConfiguredBgSetting = backgroundEnabled;
      console.log('[AudioSessionService] Native Audio mode configured. Background playback:', backgroundEnabled);
    } else {
      // Expo Go fallback mode: Audio plays via GlobalAudioBridge (WebView)
      // Background audio capability is defined in app.json for standalone builds.
      isSessionConfigured = true;
      lastConfiguredBgSetting = backgroundEnabled;
      console.log('[AudioSessionService] ExponentAV native module not present. Running in Expo Go fallback mode.');
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
  // Throttle updates to prevent IPC saturation while scrubbing, unless explicitly forced
  if (!forceUpdate && now - lastLockScreenSyncTime < 1800) return;
  lastLockScreenSyncTime = now;

  try {
    const artworkUrl = getUniversalStudioArtwork(track.thumbnail);
    const validDurationSec = Math.max(1, Math.floor(
      (durationMillis > 0 ? durationMillis : track.duration || 180000) / 1000
    ));
    const elapsedSec = Math.max(0, Math.floor(positionMillis / 1000));

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
          } catch (e) {}
        }
      } else if (event.paused) {
        // Transient interruption (incoming phone call, navigation instruction, voice note)
        console.log('[AudioSessionService] Transient audio interruption (paused).');
        try {
          store.getState().pauseTrack();
        } catch (e) {}
      } else {
        // Focus regained! (call ended, navigation finished)
        console.log('[AudioSessionService] Audio focus regained. Auto-resuming playback.');
        try {
          store.getState().resumeTrack();
        } catch (e) {}
      }
    });
  } catch (e) {
    // Handled safely
  }
};
