import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { Track } from '../store/useAudioStore';
import {
  searchYouTubeMusic,
  cleanArtistName,
  extractGenuineArtist,
  isFakeArtistChannel,
} from './youtubeMusicService';
import { getUniversalStudioArtwork, getUniversalArtistAvatar } from '../utils/artworkHelper';

// ── Dynamic Rotating Seed Pools to Break Repetition ──
const SEED_POOLS = {
  cadence: [
    'running cadence 160 bpm',
    '160 bpm running cardio workout music',
    'running workout motivation 2026',
    'electronic cardio beats 160 bpm',
    'high cadence stride workout',
  ],
  chill: [
    'soolking acoustic chill official',
    'babylone zina acoustic rai',
    'the weeknd acoustic lofi beats',
    'algerian acoustic guitar chill',
    'cheb khaled acoustic guitar',
  ],
  energy: [
    'gym phonk kordhell interworld',
    'didine canon 16 workout motivation',
    'gym phonk aggressive bass boost',
    'drill workout bass boosted hits',
    'brazilian phonk workout gym aggressive',
  ],
  trending: [
    'djalil palermo nouveaux titres',
    'soolking official hits',
    'top rai algerien 2026',
    'cheb mami cheb hasni rai classics',
    'cheb khaled best anthems',
    'cheb bilal top chansons',
  ],
};

