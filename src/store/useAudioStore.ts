import { create } from 'zustand';
import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import TrackPlayer, { RepeatMode as TrackPlayerRepeatMode } from 'react-native-track-player';
import {
  getFirebaseLikedSongs,
  addFirebaseLikedSong,
  removeFirebaseLikedSong,
  toggleFirebaseFavoriteArtist,
} from '../services/firebaseMusicDb';
import { CURATED_TRACKS } from '../data/curatedMusic';
import {
  trackListeningSecond,
  flushListeningSecondsToSupabase,
  startListeningHeartbeat,
  stopListeningHeartbeat
} from '../services/listeningTimeService';
import {
  beginTrackPlayerTransition,
  configureAudioSession,
  updateNowPlayingLockScreen,
  getActivePlayerBridge,
  startSilentBackgroundKeepAlive,
  pauseSilentBackgroundKeepAlive,
  stopSilentBackgroundKeepAlive,
} from '../services/audioSessionService';
import { getUniversalStudioArtwork, fetchStudioAlbumArtAsync, resolveLockScreenSquareArtworkAsync } from '../utils/artworkHelper';
import { ToastManager } from '../components/InAppToast';
import { musicDnaService } from '../services/musicDnaService';
import { downloadService } from '../services/downloadService';
import { nativeAudioService } from '../services/nativeAudioService';
import { useNetworkStore } from '../services/networkService';
import { fetchContextAwareNextBatch } from '../services/infiniteRecommendationEngine';


export interface Track {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  duration?: number; // in ms
  audioUrl?: string;
  category?: string;
  bpm?: number;
  type?: string;
  isOfficial?: boolean;
  channelId?: string;
  artistAvatar?: string;
  album?: string;
  albumId?: string;
  year?: string;
}

export type RepeatMode = 'off' | 'all' | 'one';
export type AudioQuality = 'hd320' | 'standard' | 'saver';

export interface AudioEngineAction {
  type: 'play' | 'pause' | 'resume' | 'seek' | 'stop' | 'quality' | 'handover_from_video' | 'pause_bridge' | 'resume_bridge';
  videoId?: string;
  url?: string;
  position?: number; // in seconds
  quality?: 'hd1080' | 'hd720' | 'highres' | 'medium' | 'small';
  isOfflinePlayback?: boolean;
  id: number;
}

export interface SavedCollection {
  id: string;
  title: string;
  artist: string;
  cover: string;
  year?: string;
  type: 'album' | 'single' | 'ep' | 'playlist' | 'mix';
  tracks: Track[];
  savedAt: string;
}

export interface AudioState {
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  playRequestId: number;
  isPlayerModalVisible: boolean;

  positionMillis: number;
  durationMillis: number;
  activeUserId: string | null;
  loadingTrackId: string | null;

  queue: Track[];
  currentQueue: Track[];
  currentIndex: number;
  currentContextName: string | null;
  queueContextName: string | null;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  shuffledIndices: number[];
  likedTrackIds: string[];
  preferredQuality: AudioQuality;
  history: Track[];
  audioEngineAction?: AudioEngineAction | null;

  // Route navigation tracking & scroll-reactive dock state
  currentRouteName: string;
  setCurrentRouteName: (name: string) => void;
  isDockMinimized: boolean;
  setDockMinimized: (minimized: boolean) => void;
  requestedTabSwitch: { key: string; nonce: number } | null;
  requestTabSwitch: (key: string) => void;

  // Saved individual tracks added via '+' (Add to Library)
  savedLibraryTracks: Track[];
  savedLibraryTrackIds: string[];
  guestLikedTracks: Track[];
  toggleSaveTrackToLibrary: (track: Track) => Promise<boolean>;
  loadSavedLibraryTracks: () => Promise<void>;

  // Followed artists engine (Persistent with AsyncStorage & Supabase)
  followedArtistIds: string[];
  followedArtists: { id: string; name: string; avatar: string }[];
  toggleFollowArtist: (artist: { id: string; name: string; avatar: string }) => Promise<void>;
  loadFollowedArtists: () => Promise<void>;

  // Saved Albums, Playlists, Singles & Mixes (+ Library persistence)
  savedCollections: SavedCollection[];
  savedCollectionIds: string[];
  toggleSaveCollection: (collection: Omit<SavedCollection, 'savedAt'>) => Promise<boolean>;
  loadSavedCollections: () => Promise<void>;

  // Mini-player suppression flag (e.g. for full-screen workout recording screens)
  isMiniPlayerSuppressed: boolean;
  setMiniPlayerSuppressed: (suppressed: boolean) => void;

  // Background Audio and Lock Screen Settings
  backgroundAudioEnabled: boolean;
  setBackgroundAudioEnabled: (enabled: boolean) => void;
  isUserPauseAction: boolean;
  setIsUserPauseAction: (isUser: boolean) => void;
  pauseTrack: () => void;
  resumeTrack: () => Promise<void>;

  setPlayerModalVisible: (visible: boolean) => void;
  setActiveUserId: (userId: string | null) => void;
  fetchInitialLikes: (userId: string) => Promise<void>;
  loadHistory: () => Promise<void>;
  getUserTopVibe: () => { vibeName: string; query: string };
  playTrack: (
    track: Track,
    queueOrUserId?: Track[] | string | null,
    indexOrInitialPos?: number,
    contextQueueOrContextName?: Track[] | string,
    contextName?: string
  ) => Promise<void>;
  playAlbumContext: (tracks: Track[], startIndex: number, contextName: string) => Promise<void>;
  playAlbum: (tracks: Track[], startIndex?: number) => Promise<void>;
  nextTrack: () => Promise<void>;
  prevTrack: () => Promise<void>;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleLike: (track: Track) => Promise<void>;
  togglePlay: () => Promise<void>;
  stopTrack: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  setAudioQuality: (quality: AudioQuality) => void;
  isOfflinePlayback: boolean;
  activeEngine: 'youtube' | 'native';
  setActiveEngine: (engine: 'youtube' | 'native') => void;
  isSwitchingToFallback: boolean;
  playDownloadedQueue: (startIndex?: number) => Promise<void>;
  updateProgress: (positionMillis: number, durationMillis: number) => void;
  handleTrackEnded: () => Promise<void>;
  handlePlaybackFallback: (fallbackVideoId?: string, startPositionSec?: number) => Promise<void>;
  recoverFromNativeError: () => Promise<void>;
  upgradeTrackToNativeStream: (streamUrl: string, startPositionSec: number, expectedVideoId?: string) => Promise<boolean>;
  playerMediaMode: 'cover' | 'video';
  setPlayerMediaMode: (mode: 'cover' | 'video') => void;
  videoAspectMode: 'fit' | 'fill';
  setVideoAspectMode: (mode: 'fit' | 'fill') => void;
  isVideoFullscreen: boolean;
  setVideoFullscreen: (fullscreen: boolean) => void;
  videoLayout: { x: number; y: number; width: number; height: number } | null;
  setVideoLayout: (layout: { x: number; y: number; width: number; height: number } | null) => void;
  loadPlayerMediaMode: () => Promise<void>;
}

let lastNavTimestamp = 0;
const NAV_THROTTLE_MS = 280;
let lastUserToggleTimestamp = Date.now();
let lastReportedPlaybackSec = 0;
let isAudioLoadingMutex = false;
let loadingSafetyTimer: any = null;
let fallbackInProgressVideoId: string | null = null;
let lastNativeErrorRecoveryKey: string | null = null;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Starts real native audio playback via RNTrackPlayer (Production iOS/Android AVPlayer/ExoPlayer)
 * or falls back to nativeAudioService (Expo Go) when TrackPlayerModule is not linked.
 */
