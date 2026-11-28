import { NativeModules, Platform } from 'react-native';
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  IOSCategory,
  IOSCategoryMode,
  State,
} from 'react-native-track-player';
import { getLastUserToggleTimestamp, useAudioStore } from '../store/useAudioStore';
import {
  endTrackPlayerTransition,
  isTrackPlayerTransitioning,
  markTrackEndHandled,
  setupAudioInterruptionListeners,
} from '../services/audioSessionService';

let isPlaybackServiceRegistered = false;
let isSetupComplete = false;
let setupInFlightPromise: Promise<void> | null = null;
let wasPausedByDuck = false;

export const PlaybackService = async () => {
  if (!NativeModules.TrackPlayerModule) return;
  if (isPlaybackServiceRegistered) return;
  isPlaybackServiceRegistered = true;

  try {
    TrackPlayer.addEventListener(Event.RemotePlay, async () => {
      const store = useAudioStore.getState();
      if (!store.currentTrack) return;
      useAudioStore.setState({ isUserPauseAction: false });
      await store.resumeTrack();
    });

    TrackPlayer.addEventListener(Event.RemotePause, () => {
      useAudioStore.getState().pauseTrack();
    });

    TrackPlayer.addEventListener(Event.RemoteNext, async () => {
      await useAudioStore.getState().nextTrack();
    });

    TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
      await useAudioStore.getState().prevTrack();
    });

    TrackPlayer.addEventListener(Event.RemoteStop, async () => {
      await useAudioStore.getState().stopTrack();
    });

    TrackPlayer.addEventListener(Event.RemoteSeek, async (event: any) => {
      if (typeof event?.position === 'number' && isFinite(event.position)) {
        await useAudioStore.getState().seekTo(Math.max(0, event.position * 1000));
      }
    });

    TrackPlayer.addEventListener(Event.RemoteJumpForward, async (event: any) => {
      const store = useAudioStore.getState();
      const intervalSec = typeof event?.interval === 'number' && event.interval > 0 ? event.interval : 10;
      const validDuration = store.durationMillis > 0 ? store.durationMillis : (store.currentTrack?.duration || 180000);
      const targetMs = Math.min(validDuration, store.positionMillis + intervalSec * 1000);
      await store.seekTo(targetMs);
    });

    TrackPlayer.addEventListener(Event.RemoteJumpBackward, async (event: any) => {
      const store = useAudioStore.getState();
      const intervalSec = typeof event?.interval === 'number' && event.interval > 0 ? event.interval : 10;
      const targetMs = Math.max(0, store.positionMillis - intervalSec * 1000);
      await store.seekTo(targetMs);
    });

    TrackPlayer.addEventListener(Event.RemoteDuck, async (event: any) => {
      const store = useAudioStore.getState();
      if (event?.permanent) {
        wasPausedByDuck = false;
        store.pauseTrack();
        return;
      }
      // Only let native TrackPlayer transient ducks toggle pause when TrackPlayer itself owns audio;
      // WKWebView YouTube playback handles transient ducks via OS WebContent without bouncing TrackPlayer.
      if (store.activeEngine !== 'native') return;
      if (event?.paused === true) {
        if (store.isPlaying && !store.isUserPauseAction) {
          wasPausedByDuck = true;
          store.pauseTrack();
        }
      } else if (event?.paused === false) {
        if (wasPausedByDuck && store.currentTrack && store.backgroundAudioEnabled) {
          wasPausedByDuck = false;
          await store.resumeTrack();
        }
      }
    });

    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event: any) => {
      const store = useAudioStore.getState();
      if (store.activeEngine !== 'native' || isTrackPlayerTransitioning()) return;
      if (typeof event?.position !== 'number' || !isFinite(event.position) || event.position < 0) return;

      const posMs = Math.round(event.position * 1000);
      const rawDurSec = typeof event?.duration === 'number' && isFinite(event.duration) ? event.duration : 0;
      const durMs = rawDurSec > 2 ? Math.round(rawDurSec * 1000) : store.durationMillis;
      store.updateProgress(posMs, durMs);
    });

    TrackPlayer.addEventListener(Event.PlaybackState, (event: any) => {
      const store = useAudioStore.getState();
      if (store.activeEngine !== 'native') return;

      const timeSinceToggle = Date.now() - getLastUserToggleTimestamp();

      if (event?.state === State.Playing) {
        endTrackPlayerTransition();
        if (store.isLoading || store.loadingTrackId) {
          useAudioStore.setState({ isLoading: false, loadingTrackId: null });
        }
        // Reconcile Control Center / Lock Screen remote resume cleanly even if isUserPauseAction was true
        if (!store.isPlaying && timeSinceToggle > 650) {
          useAudioStore.setState({
            isPlaying: true,
            isUserPauseAction: false,
            isLoading: false,
            loadingTrackId: null,
          });
        }
      } else if (event?.state === State.Paused) {
        if (
          !isTrackPlayerTransitioning() &&
          !store.isLoading &&
          store.isPlaying &&
          timeSinceToggle > 950
        ) {
          useAudioStore.setState({ isPlaying: false, isUserPauseAction: true });
        }
      } else if (event?.state === State.Error) {
        if (!isTrackPlayerTransitioning() && typeof store.recoverFromNativeError === 'function') {
          store.recoverFromNativeError();
        }
      }
    });

    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async (event: any) => {
      const store = useAudioStore.getState();
      if (
        store.activeEngine !== 'native' ||
        isTrackPlayerTransitioning() ||
        store.isLoading ||
        !store.currentTrack ||
        store.isUserPauseAction
      ) {
        return;
      }

      const posMs =
        typeof event?.position === 'number' && isFinite(event.position) && event.position > 0
          ? event.position * 1000
          : store.positionMillis;
      const durMs = store.durationMillis || store.currentTrack?.duration || 0;

      // Ignore false-positive ended fires at 0s during source replacement
      if (durMs > 15000 && posMs < Math.max(4000, durMs * 0.5)) {
        return;
      }

      const trackKey = `${store.currentTrack.videoId || 'track'}_${store.playRequestId}`;
      if (!markTrackEndHandled(trackKey)) return;

      await store.handleTrackEnded();
    });

    TrackPlayer.addEventListener(Event.PlaybackError, () => {
      const store = useAudioStore.getState();
      if (store.activeEngine !== 'native' || isTrackPlayerTransitioning()) return;
      if (typeof store.recoverFromNativeError === 'function') {
        store.recoverFromNativeError();
      }
    });

    setupAudioInterruptionListeners(() => {
      useAudioStore.getState().pauseTrack();
    });
  } catch (err) {
    console.warn('[PlaybackService] Error registering listeners:', err);
  }
};

