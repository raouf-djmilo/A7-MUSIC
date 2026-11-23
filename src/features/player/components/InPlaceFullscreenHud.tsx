// src/features/player/components/InPlaceFullscreenHud.tsx

import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassSurface } from '../../../components/LiquidGlassSurface';
import { useFullscreenHudLogic } from '../hooks/useFullscreenHudLogic';

export interface InPlaceFullscreenHudProps {
  visible: boolean;
  onClose: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeekRelative: (deltaSec: number) => void;
  isScrubbing?: boolean;
  renderTimeline: () => React.ReactNode;
  autoHideMs?: number;
  screenWidth?: number;
  screenHeight?: number;
}

export const InPlaceFullscreenHud: React.FC<InPlaceFullscreenHudProps> = ({
  visible,
  onClose,
  isPlaying,
  onTogglePlay,
  onSeekRelative,
  isScrubbing = false,
  renderTimeline,
  autoHideMs = 3000,
  screenWidth: propWidth,
  screenHeight: propHeight,
}) => {
  const windowDims = useWindowDimensions();
  const width = propWidth || windowDims.width;
  const height = propHeight || windowDims.height;
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;

  // 1. Snappy 3s HUD State Machine Engine (YouTube-Style Asymmetric Physics)
  const {
    hudVisible,
    hudOpacity,
    closeOpacity,
    toggleHud,
    resetTimer,
  } = useFullscreenHudLogic({
    visible,
    isPlaying,
    isScrubbing,
    autoHideMs,
  });

  // 2. Manual rotation handler (resets 3s timer)
  const handleManualRotate = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetTimer(3000);
    try {
      await ScreenOrientation.lockAsync(
        isLandscape
          ? ScreenOrientation.OrientationLock.PORTRAIT_UP
          : ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT
      );
      setTimeout(() => ScreenOrientation.unlockAsync().catch(() => {}), 800);
    } catch {}
  };

  const hudStyle = useAnimatedStyle(() => ({ opacity: hudOpacity.value }));
  const closeStyle = useAnimatedStyle(() => ({ opacity: closeOpacity.value }));

  if (!visible) return null;

  // Screen-edge safe area offsets (Dynamic Island & Home bar compliant)
  const topOffset = isLandscape ? Math.max(insets.top, 16) + 4 : Math.max(insets.top, 44) + 8;
  const sideOffset = isLandscape ? Math.max(insets.left, insets.right, 32) : 20;
  const bottomOffset = isLandscape ? Math.max(insets.bottom, 16) + 6 : Math.max(insets.bottom, 24) + 10;

  // 🛡️ Explicit 100% Screen Box to completely prevent Collapsed Height = 0
  const screenBoxStyle = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  };

  return (
    <View pointerEvents="box-none" style={[styles.overlayRoot, screenBoxStyle]}>
      <StatusBar hidden={isLandscape} barStyle="light-content" />

      {/* 🛡️ Explicit iOS Safe Touch Shield (Covers 100% of screen, catches empty space taps) */}
      <Pressable
        collapsable={false}
        onPress={toggleHud}
        style={[styles.iosSafeTouchShield, screenBoxStyle]}
      />

      {/* 🛡️ Subtle Bottom Scrim Gradient (Appears and hides with the HUD) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.bottomScrimWrap,
          {
            height: isLandscape ? 170 : 230,
          },
          hudStyle,
        ]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.45)', 'rgba(0, 0, 0, 0.88)']}
          locations={[0, 0.35, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* 🛡️ Unified Bottom Control Dock with Accidental-Hide Guard */}
      <Animated.View
        pointerEvents={hudVisible ? 'box-none' : 'none'}
        style={[
          styles.bottomDock,
          {
            bottom: bottomOffset,
            left: sideOffset,
            right: sideOffset,
          },
          hudStyle,
        ]}
      >
        {/* Accidental-Hide Guard: Absorbs touches between controls so buttons never vanish on a slight miss! */}
        <View
          pointerEvents="box-none"
          onTouchStart={() => resetTimer(3000)}
          style={styles.dockAbsorbContainer}
        >
          {/* Row 1: Playback Controls: [⏪ -10s] [ ▶ / ⏸ (Apple Black Glass) ] [+10s ⏩] */}
          <View style={styles.dockControlsRow} pointerEvents="box-none">
            {/* Rewind 10s */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSeekRelative(-10);
                resetTimer(3000);
              }}
              hitSlop={12}
            >
              <LiquidGlassSurface glassStyle="regular" isDark={true} borderRadius={24} style={styles.secondaryBtn}>
                <Ionicons name="play-back" size={20} color="#FFFFFF" />
              </LiquidGlassSurface>
            </Pressable>

            {/* Primary Play / Pause Black Glass Button */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onTogglePlay();
                resetTimer(3000);
              }}
              hitSlop={12}
            >
              <LiquidGlassSurface glassStyle="regular" isDark={true} borderRadius={32} style={styles.primaryPlayBtn}>
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={28}
                  color="#FFFFFF"
                  style={!isPlaying ? { marginLeft: 3 } : undefined}
                />
              </LiquidGlassSurface>
            </Pressable>

            {/* Fast-Forward 10s */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSeekRelative(10);
                resetTimer(3000);
              }}
              hitSlop={12}
            >
              <LiquidGlassSurface glassStyle="regular" isDark={true} borderRadius={24} style={styles.secondaryBtn}>
                <Ionicons name="play-forward" size={20} color="#FFFFFF" />
              </LiquidGlassSurface>
            </Pressable>
          </View>

          {/* Row 2: Apple Expanding Timeline + Quick Rotate Button */}
          <View style={styles.dockTimelineRow} pointerEvents="box-none">
            <View style={styles.timelineFlex} pointerEvents="auto">
              {typeof renderTimeline === 'function' ? renderTimeline() : renderTimeline}
            </View>

            <Pressable onPress={handleManualRotate} hitSlop={12}>
              <LiquidGlassSurface glassStyle="regular" isDark={true} borderRadius={18} style={styles.smallRotateBtn}>
                <Ionicons
                  name={isLandscape ? 'contract-outline' : 'scan-outline'}
                  size={18}
                  color="#FFFFFF"
                />
              </LiquidGlassSurface>
            </Pressable>
          </View>
        </View>
      </Animated.View>

      {/* 🛡️ Persistent Corner Close Button (Pinned to Top-Left, 1.0 on show, 0.40 on hide, always clickable) */}
      <Animated.View
        style={[
          styles.persistentClose,
          { top: topOffset, left: sideOffset },
          closeStyle,
        ]}
      >
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onClose();
          }}
          hitSlop={16}
        >
          <LiquidGlassSurface glassStyle="regular" isDark={true} borderRadius={20} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </LiquidGlassSurface>
        </Pressable>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayRoot: {
    zIndex: 10000,
    elevation: 100,
  },
  iosSafeTouchShield: {
    // 🛡️ 0.02 alpha: iOS UIKit hitTest detects touches 100% reliably while remaining invisible
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    zIndex: 1,
  },
  bottomScrimWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  bottomDock: {
    position: 'absolute',
    zIndex: 3,
  },
  dockAbsorbContainer: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  dockControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 4,
  },
  dockTimelineRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  timelineFlex: {
    flex: 1,
  },
  persistentClose: {
    position: 'absolute',
    zIndex: 4,
  },
  primaryPlayBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(20, 20, 22, 0.58)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(20, 20, 22, 0.48)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallRotateBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(20, 20, 22, 0.48)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(20, 20, 22, 0.58)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default InPlaceFullscreenHud;
