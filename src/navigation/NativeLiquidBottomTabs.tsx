import React, { useCallback, useMemo } from 'react';
import { Tabs } from 'react-native-screens';
import { DashboardScreen } from '../screens/DashboardScreen';
import { MusicScreen } from '../screens/MusicScreen';
import { MusicSearch } from '../screens/MusicSearch';
import { MusicLibrary } from '../screens/MusicLibrary';
import { ProfileScreen } from '../screens/ProfileScreen';
import { useTheme } from '../theme/ThemeContext';
import { useAudioStore } from '../store/useAudioStore';
import { useLanguageStore } from '../store/useLanguageStore';
import { useSyncNativeAppearance } from '../hooks/useSyncNativeAppearance';

export interface NativeLiquidBottomTabsProps {
  activeIndex: number;
  onTabChange: (index: number) => void;
}

const TAB_KEYS = ['DashboardTab', 'MusicTab', 'SearchTab', 'LibraryTab', 'ProfileTab'] as const;

/**
 * 🧪 Apple Native Liquid BottomTabs via react-native-screens 4.30
 * - Uses native UIKit BottomTabs (Tabs.Host / Tabs.Screen) with Search detached on iOS 26.
 * - Coordinates smoothly with UnifiedPlayerSheet's Scroll-Reactive MiniPlayer Dock via
 *   `tabBarHidden={isDockMinimized}` so Tab screens (like MusicTab & LibraryTab) collapse
 *   from 2 bars down into a single unified [Home] [MiniPlayer] [Search] bar cleanly.
 */
export const NativeLiquidBottomTabs: React.FC<NativeLiquidBottomTabsProps> = ({
  activeIndex,
  onTabChange,
}) => {
  const { theme, isDark } = useTheme();
  const language = useLanguageStore((s) => s.language);
  const isEn = language === 'en';
  const isDockMinimized = useAudioStore((s) => s.isDockMinimized);

  // 🌓 Guarantee native UIWindow and UITabBar sync with internal theme
  useSyncNativeAppearance(isDark);

  const handleTabSelected = useCallback(
    (e: any) => {
      const selectedKey = e?.nativeEvent?.selectedScreenKey;
      const idx = TAB_KEYS.indexOf(selectedKey);
      if (idx !== -1) {
        useAudioStore.getState().setCurrentRouteName(selectedKey);
        onTabChange(idx);
      }
    },
    [onTabChange]
  );

  const navStateRequest = useMemo(
    () => ({
      selectedScreenKey: TAB_KEYS[activeIndex] || 'DashboardTab',
      baseProvenance: activeIndex,
    }),
    [activeIndex]
  );

  // 🎨 High-contrast Apple vibrancy tints for active and inactive states
  const screenAppearance = useMemo(
    () => ({
      stacked: {
        normal: {
          tabBarItemIconColor: isDark
            ? 'rgba(235, 235, 245, 0.55)'
            : 'rgba(60, 60, 67, 0.55)',
          tabBarItemTitleFontColor: isDark
            ? 'rgba(235, 235, 245, 0.55)'
            : 'rgba(60, 60, 67, 0.55)',
        },
        selected: {
          tabBarItemIconColor: isDark ? '#FFFFFF' : '#000000',
          tabBarItemTitleFontColor: isDark ? '#FFFFFF' : '#000000',
        },
      },
      inline: {
        normal: {
          tabBarItemIconColor: isDark
            ? 'rgba(235, 235, 245, 0.55)'
            : 'rgba(60, 60, 67, 0.55)',
          tabBarItemTitleFontColor: isDark
            ? 'rgba(235, 235, 245, 0.55)'
            : 'rgba(60, 60, 67, 0.55)',
        },
        selected: {
          tabBarItemIconColor: isDark ? '#FFFFFF' : '#000000',
          tabBarItemTitleFontColor: isDark ? '#FFFFFF' : '#000000',
        },
      },
    }),
    [isDark]
  );

  const hostIosConfig = useMemo(
    () => ({
      tabBarTintColor: isDark ? '#FFFFFF' : '#000000',
      tabBarHiddenAnimationEnabled: true,
    }),
    [isDark]
  );

  return (
    <Tabs.Host
      navStateRequest={navStateRequest}
      onTabSelected={handleTabSelected}
      tabBarHidden={isDockMinimized}
      colorScheme={isDark ? 'dark' : 'light'}
      nativeContainerStyle={{
        backgroundColor: theme.background,
      }}
      ios={hostIosConfig}
    >
      <Tabs.Screen
        screenKey="DashboardTab"
        title={isEn ? 'Home' : 'الرئيسية'}
        ios={{
          icon: {
            type: 'sfSymbol',
            name: 'house',
          },
          overrideScrollViewContentInsetAdjustmentBehavior: false,
          standardAppearance: screenAppearance,
          scrollEdgeAppearance: screenAppearance,
        }}
      >
        <DashboardScreen />
      </Tabs.Screen>

      <Tabs.Screen
        screenKey="MusicTab"
        title={isEn ? 'Music' : 'الموسيقى'}
        ios={{
          icon: {
            type: 'sfSymbol',
            name: 'music.note',
          },
          overrideScrollViewContentInsetAdjustmentBehavior: false,
          standardAppearance: screenAppearance,
          scrollEdgeAppearance: screenAppearance,
        }}
      >
        <MusicScreen />
      </Tabs.Screen>

      <Tabs.Screen
        screenKey="LibraryTab"
        title={isEn ? 'Library' : 'المكتبة'}
        ios={{
          icon: {
            type: 'sfSymbol',
            name: 'books.vertical',
          },
          overrideScrollViewContentInsetAdjustmentBehavior: false,
          standardAppearance: screenAppearance,
          scrollEdgeAppearance: screenAppearance,
        }}
      >
        <MusicLibrary />
      </Tabs.Screen>

      <Tabs.Screen
        screenKey="ProfileTab"
        title={isEn ? 'Profile' : 'حسابي'}
        ios={{
          icon: {
            type: 'sfSymbol',
            name: 'person',
          },
          overrideScrollViewContentInsetAdjustmentBehavior: false,
          standardAppearance: screenAppearance,
          scrollEdgeAppearance: screenAppearance,
        }}
      >
        <ProfileScreen />
      </Tabs.Screen>

      <Tabs.Screen
        screenKey="SearchTab"
        title={isEn ? 'Search' : 'بحث'}
        ios={{
          icon: {
            type: 'sfSymbol',
            name: 'magnifyingglass',
          },
          systemItem: 'search',
          overrideScrollViewContentInsetAdjustmentBehavior: false,
          standardAppearance: screenAppearance,
          scrollEdgeAppearance: screenAppearance,
        }}
      >
        <MusicSearch />
      </Tabs.Screen>
    </Tabs.Host>
  );
};

export default NativeLiquidBottomTabs;
