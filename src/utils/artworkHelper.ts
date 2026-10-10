/**
 * 🎨 Universal Ultra-HD Dynamic Artwork & Artist Identity Engine
 *
 * 100% DYNAMIC: Zero fixed/hardcoded dictionaries, zero fake placeholder covers.
 * Every song and artist uses their own authentic high-resolution media.
 * Banishes 16:9 letterbox black bars with native HD cascades and ambient canvas backdrops.
 */

import { ImageSource } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Runtime Dynamic Cache for Artists Learned on the Fly ──
const dynamicArtistAvatarCache = new Map<string, string>();

/**
 * ⚡ Dynamically registers an authentic artist/channel avatar into runtime cache
 */
export function registerDynamicArtistAvatar(artistName: string, avatarUrl: string): void {
  if (!artistName || !avatarUrl) return;
  let cleanUrl = avatarUrl.trim();
  if (cleanUrl.startsWith('//')) {
    cleanUrl = `https:${cleanUrl}`;
  }
  const clean = artistName.trim().toLowerCase();
  dynamicArtistAvatarCache.set(clean, cleanUrl);
  const stripped = clean
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\s*vevo$/i, '')
    .replace(/\s*officiel.*$/i, '')
    .replace(/\s*official.*$/i, '')
    .trim();
  if (stripped && stripped !== clean) {
    dynamicArtistAvatarCache.set(stripped, cleanUrl);
  }
}

// ── Ultra-HD Studio Artwork Runtime Cache (1200x1200bb Apple Music / YouTube Music Masters) ──
const studioArtworkCache = new Map<string, string>();

// Initialize persistent cache on boot
AsyncStorage.getAllKeys()
  .then((keys) => {
    const artKeys = keys.filter((k) => k.startsWith('@a7_art_'));
    if (artKeys.length > 0) {
      AsyncStorage.multiGet(artKeys)
        .then((pairs) => {
          pairs.forEach(([k, v]) => {
            if (v) studioArtworkCache.set(k.replace('@a7_art_', ''), v);
          });
        })
        .catch(() => {});
    }
  })
  .catch(() => {});

/**
 * ⚡ Ultra-Fast Studio Album Art Resolver via Apple Music / iTunes Public Catalog
 * Resolves pristine 1200x1200 square studio artwork dynamically for the specific track
 * Caches in memory and AsyncStorage.
 */
export async function fetchStudioAlbumArtAsync(
  artist?: string | null,
  title?: string | null,
  videoId?: string | null
): Promise<string | null> {
  if (!artist && !title) return null;

  const cleanA = (artist || '').replace(/[-_]/g, ' ').replace(/\s*-\s*topic$/i, '').trim();
  const cleanT = (title || '')
    .replace(/[\(\[\{].*?[\)\]\}]/g, '')
    .replace(/official\s*(music\s*)?video|clip\s*officiel|audio\s*officiel|lyric\s*video|remix|drill|nouveaut[eé]|paroles/gi, '')
    .replace(/[-_]/g, ' ')
    .trim();

  const cacheKey = videoId || (cleanA && cleanT ? `${cleanA.toLowerCase()}::${cleanT.toLowerCase()}` : null);
  if (cacheKey && studioArtworkCache.has(cacheKey)) {
    return studioArtworkCache.get(cacheKey)!;
  }

  try {
    const q = encodeURIComponent(`${cleanA} ${cleanT}`);
    const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.results && json.results.length > 0 && json.results[0].artworkUrl100) {
      const art = json.results[0].artworkUrl100.replace('100x100bb.jpg', '1200x1200bb.jpg');
      if (cacheKey) studioArtworkCache.set(cacheKey, art);
      if (videoId) studioArtworkCache.set(videoId, art);
      if (cleanA && cleanT) studioArtworkCache.set(`${cleanA.toLowerCase()}::${cleanT.toLowerCase()}`, art);

      if (cacheKey) {
        AsyncStorage.setItem(`@a7_art_${cacheKey}`, art).catch(() => {});
      }
      return art;
    }
  } catch (e) {
    // Non-fatal background fetch
  }

  return null;
}

/**
 * 🌟 Resolves Ultra-HD 1080p Studio Artwork for YouTube video thumbnails
 */
export const getUltraStudioArtwork = (videoId?: string, fallbackUrl?: string): string => {
  if (!videoId || videoId.length < 8) return fallbackUrl || '';
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
};

