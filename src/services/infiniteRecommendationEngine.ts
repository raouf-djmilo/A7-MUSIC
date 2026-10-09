import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track } from '../store/useAudioStore';
import { searchYouTubeMusicWithArtist, cleanArtistName } from './youtubeMusicService';
import { getUniversalStudioArtwork, getUniversalArtistAvatar } from '../utils/artworkHelper';

const CACHE_KEY_INFINITE_RADIO = '@a7_infinite_coverflow_radio_v1';

export type MusicVibeCategory =
  | 'algerian_rai'
  | 'rap_dz'
  | 'workout_energy'
  | 'running_cadence'
  | 'chill_acoustic'
  | 'global_trending';

export interface VibeAnalysisResult {
  vibe: MusicVibeCategory;
  primaryArtist: string;
  regionalPreference: 'DZ' | 'GLOBAL';
  seedQuery: string;
}

// ── Curated Seed Vectors (Dynamic Live Queries, Not Hardcoded Injected Files!) ──
// These queries yield 100% fresh, live, real YouTube Music items dynamically
const VIBE_ROTATING_QUERIES: Record<MusicVibeCategory, string[]> = {
  algerian_rai: [
    'Djalil Palermo nouveaux titres officiels',
    'Soolking official hits',
    'Top Rai Algerien 2026',
    'Cheb Khaled Cheb Hasni classiques rai',
    'Cheb Mami rai anthems',
    'Cheb Bilal top chansons',
    'Mouh Milano official music',
  ],
  rap_dz: [
    'Didine Canon 16 official hits',
    'Rap DZ 2026 top titres',
    'Phobia Isaac rap dz workout',
    'ElGrandeToto rap hits',
    'Soolking rap algerien',
  ],
  workout_energy: [
    'Gym Phonk Kordhell Interworld aggressive bass',
    'Workout motivation aggressive drill hits',
    'High energy gym bass boosted 2026',
    'Brazilian phonk workout gym motivation',
  ],
  running_cadence: [
    '160 BPM running cadence cardio workout beats',
    'High cadence 165 bpm running stride music',
    'Marathon cardio workout running motivation',
  ],
  chill_acoustic: [
    'Babylone Zina acoustic rai',
    'Soolking acoustic chill sessions',
    'Algerian acoustic guitar chill vibes',
    'The Weeknd acoustic lofi beats',
  ],
  global_trending: [
    'The Weeknd top official hits',
    'Eminem workout motivation hits',
    'Travis Scott bass energy',
    'Top global hits 2026',
  ],
};

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffleList<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 🧠 Analyzes user listening history, liked tracks and current song
 * to identify musical DNA, regional preference and active vibe.
 */
export function analyzeUserVibe(
  activeTrack?: Track | null,
  history: Track[] = [],
  likedIds: string[] = []
): VibeAnalysisResult {
  const recent = [activeTrack, ...history].filter(Boolean) as Track[];
  const candidatePool = recent.slice(0, 5);

  let algerianCount = 0;
  let rapCount = 0;
  let energyCount = 0;
  let runningCount = 0;
  let chillCount = 0;

  let leadingArtist = activeTrack?.artist ? cleanArtistName(activeTrack.artist) : 'Djalil Palermo';

  for (const t of candidatePool) {
    const title = (t.title || '').toLowerCase();
    const artist = (t.artist || '').toLowerCase();

    if (
      artist.includes('khaled') ||
      artist.includes('palermo') ||
      artist.includes('soolking') ||
      artist.includes('hasni') ||
      artist.includes('mami') ||
      artist.includes('bilal') ||
      artist.includes('milano') ||
      title.includes('rai')
    ) {
      algerianCount += 2;
    }

    if (
      artist.includes('didine') ||
      artist.includes('phobia') ||
      artist.includes('toto') ||
      title.includes('rap dz') ||
      title.includes('drill')
    ) {
      rapCount += 2;
    }

    if (
      title.includes('phonk') ||
      title.includes('pump') ||
      title.includes('energy') ||
      title.includes('bass') ||
      title.includes('gym')
    ) {
      energyCount += 2;
    }

    if (
      title.includes('160') ||
      title.includes('bpm') ||
      title.includes('run') ||
      title.includes('cadence')
    ) {
      runningCount += 2;
    }

    if (
      title.includes('chill') ||
      title.includes('acoustic') ||
      title.includes('zina') ||
      title.includes('lofi')
    ) {
      chillCount += 2;
    }
  }

  // Determine dominant category
  let vibe: MusicVibeCategory = 'algerian_rai';
  const scores = [
    { vibe: 'algerian_rai' as MusicVibeCategory, score: algerianCount + 1 }, // default regional affinity
    { vibe: 'rap_dz' as MusicVibeCategory, score: rapCount },
    { vibe: 'workout_energy' as MusicVibeCategory, score: energyCount },
    { vibe: 'running_cadence' as MusicVibeCategory, score: runningCount },
    { vibe: 'chill_acoustic' as MusicVibeCategory, score: chillCount },
  ];

  scores.sort((a, b) => b.score - a.score);
  vibe = scores[0].vibe;

  const queries = VIBE_ROTATING_QUERIES[vibe] || VIBE_ROTATING_QUERIES.algerian_rai;
  const seedQuery = leadingArtist ? `${leadingArtist} official mix` : pickRandom(queries);

  return {
    vibe,
    primaryArtist: leadingArtist,
    regionalPreference: 'DZ',
    seedQuery,
  };
}

