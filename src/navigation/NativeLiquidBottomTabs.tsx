import React, { useCallback, useMemo } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'react-native-screens';
import type { TabsBottomAccessoryEnvironment } from 'react-native-screens';
import { DashboardScreen } from '../screens/DashboardScreen';
import { MusicScreen } from '../screens/MusicScreen';
import { MusicSearch } from '../screens/MusicSearch';
import { MusicLibrary } from '../screens/MusicLibrary';
import { ProfileScreen } from '../screens/ProfileScreen';
import { useTheme } from '../theme/ThemeContext';
import { useAudioStore } from '../store/useAudioStore';
import { useLanguageStore } from '../store/useLanguageStore';
import { useSyncNativeAppearance } from '../hooks/useSyncNativeAppearance';
import { MarqueeText } from '../components/MarqueeText';
import {
  getUniversalStudioArtworkSource,
  STUDIO_IMAGE_PROPS,
} from '../utils/artworkHelper';

export interface NativeLiquidBottomTabsProps {
  activeIndex: number;
  onTabChange: (index: number) => void;
}

const TAB_KEYS = ['DashboardTab', 'MusicTab', 'SearchTab', 'LibraryTab', 'ProfileTab'] as const;

const TAB_BAR_VISIBLE_KEYS = new Set<string>([
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
]);

/**
 * Native iOS 26 UITabAccessory MiniPlayer:
 * Automatically rendered inside Apple UIKit Liquid Glass capsule:
 * - 'regular': floats cleanly right above the tab bar (`Cover + Marquee Title/Artist + Play + Next`).
 * - 'inline': morphs inline between active tab circle and Search circle on scroll down (`Cover + Marquee Title/Artist + Play`).
 */
const NativeAccessoryMiniPlayer: React.FC<{
  environment: TabsBottomAccessoryEnvironment;
}> = React.memo(({ environment }) => {
  const { isDark } = useTheme();
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const nextTrack = useAudioStore((s) => s.nextTrack);
  const setPlayerModalVisible = useAudioStore((s) => s.setPlayerModalVisible);

  const artworkSources = useMemo(
    () =>
      currentTrack
        ? getUniversalStudioArtworkSource(
            currentTrack.thumbnail,
            currentTrack.title,
            currentTrack.artist,
            currentTrack.videoId
          )
        : [],
    [currentTrack?.videoId, currentTrack?.thumbnail, currentTrack?.title, currentTrack?.artist]
  );

  if (!currentTrack) {
    return null;
  }

  const isInline = environment === 'inline';
  const coverSize = isInline ? 30 : 34;
  const primaryTextColor = isDark ? '#FFFFFF' : '#0F172A';
  const secondaryTextColor = isDark
    ? 'rgba(255, 255, 255, 0.68)'
    : 'rgba(15, 23, 42, 0.65)';

  return (
    <View
      style={[
        styles.accessoryContainer,
        {
          paddingHorizontal: isInline ? 10 : 12,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setPlayerModalVisible(true);
        }}
        style={styles.accessoryTapArea}
      >
        <Image
          source={artworkSources}
          style={[
            styles.accessoryCover,
            {
              width: coverSize,
              height: coverSize,
              borderRadius: isInline ? 7 : 8,
            },
          ]}
          {...STUDIO_IMAGE_PROPS}
        />

        <View style={styles.accessoryTextCol}>
          <MarqueeText
            text={currentTrack.title || 'Track Title'}
            style={[
              styles.accessoryTitle,
              {
                color: primaryTextColor,
                fontSize: isInline ? 12.5 : 13.5,
              },
            ]}
            speedPxPerSec={26}
            pauseStartMs={1600}
            pauseEndMs={1400}
          />
          <Text
            style={[
              styles.accessoryArtist,
              {
                color: secondaryTextColor,
                fontSize: isInline ? 11 : 11.5,
              },
            ]}
            numberOfLines={1}
          >
            {currentTrack.artist || 'Artist'}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.accessoryControls}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            togglePlay();
          }}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          style={styles.accessoryControlBtn}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={isInline ? 18 : 19}
            color={primaryTextColor}
            style={{ marginLeft: isPlaying ? 0 : 1 }}
          />
        </TouchableOpacity>

        {!isInline && (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              nextTrack();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            style={styles.accessoryControlBtn}
          >
            <Ionicons
              name="play-forward"
              size={18}
              color={primaryTextColor}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

/**
 * 🧪 Phase 2+: Apple Native Liquid BottomTabs via react-native-screens 4.30
 * - iOS 26 UIKit tabBarMinimizeBehavior="onScrollDown" morphs tabs + detached Search button cleanly.
 * - UITabAccessory renders slim Liquid Glass MiniPlayer in 'regular' and compact 'inline' dock states.
 */
export const NativeLiquidBottomTabs: React.FC<NativeLiquidBottomTabsProps> = ({
  activeIndex,
  onTabChange,
}) => {
  const { theme, isDark } = useTheme();
  const language = useLanguageStore((s) => s.language);
  const isEn = language === 'en';

  const hasCurrentTrack = useAudioStore((s) => Boolean(s.currentTrack));
  const isMiniPlayerSuppressed = useAudioStore((s) => s.isMiniPlayerSuppressed);
  const isPlayerModalVisible = useAudioStore((s) => s.isPlayerModalVisible);
  const currentRouteName = useAudioStore((s) => s.currentRouteName);

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

  const isTabRouteActive = !currentRouteName || TAB_BAR_VISIBLE_KEYS.has(currentRouteName);
  const shouldHideBottomAccessory =
    !hasCurrentTrack ||
    isMiniPlayerSuppressed ||
    isPlayerModalVisible ||
    !isTabRouteActive;

  const renderBottomAccessory = useCallback(
    (environment: TabsBottomAccessoryEnvironment) => (
      <NativeAccessoryMiniPlayer environment={environment} />
    ),
    []
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
      tabBarMinimizeBehavior: 'onScrollDown' as const,
      bottomAccessory: renderBottomAccessory,
      bottomAccessoryHidden: shouldHideBottomAccessory,
    }),
    [isDark, renderBottomAccessory, shouldHideBottomAccessory]
  );

  return (
    <Tabs.Host
      navStateRequest={navStateRequest}
      onTabSelected={handleTabSelected}
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
          standardAppearance: screenAppearance,
          scrollEdgeAppearance: screenAppearance,
        }}
      >
        <MusicSearch />
      </Tabs.Screen>
    </Tabs.Host>
  );
};

const styles = StyleSheet.create({
  accessoryContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '100%',
  },
  accessoryTapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingRight: 8,
  },
  accessoryCover: {
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.22,
        shadowRadius: 3,
      },
    }),
  },
  accessoryTextCol: {
    flex: 1,
    marginLeft: 9,
    justifyContent: 'center',
  },
  accessoryTitle: {
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  accessoryArtist: {
    fontWeight: '500',
    marginTop: 1,
  },
  accessoryControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accessoryControlBtn: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default NativeLiquidBottomTabs;