async function startNativeEnginePlayback(
  track: Track,
  streamUrl: string,
  startPosSec: number,
  artworkUrl: string | undefined,
  durationSec: number
): Promise<boolean> {
  if (NativeModules.TrackPlayerModule) {
    try {
      beginTrackPlayerTransition(1800);
      await configureAudioSession(true);

      const tpTrack = {
        id: track.videoId || `track_${Date.now()}`,
        url: streamUrl,
        title: track.title || 'Unknown Title',
        artist: track.artist || 'Unknown Artist',
        artwork: artworkUrl || undefined,
        duration: durationSec > 0 ? durationSec : 180,
      };

      const existingQueue = await TrackPlayer.getQueue().catch(() => []);
      if (Array.isArray(existingQueue) && existingQueue.length > 0) {
        await TrackPlayer.load(tpTrack);
      } else {
        await TrackPlayer.add(tpTrack);
      }

      await TrackPlayer.setRepeatMode(TrackPlayerRepeatMode.Off);
      await TrackPlayer.setVolume(1.0);
      if (startPosSec > 0.5) {
        await TrackPlayer.seekTo(startPosSec);
      }
      await TrackPlayer.play();
      return true;
    } catch (tpErr) {
      console.warn('[AudioStore] TrackPlayer start failed, falling back to nativeAudioService:', tpErr);
    }
  }

  // Fallback for Expo Go (where TrackPlayerModule is absent)
  await nativeAudioService.play(streamUrl, startPosSec, {
    title: track.title || 'Track',
    artist: track.artist || 'Artist',
    artwork: artworkUrl,
  });
  return true;
}

/**
 * No-op prefetcher placeholder (online tracks stream natively inside WKWebView with YouTube BotGuard/PO-Token protection).
 */
function prefetchUpcomingQueueTrack(_queue: Track[], _currentIndex: number, _quality: string) {
  // Intentional no-op: avoids unauthenticated googlevideo HTTP 403 requests
}

export const getLastUserToggleTimestamp = () => lastUserToggleTimestamp;
export const setLastUserToggleTimestamp = (ts: number = Date.now()) => {
  lastUserToggleTimestamp = ts;
};

let isExtendingQueueMutex = false;

const extendQueueWithContextRadio = async (get: any, set: any): Promise<boolean> => {
  if (isExtendingQueueMutex) return false;
  const state = get();
  const { currentTrack, queue, currentContextName, isOfflinePlayback } = state;
  if (isOfflinePlayback || currentContextName === 'Downloads') return false;
  if (!currentTrack) return false;

  isExtendingQueueMutex = true;
  try {
    const existingIds = new Set(queue.map((t: Track) => t.videoId).filter(Boolean) as string[]);
    const nextBatch = await fetchContextAwareNextBatch(currentTrack, currentContextName, existingIds);
    if (nextBatch.length > 0) {
      const currentQ = get().queue;
      const updatedQueue = [...currentQ, ...nextBatch];
      set({
        queue: updatedQueue,
        currentQueue: updatedQueue,
      });
      return true;
    }
  } catch (err) {
    console.warn('[AudioStore] Extend queue error:', err);
  } finally {
    isExtendingQueueMutex = false;
  }
  return false;
};

