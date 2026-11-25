import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Track } from '../../../store/useAudioStore';
import { useTheme } from '../../../theme/ThemeContext';
import { createMusicThemedStyles, cleanTitleText } from '../styles/musicThemedStyles';
import { CachedArtwork } from '../components/CachedArtwork';
import { TrackPlayButton } from '../components/TrackPlayButton';
import { AudioBridgeEngine } from '../engines/audioBridge.engine';
import { getUniversalStudioArtworkSource } from '../../../utils/artworkHelper';
import { cleanArtistName } from '../../../services/youtubeMusicService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MULTI_CARD_WIDTH = Math.min(SCREEN_WIDTH - 48, 320);

interface PickedForYouSectionProps {
  track: Track | null;
  contextQueue: Track[];
}

export const PickedForYouSection: React.FC<PickedForYouSectionProps> = memo(
  ({ track, contextQueue }) => {
    const { theme, isDark } = useTheme();
    const styles = createMusicThemedStyles(theme, isDark);

    const carouselTracks = React.useMemo(() => {
      const base = [track, ...contextQueue].filter((t): t is Track => Boolean(t?.videoId));
      const seen = new Set<string>();
      const unique: Track[] = [];
      for (const item of base) {
        if (!seen.has(item.videoId)) {
          seen.add(item.videoId);
          unique.push(item);
        }
        if (unique.length >= 6) break;
      }
      return unique;
    }, [track, contextQueue]);

    if (carouselTracks.length === 0) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recommended for today</Text>
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={carouselTracks}
          keyExtractor={(item, idx) => `rec-today-${item.videoId}-${idx}`}
          contentContainerStyle={{ paddingLeft: 16, paddingRight: 12, gap: 12 }}
          snapToInterval={MULTI_CARD_WIDTH + 12}
          decelerationRate="fast"
          renderItem={({ item }) => {
            const artworkCascade = getUniversalStudioArtworkSource(
              item.thumbnail,
              item.title,
              item.artist,
              item.videoId
            );

            return (
              <TouchableOpacity
                style={[
                  styles.pickedBannerCard,
                  {
                    width: MULTI_CARD_WIDTH,
                    marginHorizontal: 0,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.85)',
                    overflow: 'hidden',
                  },
                ]}
                activeOpacity={0.88}
                onPress={() => AudioBridgeEngine.playSong(item, carouselTracks, 'picked_for_you')}
              >
                <LinearGradient
                  colors={
                    isDark
                      ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.02)', 'transparent']
                      : ['rgba(255,255,255,0.75)', 'rgba(255,255,255,0.15)', 'transparent']
                  }
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <CachedArtwork
                  source={artworkCascade}
                  uri={item.thumbnail}
                  style={styles.pickedArtwork}
                  borderRadius={12}
                  recyclingKey={item.videoId}
                />

                <View style={styles.pickedContent}>
                  <Text style={styles.pickedTitle} numberOfLines={1}>
                    {cleanTitleText(item.title)}
                  </Text>

                  <Text style={styles.pickedArtist} numberOfLines={1}>
                    {cleanArtistName(item.artist)}
                  </Text>

                  <View style={styles.pickedActionRow}>
                    <TrackPlayButton
                      videoId={item.videoId}
                      onPressAction={() => AudioBridgeEngine.playSong(item, carouselTracks, 'picked_for_you')}
                      size={34}
                      iconSize={16}
                      variant="frosted"
                    />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  },
  (prev, next) =>
    prev.track?.videoId === next.track?.videoId &&
    prev.contextQueue.length === next.contextQueue.length
);

export default PickedForYouSection;
