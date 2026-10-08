import React, { useState, useImperativeHandle, forwardRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { navigate } from '../navigation/navigationService';
import { useTheme } from '../theme/ThemeContext';

const { width } = Dimensions.get('window');

export type AuthPromptOptions = {
  title?: string;
  subtitle?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
};

export type AuthPromptRef = {
  show: (opts?: AuthPromptOptions) => void;
  hide: () => void;
};

let _promptRef: AuthPromptRef | null = null;

export const AuthPromptManager = {
  show: (opts?: AuthPromptOptions) => {
    _promptRef?.show(opts);
  },
  hide: () => {
    _promptRef?.hide();
  },
};

export const AuthPromptModal = forwardRef<AuthPromptRef>((_, ref) => {
  const { isDark } = useTheme();
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<AuthPromptOptions>({});

  useImperativeHandle(ref, () => ({
    show: (opts?: AuthPromptOptions) => {
      setOptions(opts || {});
      setVisible(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    },
    hide: () => {
      setVisible(false);
    },
  }));

  const handleClose = () => {
    setVisible(false);
    if (options.onCancel) {
      options.onCancel();
    }
  };

  const handleProceedAuth = () => {
    setVisible(false);
    if (options.onConfirm) {
      options.onConfirm();
    } else {
      navigate('Auth', { screen: 'Login' });
    }
  };

  if (!visible) return null;

  const title = options.title || 'احتفظ ببياناتك وأغانيك المفضلة';
  const subtitle =
    options.subtitle ||
    'أنشئ حساباً مجانياً للاحتفاظ بتمارينك وقوائمك الموسيقية لتصل إليها في أي وقت ومن أي هاتف.';
  const confirmText = options.confirmText || 'تسجيل الدخول / إنشاء حساب';
  const cancelText = options.cancelText || 'المتابعة كضيف';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />

          <TouchableWithoutFeedback>
            <View style={[styles.modalCard, isDark ? styles.cardDark : styles.cardLight]}>
              {/* Top Glow Ornament */}
              <View style={styles.iconCircleOuter}>
                <LinearGradient
                  colors={['#007AFF', '#0052CC']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconCircle}
                >
                  <Ionicons name="musical-notes" size={26} color="#FFFFFF" />
                </LinearGradient>
              </View>

              {/* Text Info */}
              <Text style={styles.titleText}>{title}</Text>
              <Text style={styles.subtitleText}>{subtitle}</Text>

              {/* Action Buttons */}
              <View style={styles.actionsContainer}>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleProceedAuth}
                  activeOpacity={0.88}
                >
                  <LinearGradient
                    colors={['#007AFF', '#0052CC']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryBtnGradient}
                  >
                    <Ionicons name="log-in-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.primaryBtnText}>{confirmText}</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={handleClose}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelBtnText}>{cancelText}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
});

export const setupAuthPrompt = (ref: AuthPromptRef | null) => {
  _promptRef = ref;
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: Math.min(width - 48, 380),
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  cardDark: {
    backgroundColor: 'rgba(20, 24, 33, 0.94)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  iconCircleOuter: {
    marginBottom: 16,
    borderRadius: 36,
    padding: 3,
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  subtitleText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  actionsContainer: {
    width: '100%',
    gap: 10,
  },
  primaryBtn: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  primaryBtnGradient: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  cancelBtnText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 14,
    fontWeight: '600',
  },
});
