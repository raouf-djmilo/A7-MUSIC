import React, { memo, useCallback } from 'react';
import {
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Platform,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAudioStore } from '../../../store/useAudioStore';
import { useTheme } from '../../../theme/ThemeContext';

export interface TrackPlayButtonProps {
  videoId?: string;
  contextId?: string;
  onPressAction: () => void;
  size?: number;
  iconSize?: number;
  variant?: 'frosted' | 'solid';
  backgroundColor?: string;
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * 🔮 Apple Frosted Glass Play Badge (TrackPlayButton)
 * - ONLY subscribes to the playback state of ITS specific videoId or contextId ($O(1)$ comparison).
 * - Rest State: Frosted Liquid Glass lens with Retina hairline border.
 * - Active State: Soft Apple Blue tint (#007AFF / #0A84FF) without loud solid neon green.
 * - ZERO array iteration inside Zustand selector.
 */
export const TrackPlayButton: React.FC<TrackPlayButtonProps> = memo(
  ({
    videoId,
    contextId,
    onPressAction,
    size = 32,
    iconSize = 15,
    variant = 'frosted',
    backgroundColor,
    iconColor,
    style,
  }) => {
    const { isDark } = useTheme();

    // 1. Selector for single track (0ms O(1) comparison)
    const isTrackPlaying = useAudioStore(
      useCallback(
        (s) => {
          if (!videoId) return false;
          return s.isPlaying && s.currentTrack?.videoId === videoId;
        },
        [videoId]
      )
    );

    // 2. Selector for playlist/cluster (0ms O(1) comparison - NO .some() loop!)
    const isContextPlaying = useAudioStore(
      useCallback(
        (s) => {
          if (!contextId || videoId) return false;
          return s.isPlaying && (s.currentContextName === contextId || s.queueContextName === contextId);
        },
        [contextId, videoId]
      )
    );

    const isThisLoading = useAudioStore(
      useCallback(
        (s) => {
          if (!videoId) return false;
          return s.loadingTrackId === videoId;
        },
        [videoId]
      )
    );

    const isPlaying = videoId ? isTrackPlaying : isContextPlaying;

    const handlePress = useCallback(
      (e: any) => {
        e.stopPropagation?.();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (isPlaying) {
          useAudioStore.getState().togglePlay();
        } else {
          onPressAction();
        }
      },
      [isPlaying, onPressAction]
    );

    // Dynamic Apple Liquid Glass Colors
    const isFrosted = variant === 'frosted';
    const computedBg = backgroundColor || (
      isFrosted
        ? (isPlaying
            ? (isDark ? 'rgba(10, 132, 255, 0.35)' : 'rgba(0, 122, 255, 0.22)')
            : (isDark ? 'rgba(22, 22, 28, 0.65)' : 'rgba(255, 255, 255, 0.75)'))
        : (isPlaying ? '#007AFF' : '#1DB954')
    );

    const computedBorderColor = isFrosted
      ? (isPlaying
          ? (isDark ? 'rgba(10, 132, 255, 0.60)' : 'rgba(0, 122, 255, 0.45)')
          : (isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.12)'))
      : 'transparent';

    const computedIconColor = iconColor || (
      isPlaying
        ? (isDark ? '#5AC8FA' : '#007AFF')
        : (isDark ? '#FFFFFF' : '#1C1C1E')
    );

    return (
      <TouchableOpacity
        style={[
          styles.button,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: computedBg,
            borderColor: computedBorderColor,
            borderWidth: isFrosted ? StyleSheet.hairlineWidth : 0,
          },
          style,
        ]}
        activeOpacity={0.82}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={handlePress}
      >
        {isFrosted && (
          <BlurView
            intensity={Platform.OS === 'ios' ? (isDark ? 65 : 85) : 35}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        )}

        <View style={styles.iconContainer}>
          {isThisLoading ? (
            <ActivityIndicator size="small" color={computedIconColor} />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={iconSize}
              color={computedIconColor}
              style={!isPlaying ? { marginLeft: 1.5 } : undefined}
            />
          )}
        </View>
      </TouchableOpacity>
    );
  }
);

const styles = StyleSheet.create({
  button: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  iconContainer: {
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default TrackPlayButton;