export const useAudioStore = create<AudioState>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  isLoading: false,
  playRequestId: 0,
  isPlayerModalVisible: false,
  positionMillis: 0,
  durationMillis: 180000,
  activeUserId: null,
  loadingTrackId: null,
  activeEngine: 'youtube',
  setActiveEngine: (engine) => set({ activeEngine: engine }),
  isSwitchingToFallback: false,
  queue: [],
  currentQueue: [],
  currentIndex: -1,
  currentContextName: null,
  queueContextName: null,
  isShuffle: false,
  repeatMode: 'off',
  shuffledIndices: [],
  likedTrackIds: [],
  preferredQuality: 'hd320',
  isOfflinePlayback: false,
  history: [],
  currentRouteName: 'DashboardTab',
  setCurrentRouteName: (name: string) => set({ currentRouteName: name, isDockMinimized: false }),
  isDockMinimized: false,
  setDockMinimized: (minimized: boolean) => {
    if (get().isDockMinimized !== minimized) {
      set({ isDockMinimized: minimized });
    }
  },
  requestedTabSwitch: null,
  requestTabSwitch: (key: string) =>
    set({
      requestedTabSwitch: { key, nonce: Date.now() },
      currentRouteName: key,
      isDockMinimized: false,
    }),
  savedLibraryTracks: [],
  savedLibraryTrackIds: [],
  guestLikedTracks: [],
  backgroundAudioEnabled: true,
  setBackgroundAudioEnabled: (enabled: boolean) => {
    set({ backgroundAudioEnabled: enabled });
    AsyncStorage.setItem('@nouble_background_playback_pref', String(enabled)).catch(() => { });
    configureAudioSession(enabled).catch(() => { });
    nativeAudioService.setBackgroundEnabled(enabled);
    if (!enabled) {
      pauseSilentBackgroundKeepAlive();
    } else if (get().isPlaying && get().activeEngine === 'youtube') {
      startSilentBackgroundKeepAlive().catch(() => { });
    }
  },
  isUserPauseAction: false,
  setIsUserPauseAction: (isUser: boolean) => set({ isUserPauseAction: isUser }),

  playerMediaMode: 'cover',
  setPlayerMediaMode: (mode) => {
    set({ playerMediaMode: mode });
    AsyncStorage.setItem('@nouble_player_media_mode', mode).catch(() => { });
  },
  videoAspectMode: 'fit',
  setVideoAspectMode: (mode) => set({ videoAspectMode: mode }),
  isVideoFullscreen: false,
  setVideoFullscreen: (fullscreen) => set({ isVideoFullscreen: fullscreen }),
  videoLayout: null,
  setVideoLayout: (layout) => set({ videoLayout: layout }),
  loadPlayerMediaMode: async () => {
    try {
      const saved = await AsyncStorage.getItem('@nouble_player_media_mode');
      if (saved === 'cover' || saved === 'video') {
        set({ playerMediaMode: saved });
      }
    } catch (e) { }
  },

  followedArtistIds: [],
  followedArtists: [],

  toggleFollowArtist: async (artist) => {
    const { followedArtistIds, followedArtists, activeUserId } = get();
    const exists = followedArtistIds.includes(artist.id);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let newIds: string[];
    let newArtists: { id: string; name: string; avatar: string }[];

    if (exists) {
      newIds = followedArtistIds.filter((id) => id !== artist.id);
      newArtists = followedArtists.filter((a) => a.id !== artist.id);
    } else {
      newIds = [artist.id, ...followedArtistIds];
      newArtists = [artist, ...followedArtists];
    }

    set({ followedArtistIds: newIds, followedArtists: newArtists });

    try {
      await AsyncStorage.setItem('@nouble_followed_artists', JSON.stringify(newArtists));
      await AsyncStorage.setItem('@nouble_followed_artist_ids', JSON.stringify(newIds));
    } catch (e) {
      console.warn('[AudioStore] AsyncStorage save followed artists error:', e);
    }

    if (activeUserId) {
      try {
        await toggleFirebaseFavoriteArtist(activeUserId, artist);
      } catch (e) {
        console.warn('[AudioStore] Firebase followed artists sync error:', e);
      }
    }
  },

  loadFollowedArtists: async () => {
    try {
      const raw = await AsyncStorage.getItem('@nouble_followed_artists');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          set({
            followedArtists: parsed,
            followedArtistIds: parsed.map((a: any) => a.id),
          });
        }
      }
    } catch (e) {
      console.warn('[AudioStore] Load followed artists error:', e);
    }
  },

  savedCollections: [],
  savedCollectionIds: [],

  toggleSaveCollection: async (collection) => {
    const { savedCollections } = get();
    const normTitle = (collection.title || '').toLowerCase().trim();
    const normArtist = (collection.artist || '').toLowerCase().trim();
    const existingIdx = savedCollections.findIndex(
      (c) =>
        c.id === collection.id ||
        (c.type === collection.type &&
          c.title.toLowerCase().trim() === normTitle &&
          c.artist.toLowerCase().trim() === normArtist)
    );

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let nextCollections: SavedCollection[];
    let isNowSaved = false;

    if (existingIdx >= 0) {
      nextCollections = savedCollections.filter((_, i) => i !== existingIdx);
      isNowSaved = false;
    } else {
      const newEntry: SavedCollection = {
        ...collection,
        tracks: Array.isArray(collection.tracks) ? collection.tracks.slice(0, 150) : [],
        savedAt: new Date().toISOString(),
      };
      nextCollections = [newEntry, ...savedCollections];
      isNowSaved = true;
    }

    const nextIds = nextCollections.map((c) => c.id);
    set({ savedCollections: nextCollections, savedCollectionIds: nextIds });

    try {
      await AsyncStorage.setItem('@a7_saved_collections_v1', JSON.stringify(nextCollections));
    } catch (e) {
      console.warn('[AudioStore] AsyncStorage save collections error:', e);
    }

    return isNowSaved;
  },

  loadSavedCollections: async () => {
    try {
      const raw = await AsyncStorage.getItem('@a7_saved_collections_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          set({
            savedCollections: parsed,
            savedCollectionIds: parsed.map((c: any) => c.id).filter(Boolean),
          });
        }
      }
    } catch (e) {
      console.warn('[AudioStore] Load saved collections error:', e);
    }
  },

  toggleSaveTrackToLibrary: async (track) => {
    if (!track?.videoId) return false;
    const { savedLibraryTracks, savedLibraryTrackIds } = get();
    const exists = savedLibraryTrackIds.includes(track.videoId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const nextTracks = exists
      ? savedLibraryTracks.filter((t) => t.videoId !== track.videoId)
      : [track, ...savedLibraryTracks.filter((t) => t.videoId !== track.videoId)];
    const nextIds = nextTracks.map((t) => t.videoId);

    set({ savedLibraryTracks: nextTracks, savedLibraryTrackIds: nextIds });
    AsyncStorage.setItem('@a7_saved_library_tracks_v1', JSON.stringify(nextTracks)).catch(() => { });
    return !exists;
  },

  loadSavedLibraryTracks: async () => {
    try {
      const [rawLib, rawGuestLikes, rawGuestLikeIds] = await Promise.all([
        AsyncStorage.getItem('@a7_saved_library_tracks_v1'),
        AsyncStorage.getItem('@guest_liked_track_objects_v1'),
        AsyncStorage.getItem('@guest_liked_tracks'),
      ]);
      const parsedLib = rawLib ? JSON.parse(rawLib) : [];
      const parsedGuestLikes = rawGuestLikes ? JSON.parse(rawGuestLikes) : [];
      const parsedGuestIds = rawGuestLikeIds ? JSON.parse(rawGuestLikeIds) : [];

      const updateObj: Partial<AudioState> = {};
      if (Array.isArray(parsedLib)) {
        updateObj.savedLibraryTracks = parsedLib;
        updateObj.savedLibraryTrackIds = parsedLib.map((t: any) => t?.videoId).filter(Boolean);
      }
      if (Array.isArray(parsedGuestLikes)) {
        updateObj.guestLikedTracks = parsedGuestLikes;
      }
      if (!get().activeUserId && Array.isArray(parsedGuestIds) && get().likedTrackIds.length === 0) {
        updateObj.likedTrackIds = parsedGuestIds;
      } else if (Array.isArray(parsedGuestIds) && get().likedTrackIds.length === 0 && parsedGuestIds.length > 0) {
        updateObj.likedTrackIds = parsedGuestIds;
      }
      set(updateObj);
    } catch (e) {
      console.warn('[AudioStore] Load saved library tracks error:', e);
    }
  },

  isMiniPlayerSuppressed: false,
  setMiniPlayerSuppressed: (suppressed: boolean) => set({ isMiniPlayerSuppressed: suppressed }),

  loadHistory: async () => {
    try {
      const raw = await AsyncStorage.getItem('@nouble_music_history');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          set({ history: parsed });
        }
      }
    } catch (e) {
      console.warn('[AudioStore] Load history error:', e);
    }
  },

  getUserTopVibe: () => {
    const { history } = get();
    if (!history || history.length === 0) {
      return { vibeName: 'Workout Phonk', query: 'Workout Phonk Gym Aggressive Beats' };
    }
    const counts: Record<string, number> = {
      'Rai': 0,
      'Rap DZ': 0,
      'Workout Phonk': 0,
      'Cardio Running': 0,
      'Chill Stride': 0,
    };

    const raiTerms = ['rai', 'khaled', 'djalil', 'palermo', 'bilal', 'soolking', 'mami', 'hasni', 'cheb'];
    const rapDzTerms = ['rap', 'didine', 'canon', 'flenn', 'zako', 'morad', 'phobia', 'isaac'];
    const phonkTerms = ['phonk', 'gym', 'bass', 'brazilian', 'drift', 'sigma'];
    const cardioTerms = ['cardio', '160 bpm', 'running', 'run', 'energy', 'stride', 'beat'];
    const chillTerms = ['chill', 'lofi', 'walk', 'relax', 'zen', 'calm', 'piano'];

    for (const tr of history.slice(0, 20)) {
      const text = `${tr.title || ''} ${tr.artist || ''}`.toLowerCase();
      if (raiTerms.some(k => text.includes(k))) counts['Rai'] += 3;
      if (rapDzTerms.some(k => text.includes(k))) counts['Rap DZ'] += 3;
      if (phonkTerms.some(k => text.includes(k))) counts['Workout Phonk'] += 3;
      if (cardioTerms.some(k => text.includes(k))) counts['Cardio Running'] += 3;
      if (chillTerms.some(k => text.includes(k))) counts['Chill Stride'] += 3;
    }

    let topVibe = 'Workout Phonk';
    let maxCount = 0;
    for (const [key, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        topVibe = key;
      }
    }

    const queries: Record<string, string> = {
      'Rai': 'Algerian Rai Best Hits Mix',
      'Rap DZ': 'Rap Algerien DZ Top Hits',
      'Workout Phonk': 'Workout Phonk Gym Aggressive Beats',
      'Cardio Running': '160 BPM Running Cadence Beats',
      'Chill Stride': 'Chill Walking Lofi Beats',
    };

    return { vibeName: topVibe, query: queries[topVibe] || 'Workout Running Beats' };
  },

  setAudioQuality: (quality) => {
    set({ preferredQuality: quality });
    const ytQuality = quality === 'hd320' ? 'hd1080' : quality === 'standard' ? 'medium' : 'small';
    set({
      audioEngineAction: {
        type: 'quality',
        quality: ytQuality,
        id: Date.now(),
      }
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  setPlayerModalVisible: (visible) => set({ isPlayerModalVisible: visible }),
  setActiveUserId: (userId) => {
    set({ activeUserId: userId });
    musicDnaService.setUserId(userId);
  },

  fetchInitialLikes: async (userId) => {
    try {
      const liked = await getFirebaseLikedSongs(userId);
      const { likedTrackIds, guestLikedTracks } = get();
      const mergedIds = Array.from(
        new Set([...liked.map((d) => d.videoId), ...likedTrackIds])
      );
      const mapByVid = new Map<string, Track>();
      for (const tr of [...liked, ...guestLikedTracks]) {
        if (tr?.videoId && !mapByVid.has(tr.videoId)) {
          mapByVid.set(tr.videoId, tr);
        }
      }
      const mergedTracks = Array.from(mapByVid.values());
      set({ likedTrackIds: mergedIds, guestLikedTracks: mergedTracks });
      AsyncStorage.setItem('@guest_liked_tracks', JSON.stringify(mergedIds)).catch(() => { });
      AsyncStorage.setItem('@guest_liked_track_objects_v1', JSON.stringify(mergedTracks)).catch(() => { });
    } catch (e) {
      console.warn('[AudioStore] Fetch likes error:', e);
    }
  },

  playTrack: async (track, queueOrUserId, indexOrInitialPos = 0, contextQueueOrContextName, contextName) => {
    if (!track) return;
    const state = get();

    // ── Parse Overloaded Arguments ──
    let targetQueue: Track[] = [];
    let targetIndex = -1;
    let resolvedContextName: string | null = null;
    let finalUserId: string | null = state.activeUserId;
    let initialPosition = 0;

    if (Array.isArray(queueOrUserId)) {
      // Signature A: playTrack(track, queue, index, contextName)
      targetQueue = queueOrUserId;
      targetIndex = typeof indexOrInitialPos === 'number' ? indexOrInitialPos : -1;
      resolvedContextName = typeof contextQueueOrContextName === 'string' ? contextQueueOrContextName : (contextName || null);
    } else {
      // Signature B: playTrack(track, userId, initialPosition, contextQueue, contextName)
      finalUserId = (queueOrUserId as string | null) || state.activeUserId;
      initialPosition = typeof indexOrInitialPos === 'number' ? indexOrInitialPos : 0;
      if (Array.isArray(contextQueueOrContextName)) {
        targetQueue = contextQueueOrContextName;
      }
      resolvedContextName = contextName || (typeof contextQueueOrContextName === 'string' ? contextQueueOrContextName : null);
    }

    // ── 0. Smart Idempotent Play Guard ──
    // Resume instantly if the same paused song is tapped from any tab/list, or skip redundant reload while actively playing
    const isSameTrack = Boolean(
      state.currentTrack &&
      ((track.videoId && state.currentTrack.videoId === track.videoId) ||
        ((track as any).id && (state.currentTrack as any).id === (track as any).id))
    );

    if (isSameTrack) {
      if (!state.isPlaying) {
        if (targetQueue.length > 0 && targetQueue !== state.queue) {
          const foundIdx = (targetIndex >= 0 && targetIndex < targetQueue.length)
            ? targetIndex
            : targetQueue.findIndex(t => t.videoId === track.videoId);
          set({
            queue: targetQueue,
            currentQueue: targetQueue,
            currentIndex: foundIdx >= 0 ? foundIdx : 0,
            currentContextName: resolvedContextName,
            queueContextName: resolvedContextName,
          });
        }
        await get().resumeTrack();
        return;
      }
      if ((!targetQueue.length || targetQueue === state.queue) && (state.positionMillis > 1200 || state.activeEngine === 'native')) {
        return;
      }
      // If activeEngine === 'youtube' stalled at 0:00, fall through to force-start cleanly
    }

    // ── 1. Atomic Request Token (Supersedes all prior in-flight starts cleanly) ──
    const newRequestId = state.playRequestId + 1;
    lastUserToggleTimestamp = Date.now();
    fallbackInProgressVideoId = null;
    lastNativeErrorRecoveryKey = null;

    if (loadingSafetyTimer) clearTimeout(loadingSafetyTimer);
    loadingSafetyTimer = setTimeout(() => {
      const s = get();
      if (s.playRequestId === newRequestId && s.isLoading) {
        set({ isLoading: false, loadingTrackId: null });
      }
    }, 6500);

    try {
      // ── Context Queue & Index Calibration ──
      let calibratedQueue = state.queue;
      let calibratedIndex = state.currentIndex;

      if (targetQueue.length > 0) {
        const foundIdx = (targetIndex >= 0 && targetIndex < targetQueue.length)
          ? targetIndex
          : targetQueue.findIndex(t => t.videoId === track.videoId);
        calibratedIndex = foundIdx >= 0 ? foundIdx : 0;
        calibratedQueue = targetQueue;
        set({
          queue: targetQueue,
          currentQueue: targetQueue,
          currentIndex: calibratedIndex,
          currentContextName: resolvedContextName,
          queueContextName: resolvedContextName,
        });
      } else {
        const existingIdx = state.queue.findIndex(t => t.videoId === track.videoId);
        if (existingIdx >= 0) {
          calibratedIndex = existingIdx;
          set({ currentIndex: existingIdx });
        } else {
          calibratedQueue = [track];
          calibratedIndex = 0;
          set({
            queue: [track],
            currentQueue: [track],
            currentIndex: 0,
            currentContextName: resolvedContextName || 'single',
            queueContextName: resolvedContextName || 'single',
          });
        }
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      let streamUrl: string | undefined = track.audioUrl;
      const finalTitle = track.title || 'Unknown Title';
      const finalArtist = track.artist || 'Unknown Artist';
      let finalArtwork = track.thumbnail;
      let totalDurationSec = track.duration ? Math.floor(track.duration / 1000) : 180;
      let isOffline = false;
      const hasValidYtId = Boolean(track.videoId && !track.videoId.startsWith('http') && track.videoId.length >= 5);
      const isVideoMode = get().playerMediaMode === 'video';
      const hasTrackPlayer = Boolean(NativeModules.TrackPlayerModule);

      // ── Step A: Check Local Offline Storage (Downloads) FIRST (0ms local hit & offline guard) ──
      let hasOfflineCandidate = Boolean(streamUrl && streamUrl.startsWith('file://'));
      try {
        const localTrack = await downloadService.getLocalTrack(track.videoId);
        if (get().playRequestId !== newRequestId) return;
        if (localTrack && localTrack.audioLocalUri) {
          streamUrl = localTrack.audioLocalUri;
          isOffline = true;
          hasOfflineCandidate = true;
          if (localTrack.artworkLocalUri) {
            finalArtwork = localTrack.artworkLocalUri;
          }
          if (localTrack.duration && localTrack.duration > 1000) {
            totalDurationSec = Math.floor(localTrack.duration / 1000);
          }
        }
      } catch (localErr) {
        console.warn('[AudioStore] Local track check non-fatal error:', localErr);
      }

      // Block non-downloaded tracks cleanly when the device has no Internet connection
      const isOnlineNow = useNetworkStore.getState().isOnline;
      if (!isOnlineNow && !hasOfflineCandidate) {
        set({ isLoading: false, loadingTrackId: null });
        ToastManager.show({
          title: 'أنت في وضع الأوفلاين',
          subtitle: 'يمكن تشغيل المقاطع المحمّلة فقط بدون إنترنت',
          icon: 'cloud-offline-outline',
          duration: 2800,
        });
        return;
      }

      // Optimistically render MiniPlayer & FullPlayer
      const optimisticTrack: Track = {
        ...track,
        title: finalTitle,
        artist: finalArtist,
        thumbnail: finalArtwork,
        duration: totalDurationSec * 1000,
      };

      // If valid YouTube track without explicit URL, start YoutubePlayer immediately
      if (!streamUrl && hasValidYtId) {
        nativeAudioService.stop().catch(() => { });
        set({
          playRequestId: newRequestId,
          currentTrack: optimisticTrack,
          isPlaying: true,
          isUserPauseAction: false,
          isLoading: false,
          loadingTrackId: null,
          isOfflinePlayback: false,
          activeEngine: 'youtube',
          isSwitchingToFallback: false,
          durationMillis: totalDurationSec * 1000,
          positionMillis: initialPosition * 1000,
          audioEngineAction: {
            type: 'play',
            videoId: track.videoId,
            url: undefined,
            position: initialPosition,
            isOfflinePlayback: false,
            id: Date.now(),
          },
        });
      } else {
        // Offline / direct audio URL dispatch
        pauseSilentBackgroundKeepAlive();
        set({
          playRequestId: newRequestId,
          currentTrack: optimisticTrack,
          isPlaying: true,
          isUserPauseAction: false,
          isLoading: true,
          loadingTrackId: track.videoId,
          isOfflinePlayback: isOffline || hasOfflineCandidate,
          activeEngine: 'native',
          isSwitchingToFallback: false,
          durationMillis: totalDurationSec * 1000,
          positionMillis: initialPosition * 1000,
        });
      }

      // ── Step B: Direct Non-YouTube HTTP URL Fallback ──
      if (!streamUrl && !hasValidYtId) {
        const matchingCurated = CURATED_TRACKS.find(t =>
          t.videoId === track.videoId ||
          t.title.toLowerCase() === track.title?.toLowerCase()
        );
        streamUrl = matchingCurated?.audioUrl || CURATED_TRACKS[0].audioUrl;
        if (!track.duration && matchingCurated?.duration) {
          totalDurationSec = Math.floor(matchingCurated.duration / 1000);
        }
      }

      const finalTrack: Track = {
        ...track,
        title: finalTitle,
        artist: finalArtist,
        thumbnail: finalArtwork,
        duration: totalDurationSec * 1000,
        audioUrl: streamUrl,
      };

      const lockArtwork = getUniversalStudioArtwork(finalTrack.thumbnail, finalTrack.title, finalTrack.artist, finalTrack.videoId) || undefined;

      // ── Step C: Play Offline File or Explicit Non-YouTube HTTP URL directly on Native Engine ──
      if ((isOffline && streamUrl) || (!hasValidYtId && streamUrl) || (streamUrl && streamUrl.startsWith('file://'))) {
        pauseSilentBackgroundKeepAlive();
        set({
          playRequestId: newRequestId,
          currentTrack: finalTrack,
          isPlaying: true,
          isUserPauseAction: false,
          isLoading: true,
          loadingTrackId: finalTrack.videoId,
          isOfflinePlayback: isOffline || Boolean(streamUrl?.startsWith('file://')),
          activeEngine: 'native',
          isSwitchingToFallback: false,
          durationMillis: totalDurationSec * 1000,
          positionMillis: initialPosition * 1000,
          audioEngineAction: { type: 'stop', id: Date.now() },
        });

        await startNativeEnginePlayback(finalTrack, streamUrl!, initialPosition, lockArtwork, totalDurationSec);
        if (get().playRequestId !== newRequestId) return;
        set({ isLoading: false, loadingTrackId: null });
      } else if (hasValidYtId) {
        // ── Step D: Online YouTube Track — Always Play Cleanly in WKWebView YoutubePlayer (Zero 403) ──
        // Never feed unauthenticated googlevideo URLs into AVPlayer (which triggers CoreMedia HTTP 403).
        if (hasTrackPlayer) {
          TrackPlayer.getActiveTrackIndex()
            .then((idx) => {
              if (idx !== null && idx !== undefined) {
                beginTrackPlayerTransition(800);
                TrackPlayer.reset().catch(() => { });
              }
            })
            .catch(() => { });
        }
        nativeAudioService.stop().catch(() => { });

        if (get().backgroundAudioEnabled) {
          startSilentBackgroundKeepAlive().catch(() => { });
        } else {
          pauseSilentBackgroundKeepAlive();
        }

        // Only re-dispatch if optimistic step above went to 'native' while checking local downloads
        if (get().activeEngine !== 'youtube' || get().currentTrack?.videoId !== finalTrack.videoId) {
          set({
            playRequestId: newRequestId,
            currentTrack: finalTrack,
            isPlaying: true,
            isUserPauseAction: false,
            isLoading: false,
            loadingTrackId: null,
            isOfflinePlayback: false,
            activeEngine: 'youtube',
            isSwitchingToFallback: false,
            durationMillis: totalDurationSec * 1000,
            positionMillis: initialPosition * 1000,
            audioEngineAction: {
              type: 'play',
              videoId: track.videoId,
              url: undefined,
              position: initialPosition,
              isOfflinePlayback: false,
              id: Date.now(),
            },
          });
        }
      }

      // ── Step E: Background Persistence, Pre-Fetch Next Track & Crisp Square Studio Artwork ──
      try {
        const currentHistory = get().history;
        const updatedHistory = [finalTrack, ...currentHistory.filter(t => t.videoId !== finalTrack.videoId)].slice(0, 30);
        set({ history: updatedHistory });
        AsyncStorage.setItem('@nouble_music_history', JSON.stringify(updatedHistory)).catch(() => { });
        musicDnaService.recordListeningSignal(finalTrack, 'play').catch(() => { });
        prefetchUpcomingQueueTrack(calibratedQueue, calibratedIndex, get().preferredQuality);

        configureAudioSession(get().backgroundAudioEnabled);
        updateNowPlayingLockScreen(finalTrack, initialPosition * 1000, totalDurationSec * 1000, true);

        // Preserve the exact cover shown in lists/search so list cover === MiniPlayer === FullPlayer.
        // Only look up missing cover art if track has no thumbnail at all.
        if (!finalTrack.thumbnail) {
          fetchStudioAlbumArtAsync(finalTrack.artist, finalTrack.title, finalTrack.videoId)
            .then((studioArt) => {
              if (!studioArt) return;
              const current = get().currentTrack;
              if (current && current.videoId === finalTrack.videoId && !current.thumbnail) {
                const upgradedTrack: Track = { ...current, thumbnail: studioArt };
                set({ currentTrack: upgradedTrack });
                updateNowPlayingLockScreen(upgradedTrack, get().positionMillis, get().durationMillis, true);
              }
            })
            .catch(() => { });
        } else {
          resolveLockScreenSquareArtworkAsync(finalTrack.thumbnail, finalTrack.title, finalTrack.artist, finalTrack.videoId)
            .then((sqArt) => {
              if (sqArt && NativeModules.TrackPlayerModule && get().activeEngine === 'native') {
                TrackPlayer.updateMetadataForTrack(0, {
                  title: finalTrack.title,
                  artist: finalTrack.artist,
                  artwork: sqArt,
                  duration: Math.floor(get().durationMillis / 1000),
                }).catch(() => { });
                TrackPlayer.updateNowPlayingMetadata({
                  title: finalTrack.title,
                  artist: finalTrack.artist,
                  artwork: sqArt,
                  duration: Math.floor(get().durationMillis / 1000),
                }).catch(() => { });
              }
            })
            .catch(() => { });
        }
      } catch (error: any) {
        console.warn('[AudioStore] Background Play Metadata Error:', error);
      }
    } catch (err) {
      console.warn('[AudioStore] Audio playback safely caught error:', err);
      set({ isLoading: false, loadingTrackId: null });
    } finally {
      isAudioLoadingMutex = false;
      if (loadingSafetyTimer) {
        clearTimeout(loadingSafetyTimer);
        loadingSafetyTimer = null;
      }
    }
  },

  playAlbumContext: async (tracks, startIndex, contextName) => {
    set({
      queue: tracks,
      currentQueue: tracks,
      currentIndex: startIndex,
      currentContextName: contextName,
      queueContextName: contextName,
      isShuffle: false,
      shuffledIndices: []
    });
    await get().playTrack(tracks[startIndex], tracks, startIndex, contextName);
  },

  playAlbum: async (tracks: Track[], startIndex = 0) => {
    await get().playAlbumContext(tracks, startIndex, 'Album');
  },

  playDownloadedQueue: async (startIndex = 0) => {
    try {
      const downloaded = await downloadService.getDownloadedTracks();
      if (downloaded.length === 0) return;

      const trackQueue: Track[] = downloaded.map((d) => ({
        videoId: d.videoId,
        title: d.title,
        artist: d.artist,
        thumbnail: d.artworkLocalUri || d.thumbnail,
        audioUrl: d.audioLocalUri,
        duration: d.duration,
      }));

      const safeIdx = Math.max(0, Math.min(startIndex, trackQueue.length - 1));
      set({ isOfflinePlayback: true });
      await get().playAlbumContext(trackQueue, safeIdx, 'Downloads');
    } catch (e) {
      console.warn('[AudioStore] Error playing downloaded queue:', e);
    }
  },

  nextTrack: async () => {
    const now = Date.now();
    // ── 300ms Command Throttling Guard ──
    if (now - lastNavTimestamp < NAV_THROTTLE_MS) return;
    lastNavTimestamp = now;
    lastUserToggleTimestamp = now;

    const { queue, currentIndex, isShuffle, shuffledIndices, repeatMode, currentTrack, positionMillis, durationMillis, currentContextName } = get();
    if (queue.length === 0) return;

    // Record skip signal for Music DNA if skipped early (< 25s)
    if (currentTrack && positionMillis < 25000 && (durationMillis || 0) > 45000) {
      musicDnaService.recordListeningSignal(currentTrack, 'skip').catch(() => { });
    }

    // 1. Repeat ONE mode: replay current track from beginning
    if (repeatMode === 'one' && currentTrack) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await get().seekTo(0);
      get().resumeTrack();
      return;
    }

    let nextIdx = -1;

    // 2. Shuffle mode
    if (isShuffle && shuffledIndices.length > 0) {
      const currentPosInShuffle = shuffledIndices.indexOf(currentIndex);
      if (currentPosInShuffle !== -1 && currentPosInShuffle < shuffledIndices.length - 1) {
        nextIdx = shuffledIndices[currentPosInShuffle + 1];
      } else {
        // End of shuffled list reached
        if (repeatMode === 'all') {
          nextIdx = shuffledIndices[0]; // Loop back to start
        } else {
          // Repeat OFF: try extending context radio
          const extended = await extendQueueWithContextRadio(get, set);
          const freshQueue = get().queue;
          if (extended && freshQueue.length > queue.length) {
            nextIdx = queue.length;
          } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            get().pauseTrack();
            await get().seekTo(0);
            return;
          }
        }
      }
    } else {
      // 3. Normal Sequential mode
      if (currentIndex < queue.length - 1 && currentIndex >= 0) {
        nextIdx = currentIndex + 1;
        // 🚀 Proactive YouTube Music Endless Radio: prefetch next batch when 3 or fewer tracks remain
        if (currentIndex >= queue.length - 3) {
          extendQueueWithContextRadio(get, set).catch(() => { });
        }
      } else {
        // End of queue reached
        if (repeatMode === 'all') {
          nextIdx = 0; // Wrap around to start
        } else {
          // 🚀 Context-Aware Queue Auto-Continuation: Extend dynamically based on context (Artist/Liked/Home/Search)
          const extended = await extendQueueWithContextRadio(get, set);
          const freshQueue = get().queue;
          if (extended && freshQueue.length > currentIndex + 1) {
            nextIdx = currentIndex + 1;
          } else {
            // Repeat OFF & truly no more tracks: gracefully stop at end of queue
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            get().pauseTrack();
            await get().seekTo(0);
            return;
          }
        }
      }
    }

    const activeQueue = get().queue;
    if (nextIdx >= 0 && nextIdx < activeQueue.length) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      set({ currentIndex: nextIdx });
      await get().playTrack(activeQueue[nextIdx], activeQueue, nextIdx, currentContextName || undefined);
    }
  },

  prevTrack: async () => {
    const now = Date.now();
    // ── 250ms Command Throttling Guard ──
    if (now - lastNavTimestamp < 250) return;
    lastNavTimestamp = now;
    lastUserToggleTimestamp = now;

    const { queue, currentIndex, positionMillis, isShuffle, shuffledIndices, repeatMode, currentContextName } = get();
    if (queue.length === 0) return;

    // Spotify Standard: If played >3 seconds, restart current track from 0
    if (positionMillis > 3000) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await get().seekTo(0);
      return;
    }

    let prevIdx = -1;

    // 1. Shuffle mode
    if (isShuffle && shuffledIndices.length > 0) {
      const currentPosInShuffle = shuffledIndices.indexOf(currentIndex);
      if (currentPosInShuffle > 0) {
        prevIdx = shuffledIndices[currentPosInShuffle - 1];
      } else {
        // At first song of shuffle
        if (repeatMode === 'all') {
          prevIdx = shuffledIndices[shuffledIndices.length - 1];
        } else {
          // Repeat OFF: restart from 0
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          await get().seekTo(0);
          return;
        }
      }
    } else {
      // 2. Normal Sequential mode
      if (currentIndex > 0) {
        prevIdx = currentIndex - 1;
      } else {
        // At index 0
        if (repeatMode === 'all') {
          prevIdx = queue.length - 1; // Wrap to end
        } else {
          // Repeat OFF: restart current song from 0
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          await get().seekTo(0);
          return;
        }
      }
    }

    if (prevIdx >= 0 && prevIdx < queue.length) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      set({ currentIndex: prevIdx });
      await get().playTrack(queue[prevIdx], queue, prevIdx, currentContextName || undefined);
    }
  },

  toggleShuffle: () => {
    const { isShuffle, queue } = get();
    if (!isShuffle) {
      const indices = Array.from({ length: queue.length }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      set({ isShuffle: true, shuffledIndices: indices });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      set({ isShuffle: false, shuffledIndices: [] });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  },

  toggleRepeat: () => {
    const { repeatMode } = get();
    let nextMode: RepeatMode = 'off';
    if (repeatMode === 'off') nextMode = 'all';
    else if (repeatMode === 'all') nextMode = 'one';
    else nextMode = 'off';

    set({ repeatMode: nextMode });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  toggleLike: async (track) => {
    if (!track?.videoId) return;
    const { activeUserId, likedTrackIds, guestLikedTracks } = get();
    const isLiked = likedTrackIds.includes(track.videoId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const newLikedIds = isLiked
      ? likedTrackIds.filter((id) => id !== track.videoId)
      : [...likedTrackIds, track.videoId];
    const newGuestTracks = isLiked
      ? guestLikedTracks.filter((t) => t.videoId !== track.videoId)
      : [track, ...guestLikedTracks.filter((t) => t.videoId !== track.videoId)];

    set({ likedTrackIds: newLikedIds, guestLikedTracks: newGuestTracks });
    AsyncStorage.setItem('@guest_liked_tracks', JSON.stringify(newLikedIds)).catch(() => { });
    AsyncStorage.setItem('@guest_liked_track_objects_v1', JSON.stringify(newGuestTracks)).catch(() => { });

    if (!activeUserId) {
      return;
    }

    musicDnaService.recordListeningSignal(track, isLiked ? 'unlike' : 'like').catch(() => { });

    try {
      if (isLiked) {
        await removeFirebaseLikedSong(activeUserId, track.videoId);
      } else {
        await addFirebaseLikedSong(activeUserId, track);
      }
    } catch (e) {
      // Keep local Favorite persisted cleanly even when offline or transient network error occurs
      console.warn('[AudioStore] Like sync failed:', e);
    }
  },

  togglePlay: async () => {
    const { isPlaying } = get();
    if (isPlaying) {
      get().pauseTrack();
    } else {
      await get().resumeTrack();
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  pauseTrack: () => {
    lastUserToggleTimestamp = Date.now();
    const { activeEngine } = get();
    pauseSilentBackgroundKeepAlive();
    if (activeEngine === 'native') {
      if (NativeModules.TrackPlayerModule) {
        try {
          TrackPlayer.pause();
        } catch { }
      } else {
        nativeAudioService.pause().catch(() => { });
      }
    } else if (activeEngine === 'youtube') {
      getActivePlayerBridge()?.pause?.();
    }

    set({
      isPlaying: false,
      isUserPauseAction: true,
      audioEngineAction: activeEngine === 'youtube' ? { type: 'pause', id: Date.now() } : null,
    });
    flushListeningSecondsToSupabase();
    const state = get();
    updateNowPlayingLockScreen(state.currentTrack, state.positionMillis, state.durationMillis, true);
  },

  resumeTrack: async () => {
    lastUserToggleTimestamp = Date.now();
    const { activeEngine, currentTrack, positionMillis, backgroundAudioEnabled } = get();
    if (!currentTrack) return;

    const hasValidYtId = Boolean(currentTrack.videoId && !currentTrack.videoId.startsWith('http') && currentTrack.videoId.length >= 5);

    if (activeEngine === 'native') {
      if (NativeModules.TrackPlayerModule) {
        try {
          const activeIdx = await TrackPlayer.getActiveTrackIndex();
          if (activeIdx === null || activeIdx === undefined) {
            const posSec = Math.max(0, Math.floor(positionMillis / 1000));
            const local = currentTrack.videoId
              ? await downloadService.getLocalTrack(currentTrack.videoId).catch(() => null)
              : null;
            const urlToLoad = local?.audioLocalUri || (!hasValidYtId ? currentTrack.audioUrl : undefined);
            if (urlToLoad) {
              const lockArt = getUniversalStudioArtwork(currentTrack.thumbnail, currentTrack.title, currentTrack.artist, currentTrack.videoId) || undefined;
              await startNativeEnginePlayback(currentTrack, urlToLoad, posSec, lockArt, Math.floor((currentTrack.duration || 180000) / 1000));
            } else if (hasValidYtId) {
              if (backgroundAudioEnabled) startSilentBackgroundKeepAlive().catch(() => { });
              set({
                activeEngine: 'youtube',
                isOfflinePlayback: false,
                isPlaying: true,
                isUserPauseAction: false,
                isLoading: false,
                loadingTrackId: null,
                audioEngineAction: { type: 'play', videoId: currentTrack.videoId, position: posSec, id: Date.now() },
              });
              return;
            }
          } else {
            await TrackPlayer.setVolume(1.0);
            await TrackPlayer.play();
          }
        } catch {
          try {
            await TrackPlayer.play();
          } catch { }
        }
      } else {
        // Expo Go: if nativeAudioService lost its player (e.g. previous 403/stop), self-heal back to YoutubePlayer
        if (nativeAudioService && hasValidYtId && !currentTrack.audioUrl?.startsWith('file://')) {
          const posSec = Math.max(0, Math.floor(positionMillis / 1000));
          if (backgroundAudioEnabled) startSilentBackgroundKeepAlive().catch(() => { });
          set({
            activeEngine: 'youtube',
            isOfflinePlayback: false,
            isPlaying: true,
            isUserPauseAction: false,
            isLoading: false,
            loadingTrackId: null,
            audioEngineAction: { type: 'play', videoId: currentTrack.videoId, position: posSec, id: Date.now() },
          });
          return;
        }
        nativeAudioService.resume().catch(() => { });
      }
    } else if (activeEngine === 'youtube') {
      if (backgroundAudioEnabled) {
        startSilentBackgroundKeepAlive().catch(() => { });
      }
      getActivePlayerBridge()?.play?.();
    }

    set({
      isPlaying: true,
      isUserPauseAction: false,
      audioEngineAction: activeEngine === 'youtube' ? { type: 'resume', id: Date.now() } : null,
    });
    const state = get();
    updateNowPlayingLockScreen(state.currentTrack, state.positionMillis, state.durationMillis, true);
  },

  seekTo: async (position) => {
    lastUserToggleTimestamp = Date.now();
    const validPos = Math.max(0, position);
    const { activeEngine } = get();
    if (activeEngine === 'native') {
      if (NativeModules.TrackPlayerModule) {
        try {
          await TrackPlayer.seekTo(validPos / 1000);
        } catch { }
      } else {
        nativeAudioService.seekTo(validPos).catch(() => { });
      }
    } else if (activeEngine === 'youtube') {
      getActivePlayerBridge()?.seekTo?.(validPos / 1000);
    }
    set({
      positionMillis: validPos,
      audioEngineAction: activeEngine === 'youtube' ? { type: 'seek', position: validPos / 1000, id: Date.now() } : null,
    });
    const state = get();
    updateNowPlayingLockScreen(state.currentTrack, validPos, state.durationMillis, true);
  },

  updateProgress: (pos, dur) => {
    const state = get();
    if (state.isPlaying && state.activeUserId) {
      const currentSec = Math.floor(pos / 1000);
      if (currentSec > 0 && currentSec !== lastReportedPlaybackSec) {
        const delta = (lastReportedPlaybackSec > 0 && currentSec > lastReportedPlaybackSec && currentSec - lastReportedPlaybackSec <= 5)
          ? currentSec - lastReportedPlaybackSec
          : 1;
        lastReportedPlaybackSec = currentSec;
        trackListeningSecond(state.activeUserId, delta);
      }
    }

    // Synchronize Lock Screen & Control Center position
    updateNowPlayingLockScreen(state.currentTrack, pos, dur);

    set((s) => ({
      positionMillis: pos,
      durationMillis: dur > 0 ? dur : s.durationMillis,
    }));
  },

  handleTrackEnded: async () => {
    const currentPos = get().positionMillis;
    const totalDuration = get().durationMillis;

    // Ignore ultra-early ad-end false positives (< 5s on tracks > 30s), but allow genuine track endings
    if (currentPos < 5000 && totalDuration > 30000) {
      console.log('[AudioStore] 🛡️ Ignored premature track-end (< 5s)...');
      return;
    }

    flushListeningSecondsToSupabase();
    const { repeatMode, currentTrack, activeEngine } = get();
    if (currentTrack) {
      musicDnaService.recordListeningSignal(currentTrack, 'complete').catch(() => { });
    }
    if (repeatMode === 'one' && currentTrack) {
      await get().seekTo(0);
      if (activeEngine === 'native') {
        await get().resumeTrack();
      } else {
        getActivePlayerBridge()?.play?.();
        set({
          audioEngineAction: {
            type: 'play',
            videoId: currentTrack.videoId,
            url: currentTrack.audioUrl,
            position: 0,
            id: Date.now(),
          },
          isPlaying: true,
          isUserPauseAction: false,
        });
      }
    } else {
      await get().nextTrack();
    }
  },

  upgradeTrackToNativeStream: async (streamUrl: string, startPositionSec: number, expectedVideoId?: string): Promise<boolean> => {
    const s = get();
    const targetTrack = s.currentTrack;
    if (!targetTrack || !targetTrack.videoId) return false;
    if (expectedVideoId && targetTrack.videoId !== expectedVideoId) return false;
    if (!s.isPlaying || s.isUserPauseAction) return false;

    const reqId = s.playRequestId;
    const lockArtwork = getUniversalStudioArtwork(targetTrack.thumbnail, targetTrack.title, targetTrack.artist, targetTrack.videoId) || undefined;
    const durationSec = s.durationMillis > 1000 ? Math.floor(s.durationMillis / 1000) : Math.floor((targetTrack.duration || 180000) / 1000);

    try {
      await startNativeEnginePlayback(targetTrack, streamUrl, startPositionSec, lockArtwork, durationSec);
      const latest = get();
      if (latest.playRequestId !== reqId || latest.currentTrack?.videoId !== targetTrack.videoId) {
        return false;
      }
      getActivePlayerBridge()?.pause?.();
      set({
        activeEngine: 'native',
        isLoading: false,
        loadingTrackId: null,
        isSwitchingToFallback: false,
        audioEngineAction: { type: 'stop', id: Date.now() },
      });
      return true;
    } catch {
      return false;
    }
  },

  handlePlaybackFallback: async (fallbackVideoId?: string, startPositionSec: number = 0) => {
    const { currentTrack, isSwitchingToFallback, playRequestId } = get();
    const targetTrack = currentTrack;
    if (!targetTrack || !targetTrack.videoId) return;

    const currentVid = fallbackVideoId || targetTrack.videoId;
    if (currentVid !== targetTrack.videoId) return;

    if (isSwitchingToFallback || fallbackInProgressVideoId === currentVid) {
      return;
    }

    fallbackInProgressVideoId = currentVid;
    set({
      isSwitchingToFallback: true,
      isLoading: true,
      loadingTrackId: currentVid,
    });

    try {
      // Only probe non-403 sources (local downloads / Piped parallel / converter) on fatal YouTube embed restriction
      const local = await downloadService.getLocalTrack(currentVid).catch(() => null);
      let resolvedUrl = local?.audioLocalUri || null;
      if (!resolvedUrl) {
        const { streamUrl } = await downloadService.probeAudioStream(targetTrack);
        resolvedUrl = streamUrl;
      }

      if (get().playRequestId !== playRequestId || get().currentTrack?.videoId !== targetTrack.videoId) {
        return;
      }

      if (resolvedUrl) {
        getActivePlayerBridge()?.pause?.();
        pauseSilentBackgroundKeepAlive();
        const lockArtwork = getUniversalStudioArtwork(targetTrack.thumbnail, targetTrack.title, targetTrack.artist, currentVid) || undefined;
        const durSec = get().durationMillis > 1000 ? Math.floor(get().durationMillis / 1000) : Math.floor((targetTrack.duration || 180000) / 1000);
        await startNativeEnginePlayback(targetTrack, resolvedUrl, startPositionSec, lockArtwork, durSec);

        if (get().playRequestId !== playRequestId) return;

        set({
          isPlaying: true,
          isLoading: false,
          loadingTrackId: null,
          isOfflinePlayback: resolvedUrl.startsWith('file://'),
          activeEngine: 'native',
          isSwitchingToFallback: false,
          audioEngineAction: { type: 'stop', id: Date.now() },
        });
        return;
      }
      throw new Error('No stream URL extracted');
    } catch (fallbackErr: any) {
      console.warn('[AudioStore] Embed fallback unavailable:', fallbackErr?.message);
      set({ isLoading: false, loadingTrackId: null, isSwitchingToFallback: false });
      ToastManager.show({
        title: 'تخطي مسار غير متاح',
        subtitle: 'جاري الانتقال للمسار التالي...',
        icon: 'alert-circle',
        duration: 1800,
      });
      get().nextTrack();
    } finally {
      if (fallbackInProgressVideoId === currentVid) {
        fallbackInProgressVideoId = null;
      }
    }
  },

  recoverFromNativeError: async () => {
    const state = get();
    const track = state.currentTrack;
    if (!track || state.activeEngine !== 'native') return;

    const recoveryKey = `${track.videoId || 't'}_${state.playRequestId}`;
    if (lastNativeErrorRecoveryKey === recoveryKey) {
      // Already attempted recovery on this request -> advance smoothly without freezing
      await state.nextTrack();
      return;
    }
    lastNativeErrorRecoveryKey = recoveryKey;

    const hasValidYtId = Boolean(track.videoId && !track.videoId.startsWith('http') && track.videoId.length >= 5);
    if (hasValidYtId) {
      const posSec = Math.max(0, Math.floor(state.positionMillis / 1000));
      if (state.backgroundAudioEnabled) {
        startSilentBackgroundKeepAlive().catch(() => { });
      }
      set({
        activeEngine: 'youtube',
        isOfflinePlayback: false,
        isPlaying: true,
        isUserPauseAction: false,
        isLoading: false,
        loadingTrackId: null,
        isSwitchingToFallback: false,
        audioEngineAction: {
          type: 'play',
          videoId: track.videoId,
          position: posSec,
          isOfflinePlayback: false,
          id: Date.now(),
        },
      });
      return;
    }

    set({ isPlaying: false, isLoading: false, loadingTrackId: null });
    await state.nextTrack();
  },

  stopTrack: async () => {
    flushListeningSecondsToSupabase();
    fallbackInProgressVideoId = null;
    lastNativeErrorRecoveryKey = null;
    beginTrackPlayerTransition(1000);
    stopSilentBackgroundKeepAlive();
    getActivePlayerBridge()?.pause?.();
    try {
      nativeAudioService.stop().catch(() => { });
    } catch (e) { }
    set({
      currentTrack: null,
      isPlaying: false,
      positionMillis: 0,
      durationMillis: 180000,
      activeEngine: 'youtube',
      isSwitchingToFallback: false,
      audioEngineAction: { type: 'stop', id: Date.now() },
    });
    if (NativeModules.TrackPlayerModule) {
      try {
        await TrackPlayer.stop();
        await TrackPlayer.reset();
      } catch (e) { }
    }
  }
}));

useAudioStore.subscribe((state) => {
  // ⚡ 1-Second Heartbeat Engine for continuous live music listening tracking
  if (state.isPlaying && state.activeUserId) {
    startListeningHeartbeat(state.activeUserId);
  } else {
    stopListeningHeartbeat();
  }
});

// Hydrate listening history and followed artists on startup
useAudioStore.getState().loadHistory();
useAudioStore.getState().loadFollowedArtists();
useAudioStore.getState().loadSavedCollections();
useAudioStore.getState().loadSavedLibraryTracks();
useAudioStore.getState().loadPlayerMediaMode();
