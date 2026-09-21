import { create } from 'zustand';
import { NativeModules, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import TrackPlayer from 'react-native-track-player';
import { supabase } from '../lib/supabase';
import { getSocket } from '../lib/socket';
import { CURATED_TRACKS } from '../data/curatedMusic';
import { 
  trackListeningSecond, 
  flushListeningSecondsToSupabase, 
  startListeningHeartbeat, 
  stopListeningHeartbeat 
} from '../services/listeningTimeService';
import { configureAudioSession, updateNowPlayingLockScreen, getOrGenerateSilentAudioUri } from '../services/audioSessionService';
import { getUniversalStudioArtwork } from '../utils/artworkHelper';
import { ToastManager } from '../components/InAppToast';
import { musicDnaService } from '../services/musicDnaService';
import { downloadService } from '../services/downloadService';
import { nativeAudioService } from '../services/nativeAudioService';

const emitStatus = (userId: string | null, track: any, isPlaying: boolean) => {
  if (!userId) return;
  try {
    const socket = getSocket();
    if (!socket?.connected) return;

    socket.emit('update_status', {
      userId,
      videoId: isPlaying ? track?.videoId : null,
      title: isPlaying ? track?.title : null,
      artist: isPlaying ? track?.artist : null,
      thumbnail: isPlaying ? track?.thumbnail : null,
      isPlaying,
    });
  } catch (e) {}
};

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
}

export type RepeatMode = 'off' | 'all' | 'one';
export type AudioQuality = 'hd320' | 'standard' | 'saver';

export interface AudioEngineAction {
  type: 'play' | 'pause' | 'resume' | 'seek' | 'stop' | 'quality';
  videoId?: string;
  url?: string;
  position?: number; // in seconds
  quality?: 'hd1080' | 'hd720' | 'highres' | 'medium' | 'small';
  isOfflinePlayback?: boolean;
  id: number;
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

  // Route navigation tracking for dynamic UI and bar docking
  currentRouteName: string;
  setCurrentRouteName: (name: string) => void;

  // Followed artists engine (Persistent with AsyncStorage & Supabase)
  followedArtistIds: string[];
  followedArtists: { id: string; name: string; avatar: string }[];
  toggleFollowArtist: (artist: { id: string; name: string; avatar: string }) => Promise<void>;
  loadFollowedArtists: () => Promise<void>;

  // Mini-player suppression flag (e.g. for full-screen workout recording screens)
  isMiniPlayerSuppressed: boolean;
  setMiniPlayerSuppressed: (suppressed: boolean) => void;

  // Background Audio and Lock Screen Settings
  backgroundAudioEnabled: boolean;
  setBackgroundAudioEnabled: (enabled: boolean) => void;
  pauseTrack: () => void;
  resumeTrack: () => void;

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
  handlePlaybackFallback: (fallbackVideoId?: string) => Promise<void>;
}

let lastNavTimestamp = 0;
const NAV_THROTTLE_MS = 300;
let lastUserToggleTimestamp = Date.now();
let lastReportedPlaybackSec = 0;
let isAudioLoadingMutex = false;
let lastTrackRequestTimestamp = 0;
let loadingSafetyTimer: any = null;
let fallbackInProgressVideoId: string | null = null;

