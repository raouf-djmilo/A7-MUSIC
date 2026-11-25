import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cleanArtistName,
  isFakeArtistChannel,
  getHighResYouTubeAvatar,
  parseDurationText,
} from './youtubeMusicService';
import { getUniversalArtistAvatar } from '../utils/artworkHelper';
import { getRegionProfile, getRegionSeedQueries } from './regionService';

export interface ArtistMusicShort {
  videoId: string;
  title: string;
  artist: string;
  artistId?: string;
  artistAvatar: string;
  isOfficialArtist: boolean;
  thumbnail: string;
  hashtag: string;
  tags: string[];
  durationMs: number;
}

const SHORTS_CACHE_KEY_PREFIX = '@a7music_artist_shorts_v2_';
const SHORTS_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

const NON_MUSIC_SPAM_KEYWORDS = [
  'podcast',
  'interview',
  'reaction',
  'reacts',
  'tutorial',
  'how to',
  'unboxing',
  'review',
  'gameplay',
  'minecraft',
  'fortnite',
  'roblox',
  'prank',
  'vlog',
  'news',
  'breaking',
  'motivation speech',
  'workout routine',
  'gym vlog',
  'comedy',
  'skit',
  'meme',
  'trailer',
  'movie clip',
];

const memoryCacheMap = new Map<string, { ts: number; items: ArtistMusicShort[] }>();

function isSpamTitleOrChannel(title: string, channel: string): boolean {
  const combined = `${title} ${channel}`.toLowerCase();
  return NON_MUSIC_SPAM_KEYWORDS.some((kw) => combined.includes(kw));
}

