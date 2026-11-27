/**
 * InAppToast — إشعار زجاجي سائل متناسق مع أسلوب Apple Liquid Glass
 * يُستخدم عبر ToastManager.show() من أي مكان في التطبيق
 */

import React, { useRef, useState, useImperativeHandle, forwardRef, useMemo } from 'react';
import {
  Animated,
  Text,
  StyleSheet,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { LiquidGlassSurface } from './LiquidGlassSurface';

// ─── Global reference ─────────────────────────────────────────────────────────
type ToastRef = {
  show: (opts: ToastOptions) => void;
};

type ToastOptions = {
  title: string;
  subtitle?: string;
  icon?: string;
  onPress?: () => void;
  duration?: number;
};

let _toastRef: ToastRef | null = null;

export const ToastManager = {
  show: (opts: ToastOptions) => {
    _toastRef?.show(opts);
  },
};

function resolveToastAccent(icon?: string): { color: string; tint: string; badgeBg: string } {
  switch (icon) {
    case 'checkmark-circle':
    case 'checkmark-done':
      return {
        color: '#30D158',
        tint: 'rgba(48, 209, 88, 0.14)',
        badgeBg: 'rgba(48, 209, 88, 0.18)',
      };
    case 'alert-circle':
    case 'warning':
    case 'close-circle':
      return {
        color: '#FF453A',
        tint: 'rgba(255, 69, 58, 0.16)',
        badgeBg: 'rgba(255, 69, 58, 0.18)',
      };
    case 'cloud-offline-outline':
    case 'cloud-offline':
      return {
        color: '#FF9F0A',
        tint: 'rgba(255, 159, 10, 0.15)',
        badgeBg: 'rgba(255, 159, 10, 0.18)',
      };
    default:
      return {
        color: '#0A84FF',
        tint: 'rgba(10, 132, 255, 0.13)',
        badgeBg: 'rgba(10, 132, 255, 0.16)',
      };
  }
}

// ─── Toast Component ─────────────────────────────────────────────────────────
export const InAppToast = forwardRef<ToastRef>((_, ref) => {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<ToastOptions>({ title: '' });
  const translateY = useRef(new Animated.Value(-160)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const showTokenRef = useRef(0);

  const dismiss = (expectedToken?: number) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const token = expectedToken ?? showTokenRef.current;
    activeAnimRef.current?.stop();

    const anim = Animated.parallel([
      Animated.timing(translateY, {
        toValue: -160,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]);
    activeAnimRef.current = anim;
    anim.start(({ finished }) => {
      if (finished && showTokenRef.current === token) {
        setVisible(false);
      }
    });
  };

  useImperativeHandle(ref, () => ({
    show: (opts: ToastOptions) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      activeAnimRef.current?.stop();

      const token = ++showTokenRef.current;
      setOptions(opts);
      setVisible(true);

      const enterAnim = Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 240,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]);
      activeAnimRef.current = enterAnim;
      enterAnim.start();

      timeoutRef.current = setTimeout(() => {
        dismiss(token);
      }, opts.duration || 3600);
    },
  }));

  const accent = useMemo(() => resolveToastAccent(options.icon), [options.icon]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.container,
        {
          top: insets.top + 8,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          dismiss();
          options.onPress?.();
        }}
        style={styles.touchWrap}
      >
        <LiquidGlassSurface
          glassStyle="regular"
          isDark={isDark}
          isInteractive
          tintColor={accent.tint}
          borderRadius={22}
          style={[
            styles.toast,
            {
              borderColor: isDark
                ? 'rgba(255, 255, 255, 0.22)'
                : 'rgba(15, 23, 42, 0.10)',
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: accent.badgeBg }]}>
            <Ionicons
              name={(options.icon as any) || 'notifications'}
              size={20}
              color={accent.color}
            />
          </View>

          <View style={styles.textWrap}>
            <Text
              style={[
                styles.title,
                { color: isDark ? '#FFFFFF' : '#0F172A' },
              ]}
              numberOfLines={1}
            >
              {options.title}
            </Text>
            {options.subtitle ? (
              <Text
                style={[
                  styles.subtitle,
                  {
                    color: isDark
                      ? 'rgba(255, 255, 255, 0.68)'
                      : 'rgba(15, 23, 42, 0.65)',
                  },
                ]}
                numberOfLines={2}
              >
                {options.subtitle}
              </Text>
            ) : null}
          </View>

          <TouchableOpacity
            onPress={() => dismiss()}
            hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
            style={styles.closeBtn}
          >
            <Ionicons
              name="close"
              size={17}
              color={isDark ? 'rgba(255,255,255,0.52)' : 'rgba(15,23,42,0.45)'}
            />
          </TouchableOpacity>
        </LiquidGlassSurface>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Setup function: call once in App root ────────────────────────────────────
export const setupToast = (ref: ToastRef) => {
  _toastRef = ref;
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 9999999,
    elevation: 9999,
  },
  touchWrap: {
    borderRadius: 22,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.24,
        shadowRadius: 20,
      },
      android: {
        elevation: 14,
      },
    }),
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    paddingVertical: 11,
    paddingHorizontal: 13,
    gap: 11,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  subtitle: {
    fontSize: 12.5,
    marginTop: 1.5,
    lineHeight: 16,
  },
  closeBtn: {
    padding: 4,
  },
});
