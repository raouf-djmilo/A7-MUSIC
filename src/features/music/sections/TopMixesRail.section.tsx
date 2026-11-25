import React, { memo, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MoodCluster } from '../../../services/musicDnaService';
import { useTheme } from '../../../theme/ThemeContext';
import { createMusicThemedStyles } from '../styles/musicThemedStyles';
import { CachedArtwork } from '../components/CachedArtwork';
import { TrackPlayButton } from '../components/TrackPlayButton';
import { AudioBridgeEngine } from '../engines/audioBridge.engine';
import { getUniversalStudioArtworkSource } from '../../../utils/artworkHelper';

interface TopMixesRailSectionProps {
  topMixes: MoodCluster[];
}

export const TopMixesRailSection: React.FC<TopMixesRailSectionProps> = memo(
  ({ topMixes }) => {
    const { theme, isDark } = useTheme();
    const styles = createMusicThemedStyles(theme, isDark);

    const renderItem = useCallback(
      ({ item }: { item: MoodCluster }) => {
        const artworkCascade = getUniversalStudioArtworkSource(item.artwork, item.title);
        const mixContextId = item.title || item.id;

        return (
          <TouchableOpacity
            style={styles.mixCardContainer}
            activeOpacity={0.85}
            onPress={() => AudioBridgeEngine.playMix(item)}
          >
            <View
              style={[
                styles.mixArtworkWrap,
                {
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.85)',
                },
              ]}
            >
              <CachedArtwork
                source={artworkCascade}
                uri={item.artwork}
                style={styles.mixArtwork}
                borderRadius={14}
                recyclingKey={item.id}
              />
              <LinearGradient
                colors={['rgba(255,255,255,0.20)', 'transparent']}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 0.55 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              {/* Minimal Frosted Glass Play Badge on Bottom-Right */}
              <View style={styles.mixFloatingPlayBtn}>
                <TrackPlayButton
                  contextId={mixContextId}
                  onPressAction={() => AudioBridgeEngine.playMix(item)}
                  size={34}
                  iconSize={16}
                  variant="frosted"
                />
              </View>
            </View>

            <Text style={styles.mixTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.mixSubtitle} numberOfLines={1}>
              {item.subtitle}
            </Text>
          </TouchableOpacity>
        );
      },
      [styles]
    );

    if (!topMixes || topMixes.length === 0) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your top mixes</Text>
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={topMixes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.cardsScroll}
          renderItem={renderItem}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={3}
          removeClippedSubviews={true}
        />
      </View>
    );
  },
  (prev, next) => prev.topMixes === next.topMixes
);

export default TopMixesRailSection;
