import { NativeModules } from 'react-native';
import TrackPlayer, { Capability, Event } from 'react-native-track-player';
import { useAudioStore } from '../store/useAudioStore';

export const PlaybackService = async () => {
  if (!NativeModules.TrackPlayerModule) return;
  try {
    TrackPlayer.addEventListener(Event.RemotePlay, () => useAudioStore.getState().togglePlay());
    TrackPlayer.addEventListener(Event.RemotePause, () => useAudioStore.getState().togglePlay());
    TrackPlayer.addEventListener(Event.RemoteNext, () => useAudioStore.getState().nextTrack());
    TrackPlayer.addEventListener(Event.RemotePrevious, () => useAudioStore.getState().prevTrack());
    TrackPlayer.addEventListener(Event.RemoteStop, () => useAudioStore.getState().stopTrack());
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
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
          progressUpdateEventInterval: 2,
        });
      }
      isSetup = true;
    } catch (e) {
      console.log('[SetupService] TrackPlayer setup skipped');
    }
  }
  return isSetup;
};
