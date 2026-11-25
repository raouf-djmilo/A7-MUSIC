import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Animated,
  Share,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import YoutubePlayer, { YoutubeIframeRef } from 'react-native-youtube-iframe';
import * as Haptics from 'expo-haptics';

import {
  ArtistMusicShort,
  fetchMoreArtistShortsBatch,
} from '../services/youtubeShortsService';
import { useAudioStore } from '../store/useAudioStore';
import { useLanguageStore } from '../store/useLanguageStore';
import { LiquidGlassSurface } from './LiquidGlassSurface';
import { ToastManager } from './InAppToast';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ShortsReelsModalProps {
  visible: boolean;
  shorts: ArtistMusicShort[];
  initialIndex: number;
  userId?: string;
  followedArtistNames?: string[];
  onFeedGrow?: (updatedFeed: ArtistMusicShort[]) => void;
  onClose: () => void;
  onSelectArtist?: (artist: { name: string; id?: string; avatar?: string; isOfficial?: boolean }) => void;
}

const SHORT_PLAYER_PARAMS = {
  controls: false,
  modestbranding: true,
  rel: false,
  fs: false,
  iv_load_policy: 3,
  preventFullScreen: true,
  showClosedCaptions: false,
  loop: false,
};

const WEBVIEW_PROPS = {
  allowsInlineMediaPlayback: true,
  mediaPlaybackRequiresUserAction: false,
};

const VIDEO_PLAYER_WIDTH = Math.ceil(SCREEN_HEIGHT * (16 / 9));

interface ReelPageItemProps {
  item: ArtistMusicShort;
  isActive: boolean;
  shouldPreload: boolean;
  muted: boolean;
  paused: boolean;
  ended: boolean;
  isAr: boolean;
  isFollowing: boolean;
  isLiked: boolean;
  bottomInset: number;
  onTogglePlayPause: () => void;
  onReplay: (videoId: string) => void;
  onOpenChannel: (item: ArtistMusicShort) => void;
  onToggleFollow: (item: ArtistMusicShort) => void;
  onShare: (item: ArtistMusicShort) => void;
  onPlayFullSong: (item: ArtistMusicShort) => void;
  onToggleLike: (item: ArtistMusicShort) => void;
  onVideoEnded: (videoId: string) => void;
}

