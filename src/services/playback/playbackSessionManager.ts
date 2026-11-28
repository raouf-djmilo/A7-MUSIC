import { NativeModules, Platform } from 'react-native';
import TrackPlayer, { Event } from 'react-native-track-player';
import * as FileSystem from 'expo-file-system/legacy';
import type { Track } from '../../store/useAudioStore';
import { getUniversalStudioArtwork, resolveLockScreenSquareArtworkAsync } from '../../utils/artworkHelper';
import { cleanArtistForLockScreen, getActivePlayerBridge } from './youtubeEngineBridge';

// Standard MPEG-1 Layer 3 silent frame in Base64 (150 bytes binary = 26.1ms)
const SILENT_FRAME_BASE64 =
  '//PAxAAM4AGkAW4AABAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg';

let _cachedSilentAudioUri: string | null = null;
let lastConfiguredBgSetting: boolean | null = null;
let lastConfiguredEngine: 'youtube' | 'native' | null = null;
let lastLockScreenSyncTime = 0;
let lastLockScreenTrackId: string | null = null;
const resolvedArtworkCache = new Map<string, string>();
let _cachedAudioModule: any = undefined;
let _interruptionCallback: (() => void) | null = null;

// TrackPlayer transition & ownership guard (prevents spurious end/pause events during load/reset)
let _isTrackPlayerTransitioning = false;
let _transitionClearTimer: ReturnType<typeof setTimeout> | null = null;
let _lastTrackEndHandledId: string | null = null;
let _lastTrackEndTimestamp = 0;

// Silent native background keep-alive (expo-video with mixWithOthers + showNowPlayingNotification = false)
let _silentAnchorPlayer: any = null;
let _isStartingAnchor = false;

export const getOrGenerateSilentAudioUri = async (): Promise<string> => {
  if (_cachedSilentAudioUri) return _cachedSilentAudioUri;
  try {
    const silentPath = `${FileSystem.documentDirectory}a7_silent_loop_v2.mp3`;
    const info = await FileSystem.getInfoAsync(silentPath);
    if (!info.exists || ((info as any).size || 0) < 50000) {
      const multiFrameBase64 = SILENT_FRAME_BASE64.repeat(800);
      await FileSystem.writeAsStringAsync(silentPath, multiFrameBase64, {
        encoding: FileSystem.EncodingType?.Base64 || 'base64',
      });
    }
    _cachedSilentAudioUri = silentPath;
    return silentPath;
  } catch {
    return `data:audio/mp3;base64,${SILENT_FRAME_BASE64}`;
  }
};

const getSafeAudioModule = () => {
  if (_cachedAudioModule !== undefined) {
    return _cachedAudioModule;
  }

  try {
    const hasExponentAV = !!(
      NativeModules?.ExponentAV ||
      (globalThis as any)?.expo?.modules?.ExponentAV ||
      (globalThis as any)?.__expo?.modules?.ExponentAV
    );

    if (!hasExponentAV) {
      _cachedAudioModule = null;
      return null;
    }

    const expoAv = require('expo-av');
    _cachedAudioModule = expoAv?.Audio || null;
    return _cachedAudioModule;
  } catch {
    _cachedAudioModule = null;
    return null;
  }
};

/**
 * Configures background audio policy cleanly per active engine.
 * On iOS during YouTube WKWebView playback, we MUST NOT force DoNotMix via expo-av,
 * otherwise AVAudioSession pauses WKWebView ~1 second after starting.
 */
