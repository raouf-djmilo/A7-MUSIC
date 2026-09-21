import React from 'react';
import {
  Platform,
  View,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

// Screens
import { DashboardScreen } from '../screens/DashboardScreen';
import { RecordingScreen } from '../screens/RecordingScreen';
import { MusicScreen } from '../screens/MusicScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { PublicProfileScreen } from '../screens/PublicProfileScreen';
import { AlbumDetailsScreen } from '../screens/AlbumDetailsScreen';
import { ArtistDetailsScreen } from '../screens/ArtistDetailsScreen';
import { WorkoutSummaryScreen } from '../screens/WorkoutSummaryScreen';
import { SoftwareUpdateScreen } from '../screens/SoftwareUpdateScreen';

import { colors } from '../theme/colors';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
import { useTheme } from '../theme/ThemeContext';
import { AppleLiquidGlassTabBar } from '../components/AppleLiquidGlassTabBar';

// ======================================================
// Tab Navigator (Apple Liquid Glass - Unified Tabs + Search)
// ======================================================
const TabNavigator = () => {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="DashboardTab"
      tabBar={(props) => <AppleLiquidGlassTabBar {...props} />}
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        animation: 'none',
        sceneStyle: {
          backgroundColor: theme.background,
        },
      }}
    >
      <Tab.Screen name="DashboardTab" component={DashboardScreen} />
      <Tab.Screen name="RecordTab" component={DashboardScreen} />
      <Tab.Screen name="MusicTab" component={MusicScreen} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} />
    </Tab.Navigator>
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
        
        {/* Full-Screen Immersive Strava Run/Walk Tracker */}
        <Stack.Screen
          name="Recording"
          component={RecordingScreen}
          options={{ 
            animation: 'fade_from_bottom',
            gestureEnabled: false,
          }}
        />

        {/* 🏆 Strava-Grade Athletic Workout Summary Screen */}
        <Stack.Screen
          name="WorkoutSummary"
          component={WorkoutSummaryScreen}
          options={{
            animation: 'slide_from_right',
            gestureEnabled: false,
          }}
        />

        {/* Dashboard Stack fallback */}
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ animation: 'slide_from_bottom' }}
        />

        {/* Profile & Music Sub-screens */}
        <Stack.Screen
          name="UserProfile"
          component={PublicProfileScreen}
          options={{ animation: 'slide_from_right' }}
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
          name="Notifications" 
          component={NotificationsScreen} 
          options={{ headerShown: false, presentation: 'pageSheet' }} 
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

const styles = StyleSheet.create({});

export default MainNavigator;

