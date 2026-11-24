import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { Track } from '../../../store/useAudioStore';
import { getUniversalStudioArtworkSource } from '../../../utils/artworkHelper';
import { getTrackAtmosphericTint } from '../../../services/atmosphericColorEngine';

interface HomeAmbientCanvasProps {
  track?: Track;
  isDark: boolean;
}

/**
 * Full-bleed atmospheric background reflecting the focused Home disc card artwork.
 */
export const HomeAmbientCanvas: React.FC<HomeAmbientCanvasProps> = React.memo(({ track, isDark }) => {
  const ambientArtworkSources = useMemo(() => {
    return getUniversalStudioArtworkSource(
      track?.thumbnail,
      track?.title,
      track?.artist,
      track?.videoId
    );
  }, [track?.videoId, track?.thumbnail, track?.title, track?.artist]);

  const homeTint = useMemo(
    () => getTrackAtmosphericTint(track, isDark),
    [track?.videoId, isDark]
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? (homeTint.bottom || '#080A10') : '#F4F3EE' },
        ]}
      />

      {ambientArtworkSources && ambientArtworkSources.length > 0 && (
        <Image
          source={ambientArtworkSources}
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [{ scale: 1.5 }],
              opacity: isDark ? 0.78 : 0.58,
            },
          ]}
          contentFit="cover"
          blurRadius={Platform.OS === 'ios' ? 60 : 38}
          priority="high"
          cachePolicy="memory-disk"
          transition={450}
        />
      )}

      <BlurView
        intensity={Platform.OS === 'ios' ? 45 : 30}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />

      <LinearGradient
        colors={
          isDark
            ? [
                'rgba(8, 10, 16, 0.58)',
                'rgba(8, 10, 16, 0.10)',
                'rgba(8, 10, 16, 0.00)',
                'rgba(8, 10, 16, 0.45)',
                'rgba(8, 10, 16, 0.92)',
              ]
            : [
                'rgba(255, 255, 255, 0.68)',
                'rgba(255, 255, 255, 0.14)',
                'rgba(255, 255, 255, 0.00)',
                'rgba(244, 243, 238, 0.52)',
                'rgba(244, 243, 238, 0.94)',
              ]
        }
        locations={[0, 0.18, 0.38, 0.68, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
});

export default HomeAmbientCanvas;
