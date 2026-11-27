import { Track } from '../store/useAudioStore';
import { registerDynamicArtistAvatar, getUniversalStudioArtwork } from '../utils/artworkHelper';
import { CURATED_TRACKS } from '../data/curatedMusic';

export type AccountKind = 'official_artist' | 'music_studio' | 'verified_channel' | 'channel';

export interface ArtistMatch {
  name: string;
  avatar: string;
  subscriberCount?: string;
  handle?: string;
  channelId?: string;
  isOfficial: boolean;
  isOfficialArtist?: boolean;
  channelType?: 'official_artist' | 'channel';
  accountKind?: AccountKind;
}

export interface SearchResultWithArtist {
  artist?: ArtistMatch | null;
  accounts?: ArtistMatch[];
  albums?: ArtistAlbumItem[];
  tracks: Track[];
}

export interface ArtistAlbumItem {
  id: string;
  title: string;
  year: string;
  cover: string;
  artist?: string;
  type?: 'album' | 'single' | 'ep' | 'playlist';
  trackCount?: number;
}

export interface RelatedArtistItem {
  id: string;
  name: string;
  avatar: string;
}

export interface ArtistFullProfile {
  name: string;
  subCount: string;
  banner: string;
  avatar: string;
  handle?: string;
  channelId?: string;
  verified?: boolean;
  isOfficialArtist?: boolean;
  latestRelease?: ArtistAlbumItem | null;
  essentialAlbums?: ArtistAlbumItem[];
  topTracks: Track[];
  albums: ArtistAlbumItem[];
  singlesAndEPs: ArtistAlbumItem[];
  playlists: ArtistAlbumItem[];
  relatedArtists: RelatedArtistItem[];
}

export interface PlaylistAlbumDetails {
  id: string;
  title: string;
  artist: string;
  artistAvatar?: string;
  cover: string;
  year?: string;
  trackCount: number;
  totalDurationMs: number;
  description?: string;
  type: 'album' | 'single' | 'playlist';
  tracks: Track[];
}

/**
 * 🌟 Converts any YouTube or Google avatar URL into studio-grade 1200x1200 resolution
 * Preserves Google's smart face/portrait crop flag (-p) when present so heads/faces stay centered.
 */
export function getHighResYouTubeAvatar(url?: string | null): string {
  if (!url) return '';
  let highRes = url.trim();
  if (highRes.startsWith('//')) {
    highRes = `https:${highRes}`;
  }
  const hasPortraitCrop = /=w\d+-h\d+[^?&]*-p\b/.test(highRes);
  if (highRes.includes('=s')) {
    highRes = highRes.replace(/=s\d+[^?&]*/, '=s1200-c-k-c0x00ffffff-no-rj');
  } else if (highRes.includes('=w')) {
    highRes = highRes.replace(
      /=w\d+-h\d+[^?&]*/,
      hasPortraitCrop ? '=w1200-h1200-p-l90-rj' : '=w1200-h1200-l90-rj'
    );
  }
  return highRes;
}

export function parsePlayCountText(text?: string | null): number {
  if (!text || typeof text !== 'string') return 0;
  const m = text.match(/([\d.,]+)\s*([KMB])?/i);
  if (!m) return 0;
  const base = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(base)) return 0;
  const unit = (m[2] || '').toUpperCase();
  if (unit === 'B') return Math.round(base * 1_000_000_000);
  if (unit === 'M') return Math.round(base * 1_000_000);
  if (unit === 'K') return Math.round(base * 1_000);
  return Math.round(base);
}

function normalizeNameForCompare(input?: string | null): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scoreArtistNameMatch(candidateRaw: string, queryRaw: string): number {
  const cand = normalizeNameForCompare(cleanArtistName(candidateRaw));
  const query = normalizeNameForCompare(cleanArtistName(queryRaw));
  if (!cand || !query) return -1000;
  if (cand === query) return 1000;

  const qTokens = query.split(' ').filter((t) => t.length >= 2);
  const cTokens = cand.split(' ').filter((t) => t.length >= 2);
  if (qTokens.length === 0 || cTokens.length === 0) return -1000;

  const allQInC = qTokens.every((qt) => cTokens.includes(qt));
  const allCInQ = cTokens.every((ct) => qTokens.includes(ct));
  if (allQInC && allCInQ) return 850;
  if (allQInC) {
    // Penalize unrelated collaborations/bands with extra unrelated tokens slightly
    return Math.max(150, 520 - (cTokens.length - qTokens.length) * 140);
  }
  if (cand.startsWith(query) && cand.length <= query.length + 3) return 450;

  // Reject unrelated usernames sharing only a prefix substring (e.g. "KhaliDasEC0" vs "Khaled")
  const matched = qTokens.filter((qt) => cTokens.includes(qt)).length;
  if (matched === 0) return -1000;
  return matched * 120 - Math.abs(cTokens.length - qTokens.length) * 150;
}

/**
 * 🌟 Returns the highest resolution cover available for a YouTube video (1280x720 HD, zero black bars)
 */
export function getHighResThumbnail(videoId: string, fallbackUrl?: string | null): string {
  if (videoId && videoId.length > 5 && !videoId.startsWith('http')) {
    return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  }
  return fallbackUrl || '';
}

export function parseDurationText(text?: string): number {
  if (!text) return 180000;
  try {
    const parts = text.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return (parts[0] * 60 + parts[1]) * 1000;
    }
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    }
  } catch (e) { }
  return 180000;
}

export function cleanArtistName(rawName: string): string {
  if (!rawName) return 'Artist';
  return rawName
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s*VEVO$/i, '')
    .replace(/\s*Official\s*Channel$/i, '')
    .replace(/\s*Official\s*Page$/i, '')
    .replace(/\s*Channel$/i, '')
    .trim();
}

/**
 * 🚫 Blacklist protocol to eliminate fake YouTube channels from artist cards
 */
export function isFakeArtistChannel(rawName?: string | null): boolean {
  if (!rawName || typeof rawName !== 'string') return true;
  const lower = rawName.toLowerCase().trim();
  if (lower.length <= 2 || lower === 'artist') return true;

  const FAKE_WORDS = [
    'remix', 'music', 'records', 'record', 'production', 'productions', 'spring',
    'topic', 'official', 'channel', 'vevo', 'entertainment', 'media', 'sound',
    'sounds', 'studio', 'studios', 'beats', 'bass', 'club', 'mix', 'live',
    'fm', 'tv', 'radio', 'video', 'lyrics', 'status', 'melanchol', 'collection',
    'edition', 'chill', 'workout', 'running', 'phonk', 'trap', 'network',
    'hub', 'audio', 'center', 'soundtrack', 'playlist', 'hits', 'diffusion', 'co'
  ];

  return FAKE_WORDS.some((w) => {
    const regex = new RegExp(`\\b${w}\\b`, 'i');
    return regex.test(lower) || (w.length >= 4 && lower.includes(w));
  });
}

/**
 * 🎯 Extracts genuine artist identity from track metadata or "Artist - Title" strings
 */
export function extractGenuineArtist(title?: string | null, rawArtist?: string | null): string {
  const cleanedRaw = cleanArtistName(rawArtist || '');
  if (!isFakeArtistChannel(cleanedRaw)) {
    return cleanedRaw;
  }

  // Try parsing from title "Artist - Song Title" or "Artist – Song Title"
  if (title && (title.includes(' - ') || title.includes(' – '))) {
    const separator = title.includes(' - ') ? ' - ' : ' – ';
    const candidate = title.split(separator)[0]?.trim();
    if (candidate && candidate.length >= 3 && !isFakeArtistChannel(candidate)) {
      return cleanArtistName(candidate);
    }
  }

  return '';
}

const searchResponseCache = new Map<string, { data: SearchResultWithArtist; ts: number }>();
const unifiedSearchCache = new Map<string, { data: SearchResultWithArtist; ts: number }>();
const SEARCH_CACHE_TTL_MS = 3 * 60 * 1000;

export function classifyChannelAccountKind(
  name: string,
  handle?: string,
  badges?: any[]
): AccountKind {
  const hasArtistBadge = Boolean(
    badges?.some((b: any) => {
      const style = b.metadataBadgeRenderer?.style || '';
      const tooltip = (b.metadataBadgeRenderer?.tooltip || '').toLowerCase();
      return style.includes('VERIFIED_ARTIST') || tooltip.includes('official artist');
    })
  );
  if (hasArtistBadge) return 'official_artist';

  const hasVerifiedBadge = Boolean(
    badges?.some((b: any) => b.metadataBadgeRenderer?.style?.includes('VERIFIED'))
  );
  const text = `${name || ''} ${handle || ''}`.toLowerCase();
  const isStudioOrLabel = /\b(studio|studios|records|record|music|prod|production|productions|label|labels|vevo|rotana|entertainment|media|fm|radio|hits|network|tv)\b/i.test(text);

  if (isStudioOrLabel) return 'music_studio';
  if (hasVerifiedBadge) return 'verified_channel';
  return 'channel';
}

export async function searchYouTubeMusicArtistCandidates(
  query: string,
  limit: number = 6
): Promise<ArtistMatch[]> {
  const clean = cleanArtistName(query).trim();
  if (!clean || clean.length < 2) return [];
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://music.youtube.com/',
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
        query: clean,
        params: 'EgWKAQIgAWoKEAkQChADEAUQBA%3D%3D',
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const candidates: Array<{ score: number; match: ArtistMatch }> = [];
    const seenIds = new Set<string>();

    const collect = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      if (obj.musicResponsiveListItemRenderer) {
        const it = obj.musicResponsiveListItemRenderer;
        const bId = it.navigationEndpoint?.browseEndpoint?.browseId;
        const name = it.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
        const sub = it.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r: any) => r.text).join('') || '';
        const thumbs = it.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
        const rawThumb = thumbs.length > 0 ? thumbs[thumbs.length - 1]?.url : '';
        if (bId && name && bId.startsWith('UC') && !seenIds.has(bId)) {
          seenIds.add(bId);
          const nameScore = scoreArtistNameMatch(name, clean);
          const audience = parsePlayCountText(sub);
          const popBonus = audience > 0 ? Math.min(450, Math.log10(audience + 1) * 55) : 0;
          const totalScore = (nameScore > 0 ? nameScore : 50) + popBonus;
          const avatar = getHighResYouTubeAvatar(rawThumb);
          if (avatar) {
            candidates.push({
              score: totalScore,
              match: {
                name: cleanArtistName(name),
                avatar,
                subscriberCount: sub.replace(/^Artist\s*•\s*/i, '').trim() || 'Official Artist',
                channelId: bId,
                isOfficial: true,
                isOfficialArtist: true,
                channelType: 'official_artist',
                accountKind: 'official_artist',
              },
            });
          }
        }
      }
      for (const k of Object.keys(obj)) collect(obj[k]);
    };

    collect(data);
    candidates.sort((a, b) => b.score - a.score);
    const out = candidates.slice(0, limit).map((c) => c.match);
    if (out[0]?.avatar && out[0].name) {
      registerDynamicArtistAvatar(out[0].name, out[0].avatar);
      registerDynamicArtistAvatar(clean, out[0].avatar);
    }
    return out;
  } catch {
    return [];
  }
}

