import React, { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Track, useAudioStore } from '../../../store/useAudioStore';
import { useTheme } from '../../../theme/ThemeContext';
import { createMusicThemedStyles, cleanTitleText } from '../styles/musicThemedStyles';
import { CachedArtwork } from '../components/CachedArtwork';
import { AudioBridgeEngine } from '../engines/audioBridge.engine';
import { getUniversalStudioArtworkSource } from '../../../utils/artworkHelper';

interface QuickGridSectionProps {
  tracks: Track[];
  likedSongsCount: number;
  userId?: string | null;
  onNavigateLibrary: () => void;
}

/**
 * ⚡ Playing Wave Indicator for Active Quick Tile (Zero array iteration)
 */
const QuickTilePlayingIndicator = memo(({ videoId }: { videoId: string }) => {
  const isPlaying = useAudioStore(
    (s) => s.isPlaying && s.currentTrack?.videoId === videoId
  );
  if (!isPlaying) return null;

  return (
    <View style={{ marginRight: 10 }}>
      <Ionicons name="volume-high" size={16} color="#0A84FF" />
    </View>
  );
});

export const QuickGridSection: React.FC<QuickGridSectionProps> = memo(
  ({ tracks, likedSongsCount, userId, onNavigateLibrary }) => {
    const { theme, isDark } = useTheme();
    const styles = createMusicThemedStyles(theme, isDark);
    const topTracks = tracks.slice(0, 5);

    return (
      <View style={styles.quickGrid}>
        {/* Slot 0: Liked Songs Card with Violet Gradient */}
        <TouchableOpacity
          style={[styles.quickTile, styles.likedSongsTile]}
          activeOpacity={0.82}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            AudioBridgeEngine.playLikedSongs(userId, tracks);
          }}
        >
          <LinearGradient
            colors={['#450af5', '#8e8ee5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.likedSongsArtwork}
          >
            <Ionicons name="heart" size={20} color="#FFF" />
          </LinearGradient>
          <View style={styles.quickTileInfo}>
            <Text style={styles.quickTileTitle} numberOfLines={1}>
              Liked Songs
            </Text>
            <Text style={styles.quickTileSubtitle} numberOfLines={1}>
              {likedSongsCount} {likedSongsCount === 1 ? 'song' : 'songs'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Slots 1 to 5: DNA Derived Quick Jump Tracks (Full Width Titles, Zero Button Clutter) */}
        {topTracks.map((item, index) => {
          const artworkCascade = getUniversalStudioArtworkSource(
            item.thumbnail,
            item.title,
            item.artist,
            item.videoId
          );

          return (
            <TouchableOpacity
              key={`quick-jump-${item.videoId || index}`}
              style={styles.quickTile}
              activeOpacity={0.82}
              onPress={() => AudioBridgeEngine.playSong(item, tracks, 'quick_jump')}
            >
              <CachedArtwork
                source={artworkCascade}
                uri={item.thumbnail}
                style={styles.quickTileImg}
                borderRadius={0}
                recyclingKey={item.videoId}
              />
              <View style={styles.quickTileInfo}>
                <Text style={styles.quickTileTitle} numberOfLines={2}>
                  {cleanTitleText(item.title)}
                </Text>
              </View>
              {item.videoId ? <QuickTilePlayingIndicator videoId={item.videoId} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  },
  (prev, next) =>
    prev.likedSongsCount === next.likedSongsCount &&
    prev.userId === next.userId &&
    prev.tracks.length === next.tracks.length &&
    (prev.tracks[0]?.videoId === next.tracks[0]?.videoId)
);

export default QuickGridSection;