export const getLastUserToggleTimestamp = () => lastUserToggleTimestamp;
export const setLastUserToggleTimestamp = (ts: number = Date.now()) => {
  lastUserToggleTimestamp = ts;
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
  setCurrentRouteName: (name: string) => set({ currentRouteName: name }),
  backgroundAudioEnabled: true,
  setBackgroundAudioEnabled: (enabled: boolean) => {
    set({ backgroundAudioEnabled: enabled });
    AsyncStorage.setItem('@nouble_background_playback_pref', String(enabled)).catch(() => {});
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
        if (exists) {
          await supabase
            .from('user_followed_artists')
            .delete()
            .eq('user_id', activeUserId)
            .eq('artist_id', artist.id);
        } else {
          await supabase
            .from('user_followed_artists')
            .upsert({
              user_id: activeUserId,
              artist_id: artist.id,
              artist_name: artist.name,
              artist_avatar: artist.avatar,
              created_at: new Date().toISOString(),
            }, { onConflict: 'user_id,artist_id' });
        }
      } catch (e) {
        console.warn('[AudioStore] Supabase followed artists sync error:', e);
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
      const { data } = await supabase
        .from('music_likes')
        .select('video_id')
        .eq('user_id', userId);
      if (data) {
        set({ likedTrackIds: data.map((d: any) => d.video_id) });
      }
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

    // ── 0. Idempotent Play/Pause Guard ──
    // If clicking the same active track, toggle play/pause directly without reloading
    const isSameTrack = Boolean(
      state.currentTrack &&
      ((track.videoId && state.currentTrack.videoId === track.videoId) ||
       ((track as any).id && (state.currentTrack as any).id === (track as any).id))
    );

    if (isSameTrack && (!targetQueue.length || targetQueue === state.queue)) {
      await get().togglePlay();
      return;
    }

    // ── 1. Rapid Click Guard: Record timestamp, latest request supersedes ──
    const now = Date.now();
    lastTrackRequestTimestamp = now;

    set({ isLoading: true, loadingTrackId: track.videoId, positionMillis: 0 });

    // Safety timeout: 7 seconds auto-unlock to guarantee zero UI deadlock
    if (loadingSafetyTimer) clearTimeout(loadingSafetyTimer);
    loadingSafetyTimer = setTimeout(() => {
      const s = get();
      if (s.isLoading) {
        set({ isLoading: false, loadingTrackId: null });
      }
    }, 7000);

    try {
      const newRequestId = state.playRequestId + 1;
      lastUserToggleTimestamp = Date.now();
      
      // ── Context Queue & Index Calibration ──
      if (targetQueue.length > 0) {
        const foundIdx = (targetIndex >= 0 && targetIndex < targetQueue.length)
          ? targetIndex
          : targetQueue.findIndex(t => t.videoId === track.videoId);
        const resolvedIdx = foundIdx >= 0 ? foundIdx : 0;
        set({
          queue: targetQueue,
          currentQueue: targetQueue,
          currentIndex: resolvedIdx,
          currentContextName: resolvedContextName,
          queueContextName: resolvedContextName,
        });
      } else {
        // If no queue passed, check if track is in existing queue
        const existingIdx = state.queue.findIndex(t => t.videoId === track.videoId);
        if (existingIdx >= 0) {
          set({ currentIndex: existingIdx });
        } else {
          set({
            queue: [track],
            currentQueue: [track],
            currentIndex: 0,
            currentContextName: resolvedContextName || 'single',
            queueContextName: resolvedContextName || 'single',
          });
        }
      }

      // Instant 0ms Haptic Feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      let streamUrl: string | undefined = track.audioUrl;
      let finalTitle = track.title || 'Unknown Title';
      let finalArtist = track.artist || 'Unknown Artist';
      let finalArtwork = track.thumbnail;
      let totalDurationSec = track.duration ? Math.floor(track.duration / 1000) : 180;
      let isOffline = false;

      // ── Hardware Download Check (0ms latency, zero cellular data, works in Airplane Mode) ──
      try {
        const localTrack = await downloadService.getLocalTrack(track.videoId);
        if (localTrack && localTrack.audioLocalUri) {
          streamUrl = localTrack.audioLocalUri;
          isOffline = true;
          if (localTrack.artworkLocalUri) {
            finalArtwork = localTrack.artworkLocalUri;
          }
          console.log('[AudioStore] ⚡ Playing from local device storage:', streamUrl);
        }
      } catch (localErr) {
        console.warn('[AudioStore] Local track check non-fatal error:', localErr);
      }

      // If audioUrl is not specified and not a YouTube videoId, pick fallback stream
      if (!streamUrl && (!track.videoId || track.videoId.startsWith('http') || track.videoId.length < 5)) {
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

      // Reset fallback lock for new track
      fallbackInProgressVideoId = null;

      // If playing an offline local file, use nativeAudioService directly
      if (isOffline && streamUrl) {
        nativeAudioService.play(streamUrl, initialPosition, {
          title: finalTrack.title,
          artist: finalTrack.artist,
          artwork: getUniversalStudioArtwork(finalTrack.thumbnail) || undefined,
        }).catch((e: any) => {
          console.warn('[AudioStore] nativeAudioService play error:', e);
        });
      } else {
        nativeAudioService.stop().catch(() => {});
      }

      // Instant 0ms Optimistic UI Update in Store
      set({ 
        playRequestId: newRequestId,
        currentTrack: finalTrack,
        isPlaying: true,
        isLoading: false,
        loadingTrackId: null,
        isOfflinePlayback: isOffline,
        activeEngine: isOffline ? 'native' : 'youtube',
        isSwitchingToFallback: false,
        durationMillis: totalDurationSec * 1000,
        positionMillis: initialPosition * 1000,
        // Dispatch to GlobalAudioBridge only for online YouTube audio (never send local file:// to WebView)
        audioEngineAction: isOffline
          ? { type: 'stop', id: Date.now() }
          : {
              type: 'play',
              videoId: track.videoId,
              url: streamUrl,
              position: initialPosition,
              isOfflinePlayback: false,
              id: Date.now(),
            },
      });

      // Background Persistence & Native Audio Mode
      try {
        const currentHistory = get().history;
        const updatedHistory = [finalTrack, ...currentHistory.filter(t => t.videoId !== finalTrack.videoId)].slice(0, 30);
        set({ history: updatedHistory });
        AsyncStorage.setItem('@nouble_music_history', JSON.stringify(updatedHistory)).catch(() => {});
        musicDnaService.recordListeningSignal(finalTrack, 'play').catch(() => {});

        // Configure native audio session for background playback
        configureAudioSession(get().backgroundAudioEnabled);

        // Lock Screen NowPlaying sync (immediate force update)
        updateNowPlayingLockScreen(finalTrack, initialPosition * 1000, totalDurationSec * 1000, true);

        // One-time informational toast
        AsyncStorage.getItem('@nouble_bg_audio_toast_shown').then((shown) => {
          if (!shown) {
            AsyncStorage.setItem('@nouble_bg_audio_toast_shown', 'true').catch(() => {});
            setTimeout(() => {
              ToastManager.show({
                title: '🎵 الصوت يعمل في الخلفية',
                subtitle: 'الموسيقى تستمر بالعمل عند قفل الشاشة أو تصفح التطبيقات',
                icon: 'musical-notes',
                duration: 3500,
              });
            }, 1200);
          }
        }).catch(() => {});

        if (NativeModules.TrackPlayerModule) {
          try {
            await TrackPlayer.reset();
            const fallbackSilentUri = await getOrGenerateSilentAudioUri();

            // 🛡️ Exclusive Audio Bus Architecture:
            // When streaming online with WebView, TrackPlayer must ONLY run the silent loop anchor
            // with absolute volume ZERO (0) to eliminate any audio bus interference, phasing, or clipping.
            // When playing offline files natively, TrackPlayer volume is 1.0.
            const trackPlayerUri = isOffline
              ? (streamUrl || fallbackSilentUri)
              : fallbackSilentUri;

            await TrackPlayer.add({
              id: track.videoId || 'unknown',
              url: trackPlayerUri,
              title: finalTitle,
              artist: finalArtist,
              artwork: getUniversalStudioArtwork(finalTrack.thumbnail) || undefined,
              duration: totalDurationSec,
            });
            await TrackPlayer.setRepeatMode(1);
            if (isOffline) {
              await TrackPlayer.setVolume(1.0);
            } else {
              // Lock screen metadata anchor: mute native player completely to yield DAC exclusively to clean stream
              await TrackPlayer.setVolume(0);
            }
            await TrackPlayer.play();
          } catch (tpErr) {
            // Native TrackPlayer fallback is non-blocking
          }
        }
      } catch (error: any) {
        console.warn('[AudioStore] Background Play Error:', error);
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

    const { queue, currentIndex, isShuffle, shuffledIndices, repeatMode, currentTrack, positionMillis, durationMillis } = get();
    if (queue.length === 0) return;

    // Record skip signal for Music DNA if skipped early (< 25s)
    if (currentTrack && positionMillis < 25000 && (durationMillis || 0) > 45000) {
      musicDnaService.recordListeningSignal(currentTrack, 'skip').catch(() => {});
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
          // Repeat OFF: gracefully stop at end of queue
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          get().pauseTrack();
          await get().seekTo(0);
          return;
        }
      }
    } else {
      // 3. Normal Sequential mode
      if (currentIndex < queue.length - 1 && currentIndex >= 0) {
        nextIdx = currentIndex + 1;
      } else {
        // End of queue reached
        if (repeatMode === 'all') {
          nextIdx = 0; // Wrap around to start
        } else {
          // Repeat OFF: gracefully stop at end of queue
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          get().pauseTrack();
          await get().seekTo(0);
          return;
        }
      }
    }

    if (nextIdx >= 0 && nextIdx < queue.length) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      set({ currentIndex: nextIdx });
      await get().playTrack(queue[nextIdx]);
    }
  },

  prevTrack: async () => {
    const now = Date.now();
    // ── 250ms Command Throttling Guard ──
    if (now - lastNavTimestamp < 250) return;
    lastNavTimestamp = now;
    lastUserToggleTimestamp = now;

    const { queue, currentIndex, positionMillis, isShuffle, shuffledIndices, repeatMode } = get();
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
      await get().playTrack(queue[prevIdx]);
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
    const { activeUserId, likedTrackIds } = get();
    if (!activeUserId) return;

    const isLiked = likedTrackIds.includes(track.videoId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const newLikedIds = isLiked 
      ? likedTrackIds.filter(id => id !== track.videoId)
      : [...likedTrackIds, track.videoId];
    
    set({ likedTrackIds: newLikedIds });

    musicDnaService.recordListeningSignal(track, isLiked ? 'unlike' : 'like').catch(() => {});

    try {
      if (isLiked) {
        await supabase
          .from('music_likes')
          .delete()
          .eq('user_id', activeUserId)
          .eq('video_id', track.videoId);
      } else {
        await supabase
          .from('music_likes')
          .upsert({
            user_id: activeUserId,
            video_id: track.videoId,
            title: track.title,
            artist: track.artist,
            thumbnail: track.thumbnail,
            duration: Math.floor((track.duration || 0) / 1000)
          }, { onConflict: 'user_id,video_id' });
      }
    } catch (e) {
      set({ likedTrackIds });
      console.warn('[AudioStore] Like sync failed:', e);
    }
  },

  togglePlay: async () => {
    const { isPlaying, activeEngine } = get();
    const nextIsPlaying = !isPlaying;
    lastUserToggleTimestamp = Date.now();

    // ── Instant 0ms Haptic & Visual Toggle ──
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (activeEngine === 'native') {
      if (nextIsPlaying) {
        nativeAudioService.resume().catch(() => {});
      } else {
        nativeAudioService.pause().catch(() => {});
      }
    }

    set({ 
      isPlaying: nextIsPlaying,
      audioEngineAction: activeEngine === 'youtube' ? { 
        type: nextIsPlaying ? 'resume' : 'pause', 
        id: Date.now() 
      } : null,
    });

    if (!nextIsPlaying) {
      flushListeningSecondsToSupabase();
    }

    if (NativeModules.TrackPlayerModule) {
      try {
        if (nextIsPlaying) {
          await TrackPlayer.play();
        } else {
          await TrackPlayer.pause();
        }
      } catch(e) {}
    }
  },

  pauseTrack: () => {
    if (!get().isPlaying) return;
    lastUserToggleTimestamp = Date.now();
    const { activeEngine } = get();
    if (activeEngine === 'native') {
      nativeAudioService.pause().catch(() => {});
    }
    set({ 
      isPlaying: false,
      audioEngineAction: activeEngine === 'youtube' ? { type: 'pause', id: Date.now() } : null,
    });
    flushListeningSecondsToSupabase();
    const state = get();
    updateNowPlayingLockScreen(state.currentTrack, state.positionMillis, state.durationMillis, true);
    if (NativeModules.TrackPlayerModule) {
      try { TrackPlayer.pause(); } catch(e) {}
    }
  },

  resumeTrack: () => {
    if (get().isPlaying) return;
    lastUserToggleTimestamp = Date.now();
    const { activeEngine } = get();
    if (activeEngine === 'native') {
      nativeAudioService.resume().catch(() => {});
    }
    set({ 
      isPlaying: true,
      audioEngineAction: activeEngine === 'youtube' ? { type: 'resume', id: Date.now() } : null,
    });
    const state = get();
    updateNowPlayingLockScreen(state.currentTrack, state.positionMillis, state.durationMillis, true);
    if (NativeModules.TrackPlayerModule) {
      try { TrackPlayer.play(); } catch(e) {}
    }
  },

  seekTo: async (position) => {
    lastUserToggleTimestamp = Date.now();
    const validPos = Math.max(0, position);
    const { activeEngine } = get();
    if (activeEngine === 'native') {
      nativeAudioService.seekTo(validPos).catch(() => {});
    }
    set({ 
      positionMillis: validPos,
      audioEngineAction: activeEngine === 'youtube' ? { type: 'seek', position: validPos / 1000, id: Date.now() } : null,
    });
    const state = get();
    updateNowPlayingLockScreen(state.currentTrack, validPos, state.durationMillis, true);
    if (NativeModules.TrackPlayerModule) {
      try { await TrackPlayer.seekTo(validPos / 1000); } catch(e){}
    }
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
    flushListeningSecondsToSupabase();
    const { repeatMode, currentTrack } = get();
    if (currentTrack) {
      musicDnaService.recordListeningSignal(currentTrack, 'complete').catch(() => {});
    }
    if (repeatMode === 'one' && currentTrack) {
      await get().seekTo(0);
      set({ 
        audioEngineAction: {
          type: 'play',
          videoId: currentTrack.videoId,
          url: currentTrack.audioUrl,
          position: 0,
          id: Date.now(),
        },
        isPlaying: true,
      });
      if (NativeModules.TrackPlayerModule) {
        try {
          await TrackPlayer.seekTo(0);
          await TrackPlayer.play();
        } catch (e) {}
      }
    } else {
      await get().nextTrack();
    }
  },

  handlePlaybackFallback: async (fallbackVideoId?: string) => {
    const { currentTrack, isSwitchingToFallback, activeEngine } = get();
    const targetTrack = currentTrack;
    if (!targetTrack || !targetTrack.videoId) return;

    const currentVid = targetTrack.videoId;

    // 🛡️ Single Fallback Guard / Debounce:
    // Prevent duplicate calls for the same track and prevent infinite TrackPlayer.reset() loops
    if (isSwitchingToFallback || activeEngine === 'native' || fallbackInProgressVideoId === currentVid) {
      console.log('[AudioStore] 🛑 handlePlaybackFallback already triggered or activeEngine is native. Ignoring redundant trigger.');
      return;
    }

    fallbackInProgressVideoId = currentVid;
    set({
      isSwitchingToFallback: true,
      activeEngine: 'native',
      isLoading: true,
      loadingTrackId: currentVid,
    });

    console.log('[AudioStore] 🛡️ YouTube restriction detected. Handing over exclusively to Native Audio Engine (ExoPlayer/AVPlayer)...');
    try {
      // 1. Completely stop/silence the WebView player to free the Audio DAC and eliminate cascaded Error 4
      set({
        audioEngineAction: {
          type: 'stop',
          id: Date.now(),
        },
      });

      const { downloadService } = require('../services/downloadService');
      const { streamUrl } = await downloadService.probeAudioStream(targetTrack);

      if (streamUrl) {
        console.log('[AudioStore] ⚡ Direct stream/cache acquired, launching expo-av hardware player:', streamUrl);

        // 1. Immediately silence WebView to free Audio DAC and prevent any WebKit CORS blockage
        set({
          audioEngineAction: {
            type: 'stop',
            id: Date.now(),
          },
        });

        // 2. Play directly via native hardware engine (expo-video / AVPlayer / ExoPlayer)
        await nativeAudioService.play(streamUrl, 0, {
          title: targetTrack.title || 'Track',
          artist: targetTrack.artist || 'Artist',
          artwork: getUniversalStudioArtwork(targetTrack.thumbnail) || undefined,
        });

        // 3. Keep TrackPlayer in sync for Lock Screen / Control Center metadata if native module exists
        if (NativeModules.TrackPlayerModule) {
          try {
            await TrackPlayer.reset();
            const fallbackSilentUri = await getOrGenerateSilentAudioUri();
            await TrackPlayer.add({
              id: targetTrack.videoId || 'direct_stream',
              url: fallbackSilentUri,
              title: targetTrack.title || 'Track',
              artist: targetTrack.artist || 'Artist',
              artwork: getUniversalStudioArtwork(targetTrack.thumbnail) || undefined,
              duration: targetTrack.duration ? Math.floor(targetTrack.duration / 1000) : 180,
            });
            await TrackPlayer.setVolume(0);
            await TrackPlayer.play();
          } catch (tpErr) {
            console.warn('[AudioStore] TrackPlayer metadata sync error:', tpErr);
          }
        }

        set({
          isPlaying: true,
          isLoading: false,
          loadingTrackId: null,
          isOfflinePlayback: true,
          activeEngine: 'native',
          isSwitchingToFallback: false,
        });
        return;
      }
      throw new Error('No stream URL extracted');
    } catch (fallbackErr: any) {
      console.warn('[AudioStore] Direct stream fallback failed:', fallbackErr?.message);
      set({ isLoading: false, loadingTrackId: null, isSwitchingToFallback: false });
      ToastManager.show({
        title: 'تخطي مسار غير متاح',
        subtitle: 'جاري الانتقال للمسار التالي...',
        icon: 'alert-circle',
        duration: 1800,
      });
      get().nextTrack();
    }
  },

  stopTrack: async () => {
    flushListeningSecondsToSupabase();
    fallbackInProgressVideoId = null;
    try {
      nativeAudioService.stop().catch(() => {});
    } catch (e) {}
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
      } catch (e) {}
    }
  }
}));

