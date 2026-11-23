import * as Haptics from 'expo-haptics';
import { useAudioStore, Track } from '../../../store/useAudioStore';
import { MoodCluster } from '../../../services/musicDnaService';
import { CURATED_TRACKS } from '../../../data/curatedMusic';
import { supabase } from '../../../lib/supabase';

/**
 * 🎵 Audio Bridge Engine
 * Pure logic bridge that triggers playback actions directly on useAudioStore.getState()
 * without subscribing components to playback state (0 re-renders).
 */
export class AudioBridgeEngine {
  public static playSong(
    track: Track,
    contextQueue: Track[] = [],
    contextName: string = 'home'
  ) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const store = useAudioStore.getState();
    const idx = contextQueue.findIndex((t) => t.videoId === track.videoId);
    store.playTrack(track, contextQueue, idx >= 0 ? idx : 0, contextName);
    store.setPlayerModalVisible(true);
  }

  public static playMix(cluster: MoodCluster) {
    const playList =
      cluster.tracks && cluster.tracks.length > 0 ? cluster.tracks : CURATED_TRACKS;
    if (!playList || playList.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const store = useAudioStore.getState();
    store.playTrack(playList[0], playList, 0, cluster.title || cluster.id);
    store.setPlayerModalVisible(true);
  }

  public static async playLikedSongs(
    userId: string | null | undefined,
    fallbackQueue: Track[] = []
  ) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const store = useAudioStore.getState();
    const likedSet = new Set(store.likedTrackIds);
    let likedTracks = store.history.filter((t) => likedSet.has(t.videoId));

    if (likedTracks.length === 0 && userId) {
      try {
        const { data } = await supabase
          .from('music_likes')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (data && data.length > 0) {
          likedTracks = data.map((d: any): Track => ({
            videoId: d.video_id,
            title: d.title,
            artist: d.artist || 'Artist',
            thumbnail: d.thumbnail,
            duration: (d.duration || 0) * 1000,
          }));
        }
      } catch (e) {
        console.warn('[AudioBridge] Fetch liked tracks failed:', e);
      }
    }

    if (likedTracks.length > 0) {
      store.playTrack(likedTracks[0], likedTracks, 0, 'Liked Songs');
      store.setPlayerModalVisible(true);
    } else if (fallbackQueue.length > 0) {
      store.playTrack(fallbackQueue[0], fallbackQueue, 0, 'Liked Anthems');
      store.setPlayerModalVisible(true);
    } else {
      store.playTrack(CURATED_TRACKS[0], CURATED_TRACKS, 0, 'Top Anthems');
      store.setPlayerModalVisible(true);
    }
  }

  public static togglePlay() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    useAudioStore.getState().togglePlay();
  }
}
