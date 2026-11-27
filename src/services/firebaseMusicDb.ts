import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { Track } from '../store/useAudioStore';

const MAX_DURATION_MS = 86400000;

async function ensureAuthenticatedUid(expectedUid?: string): Promise<string | null> {
  await auth.authStateReady();
  const currentUid = auth.currentUser?.uid || null;
  if (!currentUid) return null;
  if (expectedUid && currentUid !== expectedUid) return null;
  return currentUid;
}

function sanitizeHttpUrl(raw?: string | null): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048 || /[\r\n]/.test(trimmed)) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
}

function sanitizeDurationMs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.min(MAX_DURATION_MS, Math.round(raw)));
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':').map((p) => Number(p));
      if (parts.length >= 2 && parts.every((n) => Number.isFinite(n) && n >= 0)) {
        const totalSec = parts.reduce((acc, val) => acc * 60 + val, 0);
        return Math.max(0, Math.min(MAX_DURATION_MS, Math.round(totalSec * 1000)));
      }
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(MAX_DURATION_MS, Math.round(parsed)));
    }
  }
  return 0;
}

function sanitizeVideoId(rawId?: string | null): string {
  if (typeof rawId !== 'string') return '';
  return rawId.trim().replace(/\//g, '_').slice(0, 128);
}

export interface FirebaseUserProfile {
  id: string;
  email: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  phone_number?: string;
  total_listening_seconds?: number;
  created_at?: string;
  updated_at?: string;
}

export interface UserPlaylist {
  id: string;
  name: string;
  description?: string;
  cover?: string;
  tracks: Track[];
  createdAt: string;
  updatedAt: string;
}

export interface FavoriteArtistDoc {
  id: string;
  name: string;
  avatar?: string;
  channelId?: string;
  addedAt: string;
}

const normalizeArtistKey = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'artist';

// ── 0. Username Lookup (for Username + Password Login & Availability Check) ──
export async function getEmailByUsername(username: string): Promise<string | null> {
  const clean = username.trim().toLowerCase().replace(/^@/, '');
  if (!clean) return null;
  const snap = await getDoc(doc(db, 'usernames', clean));
  if (!snap.exists()) return null;
  return (snap.data()?.email as string) || null;
}

export async function claimFirebaseUsername(
  username: string,
  uid: string,
  email: string
): Promise<void> {
  const clean = username.trim().toLowerCase().replace(/^@/, '');
  if (!clean || !uid || !email) return;
  await setDoc(doc(db, 'usernames', clean), {
    uid,
    email: email.trim().toLowerCase(),
    createdAt: new Date().toISOString(),
  });
}

// ── 1. Account Profile ──
export async function getFirebaseUserProfile(uid: string): Promise<FirebaseUserProfile | null> {
  const authUid = await ensureAuthenticatedUid(uid);
  if (!authUid) return null;
  const snap = await getDoc(doc(db, 'users', authUid));
  return snap.exists() ? (snap.data() as FirebaseUserProfile) : null;
}

export async function upsertFirebaseUserProfile(
  uid: string,
  data: Partial<FirebaseUserProfile>
): Promise<void> {
  const authUid = await ensureAuthenticatedUid(uid);
  if (!authUid) return;
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
  if ('avatar_url' in cleanData) {
    cleanData.avatar_url = sanitizeHttpUrl(cleanData.avatar_url as string);
  }
  const ref = doc(db, 'users', authUid);
  const existing = await getDoc(ref);
  const now = new Date().toISOString();
  if (existing.exists()) {
    await updateDoc(ref, { ...cleanData, updated_at: now });
  } else {
    await setDoc(ref, {
      id: authUid,
      email: (cleanData.email as string) || '',
      created_at: now,
      updated_at: now,
      total_listening_seconds: 0,
      ...cleanData,
    });
  }
}

// ── 2. Liked Songs ──
export async function getFirebaseLikedSongs(uid: string): Promise<Track[]> {
  const authUid = await ensureAuthenticatedUid(uid);
  if (!authUid) return [];
  const q = query(
    collection(db, 'users', authUid, 'liked_songs'),
    orderBy('likedAt', 'desc'),
    limit(200)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const item = d.data();
    return {
      videoId: item.videoId || d.id,
      title: item.title || 'Untitled',
      artist: item.artist || 'Artist',
      thumbnail: item.thumbnail || '',
      duration: sanitizeDurationMs(item.duration),
      isOfficial: true,
    };
  });
}

export async function addFirebaseLikedSong(uid: string, track: Track): Promise<void> {
  const cleanVideoId = sanitizeVideoId(track?.videoId);
  if (!uid || !cleanVideoId) return;
  const authUid = await ensureAuthenticatedUid(uid);
  if (!authUid) return;

  const cleanTitle = String(track.title || 'Untitled').trim().slice(0, 300) || 'Untitled';
  const cleanArtist = String(track.artist ?? 'Artist').trim().slice(0, 200);

  await setDoc(doc(db, 'users', authUid, 'liked_songs', cleanVideoId), {
    videoId: cleanVideoId,
    title: cleanTitle,
    artist: cleanArtist,
    thumbnail: sanitizeHttpUrl(track.thumbnail),
    duration: sanitizeDurationMs(track.duration),
    likedAt: new Date().toISOString(),
  });
}

