import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  NativeModules,
  Platform,
} from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { VideoView } from 'expo-video';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassSurface } from '../../../components/LiquidGlassSurface';
import { nativeAudioService } from '../../../services/nativeAudioService';
import type { DownloadedTrack, DownloadMediaMode } from '../../../services/downloadService';
import { useAudioStore, type Track } from '../../../store/useAudioStore';

interface OfflineVideoStageProps {
  track: Track;
  downloadedTrack?: DownloadedTrack | null;
  playerMediaMode: 'cover' | 'video';
  isPlaying: boolean;
  isOnline: boolean;
  isDark: boolean;
  isAr: boolean;
  videoAspectMode: 'fit' | 'fill';
  isVideoFullscreen: boolean;
  fullscreenWidth: number;
  fullscreenHeight: number;
  cardWidth: number;
  cardVideoHeight: number;
  normalStageTop: number;
  normalVideoLeft: number;
  sheetTranslateY: SharedValue<number>;
  isPlayerModalVisible: boolean;
  onPressTogglePlay: () => void;
  onEnterFullscreen: () => void;
  onSwitchToCover: () => void;
  onSwitchToVideo: () => void;
  onRequestDownload: (mode: DownloadMediaMode) => void;
}

export const OfflineVideoStage: React.FC<OfflineVideoStageProps> = ({
  track,
  downloadedTrack,
  playerMediaMode,
  isPlaying,
  isOnline,
  isDark,
  isAr,
  videoAspectMode,
  isVideoFullscreen,
  fullscreenWidth,
  fullscreenHeight,
  cardWidth,
  cardVideoHeight,
  normalStageTop,
  normalVideoLeft,
  sheetTranslateY,
  isPlayerModalVisible,
  onPressTogglePlay,
  onEnterFullscreen,
  onSwitchToCover,
  onSwitchToVideo,
  onRequestDownload,
}) => {
  const isTrackPlayerRuntime = Boolean(NativeModules.TrackPlayerModule);
  const videoLocalUri = downloadedTrack ? (downloadedTrack.videoLocalUri || '') : (track.videoUrl || '');
  const audioLocalUri = downloadedTrack ? (downloadedTrack.audioLocalUri || '') : '';
  const hasLocalVideo = Boolean(videoLocalUri && videoLocalUri.startsWith('file://'));
  const hasLocalAudio = Boolean(audioLocalUri && audioLocalUri.startsWith('file://'));

  // Determine when this stage needs to take over visuals/prompts
  const showOfflineVideoMissingCard =
    playerMediaMode === 'video' && !isOnline && !hasLocalVideo && isPlayerModalVisible;
  const showOfflineAudioMissingCard =
    playerMediaMode === 'cover' && !isOnline && hasLocalVideo && !hasLocalAudio && isPlayerModalVisible;
  const shouldRenderLocalVideo =
    playerMediaMode === 'video' && hasLocalVideo && isPlayerModalVisible;

  const [sharedPlayer, setSharedPlayer] = useState<any>(() => nativeAudioService.getVideoPlayer());
  const [mutedSyncPlayer, setMutedSyncPlayer] = useState<any>(null);
  const mutedPlayerRef = useRef<any>(null);

  // Expo Go: share single active VideoPlayer directly from nativeAudioService
  useEffect(() => {
    if (isTrackPlayerRuntime) return;
    return nativeAudioService.subscribeVideoPlayer((p) => {
      setSharedPlayer(p);
    });
  }, [isTrackPlayerRuntime]);

  // Production IPA (TrackPlayer owns audio): create lightweight muted VideoPlayer synced to TrackPlayer
  useEffect(() => {
    if (!isTrackPlayerRuntime || !shouldRenderLocalVideo || !videoLocalUri) {
      if (mutedPlayerRef.current) {
        const old = mutedPlayerRef.current;
        mutedPlayerRef.current = null;
        setMutedSyncPlayer(null);
        try {
          old.pause();
          old.release?.();
        } catch {}
      }
      return;
    }

    let cancelled = false;
    try {
      const expoVideo = require('expo-video');
      if (typeof expoVideo?.createVideoPlayer !== 'function') return;
      const vp = expoVideo.createVideoPlayer({ uri: videoLocalUri });
      vp.muted = true;
      vp.volume = 0;
      vp.staysActiveInBackground = false;
      vp.showNowPlayingNotification = false;
      const startSec = Math.max(0, (useAudioStore.getState().positionMillis || 0) / 1000);
      if (startSec > 0) vp.currentTime = startSec;
      if (isPlaying) vp.play();
      if (!cancelled) {
        mutedPlayerRef.current = vp;
        setMutedSyncPlayer(vp);
      } else {
        vp.release?.();
      }
    } catch {}

    return () => {
      cancelled = true;
      if (mutedPlayerRef.current) {
        const old = mutedPlayerRef.current;
        mutedPlayerRef.current = null;
        setMutedSyncPlayer(null);
        try {
          old.pause();
          old.release?.();
        } catch {}
      }
    };
  }, [isTrackPlayerRuntime, shouldRenderLocalVideo, videoLocalUri]);

  // Keep muted video player in sync with TrackPlayer play/pause & timeline in Production IPA
  useEffect(() => {
    const vp = mutedPlayerRef.current;
    if (!isTrackPlayerRuntime || !vp || !shouldRenderLocalVideo) return;
    try {
      if (isPlaying) {
        const posSec = Math.max(0, (useAudioStore.getState().positionMillis || 0) / 1000);
        if (Math.abs((vp.currentTime || 0) - posSec) > 0.5) {
          vp.currentTime = posSec;
        }
        vp.play();
      } else {
        vp.pause();
      }
    } catch {}
  }, [isTrackPlayerRuntime, isPlaying, shouldRenderLocalVideo]);

  useEffect(() => {
    if (!isTrackPlayerRuntime || !shouldRenderLocalVideo) return;
    const interval = setInterval(() => {
      const vp = mutedPlayerRef.current;
      if (!vp) return;
      const state = useAudioStore.getState();
      const targetSec = Math.max(0, (state.positionMillis || 0) / 1000);
      try {
        if (state.isPlaying && !vp.playing) vp.play();
        if (!state.isPlaying && vp.playing) vp.pause();
        if (Math.abs((vp.currentTime || 0) - targetSec) > 0.55) {
          vp.currentTime = targetSec;
        }
      } catch {}
    }, 450);
    return () => clearInterval(interval);
  }, [isTrackPlayerRuntime, shouldRenderLocalVideo]);

  const animatedFollowSheetStyle = useAnimatedStyle(() => {
    if (isVideoFullscreen) {
      return { transform: [{ translateY: 0 }] };
    }
    return { transform: [{ translateY: sheetTranslateY.value }] };
  }, [isVideoFullscreen]);

  const activePlayer = isTrackPlayerRuntime
    ? mutedSyncPlayer
    : nativeAudioService.getCurrentUri() === videoLocalUri
      ? sharedPlayer
      : null;

  // 1. Offline Audio Missing Card (User downloaded Video Only and switched to Music mode offline)
  if (showOfflineAudioMissingCard) {
    const coverUri = downloadedTrack?.artworkLocalUri || track.thumbnail || undefined;
    return (
      <Animated.View
        style={[
          animatedFollowSheetStyle,
          {
            position: 'absolute',
            top: normalStageTop,
            left: normalVideoLeft,
            width: cardWidth,
            height: cardWidth,
            borderRadius: 18,
            overflow: 'hidden',
            zIndex: 100002,
          },
        ]}
      >
        {coverUri && (
          <Image
            source={{ uri: coverUri }}
            style={[StyleSheet.absoluteFill, { opacity: 0.42 }]}
            contentFit="cover"
            blurRadius={Platform.OS === 'ios' ? 24 : 14}
          />
        )}
        <LiquidGlassSurface
          glassStyle="regular"
          isDark={true}
          isInteractive={false}
          borderRadius={18}
          tintColor="rgba(12, 16, 24, 0.72)"
          style={styles.promptCard}
        >
          <View style={styles.promptIconCircle}>
            <Ionicons name="musical-notes-outline" size={26} color="#FF9F0A" />
          </View>
          <Text style={styles.promptTitle}>
            {isAr ? 'الموسيقى الصوتية غير محمّلة' : 'Music Audio Not Downloaded'}
          </Text>
          <Text style={styles.promptSub}>
            {isAr
              ? 'تم حفظ الفيديو فقط على هذا الجهاز. قم بتحميل الموسيقى الصوتية للاستماع أوفلاين في هذا الوضع.'
              : 'Only Video is downloaded on this phone. Download Music Audio to listen offline in Music mode.'}
          </Text>
          <View style={styles.promptActions}>
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={onSwitchToVideo}
              style={[styles.primaryActionBtn, { backgroundColor: '#FFFFFF' }]}
            >
              <Ionicons name="videocam" size={16} color="#000000" />
              <Text style={[styles.primaryActionText, { color: '#000000' }]}>
                {isAr ? 'العودة للفيديو' : 'Back to Video'}
              </Text>
            </TouchableOpacity>
            {isOnline && (
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => onRequestDownload('full')}
                style={[styles.secondaryActionBtn, { borderColor: 'rgba(255,255,255,0.28)' }]}
              >
                <Ionicons name="cloud-download-outline" size={15} color="#FFFFFF" />
                <Text style={styles.secondaryActionText}>
                  {isAr ? 'تحميل الموسيقى' : 'Download Music'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </LiquidGlassSurface>
      </Animated.View>
    );
  }

  // 2. Offline Video Missing Card (User downloaded Music Only and switched to Video offline)
  if (showOfflineVideoMissingCard) {
    return (
      <Animated.View
        style={[
          animatedFollowSheetStyle,
          {
            position: 'absolute',
            top: normalStageTop,
            left: normalVideoLeft,
            width: cardWidth,
            height: cardVideoHeight,
            borderRadius: 16,
            overflow: 'hidden',
            zIndex: 100002,
          },
        ]}
      >
        <LiquidGlassSurface
          glassStyle="regular"
          isDark={true}
          isInteractive={false}
          borderRadius={16}
          tintColor="rgba(12, 16, 24, 0.78)"
          style={styles.promptCard}
        >
          <View style={styles.promptIconCircle}>
            <Ionicons name="videocam-off-outline" size={24} color="#0A84FF" />
          </View>
          <Text style={styles.promptTitle}>
            {isAr ? 'الفيديو غير محمّل' : 'Video Not Downloaded'}
          </Text>
          <Text style={styles.promptSub} numberOfLines={2}>
            {isAr
              ? 'تم حفظ الموسيقى الصوتية فقط. اتصل بالإنترنت لتحميل الفيديو.'
              : 'Music Audio is playing offline. Connect to download Video.'}
          </Text>
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={onSwitchToCover}
            style={[styles.primaryActionBtn, { backgroundColor: '#FFFFFF', marginTop: 4 }]}
          >
            <Ionicons name="musical-notes" size={15} color="#000000" />
            <Text style={[styles.primaryActionText, { color: '#000000' }]}>
              {isAr ? 'العودة للموسيقى' : 'Switch to Music'}
            </Text>
          </TouchableOpacity>
        </LiquidGlassSurface>
      </Animated.View>
    );
  }

  if (!shouldRenderLocalVideo) {
    return null;
  }

  const outerStyle = isVideoFullscreen
    ? {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%' as const,
        height: '100%' as const,
        backgroundColor: '#000000',
        zIndex: 100002,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
      }
    : {
        position: 'absolute' as const,
        top: normalStageTop,
        left: normalVideoLeft,
        width: cardWidth,
        height: cardVideoHeight,
        borderRadius: 16,
        overflow: 'hidden' as const,
        backgroundColor: '#000000',
        zIndex: 100002,
        elevation: 20,
      };

  const innerStyle = isVideoFullscreen
    ? { width: fullscreenWidth, height: fullscreenHeight, overflow: 'hidden' as const }
    : StyleSheet.absoluteFill;

  return (
    <Animated.View style={[outerStyle, animatedFollowSheetStyle]}>
      <View style={innerStyle} pointerEvents="none">
        {activePlayer ? (
          <VideoView
            player={activePlayer}
            style={StyleSheet.absoluteFill}
            contentFit={videoAspectMode === 'fill' ? 'cover' : 'contain'}
            nativeControls={false}
            fullscreenOptions={{ enable: false }}
            allowsPictureInPicture={false}
          />
        ) : (
          <View style={styles.loadingFallback} />
        )}
      </View>

      {!isVideoFullscreen && (
        <>
          <TouchableOpacity
            activeOpacity={1}
            onPress={onPressTogglePlay}
            style={StyleSheet.absoluteFill}
          />
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={(e) => {
              e?.stopPropagation?.();
              onEnterFullscreen();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.fullscreenBtn}
          >
            <Ionicons name="expand-outline" size={16} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.offlineBadgePill} pointerEvents="none">
            <Ionicons name="cloud-done" size={12} color="#30D158" />
            <Text style={styles.offlineBadgeText}>
              {isAr ? 'أوفلاين' : 'OFFLINE'}
            </Text>
          </View>
        </>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  loadingFallback: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fullscreenBtn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.58)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  offlineBadgePill: {
    position: 'absolute',
    left: 10,
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.56)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(48,209,88,0.4)',
  },
  offlineBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  promptCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: 8,
  },
  promptIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  promptSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  promptActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  primaryActionText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  secondaryActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