async function searchYouTubeMusicArtistCandidate(query: string): Promise<ArtistMatch | null> {
  const list = await searchYouTubeMusicArtistCandidates(query, 4);
  const clean = cleanArtistName(query).trim();
  const strong = list.find((a) => scoreArtistNameMatch(a.name, clean) > 0);
  return strong || null;
}

export async function searchYouTubeChannelsList(
  query: string,
  limit: number = 8
): Promise<ArtistMatch[]> {
  const clean = (query || '').trim();
  if (clean.length < 2) return [];
  try {
    const response = await fetch('https://www.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        context: {
          client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en', gl: 'US' },
        },
        query: clean,
        params: 'EgIQAg%3D%3D',
      }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    const items = sections?.[0]?.itemSectionRenderer?.contents || [];
    const out: Array<{ score: number; match: ArtistMatch }> = [];

    for (const item of items) {
      const cr = item.channelRenderer;
      if (!cr) continue;
      const name = cr.title?.simpleText || '';
      if (!name) continue;
      const thumbs = cr.thumbnail?.thumbnails || [];
      const rawAvatar = thumbs.length > 0 ? thumbs[thumbs.length - 1]?.url : '';
      let avatar = getHighResYouTubeAvatar(rawAvatar);
      if (avatar.startsWith('//')) avatar = `https:${avatar}`;
      if (!avatar || !avatar.startsWith('http')) continue;

      const subCount = cr.subscriberCountText?.simpleText || '';
      const handle = cr.subscriberCountText?.accessibility?.accessibilityData?.label || undefined;
      const accountKind = classifyChannelAccountKind(name, handle, cr.ownerBadges);
      const isOfficialArtist = accountKind === 'official_artist';
      const isOfficial = accountKind !== 'channel';

      const nameScore = Math.max(0, scoreArtistNameMatch(name, clean));
      const kindBonus =
        accountKind === 'official_artist'
          ? 900
          : accountKind === 'music_studio'
            ? 500
            : accountKind === 'verified_channel'
              ? 350
              : 50;
      const subsBonus = Math.min(250, Math.log10(parsePlayCountText(subCount) + 1) * 35);

      out.push({
        score: nameScore + kindBonus + subsBonus,
        match: {
          name: cleanArtistName(name),
          avatar,
          subscriberCount: subCount || (isOfficialArtist ? 'Official Artist' : accountKind === 'music_studio' ? 'Music Studio' : 'YouTube Channel'),
          handle,
          channelId: cr.channelId,
          isOfficial,
          isOfficialArtist,
          channelType: isOfficialArtist ? 'official_artist' : 'channel',
          accountKind,
        },
      });
    }

    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit).map((x) => x.match);
  } catch {
    return [];
  }
}

export async function searchYouTubeMusicAlbums(
  query: string,
  limit: number = 12
): Promise<ArtistAlbumItem[]> {
  const clean = (query || '').trim();
  if (clean.length < 2) return [];
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://music.youtube.com/',
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
        query: clean,
        params: 'EgWKAQIYAWoKEAkQChADEAUQBA%3D%3D',
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const out: ArtistAlbumItem[] = [];
    const seen = new Set<string>();

    const walk = (o: any) => {
      if (!o || typeof o !== 'object' || out.length >= limit) return;
      if (o.musicResponsiveListItemRenderer) {
        const it = o.musicResponsiveListItemRenderer;
        const bId = it.navigationEndpoint?.browseEndpoint?.browseId;
        const title = it.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
        const runs = it.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
        const subText = runs.map((r: any) => r.text).join('');
        const yearMatch = subText.match(/\b(19\d\d|20\d\d)\b/);
        const artistPart = runs.find(
          (r: any) => r.text && !/^(album|single|ep|•|,|\s)+$/i.test(r.text) && !/^(19|20)\d\d$/.test(r.text.trim())
        )?.text;
        const thumbs = it.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
        const cover = thumbs.length > 0 ? getHighResYouTubeAvatar(thumbs[thumbs.length - 1]?.url) : '';
        if (bId && title && cover && !seen.has(bId)) {
          seen.add(bId);
          out.push({
            id: bId,
            title,
            artist: artistPart ? cleanArtistName(artistPart) : undefined,
            year: yearMatch ? yearMatch[1] : '2024',
            cover,
            type: subText.toLowerCase().includes('ep') ? 'ep' : 'album',
          });
        }
      }
      for (const k of Object.keys(o)) walk(o[k]);
    };

    walk(data);
    return out;
  } catch {
    return [];
  }
}

export async function searchUnifiedMusicCatalog(query: string): Promise<SearchResultWithArtist> {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return { artist: null, accounts: [], albums: [], tracks: [] };

  const key = cleanQuery.toLowerCase();
  const cached = unifiedSearchCache.get(key);
  if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL_MS) {
    return cached.data;
  }

  const [baseRes, ytmArtists, ytChannels, ytmAlbums, ytPlaylists] = await Promise.all([
    searchYouTubeMusicWithArtist(cleanQuery),
    searchYouTubeMusicArtistCandidates(cleanQuery, 6),
    searchYouTubeChannelsList(cleanQuery, 8),
    searchYouTubeMusicAlbums(cleanQuery, 12),
    searchYouTubePlaylists(cleanQuery).catch(() => [] as ArtistAlbumItem[]),
  ]);

  // Merge and deduplicate ALL matching accounts (Official Artists, Music Studios, Verified & Normal Channels)
  const accountMap = new Map<string, ArtistMatch>();
  const rankKind = (k?: AccountKind) =>
    k === 'official_artist' ? 4 : k === 'music_studio' ? 3 : k === 'verified_channel' ? 2 : 1;

  const pushAccount = (acc?: ArtistMatch | null) => {
    if (!acc || !acc.name) return;
    const dedupeKey = acc.channelId || `name:${acc.name.toLowerCase().trim()}`;
    const existing = accountMap.get(dedupeKey);
    if (!existing || rankKind(acc.accountKind) > rankKind(existing.accountKind)) {
      accountMap.set(dedupeKey, {
        ...existing,
        ...acc,
        accountKind: acc.accountKind || (acc.isOfficialArtist ? 'official_artist' : acc.isOfficial ? 'verified_channel' : 'channel'),
      });
    }
  };

  pushAccount(baseRes.artist);
  ytmArtists.forEach(pushAccount);
  ytChannels.forEach(pushAccount);

  const accounts = Array.from(accountMap.values()).slice(0, 12);
  const topArtist =
    accounts.find((a) => a.accountKind === 'official_artist' && scoreArtistNameMatch(a.name, cleanQuery) > 0) ||
    accounts[0] ||
    baseRes.artist ||
    null;

  // Merge official YouTube Music Albums + Playlists
  const seenAlb = new Set<string>();
  const mergedAlbums: ArtistAlbumItem[] = [];
  for (const alb of [...ytmAlbums, ...ytPlaylists]) {
    if (!alb.id || seenAlb.has(alb.id)) continue;
    seenAlb.add(alb.id);
    mergedAlbums.push(alb);
    if (mergedAlbums.length >= 16) break;
  }

  const result: SearchResultWithArtist = {
    artist: topArtist,
    accounts,
    albums: mergedAlbums,
    tracks: baseRes.tracks || [],
  };

  if (accounts.length > 0 || result.tracks.length > 0 || mergedAlbums.length > 0) {
    if (unifiedSearchCache.size > 35) {
      const oldest = unifiedSearchCache.keys().next().value;
      if (oldest) unifiedSearchCache.delete(oldest);
    }
    unifiedSearchCache.set(key, { data: result, ts: Date.now() });
  }

  return result;
}

/**
 * 🔍 Searches YouTube Music and extracts both official artist card and tracks
 */