export const configureAudioSession = async (
  backgroundEnabled: boolean = true,
  _isPlaying: boolean = false,
  activeEngine: 'youtube' | 'native' = 'youtube'
): Promise<void> => {
  try {
    // Strictly skip redundant AVAudioSession reconfiguration so app foreground/exit/play
    // transitions never introduce audible hardware audio drops.
    if (lastConfiguredBgSetting === backgroundEnabled && lastConfiguredEngine === activeEngine) {
      return;
    }
    lastConfiguredBgSetting = backgroundEnabled;
    lastConfiguredEngine = activeEngine;

    // On iOS during active YouTube WKWebView playback with expo-video anchor prewarmed,
    // VideoManager owns `.playback` + `.moviePlayback` + `.mixWithOthers`. Avoid re-calling
    // expo-av setAudioModeAsync (`mode: .default`), which ping-pongs AVAudioSession.mode and drops audio.
    if (
      Platform.OS === 'ios' &&
      activeEngine === 'youtube' &&
      backgroundEnabled &&
      _silentAnchorPlayer
    ) {
      return;
    }

    const audioModule = getSafeAudioModule();
    if (audioModule?.setAudioModeAsync) {
      await audioModule.setAudioModeAsync({
        staysActiveInBackground: backgroundEnabled,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        // CRITICAL: MixWithOthers (2) on iOS when YouTube WKWebView runs keeps host AVAudioSession
        // permanently in `.playback` background mode without stealing focus from WKWebView or _silentAnchorPlayer.
        interruptionModeIOS: Platform.OS === 'ios' && activeEngine === 'youtube' ? 2 : 1,
        interruptionModeAndroid: 1,
        playThroughEarpieceAndroid: false,
      });
    }
  } catch {
    // Expected in Expo Go without native background entitlement
  }
};

/**
 * Ensures TrackPlayer finishes pausing/resetting BEFORE WKWebView begins playback,
 * avoiding delayed `deactivateSession()` calls from Swift cancelling WebKit audio.
 */
export const prepareNativeEngineForYouTube = async (): Promise<void> => {
  if (!NativeModules.TrackPlayerModule) return;
  try {
    const idx = await TrackPlayer.getActiveTrackIndex();
    if (idx !== null && idx !== undefined) {
      beginTrackPlayerTransition(1000);
      await TrackPlayer.pause().catch(() => {});
      await TrackPlayer.reset().catch(() => {});
      lastConfiguredEngine = null;
    }
  } catch {
    // Non-fatal
  }
};

export const updateNowPlayingLockScreen = async (
  track: Track | null,
  positionMillis: number = 0,
  durationMillis: number = 0,
  forceUpdate: boolean = false
): Promise<void> => {
  if (!track) return;

  let activeEngine: 'youtube' | 'native' = 'youtube';
  let isPlaying = false;
  try {
    const storeState = require('../../store/useAudioStore').useAudioStore.getState();
    activeEngine = storeState.activeEngine;
    isPlaying = Boolean(storeState.isPlaying);
  } catch {}

  const trackId = track.videoId || track.title;
  const elapsedSec = Math.max(0, Math.floor((positionMillis || 0) / 1000));
  const rawDurSec = Math.floor((durationMillis || 0) / 1000);
  const trackDurSec = track.duration ? Math.floor(track.duration / 1000) : 0;
  const validDurationSec = rawDurSec > 0 ? rawDurSec : trackDurSec || 240;

  let artworkUrl = getUniversalStudioArtwork(
    track.thumbnail || '',
    track.title || '',
    track.artist || '',
    track.videoId || ''
  );

  if (artworkUrl && !resolvedArtworkCache.has(trackId)) {
    const resolved = await resolveLockScreenSquareArtworkAsync(artworkUrl, track.videoId).catch(() => artworkUrl);
    if (resolved) {
      artworkUrl = resolved;
      resolvedArtworkCache.set(trackId, resolved);
    }
  } else if (resolvedArtworkCache.has(trackId)) {
    artworkUrl = resolvedArtworkCache.get(trackId)!;
  }

  // CRITICAL: When WKWebView owns online playback, WKWebView's navigator.mediaSession owns
  // Control Center metadata & controls. Writing to TrackPlayer while empty corrupts iOS NowPlaying!
  if (activeEngine !== 'native') {
    const now = Date.now();
    if (forceUpdate || lastLockScreenTrackId !== trackId || now - lastLockScreenSyncTime > 4000) {
      lastLockScreenTrackId = trackId;
      lastLockScreenSyncTime = now;
      getActivePlayerBridge()?.syncMetadata?.(
        {
          videoId: track.videoId || '',
          title: track.title || 'A7 MUSIC',
          artist: cleanArtistForLockScreen(track.artist),
          artworkUrl,
          durationSec: validDurationSec,
        },
        isPlaying
      );
    }
    return;
  }

  if (!NativeModules.TrackPlayerModule) return;

  const now = Date.now();
  if (!forceUpdate && lastLockScreenTrackId === trackId && now - lastLockScreenSyncTime < 4000) {
    return;
  }

  lastLockScreenTrackId = trackId;
  lastLockScreenSyncTime = now;

  try {
    const activeIndex = await TrackPlayer.getActiveTrackIndex().catch(() => null);
    if (activeIndex === null || activeIndex === undefined) return;

    await TrackPlayer.updateNowPlayingMetadata({
      title: track.title,
      artist: cleanArtistForLockScreen(track.artist),
      artwork: artworkUrl || undefined,
      duration: validDurationSec,
      elapsedTime: elapsedSec,
    });
  } catch {
    // Non-fatal
  }
};

