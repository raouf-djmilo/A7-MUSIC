import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const LISTENING_TIME_CACHE_KEY = '@nouble_listening_seconds_';

type ListeningTimeListener = (totalSeconds: number) => void;
const listeners = new Set<ListeningTimeListener>();

let pendingDeltaSeconds = 0;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let storageSaveCounter = 0;
let activeUserId: string | null = null;
let lastKnownTotal = 0;

/**
 * Derives and formats listening time into hours and minutes
 * e.g., 67500s (1125m) -> "18h 45m", 7500s -> "2h 05m", 125m, 45s -> "1m", 0s -> "0m"
 */
export const formatListeningTime = (totalSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  if (safeSeconds === 0) return '0m';
  if (safeSeconds < 60) return '1m';

  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    const paddedMins = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hours}h ${paddedMins}m`;
  }
  return `${minutes}m`;
};

/**
 * Register listener for live listening time changes (used by ProfileTab)
 */
export const subscribeListeningTime = (listener: ListeningTimeListener) => {
  listeners.add(listener);
  // Immediately emit latest known total so profile shows current count on mount
  listener(lastKnownTotal);
  return () => {
    listeners.delete(listener);
  };
};

const notifyListeners = (total: number) => {
  lastKnownTotal = total;
  listeners.forEach((listener) => {
    try {
      listener(total);
    } catch (e) {}
  });
};

/**
 * Load total listening seconds from Supabase profile, falling back to local cache
 */
export const fetchTotalListeningSeconds = async (userId: string): Promise<number> => {
  if (!userId) return lastKnownTotal;
  activeUserId = userId;

  // 1. Immediately read cached value first to display instantaneously with 0ms delay
  try {
    const cached = await AsyncStorage.getItem(`${LISTENING_TIME_CACHE_KEY}${userId}`);
    if (cached) {
      const parsed = parseInt(cached, 10);
      if (!isNaN(parsed) && parsed > 0) {
        lastKnownTotal = parsed + pendingDeltaSeconds;
        notifyListeners(lastKnownTotal);
      }
    }
  } catch (e) {}

  // 2. Fetch fresh ground-truth from Supabase profiles table
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('total_listening_seconds')
      .eq('id', userId)
      .single();

    if (!error && data && typeof data.total_listening_seconds === 'number') {
      const dbTotal = Math.max(0, data.total_listening_seconds);
      // If DB total is greater or equal to cache, update cache
      if (dbTotal >= lastKnownTotal - pendingDeltaSeconds) {
        lastKnownTotal = dbTotal + pendingDeltaSeconds;
        await AsyncStorage.setItem(`${LISTENING_TIME_CACHE_KEY}${userId}`, String(lastKnownTotal));
        notifyListeners(lastKnownTotal);
        return lastKnownTotal;
      }
    }
  } catch (err) {
    // Supabase query failed; cached value remains active
  }

  return lastKnownTotal;
};

/**
 * Flush accumulated pending seconds to Supabase profiles table
 */
export const flushListeningSecondsToSupabase = async () => {
  if (!activeUserId || pendingDeltaSeconds <= 0) return;

  const deltaToFlush = pendingDeltaSeconds;
  pendingDeltaSeconds = 0;

  try {
    // 1. Read latest from profiles
    const { data, error } = await supabase
      .from('profiles')
      .select('total_listening_seconds')
      .eq('id', activeUserId)
      .single();

    const currentInDb = (!error && data && typeof data.total_listening_seconds === 'number')
      ? data.total_listening_seconds
      : (lastKnownTotal - deltaToFlush);

    const newTotal = currentInDb + deltaToFlush;

    // 2. Update profiles table
    await supabase
      .from('profiles')
      .update({
        total_listening_seconds: newTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeUserId);

    // 3. Cache locally
    await AsyncStorage.setItem(
      `${LISTENING_TIME_CACHE_KEY}${activeUserId}`,
      String(newTotal)
    );

    lastKnownTotal = newTotal;
    notifyListeners(newTotal);
  } catch (e) {
    // On failure, re-add delta to pending to flush on next opportunity
    pendingDeltaSeconds += deltaToFlush;
  }
};

/**
 * Increments listening seconds by delta and updates listeners
 */
export const trackListeningSecond = (userId: string, secondsDelta: number = 1) => {
  if (!userId) return;
  activeUserId = userId;
  pendingDeltaSeconds += secondsDelta;
  lastKnownTotal += secondsDelta;

  notifyListeners(lastKnownTotal);

  if (syncTimer) clearTimeout(syncTimer);
  // Debounce sync to Supabase every 15 seconds
  syncTimer = setTimeout(() => {
    flushListeningSecondsToSupabase();
  }, 15000);
};

/**
 * ⚡ Real-Time Heartbeat Timer (Interval 1s)
 * Runs continuously while music playback is active.
 */
export const startListeningHeartbeat = (userId: string) => {
  if (!userId) return;
  activeUserId = userId;

  if (heartbeatTimer) return; // Already running

  heartbeatTimer = setInterval(() => {
    if (!activeUserId) return;
    trackListeningSecond(activeUserId, 1);

    storageSaveCounter += 1;
    // Save to AsyncStorage every 10 seconds
    if (storageSaveCounter >= 10) {
      storageSaveCounter = 0;
      AsyncStorage.setItem(
        `${LISTENING_TIME_CACHE_KEY}${activeUserId}`,
        String(lastKnownTotal)
      ).catch(() => {});
    }
  }, 1000);
};

/**
 * Stops the Heartbeat Timer and flushes pending seconds
 */
export const stopListeningHeartbeat = () => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  storageSaveCounter = 0;
  flushListeningSecondsToSupabase();
};
