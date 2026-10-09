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

// ── Mathematical Geometry for 3D Arc Perspective (Matches Spotify/Apple Cover Flow) ──
const CARD_WIDTH = Math.min(Math.round(SCREEN_WIDTH * 0.54), 220);
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.34);
const SPACING = Math.round(CARD_WIDTH * 0.38);

const cleanText = (str?: string): string => {
  if (!str) return '';
  return str
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
    .trim();
};

const formatTime = (ms: number): string => {
  if (!ms || isNaN(ms) || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

// ── Micro Animated Waveform Equalizer (Image 1 Style) ──
const WaveBar = ({ delay, isPlaying }: { delay: number; isPlaying: boolean }) => {
  const height = useSharedValue(5);

  useEffect(() => {
    if (isPlaying) {
      height.value = withRepeat(
        withSequence(
          withTiming(12 + Math.random() * 5, { duration: 240 + delay * 50 }),
          withTiming(4 + Math.random() * 3, { duration: 240 + delay * 50 })
        ),
        -1,
        true
      );
    } else {
      height.value = withTiming(5, { duration: 180 });
    }
  }, [isPlaying, delay]);

  const style = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return <Animated.View style={[styles.waveBar, style]} />;
};

const AudioWaveformVisualizer = ({ isPlaying }: { isPlaying: boolean }) => {
  return (
    <View style={styles.waveContainer}>
      <WaveBar delay={0} isPlaying={isPlaying} />
      <WaveBar delay={1} isPlaying={isPlaying} />
      <WaveBar delay={2} isPlaying={isPlaying} />
      <WaveBar delay={3} isPlaying={isPlaying} />
    </View>
  );
};

// ── Isolated Real-time Progress Bar & Time Display (Prevents Re-renders) ──
const CoverFlowMiniPillProgress = React.memo(() => {
  const positionMillis = useAudioStore((s) => s.positionMillis);
  const durationMillis = useAudioStore((s) => s.durationMillis);

  const percent =
    durationMillis > 0
      ? Math.min(100, Math.max(0, (positionMillis / durationMillis) * 100))
      : 0;

  return (
    <View style={styles.pillProgressTrack} pointerEvents="none">
      <View style={[styles.pillProgressFill, { width: `${percent}%` }]} />
    </View>
  );
});

const CoverFlowTimeDisplay = React.memo(() => {
  const positionMillis = useAudioStore((s) => s.positionMillis);
  const durationMillis = useAudioStore((s) => s.durationMillis);

  const posText = formatTime(positionMillis);
  const durText = formatTime(durationMillis || 180000);

  return (
    <Text style={styles.pillTimeText}>
      {posText} / {durText}
    </Text>
  );
});

// ── Individual 3D Perspective Card (Slots -2, -1, 0, 1, 2) ──
interface CardItemProps {
  track: Track;
  slotIndex: number;
  panX: SharedValue<number>;
  onPress: () => void;
  isCenter: boolean;
}

const CoverFlowCard = React.memo(({
  track,
  slotIndex,
  panX,
  onPress,
  isCenter,
}: CardItemProps) => {
  const { theme } = useTheme();

  const animatedStyle = useAnimatedStyle(() => {
    // Relative position offset (-2.0 to +2.0)
    const p = slotIndex - panX.value / CARD_WIDTH;

    // Scale curve: 1.0 at center, 0.83 at inner sides, 0.68 at outer edges
    const scale = interpolate(
      p,
      [-2.5, -2, -1, 0, 1, 2, 2.5],
      [0.62, 0.70, 0.84, 1.0, 0.84, 0.70, 0.62],
      'clamp'
    );

    // Horizontal arc offset
    const translateX = interpolate(
      p,
      [-2.5, -2, -1, 0, 1, 2, 2.5],
      [-SPACING * 2.1, -SPACING * 1.82, -SPACING, 0, SPACING, SPACING * 1.82, SPACING * 2.1],
      'clamp'
    );

    // 3D Rotation: positive on left (tilts rightwards), negative on right (tilts leftwards)
    const rotateYDeg = interpolate(
      p,
      [-2.5, -2, -1, 0, 1, 2, 2.5],
      [38, 32, 20, 0, -20, -32, -38],
      'clamp'
    );

    // Smooth continuous opacity cross-fade
    const opacity = interpolate(
      p,
      [-3, -2.2, -2, -1, 0, 1, 2, 2.2, 3],
      [0, 0.22, 0.46, 0.80, 1.0, 0.80, 0.46, 0.22, 0],
      'clamp'
    );

    // Z-Index: Center is top, then inner sides, then outer
    const zIndex = Math.round(
      interpolate(
        Math.abs(p),
        [0, 1, 2, 3],
        [10, 5, 2, 0],
        'clamp'
      )
    );

    return {
      transform: [
        { perspective: 900 },
        { translateX },
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
        <View style={styles.cardInner}>
          {/* Universal High Resolution Studio Artwork */}
          <Image
            source={{ uri: getUniversalStudioArtwork(track?.thumbnail) }}
            style={styles.cardImage}
            contentFit="cover"
            priority={isCenter ? 'high' : 'normal'}
            cachePolicy="memory-disk"
          />

          {/* Delicate Frosted Specular Border */}
          <View style={styles.cardGlassBorder} pointerEvents="none" />

          {/* Deep Legibility Gradient Scrim */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.88)']}
            style={styles.cardGradient}
            pointerEvents="none"
          >
            <Text style={styles.cardTitle} numberOfLines={1}>
              {cleanText(track?.title)}
            </Text>
            <Text style={styles.cardArtist} numberOfLines={1}>
              {cleanArtistName(track?.artist)}
            </Text>

            {/* Spotify / A7 Music Logo Badge */}
            <View style={styles.cardBrandBadge}>
              <Ionicons name="musical-notes" size={11} color="#FC5200" />
              <Text style={styles.cardBrandText}>A7 MUSIC</Text>
            </View>
          </LinearGradient>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ── Main CoverFlow Component ──
interface CoverFlowProps {
  tracks: Track[];
  onTrackSelect?: (track: Track) => void;
}

export const CoverFlowMusicCarousel: React.FC<CoverFlowProps> = ({
  tracks,
  onTrackSelect,
}) => {
  const { theme, isDark } = useTheme();

  // Audio Store state
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const isShuffle = useAudioStore((s) => s.isShuffle);
  const repeatMode = useAudioStore((s) => s.repeatMode);
  const isRepeat = repeatMode !== 'off';
  const playTrack = useAudioStore((s) => s.playTrack);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const toggleShuffle = useAudioStore((s) => s.toggleShuffle);
  const toggleRepeat = useAudioStore((s) => s.toggleRepeat);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);

  const numTracks = tracks.length;
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (!currentTrack?.videoId || numTracks === 0) return 0;
    const found = tracks.findIndex((t) => t.videoId === currentTrack.videoId);
    return found !== -1 ? found : 0;
  });

  // Keep currentIndex synchronized with currentTrack changes
  useEffect(() => {
    if (currentTrack?.videoId && numTracks > 0) {
      const found = tracks.findIndex((t) => t.videoId === currentTrack.videoId);
      if (found !== -1 && found !== currentIndex) {
        setCurrentIndex(found);
      }
    }
  }, [currentTrack?.videoId, numTracks]);

  const activeCenterTrack: Track =
    tracks[currentIndex] || currentTrack || tracks[0];

  // 🚀 Reanimated Pan Gesture for 60/120 FPS Native Dragging
  const panX = useSharedValue(0);

  const handleNextTrack = useCallback(() => {
    if (numTracks === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    panX.value = 0;
    setCurrentIndex((prev) => {
      const nextIdx = (prev + 1) % numTracks;
      const target = tracks[nextIdx];
      if (target && onTrackSelect) {
        onTrackSelect(target);
      }
      return nextIdx;
    });
  }, [numTracks, tracks, onTrackSelect]);

  const handlePrevTrack = useCallback(() => {
    if (numTracks === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    panX.value = 0;
    setCurrentIndex((prev) => {
      const prevIdx = (prev - 1 + numTracks) % numTracks;
      const target = tracks[prevIdx];
      if (target && onTrackSelect) {
        onTrackSelect(target);
      }
      return prevIdx;
    });
  }, [numTracks, tracks, onTrackSelect]);

  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-10, 10])
      .onUpdate((e) => {
        'worklet';
        panX.value = e.translationX;
      })
      .onEnd((e) => {
        'worklet';
        const threshold = CARD_WIDTH * 0.28;
        const velocityThreshold = 420;

        if (e.translationX < -threshold || e.velocityX < -velocityThreshold) {
          // Swiped Left -> Advance to next track
          panX.value = withSpring(-CARD_WIDTH, {
            damping: 24,
            stiffness: 280,
            mass: 0.5,
          }, (finished) => {
            if (finished) {
              runOnJS(handleNextTrack)();
            }
          });
        } else if (e.translationX > threshold || e.velocityX > velocityThreshold) {
          // Swiped Right -> Go back to prev track
          panX.value = withSpring(CARD_WIDTH, {
            damping: 24,
            stiffness: 280,
            mass: 0.5,
          }, (finished) => {
            if (finished) {
              runOnJS(handlePrevTrack)();
            }
          });
        } else {
          // Snap back to center
          panX.value = withSpring(0, {
            damping: 24,
            stiffness: 300,
            mass: 0.5,
          });
        }
      });
  }, [handleNextTrack, handlePrevTrack]);

  // Card click triggers
  const handleCardPress = useCallback(
    (slotOffset: number) => {
      if (slotOffset === 0) {
        // Center card clicked -> Play and open player sheet
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (currentTrack?.videoId !== activeCenterTrack?.videoId) {
          playTrack(activeCenterTrack, tracks, currentIndex, 'Dashboard');
        }
        setPlayerModalVisible(true);
      } else if (slotOffset > 0) {
        // Tapped right card -> animate smoothly forward
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        panX.value = withSpring(-CARD_WIDTH, {
          damping: 24,
          stiffness: 280,
          mass: 0.5,
        }, (finished) => {
          if (finished) {
            runOnJS(handleNextTrack)();
          }
        });
      } else {
        // Tapped left card -> animate smoothly backward
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        panX.value = withSpring(CARD_WIDTH, {
          damping: 24,
          stiffness: 280,
          mass: 0.5,
        }, (finished) => {
          if (finished) {
            runOnJS(handlePrevTrack)();
          }
        });
      }
    },
    [activeCenterTrack, currentTrack?.videoId, currentIndex, handleNextTrack, handlePrevTrack, playTrack, setPlayerModalVisible, tracks]
  );

  // 5 Slots visible: [-2, -1, 0, 1, 2]
  const slots = useMemo(() => [-2, -1, 0, 1, 2], []);

  if (numTracks === 0) return null;

  return (
    <View style={styles.rootWrapper}>
      {/* ── Ambient Radial Atmosphere Glow ── */}
      <View style={styles.ambientGlowContainer} pointerEvents="none">
        <LinearGradient
          colors={[
            isDark ? 'rgba(252, 82, 0, 0.16)' : 'rgba(252, 82, 0, 0.10)',
            isDark ? 'rgba(28, 44, 94, 0.22)' : 'rgba(120, 150, 220, 0.08)',
            'transparent',
          ]}
          style={styles.ambientGlow}
          start={{ x: 0.5, y: 0.2 }}
          end={{ x: 0.5, y: 1 }}
        />
      </View>

      {/* ── Minimalist Top Branding ── */}
      <View style={styles.topBrandRow}>
        <Ionicons name="sparkles" size={13} color="#FC5200" />
        <Text style={[styles.topBrandText, { color: theme.textSecondary }]}>
          A7 AUDIO FLOW
        </Text>
      </View>

      {/* ── 3D Arc Cover Flow Carousel (5 Cards in 3D Perspective) ── */}
      <GestureDetector gesture={panGesture}>
        <View style={styles.carouselContainer}>
          {slots.map((slot) => {
            const trackIdx = (currentIndex + slot + numTracks * 1000) % numTracks;
            const t = tracks[trackIdx];
            if (!t) return null;

            return (
              <CoverFlowCard
                key={`slot-${slot}-${t.videoId || (t as any).id}`}
                track={t}
                slotIndex={slot}
                panX={panX}
                isCenter={slot === 0}
                onPress={() => handleCardPress(slot)}
              />
            );
          })}
        </View>
      </GestureDetector>

      {/* ── Subtitle Context (Matches Image 2) ── */}
      <Text style={[styles.vibeSubtitle, { color: theme.textMuted }]}>
        اسحب يميناً أو يساراً للتنقل بين المقاطع بانسيابية ⚡
      </Text>

      {/* ── Floating Frosted Glass Capsule (Matches Image 1) ── */}
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (currentTrack?.videoId !== activeCenterTrack?.videoId) {
            playTrack(activeCenterTrack, tracks, currentIndex, 'Dashboard');
          }
          setPlayerModalVisible(true);
        }}
        style={[styles.glassPillContainer, { borderColor: theme.border }]}
      >
        <BlurView
          intensity={Platform.OS === 'ios' ? 65 : 45}
          tint={theme.blurTint}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View
          style={[
            styles.pillTintOverlay,
            {
              backgroundColor:
                isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
            },
          ]}
          pointerEvents="none"
        />

        {/* Real-time Top Progress Bar */}
        <CoverFlowMiniPillProgress />

        {/* Capsule Inner Content Row */}
        <View style={styles.pillContentRow}>
          {/* Mini Album Thumbnail */}
          <Image
            source={{ uri: getUniversalStudioArtwork(activeCenterTrack?.thumbnail) }}
            style={styles.pillArtwork}
            contentFit="cover"
            priority="high"
            cachePolicy="memory-disk"
          />

          {/* Title & Artist */}
          <View style={styles.pillInfoCol}>
            <Text
              style={[styles.pillTitle, { color: theme.textPrimary }]}
              numberOfLines={1}
            >
              {cleanText(activeCenterTrack?.title)}
            </Text>
            <Text
              style={[styles.pillArtist, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {cleanArtistName(activeCenterTrack?.artist)}
            </Text>
          </View>

          {/* Micro Equalizer Waveform */}
          <AudioWaveformVisualizer isPlaying={isPlaying && currentTrack?.videoId === activeCenterTrack?.videoId} />

          {/* Real-time Timestamp */}
          <CoverFlowTimeDisplay />
        </View>
      </TouchableOpacity>

      {/* ── Precision Control Bar (Shuffle, Prev, Big Play, Next, Repeat) ── */}
      <View style={styles.controlsRow}>
        {/* Shuffle */}
        <TouchableOpacity
          style={styles.controlIconBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleShuffle();
          }}
        >
          <Ionicons
            name="shuffle"
            size={20}
            color={isShuffle ? '#FC5200' : theme.textMuted}
          />
        </TouchableOpacity>

        {/* Previous Track */}
        <TouchableOpacity
          style={styles.controlIconBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => handleCardPress(-1)}
        >
          <Ionicons
            name="play-skip-back"
            size={22}
            color={theme.textPrimary}
          />
        </TouchableOpacity>

        {/* Big Center Play / Pause Disc */}
        <TouchableOpacity
          style={[
            styles.playPauseDisc,
            {
              backgroundColor: isDark ? '#FFFFFF' : '#111827',
              shadowColor: '#FC5200',
            },
          ]}
          activeOpacity={0.85}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            if (currentTrack?.videoId === activeCenterTrack?.videoId) {
              togglePlay();
            } else {
              playTrack(activeCenterTrack, tracks, currentIndex, 'Dashboard');
            }
          }}
        >
          <Ionicons
            name={
              isPlaying && currentTrack?.videoId === activeCenterTrack?.videoId
                ? 'pause'
                : 'play'
            }
            size={23}
            color={isDark ? '#000000' : '#FFFFFF'}
            style={
              isPlaying && currentTrack?.videoId === activeCenterTrack?.videoId
                ? undefined
                : { marginLeft: 2.5 }
            }
          />
        </TouchableOpacity>

        {/* Next Track */}
        <TouchableOpacity
          style={styles.controlIconBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => handleCardPress(1)}
        >
          <Ionicons
            name="play-skip-forward"
            size={22}
            color={theme.textPrimary}
          />
        </TouchableOpacity>

        {/* Repeat */}
        <TouchableOpacity
          style={styles.controlIconBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleRepeat();
          }}
        >
          <Ionicons
            name="repeat"
            size={20}
            color={isRepeat ? '#FC5200' : theme.textMuted}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  rootWrapper: {
    width: '100%',
    alignItems: 'center',
    position: 'relative',
    marginTop: 6,
    marginBottom: 16,
  },
  ambientGlowContainer: {
    position: 'absolute',
    top: -20,
    width: SCREEN_WIDTH,
    height: CARD_HEIGHT + 140,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  ambientGlow: {
    width: Math.round(SCREEN_WIDTH * 0.94),
    height: Math.round(CARD_HEIGHT * 1.15),
    borderRadius: Math.round(CARD_HEIGHT * 0.58),
  },
  topBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    zIndex: 1,
  },
  topBrandText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  carouselContainer: {
    width: SCREEN_WIDTH,
    height: CARD_HEIGHT + 24,
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
    top: 12,
  },
  cardTouchable: {
    width: '100%',
    height: '100%',
  },
  cardInner: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(18, 18, 24, 0.95)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.38,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardGlassBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: 24,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.20)',
    zIndex: 2,
  },
  cardGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '48%',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 14,
    zIndex: 3,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardArtist: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
  },
  cardBrandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardBrandText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  vibeSubtitle: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: -0.2,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
    zIndex: 1,
  },
  glassPillContainer: {
    width: Math.min(SCREEN_WIDTH - 40, 360),
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    justifyContent: 'center',
    zIndex: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  pillTintOverlay: {
    ...StyleSheet.absoluteFill,
  },
  pillProgressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    zIndex: 4,
  },
  pillProgressFill: {
    height: '100%',
    backgroundColor: '#FC5200',
  },
  pillContentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
    zIndex: 3,
  },
  pillArtwork: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  pillInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  pillTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 1,
  },
  pillArtist: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    height: 18,
    paddingHorizontal: 4,
  },
  waveBar: {
    width: 2.5,
    borderRadius: 1.25,
    backgroundColor: '#FC5200',
  },
  pillTimeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    marginTop: 14,
    zIndex: 3,
  },
  controlIconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseDisc: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
});

export default CoverFlowMusicCarousel;