export const setAudioInterruptionHandler = (handler: () => void): void => {
  _interruptionCallback = handler;
};

export const setupAudioInterruptionListeners = (onInterrupt?: () => void): void => {
  if (onInterrupt) {
    _interruptionCallback = onInterrupt;
  }
  if (!NativeModules.TrackPlayerModule) return;

  try {
    TrackPlayer.addEventListener(Event.RemoteDuck, (event) => {
      const store = require('../../store/useAudioStore').useAudioStore;
      if (event.permanent) {
        console.log('[PlaybackSessionManager] Permanent audio focus loss. Pausing playback.');
        if (_interruptionCallback) {
          _interruptionCallback();
        } else {
          try {
            store.getState().pauseTrack();
          } catch {}
        }
      }
    });
  } catch {
    // Non-fatal
  }
};

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

export const prewarmSilentBackgroundAnchor = async (): Promise<void> => {
  if (_silentAnchorPlayer || _isStartingAnchor) return;
  try {
    _isStartingAnchor = true;
    const expoVideo = require('expo-video');
    if (typeof expoVideo?.createVideoPlayer !== 'function') return;
    const silentUri = await getOrGenerateSilentAudioUri();
    const anchor = expoVideo.createVideoPlayer({ uri: silentUri });
    anchor.loop = true;
    // File frames are pure digital silence; non-zero gain keeps CoreAudio output mixer active in iOS background
    anchor.volume = 0.05;
    anchor.isMuted = false;
    anchor.staysActiveInBackground = true;
    anchor.showNowPlayingNotification = false;
    anchor.audioMixingMode = 'mixWithOthers';
    _silentAnchorPlayer = anchor;
  } catch {
    // Non-fatal
  } finally {
    _isStartingAnchor = false;
  }
};

export const startSilentBackgroundKeepAlive = async (): Promise<void> => {
  if (_silentAnchorPlayer) {
    try {
      _silentAnchorPlayer.staysActiveInBackground = true;
      _silentAnchorPlayer.showNowPlayingNotification = false;
      _silentAnchorPlayer.audioMixingMode = 'mixWithOthers';
      _silentAnchorPlayer.isMuted = false;
      _silentAnchorPlayer.volume = 0.05;
      if (!_silentAnchorPlayer.playing) {
        _silentAnchorPlayer.play();
      }
    } catch {}
    return;
  }
  if (_isStartingAnchor) {
    await new Promise((r) => setTimeout(r, 80));
  }
  try {
    await configureAudioSession(true, true, 'youtube');
    if (_silentAnchorPlayer) {
      if (!_silentAnchorPlayer.playing) {
        _silentAnchorPlayer.play();
      }
      return;
    }
    _isStartingAnchor = true;
    const expoVideo = require('expo-video');
    if (typeof expoVideo?.createVideoPlayer !== 'function') return;
    const silentUri = await getOrGenerateSilentAudioUri();
    const anchor = expoVideo.createVideoPlayer({ uri: silentUri });
    anchor.loop = true;
    anchor.volume = 0.05;
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