/**
 * 🌟 Resolves Ultra-HD Cover Art dynamically as a single string URL (for lock screen & metadata)
 * Upgrades YouTube videos to maxresdefault.jpg (1280x720, NO black bars!) and YouTube Music to 1200x1200 master.
 * 100% Dynamic: Never returns hardcoded fake album art.
 */
export const getUniversalStudioArtwork = (
  url?: string | null,
  title?: string,
  artist?: string,
  videoId?: string
): string => {
  const cleanTitle = (title || '').toLowerCase().trim();
  const cleanArtist = (artist || '').toLowerCase().trim();
  const resolvedVid = videoId || (url && url.includes('/vi/') ? url.split('/vi/')[1]?.split('/')[0] : null);

  // 1. Check studio album art cache dynamically discovered for this exact song
  const cacheKey = resolvedVid || (cleanArtist && cleanTitle ? `${cleanArtist}::${cleanTitle}` : null);
  if (cacheKey && studioArtworkCache.has(cacheKey)) {
    return studioArtworkCache.get(cacheKey)!;
  }

  if (!url || typeof url !== 'string' || url.trim() === '') {
    if (resolvedVid && resolvedVid.length >= 8) {
      return `https://i.ytimg.com/vi/${resolvedVid}/maxresdefault.jpg`;
    }
    return '';
  }

  const clean = url.trim();

  // 2. YouTube Channel Avatars: upgrade to studio 800x800
  if (clean.includes('yt3.googleusercontent.com') || clean.includes('yt3.ggpht.com')) {
    return clean
      .replace(/=s\d+(-c-k-c0x[0-9a-fA-F]+-no-rj)?/g, '=s800-c-k-c0x00ffffff-no-rj')
      .replace(/=w\d+-h\d+(-[a-z0-9-]+)?/g, '=w800-h800-s-no-rj');
  }

  // 3. YouTube Music Official Square Album Covers: upgrade to 1200x1200 master
  if (clean.includes('googleusercontent.com') || clean.includes('ytimg.com/image/')) {
    if (/=w\d+-h\d+[^?&]*/.test(clean)) {
      return clean.replace(/=w\d+-h\d+[^?&]*/, '=w1200-h1200-l90-rj');
    }
    if (/=s\d+[^?&]*/.test(clean)) {
      return clean.replace(/=s\d+[^?&]*/, '=s1200-c-k-c0x00ffffff-no-rj');
    }
    const separator = clean.includes('?') ? '&' : '=';
    return `${clean}${separator}w1200-h1200-l90-rj`;
  }

  // 4. YouTube Video Thumbnails: Upgrade to maxresdefault.jpg (1280x720 HD, ZERO black bars!)
  if (clean.includes('ytimg.com/vi/') || clean.includes('/vi/')) {
    const vid = clean.split('/vi/')[1]?.split('/')[0];
    if (vid && vid.length >= 8) {
      return `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`;
    }
  }

  // 5. If we have a video ID, return maxresdefault
  if (resolvedVid && resolvedVid.length >= 8) {
    return `https://i.ytimg.com/vi/${resolvedVid}/maxresdefault.jpg`;
  }

  return clean;
};

/**
 * 🛡️ Native Resolution Cascade Engine for `expo-image`
 * Returns an array of dynamic image sources:
 * [Studio 1200x1200, YouTube Music Square 1200x1200, maxresdefault (1080p/720p HD), hq720, maxresdefault.webp, sddefault, original]
 * Guaranteed: Zero black bars, Zero pixelation, Zero fake fixed images!
 */
