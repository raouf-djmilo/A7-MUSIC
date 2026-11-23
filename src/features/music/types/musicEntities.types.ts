// src/features/music/types/musicEntities.types.ts

export type MusicEntityType = 'single' | 'album' | 'playlist';

/** بنية الأغنية الأساسية */
export interface TrackEntity {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  artistVerified?: boolean;
  durationSec: number;
  /** رابط صورة الأغنية نفسها (يُستخدم للأغاني الفردية أو داخل قوائم التشغيل) */
  trackArtworkUri?: string;
  /** رابط غلاف الألبوم الرسمي (إذا كانت الأغنية جزءاً من ألبوم رسمي) */
  albumArtworkUri?: string;
  albumId?: string;
  albumTitle?: string;
}

/** 1. بطاقة الأغنية الفردية */
export interface SingleTrackCardData {
  type: 'single';
  id: string;
  track: TrackEntity;
}

/** 2. بطاقة الألبوم الرسمي (جميع مقاطعه تتبع غلاف الألبوم الموحّد) */
export interface OfficialAlbumCardData {
  type: 'album';
  id: string;
  title: string;
  artist: string;
  releaseYear?: number;
  officialCoverUri: string;
  tracks: TrackEntity[];
}

/** 3. بطاقة قائمة التشغيل أو الـ Mix (كل مقطع يحتفظ بغلافه الخاص عند التشغيل) */
export interface PlaylistCardData {
  type: 'playlist';
  id: string;
  title: string;
  subtitle?: string;
  /** يمكن أن يكون غلافاً مصمماً للقائمة أو أول 4 صور لعمل Collage */
  coverUri?: string;
  collageUris?: string[];
  tracks: TrackEntity[];
}

/** النوع الموحّد الذي يقبله مكون البطاقة الذكي */
export type MusicCardEntity =
  | SingleTrackCardData
  | OfficialAlbumCardData
  | PlaylistCardData;

/**
 * دالة مساعدة ذكية تحدد أي غلاف يجب عرضه داخل شاشة المشغل الكامل:
 * - إذا كان المستخدم يستمع داخل "ألبوم رسمي": نُظهر غلاف الألبوم الرسمي الموحّد.
 * - إذا كان يستمع لـ "قائمة تشغيل" أو "أغنية فردية": نُظهر صورة الأغنية نفسها أولاً.
 */
export function resolvePlayerArtwork(
  track: TrackEntity,
  playbackContextType: MusicEntityType
): string | undefined {
  if (playbackContextType === 'album') {
    return track.albumArtworkUri || track.trackArtworkUri;
  }
  return track.trackArtworkUri || track.albumArtworkUri;
}
