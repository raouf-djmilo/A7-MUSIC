import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import {
  safeRequestPermissionsAsync,
  safeGetExpoPushTokenAsync,
  isPushSupported,
} from '../services/notificationService';
import { ToastManager } from '../components/InAppToast';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../providers/AuthProvider';
import { apiClient } from '../config/api';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 15,
      height: 60,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle,
    },
    backBtn: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      color: theme.textPrimary,
      fontSize: 20,
      fontWeight: 'bold',
    },
    content: {
      flex: 1,
      padding: 20,
    },
    sectionTitle: {
      color: theme.textSecondary,
      fontSize: 13,
      fontWeight: 'bold',
      marginBottom: 15,
      textAlign: 'right',
      letterSpacing: 0.5,
    },
    optionCard: {
      backgroundColor: theme.surface,
      borderRadius: 20,
      padding: 16,
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: theme.border,
      ...Platform.select({
        ios: {
          shadowColor: theme.cardShadow.shadowColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: theme.cardShadow.shadowOpacity,
          shadowRadius: 8,
        },
        android: {
          elevation: theme.cardShadow.elevation,
        },
      }),
    },
    detailedSettings: {
      marginTop: 15,
      backgroundColor: theme.surface,
      borderRadius: 20,
      padding: 10,
      borderWidth: 1,
      borderColor: theme.borderSubtle,
    },
    row: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
    },
    rowLabel: {
      color: theme.textSecondary,
      fontSize: 14,
    },
    optionLeft: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      flex: 1,
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 15,
      backgroundColor: theme.surfaceSubtle,
    },
    optionLabel: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'right',
    },
    optionSub: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 2,
      textAlign: 'right',
    },
    divider: {
      height: 1,
      backgroundColor: theme.borderSubtle,
      marginVertical: 24,
    },
    simpleRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 18,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle,
    },
    simpleLabel: {
      color: theme.textPrimary,
      fontSize: 16,
    },
    footer: {
      marginTop: 50,
      alignItems: 'center',
    },
    version: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: 'bold',
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 100,
    },
  });

