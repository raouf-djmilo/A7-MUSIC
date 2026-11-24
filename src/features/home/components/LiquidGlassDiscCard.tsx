import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../../theme/ThemeContext';
import { APPLE_LIQUID_COLORS } from '../../../theme/AppleLiquidTokens';
import { LiquidGlassSurface } from '../../../components/LiquidGlassSurface';
import { getUniversalStudioArtworkSource } from '../../../utils/artworkHelper';
import { cleanArtistName } from '../../../services/youtubeMusicService';
import type { LiquidGlassDiscCardProps } from '../types/home.types';
import { cleanCardText } from '../utils/homeTrackUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Larger hero card proportions matching Apple Music + Apple Liquid Glass aesthetics
export const HERO_CARD_WIDTH = Math.min(Math.round(SCREEN_WIDTH * 0.64), 268);
export const HERO_CARD_HEIGHT = Math.round(HERO_CARD_WIDTH * 1.26);
export const HERO_CARD_SPACING = Math.round(HERO_CARD_WIDTH * 0.56);

const CARD_PADDING = 11;
const ARTWORK_SIZE = HERO_CARD_WIDTH - CARD_PADDING * 2;
const CARD_RADIUS = 28;
const ARTWORK_RADIUS = 20;

/**
 * Apple Liquid Glass glossy disc card for the Home Screen 3D arc carousel.
 * Shares the translucent refractive design language of AppleLiquidGlassTabBar & MusicTab.
 */
