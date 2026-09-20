import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

// Key for recording whether this device has ever had an authenticated session
export const HAS_EVER_LOGGED_IN_KEY = '@a7flow_has_ever_logged_in';
export const PENDING_ACTIVITIES_KEY = '@a7flow_pending_offline_activities';

// Event bus for network state changes
type NetworkListener = (isOnline: boolean) => void;
const listeners: Set<NetworkListener> = new Set();

export const NetworkEventBus = {
  subscribe: (listener: NetworkListener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  emit: (isOnline: boolean) => {
    listeners.forEach((listener) => {
      try {
        listener(isOnline);
      } catch (e) {
        console.warn('[NetworkEventBus] Error in listener:', e);
      }
    });
  },
};

export interface NetworkState {
  isOnline: boolean;
  isConnected: boolean;
  isInternetReachable: boolean | null;
  connectionType: string;
  isAuthBlockedDueToNoNetwork: boolean;
  hasCachedSession: boolean;
  isCheckingPrerequisite: boolean;

  setNetworkState: (state: Partial<NetworkState>) => void;
  checkSessionAndNetwork: () => Promise<void>;
  recordSuccessfulLogin: () => Promise<void>;
}

// ── Dynamic NetInfo Loader ──
let NetInfoModule: any = null;
try {
  const mod = require('@react-native-community/netinfo');
  NetInfoModule = mod.default || mod;
} catch (e) {
  // Graceful fallback for non-native environments
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  isOnline: true,
  isConnected: true,
  isInternetReachable: true,
  connectionType: 'unknown',
  isAuthBlockedDueToNoNetwork: false,
  hasCachedSession: true,
  isCheckingPrerequisite: false,

  setNetworkState: (partial) => {
    const prevState = get();
    set(partial);

    // If connectivity state changed from offline -> online
    if (partial.isOnline !== undefined && partial.isOnline !== prevState.isOnline) {
      NetworkEventBus.emit(partial.isOnline);
      if (partial.isOnline) {
        // Automatically sync pending offline workouts
        syncPendingOfflineActivities().catch(() => {});
      }
    }
  },

  checkSessionAndNetwork: async () => {
    set({ isCheckingPrerequisite: true });
    try {
      // 1. Check cached session across storage sources
      const userToken = await AsyncStorage.getItem('userToken');
      const userData = await AsyncStorage.getItem('userData');
      const hasEver = await AsyncStorage.getItem(HAS_EVER_LOGGED_IN_KEY);
      
      let supabaseSessionExists = false;
      try {
        const { data } = await supabase.auth.getSession();
        supabaseSessionExists = Boolean(data?.session?.user);
      } catch (e) {
        // Offline or storage issue
      }

      const hasSession = Boolean(userToken || userData || hasEver === 'true' || supabaseSessionExists);

      // 2. Query hardware connectivity
      let online = get().isOnline;
      if (NetInfoModule?.fetch) {
        try {
          const state = await NetInfoModule.fetch();
          online = Boolean(state.isConnected && (state.isInternetReachable === null || state.isInternetReachable));
          set({
            isConnected: Boolean(state.isConnected),
            isInternetReachable: state.isInternetReachable,
            connectionType: state.type || 'unknown',
            isOnline: online,
          });
        } catch (e) {
          // fallback
        }
      }

      // Rule: If offline AND no cached session ever existed -> Hard Lock required!
      const shouldBlock = !online && !hasSession;

      set({
        hasCachedSession: hasSession,
        isAuthBlockedDueToNoNetwork: shouldBlock,
        isCheckingPrerequisite: false,
      });
    } catch (e) {
      console.warn('[NetworkService] Error checking session prerequisite:', e);
      set({ isCheckingPrerequisite: false });
    }
  },

  recordSuccessfulLogin: async () => {
    try {
      await AsyncStorage.setItem(HAS_EVER_LOGGED_IN_KEY, 'true');
      set({ hasCachedSession: true, isAuthBlockedDueToNoNetwork: false });
    } catch (e) {}
  },
}));

