import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { PulsingAvatar } from './PulsingAvatar';
import { ListenWithModal } from './ListenWithModal';
import { useSocialStore, FriendActivity } from '../store/useSocialStore';
import { useAuth } from '../providers/AuthProvider';
import { useAudioStore } from '../store/useAudioStore';

// ─── Component ────────────────────────────────────────────────────────────────
export const SocialBar: React.FC = () => {
  const { friends, isFetching } = useSocialStore();
  const { user } = useAuth();
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  
  const [selectedFriend, setSelectedFriend] = useState<FriendActivity | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Inject current user into the list if they are listening
  const displayList: any[] = [...friends];
  if (user && isPlaying && currentTrack) {
    // ✅ Use actual user.id so deduplication can match this entry
    // This prevents ghost duplicates if a self-broadcast ever slips through
    const alreadyInList = displayList.some(f => String(f.id) === String(user.id));
    if (!alreadyInList) {
      displayList.unshift({
        id: String(user.id),
        username: 'أنا',
        full_name: 'أنا',
        avatar_url: user.avatar_url,
        isOnline: true,
        isListening: true,
        currentTrack: currentTrack,
        isMe: true
      });
    }
  }

  const handleAvatarPress = (friend: any) => {
    if (friend.isMe) return; // Can't "Listen With" yourself
    if (friend.isListening && friend.currentTrack) {
      setSelectedFriend(friend);
      setModalVisible(true);
    }
  };

  if (!isFetching && displayList.length === 0) return null;

  return (
    <>
      <View style={styles.container}>
        {/* Section header */}
        <View style={styles.headerRow}>
          <View style={styles.pulseDot} />
          <Text style={styles.headerText}>النبض الاجتماعي</Text>
          {isFetching && (
            <ActivityIndicator size="small" color="#DAA520" style={{ marginLeft: 8 }} />
          )}
        </View>

        {/* Horizontal scroll of friend avatars */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {displayList.map((friend) => (
            <View key={`social-${friend.id}`} style={styles.friendItem}>
              <View style={styles.avatarWrapper}>
                <PulsingAvatar
                  avatarUrl={friend.avatar_url}
                  isListening={friend.isListening}
                  isOnline={friend.isOnline}
                  size={54}
                  onPress={() => handleAvatarPress(friend)}
                  isShared={!friend.isMe && friend.currentTrack?.videoId === currentTrack?.videoId && friend.isListening}
                />
                {!friend.isMe && friend.currentTrack?.videoId === currentTrack?.videoId && friend.isListening && (
                  <View style={styles.sharedBadge}>
                    <Text style={styles.sharedBadgeText}>معاً</Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.friendName,
                  !friend.isOnline && { opacity: 0.35 },
                  friend.isListening && { color: '#DAA520' },
                ]}
                numberOfLines={1}
              >
                {friend.full_name?.split(' ')[0] || friend.username}
              </Text>
              {friend.isListening && (
                <Text style={styles.nowPlayingHint} numberOfLines={1}>
                  {!friend.isMe && friend.currentTrack?.videoId === currentTrack?.videoId
                    ? '🎧 يستمع معك'
                    : `♬ ${friend.currentTrack?.title?.slice(0, 14)}…`}
                </Text>
              )}
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Listen With Modal */}
      <ListenWithModal
        friend={selectedFriend}
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setSelectedFriend(null);
        }}
      />
    </>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DAA520',
    marginRight: 8,
    // Simple glow via shadow
    shadowColor: '#DAA520',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
    elevation: 4,
  },
  headerText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scroll: {
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  friendItem: {
    alignItems: 'center',
    width: 72,
    marginHorizontal: 5,
  },
  friendName: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  nowPlayingHint: {
    color: 'rgba(218, 165, 32, 0.7)',
    fontSize: 9,
    marginTop: 1,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  avatarWrapper: {
    position: 'relative',
  },
  sharedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#DAA520',
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1.5,
    borderColor: '#000',
  },
  sharedBadgeText: {
    color: '#000',
    fontSize: 8,
    fontWeight: '800',
  },
});
