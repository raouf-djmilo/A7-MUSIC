import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

// Screens
import { DashboardScreen } from '../screens/DashboardScreen';
import { MusicScreen } from '../screens/MusicScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AlbumDetailsScreen } from '../screens/AlbumDetailsScreen';
import { ArtistDetailsScreen } from '../screens/ArtistDetailsScreen';
import { SoftwareUpdateScreen } from '../screens/SoftwareUpdateScreen';

import { useTheme } from '../theme/ThemeContext';
import { AppleLiquidGlassTabBar } from '../components/AppleLiquidGlassTabBar';
import { FastTabViewport } from './FastTabViewport';
import { useAudioStore } from '../store/useAudioStore';

const Stack = createNativeStackNavigator();

const TAB_ROUTES = ['DashboardTab', 'MusicTab', 'ProfileTab'];

// ======================================================
// Fast Tab Viewport (display: 'none' + startTransition)
// ======================================================
const TabNavigator = ({ route }: any) => {
  const { theme } = useTheme();

  const initialIndex = useMemo(() => {
    const screenName = route?.params?.screen;
    if (screenName) {
      const idx = TAB_ROUTES.indexOf(screenName);
      if (idx !== -1) return idx;
    }
    return 0;
  }, [route?.params?.screen]);

  const [activeTab, setActiveTab] = useState(initialIndex);

  // Sync if route params change externally
  useEffect(() => {
    const screenName = route?.params?.screen;
    if (screenName) {
      const idx = TAB_ROUTES.indexOf(screenName);
      if (idx !== -1 && idx !== activeTab) {
        setActiveTab(idx);
      }
    }
  }, [route?.params?.screen, activeTab]);

  const tabs = useMemo(
    () => [
      { key: 'DashboardTab', component: DashboardScreen },
      { key: 'MusicTab', component: MusicScreen },
      { key: 'ProfileTab', component: ProfileScreen },
    ],
    []
  );

  const handleTabChange = useCallback((nextIndex: number) => {
    const nextRoute = TAB_ROUTES[nextIndex] || 'DashboardTab';
    useAudioStore.getState().setCurrentRouteName(nextRoute);
    setActiveTab(nextIndex);
  }, []);

  return (
    <View style={[styles.tabRoot, { backgroundColor: theme.background }]}>
      <FastTabViewport tabs={tabs} activeIndex={activeTab} />
      <AppleLiquidGlassTabBar
        activeIndex={activeTab}
        onTabChange={handleTabChange}
      />
    </View>
  );
};

// ======================================================
// Main Stack Navigator
// ======================================================
export const MainNavigator = () => {
  const { theme } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
      <BottomSheetModalProvider>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.background },
          }}
        >
          <Stack.Screen name="Tabs" component={TabNavigator} />
          <Stack.Screen name="DashboardTab">
            {(props) => <TabNavigator {...props} route={{ ...props.route, params: { screen: 'DashboardTab' } }} />}
          </Stack.Screen>
          <Stack.Screen name="MusicTab">
            {(props) => <TabNavigator {...props} route={{ ...props.route, params: { screen: 'MusicTab' } }} />}
          </Stack.Screen>
          <Stack.Screen name="ProfileTab">
            {(props) => <TabNavigator {...props} route={{ ...props.route, params: { screen: 'ProfileTab' } }} />}
          </Stack.Screen>

          {/* Dashboard Stack fallback */}
          <Stack.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{ animation: 'slide_from_bottom' }}
          />

          {/* Artist & Album Detail Screens */}
          <Stack.Screen 
            name="ArtistDetail" 
            component={ArtistDetailsScreen} 
            options={{ animation: 'slide_from_right' }} 
          />
          <Stack.Screen 
            name="AlbumDetails" 
            component={AlbumDetailsScreen} 
            options={{ animation: 'slide_from_right' }} 
          />
          <Stack.Screen 
            name="Settings" 
            component={SettingsScreen} 
            options={{ headerShown: false, animation: 'slide_from_right' }} 
          />
          <Stack.Screen 
            name="SoftwareUpdate" 
            component={SoftwareUpdateScreen} 
            options={{ headerShown: false, animation: 'slide_from_right' }} 
          />
        </Stack.Navigator>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  tabRoot: {
    flex: 1,
    position: 'relative',
  },
});

export default MainNavigator;
