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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme/ThemeContext';
import { useLanguageStore, AppLanguage } from '../store/useLanguageStore';
import { LiquidGlassSurface } from '../components/LiquidGlassSurface';
import { ToastManager } from '../components/InAppToast';
import { useAudioStore } from '../store/useAudioStore';
import { useDownloadStore, downloadService } from '../services/downloadService';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import { useUpdateStore } from '../services/updateService';
import {
  safeGetPermissionsAsync,
  safeRequestPermissionsAsync,
  safeSetNotificationHandler,
} from '../services/notificationService';
import {
  getInstalledAppVersion,
  APP_RELEASE_YEAR,
  GITHUB_RELEASES_PAGE_URL,
} from '../config/version';

const STORAGE_BG_PLAYBACK_KEY = '@nouble_background_playback_pref';
const STORAGE_NOTIFICATIONS_KEY = '@a7music_notifications_opt_in';

export const SettingsScreen = () => {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const { isDark, themePreference, setThemeMode } = useTheme();
  const { language, setLanguage } = useLanguageStore();
  const isAr = language === 'ar';
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  const currentVersion = getInstalledAppVersion();
  const { hasUpdate, otaStatus, otaDetails, updateInfo, isChecking, checkUpdates } = useUpdateStore();
  const { totalStorageMB, totalTrackCount, loadManifest } = useDownloadStore();

  const { backgroundAudioEnabled, setBackgroundAudioEnabled } = useAudioStore();

  const [bgPlayback, setBgPlayback] = useState(backgroundAudioEnabled);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

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
        divider: 'rgba(255, 255, 255, 0.08)',
        segmentBg: 'rgba(255, 255, 255, 0.06)',
        switchOff: 'rgba(255, 255, 255, 0.18)',
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
        divider: 'rgba(15, 23, 42, 0.07)',
        segmentBg: 'rgba(15, 23, 42, 0.05)',
        switchOff: 'rgba(15, 23, 42, 0.16)',
      };

  const t = isAr
    ? {
        title: 'الإعدادات',
        accountSection: 'الحساب',
        guestTitle: 'حساب ضيف',
        guestAction: 'تسجيل الدخول أو إنشاء حساب جديد',
        playbackSection: 'التشغيل والتخزين',
        downloadsTitle: 'المسارات المحمّلة',
        downloadsSub: `${totalTrackCount} مسار محفوظ بدون إنترنت`,
        bgTitle: 'التشغيل في الخلفية',
        bgSub: 'استمرار الصوت عند قفل الشاشة أو مغادرة التطبيق',
        clearCacheTitle: 'تفريغ التخزين المؤقت',
        clearCacheSub: 'حذف الملفات المحمّلة لتوفير مساحة الجهاز',
        emptyLabel: 'فارغ',
        clearLabel: 'تفريغ',
        appearanceSection: 'المظهر واللغة',
        themeTitle: 'وضع المظهر',
        themeSub: 'متوافق مع مظهر الجهاز',
        dark: 'داكن',
        light: 'فاتح',
        auto: 'تلقائي',
        langTitle: 'لغة التطبيق',
        langSub: 'التبديل بين العربية والإنجليزية',
        systemSection: 'النظام والتحديثات',
        notifTitle: 'إشعارات التحديثات',
        notifOn: 'مفعّلة • تصلك تنبيهات التحديثات',
        notifOff: 'معطّلة • فعّلها لاستلام إشعارات التحديث',
        updatesTitle: 'تحديثات التطبيق',
        updatesReady: `تحديث جاهز (${otaDetails?.otaVersion || 'OTA'})`,
        updatesAvailable: `إصدار جديد متوفر: v${updateInfo?.latestVersion || ''}`,
        updatesCurrent: `الإصدار الحالي v${currentVersion}`,
        updateBadge: 'تحديث',
        aboutTitle: 'حول A7 Music',
        aboutSub: `الإصدار v${currentVersion}`,
        signOut: 'تسجيل الخروج',
        signOutConfirmTitle: 'تسجيل الخروج',
        signOutConfirmBody: 'هل تريد تسجيل الخروج من حسابك؟',
        cancel: 'إلغاء',
      }
    : {
        title: 'Settings',
        accountSection: 'Account',
        guestTitle: 'Guest Profile',
        guestAction: 'Sign In or Create Account',
        playbackSection: 'Playback & Storage',
        downloadsTitle: 'Downloaded Tracks',
        downloadsSub: `${totalTrackCount} tracks saved offline`,
        bgTitle: 'Background Playback',
        bgSub: 'Keep music playing when screen is locked',
        clearCacheTitle: 'Clear Cache',
        clearCacheSub: 'Remove downloaded files to free up space',
        emptyLabel: 'Empty',
        clearLabel: 'Clear',
        appearanceSection: 'Appearance & Language',
        themeTitle: 'Appearance',
        themeSub: 'Matches device schedule & mode',
        dark: 'Dark',
        light: 'Light',
        auto: 'Auto',
        langTitle: 'App Language',
        langSub: 'Switch between Arabic and English',
        systemSection: 'System & Updates',
        notifTitle: 'Update Notifications',
        notifOn: 'Enabled • Receive app update alerts',
        notifOff: 'Disabled • Enable for update alerts',
        updatesTitle: 'App Updates',
        updatesReady: `Update ready (${otaDetails?.otaVersion || 'OTA'})`,
        updatesAvailable: `New version available: v${updateInfo?.latestVersion || ''}`,
        updatesCurrent: `Current version v${currentVersion}`,
        updateBadge: 'Update',
        aboutTitle: 'About A7 Music',
        aboutSub: `Version v${currentVersion}`,
        signOut: 'Sign Out',
        signOutConfirmTitle: 'Sign Out',
        signOutConfirmBody: 'Are you sure you want to sign out?',
        cancel: 'Cancel',
      };

  useEffect(() => {
    checkUpdates(false).catch(() => {});
    loadManifest().catch(() => {});

    AsyncStorage.getItem(STORAGE_BG_PLAYBACK_KEY)
      .then((val) => {
        if (val !== null) {
          const isEnabled = val === 'true';
          setBgPlayback(isEnabled);
          useAudioStore.setState({ backgroundAudioEnabled: isEnabled });
        }
      })
      .catch(() => {});

    Promise.all([
      AsyncStorage.getItem(STORAGE_NOTIFICATIONS_KEY),
      safeGetPermissionsAsync(),
    ])
      .then(([savedOptIn, perms]) => {
        const enabled = Boolean(perms.granted && savedOptIn !== 'false');
        setNotificationsEnabled(enabled);
      })
      .catch(() => {});
  }, [checkUpdates, loadManifest]);

  const handleNotificationsToggle = async (val: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!val) {
      setNotificationsEnabled(false);
      await AsyncStorage.setItem(STORAGE_NOTIFICATIONS_KEY, 'false').catch(() => {});
      ToastManager.show({
        title: isAr ? 'تم إيقاف الإشعارات' : 'Notifications Disabled',
        subtitle: isAr
          ? 'لن تصلك تنبيهات عند توفر تحديث جديد'
          : 'You will not receive update alerts',
        icon: 'notifications-off-outline',
      });
      return;
    }

    const currentPerms = await safeGetPermissionsAsync();
    let granted = currentPerms.granted;
    if (!granted) {
      const req = await safeRequestPermissionsAsync();
      granted = req.granted;
    }

    if (granted) {
      safeSetNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      setNotificationsEnabled(true);
      await AsyncStorage.setItem(STORAGE_NOTIFICATIONS_KEY, 'true').catch(() => {});
      ToastManager.show({
        title: isAr ? 'تم تفعيل الإشعارات' : 'Notifications Enabled',
        subtitle: isAr
          ? 'ستصلك تنبيهات التحديثات الجديدة على جهازك'
          : 'You will receive alerts for new updates',
        icon: 'notifications',
      });
    } else {
      setNotificationsEnabled(false);
      Alert.alert(
        isAr ? 'صلاحية الإشعارات مطلوبة' : 'Permission Required',
        isAr
          ? 'يرجى السماح بالإشعارات من إعدادات الجهاز.'
          : 'Please allow notifications in device settings.',
        [
          { text: t.cancel, style: 'cancel' },
          {
            text: isAr ? 'فتح الإعدادات' : 'Open Settings',
            onPress: () => Linking.openSettings(),
          },
        ]
      );
    }
  };

  const handleBgPlaybackToggle = (val: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBgPlayback(val);
    setBackgroundAudioEnabled(val);

    ToastManager.show({
      title: val
        ? isAr
          ? 'تم تفعيل التشغيل في الخلفية'
          : 'Background Playback On'
        : isAr
        ? 'تم إيقاف التشغيل في الخلفية'
        : 'Background Playback Off',
      subtitle: val
        ? isAr
          ? 'تستمر الموسيقى عند قفل الشاشة'
          : 'Music continues when screen is locked'
        : isAr
        ? 'يتوقف الصوت عند قفل الشاشة'
        : 'Audio pauses when screen is locked',
      icon: val ? 'musical-notes' : 'pause-circle',
      duration: 2800,
    });
  };

  const handleClearOfflineCache = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      t.clearCacheTitle,
      isAr
        ? `هل تريد حذف جميع المسارات المحمّلة (${totalTrackCount} • ${totalStorageMB})؟`
        : `Delete all downloaded tracks (${totalTrackCount} • ${totalStorageMB})?`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.clearLabel,
          style: 'destructive',
          onPress: async () => {
            setClearingCache(true);
            try {
              await downloadService.clearAllDownloads();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              ToastManager.show({
                title: isAr ? 'تم تفريغ التخزين بنجاح' : 'Cache Cleared',
                subtitle: isAr
                  ? 'تم تحرير مساحة الجهاز وحذف الملفات المؤقتة'
                  : 'Storage freed and temporary files removed',
                icon: 'trash-outline',
              });
            } catch {
              Alert.alert(
                isAr ? 'تنبيه' : 'Notice',
                isAr ? 'تعذر تفريغ التخزين المؤقت.' : 'Could not clear cache.'
              );
            } finally {
              setClearingCache(false);
            }
          },
        },
      ]
    );
  };

  const handleLanguageChange = async (lang: AppLanguage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setLanguage(lang);
    ToastManager.show({
      title: lang === 'ar' ? 'تم التبديل إلى العربية' : 'Switched to English',
      icon: 'language-outline',
      duration: 2000,
    });
  };

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(t.signOutConfirmTitle, t.signOutConfirmBody, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.signOut,
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const handleAboutApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      t.aboutTitle,
      isAr
        ? `الإصدار: v${currentVersion}\nسنة الإصدار: ${APP_RELEASE_YEAR}\n\nتجربة استماع موسيقية سريعة وبسيطة بتصميم Apple Liquid Glass.`
        : `Version: v${currentVersion}\nYear: ${APP_RELEASE_YEAR}\n\nFast, clean music streaming with Apple Liquid Glass design.`,
      [
        { text: isAr ? 'إغلاق' : 'Close', style: 'cancel' },
        {
          text: isAr ? 'صفحة الإصدارات' : 'Releases',
          onPress: () => Linking.openURL(GITHUB_RELEASES_PAGE_URL),
        },
      ]
    );
  };

  const rowDirection = isAr ? 'row-reverse' : 'row';
  const textAlign = isAr ? 'right' : 'left';
  const writingDirection = isAr ? 'rtl' : 'ltr';

  return (
    <View style={[styles.container, { backgroundColor: palette.baseBg }]}>
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
        <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      </View>

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* ── Top Liquid Glass Header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.goBack();
            }}
            activeOpacity={0.75}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <LiquidGlassSurface
              glassStyle="regular"
              isDark={isDark}
              isInteractive
              borderRadius={20}
              style={[styles.backBtn, { borderColor: palette.pillBorder }]}
            >
              <Ionicons name="chevron-back" size={22} color={palette.textPrimary} />
            </LiquidGlassSurface>
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>{t.title}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: miniPlayerBottomGap + 32 },
          ]}
        >
          {/* ── Guest Card (Only shown for Guest users; logged-in profile lives in Profile Tab) ── */}
          {!user && (
            <View style={styles.groupWrapper}>
              <Text
                style={[
                  styles.groupHeaderTitle,
                  { color: palette.textSecondary, textAlign, writingDirection },
                ]}
              >
                {t.accountSection}
              </Text>
              <LiquidGlassSurface
                glassStyle="regular"
                isDark={isDark}
                isInteractive={false}
                borderRadius={24}
                style={[
                  styles.groupCard,
                  {
                    backgroundColor: palette.cardBg,
                    borderColor: palette.cardBorder,
                    borderTopColor: palette.cardTopBorder,
                  },
                ]}
              >
                <TouchableOpacity
                  style={[styles.insetRow, { flexDirection: rowDirection }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    navigation.navigate('Auth', { screen: 'Login' });
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.rowInfoGroup, { flexDirection: rowDirection }]}>
                    <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(0, 122, 255, 0.14)' }]}>
                      <Ionicons name="person-add-outline" size={20} color="#007AFF" />
                    </View>
                    <View style={styles.textStack}>
                      <Text
                        style={[
                          styles.rowTitle,
                          { color: palette.textPrimary, textAlign, writingDirection },
                        ]}
                      >
                        {t.guestTitle}
                      </Text>
                      <Text
                        style={[
                          styles.rowSubtitle,
                          { color: '#38BDF8', textAlign, writingDirection },
                        ]}
                      >
                        {t.guestAction}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={isAr ? 'chevron-back' : 'chevron-forward'}
                    size={18}
                    color={palette.textMuted}
                  />
                </TouchableOpacity>
              </LiquidGlassSurface>
            </View>
          )}

          {/* ── Section 1: Playback & Storage ── */}
          <View style={styles.groupWrapper}>
            <Text
              style={[
                styles.groupHeaderTitle,
                { color: palette.textSecondary, textAlign, writingDirection },
              ]}
            >
              {t.playbackSection}
            </Text>
            <LiquidGlassSurface
              glassStyle="regular"
              isDark={isDark}
              isInteractive={false}
              borderRadius={24}
              style={[
                styles.groupCard,
                {
                  backgroundColor: palette.cardBg,
                  borderColor: palette.cardBorder,
                  borderTopColor: palette.cardTopBorder,
                },
              ]}
            >
              {/* Downloaded Tracks */}
              <View style={[styles.insetRow, { flexDirection: rowDirection }]}>
                <View style={[styles.rowInfoGroup, { flexDirection: rowDirection }]}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.14)' }]}>
                    <Ionicons name="folder-open-outline" size={20} color="#10B981" />
                  </View>
                  <View style={styles.textStack}>
                    <Text
                      style={[
                        styles.rowTitle,
                        { color: palette.textPrimary, textAlign, writingDirection },
                      ]}
                    >
                      {t.downloadsTitle}
                    </Text>
                    <Text
                      style={[
                        styles.rowSubtitle,
                        { color: palette.textSecondary, textAlign, writingDirection },
                      ]}
                    >
                      {t.downloadsSub}
                    </Text>
                  </View>
                </View>
                <View style={styles.storageBadge}>
                  <Text style={styles.storageBadgeText}>{totalStorageMB}</Text>
                </View>
              </View>

              <View style={[styles.rowDivider, { backgroundColor: palette.divider }]} />

              {/* Background Playback */}
              <View style={[styles.insetRow, { flexDirection: rowDirection }]}>
                <View style={[styles.rowInfoGroup, { flexDirection: rowDirection }]}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(29, 185, 84, 0.14)' }]}>
                    <Ionicons name="play-circle-outline" size={20} color="#1DB954" />
                  </View>
                  <View style={styles.textStack}>
                    <Text
                      style={[
                        styles.rowTitle,
                        { color: palette.textPrimary, textAlign, writingDirection },
                      ]}
                    >
                      {t.bgTitle}
                    </Text>
                    <Text
                      style={[
                        styles.rowSubtitle,
                        { color: palette.textSecondary, textAlign, writingDirection },
                      ]}
                    >
                      {t.bgSub}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={bgPlayback}
                  onValueChange={handleBgPlaybackToggle}
                  trackColor={{ false: palette.switchOff, true: '#1DB954' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={[styles.rowDivider, { backgroundColor: palette.divider }]} />

              {/* Clear Cache */}
              <TouchableOpacity
                style={[styles.insetRow, { flexDirection: rowDirection }]}
                onPress={handleClearOfflineCache}
                disabled={clearingCache || totalTrackCount === 0}
                activeOpacity={0.75}
              >
                <View style={[styles.rowInfoGroup, { flexDirection: rowDirection }]}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.14)' }]}>
                    {clearingCache ? (
                      <ActivityIndicator size="small" color="#F59E0B" />
                    ) : (
                      <Ionicons name="trash-outline" size={20} color="#F59E0B" />
                    )}
                  </View>
                  <View style={styles.textStack}>
                    <Text
                      style={[
                        styles.rowTitle,
                        { color: palette.textPrimary, textAlign, writingDirection },
                      ]}
                    >
                      {t.clearCacheTitle}
                    </Text>
                    <Text
                      style={[
                        styles.rowSubtitle,
                        { color: palette.textSecondary, textAlign, writingDirection },
                      ]}
                    >
                      {t.clearCacheSub}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.actionLinkText,
                    { color: totalTrackCount === 0 ? palette.textMuted : '#F59E0B' },
                  ]}
                >
                  {totalTrackCount === 0 ? t.emptyLabel : t.clearLabel}
                </Text>
              </TouchableOpacity>
            </LiquidGlassSurface>
          </View>

          {/* ── Section 2: Appearance & Language ── */}
          <View style={styles.groupWrapper}>
            <Text
              style={[
                styles.groupHeaderTitle,
                { color: palette.textSecondary, textAlign, writingDirection },
              ]}
            >
              {t.appearanceSection}
            </Text>
            <LiquidGlassSurface
              glassStyle="regular"
              isDark={isDark}
              isInteractive={false}
              borderRadius={24}
              style={[
                styles.groupCard,
                {
                  backgroundColor: palette.cardBg,
                  borderColor: palette.cardBorder,
                  borderTopColor: palette.cardTopBorder,
                },
              ]}
            >
              {/* Theme 3-Way Selector */}
              <View style={styles.themeSelectorRow}>
                <View style={[styles.themeHeaderRow, { flexDirection: rowDirection }]}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(99, 102, 241, 0.14)' }]}>
                    <Ionicons
                      name={isDark ? 'moon' : 'sunny'}
                      size={20}
                      color={isDark ? '#F59E0B' : '#6366F1'}
                    />
                  </View>
                  <View style={styles.textStack}>
                    <Text
                      style={[
                        styles.rowTitle,
                        { color: palette.textPrimary, textAlign, writingDirection },
                      ]}
                    >
                      {t.themeTitle}
                    </Text>
                    <Text
                      style={[
                        styles.rowSubtitle,
                        { color: palette.textSecondary, textAlign, writingDirection },
                      ]}
                    >
                      {t.themeSub}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.segmentGroup,
                    { backgroundColor: palette.segmentBg, flexDirection: rowDirection },
                  ]}
                >
                  {(
                    [
                      { key: 'dark', label: t.dark, icon: 'moon' },
                      { key: 'light', label: t.light, icon: 'sunny' },
                      { key: 'system', label: t.auto, icon: 'phone-portrait-outline' },
                    ] as const
                  ).map((item) => {
                    const active = themePreference === item.key;
                    return (
                      <TouchableOpacity
                        key={item.key}
                        style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setThemeMode(item.key);
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={item.icon}
                          size={14}
                          color={active ? '#FFFFFF' : palette.textMuted}
                        />
                        <Text
                          style={[
                            styles.segmentTxt,
                            { color: active ? '#FFFFFF' : palette.textSecondary },
                          ]}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.rowDivider, { backgroundColor: palette.divider }]} />

              {/* App Language Switcher (AR <-> EN) */}
              <View style={styles.themeSelectorRow}>
                <View style={[styles.themeHeaderRow, { flexDirection: rowDirection }]}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(0, 122, 255, 0.14)' }]}>
                    <Ionicons name="language-outline" size={20} color="#007AFF" />
                  </View>
                  <View style={styles.textStack}>
                    <Text
                      style={[
                        styles.rowTitle,
                        { color: palette.textPrimary, textAlign, writingDirection },
                      ]}
                    >
                      {t.langTitle}
                    </Text>
                    <Text
                      style={[
                        styles.rowSubtitle,
                        { color: palette.textSecondary, textAlign, writingDirection },
                      ]}
                    >
                      {t.langSub}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.segmentGroup,
                    { backgroundColor: palette.segmentBg, flexDirection: rowDirection },
                  ]}
                >
                  <TouchableOpacity
                    style={[styles.segmentBtn, language === 'ar' && styles.segmentBtnActive]}
                    onPress={() => handleLanguageChange('ar')}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.segmentTxt,
                        { color: language === 'ar' ? '#FFFFFF' : palette.textSecondary },
                      ]}
                    >
                      العربية
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.segmentBtn, language === 'en' && styles.segmentBtnActive]}
                    onPress={() => handleLanguageChange('en')}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.segmentTxt,
                        { color: language === 'en' ? '#FFFFFF' : palette.textSecondary },
                      ]}
                    >
                      English
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </LiquidGlassSurface>
          </View>

          {/* ── Section 3: System & Updates ── */}
          <View style={styles.groupWrapper}>
            <Text
              style={[
                styles.groupHeaderTitle,
                { color: palette.textSecondary, textAlign, writingDirection },
              ]}
            >
              {t.systemSection}
            </Text>
            <LiquidGlassSurface
              glassStyle="regular"
              isDark={isDark}
              isInteractive={false}
              borderRadius={24}
              style={[
                styles.groupCard,
                {
                  backgroundColor: palette.cardBg,
                  borderColor: palette.cardBorder,
                  borderTopColor: palette.cardTopBorder,
                },
              ]}
            >
              {/* Notifications */}
              <View style={[styles.insetRow, { flexDirection: rowDirection }]}>
                <View style={[styles.rowInfoGroup, { flexDirection: rowDirection }]}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.14)' }]}>
                    <Ionicons name="notifications-outline" size={20} color="#F59E0B" />
                  </View>
                  <View style={styles.textStack}>
                    <Text
                      style={[
                        styles.rowTitle,
                        { color: palette.textPrimary, textAlign, writingDirection },
                      ]}
                    >
                      {t.notifTitle}
                    </Text>
                    <Text
                      style={[
                        styles.rowSubtitle,
                        { color: palette.textSecondary, textAlign, writingDirection },
                      ]}
                    >
                      {notificationsEnabled ? t.notifOn : t.notifOff}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleNotificationsToggle}
                  trackColor={{ false: palette.switchOff, true: '#34C759' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={[styles.rowDivider, { backgroundColor: palette.divider }]} />

              {/* App Updates */}
              <TouchableOpacity
                style={[styles.insetRow, { flexDirection: rowDirection }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate('SoftwareUpdate');
                }}
                activeOpacity={0.75}
              >
                <View style={[styles.rowInfoGroup, { flexDirection: rowDirection }]}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(0, 122, 255, 0.14)' }]}>
                    <Ionicons name="cloud-download-outline" size={20} color="#007AFF" />
                  </View>
                  <View style={styles.textStack}>
                    <Text
                      style={[
                        styles.rowTitle,
                        { color: palette.textPrimary, textAlign, writingDirection },
                      ]}
                    >
                      {t.updatesTitle}
                    </Text>
                    <Text
                      style={[
                        styles.rowSubtitle,
                        { color: palette.textSecondary, textAlign, writingDirection },
                      ]}
                    >
                      {otaStatus === 'ready' || otaStatus === 'available'
                        ? t.updatesReady
                        : hasUpdate
                        ? t.updatesAvailable
                        : t.updatesCurrent}
                    </Text>
                  </View>
                </View>

                <View style={[styles.updateRowEnd, { flexDirection: rowDirection }]}>
                  {hasUpdate ? (
                    <View style={styles.updateBadgeAlert}>
                      <View style={styles.updateBadgeAlertDot} />
                      <Text style={styles.updateBadgeAlertText}>{t.updateBadge}</Text>
                    </View>
                  ) : isChecking ? (
                    <ActivityIndicator size="small" color="#007AFF" />
                  ) : (
                    <View style={styles.versionPill}>
                      <Text style={styles.versionPillText}>v{currentVersion}</Text>
                    </View>
                  )}
                  <Ionicons
                    name={isAr ? 'chevron-back' : 'chevron-forward'}
                    size={18}
                    color={palette.textMuted}
                  />
                </View>
              </TouchableOpacity>

              <View style={[styles.rowDivider, { backgroundColor: palette.divider }]} />

              {/* About A7 Music */}
              <TouchableOpacity
                style={[styles.insetRow, { flexDirection: rowDirection }]}
                onPress={handleAboutApp}
                activeOpacity={0.75}
              >
                <View style={[styles.rowInfoGroup, { flexDirection: rowDirection }]}>
                  <View style={[styles.rowIconWrap, { backgroundColor: 'rgba(168, 85, 247, 0.14)' }]}>
                    <Ionicons name="information-circle-outline" size={20} color="#A855F7" />
                  </View>
                  <View style={styles.textStack}>
                    <Text
                      style={[
                        styles.rowTitle,
                        { color: palette.textPrimary, textAlign, writingDirection },
                      ]}
                    >
                      {t.aboutTitle}
                    </Text>
                    <Text
                      style={[
                        styles.rowSubtitle,
                        { color: palette.textSecondary, textAlign, writingDirection },
                      ]}
                    >
                      {t.aboutSub}
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name={isAr ? 'chevron-back' : 'chevron-forward'}
                  size={18}
                  color={palette.textMuted}
                />
              </TouchableOpacity>
            </LiquidGlassSurface>
          </View>

          {/* ── Bottom Section: Sign Out (Only when logged in) ── */}
          {user && (
            <TouchableOpacity
              onPress={handleLogout}
              activeOpacity={0.82}
              style={styles.logoutOuter}
            >
              <LiquidGlassSurface
                glassStyle="regular"
                isDark={isDark}
                isInteractive
                tintColor="rgba(239, 68, 68, 0.16)"
                borderRadius={22}
                style={[
                  styles.logoutGlass,
                  {
                    borderColor: 'rgba(239, 68, 68, 0.35)',
                  },
                ]}
              >
                <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                <Text style={styles.logoutTxt}>{t.signOut}</Text>
              </LiquidGlassSurface>
            </TouchableOpacity>
          )}

          {/* ── Clean Footer ── */}
          <View style={styles.footerWrap}>
            <Text style={[styles.versionTxt, { color: palette.textMuted }]}>
              A7 Music v{currentVersion} • {APP_RELEASE_YEAR}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  groupWrapper: {
    marginBottom: 20,
  },
  groupHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  groupCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.16,
        shadowRadius: 20,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  insetRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  rowInfoGroup: {
    flex: 1,
    alignItems: 'center',
    gap: 12,
  },
  rowIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textStack: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  rowSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  storageBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  storageBadgeText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  actionLinkText: {
    fontSize: 13,
    fontWeight: '700',
  },
  themeSelectorRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  themeHeaderRow: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  segmentGroup: {
    borderRadius: 14,
    padding: 4,
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    height: 36,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#007AFF',
  },
  segmentTxt: {
    fontSize: 13,
    fontWeight: '700',
  },
  updateRowEnd: {
    alignItems: 'center',
    gap: 8,
  },
  updateBadgeAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 5,
  },
  updateBadgeAlertDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  updateBadgeAlertText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '700',
  },
  versionPill: {
    backgroundColor: 'rgba(0, 122, 255, 0.14)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  versionPillText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '700',
  },
  logoutOuter: {
    marginTop: 4,
    marginBottom: 18,
    borderRadius: 22,
    overflow: 'hidden',
  },
  logoutGlass: {
    height: 52,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  logoutTxt: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '700',
  },
  footerWrap: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  versionTxt: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default SettingsScreen;
