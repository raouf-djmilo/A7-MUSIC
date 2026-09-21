import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { GlassCard } from '../components/GlassCard';
import { ToastManager } from '../components/InAppToast';
import {
  checkForAppUpdate,
  launchApkInstall,
  getTrollStoreUrl,
  useUpdateStore,
  AppUpdateInfo,
  ReleaseInfo,
  UpdateUrgency,
} from '../services/updateService';
import {
  getInstalledAppVersion,
  getInstalledBuildNumber,
  APP_BUILD_NAME,
  GITHUB_RELEASES_PAGE_URL,
} from '../config/version';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';

export const SoftwareUpdateScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  const currentVersion = getInstalledAppVersion();
  const currentBuildNumber = getInstalledBuildNumber();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);

  // Background Download Engine from global Zustand store (Survives screen unmount)
  const {
    isDownloadingApk,
    downloadProgress,
    downloadedMB,
    totalMB,
    downloadedApkUri,
    startApkDownload,
    installDownloadedApk,
    checkUpdates,
  } = useUpdateStore();

  const [canUseTrollStore, setCanUseTrollStore] = useState(false);

  // Check if TrollStore URL scheme is supported on this device
  useEffect(() => {
    const checkTrollStoreSupport = async () => {
      if (Platform.OS === 'ios') {
        try {
          const supported = await Linking.canOpenURL('apple-magnifier://');
          setCanUseTrollStore(supported);
        } catch {
          setCanUseTrollStore(false);
        }
      }
    };
    checkTrollStoreSupport();
  }, []);

  const missedReleases = updateInfo?.missedReleases || [];
  const displayReleases: ReleaseInfo[] =
    missedReleases.length > 0
      ? missedReleases
      : updateInfo?.allReleases && updateInfo.allReleases.length > 0
      ? updateInfo.allReleases.slice(0, 5)
      : [
          {
            version: updateInfo?.latestVersion || currentVersion,
            date: updateInfo?.publishedAtFormatted || '',
            type: 'minor',
            title: updateInfo?.releaseTitle || 'تحديث رسمي جديد',
            highlights: [
              updateInfo?.releaseNotes || 'تحسينات عامة في الأداء واستقرار الصوت والسرعة.',
            ],
          },
        ];

  const fetchUpdate = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);

      const info = await checkUpdates(forceRefresh);
      setUpdateInfo(info);
    } catch (e) {
      ToastManager.show({
        title: 'تعذر الاتصال بالخادم',
        subtitle: 'يرجى التأكد من اتصال الإنترنت والمحاولة لاحقاً',
        icon: 'cloud-offline-outline',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [checkUpdates]);

  useEffect(() => {
    fetchUpdate(false);
  }, [fetchUpdate]);

  const handleManualCheck = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    fetchUpdate(true);
  };

  // TrollStore 1-Click Install
  const handleTrollStoreInstall = async (ipaUrl: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const tsUrl = getTrollStoreUrl(ipaUrl);

    try {
      const canOpen = await Linking.canOpenURL(tsUrl);
      if (canOpen) {
        await Linking.openURL(tsUrl);
      } else {
        // Fallback alert
        Alert.alert(
          'تطبيق TrollStore غير متوفر',
          'يبدو أن تطبيق TrollStore غير مثبت على هذا الجهاز. هل ترغب في تنزيل ملف الـ IPA مباشرة عبر المتصفح لتثبيته عبر AltStore أو Scarlet؟',
          [
            { text: 'إلغاء', style: 'cancel' },
            {
              text: 'تنزيل IPA',
              onPress: () => Linking.openURL(ipaUrl),
            },
          ]
        );
      }
    } catch {
      Linking.openURL(ipaUrl);
    }
  };

  // Direct IPA Download in Safari / Browser
  const handleDownloadIpa = (ipaUrl: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(ipaUrl);
    ToastManager.show({
      title: 'بدء تنزيل ملف IPA',
      subtitle: 'يتم الآن تنزيل A7-MUSIC.ipa عبر المتصفح',
      icon: 'download-outline',
    });
  };

  // Copy IPA Link to Clipboard
  const handleCopyIpaLink = async (ipaUrl: string) => {
    await Clipboard.setStringAsync(ipaUrl);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    ToastManager.show({
      title: 'تم نسخ رابط IPA بنجاح',
      subtitle: 'يمكنك لصقه في AltStore أو Scarlet أو Sideloadly',
      icon: 'copy-outline',
    });
  };

  // Copy APK Link to Clipboard
  const handleCopyApkLink = async (apkUrl: string) => {
    await Clipboard.setStringAsync(apkUrl);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    ToastManager.show({
      title: 'تم نسخ رابط APK بنجاح',
      subtitle: 'يمكنك مشاركة الرابط أو تنزيله عبر أي متصفح',
      icon: 'copy-outline',
    });
  };

  // In-app APK Downloader with Global Zustand Store & Background Resilience
  const handleStartApkDownload = async (apkUrl: string) => {
    if (isDownloadingApk) return;

    if (downloadedApkUri) {
      // Already downloaded, launch installer
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await installDownloadedApk();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const expectedSize = apkAsset?.size || 0;
      await startApkDownload(apkUrl, expectedSize);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      ToastManager.show({
        title: 'اكتمل تنزيل التحديث 🎉',
        subtitle: 'اضغط لفتح مثبت الحزم وتحديث التطبيق',
        icon: 'checkmark-circle-outline',
      });
    } catch (err: any) {
      const isIntegrityError = err?.message?.includes('غير مكتمل');
      Alert.alert(
        isIntegrityError ? 'تنبيه: حجم التحديث غير مكتمل' : 'خطأ في التنزيل',
        err?.message || 'تعذر إكمال تنزيل التحديث. يمكنك تنزيل ملف الـ APK مباشرة عبر المتصفح.',
        [
          { text: 'إلغاء', style: 'cancel' },
          {
            text: 'إعادة المحاولة',
            onPress: () => handleStartApkDownload(apkUrl),
          },
          {
            text: 'تنزيل عبر المتصفح',
            onPress: () => Linking.openURL(apkUrl),
          },
        ]
      );
    }
  };

  const isUpdate = updateInfo?.isUpdateAvailable;
  const ipaAsset = updateInfo?.ipaAsset;
  const apkAsset = updateInfo?.apkAsset;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Top Apple-Style Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.goBack();
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>تحديث التطبيق</Text>
            <Text style={styles.headerSubtitle}>Mise à jour logicielle</Text>
          </View>

          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={handleManualCheck}
            disabled={loading || refreshing}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Ionicons name="refresh" size={22} color={theme.textPrimary} />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: miniPlayerBottomGap + 40 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Loading Spinner */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>جاري البحث عن تحديثات...</Text>
              <Text style={styles.loadingSubtext}>الاتصال بـ GitHub Releases</Text>
            </View>
          ) : isUpdate ? (
            /* ═════════════════════════════════════════════════ */
            /* State A: New Update Available! (Vibrant Banner)    */
            /* ═════════════════════════════════════════════════ */
            <View style={styles.contentWrap}>
              {/* 1. Apple-Style Dual Capsule Version Diff Bar */}
              <View style={styles.dualCapsuleContainer}>
                <View style={styles.capsuleCurrent}>
                  <Text style={styles.capsuleLabel}>نسختك المثبتة</Text>
                  <View style={styles.capsuleVersionRow}>
                    <Ionicons name="phone-portrait-outline" size={14} color={theme.textMuted} />
                    <Text style={styles.capsuleVersionText}>v{currentVersion}</Text>
                  </View>
                </View>

                <View style={styles.capsuleArrowCircle}>
                  <Ionicons name="arrow-forward" size={16} color="#007AFF" />
                </View>

                <View style={styles.capsuleLatest}>
                  <Text style={[styles.capsuleLabel, { color: '#10B981' }]}>أحدث إصدار</Text>
                  <View style={styles.capsuleVersionRow}>
                    <Ionicons name="sparkles" size={14} color="#10B981" />
                    <Text style={[styles.capsuleVersionText, { color: '#10B981', fontWeight: '800' }]}>
                      v{updateInfo?.latestVersion}
                    </Text>
                  </View>
                </View>
              </View>

              {/* 2. Urgency & Cumulative Diff Summary Banner */}
              <View style={styles.diffSummaryBanner}>
                <View
                  style={[
                    styles.urgencyBadge,
                    updateInfo?.urgency === 'critical'
                      ? styles.urgencyCritical
                      : updateInfo?.urgency === 'recommended'
                      ? styles.urgencyRecommended
                      : styles.urgencyOptional,
                  ]}
                >
                  <Ionicons
                    name={
                      updateInfo?.urgency === 'critical'
                        ? 'alert-circle'
                        : updateInfo?.urgency === 'recommended'
                        ? 'star'
                        : 'information-circle'
                    }
                    size={13}
                    color="#FFF"
                  />
                  <Text style={styles.urgencyBadgeText}>
                    {updateInfo?.urgency === 'critical'
                      ? 'تحديث حرج / إجباري'
                      : updateInfo?.urgency === 'recommended'
                      ? 'تحديث موصى به'
                      : 'تحسينات وإصلاحات'}
                  </Text>
                </View>

                <Text style={styles.diffSummaryText}>
                  {updateInfo && updateInfo.missedUpdatesCount > 1
                    ? `يفصلك ${updateInfo.missedUpdatesCount} تحديثات جديدة تتضمن ميزات وتحسينات جوهرية`
                    : 'يتوفر تحديث جديد يتضمن تحسينات هامة في الصوت والسرعة'}
                </Text>
              </View>

              {/* 🛡️ iOS Critical Soft-Lock Prevention: Emergency Bypass Option */}
              {Platform.OS === 'ios' && updateInfo?.urgency === 'critical' && (
                <View style={styles.iosCriticalBypassCard}>
                  <View style={styles.iosCriticalBypassHeader}>
                    <Ionicons name="shield-checkmark" size={20} color="#FF9500" />
                    <Text style={styles.iosCriticalBypassTitle}>تحديث إجباري (نظام iOS)</Text>
                  </View>
                  <Text style={styles.iosCriticalBypassDesc}>
                    هذا التحديث يتضمن ترقيات وإصلاحات جوهرية. إذا لم يكن لديك TrollStore أو جهاز كمبيوتر لتثبيت ملف IPA عبر AltStore في الوقت الحالي، يمكنك مواصلة استخدام التطبيق وسنذكرك لاحقاً دون إغلاق التطبيق.
                  </Text>
                  <TouchableOpacity
                    style={styles.iosBypassBtn}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      ToastManager.show({
                        title: 'متابعة الاستخدام مؤقتاً',
                        subtitle: 'يمكنك تثبيت التحديث في أي وقت عبر الإعدادات',
                        icon: 'time-outline',
                      });
                      navigation.goBack();
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="arrow-back-outline" size={16} color={theme.textPrimary} />
                    <Text style={styles.iosBypassText}>متابعة الاستخدام مؤقتاً</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* 3. ⚡ Unified 1-Click Upgrade Hero Button */}
              {Platform.OS === 'android' ? (
                apkAsset && (
                  <TouchableOpacity
                    style={styles.unifiedUpgradeBtn}
                    onPress={() =>
                      downloadedApkUri
                        ? installDownloadedApk()
                        : handleStartApkDownload(apkAsset.downloadUrl)
                    }
                    disabled={isDownloadingApk}
                    activeOpacity={0.88}
                  >
                    <LinearGradient
                      colors={['#FC5200', '#FF3B30']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.unifiedUpgradeGradient}
                    >
                      <Ionicons
                        name={
                          downloadedApkUri
                            ? 'checkmark-circle'
                            : isDownloadingApk
                            ? 'hourglass-outline'
                            : 'arrow-down-circle'
                        }
                        size={22}
                        color="#FFF"
                      />
                      <Text style={styles.unifiedUpgradeText}>
                        {isDownloadingApk
                          ? `جاري التحميل... (${Math.round(downloadProgress * 100)}%)`
                          : downloadedApkUri
                          ? `مكتمل التنزيل - تثبيت v${updateInfo?.latestVersion} الآن`
                          : `تثبيت آخر إصدار v${updateInfo?.latestVersion} بنقرة واحدة`}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )
              ) : (
                ipaAsset && (
                  <TouchableOpacity
                    style={styles.unifiedUpgradeBtn}
                    onPress={() =>
                      canUseTrollStore
                        ? handleTrollStoreInstall(ipaAsset.downloadUrl)
                        : handleDownloadIpa(ipaAsset.downloadUrl)
                    }
                    activeOpacity={0.88}
                  >
                    <LinearGradient
                      colors={['#007AFF', '#0051B3']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.unifiedUpgradeGradient}
                    >
                      <Ionicons name={canUseTrollStore ? 'flash' : 'arrow-down-circle'} size={22} color="#FFF" />
                      <Text style={styles.unifiedUpgradeText}>
                        {canUseTrollStore
                          ? `تثبيت فوري عبر TrollStore (v${updateInfo?.latestVersion})`
                          : `تنزيل وتثبيت آخر إصدار v${updateInfo?.latestVersion} (IPA)`}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )
              )}

              {/* 4. Cumulative Changelog Timeline */}
              <View style={styles.sectionHeaderWrap}>
                <Ionicons name="git-commit-outline" size={18} color="#007AFF" />
                <Text style={styles.sectionHeaderTitle}>
                  سجل الميزات التراكمي ({displayReleases.length}{' '}
                  {displayReleases.length === 1 ? 'إصدار' : 'إصدارات متوفرة'})
                </Text>
              </View>

              <View style={styles.timelineContainer}>
                {displayReleases.map((rel, index) => {
                  const isLatest = index === 0;
                  const isLast = index === displayReleases.length - 1;
                  return (
                    <View key={rel.version} style={styles.timelineItem}>
                      {!isLast && <View style={styles.timelineLine} />}

                      <View
                        style={[
                          styles.timelineDot,
                          isLatest ? styles.timelineDotLatest : styles.timelineDotPrevious,
                        ]}
                      >
                        <View
                          style={[
                            styles.timelineDotInner,
                            isLatest ? styles.timelineDotInnerLatest : styles.timelineDotInnerPrevious,
                          ]}
                        />
                      </View>

                      <GlassCard style={styles.timelineCard} borderRadius={18}>
                        <View style={styles.timelineCardHeader}>
                          <View style={styles.versionTagRow}>
                            <Text style={styles.timelineVersionText}>v{rel.version}</Text>
                            <View
                              style={[
                                styles.releaseTypeBadge,
                                rel.type === 'major'
                                  ? styles.badgeMajor
                                  : rel.type === 'minor'
                                  ? styles.badgeMinor
                                  : styles.badgePatch,
                              ]}
                            >
                              <Text style={styles.releaseTypeBadgeText}>
                                {rel.type === 'major'
                                  ? 'رئيسي'
                                  : rel.type === 'minor'
                                  ? 'ميزات جديدة'
                                  : 'تحسينات'}
                              </Text>
                            </View>
                          </View>
                          {rel.date ? <Text style={styles.timelineDateText}>{rel.date}</Text> : null}
                        </View>

                        <Text style={styles.timelineTitleText}>{rel.title}</Text>

                        {rel.highlights && rel.highlights.length > 0 && (
                          <View style={styles.highlightsList}>
                            {rel.highlights.map((h, hIdx) => (
                              <View key={hIdx} style={styles.highlightRow}>
                                <Ionicons
                                  name="checkmark-circle"
                                  size={15}
                                  color="#10B981"
                                  style={styles.checkIcon}
                                />
                                <Text style={styles.highlightText}>{h}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </GlassCard>
                    </View>
                  );
                })}
              </View>

              {/* ═════════════════════════════════════════════════ */}
              {/* Section 1: Apple iOS IPA Package Hub               */}
              {/* ═════════════════════════════════════════════════ */}
              <View style={styles.sectionHeaderWrap}>
                <Ionicons name="logo-apple" size={18} color={theme.textPrimary} />
                <Text style={styles.sectionHeaderTitle}>حزمة أجهزة Apple (iOS IPA)</Text>
                {ipaAsset && (
                  <View style={styles.sizePill}>
                    <Text style={styles.sizePillText}>{ipaAsset.sizeFormatted}</Text>
                  </View>
                )}
              </View>

              <GlassCard style={styles.packageCard} borderRadius={22}>
                <View style={styles.packageCardTop}>
                  <View style={[styles.packageIconBadge, { backgroundColor: 'rgba(0, 122, 255, 0.12)' }]}>
                    <Ionicons name="cube-outline" size={24} color="#007AFF" />
                  </View>
                  <View style={styles.packageInfoStack}>
                    <Text style={styles.packageTitle}>A7-MUSIC.ipa</Text>
                    <Text style={styles.packageSubtitle}>
                      {ipaAsset ? `جاهز للتحميل (${ipaAsset.sizeFormatted})` : 'مرفوع على GitHub Releases'}
                    </Text>
                  </View>
                </View>

                {ipaAsset ? (
                  <View style={styles.buttonStack}>
                    {/* If TrollStore is supported/installed on iOS <= 17.0 */}
                    {canUseTrollStore ? (
                      <>
                        {/* TrollStore Direct Install Button */}
                        <TouchableOpacity
                          style={styles.primaryActionButton}
                          onPress={() => handleTrollStoreInstall(ipaAsset.downloadUrl)}
                          activeOpacity={0.85}
                        >
                          <LinearGradient
                            colors={['#007AFF', '#0051B3']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.buttonGradient}
                          >
                            <MaterialCommunityIcons name="lightning-bolt" size={20} color="#FFF" />
                            <Text style={styles.primaryButtonText}>تثبيت فوري عبر TrollStore</Text>
                          </LinearGradient>
                        </TouchableOpacity>

                        {/* Direct Safari Download */}
                        <TouchableOpacity
                          style={[styles.secondaryActionButton, { borderColor: theme.borderSubtle }]}
                          onPress={() => handleDownloadIpa(ipaAsset.downloadUrl)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="download-outline" size={18} color={theme.textPrimary} />
                          <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
                            تنزيل ملف الـ IPA في المتصفح
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        {/* Primary Safari Download for iOS 17.4+ and iOS 18 */}
                        <TouchableOpacity
                          style={styles.primaryActionButton}
                          onPress={() => handleDownloadIpa(ipaAsset.downloadUrl)}
                          activeOpacity={0.85}
                        >
                          <LinearGradient
                            colors={['#007AFF', '#0051B3']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.buttonGradient}
                          >
                            <Ionicons name="download-outline" size={20} color="#FFF" />
                            <Text style={styles.primaryButtonText}>تنزيل ملف الـ IPA في المتصفح</Text>
                          </LinearGradient>
                        </TouchableOpacity>

                        {/* Informative notice for iOS 17.4+ & iOS 18 */}
                        <View style={styles.iosNoticeBox}>
                          <Ionicons name="information-circle" size={16} color="#007AFF" />
                          <Text style={styles.iosNoticeText}>
                            لأجهزة iOS 17.4+ و iOS 18: ثبّت ملف الـ IPA عبر AltStore أو Scarlet أو Sideloadly.
                          </Text>
                        </View>
                      </>
                    )}

                    {/* Copy IPA Link */}
                    <TouchableOpacity
                      style={styles.tertiaryLinkButton}
                      onPress={() => handleCopyIpaLink(ipaAsset.downloadUrl)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="copy-outline" size={15} color="#007AFF" />
                      <Text style={styles.tertiaryLinkText}>نسخ رابط الـ IPA المباشر</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.primaryActionButton}
                    onPress={() => Linking.openURL(updateInfo?.htmlUrl || GITHUB_RELEASES_PAGE_URL)}
                  >
                    <View style={[styles.buttonGradient, { backgroundColor: '#007AFF' }]}>
                      <Text style={styles.primaryButtonText}>فتح صفحة التحميل على GitHub</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </GlassCard>

              {/* ═════════════════════════════════════════════════ */}
              {/* Section 2: Android APK Package Hub                 */}
              {/* ═════════════════════════════════════════════════ */}
              <View style={styles.sectionHeaderWrap}>
                <Ionicons name="logo-android" size={18} color="#10B981" />
                <Text style={styles.sectionHeaderTitle}>حزمة أجهزة Android (APK)</Text>
                {apkAsset && (
                  <View style={[styles.sizePill, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                    <Text style={[styles.sizePillText, { color: '#10B981' }]}>
                      {apkAsset.sizeFormatted}
                    </Text>
                  </View>
                )}
              </View>

              <GlassCard style={styles.packageCard} borderRadius={22}>
                <View style={styles.packageCardTop}>
                  <View style={[styles.packageIconBadge, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                    <Ionicons name="logo-android" size={24} color="#10B981" />
                  </View>
                  <View style={styles.packageInfoStack}>
                    <Text style={styles.packageTitle}>
                      {apkAsset?.name || 'A7-MUSIC.apk'}
                    </Text>
                    <Text style={styles.packageSubtitle}>
                      {apkAsset ? `حزمة الأندرويد الكاملة (${apkAsset.sizeFormatted})` : 'مرفوع على GitHub'}
                    </Text>
                  </View>
                </View>

                {apkAsset ? (
                  <View style={styles.buttonStack}>
                    {/* In-app download with Progress bar */}
                    {isDownloadingApk ? (
                      <View style={styles.progressContainer}>
                        <View style={styles.progressLabelRow}>
                          <Text style={styles.progressStatusText}>جاري تنزيل التحديث...</Text>
                          <Text style={styles.progressPercentText}>
                            {Math.round(downloadProgress * 100)}%
                          </Text>
                        </View>
                        {/* Progress Bar Track */}
                        <View style={styles.progressBarTrack}>
                          <View
                            style={[
                              styles.progressBarFill,
                              { width: `${Math.round(downloadProgress * 100)}%` },
                            ]}
                          />
                        </View>
                        <Text style={styles.progressBytesText}>
                          {downloadedMB} MB من أصل {totalMB} MB
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.primaryActionButton}
                        onPress={() => handleStartApkDownload(apkAsset.downloadUrl)}
                        activeOpacity={0.85}
                      >
                        <LinearGradient
                          colors={['#10B981', '#059669']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.buttonGradient}
                        >
                          <Ionicons
                            name={downloadedApkUri ? 'construct-outline' : 'cloud-download-outline'}
                            size={20}
                            color="#FFF"
                          />
                          <Text style={styles.primaryButtonText}>
                            {downloadedApkUri ? 'تثبيت التحديث الآن' : 'تنزيل وتثبيت APK مباشرة'}
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    )}

                    {/* Browser download fallback */}
                    <TouchableOpacity
                      style={[styles.secondaryActionButton, { borderColor: theme.borderSubtle }]}
                      onPress={() => Linking.openURL(apkAsset.downloadUrl)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="globe-outline" size={18} color={theme.textPrimary} />
                      <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
                        تنزيل ملف APK عبر المتصفح
                      </Text>
                    </TouchableOpacity>

                    {/* Copy APK Link */}
                    <TouchableOpacity
                      style={styles.tertiaryLinkButton}
                      onPress={() => handleCopyApkLink(apkAsset.downloadUrl)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="copy-outline" size={15} color="#10B981" />
                      <Text style={[styles.tertiaryLinkText, { color: '#10B981' }]}>
                        نسخ رابط الـ APK المباشر
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.primaryActionButton}
                    onPress={() => Linking.openURL(updateInfo?.htmlUrl || GITHUB_RELEASES_PAGE_URL)}
                  >
                    <View style={[styles.buttonGradient, { backgroundColor: '#10B981' }]}>
                      <Text style={styles.primaryButtonText}>فتح صفحة التحميل على GitHub</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </GlassCard>

              {/* Sideloading Guidance Notice */}
              <View style={styles.tipCard}>
                <Ionicons name="information-circle-outline" size={20} color="#007AFF" />
                <Text style={styles.tipText}>
                  💡 <Text style={{ fontWeight: '700' }}>ملاحظة التثبيت:</Text> بالنسبة لهواتف آيفون، يُمكن التثبيت الفوري بنقرة واحدة عبر TrollStore بدون كمبيوتر، أو عبر AltStore و Scarlet. بالنسبة لأندرويد، يُثبّت ملف الـ APK مباشرة.
                </Text>
              </View>
            </View>
          ) : (
            /* ═════════════════════════════════════════════════ */
            /* State B: Up to Date! (Apple Classic Checkmark)     */
            /* ═════════════════════════════════════════════════ */
            <View style={styles.upToDateContainer}>
              <View style={styles.upToDateShieldCircle}>
                <Ionicons name="shield-checkmark" size={64} color="#10B981" />
              </View>

              <Text style={styles.upToDateTitle}>A7 MUSIC محدث لآخر إصدار</Text>
              <Text style={styles.upToDateVersionBadge}>
                الإصدار المثبت: v{currentVersion} (Build {currentBuildNumber})
              </Text>

              <View style={styles.upToDateCapsuleRow}>
                <View style={styles.capsuleCurrent}>
                  <Text style={styles.capsuleLabel}>الإصدار الحالي</Text>
                  <Text style={styles.capsuleVersionText}>v{currentVersion}</Text>
                </View>
                <View style={[styles.capsuleArrowCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Ionicons name="checkmark" size={18} color="#10B981" />
                </View>
                <View style={styles.capsuleLatest}>
                  <Text style={[styles.capsuleLabel, { color: '#10B981' }]}>حالة النظام</Text>
                  <Text style={[styles.capsuleVersionText, { color: '#10B981', fontWeight: '800' }]}>
                    محدث بالكامل
                  </Text>
                </View>
              </View>

              <Text style={styles.upToDateDescription}>
                لديك أحدث الميزات وتحسينات الأداء واستقرار الصوت وقياس المسارات الرياضية.
              </Text>

              <GlassCard style={styles.systemDetailsCard} borderRadius={20}>
                <View style={styles.systemRow}>
                  <Text style={styles.systemRowLabel}>المحرك البرمجي</Text>
                  <Text style={styles.systemRowVal}>{APP_BUILD_NAME}</Text>
                </View>
                <View style={styles.systemDivider} />
                <View style={styles.systemRow}>
                  <Text style={styles.systemRowLabel}>بيئة التشغيل</Text>
                  <Text style={styles.systemRowVal}>
                    {Platform.OS === 'ios' ? 'Apple iOS (Metal Core)' : 'Google Android (Vulkan)'}
                  </Text>
                </View>
                <View style={styles.systemDivider} />
                <View style={styles.systemRow}>
                  <Text style={styles.systemRowLabel}>حالة النظام</Text>
                  <View style={styles.statusLivePill}>
                    <View style={styles.statusLiveDot} />
                    <Text style={styles.statusLiveText}>متصل ومستقر</Text>
                  </View>
                </View>
              </GlassCard>

              <TouchableOpacity
                style={styles.checkAgainButton}
                onPress={handleManualCheck}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={18} color="#007AFF" />
                <Text style={styles.checkAgainButtonText}>التحقق من وجود تحديثات الآن</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Direct Link to GitHub Releases */}
          <TouchableOpacity
            style={styles.githubFooterLink}
            onPress={() => Linking.openURL(GITHUB_RELEASES_PAGE_URL)}
            activeOpacity={0.7}
          >
            <Ionicons name="logo-github" size={18} color={theme.textMuted} />
            <Text style={styles.githubFooterText}>
              استعراض كافة الإصدارات على GitHub Releases
            </Text>
          </TouchableOpacity>
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
      height: 56,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.surfaceSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.textPrimary,
      textAlign: 'center',
    },
    headerSubtitle: {
      fontSize: 11,
      color: theme.textMuted,
      marginTop: 1,
    },
    refreshBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.surfaceSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    loadingContainer: {
      paddingVertical: 80,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      fontWeight: '600',
      color: theme.textPrimary,
    },
    loadingSubtext: {
      marginTop: 6,
      fontSize: 13,
      color: theme.textMuted,
    },
    contentWrap: {
      gap: 16,
    },
    heroGradientCard: {
      borderRadius: 22,
      padding: 18,
      borderWidth: 1,
      borderColor: 'rgba(252, 82, 0, 0.25)',
    },
    heroTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    updateBadgeWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(252, 82, 0, 0.15)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 5,
    },
    updateBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FC5200',
    },
    releaseDateText: {
      fontSize: 12,
      color: theme.textMuted,
    },
    versionHeroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    versionIconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: 'rgba(0, 122, 255, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    versionTitleStack: {
      flex: 1,
    },
    newVersionTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: theme.textPrimary,
    },
    currentVsNewText: {
      fontSize: 13,
      color: theme.textSecondary,
      marginTop: 3,
    },
    sectionHeaderWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
      marginBottom: 4,
    },
    sectionHeaderTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.textPrimary,
      flex: 1,
    },
    sizePill: {
      backgroundColor: 'rgba(0, 122, 255, 0.12)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    sizePillText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#007AFF',
    },
    changelogCard: {
      padding: 16,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    changelogBody: {
      fontSize: 14,
      lineHeight: 22,
      color: theme.textSecondary,
    },
    packageCard: {
      padding: 16,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    packageCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    packageIconBadge: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    packageInfoStack: {
      flex: 1,
    },
    packageTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.textPrimary,
    },
    packageSubtitle: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2,
    },
    buttonStack: {
      gap: 10,
    },
    primaryActionButton: {
      borderRadius: 14,
      overflow: 'hidden',
    },
    buttonGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 8,
    },
    primaryButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#FFF',
    },
    secondaryActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: theme.surfaceSubtle,
      gap: 8,
    },
    secondaryButtonText: {
      fontSize: 14,
      fontWeight: '600',
    },
    tertiaryLinkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      gap: 6,
    },
    tertiaryLinkText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#007AFF',
    },
    progressContainer: {
      paddingVertical: 8,
    },
    progressLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    progressStatusText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textPrimary,
    },
    progressPercentText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#10B981',
    },
    progressBarTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.surfaceSubtle,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: '#10B981',
      borderRadius: 4,
    },
    progressBytesText: {
      fontSize: 11,
      color: theme.textMuted,
      marginTop: 6,
      textAlign: 'center',
    },
    tipCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: 'rgba(0, 122, 255, 0.08)',
      padding: 14,
      borderRadius: 16,
      gap: 10,
      marginTop: 4,
    },
    iosNoticeBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 122, 255, 0.08)',
      padding: 10,
      borderRadius: 12,
      gap: 8,
    },
    iosNoticeText: {
      flex: 1,
      fontSize: 12,
      color: theme.textSecondary,
      lineHeight: 16,
    },
    tipText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 18,
      color: theme.textSecondary,
    },
    upToDateContainer: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    upToDateShieldCircle: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    upToDateTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: theme.textPrimary,
      textAlign: 'center',
    },
    upToDateVersionBadge: {
      fontSize: 14,
      fontWeight: '600',
      color: '#10B981',
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      marginTop: 8,
      overflow: 'hidden',
    },
    upToDateDescription: {
      fontSize: 13,
      lineHeight: 20,
      color: theme.textSecondary,
      textAlign: 'center',
      marginTop: 12,
      paddingHorizontal: 24,
    },
    systemDetailsCard: {
      width: '100%',
      marginTop: 28,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    systemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
    },
    systemRowLabel: {
      fontSize: 13,
      color: theme.textMuted,
    },
    systemRowVal: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textPrimary,
    },
    systemDivider: {
      height: 1,
      backgroundColor: theme.borderSubtle,
      marginVertical: 4,
    },
    statusLivePill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      gap: 6,
    },
    statusLiveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#10B981',
    },
    statusLiveText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#10B981',
    },
    checkAgainButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceSubtle,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 16,
      marginTop: 24,
      gap: 8,
    },
    checkAgainButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#007AFF',
    },
    githubFooterLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      marginTop: 12,
      gap: 8,
    },
    githubFooterText: {
      fontSize: 12,
      color: theme.textMuted,
      textDecorationLine: 'underline',
    },
    /* Dual Capsule Styles */
    dualCapsuleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surfaceSubtle,
      borderRadius: 18,
      padding: 10,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
      gap: 8,
    },
    capsuleCurrent: {
      flex: 1,
      backgroundColor: theme.surface,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
    },
    capsuleArrowCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0, 122, 255, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    capsuleLatest: {
      flex: 1,
      backgroundColor: 'rgba(16, 185, 129, 0.08)',
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: 'rgba(16, 185, 129, 0.25)',
    },
    capsuleLabel: {
      fontSize: 11,
      color: theme.textMuted,
      marginBottom: 3,
    },
    capsuleVersionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    capsuleVersionText: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.textPrimary,
    },
    /* Urgency & Diff Summary Banner */
    diffSummaryBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surfaceSubtle,
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
      gap: 10,
    },
    urgencyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      gap: 5,
    },
    urgencyCritical: {
      backgroundColor: '#EF4444',
    },
    urgencyRecommended: {
      backgroundColor: '#FC5200',
    },
    urgencyOptional: {
      backgroundColor: '#007AFF',
    },
    urgencyBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFF',
    },
    diffSummaryText: {
      flex: 1,
      fontSize: 12,
      color: theme.textSecondary,
      lineHeight: 18,
    },
    /* iOS Critical Soft-Lock Bypass Card */
    iosCriticalBypassCard: {
      backgroundColor: 'rgba(255, 149, 0, 0.10)',
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: 'rgba(255, 149, 0, 0.35)',
      gap: 10,
    },
    iosCriticalBypassHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    iosCriticalBypassTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FF9500',
    },
    iosCriticalBypassDesc: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.textSecondary,
    },
    iosBypassBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.surfaceSubtle,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
      marginTop: 4,
    },
    iosBypassText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textPrimary,
    },
    /* Unified Upgrade Button */
    unifiedUpgradeBtn: {
      borderRadius: 16,
      overflow: 'hidden',
      shadowColor: '#FC5200',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 4,
    },
    unifiedUpgradeGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      paddingHorizontal: 20,
      gap: 10,
    },
    unifiedUpgradeText: {
      fontSize: 15,
      fontWeight: '800',
      color: '#FFF',
    },
    /* Cumulative Changelog Timeline */
    timelineContainer: {
      paddingLeft: 8,
      paddingRight: 2,
      marginTop: 6,
    },
    timelineItem: {
      position: 'relative',
      paddingBottom: 20,
      paddingLeft: 24,
    },
    timelineLine: {
      position: 'absolute',
      left: 7,
      top: 18,
      bottom: 0,
      width: 2,
      backgroundColor: theme.borderSubtle,
    },
    timelineDot: {
      position: 'absolute',
      left: 0,
      top: 4,
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    timelineDotLatest: {
      backgroundColor: 'rgba(0, 122, 255, 0.25)',
      borderWidth: 2,
      borderColor: '#007AFF',
    },
    timelineDotPrevious: {
      backgroundColor: theme.surfaceSubtle,
      borderWidth: 2,
      borderColor: theme.textMuted,
    },
    timelineDotInner: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    timelineDotInnerLatest: {
      backgroundColor: '#007AFF',
    },
    timelineDotInnerPrevious: {
      backgroundColor: theme.textMuted,
    },
    timelineCard: {
      padding: 16,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    timelineCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    versionTagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    timelineVersionText: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.textPrimary,
    },
    releaseTypeBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
    },
    badgeMajor: {
      backgroundColor: 'rgba(239, 68, 68, 0.15)',
    },
    badgeMinor: {
      backgroundColor: 'rgba(252, 82, 0, 0.15)',
    },
    badgePatch: {
      backgroundColor: 'rgba(0, 122, 255, 0.15)',
    },
    releaseTypeBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.textPrimary,
    },
    timelineDateText: {
      fontSize: 11,
      color: theme.textMuted,
    },
    timelineTitleText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.textPrimary,
      marginBottom: 10,
      lineHeight: 20,
    },
    highlightsList: {
      gap: 8,
    },
    highlightRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    checkIcon: {
      marginTop: 2,
    },
    highlightText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      color: theme.textSecondary,
    },
    upToDateCapsuleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      marginTop: 16,
      marginBottom: 6,
      width: '100%',
    },
  });