export async function removeFirebaseLikedSong(uid: string, videoId: string): Promise<void> {
  const cleanVideoId = sanitizeVideoId(videoId);
  if (!uid || !cleanVideoId) return;
  const authUid = await ensureAuthenticatedUid(uid);
  if (!authUid) return;
  await deleteDoc(doc(db, 'users', authUid, 'liked_songs', cleanVideoId));
}

// ── 3. User Playlists (Create, Add Track, Remove Track, Delete) ──
export async function getFirebasePlaylists(uid: string): Promise<UserPlaylist[]> {
  const authUid = await ensureAuthenticatedUid(uid);
  if (!authUid) return [];
  const q = query(
    collection(db, 'users', authUid, 'playlists'),
    orderBy('updatedAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<UserPlaylist, 'id'>),
  }));
}

export async function createFirebasePlaylist(
  uid: string,
  name: string,
  description: string = '',
  initialTrack?: Track
): Promise<UserPlaylist | null> {
  const authUid = await ensureAuthenticatedUid(uid);
  if (!authUid || !name.trim()) return null;
  const now = new Date().toISOString();
  const ref = doc(collection(db, 'users', authUid, 'playlists'));
  const tracks = initialTrack?.videoId ? [initialTrack] : [];
  const payload = {
    name: name.trim().slice(0, 100),
    description: description.trim().slice(0, 300),
    cover: sanitizeHttpUrl(initialTrack?.thumbnail),
    tracks,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, payload);
  return { id: ref.id, ...payload };
}

export async function addTrackToFirebasePlaylist(
  uid: string,
  playlistId: string,
  track: Track
): Promise<UserPlaylist | null> {
  const authUid = await ensureAuthenticatedUid(uid);
  if (!authUid || !playlistId || !track?.videoId) return null;
  const ref = doc(db, 'users', authUid, 'playlists', playlistId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as Omit<UserPlaylist, 'id'>;
  const existingTracks = Array.isArray(data.tracks) ? data.tracks : [];
  if (existingTracks.some((t) => t.videoId === track.videoId)) {
    return { id: playlistId, ...data };
  }
  const updatedTracks = [track, ...existingTracks].slice(0, 200);
  const updatedAt = new Date().toISOString();
  const cover = sanitizeHttpUrl(data.cover) || sanitizeHttpUrl(track.thumbnail);
  await updateDoc(ref, { tracks: updatedTracks, cover, updatedAt });
  return { id: playlistId, ...data, tracks: updatedTracks, cover, updatedAt };
}

export async function removeTrackFromFirebasePlaylist(
  uid: string,
  playlistId: string,
  videoId: string
): Promise<void> {
  const authUid = await ensureAuthenticatedUid(uid);
  if (!authUid || !playlistId || !videoId) return;
  const ref = doc(db, 'users', authUid, 'playlists', playlistId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as Omit<UserPlaylist, 'id'>;
  const updatedTracks = (data.tracks || []).filter((t) => t.videoId !== videoId);
  await updateDoc(ref, {
    tracks: updatedTracks,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteFirebasePlaylist(uid: string, playlistId: string): Promise<void> {
  const authUid = await ensureAuthenticatedUid(uid);
  if (!authUid || !playlistId) return;
  await deleteDoc(doc(db, 'users', authUid, 'playlists', playlistId));
}

// ── 4. Favorite Artists ──
export async function getFirebaseFavoriteArtists(uid: string): Promise<FavoriteArtistDoc[]> {
  const authUid = await ensureAuthenticatedUid(uid);
  if (!authUid) return [];
  const snap = await getDocs(collection(db, 'users', authUid, 'favorite_artists'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FavoriteArtistDoc, 'id'>) }));
}

export async function toggleFirebaseFavoriteArtist(
  uid: string,
  artist: { name: string; avatar?: string; channelId?: string }
): Promise<boolean> {
  const authUid = await ensureAuthenticatedUid(uid);
  if (!authUid || !artist?.name) return false;
  const key = normalizeArtistKey(artist.name);
  const ref = doc(db, 'users', authUid, 'favorite_artists', key);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, {
    name: artist.name.trim().slice(0, 200) || 'Artist',
    avatar: sanitizeHttpUrl(artist.avatar),
    channelId: String(artist.channelId || '').slice(0, 128),
    addedAt: new Date().toISOString(),
  });
  return true;
}

// ── 5. Music DNA Sync ──
export async function saveFirebaseMusicDna(
  uid: string,
  payload: {
    telemetry: any[];
    top_artist_ids: string[];
    top_track_ids: string[];
  }
): Promise<void> {
  const authUid = await ensureAuthenticatedUid(uid);
  if (!authUid) return;
  await setDoc(doc(db, 'users', authUid, 'music_dna', 'profile'), {
    telemetry: (payload.telemetry || []).slice(0, 200),
    top_artist_ids: (payload.top_artist_ids || [])
      .map((s) => String(s || '').trim().slice(0, 128))
      .filter(Boolean)
      .slice(0, 20),
    top_track_ids: (payload.top_track_ids || [])
      .map((s) => String(s || '').trim().slice(0, 128))
      .filter(Boolean)
      .slice(0, 50),
    updated_at: new Date().toISOString(),
  });
}

export async function getFirebaseMusicDna(uid: string): Promise<{
  telemetry: any[];
  top_artist_ids: string[];
  top_track_ids: string[];
} | null> {
  const authUid = await ensureAuthenticatedUid(uid);
  if (!authUid) return null;
  const snap = await getDoc(doc(db, 'users', authUid, 'music_dna', 'profile'));
  return snap.exists() ? (snap.data() as any) : null;
}
