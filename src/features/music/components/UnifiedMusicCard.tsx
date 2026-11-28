// src/features/music/components/UnifiedMusicCard.tsx

import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CachedArtwork } from './CachedArtwork';
import { TrackPlayButton } from './TrackPlayButton';
import { useTheme } from '../../../theme/ThemeContext';
import { useAudioStore, Track } from '../../../store/useAudioStore';
import {
  MusicCardEntity,
  TrackEntity,
  resolvePlayerArtwork,
} from '../types/musicEntities.types';

export interface UnifiedMusicCardProps {
  entity: MusicCardEntity;
  onPress?: (entity: MusicCardEntity) => void;
  onPlayPress?: (entity: MusicCardEntity) => void;
  cardWidth?: number;
  isDark?: boolean;
  style?: StyleProp<ViewStyle>;
}

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec) || sec <= 0) return '0:00';
  const mins = Math.floor(sec / 60);
  const remSec = Math.floor(sec % 60);
  return `${mins}:${remSec < 10 ? '0' : ''}${remSec}`;
}

function toStoreTrack(entity: TrackEntity, contextType: 'single' | 'album' | 'playlist'): Track {
  return {
    videoId: entity.videoId,
    title: entity.title,
    artist: entity.artist,
    thumbnail: resolvePlayerArtwork(entity, contextType) || null,
    duration: entity.durationSec * 1000,
    isOfficial: entity.artistVerified,
  };
}

/**
 * 🎵 Unified Music Card Component (Single / Album / Playlist)
 * - Supports official album with badge & navigation to AlbumDetailsScreen
 * - Supports playlist with Stacked Deck layered visual effect
 * - Supports single track with direct playback & duration
 * - Full light/dark mode contrast compliance
 */
