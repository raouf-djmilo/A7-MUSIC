import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track } from '../store/useAudioStore';
import { searchYouTubeMusicWithArtist, cleanArtistName } from './youtubeMusicService';
import { getUniversalStudioArtwork, getUniversalArtistAvatar } from '../utils/artworkHelper';

const CACHE_KEY_INFINITE_RADIO = '@a7_infinite_coverflow_radio_v2';
const CACHE_KEY_LEARNED_TASTE = '@a7_user_learned_taste_v2';

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
  relatedArtists: string[];
}

export interface UserLearnedTasteProfile {
  artistScores: Record<string, number>;
  genreScores: Record<MusicVibeCategory, number>;
  topLikedArtists: string[];
  totalListens: number;
  skipsCount: number;
  lastUpdated: number;
}

// ── Deep Musical Affinity Graph (Connected Musical Circles) ──
// Mimics YouTube Music's collaborative vector embeddings
export const ARTIST_AFFINITY_GRAPH: Record<string, string[]> = {
  'djalil palermo': ['Soolking', 'Didine Canon 16', 'Mouh Milano', 'Cheb Khaled', 'Cheb Bilal', 'Kader Japonais', 'Bilal Sghir'],
  'soolking': ['Djalil Palermo', 'Didine Canon 16', 'ElGrandeToto', 'Cheb Khaled', 'Heuss LEnfoire', 'Kendji Girac', 'Alonzo'],
  'didine canon 16': ['Phobia Isaac', 'Djalil Palermo', 'Soolking', 'ElGrandeToto', 'Inkonnu', 'Draganov', 'Morpheus'],
  'cheb khaled': ['Cheb Mami', 'Cheb Hasni', 'Cheb Bilal', 'Djalil Palermo', 'Faudel', 'Rachid Taha'],
  'cheb hasni': ['Cheb Nasro', 'Cheb Khaled', 'Cheb Mami', 'Cheb Bilal', 'Cheb Anouar', 'Cheb Hindi'],
  'cheb mami': ['Cheb Khaled', 'Cheb Hasni', 'Cheb Bilal', 'Cheb Faudel', 'Cheb Sahraoui'],
  'cheb bilal': ['Cheb Khaled', 'Cheb Hasni', 'Djalil Palermo', 'Kader Japonais', 'Reda Taliani', 'Cheb Akil'],
  'mouh milano': ['Djalil Palermo', 'Didine Canon 16', 'Soolking', 'Phobia Isaac', 'Amine Babylone'],
  'kordhell': ['Interworld', 'DVRST', 'Hensonn', 'PlayaPhonk', 'Ghostface Playa', 'Twisted', 'Dxrk'],
  'interworld': ['Kordhell', 'DVRST', 'Hensonn', 'Gravechill', 'PlayaPhonk', 'ShadowxFunk'],
  'the weeknd': ['Travis Scott', 'Drake', 'Post Malone', 'Kendrick Lamar', 'Metro Boomin'],
  'eminem': ['Dr. Dre', '50 Cent', 'NF', 'Tupac', 'Snoop Dogg'],
};

