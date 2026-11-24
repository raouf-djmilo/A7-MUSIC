import type { Track } from '../../../store/useAudioStore';
import type { HomeTrack } from '../types/home.types';

/**
 * Strips decorative emojis from track titles for clean Apple Music typography.
 */
export const cleanCardText = (str?: string): string => {
  if (!str) return '';
  return str
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
    .trim();
};

/**
 * Resolves an unbounded virtual carousel position into a valid circular array index.
 */
export const wrapCircularIndex = (index: number, length: number): number => {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
};

/**
 * Computes the shortest signed delta between two indices on a circular track list.
 */
export const shortestCircularDelta = (
  fromVirtualIndex: number,
  targetArrayIndex: number,
  length: number
): number => {
  if (length <= 0) return 0;
  const currentWrapped = wrapCircularIndex(fromVirtualIndex, length);
  let delta = targetArrayIndex - currentWrapped;
  if (delta > length / 2) delta -= length;
  if (delta < -length / 2) delta += length;
  return delta;
};

/**
 * Builds the initial Home queue prioritizing the active playing track and recent history.
 */
export const buildInitialHomeQueue = (
  activeTrack: Track | null,
  history: Track[]
): HomeTrack[] => {
  const result: HomeTrack[] = [];
  const seenIds = new Set<string>();

  const addTrack = (t?: Track | null) => {
    if (!t) return;
    const vid = t.videoId || (t as HomeTrack).id;
    if (!vid || seenIds.has(vid)) return;
    seenIds.add(vid);
    result.push({
      ...t,
      id: vid,
      videoId: vid,
      duration: t.duration || 180000,
    });
  };

  if (activeTrack) addTrack(activeTrack);

  if (history && history.length > 0) {
    history.slice(0, 15).forEach(addTrack);
  }

  return result;
};