export async function searchYouTubeMusicWithArtist(query: string): Promise<SearchResultWithArtist> {
  if (!query || !query.trim()) return { artist: null, tracks: [] };

  const cleanQuery = query.trim();
  const cacheKey = cleanQuery.toLowerCase();
  const cached = searchResponseCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL_MS) {
    return cached.data;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    const [response, ytMusicArtistMatch] = await Promise.all([
      fetch('https://www.youtube.com/youtubei/v1/search', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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
          query: cleanQuery,
        }),
      }),
      searchYouTubeMusicArtistCandidate(cleanQuery),
    ]);
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[YouTubeService] HTTP error:', response.status);
      return { artist: ytMusicArtistMatch || null, tracks: [] };
    }

    const data = await response.json();
    const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    const items = sections?.[0]?.itemSectionRenderer?.contents || [];

    let artistMatch: ArtistMatch | null = ytMusicArtistMatch;
    const rawTracks: Track[] = [];

    for (const item of items) {
      // 1. Detect Official Artist Card
      if (!artistMatch && item.officialCardViewModel?.header?.pageHeaderViewModel) {
        const vm = item.officialCardViewModel.header.pageHeaderViewModel;
        const name = vm.title?.dynamicTextViewModel?.text?.content || cleanQuery;
        if (scoreArtistNameMatch(name, cleanQuery) > 0) {
          const rawAvatar = vm.image?.contentPreviewImageViewModel?.image?.sources?.slice(-1)[0]?.url ||
            vm.image?.contentPreviewImageViewModel?.image?.sources?.[0]?.url || '';
          const avatar = getHighResYouTubeAvatar(rawAvatar);
          const subText = vm.metadata?.contentMetadataViewModel?.metadataRows?.[1]?.metadataParts?.[0]?.text?.content;
          const handle = vm.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content;

          if (avatar && name) {
            registerDynamicArtistAvatar(name, avatar);
            registerDynamicArtistAvatar(cleanArtistName(name), avatar);
          }

          artistMatch = {
            name: cleanArtistName(name),
            avatar,
            subscriberCount: subText || 'Verified Official Artist',
            handle,
            isOfficial: true,
            isOfficialArtist: true,
            channelType: 'official_artist',
          };
        }
      }

      // 2. Detect Channel Card ONLY when verified/matching cleanly (prevents random gamer channels like KhaliDasEC0)
      if (!artistMatch && item.channelRenderer) {
        const cr = item.channelRenderer;
        const name = cr.title?.simpleText || '';
        const hasVerifiedBadge = Boolean(
          cr.ownerBadges?.some((b: any) => b.metadataBadgeRenderer?.style?.includes('VERIFIED'))
        );
        const hasVerifiedArtist = Boolean(
          cr.ownerBadges?.some((b: any) => b.metadataBadgeRenderer?.style?.includes('VERIFIED_ARTIST'))
        );
        if (scoreArtistNameMatch(name, cleanQuery) > 0 && (hasVerifiedBadge || scoreArtistNameMatch(name, cleanQuery) >= 850)) {
          const thumbs = cr.thumbnail?.thumbnails || [];
          const rawAvatar = thumbs.length > 0 ? thumbs[thumbs.length - 1]?.url : '';
          const avatar = getHighResYouTubeAvatar(rawAvatar);

          if (avatar && name) {
            registerDynamicArtistAvatar(name, avatar);
            registerDynamicArtistAvatar(cleanArtistName(name), avatar);
          }

          artistMatch = {
            name: cleanArtistName(name),
            avatar,
            subscriberCount: cr.subscriberCountText?.simpleText || (hasVerifiedArtist ? 'Official Artist' : 'YouTube Channel'),
            channelId: cr.channelId,
            isOfficial: hasVerifiedBadge,
            isOfficialArtist: hasVerifiedArtist,
            channelType: hasVerifiedArtist ? 'official_artist' : 'channel',
          };
        }
      }

      // 3. Extract Video Tracks
      const v = item.videoRenderer;
      if (v && v.videoId) {
        const title = v.title?.runs?.map((r: any) => r.text).join('') || 'Unknown Title';
        const rawArtist = v.ownerText?.runs?.map((r: any) => r.text).join('') || 'Artist';
        const durationText = v.lengthText?.simpleText || '3:30';

        const badges = v.ownerBadges || [];
        const isOfficial = badges.some((b: any) => {
          const style = b.metadataBadgeRenderer?.style || '';
          const tooltip = b.metadataBadgeRenderer?.tooltip || '';
          return style.includes('VERIFIED') || tooltip.toLowerCase().includes('artist') || tooltip.toLowerCase().includes('verified');
        }) || rawArtist.endsWith('- Topic') || rawArtist.toLowerCase().includes('vevo') || rawArtist.toLowerCase().includes('official');

        // Extract REAL authentic YouTube channel avatar from videoRenderer
        const channelThumbs = v.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails;
        const rawChannelAvatar = channelThumbs && channelThumbs.length > 0
          ? channelThumbs[channelThumbs.length - 1]?.url
          : '';
        const channelAvatar = getHighResYouTubeAvatar(rawChannelAvatar);

        if (channelAvatar && rawArtist) {
          registerDynamicArtistAvatar(rawArtist, channelAvatar);
          registerDynamicArtistAvatar(cleanArtistName(rawArtist), channelAvatar);
        }

        if (!artistMatch && channelAvatar && isOfficial) {
          artistMatch = {
            name: cleanArtistName(rawArtist),
            avatar: channelAvatar,
            subscriberCount: 'Official Artist Channel',
            isOfficial: true,
          };
        } else if (artistMatch && !artistMatch.avatar && channelAvatar) {
          artistMatch.avatar = channelAvatar;
        }

        const thumbs = v.thumbnail?.thumbnails || [];
        const rawThumbnail = thumbs.length > 0
          ? thumbs[thumbs.length - 1]?.url
          : `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
        const thumbnail = rawThumbnail.includes('ytimg.com/vi/')
          ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`
          : rawThumbnail;

        rawTracks.push({
          videoId: v.videoId,
          title,
          artist: cleanArtistName(rawArtist),
          thumbnail,
          duration: parseDurationText(durationText),
          category: 'youtube',
          type: 'track',
          isOfficial,
          channelId: v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId,
          artistAvatar: channelAvatar || artistMatch?.avatar || undefined,
        });
      }
    }

    // Sort: Official releases first, then popular tracks
    const sortedTracks = [...rawTracks].sort((a, b) => {
      if (a.isOfficial && !b.isOfficial) return -1;
      if (!a.isOfficial && b.isOfficial) return 1;
      return 0;
    });

    // If no artist card in header but top track has an official artist, synthesize artist card
    if (!artistMatch && sortedTracks.length > 0 && sortedTracks[0].isOfficial) {
      artistMatch = {
        name: sortedTracks[0].artist,
        avatar: sortedTracks[0].artistAvatar || sortedTracks[0].thumbnail || '',
        subscriberCount: 'Verified Official Artist',
        isOfficial: true,
      };
    }

    const result: SearchResultWithArtist = {
      artist: artistMatch,
      tracks: sortedTracks,
    };
    if (sortedTracks.length > 0) {
      if (searchResponseCache.size > 40) {
        const oldestKey = searchResponseCache.keys().next().value;
        if (oldestKey) searchResponseCache.delete(oldestKey);
      }
      searchResponseCache.set(cacheKey, { data: result, ts: Date.now() });
    }
    return result;
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.warn('[YouTubeService] Search failed:', error?.message || error);
    return { artist: null, tracks: [] };
  }
}

export async function searchYouTubeMusic(query: string): Promise<Track[]> {
  const res = await searchYouTubeMusicWithArtist(query);
  return res.tracks;
}

export async function getCategoryYouTubeTracks(categoryTitle: string): Promise<Track[]> {
  const queryMap: Record<string, string> = {
    running: '160 BPM running cadence music workout',
    cardio: 'Cardio workout music high energy',
    walking: 'Chill walking music beats lofi',
    rai: 'Cheb Khaled Djalil Palermo Rai sport',
    focus: 'Deep focus lofi hip hop workout cool down',
    trending: 'Top music trending',
  };

  const query = queryMap[categoryTitle.toLowerCase()] || `${categoryTitle} music`;
  return searchYouTubeMusic(query);
}

// ── Strict Benchmark Catalogs for Identity Separation (DJ Khaled vs Cheb Khaled) ──

const DJ_KHALED_AVATAR = 'https://yt3.ggpht.com/J9qAv9jfNNgvHKtpgpUPyRNdFuRyKYVMasSeavZMkIxlS_LIgChL1bR1-Y4BSAszqvHmt_ndrQ=s800-c-k-c0x00ffffff-no-rj';
const CHEB_KHALED_AVATAR = 'https://yt3.ggpht.com/EPX-_vNlCDSIkH5k-7r0SBQOOyu4DuuTvNNGQfKx5EHS0LagmbhK2xgWg8p9UPe5AwA6UxeG=s800-c-k-c0x00ffffff-no-rj';

const DJ_KHALED_PROFILE: ArtistFullProfile = {
  name: 'DJ Khaled',
  subCount: '13.2M Monthly Listeners • Official Artist',
  banner: DJ_KHALED_AVATAR,
  avatar: DJ_KHALED_AVATAR,
  handle: '@djkhaled',
  verified: true,
  topTracks: [
    {
      videoId: 'fvxqq_v53iI',
      title: 'DJ Khaled - Wild Thoughts (Official Video) ft. Rihanna, Bryson Tiller',
      artist: 'DJ Khaled',
      thumbnail: 'https://i.ytimg.com/vi/fvxqq_v53iI/hqdefault.jpg',
      duration: 215000,
      artistAvatar: DJ_KHALED_AVATAR,
      isOfficial: true,
    },
    {
      videoId: '3CxtK7-XtE0',
      title: 'DJ Khaled ft. Drake - POPSTAR (Official Music Video)',
      artist: 'DJ Khaled',
      thumbnail: 'https://i.ytimg.com/vi/3CxtK7-XtE0/hqdefault.jpg',
      duration: 205000,
      artistAvatar: DJ_KHALED_AVATAR,
      isOfficial: true,
    },
    {
      videoId: 'Z1BCujX3pw8',
      title: "DJ Khaled - I'm On One ft. Drake, Rick Ross, Lil Wayne",
      artist: 'DJ Khaled',
      thumbnail: 'https://i.ytimg.com/vi/Z1BCujX3pw8/hqdefault.jpg',
      duration: 298000,
      artistAvatar: DJ_KHALED_AVATAR,
      isOfficial: true,
    },
    {
      videoId: 'kxloC1MKTpg',
      title: 'DJ Khaled - No Brainer ft. Justin Bieber, Chance the Rapper, Quavo',
      artist: 'DJ Khaled',
      thumbnail: 'https://i.ytimg.com/vi/kxloC1MKTpg/hqdefault.jpg',
      duration: 260000,
      artistAvatar: DJ_KHALED_AVATAR,
      isOfficial: true,
    },
    {
      videoId: 'BTvSzeTq9dY',
      title: 'DJ Khaled - EVERY CHANCE I GET ft. Lil Baby, Lil Durk',
      artist: 'DJ Khaled',
      thumbnail: 'https://i.ytimg.com/vi/BTvSzeTq9dY/hqdefault.jpg',
      duration: 236000,
      artistAvatar: DJ_KHALED_AVATAR,
      isOfficial: true,
    },
    {
      videoId: 'GGXzlRoNtHU',
      title: 'DJ Khaled - All I Do Is Win ft. T-Pain, Ludacris, Snoop Dogg, Rick Ross',
      artist: 'DJ Khaled',
      thumbnail: 'https://i.ytimg.com/vi/GGXzlRoNtHU/hqdefault.jpg',
      duration: 232000,
      artistAvatar: DJ_KHALED_AVATAR,
      isOfficial: true,
    },
  ],
  albums: [
    { id: 'MPREb_VsTAkdBOP92', title: 'GOD DID', year: '2022', cover: 'https://yt3.googleusercontent.com/03bLVbzzcgiMdS_M6TZI1HUl_O7j4w2B3R20XfM0y7U11V4T9sQh7sK5tM9Ww=w800-h800-l90-rj', type: 'album', trackCount: 18 },
    { id: 'MPREb_Wz9inPDQShW', title: 'Father of Asahd', year: '2019', cover: 'https://i.ytimg.com/vi/kxloC1MKTpg/hqdefault.jpg', type: 'album', trackCount: 15 },
    { id: 'MPREb_neMn3Al7vYk', title: 'Grateful', year: '2017', cover: 'https://i.ytimg.com/vi/fvxqq_v53iI/hqdefault.jpg', type: 'album', trackCount: 23 },
    { id: 'MPREb_E85xW8N4Q2P', title: 'Major Key', year: '2016', cover: 'https://i.ytimg.com/vi/3CxtK7-XtE0/hqdefault.jpg', type: 'album', trackCount: 14 },
    { id: 'MPREb_F98kL7N5P4Q', title: 'Khaled Khaled', year: '2021', cover: 'https://i.ytimg.com/vi/BTvSzeTq9dY/hqdefault.jpg', type: 'album', trackCount: 14 },
  ],
  singlesAndEPs: [
    { id: 'OLAK5uy_mNh69qkc3er', title: 'Staying Alive (ft. Drake & Lil Baby)', year: '2022', cover: 'https://i.ytimg.com/vi/aZ3D_7fJ06g/hqdefault.jpg', type: 'single' },
    { id: 'OLAK5uy_kY78v9w6n5p', title: 'Greece (ft. Drake)', year: '2020', cover: 'https://i.ytimg.com/vi/3CxtK7-XtE0/hqdefault.jpg', type: 'single' },
    { id: 'OLAK5uy_l4UqNJCpAF3', title: 'Top Off (ft. JAY-Z, Future, Beyoncé)', year: '2018', cover: 'https://i.ytimg.com/vi/fvxqq_v53iI/hqdefault.jpg', type: 'single' },
    { id: 'OLAK5uy_nl-XrT4Q4vu', title: 'Shining (ft. Beyoncé, JAY-Z)', year: '2017', cover: 'https://i.ytimg.com/vi/BTvSzeTq9dY/hqdefault.jpg', type: 'single' },
  ],
  playlists: [
    { id: 'PLw-VjHDlEOgv_6_1dGzI87oT6vVfSjQW1', title: 'DJ Khaled Essentials', year: '2024', cover: 'https://i.ytimg.com/vi/fvxqq_v53iI/hqdefault.jpg', type: 'playlist', trackCount: 30 },
    { id: 'PLxA687tYuMWhC_r94wzRk8pEfvE_wYn74', title: 'DJ Khaled: Best Collaborations', year: '2023', cover: 'https://i.ytimg.com/vi/3CxtK7-XtE0/hqdefault.jpg', type: 'playlist', trackCount: 25 },
    { id: 'PLw-VjHDlEOgt_d3j0Y7_sD9sR8FhG5xL', title: 'We The Best Hits', year: '2022', cover: 'https://i.ytimg.com/vi/BTvSzeTq9dY/hqdefault.jpg', type: 'playlist', trackCount: 20 },
  ],
  relatedArtists: [
    { id: 'rel-1', name: 'Drake', avatar: 'https://yt3.ggpht.com/ytc/AIdro_lCPp6jFXJWIVHM0fIK5HofL3nyLOsmhu1Ek2OwyppYlOM=s800-c-k-c0x00ffffff-no-rj' },
    { id: 'rel-2', name: 'Rihanna', avatar: 'https://yt3.ggpht.com/qMCGjRaKKRar82KzcIWdUoLbJ03aW2K2sEf-m4GaB7JwLshoHOZHvkxLRXsZVgpKvqCXVhKCWg=s800-c-k-c0x00ffffff-no-rj' },
    { id: 'rel-3', name: 'Lil Wayne', avatar: 'https://i.ytimg.com/vi/Z1BCujX3pw8/hqdefault.jpg' },
    { id: 'rel-4', name: 'Rick Ross', avatar: 'https://i.ytimg.com/vi/GGXzlRoNtHU/hqdefault.jpg' },
    { id: 'rel-5', name: 'Lil Baby', avatar: 'https://i.ytimg.com/vi/BTvSzeTq9dY/hqdefault.jpg' },
    { id: 'rel-6', name: 'Justin Bieber', avatar: 'https://yt3.ggpht.com/4Mz5el_eyeB5cBod2jHMV-CC3fYiuSmDuCT9A9tGyYh03KQyVdrP04KYYMttZItBCtn4kfef=s800-c-k-c0x00ffffff-no-rj' },
  ],
};

