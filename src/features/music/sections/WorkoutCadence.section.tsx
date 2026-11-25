import React, { memo, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Track } from '../../../store/useAudioStore';
import { useTheme } from '../../../theme/ThemeContext';
import { createMusicThemedStyles, cleanTitleText } from '../styles/musicThemedStyles';
import { CachedArtwork } from '../components/CachedArtwork';
import { TrackPlayButton } from '../components/TrackPlayButton';
import { AudioBridgeEngine } from '../engines/audioBridge.engine';
import { getUniversalStudioArtworkSource } from '../../../utils/artworkHelper';
import { cleanArtistName } from '../../../services/youtubeMusicService';

interface WorkoutCadenceSectionProps {
  tracks: Track[];
  onNavigateArtist?: (artistName: string, channelId?: string) => void;
}

export const WorkoutCadenceSection: React.FC<WorkoutCadenceSectionProps> = memo(
  ({ tracks, onNavigateArtist }) => {
    const { theme, isDark } = useTheme();
    const styles = createMusicThemedStyles(theme, isDark);

    const renderItem = useCallback(
      ({ item, index }: { item: Track; index: number }) => {
        const artworkCascade = getUniversalStudioArtworkSource(
          item.thumbnail,
          item.title,
          item.artist,
          item.videoId
        );

        return (
          <TouchableOpacity
            style={styles.trackCardContainer}
            activeOpacity={0.85}
            onPress={() => AudioBridgeEngine.playSong(item, tracks, 'workout_cadence')}
          >
            <View style={styles.trackCoverWrapper}>
              <CachedArtwork
                source={artworkCascade}
                uri={item.thumbnail}
                style={styles.trackCoverImg}
                borderRadius={10}
                recyclingKey={item.videoId}
              />

              <View style={styles.trackFloatingPlayBtn}>
                <TrackPlayButton
                  videoId={item.videoId}
                  onPressAction={() => AudioBridgeEngine.playSong(item, tracks, 'workout_cadence')}
                  size={32}
                  iconSize={15}
                  variant="frosted"
                />
              </View>
            </View>

            <Text style={styles.trackCardTitle} numberOfLines={1}>
              {cleanTitleText(item.title)}
            </Text>

            <TouchableOpacity
              style={styles.trackArtistRow}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              activeOpacity={0.7}
              onPress={() => onNavigateArtist?.(cleanArtistName(item.artist), item.channelId)}
            >
              <Text style={styles.trackArtist} numberOfLines={1}>
                {cleanArtistName(item.artist)}
              </Text>
              {item.isOfficial && (
                <Ionicons
                  name="checkmark-circle"
                  size={12}
                  color="#458eff"
                  style={{ marginLeft: 3 }}
                />
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        );
      },
      [styles, tracks, onNavigateArtist]
    );

    if (!tracks || tracks.length === 0) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recommended stations</Text>
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={tracks}
          keyExtractor={(item, idx) => `cadence-${item.videoId}-${idx}`}
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
  (prev, next) => prev.tracks === next.tracks
);

export default WorkoutCadenceSection;
