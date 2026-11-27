import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../providers/AuthProvider';
import { useAudioStore, Track } from '../store/useAudioStore';
import { useLanguageStore } from '../store/useLanguageStore';
import {
  getFirebaseLikedSongs,
  getFirebasePlaylists,
  createFirebasePlaylist,
  addTrackToFirebasePlaylist,
  getFirebaseDownloadedCatalog,
  removeFirebaseDownloadedCatalogItem,
  DownloadedCatalogItem,
  UserPlaylist,
} from '../services/firebaseMusicDb';
import { useTheme } from '../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import { getUniversalStudioArtwork, getUniversalArtistAvatar } from '../utils/artworkHelper';
import { useDownloadStore, downloadService, DownloadedTrack } from '../services/downloadService';
import { useNetworkStore } from '../services/networkService';
import { LiquidGlassSurface } from '../components/LiquidGlassSurface';
import { DynamicBottomSheet } from '../components/DynamicBottomSheet';
import { ToastManager } from '../components/InAppToast';
import { useDockScrollTracker } from '../utils/scrollDockTracker';

const CURATED_MIX_PRESETS = [
  {
    id: 'mix-run-160',
    titleAr: 'ميكس الجري السريع',
    titleEn: '160 BPM Run Mix',
    subtitleAr: 'إيقاع نشيط ومتواصل',
    subtitleEn: 'High cadence energy',
    colors: ['#FF416C', '#FF4B2B'] as const,
    tracks: [
      {
        videoId: '7nosk_eK6rE',
        title: 'High Cadence Running Beats',
        artist: 'Running Motivation',
        thumbnail: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=300',
        duration: 185000,
      },
      {
        videoId: '2OEL4P1Rz04',
        title: 'Electric Sprint Cardio',
        artist: 'Workout Beats',
        thumbnail: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300',
        duration: 210000,
      },
    ],
  },
  {
    id: 'mix-hiit',
    titleAr: 'ميكس الطاقة والكارديو',
    titleEn: 'Cardio & HIIT Mix',
    subtitleAr: 'موسيقى حماسية متنوعة',
    subtitleEn: 'Upbeat workout rhythm',
    colors: ['#8A2387', '#E94057'] as const,
    tracks: [
      {
        videoId: 'kJQP7kiw5Fk',
        title: 'Adrenaline Rush',
        artist: 'Fitness EDM',
        thumbnail: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300',
        duration: 195000,
      },
    ],
  },
  {
    id: 'mix-chill',
    titleAr: 'ميكس هادئ ومريح',
    titleEn: 'Chill & Focus Mix',
    subtitleAr: 'أجواء هادئة ومريحة',
    subtitleEn: 'Relaxed everyday mix',
    colors: ['#11998e', '#38ef7d'] as const,
    tracks: [
      {
        videoId: 'jfKfPfyJRdk',
        title: 'Morning Breeze Walk',
        artist: 'Lofi Athletics',
        thumbnail: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=300',
        duration: 240000,
      },
    ],
  },
];

type ViewAllType =
  | null
  | 'songs'
  | 'artists'
  | 'albums'
  | 'mixes'
  | 'radios'
  | 'playlists';

