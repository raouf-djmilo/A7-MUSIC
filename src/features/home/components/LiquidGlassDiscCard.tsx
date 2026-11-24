import React, { useMemo, useCallback, useEffect } from 'react';
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
  useSharedValue,
  interpolate,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../../../theme/ThemeContext';
import { APPLE_LIQUID_COLORS } from '../../../theme/AppleLiquidTokens';
import { getUniversalStudioArtworkSource } from '../../../utils/artworkHelper';
import { cleanArtistName } from '../../../services/youtubeMusicService';
import type { LiquidGlassDiscCardProps } from '../types/home.types';
import { cleanCardText } from '../utils/homeTrackUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Calibrated 3-card hero geometry: wide center card with clean left/right peeking cards
export const HERO_CARD_WIDTH = Math.min(Math.round(SCREEN_WIDTH * 0.62), 252);
export const HERO_CARD_HEIGHT = Math.round(HERO_CARD_WIDTH * 1.26);
export const HERO_CARD_SPACING = Math.round(HERO_CARD_WIDTH * 0.68);

const CARD_PADDING = 11;
const ARTWORK_SIZE = HERO_CARD_WIDTH - CARD_PADDING * 2;
const CARD_RADIUS = 28;
const ARTWORK_RADIUS = 20;

/**
 * 120fps GPU-driven Apple Liquid Glass disc card.
 * - Zero per-card BlurView / double-image blur passes so scrolling stays locked at full refresh rate.
 * - Zero 3D rotateY Z-buffer plane intersections so adjacent cards glide cleanly behind/ahead with zero sharp cuts.
 */
export const LiquidGlassDiscCard: React.FC<LiquidGlassDiscCardProps> = React.memo(
  ({ track, cardVirtualPos, virtualIndex, onPress, isCenter }) => {
    const { theme, isDark } = useTheme();
    const liquidColors = isDark ? APPLE_LIQUID_COLORS.dark : APPLE_LIQUID_COLORS.light;

    // Sync recycled slot position to a SharedValue so native useAnimatedStyle needs no JS dep array
    const slotPos = useSharedValue(cardVirtualPos);
    useEffect(() => {
      slotPos.value = cardVirtualPos;
    }, [cardVirtualPos, slotPos]);

    const handlePress = useCallback(() => {
      onPress(cardVirtualPos);
    }, [onPress, cardVirtualPos]);

    const artworkSources = useMemo(
      () =>
        getUniversalStudioArtworkSource(
          track?.thumbnail,
          track?.title,
          track?.artist,
          track?.videoId
        ),
      [track?.thumbnail, track?.title, track?.artist, track?.videoId]
    );

    const animatedStyle = useAnimatedStyle(() => {
      const p = slotPos.value - virtualIndex.value;
      const absP = Math.abs(p);

      // Smooth cubic-like Apple scale & horizontal arc without 3D plane clipping
      const scale = interpolate(
        absP,
        [0, 0.5, 1, 1.8, 2.4],
        [1.0, 0.92, 0.83, 0.70, 0.62],
        'clamp'
      );

      const translateX = interpolate(
        p,
        [-2.4, -1.8, -1, 0, 1, 1.8, 2.4],
        [
          -HERO_CARD_SPACING * 1.9,
          -HERO_CARD_SPACING * 1.55,
          -HERO_CARD_SPACING,
          0,
          HERO_CARD_SPACING,
          HERO_CARD_SPACING * 1.55,
          HERO_CARD_SPACING * 1.9,
        ],
        'clamp'
      );

      const translateY = interpolate(
        absP,
        [0, 1, 2, 2.4],
        [0, 10, 22, 28],
        'clamp'
      );

      const opacity = interpolate(
        absP,
        [0, 0.8, 1.25, 1.85, 2.3],
        [1.0, 0.94, 0.72, 0.25, 0],
        'clamp'
      );

      // Pure 2D depth ordering (no 3D rotateY Z-fighting)
      const zIndex = Math.max(0, Math.round(500 - absP * 200));

      return {
        transform: [{ translateX }, { translateY }, { scale }],
        opacity,
        zIndex,
      };
    });

    // Gradual soft depth dimming as cards slide behind the active hero card
    const depthDimStyle = useAnimatedStyle(() => {
      const absP = Math.abs(slotPos.value - virtualIndex.value);
      const dimOpacity = interpolate(absP, [0, 0.45, 1.2], [0, 0.12, 0.34], 'clamp');
      return { opacity: dimOpacity };
    });

    // Smoothly brighten center specular glass rim purely on GPU UI thread
    const centerRimStyle = useAnimatedStyle(() => {
      const absP = Math.abs(slotPos.value - virtualIndex.value);
      const focus = interpolate(absP, [0, 0.7], [1, 0], 'clamp');
      return { opacity: focus };
    });

    return (
      <Animated.View style={[styles.cardAbsoluteWrap, animatedStyle]}>
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={handlePress}
          style={[
            styles.cardShadowWrap,
            {
              shadowOpacity: isDark ? 0.44 : 0.14,
              shadowRadius: isDark ? 18 : 14,
            },
          ]}
        >
          <View
            style={[
              styles.glassShell,
              {
                backgroundColor: isDark
                  ? 'rgba(18, 19, 26, 0.86)'
                  : 'rgba(246, 246, 250, 0.90)',
                borderColor: liquidColors.barBorder,
                borderTopColor: liquidColors.barBorderTop,
              },
            ]}
          >
            {/* Subtle Apple Liquid Glass inner sheen */}
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(255, 255, 255, 0.18)', 'rgba(255, 255, 255, 0.03)', 'transparent']
                  : ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.25)', 'transparent']
              }
              locations={[0, 0.32, 0.7]}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 0.85 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Single crisp HD Artwork (zero double-image blur overhead) */}
            <View
              style={[
                styles.artworkFrame,
                {
                  borderColor: isDark
                    ? 'rgba(255, 255, 255, 0.16)'
                    : 'rgba(0, 0, 0, 0.06)',
                },
              ]}
            >
              <Image
                source={artworkSources}
                style={styles.artworkImage}
                contentFit="cover"
                priority={isCenter ? 'high' : 'normal'}
                cachePolicy="memory-disk"
                recyclingKey={`art-${track?.videoId || cardVirtualPos}`}
                transition={80}
              />
              <LinearGradient
                colors={['rgba(255,255,255,0.10)', 'transparent', 'rgba(0,0,0,0.14)']}
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

            {/* Progressive soft depth veil for background cards */}
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                styles.depthVeil,
                {
                  backgroundColor: isDark ? '#07080D' : '#E5E7EE',
                },
                depthDimStyle,
              ]}
              pointerEvents="none"
            />

            {/* Pure neutral Apple specular center highlight (Zero blue tint) */}
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                styles.centerSpecularRim,
                {
                  borderColor: isDark
                    ? 'rgba(255, 255, 255, 0.30)'
                    : 'rgba(255, 255, 255, 0.98)',
                },
                centerRimStyle,
              ]}
              pointerEvents="none"
            />
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  },
  (prev, next) =>
    prev.track?.videoId === next.track?.videoId &&
    prev.cardVirtualPos === next.cardVirtualPos &&
    prev.isCenter === next.isCenter &&
    prev.onPress === next.onPress
);

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
  depthVeil: {
    borderRadius: CARD_RADIUS,
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
    backgroundColor: 'rgba(18, 18, 24, 0.65)',
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
