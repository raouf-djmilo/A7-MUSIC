/**
 * Compatibility facade re-exporting modular playback bridge and session manager services.
 */
export {
  type PlayerControlsBridge,
  type YoutubeEngineSnapshot,
  type YoutubeTrackMetadata,
  cleanArtistForLockScreen,
  getActivePlayerBridge,
  getLastBridgeCommandTimestamp,
  getLastEngineLoadTimestamp,
  isVideoUnembeddable,
  markBridgeCommandTimestamp,
  markEngineLoadTimestamp,
  markVideoUnembeddable,
  registerActivePlayerBridge,
} from './playback/youtubeEngineBridge';

export {
  beginTrackPlayerTransition,
  configureAudioSession,
  endTrackPlayerTransition,
  getOrGenerateSilentAudioUri,
  isTrackPlayerTransitioning,
  markTrackEndHandled,
  pauseSilentBackgroundKeepAlive,
  prepareNativeEngineForYouTube,
  prewarmSilentBackgroundAnchor,
  setAudioInterruptionHandler,
  setupAudioInterruptionListeners,
  startSilentBackgroundKeepAlive,
  stopSilentBackgroundKeepAlive,
  updateNowPlayingLockScreen,
} from './playback/playbackSessionManager';