export const LiquidGlassDiscCard: React.FC<LiquidGlassDiscCardProps> = React.memo(({
  track,
  cardVirtualPos,
  virtualIndex,
  onPress,
  isCenter,
  isPlayingThisTrack,
}) => {
  const { theme, isDark } = useTheme();
  const liquidColors = isDark ? APPLE_LIQUID_COLORS.dark : APPLE_LIQUID_COLORS.light;

  const artworkSources = useMemo(
    () => getUniversalStudioArtworkSource(track?.thumbnail, track?.title, track?.artist, track?.videoId),
    [track?.thumbnail, track?.title, track?.artist, track?.videoId]
  );

  const animatedStyle = useAnimatedStyle(() => {
    const p = cardVirtualPos - virtualIndex.value;

    const scale = interpolate(
      p,
      [-2.5, -2, -1, 0, 1, 2, 2.5],
      [0.64, 0.72, 0.84, 1.0, 0.84, 0.72, 0.64],
      'clamp'
    );

    const translateX = interpolate(
      p,
      [-2.5, -2, -1, 0, 1, 2, 2.5],
      [-HERO_CARD_SPACING * 2.05, -HERO_CARD_SPACING * 1.82, -HERO_CARD_SPACING, 0, HERO_CARD_SPACING, HERO_CARD_SPACING * 1.82, HERO_CARD_SPACING * 2.05],
      'clamp'
    );

    const translateY = interpolate(
      Math.abs(p),
      [0, 1, 2, 2.5],
      [0, 10, 22, 26],
      'clamp'
    );

    const rotateYDeg = interpolate(
      p,
      [-2.5, -2, -1, 0, 1, 2, 2.5],
      [28, 22, 14, 0, -14, -22, -28],
      'clamp'
    );

    const opacity = interpolate(
      p,
      [-3, -2.35, -2, -1, 0, 1, 2, 2.35, 3],
      [0, 0.30, 0.60, 0.86, 1.0, 0.86, 0.60, 0.30, 0],
      'clamp'
    );

    const zIndex = Math.round(
      interpolate(
        Math.abs(p),
        [0, 0.55, 1, 1.6, 2, 3],
        [10, 8, 5, 3, 2, 0],
        'clamp'
      )
    );

    return {
      transform: [
        { perspective: 950 },
        { translateX },
        { translateY },
        { scale },
        { rotateY: `${rotateYDeg}deg` },
      ],
      opacity,
      zIndex,
    };
  });

  const outerBorderColor = isCenter
    ? (isPlayingThisTrack
        ? (isDark ? 'rgba(90, 200, 250, 0.52)' : 'rgba(0, 122, 255, 0.40)')
        : (isDark ? 'rgba(255, 255, 255, 0.34)' : 'rgba(0, 0, 0, 0.12)'))
    : liquidColors.barBorder;

  const topSpecularRim = isCenter
    ? (isDark ? 'rgba(255, 255, 255, 0.48)' : 'rgba(255, 255, 255, 0.96)')
    : liquidColors.barBorderTop;

  return (
    <Animated.View style={[styles.cardAbsoluteWrap, animatedStyle]}>
      <TouchableOpacity
        activeOpacity={0.93}
        onPress={onPress}
        style={[
          styles.cardShadowWrap,
          {
            shadowOpacity: isCenter ? (isDark ? 0.48 : 0.16) : (isDark ? 0.24 : 0.08),
            shadowRadius: isCenter ? 22 : 12,
          },
        ]}
      >
        <LiquidGlassSurface
          glassStyle="regular"
          isInteractive={isCenter}
          isDark={isDark}
          borderRadius={CARD_RADIUS}
          style={[
            styles.glassShell,
            {
              borderColor: outerBorderColor,
              borderTopColor: topSpecularRim,
            },
          ]}
        >
          {/* Glossy Apple diagonal top sheen */}
          <LinearGradient
            colors={
              isDark
                ? ['rgba(255, 255, 255, 0.22)', 'rgba(255, 255, 255, 0.04)', 'transparent']
                : ['rgba(255, 255, 255, 0.85)', 'rgba(255, 255, 255, 0.22)', 'transparent']
            }
            locations={[0, 0.35, 0.72]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 0.85 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Framed HD Artwork Stage */}
          <View
            style={[
              styles.artworkFrame,
              {
                borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.75)',
              },
            ]}
          >
            <Image
              source={artworkSources}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              blurRadius={Platform.OS === 'ios' ? 18 : 12}
              priority="low"
              cachePolicy="memory-disk"
            />
            <Image
              source={artworkSources}
              style={styles.artworkImage}
              contentFit="cover"
              priority={isCenter ? 'high' : 'normal'}
              cachePolicy="memory-disk"
              transition={180}
            />
            <LinearGradient
              colors={['rgba(255,255,255,0.12)', 'transparent', 'rgba(0,0,0,0.22)']}
              locations={[0, 0.3, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Compact frosted status badge when this card is actively playing */}
            {isPlayingThisTrack && (
              <View style={styles.nowPlayingPillWrap} pointerEvents="none">
                <BlurView
                  intensity={Platform.OS === 'ios' ? 45 : 30}
                  tint="dark"
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.nowPlayingDot} />
                <Ionicons name="musical-notes" size={11} color="#FFFFFF" />
              </View>
            )}
          </View>

          {/* Translucent Glass Metadata Footer (inherits true frosted LiquidGlassSurface) */}
          <View style={styles.cardFooter}>
            <Text
              style={[styles.cardTitle, { color: theme.textPrimary }]}
              numberOfLines={1}
            >
              {cleanCardText(track?.title) || 'Untitled'}
            </Text>
            <Text
              style={[styles.cardArtist, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {cleanArtistName(track?.artist)}
            </Text>
          </View>
        </LiquidGlassSurface>
      </TouchableOpacity>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  cardAbsoluteWrap: {
    position: 'absolute',
    width: HERO_CARD_WIDTH,
    height: HERO_CARD_HEIGHT,
    left: (SCREEN_WIDTH - HERO_CARD_WIDTH) / 2,
    top: 8,
  },
  cardShadowWrap: {
    width: '100%',
    height: '100%',
    borderRadius: CARD_RADIUS,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 14 },
      },
      android: {
        elevation: 10,
      },
    }),
  },
  glassShell: {
    width: '100%',
    height: '100%',
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  artworkFrame: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: ARTWORK_RADIUS,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(18, 18, 24, 0.55)',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
  },
  nowPlayingPillWrap: {
    position: 'absolute',
    top: 10,
    left: 10,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(14, 14, 20, 0.48)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  nowPlayingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5AC8FA',
  },
  cardFooter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingTop: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  cardArtist: {
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.1,
  },
});

export default LiquidGlassDiscCard;
