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
import { CURATED_TRACKS } from '../data/curatedMusic';
import { getRegionProfile, getRegionSeedQueries } from './regionService';

// ── Dynamic Rotating Seed Pools (Zero Fixed Artists, Zero Sport/Gym Bias!) ──
const SEED_POOLS = {
  cadence: [
    'popular discovery radio mix',
    'fresh hits & trending station',
    'urban pop & electronic mix',
    'indie & afrobeats radio',
  ],
  chill: [
    'acoustic chill sessions official',
    'lofi chill beats study focus',
    'acoustic guitar chill vibes',
    'late night chill R&B',
  ],
  energy: [
    'popular urban & hip hop hits',
    'upbeat pop & electronic mix',
    'afro house & dance discovery',
    'trending rhythm & beats',
  ],
  trending: [
    'top music trending official',
    'new music releases official',
    'popular charts hits mix',
    'viral music official audio',
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
const FEED_CACHE_KEY_PREFIX = '@nouble_dna_feed_v5_';

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

export interface ArtistRadioItem {
  id: string;
  artistName: string;
  bgColor: string;
  topArtworks: string[]; // Up to 3 distinct covers for the 3 overlapping circles
  tracks: Track[];
}

export interface DynamicHomeSections {
  quickJump: Track[];
  topMixes: MoodCluster[];
  pickedForYou: Track | null;
  favouriteArtists: { name: string; avatar: string; isOfficial?: boolean; id?: string; channelId?: string }[];
  artistRadios?: ArtistRadioItem[];
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
      this.discoverLiveFeeds('All', true).catch(() => { });
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
   * Top-20 Ranked Artists learned from on-device telemetry (identical for Guests & Signed-In Users)
   */
  public getTopRankedArtists(limit: number = 20): { name: string; score: number }[] {
    const ranked = this.getRankedTelemetryTracks();
    if (ranked.length === 0) return [];

    const artistScores: Record<string, number> = {};
    for (const t of ranked) {
      const a = cleanArtistName(t.artist);
      if (a && a !== 'Artist' && !isFakeArtistChannel(a)) {
        artistScores[a] = (artistScores[a] || 0) + this.calculateTrackScore(t);
      }
    }

    return Object.entries(artistScores)
      .map(([name, score]) => ({ name, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Pick a weighted random artist from user's Top-20 learned artists (returns null if no history yet)
   */
  public getTopSignatureArtist(): string | null {
    const top20 = this.getTopRankedArtists(20);
    if (top20.length === 0) return null;
    // Weighted pick across top-10/20 so discovery expands instead of repeating #1
    const pool = top20.slice(0, Math.min(top20.length, 10));
    return pool[Math.floor(Math.random() * pool.length)].name;
  }

  /**
   * 🌟 Live Discovery Ingestion Pipeline
   * Generates 100% dynamic queries based on region/location + live listening taste (ZERO hardcoded artists!)
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
      const region = await getRegionProfile();
      const regionSeeds = getRegionSeedQueries(region);
      const signatureArtist = this.getTopSignatureArtist();

      // Build 100% dynamic queries from user taste OR regional/auto-random charts
      const cadenceQuery = pickRandomSeed(regionSeeds.energy.length > 0 ? regionSeeds.energy : SEED_POOLS.cadence);
      const signatureQuery = signatureArtist
        ? `${signatureArtist} ${Math.random() > 0.5 ? 'popular official songs' : 'radio mix'}`
        : pickRandomSeed(regionSeeds.stations);
      const chillQuery = pickRandomSeed(regionSeeds.chill.length > 0 ? regionSeeds.chill : SEED_POOLS.chill);
      const energyQuery = pickRandomSeed(SEED_POOLS.cadence);
      const trendingQuery = pickRandomSeed(regionSeeds.trending.length > 0 ? regionSeeds.trending : SEED_POOLS.trending);

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
      // Distinct cover picker to ensure 100% visual variety so no two mix cards show duplicate covers
      const usedMixArtworks = new Set<string>();
      const pickDistinctCover = (trackList: Track[], fallbackCuratedIdx: number): string => {
        for (const t of trackList) {
          const art = getUniversalStudioArtwork(t?.thumbnail, t?.title, t?.artist, t?.videoId);
          if (art && !usedMixArtworks.has(art)) {
            usedMixArtworks.add(art);
            return art;
          }
        }
        const fallback = CURATED_TRACKS[fallbackCuratedIdx]?.thumbnail || '';
        usedMixArtworks.add(fallback);
        return fallback;
      };

      const dynamicMixArtists = Array.from(
        new Set(
          [...signatureTracks, ...trendingTracks]
            .map((t) => cleanArtistName(t.artist))
            .filter((a) => a && a !== 'Artist')
        )
      ).slice(0, 3);

      const buildMixSubtitle = (trackList: Track[], fallbackLabel: string): string => {
        const names = Array.from(
          new Set(
            trackList
              .map((t) => cleanArtistName(t.artist))
              .filter((a) => a && a !== 'Artist' && !isFakeArtistChannel(a))
          )
        );
        if (names.length === 0) return fallbackLabel;
        if (names.length <= 2) return names.join(' and ');
        return `${names[0]}, ${names[1]}, ${names[2]} and more`;
      };

      const top20Artists = this.getTopRankedArtists(20);
      const secondArtist = top20Artists.length > 1 ? top20Artists[1].name : null;

      const clusters: MoodCluster[] = [
        {
          id: 'cluster-signature',
          key: 'signature',
          title: signatureArtist ? `${signatureArtist} Mix` : 'Top Mix',
          badgeColor: '#FFD6E0',
          subtitle: buildMixSubtitle(signatureTracks, 'Tailored to your taste'),
          artwork: pickDistinctCover(signatureTracks, 0),
          tracks: shuffleArray(signatureTracks).slice(0, 12),
        },
        {
          id: 'cluster-cadence',
          key: 'cadence',
          title: secondArtist ? `${secondArtist} Mix` : 'Hip Hop Mix',
          badgeColor: '#D8E2FF',
          subtitle: buildMixSubtitle(cadenceTracks, 'Fresh channels & beats'),
          artwork: pickDistinctCover(cadenceTracks, 1),
          tracks: shuffleArray(cadenceTracks).slice(0, 12),
        },
        {
          id: 'cluster-chill',
          key: 'chill',
          title: 'Chill Mix',
          badgeColor: '#5EA8FF',
          subtitle: buildMixSubtitle(chillTracks, 'Acoustic & mellow sessions'),
          artwork: pickDistinctCover(chillTracks, 2),
          tracks: shuffleArray(chillTracks).slice(0, 12),
        },
        {
          id: 'cluster-energy',
          key: 'energy',
          title: 'Upbeat Mix',
          badgeColor: '#D9FF66',
          subtitle: buildMixSubtitle(energyTracks, 'Upbeat rhythm & flow'),
          artwork: pickDistinctCover(energyTracks, 3),
          tracks: shuffleArray(energyTracks).slice(0, 12),
        },
        {
          id: 'cluster-replay',
          key: 'replay',
          title: 'Pop Mix',
          badgeColor: '#FF9CE3',
          subtitle: buildMixSubtitle(replayTracks, 'Your most played anthems'),
          artwork: pickDistinctCover(replayTracks, 4),
          tracks: replayTracks.slice(0, 12),
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

      // Normalize helper for deduplicating artists
      const normKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
      const seenArtistKeys = new Set<string>();

      // Official Artists ONLY (exclude generic/fan/random YouTube uploader channels)
      const artistTracksMap = new Map<string, { name: string; avatar: string; isOfficial: boolean; tracks: Track[] }>();

      for (const tr of allDiscovered) {
        if (!tr.isOfficial) continue;
        const genuineName = extractGenuineArtist(tr.title, tr.artist);
        const k = genuineName ? normKey(genuineName) : '';
        if (!genuineName || genuineName.length < 3 || isFakeArtistChannel(genuineName)) {
          continue;
        }
        if (!seenArtistKeys.has(k)) {
          if (artistTracksMap.size >= 12) continue;
          seenArtistKeys.add(k);
          const avatar = tr.artistAvatar || getUniversalArtistAvatar(tr.artistAvatar, genuineName);
          artistTracksMap.set(k, {
            name: genuineName,
            avatar,
            isOfficial: true,
            tracks: [tr],
          });
        } else {
          artistTracksMap.get(k)?.tracks.push(tr);
        }
      }

      // Deduplicate tracks between Top Mixes and Recommended Stations so they never repeat
      const topMixVideoIds = new Set<string>();
      for (const m of clusters) {
        m.tracks = m.tracks.slice(0, 10);
        for (const mt of m.tracks) {
          if (mt.videoId) topMixVideoIds.add(mt.videoId);
        }
      }

      const distinctStationTracks: Track[] = [];
      const seenStationIds = new Set<string>();
      for (const t of [...cadenceTracks, ...energyTracks, ...chillTracks, ...trendingTracks]) {
        if (!t?.videoId || seenStationIds.has(t.videoId) || topMixVideoIds.has(t.videoId)) continue;
        seenStationIds.add(t.videoId);
        distinctStationTracks.push(t);
        if (distinctStationTracks.length >= 10) break;
      }
      if (distinctStationTracks.length < 6) {
        for (const t of cadenceTracks) {
          if (t?.videoId && !seenStationIds.has(t.videoId)) {
            seenStationIds.add(t.videoId);
            distinctStationTracks.push(t);
          }
          if (distinctStationTracks.length >= 10) break;
        }
      }

      // Shuffle discovered official artists so Popular Artists stays fresh
      const shuffledArtists = shuffleArray(Array.from(artistTracksMap.values()));
      const favouriteArtists = shuffledArtists.map(({ name, avatar, isOfficial }) => ({
        name,
        avatar,
        isOfficial,
      }));

      // Build Spotify-style Artist Radio Cards with dynamic pastel colors & top 3 track covers
      const RADIO_PALETTE = [
        '#9BF0B8',
        '#FF9CE3',
        '#8CD3FF',
        '#FFD166',
        '#C7B8FF',
        '#FFA69E',
        '#A8F5E5',
        '#FBC4AB',
      ];
      const artistRadios: ArtistRadioItem[] = shuffledArtists.slice(0, 8).map((art, idx) => {
        const coverSet = new Set<string>();
        const topArtworks: string[] = [];
        for (const tr of art.tracks) {
          const thumb = getUniversalStudioArtwork(tr.thumbnail, tr.title, tr.artist, tr.videoId);
          if (thumb && !coverSet.has(thumb)) {
            coverSet.add(thumb);
            topArtworks.push(thumb);
          }
          if (topArtworks.length >= 3) break;
        }
        if (topArtworks.length === 0 && art.avatar) {
          topArtworks.push(art.avatar);
        }
        return {
          id: `artist-radio-${normKey(art.name)}-${idx}`,
          artistName: art.name,
          bgColor: RADIO_PALETTE[idx % RADIO_PALETTE.length],
          topArtworks,
          tracks: art.tracks.slice(0, 10),
        };
      });

      const fullSections: DynamicHomeSections = {
        quickJump: quickJumpTracks,
        topMixes: clusters,
        pickedForYou,
        favouriteArtists,
        artistRadios,
        recentlyPlayed: [],
        energyWorkout: distinctStationTracks,
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
      ).catch(() => { });

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
   * Clean Initial State before first live network fetch resolves (ZERO hardcoded artists or sport clusters!)
   */
  private getFallbackSections(activeFilter: string = 'All', history: Track[] = []): DynamicHomeSections {
    const cadenceTracks = CURATED_TRACKS.filter((t) => t.category === 'cardio' || t.category === 'running');
    const raiTracks = CURATED_TRACKS.filter((t) => t.category === 'rai');
    const chillTracks = CURATED_TRACKS.filter((t) => t.category === 'walking' || t.category === 'focus');
    const energyTracks = CURATED_TRACKS.filter((t) => t.category === 'cardio' || t.category === 'running');
    const historyTracks = history.slice(0, 12);
    const firstCover = historyTracks[0]?.thumbnail || '';

    const usedDefArt = new Set<string>();
    const pickDefCover = (trackList: Track[], fallbackCuratedIdx: number): string => {
      for (const t of trackList) {
        if (t?.thumbnail && !usedDefArt.has(t.thumbnail)) {
          usedDefArt.add(t.thumbnail);
          return t.thumbnail;
        }
      }
      const fallback = CURATED_TRACKS[fallbackCuratedIdx]?.thumbnail || '';
      usedDefArt.add(fallback);
      return fallback;
    };
    const defaultMixes: MoodCluster[] =
      historyTracks.length > 0
        ? [
          {
            id: 'cluster-replay',
            key: 'replay',
            title: 'On Repeat',
            badgeColor: '#8E2DE2',
            subtitle: 'Your most played tracks',
            artwork: firstCover,
            tracks: historyTracks,
          },
        ]
        : [];

    const defaultMixes: MoodCluster[] = [
      {
        id: 'cluster-cadence',
        key: 'cadence',
        title: '160 BPM Stride',
        badgeColor: '#FF6B00',
        subtitle: 'Cardio Beats, 160 BPM Cadence',
        artwork: pickDefCover(cadenceTracks, 0),
        tracks: cadenceTracks.length > 0 ? cadenceTracks : CURATED_TRACKS.slice(0, 5),
      },
      {
        id: 'cluster-signature',
        key: 'signature',
        title: 'Recommended Mix',
        badgeColor: '#1DB954',
        subtitle: 'Tailored to your listening taste',
        artwork: pickDefCover(raiTracks, 1),
        tracks: raiTracks.length > 0 ? raiTracks : CURATED_TRACKS.slice(0, 5),
      },
      {
        id: 'cluster-replay',
        key: 'replay',
        title: 'On Repeat',
        badgeColor: '#8E2DE2',
        subtitle: 'Your most played anthems this week',
        artwork: pickDefCover(history, 2),
        tracks: history.length > 0 ? history.slice(0, 5) : CURATED_TRACKS.slice(0, 5),
      },
      {
        id: 'cluster-chill',
        key: 'chill',
        title: 'Sunset Chill',
        badgeColor: '#4A90E2',
        subtitle: 'Acoustic, Lofi & Post-Workout Cool Down',
        artwork: pickDefCover(chillTracks, 3),
        tracks: chillTracks.length > 0 ? chillTracks : CURATED_TRACKS.slice(2, 6),
      },
      {
        id: 'cluster-energy',
        key: 'energy',
        title: 'Energy Boost',
        badgeColor: '#FF0055',
        subtitle: 'Gym Phonk, Trap & High Power Drops',
        artwork: pickDefCover(energyTracks, 4),
        tracks: energyTracks.length > 0 ? energyTracks : CURATED_TRACKS.slice(0, 5),
      },
    ];
    const fallbackArtists = Array.from(
      new Set(
        historyTracks
          .map((t) => cleanArtistName(t.artist))
          .filter((a) => a && a !== 'Artist' && !isFakeArtistChannel(a))
      )
    )
      .slice(0, 8)
      .map((name) => ({
        name,
        avatar: getUniversalArtistAvatar(null, name),
        isOfficial: true,
      }));

    const favouriteArtists = [
      { name: 'Djalil Palermo', avatar: CURATED_TRACKS.find(t => t.artist?.toLowerCase().includes('djalil'))?.thumbnail || '', isOfficial: true },
      { name: 'Soolking', avatar: CURATED_TRACKS.find(t => t.artist?.toLowerCase().includes('soolking'))?.thumbnail || '', isOfficial: true },
      { name: 'Cheb Khaled', avatar: CURATED_TRACKS.find(t => t.artist?.toLowerCase().includes('khaled'))?.thumbnail || '', isOfficial: true },
      { name: 'Didine Canon 16', avatar: CURATED_TRACKS.find(t => t.artist?.toLowerCase().includes('didine'))?.thumbnail || '', isOfficial: true },
      { name: 'Cheb Mami', avatar: CURATED_TRACKS.find(t => t.artist?.toLowerCase().includes('mami'))?.thumbnail || '', isOfficial: true },
      { name: 'The Weeknd', avatar: CURATED_TRACKS.find(t => t.artist?.toLowerCase().includes('weeknd'))?.thumbnail || '', isOfficial: true },
    ];

    return {
      quickJump: history.length > 0 ? history.slice(0, 6) : CURATED_TRACKS.slice(0, 6),
      quickJump: historyTracks.slice(0, 6),
      topMixes: defaultMixes,
      pickedForYou: null,
      favouriteArtists,
      recentlyPlayed: history.length > 0 ? history.slice(0, 10) : CURATED_TRACKS.slice(0, 4),
      energyWorkout: energyTracks.length > 0 ? energyTracks : CURATED_TRACKS.slice(0, 5),
      pickedForYou: historyTracks[0] || null,
      favouriteArtists: fallbackArtists,
      artistRadios: [],
      recentlyPlayed: historyTracks,
      energyWorkout: historyTracks.slice(0, 10),
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
