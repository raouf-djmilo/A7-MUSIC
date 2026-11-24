import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MusicHome } from './MusicHome';
import { useAudioStore } from '../store/useAudioStore';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme/ThemeContext';

/**
 * Dedicated Music Tab root screen.
 * Opens directly into MusicHome (top Search/Library segmented bar removed;
 * Search and Library are now standalone bottom navigation tabs).
 */
export const MusicScreen = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { setActiveUserId, fetchInitialLikes } = useAudioStore();

  useEffect(() => {
    if (user?.id) {
      setActiveUserId(user.id);
      fetchInitialLikes(user.id);
    }
  }, [user?.id, setActiveUserId, fetchInitialLikes]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <MusicHome navigation={navigation} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default MusicScreen;
