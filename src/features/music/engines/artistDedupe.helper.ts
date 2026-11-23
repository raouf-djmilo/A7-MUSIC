/**
 * 🎨 Enhanced Artist Normalization & Deduplication Helper
 * 
 * Deep normalization for YouTube artist channel names:
 * - Strips common noise suffixes (officiel, official, topic, vevo, channel, music, etc.)
 * - Normalizes Unicode diacritics (é -> e) and punctuation
 * - Deduplicates artists while keeping the highest-scoring candidate (real portrait + verified)
 */

export interface ArtistItem {
  id?: string;
  name: string;
  avatar?: string | null;
  artwork?: string | null;
  isOfficial?: boolean;
  verified?: boolean;
  channelId?: string;
}

/**
 * الكلمات الزائدة الشائعة في أسماء قنوات يوتيوب والتي تسبب تكرار نفس الفنان
 */
const NOISE_SUFFIXES = new Set([
  'officiel',
  'official',
  'topic',
  'vevo',
  'channel',
  'music',
  'tv',
  'records',
  'prod',
  'production',
  'dz',
]);

/**
 * تطبيع اسم الفنان بعمق لإزالة الفروقات الخفية ولاحقات القنوات
 * مثال: "DJALIL PALERMO Officiel" و "Djalil Palermo - Topic" -> "djalil palermo"
 */
export function normalizeArtistKey(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') return '';

  // 1. تحويل لأحرف صغيرة وتوحيد الأحرف اللاتينية ذات الحركات (é -> e)
  let cleaned = rawName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. إزالة كلمات الضوضاء الشائعة في نهاية أو داخل اسم القناة
  const words = cleaned.split(' ').filter((word) => !NOISE_SUFFIXES.has(word));
  cleaned = words.join(' ').trim();

  return cleaned;
}

/**
 * إزالة تكرار الفنانين مع الاحتفاظ بالنسخة الأفضل (التي تملك صورة حقيقية وتوثيقاً)
 */
export function deduplicateArtists<T extends ArtistItem>(artists: T[]): T[] {
  if (!Array.isArray(artists)) return [];

  const uniqueMap = new Map<string, T>();

  for (const artist of artists) {
    if (!artist || !artist.name) continue;

    const key = normalizeArtistKey(artist.name);
    if (!key || key.length < 2) continue;

    const existing = uniqueMap.get(key);
    if (!existing) {
      uniqueMap.set(key, artist);
      continue;
    }

    // تفضيل النسخة التي تملك صورة صالحة أو علامة توثيق
    const existingArt = existing.avatar || existing.artwork;
    const candidateArt = artist.avatar || artist.artwork;
    const existingHasArt = Boolean(existingArt && !existingArt.includes('placeholder'));
    const candidateHasArt = Boolean(candidateArt && !candidateArt.includes('placeholder'));

    const existingScore = (existingHasArt ? 2 : 0) + (existing.isOfficial || existing.verified ? 1 : 0);
    const candidateScore = (candidateHasArt ? 2 : 0) + (artist.isOfficial || artist.verified ? 1 : 0);

    if (candidateScore > existingScore) {
      uniqueMap.set(key, artist);
    }
  }

  return Array.from(uniqueMap.values());
}

export default deduplicateArtists;
