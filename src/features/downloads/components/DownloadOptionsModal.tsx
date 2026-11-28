import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidGlassSurface } from '../../../components/LiquidGlassSurface';
import {
  DownloadedTrack,
  DownloadMediaMode,
  resolveDownloadedMediaMode,
} from '../../../services/downloadService';
import { getUniversalStudioArtwork } from '../../../utils/artworkHelper';
import type { Track } from '../../../store/useAudioStore';

interface DownloadOptionsModalProps {
  visible: boolean;
  onClose: () => void;
  track: Track | null;
  sourceContext: 'music' | 'video';
  downloadedTrack?: DownloadedTrack | null;
  isDark: boolean;
  isAr: boolean;
  onSelectDownload: (mode: DownloadMediaMode) => void;
  onSelectRemove: (removeMode: 'audio' | 'video' | 'all') => void;
}

export const DownloadOptionsModal: React.FC<DownloadOptionsModalProps> = ({
  visible,
  onClose,
  track,
  sourceContext,
  downloadedTrack,
  isDark,
  isAr,
  onSelectDownload,
  onSelectRemove,
}) => {
  const insets = useSafeAreaInsets();
  if (!track) return null;

  const currentMode = downloadedTrack ? resolveDownloadedMediaMode(downloadedTrack) : null;
  const hasAudio = Boolean(downloadedTrack?.audioLocalUri);
  const hasVideo = Boolean(downloadedTrack?.videoLocalUri);
  const isFull = hasAudio && hasVideo;

  const artworkUri =
    downloadedTrack?.artworkLocalUri ||
    getUniversalStudioArtwork(track.thumbnail, track.title, track.artist, track.videoId) ||
    track.thumbnail ||
    undefined;

  const rowDir = isAr ? 'row-reverse' : 'row';
  const textAlign = isAr ? 'right' : 'left';
  const primaryText = isDark ? '#FFFFFF' : '#0F172A';
  const secondaryText = isDark ? 'rgba(255,255,255,0.68)' : 'rgba(15,23,42,0.62)';
  const cardBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.09)';

  const renderStatusBanner = () => {
    if (!downloadedTrack || !currentMode) return null;

    const label = isFull
      ? isAr
        ? `محمّل بالكامل (موسيقى + فيديو) • ${downloadedTrack.fileSizeMB}`
        : `Full Offline Ready (Music + Video) • ${downloadedTrack.fileSizeMB}`
      : hasVideo
        ? isAr
          ? `فيديو فقط محمّل • ${downloadedTrack.fileSizeMB}`
          : `Video Only Downloaded • ${downloadedTrack.fileSizeMB}`
        : isAr
          ? `موسيقى فقط محمّلة • ${downloadedTrack.fileSizeMB}`
          : `Music Only Downloaded • ${downloadedTrack.fileSizeMB}`;

    return (
      <View
        style={[
          styles.statusPill,
          {
            flexDirection: rowDir,
            backgroundColor: 'rgba(48, 209, 88, 0.14)',
            borderColor: 'rgba(48, 209, 88, 0.34)',
          },
        ]}
      >
        <Ionicons name="checkmark-circle" size={16} color="#30D158" />
        <Text style={[styles.statusPillText, { color: '#30D158', textAlign }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheetWrap,
            { paddingBottom: Math.max(insets.bottom, 18) },
          ]}
        >
          <LiquidGlassSurface
            glassStyle="regular"
            isDark={isDark}
            isInteractive={false}
            borderRadius={28}
            tintColor={isDark ? 'rgba(16, 20, 30, 0.78)' : 'rgba(248, 250, 252, 0.90)'}
            style={[
              styles.sheetCard,
              {
                borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.08)',
              },
            ]}
          >
            {/* Header Track Card */}
            <View style={[styles.headerRow, { flexDirection: rowDir }]}>
              <View style={styles.coverBox}>
                {artworkUri ? (
                  <Image
                    source={{ uri: artworkUri }}
                    style={styles.coverImg}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.coverImg, styles.coverFallback]}>
                    <Ionicons name="musical-notes" size={22} color="#8E8E93" />
                  </View>
                )}
              </View>
              <View style={styles.headerMeta}>
                <Text
                  style={[styles.trackTitle, { color: primaryText, textAlign }]}
                  numberOfLines={1}
                >
                  {track.title}
                </Text>
                <Text
                  style={[styles.trackArtist, { color: secondaryText, textAlign }]}
                  numberOfLines={1}
                >
                  {track.artist}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[styles.closeBtn, { backgroundColor: cardBg }]}
              >
                <Ionicons name="close" size={18} color={secondaryText} />
              </TouchableOpacity>
            </View>

            {renderStatusBanner()}

            <Text style={[styles.sectionPrompt, { color: secondaryText, textAlign }]}>
              {isFull
                ? isAr
                  ? 'إدارة النسخة المحمّلة على الهاتف'
                  : 'Manage Offline Download'
                : sourceContext === 'video'
                  ? isAr
                    ? 'اختر صيغة التحميل من قسم الفيديو'
                    : 'Choose Video Download Mode'
                  : isAr
                    ? 'اختر صيغة التحميل للموسيقى'
                    : 'Choose Music Download Mode'}
            </Text>

            {/* NOT DOWNLOADED YET */}
            {!downloadedTrack && sourceContext === 'music' && (
              <View style={styles.optionsCol}>
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => {
                    onClose();
                    onSelectDownload('full');
                  }}
                  style={[
                    styles.optionBtn,
                    {
                      flexDirection: rowDir,
                      backgroundColor: isDark ? 'rgba(10, 132, 255, 0.16)' : 'rgba(10, 132, 255, 0.10)',
                      borderColor: 'rgba(10, 132, 255, 0.45)',
                    },
                  ]}
                >
                  <View style={[styles.optionIconCircle, { backgroundColor: 'rgba(10, 132, 255, 0.24)' }]}>
                    <Ionicons name="layers" size={20} color="#0A84FF" />
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={[styles.optionTitle, { color: primaryText, textAlign }]}>
                      {isAr ? 'تحميل النسخة الكاملة (موسيقى + فيديو)' : 'Download Full Music (Audio + Video)'}
                    </Text>
                    <Text style={[styles.optionSub, { color: secondaryText, textAlign }]}>
                      {isAr
                        ? 'استماع للموسيقى + مشاهدة الفيديو أوفلاين بتبديل فوري'
                        : 'Listen in Music mode & switch seamlessly to Video offline'}
                    </Text>
                  </View>
                  <Ionicons name="cloud-download-outline" size={20} color="#0A84FF" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => {
                    onClose();
                    onSelectDownload('audio');
                  }}
                  style={[
                    styles.optionBtn,
                    {
                      flexDirection: rowDir,
                      backgroundColor: cardBg,
                      borderColor: cardBorder,
                    },
                  ]}
                >
                  <View style={[styles.optionIconCircle, { backgroundColor: 'rgba(48, 209, 88, 0.18)' }]}>
                    <Ionicons name="musical-notes" size={20} color="#30D158" />
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={[styles.optionTitle, { color: primaryText, textAlign }]}>
                      {isAr ? 'تحميل الموسيقى فقط' : 'Download Music Only'}
                    </Text>
                    <Text style={[styles.optionSub, { color: secondaryText, textAlign }]}>
                      {isAr
                        ? 'حجم خفيف — الصوت الأصلي مع الغلاف بجودة عالية'
                        : 'Compact size — original AAC studio audio + HD cover'}
                    </Text>
                  </View>
                  <Ionicons name="arrow-down-circle-outline" size={20} color={primaryText} />
                </TouchableOpacity>
              </View>
            )}

            {!downloadedTrack && sourceContext === 'video' && (
              <View style={styles.optionsCol}>
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => {
                    onClose();
                    onSelectDownload('video');
                  }}
                  style={[
                    styles.optionBtn,
                    {
                      flexDirection: rowDir,
                      backgroundColor: cardBg,
                      borderColor: cardBorder,
                    },
                  ]}
                >
                  <View style={[styles.optionIconCircle, { backgroundColor: 'rgba(191, 90, 242, 0.22)' }]}>
                    <Ionicons name="videocam" size={20} color="#BF5AF2" />
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={[styles.optionTitle, { color: primaryText, textAlign }]}>
                      {isAr ? 'تحميل الفيديو فقط' : 'Download Video Only'}
                    </Text>
                    <Text style={[styles.optionSub, { color: secondaryText, textAlign }]}>
                      {isAr
                        ? 'تشغيل الفيديو بالصوت أوفلاين داخل قسم الفيديو فقط'
                        : 'Play Video with sound offline inside Video mode only'}
                    </Text>
                  </View>
                  <Ionicons name="arrow-down-circle-outline" size={20} color="#BF5AF2" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => {
                    onClose();
                    onSelectDownload('full');
                  }}
                  style={[
                    styles.optionBtn,
                    {
                      flexDirection: rowDir,
                      backgroundColor: isDark ? 'rgba(10, 132, 255, 0.16)' : 'rgba(10, 132, 255, 0.10)',
                      borderColor: 'rgba(10, 132, 255, 0.45)',
                    },
                  ]}
                >
                  <View style={[styles.optionIconCircle, { backgroundColor: 'rgba(10, 132, 255, 0.24)' }]}>
                    <Ionicons name="layers" size={20} color="#0A84FF" />
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={[styles.optionTitle, { color: primaryText, textAlign }]}>
                      {isAr ? 'تحميل النسخة الكاملة (فيديو + موسيقى)' : 'Download Full Music (Video + Audio)'}
                    </Text>
                    <Text style={[styles.optionSub, { color: secondaryText, textAlign }]}>
                      {isAr
                        ? 'حفظ الفيديو والموسيقى معاً للتبديل السلس بدون إنترنت'
                        : 'Save both Video & Music Audio for full offline switching'}
                    </Text>
                  </View>
                  <Ionicons name="cloud-download-outline" size={20} color="#0A84FF" />
                </TouchableOpacity>
              </View>
            )}

            {/* PARTIALLY DOWNLOADED (Audio only or Video only) -> Upgrade to Full or Remove */}
            {downloadedTrack && !isFull && (
              <View style={styles.optionsCol}>
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => {
                    onClose();
                    onSelectDownload('full');
                  }}
                  style={[
                    styles.optionBtn,
                    {
                      flexDirection: rowDir,
                      backgroundColor: isDark ? 'rgba(10, 132, 255, 0.16)' : 'rgba(10, 132, 255, 0.10)',
                      borderColor: 'rgba(10, 132, 255, 0.45)',
                    },
                  ]}
                >
                  <View style={[styles.optionIconCircle, { backgroundColor: 'rgba(10, 132, 255, 0.24)' }]}>
                    <Ionicons name={hasVideo ? 'musical-notes' : 'videocam'} size={20} color="#0A84FF" />
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={[styles.optionTitle, { color: primaryText, textAlign }]}>
                      {hasVideo
                        ? isAr
                          ? 'إضافة الموسيقى (إكمال النسخة الكاملة)'
                          : 'Add Music Audio (Complete Full)'
                        : isAr
                          ? 'إضافة الفيديو (ترقية للنسخة الكاملة)'
                          : 'Add Video (Upgrade to Full)'}
                    </Text>
                    <Text style={[styles.optionSub, { color: secondaryText, textAlign }]}>
                      {hasVideo
                        ? isAr
                          ? 'سيتم تحميل الصوت ليصبح التبديل للموسيقى متاحاً أوفلاين'
                          : 'Downloads studio audio so Music mode works offline'
                        : isAr
                          ? 'سيتم تحميل الفيديو لتتمكن من مشاهدته أوفلاين'
                          : 'Downloads HD video so Video mode works offline'}
                    </Text>
                  </View>
                  <Ionicons name="cloud-download-outline" size={20} color="#0A84FF" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => {
                    onClose();
                    onSelectRemove('all');
                  }}
                  style={[
                    styles.optionBtn,
                    {
                      flexDirection: rowDir,
                      backgroundColor: 'rgba(239, 68, 68, 0.10)',
                      borderColor: 'rgba(239, 68, 68, 0.28)',
                    },
                  ]}
                >
                  <View style={[styles.optionIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.18)' }]}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={[styles.optionTitle, { color: '#EF4444', textAlign }]}>
                      {isAr ? 'حذف من الهاتف' : 'Remove from Device'}
                    </Text>
                    <Text style={[styles.optionSub, { color: secondaryText, textAlign }]}>
                      {isAr ? 'إزالة الملف المحمّل وتفريغ المساحة' : 'Delete downloaded file to free space'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* FULLY DOWNLOADED -> Remove Video Only or Remove All */}
            {downloadedTrack && isFull && (
              <View style={styles.optionsCol}>
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => {
                    onClose();
                    onSelectRemove('video');
                  }}
                  style={[
                    styles.optionBtn,
                    {
                      flexDirection: rowDir,
                      backgroundColor: cardBg,
                      borderColor: cardBorder,
                    },
                  ]}
                >
                  <View style={[styles.optionIconCircle, { backgroundColor: 'rgba(255, 159, 10, 0.18)' }]}>
                    <Ionicons name="videocam-off-outline" size={20} color="#FF9F0A" />
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={[styles.optionTitle, { color: primaryText, textAlign }]}>
                      {isAr ? 'حذف الفيديو فقط (الإبقاء على الموسيقى)' : 'Remove Video Only (Keep Music)'}
                    </Text>
                    <Text style={[styles.optionSub, { color: secondaryText, textAlign }]}>
                      {isAr ? 'يوفر مساحة الفيديو مع بقاء الصوت محفوظاً' : 'Frees video space while keeping audio offline'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => {
                    onClose();
                    onSelectRemove('all');
                  }}
                  style={[
                    styles.optionBtn,
                    {
                      flexDirection: rowDir,
                      backgroundColor: 'rgba(239, 68, 68, 0.10)',
                      borderColor: 'rgba(239, 68, 68, 0.28)',
                    },
                  ]}
                >
                  <View style={[styles.optionIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.18)' }]}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={[styles.optionTitle, { color: '#EF4444', textAlign }]}>
                      {isAr ? 'حذف الكل من الهاتف' : 'Remove Entire Download'}
                    </Text>
                    <Text style={[styles.optionSub, { color: secondaryText, textAlign }]}>
                      {isAr ? 'حذف الموسيقى والفيديو معاً' : 'Removes both offline music and video'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </LiquidGlassSurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.48)',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
  },
  sheetWrap: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  sheetCard: {
    padding: 18,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
      },
      android: { elevation: 18 },
    }),
  },
  headerRow: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  coverBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(128,128,128,0.16)',
  },
  coverImg: {
    width: '100%',
    height: '100%',
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMeta: {
    flex: 1,
    gap: 2,
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  trackArtist: {
    fontSize: 13,
    fontWeight: '500',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  statusPillText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
  },
  sectionPrompt: {
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 10,
  },
  optionsCol: {
    gap: 10,
  },
  optionBtn: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 18,
    borderWidth: 1,
  },
  optionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBody: {
    flex: 1,
    gap: 3,
  },
  optionTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  optionSub: {
    fontSize: 12,
    lineHeight: 16,
  },
});