function extractHashtag(title: string, fallbackTag: string): string {
  const match = title.match(/#([a-zA-Z0-9_\u0600-\u06FF]+)/);
  if (match?.[1] && match[1].toLowerCase() !== 'shorts' && match[1].toLowerCase() !== 'short') {
    return `#${match[1].toLowerCase()}`;
  }
  return fallbackTag;
}

function deriveTagFromQuery(seedQuery: string, artistName: string): string {
  const q = `${seedQuery} ${artistName}`.toLowerCase();
  if (q.includes('rai') || q.includes('raï')) return '#rai';
  if (q.includes('rap') || q.includes('hip hop') || q.includes('trap')) return '#hip hop';
  if (q.includes('chaabi') || q.includes('gnawa')) return '#maghreb';
  if (q.includes('afro')) return '#afrobeats';
  if (q.includes('pop')) return '#pop';
  if (q.includes('chill') || q.includes('lofi') || q.includes('acoustic')) return '#chill';
  if (q.includes('electronic') || q.includes('house')) return '#electronic';
  return '#new music';
}

function cleanShortTitle(rawTitle: string): string {
  return (
    rawTitle
      .replace(/#shorts?/gi, '')
      .replace(/#music/gi, '')
      .replace(/\s*\(official\s*(video|audio|music video|lyric video)?\)/gi, '')
      .replace(/\s*\[official.*?\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || 'New Release'
  );
}

/**
 * Verifies that a YouTube video belongs to an authentic Music Artist channel
 * (Official Artist badge, Verified music channel, VEVO, or Topic).
 */
function verifyArtistChannel(ownerName: string, ownerBadges: any[] = []): boolean {
  if (!ownerName) return false;

  const hasArtistBadge = ownerBadges.some((b: any) => {
    const style = String(b?.metadataBadgeRenderer?.style || '').toUpperCase();
    const tooltip = String(b?.metadataBadgeRenderer?.tooltip || '').toLowerCase();
    return (
      style.includes('OFFICIAL_ARTIST') ||
      style.includes('VERIFIED') ||
      style.includes('MUSIC') ||
      tooltip.includes('official artist') ||
      tooltip.includes('verified')
    );
  });

  const looksOfficialName =
    /vevo$/i.test(ownerName) ||
    /-\s*topic$/i.test(ownerName) ||
    /official/i.test(ownerName);

  if (isFakeArtistChannel(ownerName)) {
    return hasArtistBadge || /vevo$/i.test(ownerName) || /-\s*topic$/i.test(ownerName);
  }

  return hasArtistBadge || looksOfficialName || !isFakeArtistChannel(ownerName);
}

/**
 * Reads user's live Music DNA telemetry & cached DNA feed to tailor Shorts discovery
 * toward the artists, moods, and styles the user actually listens to.
 */
async function extractUserDnaSeeds(userId: string): Promise<{
  dnaArtists: string[];
  dnaMoodQueries: string[];
}> {
  const dnaArtists: string[] = [];
  const dnaMoodQueries: string[] = [];
  const uid = userId || 'guest';

  try {
    const rawTelemetry = await AsyncStorage.getItem(`@nouble_telemetry_${uid}`);
    if (rawTelemetry) {
      const entries = JSON.parse(rawTelemetry);
      if (Array.isArray(entries)) {
        const artistScores = new Map<string, number>();
        for (const entry of entries) {
          const t = Array.isArray(entry) ? entry[1] : entry;
          if (!t?.artist || isFakeArtistChannel(t.artist)) continue;
          const clean = cleanArtistName(t.artist);
          const score =
            (t.plays || 0) * 2 +
            (t.completions || 0) * 3 +
            (t.isLiked ? 6 : 0) -
            (t.skips || 0) * 1.5;
          artistScores.set(clean, (artistScores.get(clean) || 0) + Math.max(1, score));
        }
        const sorted = Array.from(artistScores.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([name]) => name);
        dnaArtists.push(...sorted.slice(0, 8));
      }
    }
  } catch {
    // Ignore telemetry parse error
  }

  try {
    const rawFeed = await AsyncStorage.getItem(`@nouble_dna_feed_v5_${uid}`);
    if (rawFeed) {
      const parsed = JSON.parse(rawFeed);
      const favArtists = parsed?.data?.favouriteArtists;
      if (Array.isArray(favArtists)) {
        for (const art of favArtists) {
          if (art?.name && !dnaArtists.includes(art.name)) {
            dnaArtists.push(art.name);
          }
        }
      }
      const topMixes = parsed?.data?.topMixes;
      if (Array.isArray(topMixes)) {
        for (const mix of topMixes) {
          if (mix?.subtitle) {
            dnaMoodQueries.push(String(mix.subtitle));
          }
        }
      }
    }
  } catch {
    // Ignore feed cache parse error
  }

  return {
    dnaArtists: dnaArtists.slice(0, 10),
    dnaMoodQueries: dnaMoodQueries.slice(0, 4),
  };
}

async function queryYouTubeArtistShorts(
  searchQuery: string,
  fallbackTag: string
): Promise<ArtistMusicShort[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch('https://www.youtube.com/youtubei/v1/search', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00',
            hl: 'en',
            gl: 'US',
          },
        },
        query: searchQuery,
        params: 'EgIYAQ%3D%3D',
      }),
    });
    clearTimeout(timeoutId);
    if (!response.ok) return [];

    const data = await response.json();
    const sections =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents || [];
    const items = sections?.[0]?.itemSectionRenderer?.contents || [];

    const collected: ArtistMusicShort[] = [];

    for (const item of items) {
      // A. Reel Shelf (native YouTube Shorts shelf)
      if (item.reelShelfRenderer?.items && Array.isArray(item.reelShelfRenderer.items)) {
        for (const r of item.reelShelfRenderer.items) {
          const reel = r.reelItemRenderer;
          if (!reel?.videoId) continue;
          const rawTitle =
            reel.headline?.simpleText ||
            reel.headline?.runs?.map((x: any) => x.text).join('') ||
            'Music Short';
          const header =
            reel.navigationEndpoint?.reelWatchEndpoint?.overlay?.reelPlayerOverlayRenderer
              ?.reelPlayerHeaderSupportedRenderers?.reelPlayerHeaderRenderer;
          const rawOwner = header?.channelTitleText?.runs?.[0]?.text || '';
          const channelBrowseId =
            header?.channelNavigationEndpoint?.browseEndpoint?.browseId || undefined;

          if (isSpamTitleOrChannel(rawTitle, rawOwner)) continue;
          if (rawOwner && !verifyArtistChannel(rawOwner, [])) continue;
          const artist = rawOwner ? cleanArtistName(rawOwner) : cleanArtistName(searchQuery.split('#')[0]);
          const thumbs = reel.thumbnail?.thumbnails || [];
          const thumb =
            thumbs[thumbs.length - 1]?.url ||
            `https://i.ytimg.com/vi/${reel.videoId}/oar2.jpg`;
          const tag = extractHashtag(rawTitle, fallbackTag);

          collected.push({
            videoId: reel.videoId,
            title: cleanShortTitle(rawTitle),
            artist,
            artistId: channelBrowseId,
            artistAvatar: getUniversalArtistAvatar('', artist) || thumb,
            isOfficialArtist: true,
            thumbnail: thumb,
            hashtag: tag,
            tags: [tag, '#official artist'],
            durationMs: 45000,
          });
        }
      }

      // B. Short music videoRenderer (<= 90s or /shorts/)
      const v = item.videoRenderer;
      if (!v?.videoId) continue;
      const rawTitle = v.title?.runs?.map((r: any) => r.text).join('') || '';
      const rawOwner = v.ownerText?.runs?.map((r: any) => r.text).join('') || '';
      const badges = v.ownerBadges || [];

      if (isSpamTitleOrChannel(rawTitle, rawOwner)) continue;
      if (!verifyArtistChannel(rawOwner, badges)) continue;

      const durationText = v.lengthText?.simpleText;
      const durationMs = parseDurationText(durationText);
      const isShortsNav = Boolean(
        v.navigationEndpoint?.reelWatchEndpoint ||
          v.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url?.includes('/shorts/')
      );

      if (!isShortsNav && durationMs > 90000) continue;

      const channelThumbs =
        v.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail
          ?.thumbnails || [];
      const rawAvatar = channelThumbs[channelThumbs.length - 1]?.url || '';
      const channelAvatar = getHighResYouTubeAvatar(rawAvatar);
      const artist = cleanArtistName(rawOwner);
      const tag = extractHashtag(rawTitle, deriveTagFromQuery(searchQuery, artist));

      collected.push({
        videoId: v.videoId,
        title: cleanShortTitle(rawTitle),
        artist,
        artistId: v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId,
        artistAvatar:
          channelAvatar ||
          getUniversalArtistAvatar('', artist) ||
          `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        isOfficialArtist: true,
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hq720.jpg`,
        hashtag: tag,
        tags: [tag, '#music short'],
        durationMs: Math.min(durationMs, 60000),
      });
    }

    return collected;
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

const DISCOVERY_ROTATION_POOLS = [
  { q: 'new music releases official artist #shorts', tag: '#new release' },
  { q: 'trending rap hip hop official channel #shorts', tag: '#hip hop' },
  { q: 'rai algerien moroccan rap official #shorts', tag: '#rai' },
  { q: 'live studio session acoustic official #shorts', tag: '#acoustic' },
  { q: 'top pop r&b official music video #shorts', tag: '#pop' },
  { q: 'afrobeats urban hit official artist #shorts', tag: '#afrobeats' },
  { q: 'chill vibes lofi official artist #shorts', tag: '#chill' },
  { q: 'electronic dance festival official artist #shorts', tag: '#electronic' },
];

/**
 * Fetches initial batch of ~12 Official Artist Music Shorts for Search carousel
 * (SearchScreen displays cleanly 10 cards from this batch and passes full list to infinite Reels).
 */
export async function fetchOfficialArtistShorts(
  followedArtistNames: string[] = [],
  userId = 'guest',
  forceRefresh = false
): Promise<ArtistMusicShort[]> {
  const uid = userId || 'guest';
  const mem = memoryCacheMap.get(uid);
  if (!forceRefresh && mem && Date.now() - mem.ts < SHORTS_CACHE_TTL_MS) {
    return mem.items;
  }

  if (!forceRefresh) {
    try {
      const storedRaw = await AsyncStorage.getItem(`${SHORTS_CACHE_KEY_PREFIX}${uid}`);
      if (storedRaw) {
        const parsed = JSON.parse(storedRaw);
        if (
          parsed?.ts &&
          Date.now() - parsed.ts < SHORTS_CACHE_TTL_MS &&
          Array.isArray(parsed.items) &&
          parsed.items.length >= 6
        ) {
          memoryCacheMap.set(uid, parsed);
          return parsed.items;
        }
      }
    } catch {
      // Fallback to fetch
    }
  }

  const batch = await fetchMoreArtistShortsBatch(0, [], followedArtistNames, uid);
  if (batch.length > 0) {
    const payload = { ts: Date.now(), items: batch };
    memoryCacheMap.set(uid, payload);
    AsyncStorage.setItem(`${SHORTS_CACHE_KEY_PREFIX}${uid}`, JSON.stringify(payload)).catch(() => {});
  }
  return batch;
}

/**
 * Infinite DNA-driven Shorts Batch Loader:
 * Called both on initial load (page 0) and seamlessly as the user swipes vertically
 * down the TikTok/Reels feed (page 1, 2, 3, ... unlimited).
 */
export async function fetchMoreArtistShortsBatch(
  pageIndex: number,
  excludeVideoIds: string[],
  followedArtistNames: string[] = [],
  userId = 'guest'
): Promise<ArtistMusicShort[]> {
  const uid = userId || 'guest';
  const excludeSet = new Set(excludeVideoIds);

  const [{ dnaArtists, dnaMoodQueries }, region] = await Promise.all([
    extractUserDnaSeeds(uid),
    getRegionProfile().catch(() => ({
      mode: 'auto_random' as const,
      countryCode: 'GLOBAL',
      countryName: 'Global',
      updatedAt: 0,
    })),
  ]);

  const seedPool = getRegionSeedQueries(region);
  const regionSeeds: string[] = [
    ...(seedPool.trending || []),
    ...(seedPool.stations || []),
    ...(seedPool.chill || []),
    ...(seedPool.energy || []),
  ];

  // Combine Followed Artists + Music DNA Artists cleanly with zero duplicates
  const combinedArtists = Array.from(
    new Set([...followedArtistNames, ...dnaArtists].filter(Boolean))
  );

  const querySpecs: Array<{ q: string; tag: string }> = [];

  // Rotate through user's DNA/Followed artists + similar music queries per pageIndex
  if (combinedArtists.length > 0) {
    const a1 = combinedArtists[pageIndex % combinedArtists.length];
    const a2 = combinedArtists[(pageIndex + 2) % combinedArtists.length];
    querySpecs.push({
      q: `${a1} ${pageIndex > 0 ? 'similar artists new music' : 'official music'} #shorts`,
      tag: deriveTagFromQuery('', a1),
    });
    if (a2 && a2 !== a1) {
      querySpecs.push({
        q: `${a2} official #shorts music`,
        tag: deriveTagFromQuery('', a2),
      });
    }
  }

  // Rotate DNA mood cluster query
  if (dnaMoodQueries.length > 0) {
    const mood = dnaMoodQueries[pageIndex % dnaMoodQueries.length];
    querySpecs.push({
      q: `${mood} official music #shorts`,
      tag: deriveTagFromQuery(mood, ''),
    });
  }

  // Rotate region discovery seed
  if (regionSeeds.length > 0) {
    const rSeed = regionSeeds[pageIndex % regionSeeds.length];
    querySpecs.push({
      q: `${rSeed} official #shorts`,
      tag: deriveTagFromQuery(rSeed, ''),
    });
  }

  // Always include 2 diverse rotating global discovery queries so unlimited scroll never stalls
  const rotA = DISCOVERY_ROTATION_POOLS[pageIndex % DISCOVERY_ROTATION_POOLS.length];
  const rotB = DISCOVERY_ROTATION_POOLS[(pageIndex + 3) % DISCOVERY_ROTATION_POOLS.length];
  querySpecs.push(rotA, rotB);

  const batchResults = await Promise.all(
    querySpecs.slice(0, 5).map((spec) => queryYouTubeArtistShorts(spec.q, spec.tag))
  );

  const artistCounts = new Map<string, number>();
  const freshShorts: ArtistMusicShort[] = [];

  // Interleave across queries so artists & genres stay varied
  const maxLen = Math.max(0, ...batchResults.map((arr) => arr.length));
  for (let row = 0; row < maxLen; row++) {
    for (const arr of batchResults) {
      const item = arr[row];
      if (!item || excludeSet.has(item.videoId)) continue;
      const artKey = item.artist.toLowerCase();
      const count = artistCounts.get(artKey) || 0;
      if (count >= 2) continue;

      excludeSet.add(item.videoId);
      artistCounts.set(artKey, count + 1);
      freshShorts.push(item);
      if (freshShorts.length >= 12) return freshShorts;
    }
  }

  return freshShorts;
}
