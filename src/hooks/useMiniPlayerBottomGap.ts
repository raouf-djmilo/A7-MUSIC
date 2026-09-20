import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioStore } from '../store/useAudioStore';
import { Platform } from 'react-native';

const TAB_BAR_HEIGHT = 56;
const MINI_PLAYER_HEIGHT = 58;
const DOCK_MARGIN = 10;

/**
 * 🎵 useMiniPlayerBottomGap
 * Dynamically computes bottom content padding for FlatList and ScrollView containers
 * so the persistent Floating Pill MiniPlayer never occludes the last items in lists.
 */
export const useMiniPlayerBottomGap = () => {
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isMiniPlayerSuppressed = useAudioStore((s) => s.isMiniPlayerSuppressed);
  const currentRouteName = useAudioStore((s) => s.currentRouteName);
  const insets = useSafeAreaInsets();
  
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 16 : 10);
  const TAB_SCREENS = [
    'DashboardTab',
    'Dashboard',
    'RecordTab',
    'MusicTab',
    'MusicHome',
    'MusicSearch',
    'MusicLibrary',
    'ProfileTab',
    'Profile',
    'Tabs',
  ];
  const isTabBarVisible = !currentRouteName || TAB_SCREENS.includes(currentRouteName);
  const isWorkoutSummary = currentRouteName === 'WorkoutSummary';

  if (isWorkoutSummary) {
    return bottomInset + 16;
  }

  if (currentTrack && !isMiniPlayerSuppressed) {
    if (isTabBarVisible) {
      return bottomInset + TAB_BAR_HEIGHT + DOCK_MARGIN + MINI_PLAYER_HEIGHT + 16;
    }
    // In stack screens like ArtistDetailsScreen where tab bar is hidden
    return bottomInset + DOCK_MARGIN + MINI_PLAYER_HEIGHT + 16;
  }

  return isTabBarVisible ? bottomInset + TAB_BAR_HEIGHT + 12 : bottomInset + 16;
};

export default useMiniPlayerBottomGap;
