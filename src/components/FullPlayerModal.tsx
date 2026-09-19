import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  Platform,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
  Easing,
  useDerivedValue,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { useAudioStore } from '../store/useAudioStore';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Responsive Dimensions ──
const ARTWORK_SIZE = Math.min(SCREEN_WIDTH - 64, SCREEN_HEIGHT * 0.38, 340);

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    modalRoot: {
      flex: 1,
      backgroundColor: theme.mode === 'light' ? '#F0EFEA' : '#0A0B0E',
      zIndex: 999999,
      elevation: 999999,
    },
    gestureRoot: {
      flex: 1,
    },
    modalContainer: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: theme.mode === 'light' ? '#F0EFEA' : '#0A0B0E',
    },
    ambientGlowContainer: {
      ...StyleSheet.absoluteFillObject,
      overflow: 'hidden',
    },
    ambientArtwork: {
      width: SCREEN_WIDTH * 1.5,
      height: SCREEN_HEIGHT * 0.75,
      position: 'absolute',
      top: -SCREEN_HEIGHT * 0.1,
      left: -SCREEN_WIDTH * 0.25,
      opacity: theme.mode === 'light' ? 0.35 : 0.45,
    },
    ambientVignette: {
      ...StyleSheet.absoluteFillObject,
    },
    contentWrapper: {
      flex: 1,
      justifyContent: 'space-between',
    },
    grabHandleContainer: {
      width: '100%',
      alignItems: 'center',
      paddingTop: 8,
      paddingBottom: 4,
    },
    grabHandle: {
      width: 38,
      height: 4.5,
      borderRadius: 2.5,
      backgroundColor:
        theme.mode === 'light' ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.28)',
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 4,
    },
    headerIconBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 22,
    },
    headerCenter: {
      alignItems: 'center',
      flex: 1,
      marginHorizontal: 10,
    },
    headerContext: {
      color: theme.mode === 'light' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      marginBottom: 2,
    },
    headerTitle: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    artworkContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SCREEN_HEIGHT > 750 ? 16 : 8,
    },
    artworkCard: {
      width: ARTWORK_SIZE,
      height: ARTWORK_SIZE,
      borderRadius: 24,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor:
        theme.mode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: theme.mode === 'light' ? 0.18 : 0.45,
          shadowRadius: 28,
        },
        android: {
          elevation: 12,
        },
      }),
    },
    artworkImage: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.surfaceSubtle,
    },
    bottomSection: {
      paddingHorizontal: 26,
      paddingBottom: Platform.OS === 'ios' ? 24 : 32,
    },
    trackMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    trackMetaInfo: {
      flex: 1,
      marginRight: 16,
    },
    songTitle: {
      color: theme.textPrimary,
      fontSize: SCREEN_HEIGHT > 750 ? 23 : 20,
      fontWeight: '800',
      letterSpacing: -0.4,
      marginBottom: 3,
    },
    artistClickable: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    artistName: {
      color: theme.mode === 'light' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.65)',
      fontSize: 16,
      fontWeight: '600',
    },
    likeBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    qualityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    qualityPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor:
        theme.mode === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        theme.mode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)',
    },
    qualityPillText: {
      color: theme.textPrimary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    scrubberContainer: {
      marginVertical: 4,
    },
    slider: {
      width: '105%',
      marginLeft: '-2.5%',
      height: 36,
    },
    timeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: -6,
      paddingHorizontal: 2,
    },
    timeText: {
      color: theme.mode === 'light' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)',
      fontSize: 12,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    controlsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 18,
      marginBottom: 26,
      paddingHorizontal: 6,
    },
    secondaryBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    skipBtn: {
      width: 52,
      height: 52,
      justifyContent: 'center',
      alignItems: 'center',
    },
    playPauseBtn: {
      width: 74,
      height: 74,
      borderRadius: 37,
      backgroundColor: theme.textPrimary,
      justifyContent: 'center',
      alignItems: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: theme.mode === 'light' ? 0.2 : 0.4,
          shadowRadius: 12,
        },
        android: {
          elevation: 8,
        },
      }),
    },
    repeatBadge: {
      position: 'absolute',
      top: -3,
      right: -5,
      width: 13,
      height: 13,
      borderRadius: 6.5,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    repeatBadgeText: {
      color: '#000',
      fontSize: 8,
      fontWeight: '900',
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingTop: 2,
    },
    footerIconBtn: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

interface FullPlayerModalProps {
  visible?: boolean;
  onClose?: () => void;
}

export const FullPlayerModal: React.FC<FullPlayerModalProps> = ({
  visible,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const {
    isPlayerModalVisible,
    setPlayerModalVisible,
    currentTrack,
    isPlaying,
    togglePlay,
    positionMillis,
    durationMillis,
    seekTo,
    nextTrack,
    prevTrack,
    likedTrackIds,
    toggleLike,
    currentContextName,
    isShuffle,
    toggleShuffle,
    repeatMode,
    toggleRepeat,
    preferredQuality,
    setAudioQuality,
  } = useAudioStore();

  const isModalVisible = visible !== undefined ? visible : isPlayerModalVisible;
  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      setPlayerModalVisible(false);
    }
  }, [onClose, setPlayerModalVisible]);

  // ── Scrubbing Logic (Frictionless Local Control) ──
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  // ── Reanimated Pan to Dismiss State ──
  const translateY = useSharedValue(SCREEN_HEIGHT);

  const triggerDismissHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // When modal visibility toggles, enter with smooth Apple spring
  useEffect(() => {
    if (isModalVisible) {
      translateY.value = SCREEN_HEIGHT;
      translateY.value = withSpring(0, {
        damping: 26,
        stiffness: 260,
        mass: 0.9,
      });
    } else {
      translateY.value = SCREEN_HEIGHT;
    }
  }, [isModalVisible]);

  // Smooth dismiss handler
  const handleDismiss = useCallback(() => {
    triggerDismissHaptic();
    translateY.value = withTiming(
      SCREEN_HEIGHT,
      {
        duration: 220,
        easing: Easing.in(Easing.quad),
      },
      (finished) => {
        if (finished) {
          runOnJS(handleClose)();
        }
      }
    );
  }, [handleClose]);

  // ── Interactive Pan Gesture (Apple-Grade Pan-to-Dismiss) ──
  // failOffsetX ensures horizontal scrubber drags NEVER get intercepted by vertical dismiss
  const panGesture = Gesture.Pan()
    .activeOffsetY([16, 16])
    .failOffsetX([-15, 15])
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      } else {
        // Rubber-band resistance when dragging up
        translateY.value = event.translationY * 0.2;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 150 || event.velocityY > 700) {
        translateY.value = withTiming(
          SCREEN_HEIGHT,
          {
            duration: 220,
            easing: Easing.out(Easing.quad),
          },
          (finished) => {
            if (finished) {
              runOnJS(onClose)();
            }
          }
        );
        runOnJS(triggerDismissHaptic)();
      } else {
        translateY.value = withSpring(0, { damping: 24, stiffness: 260 });
      }
    });

  // Modal Scale & Border Radius Interpolation based on pan offset
  const animatedModalStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT * 0.6],
      [1, 0.90],
      Extrapolation.CLAMP
    );
    const borderRadius = interpolate(
      translateY.value,
      [0, 200],
      [0, 36],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ translateY: translateY.value }, { scale }],
      borderRadius,
    };
  });

  // ── Artwork Subtle Play/Pause Breath Scale (Apple Music Physics) ──
  const artworkScale = useDerivedValue(() => {
    return withTiming(isPlaying ? 1.0 : 0.88, {
      duration: 350,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  });

  const animatedArtworkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: artworkScale.value }],
  }));

  const formatTime = (millis: number) => {
    const totalSeconds = Math.max(0, Math.floor(millis / 1000));
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleShare = async () => {
    if (!currentTrack) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({
        message: `Listening to "${currentTrack.title}" by ${currentTrack.artist} on Nouble!`,
      });
    } catch (e) {}
  };

  if (!currentTrack) return null;

  const isLiked = likedTrackIds.includes(currentTrack.videoId);
  const validDuration = durationMillis > 0 ? durationMillis : (currentTrack.duration || 180000);
  const displayPosition = isScrubbing ? scrubValue : positionMillis;

  return (
    <Modal
      visible={isModalVisible}
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent={true}
      transparent={true}
      onRequestClose={handleDismiss}
    >
      <View style={styles.modalRoot}>
        <GestureHandlerRootView style={styles.gestureRoot}>
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.modalContainer, animatedModalStyle]}>
              {/* ── 1. Adaptive Ambient Artwork Glow (140% Scaled Blurred Layer) ── */}
              <View style={styles.ambientGlowContainer} pointerEvents="none">
                <Image
                  source={{
                    uri:
                      currentTrack.thumbnail ||
                      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400',
                  }}
                  style={styles.ambientArtwork}
                  contentFit="cover"
                  transition={300}
                />
                <BlurView
                  intensity={Platform.OS === 'ios' ? 85 : 60}
                  tint={theme.mode === 'light' ? 'light' : 'dark'}
                  style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                  colors={
                    theme.mode === 'light'
                      ? [
                          'rgba(240, 239, 234, 0.45)',
                          'rgba(240, 239, 234, 0.82)',
                          'rgba(240, 239, 234, 0.98)',
                        ]
                      : [
                          'rgba(10, 11, 14, 0.42)',
                          'rgba(10, 11, 14, 0.80)',
                          'rgba(10, 11, 14, 0.98)',
                        ]
                  }
                  style={styles.ambientVignette}
                />
              </View>

              {/* ── 2. Content Layout ── */}
              <View style={[styles.contentWrapper, { paddingTop: Math.max(insets.top, 16) }]}>
                {/* Grab Handle */}
                <View style={styles.grabHandleContainer} pointerEvents="none">
                  <View style={styles.grabHandle} />
                </View>

                {/* Top Navigation Bar */}
                <View style={styles.headerRow}>
                  <TouchableOpacity
                    onPress={handleDismiss}
                    style={styles.headerIconBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={28}
                      color={theme.textPrimary}
                    />
                  </TouchableOpacity>

                  <View style={styles.headerCenter}>
                    <Text style={styles.headerContext} numberOfLines={1}>
                      PLAYING FROM {currentContextName?.toUpperCase() || 'DAILY CADENCE'}
                    </Text>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                      {currentTrack.artist || 'Nouble Fitness'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={handleShare}
                    style={styles.headerIconBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons
                      name="ellipsis-horizontal"
                      size={22}
                      color={theme.textPrimary}
                    />
                  </TouchableOpacity>
                </View>

                {/* ── 3. Centered Artwork with Dynamic Scale & Shadow ── */}
                <View style={styles.artworkContainer}>
                  <Animated.View style={[styles.artworkCard, animatedArtworkStyle]}>
                    <Image
                      source={{
                        uri:
                          currentTrack.thumbnail ||
                          'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600',
                      }}
                      style={styles.artworkImage}
                      contentFit="cover"
                      transition={250}
                    />
                  </Animated.View>
                </View>

                {/* ── 4. Bottom Controls Section ── */}
                <View style={styles.bottomSection}>
                  {/* Track Meta Row */}
                  <View style={styles.trackMetaRow}>
                    <View style={styles.trackMetaInfo}>
                      <Text style={styles.songTitle} numberOfLines={1}>
                        {currentTrack.title || 'Track Title'}
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          handleDismiss();
                          if (currentTrack.artist) {
                            navigation.navigate('ArtistDetails', {
                              artistName: currentTrack.artist,
                            });
                          }
                        }}
                        activeOpacity={0.7}
                        style={styles.artistClickable}
                      >
                        <Text style={styles.artistName} numberOfLines={1}>
                          {currentTrack.artist || 'Artist'}
                        </Text>
                        {currentTrack.isOfficial && (
                          <Ionicons
                            name="checkmark-circle"
                            size={15}
                            color="#458eff"
                          />
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* Like Heart Button with Instant Haptics */}
                    <TouchableOpacity
                      style={styles.likeBtn}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      onPress={() => {
                        toggleLike(currentTrack);
                      }}
                    >
                      <Ionicons
                        name={isLiked ? 'heart' : 'heart-outline'}
                        size={28}
                        color={isLiked ? '#FF3B30' : theme.textPrimary}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Quality Switcher Pill */}
                  <View style={styles.qualityRow}>
                    <TouchableOpacity
                      style={styles.qualityPill}
                      activeOpacity={0.75}
                      onPress={() => {
                        const nextQuality =
                          preferredQuality === 'hd320'
                            ? 'standard'
                            : preferredQuality === 'standard'
                            ? 'saver'
                            : 'hd320';
                        setAudioQuality(nextQuality);
                      }}
                    >
                      <Ionicons
                        name="sparkles"
                        size={12}
                        color={colors.primary}
                      />
                      <Text style={styles.qualityPillText}>
                        {preferredQuality === 'hd320'
                          ? 'HD AUDIO • 320 KBPS'
                          : preferredQuality === 'standard'
                          ? 'HQ AUDIO • 192 KBPS'
                          : 'DATA SAVER • 128 KBPS'}
                      </Text>
                      <Ionicons
                        name="swap-horizontal"
                        size={12}
                        color={theme.mode === 'light' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* ── 5. Frictionless Scrubber ── */}
                  <View style={styles.scrubberContainer}>
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={validDuration}
                      value={Math.min(displayPosition, validDuration)}
                      onValueChange={(val) => {
                        setIsScrubbing(true);
                        setScrubValue(val);
                      }}
                      onSlidingComplete={async (val) => {
                        await seekTo(val);
                        setIsScrubbing(false);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      }}
                      minimumTrackTintColor={theme.textPrimary}
                      maximumTrackTintColor={
                        theme.mode === 'light'
                          ? 'rgba(0,0,0,0.12)'
                          : 'rgba(255,255,255,0.18)'
                      }
                      thumbTintColor={theme.textPrimary}
                    />
                    <View style={styles.timeRow}>
                      <Text style={styles.timeText}>
                        {formatTime(displayPosition)}
                      </Text>
                      <Text style={styles.timeText}>
                        {formatTime(validDuration)}
                      </Text>
                    </View>
                  </View>

                  {/* ── 6. Main Controls Row ── */}
                  <View style={styles.controlsRow}>
                    {/* Shuffle */}
                    <TouchableOpacity
                      style={[styles.secondaryBtn, isShuffle && { opacity: 1 }]}
                      onPress={toggleShuffle}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Ionicons
                        name="shuffle"
                        size={24}
                        color={
                          isShuffle
                            ? colors.primary
                            : theme.mode === 'light'
                            ? 'rgba(0,0,0,0.45)'
                            : 'rgba(255,255,255,0.45)'
                        }
                      />
                    </TouchableOpacity>

                    {/* Prev */}
                    <TouchableOpacity
                      style={styles.skipBtn}
                      onPress={prevTrack}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Ionicons
                        name="play-skip-back"
                        size={32}
                        color={theme.textPrimary}
                      />
                    </TouchableOpacity>

                    {/* Play / Pause (Instant 0ms Tactile Button) */}
                    <TouchableOpacity
                      onPress={togglePlay}
                      style={styles.playPauseBtn}
                      activeOpacity={0.85}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Ionicons
                        name={isPlaying ? 'pause' : 'play'}
                        size={38}
                        color={theme.mode === 'light' ? '#FFFFFF' : '#000000'}
                        style={{ marginLeft: isPlaying ? 0 : 3 }}
                      />
                    </TouchableOpacity>

                    {/* Next */}
                    <TouchableOpacity
                      style={styles.skipBtn}
                      onPress={nextTrack}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Ionicons
                        name="play-skip-forward"
                        size={32}
                        color={theme.textPrimary}
                      />
                    </TouchableOpacity>

                    {/* Repeat */}
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={toggleRepeat}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <View style={{ position: 'relative' }}>
                        <Ionicons
                          name="repeat"
                          size={24}
                          color={
                            repeatMode !== 'off'
                              ? colors.primary
                              : theme.mode === 'light'
                              ? 'rgba(0,0,0,0.45)'
                              : 'rgba(255,255,255,0.45)'
                          }
                        />
                        {repeatMode === 'one' && (
                          <View style={styles.repeatBadge}>
                            <Text style={styles.repeatBadgeText}>1</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* ── 7. Footer Audio Output & Quick Actions ── */}
                  <View style={styles.footerRow}>
                    <TouchableOpacity
                      style={styles.footerIconBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name="headset-outline"
                        size={22}
                        color={theme.mode === 'light' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)'}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.footerIconBtn}
                      onPress={handleShare}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name="share-outline"
                        size={22}
                        color={theme.mode === 'light' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)'}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.footerIconBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name="list-outline"
                        size={22}
                        color={theme.mode === 'light' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)'}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Animated.View>
          </GestureDetector>
        </GestureHandlerRootView>
      </View>
    </Modal>
  );
};

export default FullPlayerModal;