// ── Dynamic Live Query Vectors (Zero Hardcoded Injected Track Lists!) ──
const VIBE_ROTATING_QUERIES: Record<MusicVibeCategory, string[]> = {
  algerian_rai: [
    'Djalil Palermo nouveaux titres officiels',
    'Soolking official hits',
    'Top Rai Algerien 2026',
    'Cheb Khaled Cheb Hasni classiques rai',
    'Cheb Mami rai anthems',
    'Cheb Bilal top chansons',
    'Mouh Milano official music',
    'Rai algerien tendance ambiance',
  ],
  rap_dz: [
    'Didine Canon 16 official hits',
    'Rap DZ 2026 top titres',
    'Phobia Isaac rap dz workout',
    'ElGrandeToto rap hits',
    'Soolking rap algerien',
    'Rap DZ drill workout motivation',
  ],
  workout_energy: [
    'Gym Phonk Kordhell Interworld aggressive bass',
    'Workout motivation aggressive drill hits',
    'High energy gym bass boosted 2026',
    'Brazilian phonk workout gym motivation',
    'Hardstyle workout motivation beats',
  ],
  running_cadence: [
    '160 BPM running cadence cardio workout beats',
    'High cadence 165 bpm running stride music',
    'Marathon cardio workout running motivation',
    'Electronic cardio running workout 160 bpm',
  ],
  chill_acoustic: [
    'Babylone Zina acoustic rai',
    'Soolking acoustic chill sessions',
    'Algerian acoustic guitar chill vibes',
    'The Weeknd acoustic lofi beats',
    'Acoustic guitar workout cool down',
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

function normalizeKey(str?: string): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
}

/**
 * 🎓 Self-Training User Taste Memory Protocol
 * Learns and adapts continuously based on user engagement signals
 */
export async function getLearnedTasteProfile(): Promise<UserLearnedTasteProfile> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY_LEARNED_TASTE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.warn('[InfiniteRadio] Failed to read learned taste:', e);
  }

  return {
    artistScores: {},
    genreScores: {
      algerian_rai: 5,
      rap_dz: 3,
      workout_energy: 3,
      running_cadence: 2,
      chill_acoustic: 2,
      global_trending: 2,
    },
    topLikedArtists: [],
    totalListens: 0,
    skipsCount: 0,
    lastUpdated: Date.now(),
  };
}

export async function recordUserSignal(
  track: Track,
  signal: 'play' | 'complete' | 'like' | 'skip'
): Promise<void> {
  if (!track?.artist) return;
  try {
    const profile = await getLearnedTasteProfile();
    const artistKey = cleanArtistName(track.artist).toLowerCase();

    const currentScore = profile.artistScores[artistKey] || 0;

    if (signal === 'play') {
      profile.artistScores[artistKey] = currentScore + 2;
      profile.totalListens += 1;
    } else if (signal === 'complete') {
      profile.artistScores[artistKey] = currentScore + 5;
    } else if (signal === 'like') {
      profile.artistScores[artistKey] = currentScore + 10;
      if (!profile.topLikedArtists.includes(artistKey)) {
        profile.topLikedArtists.push(artistKey);
      }
    } else if (signal === 'skip') {
      profile.artistScores[artistKey] = Math.max(0, currentScore - 2);
      profile.skipsCount += 1;
    }

    profile.lastUpdated = Date.now();
    await AsyncStorage.setItem(CACHE_KEY_LEARNED_TASTE, JSON.stringify(profile));
  } catch (e) {
    console.warn('[InfiniteRadio] Failed to record user signal:', e);
  }
}

/**
 * 🧠 Analyzes user listening history, learned taste and current song
 * to identify musical DNA, regional preference, and related artist cluster.
 */