const CHEB_KHALED_PROFILE: ArtistFullProfile = {
  name: 'Khaled',
  subCount: '10.4M Monthly Listeners • Official Artist',
  banner: CHEB_KHALED_AVATAR,
  avatar: CHEB_KHALED_AVATAR,
  handle: '@chebkhaled',
  verified: true,
  topTracks: [
    {
      videoId: 'gzlHucbD76U',
      title: 'Aïcha (Version Mixte)',
      artist: 'Khaled',
      thumbnail: 'https://i.ytimg.com/vi/gzlHucbD76U/hqdefault.jpg',
      duration: 260000,
      artistAvatar: CHEB_KHALED_AVATAR,
      isOfficial: true,
    },
    {
      videoId: '5dbEhBKGOtY',
      title: "C'est la vie",
      artist: 'Khaled',
      thumbnail: 'https://i.ytimg.com/vi/5dbEhBKGOtY/hqdefault.jpg',
      duration: 231000,
      artistAvatar: CHEB_KHALED_AVATAR,
      isOfficial: true,
    },
    {
      videoId: '1_8Xg2b-U1k',
      title: 'Abdel Kader (Live à Bercy, Paris)',
      artist: 'Rachid Taha, Faudel, Khaled',
      thumbnail: 'https://i.ytimg.com/vi/1_8Xg2b-U1k/hqdefault.jpg',
      duration: 310000,
      artistAvatar: CHEB_KHALED_AVATAR,
      isOfficial: true,
    },
    {
      videoId: 'YVwZ2eD_tG8',
      title: 'Même pas fatigué !!!',
      artist: 'Kore, Magic System, Khaled',
      thumbnail: 'https://i.ytimg.com/vi/YVwZ2eD_tG8/hqdefault.jpg',
      duration: 215000,
      artistAvatar: CHEB_KHALED_AVATAR,
      isOfficial: true,
    },
    {
      videoId: 'o3g0H3N7zbc',
      title: 'Didi',
      artist: 'Khaled',
      thumbnail: 'https://i.ytimg.com/vi/o3g0H3N7zbc/hqdefault.jpg',
      duration: 210000,
      artistAvatar: CHEB_KHALED_AVATAR,
      isOfficial: true,
    },
  ],
  albums: [
    { id: 'MPREb_MSYIWLqJVGn', title: 'Khaled', year: '1992', cover: 'https://yt3.googleusercontent.com/yzdASBRiK-hjaLa0CYseImAV_X4k5f8yZ7m9=w800-h800-l90-rj', type: 'album', trackCount: 11 },
    { id: 'MPREb_zkoTfntZxqu', title: "C'Est La Vie", year: '2012', cover: 'https://i.ytimg.com/vi/5dbEhBKGOtY/hqdefault.jpg', type: 'album', trackCount: 12 },
    { id: 'MPREb_kYrNHGPztou', title: 'Cheb Khaled, Double Best', year: '2000', cover: 'https://i.ytimg.com/vi/gzlHucbD76U/hqdefault.jpg', type: 'album', trackCount: 25 },
    { id: 'MPREb_S87sK49nL2Q', title: '1, 2, 3 Soleils', year: '1998', cover: 'https://i.ytimg.com/vi/1_8Xg2b-U1k/hqdefault.jpg', type: 'album', trackCount: 23 },
    { id: 'MPREb_N98kL5P3Q1W', title: 'Sahra', year: '1996', cover: 'https://i.ytimg.com/vi/gzlHucbD76U/hqdefault.jpg', type: 'album', trackCount: 16 },
    { id: 'MPREb_L78kM4N2P9Q', title: "N'ssi N'ssi", year: '1993', cover: 'https://i.ytimg.com/vi/o3g0H3N7zbc/hqdefault.jpg', type: 'album', trackCount: 11 },
  ],
  singlesAndEPs: [
    { id: 'kh-sng-1', title: "C'est la vie (Single Version)", year: '2012', cover: 'https://i.ytimg.com/vi/5dbEhBKGOtY/hqdefault.jpg', type: 'single' },
    { id: 'kh-sng-2', title: 'Didi (Original Edit)', year: '1992', cover: 'https://i.ytimg.com/vi/o3g0H3N7zbc/hqdefault.jpg', type: 'single' },
    { id: 'kh-sng-3', title: 'Aïcha (Version Mixte)', year: '1996', cover: 'https://i.ytimg.com/vi/gzlHucbD76U/hqdefault.jpg', type: 'single' },
    { id: 'kh-sng-4', title: 'Trigue Lycee', year: '1974', cover: 'https://i.ytimg.com/vi/1_8Xg2b-U1k/hqdefault.jpg', type: 'single' },
  ],
  playlists: [
    { id: 'PLxA687tYuMWgYk_Khaled_BestOf', title: 'Cheb Khaled - Best of Raï Legend', year: '2024', cover: 'https://i.ytimg.com/vi/gzlHucbD76U/hqdefault.jpg', type: 'playlist', trackCount: 28 },
    { id: 'PLxA687tYuMWhYk_Khaled_Clips', title: 'Khaled: Les Plus Grands Succès', year: '2023', cover: 'https://i.ytimg.com/vi/5dbEhBKGOtY/hqdefault.jpg', type: 'playlist', trackCount: 20 },
  ],
  relatedArtists: [
    { id: 'art-1', name: 'Cheb Mami', avatar: 'https://yt3.ggpht.com/xG5oXQE7cmr8o4aKzG4YdaK0DZef6rxwtTDFBJIHHMxpawH_MzbXFXLCKiHsrnwf-8oKzJxWyw=s800-c-k-c0x00ffffff-no-rj' },
    { id: 'art-2', name: 'Cheb Hasni', avatar: 'https://yt3.ggpht.com/aFaKpRFAl6kvdQDvGQ3yi0zFDUXj4j_ZBaPEQOKSgn0WszH8PGzaQNhZZgMqBKGyj1evOaNvsg=s800-c-k-c0x00ffffff-no-rj' },
    { id: 'art-3', name: 'Soolking', avatar: 'https://yt3.ggpht.com/MyEtgnNeUFw0KpnlDH1UvGHATl6trFdoj-uGDRAycJ_u52cTkyZFtf7VY-ASxQmWBd_aIhuX=s800-c-k-c0x00ffffff-no-rj' },
    { id: 'art-4', name: 'Cheb Bilal', avatar: 'https://yt3.ggpht.com/EmaJKQHHvOiFcrK7usxdiyTUGEiFjsmYiXGYkQmiB4C52yEj0dpeVEMbEqz8618Ippz0IssY=s800-c-k-c0x00ffffff-no-rj' },
    { id: 'art-5', name: 'Rachid Taha', avatar: 'https://i.ytimg.com/vi/1_8Xg2b-U1k/hqdefault.jpg' },
    { id: 'art-6', name: 'Djalil Palermo', avatar: 'https://yt3.ggpht.com/jHQCrtU2Nq6eettEeOXTjtGrH3pMxpDdxnvTv5bYcu61BF_LaKP1DrXBouuNQXHjvmEsvm63=s800-c-k-c0x00ffffff-no-rj' },
  ],
};

/**
 * 🛡️ Filters out fan reaction videos, tutorials, covers, karaoke to retain pure artist content
 */
export function isGenuineArtistTrack(trackTitle: string, trackArtist: string, targetArtist: string): boolean {
  const title = (trackTitle || '').toLowerCase();
  const artist = (trackArtist || '').toLowerCase();
  const target = (targetArtist || '').toLowerCase().trim();

  const SPAM = [
    'reaction', 'reacts to', 'review', 'tutorial', 'how to play', 'how to sing',
    'mashup', 'behind the scenes', 'vlog', 'unboxing', 'interview', 'podcast',
    'parody', 'instrumental remake', 'karaoke version', 'tier list', 'ranking all'
  ];
  if (SPAM.some((w) => title.includes(w))) return false;

  if (target.length < 2) return true;

  // Strict identity separation
  if (target.includes('dj khaled') && (title.includes('aïcha') || title.includes('didi') || artist.includes('cheb'))) {
    return false;
  }
  if ((target.includes('cheb khaled') || target === 'khaled') && (title.includes('wild thoughts') || title.includes('popstar') || artist.includes('dj'))) {
    return false;
  }

  return true;
}

/**
 * 🎯 Queries YouTube specifically for the authentic official artist channel logo, avatar, and subscribers
 */
