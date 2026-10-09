import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/ThemeContext';
import { useAudioStore, Track } from '../store/useAudioStore';
import { getUniversalStudioArtwork } from '../utils/artworkHelper';
import { cleanArtistName } from '../services/youtubeMusicService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Mathematical Geometry for 3D Arc Perspective (Matches Image 2 & 3) ──
const CARD_WIDTH = Math.min(Math.round(SCREEN_WIDTH * 0.44), 175);
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.22);
const ARTWORK_HEIGHT = Math.round(CARD_HEIGHT * 0.68);
const FOOTER_HEIGHT = CARD_HEIGHT - ARTWORK_HEIGHT;
// SPACING is calibrated so >55% of side cards remain clearly visible with no clutter
const SPACING = Math.round(CARD_WIDTH * 0.58);

const cleanText = (str?: string): string => {
  if (!str) return '';
  return str
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
    .trim();
};

// ── Individual 3D Perspective Card (Driven by Continuous virtualIndex) ──
interface CardItemProps {
  track: Track;
  cardVirtualPos: number;
  virtualIndex: SharedValue<number>;
  onPress: () => void;
  isCenter: boolean;
}

const CoverFlowCard = React.memo(({
  track,
  cardVirtualPos,
  virtualIndex,
  onPress,
  isCenter,
}: CardItemProps) => {
  const { theme, isDark } = useTheme();

  const animatedStyle = useAnimatedStyle(() => {
    // 🚀 Continuous camera coordinate: p = cardVirtualPos - virtualIndex.value
    // When virtualIndex == cardVirtualPos, p == 0 (center position)
    const p = cardVirtualPos - virtualIndex.value;

    // Scale curve: 1.0 in center, 0.85 at inner sides, 0.72 at outer edges
    const scale = interpolate(
      p,
      [-2.5, -2, -1, 0, 1, 2, 2.5],
      [0.64, 0.72, 0.85, 1.0, 0.85, 0.72, 0.64],
      'clamp'
    );

    // Horizontal offset: follows finger 1:1 in continuous physical coordinates
    const translateX = interpolate(
      p,
      [-2.5, -2, -1, 0, 1, 2, 2.5],
      [-SPACING * 2.1, -SPACING * 1.85, -SPACING, 0, SPACING, SPACING * 1.85, SPACING * 2.1],
      'clamp'
    );

    // Vertical U-shaped Arc curve (Center is highest, sides dip gently)
    const translateY = interpolate(
      Math.abs(p),
      [0, 1, 2, 2.5],
      [0, 8, 18, 22],
      'clamp'
    );

    // 3D Perspective Rotation:
    // Left cards (p < 0) face inward to the right (positive rotation)
    // Right cards (p > 0) face inward to the left (negative rotation)
    const rotateYDeg = interpolate(
      p,
      [-2.5, -2, -1, 0, 1, 2, 2.5],
      [30, 24, 15, 0, -15, -24, -30],
      'clamp'
    );

    // Smooth continuous opacity
    const opacity = interpolate(
      p,
      [-3, -2.3, -2, -1, 0, 1, 2, 2.3, 3],
      [0, 0.35, 0.65, 0.88, 1.0, 0.88, 0.65, 0.35, 0],
      'clamp'
    );

    // Z-Index: Center is 10, inner sides are 5, outer edges are 2
    const zIndex = Math.round(
      interpolate(
        Math.abs(p),
        [0, 0.6, 1, 1.6, 2, 3],
        [10, 8, 5, 3, 2, 0],
        'clamp'
      )
    );

    return {
      transform: [
        { perspective: 900 },
        { translateX },
        { translateY },
        { scale },
        { rotateY: `${rotateYDeg}deg` },
      ],
      opacity,
      zIndex,
    };
  });

  return (
    <Animated.View style={[styles.cardAbsoluteWrap, animatedStyle]}>
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={onPress}
        style={styles.cardTouchable}
      >
        <View
          style={[
            styles.cardContainer,
            {
              borderColor: isCenter
                ? (isDark ? 'rgba(255, 255, 255, 0.36)' : 'rgba(0, 0, 0, 0.16)')
                : (isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.08)'),
              shadowOpacity: isCenter ? 0.38 : 0.18,
            },
          ]}
        >
          {/* Top Square Artwork */}
          <View style={styles.cardArtworkWrap}>
            <Image
              source={{ uri: getUniversalStudioArtwork(track?.thumbnail) }}
              style={styles.cardArtwork}
              contentFit="cover"
              priority={isCenter ? 'high' : 'normal'}
              cachePolicy="memory-disk"
            />
            {/* Subtle Gradient Veil */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.22)']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </View>

          {/* Bottom Distinct Frosted Card Footer (Matches Image 2 & 3) */}
          <View
            style={[
              styles.cardFooter,
              {
                backgroundColor: isDark
                  ? 'rgba(28, 28, 38, 0.94)'
                  : 'rgba(244, 244, 248, 0.96)',
                borderTopColor: isDark
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.05)',
              },
            ]}
          >
            {/* Artist Name */}
            <Text
              style={[styles.cardArtist, { color: theme.textPrimary }]}
              numberOfLines={1}
            >
              {cleanArtistName(track?.artist)}
            </Text>

            {/* Song Title */}
            <Text
              style={[styles.cardTitle, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {cleanText(track?.title)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ── Main CoverFlow Component ──
interface CoverFlowProps {
  tracks: Track[];
  onTrackSelect?: (track: Track) => void;
  onLoadMore?: () => void;
}

export const CoverFlowMusicCarousel: React.FC<CoverFlowProps> = ({
  tracks,
  onTrackSelect,
  onLoadMore,
}) => {
  const { theme, isDark } = useTheme();

  // Audio Store state
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const playTrack = useAudioStore((s) => s.playTrack);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);

  const numTracks = tracks.length;

  // Initial index calibrated once from currentTrack or 0
  const initialIndex = useMemo(() => {
    if (!currentTrack?.videoId || numTracks === 0) return 0;
    const found = tracks.findIndex((t) => t.videoId === currentTrack.videoId);
    return found !== -1 ? found : 0;
  }, []);

  // 🚀 Continuous Shared Float for Camera Position (Never jumps back to 0!)
  const virtualIndex = useSharedValue(initialIndex);
  const dragStartVirtual = useSharedValue(initialIndex);
  const [settledIndex, setSettledIndex] = useState(initialIndex);

  // Synchronize when currentTrack changes externally (Lock Screen, Mini Player, Bottom Sheet)
  useEffect(() => {
    if (currentTrack?.videoId && numTracks > 0) {
      const found = tracks.findIndex((t) => t.videoId === currentTrack.videoId);
      if (found !== -1 && found !== settledIndex) {
        setSettledIndex(found);
        virtualIndex.value = withSpring(found, {
          damping: 26,
          stiffness: 280,
          mass: 0.5,
        });
      }
    }
  }, [currentTrack?.videoId, numTracks, tracks]);

  // Handle settling at a target integer index
  const handleSettle = useCallback(
    (targetInt: number) => {
      if (numTracks === 0) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const clamped = Math.max(0, Math.min(numTracks - 1, targetInt));
      setSettledIndex(clamped);
      const targetTrack = tracks[clamped];
      if (targetTrack && onTrackSelect) {
        onTrackSelect(targetTrack);
      }
      // 🚀 Infinite Streaming: auto-load more tracks when within 4 cards of the end
      if (clamped >= numTracks - 4 && onLoadMore) {
        onLoadMore();
      }
    },
    [numTracks, tracks, onTrackSelect, onLoadMore]
  );

  // 🚀 Natural 1:1 Gesture Handling (Dragging right moves left card into center!)
  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-8, 8])
      .onBegin(() => {
        'worklet';
        dragStartVirtual.value = virtualIndex.value;
      })
      .onUpdate((e) => {
        'worklet';
        // When user drags right (e.translationX > 0), virtualIndex decreases, bringing left card into center
        // When user drags left (e.translationX < 0), virtualIndex increases, bringing right card into center
        virtualIndex.value = dragStartVirtual.value - e.translationX / SPACING;
      })
      .onEnd((e) => {
        'worklet';
        const moveFraction = -e.translationX / SPACING;
        const velocityContribution = -e.velocityX / 600;
        const targetFraction = moveFraction + velocityContribution * 0.4;
        const rawTarget = Math.round(dragStartVirtual.value + targetFraction);
        const targetInt = Math.max(0, Math.min(numTracks - 1, rawTarget));

        virtualIndex.value = withSpring(
          targetInt,
          {
            damping: 26,
            stiffness: 280,
            mass: 0.5,
          },
          (finished) => {
            if (finished) {
              runOnJS(handleSettle)(targetInt);
            }
          }
        );
      });
  }, [handleSettle, numTracks]);

  // Tap on card: smoothly springs to that card and settles
  const handleCardTap = useCallback(
    (targetVirtualPos: number) => {
      const currentCameraInt = Math.round(virtualIndex.value);
      const isCenter = currentCameraInt === targetVirtualPos;

      if (isCenter) {
        // Tapped Center Card -> Play or open sheet
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const centerTrack = tracks[targetVirtualPos];
        if (centerTrack) {
          if (currentTrack?.videoId !== centerTrack?.videoId) {
            playTrack(centerTrack, tracks, targetVirtualPos, 'Dashboard');
          }
          setPlayerModalVisible(true);
        }
      } else {
        // Tapped Side Card -> Smoothly glide that card into center
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const clamped = Math.max(0, Math.min(numTracks - 1, targetVirtualPos));
        virtualIndex.value = withSpring(
          clamped,
          {
            damping: 26,
            stiffness: 280,
            mass: 0.5,
          },
          (finished) => {
            if (finished) {
              runOnJS(handleSettle)(clamped);
            }
          }
        );
      }
    },
    [currentTrack?.videoId, handleSettle, numTracks, playTrack, setPlayerModalVisible, tracks]
  );

  // 7 Slots visible: [-3, -2, -1, 0, 1, 2, 3] around settledIndex for zero-flicker wide perspective
  const slots = useMemo(() => [-3, -2, -1, 0, 1, 2, 3], []);

  if (numTracks === 0) return null;

  return (
    <View style={styles.rootWrapper}>
      {/* ── Ambient Radial Atmosphere Glow ── */}
      <View style={styles.ambientGlowContainer} pointerEvents="none">
        <LinearGradient
          colors={[
            isDark ? 'rgba(252, 82, 0, 0.14)' : 'rgba(252, 82, 0, 0.08)',
            isDark ? 'rgba(28, 44, 94, 0.20)' : 'rgba(120, 150, 220, 0.07)',
            'transparent',
          ]}
          style={styles.ambientGlow}
          start={{ x: 0.5, y: 0.15 }}
          end={{ x: 0.5, y: 1 }}
        />
      </View>

      {/* ── Top Emblem & Title (Matches Spotify/A7 Music) ── */}
      <View style={styles.topBrandRow}>
        <Ionicons name="musical-notes" size={14} color="#FC5200" />
        <Text style={[styles.topBrandText, { color: theme.textSecondary }]}>
          A7 MUSIC
        </Text>
      </View>

      {/* ── 3D Arc Cover Flow Carousel (5 Cards in 3D Perspective) ── */}
      {/* ── 3D Arc Cover Flow Carousel (5 Cards in 3D Perspective) ── */}
      <GestureDetector gesture={panGesture}>
        <View style={styles.carouselContainer}>
          {slots.map((offset) => {
            const cardVirtualPos = settledIndex + offset;
            if (cardVirtualPos < 0 || cardVirtualPos >= numTracks) return null;
            const t = tracks[cardVirtualPos];
            if (!t) return null;

            return (
              <CoverFlowCard
                key={`slot-${cardVirtualPos}-${t.videoId || (t as any).id}`}
                track={t}
                cardVirtualPos={cardVirtualPos}
                virtualIndex={virtualIndex}
                isCenter={offset === 0}
                onPress={() => handleCardTap(cardVirtualPos)}
              />
            );
          })}
        </View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  rootWrapper: {
    width: '100%',
    alignItems: 'center',
    position: 'relative',
    marginTop: 4,
    marginBottom: 4,
  },
  ambientGlowContainer: {
    position: 'absolute',
    top: -15,
    width: SCREEN_WIDTH,
    height: CARD_HEIGHT + 35,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  ambientGlow: {
    width: Math.round(SCREEN_WIDTH * 0.92),
    height: Math.round(CARD_HEIGHT * 1.1),
    borderRadius: Math.round(CARD_HEIGHT * 0.55),
  },
  topBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    zIndex: 1,
  },
  topBrandText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  carouselContainer: {
    width: SCREEN_WIDTH,
    height: CARD_HEIGHT + 28,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'visible',
    zIndex: 2,
  },
  cardAbsoluteWrap: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    left: (SCREEN_WIDTH - CARD_WIDTH) / 2,
    top: 6,
  },
  cardTouchable: {
    width: '100%',
    height: '100%',
  },
  cardContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 14,
      },
      android: {
        elevation: 7,
      },
    }),
  },
  cardArtworkWrap: {
    width: '100%',
    height: ARTWORK_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'rgba(18, 18, 24, 0.95)',
  },
  cardArtwork: {
    width: '100%',
    height: '100%',
  },
  cardFooter: {
    width: '100%',
    height: FOOTER_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderTopWidth: 1,
  },
  cardArtist: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 10.5,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: -0.1,
  },
});

export default CoverFlowMusicCarousel;
