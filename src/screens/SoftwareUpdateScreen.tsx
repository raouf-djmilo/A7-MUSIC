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
  downloadApkWithProgress,
  launchApkInstall,
  getTrollStoreUrl,
  AppUpdateInfo,
} from '../services/updateService';
import { getInstalledAppVersion, APP_BUILD_NAME, GITHUB_RELEASES_PAGE_URL } from '../config/version';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';

export const SoftwareUpdateScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  const currentVersion = getInstalledAppVersion();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);

  // APK Download Progress state
  const [isDownloadingApk, setIsDownloadingApk] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0); // 0.0 -> 1.0
  const [downloadedMB, setDownloadedMB] = useState('0.0');
  const [totalMB, setTotalMB] = useState('0.0');
  const [downloadedApkUri, setDownloadedApkUri] = useState<string | null>(null);

  const fetchUpdate = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);

      const info = await checkForAppUpdate(forceRefresh);
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
  }, []);

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

  // In-app APK Downloader with Progress Bar
  const handleStartApkDownload = async (apkUrl: string) => {
    if (isDownloadingApk) return;

    if (downloadedApkUri) {
      // Already downloaded, launch installer
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await launchApkInstall(downloadedApkUri);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsDownloadingApk(true);
    setDownloadProgress(0);

    try {
      const localUri = await downloadApkWithProgress(apkUrl, (prog, written, total) => {
        setDownloadProgress(prog);
        setDownloadedMB(written);
        setTotalMB(total);
      });

      setDownloadedApkUri(localUri);
      setIsDownloadingApk(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      ToastManager.show({
        title: 'اكتمل تنزيل التحديث 🎉',
        subtitle: 'اضغط لفتح نافذة تثبيت التحديث على جهازك',
        icon: 'checkmark-circle-outline',
      });

      // Automatically prompt install
      await launchApkInstall(localUri);
    } catch (err: any) {
      setIsDownloadingApk(false);
      Alert.alert(
        'خطأ في التنزيل',
        'تعذر إكمال تنزيل التحديث. يمكنك تنزيل ملف الـ APK مباشرة عبر المتصفح.',
        [
          { text: 'إلغاء', style: 'cancel' },
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
              {/* Vibrant Hero Banner */}
              <LinearGradient
                colors={['rgba(252, 82, 0, 0.18)', 'rgba(0, 122, 255, 0.12)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroGradientCard}
              >
                <View style={styles.heroTopRow}>
                  <View style={styles.updateBadgeWrap}>
                    <Ionicons name="sparkles" size={14} color="#FC5200" />
                    <Text style={styles.updateBadgeText}>تحديث رئيسي متاح</Text>
                  </View>
                  <Text style={styles.releaseDateText}>
                    {updateInfo?.publishedAtFormatted || ''}
                  </Text>
                </View>

                <View style={styles.versionHeroRow}>
                  <View style={styles.versionIconCircle}>
                    <Ionicons name="arrow-up-circle" size={32} color="#007AFF" />
                  </View>
                  <View style={styles.versionTitleStack}>
                    <Text style={styles.newVersionTitle}>
                      A7 MUSIC v{updateInfo?.latestVersion}
                    </Text>
                    <Text style={styles.currentVsNewText}>
                      إصدارك الحالي: v{currentVersion} • جديد: v{updateInfo?.latestVersion}
                    </Text>
                  </View>
                </View>
              </LinearGradient>

              {/* What's New / Changelog Card */}
              <View style={styles.sectionHeaderWrap}>
                <Ionicons name="document-text-outline" size={18} color="#007AFF" />
                <Text style={styles.sectionHeaderTitle}>ما الجديد في هذا التحديث؟</Text>
              </View>

              <GlassCard style={styles.changelogCard} borderRadius={20}>
                <Text style={styles.changelogBody}>
                  {updateInfo?.releaseNotes}
                </Text>
              </GlassCard>

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
                الإصدار الحالي: v{currentVersion}
              </Text>
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
  });
