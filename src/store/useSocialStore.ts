import { create } from 'zustand';
import { apiClient } from '../config/api';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface FriendActivity {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  isOnline: boolean;
  isListening: boolean;
  currentTrack: {
    videoId: string;
    title: string;
    artist: string;
    thumbnail: string | null;
    isPlaying: boolean;
  } | null;
}

interface SocialState {
  friends: FriendActivity[];
  isFetching: boolean;
  // Actions
  fetchFriendsActivity: (userId: string) => Promise<void>;
  applyFriendStatusUpdate: (update: {
    userId: string;
    full_name?: string;
    username?: string;
    avatar_url?: string | null;
    videoId: string | null;
    title: string | null;
    artist: string | null;
    thumbnail: string | null;
    isPlaying: boolean;
  }) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────
// ── Throttle: prevent hammering the friends-activity endpoint ────────────────
// Will only run once per 30 seconds per userId.
// Pass forceRefresh=true to bypass (e.g. when app returns from background).
const lastFetchTime: Record<string, number> = {};
const FETCH_THROTTLE_MS = 30_000;

export const useSocialStore = create<SocialState>((set, get) => ({
  friends: [],
  isFetching: false,

  // Fetches friends list + their current activity from the server REST endpoint
  fetchFriendsActivity: async (userId: string, forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && now - (lastFetchTime[userId] ?? 0) < FETCH_THROTTLE_MS) {
      return; // ✅ Throttled: skip this call
    }
    lastFetchTime[userId] = now;

    try {
      set({ isFetching: true });
      const res = await apiClient.get(`/social/friends-activity/${userId}`);
      if (res?.success) {
        // Defensive: filter duplicates by ID just in case
        const uniqueFriends = res.friends.filter((v: FriendActivity, i: number, a: FriendActivity[]) =>
          a.findIndex(t => t.id === v.id) === i
        );
        set({ friends: uniqueFriends });
      }
    } catch (e) {
      console.log('[SocialStore] fetchFriendsActivity error:', e);
    } finally {
      set({ isFetching: false });
    }
  },

  // ─── STRICT UPDATE: Only update friends already in the list from DB ─────────
  // POLICY: If userId is NOT in friends[], silently ignore. No strangers added.
  applyFriendStatusUpdate: (update) => {
    set(state => {
      const existingIndex = state.friends.findIndex(
        f => String(f.id) === String(update.userId)
      );

      // ✅ Not in DB friends list → silently ignore (blocks all strangers)
      if (existingIndex === -1) return state;

      const updatedFriends = state.friends.map(friend => {
        if (String(friend.id) !== String(update.userId)) return friend;
        return {
          ...friend,
          isOnline: true,
          isListening: update.isPlaying,
          currentTrack: update.isPlaying && update.videoId
            ? {
                videoId: update.videoId,
                title: update.title ?? '',
                artist: update.artist ?? '',
                thumbnail: update.thumbnail,
                isPlaying: true,
              }
            : null,
        };
      });

      // Re-sort: listening first, then online, then offline
      updatedFriends.sort((a, b) => {
        if (a.isListening && !b.isListening) return -1;
        if (!a.isListening && b.isListening) return 1;
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return 0;
      });

      return { friends: updatedFriends };
    });
  },
}));
