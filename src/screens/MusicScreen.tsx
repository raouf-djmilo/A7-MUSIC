import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Animated } from 'react-native';
import { createMaterialTopTabNavigator, MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { MusicHome } from './MusicHome';
import { MusicSearch } from './MusicSearch';
import { MusicLibrary } from './MusicLibrary';
import { useAudioStore } from '../store/useAudioStore';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';
import { useNetworkStore } from '../services/networkService';

const Tab = createMaterialTopTabNavigator();

const TAB_CONFIG: { [key: string]: { label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap } } = {
  MusicHome: { label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  MusicSearch: { label: 'Search', icon: 'search-outline', activeIcon: 'search' },
  MusicLibrary: { label: 'Library', icon: 'library-outline', activeIcon: 'library' },
};

interface CompactBarProps extends MaterialTopTabBarProps {
  insetsTop: number;
  theme: ThemeTokens;
  isDark: boolean;
}

const CompactSegmentedTabBar: React.FC<CompactBarProps> = ({ state, navigation, insetsTop, theme, isDark }) => {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [containerWidth, setContainerWidth] = useState(0);
  const slideAnim = useRef(new Animated.Value(state.index)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: state.index,
      useNativeDriver: true,
      tension: 240,
      friction: 22,
    }).start();
  }, [state.index]);

  const numTabs = state.routes.length;
  const tabWidth = containerWidth > 0 ? (containerWidth - 6) / numTabs : 0;

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, tabWidth, tabWidth * 2],
  });

  return (
    <View style={[styles.tabBarWrapper, { paddingTop: insetsTop + 4, backgroundColor: theme.background }]}>
      <View 
        style={[
          styles.segmentedContainer,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : theme.surfaceSubtle,
            borderColor: theme.border,
          },
        ]}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      >
        {tabWidth > 0 && (
          <Animated.View
            style={[
              styles.activeIndicator,
              {
                width: tabWidth,
                backgroundColor: isDark ? '#FFFFFF' : theme.surface,
                shadowColor: isDark ? '#000000' : theme.cardShadow.shadowColor,
                transform: [{ translateX }],
              },
            ]}
          />
        )}

        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const config = TAB_CONFIG[route.name] || { label: route.name, icon: 'musical-notes-outline', activeIcon: 'musical-notes' };

          const onPress = () => {
            Haptics.selectionAsync();
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const activeColor = isDark ? '#000000' : theme.textPrimary;
          const inactiveColor = theme.textMuted;

          return (
            <TouchableOpacity
              key={route.key}
              activeOpacity={0.75}
              onPress={onPress}
              style={styles.tabItem}
            >
              <Ionicons 
                name={isFocused ? config.activeIcon : config.icon} 
                size={15} 
                color={isFocused ? activeColor : inactiveColor} 
                style={styles.tabIcon}
              />
              <Text 
                style={[
                  styles.tabText, 
                  { color: isFocused ? activeColor : inactiveColor },
                  isFocused && styles.tabTextActive,
                ]}
              >
                {config.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!isOnline && (
        <View style={[styles.offlineBannerPill, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.15)', borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.4)' }]}>
          <Ionicons name="cloud-offline" size={13} color="#F59E0B" />
          <Text style={styles.offlineBannerText}>
            وضع عدم الاتصال (Offline) • المقاطع المحمّلة في تبويب المكتبة
          </Text>
        </View>
      )}
    </View>
  );
};

export const MusicScreen = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const { setActiveUserId, fetchInitialLikes } = useAudioStore();
  const isOnline = useNetworkStore((s) => s.isOnline);

  useEffect(() => {
    if (user?.id) {
      setActiveUserId(user.id);
      fetchInitialLikes(user.id);
    }
  }, [user?.id]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Tab.Navigator
        tabBar={(props) => (
          <CompactSegmentedTabBar 
            {...props} 
            insetsTop={insets.top} 
            theme={theme}
            isDark={isDark}
          />
        )}
        screenOptions={{
          swipeEnabled: true,
          lazy: false,
        }}
      >
        <Tab.Screen 
          name="MusicHome" 
          component={MusicHome} 
          options={{ tabBarLabel: 'Home' }}
        />
        <Tab.Screen 
          name="MusicSearch" 
          component={MusicSearch} 
          options={{ tabBarLabel: 'Search' }}
        />
        <Tab.Screen 
          name="MusicLibrary" 
          component={MusicLibrary} 
          options={{ tabBarLabel: 'Library' }}
        />
      </Tab.Navigator>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBarWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  segmentedContainer: {
    height: 38,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    position: 'relative',
    borderWidth: 1,
  },
  activeIndicator: {
    position: 'absolute',
    top: 3,
    left: 3,
    bottom: 3,
    height: 32,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3.5,
    elevation: 3,
  },
  tabItem: {
    flex: 1,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    zIndex: 1,
  },
  tabIcon: {
    marginRight: 6,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  tabTextActive: {
    fontWeight: '800',
  },
  offlineBannerPill: {
    marginTop: 8,
    marginHorizontal: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  offlineBannerText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});

export default MusicScreen;
