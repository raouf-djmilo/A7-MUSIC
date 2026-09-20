import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  SharedValue,
} from 'react-native-reanimated';
import { Track } from '../store/useAudioStore';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { getUniversalStudioArtwork } from '../utils/artworkHelper';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Strict Snapping & Peeking Geometry ──
export const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.82);
export const SPACING = 14;
export const SNAP_INTERVAL = CARD_WIDTH + SPACING;
export const SIDE_PADDING = Math.round((SCREEN_WIDTH - CARD_WIDTH) / 2);
const ARTWORK_HEIGHT = 205;

const formatMs = (ms: number): string => {
  if (!ms || isNaN(ms)) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

const formatRemainingMs = (remMs: number): string => {
  if (!remMs || isNaN(remMs) || remMs < 0) return '-0:00';
  const totalSec = Math.floor(remMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `-${min}:${sec < 10 ? '0' : ''}${sec}`;
};

const createCardStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    cardOuter: {
      width: CARD_WIDTH,
      marginRight: SPACING,
      marginVertical: 4,
    },
    cardContainer: {
      width: '100%',
      borderRadius: 26,
      overflow: 'hidden',
      padding: 16,
      position: 'relative',
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      ...Platform.select({
        ios: {
          shadowColor: theme.cardShadow.shadowColor,
          shadowOffset: theme.cardShadow.shadowOffset,
          shadowOpacity: theme.cardShadow.shadowOpacity,
          shadowRadius: theme.cardShadow.shadowRadius,
        },
        android: {
          elevation: theme.cardShadow.elevation,
        },
      }),
    },
    cardGlassBody: {
      ...StyleSheet.absoluteFill,
      backgroundColor:
        Platform.OS === 'ios'
          ? (theme.mode === 'light' ? 'rgba(240, 239, 234, 0.82)' : 'rgba(18, 18, 24, 0.78)')
          : theme.androidSurfaceFallback,
      zIndex: 0,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
      zIndex: 15,
    },
    artistPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surfaceSubtle,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5,
      maxWidth: CARD_WIDTH * 0.62,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
    },
    artistAvatar: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: theme.surface,
    },
    artistPillText: {
      marginLeft: 8,
      flex: 1,
    },
    artistName: {
      color: theme.textPrimary,
      fontSize: 12,
      fontWeight: '700',
    },
    artistHandle: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '500',
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      zIndex: 15,
    },
    actionCircleBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.surfaceSubtle,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.borderSubtle,
    },
    artworkWrapper: {
      width: '100%',
      height: ARTWORK_HEIGHT,
      borderRadius: 20,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: theme.surfaceSubtle,
      marginBottom: 14,
      zIndex: 5,
    },
    artwork: {
      width: '100%',
      height: '100%',
    },
    artworkBottomGradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 60,
      justifyContent: 'flex-end',
      paddingHorizontal: 14,
      paddingBottom: 10,
      zIndex: 6,
    },
    trackTitle: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    timelineSection: {
      marginBottom: 14,
      zIndex: 5,
    },
    timelineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    timeText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '600',
      minWidth: 36,
      textAlign: 'center',
    },
    progressBarBg: {
      flex: 1,
      height: 4,
      backgroundColor: theme.surfaceSubtle,
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: theme.textPrimary,
      borderRadius: 2,
    },
    controlsWrapper: {
      position: 'relative',
      zIndex: 20,
      elevation: 20,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    controlsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 34,
      paddingBottom: 4,
      zIndex: 20,
    },
    controlIconBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 25,
    },
    playCenterBtn: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: theme.textPrimary,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 25,
      ...Platform.select({
        ios: {
          shadowColor: theme.cardShadow.shadowColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: theme.mode === 'light' ? 0.15 : 0.35,
          shadowRadius: 10,
        },
        android: {
          elevation: 6,
        },
      }),
    },
  });

export interface HomeGlassMusicCardProps {
  track: Track & { id?: string };
  index: number;
  scrollX: SharedValue<number>;
  isCurrent: boolean;
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  isLiked: boolean;
  onPressArtwork?: () => void;
  onPressPlay?: () => void;
  onPressLike?: () => void;
  onPressShare?: () => void;
  onPressPrev?: () => void;
  onPressNext?: () => void;
}

