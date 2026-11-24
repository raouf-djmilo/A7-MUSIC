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
  getTrollStoreUrl,
  getRunningOtaLabel,
  useUpdateStore,
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
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  const currentVersion = getInstalledAppVersion();
  const currentBuildNumber = getInstalledBuildNumber();
  const runningOtaLabel = getRunningOtaLabel();

  const {
    updateInfo,
    isChecking,
    otaStatus,
    otaDetails,
    isDownloadingOta,
    otaError,
    checkUpdates,
    installOtaUpdate,
  } = useUpdateStore();

  const [initialLoading, setInitialLoading] = useState(!updateInfo);
  const [canUseTrollStore, setCanUseTrollStore] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      Linking.canOpenURL('apple-magnifier://')
        .then(setCanUseTrollStore)
        .catch(() => setCanUseTrollStore(false));
    }
  }, []);

  const runCheck = useCallback(
    async (force = false) => {
      try {
        await checkUpdates(force, false);
      } catch {
        ToastManager.show({
          title: 'تعذر الاتصال بخادم التحديثات',
          subtitle: 'تأكد من اتصال الإنترنت وحاول مجدداً.',
          icon: 'cloud-offline-outline',
        });
      } finally {
        setInitialLoading(false);
      }
    },
    [checkUpdates]
  );

  useEffect(() => {
    runCheck(false);
  }, [runCheck]);

  const handleManualCheck = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    runCheck(true);
  };

  const handleInstallOta = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await installOtaUpdate();
  };

  const handleTrollStoreInstall = async (ipaUrl: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const tsUrl = getTrollStoreUrl(ipaUrl);
    try {
      const canOpen = await Linking.canOpenURL(tsUrl);
      if (canOpen) {
        await Linking.openURL(tsUrl);
      } else {
        Alert.alert(
          'تثبيت نسخة IPA الرئيسية',
          'تطبيق TrollStore غير مثبت على هذا الجهاز. يمكنك تنزيل ملف الـ IPA مباشرة وتثبيته عبر AltStore أو Sideloadly.',
          [
            { text: 'إلغاء', style: 'cancel' },
            { text: 'تنزيل IPA', onPress: () => Linking.openURL(ipaUrl) },
          ]
        );
      }
    } catch {
      Linking.openURL(ipaUrl);
    }
  };

  const handleDownloadIpa = (ipaUrl: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(ipaUrl);
    ToastManager.show({
      title: 'بدء تنزيل ملف IPA',
      subtitle: 'يتم تنزيل حزمة A7-MUSIC.ipa عبر Safari',
      icon: 'download-outline',
    });
  };

  const handleCopyIpaLink = async (ipaUrl: string) => {
    await Clipboard.setStringAsync(ipaUrl);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    ToastManager.show({
      title: 'تم نسخ رابط IPA',
      subtitle: 'يمكنك لصقه مباشرة في AltStore أو Sideloadly',
      icon: 'copy-outline',
    });
  };

  const hasOtaUpdate =
    otaStatus === 'available' || otaStatus === 'downloading' || otaStatus === 'ready';
  const hasNativeUpdate = Boolean(updateInfo?.isNativeUpdateAvailable);
  const showUpdateScreen = hasOtaUpdate || hasNativeUpdate;
  const ipaAsset = updateInfo?.ipaAsset;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
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
            <Text style={styles.headerSubtitle}>iOS Fast OTA • GitHub Pages</Text>
          </View>

          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={handleManualCheck}
            disabled={initialLoading || isChecking || isDownloadingOta}
          >
            {isChecking ? (
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
          {initialLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>جاري البحث عن تحديثات سريعة...</Text>
              <Text style={styles.loadingSubtext}>الاتصال بخادم GitHub Pages OTA</Text>
            </View>
          ) : showUpdateScreen ? (
            <View style={styles.contentWrap}>
              {/* ── Tier 1: Instant In-App OTA JS Update (No Reinstall!) ── */}
              {hasOtaUpdate && (
                <GlassCard style={styles.otaHeroCard} borderRadius={22}>
                  <View style={styles.otaBadgeRow}>
                    <View style={styles.otaPill}>
                      <Ionicons name="flash" size={13} color="#FFF" />
                      <Text style={styles.otaPillText}>تحديث فوري مباشر (OTA)</Text>
                    </View>
                    <Text style={styles.otaSizeText}>
                      {otaDetails?.bundleSizeFormatted || '~2.5 MB'}
                    </Text>
                  </View>

                  <Text style={styles.otaTitle}>
                    {otaDetails?.title || 'تحديث سريع جديد متاح'}
                  </Text>
                  <Text style={styles.otaSubtitle}>
                    {otaDetails?.otaVersion || `v${currentVersion}`} •{' '}
                    {otaDetails?.publishedAtFormatted || 'الآن'}
                  </Text>

                  {otaDetails?.highlights && otaDetails.highlights.length > 0 && (
                    <View style={styles.highlightsList}>
                      {otaDetails.highlights.map((item, idx) => (
                        <View key={idx} style={styles.highlightRow}>
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color="#10B981"
                            style={{ marginTop: 2 }}
                          />
                          <Text style={styles.highlightText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {otaError ? (
                    <Text style={styles.errorText}>{otaError}</Text>
                  ) : null}

                  <TouchableOpacity
                    style={styles.primaryActionButton}
                    onPress={handleInstallOta}
                    disabled={isDownloadingOta}
                    activeOpacity={0.88}
                  >
                    <LinearGradient
                      colors={
                        otaStatus === 'ready'
                          ? ['#10B981', '#059669']
                          : ['#007AFF', '#0051B3']
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buttonGradient}
                    >
                      {isDownloadingOta ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Ionicons
                          name={otaStatus === 'ready' ? 'rocket' : 'cloud-download'}
                          size={20}
                          color="#FFF"
                        />
                      )}
                      <Text style={styles.primaryButtonText}>
                        {isDownloadingOta
                          ? 'جاري التنزيل والتجهيز...'
                          : otaStatus === 'ready'
                          ? 'إعادة التشغيل وتطبيق التحديث الآن'
                          : `تثبيت التحديث الآن (${otaDetails?.bundleSizeFormatted || '~2.5 MB'})`}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <View style={styles.instantNoteRow}>
                    <Ionicons name="shield-checkmark-outline" size={15} color="#10B981" />
                    <Text style={styles.instantNoteText}>
                      يتم التحديث داخل التطبيق خلال ثوانٍ بدون Safari أو AltStore أو إعادة تثبيت.
                    </Text>
                  </View>
                </GlassCard>
              )}

              {/* ── Tier 2: Native IPA Upgrade (Only shown when runtimeVersion changes) ── */}
              {hasNativeUpdate && updateInfo && (
                <GlassCard style={styles.nativeCard} borderRadius={22}>
                  <View style={styles.nativeTopRow}>
                    <View style={styles.nativeIconBadge}>
                      <Ionicons name="logo-apple" size={22} color="#007AFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nativeTitle}>
                        تحديث رئيسي للنظام: v{updateInfo.latestVersion}
                      </Text>
                      <Text style={styles.nativeSubtitle}>
                        نسختك الحالية v{currentVersion} • يتطلب تثبيت حزمة IPA الجديدة
                      </Text>
                    </View>
                    {ipaAsset && (
                      <View style={styles.sizePill}>
                        <Text style={styles.sizePillText}>{ipaAsset.sizeFormatted}</Text>
                      </View>
                    )}
                  </View>

                  {updateInfo.highlights.length > 0 && (
                    <View style={styles.highlightsList}>
                      {updateInfo.highlights.map((h, i) => (
                        <View key={i} style={styles.highlightRow}>
                          <Ionicons
                            name="sparkles"
                            size={15}
                            color="#007AFF"
                            style={{ marginTop: 2 }}
                          />
                          <Text style={styles.highlightText}>{h}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {ipaAsset ? (
                    <View style={styles.buttonStack}>
                      <TouchableOpacity
                        style={styles.primaryActionButton}
                        onPress={() =>
                          canUseTrollStore
                            ? handleTrollStoreInstall(ipaAsset.downloadUrl)
                            : handleDownloadIpa(ipaAsset.downloadUrl)
                        }
                        activeOpacity={0.85}
                      >
                        <LinearGradient
                          colors={['#007AFF', '#0051B3']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.buttonGradient}
                        >
                          <MaterialCommunityIcons
                            name={canUseTrollStore ? 'lightning-bolt' : 'download'}
                            size={20}
                            color="#FFF"
                          />
                          <Text style={styles.primaryButtonText}>
                            {canUseTrollStore
                              ? `تثبيت فوري عبر TrollStore (v${updateInfo.latestVersion})`
                              : `تنزيل ملف A7-MUSIC.ipa (v${updateInfo.latestVersion})`}
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.tertiaryLinkButton}
                        onPress={() => handleCopyIpaLink(ipaAsset.downloadUrl)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="copy-outline" size={15} color="#007AFF" />
                        <Text style={styles.tertiaryLinkText}>نسخ رابط IPA المباشر</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </GlassCard>
              )}
            </View>
          ) : (
            /* ── State B: Up to Date ── */
            <View style={styles.upToDateContainer}>
              <View style={styles.upToDateShieldCircle}>
                <Ionicons name="shield-checkmark" size={62} color="#10B981" />
              </View>

              <Text style={styles.upToDateTitle}>A7 MUSIC محدث لآخر إصدار</Text>
              <Text style={styles.upToDateVersionBadge}>
                v{currentVersion} (Build {currentBuildNumber})
              </Text>

              <Text style={styles.upToDateDescription}>
                أنت تستخدم أحدث إصدار من نظام الموسيقى. جميع التحديثات السريعة تصلك تلقائياً وفورياً عبر GitHub Pages OTA.
              </Text>

              <GlassCard style={styles.systemDetailsCard} borderRadius={20}>
                <View style={styles.systemRow}>
                  <Text style={styles.systemRowLabel}>المحرك</Text>
                  <Text style={styles.systemRowVal}>{APP_BUILD_NAME}</Text>
                </View>
                <View style={styles.systemDivider} />
                <View style={styles.systemRow}>
                  <Text style={styles.systemRowLabel}>التحديث السريع (OTA)</Text>
                  <Text style={styles.systemRowVal}>
                    {runningOtaLabel || 'النسخة الأساسية المدمجة'}
                  </Text>
                </View>
                <View style={styles.systemDivider} />
                <View style={styles.systemRow}>
                  <Text style={styles.systemRowLabel}>قناة التحديث</Text>
                  <View style={styles.statusLivePill}>
                    <View style={styles.statusLiveDot} />
                    <Text style={styles.statusLiveText}>GitHub Pages OTA</Text>
                  </View>
                </View>
              </GlassCard>

              <TouchableOpacity
                style={styles.checkAgainButton}
                onPress={handleManualCheck}
                disabled={isChecking}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={18} color="#007AFF" />
                <Text style={styles.checkAgainButtonText}>التحقق من وجود تحديثات الآن</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.githubFooterLink}
            onPress={() => Linking.openURL(GITHUB_RELEASES_PAGE_URL)}
            activeOpacity={0.7}
          >
            <Ionicons name="logo-github" size={18} color={theme.textMuted} />
            <Text style={styles.githubFooterText}>
              استعراض الإصدارات الكاملة على GitHub Releases
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    safeArea: { flex: 1 },
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
    headerTitleWrap: { alignItems: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
    headerSubtitle: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
    refreshBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.surfaceSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 18 },
    loadingContainer: { paddingVertical: 80, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 16, fontSize: 16, fontWeight: '600', color: theme.textPrimary },
    loadingSubtext: { marginTop: 6, fontSize: 13, color: theme.textMuted },
    contentWrap: { gap: 16 },
    otaHeroCard: {
      padding: 18,
      borderWidth: 1,
      borderColor: 'rgba(0, 122, 255, 0.35)',
    },
    otaBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    otaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#007AFF',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
    },
    otaPillText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
    otaSizeText: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
    otaTitle: { fontSize: 19, fontWeight: '800', color: theme.textPrimary, marginBottom: 4 },
    otaSubtitle: { fontSize: 13, color: theme.textSecondary, marginBottom: 14 },
    highlightsList: { gap: 8, marginBottom: 16 },
    highlightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    highlightText: { flex: 1, fontSize: 13, lineHeight: 19, color: theme.textSecondary },
    errorText: { fontSize: 12, color: '#EF4444', marginBottom: 10 },
    primaryActionButton: { borderRadius: 14, overflow: 'hidden' },
    buttonGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 8,
    },
    primaryButtonText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
    instantNoteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 12,
    },
    instantNoteText: { flex: 1, fontSize: 12, color: theme.textMuted, lineHeight: 17 },
    nativeCard: { padding: 16, borderWidth: 1, borderColor: theme.glassBorder },
    nativeTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    nativeIconBadge: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: 'rgba(0, 122, 255, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    nativeTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary },
    nativeSubtitle: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    sizePill: {
      backgroundColor: 'rgba(0, 122, 255, 0.12)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    sizePillText: { fontSize: 11, fontWeight: '600', color: '#007AFF' },
    buttonStack: { gap: 10 },
    tertiaryLinkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      gap: 6,
    },
    tertiaryLinkText: { fontSize: 13, fontWeight: '600', color: '#007AFF' },
    upToDateContainer: { alignItems: 'center', paddingVertical: 36 },
    upToDateShieldCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    upToDateTitle: { fontSize: 20, fontWeight: '800', color: theme.textPrimary, textAlign: 'center' },
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
      paddingHorizontal: 20,
    },
    systemDetailsCard: {
      width: '100%',
      marginTop: 24,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    systemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      gap: 10,
    },
    systemRowLabel: { fontSize: 13, color: theme.textMuted },
    systemRowVal: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textPrimary,
      flexShrink: 1,
      textAlign: 'right',
    },
    systemDivider: { height: 1, backgroundColor: theme.borderSubtle, marginVertical: 2 },
    statusLivePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
    },
    statusLiveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10B981' },
    statusLiveText: { fontSize: 12, fontWeight: '700', color: '#10B981' },
    checkAgainButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 22,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: 'rgba(0, 122, 255, 0.1)',
    },
    checkAgainButtonText: { fontSize: 14, fontWeight: '700', color: '#007AFF' },
    githubFooterLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 28,
      paddingVertical: 10,
    },
    githubFooterText: { fontSize: 13, color: theme.textMuted },
  });