export const SetupService = async () => {
  if (!NativeModules.TrackPlayerModule) return;
  if (isSetupComplete) return;
  if (setupInFlightPromise) return setupInFlightPromise;

  setupInFlightPromise = (async () => {
    try {
      let alreadySetup = false;
      try {
        const currentTrack = await TrackPlayer.getActiveTrackIndex();
        if (currentTrack !== undefined) alreadySetup = true;
      } catch {}

      if (!alreadySetup) {
        try {
          await TrackPlayer.setupPlayer({
            autoHandleInterruptions: true,
            autoUpdateMetadata: true,
            waitForBuffer: true,
            iosCategory: IOSCategory.Playback,
            iosCategoryMode: IOSCategoryMode.Default,
          });
        } catch (setupErr: any) {
          const msg = String(setupErr?.message || '');
          if (!msg.includes('already') && !msg.includes('initialized')) {
            console.log('[SetupService] TrackPlayer setup skipped:', msg);
            return;
          }
        }
      }

      try {
        const capabilities =
          Platform.OS === 'ios'
            ? [
                Capability.Play,
                Capability.Pause,
                Capability.SkipToNext,
                Capability.SkipToPrevious,
                Capability.Stop,
                Capability.SeekTo,
              ]
            : [
                Capability.Play,
                Capability.Pause,
                Capability.SkipToNext,
                Capability.SkipToPrevious,
                Capability.JumpForward,
                Capability.JumpBackward,
                Capability.Stop,
                Capability.SeekTo,
              ];

        await TrackPlayer.updateOptions({
          progressUpdateEventInterval: 0.5,
          forwardJumpInterval: 10,
          backwardJumpInterval: 10,
          capabilities,
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
          android: {
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
          },
        });
        isSetupComplete = true;
      } catch (optErr) {
        console.warn('[SetupService] TrackPlayer updateOptions error:', optErr);
      }
    } finally {
      setupInFlightPromise = null;
    }
  })();

  return setupInFlightPromise;
};
