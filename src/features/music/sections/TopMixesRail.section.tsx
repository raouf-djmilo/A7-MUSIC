import React, { memo, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
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
    const navigation = useNavigation<any>();
    const { theme, isDark } = useTheme();
    const styles = createMusicThemedStyles(theme, isDark);

    const handleOpenMix = useCallback(
      (item: MoodCluster) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate('AlbumDetails', {
          albumTitle: item.title,
          artistName: item.subtitle,
          cover: item.artwork || '',
          type: 'playlist',
          album: {
            title: item.title,
            artist: item.subtitle,
            thumbnail: item.artwork || '',
            tracks: item.tracks || [],
          },
        });
      },
      [navigation]
    );

    const renderItem = useCallback(
      ({ item }: { item: MoodCluster }) => {
        const artworkCascade = getUniversalStudioArtworkSource(item.artwork, item.title);
        const mixContextId = item.title || item.id;
        const accentColor = item.badgeColor || '#9BF0B8';

        return (
          <TouchableOpacity
            style={styles.mixCardContainer}
            activeOpacity={0.86}
            onPress={() => handleOpenMix(item)}
          >
            <View
              style={[
                styles.mixArtworkWrap,
                localStyles.mixFrame,
                {
                  borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.85)',
                },
              ]}
            >
              <CachedArtwork
                source={artworkCascade}
                uri={item.artwork}
                style={styles.mixArtwork}
                borderRadius={12}
                recyclingKey={item.id}
              />

              {/* Top-left colored A7 badge (Spotify-style mix mark) */}
              <View style={[localStyles.topBadge, { backgroundColor: accentColor }]}>
                <Ionicons name="musical-notes" size={11} color="#0B0D12" />
              </View>

              {/* Floating Frosted Play Button */}
              <View style={localStyles.playBtnPos}>
                <TrackPlayButton
                  contextId={mixContextId}
                  onPressAction={() => AudioBridgeEngine.playMix(item)}
                  size={30}
                  iconSize={14}
                  variant="frosted"
                />
              </View>

              {/* Bottom Spotify-style colored stripe + pastel title bar */}
              <View style={localStyles.bottomBandWrap}>
                <View style={[localStyles.leftAccentBar, { backgroundColor: accentColor }]} />
                <View style={[localStyles.titlePill, { backgroundColor: accentColor }]}>
                  <Text style={localStyles.bandTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.mixSubtitle} numberOfLines={2}>
              {item.subtitle}
            </Text>
          </TouchableOpacity>
        );
      },
      [styles, isDark, handleOpenMix]
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

const localStyles = StyleSheet.create({
  mixFrame: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  topBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBtnPos: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  bottomBandWrap: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    height: 26,
  },
  leftAccentBar: {
    width: 5,
    height: '100%',
    marginRight: 4,
  },
  titlePill: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  bandTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0B0D12',
    letterSpacing: -0.3,
  },
});

export default TopMixesRailSection;