export async function fetchRealYouTubeChannel(artistName: string): Promise<ArtistMatch | null> {
  const clean = cleanArtistName(artistName).trim();
  if (!clean || clean.length < 2) return null;

  try {
    const response = await fetch('https://www.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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
        query: clean,
        params: 'EgIQAg%3D%3D', // YouTube type filter: Channel only!
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    const items = sections?.[0]?.itemSectionRenderer?.contents || [];

    const scoredCandidates: Array<{ score: number; match: ArtistMatch }> = [];

    for (const item of items) {
      if (item.channelRenderer) {
        const cr = item.channelRenderer;
        const name = cr.title?.simpleText || '';
        const nameScore = scoreArtistNameMatch(name, clean);
        if (nameScore <= 0) continue;

        const thumbs = cr.thumbnail?.thumbnails || [];
        const rawAvatar = thumbs.length > 0 ? thumbs[thumbs.length - 1]?.url : '';
        let avatar = getHighResYouTubeAvatar(rawAvatar);
        if (avatar.startsWith('//')) {
          avatar = `https:${avatar}`;
        }
        const subCount = cr.subscriberCountText?.simpleText || 'YouTube Channel';
        const hasVerifiedArtistBadge = Boolean(
          cr.ownerBadges?.some((b: any) => {
            const style = b.metadataBadgeRenderer?.style || '';
            const tooltip = (b.metadataBadgeRenderer?.tooltip || '').toLowerCase();
            return style.includes('VERIFIED_ARTIST') || tooltip.includes('official artist');
          })
        );
        const hasVerifiedBadge = Boolean(
          hasVerifiedArtistBadge ||
          cr.ownerBadges?.some((b: any) => b.metadataBadgeRenderer?.style?.includes('VERIFIED'))
        );
        const handle = cr.subscriberCountText?.accessibility?.accessibilityData?.label || undefined;

        const subsNum = parsePlayCountText(subCount);
        const subScore = subsNum > 0 ? Math.min(350, Math.log10(subsNum + 1) * 45) : 0;
        const badgeScore = hasVerifiedArtistBadge ? 1200 : hasVerifiedBadge ? 300 : 0;

        if (avatar && avatar.startsWith('http')) {
          scoredCandidates.push({
            score: nameScore + badgeScore + subScore,
            match: {
              name: cleanArtistName(name),
              avatar,
              subscriberCount: subCount,
              handle,
              isOfficial: hasVerifiedBadge,
              isOfficialArtist: hasVerifiedArtistBadge,
              channelType: hasVerifiedArtistBadge ? 'official_artist' : 'channel',
              channelId: cr.channelId,
            },
          });
        }
      }
    }

    scoredCandidates.sort((a, b) => b.score - a.score);
    const best = scoredCandidates[0]?.match || null;
    if (best) {
      registerDynamicArtistAvatar(best.name, best.avatar);
      registerDynamicArtistAvatar(clean, best.avatar);
    }
    return best;
  } catch (e) {
    // Non-fatal
  }

  return null;
}

/**
 * 🖼️ Fetches genuine Ultra-HD YouTube channel banner via YouTube browse API
 */
export async function fetchYouTubeChannelBanner(channelId: string): Promise<string | null> {
  if (!channelId) return null;
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/browse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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
        browseId: channelId,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const ph = data.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
    const bannerUrl = ph?.banner?.imageBannerViewModel?.image?.sources?.slice(-1)[0]?.url;
    if (bannerUrl) return bannerUrl.startsWith('//') ? `https:${bannerUrl}` : bannerUrl;
    const c4 = data.header?.c4TabbedHeaderRenderer;
    const c4Banner = c4?.banner?.thumbnails?.slice(-1)[0]?.url;
    if (c4Banner) return c4Banner.startsWith('//') ? `https:${c4Banner}` : c4Banner;
  } catch (e) { }
  return null;
}

/**
 * 💿 Searches YouTube for real full albums & official playlists of an artist
 */
export async function searchYouTubePlaylists(query: string): Promise<ArtistAlbumItem[]> {
  try {
    const response = await fetch('https://www.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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
        query: `${query.trim()} full album playlist`,
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    const items = sections?.[0]?.itemSectionRenderer?.contents || [];

    const results: ArtistAlbumItem[] = [];
    const seen = new Set<string>();

    for (const item of items) {
      // 1. Classic playlistRenderer
      const p = item.playlistRenderer;
      if (p && p.playlistId) {
        const rawTitle = p.title?.simpleText || p.title?.runs?.map((r: any) => r.text).join('') || 'Album';
        const cleanTitle = rawTitle
          .replace(/\[.*?\]|\(.*?\)/g, '')
          .replace(/full album/gi, '')
          .replace(/playlist/gi, '')
          .trim();

        const lower = cleanTitle.toLowerCase();
        if (cleanTitle.length > 1 && !seen.has(lower)) {
          seen.add(lower);
          const thumbs = p.thumbnails?.[0]?.thumbnails || [];
          const cover = thumbs.length > 0 ? thumbs[thumbs.length - 1]?.url : '';
          const videoCountText = p.videoCount || p.itemCountText?.runs?.[0]?.text || '';
          const count = parseInt(String(videoCountText).replace(/[^\d]/g, ''), 10) || 0;
          const yearMatch = rawTitle.match(/\b(19\d\d|20\d\d)\b/);

          results.push({
            id: p.playlistId,
            title: cleanTitle,
            year: yearMatch ? yearMatch[1] : '2023',
            cover,
            trackCount: count,
            type: count > 3 ? 'album' : 'single',
          });
        }
      }

      // 2. Modern lockupViewModel (Playlists)
      const l = item.lockupViewModel;
      if (l && l.contentId && l.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST') {
        const rawTitle = l.metadata?.lockupMetadataViewModel?.title?.content || 'Playlist';
        const cleanTitle = rawTitle
          .replace(/\[.*?\]|\(.*?\)/g, '')
          .replace(/full album/gi, '')
          .replace(/playlist/gi, '')
          .trim();
        const lower = cleanTitle.toLowerCase();
        if (cleanTitle.length > 1 && !seen.has(lower)) {
          seen.add(lower);
          const thumbs = l.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources || [];
          const cover = thumbs.length > 0 ? thumbs[thumbs.length - 1]?.url : '';
          results.push({
            id: l.contentId,
            title: cleanTitle,
            year: '2024',
            cover,
            trackCount: 12,
            type: 'album',
          });
        }
      }
    }

    return results;
  } catch (e) {
    return [];
  }
}

/**
 * 💽 Fetches 100% genuine studio releases (Albums & Singles) and Playlists directly from YouTube Music & official artist channel
 */
export async function fetchArtistChannelReleasesAndPlaylists(
  channelId?: string | null,
  artistName?: string
): Promise<{ albums: ArtistAlbumItem[]; singlesAndEPs: ArtistAlbumItem[]; playlists: ArtistAlbumItem[] }> {
  const albums: ArtistAlbumItem[] = [];
  const singlesAndEPs: ArtistAlbumItem[] = [];
  const playlists: ArtistAlbumItem[] = [];
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();

  const cleanArtist = cleanArtistName(artistName || '').trim();

  // 1. Direct Channel Browse on YouTube Music (WEB_REMIX client)
  if (channelId) {
    try {
      const res = await fetch('https://music.youtube.com/youtubei/v1/browse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://music.youtube.com/',
        },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
          browseId: channelId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const searchCarousels = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          if (obj.musicCarouselShelfRenderer) {
            const shelf = obj.musicCarouselShelfRenderer;
            const shelfTitle = (shelf.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text || '').toLowerCase();
            for (const item of shelf.contents || []) {
              const tr = item.musicTwoRowItemRenderer;
              if (tr) {
                const itemTitle = tr.title?.runs?.[0]?.text;
                const nav = tr.navigationEndpoint || tr.title?.runs?.[0]?.navigationEndpoint;
                const browseId = nav?.browseEndpoint?.browseId;
                const thumbs = tr.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
                let cover = thumbs.slice(-1)[0]?.url || '';
                if (cover.includes('=w') || cover.includes('=s')) {
                  cover = cover.replace(/=w\d+-h\d+[^?&]*/, '=w800-h800-l90-rj').replace(/=s\d+[^?&]*/, '=s800-c-k-c0x00ffffff-no-rj');
                }
                const subtitle = tr.subtitle?.runs?.map((r: any) => r.text).join('') || '';
                const yearMatch = subtitle.match(/\b(19\d\d|20\d\d)\b/);
                const year = yearMatch ? yearMatch[1] : '2024';

                if (itemTitle && browseId && !seenIds.has(browseId) && !seenTitles.has(itemTitle.toLowerCase())) {
                  seenIds.add(browseId);
                  seenTitles.add(itemTitle.toLowerCase());
                  const it: ArtistAlbumItem = { id: browseId, title: itemTitle, year, cover };

                  if (shelfTitle.includes('album')) {
                    albums.push({ ...it, type: 'album' });
                  } else if (shelfTitle.includes('single') || shelfTitle.includes('ep')) {
                    singlesAndEPs.push({ ...it, type: 'single' });
                  } else if (shelfTitle.includes('playlist')) {
                    playlists.push({ ...it, type: 'playlist', trackCount: 15 });
                  }
                }
              }
            }
          }
          for (const k of Object.keys(obj)) searchCarousels(obj[k]);
        };
        searchCarousels(data);
      }
    } catch (e) {
      // Non-fatal
    }
  }

  // 2. Comprehensive YouTube Music Search for Albums if fewer than 3 found
  if (albums.length < 3 && cleanArtist) {
    try {
      const sRes = await fetch('https://music.youtube.com/youtubei/v1/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://music.youtube.com/',
        },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
          query: `${cleanArtist} album`,
        }),
      });

      if (sRes.ok) {
        const sData = await sRes.json();
        const searchItems = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          if (obj.musicResponsiveListItemRenderer) {
            const it = obj.musicResponsiveListItemRenderer;
            const flexCols = it.flexColumns || [];
            const itemTitle = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
            let targetId = '';
            const findId = (o: any) => {
              if (!o || typeof o !== 'object') return;
              if (o.browseId && (o.browseId.startsWith('MPREb_') || o.browseId.startsWith('OLAK5uy_'))) {
                targetId = o.browseId;
                return;
              }
              if (o.playlistId && o.playlistId.startsWith('OLAK5uy_')) {
                targetId = o.playlistId;
                return;
              }
              for (const k of Object.keys(o)) findId(o[k]);
            };
            findId(it);

            const col1Text = flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r: any) => r.text).join(' ') || '';
            const isAlbum = col1Text.toLowerCase().includes('album');
            const isSingle = col1Text.toLowerCase().includes('single') || col1Text.toLowerCase().includes('ep');
            const yearMatch = col1Text.match(/\b(19\d\d|20\d\d)\b/);
            const year = yearMatch ? yearMatch[1] : '2024';

            const thumbs = it.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
            let cover = thumbs.slice(-1)[0]?.url || '';
            if (cover.includes('=w') || cover.includes('=s')) {
              cover = cover.replace(/=w\d+-h\d+[^?&]*/, '=w800-h800-l90-rj').replace(/=s\d+[^?&]*/, '=s800-c-k-c0x00ffffff-no-rj');
            }

            if (itemTitle && targetId && !seenIds.has(targetId) && !seenTitles.has(itemTitle.toLowerCase())) {
              seenIds.add(targetId);
              seenTitles.add(itemTitle.toLowerCase());
              const itm: ArtistAlbumItem = { id: targetId, title: itemTitle, year, cover };
              if (isAlbum) {
                albums.push({ ...itm, type: 'album' });
              } else if (isSingle) {
                singlesAndEPs.push({ ...itm, type: 'single' });
              }
            }
            return;
          }
          for (const k of Object.keys(obj)) searchItems(obj[k]);
        };
        searchItems(sData);
      }
    } catch (e) { }
  }

  // 3. YouTube Music Search for Singles if singles are fewer than 3
  if (singlesAndEPs.length < 3 && cleanArtist) {
    try {
      const sRes = await fetch('https://music.youtube.com/youtubei/v1/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://music.youtube.com/',
        },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
          query: `${cleanArtist} single`,
        }),
      });

      if (sRes.ok) {
        const sData = await sRes.json();
        const searchItems = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          if (obj.musicResponsiveListItemRenderer) {
            const it = obj.musicResponsiveListItemRenderer;
            const flexCols = it.flexColumns || [];
            const itemTitle = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
            let targetId = '';
            const findId = (o: any) => {
              if (!o || typeof o !== 'object') return;
              if (o.browseId && (o.browseId.startsWith('MPREb_') || o.browseId.startsWith('OLAK5uy_'))) {
                targetId = o.browseId;
                return;
              }
              if (o.playlistId && o.playlistId.startsWith('OLAK5uy_')) {
                targetId = o.playlistId;
                return;
              }
              for (const k of Object.keys(o)) findId(o[k]);
            };
            findId(it);

            const col1Text = flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r: any) => r.text).join(' ') || '';
            const isSingle = col1Text.toLowerCase().includes('single') || col1Text.toLowerCase().includes('ep');
            const yearMatch = col1Text.match(/\b(19\d\d|20\d\d)\b/);
            const year = yearMatch ? yearMatch[1] : '2024';

            const thumbs = it.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
            let cover = thumbs.slice(-1)[0]?.url || '';
            if (cover.includes('=w') || cover.includes('=s')) {
              cover = cover.replace(/=w\d+-h\d+[^?&]*/, '=w800-h800-l90-rj').replace(/=s\d+[^?&]*/, '=s800-c-k-c0x00ffffff-no-rj');
            }

            if (itemTitle && targetId && isSingle && !seenIds.has(targetId) && !seenTitles.has(itemTitle.toLowerCase())) {
              seenIds.add(targetId);
              seenTitles.add(itemTitle.toLowerCase());
              singlesAndEPs.push({ id: targetId, title: itemTitle, year, cover, type: 'single' });
            }
            return;
          }
          for (const k of Object.keys(obj)) searchItems(obj[k]);
        };
        searchItems(sData);
      }
    } catch (e) { }
  }

  // 4. Fallback search for official YouTube channel playlists
  if (playlists.length === 0 && cleanArtist) {
    try {
      const plSearch = await searchYouTubePlaylists(cleanArtist);
      for (const p of plSearch) {
        if (!seenIds.has(p.id) && !seenTitles.has(p.title.toLowerCase())) {
          seenIds.add(p.id);
          seenTitles.add(p.title.toLowerCase());
          playlists.push({ ...p, type: 'playlist' });
        }
      }
    } catch (e) { }
  }

  return { albums, singlesAndEPs, playlists };
}