// ── Background Network Hardware Listener ──
let isListenerActive = false;
let netInfoUnsubscribe: (() => void) | null = null;

export function initNetworkMonitor() {
  if (isListenerActive) return;
  isListenerActive = true;

  if (NetInfoModule?.addEventListener) {
    netInfoUnsubscribe = NetInfoModule.addEventListener((state: any) => {
      const isConnected = Boolean(state.isConnected);
      const isReachable = state.isInternetReachable;
      // In offline / airplane mode: isConnected is false or isInternetReachable is false
      const isOnline = isConnected && (isReachable === null || isReachable);

      const store = useNetworkStore.getState();
      const wasOnline = store.isOnline;

      store.setNetworkState({
        isConnected,
        isInternetReachable: isReachable,
        connectionType: state.type || 'unknown',
        isOnline,
        // If network is restored, instantly unblock any initial lock
        ...(isOnline ? { isAuthBlockedDueToNoNetwork: false } : {}),
      });

      if (!wasOnline && isOnline) {
        console.log('[NetworkService] 🌐 Connection restored! Re-checking session & unlocking.');
        store.checkSessionAndNetwork();
      } else if (wasOnline && !isOnline) {
        console.log('[NetworkService] ⚠️ Device went OFFLINE. Activating Offline-First guard.');
        store.checkSessionAndNetwork();
      }
    });
  } else {
    // Lightweight HTTP health probe for web / fallback environments
    const checkInterval = setInterval(async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch('https://clients3.google.com/generate_204', {
          method: 'HEAD',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const isOnline = res.status === 204 || res.ok;
        useNetworkStore.getState().setNetworkState({ isOnline });
      } catch (e) {
        useNetworkStore.getState().setNetworkState({ isOnline: false });
      }
    }, 15000);

    netInfoUnsubscribe = () => clearInterval(checkInterval);
  }

  // Initial check on boot
  useNetworkStore.getState().checkSessionAndNetwork();
}

/**
 * 📦 Offline Workout Synchronization Engine
 * Automatically syncs activities created while offline once internet is restored.
 */
export async function syncPendingOfflineActivities(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ACTIVITIES_KEY);
    if (!raw) return;

    const pendingList: any[] = JSON.parse(raw);
    if (!Array.isArray(pendingList) || pendingList.length === 0) return;

    console.log(`[NetworkService] 🔄 Syncing ${pendingList.length} offline workout(s) to Supabase...`);

    const remaining: any[] = [];
    for (const activity of pendingList) {
      try {
        const { queued_at, ...cleanActivity } = activity;
        const { error } = await supabase.from('activities').insert(cleanActivity);
        if (error) {
          console.warn('[NetworkService] Failed to sync activity:', error);
          remaining.push(activity);
        }
      } catch (err) {
        remaining.push(activity);
      }
    }

    if (remaining.length === 0) {
      await AsyncStorage.removeItem(PENDING_ACTIVITIES_KEY);
      console.log('[NetworkService] ✅ All offline workouts successfully synced to Supabase!');
    } else {
      await AsyncStorage.setItem(PENDING_ACTIVITIES_KEY, JSON.stringify(remaining));
    }
  } catch (e) {
    console.warn('[NetworkService] Error in syncPendingOfflineActivities:', e);
  }
}

/**
 * 💾 Queue workout locally when offline
 */
export async function queueOfflineActivity(activityData: any): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ACTIVITIES_KEY);
    const existing: any[] = raw ? JSON.parse(raw) : [];
    existing.push({
      ...activityData,
      queued_at: new Date().toISOString(),
    });
    await AsyncStorage.setItem(PENDING_ACTIVITIES_KEY, JSON.stringify(existing));
    console.log('[NetworkService] 💾 Workout saved to local offline storage.');
  } catch (e) {
    console.error('[NetworkService] Failed to queue offline workout:', e);
  }
}