const ReelPageItem = memo(
  ({
    item,
    isActive,
    shouldPreload,
    muted,
    paused,
    ended,
    isAr,
    isFollowing,
    isLiked,
    bottomInset,
    onTogglePlayPause,
    onReplay,
    onOpenChannel,
    onToggleFollow,
    onShare,
    onPlayFullSong,
    onToggleLike,
    onVideoEnded,
  }: ReelPageItemProps) => {
    const playerRef = useRef<YoutubeIframeRef>(null);
    const [playerReady, setPlayerReady] = useState(false);

    const rowDirection = isAr ? 'row-reverse' : 'row';
    const textAlign = isAr ? 'right' : 'left';
    const writingDirection = isAr ? 'rtl' : 'ltr';

    const isMounted = isActive || shouldPreload;
    const isPlayingNow = isActive && !paused && !ended;

    // Enforce mute/unmute directly on playerReady and when muted changes
    useEffect(() => {
      if (!playerReady || !isActive) return;
      if (isPlayingNow) {
        (playerRef.current as any)?.playVideo?.();
      } else {
        (playerRef.current as any)?.pauseVideo?.();
      }
    }, [playerReady, isActive, isPlayingNow]);

    const handleReplayPress = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      playerRef.current?.seekTo(0, true);
      (playerRef.current as any)?.playVideo?.();
      onReplay(item.videoId);
    };

    return (
      <View style={styles.reelPage}>
        <Image
          source={{ uri: item.thumbnail }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={item.videoId}
        />

        {/* Active or Preloaded Next Video (Instant 150ms switch on swipe) */}
        {isMounted && (
          <View style={styles.videoClipBox} pointerEvents="none">
            <YoutubePlayer
              ref={playerRef}
              height={SCREEN_HEIGHT}
              width={VIDEO_PLAYER_WIDTH}
              play={isPlayingNow}
              mute={isActive ? muted : true}
              volume={isActive && !muted ? 100 : 0}
              videoId={item.videoId}
              initialPlayerParams={SHORT_PLAYER_PARAMS}
              webViewProps={WEBVIEW_PROPS}
              onReady={() => setPlayerReady(true)}
              onChangeState={(state: string) => {
                if (state === 'ended' && isActive) {
                  onVideoEnded(item.videoId);
                }
              }}
            />
          </View>
        )}

        <LinearGradient
          colors={['rgba(0,0,0,0.62)', 'transparent', 'transparent', 'rgba(0,0,0,0.88)']}
          locations={[0, 0.22, 0.56, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Center Tap Area for Play/Pause + Center Restart / Pause Overlay */}
        <Pressable style={styles.centerTapZone} onPress={ended ? handleReplayPress : onTogglePlayPause}>
          {ended ? (
            <TouchableOpacity onPress={handleReplayPress} activeOpacity={0.85}>
              <LiquidGlassSurface
                glassStyle="regular"
                isDark
                isInteractive
                borderRadius={36}
                style={styles.centerActionPill}
              >
                <Ionicons name="refresh" size={32} color="#FFFFFF" />
                <Text style={[styles.centerActionTxt, { writingDirection }]}>
                  {isAr ? 'إعادة التشغيل' : 'Replay'}
                </Text>
              </LiquidGlassSurface>
            </TouchableOpacity>
          ) : paused ? (
            <LiquidGlassSurface
              glassStyle="regular"
              isDark
              isInteractive={false}
              borderRadius={34}
              style={styles.centerPauseOrb}
            >
              <Ionicons name="play" size={32} color="#FFFFFF" style={{ marginLeft: 3 }} />
            </LiquidGlassSurface>
          ) : null}
        </Pressable>

        {/* ── Bottom Artist Channel & Track Liquid Glass Overlay ── */}
        <View
          style={[
            styles.bottomHud,
            { paddingBottom: Math.max(bottomInset + 14, 28) },
          ]}
        >
          {/* Artist Channel Row */}
          <View style={[styles.artistRow, { flexDirection: rowDirection }]}>
            <TouchableOpacity
              style={[styles.artistTapArea, { flexDirection: rowDirection }]}
              activeOpacity={0.82}
              onPress={() => onOpenChannel(item)}
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
                <View style={[styles.viewChannelSubRow, { flexDirection: rowDirection }]}>
                  <Text style={[styles.viewChannelSub, { writingDirection }]}>
                    {isAr ? 'دخول القناة والموسيقى' : 'Open Artist Channel'}
                  </Text>
                  <Ionicons
                    name={isAr ? 'chevron-back' : 'chevron-forward'}
                    size={12}
                    color="rgba(255,255,255,0.72)"
                  />
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => onToggleFollow(item)} activeOpacity={0.8}>
              <LiquidGlassSurface
                glassStyle="regular"
                isDark
                isInteractive
                tintColor={isFollowing ? 'rgba(52, 199, 89, 0.3)' : undefined}
                borderRadius={18}
                style={[styles.followBtn, isFollowing && styles.followBtnActive]}
              >
                <Text style={[styles.followBtnTxt, { writingDirection }]}>
                  {isFollowing ? (isAr ? 'متابع ✓' : 'Following') : isAr ? 'متابعة' : 'Follow'}
                </Text>
              </LiquidGlassSurface>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => onShare(item)}
              style={styles.shareBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="share-outline" size={21} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <Text style={[styles.hashtagsLine, { textAlign, writingDirection }]} numberOfLines={1}>
            {item.tags.join('  ')}
          </Text>

          {/* Bottom Liquid Glass Track Pill */}
          <TouchableOpacity activeOpacity={0.88} onPress={() => onPlayFullSong(item)}>
            <LiquidGlassSurface
              glassStyle="regular"
              isDark
              isInteractive
              borderRadius={18}
              style={[styles.trackPill, { flexDirection: rowDirection }]}
            >
              <Image
                source={{ uri: item.thumbnail }}
                style={styles.trackThumb}
                contentFit="cover"
              />
              <View style={styles.trackTexts}>
                <Text style={[styles.trackTitle, { textAlign, writingDirection }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text
                  style={[styles.trackArtist, { textAlign, writingDirection }]}
                  numberOfLines={1}
                >
                  {item.artist}
                </Text>
              </View>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onToggleLike(item);
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
  }
);

export const ShortsReelsModal: React.FC<ShortsReelsModalProps> = ({
  visible,
  shorts,
  initialIndex,
  userId = 'guest',
  followedArtistNames = [],
  onFeedGrow,
  onClose,
  onSelectArtist,
}) => {
  const insets = useSafeAreaInsets();
  const language = useLanguageStore((s) => s.language);
  const isAr = language === 'ar';

  const followedArtistIds = useAudioStore((s) => s.followedArtistIds);
  const toggleFollowArtist = useAudioStore((s) => s.toggleFollowArtist);
  const likedTrackIds = useAudioStore((s) => s.likedTrackIds);
  const toggleLike = useAudioStore((s) => s.toggleLike);
  const playTrack = useAudioStore((s) => s.playTrack);
  const isMainAudioPlaying = useAudioStore((s) => s.isPlaying);
  const toggleMainPlay = useAudioStore((s) => s.togglePlay);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);

  const [feed, setFeed] = useState<ArtistMusicShort[]>(shorts);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [muted, setMuted] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(true);
  const [endedVideoId, setEndedVideoId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const swipeAnimY = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList>(null);
  const pageRef = useRef(1);
  const isFetchingMoreRef = useRef(false);
  const feedRef = useRef<ArtistMusicShort[]>(shorts);
  feedRef.current = feed;

  useEffect(() => {
    if (visible) {
      setFeed((prev) => (prev.length >= shorts.length ? prev : shorts));
      setActiveIndex(initialIndex);
      setEndedVideoId(null);
      setUserPaused(false);
      if (isMainAudioPlaying) {
        toggleMainPlay();
      }
      setTimeout(() => {
        if (flatListRef.current && initialIndex > 0) {
          flatListRef.current.scrollToIndex({ index: initialIndex, animated: false });
        }
      }, 60);
    }
  }, [visible, initialIndex, shorts]);

  const loadMoreShorts = useCallback(async () => {
    if (isFetchingMoreRef.current) return;
    isFetchingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const excludeIds = feedRef.current.map((s) => s.videoId);
      const nextBatch = await fetchMoreArtistShortsBatch(
        pageRef.current,
        excludeIds,
        followedArtistNames,
        userId
      );
      pageRef.current += 1;

      if (nextBatch.length > 0) {
        const currentFeed = feedRef.current;
        const existing = new Set(currentFeed.map((x) => x.videoId));
        const unique = nextBatch.filter((x) => !existing.has(x.videoId));
        if (unique.length > 0) {
          const merged = [...currentFeed, ...unique];
          setFeed(merged);
          onFeedGrow?.(merged);
        }
      }
    } catch {
      // Fail gracefully
    } finally {
      isFetchingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [followedArtistNames, userId, onFeedGrow]);

  useEffect(() => {
    if (visible && feed.length > 0 && activeIndex >= feed.length - 4) {
      loadMoreShorts();
    }
  }, [visible, activeIndex, feed.length, loadMoreShorts]);

  useEffect(() => {
    if (!visible || !showSwipeHint) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(swipeAnimY, {
          toValue: -24,
          duration: 720,
          useNativeDriver: true,
        }),
        Animated.timing(swipeAnimY, {
          toValue: 0,
          duration: 720,
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
            setUserPaused(false);
          }
          return nextIdx;
        });
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 70,
  }).current;

  const handleTogglePlayPause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUserPaused((prev) => !prev);
  }, []);

  const handleReplay = useCallback(() => {
    setEndedVideoId(null);
    setUserPaused(false);
  }, []);

  const handleOpenChannel = useCallback(
    (item: ArtistMusicShort) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onClose();
      onSelectArtist?.({
        name: item.artist,
        id: item.artistId,
        avatar: item.artistAvatar,
        isOfficial: item.isOfficialArtist,
      });
    },
    [onClose, onSelectArtist]
  );

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
      await toggleFollowArtist({
        id: item.artist,
        name: item.artist,
        avatar: item.artistAvatar,
      });
    },
    [toggleFollowArtist]
  );

  const handleToggleLike = useCallback(
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
        title: isAr ? 'تم الحفظ في مكتبتك' : 'Saved to your Library',
        subtitle: item.title,
        icon: 'heart',
        duration: 1800,
      });
    },
    [toggleLike, isAr]
  );

  const handleVideoEnded = useCallback((videoId: string) => {
    setEndedVideoId(videoId);
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: ArtistMusicShort; index: number }) => {
      const isActive = visible && index === activeIndex;
      const shouldPreload = visible && index === activeIndex + 1;
      const isFollowing = followedArtistIds.includes(item.artist);
      const isLiked = likedTrackIds.includes(item.videoId);

      return (
        <ReelPageItem
          item={item}
          isActive={isActive}
          shouldPreload={shouldPreload}
          muted={muted}
          paused={userPaused}
          ended={endedVideoId === item.videoId}
          isAr={isAr}
          isFollowing={isFollowing}
          isLiked={isLiked}
          bottomInset={insets.bottom}
          onTogglePlayPause={handleTogglePlayPause}
          onReplay={handleReplay}
          onOpenChannel={handleOpenChannel}
          onToggleFollow={handleToggleFollow}
          onShare={handleShare}
          onPlayFullSong={handlePlayFullSong}
          onToggleLike={handleToggleLike}
          onVideoEnded={handleVideoEnded}
        />
      );
    },
    [
      visible,
      activeIndex,
      muted,
      userPaused,
      endedVideoId,
      isAr,
      followedArtistIds,
      likedTrackIds,
      insets.bottom,
      handleTogglePlayPause,
      handleReplay,
      handleOpenChannel,
      handleToggleFollow,
      handleShare,
      handlePlayFullSong,
      handleToggleLike,
      handleVideoEnded,
    ]
  );

  const activeShort = feed[activeIndex];
  const isActiveEnded = activeShort ? endedVideoId === activeShort.videoId : false;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={styles.modalContainer}>
        <FlatList
          ref={flatListRef}
          data={feed}
          keyExtractor={(item, idx) => `${item.videoId}-${idx}`}
          renderItem={renderItem}
          pagingEnabled
          snapToInterval={SCREEN_HEIGHT}
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews={Platform.OS === 'android'}
          getItemLayout={(_, index) => ({
            length: SCREEN_HEIGHT,
            offset: SCREEN_HEIGHT * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onEndReached={loadMoreShorts}
          onEndReachedThreshold={0.8}
          onScrollBeginDrag={() => {
            if (showSwipeHint) setShowSwipeHint(false);
          }}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="large" color="#38BDF8" />
                <Text style={styles.footerLoaderText}>
                  {isAr ? 'جاري جلب المزيد من المقاطع...' : 'Loading more artist shorts...'}
                </Text>
              </View>
            ) : undefined
          }
        />

        {/* ── Top Progress & Controls (Back, Hashtag, Play/Pause, Mute) ── */}
        <View
          style={[styles.topOverlay, { paddingTop: Math.max(insets.top + 8, 22) }]}
          pointerEvents="box-none"
        >
          <View style={styles.storyDotsRow}>
            {Array.from({ length: 6 }).map((_, idx) => (
              <View
                key={`dot-${idx}`}
                style={[styles.storyDot, idx === activeIndex % 6 && styles.storyDotActive]}
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

            <Text style={styles.topHashtag}>{activeShort?.hashtag || '#music'}</Text>

            <View style={styles.topRightBtns}>
              <TouchableOpacity
                onPress={isActiveEnded ? handleReplay : handleTogglePlayPause}
                activeOpacity={0.8}
              >
                <LiquidGlassSurface
                  glassStyle="regular"
                  isDark
                  isInteractive
                  borderRadius={20}
                  style={styles.topCircleBtn}
                >
                  <Ionicons
                    name={isActiveEnded ? 'refresh' : userPaused ? 'play' : 'pause'}
                    size={18}
                    color="#FFFFFF"
                  />
                </LiquidGlassSurface>
              </TouchableOpacity>

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
                  <Ionicons
                    name={muted ? 'volume-mute' : 'volume-high'}
                    size={20}
                    color="#FFFFFF"
                  />
                </LiquidGlassSurface>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Animated Swipe Up Guide (Disappears on first vertical swipe) ── */}
        {showSwipeHint && (
          <View style={styles.swipeHintOverlay} pointerEvents="none">
            <Animated.View
              style={[styles.swipeHandWrap, { transform: [{ translateY: swipeAnimY }] }]}
            >
              <View style={styles.swipeTrackTrail} />
              <Ionicons name="hand-left-outline" size={34} color="#FFFFFF" />
            </Animated.View>
            <Text style={[styles.swipeHintText, { writingDirection: isAr ? 'rtl' : 'ltr' }]}>
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
  centerTapZone: {
    position: 'absolute',
    top: 120,
    left: 0,
    right: 0,
    bottom: 200,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 12,
  },
  centerPauseOrb: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  centerActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
    overflow: 'hidden',
  },
  centerActionTxt: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
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
    width: 22,
    backgroundColor: '#FFFFFF',
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topRightBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.4)',
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
  viewChannelSubRow: {
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  viewChannelSub: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11.5,
    fontWeight: '600',
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
  footerLoader: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  footerLoaderText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default ShortsReelsModal;
