import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ArtistRadioItem } from '../../../services/musicDnaService';

interface SpotifyRadioCoverCardProps {
  radio: ArtistRadioItem;
  onPress: (radio: ArtistRadioItem) => void;
}

const CARD_SIZE = 154;

/**
 * High-speed, clean Spotify-style generated Artist Radio cover:
 * - Dynamic pastel background per artist
 * - Top-left A7 Flow mark + Top-right RADIO label
 * - 3 overlapping circular artworks from the artist's top tracks
 * - Bold Artist Name at bottom-left
 */
export const SpotifyRadioCoverCard: React.FC<SpotifyRadioCoverCardProps> = memo(
  ({ radio, onPress }) => {
    const centerImg = radio.topArtworks[0] || '';
    const leftImg = radio.topArtworks[1] || centerImg;
    const rightImg = radio.topArtworks[2] || leftImg;

    return (
      <TouchableOpacity
        style={styles.cardWrap}
        activeOpacity={0.86}
        onPress={() => onPress(radio)}
      >
        <View style={[styles.squareArt, { backgroundColor: radio.bgColor }]}>
          {/* Subtle top specular glossy sheen */}
          <LinearGradient
            colors={['rgba(255,255,255,0.28)', 'transparent']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 0.6 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Top Bar: A7 Flow Mark + RADIO */}
          <View style={styles.topRow}>
            <View style={styles.brandMark}>
              <Ionicons name="musical-notes" size={11} color="#0B0D12" />
              <Text style={styles.brandText}>A7</Text>
            </View>
            <Text style={styles.radioLabel}>RADIO</Text>
          </View>

          {/* Center: 3 Overlapping Circular Track Artworks */}
          <View style={styles.circlesStage}>
            {leftImg ? (
              <Image
                source={{ uri: leftImg }}
                style={[styles.sideCircle, styles.leftCircle]}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.sideCircle, styles.leftCircle, styles.placeholderCircle]} />
            )}

            {rightImg ? (
              <Image
                source={{ uri: rightImg }}
                style={[styles.sideCircle, styles.rightCircle]}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.sideCircle, styles.rightCircle, styles.placeholderCircle]} />
            )}

            {centerImg ? (
              <Image
                source={{ uri: centerImg }}
                style={[styles.centerCircle, { borderColor: radio.bgColor }]}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View
                style={[
                  styles.centerCircle,
                  styles.placeholderCircle,
                  { borderColor: radio.bgColor },
                ]}
              />
            )}
          </View>

          {/* Bottom-Left: Bold Artist Name */}
          <Text style={styles.artistName} numberOfLines={1}>
            {radio.artistName}
          </Text>
        </View>
      </TouchableOpacity>
    );
  },
  (prev, next) => prev.radio.id === next.radio.id
);

const styles = StyleSheet.create({
  cardWrap: {
    width: CARD_SIZE,
  },
  squareArt: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 10,
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandMark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  brandText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0B0D12',
    letterSpacing: -0.3,
  },
  radioLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0B0D12',
    letterSpacing: 1.6,
  },
  circlesStage: {
    height: 76,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  sideCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    position: 'absolute',
  },
  leftCircle: {
    left: 6,
    zIndex: 1,
  },
  rightCircle: {
    right: 6,
    zIndex: 1,
  },
  centerCircle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 2,
    zIndex: 2,
  },
  placeholderCircle: {
    backgroundColor: 'rgba(11, 13, 18, 0.16)',
  },
  artistName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0B0D12',
    letterSpacing: -0.4,
  },
});

export default SpotifyRadioCoverCard;
