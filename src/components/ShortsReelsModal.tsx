import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Animated,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import YoutubePlayer from 'react-native-youtube-iframe';
import * as Haptics from 'expo-haptics';

import { ArtistMusicShort } from '../services/youtubeShortsService';
import { useAudioStore } from '../store/useAudioStore';
import { useLanguageStore } from '../store/useLanguageStore';
import { LiquidGlassSurface } from './LiquidGlassSurface';
import { ToastManager } from './InAppToast';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ShortsReelsModalProps {
  visible: boolean;
  shorts: ArtistMusicShort[];
  initialIndex: number;
  onClose: () => void;
  onSelectArtist?: (artistName: string, artistId?: string) => void;
}

const SHORT_PLAYER_PARAMS = {
  controls: false,
  modestbranding: true,
  rel: false,
  fs: false,
  iv_load_policy: 3,
  preventFullScreen: true,
  showClosedCaptions: false,
  loop: true,
};

export const ShortsReelsModal: React.FC<ShortsReelsModalProps> = ({
  visible,
  shorts,
  initialIndex,
  onClose,
  onSelectArtist,
}) => {
  const insets = useSafeAreaInsets();
  const language = useLanguageStore((s) => s.language);
  const isAr = language === 'ar';
  const rowDirection = isAr ? 'row-reverse' : 'row';
  const textAlign = isAr ? 'right' : 'left';
  const writingDirection = isAr ? 'rtl' : 'ltr';

  const followedArtistIds = useAudioStore((s) => s.followedArtistIds);
  const toggleFollowArtist = useAudioStore((s) => s.toggleFollowArtist);
  const likedTrackIds = useAudioStore((s) => s.likedTrackIds);
  const toggleLike = useAudioStore((s) => s.toggleLike);
  const playTrack = useAudioStore((s) => s.playTrack);
  const pauseAudioIfNeeded = useAudioStore((s) => s.isPlaying);
  const toggleMainPlay = useAudioStore((s) => s.togglePlay);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [muted, setMuted] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(true);
  const [endedVideoId, setEndedVideoId] = useState<string | null>(null);

  const swipeAnimY = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList>(null);

  // Sync activeIndex when opened at a tapped card index
  useEffect(() => {
    if (visible) {
      setActiveIndex(initialIndex);
      setEndedVideoId(null);
      if (pauseAudioIfNeeded) {
        toggleMainPlay();
      }
      setTimeout(() => {
        if (flatListRef.current && initialIndex > 0 && initialIndex < shorts.length) {
          flatListRef.current.scrollToIndex({ index: initialIndex, animated: false });
        }
      }, 60);
    }
  }, [visible, initialIndex, shorts.length]);

  // Smooth vertical bounce animation for "Swipe up to see more" guide
  useEffect(() => {
    if (!visible || !showSwipeHint) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(swipeAnimY, {
          toValue: -26,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(swipeAnimY, {
          toValue: 0,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, showSwipeHint, swipeAnimY]);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const nextIdx = viewableItems[0]?.index;
      if (typeof nextIdx === 'number') {
        setActiveIndex((prev) => {
          if (prev !== nextIdx) {
            setShowSwipeHint(false);
            setEndedVideoId(null);
          }
          return nextIdx;
        });
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 70,
  }).current;

  const handleShare = useCallback(async (item: ArtistMusicShort) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: `${item.title} — ${item.artist}\nhttps://youtube.com/shorts/${item.videoId}`,
      });
    } catch {
      // Ignore cancel
    }
  }, []);

  const handlePlayFullSong = useCallback(
    (item: ArtistMusicShort) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onClose();
      playTrack({
        videoId: item.videoId,
        title: item.title,
        artist: item.artist,
        thumbnail: item.thumbnail,
        duration: item.durationMs || 180000,
      });
      setPlayerModalVisible(true);
    },
    [onClose, playTrack, setPlayerModalVisible]
  );

  const handleToggleFollow = useCallback(
    async (item: ArtistMusicShort) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const artistId = item.artistId || item.artist.toLowerCase().replace(/[^a-z0-9]/g, '_');
      await toggleFollowArtist({
        id: artistId,
        name: item.artist,
        avatar: item.artistAvatar,
      });
    },
    [toggleFollowArtist]
  );

  const handleToggleSaveTrack = useCallback(
    async (item: ArtistMusicShort) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await toggleLike({
        videoId: item.videoId,
        title: item.title,
        artist: item.artist,
        thumbnail: item.thumbnail,
        duration: item.durationMs || 180000,
      });
      ToastManager.show({
        title: isAr ? 'تم التحديث في مكتبتك' : 'Updated in your Library',
        subtitle: item.title,
        icon: 'heart',
        duration: 1800,
      });
    },
    [toggleLike, isAr]
  );

  // Full 9:16 cover aspect width for 16:9 YouTube player
  const videoPlayerWidth = Math.ceil(SCREEN_HEIGHT * (16 / 9));

  const renderShortItem = ({ item, index }: { item: ArtistMusicShort; index: number }) => {
    const isActive = visible && index === activeIndex;
    const isPlayingNow = isActive && endedVideoId !== item.videoId;
    const artistKey = item.artistId || item.artist.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const isFollowing = followedArtistIds.includes(artistKey) || followedArtistIds.includes(item.artist);
    const isLiked = likedTrackIds.includes(item.videoId);

    return (
      <View style={styles.reelPage}>
        {/* Poster Fallback Background */}
        <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" />

        {/* Active YouTube Short Video Layer (only 1 mounted at a time for smooth 60/120fps) */}
        {isActive && (
          <View style={styles.videoClipBox} pointerEvents="none">
            <YoutubePlayer
              height={SCREEN_HEIGHT}
              width={videoPlayerWidth}
              play={isPlayingNow}
              mute={muted}
              videoId={item.videoId}
              initialPlayerParams={SHORT_PLAYER_PARAMS}
              onChangeState={(state: string) => {
                if (state === 'ended') {
                  setEndedVideoId(item.videoId);
                }
              }}
            />
          </View>
        )}

        {/* Top & Bottom Vignette Gradients */}
        <LinearGradient
          colors={['rgba(0,0,0,0.65)', 'transparent', 'transparent', 'rgba(0,0,0,0.88)']}
          locations={[0, 0.22, 0.58, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* ── Bottom Artist & Track Glass Overlay ── */}
        <View
          style={[
            styles.bottomHud,
            { paddingBottom: Math.max(insets.bottom + 14, 28) },
          ]}
        >
          {/* Artist Row + Follow + Share */}
          <View style={[styles.artistRow, { flexDirection: rowDirection }]}>
            <TouchableOpacity
              style={[styles.artistTapArea, { flexDirection: rowDirection }]}
              activeOpacity={0.85}
              onPress={() => {
                onClose();
                onSelectArtist?.(item.artist, item.artistId);
              }}
            >
              <Image
                source={{ uri: item.artistAvatar || item.thumbnail }}
                style={styles.artistAvatar}
                contentFit="cover"
              />
              <View style={{ alignItems: isAr ? 'flex-end' : 'flex-start', flexShrink: 1 }}>
                <View style={[styles.artistNameRow, { flexDirection: rowDirection }]}>
                  <Text style={[styles.artistName, { writingDirection }]} numberOfLines={1}>
                    {item.artist}
                  </Text>
                  {item.isOfficialArtist && (
                    <Ionicons name="checkmark-circle" size={15} color="#38BDF8" />
                  )}
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleToggleFollow(item)} activeOpacity={0.8}>
              <LiquidGlassSurface
                glassStyle="regular"
                isDark
                isInteractive
                tintColor={isFollowing ? 'rgba(52, 199, 89, 0.3)' : undefined}
                borderRadius={18}
                style={[styles.followBtn, isFollowing && styles.followBtnActive]}
              >
                <Text style={[styles.followBtnTxt, { writingDirection }]}>
                  {isFollowing
                    ? isAr
                      ? 'متابع ✓'
                      : 'Following'
                    : isAr
                    ? 'متابعة'
                    : 'Follow'}
                </Text>
              </LiquidGlassSurface>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleShare(item)} style={styles.shareBtn} activeOpacity={0.8}>
              <Ionicons name="share-outline" size={21} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Genre Hashtags */}
          <Text style={[styles.hashtagsLine, { textAlign, writingDirection }]} numberOfLines={1}>
            {item.tags.join('  ')}
          </Text>

          {/* Bottom Liquid Glass Track Pill */}
          <TouchableOpacity activeOpacity={0.88} onPress={() => handlePlayFullSong(item)}>
            <LiquidGlassSurface
              glassStyle="regular"
              isDark
              isInteractive
              borderRadius={18}
              style={[styles.trackPill, { flexDirection: rowDirection }]}
            >
              <Image source={{ uri: item.thumbnail }} style={styles.trackThumb} contentFit="cover" />
              <View style={styles.trackTexts}>
                <Text style={[styles.trackTitle, { textAlign, writingDirection }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.trackArtist, { textAlign, writingDirection }]} numberOfLines={1}>
                  {item.artist}
                </Text>
              </View>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleToggleSaveTrack(item);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={isLiked ? 'checkmark-circle' : 'add-circle-outline'}
                  size={26}
                  color={isLiked ? '#34C759' : '#FFFFFF'}
                />
              </TouchableOpacity>
            </LiquidGlassSurface>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const activeShort = shorts[activeIndex];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={styles.modalContainer}>
        <FlatList
          ref={flatListRef}
          data={shorts}
          keyExtractor={(item, idx) => `${item.videoId}-${idx}`}
          renderItem={renderShortItem}
          pagingEnabled
          snapToInterval={SCREEN_HEIGHT}
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: SCREEN_HEIGHT,
            offset: SCREEN_HEIGHT * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onScrollBeginDrag={() => {
            if (showSwipeHint) setShowSwipeHint(false);
          }}
        />

        {/* ── Top Story Indicators & Controls Overlay ── */}
        <View style={[styles.topOverlay, { paddingTop: Math.max(insets.top + 8, 22) }]} pointerEvents="box-none">
          {/* Progress Dots */}
          <View style={styles.storyDotsRow}>
            {shorts.slice(0, 8).map((s, idx) => (
              <View
                key={`dot-${s.videoId}-${idx}`}
                style={[
                  styles.storyDot,
                  idx === activeIndex % Math.min(shorts.length, 8) && styles.storyDotActive,
                ]}
              />
            ))}
          </View>

          <View style={styles.topActionsRow}>
            <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
              <LiquidGlassSurface
                glassStyle="regular"
                isDark
                isInteractive
                borderRadius={20}
                style={styles.topCircleBtn}
              >
                <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
              </LiquidGlassSurface>
            </TouchableOpacity>

            <Text style={styles.topHashtag}>
              {activeShort?.hashtag || '#music'}
            </Text>

            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setMuted((prev) => !prev);
              }}
              activeOpacity={0.8}
            >
              <LiquidGlassSurface
                glassStyle="regular"
                isDark
                isInteractive
                borderRadius={20}
                style={styles.topCircleBtn}
              >
                <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color="#FFFFFF" />
              </LiquidGlassSurface>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── "Swipe up to see more" Guide (Disappears on first vertical swipe) ── */}
        {showSwipeHint && (
          <View style={styles.swipeHintOverlay} pointerEvents="none">
            <Animated.View style={[styles.swipeHandWrap, { transform: [{ translateY: swipeAnimY }] }]}>
              <View style={styles.swipeTrackTrail} />
              <Ionicons name="hand-left-outline" size={34} color="#FFFFFF" />
            </Animated.View>
            <Text style={[styles.swipeHintText, { writingDirection }]}>
              {isAr ? 'اسحب للأعلى لمشاهدة المزيد' : 'Swipe up to see more'}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#05070C',
  },
  reelPage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#05070C',
    overflow: 'hidden',
  },
  videoClipBox: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 20,
  },
  storyDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginBottom: 12,
  },
  storyDot: {
    width: 6,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  storyDotActive: {
    width: 20,
    backgroundColor: '#FFFFFF',
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  topHashtag: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  swipeHintOverlay: {
    position: 'absolute',
    top: '44%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 15,
  },
  swipeHandWrap: {
    alignItems: 'center',
    marginBottom: 14,
  },
  swipeTrackTrail: {
    width: 36,
    height: 60,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginBottom: -28,
  },
  swipeHintText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  bottomHud: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    zIndex: 18,
  },
  artistRow: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  artistTapArea: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
  },
  artistAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  artistNameRow: {
    alignItems: 'center',
    gap: 5,
  },
  artistName: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
    flexShrink: 1,
  },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.36)',
    overflow: 'hidden',
  },
  followBtnActive: {
    borderColor: 'rgba(52, 199, 89, 0.7)',
  },
  followBtnTxt: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hashtagsLine: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 12,
  },
  trackPill: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(18, 22, 30, 0.56)',
    padding: 10,
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  trackThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  trackTexts: {
    flex: 1,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  trackArtist: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 2,
  },
});

export default ShortsReelsModal;
