import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  Platform,
  StyleProp,
  ViewStyle,
  TextStyle,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme/ThemeContext';

export interface LiquidGlassButtonProps {
  title?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  height?: number;
  borderRadius?: number;
  disabled?: boolean;
}

export const LiquidGlassButton: React.FC<LiquidGlassButtonProps> = ({
  title,
  onPress,
  style,
  textStyle,
  icon,
  children,
  height = 48,
  borderRadius = 24,
  disabled = false,
}) => {
  const { isDark } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    scale.value = withSpring(0.96, { damping: 14, stiffness: 350 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 16, stiffness: 300 });
  };

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={[
          styles.container,
          {
            height,
            borderRadius,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.85)',
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(255, 255, 255, 0.70)',
          },
          isDark ? styles.darkShadow : styles.lightShadow,
        ]}
      >
        {/* ── Frosted Blur Diffusion ── */}
        <BlurView
          intensity={Platform.OS === 'ios' ? (isDark ? 45 : 75) : 35}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />

        {/* ── Top Specular Curved Highlight ── */}
        <LinearGradient
          colors={
            isDark
              ? ['rgba(255, 255, 255, 0.30)', 'transparent']
              : ['rgba(255, 255, 255, 0.90)', 'transparent']
          }
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.7 }}
          style={[styles.glareArc, { borderRadius }]}
        />

        {/* ── Content ── */}
        <View style={styles.contentRow}>
          {icon && <View style={styles.iconWrap}>{icon}</View>}
          {title ? (
            <Text
              style={[
                styles.buttonText,
                { color: isDark ? '#FFFFFF' : '#111827' },
                textStyle,
              ]}
            >
              {title}
            </Text>
          ) : (
            children
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.2,
    borderTopWidth: 1.6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  glareArc: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  iconWrap: {
    marginRight: 8,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  lightShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.10,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  darkShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
});

export default LiquidGlassButton;