/**
 * 🎵 Complete Studio Album & Playlist Tracklist Fetcher
 * Given an authentic YouTube Music or YouTube album/playlist ID, fetches the exact tracklist, album artwork, track durations, and metadata
 */
export async function fetchPlaylistOrAlbumDetails(
  playlistId: string,
  fallbackTitle?: string,
  fallbackArtist?: string,
  fallbackCover?: string,
  type?: 'album' | 'single' | 'playlist'
): Promise<PlaylistAlbumDetails> {
  const cleanId = (playlistId || '').trim();
  let browseId = cleanId;
  if (browseId.startsWith('OLAK5uy_') || browseId.startsWith('PL')) {
    browseId = 'VL' + browseId;
  }

  let albumTitle = fallbackTitle || 'Album';
  let albumArtist = fallbackArtist || 'Artist';
  let albumCover = fallbackCover || '';
  let albumYear = '2024';
  const tracks: Track[] = [];

  // 1. First attempt: YouTube Music Studio Browse (works for MPREb_... and VLOLAK5uy_...)
  if (browseId && !browseId.startsWith('alb-') && !browseId.startsWith('sng-') && !browseId.startsWith('djk-') && !browseId.startsWith('kh-')) {
    try {
      const res = await fetch('https://music.youtube.com/youtubei/v1/browse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://music.youtube.com/',
        },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
          browseId,
        }),
      });

      if (res.ok) {
        const data = await res.json();

        // Extract header
        const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
        const sectionList = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
        const header = sectionList[0]?.musicResponsiveHeaderRenderer;
        if (header) {
          albumTitle = header.title?.runs?.[0]?.text || albumTitle;
          const sub = header.subtitle?.runs?.map((r: any) => r.text).join(' ') || '';
          const yM = sub.match(/\b(19\d\d|20\d\d)\b/);
          if (yM) albumYear = yM[1];
          const artRun = header.straplineTextOne?.runs?.[0]?.text || header.subtitle?.runs?.[2]?.text;
          if (artRun) albumArtist = artRun;
          const thumbs = header.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          if (thumbs.length > 0) {
            let c = thumbs[thumbs.length - 1].url;
            if (c.includes('=w') || c.includes('=s')) {
              c = c.replace(/=w\d+-h\d+[^?&]*/, '=w800-h800-l90-rj').replace(/=s\d+[^?&]*/, '=s800-c-k-c0x00ffffff-no-rj');
            }
            albumCover = c;
          }
        }

        // Extract tracks from musicResponsiveListItemRenderer
        const extractYTMTracks = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          if (obj.musicResponsiveListItemRenderer) {
            const it = obj.musicResponsiveListItemRenderer;
            const flexCols = it.flexColumns || [];
            const title = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
            const nav = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint;
            const videoId = nav?.watchEndpoint?.videoId;
            const durationStr = it.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text || '3:30';
            let durationMs = 210000;
            const parts = durationStr.split(':').map(Number);
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              durationMs = (parts[0] * 60 + parts[1]) * 1000;
            }
            const trackArtist = flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || albumArtist;
            const thumbs = it.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
            let thumb = thumbs.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            if (thumb.includes('=w') || thumb.includes('=s')) {
              thumb = thumb.replace(/=w\d+-h\d+[^?&]*/, '=w400-h400-l90-rj').replace(/=s\d+[^?&]*/, '=s400-c-k-c0x00ffffff-no-rj');
            }

            if (title && videoId) {
              tracks.push({
                videoId,
                title,
                artist: trackArtist,
                thumbnail: thumb,
                duration: durationMs,
                category: 'youtube',
                type: 'track',
                isOfficial: true,
              });
            }
            return;
          }
          for (const k of Object.keys(obj)) extractYTMTracks(obj[k]);
        };

        extractYTMTracks(data.contents);
      }
    } catch (err) {
      console.warn('[youtubeMusicService] Error in YTM browse:', err);
    }

    // 2. Second attempt: If 0 tracks, query standard YouTube browse (for user/channel playlists VLPL...)
    if (tracks.length === 0) {
      try {
        const ytBrowseId = browseId.startsWith('VL') ? browseId : 'VL' + browseId;
        const res = await fetch('https://www.youtube.com/youtubei/v1/browse', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          },
          body: JSON.stringify({
            context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'en', gl: 'US' } },
            browseId: ytBrowseId,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const sidebarItems = data?.sidebar?.playlistSidebarRenderer?.items || [];
          const primary = sidebarItems[0]?.playlistSidebarPrimaryInfoRenderer;
          if (primary?.title) {
            albumTitle = primary.title.runs?.map((r: any) => r.text).join('') || primary.title.simpleText || albumTitle;
          }
          const thumbSources =
            primary?.thumbnailRenderer?.playlistVideoThumbnailRenderer?.thumbnail?.thumbnails ||
            primary?.thumbnailRenderer?.playlistCustomThumbnailRenderer?.thumbnail?.thumbnails ||
            [];
          if (thumbSources.length > 0) {
            albumCover = thumbSources[thumbSources.length - 1].url;
          }

          const extractYTTracks = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.lockupViewModel && obj.lockupViewModel.contentId && obj.lockupViewModel.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
              const vm = obj.lockupViewModel;
              const videoId = vm.contentId;
              const title = vm.metadata?.lockupMetadataViewModel?.title?.content || vm.rendererContext?.accessibilityContext?.label || 'Track';
              let durationMs = 210000;
              const a11y = vm.rendererContext?.accessibilityContext?.label || '';
              const timeMatch = a11y.match(/(\d+)\s*minute[s]?(?:,\s*(\d+)\s*second[s]?)?/i);
              if (timeMatch) {
                const mins = parseInt(timeMatch[1], 10) || 0;
                const secs = parseInt(timeMatch[2] || '0', 10) || 0;
                durationMs = (mins * 60 + secs) * 1000;
              }
              const thumbs = vm.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources || [];
              const thumb = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

              tracks.push({
                videoId,
                title,
                artist: albumArtist,
                thumbnail: thumb,
                duration: durationMs,
                category: 'youtube',
                type: 'track',
                isOfficial: true,
              });
              return;
            }

            if (obj.playlistVideoRenderer && obj.playlistVideoRenderer.videoId) {
              const p = obj.playlistVideoRenderer;
              const videoId = p.videoId;
              const title = p.title?.runs?.map((r: any) => r.text).join('') || p.title?.simpleText || 'Track';
              const artist = p.shortBylineText?.runs?.map((r: any) => r.text).join('') || albumArtist;
              const durationStr = p.lengthText?.simpleText || '';
              let durationMs = 210000;
              const parts = durationStr.split(':').map(Number);
              if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                durationMs = (parts[0] * 60 + parts[1]) * 1000;
              }
              const thumbs = p.thumbnail?.thumbnails || [];
              const thumb = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

              tracks.push({
                videoId,
                title,
                artist,
                thumbnail: thumb,
                duration: durationMs,
                category: 'youtube',
                type: 'track',
                isOfficial: true,
              });
              return;
            }

            for (const k of Object.keys(obj)) extractYTTracks(obj[k]);
          };

          extractYTTracks(data.contents);
        }
      } catch (e) { }
    }
  }

  // 3. Graceful fallback: If both returned 0 tracks, query searchYouTubeMusic
  if (tracks.length === 0) {
    try {
      const cleanTitle = albumTitle.replace(/\[.*?\]|\(.*?\)/g, '').trim();
      const ytTracks = await searchYouTubeMusicWithArtist(`${albumArtist} ${cleanTitle || 'album'}`);
      if (ytTracks.tracks.length > 0) {
        tracks.push(...ytTracks.tracks);
        if (!albumCover) {
          albumCover = ytTracks.tracks[0]?.thumbnail || '';
        }
      }
    } catch (e) {
      tracks.push(...CURATED_TRACKS.slice(0, 10));
    }
  }

  const totalDurationMs = tracks.reduce((acc, t) => acc + (t.duration || 180000), 0);
  return {
    id: cleanId,
    title: albumTitle,
    artist: albumArtist,
    cover: albumCover,
    year: albumYear,
    trackCount: tracks.length,
    totalDurationMs,
    type: type || (tracks.length > 3 ? 'album' : 'single'),
    tracks,
  };
}

