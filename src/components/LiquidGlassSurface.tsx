import React, { useMemo } from 'react';
import { StyleSheet, View, StyleProp, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import {
  GlassView,
  isLiquidGlassAvailable,
  GlassStyle,
} from 'expo-glass-effect';

export interface LiquidGlassSurfaceProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * نمط الزجاج الأصلي من أبل:
   * - 'regular': زجاج سائل متوازن ومقروء (مطابق للشريط السفلي)
   * - 'clear': زجاج فائق الشفافية لعرض أقوى للخلفية
   */
  glassStyle?: GlassStyle;
  /** تفعيل الاستجابة الضوئية التفاعلية لـ Apple عند اللمس */
  isInteractive?: boolean;
  /** مسحة لونية خفيفة جداً اختيارية (اتركها فارغة للزجاج الصافي) */
  tintColor?: string;
  /** يُستخدم لمزامنة المظهر الزجاجي الداكن أو الفاتح */
  isDark?: boolean;
  borderRadius?: number;
}

// فحص آمن لدعم الزجاج السائل الأصلي مع كاش لمنع إعادة الاستدعاء المتكرر
let cachedSupport: boolean | null = null;
const isNativeLiquidGlassSupported = (): boolean => {
  if (cachedSupport !== null) return cachedSupport;
  if (Platform.OS !== 'ios') {
    cachedSupport = false;
    return false;
  }
  try {
    cachedSupport = typeof isLiquidGlassAvailable === 'function' && isLiquidGlassAvailable();
  } catch {
    cachedSupport = false;
  }
  return cachedSupport;
};

/**
 * 🔮 LiquidGlassSurface: Unified Apple Liquid Glass & Fallback Layer
 * - Uses native GlassView on iOS (UIGlassEffect on Metal GPU) matching UITabBar.
 * - Safely falls back to BlurView on older iOS or Android.
 * - Zero opaque background colors to preserve true optical light refraction!
 */
export const LiquidGlassSurface: React.FC<LiquidGlassSurfaceProps> = ({
  children,
  style,
  glassStyle = 'regular',
  isInteractive = true,
  tintColor,
  isDark = false,
  borderRadius,
}) => {
  const dynamicBorderRadius = useMemo(() => {
    if (borderRadius !== undefined) return borderRadius;
    // Extract borderRadius from style if provided
    const flattened = StyleSheet.flatten(style);
    return flattened?.borderRadius;
  }, [borderRadius, style]);

  const supportsNative = isNativeLiquidGlassSupported();

  // 1. المسار الأصلي: محرك Apple Metal Liquid Glass الحقيقي (مطابق للبار السفلي 100%)
  if (supportsNative) {
    return (
      <GlassView
        glassEffectStyle={glassStyle}
        isInteractive={isInteractive}
        tintColor={tintColor}
        colorScheme={isDark ? 'dark' : 'light'}
        style={[
          styles.nativeGlassBase,
          dynamicBorderRadius !== undefined && { borderRadius: dynamicBorderRadius },
          style,
          { backgroundColor: 'transparent' },
        ]}
      >
        {children}
      </GlassView>
    );
  }

  // 2. المسار البديل فائق النقاء: لأجهزة Android أو إصدارات iOS الأقدم بدون خلفية معتمة
  return (
    <View
      style={[
        styles.fallbackContainer,
        {
          borderColor: isDark
            ? 'rgba(255, 255, 255, 0.16)'
            : 'rgba(0, 0, 0, 0.08)',
          borderTopColor: isDark
            ? 'rgba(255, 255, 255, 0.28)'
            : 'rgba(255, 255, 255, 0.75)',
        },
        dynamicBorderRadius !== undefined && { borderRadius: dynamicBorderRadius },
        style,
        { backgroundColor: 'transparent' },
      ]}
    >
      <BlurView
        intensity={Platform.OS === 'ios' ? (isDark ? 65 : 85) : 45}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark
              ? 'rgba(20, 20, 26, 0.35)'
              : 'rgba(255, 255, 255, 0.40)',
          },
        ]}
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  nativeGlassBase: {
    // الخلفية يجب أن تبقى شفافة تماماً ليعمل الانكسار الضوئي لنظام iOS
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  fallbackContainer: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
});

export default LiquidGlassSurface;
