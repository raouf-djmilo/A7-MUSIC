import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

export interface CircularDownloadProgressProps {
  status: 'probing' | 'downloading' | 'completed';
  progress?: number;
  size?: number;
  activeColor?: string;
  completedColor?: string;
  trackColor?: string;
}

/**
 * Circular download indicator styled after Apple Music and Spotify:
 * - probing: spinning open arc around download arrow
 * - downloading: clockwise filling progress ring around inner stop dot
 * - completed: solid badge with downward checkmark arrow
 */
export const CircularDownloadProgress: React.FC<CircularDownloadProgressProps> = ({
  status,
  progress = 0,
  size = 22,
  activeColor = '#0A84FF',
  completedColor = '#30D158',
  trackColor = 'rgba(255, 255, 255, 0.22)',
}) => {
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status !== 'probing') {
      spinAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 950,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [status, spinAnim]);

  if (status === 'completed') {
    return (
      <View
        style={[
          styles.completedBadge,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: completedColor,
          },
        ]}
      >
        <Ionicons name="arrow-down" size={Math.round(size * 0.56)} color="#FFFFFF" />
      </View>
    );
  }

  const strokeWidth = Math.max(2, size * 0.1);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0.06, Math.min(1, progress));
  const dashOffset =
    status === 'probing' ? circumference * 0.35 : circumference * (1 - clamped);

  const rotate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          status === 'probing' ? { transform: [{ rotate }] } : undefined,
        ]}
      >
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={activeColor}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation={-90}
            originX={size / 2}
            originY={size / 2}
          />
        </Svg>
      </Animated.View>

      {status === 'downloading' ? (
        <View
          style={{
            width: Math.max(5, Math.round(size * 0.27)),
            height: Math.max(5, Math.round(size * 0.27)),
            borderRadius: 1.5,
            backgroundColor: activeColor,
          }}
        />
      ) : (
        <Ionicons
          name="arrow-down"
          size={Math.max(9, Math.round(size * 0.48))}
          color={activeColor}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CircularDownloadProgress;
