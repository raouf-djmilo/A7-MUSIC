import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LiquidGlassSurface } from '../../../components/LiquidGlassSurface';
import { MarqueeText } from '../../../components/MarqueeText';
import { CircularDownloadProgress } from '../../../components/CircularDownloadProgress';
import { STUDIO_IMAGE_PROPS } from '../../../utils/artworkHelper';
import type { Track } from '../../../store/useAudioStore';
import type { UserPlaylist } from '../../../services/firebaseMusicDb';

interface TrackOptionsModalProps {
  visible: boolean;
  onClose: () => void;
  currentTrack: Track;
  heroArtworkSources: any;
  isDark: boolean;
  isAr: boolean;
  bottomInset: number;
  hasUser: boolean;
  isLiked: boolean;
  isSavedInLibrary: boolean;
  isDownloading: boolean;
  isDownloaded: boolean;
  downloadProgress?: { status?: string; progress?: number } | null;
  downloadPct: number;
  resolvingAlbum: boolean;
  showPlaylistPicker: boolean;
  onTogglePlaylistPicker: () => void;
  loadingPlaylists: boolean;
  userPlaylists: UserPlaylist[];
  onGoToArtist: () => void;
  onGoToAlbum: () => void;
  onAddToLibrary: () => Promise<void>;
  onAddTrackToPlaylist: (pl: UserPlaylist) => void;
  onToggleLike: () => void;
  onDownloadPress: () => void;
  onShare: () => void;
}

