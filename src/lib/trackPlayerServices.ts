import { NativeModules } from 'react-native';
import TrackPlayer, { Capability, Event } from 'react-native-track-player';
import { useAudioStore } from '../store/useAudioStore';
import { setupAudioInterruptionListeners } from '../services/audioSessionService';

export const PlaybackService = async () => {
  if (!NativeModules.TrackPlayerModule) return;
  try {
    TrackPlayer.addEventListener(Event.RemotePlay, () => useAudioStore.getState().resumeTrack());
    TrackPlayer.addEventListener(Event.RemotePause, () => useAudioStore.getState().pauseTrack());
    TrackPlayer.addEventListener(Event.RemoteNext, () => useAudioStore.getState().nextTrack());
    TrackPlayer.addEventListener(Event.RemotePrevious, () => useAudioStore.getState().prevTrack());
    TrackPlayer.addEventListener(Event.RemoteStop, () => useAudioStore.getState().stopTrack());
    TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
      if (typeof event.position === 'number') {
        await useAudioStore.getState().seekTo(event.position * 1000);
      }
    });
    TrackPlayer.addEventListener(Event.RemoteDuck, (event) => {
      // Only pause on permanent focus loss (incoming phone call, alarm, or another audio app taking exclusive focus)
      // Ignore transient ducking or volume dips during track setup/notifications
      if (event.permanent) {
        useAudioStore.getState().pauseTrack();
      }
    });
    // Note: TrackPlayer serves as the silent anchor and remote control bridge.
    // Actual playback progress and track completion are handled with precision by
    // nativeAudioService (expo-video) and GlobalAudioBridge (YouTube engine).
  } catch (e) {
    // Ignored in Expo Go
  }
};

export const SetupService = async () => {
  if (!NativeModules.TrackPlayerModule) {
    // Expo Go fallback mode: HTML5 GlobalAudioBridge is active
    return true;
  }
  let isSetup = false;
  try {
    await TrackPlayer.getCurrentTrack();
    isSetup = true;
  } catch {
    try {
      await TrackPlayer.setupPlayer();
      isSetup = true;
    } catch (e) {
      console.log('[SetupService] TrackPlayer setup skipped');
    }
  }

  // 🛡️ Guaranteed Remote Control Configuration:
  // Must execute on EVERY boot so iOS MPRemoteCommandCenter receives Next / Previous and drops 10s jump buttons!
  try {
    if (Capability) {
      await TrackPlayer.updateOptions({
        android: {
          appKilledBehavior: (TrackPlayer as any)?.AppKilledBehavior?.StopPlaybackAndRemoveNotification,
        } as any,
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.Stop,
          Capability.SeekTo,
        ],
        compactCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
        ],
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.SeekTo,
        ],
        progressUpdateEventInterval: 2,
      });
    }
    setupAudioInterruptionListeners();
  } catch (optErr) {
    console.warn('[SetupService] TrackPlayer updateOptions error:', optErr);
  }

  return isSetup;
};