export const SettingsScreen = () => {
  const navigation = useNavigation();
  const { user, updateUser } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [notificationsEnabled, setNotificationsEnabled] = useState(!!user?.notifications_enabled);
  const [notifyLikes, setNotifyLikes] = useState(!!user?.notify_likes);
  const [notifyComments, setNotifyComments] = useState(!!user?.notify_comments);
  const [notifyFollows, setNotifyFollows] = useState(!!user?.notify_follows);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setNotificationsEnabled(!!user.notifications_enabled);
      setNotifyLikes(user.notify_likes !== 0);
      setNotifyComments(user.notify_comments !== 0);
      setNotifyFollows(user.notify_follows !== 0);
    }
  }, [user]);

  const updateSettings = async (updates: any) => {
    setLoading(true);
    try {
      const payload = {
        user_id: user?.id,
        push_token: user?.push_token,
        enabled: notificationsEnabled,
        notify_likes: notifyLikes,
        notify_comments: notifyComments,
        notify_follows: notifyFollows,
        ...updates,
      };

      await apiClient.put('/users/settings/notifications', payload);
      await updateUser(updates);
    } catch (error) {
      console.error('Update Settings Error:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء تحديث الإعدادات.');
    } finally {
      setLoading(false);
    }
  };

  const handleGlobalToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    let pushToken = user?.push_token || null;

    if (value && !isPushSupported) {
      ToastManager.show({
        title: 'تنبيه الإشعارات',
        subtitle: 'الإشعارات التجريبية غير مدعومة داخل Expo Go على أندرويد - تتطلب نسخة الإنتاج المستقلة.',
        icon: 'information-circle',
        duration: 4500,
      });
    }

    if (value && !pushToken && isPushSupported) {
      try {
        const { status } = await safeRequestPermissionsAsync();
        if (status === 'granted' && Device.isDevice) {
          const tokenData = await safeGetExpoPushTokenAsync({
            projectId: 'e4a2fac6-c96c-4930-825a-dc56ce8bcc75',
          });
          pushToken = tokenData?.data || null;
        }
      } catch (err) {
        console.warn('Push token registration error in Settings:', err);
      }
    }

    await updateSettings({ notifications_enabled: value ? 1 : 0, push_token: pushToken });
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-forward" size={28} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>الإعدادات</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.content}>
          {/* ── 1. App Appearance (Theme Switch: Light / Dark) ── */}
          <Text style={styles.sectionTitle}>مظهر التطبيق</Text>

          <View style={styles.optionCard}>
            <View style={styles.optionLeft}>
              <View style={styles.iconWrap}>
                <Ionicons
                  name={isDark ? 'moon' : 'sunny'}
                  size={22}
                  color={theme.textPrimary}
                />
              </View>
              <View>
                <Text style={styles.optionLabel}>
                  {isDark ? 'الوضع الداكن' : 'الوضع الفاتح (الدافئ)'}
                </Text>
                <Text style={styles.optionSub}>
                  {isDark ? 'مظهر داكن مريح في الإضاءة الخافتة' : 'مظهر دافئ وناعم وعصري'}
                </Text>
              </View>
            </View>
            <Switch
              value={isDark}
              onValueChange={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggleTheme();
              }}
              trackColor={{ false: theme.surfaceSubtle, true: theme.textPrimary }}
              thumbColor={theme.mode === 'light' ? '#FFF' : '#FFF'}
            />
          </View>

          <View style={styles.divider} />

          {/* ── 2. Notifications ── */}
          <Text style={styles.sectionTitle}>تنبيهات نوبل</Text>

          <View style={styles.optionCard}>
            <View style={styles.optionLeft}>
              <View style={styles.iconWrap}>
                <Ionicons name="notifications" size={22} color={theme.textPrimary} />
              </View>
              <View>
                <Text style={styles.optionLabel}>الإشعارات العامة</Text>
                <Text style={styles.optionSub}>تنبيهات فورية للرسائل والنظام</Text>
              </View>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleGlobalToggle}
              trackColor={{ false: theme.surfaceSubtle, true: theme.textPrimary }}
              thumbColor="#FFF"
            />
          </View>

          {notificationsEnabled && (
            <View style={styles.detailedSettings}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>الإعجابات والتفاعلات</Text>
                <Switch
                  value={notifyLikes}
                  onValueChange={(v) => {
                    setNotifyLikes(v);
                    updateSettings({ notify_likes: v ? 1 : 0 });
                  }}
                  trackColor={{ false: theme.surfaceSubtle, true: theme.textPrimary }}
                  thumbColor="#FFF"
                />
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>التعليقات الجديدة</Text>
                <Switch
                  value={notifyComments}
                  onValueChange={(v) => {
                    setNotifyComments(v);
                    updateSettings({ notify_comments: v ? 1 : 0 });
                  }}
                  trackColor={{ false: theme.surfaceSubtle, true: theme.textPrimary }}
                  thumbColor="#FFF"
                />
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>المتابعون الجدد</Text>
                <Switch
                  value={notifyFollows}
                  onValueChange={(v) => {
                    setNotifyFollows(v);
                    updateSettings({ notify_follows: v ? 1 : 0 });
                  }}
                  trackColor={{ false: theme.surfaceSubtle, true: theme.textPrimary }}
                  thumbColor="#FFF"
                />
              </View>
            </View>
          )}

          <View style={styles.divider} />

          {/* ── 3. About & Help ── */}
          <Text style={styles.sectionTitle}>عن التطبيق</Text>
          <TouchableOpacity style={styles.simpleRow}>
            <Text style={styles.simpleLabel}>مركز المساعدة</Text>
            <Ionicons name="chevron-back" size={20} color={theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.simpleRow}>
            <Text style={styles.simpleLabel}>سياسة الخصوصية</Text>
            <Ionicons name="chevron-back" size={20} color={theme.textMuted} />
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.version}>Nouble v1.0.25</Text>
          </View>
        </View>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={theme.textPrimary} />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
};

export default SettingsScreen;

