import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Dimensions, FlatList, TouchableOpacity,
  Modal, ActivityIndicator, Alert, ScrollView, TextInput, Linking,
  Platform, RefreshControl
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { colors } from '../theme/colors';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { DynamicBottomSheet, DynamicBottomSheetRef } from '../components/DynamicBottomSheet';
import { useAudioStore } from '../store/useAudioStore';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';

const { width } = Dimensions.get('window');

const formatTime = (s: number): string => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0
    ? `${h}:${m < 10 ? '0' : ''}${m}:${sec < 10 ? '0' : ''}${sec}`
    : `${m < 10 ? '0' : ''}${m}:${sec < 10 ? '0' : ''}${sec}`;
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('ar-DZ', {
    weekday: 'short', day: 'numeric', month: 'short'
  });
};

export const ProfileScreen = () => {
  const { user, logout, updateUser } = useAuth();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { playTrack, currentTrack, isPlaying } = useAudioStore();
  const { theme, isDark, toggleTheme } = useTheme();
  const styles = useThemedStyles(createStyles);


  const [profile, setProfile] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [musicLikes, setMusicLikes] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'activities' | 'music'>('activities');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  // Edit States
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const editSheetRef = useRef<DynamicBottomSheetRef>(null);

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

    } catch (err) {
      console.warn('Error loading profile data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfileData();
  };

  const totalDistance = activities.reduce((acc, a) => acc + (Number(a.total_distance) || 0), 0);
  const totalDuration = activities.reduce((acc, a) => acc + (Number(a.total_time) || 0), 0);

  const handleLogout = async () => {
    Alert.alert('تسجيل الخروج', 'هل أنت متأكد أنك تريد تسجيل الخروج؟', [
      { text: 'إلغاء', style: 'cancel' },
      { 
        text: 'خروج', 
        style: 'destructive', 
        onPress: async () => {
          setShowMenu(false);
          await logout();
        }
      }
    ]);
  };

  const cleanUsername = (text: string) => {
    const cleaned = text.replace(/\s+/g, '_').toLowerCase();
    setEditUsername(cleaned);
  };

  const handleSaveProfile = async () => {
    if (!user?.id || !editFullName.trim() || !editUsername.trim()) return;
    setSaving(true);
    setUsernameError('');

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
        quality: 0.6,
      });

      if (!result.canceled && result.assets[0]?.uri && user?.id) {
        setUploadingAvatar(true);
        const avatarUri = result.assets[0].uri;
        
        // Update user profile avatar_url
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

  const renderHeader = () => {
    const displayUser = profile || user;

    return (
      <View style={styles.headerContent}>
        {/* User Info Header */}
        <View style={styles.profileMain}>
          <View style={styles.avatarBorder}>
            <TouchableOpacity onPress={handlePickAvatar} disabled={uploadingAvatar}>
              <Image 
                source={{ 
                  uri: displayUser?.avatar_url || `https://i.pravatar.cc/150?u=${displayUser?.id || 'default'}` 
                }} 
                style={styles.avatar} 
                contentFit="cover" 
              />
              {uploadingAvatar && (
                <View style={[StyleSheet.absoluteFill, styles.avatarOverlay]}>
                  <ActivityIndicator color="#FFF" />
                </View>
              )}
              <View style={styles.avatarEditIcon}>
                <Ionicons name="camera" size={14} color="#000" />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.profileInfoText}>
            <Text style={styles.profileTitle}>{displayUser?.full_name || 'عدّاء Nouble'}</Text>
            <Text style={styles.usernameHandle}>@{displayUser?.username || 'runner'}</Text>
            {displayUser?.bio ? (
              <Text style={styles.bioTxt}>{displayUser.bio}</Text>
            ) : null}
          </View>
        </View>

        {/* ── Sport + Music Athletic Stats Row ── */}
        <View style={styles.statsCard}>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: '#FF4B2B' }]}>{totalDistance.toFixed(1)}</Text>
            <Text style={styles.statLabel}>KM مسافة</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{activities.length}</Text>
            <Text style={styles.statLabel}>تمارين 🏃</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: colors.primary }]}>{musicLikes.length}</Text>
            <Text style={styles.statLabel}>أغانٍ 🎵</Text>
          </View>
        </View>

        {/* Edit Profile Button */}
        <TouchableOpacity style={styles.editBtn} onPress={() => setShowEdit(true)}>
          <Ionicons name="create-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
          <Text style={styles.editBtnTxt}>تعديل الملف الشخصي</Text>
        </TouchableOpacity>

        {/* Tab Switcher: Activities vs Music */}
        <View style={styles.tabBar}>
          <TouchableOpacity 
            style={[styles.tabContent, activeTab === 'activities' && styles.tabActive]} 
            onPress={() => setActiveTab('activities')}
          >
            <Ionicons 
              name="fitness-outline" 
              size={20} 
              color={activeTab === 'activities' ? '#FF4B2B' : '#777'} 
            />
            <Text style={[styles.tabLabel, activeTab === 'activities' && { color: '#FF4B2B', fontWeight: 'bold' }]}>
              سجل التمارين ({activities.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tabContent, activeTab === 'music' && styles.tabActive]} 
            onPress={() => setActiveTab('music')}
          >
            <Ionicons 
              name="musical-notes-outline" 
              size={20} 
              color={activeTab === 'music' ? colors.primary : '#777'} 
            />
            <Text style={[styles.tabLabel, activeTab === 'music' && { color: colors.primary, fontWeight: 'bold' }]}>
              الموسيقى المفضلة ({musicLikes.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderActivityItem = ({ item }: { item: any }) => {
    const isRun = item.activity_type === 'run';
    const accent = isRun ? '#FF4B2B' : '#007AFF';

    return (
      <View style={styles.activityItem}>
        <View style={[styles.activityBadge, { backgroundColor: accent + '20', borderColor: accent + '50' }]}>
          <Ionicons name={isRun ? 'fitness' : 'walk'} size={24} color={accent} />
        </View>

        <View style={styles.activityMain}>
          <View style={styles.activityTopRow}>
            <Text style={styles.activityTitle}>{isRun ? 'ركض 🏃' : 'مشي 🚶'}</Text>
            <Text style={styles.activityDate}>{formatDate(item.created_at)}</Text>
          </View>
          {item.notes ? <Text style={styles.activityNotes}>{item.notes}</Text> : null}

          <View style={styles.activityMetricsRow}>
            <Text style={[styles.metricText, { color: accent, fontWeight: 'bold' }]}>
              {Number(item.total_distance || 0).toFixed(2)} km
            </Text>
            <Text style={styles.metricDot}>•</Text>
            <Text style={styles.metricText}>{formatTime(item.total_time || 0)}</Text>
            <Text style={styles.metricDot}>•</Text>
            <Text style={styles.metricText}>{item.average_pace || '--:--'}/km</Text>
            {item.calories ? (
              <>
                <Text style={styles.metricDot}>•</Text>
                <Text style={styles.metricText}>{item.calories} kcal</Text>
              </>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const renderMusicItem = ({ item }: { item: any }) => {
    const isCurrent = currentTrack?.videoId === item.video_id;

    return (
      <TouchableOpacity 
        style={[styles.musicItem, isCurrent && styles.musicItemActive]}
        onPress={() => {
          playTrack({
            videoId: item.video_id,
            title: item.title,
            artist: item.artist || 'Unknown Artist',
            thumbnail: item.thumbnail || '',
            duration: item.duration,
          });
        }}
      >
        <Image 
          source={{ uri: item.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200' }} 
          style={styles.trackThumb} 
        />
        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, isCurrent && { color: colors.primary }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {item.artist || 'فنان'}
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.playBtn}
          onPress={() => {
            playTrack({
              videoId: item.video_id,
              title: item.title,
              artist: item.artist || 'Unknown Artist',
              thumbnail: item.thumbnail || '',
              duration: item.duration,
            });
          }}
        >
          <Ionicons 
            name={isCurrent && isPlaying ? "pause-circle" : "play-circle"} 
            size={34} 
            color={isCurrent ? colors.primary : "#FFF"} 
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setShowMenu(true)}>
          <Ionicons name="settings-outline" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>الملف الشخصي</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleTheme();
            }}
          >
            <Ionicons
              name={isDark ? 'sunny-outline' : 'moon-outline'}
              size={22}
              color={theme.textPrimary}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Dashboard')}>
            <Ionicons name="stats-chart" size={22} color="#FF4B2B" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Tab Content */}
      <FlatList
        data={activeTab === 'activities' ? activities : musicLikes}
        keyExtractor={item => item.id || item.video_id}
        ListHeaderComponent={renderHeader}
        renderItem={activeTab === 'activities' ? renderActivityItem : renderMusicItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textPrimary} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              <Ionicons 
                name={activeTab === 'activities' ? "fitness-outline" : "musical-notes-outline"} 
                size={54} 
                color={theme.textMuted} 
              />
              <Text style={styles.emptyTitle}>
                {activeTab === 'activities' ? 'لا توجد أنشطة مسجلة بعد' : 'لا توجد أغانٍ مفضلة بعد'}
              </Text>
              <Text style={styles.emptyDesc}>
                {activeTab === 'activities' 
                  ? 'ابدأ تسجيل ركضتك أو مشيتك الأولى من زر التسجيل!' 
                  : 'أضف أغانيك المفضلة أثناء الاستماع في تبويب الموسيقى!'}
              </Text>
            </View>
          ) : null
        }
      />

      {/* Settings Menu Modal */}
      <Modal visible={showMenu} animationType="slide" transparent onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowMenu(false)} />
        <View style={[styles.menuSheet, { paddingBottom: insets.bottom + 25 }]}>
          <View style={styles.dragHandle} />
          <Text style={styles.menuTitle}>الإعدادات والخيارات</Text>
          
          {/* Quick Theme Switcher */}
          <TouchableOpacity 
            style={styles.menuItem} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleTheme();
            }}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: theme.surfaceSubtle }]}>
              <Ionicons name={isDark ? "sunny" : "moon"} size={22} color={theme.textPrimary} />
            </View>
            <Text style={styles.menuItemTxt}>
              {isDark ? "التحويل للوضع الفاتح الدافئ" : "التحويل للوضع الداكن"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem} 
            onPress={() => { setShowMenu(false); navigation.navigate('Settings'); }}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name="settings-sharp" size={22} color={theme.textPrimary} />
            </View>
            <Text style={styles.menuItemTxt}>إعدادات التطبيق</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => { setShowMenu(false); navigation.navigate('Dashboard'); }}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: 'rgba(255,75,43,0.2)' }]}>
              <Ionicons name="stats-chart" size={22} color="#FF4B2B" />
            </View>
            <Text style={styles.menuItemTxt}>سجل الأنشطة الكامل</Text>
          </TouchableOpacity>


          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
            <View style={[styles.menuIconWrap, { backgroundColor: 'rgba(255,77,77,0.15)' }]}>
              <Ionicons name="log-out-outline" size={22} color="#FF4D4D" />
            </View>
            <Text style={[styles.menuItemTxt, { color: '#FF4D4D' }]}>تسجيل الخروج</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Edit Profile BottomSheet */}
      <DynamicBottomSheet 
        ref={editSheetRef}
        isVisible={showEdit} 
        onClose={() => setShowEdit(false)} 
        title="تعديل الملف الشخصي"
        initialSnap={0.7}
      >
        <View style={[styles.editSheetContent, { paddingBottom: insets.bottom + 20 }]}>
          <ScrollView 
            showsVerticalScrollIndicator={false} 
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
          >
            <View style={styles.editInputGroup}>
              <Text style={styles.inputLabel}>الاسم الكامل</Text>
              <TextInput 
                style={styles.editInput} 
                value={editFullName} 
                onChangeText={setEditFullName} 
                placeholder="الاسم المعروض" 
                placeholderTextColor="#555"
              />
            </View>

            <View style={styles.editInputGroup}>
              <Text style={styles.inputLabel}>اسم المستخدم (@)</Text>
              <TextInput 
                style={[styles.editInput, usernameError ? { borderColor: '#F44' } : {}]} 
                value={editUsername} 
                onChangeText={cleanUsername} 
                autoCapitalize="none"
                placeholder="runner_name" 
                placeholderTextColor="#555"
              />
            </View>

            <View style={styles.editInputGroup}>
              <Text style={styles.inputLabel}>نبذة تعريفية (Bio)</Text>
              <TextInput 
                style={[styles.editInput, { height: 80, textAlignVertical: 'top' }]} 
                value={editBio} 
                onChangeText={setEditBio} 
                multiline 
                maxLength={250}
                placeholder="أخبرنا عن أهدافك الرياضية أو اهتماماتك..." 
                placeholderTextColor="#555"
              />
            </View>
          </ScrollView>

          <TouchableOpacity 
            style={[styles.saveBtn, (saving || !!usernameError) && { opacity: 0.5 }]} 
            onPress={handleSaveProfile} 
            disabled={saving || !!usernameError}
          >
            <Text style={styles.saveBtnTxt}>{saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}</Text>
          </TouchableOpacity>
        </View>
      </DynamicBottomSheet>

      {loading && (
        <View style={StyleSheet.absoluteFill}>
          <ActivityIndicator color={colors.primary} size="large" style={{ flex: 1 }} />
        </View>
      )}
    </View>
  );
};

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle,
    },
    topTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: 'bold' },
    iconBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    headerContent: { paddingHorizontal: 16, paddingTop: 16 },
    profileMain: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginBottom: 20,
    },
    avatarBorder: {
      width: 84,
      height: 84,
      borderRadius: 42,
      borderWidth: 2.5,
      borderColor: theme.border,
      padding: 3,
    },
    avatar: { width: '100%', height: '100%', borderRadius: 42, backgroundColor: theme.surfaceSubtle },
    avatarOverlay: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 42, justifyContent: 'center', alignItems: 'center' },
    avatarEditIcon: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      backgroundColor: theme.textPrimary,
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: theme.background,
    },
    profileInfoText: { flex: 1 },
    profileTitle: { color: theme.textPrimary, fontSize: 20, fontWeight: 'bold', marginBottom: 2 },
    usernameHandle: { color: theme.textMuted, fontSize: 14, marginBottom: 6 },
    bioTxt: { color: theme.textSecondary, fontSize: 13, lineHeight: 18 },
    
    // Stats Card
    statsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      backgroundColor: theme.surface,
      borderRadius: 20,
      paddingVertical: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: theme.border,
      ...Platform.select({
        ios: {
          shadowColor: theme.cardShadow.shadowColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: theme.cardShadow.shadowOpacity,
          shadowRadius: 10,
        },
        android: {
          elevation: 4,
        },
      }),
    },
    statBox: { alignItems: 'center', flex: 1 },
    statNum: { color: theme.textPrimary, fontSize: 22, fontWeight: 'bold', marginBottom: 2 },
    statLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '600' },
    statDivider: { width: 1, height: 28, backgroundColor: theme.borderSubtle },

    editBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
      borderRadius: 14,
      paddingVertical: 12,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: theme.border,
    },
    editBtnTxt: { color: theme.textPrimary, fontWeight: '700', fontSize: 14 },

    tabBar: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle,
      marginBottom: 10,
    },
    tabContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderBottomWidth: 2.5,
      borderBottomColor: 'transparent',
    },
    tabActive: { borderBottomColor: theme.textPrimary },
    tabLabel: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },

    // List Items
    listContent: { paddingBottom: 100 },
    activityItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: 16,
      marginHorizontal: 16,
      marginBottom: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
      gap: 12,
    },
    activityBadge: {
      width: 48,
      height: 48,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
    },
    activityMain: { flex: 1 },
    activityTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    activityTitle: { color: theme.textPrimary, fontSize: 16, fontWeight: 'bold' },
    activityDate: { color: theme.textMuted, fontSize: 12 },
    activityNotes: { color: theme.textSecondary, fontSize: 13, marginBottom: 4 },
    activityMetricsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
    metricText: { color: theme.textSecondary, fontSize: 13 },
    metricDot: { color: theme.textMuted, marginHorizontal: 6 },

    // Music Items
    musicItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: 16,
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 10,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
      gap: 12,
    },
    musicItemActive: { borderColor: theme.textPrimary, backgroundColor: theme.surfaceSubtle },
    trackThumb: { width: 50, height: 50, borderRadius: 10, backgroundColor: theme.surfaceSubtle },
    trackInfo: { flex: 1 },
    trackTitle: { color: theme.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 3 },
    trackArtist: { color: theme.textMuted, fontSize: 13 },
    playBtn: { padding: 4 },

    // Empty State
    emptyWrap: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
    emptyTitle: { color: theme.textPrimary, fontSize: 17, fontWeight: 'bold', marginTop: 14, marginBottom: 6 },
    emptyDesc: { color: theme.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },

    // Menu Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    menuSheet: { backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
    dragHandle: { width: 36, height: 4, backgroundColor: theme.border, alignSelf: 'center', borderRadius: 2, marginBottom: 16 },
    menuTitle: { color: theme.textPrimary, fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
    menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
    menuIconWrap: { width: 42, height: 42, borderRadius: 12, backgroundColor: theme.surfaceSubtle, justifyContent: 'center', alignItems: 'center' },
    menuItemTxt: { color: theme.textPrimary, fontSize: 16, fontWeight: '600' },
    divider: { height: 1, backgroundColor: theme.borderSubtle, marginVertical: 10 },

    // Edit Sheet
    editSheetContent: { flex: 1, padding: 20 },
    editInputGroup: { marginBottom: 18 },
    inputLabel: { color: theme.textSecondary, fontSize: 13, marginBottom: 8, fontWeight: '600' },
    editInput: { backgroundColor: theme.surfaceSubtle, borderRadius: 12, padding: 14, color: theme.textPrimary, borderWidth: 1, borderColor: theme.borderSubtle, fontSize: 15 },
    saveBtn: { backgroundColor: theme.textPrimary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
    saveBtnTxt: { color: theme.mode === 'light' ? '#FFF' : '#000', fontWeight: 'bold', fontSize: 16 },
  });

export default ProfileScreen;

