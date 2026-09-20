import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { useAudioStore } from '../store/useAudioStore';
import {
  fetchTotalListeningSeconds,
  formatListeningTime,
  subscribeListeningTime,
} from '../services/listeningTimeService';
import { DynamicBottomSheet, DynamicBottomSheetRef } from '../components/DynamicBottomSheet';
import { GlassCard } from '../components/GlassCard';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import { getUniversalStudioArtwork } from '../utils/artworkHelper';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const formatActivityTime = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}h ${m < 10 ? '0' : ''}${m}m`;
  }
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
};

const formatStravaDate = (iso: string): string => {
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const month = d.toLocaleDateString('ar-DZ', { month: 'short' });
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${year} في ${hours}:${mins}`;
  } catch (e) {
    return '';
  }
};

// ────────────────────────────────────────────────────────
// MEMOIZED ACTIVITY CARD (Strava-Grade 1:1)
// ────────────────────────────────────────────────────────
const StravaActivityCard = memo(({ item, onSelect }: { item: any; onSelect: (activity: any) => void }) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const isTrail = item.activity_type === 'trail';
  const isRun = item.activity_type === 'run' || (!isTrail && item.activity_type !== 'walk');
  const sportColor = isTrail ? '#00D084' : (isRun ? '#FC5200' : '#007AFF');
  const sportIcon = isTrail ? 'terrain' : (isRun ? 'run-fast' : 'walk');
  const sportTitle = item.notes || (isTrail ? 'جري مسارات جبلية 🏔️' : (isRun ? 'Afternoon Run 🏃' : 'مشي استشفائي 🚶'));

  return (
    <GlassCard
      style={styles.stravaCard}
      borderRadius={20}
      onPress={() => onSelect(item)}
    >
      {/* Strava Header: Sport Icon + Title + Date */}
      <View style={styles.stravaHeader}>
        <View style={[styles.stravaIconCircle, { backgroundColor: sportColor + '18' }]}>
          <MaterialCommunityIcons name={sportIcon} size={22} color={sportColor} />
        </View>
        <View style={styles.stravaHeaderTextCol}>
          <Text style={styles.stravaTitle} numberOfLines={1}>
            {sportTitle}
          </Text>
          <Text style={styles.stravaDate}>{formatStravaDate(item.created_at)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
      </View>

      {/* Strava 4-Column Metric Grid */}
      <View style={styles.stravaMetricsRow}>
        {/* Distance */}
        <View style={styles.stravaMetricItem}>
          <Text style={styles.stravaMetricLabel}>المسافة</Text>
          <Text style={[styles.stravaMetricValue, { color: sportColor }]}>
            {Number(item.total_distance || 0).toFixed(2)}{' '}
            <Text style={styles.stravaMetricUnit}>km</Text>
          </Text>
        </View>

        {/* Pace */}
        <View style={styles.stravaMetricItem}>
          <Text style={styles.stravaMetricLabel}>الوتيرة</Text>
          <Text style={styles.stravaMetricValue}>
            {item.average_pace || '--:--'}{' '}
            <Text style={styles.stravaMetricUnit}>/km</Text>
          </Text>
        </View>

        {/* Moving Time */}
        <View style={styles.stravaMetricItem}>
          <Text style={styles.stravaMetricLabel}>الوقت</Text>
          <Text style={styles.stravaMetricValue}>
            {formatActivityTime(item.total_time || 0)}
          </Text>
        </View>

        {/* Elevation / Calories */}
        <View style={styles.stravaMetricItem}>
          <Text style={styles.stravaMetricLabel}>
            {item.elevation_gain ? 'الارتفاع' : 'السعرات'}
          </Text>
          <Text style={styles.stravaMetricValue}>
            {item.elevation_gain
              ? `+${Math.round(item.elevation_gain)}m`
              : (item.calories ? `${Math.round(item.calories)}` : '--')}
          </Text>
        </View>
      </View>

      {/* Verified GPS Pill */}
      <View style={styles.stravaFooterPill}>
        <Ionicons name="shield-checkmark" size={13} color="#10B981" />
        <Text style={styles.stravaFooterTxt}>نشاط رياضي موثق بنظام GPS</Text>
      </View>
    </GlassCard>
  );
});

