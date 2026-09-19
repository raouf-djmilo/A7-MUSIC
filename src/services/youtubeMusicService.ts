import { Track } from '../store/useAudioStore';

export interface ArtistMatch {
  name: string;
  avatar: string;
  subscriberCount?: string;
  handle?: string;
  channelId?: string;
  isOfficial: boolean;
}

export interface SearchResultWithArtist {
  artist?: ArtistMatch | null;
  tracks: Track[];
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
  } catch (e) {}
  return 180000;
}

export function cleanArtistName(rawName: string): string {
  if (!rawName) return 'Artist';
  return rawName
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s*VEVO$/i, '')
    .replace(/\s*Official\s*Channel$/i, '')
    .trim();
}

export async function searchYouTubeMusicWithArtist(query: string): Promise<SearchResultWithArtist> {
  if (!query || !query.trim()) return { artist: null, tracks: [] };

  const cleanQuery = query.trim();

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
        query: cleanQuery,
      }),
    });

    if (!response.ok) {
      console.warn('[YouTubeService] HTTP error:', response.status);
      return { artist: null, tracks: [] };
    }

    const data = await response.json();
    const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    const items = sections?.[0]?.itemSectionRenderer?.contents || [];

    let artistMatch: ArtistMatch | null = null;
    const rawTracks: Track[] = [];

    for (const item of items) {
      // 1. Detect Official Artist Card
      if (!artistMatch && item.officialCardViewModel?.header?.pageHeaderViewModel) {
        const vm = item.officialCardViewModel.header.pageHeaderViewModel;
        const name = vm.title?.dynamicTextViewModel?.text?.content || cleanQuery;
        const avatar = vm.image?.contentPreviewImageViewModel?.image?.sources?.[0]?.url || `https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300`;
        const subText = vm.metadata?.contentMetadataViewModel?.metadataRows?.[1]?.metadataParts?.[0]?.text?.content;
        const handle = vm.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content;

        artistMatch = {
          name: cleanArtistName(name),
          avatar,
          subscriberCount: subText || 'Verified Artist',
          handle,
          isOfficial: true,
        };
      }

      // 2. Detect Standard Channel Card
      if (!artistMatch && item.channelRenderer) {
        const cr = item.channelRenderer;
        const name = cr.title?.simpleText || cleanQuery;
        const avatar = cr.thumbnail?.thumbnails?.[0]?.url || `https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300`;
        const isOfficial = Boolean(cr.ownerBadges?.some((b: any) => b.metadataBadgeRenderer?.style?.includes('VERIFIED')));

        artistMatch = {
          name: cleanArtistName(name),
          avatar,
          subscriberCount: cr.subscriberCountText?.simpleText || 'Artist',
          isOfficial,
        };
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

        const thumbs = v.thumbnail?.thumbnails || [];
        const thumbnail = thumbs.length > 0 
          ? thumbs[thumbs.length - 1]?.url 
          : `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;

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
        avatar: sortedTracks[0].thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300',
        subscriberCount: 'Verified Artist',
        isOfficial: true,
      };
    }

    return {
      artist: artistMatch,
      tracks: sortedTracks,
    };
  } catch (error: any) {
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
