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
}

export type RepeatMode = 'off' | 'all' | 'one';
export type AudioQuality = 'hd320' | 'standard' | 'saver';

export interface AudioEngineAction {
  type: 'play' | 'pause' | 'resume' | 'seek' | 'stop' | 'quality';
  videoId?: string;
  url?: string;
  position?: number; // in seconds
  quality?: 'hd1080' | 'hd720' | 'highres' | 'medium' | 'small';
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
  currentIndex: number;
  currentContextName: string | null;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  shuffledIndices: number[];
  likedTrackIds: string[];
  preferredQuality: AudioQuality;
  history: Track[];

  // Mini-player suppression flag (e.g. for full-screen workout recording screens)
  isMiniPlayerSuppressed: boolean;
  setMiniPlayerSuppressed: (suppressed: boolean) => void;

  setPlayerModalVisible: (visible: boolean) => void;
  setActiveUserId: (userId: string | null) => void;
  fetchInitialLikes: (userId: string) => Promise<void>;
  loadHistory: () => Promise<void>;
  getUserTopVibe: () => { vibeName: string; query: string };
  playTrack: (track: Track, userId?: any, initialPosition?: number, contextQueue?: Track[]) => Promise<void>;
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
  updateProgress: (positionMillis: number, durationMillis: number) => void;
  handleTrackEnded: () => Promise<void>;
}

let lastNavTimestamp = 0;
const NAV_THROTTLE_MS = 300;
let lastUserToggleTimestamp = 0;
let lastReportedPlaybackSec = 0;

