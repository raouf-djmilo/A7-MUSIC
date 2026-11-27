import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import { CoverFlowMusicCarousel } from '../features/home/components/CoverFlowMusicCarousel';
import { HomeAmbientCanvas } from '../features/home/components/HomeAmbientCanvas';
import { useHomeRadioQueue } from '../features/home/hooks/useHomeRadioQueue';
import { LiquidGlassSurface } from '../components/LiquidGlassSurface';
import { useNetworkStore } from '../services/networkService';
import { useDownloadStore } from '../services/downloadService';
import { useAudioStore } from '../store/useAudioStore';
import { useLanguageStore } from '../store/useLanguageStore';

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollContent: {
      paddingBottom: 20,
    },
    offlineHeroWrap: {
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    offlineHeroCard: {
      width: '100%',
      maxWidth: 360,
      borderRadius: 26,
      paddingHorizontal: 22,
      paddingVertical: 26,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.2)',
      overflow: 'hidden',
    },
    offlineHeroIconBox: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: 'rgba(10, 132, 255, 0.16)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    offlineHeroTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '800',
      textAlign: 'center',
      marginBottom: 6,
    },
    offlineHeroSub: {
      color: theme.textSecondary,
      fontSize: 13.5,
      lineHeight: 20,
      textAlign: 'center',
      marginBottom: 18,
    },
    offlineActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#0A84FF',
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 20,
    },
    offlineActionText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    offlineQuickPillWrap: {
      alignItems: 'center',
      marginTop: 14,
      paddingHorizontal: 20,
    },
    offlineQuickPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.2)',
      overflow: 'hidden',
    },
    offlineQuickText: {
      color: theme.textPrimary,
      fontSize: 12.5,
      fontWeight: '700',
    },
  });

export const DashboardScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const miniPlayerBottomGap = useMiniPlayerBottomGap();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const downloadedTracks = useDownloadStore((s) => s.downloadedTracks);
  const playTrack = useAudioStore((s) => s.playTrack);
  const isAr = useLanguageStore((s) => s.language) === 'ar';

  const {
    tracks,
    homeAmbientTrack,
    refreshing,
    onRefresh,
    handleActiveCardChange,
    handleSelectCarouselTrack,
    handleLoadMoreTracks,
  } = useHomeRadioQueue();

  const offlineQueue = useMemo(
    () =>
      downloadedTracks.map((d) => ({
        ...d,
        thumbnail: d.artworkLocalUri || d.thumbnail,
        audioUrl: d.audioLocalUri,
      })),
    [downloadedTracks]
  );

  const handleOpenDownloads = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate('LibraryTab');
  };

  const handlePlayOfflineAll = () => {
    if (offlineQueue.length === 0) {
      handleOpenDownloads();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    playTrack(offlineQueue[0], offlineQueue, 0, 'Downloads');
  };

  return (
    <View style={styles.container}>
      <HomeAmbientCanvas track={homeAmbientTrack} isDark={isDark} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            flexGrow: 1,
            justifyContent: 'center',
            paddingTop: insets.top + 8,
            paddingBottom: Math.max(miniPlayerBottomGap, 60),
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textPrimary}
          />
        }
      >
        {!isOnline && tracks.length === 0 ? (
          <View style={styles.offlineHeroWrap}>
            <LiquidGlassSurface
              glassStyle="regular"
              isDark={isDark}
              isInteractive={false}
              borderRadius={26}
              style={styles.offlineHeroCard}
            >
              <View style={styles.offlineHeroIconBox}>
                <Ionicons name="cloud-offline-outline" size={28} color="#0A84FF" />
              </View>
              <Text style={styles.offlineHeroTitle}>
                {isAr ? 'أنت في وضع الأوفلاين' : "You're Offline"}
              </Text>
              <Text style={styles.offlineHeroSub}>
                {isAr
                  ? 'لا توجد مقاطع محمّلة بعد. افتح المكتبة أو أعد الاتصال بالإنترنت لتشغيل الموسيقى.'
                  : 'No downloaded tracks yet. Visit Downloads or reconnect to stream music.'}
              </Text>
              <TouchableOpacity
                style={styles.offlineActionBtn}
                activeOpacity={0.85}
                onPress={handleOpenDownloads}
              >
                <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                <Text style={styles.offlineActionText}>
                  {isAr ? 'فتح التحميلات' : 'Open Downloads'}
                </Text>
              </TouchableOpacity>
            </LiquidGlassSurface>
          </View>
        ) : (
          <>
            <CoverFlowMusicCarousel
              tracks={tracks}
              onActiveCardChange={handleActiveCardChange}
              onTrackSelect={handleSelectCarouselTrack}
              onLoadMore={handleLoadMoreTracks}
            />

            {!isOnline && (
              <View style={styles.offlineQuickPillWrap}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handlePlayOfflineAll}
                >
                  <LiquidGlassSurface
                    glassStyle="regular"
                    isDark={isDark}
                    isInteractive
                    borderRadius={20}
                    style={styles.offlineQuickPill}
                  >
                    <Ionicons
                      name={offlineQueue.length > 0 ? 'play-circle' : 'cloud-offline-outline'}
                      size={16}
                      color="#0A84FF"
                    />
                    <Text style={styles.offlineQuickText}>
                      {offlineQueue.length > 0
                        ? isAr
                          ? `تشغيل المحمّل أوفلاين (${offlineQueue.length})`
                          : `Play Downloaded Offline (${offlineQueue.length})`
                        : isAr
                          ? 'وضع الأوفلاين • تصفح التحميلات'
                          : 'Offline Mode • Open Downloads'}
                    </Text>
                  </LiquidGlassSurface>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        <View style={{ height: miniPlayerBottomGap }} />
      </ScrollView>
    </View>
  );
};

export default DashboardScreen;
