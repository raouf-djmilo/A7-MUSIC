import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNetworkStore } from '../services/networkService';

const { width } = Dimensions.get('window');

export const OfflineGuardModal: React.FC = () => {
  const isAuthBlockedDueToNoNetwork = useNetworkStore((s) => s.isAuthBlockedDueToNoNetwork);
  const isCheckingPrerequisite = useNetworkStore((s) => s.isCheckingPrerequisite);
  const checkSessionAndNetwork = useNetworkStore((s) => s.checkSessionAndNetwork);

  if (!isAuthBlockedDueToNoNetwork) return null;

  const handleRetry = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await checkSessionAndNetwork();
  };

  return (
    <Modal
      visible={isAuthBlockedDueToNoNetwork}
      animationType="fade"
      transparent
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Apple Frosted Glass Background */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 70 : 50}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(15, 23, 42, 0.95)', 'rgba(2, 6, 23, 0.98)', '#000000']}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.card}>
          {/* Glowing Hardware Network Sensor Icon */}
          <View style={styles.iconGlowWrapper}>
            <LinearGradient
              colors={['rgba(252, 82, 0, 0.25)', 'rgba(252, 82, 0, 0.05)']}
              style={styles.iconGlow}
            >
              <View style={styles.iconCircle}>
                <Ionicons name="cloud-offline-outline" size={48} color="#FC5200" />
              </View>
            </LinearGradient>
          </View>

          <Text style={styles.title}>
            يتطلب التشغيل لأول مرة اتصالاً بالإنترنت
          </Text>
          <Text style={styles.titleEn}>
            Initial Setup Requires Internet Connection
          </Text>

          <Text style={styles.description}>
            يرجى الاتصال بشبكة Wi-Fi أو تفعيل بيانات الهاتف لإتمام تسجيل الدخول الأول وتفعيل وضع الأوفلاين للجهاز.
          </Text>
          <Text style={styles.descriptionEn}>
            Connect to Wi-Fi or cellular data once to authenticate. After first login, your music downloads & workouts will work completely offline.
          </Text>

          {/* Retry Button */}
          <TouchableOpacity
            style={styles.retryButton}
            activeOpacity={0.8}
            onPress={handleRetry}
            disabled={isCheckingPrerequisite}
          >
            <LinearGradient
              colors={['#FC5200', '#FF7A00']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.retryGradient}
            >
              {isCheckingPrerequisite ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.retryText}>جاري التحقق من الشبكة...</Text>
                </View>
              ) : (
                <View style={styles.buttonContent}>
                  <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.retryText}>إعادة المحاولة • Retry Now</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.offlinePerkBadge}>
            <Ionicons name="shield-checkmark" size={14} color="#10B981" />
            <Text style={styles.offlinePerkText}>
              حساس الشبكة العتادي يراقب الاتصال وسيلغي الحظر تلقائياً
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  card: {
    width: Math.min(width - 32, 400),
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  iconGlowWrapper: {
    marginBottom: 20,
  },
  iconGlow: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(252, 82, 0, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(252, 82, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  titleEn: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginBottom: 14,
  },
  description: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  descriptionEn: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 26,
  },
  retryButton: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#FC5200',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
    marginBottom: 18,
  },
  retryGradient: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  offlinePerkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  offlinePerkText: {
    fontSize: 11,
    color: '#34D399',
    fontWeight: '500',
  },
});