// ────────────────────────────────────────────────────────
// MEMOIZED MUSIC ITEM
// ────────────────────────────────────────────────────────
const MemoizedMusicItem = memo(({ item }: { item: any }) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const playTrack = useAudioStore((s) => s.playTrack);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const isCurrent = currentTrack?.videoId === item.video_id;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isCurrent) {
      togglePlay();
    } else {
      playTrack({
        videoId: item.video_id,
        title: item.title,
        artist: item.artist || 'Unknown Artist',
        thumbnail: item.thumbnail || '',
        duration: item.duration,
      });
    }
  };

  return (
    <GlassCard
      style={[styles.musicCard, isCurrent && { borderColor: '#007AFF' }]}
      borderRadius={18}
      onPress={handlePress}
    >
      <View style={styles.musicRow}>
        <Image
          source={{
            uri: getUniversalStudioArtwork(item.thumbnail),
          }}
          style={styles.musicThumb}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="high"
          transition={150}
        />

        <View style={styles.musicInfoCol}>
          <Text
            style={[styles.musicTitleTxt, isCurrent && { color: '#007AFF' }]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.musicArtistTxt} numberOfLines={1}>
            {item.artist || 'فنان'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.musicPlayBtn}
          onPress={handlePress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isCurrent && isPlaying ? 'pause-circle' : 'play-circle'}
            size={36}
            color={isCurrent ? '#007AFF' : theme.textPrimary}
          />
        </TouchableOpacity>
      </View>
    </GlassCard>
  );
});

