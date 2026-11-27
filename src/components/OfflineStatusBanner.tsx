import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useNetworkStore } from '../services/networkService';
import { useTheme } from '../theme/ThemeContext';
import { useLanguageStore } from '../store/useLanguageStore';
import { ToastManager } from './InAppToast';

/**
 * Simple, non-blocking Apple Liquid Glass offline notification pill.
 * Tells the user cleanly when offline that only downloaded music can be played,
 * and shows a brief confirmation toast when internet connectivity returns.
 */
export const OfflineStatusBanner: React.FC = () => {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const { isDark } = useTheme();
  const language = useLanguageStore((s) => s.language);
  const isAr = language === 'ar';
  const insets = useSafeAreaInsets();
  const [dismissedOffline, setDismissedOffline] = useState(false);
  const prevOnlineRef = useRef<boolean>(isOnline);

  useEffect(() => {
    const wasOnline = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;

    if (!isOnline) {
      setDismissedOffline(false);
    } else if (!wasOnline && isOnline) {
      setDismissedOffline(false);
      ToastManager.show({
        title: isAr ? 'تمت استعادة الاتصال' : 'Back Online',
        subtitle: isAr ? 'جميع الميزات متاحة الآن' : 'Full streaming and sync restored',
        icon: 'wifi',
        duration: 2400,
      });
    }
  }, [isOnline, isAr]);

  if (isOnline || dismissedOffline) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { top: Math.max(insets.top, 12) + 4 }]}
    >
      <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(180)}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setDismissedOffline(true)}
          style={[
            styles.pill,
            {
              backgroundColor: isDark ? 'rgba(28, 30, 42, 0.92)' : 'rgba(255, 255, 255, 0.94)',
              borderColor: isDark ? 'rgba(255, 159, 10, 0.45)' : 'rgba(255, 149, 0, 0.35)',
              flexDirection: isAr ? 'row-reverse' : 'row',
            },
          ]}
        >
          <View style={styles.iconBadge}>
            <Ionicons name="cloud-offline" size={14} color="#FF9F0A" />
          </View>
          <Text
            style={[
              styles.text,
              { color: isDark ? '#F8FAFC' : '#0F172A', writingDirection: isAr ? 'rtl' : 'ltr' },
            ]}
            numberOfLines={1}
          >
            {isAr
              ? 'وضع الأوفلاين • يمكن تشغيل المحمّل فقط'
              : 'Offline Mode • Downloaded music only'}
          </Text>
          <Ionicons
            name="close"
            size={14}
            color={isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.45)'}
          />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 999999,
  },
  pill: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  iconBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 159, 10, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 12.5,
    fontWeight: '600',
    maxWidth: 260,
  },
});

export default OfflineStatusBanner;
