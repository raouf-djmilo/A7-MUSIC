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

import { useTheme } from '../../../theme/ThemeContext';
import { APPLE_LIQUID_COLORS } from '../../../theme/AppleLiquidTokens';
import { getUniversalStudioArtworkSource } from '../../../utils/artworkHelper';
import { cleanArtistName } from '../../../services/youtubeMusicService';
import type { LiquidGlassDiscCardProps } from '../types/home.types';
import { cleanCardText } from '../utils/homeTrackUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Calibrated 3-card hero geometry: bold center card with left & right cards cleanly peeking
export const HERO_CARD_WIDTH = Math.min(Math.round(SCREEN_WIDTH * 0.60), 248);
export const HERO_CARD_HEIGHT = Math.round(HERO_CARD_WIDTH * 1.26);
export const HERO_CARD_SPACING = Math.round(HERO_CARD_WIDTH * 0.63);

const CARD_PADDING = 11;
const ARTWORK_SIZE = HERO_CARD_WIDTH - CARD_PADDING * 2;
const CARD_RADIUS = 28;
const ARTWORK_RADIUS = 20;

/**
 * Apple Liquid Glass glossy disc card for the Home Screen circular carousel.
 * Uses a persistent BlurView + translucent glass substrate + specular sheen
 * so glass refraction stays rock-solid during 120fps 3D swipes without UIKit dropouts.
 */
