export interface CuratedTrack {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number; // in ms
  audioUrl?: string;
  category: 'running' | 'cardio' | 'walking' | 'rai' | 'focus';
  bpm?: number;
  isOfficial?: boolean;
}

export const CURATED_TRACKS: CuratedTrack[] = [
  // ─── 🏃 Running & High Cadence (160+ BPM) ───────────────────
  {
    videoId: 'V8nz0DSKw7I',
    title: '160 BPM Marathon Rhythm',
    artist: 'Running Cadence Music',
    thumbnail: 'https://i.ytimg.com/vi/V8nz0DSKw7I/hqdefault.jpg',
    duration: 240000,
    category: 'running',
    bpm: 160,
    isOfficial: true,
  },
  {
    videoId: 'K4DyBUG242c',
    title: 'On & On (feat. Daniel Levi)',
    artist: 'Cartoon & Jéja',
    thumbnail: 'https://i.ytimg.com/vi/K4DyBUG242c/hqdefault.jpg',
    duration: 208000,
    category: 'running',
    bpm: 160,
    isOfficial: true,
  },
  {
    videoId: 'TW9d8vYrVFQ',
    title: 'Sky High',
    artist: 'Elektronomia',
    thumbnail: 'https://i.ytimg.com/vi/TW9d8vYrVFQ/hqdefault.jpg',
    duration: 238000,
    category: 'running',
    bpm: 160,
    isOfficial: true,
  },
  {
    videoId: 'TN_8D-79BZg',
    title: 'Puzzle (High Cadence)',
    artist: 'RetroVision',
    thumbnail: 'https://i.ytimg.com/vi/TN_8D-79BZg/hqdefault.jpg',
    duration: 170000,
    category: 'running',
    bpm: 150,
    isOfficial: true,
  },

  // ─── ⚡ Cardio & HIIT Energy ──────────────────────────────────
  {
    videoId: '2hFcy3S7Pbg',
    title: 'Hyper Speed Cardio Pump',
    artist: 'Gym Phonk / CURSEDEVIL',
    thumbnail: 'https://i.ytimg.com/vi/2hFcy3S7Pbg/hqdefault.jpg',
    duration: 180000,
    category: 'cardio',
    bpm: 150,
    isOfficial: true,
  },
  {
    videoId: 'jK2aIUmmdP4',
    title: 'My Heart (Drumstep Workout)',
    artist: 'Different Heaven & EH!DE',
    thumbnail: 'https://i.ytimg.com/vi/jK2aIUmmdP4/hqdefault.jpg',
    duration: 267000,
    category: 'cardio',
    bpm: 145,
    isOfficial: true,
  },
  {
    videoId: 'J2X5mJ3HDYE',
    title: 'Invincible (HIIT Sprint)',
    artist: 'DEAF KEV',
    thumbnail: 'https://i.ytimg.com/vi/J2X5mJ3HDYE/hqdefault.jpg',
    duration: 273000,
    category: 'cardio',
    bpm: 140,
    isOfficial: true,
  },
  {
    videoId: 'yJg-Y5byMMw',
    title: 'Mortals (Power Cadence)',
    artist: 'Warriyo (feat. Laura Brehm)',
    thumbnail: 'https://i.ytimg.com/vi/yJg-Y5byMMw/hqdefault.jpg',
    duration: 230000,
    category: 'cardio',
    bpm: 140,
    isOfficial: true,
  },
  {
    videoId: '3nQNiWdeH2Q',
    title: 'Heroes Tonight',
    artist: 'Janji (feat. Johnning)',
    thumbnail: 'https://i.ytimg.com/vi/3nQNiWdeH2Q/hqdefault.jpg',
    duration: 208000,
    category: 'cardio',
    bpm: 138,
    isOfficial: true,
  },

  // ─── 🇩🇿 Algerian Rai & Urban Workout Vibes ──────────────────
  {
    videoId: 'vU6qmNxOa44',
    title: 'Courage',
    artist: 'Djalil Palermo',
    thumbnail: 'https://i.ytimg.com/vi/vU6qmNxOa44/hqdefault.jpg',
    duration: 205000,
    category: 'rai',
    bpm: 130,
    isOfficial: true,
  },
  {
    videoId: 'sLfqapBIqME',
    title: 'Suavemente',
    artist: 'Soolking',
    thumbnail: 'https://i.ytimg.com/vi/sLfqapBIqME/hqdefault.jpg',
    duration: 228000,
    category: 'rai',
    bpm: 138,
    isOfficial: true,
  },

  // ─── 🚶 Daily Walking & 10,000 Steps ──────────────────────────
  {
    videoId: '5qap5aO4i9A',
    title: 'Morning Forest Walk',
    artist: 'Lofi Girl Stride',
    thumbnail: 'https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg',
    duration: 210000,
    category: 'walking',
    bpm: 115,
    isOfficial: true,
  },
  {
    videoId: 'SHFTHDncw0g',
    title: 'Dreams (Walking Stride)',
    artist: 'Lost Sky',
    thumbnail: 'https://i.ytimg.com/vi/SHFTHDncw0g/hqdefault.jpg',
    duration: 216000,
    category: 'walking',
    bpm: 120,
    isOfficial: true,
  },

  // ─── 🎧 Recovery & Cool Down ──────────────────────────────────
  {
    videoId: '6FNHe3kf8_s',
    title: 'Nekozilla (Recovery Cool Down)',
    artist: 'Different Heaven',
    thumbnail: 'https://i.ytimg.com/vi/6FNHe3kf8_s/hqdefault.jpg',
    duration: 165000,
    category: 'focus',
    bpm: 128,
    isOfficial: true,
  },
];

export const searchCuratedMusic = (query: string): CuratedTrack[] => {
  if (!query.trim()) return [];
  const q = query.toLowerCase().trim();
  return CURATED_TRACKS.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      (t.bpm && `${t.bpm}`.includes(q))
  );
};

export const getTracksByCategory = (
  category: CuratedTrack['category']
): CuratedTrack[] => {
  return CURATED_TRACKS.filter((t) => t.category === category);
};