export const TrackOptionsModal: React.FC<TrackOptionsModalProps> = React.memo(
  ({
    visible,
    onClose,
    currentTrack,
    heroArtworkSources,
    isDark,
    isAr,
    bottomInset,
    hasUser,
    isLiked,
    isSavedInLibrary,
    isDownloading,
    isDownloaded,
    downloadProgress,
    downloadPct,
    resolvingAlbum,
    showPlaylistPicker,
    onTogglePlaylistPicker,
    loadingPlaylists,
    userPlaylists,
    onGoToArtist,
    onGoToAlbum,
    onAddToLibrary,
    onAddTrackToPlaylist,
    onToggleLike,
    onDownloadPress,
    onShare,
  }) => {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <TouchableOpacity
          style={styles.trackMenuBackdrop}
          activeOpacity={1}
          onPress={onClose}
        >
          <BlurView
            intensity={isDark ? 35 : 28}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={[styles.trackMenuCardWrap, { paddingBottom: Math.max(bottomInset, 16) + 12 }]}
          >
            <LiquidGlassSurface
              glassStyle="regular"
              isInteractive={false}
              isDark={isDark}
              borderRadius={26}
              style={[
                styles.trackMenuCard,
                {
                  backgroundColor: isDark ? 'rgba(24, 26, 36, 0.88)' : 'rgba(255, 255, 255, 0.92)',
                  borderColor: isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.08)',
                },
              ]}
            >
              {/* Track Preview Header */}
              <View
                style={[
                  styles.trackMenuHeader,
                  {
                    flexDirection: isAr ? 'row-reverse' : 'row',
                    borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                  },
                ]}
              >
                <Image
                  source={heroArtworkSources}
                  style={styles.trackMenuThumb}
                  {...STUDIO_IMAGE_PROPS}
                />
                <View style={[styles.trackMenuMeta, { marginHorizontal: 12 }]}>
                  <MarqueeText
                    text={currentTrack.title || 'Track'}
                    style={[
                      styles.trackMenuTitle,
                      { color: isDark ? '#FFFFFF' : '#0F172A', writingDirection: isAr ? 'rtl' : 'ltr' },
                    ]}
                    speedPxPerSec={26}
                  />
                  <Text
                    style={[
                      styles.trackMenuArtist,
                      {
                        color: isDark ? 'rgba(255,255,255,0.68)' : 'rgba(15,23,42,0.65)',
                        textAlign: isAr ? 'right' : 'left',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {currentTrack.artist || 'Artist'}
                  </Text>
                </View>
              </View>

              {/* 1. Go to Artist */}
              <TouchableOpacity
                style={[styles.trackMenuRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                activeOpacity={0.75}
                onPress={onGoToArtist}
              >
                <Ionicons
                  name="person-circle-outline"
                  size={22}
                  color={isDark ? '#FFFFFF' : '#0F172A'}
                />
                <Text
                  style={[
                    styles.trackMenuRowText,
                    { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: isAr ? 'right' : 'left' },
                  ]}
                >
                  {isAr ? 'الانتقال إلى الفنان' : 'Go to Artist'}
                </Text>
                <Ionicons
                  name={isAr ? 'chevron-back' : 'chevron-forward'}
                  size={16}
                  color={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.40)'}
                />
              </TouchableOpacity>

              {/* 2. Go to Album */}
              <TouchableOpacity
                style={[styles.trackMenuRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                activeOpacity={0.75}
                disabled={resolvingAlbum}
                onPress={onGoToAlbum}
              >
                {resolvingAlbum ? (
                  <ActivityIndicator size="small" color={isDark ? '#FFFFFF' : '#0F172A'} />
                ) : (
                  <Ionicons
                    name="disc-outline"
                    size={22}
                    color={isDark ? '#FFFFFF' : '#0F172A'}
                  />
                )}
                <Text
                  style={[
                    styles.trackMenuRowText,
                    { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: isAr ? 'right' : 'left' },
                  ]}
                >
                  {isAr ? 'الانتقال إلى الألبوم' : 'Go to Album'}
                </Text>
                <Ionicons
                  name={isAr ? 'chevron-back' : 'chevron-forward'}
                  size={16}
                  color={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.40)'}
                />
              </TouchableOpacity>

              {/* 3. Add to Library + Quick Playlists */}
              <TouchableOpacity
                style={[styles.trackMenuRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                activeOpacity={0.75}
                onPress={async () => {
                  await onAddToLibrary();
                  onClose();
                }}
              >
                <Ionicons
                  name={isSavedInLibrary ? 'checkmark-circle' : 'add-circle-outline'}
                  size={22}
                  color={isSavedInLibrary ? '#34D399' : isDark ? '#FFFFFF' : '#0F172A'}
                />
                <Text
                  style={[
                    styles.trackMenuRowText,
                    { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: isAr ? 'right' : 'left' },
                  ]}
                >
                  {isSavedInLibrary
                    ? isAr
                      ? 'مضافة في مكتبتك (إزالة)'
                      : 'Saved in Library (Remove)'
                    : isAr
                      ? 'إضافة إلى المكتبة'
                      : 'Add to Library'}
                </Text>
              </TouchableOpacity>

              {hasUser && (
                <TouchableOpacity
                  style={[styles.trackMenuRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                  activeOpacity={0.75}
                  onPress={onTogglePlaylistPicker}
                >
                  <Ionicons
                    name="list-outline"
                    size={22}
                    color={isDark ? '#FFFFFF' : '#0F172A'}
                  />
                  <Text
                    style={[
                      styles.trackMenuRowText,
                      { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: isAr ? 'right' : 'left' },
                    ]}
                  >
                    {isAr ? 'إضافة إلى قائمة تشغيل' : 'Add to Playlist'}
                  </Text>
                  <Ionicons
                    name={showPlaylistPicker ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.40)'}
                  />
                </TouchableOpacity>
              )}

              {showPlaylistPicker && (
                <View style={styles.playlistSubList}>
                  {loadingPlaylists ? (
                    <ActivityIndicator size="small" color="#0A84FF" style={{ marginVertical: 8 }} />
                  ) : userPlaylists.length === 0 ? (
                    <Text
                      style={{
                        fontSize: 12.5,
                        color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.55)',
                        paddingVertical: 6,
                        textAlign: isAr ? 'right' : 'left',
                      }}
                    >
                      {isAr
                        ? 'لا توجد قوائم تشغيل بعد — أنشئ واحدة من المكتبة'
                        : 'No playlists yet — create one in Library'}
                    </Text>
                  ) : (
                    userPlaylists.slice(0, 5).map((pl) => (
                      <TouchableOpacity
                        key={pl.id}
                        activeOpacity={0.75}
                        onPress={() => onAddTrackToPlaylist(pl)}
                        style={[
                          styles.playlistSubRow,
                          {
                            flexDirection: isAr ? 'row-reverse' : 'row',
                            backgroundColor: isDark
                              ? 'rgba(255,255,255,0.08)'
                              : 'rgba(15,23,42,0.05)',
                          },
                        ]}
                      >
                        <Ionicons name="musical-notes" size={16} color="#0A84FF" />
                        <Text
                          style={{
                            flex: 1,
                            color: isDark ? '#FFFFFF' : '#0F172A',
                            fontSize: 13.5,
                            fontWeight: '600',
                            marginHorizontal: 10,
                            textAlign: isAr ? 'right' : 'left',
                          }}
                          numberOfLines={1}
                        >
                          {pl.name}
                        </Text>
                        <Ionicons name="add" size={18} color="#0A84FF" />
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              {/* 4. Favorite */}
              <TouchableOpacity
                style={[styles.trackMenuRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                activeOpacity={0.75}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onToggleLike();
                  onClose();
                }}
              >
                <Ionicons
                  name={isLiked ? 'heart' : 'heart-outline'}
                  size={22}
                  color={isLiked ? '#FF375F' : isDark ? '#FFFFFF' : '#0F172A'}
                />
                <Text
                  style={[
                    styles.trackMenuRowText,
                    { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: isAr ? 'right' : 'left' },
                  ]}
                >
                  {isLiked
                    ? isAr
                      ? 'إزالة من المفضلة'
                      : 'Remove from Favorites'
                    : isAr
                      ? 'إضافة إلى المفضلة'
                      : 'Favorite'}
                </Text>
              </TouchableOpacity>

              {/* 4.5 Download for Offline Listening */}
              <TouchableOpacity
                style={[styles.trackMenuRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                activeOpacity={0.75}
                disabled={isDownloading}
                onPress={() => {
                  onClose();
                  onDownloadPress();
                }}
              >
                {isDownloading ? (
                  <CircularDownloadProgress
                    status={(downloadProgress?.status as 'probing' | 'downloading') || 'downloading'}
                    progress={downloadProgress?.progress || 0}
                    size={22}
                    activeColor="#0A84FF"
                    trackColor={isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.16)'}
                  />
                ) : isDownloaded ? (
                  <CircularDownloadProgress status="completed" size={22} completedColor="#30D158" />
                ) : (
                  <Ionicons
                    name="cloud-download-outline"
                    size={22}
                    color={isDark ? '#FFFFFF' : '#0F172A'}
                  />
                )}
                <Text
                  style={[
                    styles.trackMenuRowText,
                    { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: isAr ? 'right' : 'left' },
                  ]}
                >
                  {isDownloading
                    ? isAr
                      ? `جاري التحميل... ${downloadPct}%`
                      : `Downloading... ${downloadPct}%`
                    : isDownloaded
                      ? isAr
                        ? 'إدارة التحميل (ترقية / حذف)'
                        : 'Manage Offline Download'
                      : isAr
                        ? 'تحميل على الهاتف (أوفلاين)'
                        : 'Download for Offline'}
                </Text>
              </TouchableOpacity>

              {/* 5. Share */}
              <TouchableOpacity
                style={[styles.trackMenuRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                activeOpacity={0.75}
                onPress={() => {
                  onClose();
                  onShare();
                }}
              >
                <Ionicons
                  name="share-outline"
                  size={22}
                  color={isDark ? '#FFFFFF' : '#0F172A'}
                />
                <Text
                  style={[
                    styles.trackMenuRowText,
                    { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: isAr ? 'right' : 'left' },
                  ]}
                >
                  {isAr ? 'مشاركة' : 'Share'}
                </Text>
              </TouchableOpacity>

              {/* 6. Cancel */}
              <TouchableOpacity
                style={[
                  styles.trackMenuCancelBtn,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' },
                ]}
                activeOpacity={0.75}
                onPress={onClose}
              >
                <Text style={[styles.trackMenuCancelTxt, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Text>
              </TouchableOpacity>
            </LiquidGlassSurface>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  }
);

const styles = StyleSheet.create({
  trackMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  trackMenuCardWrap: {
    paddingHorizontal: 14,
  },
  trackMenuCard: {
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    overflow: 'hidden',
  },
  trackMenuHeader: {
    alignItems: 'center',
    paddingBottom: 14,
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  trackMenuThumb: {
    width: 50,
    height: 50,
    borderRadius: 10,
  },
  trackMenuMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  trackMenuTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  trackMenuArtist: {
    fontSize: 13.5,
    fontWeight: '500',
    marginTop: 2,
  },
  trackMenuRow: {
    alignItems: 'center',
    gap: 13,
    paddingVertical: 13,
  },
  trackMenuRowText: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '600',
  },
  playlistSubList: {
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 8,
    gap: 6,
  },
  playlistSubRow: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },
  trackMenuCancelBtn: {
    marginTop: 8,
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: 'center',
  },
  trackMenuCancelTxt: {
    fontSize: 15.5,
    fontWeight: '700',
  },
});
