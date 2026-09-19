import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { getFileUrl } from '../config/api';
import { FriendActivity } from '../store/useSocialStore';
import { useAudioStore } from '../store/useAudioStore';

const { width } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────
interface ListenWithModalProps {
  friend: FriendActivity | null;
  visible: boolean;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const ListenWithModal: React.FC<ListenWithModalProps> = ({
  friend,
  visible,
  onClose,
}) => {
  const { playTrack, setPlayerModalVisible, activeUserId } = useAudioStore();

  if (!friend || !friend.currentTrack) return null;

  const track = friend.currentTrack;
  const avatarUrl = friend.avatar_url
    ? (friend.avatar_url.startsWith('http') ? friend.avatar_url : getFileUrl(friend.avatar_url))
    : 'https://via.placeholder.com/100';

  const thumbnailUrl = track.thumbnail
    ? (track.thumbnail.startsWith('http') ? track.thumbnail : getFileUrl(track.thumbnail))
    : null;

  const handleListenWith = async () => {
    onClose();
    // Short delay so modal closes smoothly before opening player
    setTimeout(async () => {
      await playTrack(
        {
          videoId: track.videoId,
          title: track.title,
          artist: track.artist,
          thumbnail: track.thumbnail,
        },
        activeUserId
      );
      setPlayerModalVisible(true);
    }, 300);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Card */}
      <View style={styles.cardWrapper}>
        <BlurView intensity={80} tint="dark" style={styles.card}>
          {/* Album art background strip */}
          {thumbnailUrl && (
            <Image source={{ uri: thumbnailUrl }} style={styles.artBackground} blurRadius={30} />
          )}
          <LinearGradient
            colors={['rgba(10,10,10,0.2)', 'rgba(10,10,10,0.97)']}
            style={StyleSheet.absoluteFill}
          />

          {/* Content */}
          <View style={styles.content}>
            {/* Header: friend info */}
            <View style={styles.friendRow}>
              <Image source={{ uri: avatarUrl }} style={styles.friendAvatar} />
              <View style={styles.friendInfo}>
                <Text style={styles.friendName} numberOfLines={1}>
                  {friend.full_name}
                </Text>
                <View style={styles.listeningBadge}>
                  <View style={styles.listeningDot} />
                  <Text style={styles.listeningText}>يستمع الآن</Text>
                </View>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Track info */}
            <View style={styles.trackRow}>
              {thumbnailUrl && (
                <Image source={{ uri: thumbnailUrl }} style={styles.trackArt} />
              )}
              <View style={styles.trackInfo}>
                <Text style={styles.trackTitle} numberOfLines={2}>
                  {track.title}
                </Text>
                <Text style={styles.trackArtist} numberOfLines={1}>
                  {track.artist}
                </Text>
              </View>
            </View>

            {/* CTA Button */}
            <TouchableOpacity onPress={handleListenWith} activeOpacity={0.85} style={styles.listenBtn}>
              <LinearGradient
                colors={['#DAA520', '#9B59B6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.listenBtnGradient}
              >
                <Ionicons name="musical-notes" size={18} color="#000" style={{ marginRight: 8 }} />
                <Text style={styles.listenBtnText}>استمع معه 🎵</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Dismiss */}
            <TouchableOpacity onPress={onClose} style={styles.dismissBtn}>
              <Text style={styles.dismissText}>إغلاق</Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </View>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  cardWrapper: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 16,
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 20,
    shadowColor: '#DAA520',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  artBackground: {
    ...StyleSheet.absoluteFill,
    opacity: 0.4,
  },
  content: {
    padding: 20,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  friendAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#DAA520',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
  listeningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  listeningDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#DAA520',
    marginRight: 5,
  },
  listeningText: {
    color: '#DAA520',
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  trackArt: {
    width: 56,
    height: 56,
    borderRadius: 10,
    marginRight: 14,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 20,
  },
  trackArtist: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    marginTop: 4,
  },
  listenBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
  },
  listenBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  listenBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 15,
  },
  dismissBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  dismissText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
  },
});
