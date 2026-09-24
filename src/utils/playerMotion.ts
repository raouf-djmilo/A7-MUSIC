import { makeMutable } from 'react-native-reanimated';
import { Dimensions } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Universal Shared Reanimated Value (120 FPS GPU Synchronization)
 * Shared between UnifiedPlayerSheet (the gesture-driven modal) and
 * GlobalAudioBridge (the background/foreground video WebView).
 *
 * When the user drags down or expands the player modal, this single
 * shared mutable coordinates the position of BOTH components on the UI
 * thread in real time with zero frame drops and zero desync.
 */
export const DEFAULT_HIDDEN_OFFSET = Math.max(SCREEN_HEIGHT, 850) + 150;

export const playerModalTranslateY = makeMutable(DEFAULT_HIDDEN_OFFSET);

export const PLAYER_SPRING_CONFIG = {
  damping: 26,
  mass: 0.85,
  stiffness: 240,
  overshootClamping: false,
  restSpeedThreshold: 0.1,
  restDisplacementThreshold: 0.1,
};