export const ProfileScreen = () => {
  const { user, updateUser } = useAuth();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const miniPlayerBottomGap = useMiniPlayerBottomGap();
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const playTrack = useAudioStore((s) => s.playTrack);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const { theme, isDark, toggleTheme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [profile, setProfile] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [musicLikes, setMusicLikes] = useState<any[]>([]);
  const [listeningSeconds, setListeningSeconds] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'activities' | 'music'>('activities');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Edit Profile States
  const [showEdit, setShowEdit] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const editSheetRef = useRef<DynamicBottomSheetRef>(null);

  // Reanimated Tab Indicator
  const tabOffset = useSharedValue<number>(0);

  const switchTab = useCallback((tab: 'activities' | 'music') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
    tabOffset.value = withTiming(tab === 'activities' ? 0 : 1, {
      duration: 180,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [tabOffset]);

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    const tabWidth = (SCREEN_WIDTH - 24 - 8) / 2;
    return {
      transform: [{ translateX: tabOffset.value * tabWidth }],
    };
  });

  const fetchProfileData = useCallback(async () => {
    if (!user?.id) return;
    try {
      // 1. Fetch Profile
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (prof) {
        setProfile(prof);
        setEditFullName(prof.full_name || '');
        setEditUsername(prof.username || '');
        setEditBio(prof.bio || '');
      }

      // 2. Fetch Activities
      const { data: acts } = await supabase
        .from('activities')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (acts) setActivities(acts);

      // 3. Fetch Liked Music
      const { data: likes } = await supabase
        .from('music_likes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (likes) setMusicLikes(likes);

      // 4. Fetch Listening Time
      const seconds = await fetchTotalListeningSeconds(user.id);
      setListeningSeconds(seconds);
    } catch (err) {
      console.warn('[ProfileScreen] Error fetching profile:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  // Subscribe to live heartbeat listening seconds
  useEffect(() => {
    const unsubscribe = subscribeListeningTime((total) => {
      setListeningSeconds(total);
    });
    return () => unsubscribe();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfileData();
  };

  const totalDistance = activities.reduce(
    (acc, a) => acc + (Number(a.total_distance) || 0),
    0
  );

  const cleanUsername = (text: string) => {
    const cleaned = text.replace(/\s+/g, '_').toLowerCase();
    setEditUsername(cleaned);
  };

  const handleSaveProfile = async () => {
    if (!user?.id || !editFullName.trim() || !editUsername.trim()) return;
    setSaving(true);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: editFullName.trim(),
          username: editUsername.trim().toLowerCase(),
          bio: editBio.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      await updateUser({
        full_name: editFullName.trim(),
        username: editUsername.trim().toLowerCase(),
        bio: editBio.trim(),
      });

      await fetchProfileData();
      setShowEdit(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('خطأ في التحديث', err.message || 'تعذر حفظ التغييرات');
    } finally {
      setSaving(false);
    }
  };

  const handlePickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]?.uri && user?.id) {
        setUploadingAvatar(true);
        const avatarUri = result.assets[0].uri;

        const { error } = await supabase
          .from('profiles')
          .update({ avatar_url: avatarUri, updated_at: new Date().toISOString() })
          .eq('id', user.id);

        if (!error) {
          await updateUser({ avatar_url: avatarUri });
          setProfile((prev: any) => ({ ...prev, avatar_url: avatarUri }));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (err: any) {
      Alert.alert('خطأ', 'فشل في تحديث الصورة');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSelectActivity = useCallback((activity: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('WorkoutSummary', { workoutId: activity.id, workout: activity });
  }, [navigation]);

  const displayUser = profile || user;

  // ────────────────────────────────────────────────────────
  // HEADER COMPONENT (Athlete ID + Clean 2x2 Grid + Carousel)
  // ────────────────────────────────────────────────────────
  const renderHeader = () => {
    return (
      <View style={styles.headerContainer}>
        {/* ── 1. Athlete Identity Card (ONLY avatar, name, handle, badge, edit) ── */}
        <GlassCard style={styles.identityCard} borderRadius={20}>
          <View style={styles.identityRow}>
            {/* Neon Ring Avatar */}
            <View style={styles.avatarNeonWrapper}>
              <TouchableOpacity
                onPress={handlePickAvatar}
                disabled={uploadingAvatar}
                activeOpacity={0.8}
              >
                <Image
                  source={{
                    uri:
                      displayUser?.avatar_url ||
                      `https://i.pravatar.cc/150?u=${displayUser?.id || 'runner'}`,
                  }}
                  style={styles.avatarImg}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  priority="high"
                />
                {uploadingAvatar && (
                  <View style={[StyleSheet.absoluteFill, styles.avatarOverlay]}>
                    <ActivityIndicator color="#FFF" size="small" />
                  </View>
                )}
                <View style={styles.cameraPill}>
                  <Ionicons name="camera" size={11} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            </View>

            {/* Athlete Details */}
            <View style={styles.identityDetails}>
              <Text style={styles.athleteName} numberOfLines={1}>
                {displayUser?.full_name || 'عدّاء Nouble'}
              </Text>
              <Text style={styles.athleteHandle} numberOfLines={1}>
                @{displayUser?.username || 'athlete'}
              </Text>

              {/* Athletic Explorer Badge */}
              <View style={styles.badgeRow}>
                <View style={styles.explorerBadge}>
                  <Ionicons name="flash" size={11} color="#FC5200" />
                  <Text style={styles.explorerBadgeTxt}>Athletic Explorer</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Bio snippet */}
          {displayUser?.bio ? (
            <Text style={styles.bioText} numberOfLines={2}>
              {displayUser.bio}
            </Text>
          ) : null}

          {/* Edit Profile Button */}
          <TouchableOpacity
            style={styles.editProfileBtn}
            onPress={() => setShowEdit(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={15} color={theme.textPrimary} />
            <Text style={styles.editProfileBtnTxt}>تعديل الملف الرياضي</Text>
          </TouchableOpacity>
        </GlassCard>

        {/* ── 2. Clean Minimalist 2x2 Telemetry Grid (Strava/Apple Pure Style) ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>مؤشرات الأداء</Text>
        </View>

        <View style={styles.telemetryGrid}>
          {/* Card 1: Distance */}
          <GlassCard style={styles.metricCard} borderRadius={18}>
            <View style={styles.metricTopRow}>
              <View
                style={[
                  styles.metricIconWrap,
                  { backgroundColor: 'rgba(252, 82, 0, 0.12)' },
                ]}
              >
                <MaterialCommunityIcons name="run-fast" size={18} color="#FC5200" />
              </View>
              <Text style={styles.metricPureTitle}>المسافة</Text>
            </View>
            <Text style={[styles.metricMainValue, { color: '#FC5200' }]} numberOfLines={1}>
              {totalDistance.toFixed(1)}{' '}
              <Text style={styles.metricUnit}>km</Text>
            </Text>
          </GlassCard>

          {/* Card 2: Music Listening Time */}
          <GlassCard style={styles.metricCard} borderRadius={18}>
            <View style={styles.metricTopRow}>
              <View
                style={[
                  styles.metricIconWrap,
                  { backgroundColor: 'rgba(0, 122, 255, 0.12)' },
                ]}
              >
                <Ionicons name="pulse" size={18} color="#007AFF" />
              </View>
              <Text style={styles.metricPureTitle}>الاستماع</Text>
            </View>
            <Text style={[styles.metricMainValue, { color: '#007AFF' }]} numberOfLines={1}>
              {formatListeningTime(listeningSeconds)}
            </Text>
          </GlassCard>

          {/* Card 3: Workouts */}
          <GlassCard style={styles.metricCard} borderRadius={18}>
            <View style={styles.metricTopRow}>
              <View
                style={[
                  styles.metricIconWrap,
                  { backgroundColor: 'rgba(16, 185, 129, 0.12)' },
                ]}
              >
                <Ionicons name="fitness" size={18} color="#10B981" />
              </View>
              <Text style={styles.metricPureTitle}>الأنشطة</Text>
            </View>
            <Text style={styles.metricMainValue} numberOfLines={1}>
              {activities.length}{' '}
              <Text style={styles.metricUnit}>
                {activities.length === 1 ? 'جلسة' : 'جلسات'}
              </Text>
            </Text>
          </GlassCard>

          {/* Card 4: Liked Music */}
          <GlassCard style={styles.metricCard} borderRadius={18}>
            <View style={styles.metricTopRow}>
              <View
                style={[
                  styles.metricIconWrap,
                  { backgroundColor: 'rgba(236, 72, 153, 0.12)' },
                ]}
              >
                <Ionicons name="heart" size={18} color="#EC4899" />
              </View>
              <Text style={styles.metricPureTitle}>المفضلة</Text>
            </View>
            <Text style={styles.metricMainValue} numberOfLines={1}>
              {musicLikes.length}{' '}
              <Text style={styles.metricUnit}>مسار</Text>
            </Text>
          </GlassCard>
        </View>

        {/* ── 3. Favorite Music Carousel (Fixed expo-image) ── */}
        {musicLikes.length > 0 && (
          <View style={styles.carouselSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>المسارات المفضلة</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselScroll}
            >
              {musicLikes.slice(0, 10).map((item) => {
                const isCurrent = currentTrack?.videoId === item.video_id;
                return (
                  <GlassCard
                    key={item.id || item.video_id}
                    style={styles.carouselCard}
                    borderRadius={16}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (isCurrent) {
                        togglePlay();
                      } else {
                        playTrack({
                          videoId: item.video_id,
                          title: item.title,
                          artist: item.artist || 'Unknown Artist',
                          thumbnail: item.thumbnail || '',
                          duration: item.duration,
                        });
                      }
                    }}
                  >
                    <View style={styles.carouselThumbWrap}>
                      <Image
                        source={{
                          uri:
                            item.thumbnail ||
                            'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200',
                        }}
                        style={styles.carouselThumb}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        priority="high"
                      />
                      <View style={styles.carouselPlayOverlay}>
                        <Ionicons
                          name={isCurrent && isPlaying ? 'pause-circle' : 'play-circle'}
                          size={30}
                          color={isCurrent ? '#007AFF' : '#FFFFFF'}
                        />
                      </View>
                    </View>
                    <Text style={styles.carouselTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.carouselArtist} numberOfLines={1}>
                      {item.artist || 'فنان'}
                    </Text>
                  </GlassCard>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── 4. Instant Profile Tab Switcher (0ms Pressable + Reanimated Indicator) ── */}
        <View style={styles.tabSwitchContainer}>
          {/* Smooth Sliding Pill Indicator */}
          <Animated.View style={[styles.slidingIndicator, animatedIndicatorStyle]} />

          <Pressable
            style={styles.pressableTabBtn}
            onPress={() => switchTab('activities')}
          >
            <Ionicons
              name="fitness-outline"
              size={17}
              color={activeTab === 'activities' ? '#FC5200' : theme.textMuted}
            />
            <Text
              style={[
                styles.tabBtnTxt,
                activeTab === 'activities' && { color: '#FC5200', fontWeight: '800' },
              ]}
            >
              سجل التمارين ({activities.length})
            </Text>
          </Pressable>

          <Pressable
            style={styles.pressableTabBtn}
            onPress={() => switchTab('music')}
          >
            <Ionicons
              name="musical-notes-outline"
              size={17}
              color={activeTab === 'music' ? '#007AFF' : theme.textMuted}
            />
            <Text
              style={[
                styles.tabBtnTxt,
                activeTab === 'music' && { color: '#007AFF', fontWeight: '800' },
              ]}
            >
              المفضلة ({musicLikes.length})
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderActivityItem = useCallback(
    ({ item }: { item: any }) => (
      <StravaActivityCard item={item} onSelect={handleSelectActivity} />
    ),
    [handleSelectActivity]
  );

  const renderMusicItem = useCallback(
    ({ item }: { item: any }) => <MemoizedMusicItem item={item} />,
    []
  );

  const keyExtractor = useCallback((item: any) => item.id || item.video_id, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 4 }]}>
      {/* ── Top Header Bar (Only ONE Gear Icon in the entire screen) ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topBarBtn}
          onPress={() => navigation.navigate('Settings')}
        >
          <Ionicons name="settings-outline" size={22} color={theme.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.topBarTitle}>الملف الشخصي</Text>

        <View style={styles.topBarRight}>
          <TouchableOpacity
            style={styles.topBarBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleTheme();
            }}
          >
            <Ionicons
              name={isDark ? 'sunny-outline' : 'moon-outline'}
              size={21}
              color={isDark ? '#F59E0B' : '#6366F1'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.topBarBtn}
            onPress={() => navigation.navigate('Dashboard')}
          >
            <Ionicons name="stats-chart" size={19} color="#FC5200" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Optimized Virtualized List (0ms latency, memoized items) ── */}
      <FlatList
        data={activeTab === 'activities' ? activities : musicLikes}
        keyExtractor={keyExtractor}
        ListHeaderComponent={renderHeader}
        renderItem={activeTab === 'activities' ? renderActivityItem : renderMusicItem}
        contentContainerStyle={[
          styles.scrollContainer,
          { paddingBottom: miniPlayerBottomGap },
        ]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={3}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textPrimary}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <GlassCard style={styles.emptyCard} borderRadius={18}>
              <Ionicons
                name={activeTab === 'activities' ? 'fitness-outline' : 'musical-notes-outline'}
                size={44}
                color={theme.textMuted}
              />
              <Text style={styles.emptyTitle}>
                {activeTab === 'activities'
                  ? 'لا توجد أنشطة مسجلة بعد'
                  : 'لا توجد مسارات مفضلة بعد'}
              </Text>
              <Text style={styles.emptyDesc}>
                {activeTab === 'activities'
                  ? 'ابدأ أول جولة جري أو مشي وسجل إنجازاتك الرياضية!'
                  : 'أضف أغانيك المفضلة أثناء الاستماع في تبويب الموسيقى!'}
              </Text>
            </GlassCard>
          ) : null
        }
      />

      {/* ── Edit Profile Dynamic Bottom Sheet ── */}
      <DynamicBottomSheet
        ref={editSheetRef}
        isVisible={showEdit}
        onClose={() => setShowEdit(false)}
        title="تعديل الملف الرياضي"
        initialSnap={0.7}
      >
        <View style={[styles.editSheetContent, { paddingBottom: insets.bottom + 20 }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
          >
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>الاسم الرياضي الكامل</Text>
              <TextInput
                style={styles.textInput}
                value={editFullName}
                onChangeText={setEditFullName}
                placeholder="الاسم المعروض"
                placeholderTextColor={theme.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>اسم المستخدم (@)</Text>
              <TextInput
                style={styles.textInput}
                value={editUsername}
                onChangeText={cleanUsername}
                autoCapitalize="none"
                placeholder="username"
                placeholderTextColor={theme.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>النبذة الرياضية (Bio)</Text>
              <TextInput
                style={[styles.textInput, { height: 80, textAlignVertical: 'top' }]}
                value={editBio}
                onChangeText={setEditBio}
                multiline
                maxLength={250}
                placeholder="أهدافك التدريبية أو جدول تمارينك..."
                placeholderTextColor={theme.textMuted}
              />
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSaveProfile}
            disabled={saving}
          >
            <Text style={styles.saveBtnTxt}>
              {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </Text>
          </TouchableOpacity>
        </View>
      </DynamicBottomSheet>

      {loading && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator color="#FC5200" size="large" />
        </View>
      )}
    </View>
  );
};

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle,
    },
    topBarTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: 'bold',
      letterSpacing: -0.3,
    },
    topBarBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      justifyContent: 'center',
      alignItems: 'center',
    },
    topBarRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    scrollContainer: {
      paddingHorizontal: 12,
      paddingTop: 12,
    },
    headerContainer: {
      marginBottom: 8,
    },

    // ── Athlete Identity Card ──
    identityCard: {
      padding: 14,
      marginBottom: 12,
    },
    identityRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatarNeonWrapper: {
      position: 'relative',
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 2,
      borderColor: '#FC5200',
      padding: 2,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarImg: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.surfaceSubtle,
    },
    avatarOverlay: {
      borderRadius: 32,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    cameraPill: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      backgroundColor: '#FC5200',
      width: 20,
      height: 20,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: theme.background,
    },
    identityDetails: {
      flex: 1,
      marginLeft: 14,
    },
    athleteName: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    athleteHandle: {
      color: theme.textSecondary,
      fontSize: 13,
      marginTop: 2,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 5,
    },
    explorerBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(252, 82, 0, 0.12)',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 9,
      gap: 3,
    },
    explorerBadgeTxt: {
      color: '#FC5200',
      fontSize: 10,
      fontWeight: '700',
    },
    bioText: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 10,
      paddingHorizontal: 2,
    },
    editProfileBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: theme.surfaceSubtle,
      paddingVertical: 8,
      borderRadius: 12,
      marginTop: 12,
    },
    editProfileBtnTxt: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '600',
    },

    // ── Telemetry Grid ──
    sectionHeaderRow: {
      marginBottom: 8,
      marginTop: 4,
      paddingHorizontal: 2,
    },
    sectionTitle: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    telemetryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 12,
    },
    metricCard: {
      width: (SCREEN_WIDTH - 24 - 12) / 2,
      padding: 12,
    },
    metricTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    metricIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 9,
      justifyContent: 'center',
      alignItems: 'center',
    },
    metricPureTitle: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '700',
    },
    metricMainValue: {
      color: theme.textPrimary,
      fontSize: 21,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    metricUnit: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
    },

    // ── Carousel Section ──
    carouselSection: {
      marginBottom: 12,
    },
    carouselScroll: {
      gap: 12,
      paddingVertical: 2,
    },
    carouselCard: {
      width: 120,
      padding: 10,
    },
    carouselThumbWrap: {
      position: 'relative',
      width: 100,
      height: 100,
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 6,
      backgroundColor: theme.surfaceSubtle,
    },
    carouselThumb: {
      width: 100,
      height: 100,
    },
    carouselPlayOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.25)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    carouselTitle: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
    carouselArtist: {
      color: theme.textSecondary,
      fontSize: 11,
      textAlign: 'center',
      marginTop: 2,
    },

    // ── Instant Tab Switcher (0ms Pressable + Reanimated Indicator) ──
    tabSwitchContainer: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceSubtle,
      borderRadius: 14,
      padding: 4,
      marginBottom: 12,
      position: 'relative',
    },
    slidingIndicator: {
      position: 'absolute',
      top: 4,
      left: 4,
      bottom: 4,
      width: (SCREEN_WIDTH - 24 - 8) / 2,
      backgroundColor: theme.glassCard,
      borderRadius: 11,
      zIndex: 1,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    pressableTabBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: 11,
      gap: 6,
      zIndex: 2,
    },
    tabBtnTxt: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },

    // ── Strava Workout Activity Card ──
    stravaCard: {
      padding: 14,
      marginBottom: 12,
    },
    stravaHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    stravaIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    stravaHeaderTextCol: {
      flex: 1,
    },
    stravaTitle: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    stravaDate: {
      color: theme.textSecondary,
      fontSize: 11,
      marginTop: 2,
    },
    stravaMetricsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      backgroundColor: theme.surfaceSubtle,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    stravaMetricItem: {
      alignItems: 'flex-start',
    },
    stravaMetricLabel: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '600',
      marginBottom: 2,
    },
    stravaMetricValue: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    stravaMetricUnit: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.textSecondary,
    },
    stravaFooterPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 10,
      paddingHorizontal: 2,
    },
    stravaFooterTxt: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '500',
    },

    // ── Music Item ──
    musicCard: {
      padding: 12,
      marginBottom: 12,
    },
    musicRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    musicThumb: {
      width: 50,
      height: 50,
      borderRadius: 12,
      marginRight: 12,
      backgroundColor: theme.surfaceSubtle,
    },
    musicInfoCol: {
      flex: 1,
    },
    musicTitleTxt: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    musicArtistTxt: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 3,
    },
    musicPlayBtn: {
      padding: 4,
    },

    // Empty state
    emptyCard: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 26,
      marginTop: 8,
    },
    emptyTitle: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '700',
      marginTop: 12,
      textAlign: 'center',
    },
    emptyDesc: {
      color: theme.textSecondary,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 18,
    },

    // Bottom Sheet
    editSheetContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      flex: 1,
    },
    inputGroup: {
      marginBottom: 14,
    },
    inputLabel: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 6,
      textAlign: 'right',
    },
    textInput: {
      backgroundColor: theme.surfaceSubtle,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: theme.textPrimary,
      fontSize: 14,
      textAlign: 'right',
      borderWidth: 1,
      borderColor: theme.borderSubtle,
    },
    saveBtn: {
      backgroundColor: '#FC5200',
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 8,
    },
    saveBtnTxt: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: 'bold',
    },
    loaderOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.3)',
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

export default ProfileScreen;