export const LiquidGlassDiscCard: React.FC<LiquidGlassDiscCardProps> = React.memo(({
  track,
  cardVirtualPos,
  virtualIndex,
  onPress,
  isCenter,
}) => {
  const { theme, isDark } = useTheme();
  const liquidColors = isDark ? APPLE_LIQUID_COLORS.dark : APPLE_LIQUID_COLORS.light;

  const artworkSources = useMemo(
    () => getUniversalStudioArtworkSource(track?.thumbnail, track?.title, track?.artist, track?.videoId),
    [track?.thumbnail, track?.title, track?.artist, track?.videoId]
  );

  const animatedStyle = useAnimatedStyle(() => {
    const p = cardVirtualPos - virtualIndex.value;
    const absP = Math.abs(p);

    const scale = interpolate(
      p,
      [-2.6, -2, -1, 0, 1, 2, 2.6],
      [0.62, 0.68, 0.82, 1.0, 0.82, 0.68, 0.62],
      'clamp'
    );

    const translateX = interpolate(
      p,
      [-2.6, -2, -1, 0, 1, 2, 2.6],
      [
        -HERO_CARD_SPACING * 1.95,
        -HERO_CARD_SPACING * 1.65,
        -HERO_CARD_SPACING,
        0,
        HERO_CARD_SPACING,
        HERO_CARD_SPACING * 1.65,
        HERO_CARD_SPACING * 1.95,
      ],
      'clamp'
    );

    // Subtle arc elevation without aggressive vertical drop
    const translateY = interpolate(
      absP,
      [0, 1, 2, 2.6],
      [0, 8, 18, 24],
      'clamp'
    );

    // Gentle 3D tilt (kept shallow so adjacent cards never clip/slice through each other)
    const rotateYDeg = interpolate(
      p,
      [-2.6, -2, -1, 0, 1, 2, 2.6],
      [16, 13, 8, 0, -8, -13, -16],
      'clamp'
    );

    const opacity = interpolate(
      p,
      [-2.75, -2.15, -1.6, -1, 0, 1, 1.6, 2.15, 2.75],
      [0, 0.22, 0.52, 0.84, 1.0, 0.84, 0.52, 0.22, 0],
      'clamp'
    );

    const zIndex = Math.max(0, Math.round(500 - absP * 160));

    return {
      transform: [
        { perspective: 1100 },
        { translateX },
        { translateY },
        { scale },
        { rotateY: `${rotateYDeg}deg` },
      ],
      opacity,
      zIndex,
    };
  }, [cardVirtualPos]);

  // Smoothly animate specular center highlight purely on UI thread
  const centerRimAnimatedStyle = useAnimatedStyle(() => {
    const absP = Math.abs(cardVirtualPos - virtualIndex.value);
    const focus = interpolate(absP, [0, 0.85], [1, 0], 'clamp');
    return {
      opacity: focus,
    };
  }, [cardVirtualPos]);

  return (
    <Animated.View style={[styles.cardAbsoluteWrap, animatedStyle]}>
      <TouchableOpacity
        activeOpacity={0.94}
        onPress={onPress}
        style={[
          styles.cardShadowWrap,
          {
            shadowOpacity: isDark ? 0.42 : 0.14,
            shadowRadius: isDark ? 18 : 14,
          },
        ]}
      >
        <View
          style={[
            styles.glassShell,
            {
              backgroundColor: isDark
                ? 'rgba(20, 20, 26, 0.52)'
                : 'rgba(255, 255, 255, 0.58)',
              borderColor: liquidColors.barBorder,
              borderTopColor: liquidColors.barBorderTop,
            },
          ]}
        >
          {/* Persistent Metal-accelerated Frosted Glass Substrate */}
          <BlurView
            intensity={Platform.OS === 'ios' ? (isDark ? 60 : 78) : 38}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />

          {/* Pure Neutral Liquid Glass Tint Core */}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDark
                  ? 'rgba(255, 255, 255, 0.06)'
                  : 'rgba(255, 255, 255, 0.26)',
              },
            ]}
            pointerEvents="none"
          />

          {/* Glossy Apple Specular Top Reflection */}
          <LinearGradient
            colors={
              isDark
                ? ['rgba(255, 255, 255, 0.24)', 'rgba(255, 255, 255, 0.04)', 'transparent']
                : ['rgba(255, 255, 255, 0.90)', 'rgba(255, 255, 255, 0.24)', 'transparent']
            }
            locations={[0, 0.34, 0.72]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 0.85 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Smooth UI-thread Neutral Specular Focus Rim (Zero Blue Tint) */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.centerSpecularRim,
              {
                borderColor: isDark
                  ? 'rgba(255, 255, 255, 0.32)'
                  : 'rgba(255, 255, 255, 0.98)',
              },
              centerRimAnimatedStyle,
            ]}
            pointerEvents="none"
          />

          {/* Framed HD Artwork Stage */}
          <View
            style={[
              styles.artworkFrame,
              {
                borderColor: isDark
                  ? 'rgba(255, 255, 255, 0.16)'
                  : 'rgba(255, 255, 255, 0.78)',
              },
            ]}
          >
            <Image
              source={artworkSources}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              blurRadius={Platform.OS === 'ios' ? 16 : 12}
              priority="low"
              cachePolicy="memory-disk"
              recyclingKey={`bg-${track?.videoId || cardVirtualPos}`}
            />
            <Image
              source={artworkSources}
              style={styles.artworkImage}
              contentFit="cover"
              priority={isCenter ? 'high' : 'normal'}
              cachePolicy="memory-disk"
              recyclingKey={`fg-${track?.videoId || cardVirtualPos}`}
              transition={140}
            />
            <LinearGradient
              colors={['rgba(255,255,255,0.10)', 'transparent', 'rgba(0,0,0,0.16)']}
              locations={[0, 0.28, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </View>

          {/* Translucent Frosted Metadata Footer */}
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
        </View>
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
        shadowOffset: { width: 0, height: 12 },
      },
      android: {
        elevation: 8,
      },
    }),
  },
  glassShell: {
    width: '100%',
    height: '100%',
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    padding: CARD_PADDING,
    borderWidth: 1,
    justifyContent: 'space-between',
    position: 'relative',
  },
  centerSpecularRim: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1.2,
  },
  artworkFrame: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: ARTWORK_RADIUS,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(18, 18, 24, 0.45)',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
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