function pickRandomSeed(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ── Math & Cache Constants ──
const LAMBDA_DECAY = 0.05; // Half-life ~ 13.86 days
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6-Hour Time-To-Live
const CACHE_KEY_PREFIX = '@nouble_dna_';
const TELEMETRY_KEY_PREFIX = '@nouble_telemetry_';
const FEED_CACHE_KEY_PREFIX = '@nouble_dna_feed_';

export interface CachedDnaFeedPayload {
  timestamp: number;
  data: DynamicHomeSections;
}

export interface TrackTelemetry {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  duration?: number;
  plays: number;
  completions: number;
  skips: number;
  isLiked: boolean;
  lastPlayedTimestamp: number;
  bpm?: number;
  genreCluster?: 'cadence' | 'signature' | 'replay' | 'chill' | 'energy';
}

export interface MoodCluster {
  id: string;
  key: 'cadence' | 'signature' | 'replay' | 'chill' | 'energy';
  title: string;
  badgeColor: string;
  subtitle: string;
  artwork: string | null;
  tracks: Track[];
}

export interface DynamicHomeSections {
  quickJump: Track[];
  topMixes: MoodCluster[];
  pickedForYou: Track | null;
  favouriteArtists: { name: string; avatar: string; isOfficial?: boolean }[];
  recentlyPlayed: Track[];
  energyWorkout: Track[];
}

class MusicDnaEngine {
  private activeUserId: string = 'guest';
  private telemetryMap: Map<string, TrackTelemetry> = new Map();
  private isLoaded: boolean = false;
  private newPlaysSinceSync: number = 0;
  private cachedFeed: DynamicHomeSections | null = null;
  private lastFeedCachedAt: number = 0;
  private isDiscovering: boolean = false;

  public setUserId(userId: string | null) {
    const nextId = userId || 'guest';
    if (this.activeUserId !== nextId) {
      this.activeUserId = nextId;
      this.isLoaded = false;
      this.telemetryMap.clear();
      this.cachedFeed = null;
      this.lastFeedCachedAt = 0;
      this.loadLocalProfile();
    }
  }

  /**
   * Loads telemetry profile and last cached live discovery feed (0ms delay)
   */
  public async loadLocalProfile(): Promise<void> {
    if (this.isLoaded) return;
    try {
      const [telemetryRaw, feedRaw] = await Promise.all([
        AsyncStorage.getItem(`${TELEMETRY_KEY_PREFIX}${this.activeUserId}`),
        AsyncStorage.getItem(`${FEED_CACHE_KEY_PREFIX}${this.activeUserId}`),
      ]);

      if (telemetryRaw) {
        const parsed: TrackTelemetry[] = JSON.parse(telemetryRaw);
        this.telemetryMap.clear();
        parsed.forEach((t) => this.telemetryMap.set(t.videoId, t));
      }

      if (feedRaw) {
        try {
          const parsed = JSON.parse(feedRaw);
          if (parsed && typeof parsed === 'object' && 'data' in parsed && 'timestamp' in parsed) {
            this.cachedFeed = parsed.data;
            this.lastFeedCachedAt = Number(parsed.timestamp) || 0;
          } else {
            // Legacy unversioned cache backwards-compatibility
            this.cachedFeed = parsed;
            this.lastFeedCachedAt = Date.now();
          }
        } catch (pe) {
          console.warn('[MusicDNA] JSON parse warning on feed cache:', pe);
        }
      }

      this.isLoaded = true;
    } catch (e) {
      console.warn('[MusicDNA] Failed to load local profile:', e);
    }
  }

  /**
   * Exponential Time Decay Track Affinity Scoring:
   * Score = [(Plays * 3) + (Completions * 5) - (Skips * 3) + (isLiked * 8)] * e^(-lambda * days)
   */
  public calculateTrackScore(t: TrackTelemetry): number {
    const now = Date.now();
    const daysSincePlayed = Math.max(0, (now - (t.lastPlayedTimestamp || now)) / (1000 * 60 * 60 * 24));
    const decay = Math.exp(-LAMBDA_DECAY * daysSincePlayed);

    const rawScore =
      (t.plays || 1) * 3 +
      (t.completions || 0) * 5 -
      (t.skips || 0) * 3 +
      (t.isLiked ? 8 : 0);

    return Math.max(0, rawScore) * decay;
  }

  /**
   * Ingest a listening event (play, completion, skip, like)
   */
  public async recordListeningSignal(
    track: Track,
    signal: 'play' | 'completion' | 'complete' | 'skip' | 'like' | 'unlike'
  ): Promise<void> {
    if (!track?.videoId) return;
    await this.loadLocalProfile();

    const existing: TrackTelemetry = this.telemetryMap.get(track.videoId) || {
      videoId: track.videoId,
      title: track.title,
      artist: cleanArtistName(track.artist) || track.artist,
      thumbnail: track.thumbnail,
      duration: track.duration,
      plays: 0,
      completions: 0,
      skips: 0,
      isLiked: false,
      lastPlayedTimestamp: Date.now(),
    };

    if (signal === 'play') {
      existing.plays += 1;
      existing.lastPlayedTimestamp = Date.now();
    } else if (signal === 'completion' || signal === 'complete') {
      existing.completions += 1;
    } else if (signal === 'skip') {
      existing.skips += 1;
    } else if (signal === 'like') {
      existing.isLiked = true;
    } else if (signal === 'unlike') {
      existing.isLiked = false;
    }

    this.telemetryMap.set(track.videoId, existing);
    this.newPlaysSinceSync += 1;

    // Persist locally in background (non-blocking)
    this.persistLocalTelemetry();

    // Trigger Cloud sync if 5 new plays reached
    if (this.newPlaysSinceSync >= 5 && this.activeUserId !== 'guest') {
      this.newPlaysSinceSync = 0;
      this.syncWithSupabase();
      // Also re-trigger dynamic discovery in background to refresh feed with latest tastes
      this.discoverLiveFeeds('All', true).catch(() => {});
    }
  }

  private async persistLocalTelemetry() {
    try {
      const list = Array.from(this.telemetryMap.values());
      await AsyncStorage.setItem(`${TELEMETRY_KEY_PREFIX}${this.activeUserId}`, JSON.stringify(list));
    } catch (e) {
      console.warn('[MusicDNA] Cache write error:', e);
    }
  }

  /**
   * Non-blocking background sync with Supabase `user_music_dna` table
   */
  private async syncWithSupabase() {
    try {
      if (!this.activeUserId || this.activeUserId === 'guest') return;

      const ranked = this.getRankedTelemetryTracks();
      const topTracks = ranked.slice(0, 15).map((t) => t.videoId);
      const artistFreq: Record<string, number> = {};
      ranked.forEach((t) => {
        artistFreq[t.artist] = (artistFreq[t.artist] || 0) + t.plays;
      });
      const topArtists = Object.entries(artistFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name]) => name);

      await supabase.from('user_music_dna').upsert({
        user_id: this.activeUserId,
        mood_weights: {
          cadence: 65,
          signature: 80,
          replay: 75,
          chill: 50,
          energy: 70,
        },
        top_artist_ids: topArtists,
        top_track_ids: topTracks,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[MusicDNA] Supabase sync non-fatal error:', e);
    }
  }

  public getRankedTelemetryTracks(): TrackTelemetry[] {
    const list = Array.from(this.telemetryMap.values());
    return list.sort((a, b) => this.calculateTrackScore(b) - this.calculateTrackScore(a));
  }

  /**
   * Detect Top Signature Artist from scored telemetry
   */
  public getTopSignatureArtist(): string {
    const ranked = this.getRankedTelemetryTracks();
    if (ranked.length === 0) return 'Djalil Palermo';

    const artistScores: Record<string, number> = {};
    for (const t of ranked) {
      const a = cleanArtistName(t.artist);
      if (a && a !== 'Artist') {
        artistScores[a] = (artistScores[a] || 0) + this.calculateTrackScore(t);
      }
    }

    let topArtist = 'Djalil Palermo';
    let maxScore = 0;
    for (const [artist, score] of Object.entries(artistScores)) {
      if (score > maxScore) {
        maxScore = score;
        topArtist = artist;
      }
    }
    return topArtist;
  }

  /**
   * 🌟 Live Discovery Ingestion Pipeline
   * Generates dynamic queries based on live listening taste and fetches fresh music from YouTube Music
   */
  public async discoverLiveFeeds(
    activeFilter: string = 'All',
    forceRefresh: boolean = false
  ): Promise<DynamicHomeSections> {
    await this.loadLocalProfile();

    const now = Date.now();
    const isExpired = !this.lastFeedCachedAt || now - this.lastFeedCachedAt > CACHE_TTL_MS;

    if (this.cachedFeed && !forceRefresh && !isExpired && this.cachedFeed.topMixes.length > 0) {
      return this.filterSections(this.cachedFeed, activeFilter);
    }

    if (this.isDiscovering && this.cachedFeed) {
      return this.filterSections(this.cachedFeed, activeFilter);
    }
    this.isDiscovering = true;

    try {
      const signatureArtist = this.getTopSignatureArtist();

      // Dynamic rotating seed queries from diverse pools (prevents fixed 5-song loop)
      const cadenceQuery = pickRandomSeed(SEED_POOLS.cadence);
      const signatureQuery =
        Math.random() > 0.5
          ? `${signatureArtist} popular official songs`
          : `${signatureArtist} best hits album`;
      const chillQuery = pickRandomSeed(SEED_POOLS.chill);
      const energyQuery = pickRandomSeed(SEED_POOLS.energy);
      const trendingQuery = pickRandomSeed(SEED_POOLS.trending);

      // Safe query runner to isolate failures and avoid whole batch rejection
      const safeSearch = async (query: string): Promise<Track[]> => {
        try {
          return await searchYouTubeMusic(query);
        } catch (err) {
          console.warn(`[MusicDNA] Query "${query}" non-fatal failure:`, err);
          return [];
        }
      };

      // ── BATCH 1: High Priority (Above-the-Fold: Signature Artist & 160 BPM Stride) ──
      const [signatureTracks, cadenceTracks] = await Promise.all([
        safeSearch(signatureQuery),
        safeSearch(cadenceQuery),
      ]);

      // ── STAGGER DELAY: 280ms pause to eliminate YouTube HTTP 429 rate limit ──
      await new Promise((resolve) => setTimeout(resolve, 280));

      // ── BATCH 2: Lower Sections (Sunset Chill, Energy Boost, Trending Rai) ──
      const [trendingTracks, chillTracks, energyTracks] = await Promise.all([
        safeSearch(trendingQuery),
        safeSearch(chillQuery),
        safeSearch(energyQuery),
      ]);

      // If all queries failed (e.g. offline/poor connection) and we have cache, preserve it!
      const hasAnyTracks =
        signatureTracks.length > 0 ||
        cadenceTracks.length > 0 ||
        trendingTracks.length > 0 ||
        chillTracks.length > 0 ||
        energyTracks.length > 0;

      if (!hasAnyTracks && this.cachedFeed) {
        throw new Error('NETWORK_FEED_FETCH_FAILED');
      }

      // 1. On Repeat (Derived from real telemetry scores with time decay)
      const rankedScored = this.getRankedTelemetryTracks()
        .filter((t) => t.plays >= 1)
        .slice(0, 10)
        .map(
          (t): Track => ({
            videoId: t.videoId,
            title: t.title,
            artist: t.artist,
            thumbnail: getUniversalStudioArtwork(t.thumbnail, t.title, t.artist),
            duration: t.duration,
            isOfficial: true,
          })
        );

      const replayTracks =
        rankedScored.length >= 3 ? rankedScored : trendingTracks.slice(0, 10);

      // 2. Assemble the 5 Spotify-Grade Mood Clusters (Real track covers & Spotify accent badges)
      // Banished stock coffee cups & gym photos: using verified studio album covers
      const clusters: MoodCluster[] = [
        {
          id: 'cluster-cadence',
          key: 'cadence',
          title: '160 BPM Stride',
          badgeColor: '#FF6B00', // Athletic orange
          subtitle: 'Cardio Beats, 160 BPM Cadence',
          artwork: getUniversalStudioArtwork(
            cadenceTracks[0]?.thumbnail,
            cadenceTracks[0]?.title || 'Cardio Cadence 160',
            'Cadence Beats'
          ),
          tracks: cadenceTracks.slice(0, 15),
        },
        {
          id: 'cluster-signature',
          key: 'signature',
          title: `${signatureArtist} Mix`,
          badgeColor: '#1DB954', // Spotify vibrant green
          subtitle: `${signatureArtist}, Djalil Palermo & Soolking`,
          artwork: getUniversalStudioArtwork(
            signatureTracks[0]?.thumbnail,
            signatureTracks[0]?.title,
            signatureArtist
          ),
          tracks: signatureTracks.slice(0, 15),
        },
        {
          id: 'cluster-replay',
          key: 'replay',
          title: 'On Repeat',
          badgeColor: '#8E2DE2', // Neon Violet
          subtitle: 'Your most played anthems this week',
          artwork: getUniversalStudioArtwork(
            replayTracks[0]?.thumbnail,
            replayTracks[0]?.title,
            replayTracks[0]?.artist
          ),
          tracks: replayTracks,
        },
        {
          id: 'cluster-chill',
          key: 'chill',
          title: 'Sunset Chill',
          badgeColor: '#4A90E2', // Sky Blue
          subtitle: 'Acoustic, Lofi & Post-Workout Cool Down',
          artwork: getUniversalStudioArtwork(
            chillTracks[0]?.thumbnail,
            'Zina Acoustic',
            'Babylone'
          ),
          tracks: chillTracks.slice(0, 15),
        },
        {
          id: 'cluster-energy',
          key: 'energy',
          title: 'Energy Boost',
          badgeColor: '#FF0055', // Neon Pink / Energy
          subtitle: 'Gym Phonk, Trap & High Power Drops',
          artwork: getUniversalStudioArtwork(
            energyTracks[0]?.thumbnail,
            energyTracks[0]?.title || 'Phonk Energy',
            'Kordhell'
          ),
          tracks: energyTracks.slice(0, 15),
        },
      ];

      // 3. Quick Jump 2x3 Grid (6 items)
      // Dynamic Randomizer & Shuffler: break the static 5-track loop completely
      const quickJumpTracks: Track[] = [];
      const combinedPool = shuffleArray([
        ...signatureTracks,
        ...trendingTracks,
        ...replayTracks,
        ...cadenceTracks,
        ...chillTracks,
      ]);

      const seenIds = new Set<string>();
      for (const t of combinedPool) {
        if (!seenIds.has(t.videoId) && t.title) {
          seenIds.add(t.videoId);
          quickJumpTracks.push({
            ...t,
            thumbnail: getUniversalStudioArtwork(t.thumbnail, t.title, t.artist),
          });
          if (quickJumpTracks.length >= 6) break;
        }
      }

      // 4. "Picked for you" Featured Track (Dynamic selection from top pool)
      const candidatePicks = shuffleArray([
        ...signatureTracks.slice(0, 3),
        ...trendingTracks.slice(0, 3),
      ]);
      const pickedForYou = candidatePicks[0] || quickJumpTracks[0] || null;

      // 5. Favourite Artists Extraction (Guaranteed studio portraits, 0 letter circles!)
      // Strict protocol: Filter out fake channels (e.g. 'Music Spring', 'Remix & Co')
      const artistMap = new Map<string, { name: string; avatar: string; isOfficial: boolean }>();
      const allDiscovered = [
        ...signatureTracks,
        ...trendingTracks,
        ...cadenceTracks,
        ...chillTracks,
      ];

      for (const tr of allDiscovered) {
        const genuineName = extractGenuineArtist(tr.title, tr.artist);
        if (
          genuineName &&
          genuineName.length >= 3 &&
          !isFakeArtistChannel(genuineName) &&
          !artistMap.has(genuineName) &&
          artistMap.size < 12
        ) {
          const avatar = getUniversalArtistAvatar(null, genuineName);
          artistMap.set(genuineName, {
            name: genuineName,
            avatar,
            isOfficial: true,
          });
        }
      }

      // Ensure verified Algerian icons and global superstars are always populated with real portraits
      const baselineArtists = [
        'Djalil Palermo',
        'Soolking',
        'Cheb Khaled',
        'Didine Canon 16',
        'Cheb Mami',
        'Cheb Hasni',
        'The Weeknd',
        'Eminem',
        'Cheb Bilal',
        'ElGrandeToto',
        'Mouh Milano',
        'Billie Eilish',
        'Dua Lipa',
      ];
      for (const name of baselineArtists) {
        if (!artistMap.has(name) && artistMap.size < 12) {
          artistMap.set(name, {
            name,
            avatar: getUniversalArtistAvatar(null, name),
            isOfficial: true,
          });
        }
      }

      const favouriteArtists = Array.from(artistMap.values());

      const fullSections: DynamicHomeSections = {
        quickJump: quickJumpTracks,
        topMixes: clusters,
        pickedForYou,
        favouriteArtists,
        recentlyPlayed: [],
        energyWorkout: cadenceTracks.slice(0, 15),
      };

      // Persist to local cache with timestamp (6-hour TTL)
      this.cachedFeed = fullSections;
      this.lastFeedCachedAt = Date.now();
      const payload: CachedDnaFeedPayload = {
        timestamp: this.lastFeedCachedAt,
        data: fullSections,
      };
      AsyncStorage.setItem(
        `${FEED_CACHE_KEY_PREFIX}${this.activeUserId}`,
        JSON.stringify(payload)
      ).catch(() => {});

      return this.filterSections(fullSections, activeFilter);
    } catch (err) {
      console.warn('[MusicDNA] Live discovery error:', err);
      if (this.cachedFeed) {
        if (forceRefresh) {
          // Re-throw so pull-to-refresh displays toast while keeping cached cards intact
          throw err;
        }
        return this.filterSections(this.cachedFeed, activeFilter);
      }
      return this.getFallbackSections(activeFilter);
    } finally {
      this.isDiscovering = false;
    }
  }

  /**
   * Pull-to-Refresh: forces live network query ingestion and refreshes cache
   */
  public async refreshLiveFeeds(activeFilter: string = 'All'): Promise<DynamicHomeSections> {
    return this.discoverLiveFeeds(activeFilter, true);
  }

  /**
   * Fast synchronous fallback for instant 0ms initial render from cache
   */
  public getSectionsSync(
    activeFilter: string = 'All',
    history: Track[] = []
  ): DynamicHomeSections {
    if (this.cachedFeed && this.cachedFeed.topMixes.length > 0) {
      const filtered = this.filterSections(this.cachedFeed, activeFilter);
      if (history.length > 0) {
        filtered.recentlyPlayed = history.slice(0, 10);
      }
      return filtered;
    }

    return this.getFallbackSections(activeFilter, history);
  }

  /**
   * Filter dynamic sections based on top pills
   */
  private filterSections(
    sections: DynamicHomeSections,
    activeFilter: string
  ): DynamicHomeSections {
    let filteredMixes = sections.topMixes;
    if (activeFilter === 'Workout 160 BPM') {
      filteredMixes = sections.topMixes.filter((c) => c.key === 'cadence' || c.key === 'energy');
    } else if (activeFilter === 'Rai DZ') {
      filteredMixes = sections.topMixes.filter((c) => c.key === 'signature');
    } else if (activeFilter === 'Chill') {
      filteredMixes = sections.topMixes.filter((c) => c.key === 'chill');
    } else if (activeFilter === 'Music') {
      filteredMixes = sections.topMixes.filter((c) => c.key !== 'cadence');
    }

    return {
      ...sections,
      topMixes: filteredMixes,
    };
  }

  /**
   * Clean Initial State before first live network fetch resolves
   */
  private getFallbackSections(activeFilter: string = 'All', history: Track[] = []): DynamicHomeSections {
    const defaultMixes: MoodCluster[] = [
      {
        id: 'cluster-cadence',
        key: 'cadence',
        title: '160 BPM Stride',
        badgeColor: '#FF6B00',
        subtitle: 'Cardio Beats, 160 BPM Cadence',
        artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/11/60/29/11602913-9773-8ccd-30ac-1f6af60a0126/cover_735910926903.jpg/600x600bb.jpg',
        tracks: [],
      },
      {
        id: 'cluster-signature',
        key: 'signature',
        title: 'Rai DZ Mix',
        badgeColor: '#1DB954',
        subtitle: 'Djalil Palermo, Khaled & Soolking',
        artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/01/99/c9/0199c9ea-010a-391c-689e-86e077dbb9e9/cover.jpg/600x600bb.jpg',
        tracks: [],
      },
      {
        id: 'cluster-replay',
        key: 'replay',
        title: 'On Repeat',
        badgeColor: '#8E2DE2',
        subtitle: 'Your most played anthems this week',
        artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/ce/8e/0f/ce8e0f35-e9ff-db39-9f1c-4a71dd4dc1be/cover.jpg/600x600bb.jpg',
        tracks: [],
      },
      {
        id: 'cluster-chill',
        key: 'chill',
        title: 'Sunset Chill',
        badgeColor: '#4A90E2',
        subtitle: 'Acoustic, Lofi & Post-Workout Cool Down',
        artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music3/v4/c8/fb/8e/c8fb8e76-5778-51ad-614f-a8be1732d77b/3700551765249_cover.jpg/600x600bb.jpg',
        tracks: [],
      },
      {
        id: 'cluster-energy',
        key: 'energy',
        title: 'Energy Boost',
        badgeColor: '#FF0055',
        subtitle: 'Gym Phonk, Trap & High Power Drops',
        artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/9b/58/d0/9b58d03d-3592-c5ad-6063-3b1e69831259/cover.jpg/600x600bb.jpg',
        tracks: [],
      },
    ];

    const favouriteArtists = [
      { name: 'Djalil Palermo', avatar: getUniversalArtistAvatar(null, 'Djalil Palermo'), isOfficial: true },
      { name: 'Soolking', avatar: getUniversalArtistAvatar(null, 'Soolking'), isOfficial: true },
      { name: 'Cheb Khaled', avatar: getUniversalArtistAvatar(null, 'Cheb Khaled'), isOfficial: true },
      { name: 'Didine Canon 16', avatar: getUniversalArtistAvatar(null, 'Didine Canon 16'), isOfficial: true },
      { name: 'Cheb Mami', avatar: getUniversalArtistAvatar(null, 'Cheb Mami'), isOfficial: true },
      { name: 'The Weeknd', avatar: getUniversalArtistAvatar(null, 'The Weeknd'), isOfficial: true },
    ];

    return {
      quickJump: history.slice(0, 6),
      topMixes: defaultMixes,
      pickedForYou: null,
      favouriteArtists,
      recentlyPlayed: history.slice(0, 10),
      energyWorkout: [],
    };
  }

  /**
   * Main entry point called by MusicHome (Stale-While-Revalidate Architecture)
   * 1. Returns cached feeds instantly in 0ms for silky-smooth app launch.
   * 2. If cache is older than 6 hours (TTL), triggers background revalidation silently without UI flicker.
   */
  public async getDynamicHomeSections(
    activeFilter: string = 'All',
    history: Track[] = [],
    likedTrackIds: string[] = []
  ): Promise<DynamicHomeSections> {
    await this.loadLocalProfile();

    const now = Date.now();
    const isStale = !this.lastFeedCachedAt || now - this.lastFeedCachedAt > CACHE_TTL_MS;

    if (this.cachedFeed && this.cachedFeed.topMixes.length > 0) {
      if (isStale && !this.isDiscovering) {
        // Silently revalidate in background without interrupting user
        this.discoverLiveFeeds(activeFilter, true).catch((err) => {
          console.warn('[MusicDNA] Background SWR revalidation error:', err);
        });
      }
      const filtered = this.filterSections(this.cachedFeed, activeFilter);
      if (history.length > 0) {
        filtered.recentlyPlayed = history.slice(0, 10);
      }
      return filtered;
    }

    // First cold launch without cache: await network discovery
    const live = await this.discoverLiveFeeds(activeFilter, false);
    return {
      ...live,
      recentlyPlayed: history.slice(0, 10),
    };
  }
}

export const musicDnaService = new MusicDnaEngine();
export default musicDnaService;