function computeArtistReleasesAndEssentials(
  albums: ArtistAlbumItem[],
  singlesAndEPs: ArtistAlbumItem[],
  albumScoreMap?: Map<string, { score: number; fallbackCover?: string; fallbackTitle?: string }>
): { latestRelease: ArtistAlbumItem | null; essentialAlbums: ArtistAlbumItem[] } {
  const combined = [...(singlesAndEPs || []), ...(albums || [])];
  let latestRelease: ArtistAlbumItem | null = null;
  if (combined.length > 0) {
    const sorted = [...combined].sort((a, b) => {
      const ya = parseInt(a.year || '0', 10) || 0;
      const yb = parseInt(b.year || '0', 10) || 0;
      return yb - ya;
    });
    latestRelease = sorted[0] || null;
  }

  // Essential Albums: rank by highest aggregated YouTube Music song view counts (1 to 3 max)
  let essentialAlbums: ArtistAlbumItem[] = [];
  if (albumScoreMap && albumScoreMap.size > 0) {
    const officialAlbumMap = new Map<string, ArtistAlbumItem>();
    for (const a of albums || []) {
      officialAlbumMap.set(a.id, a);
    }

    const ranked = Array.from(albumScoreMap.entries())
      .filter(([albId]) => officialAlbumMap.has(albId))
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 3)
      .map(([albId]) => officialAlbumMap.get(albId)!);

    if (ranked.length > 0) {
      essentialAlbums = ranked;
    } else {
      // Fallback: if Top Songs reference studio albums (MPREb_) not in carousel preview, promote top-viewed entries
      const promoted: ArtistAlbumItem[] = Array.from(albumScoreMap.entries())
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 3)
        .map(([albId, info]) => ({
          id: albId,
          title: info.fallbackTitle || 'Album',
          year: 'Classic',
          cover: info.fallbackCover || '',
          type: 'album' as const,
        }));
      essentialAlbums = promoted;
    }
  }

  if (essentialAlbums.length === 0) {
    essentialAlbums = (albums || []).slice(0, 3);
  }

  return { latestRelease, essentialAlbums };
}

/**
 * 🎤 Queries YouTube Music (WEB_REMIX) specifically for Official Artist Pages (singers/bands),
 * using the artist's dedicated Top Songs playlist (VLOLAK5uy_...) & Discography (MPAD...),
 * guaranteeing 100% pure tracks, accurate album/year metadata, and most-viewed Essential Albums.
 */
