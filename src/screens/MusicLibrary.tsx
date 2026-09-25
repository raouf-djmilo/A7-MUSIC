import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../providers/AuthProvider';
import { useAudioStore, Track } from '../store/useAudioStore';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import { getUniversalStudioArtwork, getUniversalArtistAvatar } from '../utils/artworkHelper';
import { useDownloadStore, downloadService, DownloadedTrack } from '../services/downloadService';
import { useNetworkStore } from '../services/networkService';

const { width } = Dimensions.get('window');

// Curated Workout & Running Playlists
const WORKOUT_PLAYLISTS = [
  {
    id: 'pl-run-160',
    title: '🏃 160 BPM Cadence Run',
    subtitle: 'إيقاع مثالي لركض مسافات طويلة',
    color: ['#FF416C', '#FF4B2B'],
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
    id: 'pl-cardio-hiit',
    title: '⚡ Cardio & HIIT Energy',
    subtitle: 'حماس ونبض عالي لتمارين الكارديو',
    color: ['#8A2387', '#E94057'],
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
    id: 'pl-walk-chill',
    title: '🚶 Morning Walk & Chill',
    subtitle: 'موسيقى هادئة ومنعشة للمشي الصباحي',
    color: ['#11998e', '#38ef7d'],
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

export const MusicLibrary = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createThemedStyles(theme, isDark), [theme, isDark]);
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const playTrack = useAudioStore((s) => s.playTrack);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const playAlbumContext = useAudioStore((s) => s.playAlbumContext);
  const toggleLike = useAudioStore((s) => s.toggleLike);
  const followedArtists = useAudioStore((s) => s.followedArtists);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);
  const playDownloadedQueue = useAudioStore((s) => s.playDownloadedQueue);

  // ── Offline & Downloaded Storage Hooks ──
  const isOnline = useNetworkStore((s) => s.isOnline);
  const downloadedTracks = useDownloadStore((s) => s.downloadedTracks);
  const totalStorageMB = useDownloadStore((s) => s.totalStorageMB);
  const loadManifest = useDownloadStore((s) => s.loadManifest);

  const [activeTab, setActiveTab] = useState<'liked' | 'downloads'>('liked');
  const [savedTracks, setSavedTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-switch to Downloads tab when device is offline
  useEffect(() => {
    if (!isOnline) {
      setActiveTab('downloads');
    }
  }, [isOnline]);

  useEffect(() => {
    loadManifest();
  }, [loadManifest]);

  const fetchLibrary = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('music_likes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setSavedTracks(data);
      }
    } catch (e) {
      console.warn('Error fetching music library:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLibrary();
    loadManifest();
  };

  const filteredTracks = savedTracks.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.artist && t.artist.toLowerCase().includes(q))
    );
  });

  const filteredDownloads = downloadedTracks.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.artist && t.artist.toLowerCase().includes(q))
    );
  });

  const handlePlayAllLiked = () => {
    if (savedTracks.length === 0) return;
    const trackQueue: Track[] = savedTracks.map((t) => ({
      videoId: t.video_id,
      title: t.title,
      artist: t.artist || 'فنان',
      thumbnail: t.thumbnail,
      duration: (t.duration || 0) * 1000,
    }));
    playAlbumContext(trackQueue, 0, 'Liked Songs');
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
    playAlbumContext(trackQueue, 0, 'Downloads');
    setPlayerModalVisible(true);
  };

  const handleDeleteDownload = (item: DownloadedTrack) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'حذف من الهاتف',
      `هل تريد حذف "${item.title}" من ذاكرة الهاتف لتفريغ المساحة؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            await downloadService.deleteDownloadedTrack(item.videoId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      {/* ── Segmented Tab Switch (Liked vs Downloads) ── */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'liked' && styles.segmentBtnActiveLiked]}
          activeOpacity={0.8}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('liked');
          }}
        >
          <Ionicons
            name={activeTab === 'liked' ? 'heart' : 'heart-outline'}
            size={16}
            color={activeTab === 'liked' ? '#FFFFFF' : theme.textMuted}
          />
          <Text style={[styles.segmentText, activeTab === 'liked' && styles.segmentTextActive]}>
            المفضلة ({savedTracks.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'downloads' && styles.segmentBtnActiveDownloads]}
          activeOpacity={0.8}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('downloads');
          }}
        >
          <Ionicons
            name={activeTab === 'downloads' ? 'cloud-done' : 'cloud-done-outline'}
            size={16}
            color={activeTab === 'downloads' ? '#FFFFFF' : '#10B981'}
          />
          <Text style={[styles.segmentText, activeTab === 'downloads' && styles.segmentTextActive]}>
            المحمّلة ({downloadedTracks.length})
          </Text>
          {downloadedTracks.length > 0 && (
            <View style={styles.storageMiniBadge}>
              <Text style={styles.storageMiniBadgeText}>{totalStorageMB}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Tab View A: DOWNLOADS ── */}
      {activeTab === 'downloads' && (
        <>
          {/* Hardware Downloads Hero Banner */}
          <LinearGradient
            colors={['#065f46', '#059669', '#10B981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroBanner}
          >
            <View style={styles.heroContent}>
              <View style={[styles.heartCircle, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                <Ionicons name="phone-portrait-outline" size={32} color="#FFF" />
              </View>
              <View style={styles.heroTexts}>
                <Text style={styles.heroTitle}>الأغاني المحمّلة على الجهاز</Text>
                <Text style={styles.heroSubtitle}>
                  {downloadedTracks.length} {downloadedTracks.length === 1 ? 'مقطع' : 'مقاطع'} • {totalStorageMB} • استماع 0ms بدون إنترنت
                </Text>
              </View>
            </View>

            {downloadedTracks.length > 0 && (
              <TouchableOpacity style={styles.heroPlayBtn} onPress={handlePlayAllDownloads}>
                <Ionicons name="play" size={26} color="#000" />
              </TouchableOpacity>
            )}
          </LinearGradient>

          {/* Search Within Downloads */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={theme.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث في المقاطع المحمّلة على الهاتف..."
              placeholderTextColor={theme.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.sectionHeader}>
            <Ionicons name="hardware-chip-outline" size={18} color="#10B981" style={{ marginRight: 6 }} />
            <Text style={styles.sectionTitle}>
              المخزنة على وحدة التخزين ({filteredDownloads.length})
            </Text>
          </View>
        </>
      )}

      {/* ── Tab View B: LIKED SONGS & CURATED ── */}
      {activeTab === 'liked' && (
        <>
          {/* Liked Songs Hero Banner */}
          <LinearGradient
            colors={['#450af5', '#8e2de2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroBanner}
          >
            <View style={styles.heroContent}>
              <View style={styles.heartCircle}>
                <Ionicons name="heart" size={36} color="#FFF" />
              </View>
              <View style={styles.heroTexts}>
                <Text style={styles.heroTitle}>الأغاني المفضلة</Text>
                <Text style={styles.heroSubtitle}>
                  {savedTracks.length} {savedTracks.length === 1 ? 'أغنية محفوظة' : 'أغانٍ محفوظة'}
                </Text>
              </View>
            </View>

            {savedTracks.length > 0 && (
              <TouchableOpacity style={styles.heroPlayBtn} onPress={handlePlayAllLiked}>
                <Ionicons name="play" size={26} color="#000" />
              </TouchableOpacity>
            )}
          </LinearGradient>

          {/* Followed Artists Section */}
          {followedArtists && followedArtists.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <View style={styles.sectionHeader}>
                <Ionicons name="people" size={18} color="#1DB954" style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>الفنانون المتابعون ({followedArtists.length})</Text>
              </View>

              <FlatList
                data={followedArtists}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => `fav-art-${item.id}`}
                contentContainerStyle={styles.artistsScroll}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.followedArtistCard}
                    activeOpacity={0.8}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      navigation.navigate('ArtistDetail', { artistName: item.name });
                    }}
                  >
                    <View style={styles.followedArtistAvatarWrap}>
                      {getUniversalArtistAvatar(item.avatar, item.name) || item.avatar ? (
                        <Image
                          source={{ uri: getUniversalArtistAvatar(item.avatar, item.name) || item.avatar }}
                          style={styles.followedArtistAvatar}
                          contentFit="cover"
                          priority="normal"
                          cachePolicy="memory-disk"
                          transition={150}
                        />
                      ) : (
                        <View style={[styles.followedArtistAvatar, styles.followedArtistFallback]}>
                          <Text style={styles.followedArtistFallbackText}>
                            {(item.name || 'A').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.followedArtistName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.followedArtistTag}>فنان</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {/* Workout Curated Playlists Section */}
          <View style={styles.sectionHeader}>
            <Ionicons name="flame" size={18} color="#FF4B2B" style={{ marginRight: 6 }} />
            <Text style={styles.sectionTitle}>قوائم تشغيل التمارين الرياضية</Text>
          </View>

          <FlatList
            data={WORKOUT_PLAYLISTS}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.playlistsScroll}
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  if (item.tracks.length > 0) {
                    playAlbumContext(item.tracks, 0, item.title);
                  }
                }}
              >
                <LinearGradient
                  colors={item.color as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.playlistCard}
                >
                  <View style={styles.playlistTop}>
                    <Ionicons name="musical-note" size={24} color="rgba(255,255,255,0.7)" />
                    <View style={styles.miniPlayCircle}>
                      <Ionicons name="play" size={14} color="#000" />
                    </View>
                  </View>
                  <View>
                    <Text style={styles.playlistTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.playlistSub} numberOfLines={1}>{item.subtitle}</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )}
          />

          {/* Search Within Library */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={theme.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث في أغانيك المفضلة..."
              placeholderTextColor={theme.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.sectionHeader}>
            <Ionicons name="list" size={18} color="#1DB954" style={{ marginRight: 6 }} />
            <Text style={styles.sectionTitle}>
              قائمتي ({filteredTracks.length})
            </Text>
          </View>
        </>
      )}
    </View>
  );

  const renderTrackItem = ({ item, index }: { item: any; index: number }) => {
    // ── Check if rendering a DownloadedTrack ──
    if (activeTab === 'downloads') {
      const dTrack = item as DownloadedTrack;
      const isCurrent = currentTrack?.videoId === dTrack.videoId;

      return (
        <TouchableOpacity
          style={[styles.trackRow, isCurrent && styles.trackRowActive]}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (isCurrent) {
              setPlayerModalVisible(true);
            } else {
              const trackQueue: Track[] = downloadedTracks.map((d) => ({
                videoId: d.videoId,
                title: d.title,
                artist: d.artist,
                thumbnail: d.artworkLocalUri || d.thumbnail,
                audioUrl: d.audioLocalUri,
                duration: d.duration,
              }));
              useAudioStore.setState({ isOfflinePlayback: true });
              playAlbumContext(trackQueue, index, 'Downloads');
              setPlayerModalVisible(true);
            }
          }}
        >
          <Image
            source={{ uri: dTrack.artworkLocalUri || getUniversalStudioArtwork(dTrack.thumbnail) }}
            style={styles.trackThumb}
            contentFit="cover"
            priority="high"
            cachePolicy="memory-disk"
            transition={200}
          />

          <View style={styles.trackInfo}>
            <Text style={[styles.trackTitle, isCurrent && { color: '#10B981' }]} numberOfLines={1}>
              {dTrack.title}
            </Text>
            <View style={styles.downloadMetaRow}>
              <Text style={styles.trackArtist} numberOfLines={1}>
                {dTrack.artist || 'فنان'}
              </Text>
              <View style={styles.dotSeparator} />
              <View style={styles.bitrateBadge}>
                <Text style={styles.bitrateBadgeText}>{dTrack.bitrateLabel || '320 kbps HD'}</Text>
              </View>
              <View style={styles.dotSeparator} />
              <View style={styles.sizeBadgeWrap}>
                <Ionicons name="phone-portrait-outline" size={11} color="#10B981" />
                <Text style={styles.fileSizeText}>{dTrack.fileSizeMB}</Text>
              </View>
            </View>
          </View>

          {/* Delete Button to reclaim storage */}
          <TouchableOpacity
            style={styles.trashBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={(e) => {
              e.stopPropagation();
              handleDeleteDownload(dTrack);
            }}
          >
            <Ionicons name="trash-outline" size={18} color="rgba(239, 68, 68, 0.85)" />
          </TouchableOpacity>

          {/* Play/Pause Button */}
          <TouchableOpacity 
            style={styles.playIconBox}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (isCurrent) {
                togglePlay();
              } else {
                playDownloadedQueue(index);
              }
            }}
          >
            <Ionicons
              name={isCurrent && isPlaying ? 'pause' : 'play'}
              size={14}
              color={isCurrent ? '#10B981' : theme.textSecondary}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }

    // ── Liked Track Item (Online / Supabase) ──
    const isCurrent = currentTrack?.videoId === item.video_id;

    return (
      <TouchableOpacity
        style={[styles.trackRow, isCurrent && styles.trackRowActive]}
        activeOpacity={0.7}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (isCurrent) {
            setPlayerModalVisible(true);
          } else {
            const activeList = searchQuery.trim() ? filteredTracks : savedTracks;
            const trackQueue: Track[] = activeList.map((t) => ({
              videoId: t.video_id,
              title: t.title,
              artist: t.artist || 'فنان',
              thumbnail: t.thumbnail,
              duration: (t.duration || 0) * 1000,
            }));
            const foundIdx = trackQueue.findIndex((t) => t.videoId === item.video_id);
            const playIdx = foundIdx >= 0 ? foundIdx : index;
            playAlbumContext(trackQueue, playIdx, 'favorites');
            setPlayerModalVisible(true);
          }
        }}
      >
        <Image
          source={{ uri: getUniversalStudioArtwork(item.thumbnail) }}
          style={styles.trackThumb}
          contentFit="cover"
          priority="high"
          cachePolicy="memory-disk"
          transition={200}
        />

        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, isCurrent && { color: '#1DB954' }]} numberOfLines={1}>
            {item.title}
          </Text>
          <TouchableOpacity
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate('ArtistDetail', { artistName: item.artist });
            }}
          >
            <Text style={styles.trackArtist} numberOfLines={1}>
              {item.artist || 'فنان مجهول'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.heartBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={(e) => {
            e.stopPropagation();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleLike({
              videoId: item.video_id,
              title: item.title,
              artist: item.artist,
              thumbnail: item.thumbnail,
            });
          }}
        >
          <Ionicons name="heart" size={20} color="#FF3B30" />
        </TouchableOpacity>

        {/* Isolated Play/Pause Button (Audio control only, does not trigger modal) */}
        <TouchableOpacity 
          style={styles.playIconBox}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={(e) => {
            e.stopPropagation();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (isCurrent) {
              togglePlay();
            } else {
              const activeList = searchQuery.trim() ? filteredTracks : savedTracks;
              const trackQueue: Track[] = activeList.map((t) => ({
                videoId: t.video_id,
                title: t.title,
                artist: t.artist || 'فنان',
                thumbnail: t.thumbnail,
                duration: (t.duration || 0) * 1000,
              }));
              const foundIdx = trackQueue.findIndex((t) => t.videoId === item.video_id);
              const playIdx = foundIdx >= 0 ? foundIdx : index;
              playAlbumContext(trackQueue, playIdx, 'favorites');
            }
          }}
        >
          <Ionicons
            name={isCurrent && isPlaying ? 'pause' : 'play'}
            size={14}
            color={isCurrent ? '#1DB954' : theme.textSecondary}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#1DB954" />
      </View>
    );
  }

  const activeListData = activeTab === 'downloads' ? filteredDownloads : filteredTracks;

  return (
    <View style={styles.container}>
      <FlatList
        data={activeListData}
        keyExtractor={(item: any) => item.id || item.video_id || item.videoId}
        renderItem={renderTrackItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={[styles.listContent, { paddingBottom: miniPlayerBottomGap }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#10B981"
          />
        }
        ListEmptyComponent={
          activeTab === 'downloads' ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="cloud-download-outline" size={48} color="#10B981" />
              </View>
              <Text style={styles.emptyTitle}>لا توجد أغانٍ محمّلة على الهاتف</Text>
              <Text style={styles.emptySubtitle}>
                اضغط على زر التنزيل داخل مشغل الموسيقى لحفظ أغانيك والاستماع إليها بدون إنترنت وفي وضع الطيران بجودة HD.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="musical-notes-outline" size={64} color={theme.textMuted} />
              <Text style={styles.emptyTitle}>لا توجد أغانٍ هنا بعد</Text>
              <Text style={styles.emptySubtitle}>
                اضغط على زر القلب ❤️ في المشغل لإضافة أغانيك المفضلة إلى مكتبتك الرياضية.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
};

const createThemedStyles = (theme: ThemeTokens, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    loaderContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.background,
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 14,
    },
    heroBanner: {
      borderRadius: 20,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 24,
      shadowColor: '#8e2de2',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 8,
    },
    heroContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    heartCircle: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroTexts: {},
    heroTitle: {
      color: '#FFF',
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 4,
    },
    heroSubtitle: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 13,
      fontWeight: '600',
    },
    heroPlayBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: '#1DB954',
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 5,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: 'bold',
    },
    artistsScroll: {
      gap: 14,
      paddingRight: 16,
    },
    followedArtistCard: {
      alignItems: 'center',
      width: 76,
    },
    followedArtistAvatarWrap: {
      width: 66,
      height: 66,
      borderRadius: 33,
      overflow: 'hidden',
      marginBottom: 6,
      backgroundColor: isDark ? '#262626' : theme.surfaceSubtle,
    },
    followedArtistAvatar: {
      width: '100%',
      height: '100%',
    },
    followedArtistFallback: {
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? '#2e3a33' : '#e0ece4',
    },
    followedArtistFallbackText: {
      fontSize: 22,
      fontWeight: '800',
      color: isDark ? '#FFFFFF' : '#111b15',
    },
    followedArtistName: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 2,
    },
    followedArtistTag: {
      color: theme.textMuted,
      fontSize: 10.5,
      fontWeight: '500',
      textAlign: 'center',
    },
    playlistsScroll: {
      paddingRight: 16,
      gap: 12,
      marginBottom: 20,
    },
    playlistCard: {
      width: width * 0.42,
      height: 110,
      borderRadius: 16,
      padding: 12,
      justifyContent: 'space-between',
    },
    playlistTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    miniPlayCircle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: '#FFF',
      justifyContent: 'center',
      alignItems: 'center',
    },
    playlistTitle: {
      color: '#FFF',
      fontSize: 13,
      fontWeight: 'bold',
      marginBottom: 2,
    },
    playlistSub: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: 11,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.surfaceSubtle,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 44,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: theme.border,
    },
    searchInput: {
      flex: 1,
      color: theme.textPrimary,
      fontSize: 14,
    },
    listContent: {
      paddingBottom: 110,
    },
    trackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginHorizontal: 16,
      marginBottom: 8,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: theme.cardShadow.shadowColor,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.2 : 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    trackRowActive: {
      borderColor: 'rgba(29, 185, 84, 0.4)',
      backgroundColor: isDark ? 'rgba(29, 185, 84, 0.15)' : 'rgba(29, 185, 84, 0.08)',
    },
    trackThumb: {
      width: 48,
      height: 48,
      borderRadius: 10,
      backgroundColor: theme.surfaceSubtle,
    },
    trackInfo: {
      flex: 1,
      marginLeft: 12,
    },
    trackTitle: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 4,
    },
    trackArtist: {
      color: theme.textSecondary,
      fontSize: 13,
    },
    heartBtn: {
      padding: 8,
      marginRight: 4,
    },
    playIconBox: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.surfaceSubtle,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      alignItems: 'center',
      paddingVertical: 40,
      paddingHorizontal: 24,
    },
    emptyTitle: {
      color: theme.textPrimary,
      fontSize: 17,
      fontWeight: 'bold',
      marginTop: 14,
      marginBottom: 6,
    },
    emptySubtitle: {
      color: theme.textSecondary,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 18,
    },
    // Segmented Switcher
    segmentContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.surfaceSubtle,
      borderRadius: 14,
      padding: 4,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      gap: 6,
    },
    segmentBtnActiveLiked: {
      backgroundColor: '#8e2de2',
      shadowColor: '#8e2de2',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    segmentBtnActiveDownloads: {
      backgroundColor: '#059669',
      shadowColor: '#059669',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    segmentText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textMuted,
    },
    segmentTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    storageMiniBadge: {
      backgroundColor: 'rgba(255, 255, 255, 0.25)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
      marginLeft: 4,
    },
    storageMiniBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    // Download Metadata & Badges
    downloadMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    dotSeparator: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: theme.textMuted,
    },
    bitrateBadge: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
      paddingHorizontal: 6,
      paddingVertical: 1.5,
      borderRadius: 6,
      borderWidth: 0.5,
      borderColor: 'rgba(16, 185, 129, 0.35)',
    },
    bitrateBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#10B981',
    },
    sizeBadgeWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    fileSizeText: {
      fontSize: 11,
      color: theme.textMuted,
      fontWeight: '500',
    },
    trashBtn: {
      padding: 8,
      marginRight: 4,
    },
    emptyIconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
      borderWidth: 1,
      borderColor: 'rgba(16, 185, 129, 0.25)',
    },
  });

export default MusicLibrary;