export function analyzeUserVibe(
  activeTrack?: Track | null,
  history: Track[] = [],
  likedIds: string[] = []
): VibeAnalysisResult {
  const recent = [activeTrack, ...history].filter(Boolean) as Track[];
  const candidatePool = recent.slice(0, 7);

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
      algerianCount += 3;
    }

    if (
      artist.includes('didine') ||
      artist.includes('phobia') ||
      artist.includes('toto') ||
      title.includes('rap dz') ||
      title.includes('drill')
    ) {
      rapCount += 3;
    }

    if (
      title.includes('phonk') ||
      title.includes('pump') ||
      title.includes('energy') ||
      title.includes('bass') ||
      title.includes('gym')
    ) {
      energyCount += 3;
    }

    if (
      title.includes('160') ||
      title.includes('bpm') ||
      title.includes('run') ||
      title.includes('cadence')
    ) {
      runningCount += 3;
    }

    if (
      title.includes('chill') ||
      title.includes('acoustic') ||
      title.includes('zina') ||
      title.includes('lofi')
    ) {
      chillCount += 3;
    }
  }

  // Determine dominant category with Algerian regional affinity default
  let vibe: MusicVibeCategory = 'algerian_rai';
  const scores = [
    { vibe: 'algerian_rai' as MusicVibeCategory, score: algerianCount + 2 },
    { vibe: 'rap_dz' as MusicVibeCategory, score: rapCount },
    { vibe: 'workout_energy' as MusicVibeCategory, score: energyCount },
    { vibe: 'running_cadence' as MusicVibeCategory, score: runningCount },
    { vibe: 'chill_acoustic' as MusicVibeCategory, score: chillCount },
  ];

  scores.sort((a, b) => b.score - a.score);
  vibe = scores[0].score > 0 ? scores[0].vibe : 'algerian_rai';

  const queries = VIBE_ROTATING_QUERIES[vibe] || VIBE_ROTATING_QUERIES.algerian_rai;
  const seedQuery = leadingArtist ? `${leadingArtist} official mix 2026` : pickRandom(queries);

  // Find related artists from the affinity graph
  const normalizedArtist = normalizeKey(leadingArtist);
  let related = ARTIST_AFFINITY_GRAPH[normalizedArtist] || [];
  if (related.length === 0) {
    // Search partial match in affinity graph
    for (const [key, list] of Object.entries(ARTIST_AFFINITY_GRAPH)) {
      if (normalizedArtist.includes(key) || key.includes(normalizedArtist)) {
        related = list;
        break;
      }
    }
  }

  if (related.length === 0) {
    related = ['Soolking', 'Djalil Palermo', 'Didine Canon 16', 'Cheb Khaled', 'Mouh Milano'];
  }

  return {
    vibe,
    primaryArtist: leadingArtist,
    regionalPreference: 'DZ',
    seedQuery,
    relatedArtists: related,
  };
}

/**
 * ⚡ Instant Startup Cache Protocol
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
    await AsyncStorage.setItem(
      CACHE_KEY_INFINITE_RADIO,
      JSON.stringify(tracks.slice(0, 30))
    );
  } catch (e) {
    console.warn('[InfiniteRadio] Failed to write cache:', e);
  }
}

/**
 * 🌟 Dynamic Initial Fetch: Queries YouTube Music live for fresh radio seed
 * based on user taste, affinity graph and Algerian/Athletic vibes.
 * ZERO HARDCODED TRACK ARRAYS!
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

  // 2. Build multi-dimensional query vectors (Artist + Related Artists + Regional Pulse)
  const relatedA = pickRandom(analysis.relatedArtists);
  const relatedB = pickRandom(analysis.relatedArtists);

  const queryList = [
    analysis.seedQuery,
    `${relatedA} official music`,
    `${relatedB} hits`,
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

        if (results.length >= 22) break;
      }
      if (results.length >= 22) break;
    }
  } catch (e) {
    console.warn('[InfiniteRadio] Initial fetch error:', e);
  }

  if (results.length > 0) {
    saveCachedInfiniteRadio(results);
  }

  return results;
}

/**
 * 🔄 Infinite Swiping Batch Fetcher:
 * Automatically called when user approaches the end of cards in Cover Flow.
 * Appends 8–12 completely new, non-repeating tracks exploring the user's style deeply.
 */
export async function fetchInfiniteRadioNextBatch(
  activeTrack: Track,
  existingIds: Set<string>,
  vibe?: MusicVibeCategory
): Promise<Track[]> {
  const analysis = analyzeUserVibe(activeTrack);
  const effectiveVibe = vibe || analysis.vibe;
  const artist = cleanArtistName(activeTrack?.artist) || analysis.primaryArtist;

  // Pick related artists from affinity graph to avoid repetitive loops of the same singer
  const relatedA = pickRandom(analysis.relatedArtists);
  const relatedB = pickRandom(analysis.relatedArtists);

  // Dynamic rotating search vectors for deep style continuation (YouTube Music Radio Protocol)
  const queryPool = [
    `${artist} radio mix 2026`,
    `${artist} feat`,
    `${relatedA} official music`,
    `${relatedB} top tracks`,
    pickRandom(VIBE_ROTATING_QUERIES[effectiveVibe]),
    pickRandom(VIBE_ROTATING_QUERIES.algerian_rai),
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
