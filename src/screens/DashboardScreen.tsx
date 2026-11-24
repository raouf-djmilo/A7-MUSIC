import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { useMiniPlayerBottomGap } from '../hooks/useMiniPlayerBottomGap';
import { CoverFlowMusicCarousel } from '../features/home/components/CoverFlowMusicCarousel';
import { HomeAmbientCanvas } from '../features/home/components/HomeAmbientCanvas';
import { useHomeRadioQueue } from '../features/home/hooks/useHomeRadioQueue';

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollContent: {
      paddingBottom: 20,
    },
  });

export const DashboardScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const miniPlayerBottomGap = useMiniPlayerBottomGap();

  const {
    tracks,
    homeAmbientTrack,
    refreshing,
    onRefresh,
    handleActiveCardChange,
    handleSelectCarouselTrack,
    handleLoadMoreTracks,
  } = useHomeRadioQueue();

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
        <CoverFlowMusicCarousel
          tracks={tracks}
          onActiveCardChange={handleActiveCardChange}
          onTrackSelect={handleSelectCarouselTrack}
          onLoadMore={handleLoadMoreTracks}
        />

        <View style={{ height: miniPlayerBottomGap }} />
      </ScrollView>
    </View>
  );
};

export default DashboardScreen;
