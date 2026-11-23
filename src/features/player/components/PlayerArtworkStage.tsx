// src/features/player/components/PlayerArtworkStage.tsx

import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { CachedArtwork } from '../../music/components/CachedArtwork';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DEFAULT_ARTWORK_SIZE = Math.min(SCREEN_WIDTH - 48, 360);

export interface PlayerArtworkStageProps {
  artworkUri?: string | null;
  artworkSource?: any;
  isPlaying: boolean;
  /** لتعديل الحجم عند الإيقاف المؤقت (الافتراضي 0.86 مثل Apple Music) */
  pausedScale?: number;
  size?: number;
}

const ARTWORK_SPRING = {
  stiffness: 260,
  damping: 24,
  mass: 0.9,
};

export const PlayerArtworkStage: React.FC<PlayerArtworkStageProps> = ({
  artworkUri,
  artworkSource,
  isPlaying,
  pausedScale = 0.86,
  size,
}) => {
  const actualSize = size || DEFAULT_ARTWORK_SIZE;
  const scale = useSharedValue(isPlaying ? 1 : pausedScale);
  const shadowOpacity = useSharedValue(isPlaying ? 0.45 : 0.18);
  const shadowRadius = useSharedValue(isPlaying ? 28 : 14);

  useEffect(() => {
    scale.value = withSpring(isPlaying ? 1 : pausedScale, ARTWORK_SPRING);
    shadowOpacity.value = withSpring(isPlaying ? 0.45 : 0.18, ARTWORK_SPRING);
    shadowRadius.value = withSpring(isPlaying ? 28 : 14, ARTWORK_SPRING);
  }, [isPlaying, pausedScale]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowOpacity: shadowOpacity.value,
    shadowRadius: shadowRadius.value,
  }));

  return (
    <View style={[styles.stageWrapper, { height: actualSize }]}>
      <Animated.View
        style={[
          styles.artworkShadowBox,
          { width: actualSize, height: actualSize },
          animatedContainerStyle,
        ]}
      >
        <View style={styles.artworkClip}>
          <CachedArtwork
            uri={artworkUri}
            source={artworkSource}
            style={styles.artworkImage}
            borderRadius={18}
            isDark={true}
            priority="high"
          />
          {/* حافة زجاجية نانوية رفيعة تبرز الغلاف فوق الخلفية المتدرجة */}
          <View pointerEvents="none" style={styles.glassRimOverlay} />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  stageWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkShadowBox: {
    borderRadius: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    elevation: 16,
  },
  artworkClip: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    overflow: 'hidden',
  },
  artworkImage: {
    width: '100%',
    height: '100%',
  },
  glassRimOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
});

export default PlayerArtworkStage;
