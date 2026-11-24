import React, { useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Tabs } from 'react-native-screens';
import { DashboardScreen } from '../screens/DashboardScreen';
import { MusicScreen } from '../screens/MusicScreen';
import { MusicSearch } from '../screens/MusicSearch';
import { MusicLibrary } from '../screens/MusicLibrary';
import { ProfileScreen } from '../screens/ProfileScreen';
import { useTheme } from '../theme/ThemeContext';
import { useAudioStore } from '../store/useAudioStore';
import { useSyncNativeAppearance } from '../hooks/useSyncNativeAppearance';

export interface NativeLiquidBottomTabsProps {
  activeIndex: number;
  onTabChange: (index: number) => void;
}

const TAB_KEYS = ['DashboardTab', 'MusicTab', 'SearchTab', 'LibraryTab', 'ProfileTab'] as const;

/**
 * 🧪 Phase 2: Apple Native Liquid BottomTabs via react-native-screens 4.30
 * - Uses native Tabs.Host and Tabs.Screen directly on UIKit (Metal GPU).
 * - Apple native SF Symbols (house, music.note, person).
 * - Full Dark Mode & Light Mode UIUserInterfaceStyle synchronization.
 * - Dynamic standardAppearance with calibrated contrast ratios for active/inactive tabs.
 * - Toggled safely via USE_NATIVE_LIQUID_TABS feature flag.
 */
export const NativeLiquidBottomTabs: React.FC<NativeLiquidBottomTabsProps> = ({
  activeIndex,
  onTabChange,
}) => {
  const { theme, isDark } = useTheme();

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

  return (
    <Tabs.Host
      navStateRequest={navStateRequest}
      onTabSelected={handleTabSelected}
      colorScheme={isDark ? 'dark' : 'light'}
      nativeContainerStyle={{
        backgroundColor: theme.background,
      }}
      ios={{
        tabBarTintColor: isDark ? '#FFFFFF' : '#000000',
      }}
    >
      <Tabs.Screen
        screenKey="DashboardTab"
        title="الرئيسية"
        ios={{
          icon: {
            type: 'sfSymbol',
            name: 'house',
          },
          standardAppearance: screenAppearance,
          scrollEdgeAppearance: screenAppearance,
        }}
      >
        <DashboardScreen />
      </Tabs.Screen>

      <Tabs.Screen
        screenKey="MusicTab"
        title="الموسيقى"
        ios={{
          icon: {
            type: 'sfSymbol',
            name: 'music.note',
          },
          standardAppearance: screenAppearance,
          scrollEdgeAppearance: screenAppearance,
        }}
      >
        <MusicScreen />
      </Tabs.Screen>

      <Tabs.Screen
        screenKey="SearchTab"
        title="بحث"
        ios={{
          icon: {
            type: 'sfSymbol',
            name: 'magnifyingglass',
          },
          standardAppearance: screenAppearance,
          scrollEdgeAppearance: screenAppearance,
        }}
      >
        <MusicSearch />
      </Tabs.Screen>

      <Tabs.Screen
        screenKey="LibraryTab"
        title="المكتبة"
        ios={{
          icon: {
            type: 'sfSymbol',
            name: 'books.vertical',
          },
          standardAppearance: screenAppearance,
          scrollEdgeAppearance: screenAppearance,
        }}
      >
        <MusicLibrary />
      </Tabs.Screen>

      <Tabs.Screen
        screenKey="ProfileTab"
        title="حسابي"
        ios={{
          icon: {
            type: 'sfSymbol',
            name: 'person',
          },
          standardAppearance: screenAppearance,
          scrollEdgeAppearance: screenAppearance,
        }}
      >
        <ProfileScreen />
      </Tabs.Screen>
    </Tabs.Host>
  );
};

export default NativeLiquidBottomTabs;