export const MusicLibrary = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const language = useLanguageStore((s) => s.language);
  const isAr = language === 'ar';
  const rowDirection = isAr ? 'row-reverse' : 'row';
  const textAlign = isAr ? 'right' : 'left';
  const writingDirection = isAr ? 'rtl' : 'ltr';
  const miniPlayerBottomGap = useMiniPlayerBottomGap();
  const { onScroll: onDockScroll } = useDockScrollTracker();

  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const playTrack = useAudioStore((s) => s.playTrack);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const playAlbumContext = useAudioStore((s) => s.playAlbumContext);
  const toggleLike = useAudioStore((s) => s.toggleLike);
  const likedTrackIds = useAudioStore((s) => s.likedTrackIds);
  const guestLikedTracks = useAudioStore((s) => s.guestLikedTracks);
  const savedLibraryTracks = useAudioStore((s) => s.savedLibraryTracks);
  const followedArtists = useAudioStore((s) => s.followedArtists);
  const savedCollections = useAudioStore((s) => s.savedCollections);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);

  const isOnline = useNetworkStore((s) => s.isOnline);
  const downloadedTracks = useDownloadStore((s) => s.downloadedTracks);
  const activeDownloads = useDownloadStore((s) => s.activeDownloads);
  const totalStorageMB = useDownloadStore((s) => s.totalStorageMB);
  const loadManifest = useDownloadStore((s) => s.loadManifest);

  const [activeTab, setActiveTab] = useState<'liked' | 'downloads'>('liked');
  const [firebaseSavedTracks, setFirebaseSavedTracks] = useState<any[]>([]);
  const [firebaseLikesSynced, setFirebaseLikesSynced] = useState(false);
  const [cloudDownloadCatalog, setCloudDownloadCatalog] = useState<DownloadedCatalogItem[]>([]);
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const [cachedDnaMixes, setCachedDnaMixes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // View All Modal Sheet State
  const [viewAllType, setViewAllType] = useState<ViewAllType>(null);

  // Create Playlist Modal Sheet State
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  const palette = isDark
    ? {
      baseBg: '#070A12',
      orbTop: ['rgba(0, 122, 255, 0.2)', 'rgba(56, 189, 248, 0.06)', 'transparent'] as const,
      orbBottom: ['transparent', 'rgba(139, 92, 246, 0.1)', 'rgba(0, 80, 200, 0.14)'] as const,
      textPrimary: '#FFFFFF',
      textSecondary: 'rgba(255, 255, 255, 0.62)',
      textMuted: 'rgba(255, 255, 255, 0.42)',
      cardBg: 'rgba(18, 22, 30, 0.48)',
      cardBorder: 'rgba(255, 255, 255, 0.14)',
      cardTopBorder: 'rgba(255, 255, 255, 0.34)',
      pillBorder: 'rgba(255, 255, 255, 0.22)',
      inputBg: 'rgba(255, 255, 255, 0.06)',
      inputBorder: 'rgba(255, 255, 255, 0.12)',
      accentBlue: '#38BDF8',
    }
    : {
      baseBg: '#F2F5FA',
      orbTop: ['rgba(0, 122, 255, 0.16)', 'rgba(56, 189, 248, 0.07)', 'transparent'] as const,
      orbBottom: ['transparent', 'rgba(99, 102, 241, 0.09)', 'rgba(0, 122, 255, 0.12)'] as const,
      textPrimary: '#0F172A',
      textSecondary: 'rgba(15, 23, 42, 0.65)',
      textMuted: 'rgba(15, 23, 42, 0.44)',
      cardBg: 'rgba(255, 255, 255, 0.68)',
      cardBorder: 'rgba(15, 23, 42, 0.08)',
      cardTopBorder: 'rgba(255, 255, 255, 0.95)',
      pillBorder: 'rgba(15, 23, 42, 0.12)',
      inputBg: 'rgba(15, 23, 42, 0.045)',
      inputBorder: 'rgba(15, 23, 42, 0.1)',
      accentBlue: '#007AFF',
    };

  const t = isAr
    ? {
      title: 'المكتبة',
      favoritesTab: 'المفضلة',
      downloadsTab: 'المحمّلة',
      playlistsTitle: 'قوائم التشغيل',
      newPlaylist: 'قائمة جديدة',
      viewAll: 'عرض الكل',
      favoriteSongsTitle: 'الأغاني المفضلة',
      followedArtistsTitle: 'الفنانون المتابعون',
      favoriteAlbumsTitle: 'الألبومات المفضلة',
      mixedMusicTitle: 'موسيقى متنوعة',
      artistRadioTitle: 'راديو الفنانين',
      downloadsHeroTitle: 'الموسيقى المحمّلة',
      downloadsEmptyTitle: 'لا توجد مقاطع محمّلة',
      downloadsEmptySub: 'قم بتنزيل أغانيك المفضلة للاستماع بدون إنترنت.',
      favoritesEmptyTitle: 'لا توجد أغانٍ مفضلة بعد',
      favoritesEmptySub: 'أضف الأغاني التي تعجبك لتظهر هنا في مكتبتك.',
      searchDownloadsPlaceholder: 'ابحث في المقاطع المحمّلة...',
      searchFavoritesPlaceholder: 'ابحث في المفضلة...',
      trackUnit: 'أغنية',
      artistTag: 'فنان',
      albumTag: 'ألبوم',
      radioTag: 'راديو',
      playAll: 'تشغيل الكل',
      createPlaylistTitle: 'إنشاء قائمة تشغيل',
      playlistNameLabel: 'اسم القائمة',
      playlistNamePlaceholder: 'مثال: أغاني المساء',
      pickFavLabel: 'أضف من أغانيك المفضلة (اختياري)',
      createBtn: 'إنشاء القائمة',
      creating: 'جاري الإنشاء...',
      loginNeededTitle: 'تسجيل الدخول مطلوب',
      loginNeededBody: 'سجّل الدخول لإنشاء قوائم تشغيل وحفظها في حسابك.',
      playlistCreated: 'تم إنشاء القائمة بنجاح ✨',
      deleteFromPhoneTitle: 'حذف من الهاتف',
      deleteBtn: 'حذف',
      cancelBtn: 'إلغاء',
    }
    : {
      title: 'Library',
      favoritesTab: 'Favorites',
      downloadsTab: 'Downloaded',
      playlistsTitle: 'Your Playlists',
      newPlaylist: 'New Playlist',
      viewAll: 'View All',
      favoriteSongsTitle: 'Favorite Songs',
      followedArtistsTitle: 'Followed Artists',
      favoriteAlbumsTitle: 'Favorite Albums',
      mixedMusicTitle: 'Mixed Music',
      artistRadioTitle: 'Artist Radio',
      downloadsHeroTitle: 'Downloaded Music',
      downloadsEmptyTitle: 'No Downloaded Tracks',
      downloadsEmptySub: 'Download your favorite tracks to listen offline.',
      favoritesEmptyTitle: 'No Favorite Songs Yet',
      favoritesEmptySub: 'Like tracks while listening to build your library.',
      searchDownloadsPlaceholder: 'Search downloaded tracks...',
      searchFavoritesPlaceholder: 'Search favorites...',
      trackUnit: 'tracks',
      artistTag: 'Artist',
      albumTag: 'Album',
      radioTag: 'Radio',
      playAll: 'Play All',
      createPlaylistTitle: 'Create Playlist',
      playlistNameLabel: 'Playlist Name',
      playlistNamePlaceholder: 'e.g. Evening Vibes',
      pickFavLabel: 'Add from Favorite Songs (optional)',
      createBtn: 'Create Playlist',
      creating: 'Creating...',
      loginNeededTitle: 'Sign In Required',
      loginNeededBody: 'Sign in to create and save custom playlists.',
      playlistCreated: 'Playlist created ✨',
      deleteFromPhoneTitle: 'Remove Download',
      deleteBtn: 'Remove',
      cancelBtn: 'Cancel',
    };

  useEffect(() => {
    if (!isOnline) {
      setActiveTab('downloads');
    }
  }, [isOnline]);

  useEffect(() => {
    loadManifest();
  }, [loadManifest]);

  const fetchLibrary = useCallback(async () => {
    try {
      const uid = user?.id || 'guest';
      const cachedFeedRaw = await AsyncStorage.getItem(`@nouble_dna_feed_v5_${uid}`).catch(() => null);
      if (cachedFeedRaw) {
        try {
          const parsed = JSON.parse(cachedFeedRaw);
          if (Array.isArray(parsed?.sections?.topMixes)) {
            setCachedDnaMixes(parsed.sections.topMixes);
          }
        } catch {
          // Ignore malformed cache
        }
      }

      if (!user?.id) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const [likes, userPlaylists, catalogItems] = await Promise.all([
        getFirebaseLikedSongs(user.id),
        getFirebasePlaylists(user.id),
        getFirebaseDownloadedCatalog(user.id).catch(() => []),
      ]);
      setCloudDownloadCatalog(catalogItems);
      setFirebaseSavedTracks(
        likes.map((item) => ({
          id: item.videoId,
          video_id: item.videoId,
          title: item.title,
          artist: item.artist,
          thumbnail: item.thumbnail,
          duration: Math.floor((item.duration || 0) / 1000),
        }))
      );
      if (likes.length > 0) {
        const curIds = useAudioStore.getState().likedTrackIds;
        const merged = Array.from(new Set([...likes.map((l) => l.videoId), ...curIds]));
        if (merged.length !== curIds.length) {
          useAudioStore.setState({ likedTrackIds: merged });
        }
      }
      setFirebaseLikesSynced(true);
      setPlaylists(userPlaylists);
    } catch {
      // Preserve state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  // Unified live library songs: '+' library-saved tracks + liked tracks (guest & Firebase live sync)
  const savedTracks = useMemo(() => {
    const map = new Map<string, any>();

    for (const t of savedLibraryTracks) {
      if (!t?.videoId) continue;
      map.set(t.videoId, {
        id: t.videoId,
        video_id: t.videoId,
        title: t.title,
        artist: t.artist,
        thumbnail: t.thumbnail,
        duration: Math.floor((t.duration || 0) / 1000),
      });
    }

    for (const g of guestLikedTracks) {
      if (!g?.videoId) continue;
      if (!likedTrackIds.includes(g.videoId)) continue;
      if (!map.has(g.videoId)) {
        map.set(g.videoId, {
          id: g.videoId,
          video_id: g.videoId,
          title: g.title,
          artist: g.artist,
          thumbnail: g.thumbnail,
          duration: Math.floor((g.duration || 0) / 1000),
        });
      }
    }

    for (const fb of firebaseSavedTracks) {
      if (!fb?.video_id) continue;
      if ((firebaseLikesSynced || likedTrackIds.length > 0) && !likedTrackIds.includes(fb.video_id)) continue;
      if (!map.has(fb.video_id)) {
        map.set(fb.video_id, fb);
      }
    }

    return Array.from(map.values());
  }, [savedLibraryTracks, guestLikedTracks, firebaseSavedTracks, likedTrackIds, firebaseLikesSynced]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLibrary();
    loadManifest();
  };

  // Merged Playlists: user '+' saved playlists + Firebase custom playlists
  const allPlaylists = useMemo(() => {
    const seenIds = new Set<string>();
    const merged: Array<{ id: string; name: string; artist?: string; cover?: string; tracks: Track[] }> = [];

    for (const sc of savedCollections) {
      if (sc.type !== 'playlist') continue;
      if (seenIds.has(sc.id)) continue;
      seenIds.add(sc.id);
      merged.push({
        id: sc.id,
        name: sc.title,
        artist: sc.artist,
        cover: sc.cover || sc.tracks?.[0]?.thumbnail || '',
        tracks: Array.isArray(sc.tracks) ? sc.tracks : [],
      });
    }

    for (const pl of playlists) {
      if (seenIds.has(pl.id)) continue;
      seenIds.add(pl.id);
      merged.push({
        id: pl.id,
        name: pl.name,
        cover: pl.cover || pl.tracks?.[0]?.thumbnail || '',
        tracks: Array.isArray(pl.tracks) ? pl.tracks : [],
      });
    }

    return merged;
  }, [savedCollections, playlists]);

  // Derived Favorite Albums: explicitly '+' saved albums/singles/EPs first, then grouped from liked tracks
  const favoriteAlbums = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      artist: string;
      cover: string;
      type: 'album' | 'single' | 'ep';
      year?: string;
      tracks: Track[];
    }> = [];
    const seenKeys = new Set<string>();

    for (const sc of savedCollections) {
      if (sc.type !== 'album' && sc.type !== 'single' && sc.type !== 'ep') continue;
      const normKey = `${sc.title.toLowerCase().trim()}::${sc.artist.toLowerCase().trim()}`;
      if (seenKeys.has(sc.id) || seenKeys.has(normKey)) continue;
      seenKeys.add(sc.id);
      seenKeys.add(normKey);
      items.push({
        id: sc.id,
        title: sc.title,
        artist: sc.artist,
        cover: sc.cover || sc.tracks?.[0]?.thumbnail || '',
        type: sc.type,
        year: sc.year,
        tracks: Array.isArray(sc.tracks) ? sc.tracks : [],
      });
    }

    const map = new Map<
      string,
      { id: string; title: string; artist: string; cover: string; type: 'album'; tracks: Track[] }
    >();
    for (const item of savedTracks) {
      const artistName = (item.artist || 'A7 Music').trim();
      const key = artistName.toLowerCase();
      const trackObj: Track = {
        videoId: item.video_id,
        title: item.title,
        artist: artistName,
        thumbnail: item.thumbnail,
        duration: (item.duration || 0) * 1000,
      };
      if (!map.has(key)) {
        map.set(key, {
          id: `alb-${key}`,
          title: isAr ? `ألبوم ${artistName}` : `${artistName} Essentials`,
          artist: artistName,
          cover: item.thumbnail || '',
          type: 'album',
          tracks: [trackObj],
        });
      } else {
        map.get(key)!.tracks.push(trackObj);
      }
    }

    for (const derived of map.values()) {
      const normKey = `${derived.title.toLowerCase().trim()}::${derived.artist.toLowerCase().trim()}`;
      if (seenKeys.has(derived.id) || seenKeys.has(normKey)) continue;
      items.push(derived);
    }

    return items;
  }, [savedCollections, savedTracks, isAr]);

  // Derived Mixed Music (saved '+' mixes + user's Music DNA mixes + curated presets)
  const mixedMusicList = useMemo(() => {
    const savedMixes = savedCollections
      .filter((sc) => sc.type === 'mix')
      .map((sc) => ({
        id: sc.id,
        title: sc.title,
        subtitle: sc.artist || (isAr ? 'ميكس محفوظ' : 'Saved Mix'),
        cover: sc.cover || sc.tracks?.[0]?.thumbnail || '',
        colors: ['#6366F1', '#EC4899'] as const,
        tracks: Array.isArray(sc.tracks) ? sc.tracks : [],
      }));
    const dnaItems = (cachedDnaMixes || []).map((m: any, idx: number) => ({
      id: m.id || `dna-mix-${idx}`,
      title: m.title || (isAr ? 'ميكس مخصص' : 'Custom Mix'),
      subtitle: m.subtitle || (isAr ? 'مختاراتك المتنوعة' : 'Mixed for you'),
      cover: m.cover || m.tracks?.[0]?.thumbnail || '',
      colors: ['#007AFF', '#6366F1'] as const,
      tracks: Array.isArray(m.tracks) ? m.tracks : [],
    }));
    const presetItems = CURATED_MIX_PRESETS.map((p) => ({
      id: p.id,
      title: isAr ? p.titleAr : p.titleEn,
      subtitle: isAr ? p.subtitleAr : p.subtitleEn,
      cover: p.tracks[0]?.thumbnail || '',
      colors: p.colors,
      tracks: p.tracks,
    }));
    const seen = new Set<string>();
    return [...savedMixes, ...dnaItems, ...presetItems].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [savedCollections, cachedDnaMixes, isAr]);

  // Derived Artist Radio Stations (from followedArtists + savedTracks artists)
  const artistRadios = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ id: string; name: string; avatar: string; tracks: Track[] }> = [];

    for (const art of followedArtists || []) {
      const key = (art.name || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const matching = savedTracks
        .filter((s) => (s.artist || '').toLowerCase().includes(key))
        .map((s) => ({
          videoId: s.video_id,
          title: s.title,
          artist: s.artist || art.name,
          thumbnail: s.thumbnail,
          duration: (s.duration || 0) * 1000,
        }));
      list.push({
        id: `radio-${art.id}`,
        name: art.name,
        avatar: getUniversalArtistAvatar(art.avatar, art.name) || art.avatar || '',
        tracks: matching,
      });
    }

    for (const alb of favoriteAlbums) {
      const key = alb.artist.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({
        id: `radio-${key}`,
        name: alb.artist,
        avatar: alb.cover,
        tracks: alb.tracks,
      });
    }
    return list;
  }, [followedArtists, savedTracks, favoriteAlbums]);

  const filteredDownloads = useMemo(() => {
    if (!searchQuery.trim()) return downloadedTracks;
    const q = searchQuery.toLowerCase();
    return downloadedTracks.filter(
      (item) =>
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.artist && item.artist.toLowerCase().includes(q))
    );
  }, [downloadedTracks, searchQuery]);

  // Tracks previously downloaded on another phone under this account, not yet on this device
  const missingCloudDownloads = useMemo(() => {
    const localIds = new Set(downloadedTracks.map((d) => d.videoId));
    const q = searchQuery.trim().toLowerCase();
    return cloudDownloadCatalog.filter((item) => {
      if (!item?.videoId || localIds.has(item.videoId)) return false;
      if (!q) return true;
      return (
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.artist && item.artist.toLowerCase().includes(q))
      );
    });
  }, [cloudDownloadCatalog, downloadedTracks, searchQuery]);

  const handleRedownloadCatalogItem = useCallback(async (item: DownloadedCatalogItem) => {
    if (!isOnline) {
      ToastManager.show({
        title: isAr ? 'أنت في وضع الأوفلاين' : 'Offline Mode',
        subtitle: isAr ? 'يتطلب التحميل اتصالاً بالإنترنت' : 'Internet connection required to download',
        icon: 'cloud-offline-outline',
        duration: 2600,
      });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await downloadService.downloadTrack(
        {
          videoId: item.videoId,
          title: item.title,
          artist: item.artist,
          album: item.album,
          thumbnail: item.thumbnail,
          duration: item.duration,
        },
        'auto'
      );
      ToastManager.show({
        title: isAr ? 'تم التنزيل على الهاتف' : 'Downloaded to Device',
        subtitle: item.title,
        icon: 'checkmark-circle',
        duration: 2400,
      });
    } catch (e: any) {
      ToastManager.show({
        title: isAr ? 'تعذر التحميل' : 'Download Failed',
        subtitle: e?.message || '',
        icon: 'alert-circle',
        duration: 2600,
      });
    }
  }, [isOnline, isAr]);

  const handleRedownloadAllCloud = useCallback(async () => {
    if (!isOnline) {
      ToastManager.show({
        title: isAr ? 'أنت في وضع الأوفلاين' : 'Offline Mode',
        subtitle: isAr ? 'يرجى الاتصال بالإنترنت لإعادة التحميل' : 'Connect to internet to re-download',
        icon: 'cloud-offline-outline',
        duration: 2600,
      });
      return;
    }
    if (missingCloudDownloads.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    ToastManager.show({
      title: isAr ? 'جاري تنزيل القائمة على هذا الهاتف' : 'Re-downloading Cloud List',
      subtitle: `${missingCloudDownloads.length} ${t.trackUnit}`,
      icon: 'cloud-download-outline',
      duration: 2800,
    });
    for (const item of missingCloudDownloads) {
      await downloadService.downloadTrack(
        {
          videoId: item.videoId,
          title: item.title,
          artist: item.artist,
          album: item.album,
          thumbnail: item.thumbnail,
          duration: item.duration,
        },
        'auto'
      ).catch(() => {});
    }
  }, [isOnline, missingCloudDownloads, isAr, t.trackUnit]);

  const handleRemoveFromCloudCatalog = useCallback(async (videoId: string) => {
    if (!user?.id) return;
    setCloudDownloadCatalog((prev) => prev.filter((x) => x.videoId !== videoId));
    await removeFirebaseDownloadedCatalogItem(user.id, videoId).catch(() => {});
  }, [user?.id]);

  const filteredLikedTracks = useMemo(() => {
    if (!searchQuery.trim()) return savedTracks;
    const q = searchQuery.toLowerCase();
    return savedTracks.filter(
      (item) =>
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.artist && item.artist.toLowerCase().includes(q))
    );
  }, [savedTracks, searchQuery]);

  const handleOpenCreatePlaylist = () => {
    if (!user?.id) {
      Alert.alert(t.loginNeededTitle, t.loginNeededBody);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNewPlaylistName('');
    setSelectedTrackIds([]);
    setShowCreatePlaylist(true);
  };

  const toggleSelectTrackForPlaylist = (videoId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTrackIds((prev) =>
      prev.includes(videoId) ? prev.filter((id) => id !== videoId) : [...prev, videoId]
    );
  };

  const handleConfirmCreatePlaylist = async () => {
    const cleanName = newPlaylistName.trim();
    if (!user?.id || !cleanName) return;
    setCreatingPlaylist(true);
    try {
      const created = await createFirebasePlaylist(user.id, cleanName);
      if (created) {
        const pickedTracks: Track[] = savedTracks
          .filter((s) => selectedTrackIds.includes(s.video_id))
          .map((s) => ({
            videoId: s.video_id,
            title: s.title,
            artist: s.artist || 'Artist',
            thumbnail: s.thumbnail,
            duration: (s.duration || 0) * 1000,
          }));

        for (const trk of pickedTracks) {
          await addTrackToFirebasePlaylist(user.id, created.id, trk);
        }

        const finalPlaylist: UserPlaylist = {
          ...created,
          tracks: pickedTracks,
          cover: pickedTracks[0]?.thumbnail || created.cover,
        };
        setPlaylists((prev) => [finalPlaylist, ...prev]);
        setShowCreatePlaylist(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        ToastManager.show({
          title: t.playlistCreated,
          subtitle: `${cleanName} (${pickedTracks.length} ${t.trackUnit})`,
          icon: 'checkmark-circle',
        });
      }
    } catch {
      Alert.alert(isAr ? 'تنبيه' : 'Notice', isAr ? 'تعذر إنشاء القائمة.' : 'Could not create playlist.');
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const handlePlayAllLiked = () => {
    if (savedTracks.length === 0) return;
    const trackQueue: Track[] = savedTracks.map((item) => ({
      videoId: item.video_id,
      title: item.title,
      artist: item.artist || 'Artist',
      thumbnail: item.thumbnail,
      duration: (item.duration || 0) * 1000,
    }));
    playAlbumContext(trackQueue, 0, t.favoriteSongsTitle);
  };

  const handlePlayAllDownloads = () => {
    if (downloadedTracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const trackQueue: Track[] = downloadedTracks.map((d) => ({
      videoId: d.videoId,
      title: d.title,
      artist: d.artist,
      thumbnail: d.artworkLocalUri || d.thumbnail,
      audioUrl: d.audioLocalUri,
      duration: d.duration,
    }));
    useAudioStore.setState({ isOfflinePlayback: true });
    playAlbumContext(trackQueue, 0, t.downloadsHeroTitle);
    setPlayerModalVisible(true);
  };

  const handleDeleteDownload = (item: DownloadedTrack) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t.deleteFromPhoneTitle,
      isAr ? `حذف "${item.title}" من الجهاز؟` : `Remove "${item.title}" from device?`,
      [
        { text: t.cancelBtn, style: 'cancel' },
        {
          text: t.deleteBtn,
          style: 'destructive',
          onPress: async () => {
            await downloadService.deleteDownloadedTrack(item.videoId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  const renderSectionHeader = (
    title: string,
    onViewAll?: () => void,
    rightAction?: React.ReactNode
  ) => (
    <View style={[styles.sectionHeaderRow, { flexDirection: rowDirection }]}>
      <Text style={[styles.sectionTitle, { color: palette.textPrimary, writingDirection }]}>
        {title}
      </Text>
      {rightAction ? (
        rightAction
      ) : onViewAll ? (
        <TouchableOpacity onPress={onViewAll} activeOpacity={0.75}>
          <LiquidGlassSurface
            glassStyle="regular"
            isDark={isDark}
            isInteractive
            borderRadius={14}
            style={[styles.viewAllPill, { backgroundColor: palette.inputBg, borderColor: palette.pillBorder }]}
          >
            <Text style={[styles.viewAllTxt, { color: palette.accentBlue, writingDirection }]}>
              {t.viewAll}
            </Text>
          </LiquidGlassSurface>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: palette.baseBg, paddingTop: insets.top + 6 }]}>
      {/* ── Ambient Liquid Gradient Background ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.baseBg }]} />
        <LinearGradient
          colors={palette.orbTop}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.85, y: 0.75 }}
          style={styles.ambientTop}
        />
        <LinearGradient
          colors={palette.orbBottom}
          start={{ x: 0.2, y: 0.3 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.ambientBottom}
        />
      </View>

      {/* ── Top Title & Liquid Glass Segment Switcher ── */}
      <View style={styles.topHeader}>
        <Text style={[styles.screenTitle, { color: palette.textPrimary, textAlign, writingDirection }]}>
          {t.title}
        </Text>

        <LiquidGlassSurface
          glassStyle="regular"
          isDark={isDark}
          isInteractive={false}
          borderRadius={20}
          style={[
            styles.segmentBar,
            {
              backgroundColor: palette.cardBg,
              borderColor: palette.cardBorder,
              borderTopColor: palette.cardTopBorder,
              flexDirection: rowDirection,
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'liked' && styles.segmentBtnActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab('liked');
            }}
            activeOpacity={0.85}
          >
            <Ionicons
              name={activeTab === 'liked' ? 'heart' : 'heart-outline'}
              size={16}
              color={activeTab === 'liked' ? '#FFFFFF' : palette.textSecondary}
            />
            <Text
              style={[
                styles.segmentTxt,
                { color: activeTab === 'liked' ? '#FFFFFF' : palette.textSecondary, writingDirection },
              ]}
            >
              {t.favoritesTab} ({savedTracks.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'downloads' && styles.segmentBtnActiveGreen]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab('downloads');
            }}
            activeOpacity={0.85}
          >
            <Ionicons
              name={activeTab === 'downloads' ? 'cloud-done' : 'cloud-done-outline'}
              size={16}
              color={activeTab === 'downloads' ? '#FFFFFF' : '#10B981'}
            />
            <Text
              style={[
                styles.segmentTxt,
                { color: activeTab === 'downloads' ? '#FFFFFF' : palette.textSecondary, writingDirection },
              ]}
            >
              {t.downloadsTab} ({downloadedTracks.length})
            </Text>
          </TouchableOpacity>
        </LiquidGlassSurface>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onDockScroll}
        contentContainerStyle={{ paddingBottom: miniPlayerBottomGap + 28 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.textPrimary} />
        }
      >
        {activeTab === 'liked' ? (
          <View>
            {/* ── Search Bar ── */}
            <LiquidGlassSurface
              glassStyle="regular"
              isDark={isDark}
              isInteractive={false}
              borderRadius={16}
              style={[
                styles.searchBar,
                {
                  backgroundColor: palette.inputBg,
                  borderColor: palette.inputBorder,
                  flexDirection: rowDirection,
                },
              ]}
            >
              <Ionicons name="search" size={18} color={palette.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: palette.textPrimary, textAlign, writingDirection }]}
                placeholder={t.searchFavoritesPlaceholder}
                placeholderTextColor={palette.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color={palette.textSecondary} />
                </TouchableOpacity>
              )}
            </LiquidGlassSurface>

            {/* ── 1. Your Playlists Carousel + Create Button ── */}
            {renderSectionHeader(
              `${t.playlistsTitle} (${allPlaylists.length})`,
              allPlaylists.length > 0 ? () => setViewAllType('playlists') : undefined,
              <View style={{ flexDirection: rowDirection, alignItems: 'center', gap: 8 }}>
                {allPlaylists.length > 0 && (
                  <TouchableOpacity onPress={() => setViewAllType('playlists')} activeOpacity={0.75}>
                    <LiquidGlassSurface
                      glassStyle="regular"
                      isDark={isDark}
                      isInteractive
                      borderRadius={14}
                      style={[styles.viewAllPill, { backgroundColor: palette.inputBg, borderColor: palette.pillBorder }]}
                    >
                      <Text style={[styles.viewAllTxt, { color: palette.accentBlue }]}>{t.viewAll}</Text>
                    </LiquidGlassSurface>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={handleOpenCreatePlaylist} activeOpacity={0.8}>
                  <LiquidGlassSurface
                    glassStyle="regular"
                    isDark={isDark}
                    isInteractive
                    tintColor="rgba(0, 122, 255, 0.25)"
                    borderRadius={16}
                    style={[styles.newPlaylistBtn, { flexDirection: rowDirection }]}
                  >
                    <Ionicons name="add" size={16} color="#38BDF8" />
                    <Text style={[styles.newPlaylistTxt, { writingDirection }]}>{t.newPlaylist}</Text>
                  </LiquidGlassSurface>
                </TouchableOpacity>
              </View>
            )}

            {allPlaylists.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carouselContainer}
              >
                {allPlaylists.map((pl) => (
                  <TouchableOpacity
                    key={pl.id}
                    activeOpacity={0.85}
                    onPress={() =>
                      navigation.navigate('AlbumDetails', {
                        playlistId: pl.id,
                        albumTitle: pl.name,
                        artistName: pl.artist || `${pl.tracks?.length || 0} ${t.trackUnit}`,
                        cover: pl.cover || pl.tracks?.[0]?.thumbnail || '',
                        type: 'playlist',
                        album: {
                          id: pl.id,
                          title: pl.name,
                          artist: pl.artist || `${pl.tracks?.length || 0} ${t.trackUnit}`,
                          thumbnail: pl.cover || pl.tracks?.[0]?.thumbnail || '',
                          tracks: pl.tracks || [],
                        },
                      })
                    }
                  >
                    <LiquidGlassSurface
                      glassStyle="regular"
                      isDark={isDark}
                      isInteractive
                      borderRadius={20}
                      style={[
                        styles.squareGlassCard,
                        {
                          backgroundColor: palette.cardBg,
                          borderColor: palette.cardBorder,
                          borderTopColor: palette.cardTopBorder,
                        },
                      ]}
                    >
                      {pl.cover || pl.tracks?.[0]?.thumbnail ? (
                        <Image
                          source={{ uri: getUniversalStudioArtwork(pl.cover || pl.tracks?.[0]?.thumbnail) }}
                          style={styles.squareCover}
                          contentFit="cover"
                        />
                      ) : (
                        <LinearGradient
                          colors={['#007AFF', '#6366F1']}
                          style={[styles.squareCover, styles.coverCenter]}
                        >
                          <Ionicons name="musical-notes" size={32} color="#FFFFFF" />
                        </LinearGradient>
                      )}
                      <Text
                        style={[styles.cardTitle, { color: palette.textPrimary, textAlign, writingDirection }]}
                        numberOfLines={1}
                      >
                        {pl.name}
                      </Text>
                      <Text
                        style={[styles.cardSub, { color: palette.textSecondary, textAlign, writingDirection }]}
                        numberOfLines={1}
                      >
                        {pl.tracks?.length || 0} {t.trackUnit}
                      </Text>
                    </LiquidGlassSurface>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* ── 2. Favorite Songs Carousel + Play All + View All ── */}
            {renderSectionHeader(
              `${t.favoriteSongsTitle} (${filteredLikedTracks.length})`,
              filteredLikedTracks.length > 0 ? () => setViewAllType('songs') : undefined
            )}

            {filteredLikedTracks.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.carouselContainer}
              >
                {filteredLikedTracks.slice(0, 12).map((item) => {
                  const isCurrent = currentTrack?.videoId === item.video_id;
                  return (
                    <TouchableOpacity
                      key={item.video_id}
                      activeOpacity={0.85}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (isCurrent) {
                          togglePlay();
                        } else {
                          playTrack({
                            videoId: item.video_id,
                            title: item.title,
                            artist: item.artist || t.artistTag,
                            thumbnail: item.thumbnail,
                            duration: (item.duration || 0) * 1000,
                          });
                        }
                      }}
                    >
                      <LiquidGlassSurface
                        glassStyle="regular"
                        isDark={isDark}
                        isInteractive
                        borderRadius={20}
                        style={[
                          styles.squareGlassCard,
                          {
                            backgroundColor: palette.cardBg,
                            borderColor: isCurrent ? '#007AFF' : palette.cardBorder,
                            borderTopColor: palette.cardTopBorder,
                          },
                        ]}
                      >
                        <View>
                          <Image
                            source={{ uri: getUniversalStudioArtwork(item.thumbnail) }}
                            style={styles.squareCover}
                            contentFit="cover"
                          />
                          <View style={styles.playOverlayBadge}>
                            <Ionicons
                              name={isCurrent && isPlaying ? 'pause' : 'play'}
                              size={16}
                              color="#FFFFFF"
                            />
                          </View>
                        </View>
                        <Text
                          style={[
                            styles.cardTitle,
                            { color: isCurrent ? palette.accentBlue : palette.textPrimary, textAlign, writingDirection },
                          ]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        <Text
                          style={[styles.cardSub, { color: palette.textSecondary, textAlign, writingDirection }]}
                          numberOfLines={1}
                        >
                          {item.artist || t.artistTag}
                        </Text>
                      </LiquidGlassSurface>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <LiquidGlassSurface
                glassStyle="regular"
                isDark={isDark}
                isInteractive={false}
                borderRadius={22}
                style={[
                  styles.emptyGlassCard,
                  { backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
                ]}
              >
                <Ionicons name="heart-outline" size={32} color={palette.textMuted} />
                <Text style={[styles.emptyTitle, { color: palette.textPrimary, writingDirection }]}>
                  {t.favoritesEmptyTitle}
                </Text>
                <Text style={[styles.emptySub, { color: palette.textSecondary, writingDirection }]}>
                  {t.favoritesEmptySub}
                </Text>
              </LiquidGlassSurface>
            )}

            {/* ── 3. Followed Artists Carousel + View All ── */}
            {followedArtists && followedArtists.length > 0 && (
              <View>
                {renderSectionHeader(
                  `${t.followedArtistsTitle} (${followedArtists.length})`,
                  () => setViewAllType('artists')
                )}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContainer}
                >
                  {followedArtists.map((art) => (
                    <TouchableOpacity
                      key={`art-${art.id}`}
                      activeOpacity={0.85}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        navigation.navigate('ArtistDetail', { artistName: art.name });
                      }}
                    >
                      <LiquidGlassSurface
                        glassStyle="regular"
                        isDark={isDark}
                        isInteractive
                        borderRadius={22}
                        style={[
                          styles.artistGlassCard,
                          {
                            backgroundColor: palette.cardBg,
                            borderColor: palette.cardBorder,
                            borderTopColor: palette.cardTopBorder,
                          },
                        ]}
                      >
                        <Image
                          source={{ uri: getUniversalArtistAvatar(art.avatar, art.name) || art.avatar }}
                          style={styles.artistAvatar}
                          contentFit="cover"
                        />
                        <Text
                          style={[styles.cardTitle, { color: palette.textPrimary, textAlign: 'center' }]}
                          numberOfLines={1}
                        >
                          {art.name}
                        </Text>
                        <Text style={[styles.cardSub, { color: palette.textSecondary, textAlign: 'center' }]}>
                          {t.artistTag}
                        </Text>
                      </LiquidGlassSurface>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── 4. Favorite Albums Carousel + View All ── */}
            {favoriteAlbums.length > 0 && (
              <View>
                {renderSectionHeader(
                  `${t.favoriteAlbumsTitle} (${favoriteAlbums.length})`,
                  () => setViewAllType('albums')
                )}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContainer}
                >
                  {favoriteAlbums.map((alb) => (
                    <TouchableOpacity
                      key={alb.id}
                      activeOpacity={0.85}
                      onPress={() =>
                        navigation.navigate('AlbumDetails', {
                          playlistId: alb.id,
                          albumTitle: alb.title,
                          artistName: alb.artist,
                          cover: alb.cover,
                          type: alb.type || 'album',
                          album: {
                            id: alb.id,
                            title: alb.title,
                            artist: alb.artist,
                            thumbnail: alb.cover,
                            year: alb.year,
                            tracks: alb.tracks,
                          },
                        })
                      }
                    >
                      <LiquidGlassSurface
                        glassStyle="regular"
                        isDark={isDark}
                        isInteractive
                        borderRadius={20}
                        style={[
                          styles.squareGlassCard,
                          {
                            backgroundColor: palette.cardBg,
                            borderColor: palette.cardBorder,
                            borderTopColor: palette.cardTopBorder,
                          },
                        ]}
                      >
                        <Image
                          source={{ uri: getUniversalStudioArtwork(alb.cover) }}
                          style={styles.squareCover}
                          contentFit="cover"
                        />
                        <Text
                          style={[styles.cardTitle, { color: palette.textPrimary, textAlign, writingDirection }]}
                          numberOfLines={1}
                        >
                          {alb.title}
                        </Text>
                        <Text
                          style={[styles.cardSub, { color: palette.textSecondary, textAlign, writingDirection }]}
                          numberOfLines={1}
                        >
                          {alb.tracks.length} {t.trackUnit}
                        </Text>
                      </LiquidGlassSurface>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── 5. Mixed Music Carousel + View All ── */}
            {renderSectionHeader(t.mixedMusicTitle, () => setViewAllType('mixes'))}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselContainer}
            >
              {mixedMusicList.map((mix) => (
                <TouchableOpacity
                  key={mix.id}
                  activeOpacity={0.85}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    navigation.navigate('AlbumDetails', {
                      playlistId: mix.id,
                      albumTitle: mix.title,
                      artistName: mix.subtitle,
                      cover: mix.cover || mix.tracks?.[0]?.thumbnail || '',
                      type: 'mix',
                      album: {
                        id: mix.id,
                        title: mix.title,
                        artist: mix.subtitle,
                        thumbnail: mix.cover || mix.tracks?.[0]?.thumbnail || '',
                        tracks: mix.tracks,
                      },
                    });
                  }}
                >
                  <LiquidGlassSurface
                    glassStyle="regular"
                    isDark={isDark}
                    isInteractive
                    borderRadius={20}
                    style={[
                      styles.squareGlassCard,
                      {
                        backgroundColor: palette.cardBg,
                        borderColor: palette.cardBorder,
                        borderTopColor: palette.cardTopBorder,
                      },
                    ]}
                  >
                    {mix.cover ? (
                      <Image
                        source={{ uri: getUniversalStudioArtwork(mix.cover) }}
                        style={styles.squareCover}
                        contentFit="cover"
                      />
                    ) : (
                      <LinearGradient
                        colors={mix.colors as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.squareCover, styles.coverCenter]}
                      >
                        <Ionicons name="sparkles" size={28} color="#FFFFFF" />
                      </LinearGradient>
                    )}
                    <Text
                      style={[styles.cardTitle, { color: palette.textPrimary, textAlign, writingDirection }]}
                      numberOfLines={1}
                    >
                      {mix.title}
                    </Text>
                    <Text
                      style={[styles.cardSub, { color: palette.textSecondary, textAlign, writingDirection }]}
                      numberOfLines={1}
                    >
                      {mix.subtitle}
                    </Text>
                  </LiquidGlassSurface>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* ── 6. Artist Radio Carousel + View All ── */}
            {artistRadios.length > 0 && (
              <View>
                {renderSectionHeader(t.artistRadioTitle, () => setViewAllType('radios'))}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContainer}
                >
                  {artistRadios.map((radio) => (
                    <TouchableOpacity
                      key={radio.id}
                      activeOpacity={0.85}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (radio.tracks.length > 0) {
                          playAlbumContext(radio.tracks, 0, `${radio.name} ${t.radioTag}`);
                        } else {
                          navigation.navigate('ArtistDetail', { artistName: radio.name });
                        }
                      }}
                    >
                      <LiquidGlassSurface
                        glassStyle="regular"
                        isDark={isDark}
                        isInteractive
                        borderRadius={20}
                        style={[
                          styles.squareGlassCard,
                          {
                            backgroundColor: palette.cardBg,
                            borderColor: palette.cardBorder,
                            borderTopColor: palette.cardTopBorder,
                          },
                        ]}
                      >
                        <View>
                          <Image
                            source={{ uri: getUniversalStudioArtwork(radio.avatar) }}
                            style={styles.squareCover}
                            contentFit="cover"
                          />
                          <View style={styles.radioPillBadge}>
                            <Ionicons name="radio" size={12} color="#FFFFFF" />
                          </View>
                        </View>
                        <Text
                          style={[styles.cardTitle, { color: palette.textPrimary, textAlign, writingDirection }]}
                          numberOfLines={1}
                        >
                          {radio.name}
                        </Text>
                        <Text
                          style={[styles.cardSub, { color: palette.textSecondary, textAlign, writingDirection }]}
                          numberOfLines={1}
                        >
                          {t.radioTag}
                        </Text>
                      </LiquidGlassSurface>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        ) : (
          /* ══════════════════════════════════════════════ */
          /* DOWNLOADS SECTION                              */
          /* ══════════════════════════════════════════════ */
          <View>
            <LiquidGlassSurface
              glassStyle="regular"
              isDark={isDark}
              isInteractive={false}
              borderRadius={24}
              style={[
                styles.downloadsHeroCard,
                {
                  backgroundColor: palette.cardBg,
                  borderColor: palette.cardBorder,
                  borderTopColor: palette.cardTopBorder,
                  flexDirection: rowDirection,
                },
              ]}
            >
              <View style={[styles.downloadsHeroInfo, { flexDirection: rowDirection }]}>
                <View style={styles.downloadsIconCircle}>
                  <Ionicons name="cloud-done" size={26} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.heroTitle, { color: palette.textPrimary, textAlign, writingDirection }]}>
                    {t.downloadsHeroTitle}
                  </Text>
                  <Text style={[styles.heroSub, { color: palette.textSecondary, textAlign, writingDirection }]}>
                    {downloadedTracks.length} {t.trackUnit} • {totalStorageMB}
                  </Text>
                </View>
              </View>
              {downloadedTracks.length > 0 && (
                <TouchableOpacity style={styles.playAllCircle} onPress={handlePlayAllDownloads}>
                  <Ionicons name="play" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </LiquidGlassSurface>

            {/* Search Downloads */}
            <LiquidGlassSurface
              glassStyle="regular"
              isDark={isDark}
              isInteractive={false}
              borderRadius={16}
              style={[
                styles.searchBar,
                {
                  backgroundColor: palette.inputBg,
                  borderColor: palette.inputBorder,
                  flexDirection: rowDirection,
                },
              ]}
            >
              <Ionicons name="search" size={18} color={palette.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: palette.textPrimary, textAlign, writingDirection }]}
                placeholder={t.searchDownloadsPlaceholder}
                placeholderTextColor={palette.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </LiquidGlassSurface>

            {filteredDownloads.length > 0 ? (
              <View style={styles.downloadsListWrap}>
                {filteredDownloads.map((item) => {
                  const isCurrent = currentTrack?.videoId === item.videoId;
                  return (
                    <TouchableOpacity
                      key={item.videoId}
                      activeOpacity={0.82}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (isCurrent) {
                          setPlayerModalVisible(true);
                        } else {
                          playTrack({
                            videoId: item.videoId,
                            title: item.title,
                            artist: item.artist,
                            thumbnail: item.artworkLocalUri || item.thumbnail,
                            audioUrl: item.audioLocalUri,
                            duration: item.duration,
                          });
                        }
                      }}
                    >
                      <LiquidGlassSurface
                        glassStyle="regular"
                        isDark={isDark}
                        isInteractive
                        borderRadius={18}
                        style={[
                          styles.listTrackRow,
                          {
                            backgroundColor: palette.cardBg,
                            borderColor: isCurrent ? '#10B981' : palette.cardBorder,
                            flexDirection: rowDirection,
                          },
                        ]}
                      >
                        <Image
                          source={{ uri: getUniversalStudioArtwork(item.artworkLocalUri || item.thumbnail) }}
                          style={styles.rowThumb}
                          contentFit="cover"
                        />
                        <View style={styles.rowTexts}>
                          <Text
                            style={[
                              styles.rowTitle,
                              { color: isCurrent ? '#10B981' : palette.textPrimary, textAlign, writingDirection },
                            ]}
                            numberOfLines={1}
                          >
                            {item.title}
                          </Text>
                          <Text
                            style={[styles.rowSub, { color: palette.textSecondary, textAlign, writingDirection }]}
                            numberOfLines={1}
                          >
                            {item.artist}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleDeleteDownload(item)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="trash-outline" size={19} color="#EF4444" />
                        </TouchableOpacity>
                      </LiquidGlassSurface>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <LiquidGlassSurface
                glassStyle="regular"
                isDark={isDark}
                isInteractive={false}
                borderRadius={22}
                style={[
                  styles.emptyGlassCard,
                  { backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
                ]}
              >
                <Ionicons name="cloud-offline-outline" size={34} color={palette.textMuted} />
                <Text style={[styles.emptyTitle, { color: palette.textPrimary, writingDirection }]}>
                  {t.downloadsEmptyTitle}
                </Text>
                <Text style={[styles.emptySub, { color: palette.textSecondary, writingDirection }]}>
                  {t.downloadsEmptySub}
                </Text>
              </LiquidGlassSurface>
            )}

            {/* Account Download Catalog (Metadata Synced Across Devices — Re-download on New Phone) */}
            {missingCloudDownloads.length > 0 && (
              <View style={{ marginTop: 22 }}>
                {renderSectionHeader(
                  isAr ? 'مقاطع حسابك (متوفرة لإعادة التحميل)' : 'Account Downloads (Re-download)',
                  undefined,
                  <TouchableOpacity onPress={handleRedownloadAllCloud} activeOpacity={0.75}>
                    <LiquidGlassSurface
                      glassStyle="regular"
                      isDark={isDark}
                      isInteractive
                      borderRadius={14}
                      style={[styles.viewAllPill, { backgroundColor: palette.inputBg, borderColor: palette.pillBorder }]}
                    >
                      <Text style={[styles.viewAllTxt, { color: '#10B981', writingDirection }]}>
                        {isAr ? 'تحميل الكل' : 'Download All'}
                      </Text>
                    </LiquidGlassSurface>
                  </TouchableOpacity>
                )}

                <View style={styles.downloadsListWrap}>
                  {missingCloudDownloads.map((item) => {
                    const dlState = activeDownloads[item.videoId];
                    const isItemDownloading =
                      dlState?.status === 'probing' || dlState?.status === 'downloading';
                    return (
                      <TouchableOpacity
                        key={`cloud-${item.videoId}`}
                        activeOpacity={0.82}
                        disabled={isItemDownloading}
                        onPress={() => handleRedownloadCatalogItem(item)}
                      >
                        <LiquidGlassSurface
                          glassStyle="regular"
                          isDark={isDark}
                          isInteractive
                          borderRadius={18}
                          style={[
                            styles.listTrackRow,
                            {
                              backgroundColor: palette.cardBg,
                              borderColor: palette.cardBorder,
                              flexDirection: rowDirection,
                            },
                          ]}
                        >
                          <Image
                            source={{ uri: getUniversalStudioArtwork(item.thumbnail, item.title, item.artist, item.videoId) }}
                            style={styles.rowThumb}
                            contentFit="cover"
                          />
                          <View style={styles.rowTexts}>
                            <Text
                              style={[styles.rowTitle, { color: palette.textPrimary, textAlign, writingDirection }]}
                              numberOfLines={1}
                            >
                              {item.title}
                            </Text>
                            <Text
                              style={[styles.rowSub, { color: palette.textSecondary, textAlign, writingDirection }]}
                              numberOfLines={1}
                            >
                              {isItemDownloading
                                ? isAr
                                  ? `جاري التحميل... ${Math.round((dlState?.progress || 0) * 100)}%`
                                  : `Downloading... ${Math.round((dlState?.progress || 0) * 100)}%`
                                : item.artist}
                            </Text>
                          </View>
                          {isItemDownloading ? (
                            <ActivityIndicator size="small" color="#10B981" />
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                              <TouchableOpacity
                                onPress={() => handleRedownloadCatalogItem(item)}
                                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                              >
                                <Ionicons name="cloud-download-outline" size={21} color="#10B981" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleRemoveFromCloudCatalog(item.videoId)}
                                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                              >
                                <Ionicons name="close-circle-outline" size={19} color={palette.textMuted} />
                              </TouchableOpacity>
                            </View>
                          )}
                        </LiquidGlassSurface>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── View All Modal Sheet ── */}
      <DynamicBottomSheet
        isVisible={viewAllType !== null}
        onClose={() => setViewAllType(null)}
        title={
          viewAllType === 'songs'
            ? t.favoriteSongsTitle
            : viewAllType === 'artists'
              ? t.followedArtistsTitle
              : viewAllType === 'albums'
                ? t.favoriteAlbumsTitle
                : viewAllType === 'mixes'
                  ? t.mixedMusicTitle
                  : viewAllType === 'radios'
                    ? t.artistRadioTitle
                    : t.playlistsTitle
        }
        initialSnap={0.78}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 10 }}
          showsVerticalScrollIndicator={false}
        >
          {viewAllType === 'songs' &&
            filteredLikedTracks.map((item) => (
              <TouchableOpacity
                key={`va-song-${item.video_id}`}
                activeOpacity={0.8}
                onPress={() => {
                  setViewAllType(null);
                  playTrack({
                    videoId: item.video_id,
                    title: item.title,
                    artist: item.artist || t.artistTag,
                    thumbnail: item.thumbnail,
                    duration: (item.duration || 0) * 1000,
                  });
                }}
              >
                <LiquidGlassSurface
                  glassStyle="regular"
                  isDark={isDark}
                  isInteractive
                  borderRadius={16}
                  style={[styles.listTrackRow, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder, flexDirection: rowDirection }]}
                >
                  <Image source={{ uri: getUniversalStudioArtwork(item.thumbnail) }} style={styles.rowThumb} contentFit="cover" />
                  <View style={styles.rowTexts}>
                    <Text style={[styles.rowTitle, { color: palette.textPrimary, textAlign, writingDirection }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.rowSub, { color: palette.textSecondary, textAlign, writingDirection }]} numberOfLines={1}>
                      {item.artist || t.artistTag}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() =>
                      toggleLike({
                        videoId: item.video_id,
                        title: item.title,
                        artist: item.artist || t.artistTag,
                        thumbnail: item.thumbnail,
                        duration: (item.duration || 0) * 1000,
                      })
                    }
                  >
                    <Ionicons name="heart" size={20} color="#EC4899" />
                  </TouchableOpacity>
                </LiquidGlassSurface>
              </TouchableOpacity>
            ))}

          {viewAllType === 'artists' &&
            followedArtists.map((art) => (
              <TouchableOpacity
                key={`va-art-${art.id}`}
                activeOpacity={0.8}
                onPress={() => {
                  setViewAllType(null);
                  navigation.navigate('ArtistDetail', { artistName: art.name });
                }}
              >
                <LiquidGlassSurface
                  glassStyle="regular"
                  isDark={isDark}
                  isInteractive
                  borderRadius={16}
                  style={[styles.listTrackRow, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder, flexDirection: rowDirection }]}
                >
                  <Image
                    source={{ uri: getUniversalArtistAvatar(art.avatar, art.name) || art.avatar }}
                    style={[styles.rowThumb, { borderRadius: 24 }]}
                    contentFit="cover"
                  />
                  <View style={styles.rowTexts}>
                    <Text style={[styles.rowTitle, { color: palette.textPrimary, textAlign, writingDirection }]} numberOfLines={1}>
                      {art.name}
                    </Text>
                    <Text style={[styles.rowSub, { color: palette.textSecondary, textAlign, writingDirection }]}>
                      {t.artistTag}
                    </Text>
                  </View>
                  <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={18} color={palette.textMuted} />
                </LiquidGlassSurface>
              </TouchableOpacity>
            ))}

          {viewAllType === 'albums' &&
            favoriteAlbums.map((alb) => (
              <TouchableOpacity
                key={`va-alb-${alb.id}`}
                activeOpacity={0.8}
                onPress={() => {
                  setViewAllType(null);
                  navigation.navigate('AlbumDetails', {
                    playlistId: alb.id,
                    albumTitle: alb.title,
                    artistName: alb.artist,
                    cover: alb.cover,
                    type: alb.type || 'album',
                    album: {
                      id: alb.id,
                      title: alb.title,
                      artist: alb.artist,
                      thumbnail: alb.cover,
                      year: alb.year,
                      tracks: alb.tracks,
                    },
                  });
                }}
              >
                <LiquidGlassSurface
                  glassStyle="regular"
                  isDark={isDark}
                  isInteractive
                  borderRadius={16}
                  style={[styles.listTrackRow, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder, flexDirection: rowDirection }]}
                >
                  <Image source={{ uri: getUniversalStudioArtwork(alb.cover) }} style={styles.rowThumb} contentFit="cover" />
                  <View style={styles.rowTexts}>
                    <Text style={[styles.rowTitle, { color: palette.textPrimary, textAlign, writingDirection }]} numberOfLines={1}>
                      {alb.title}
                    </Text>
                    <Text style={[styles.rowSub, { color: palette.textSecondary, textAlign, writingDirection }]}>
                      {alb.tracks.length} {t.trackUnit}
                    </Text>
                  </View>
                  <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={18} color={palette.textMuted} />
                </LiquidGlassSurface>
              </TouchableOpacity>
            ))}

          {viewAllType === 'mixes' &&
            mixedMusicList.map((mix) => (
              <TouchableOpacity
                key={`va-mix-${mix.id}`}
                activeOpacity={0.8}
                onPress={() => {
                  setViewAllType(null);
                  navigation.navigate('AlbumDetails', {
                    playlistId: mix.id,
                    albumTitle: mix.title,
                    artistName: mix.subtitle,
                    cover: mix.cover || mix.tracks?.[0]?.thumbnail || '',
                    type: 'mix',
                    album: {
                      id: mix.id,
                      title: mix.title,
                      artist: mix.subtitle,
                      thumbnail: mix.cover || mix.tracks?.[0]?.thumbnail || '',
                      tracks: mix.tracks,
                    },
                  });
                }}
              >
                <LiquidGlassSurface
                  glassStyle="regular"
                  isDark={isDark}
                  isInteractive
                  borderRadius={16}
                  style={[styles.listTrackRow, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder, flexDirection: rowDirection }]}
                >
                  {mix.cover ? (
                    <Image source={{ uri: getUniversalStudioArtwork(mix.cover) }} style={styles.rowThumb} contentFit="cover" />
                  ) : (
                    <LinearGradient colors={mix.colors as any} style={[styles.rowThumb, styles.coverCenter]}>
                      <Ionicons name="sparkles" size={20} color="#FFF" />
                    </LinearGradient>
                  )}
                  <View style={styles.rowTexts}>
                    <Text style={[styles.rowTitle, { color: palette.textPrimary, textAlign, writingDirection }]} numberOfLines={1}>
                      {mix.title}
                    </Text>
                    <Text style={[styles.rowSub, { color: palette.textSecondary, textAlign, writingDirection }]} numberOfLines={1}>
                      {mix.subtitle}
                    </Text>
                  </View>
                  <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={18} color={palette.textMuted} />
                </LiquidGlassSurface>
              </TouchableOpacity>
            ))}

          {viewAllType === 'radios' &&
            artistRadios.map((radio) => (
              <TouchableOpacity
                key={`va-rad-${radio.id}`}
                activeOpacity={0.8}
                onPress={() => {
                  setViewAllType(null);
                  if (radio.tracks.length > 0) {
                    playAlbumContext(radio.tracks, 0, `${radio.name} ${t.radioTag}`);
                  } else {
                    navigation.navigate('ArtistDetail', { artistName: radio.name });
                  }
                }}
              >
                <LiquidGlassSurface
                  glassStyle="regular"
                  isDark={isDark}
                  isInteractive
                  borderRadius={16}
                  style={[styles.listTrackRow, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder, flexDirection: rowDirection }]}
                >
                  <Image source={{ uri: getUniversalStudioArtwork(radio.avatar) }} style={styles.rowThumb} contentFit="cover" />
                  <View style={styles.rowTexts}>
                    <Text style={[styles.rowTitle, { color: palette.textPrimary, textAlign, writingDirection }]} numberOfLines={1}>
                      {radio.name}
                    </Text>
                    <Text style={[styles.rowSub, { color: palette.textSecondary, textAlign, writingDirection }]}>
                      {t.radioTag}
                    </Text>
                  </View>
                  <Ionicons name="radio" size={20} color={palette.accentBlue} />
                </LiquidGlassSurface>
              </TouchableOpacity>
            ))}

          {viewAllType === 'playlists' &&
            allPlaylists.map((pl) => (
              <TouchableOpacity
                key={`va-pl-${pl.id}`}
                activeOpacity={0.8}
                onPress={() => {
                  setViewAllType(null);
                  navigation.navigate('AlbumDetails', {
                    playlistId: pl.id,
                    albumTitle: pl.name,
                    artistName: pl.artist || `${pl.tracks?.length || 0} ${t.trackUnit}`,
                    cover: pl.cover || pl.tracks?.[0]?.thumbnail || '',
                    type: 'playlist',
                    album: {
                      id: pl.id,
                      title: pl.name,
                      artist: pl.artist || `${pl.tracks?.length || 0} ${t.trackUnit}`,
                      thumbnail: pl.cover || pl.tracks?.[0]?.thumbnail || '',
                      tracks: pl.tracks || [],
                    },
                  });
                }}
              >
                <LiquidGlassSurface
                  glassStyle="regular"
                  isDark={isDark}
                  isInteractive
                  borderRadius={16}
                  style={[styles.listTrackRow, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder, flexDirection: rowDirection }]}
                >
                  {pl.cover || pl.tracks?.[0]?.thumbnail ? (
                    <Image
                      source={{ uri: getUniversalStudioArtwork(pl.cover || pl.tracks?.[0]?.thumbnail) }}
                      style={styles.rowThumb}
                      contentFit="cover"
                    />
                  ) : (
                    <LinearGradient colors={['#007AFF', '#6366F1']} style={[styles.rowThumb, styles.coverCenter]}>
                      <Ionicons name="musical-notes" size={20} color="#FFF" />
                    </LinearGradient>
                  )}
                  <View style={styles.rowTexts}>
                    <Text style={[styles.rowTitle, { color: palette.textPrimary, textAlign, writingDirection }]} numberOfLines={1}>
                      {pl.name}
                    </Text>
                    <Text style={[styles.rowSub, { color: palette.textSecondary, textAlign, writingDirection }]}>
                      {pl.tracks?.length || 0} {t.trackUnit}
                    </Text>
                  </View>
                  <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={18} color={palette.textMuted} />
                </LiquidGlassSurface>
              </TouchableOpacity>
            ))}
        </ScrollView>
      </DynamicBottomSheet>

      {/* ── Create Custom Playlist & Pick Favorite Music Sheet ── */}
      <DynamicBottomSheet
        isVisible={showCreatePlaylist}
        onClose={() => setShowCreatePlaylist(false)}
        title={t.createPlaylistTitle}
        initialSnap={0.78}
      >
        <View style={{ flex: 1, paddingHorizontal: 18, paddingBottom: insets.bottom + 20 }}>
          <Text style={[styles.sheetLabel, { color: palette.textSecondary, textAlign, writingDirection }]}>
            {t.playlistNameLabel}
          </Text>
          <TextInput
            style={[
              styles.sheetInput,
              {
                color: palette.textPrimary,
                backgroundColor: palette.inputBg,
                borderColor: palette.inputBorder,
                textAlign,
                writingDirection,
              },
            ]}
            value={newPlaylistName}
            onChangeText={setNewPlaylistName}
            placeholder={t.playlistNamePlaceholder}
            placeholderTextColor={palette.textMuted}
          />

          {savedTracks.length > 0 && (
            <>
              <Text style={[styles.sheetLabel, { color: palette.textSecondary, textAlign, writingDirection, marginTop: 14 }]}>
                {t.pickFavLabel}
              </Text>
              <ScrollView style={{ flex: 1, marginTop: 6 }} showsVerticalScrollIndicator={false}>
                {savedTracks.map((item) => {
                  const selected = selectedTrackIds.includes(item.video_id);
                  return (
                    <TouchableOpacity
                      key={`pick-${item.video_id}`}
                      activeOpacity={0.75}
                      onPress={() => toggleSelectTrackForPlaylist(item.video_id)}
                      style={[
                        styles.pickRow,
                        {
                          flexDirection: rowDirection,
                          borderColor: selected ? '#007AFF' : palette.inputBorder,
                          backgroundColor: selected ? 'rgba(0, 122, 255, 0.1)' : palette.inputBg,
                        },
                      ]}
                    >
                      <Image source={{ uri: getUniversalStudioArtwork(item.thumbnail) }} style={styles.pickThumb} contentFit="cover" />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: palette.textPrimary, textAlign, writingDirection }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[styles.rowSub, { color: palette.textSecondary, textAlign, writingDirection }]} numberOfLines={1}>
                          {item.artist || t.artistTag}
                        </Text>
                      </View>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'add-circle-outline'}
                        size={22}
                        color={selected ? '#007AFF' : palette.textMuted}
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          <TouchableOpacity
            disabled={!newPlaylistName.trim() || creatingPlaylist}
            onPress={handleConfirmCreatePlaylist}
            activeOpacity={0.86}
            style={[styles.createBtnOuter, (!newPlaylistName.trim() || creatingPlaylist) && { opacity: 0.55 }]}
          >
            <LiquidGlassSurface
              glassStyle="regular"
              isDark={isDark}
              isInteractive
              tintColor="rgba(0, 122, 255, 0.45)"
              borderRadius={24}
              style={styles.createBtnGlass}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.26)', 'rgba(56,189,248,0.24)', 'rgba(0,122,255,0.45)']}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.createBtnGradient}
              >
                <Text style={styles.createBtnTxt}>
                  {creatingPlaylist ? t.creating : t.createBtn}
                </Text>
              </LinearGradient>
            </LiquidGlassSurface>
          </TouchableOpacity>
        </View>
      </DynamicBottomSheet>

      {loading && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator color="#007AFF" size="large" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  ambientTop: {
    position: 'absolute',
    top: -60,
    left: -50,
    width: 400,
    height: 400,
    borderRadius: 200,
  },
  ambientBottom: {
    position: 'absolute',
    bottom: -80,
    right: -50,
    width: 420,
    height: 420,
    borderRadius: 210,
  },
  topHeader: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
  },
  segmentBar: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 4,
    gap: 6,
    overflow: 'hidden',
  },
  segmentBtn: {
    flex: 1,
    height: 40,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#007AFF',
  },
  segmentBtnActiveGreen: {
    backgroundColor: '#10B981',
  },
  segmentTxt: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  searchBar: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 16,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  sectionHeaderRow: {
    paddingHorizontal: 16,
    marginBottom: 10,
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  viewAllPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  viewAllTxt: {
    fontSize: 12,
    fontWeight: '700',
  },
  newPlaylistBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  newPlaylistTxt: {
    color: '#38BDF8',
    fontSize: 12.5,
    fontWeight: '700',
  },
  carouselContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  squareGlassCard: {
    width: 144,
    borderRadius: 20,
    borderWidth: 1,
    padding: 10,
    overflow: 'hidden',
  },
  squareCover: {
    width: 122,
    height: 122,
    borderRadius: 14,
    marginBottom: 8,
  },
  coverCenter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  playOverlayBadge: {
    position: 'absolute',
    bottom: 14,
    right: 6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0, 122, 255, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioPillBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 122, 255, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artistGlassCard: {
    width: 124,
    borderRadius: 22,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    overflow: 'hidden',
  },
  artistAvatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  cardSub: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
  },
  emptyGlassCard: {
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 22,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: 12.5,
    textAlign: 'center',
  },
  downloadsHeroCard: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 14,
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    overflow: 'hidden',
  },
  downloadsHeroInfo: {
    flex: 1,
    alignItems: 'center',
    gap: 12,
  },
  downloadsIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  heroSub: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 2,
  },
  playAllCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadsListWrap: {
    paddingHorizontal: 16,
    gap: 10,
  },
  listTrackRow: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  rowThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  rowTexts: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  rowSub: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  sheetLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  sheetInput: {
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
  },
  pickRow: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 8,
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  pickThumb: {
    width: 42,
    height: 42,
    borderRadius: 10,
  },
  createBtnOuter: {
    marginTop: 12,
    borderRadius: 24,
    overflow: 'hidden',
  },
  createBtnGlass: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.36)',
    overflow: 'hidden',
  },
  createBtnGradient: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBtnTxt: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
});

export default MusicLibrary;