export const HomeGlassMusicCard: React.FC<HomeGlassMusicCardProps> = React.memo(({
  track,
  index,
  scrollX,
  isCurrent,
  isPlaying,
  positionMillis,
  durationMillis,
  isLiked,
  onPressArtwork,
  onPressPlay,
  onPressLike,
  onPressShare,
  onPressPrev,
  onPressNext,
}) => {
  const { theme } = useTheme();
  const styles = useThemedStyles(createCardStyles);

  // ── Scale & Opacity Motion Physics Interpolation (UI Thread) ──
  const animatedCardStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * SNAP_INTERVAL,
      index * SNAP_INTERVAL,
      (index + 1) * SNAP_INTERVAL,
    ];

    const scale = interpolate(
      scrollX.value,
      inputRange,
      [0.92, 1.0, 0.92],
      Extrapolation.CLAMP
    );

    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.65, 1.0, 0.65],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const validDuration = isCurrent && durationMillis > 0
    ? durationMillis
    : (track.duration || 180000);

  const currentPos = isCurrent ? positionMillis : 0;
  const progressPercent = Math.min(100, Math.max(0, (currentPos / validDuration) * 100));
  const remainingMs = Math.max(0, validDuration - currentPos);

  const isThisCardPlaying = isCurrent && isPlaying;

  return (
    <Animated.View style={[styles.cardOuter, animatedCardStyle]}>
      <View style={styles.cardContainer}>
        {/* ── 1. Frosted Glass Layer with pointerEvents="none" ── */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 70 : 45}
          tint={theme.blurTint}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* ── 2. Dynamic Tint Surface Layer with pointerEvents="none" ── */}
        <View style={styles.cardGlassBody} pointerEvents="none" />

        {/* ── 3. Top Header: Artist Pill & Actions ── */}
        <View style={styles.headerRow} pointerEvents="box-none">
          {/* Artist Pill */}
          <View style={styles.artistPill} pointerEvents="none">
            <Image
              source={{ uri: getUniversalStudioArtwork(track.thumbnail) }}
              style={styles.artistAvatar}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            <View style={styles.artistPillText}>
              <Text style={styles.artistName} numberOfLines={1}>
                {track.artist || 'Unknown Artist'}
              </Text>
              <Text style={styles.artistHandle} numberOfLines={1}>
                {track.artist ? `@${track.artist.toLowerCase().replace(/\s+/g, '')}` : '@artist'}
              </Text>
            </View>
          </View>

          {/* Top Right Actions (Share + Like) with 12px hitSlop */}
          <View style={styles.headerActions} pointerEvents="box-none">
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onPressShare}
              style={styles.actionCircleBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="share-outline" size={18} color={theme.textPrimary} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onPressLike}
              style={styles.actionCircleBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name={isLiked ? 'heart' : 'heart-outline'}
                size={19}
                color={isLiked ? '#FF3B30' : theme.textPrimary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 4. Center Artwork with Expand Modal trigger ── */}
        <TouchableOpacity
          activeOpacity={0.94}
          onPress={onPressArtwork}
          style={styles.artworkWrapper}
        >
          <Image
            source={{ uri: getUniversalStudioArtwork(track.thumbnail) }}
            style={styles.artwork}
            contentFit="cover"
            priority="high"
            cachePolicy="memory-disk"
            transition={200}
          />

          {/* Gradient text shadow banner with pointerEvents="none" */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.72)']}
            style={styles.artworkBottomGradient}
            pointerEvents="none"
          >
            <Text style={styles.trackTitle} numberOfLines={1}>
              {track.title || 'Track Title'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── 5. Playback Timeline Section ── */}
        <View style={styles.timelineSection} pointerEvents="none">
          <View style={styles.timelineRow}>
            <Text style={styles.timeText}>{formatMs(currentPos)}</Text>
            <View style={styles.progressBarBg}>
              <View
                style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
              />
            </View>
            <Text style={styles.timeText}>{formatRemainingMs(remainingMs)}</Text>
          </View>
        </View>

        {/* ── 6. Dedicated High-ZIndex Controls Container with pointerEvents="box-none" ── */}
        <View style={styles.controlsWrapper} pointerEvents="box-none">
          <View style={styles.controlsRow} pointerEvents="box-none">
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onPressPrev}
              style={styles.controlIconBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="play-skip-back" size={24} color={theme.textPrimary} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onPressPlay}
              style={styles.playCenterBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name={isThisCardPlaying ? 'pause' : 'play'}
                size={30}
                color={theme.mode === 'light' ? '#FFFFFF' : '#000000'}
                style={{ marginLeft: isThisCardPlaying ? 0 : 2 }}
              />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onPressNext}
              style={styles.controlIconBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="play-skip-forward" size={24} color={theme.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Animated.View>
  );
});

export default HomeGlassMusicCard;
