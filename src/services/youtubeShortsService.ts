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

const SHORTS_CACHE_KEY = '@a7music_artist_shorts_v1';
const SHORTS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

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

let memoryShortsCache: { ts: number; items: ArtistMusicShort[] } | null = null;

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
 * Checks whether the YouTube renderer represents an authentic Music Artist channel
 * (Official Artist badge, Verified music channel, VEVO, or Topic) rather than a random uploader.
 */
function verifyArtistChannel(ownerName: string, ownerBadges: any[] = []): boolean {
  if (!ownerName || isFakeArtistChannel(ownerName)) {
    // Allow explicit Official Artist Badge or "- Topic" / "VEVO" even if a word matched cautiously
    const hasArtistBadge = ownerBadges.some((b: any) => {
      const style = String(b?.metadataBadgeRenderer?.style || '').toUpperCase();
      const tooltip = String(b?.metadataBadgeRenderer?.tooltip || '').toLowerCase();
      return (
        style.includes('OFFICIAL_ARTIST') ||
        style.includes('MUSIC') ||
        tooltip.includes('official artist')
      );
    });
    if (!hasArtistBadge && !/vevo$/i.test(ownerName) && !/-\s*topic$/i.test(ownerName)) {
      return false;
    }
  }

  const hasVerifiedOrArtistBadge = ownerBadges.some((b: any) => {
    const style = String(b?.metadataBadgeRenderer?.style || '').toUpperCase();
    const tooltip = String(b?.metadataBadgeRenderer?.tooltip || '').toLowerCase();
    return (
      style.includes('VERIFIED') ||
      style.includes('OFFICIAL_ARTIST') ||
      tooltip.includes('verified') ||
      tooltip.includes('artist')
    );
  });

  const looksOfficialName =
    /vevo$/i.test(ownerName) ||
    /-\s*topic$/i.test(ownerName) ||
    /official/i.test(ownerName);

  // Accept verified/official artist channels, or clean artist channels with short music clips
  return hasVerifiedOrArtistBadge || looksOfficialName || !isFakeArtistChannel(ownerName);
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
        // EgIYAQ%3D%3D => Short duration (< 4 min) to prioritize Shorts & music teasers
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
      // A. Reel Shelf (true vertical YouTube Shorts shelf)
      if (item.reelShelfRenderer?.items && Array.isArray(item.reelShelfRenderer.items)) {
        for (const r of item.reelShelfRenderer.items) {
          const reel = r.reelItemRenderer;
          if (!reel?.videoId) continue;
          const rawTitle =
            reel.headline?.simpleText ||
            reel.headline?.runs?.map((x: any) => x.text).join('') ||
            'Music Short';
          const rawOwner =
            reel.navigationEndpoint?.reelWatchEndpoint?.overlay?.reelPlayerOverlayRenderer
              ?.reelPlayerHeaderSupportedRenderers?.reelPlayerHeaderRenderer?.channelTitleText
              ?.runs?.[0]?.text || '';
          if (isSpamTitleOrChannel(rawTitle, rawOwner)) continue;
          const artist = rawOwner ? cleanArtistName(rawOwner) : cleanArtistName(searchQuery.split('#')[0]);
          if (rawOwner && !verifyArtistChannel(rawOwner, [])) continue;
          const thumbs = reel.thumbnail?.thumbnails || [];
          const thumb =
            thumbs[thumbs.length - 1]?.url ||
            `https://i.ytimg.com/vi/${reel.videoId}/oar2.jpg`;
          collected.push({
            videoId: reel.videoId,
            title: cleanShortTitle(rawTitle),
            artist,
            artistAvatar: getUniversalArtistAvatar('', artist) || thumb,
            isOfficialArtist: true,
            thumbnail: thumb,
            hashtag: extractHashtag(rawTitle, fallbackTag),
            tags: [extractHashtag(rawTitle, fallbackTag), '#official artist'],
            durationMs: 45000,
          });
        }
      }

      // B. Standard short videoRenderer (< 90s or Shorts endpoint)
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

      // Keep strict vertical Shorts or short official music clips (<= 90s)
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

/**
 * Fetches curated Official Artist Music Shorts tailored dynamically to user's
 * followed artists, cached taste DNA, and local region — zero hardcoded artists.
 */
export async function fetchOfficialArtistShorts(
  followedArtistNames: string[] = [],
  forceRefresh = false
): Promise<ArtistMusicShort[]> {
  if (!forceRefresh && memoryShortsCache && Date.now() - memoryShortsCache.ts < SHORTS_CACHE_TTL_MS) {
    return memoryShortsCache.items;
  }

  if (!forceRefresh) {
    try {
      const storedRaw = await AsyncStorage.getItem(SHORTS_CACHE_KEY);
      if (storedRaw) {
        const parsed = JSON.parse(storedRaw);
        if (
          parsed?.ts &&
          Date.now() - parsed.ts < SHORTS_CACHE_TTL_MS &&
          Array.isArray(parsed.items) &&
          parsed.items.length >= 4
        ) {
          memoryShortsCache = parsed;
          return parsed.items;
        }
      }
    } catch {
      // Continue to network fetch
    }
  }

  // Build dynamic seed queries from followed artists + region seeds (no fixed artists)
  const region = await getRegionProfile().catch(() => ({
    mode: 'auto_random' as const,
    countryCode: 'GLOBAL',
    countryName: 'Global',
    updatedAt: 0,
  }));
  const seedPool = getRegionSeedQueries(region);
  const regionSeeds: string[] = [
    ...(seedPool.trending || []),
    ...(seedPool.stations || []),
  ].slice(0, 3);

  const querySpecs: Array<{ q: string; tag: string }> = [];

  // Prioritize followed artists first (up to 3)
  followedArtistNames
    .filter(Boolean)
    .slice(0, 3)
    .forEach((name) => {
      querySpecs.push({
        q: `${name} official #shorts music`,
        tag: deriveTagFromQuery('', name),
      });
    });

  // Add regional & genre official music shorts queries
  regionSeeds.forEach((seed) => {
    querySpecs.push({
      q: `${seed} official music #shorts`,
      tag: deriveTagFromQuery(seed, ''),
    });
  });

  if (querySpecs.length < 4) {
    querySpecs.push(
      { q: 'official music video teaser #shorts artist', tag: '#new release' },
      { q: 'trending pop rap official channel #shorts', tag: '#trending' },
      { q: 'arabic rap rai official artist #shorts', tag: '#arabic hip hop' }
    );
  }

  const batchResults = await Promise.all(
    querySpecs.slice(0, 5).map((spec) => queryYouTubeArtistShorts(spec.q, spec.tag))
  );

  // Interleave & deduplicate by videoId and cap max 2 shorts per artist for diversity
  const seenIds = new Set<string>();
  const artistCounts = new Map<string, number>();
  const finalShorts: ArtistMusicShort[] = [];

  for (const list of batchResults) {
    for (const item of list) {
      if (seenIds.has(item.videoId)) continue;
      const artKey = item.artist.toLowerCase();
      const count = artistCounts.get(artKey) || 0;
      if (count >= 2) continue;

      seenIds.add(item.videoId);
      artistCounts.set(artKey, count + 1);
      finalShorts.push(item);
      if (finalShorts.length >= 16) break;
    }
    if (finalShorts.length >= 16) break;
  }

  if (finalShorts.length > 0) {
    const payload = { ts: Date.now(), items: finalShorts };
    memoryShortsCache = payload;
    AsyncStorage.setItem(SHORTS_CACHE_KEY, JSON.stringify(payload)).catch(() => {});
  }

  return finalShorts;
}