export const UnifiedMusicCard: React.FC<UnifiedMusicCardProps> = memo(({
  entity,
  onPress,
  onPlayPress,
  cardWidth = 156,
  isDark: isDarkProp,
  style,
}) => {
  const { isDark: themeDark } = useTheme();
  const isDark = isDarkProp ?? themeDark;
  const navigation = useNavigation<any>();

  // ── 1. تشغيل الأغنية الفردية ──
  const handlePlaySingle = useCallback(() => {
    if (entity.type !== 'single') return;
    if (onPlayPress) {
      onPlayPress(entity);
      return;
    }
    const storeTrack = toStoreTrack(entity.track, 'single');
    useAudioStore.getState().playTrack(storeTrack, [storeTrack], 0, storeTrack.title || 'Single');
  }, [entity, onPlayPress]);

  // ── 2. تشغيل الألبوم بالكامل ──
  const handlePlayAlbum = useCallback(() => {
    if (entity.type !== 'album') return;
    if (onPlayPress) {
      onPlayPress(entity);
      return;
    }
    const storeTracks = entity.tracks.map((t) => toStoreTrack(t, 'album'));
    if (storeTracks.length > 0) {
      useAudioStore.getState().playAlbumContext(storeTracks, 0, entity.title);
    }
  }, [entity, onPlayPress]);

  // ── 3. تشغيل قائمة التشغيل ──
  const handlePlayPlaylist = useCallback(() => {
    if (entity.type !== 'playlist') return;
    if (onPlayPress) {
      onPlayPress(entity);
      return;
    }
    const storeTracks = entity.tracks.map((t) => toStoreTrack(t, 'playlist'));
    if (storeTracks.length > 0) {
      useAudioStore.getState().playAlbumContext(storeTracks, 0, entity.title);
    }
  }, [entity, onPlayPress]);

  // ── معالج النقر على البطاقة ──
  const handleCardPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onPress) {
      onPress(entity);
      return;
    }

    if (entity.type === 'single') {
      handlePlaySingle();
    } else if (entity.type === 'album') {
      navigation.navigate('AlbumDetails', {
        albumId: entity.id,
        albumTitle: entity.title,
        artistName: entity.artist,
        cover: entity.officialCoverUri,
        tracks: entity.tracks.map((t) => toStoreTrack(t, 'album')),
        type: 'album',
      });
    } else if (entity.type === 'playlist') {
      navigation.navigate('AlbumDetails', {
        playlistId: entity.id,
        albumTitle: entity.title,
        artistName: entity.subtitle || 'Playlist',
        cover: entity.coverUri || (entity.collageUris && entity.collageUris[0]),
        tracks: entity.tracks.map((t) => toStoreTrack(t, 'playlist')),
        type: 'playlist',
      });
    }
  }, [entity, onPress, handlePlaySingle, navigation]);

  // استخراج البيانات بحسب نوع الكيان
  let title = '';
  let subtitle = '';
  let metaInfo = '';
  let artworkUri = '';
  let isVerified = false;

  if (entity.type === 'single') {
    title = entity.track.title;
    subtitle = entity.track.artist;
    metaInfo = formatDuration(entity.track.durationSec);
    artworkUri = resolvePlayerArtwork(entity.track, 'single') || '';
    isVerified = !!entity.track.artistVerified;
  } else if (entity.type === 'album') {
    title = entity.title;
    subtitle = entity.artist;
    metaInfo = `${entity.tracks.length} songs${entity.releaseYear ? ` • ${entity.releaseYear}` : ''}`;
    artworkUri = entity.officialCoverUri;
  } else if (entity.type === 'playlist') {
    title = entity.title;
    subtitle = entity.subtitle || 'Curated Mix';
    metaInfo = `${entity.tracks.length} songs`;
    artworkUri = entity.coverUri || (entity.collageUris && entity.collageUris[0]) || '';
  }

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={handleCardPress}
      style={[styles.container, { width: cardWidth }, style]}
    >
      {/* ── حاوية الغلاف والطبقات (Artwork Stage) ── */}
      <View style={[styles.artworkContainer, { width: cardWidth, height: cardWidth }]}>
        {/* 📚 تأثير الطبقات المتراصة لقوائم التشغيل (Stacked Deck Effect) */}
        {entity.type === 'playlist' && (
          <>
            <View
              style={[
                styles.stackedDeckLayer2,
                {
                  width: cardWidth - 20,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                },
              ]}
            />
            <View
              style={[
                styles.stackedDeckLayer1,
                {
                  width: cardWidth - 10,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.10)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.10)',
                },
              ]}
            />
          </>
        )}

        {/* الغلاف الرئيسي */}
        <CachedArtwork
          uri={artworkUri}
          recyclingKey={`card-${entity.id}`}
          borderRadius={14}
          isDark={isDark}
          style={StyleSheet.absoluteFill}
        />

        {/* 🏷️ شارة الألبوم الرسمي (Official Album Badge) */}
        {entity.type === 'album' && (
          <View
            style={[
              styles.entityBadge,
              {
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.62)' : 'rgba(255, 255, 255, 0.82)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(0, 0, 0, 0.12)',
              },
            ]}
          >
            <MaterialCommunityIcons
              name="album"
              size={11}
              color={isDark ? '#FFFFFF' : '#000000'}
              style={{ marginRight: 3 }}
            />
            <Text
              style={[
                styles.entityBadgeText,
                { color: isDark ? '#FFFFFF' : '#000000' },
              ]}
            >
              ALBUM
            </Text>
          </View>
        )}

        {/* 🏷️ شارة قائمة التشغيل (Playlist Badge) */}
        {entity.type === 'playlist' && (
          <View
            style={[
              styles.entityBadge,
              {
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.62)' : 'rgba(255, 255, 255, 0.82)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(0, 0, 0, 0.12)',
              },
            ]}
          >
            <Ionicons
              name="musical-notes"
              size={10}
              color={isDark ? '#FFFFFF' : '#000000'}
              style={{ marginRight: 3 }}
            />
            <Text
              style={[
                styles.entityBadgeText,
                { color: isDark ? '#FFFFFF' : '#000000' },
              ]}
            >
              PLAYLIST
            </Text>
          </View>
        )}

        {/* ⏯️ زر التشغيل السريع المغموس (TrackPlayButton) */}
        <View style={styles.playButtonWrapper}>
          {entity.type === 'single' ? (
            <TrackPlayButton
              videoId={entity.track.videoId}
              onPressAction={handlePlaySingle}
              size={36}
              iconSize={16}
              variant="frosted"
            />
          ) : entity.type === 'album' ? (
            <TrackPlayButton
              contextId={entity.id}
              onPressAction={handlePlayAlbum}
              size={36}
              iconSize={16}
              variant="frosted"
            />
          ) : (
            <TrackPlayButton
              contextId={entity.id}
              onPressAction={handlePlayPlaylist}
              size={36}
              iconSize={16}
              variant="frosted"
            />
          )}
        </View>
      </View>

      {/* ── معلومات المقطع / الألبوم (Metadata) ── */}
      <View style={styles.metaContainer}>
        {/* العنوان الرئيسي */}
        <Text
          style={[
            styles.titleText,
            { color: isDark ? '#FFFFFF' : '#111827' },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>

        {/* اسم الفنان / الوصف */}
        <View style={styles.subtitleRow}>
          <Text
            style={[
              styles.subtitleText,
              { color: isDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.65)' },
            ]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
          {isVerified && (
            <Ionicons
              name="checkmark-circle"
              size={12}
              color="#458eff"
              style={{ marginLeft: 3 }}
            />
          )}
        </View>

        {/* معلومات إضافية (المدة أو عدد الأغاني) */}
        {!!metaInfo && (
          <Text
            style={[
              styles.metaInfoText,
              { color: isDark ? 'rgba(255, 255, 255, 0.42)' : 'rgba(0, 0, 0, 0.42)' },
            ]}
            numberOfLines={1}
          >
            {metaInfo}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    marginRight: 14,
  },
  artworkContainer: {
    position: 'relative',
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  stackedDeckLayer2: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    height: 14,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 1,
  },
  stackedDeckLayer1: {
    position: 'absolute',
    top: -4,
    alignSelf: 'center',
    height: 10,
    borderTopLeftRadius: 13,
    borderTopRightRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
  entityBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 3,
  },
  entityBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  playButtonWrapper: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    zIndex: 3,
  },
  metaContainer: {
    marginTop: 8,
    paddingHorizontal: 2,
  },
  titleText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  subtitleText: {
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  metaInfoText: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 2,
  },
});

export default UnifiedMusicCard;