export const getLastUserToggleTimestamp = () => lastUserToggleTimestamp;

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
  queue: [],
  currentIndex: -1,
  currentContextName: null,
  isShuffle: false,
  repeatMode: 'off',
  shuffledIndices: [],
  likedTrackIds: [],
  preferredQuality: 'hd320',
  history: [],
  audioEngineAction: null,
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
  setActiveUserId: (userId) => set({ activeUserId: userId }),

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

  playTrack: async (track, userId, initialPosition = 0, contextQueue = []) => {
    const state = get();
    const finalUserId = userId || state.activeUserId;
    const newRequestId = state.playRequestId + 1;
    lastUserToggleTimestamp = Date.now();
    
    if (contextQueue.length > 0) {
      const idx = contextQueue.findIndex(t => t.videoId === track.videoId);
      set({ queue: contextQueue, currentIndex: idx >= 0 ? idx : 0 });
    }

    // ── 1. Instant 0ms Haptic Feedback ──
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    let streamUrl: string | undefined = track.audioUrl;
    let finalTitle = track.title || 'Unknown Title';
    let finalArtist = track.artist || 'Unknown Artist';
    let totalDurationSec = track.duration ? Math.floor(track.duration / 1000) : 180;

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
      thumbnail: track.thumbnail,
      duration: totalDurationSec * 1000,
      audioUrl: streamUrl,
    };

    // ── 2. Instant 0ms Optimistic UI Update in Store ──
    set({ 
      playRequestId: newRequestId,
      currentTrack: finalTrack,
      isPlaying: true,
      isLoading: false,
      loadingTrackId: null,
      durationMillis: totalDurationSec * 1000,
      positionMillis: initialPosition * 1000,
      // Dispatch to GlobalAudioBridge for YouTube / HTML5 audio
      audioEngineAction: {
        type: 'play',
        videoId: track.videoId,
        url: streamUrl,
        position: initialPosition,
        id: Date.now(),
      },
    });

    // ── 3. Background Persistence & Native Audio Mode ──
    try {
      const currentHistory = get().history;
      const updatedHistory = [finalTrack, ...currentHistory.filter(t => t.videoId !== finalTrack.videoId)].slice(0, 30);
      set({ history: updatedHistory });
      AsyncStorage.setItem('@nouble_music_history', JSON.stringify(updatedHistory)).catch(() => {});

      if (NativeModules.TrackPlayerModule) {
        try {
          await TrackPlayer.reset();
          await TrackPlayer.add({
            id: track.videoId,
            url: streamUrl,
            title: finalTitle,
            artist: finalArtist,
            artwork: finalTrack.thumbnail || undefined,
            duration: totalDurationSec,
          });
          await TrackPlayer.play();
        } catch (tpErr) {
          // Native TrackPlayer fallback is non-blocking
        }
      }
    } catch (error: any) {
      console.warn('[AudioStore] Background Play Error:', error);
    }
  },

  playAlbumContext: async (tracks, startIndex, contextName) => {
    set({ 
      queue: tracks, 
      currentIndex: startIndex, 
      currentContextName: contextName,
      isShuffle: false,
      shuffledIndices: [] 
    });
    await get().playTrack(tracks[startIndex], get().activeUserId, 0, tracks);
  },

  playAlbum: async (tracks: Track[], startIndex = 0) => {
    await get().playAlbumContext(tracks, startIndex, 'Album');
  },

  nextTrack: async () => {
    const now = Date.now();
    // ── 300ms Command Throttling Guard ──
    if (now - lastNavTimestamp < NAV_THROTTLE_MS) return;
    lastNavTimestamp = now;

    const { queue, currentIndex, isShuffle, shuffledIndices, repeatMode } = get();
    if (queue.length === 0) return;

    let nextIdx = -1;

    if (isShuffle && shuffledIndices.length > 0) {
      const currentPosInShuffle = shuffledIndices.indexOf(currentIndex);
      if (currentPosInShuffle !== -1 && currentPosInShuffle < shuffledIndices.length - 1) {
        nextIdx = shuffledIndices[currentPosInShuffle + 1];
      } else if (repeatMode === 'all') {
        nextIdx = shuffledIndices[0];
      }
    } else {
      if (currentIndex < queue.length - 1) {
        nextIdx = currentIndex + 1;
      } else if (repeatMode === 'all') {
        nextIdx = 0;
      }
    }

    if (nextIdx !== -1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      set({ currentIndex: nextIdx });
      await get().playTrack(queue[nextIdx]);
    }
  },

  prevTrack: async () => {
    const now = Date.now();
    // ── 300ms Command Throttling Guard ──
    if (now - lastNavTimestamp < NAV_THROTTLE_MS) return;
    lastNavTimestamp = now;

    const { queue, currentIndex, positionMillis, isShuffle, shuffledIndices } = get();
    if (queue.length === 0) return;
    
    // If more than 3 seconds in, restart track
    if (positionMillis > 3000) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await get().seekTo(0);
      return;
    }

    let prevIdx = -1;

    if (isShuffle && shuffledIndices.length > 0) {
      const currentPosInShuffle = shuffledIndices.indexOf(currentIndex);
      if (currentPosInShuffle > 0) {
        prevIdx = shuffledIndices[currentPosInShuffle - 1];
      }
    } else {
      if (currentIndex > 0) {
        prevIdx = currentIndex - 1;
      }
    }

    if (prevIdx !== -1) {
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
    const { isPlaying } = get();
    const nextIsPlaying = !isPlaying;
    lastUserToggleTimestamp = Date.now();

    // ── Instant 0ms Haptic & Visual Toggle ──
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    set({ 
      isPlaying: nextIsPlaying,
      audioEngineAction: { 
        type: nextIsPlaying ? 'resume' : 'pause', 
        id: Date.now() 
      },
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

  seekTo: async (position) => {
    set({ 
      positionMillis: position,
      audioEngineAction: { type: 'seek', position: position / 1000, id: Date.now() },
    });
    if (NativeModules.TrackPlayerModule) {
      try { await TrackPlayer.seekTo(position / 1000); } catch(e){}
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

    set((s) => ({
      positionMillis: pos,
      durationMillis: dur > 0 ? dur : s.durationMillis,
    }));
  },

  handleTrackEnded: async () => {
    flushListeningSecondsToSupabase();
    const { repeatMode, currentTrack } = get();
    if (repeatMode === 'one' && currentTrack?.audioUrl) {
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
    } else {
      await get().nextTrack();
    }
  },

  stopTrack: async () => {
    flushListeningSecondsToSupabase();
    set({ 
      currentTrack: null, 
      isPlaying: false, 
      positionMillis: 0, 
      durationMillis: 180000,
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

// Hydrate listening history on startup
useAudioStore.getState().loadHistory();