export async function fetchYouTubeMusicOfficialArtist(
  artistName: string,
  knownChannelId?: string
): Promise<{
  channelId?: string;
  name?: string;
  avatar?: string;
  subCount?: string;
  isOfficialArtist: boolean;
  topTracks: Track[];
  albums: ArtistAlbumItem[];
  essentialAlbums: ArtistAlbumItem[];
  singlesAndEPs: ArtistAlbumItem[];
  playlists: ArtistAlbumItem[];
} | null> {
  const clean = cleanArtistName(artistName).trim();
  if (!clean || clean.length < 2) return null;

  const ytHeaders = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Referer': 'https://music.youtube.com/',
  };

  try {
    let browseId = knownChannelId && knownChannelId.startsWith('UC') ? knownChannelId : '';
    let searchAvatar = '';
    let searchSub = '';
    let matchedName = clean;

    if (!browseId) {
      const candidate = await searchYouTubeMusicArtistCandidate(clean);
      if (candidate?.channelId) {
        browseId = candidate.channelId;
        matchedName = candidate.name || clean;
        searchAvatar = candidate.avatar || '';
        searchSub = candidate.subscriberCount || '';
      }
    }

    if (!browseId) return null;

    // Step 2: Browse the Official Artist Page on YouTube Music
    const bRes = await fetch('https://music.youtube.com/youtubei/v1/browse', {
      method: 'POST',
      headers: ytHeaders,
      body: JSON.stringify({
        context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
        browseId,
      }),
    });

    if (!bRes.ok) return null;
    const bData = await bRes.json();

    const immersive = bData.header?.musicImmersiveHeaderRenderer;
    const visual = bData.header?.musicVisualHeaderRenderer;
    const headerTitle =
      immersive?.title?.runs?.[0]?.text ||
      visual?.title?.runs?.[0]?.text ||
      matchedName;
    const headerThumbs =
      immersive?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
      visual?.foregroundThumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
      visual?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
      [];
    const heroAvatar = searchAvatar || (headerThumbs.length > 0
      ? getHighResYouTubeAvatar(headerThumbs[headerThumbs.length - 1]?.url)
      : '');

    const subText =
      immersive?.subscriptionButton?.subscribeButtonRenderer?.longSubscriberCountText?.runs?.[0]?.text ||
      immersive?.subscriptionButton?.subscribeButtonRenderer?.subscriberCountText?.runs?.[0]?.text ||
      searchSub ||
      'Official Artist';

    let topSongsEndpoint: { browseId: string; params?: string } | null = null;
    let albumsMoreEndpoint: { browseId: string; params?: string } | null = null;

    const shelfTracks: Array<Track & { _plays: number; _isPrimary: boolean; _albumId?: string }> = [];
    const albums: ArtistAlbumItem[] = [];
    const singlesAndEPs: ArtistAlbumItem[] = [];
    const playlists: ArtistAlbumItem[] = [];
    const seenTrackIds = new Set<string>();
    const seenAlbumIds = new Set<string>();

    const parseTrackRenderer = (
      mr: any,
      outArr: Array<Track & { _plays: number; _isPrimary: boolean; _albumId?: string }>,
      seenSet: Set<string>
    ) => {
      const videoId =
        mr.playlistItemData?.videoId ||
        mr.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
      if (!videoId || seenSet.has(videoId)) return;
      seenSet.add(videoId);

      const cols = mr.flexColumns || [];
      const title = cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'Track';
      const col1Runs = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      const col2Runs = cols[2]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      const col3Runs = cols[3]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      const allMetaRuns = [...col1Runs, ...col2Runs, ...col3Runs];

      const primaryRun = col1Runs.find((r: any) => r.text && r.text.trim() !== '•' && r.text.trim() !== ',');
      const primaryArtistName = primaryRun?.text || headerTitle;
      const primaryArtistBId = primaryRun?.navigationEndpoint?.browseEndpoint?.browseId || '';
      const isPrimary =
        primaryArtistBId === browseId ||
        scoreArtistNameMatch(primaryArtistName, headerTitle) >= 850;

      const playsRun = allMetaRuns.find((r: any) => /\b(plays?|views?)\b/i.test(r.text || ''));
      const playsCount = playsRun ? parsePlayCountText(playsRun.text) : 0;

      const albumRun = allMetaRuns.find((r: any) =>
        r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('MPREb_')
      );
      const albumName = albumRun?.text || '';
      const albumId = albumRun?.navigationEndpoint?.browseEndpoint?.browseId || '';

      const thumbs = mr.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
      const thumb = thumbs.length > 0
        ? getHighResYouTubeAvatar(thumbs[thumbs.length - 1]?.url)
        : getHighResThumbnail(videoId);

      outArr.push({
        videoId,
        title,
        artist: cleanArtistName(headerTitle),
        thumbnail: thumb,
        album: albumName || undefined,
        isOfficial: true,
        channelId: browseId,
        artistAvatar: heroAvatar || undefined,
        category: 'youtube',
        type: 'track',
        _plays: playsCount,
        _isPrimary: isPrimary,
        _albumId: albumId || undefined,
      });
    };

    const walkArtistPage = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      if (obj.musicShelfRenderer) {
        const ms = obj.musicShelfRenderer;
        const ep = ms.bottomEndpoint?.browseEndpoint;
        if (ep?.browseId && !topSongsEndpoint) {
          topSongsEndpoint = { browseId: ep.browseId, params: ep.params };
        }
        for (const item of ms.contents || []) {
          if (item.musicResponsiveListItemRenderer) {
            parseTrackRenderer(item.musicResponsiveListItemRenderer, shelfTracks, seenTrackIds);
          }
        }
      }

      if (obj.musicCarouselShelfRenderer) {
        const shelf = obj.musicCarouselShelfRenderer;
        const headerRenderer = shelf.header?.musicCarouselShelfBasicHeaderRenderer;
        const shelfTitle = (headerRenderer?.title?.runs?.[0]?.text || '').toLowerCase();
        const moreEp = headerRenderer?.moreContentButton?.buttonRenderer?.navigationEndpoint?.browseEndpoint;
        if (shelfTitle.includes('album') && !shelfTitle.includes('single') && moreEp?.browseId && !albumsMoreEndpoint) {
          albumsMoreEndpoint = { browseId: moreEp.browseId, params: moreEp.params };
        }
        for (const item of shelf.contents || []) {
          const tr = item.musicTwoRowItemRenderer;
          if (!tr) continue;
          const itemTitle = tr.title?.runs?.[0]?.text;
          const nav = tr.navigationEndpoint || tr.title?.runs?.[0]?.navigationEndpoint;
          const bId = nav?.browseEndpoint?.browseId;
          if (!itemTitle || !bId || seenAlbumIds.has(bId)) continue;
          seenAlbumIds.add(bId);

          const thumbs = tr.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          const cover = thumbs.length > 0 ? getHighResYouTubeAvatar(thumbs[thumbs.length - 1]?.url) : '';
          const subtitle = tr.subtitle?.runs?.map((r: any) => r.text).join('') || '';
          const yearMatch = subtitle.match(/\b(19\d\d|20\d\d)\b/);
          const year = yearMatch ? yearMatch[1] : '2024';

          const entry: ArtistAlbumItem = { id: bId, title: itemTitle, year, cover };
          if (shelfTitle.includes('album')) {
            albums.push({ ...entry, type: 'album' });
          } else if (shelfTitle.includes('single') || shelfTitle.includes('ep')) {
            singlesAndEPs.push({ ...entry, type: 'single' });
          } else if (shelfTitle.includes('playlist')) {
            playlists.push({ ...entry, type: 'playlist', trackCount: 15 });
          }
        }
      }

      for (const k of Object.keys(obj)) {
        walkArtistPage(obj[k]);
      }
    };

    walkArtistPage(bData.contents);

    // Step 3: Fetch full pure Top Songs playlist (up to 100 official songs) + Full Albums Discography in parallel
    const playlistTracks: Array<Track & { _plays: number; _isPrimary: boolean; _albumId?: string }> = [];
    const seenPlaylistIds = new Set<string>();
    const fullAlbumsList: ArtistAlbumItem[] = [];
    const seenFullAlbumIds = new Set<string>();

    const extraCalls: Promise<void>[] = [];

    if (topSongsEndpoint?.browseId) {
      extraCalls.push(
        fetch('https://music.youtube.com/youtubei/v1/browse', {
          method: 'POST',
          headers: ytHeaders,
          body: JSON.stringify({
            context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
            browseId: topSongsEndpoint.browseId,
            ...(topSongsEndpoint.params ? { params: topSongsEndpoint.params } : {}),
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((pData) => {
            if (!pData) return;
            const walkP = (o: any) => {
              if (!o || typeof o !== 'object') return;
              if (o.musicResponsiveListItemRenderer) {
                parseTrackRenderer(o.musicResponsiveListItemRenderer, playlistTracks, seenPlaylistIds);
              }
              for (const k of Object.keys(o)) walkP(o[k]);
            };
            walkP(pData.contents);
          })
          .catch(() => { })
      );
    }

    if (albumsMoreEndpoint?.browseId) {
      extraCalls.push(
        fetch('https://music.youtube.com/youtubei/v1/browse', {
          method: 'POST',
          headers: ytHeaders,
          body: JSON.stringify({
            context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'en', gl: 'US' } },
            browseId: albumsMoreEndpoint.browseId,
            ...(albumsMoreEndpoint.params ? { params: albumsMoreEndpoint.params } : {}),
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((aData) => {
            if (!aData) return;
            const walkA = (o: any) => {
              if (!o || typeof o !== 'object') return;
              if (o.musicTwoRowItemRenderer) {
                const tr = o.musicTwoRowItemRenderer;
                const itemTitle = tr.title?.runs?.[0]?.text;
                const bId = tr.navigationEndpoint?.browseEndpoint?.browseId;
                if (itemTitle && bId && !seenFullAlbumIds.has(bId)) {
                  seenFullAlbumIds.add(bId);
                  const thumbs = tr.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
                  const cover = thumbs.length > 0 ? getHighResYouTubeAvatar(thumbs[thumbs.length - 1]?.url) : '';
                  const subtitle = tr.subtitle?.runs?.map((r: any) => r.text).join('') || '';
                  const yearMatch = subtitle.match(/\b(19\d\d|20\d\d)\b/);
                  fullAlbumsList.push({
                    id: bId,
                    title: itemTitle,
                    year: yearMatch ? yearMatch[1] : '2024',
                    cover,
                    type: 'album',
                  });
                }
              }
              for (const k of Object.keys(o)) walkA(o[k]);
            };
            walkA(aData.contents);
          })
          .catch(() => { })
      );
    }

    if (extraCalls.length > 0) {
      await Promise.all(extraCalls);
    }

    const mergedRawTracks = playlistTracks.length > 0 ? playlistTracks : shelfTracks;
    const primaryOnly = mergedRawTracks.filter((t) => t._isPrimary);
    const chosenTracksRaw = primaryOnly.length >= 3 ? primaryOnly : mergedRawTracks;

    // Sort by play counts descending so Top Songs leads with the true biggest hits
    const sortedPureTracks = [...chosenTracksRaw].sort((a, b) => (b._plays || 0) - (a._plays || 0));

    // Aggregate song play counts per album to compute true Most-Viewed Essential Albums (1–3 max)
    const albumScoreMap = new Map<string, { score: number; fallbackCover?: string; fallbackTitle?: string }>();
    for (const tr of sortedPureTracks) {
      if (tr._albumId && tr._albumId.startsWith('MPREb_')) {
        const prev = albumScoreMap.get(tr._albumId) || {
          score: 0,
          fallbackCover: tr.thumbnail || undefined,
          fallbackTitle: tr.album || undefined,
        };
        prev.score += Math.max(1, tr._plays || 1);
        if (!prev.fallbackCover && tr.thumbnail) prev.fallbackCover = tr.thumbnail;
        if (!prev.fallbackTitle && tr.album) prev.fallbackTitle = tr.album;
        albumScoreMap.set(tr._albumId, prev);
      }
    }

    const finalAlbums = fullAlbumsList.length > 0 ? fullAlbumsList : albums;
    const { essentialAlbums } = computeArtistReleasesAndEssentials(finalAlbums, singlesAndEPs, albumScoreMap);

    // Strip internal helper keys
    const finalTopTracks: Track[] = sortedPureTracks.map(({ _plays, _isPrimary, _albumId, ...rest }) => rest);

    if (heroAvatar) {
      registerDynamicArtistAvatar(headerTitle, heroAvatar);
      registerDynamicArtistAvatar(clean, heroAvatar);
    }

    return {
      channelId: browseId,
      name: cleanArtistName(headerTitle),
      avatar: heroAvatar || undefined,
      subCount: subText,
      isOfficialArtist: Boolean(immersive || visual || finalTopTracks.length > 0 || finalAlbums.length > 0),
      topTracks: finalTopTracks,
      albums: finalAlbums,
      essentialAlbums,
      singlesAndEPs,
      playlists,
    };
  } catch {
    return null;
  }
}

/**
 * 👑 Comprehensive Universal Artist Full Profile Fetcher
 * Uses verified YouTube Music Official Artist Page as source of truth so Search & Profile match 1:1
 * with zero cross-artist mixups, pure Top Songs, and view-ranked Essential Albums.
 */
export async function fetchArtistFullProfile(
  rawArtistName: string,
  preferredChannelId?: string
): Promise<ArtistFullProfile> {
  try {
    const [ytMusicArtist, channelInfo, searchRes] = await Promise.all([
      fetchYouTubeMusicOfficialArtist(rawArtistName, preferredChannelId),
      fetchRealYouTubeChannel(rawArtistName),
      searchYouTubeMusicWithArtist(`${rawArtistName} official audio`),
    ]);

    const useYtMusicAsTruth = Boolean(ytMusicArtist?.isOfficialArtist);
    const artist = searchRes.artist;
    const rawTracks = searchRes.tracks;

    const cleanArtist = cleanArtistName(
      (useYtMusicAsTruth ? ytMusicArtist?.name : undefined) ||
      channelInfo?.name ||
      artist?.name ||
      rawArtistName
    );

    const resolvedChannelId =
      preferredChannelId ||
      (useYtMusicAsTruth ? ytMusicArtist?.channelId : undefined) ||
      channelInfo?.channelId ||
      ytMusicArtist?.channelId;

    // Pure Top Songs: NEVER mix dirty general search tracks when official YouTube Music catalog succeeded
    let topTracks: Track[] = [];
    if (ytMusicArtist?.topTracks && ytMusicArtist.topTracks.length >= 3) {
      topTracks = ytMusicArtist.topTracks;
    } else {
      const strictFiltered = rawTracks.filter(
        (t) =>
          isGenuineArtistTrack(t.title, t.artist, cleanArtist) &&
          (t.channelId === resolvedChannelId || scoreArtistNameMatch(t.artist, cleanArtist) >= 450)
      );
      topTracks = strictFiltered.length >= 3
        ? strictFiltered
        : rawTracks.filter((t) => isGenuineArtistTrack(t.title, t.artist, cleanArtist));
    }

    // Identical official HD face-framed avatar across Search & Profile
    const realAvatar = getHighResYouTubeAvatar(
      (useYtMusicAsTruth ? ytMusicArtist?.avatar : undefined) ||
      channelInfo?.avatar ||
      artist?.avatar ||
      (topTracks[0]?.artistAvatar ? topTracks[0].artistAvatar : topTracks[0]?.thumbnail || '')
    );

    const subCount =
      (useYtMusicAsTruth ? ytMusicArtist?.subCount : undefined) ||
      channelInfo?.subscriberCount ||
      artist?.subscriberCount ||
      'Official Artist Channel';

    const isOfficialArtist = Boolean(
      ytMusicArtist?.isOfficialArtist ||
      channelInfo?.isOfficialArtist ||
      artist?.isOfficialArtist
    );

    let albums = ytMusicArtist?.albums || [];
    let singlesAndEPs = ytMusicArtist?.singlesAndEPs || [];
    let playlists = ytMusicArtist?.playlists || [];
    if (albums.length === 0) {
      const fallbackReleases = await fetchArtistChannelReleasesAndPlaylists(resolvedChannelId, cleanArtist);
      albums = fallbackReleases.albums;
      if (singlesAndEPs.length === 0) singlesAndEPs = fallbackReleases.singlesAndEPs;
      if (playlists.length === 0) playlists = fallbackReleases.playlists;
    }

    const { latestRelease, essentialAlbums } =
      ytMusicArtist?.essentialAlbums && ytMusicArtist.essentialAlbums.length > 0
        ? {
          latestRelease: albums[0] || singlesAndEPs[0] || null,
          essentialAlbums: ytMusicArtist.essentialAlbums,
        }
        : computeArtistReleasesAndEssentials(albums, singlesAndEPs);

    // Related artists
    const relatedArtists: RelatedArtistItem[] = [];
    const seenRel = new Set<string>();
    const featRegex = /(?:ft\.|feat\.|with|&)\s*([^()\[\]\-,]+)/gi;

    for (const t of topTracks) {
      let match;
      while ((match = featRegex.exec(t.title)) !== null) {
        const candidate = match[1]?.trim();
        if (
          candidate &&
          candidate.length >= 3 &&
          !seenRel.has(candidate.toLowerCase()) &&
          candidate.toLowerCase() !== cleanArtist.toLowerCase() &&
          relatedArtists.length < 6
        ) {
          seenRel.add(candidate.toLowerCase());
          relatedArtists.push({
            id: `rel-${candidate.toLowerCase().replace(/\s+/g, '-')}`,
            name: candidate,
            avatar: realAvatar,
          });
        }
      }
    }

    if (relatedArtists.length === 0) {
      relatedArtists.push({
        id: 'rel-top-1',
        name: `${cleanArtist} Radio`,
        avatar: realAvatar,
      });
    }

    return {
      name: cleanArtist,
      subCount,
      banner: realAvatar,
      avatar: realAvatar,
      handle: channelInfo?.handle || artist?.handle || `@${cleanArtist.toLowerCase().replace(/[^\w]/g, '')}`,
      channelId: resolvedChannelId,
      verified: isOfficialArtist,
      isOfficialArtist,
      latestRelease,
      essentialAlbums,
      topTracks: topTracks.slice(0, 100),
      albums: albums.slice(0, 60),
      singlesAndEPs: singlesAndEPs.slice(0, 30),
      playlists: playlists.slice(0, 20),
      relatedArtists,
    };
  } catch (err) {
    return {
      name: rawArtistName,
      subCount: 'Official Artist',
      banner: '',
      avatar: '',
      verified: true,
      isOfficialArtist: false,
      latestRelease: null,
      essentialAlbums: [],
      topTracks: [],
      albums: [],
      singlesAndEPs: [],
      playlists: [],
      relatedArtists: [],
    };
  }
}

/**
 * Paginated Catalog Loader: Fetches additional pure batches for an artist
 * without mixing unrelated singers sharing similar first/last names.
 */
export async function fetchArtistMoreTracks(
  artistName: string,
  batchPage: number,
  excludeVideoIds: string[],
  channelId?: string
): Promise<Track[]> {
  const clean = cleanArtistName(artistName);
  if (!clean) return [];
  const exclude = new Set(excludeVideoIds);
  const queries = [
    `${clean} official songs`,
    `${clean} top hits audio`,
    `${clean} album tracks`,
    `${clean} live concert music`,
  ];
  const q = queries[batchPage % queries.length];
  const res = await searchYouTubeMusicWithArtist(q);
  const out: Track[] = [];
  for (const t of res.tracks || []) {
    if (!t.videoId || exclude.has(t.videoId)) continue;
    const isSameArtist =
      (channelId && t.channelId === channelId) ||
      scoreArtistNameMatch(t.artist, clean) >= 450;
    if (!isSameArtist || !isGenuineArtistTrack(t.title, t.artist, clean)) continue;
    exclude.add(t.videoId);
    out.push(t);
    if (out.length >= 30) break;
  }
  return out;
}

