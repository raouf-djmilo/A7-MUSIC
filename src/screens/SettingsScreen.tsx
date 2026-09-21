import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { useAuth } from '../providers/AuthProvider';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { GlassCard } from '../components/GlassCard';
import { ToastManager } from '../components/InAppToast';
import { useAudioStore, AudioQuality } from '../store/useAudioStore';
import { configureAudioSession } from '../services/audioSessionService';
import { useDownloadStore, downloadService } from '../services/downloadService';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import { useUpdateStore } from '../services/updateService';
import {
  getInstalledAppVersion,
  APP_BUILD_NAME,
  APP_RELEASE_YEAR,
  GITHUB_RELEASES_PAGE_URL,
} from '../config/version';

const STORAGE_BG_PLAYBACK_KEY = '@nouble_background_playback_pref';

export const SettingsScreen = () => {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const { theme, isDark, themePreference, setThemeMode } = useTheme();
  const styles = useThemedStyles(createStyles);
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  const currentVersion = getInstalledAppVersion();
  const { hasUpdate, updateInfo, isChecking, checkUpdates } = useUpdateStore();
  const { totalStorageMB, totalTrackCount, loadManifest } = useDownloadStore();

  const {
    preferredQuality,
    setAudioQuality,
    backgroundAudioEnabled,
    setBackgroundAudioEnabled,
  } = useAudioStore();

  const [bgPlayback, setBgPlayback] = useState(backgroundAudioEnabled);
  const [clearingCache, setClearingCache] = useState(false);

  // Initial load
  useEffect(() => {
    checkUpdates(false).catch(() => {});
    loadManifest().catch(() => {});

    // Sync saved background audio preference
    AsyncStorage.getItem(STORAGE_BG_PLAYBACK_KEY).then((val) => {
      if (val !== null) {
        const isEnabled = val === 'true';
        setBgPlayback(isEnabled);
        useAudioStore.setState({ backgroundAudioEnabled: isEnabled });
      }
    }).catch(() => {});
  }, [checkUpdates, loadManifest]);

  // Audio Quality handler
  const handleQualityChange = (quality: AudioQuality) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAudioQuality(quality);
  };

  // Background audio toggle handler
  const handleBgPlaybackToggle = async (val: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBgPlayback(val);
    setBackgroundAudioEnabled(val);
    await AsyncStorage.setItem(STORAGE_BG_PLAYBACK_KEY, String(val));
    await configureAudioSession(val);

    ToastManager.show({
      title: val ? 'تم تفعيل التشغيل في الخلفية' : 'تم إيقاف التشغيل في الخلفية',
      subtitle: val
        ? 'ستستمر الموسيقى عند قفل الشاشة أو مغادرة التطبيق'
        : 'سيتوقف الصوت تلقائياً عند قفل الشاشة لتوفير الطاقة',
      icon: val ? 'musical-notes' : 'pause-circle',
      duration: 3000,
    });
  };

  // Clear offline cache handler
  const handleClearOfflineCache = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'مسح التخزين المحلي',
      `هل أنت متأكد من رغبتك في حذف جميع الأغاني المحمّلة (${totalTrackCount} أغنية • ${totalStorageMB})؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'مسح الآن',
          style: 'destructive',
          onPress: async () => {
            setClearingCache(true);
            try {
              await downloadService.clearAllDownloads();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              ToastManager.show({
                title: 'تم تفريغ التخزين المحلي بنجاح',
                subtitle: 'تم توفير مساحة التخزين وحذف الملفات المؤقتة',
                icon: 'trash-outline',
              });
            } catch (e) {
              Alert.alert('خطأ', 'تعذر إتمام مسح ملفات التخزين.');
            } finally {
              setClearingCache(false);
            }
          },
        },
      ]
    );
  };

  // Logout handler
  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
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

  // About App Info Dialog
  const handleAboutApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'حول A7 MUSIC',
      `الإصدار: v${currentVersion}\nالمحرك: ${APP_BUILD_NAME}\nسنة الإصدار: ${APP_RELEASE_YEAR}\n\nمشغل موسيقى احترافي فائق الأداء بتجربة Glass-Matte وتخزين أوفلاين شامل.`,
      [
        { text: 'إغلاق', style: 'cancel' },
        {
          text: 'صفحة الإصدارات (GitHub)',
          onPress: () => Linking.openURL(GITHUB_RELEASES_PAGE_URL),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* ── Top Apple Header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.goBack();
            }}
            style={styles.backBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>الإعدادات</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: miniPlayerBottomGap + 32 },
          ]}
        >
          {/* ═════════════════════════════════════════════════ */}
          {/* المجموعة 1: الحساب والملف الشخصي (Account)       */}
          {/* ═════════════════════════════════════════════════ */}
          <View style={styles.groupWrapper}>
            <Text style={styles.groupHeaderTitle}>الحساب</Text>
            <GlassCard style={styles.groupCard} borderRadius={22}>
              {/* Profile Tile */}
              <TouchableOpacity
                style={styles.insetRow}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.goBack();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.rowRightInfo}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(252, 82, 0, 0.12)' }]}>
                    <Ionicons name="person-outline" size={20} color="#FC5200" />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>{user?.full_name || 'مستخدم A7 MUSIC'}</Text>
                    <Text style={styles.rowSubtitle}>@{user?.username || 'user'}</Text>
                  </View>
                </View>
                <View style={styles.rowEndGroup}>
                  <View style={styles.activeUserBadge}>
                    <Text style={styles.activeUserBadgeText}>عضو نشط</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                </View>
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* Sign Out Tile */}
              <TouchableOpacity
                style={styles.insetRow}
                onPress={handleLogout}
                activeOpacity={0.7}
              >
                <View style={styles.rowRightInfo}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                    <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={[styles.rowTitle, { color: '#EF4444' }]}>تسجيل الخروج</Text>
                    <Text style={styles.rowSubtitle}>إنهاء الجلسة الحالية</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            </GlassCard>
          </View>

          {/* ═════════════════════════════════════════════════ */}
          {/* المجموعة 2: الموسيقى والتخزين الأوفلاين           */}
          {/* ═════════════════════════════════════════════════ */}
          <View style={styles.groupWrapper}>
            <Text style={styles.groupHeaderTitle}>الموسيقى والتخزين الأوفلاين</Text>
            <GlassCard style={styles.groupCard} borderRadius={22}>
              {/* Storage Stats Tile */}
              <View style={styles.insetRow}>
                <View style={styles.rowRightInfo}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                    <Ionicons name="folder-open-outline" size={20} color="#10B981" />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>المساحة المحمّلة محلياً</Text>
                    <Text style={styles.rowSubtitle}>{totalTrackCount} مسارات صوتية محفوظة</Text>
                  </View>
                </View>
                <View style={styles.storageBadge}>
                  <Text style={styles.storageBadgeText}>{totalStorageMB}</Text>
                </View>
              </View>

              <View style={styles.rowDivider} />

              {/* Audio Quality 3-Way Segmented Control */}
              <View style={styles.insetRow}>
                <View style={styles.rowRightInfo}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(0, 122, 255, 0.12)' }]}>
                    <Ionicons name="musical-notes-outline" size={20} color="#007AFF" />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>جودة الصوت المفضلة</Text>
                    <Text style={styles.rowSubtitle}>معدل البت للتشغيل والتنزيل</Text>
                  </View>
                </View>

                <View style={styles.segmentedWrap}>
                  <TouchableOpacity
                    style={[
                      styles.segmentedPill,
                      preferredQuality === 'hd320' && styles.segmentedPillActive,
                    ]}
                    onPress={() => handleQualityChange('hd320')}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.segmentedTxt,
                        preferredQuality === 'hd320' && styles.segmentedTxtActive,
                      ]}
                    >
                      HD 320
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segmentedPill,
                      preferredQuality === 'standard' && styles.segmentedPillActive,
                    ]}
                    onPress={() => handleQualityChange('standard')}
                    activeOpacity={0.8}
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
                    onPress={() => handleQualityChange('saver')}
                    activeOpacity={0.8}
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

              {/* Background Audio Playback Toggle */}
              <View style={styles.insetRow}>
                <View style={styles.rowRightInfo}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(29, 185, 84, 0.12)' }]}>
                    <Ionicons name="play-circle-outline" size={20} color="#1DB954" />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>التشغيل في الخلفية</Text>
                    <Text style={styles.rowSubtitle}>إبقاء الصوت نشطاً عند قفل الشاشة</Text>
                  </View>
                </View>
                <Switch
                  value={bgPlayback}
                  onValueChange={handleBgPlaybackToggle}
                  trackColor={{ false: theme.surfaceSubtle, true: '#1DB954' }}
                  thumbColor="#FFF"
                />
              </View>

              <View style={styles.rowDivider} />

              {/* Clear Offline Cache Tile */}
              <TouchableOpacity
                style={styles.insetRow}
                onPress={handleClearOfflineCache}
                disabled={clearingCache || totalTrackCount === 0}
                activeOpacity={0.7}
              >
                <View style={styles.rowRightInfo}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                    {clearingCache ? (
                      <ActivityIndicator size="small" color="#F59E0B" />
                    ) : (
                      <Ionicons name="trash-outline" size={20} color="#F59E0B" />
                    )}
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>تفريغ التخزين المؤقت</Text>
                    <Text style={styles.rowSubtitle}>مسح الأغاني المحمّلة لتوفير مساحة الهاتف</Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.actionLinkText,
                    totalTrackCount === 0 && { color: theme.textMuted },
                  ]}
                >
                  {totalTrackCount === 0 ? 'فارغ' : 'تنظيف'}
                </Text>
              </TouchableOpacity>
            </GlassCard>
          </View>

          {/* ═════════════════════════════════════════════════ */}
          {/* المجموعة 3: المظهر، النظام والتحديثات           */}
          {/* ═════════════════════════════════════════════════ */}
          <View style={styles.groupWrapper}>
            <Text style={styles.groupHeaderTitle}>المظهر والنظام</Text>
            <GlassCard style={styles.groupCard} borderRadius={22}>
              {/* Theme 3-Way Selector */}
              <View style={styles.themeSelectorRow}>
                <View style={styles.themeHeaderRow}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}>
                    <Ionicons
                      name={isDark ? 'moon' : 'sunny'}
                      size={20}
                      color={isDark ? '#F59E0B' : '#6366F1'}
                    />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>وضع المظهر</Text>
                    <Text style={styles.rowSubtitle}>Glass-Matte Design System</Text>
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
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="moon"
                      size={15}
                      color={themePreference === 'dark' ? '#FFF' : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.themeOptionTxt,
                        themePreference === 'dark' && styles.themeOptionTxtActive,
                      ]}
                    >
                      داكن
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
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="sunny"
                      size={15}
                      color={themePreference === 'light' ? '#FFF' : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.themeOptionTxt,
                        themePreference === 'light' && styles.themeOptionTxtActive,
                      ]}
                    >
                      فاتح
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
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="phone-portrait-outline"
                      size={15}
                      color={themePreference === 'system' ? '#FFF' : theme.textMuted}
                    />
                    <Text
                      style={[
                        styles.themeOptionTxt,
                        themePreference === 'system' && styles.themeOptionTxtActive,
                      ]}
                    >
                      تلقائي
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.rowDivider} />

              {/* Software Update Tile */}
              <TouchableOpacity
                style={styles.insetRow}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate('SoftwareUpdate');
                }}
                activeOpacity={0.75}
              >
                <View style={styles.rowRightInfo}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(0, 122, 255, 0.12)' }]}>
                    <Ionicons name="cloud-download-outline" size={20} color="#007AFF" />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>تحديث التطبيق</Text>
                    <Text style={styles.rowSubtitle}>
                      {hasUpdate
                        ? `إصدار جديد متوفر: v${updateInfo?.latestVersion || ''}`
                        : `الإصدار الحالي v${currentVersion} • فحص وتثبيت`}
                    </Text>
                  </View>
                </View>

                <View style={styles.updateRowRightSide}>
                  {hasUpdate ? (
                    <View style={styles.updateBadgeAlert}>
                      <View style={styles.updateBadgeAlertDot} />
                      <Text style={styles.updateBadgeAlertText}>تحديث</Text>
                    </View>
                  ) : isChecking ? (
                    <ActivityIndicator size="small" color="#007AFF" />
                  ) : (
                    <View style={styles.upToDateSmallPill}>
                      <Text style={styles.upToDateSmallPillText}>v{currentVersion}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                </View>
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* About App Tile */}
              <TouchableOpacity
                style={styles.insetRow}
                onPress={handleAboutApp}
                activeOpacity={0.7}
              >
                <View style={styles.rowRightInfo}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(168, 85, 247, 0.12)' }]}>
                    <Ionicons name="information-circle-outline" size={20} color="#A855F7" />
                  </View>
                  <View style={styles.textStack}>
                    <Text style={styles.rowTitle}>حول A7 MUSIC</Text>
                    <Text style={styles.rowSubtitle}>{APP_BUILD_NAME}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            </GlassCard>
          </View>

          {/* ── Sleek Apple Footer ── */}
          <View style={styles.footerWrap}>
            <Text style={styles.versionTxt}>A7 MUSIC v{currentVersion}</Text>
            <Text style={styles.buildTag}>
              {APP_BUILD_NAME} • {APP_RELEASE_YEAR}
            </Text>
          </View>
        </ScrollView>
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
    safeArea: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      height: 52,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.surfaceSubtle,
    },
    headerTitle: {
      color: theme.textPrimary,
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    headerSpacer: {
      width: 38,
    },
    scrollContent: {
      padding: 16,
    },
    groupWrapper: {
      marginBottom: 20,
    },
    groupHeaderTitle: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 8,
      marginHorizontal: 8,
      letterSpacing: 0.2,
    },
    groupCard: {
      paddingHorizontal: 16,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    insetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 13,
    },
    rowRightInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 12,
    },
    rowIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    textStack: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.textPrimary,
      letterSpacing: -0.2,
      marginBottom: 2,
    },
    rowSubtitle: {
      fontSize: 12,
      color: theme.textMuted,
      lineHeight: 16,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.borderSubtle,
      marginLeft: 48,
    },
    rowEndGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    activeUserBadge: {
      backgroundColor: 'rgba(252, 82, 0, 0.12)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    activeUserBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FC5200',
    },
    storageBadge: {
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 9,
    },
    storageBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#10B981',
    },
    actionLinkText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#F59E0B',
    },
    /* Segmented Pill Selector (3-way) */
    segmentedWrap: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceSubtle,
      padding: 3,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
    },
    segmentedPill: {
      paddingVertical: 5,
      paddingHorizontal: 9,
      borderRadius: 9,
    },
    segmentedPillActive: {
      backgroundColor: '#007AFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 2,
      elevation: 2,
    },
    segmentedTxt: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textMuted,
    },
    segmentedTxtActive: {
      color: '#FFF',
    },
    /* Theme Selector Row */
    themeSelectorRow: {
      paddingVertical: 12,
    },
    themeHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    themeButtonGroup: {
      flexDirection: 'row',
      gap: 8,
    },
    themeOptionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceSubtle,
      paddingVertical: 9,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
      gap: 6,
    },
    themeOptionBtnActive: {
      backgroundColor: '#007AFF',
      borderColor: '#007AFF',
      shadowColor: '#007AFF',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 3,
    },
    themeOptionTxt: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    themeOptionTxtActive: {
      color: '#FFF',
    },
    /* Update Row Right Side */
    updateRowRightSide: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    updateBadgeAlert: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FC5200',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      gap: 4,
    },
    updateBadgeAlertDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: '#FFF',
    },
    updateBadgeAlertText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFF',
    },
    upToDateSmallPill: {
      backgroundColor: theme.surfaceSubtle,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
    },
    upToDateSmallPillText: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.textMuted,
    },
    /* Footer */
    footerWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 18,
      gap: 3,
    },
    versionTxt: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    buildTag: {
      fontSize: 11,
      color: theme.textMuted,
    },
  });

export default SettingsScreen;