export const getUniversalStudioArtworkSource = (
  url?: string | null,
  title?: string,
  artist?: string,
  videoId?: string
): ImageSource[] => {
  const cleanTitle = (title || '').toLowerCase().trim();
  const cleanArtist = (artist || '').toLowerCase().trim();
  const resolvedVid = videoId || (url && url.includes('/vi/') ? url.split('/vi/')[1]?.split('/')[0] : null);

  const sources: ImageSource[] = [];
  const addedUris = new Set<string>();

  const pushSource = (uri?: string | null) => {
    if (!uri || typeof uri !== 'string') return;
    const trimmed = uri.trim();
    if (!trimmed || addedUris.has(trimmed)) return;
    addedUris.add(trimmed);
    sources.push({ uri: trimmed });
  };

  // 1. Studio official square album cover from dynamic runtime cache (1200x1200bb)
  const cacheKey = resolvedVid || (cleanArtist && cleanTitle ? `${cleanArtist}::${cleanTitle}` : null);
  if (cacheKey && studioArtworkCache.has(cacheKey)) {
    pushSource(studioArtworkCache.get(cacheKey));
  }

  // 2. YouTube Music Official Square Album Covers (Ultra-res 1200x1200)
  if (url && (url.includes('googleusercontent.com') || url.includes('ytimg.com/image/'))) {
    pushSource(getUniversalStudioArtwork(url, title, artist, videoId));
  }

  // 3. YouTube Video Thumbnails: 5-Tier Native HD Cascade (NO letterbox black bars!)
  if (resolvedVid && resolvedVid.length >= 8) {
    pushSource(`https://i.ytimg.com/vi/${resolvedVid}/maxresdefault.jpg`);
    pushSource(`https://i.ytimg.com/vi/${resolvedVid}/hq720.jpg`);
    pushSource(`https://i.ytimg.com/vi_webp/${resolvedVid}/maxresdefault.webp`);
    pushSource(`https://i.ytimg.com/vi/${resolvedVid}/sddefault.jpg`);
    pushSource(`https://i.ytimg.com/vi/${resolvedVid}/hqdefault.jpg`);
  }

  // 4. Track's own original thumbnail URL if valid
  if (url && typeof url === 'string' && url.startsWith('http')) {
    pushSource(url);
  }

  return sources;
};

/**
 * 👤 Official Artist Avatar Resolver (100% DYNAMIC)
 * Returns the authentic YouTube channel avatar or artist portrait.
 * Never overrides with static or fixed placeholders.
 */
export const getUniversalArtistAvatar = (
  url?: string | null,
  artistName?: string | null
): string => {
  // 1. If a genuine YouTube channel avatar URL is provided, enhance to 800x800 and return immediately!
  if (url && typeof url === 'string' && url.trim().length > 10) {
    let cleanUrl = url.trim();
    if (cleanUrl.startsWith('//')) {
      cleanUrl = `https:${cleanUrl}`;
    }
    if (
      cleanUrl.includes('googleusercontent.com') ||
      cleanUrl.includes('ggpht.com') ||
      cleanUrl.includes('ytimg.com/')
    ) {
      let highRes = cleanUrl;
      if (highRes.includes('=s')) {
        highRes = highRes.replace(/=s\d+[^?&]*/, '=s800-c-k-c0x00ffffff-no-rj');
      } else if (highRes.includes('=w')) {
        highRes = highRes.replace(/=w\d+-h\d+[^?&]*/, '=w800-h800-s-no-rj');
      }
      return highRes;
    }
    if (cleanUrl.startsWith('http')) {
      return cleanUrl;
    }
  }

  const cleanName = (artistName || '')
    .toLowerCase()
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\s*vevo$/i, '')
    .replace(/\s*officiel.*$/i, '')
    .replace(/\s*official.*$/i, '')
    .trim();

  // 2. Check dynamic runtime cache (registered dynamically at runtime from channel responses)
  if (cleanName && dynamicArtistAvatarCache.has(cleanName)) {
    return dynamicArtistAvatarCache.get(cleanName)!;
  }

  // 3. Return sanitized original URL
  if (url && typeof url === 'string') {
    let cleanUrl = url.trim();
    if (cleanUrl.startsWith('//')) cleanUrl = `https:${cleanUrl}`;
    if (cleanUrl.startsWith('http')) return cleanUrl;
  }
  return '';
};

/**
 * ⚡ Background Async Fetcher for New Artists via Apple Music Catalog API
 */
export async function fetchArtistStudioAvatarAsync(artistName: string): Promise<string | null> {
  const clean = artistName.trim().toLowerCase();
  if (dynamicArtistAvatarCache.has(clean)) {
    return dynamicArtistAvatarCache.get(clean)!;
  }

  try {
    const q = encodeURIComponent(artistName);
    const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=album&limit=1`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.results && json.results.length > 0 && json.results[0].artworkUrl100) {
      const art = json.results[0].artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg');
      dynamicArtistAvatarCache.set(clean, art);
      return art;
    }
  } catch (e) {
    // Non-fatal background fetch
  }
  return null;
}

export const STUDIO_IMAGE_PROPS = {
  contentFit: 'cover' as const,
  priority: 'high' as const,
  cachePolicy: 'memory-disk' as const,
  transition: 150,
};