// Realtime Presence Socket Subscription
let lastEmittedStatus = {
  isPlaying: false,
  videoId: null as string | null
};
let emitDebounceTimer: ReturnType<typeof setTimeout> | null = null;

useAudioStore.subscribe((state) => {
  // ⚡ 1-Second Heartbeat Engine for continuous live music listening tracking
  if (state.isPlaying && state.activeUserId) {
    startListeningHeartbeat(state.activeUserId);
  } else {
    stopListeningHeartbeat();
  }

  const currentVideoId = state.currentTrack?.videoId || null;

  if (state.isLoading) return;

  const hasChanged =
    state.isPlaying !== lastEmittedStatus.isPlaying ||
    currentVideoId !== lastEmittedStatus.videoId;

  if (!hasChanged) return;

  if (emitDebounceTimer) clearTimeout(emitDebounceTimer);
  emitDebounceTimer = setTimeout(() => {
    const latest = useAudioStore.getState();
    const latestVideoId = latest.currentTrack?.videoId || null;
    if (latest.isLoading) return;

    lastEmittedStatus = {
      isPlaying: latest.isPlaying,
      videoId: latestVideoId
    };

    emitStatus(latest.activeUserId, latest.currentTrack, latest.isPlaying);
  }, 400);
});

// Hydrate listening history and followed artists on startup
useAudioStore.getState().loadHistory();
useAudioStore.getState().loadFollowedArtists();
