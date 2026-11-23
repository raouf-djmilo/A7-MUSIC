import React, { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Track } from '../../../store/useAudioStore';
import { useTheme } from '../../../theme/ThemeContext';
import { createMusicThemedStyles, cleanTitleText } from '../styles/musicThemedStyles';
import { CachedArtwork } from '../components/CachedArtwork';
import { TrackPlayButton } from '../components/TrackPlayButton';
import { AudioBridgeEngine } from '../engines/audioBridge.engine';
import { getUniversalStudioArtworkSource } from '../../../utils/artworkHelper';
import { cleanArtistName } from '../../../services/youtubeMusicService';

interface PickedForYouSectionProps {
  track: Track | null;
  contextQueue: Track[];
}

export const PickedForYouSection: React.FC<PickedForYouSectionProps> = memo(
  ({ track, contextQueue }) => {
    const { theme, isDark } = useTheme();
    const styles = createMusicThemedStyles(theme, isDark);

    if (!track) return null;

    const artworkCascade = getUniversalStudioArtworkSource(
      track.thumbnail,
      track.title,
      track.artist,
      track.videoId
    );

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Picked for you</Text>
        </View>

        <TouchableOpacity
          style={styles.pickedBannerCard}
          activeOpacity={0.88}
          onPress={() => AudioBridgeEngine.playSong(track, contextQueue, 'picked_for_you')}
        >
          <CachedArtwork
            source={artworkCascade}
            uri={track.thumbnail}
            style={styles.pickedArtwork}
            borderRadius={10}
            recyclingKey={track.videoId}
          />

          <View style={styles.pickedContent}>
            <Text style={styles.pickedTitle} numberOfLines={1}>
              {cleanTitleText(track.title)}
            </Text>

            <Text style={styles.pickedArtist} numberOfLines={1}>
              {cleanArtistName(track.artist)}
            </Text>

            <View style={styles.pickedActionRow}>
              <TrackPlayButton
                videoId={track.videoId}
                onPressAction={() => AudioBridgeEngine.playSong(track, contextQueue, 'picked_for_you')}
                size={34}
                iconSize={16}
                variant="frosted"
              />
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  },
  (prev, next) => prev.track?.videoId === next.track?.videoId
);

export default PickedForYouSection;
