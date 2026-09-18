import React, { useEffect } from 'react';
import { View, Image, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  interpolate,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { getFileUrl } from '../config/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PulsingAvatarProps {
  avatarUrl: string | null;
  isListening: boolean;
  isOnline: boolean;
  size?: number;
  onPress: () => void;
}

// ─── Animated Ripple Ring ─────────────────────────────────────────────────────
const RippleRing = ({ delay, size }: { delay: number; size: number }) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.7);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withTiming(1.7, { duration: 1400, easing: Easing.out(Easing.cubic) }),
        -1,
        false
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(0, { duration: 1400, easing: Easing.out(Easing.cubic) }),
        -1,
        false
      )
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        animStyle,
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: 'rgba(218, 165, 32, 0.8)', // Gold
        },
      ]}
    />
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const PulsingAvatar: React.FC<PulsingAvatarProps> = ({
  avatarUrl,
  isListening,
  isOnline,
  size = 58,
  onPress,
}) => {
  // Subtle scale beat when listening (like a heartbeat)
  const heartbeat = useSharedValue(1);

  useEffect(() => {
    if (isListening) {
      heartbeat.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 350, easing: Easing.out(Easing.ease) }),
          withTiming(1.0, { duration: 350, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(heartbeat);
      heartbeat.value = withTiming(1, { duration: 300 });
    }
  }, [isListening]);

  const heartbeatStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartbeat.value }],
  }));

  const imageUrl = avatarUrl
    ? (avatarUrl.startsWith('http') ? avatarUrl : getFileUrl(avatarUrl))
    : 'https://via.placeholder.com/100';

  const ringSize = size + 10;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.container, { width: size + 24, height: size + 24 }]}>
      <View style={[styles.rippleContainer, { width: ringSize + 20, height: ringSize + 20 }]}>
        {/* Animated ripple rings (only when listening) */}
        {isListening && (
          <>
            <RippleRing delay={0} size={ringSize} />
            <RippleRing delay={500} size={ringSize} />
            <RippleRing delay={1000} size={ringSize} />
          </>
        )}

        {/* Gold & Purple gradient border ring */}
        <LinearGradient
          colors={
            isListening
              ? ['#DAA520', '#9B59B6', '#DAA520'] // Gold → Purple → Gold
              : ['#555555', '#333333']              // Greyscale for offline
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradientBorder, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}
        >
          {/* Avatar with heartbeat animation */}
          <Animated.View style={[heartbeatStyle, { borderRadius: (size - 2) / 2, overflow: 'hidden' }]}>
            <Image
              source={{ uri: imageUrl }}
              style={[
                styles.avatar,
                {
                  width: size - 4,
                  height: size - 4,
                  borderRadius: (size - 4) / 2,
                  opacity: isListening ? 1 : 0.5, // Dimmed for offline/inactive
                },
              ]}
            />
          </Animated.View>
        </LinearGradient>

        {/* Green online dot (bottom-right corner) */}
        {isOnline && (
          <View style={[styles.onlineDot, { right: (ringSize / 2) - (ringSize * 0.7) / 2 + 2 }]} />
        )}
      </View>
    </TouchableOpacity>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rippleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientBorder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  avatar: {
    backgroundColor: '#1a1a1a',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 4,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#2ECC71', // Vibrant green
    borderWidth: 2,
    borderColor: '#0A0A0A',
  },
});
