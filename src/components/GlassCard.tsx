import React from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  StyleProp,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../theme/ThemeContext';

export interface GlassCardProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  borderRadius?: number;
  onPress?: () => void;
  activeOpacity?: number;
  disabled?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  contentContainerStyle,
  intensity,
  tint,
  borderRadius = 20,
  onPress,
  activeOpacity = 0.85,
  disabled = false,
}) => {
  const { theme, isDark } = useTheme();

  const cardBlurIntensity = intensity ?? theme.blurIntensity;
  const cardBlurTint = tint ?? (isDark ? 'dark' : 'light');

  const containerStyle: StyleProp<ViewStyle> = [
    styles.container,
    {
      borderRadius,
      borderColor: theme.glassBorder,
      backgroundColor: theme.glassCard,
    },
    style,
  ];

  const content = (
    <View style={[styles.inner, { borderRadius }, contentContainerStyle]}>
      {children}
    </View>
  );

  if (Platform.OS === 'ios') {
    const cardContent = (
      <View style={[containerStyle, styles.overflowHidden]}>
        <BlurView
          intensity={cardBlurIntensity}
          tint={cardBlurTint}
          style={StyleSheet.absoluteFill}
        />
        {content}
      </View>
    );

    if (onPress) {
      return (
        <TouchableOpacity
          activeOpacity={activeOpacity}
          onPress={onPress}
          disabled={disabled}
        >
          {cardContent}
        </TouchableOpacity>
      );
    }
    return cardContent;
  }

  // Android / Fallback: Render frosted matte surface with native blur if possible
  const androidContent = (
    <View style={[containerStyle, styles.overflowHidden]}>
      <BlurView
        intensity={cardBlurIntensity}
        tint={cardBlurTint}
        style={StyleSheet.absoluteFill}
      />
      {content}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={activeOpacity}
        onPress={onPress}
        disabled={disabled}
      >
        {androidContent}
      </TouchableOpacity>
    );
  }

  return androidContent;
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    position: 'relative',
  },
  overflowHidden: {
    overflow: 'hidden',
  },
  inner: {
    width: '100%',
  },
});

export default GlassCard;
