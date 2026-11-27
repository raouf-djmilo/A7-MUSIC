import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioStore } from '../store/useAudioStore';
import { Platform } from 'react-native';
import { APPLE_BAR_METRICS } from '../theme/AppleLiquidTokens';
import { USE_NATIVE_LIQUID_TABS } from '../navigation/navigationConfig';

const MINI_PLAYER_HEIGHT = 52;
const MINI_TAB_GAP = 8;

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
  const tabBarTotalHeight = USE_NATIVE_LIQUID_TABS
    ? (Platform.OS === 'ios' ? Math.max(insets.bottom + 49, 83) : 60)
    : Math.max(insets.bottom + 6, APPLE_BAR_METRICS.bottomOffset) + APPLE_BAR_METRICS.barHeight;
  
  const TAB_SCREENS = [
    'DashboardTab',
    'Dashboard',
    'MusicTab',
    'SearchTab',
    'LibraryTab',
    'MusicHome',
    'MusicSearch',
    'MusicLibrary',
    'ProfileTab',
    'Profile',
    'Tabs',
  ];
  const isTabBarVisible = !currentRouteName || TAB_SCREENS.includes(currentRouteName);

  if (currentTrack && !isMiniPlayerSuppressed) {
    if (isTabBarVisible) {
      return tabBarTotalHeight + MINI_TAB_GAP + MINI_PLAYER_HEIGHT + 16;
    }
    // In stack screens like ArtistDetailsScreen where tab bar is hidden
    return bottomInset + MINI_TAB_GAP + MINI_PLAYER_HEIGHT + 16;
  }

  return isTabBarVisible ? tabBarTotalHeight + 12 : bottomInset + 16;
};

export default useMiniPlayerBottomGap;
