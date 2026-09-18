import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { connectSocket, getSocket } from '../lib/socket';
import { useAuth } from './AuthProvider';
import { useSocialStore } from '../store/useSocialStore';

// ─── Types ────────────────────────────────────────────────────────────────────
type PresenceContextType = {
  onlineUsers: Set<string>;
};

const PresenceContext = createContext<PresenceContextType>({
  onlineUsers: new Set(),
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export const PresenceProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // ── Stable refs so listeners never go stale ───────────────────────────────
  const userIdRef = useRef<string | null>(null);
  const fetchFriendsRef = useRef<(id: string) => void>(() => {});
  const applyUpdateRef = useRef<(d: any) => void>(() => {});

  // Keep refs up to date without causing re-renders
  const fetchFriendsActivity = useSocialStore(s => s.fetchFriendsActivity);
  const applyFriendStatusUpdate = useSocialStore(s => s.applyFriendStatusUpdate);
  fetchFriendsRef.current = fetchFriendsActivity;
  applyUpdateRef.current = applyFriendStatusUpdate;

  // ── STEP 1: Set up socket listeners ONCE for the lifetime of the app ──────
  // Using a stable ref-based approach: listeners are created once,
  // but always read the latest userId/callbacks from refs.
  useEffect(() => {
    const socket = connectSocket();

    // ── Registration: fires on every (re)connect ──────────────────────────
    const onConnect = () => {
      const uid = userIdRef.current;
      if (!uid) return;
      console.log(`[Presence] (Re)connected → registering user ${uid}`);
      socket.emit('register_user', uid);
      fetchFriendsRef.current(uid);
    };

    // ── Friend pulse update ───────────────────────────────────────────────
    const onFriendStatusUpdate = (data: {
      userId: string;
      videoId: string | null;
      title: string | null;
      artist: string | null;
      thumbnail: string | null;
      isPlaying: boolean;
    }) => {
      if (!userIdRef.current) return;
      // Safety: never process our own status
      if (String(data.userId) === userIdRef.current) return;
      console.log(`[Presence] friend_status_update from user ${data.userId}, isPlaying: ${data.isPlaying}`);
      applyUpdateRef.current(data);
    };

    // ── Online/Offline presence ───────────────────────────────────────────
    const onUserOnline = (incomingId: string) => {
      setOnlineUsers(prev => new Set(prev).add(String(incomingId)));
    };
    const onUserOffline = (incomingId: string) => {
      const sid = String(incomingId);
      setOnlineUsers(prev => { const n = new Set(prev); n.delete(sid); return n; });
      applyUpdateRef.current({ userId: sid, videoId: null, title: null, artist: null, thumbnail: null, isPlaying: false });
    };

    socket.on('connect', onConnect);
    socket.on('friend_status_update', onFriendStatusUpdate);
    socket.on('user_online', onUserOnline);
    socket.on('user_offline', onUserOffline);

    // If already connected when mounted, register immediately
    if (socket.connected && userIdRef.current) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('friend_status_update', onFriendStatusUpdate);
      socket.off('user_online', onUserOnline);
      socket.off('user_offline', onUserOffline);
    };
  }, []); // ✅ ONCE — listeners are stable via refs

  // ── STEP 2: React to user login/logout ───────────────────────────────────
  useEffect(() => {
    if (!user?.id) {
      userIdRef.current = null;
      setOnlineUsers(new Set());
      return;
    }

    const userId = String(user.id);
    // ✅ Only act if user actually changed
    if (userIdRef.current === userId) return;
    userIdRef.current = userId;

    const socket = getSocket();
    if (socket.connected) {
      console.log(`[Presence] User changed → registering user ${userId}`);
      socket.emit('register_user', userId);
      fetchFriendsRef.current(userId);
    }
    // If not connected, the 'connect' handler in Step 1 will register once ready
  }, [user?.id]); // ✅ Only re-runs on actual user change

  // ── STEP 3: Re-sync when app returns from background ─────────────────────
  useEffect(() => {
    const appStateRef = { current: AppState.currentState };

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      appStateRef.current = nextState;

      if (wasBackground && nextState === 'active') {
        const uid = userIdRef.current;
        const socket = getSocket();
        if (uid && socket.connected) {
          console.log('[Presence] App foregrounded → force re-syncing');
          fetchFriendsRef.current(uid, true); // forceRefresh: bypass throttle
        }
      }
    });

    return () => sub.remove();
  }, []); // ✅ ONCE

  return (
    <PresenceContext.Provider value={{ onlineUsers }}>
      {children}
    </PresenceContext.Provider>
  );
};

export const usePresence = () => useContext(PresenceContext);