/**
 * ⚡ Loads initial dynamic recommendations (from cache for 0ms start, then live background refresh)
 */
export async function getCachedInfiniteRadio(): Promise<Track[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY_INFINITE_RADIO);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.warn('[InfiniteRadio] Failed to load cache:', e);
  }
  return null;
}

export async function saveCachedInfiniteRadio(tracks: Track[]): Promise<void> {
  try {
    if (!tracks || tracks.length === 0) return;
    // Cache the first 25 tracks to keep storage light and fast
    await AsyncStorage.setItem(
      CACHE_KEY_INFINITE_RADIO,
      JSON.stringify(tracks.slice(0, 25))
    );
  } catch (e) {
    console.warn('[InfiniteRadio] Failed to write cache:', e);
  }
}

/**
 * 🌟 Dynamic Initial Fetch: Queries YouTube Music for a fresh, live radio batch
 * tailored to user's taste and regional Algerian/Athletic preferences.
 */
export async function fetchInitialInfiniteRadio(
  activeTrack?: Track | null,
  history: Track[] = [],
  likedIds: string[] = []
): Promise<Track[]> {
  const analysis = analyzeUserVibe(activeTrack, history, likedIds);
  const seenIds = new Set<string>();
  const results: Track[] = [];

  // 1. Maintain active track in focal slot if provided
  if (activeTrack?.videoId) {
    seenIds.add(activeTrack.videoId);
    results.push(activeTrack);
  }

  // 2. Query YouTube Music for the primary artist mix & regional vibe
  const queryList = [
    analysis.seedQuery,
    pickRandom(VIBE_ROTATING_QUERIES[analysis.vibe]),
    pickRandom(VIBE_ROTATING_QUERIES.algerian_rai),
  ];

  try {
    const searchPromises = queryList.map((q) =>
      searchYouTubeMusicWithArtist(q).catch(() => ({ artist: null, tracks: [] }))
    );
    const searchResponses = await Promise.all(searchPromises);

    for (const res of searchResponses) {
      for (const t of res.tracks) {
        if (!t?.videoId || seenIds.has(t.videoId)) continue;
        seenIds.add(t.videoId);

        results.push({
          ...t,
          thumbnail: getUniversalStudioArtwork(t.thumbnail, t.title, t.artist),
          artistAvatar: t.artistAvatar || getUniversalArtistAvatar(null, t.artist),
        });

        if (results.length >= 20) break;
      }
      if (results.length >= 20) break;
    }
  } catch (e) {
    console.warn('[InfiniteRadio] Initial fetch error:', e);
  }

  // Persist discovery
  if (results.length > 0) {
    saveCachedInfiniteRadio(results);
  }

  return results;
}

/**
 * 🔄 Infinite Swiping Batch Fetcher:
 * Automatically called when user approaches the end of cards in Cover Flow.
 * Appends 8–12 completely new, non-repeating tracks matching the active vibe.
 */
export async function fetchInfiniteRadioNextBatch(
  activeTrack: Track,
  existingIds: Set<string>,
  vibe?: MusicVibeCategory
): Promise<Track[]> {
  const effectiveVibe = vibe || 'algerian_rai';
  const artist = cleanArtistName(activeTrack?.artist) || 'Soolking';

  // Dynamic rotating search vectors for YouTube Music Radio Continuation
  const queryPool = [
    `${artist} radio mix`,
    `${artist} similar songs`,
    pickRandom(VIBE_ROTATING_QUERIES[effectiveVibe]),
    pickRandom(VIBE_ROTATING_QUERIES.algerian_rai),
    pickRandom(VIBE_ROTATING_QUERIES.workout_energy),
  ];

  const selectedQuery = pickRandom(queryPool);
  const newTracks: Track[] = [];

  try {
    const res = await searchYouTubeMusicWithArtist(selectedQuery);
    for (const t of res.tracks) {
      if (!t?.videoId || existingIds.has(t.videoId)) continue;
      existingIds.add(t.videoId);

      newTracks.push({
        ...t,
        thumbnail: getUniversalStudioArtwork(t.thumbnail, t.title, t.artist),
        artistAvatar: t.artistAvatar || getUniversalArtistAvatar(null, t.artist),
      });

      if (newTracks.length >= 10) break;
    }
  } catch (err) {
    console.warn('[InfiniteRadio] Next batch fetch error:', err);
  }

  return newTracks;
}
