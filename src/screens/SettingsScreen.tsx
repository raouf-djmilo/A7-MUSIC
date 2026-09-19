import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import {
  safeRequestPermissionsAsync,
  safeGetExpoPushTokenAsync,
  isPushSupported,
} from '../services/notificationService';
import { ToastManager } from '../components/InAppToast';
import * as Device from 'expo-device';
import { useAuth } from '../providers/AuthProvider';
import { apiClient } from '../config/api';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens, ThemePreference } from '../theme/types';
import { GlassCard } from '../components/GlassCard';
import { useAudioStore, AudioQuality } from '../store/useAudioStore';

const STORAGE_UNITS_KEY = '@nouble_units_pref';
const STORAGE_TRAIL_KEY = '@nouble_trail_elevation_pref';
const STORAGE_HAPTICS_KEY = '@nouble_haptics_pref';
const STORAGE_DUCKING_KEY = '@nouble_audio_ducking_pref';

export const SettingsScreen = () => {
  const navigation = useNavigation<any>();
  const { user, updateUser, logout } = useAuth();
  const { theme, isDark, themePreference, setThemeMode } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { preferredQuality, setAudioQuality } = useAudioStore();

  const [loading, setLoading] = useState(false);

  // Tracking Engine Preferences
  const [units, setUnits] = useState<'km' | 'mi'>('km');
  const [trailMode, setTrailMode] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  // Audio Preferences
  const [audioDucking, setAudioDucking] = useState(true);

  // Notification Preferences
  const [notificationsEnabled, setNotificationsEnabled] = useState(!!user?.notifications_enabled);
  const [notifyLikes, setNotifyLikes] = useState(!!user?.notify_likes);
  const [notifyComments, setNotifyComments] = useState(!!user?.notify_comments);
  const [notifyFollows, setNotifyFollows] = useState(!!user?.notify_follows);

  // Load saved preferences on mount
  useEffect(() => {
    const loadStoredPreferences = async () => {
      try {
        const [savedUnits, savedTrail, savedHaptics, savedDucking] = await Promise.all([
          AsyncStorage.getItem(STORAGE_UNITS_KEY),
          AsyncStorage.getItem(STORAGE_TRAIL_KEY),
          AsyncStorage.getItem(STORAGE_HAPTICS_KEY),
          AsyncStorage.getItem(STORAGE_DUCKING_KEY),
        ]);

        if (savedUnits === 'km' || savedUnits === 'mi') setUnits(savedUnits);
        if (savedTrail !== null) setTrailMode(savedTrail === 'true');
        if (savedHaptics !== null) setHapticsEnabled(savedHaptics === 'true');
        if (savedDucking !== null) setAudioDucking(savedDucking === 'true');
      } catch (e) {}
    };

    loadStoredPreferences();

    if (user) {
      setNotificationsEnabled(!!user.notifications_enabled);
      setNotifyLikes(user.notify_likes !== 0);
      setNotifyComments(user.notify_comments !== 0);
      setNotifyFollows(user.notify_follows !== 0);
    }
  }, [user]);

  const updateUnits = async (newUnit: 'km' | 'mi') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUnits(newUnit);
    await AsyncStorage.setItem(STORAGE_UNITS_KEY, newUnit);
  };

  const updateTrailMode = async (val: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTrailMode(val);
    await AsyncStorage.setItem(STORAGE_TRAIL_KEY, String(val));
  };

  const updateHaptics = async (val: boolean) => {
    if (val) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setHapticsEnabled(val);
    await AsyncStorage.setItem(STORAGE_HAPTICS_KEY, String(val));
  };

  const updateAudioDucking = async (val: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAudioDucking(val);
    await AsyncStorage.setItem(STORAGE_DUCKING_KEY, String(val));
  };

  const updateQuality = (q: AudioQuality) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAudioQuality(q);
  };

  const updateSettings = async (updates: any) => {
    setLoading(true);
    try {
      const payload = {
        user_id: user?.id,
        push_token: user?.push_token,
        enabled: notificationsEnabled,
        notify_likes: notifyLikes,
        notify_comments: notifyComments,
        notify_follows: notifyFollows,
        ...updates,
      };

      await apiClient.put('/users/settings/notifications', payload);
      await updateUser(updates);
    } catch (error) {
      console.error('Update Settings Error:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء تحديث الإعدادات.');
    } finally {
      setLoading(false);
    }
  };

  const handleGlobalToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    let pushToken = user?.push_token || null;

    if (value && !isPushSupported) {
      ToastManager.show({
        title: 'تنبيه الإشعارات',
        subtitle: 'الإشعارات التجريبية غير مدعومة داخل Expo Go على أندرويد - تتطلب نسخة الإنتاج.',
        icon: 'information-circle',
        duration: 4500,
      });
    }

    if (value && !pushToken && isPushSupported) {
      try {
        const { status } = await safeRequestPermissionsAsync();
        if (status === 'granted' && Device.isDevice) {
          const tokenData = await safeGetExpoPushTokenAsync({
            projectId: 'e4a2fac6-c96c-4930-825a-dc56ce8bcc75',
          });
          pushToken = tokenData?.data || null;
        }
      } catch (err) {
        console.warn('Push token registration error in Settings:', err);
      }
    }

    await updateSettings({ notifications_enabled: value ? 1 : 0, push_token: pushToken });
  };

  const handleLogout = () => {
    Alert.alert('تسجيل الخروج', 'هل أنت متأكد من رغبتك في تسجيل الخروج من حسابك؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'تسجيل الخروج',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>الإعدادات والتفضيلات</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* ═════════════════════════════════════════════════ */}
          {/* 1. Account & Identity Group                       */}
          {/* ═════════════════════════════════════════════════ */}
          <View style={styles.groupWrapper}>
            <Text style={styles.groupHeaderTitle}>الحساب والأمان</Text>
            <GlassCard style={styles.groupCard} borderRadius={22}>
              <TouchableOpacity
                style={styles.insetRow}
                onPress={() => navigation.goBack()}
                activeOpacity={0.7}
              >
                <View style={styles.rowRightInfo}>
                  <View
                    style={[
                      styles.rowIconWrap,
                      { backgroundColor: 'rgba(252, 82, 0, 0.12)' },
                    ]}
                  >
                    <Ionicons name="person-outline" size={19} color="#FC5200" />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>الملف الرياضي</Text>
                    <Text style={styles.rowSubtitle}>
                      {user?.full_name || 'عدّاء Nouble'} • @{user?.username || 'athlete'}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              <View style={styles.insetRow}>
                <View style={styles.rowRightInfo}>
                  <View
                    style={[
                      styles.rowIconWrap,
                      { backgroundColor: 'rgba(59, 130, 246, 0.12)' },
                    ]}
                  >
                    <Ionicons name="calendar-outline" size={19} color="#3B82F6" />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>تاريخ الانضمام</Text>
                    <Text style={styles.rowSubtitle}>عضو نشط في مجتمع Nouble</Text>
                  </View>
                </View>
                <Text style={styles.metaBadgeTxt}>رياضي معتمد</Text>
              </View>
            </GlassCard>
          </View>

          {/* ═════════════════════════════════════════════════ */}
          {/* 2. Workout Tracking Engine & Sensors Group         */}
          {/* ═════════════════════════════════════════════════ */}
          <View style={styles.groupWrapper}>
            <Text style={styles.groupHeaderTitle}>محرك تتبع التمارين والتيليمتري</Text>
            <GlassCard style={styles.groupCard} borderRadius={22}>
              {/* Units Selection */}
              <View style={styles.insetRow}>
                <View style={styles.rowRightInfo}>
                  <View
                    style={[
                      styles.rowIconWrap,
                      { backgroundColor: 'rgba(252, 82, 0, 0.12)' },
                    ]}
                  >
                    <MaterialCommunityIcons name="speedometer" size={20} color="#FC5200" />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>وحدات قياس المسافة</Text>
                    <Text style={styles.rowSubtitle}>كيلومتر / ميل</Text>
                  </View>
                </View>

                {/* Segmented Pill */}
                <View style={styles.segmentedWrap}>
                  <TouchableOpacity
                    style={[
                      styles.segmentedPill,
                      units === 'km' && styles.segmentedPillActive,
                    ]}
                    onPress={() => updateUnits('km')}
                  >
                    <Text
                      style={[
                        styles.segmentedTxt,
                        units === 'km' && styles.segmentedTxtActive,
                      ]}
                    >
                      KM
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segmentedPill,
                      units === 'mi' && styles.segmentedPillActive,
                    ]}
                    onPress={() => updateUnits('mi')}
                  >
                    <Text
                      style={[
                        styles.segmentedTxt,
                        units === 'mi' && styles.segmentedTxtActive,
                      ]}
                    >
                      MI
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.rowDivider} />

              {/* Trail & Elevation Smoothing */}
              <View style={styles.insetRow}>
                <View style={styles.rowRightInfo}>
                  <View
                    style={[
                      styles.rowIconWrap,
                      { backgroundColor: 'rgba(16, 185, 129, 0.12)' },
                    ]}
                  >
                    <Ionicons name="trail-sign-outline" size={19} color="#10B981" />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>وضع المسارات الجبلية والارتفاع</Text>
                    <Text style={styles.rowSubtitle}>تنعيم قراءات مقياس الارتفاع البارومتري</Text>
                  </View>
                </View>
                <Switch
                  value={trailMode}
                  onValueChange={updateTrailMode}
                  trackColor={{ false: theme.surfaceSubtle, true: '#10B981' }}
                  thumbColor="#FFF"
                />
              </View>

              <View style={styles.rowDivider} />

              {/* Haptics */}
              <View style={styles.insetRow}>
                <View style={styles.rowRightInfo}>
                  <View
                    style={[
                      styles.rowIconWrap,
                      { backgroundColor: 'rgba(245, 158, 11, 0.12)' },
                    ]}
                  >
                    <Ionicons name="hardware-chip-outline" size={19} color="#F59E0B" />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>حساسية الاهتزازات (Haptics)</Text>
                    <Text style={styles.rowSubtitle}>تنبيهات حسية عند إتمام كل كيلومتر</Text>
                  </View>
                </View>
                <Switch
                  value={hapticsEnabled}
                  onValueChange={updateHaptics}
                  trackColor={{ false: theme.surfaceSubtle, true: '#F59E0B' }}
                  thumbColor="#FFF"
                />
              </View>
            </GlassCard>
          </View>

          {/* ═════════════════════════════════════════════════ */}
          {/* 3. Audio & Streaming Preferences Group             */}
          {/* ═════════════════════════════════════════════════ */}
          <View style={styles.groupWrapper}>
            <Text style={styles.groupHeaderTitle}>مشغل الصوت وتفضيلات البث</Text>
            <GlassCard style={styles.groupCard} borderRadius={22}>
              {/* Streaming Quality */}
              <View style={styles.insetRow}>
                <View style={styles.rowRightInfo}>
                  <View
                    style={[
                      styles.rowIconWrap,
                      { backgroundColor: 'rgba(0, 122, 255, 0.12)' },
                    ]}
                  >
                    <Ionicons name="musical-notes-outline" size={19} color="#007AFF" />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>جودة بث الصوت</Text>
                    <Text style={styles.rowSubtitle}>معدل البت للذاكرة المؤقتة</Text>
                  </View>
                </View>

                {/* 3-way Quality Selector */}
                <View style={styles.segmentedWrap}>
                  <TouchableOpacity
                    style={[
                      styles.segmentedPill,
                      preferredQuality === 'hd320' && styles.segmentedPillActive,
                    ]}
                    onPress={() => updateQuality('hd320')}
                  >
                    <Text
                      style={[
                        styles.segmentedTxt,
                        preferredQuality === 'hd320' && styles.segmentedTxtActive,
                      ]}
                    >
                      HD
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segmentedPill,
                      preferredQuality === 'standard' && styles.segmentedPillActive,
                    ]}
                    onPress={() => updateQuality('standard')}
                  >
                    <Text
                      style={[
                        styles.segmentedTxt,
                        preferredQuality === 'standard' && styles.segmentedTxtActive,
                      ]}
                    >
                      STD
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segmentedPill,
                      preferredQuality === 'saver' && styles.segmentedPillActive,
                    ]}
                    onPress={() => updateQuality('saver')}
                  >
                    <Text
                      style={[
                        styles.segmentedTxt,
                        preferredQuality === 'saver' && styles.segmentedTxtActive,
                      ]}
                    >
                      SAVE
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.rowDivider} />

              {/* Audio Ducking */}
              <View style={styles.insetRow}>
                <View style={styles.rowRightInfo}>
                  <View
                    style={[
                      styles.rowIconWrap,
                      { backgroundColor: 'rgba(99, 102, 241, 0.12)' },
                    ]}
                  >
                    <Ionicons name="volume-medium-outline" size={19} color="#6366F1" />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>خفض الصوت أثناء التنبيهات</Text>
                    <Text style={styles.rowSubtitle}>Audio Ducking للتوجيه الصوتي والمدرب</Text>
                  </View>
                </View>
                <Switch
                  value={audioDucking}
                  onValueChange={updateAudioDucking}
                  trackColor={{ false: theme.surfaceSubtle, true: '#6366F1' }}
                  thumbColor="#FFF"
                />
              </View>
            </GlassCard>
          </View>

          {/* ═════════════════════════════════════════════════ */}
          {/* 4. App Appearance & System Group                   */}
          {/* ═════════════════════════════════════════════════ */}
          <View style={styles.groupWrapper}>
            <Text style={styles.groupHeaderTitle}>مظهر التطبيق والنظام</Text>
            <GlassCard style={styles.groupCard} borderRadius={22}>
              {/* Theme 3-way Selector: Dark / Light / System */}
              <View style={styles.themeRow}>
                <View style={styles.rowRightInfo}>
                  <View
                    style={[
                      styles.rowIconWrap,
                      { backgroundColor: 'rgba(245, 158, 11, 0.12)' },
                    ]}
                  >
                    <Ionicons
                      name={isDark ? 'moon' : 'sunny'}
                      size={19}
                      color={isDark ? '#F59E0B' : '#6366F1'}
                    />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>وضع المظهر (Theme)</Text>
                    <Text style={styles.rowSubtitle}>Glass-Matte Design System</Text>
                  </View>
                </View>
              </View>

              <View style={styles.themeButtonGroup}>
                <TouchableOpacity
                  style={[
                    styles.themeOptionBtn,
                    themePreference === 'dark' && styles.themeOptionBtnActive,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setThemeMode('dark');
                  }}
                >
                  <Ionicons
                    name="moon"
                    size={16}
                    color={themePreference === 'dark' ? '#FFF' : theme.textMuted}
                  />
                  <Text
                    style={[
                      styles.themeOptionTxt,
                      themePreference === 'dark' && styles.themeOptionTxtActive,
                    ]}
                  >
                    داكن (Dark)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.themeOptionBtn,
                    themePreference === 'light' && styles.themeOptionBtnActive,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setThemeMode('light');
                  }}
                >
                  <Ionicons
                    name="sunny"
                    size={16}
                    color={themePreference === 'light' ? '#FFF' : theme.textMuted}
                  />
                  <Text
                    style={[
                      styles.themeOptionTxt,
                      themePreference === 'light' && styles.themeOptionTxtActive,
                    ]}
                  >
                    فاتح (Light)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.themeOptionBtn,
                    themePreference === 'system' && styles.themeOptionBtnActive,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setThemeMode('system');
                  }}
                >
                  <Ionicons
                    name="phone-portrait-outline"
                    size={16}
                    color={themePreference === 'system' ? '#FFF' : theme.textMuted}
                  />
                  <Text
                    style={[
                      styles.themeOptionTxt,
                      themePreference === 'system' && styles.themeOptionTxtActive,
                    ]}
                  >
                    تلقائي (System)
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.rowDivider} />

              {/* Global Notifications */}
              <View style={styles.insetRow}>
                <View style={styles.rowRightInfo}>
                  <View
                    style={[
                      styles.rowIconWrap,
                      { backgroundColor: 'rgba(236, 72, 153, 0.12)' },
                    ]}
                  >
                    <Ionicons name="notifications-outline" size={19} color="#EC4899" />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>الإشعارات الفورية</Text>
                    <Text style={styles.rowSubtitle}>تنبيهات النظام والتفاعل الرياضي</Text>
                  </View>
                </View>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleGlobalToggle}
                  trackColor={{ false: theme.surfaceSubtle, true: '#EC4899' }}
                  thumbColor="#FFF"
                />
              </View>

              {notificationsEnabled && (
                <View style={styles.subSettingsWrap}>
                  <View style={styles.subRow}>
                    <Text style={styles.subRowLabel}>تنبيهات الإعجاب والتصفيق 👏</Text>
                    <Switch
                      value={notifyLikes}
                      onValueChange={(v) => {
                        setNotifyLikes(v);
                        updateSettings({ notify_likes: v ? 1 : 0 });
                      }}
                      trackColor={{ false: theme.surfaceSubtle, true: theme.textPrimary }}
                      thumbColor="#FFF"
                    />
                  </View>
                  <View style={styles.subRow}>
                    <Text style={styles.subRowLabel}>تعليقات التمارين والمجتمع</Text>
                    <Switch
                      value={notifyComments}
                      onValueChange={(v) => {
                        setNotifyComments(v);
                        updateSettings({ notify_comments: v ? 1 : 0 });
                      }}
                      trackColor={{ false: theme.surfaceSubtle, true: theme.textPrimary }}
                      thumbColor="#FFF"
                    />
                  </View>
                </View>
              )}
            </GlassCard>
          </View>

          {/* ═════════════════════════════════════════════════ */}
          {/* 5. Sign Out Button (Soft Red Glass)               */}
          {/* ═════════════════════════════════════════════════ */}
          <View style={styles.groupWrapper}>
            <TouchableOpacity
              style={styles.signOutBtn}
              onPress={handleLogout}
              activeOpacity={0.8}
            >
              <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
              <Text style={styles.signOutBtnTxt}>تسجيل الخروج من الحساب</Text>
            </TouchableOpacity>
          </View>

          {/* Footer App Info */}
          <View style={styles.footerWrap}>
            <Text style={styles.versionTxt}>Nouble v1.1.0</Text>
            <Text style={styles.buildTag}>Glass-Matte Unified Engine • 2026</Text>
          </View>
        </ScrollView>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#FC5200" />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
};

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      height: 54,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.surfaceSubtle,
    },
    headerTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    groupWrapper: {
      marginBottom: 22,
    },
    groupHeaderTitle: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 8,
      marginHorizontal: 6,
      letterSpacing: 0.3,
    },
    groupCard: {
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    insetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
    },
    rowRightInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    rowIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 11,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    textStack: {
      flex: 1,
    },
    rowTitle: {
      color: theme.textPrimary,
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    rowSubtitle: {
      color: theme.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    rowDivider: {
      height: 1,
      backgroundColor: theme.borderSubtle,
      marginHorizontal: -4,
    },
    metaBadgeTxt: {
      color: '#10B981',
      fontSize: 12,
      fontWeight: '700',
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },

    // Segmented Pill
    segmentedWrap: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceSubtle,
      borderRadius: 12,
      padding: 3,
      gap: 2,
    },
    segmentedPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 9,
    },
    segmentedPillActive: {
      backgroundColor: theme.mode === 'dark' ? '#FC5200' : '#111827',
    },
    segmentedTxt: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    segmentedTxtActive: {
      color: '#FFFFFF',
    },

    // Theme selector
    themeRow: {
      paddingVertical: 10,
    },
    themeButtonGroup: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceSubtle,
      borderRadius: 14,
      padding: 4,
      marginBottom: 12,
      gap: 4,
    },
    themeOptionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      gap: 6,
    },
    themeOptionBtnActive: {
      backgroundColor: theme.mode === 'dark' ? '#21262D' : '#111827',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
        },
        android: {
          elevation: 2,
        },
      }),
    },
    themeOptionTxt: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    themeOptionTxtActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },

    // Sub-settings
    subSettingsWrap: {
      backgroundColor: theme.surfaceSubtle,
      borderRadius: 14,
      padding: 10,
      marginBottom: 10,
      gap: 6,
    },
    subRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    subRowLabel: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },

    // Sign Out Button (Soft red glass)
    signOutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 59, 48, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255, 59, 48, 0.25)',
      borderRadius: 18,
      paddingVertical: 14,
      gap: 8,
    },
    signOutBtnTxt: {
      color: '#FF3B30',
      fontSize: 15,
      fontWeight: '700',
    },

    // Footer
    footerWrap: {
      alignItems: 'center',
      marginTop: 20,
      marginBottom: 15,
    },
    versionTxt: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '700',
    },
    buildTag: {
      color: theme.textSecondary,
      fontSize: 11,
      marginTop: 3,
    },

    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.3)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 999,
    },
  });

export default SettingsScreen;
