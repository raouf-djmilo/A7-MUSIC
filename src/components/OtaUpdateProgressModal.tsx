import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useUpdateStore } from '../services/updateService';

/**
 * Professional iOS-style OTA Update Progress & Restart Modal.
 * Shows release highlights, animated download/apply progress bar, and restarts cleanly via Updates.reloadAsync().
 */
export const OtaUpdateProgressModal: React.FC = () => {
  const { theme, isDark } = useTheme();
  const {
    otaModalVisible,
    otaDetails,
    otaStatus,
    isDownloadingOta,
    otaProgress,
    otaStageText,
    otaError,
    installOtaUpdate,
    closeOtaModal,
  } = useUpdateStore();

  if (!otaModalVisible) return null;

  const isWorking = isDownloadingOta && otaProgress > 0;

  return (
    <Modal
      visible={otaModalVisible}
      transparent
      animationType="fade"
      onRequestClose={closeOtaModal}
    >
      <View style={styles.backdrop}>
        <BlurView
          intensity={isDark ? 65 : 75}
          tint={isDark ? 'dark' : 'light'}
          style={[
            styles.card,
            {
              backgroundColor: isDark
                ? 'rgba(20, 22, 30, 0.88)'
                : 'rgba(255, 255, 255, 0.92)',
              borderColor: isDark
                ? 'rgba(255, 255, 255, 0.16)'
                : 'rgba(0, 0, 0, 0.08)',
            },
          ]}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="sparkles" size={28} color="#3B82F6" />
          </View>

          <Text style={[styles.title, { color: theme.textPrimary }]}>
            {otaDetails?.title || 'تحديث جديد لتطبيق A7-MUSIC'}
          </Text>

          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {otaStageText ||
              'تحديث سريع يحسّن استقرار الصوت، جودة العرض، وأداء التطبيق بالكامل.'}
          </Text>

          {otaDetails?.highlights && otaDetails.highlights.length > 0 && !isWorking && (
            <View style={styles.highlightsBox}>
              {otaDetails.highlights.slice(0, 3).map((item, idx) => (
                <Text
                  key={idx}
                  style={[styles.highlightItem, { color: theme.textSecondary }]}
                  numberOfLines={2}
                >
                  • {item}
                </Text>
              ))}
            </View>
          )}

          {isWorking && (
            <View style={styles.progressSection}>
              <View
                style={[
                  styles.progressTrack,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255,255,255,0.12)'
                      : 'rgba(0,0,0,0.08)',
                  },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.max(8, Math.min(100, otaProgress))}%` },
                  ]}
                />
              </View>
              <View style={styles.progressMeta}>
                <ActivityIndicator size="small" color="#3B82F6" />
                <Text style={[styles.progressPct, { color: theme.textPrimary }]}>
                  {otaProgress}%
                </Text>
              </View>
            </View>
          )}

          {otaError ? (
            <Text style={styles.errorText}>{otaError}</Text>
          ) : null}

          {!isWorking && (
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255,255,255,0.08)'
                      : 'rgba(0,0,0,0.06)',
                  },
                ]}
                onPress={closeOtaModal}
              >
                <Text style={[styles.secondaryText, { color: theme.textSecondary }]}>
                  لاحقاً
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => installOtaUpdate()}
              >
                <Text style={styles.primaryText}>
                  {otaStatus === 'ready' ? 'تطبيق وإعادة التشغيل' : 'تحديث الآن'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </BlurView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.56)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 14,
  },
  highlightsBox: {
    width: '100%',
    gap: 4,
    marginBottom: 16,
    paddingHorizontal: 6,
  },
  highlightItem: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'right',
  },
  progressSection: {
    width: '100%',
    marginTop: 4,
    marginBottom: 6,
    gap: 10,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#3B82F6',
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  progressPct: {
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12.5,
    textAlign: 'center',
    marginBottom: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    marginTop: 6,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  primaryBtn: {
    flex: 1.4,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default OtaUpdateProgressModal;
