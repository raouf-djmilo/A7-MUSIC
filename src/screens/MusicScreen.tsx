import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MusicHome } from './MusicHome';
import { MusicSearch } from './MusicSearch';
import { MusicLibrary } from './MusicLibrary';
import { useAudioStore } from '../store/useAudioStore';
import { useAuth } from '../providers/AuthProvider';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { ThemeTokens } from '../theme/types';

const Tab = createMaterialTopTabNavigator();

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      paddingHorizontal: 20,
      backgroundColor: theme.background,
      paddingBottom: 10,
    },
    headerTitle: {
      color: theme.textPrimary,
      fontSize: 22,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
  });

export const MusicScreen = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { setActiveUserId, fetchInitialLikes } = useAudioStore();

  React.useEffect(() => {
    if (user?.id) {
      setActiveUserId(user.id);
      fetchInitialLikes(user.id);
    }
  }, [user?.id]);

  return (
    <View style={styles.container}>
      {/* Dedicated Header for the Music App */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>Nouble Music</Text>
      </View>

      <Tab.Navigator
        screenOptions={{
          tabBarStyle: {
            backgroundColor: theme.background,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 1,
            borderBottomColor: theme.borderSubtle,
          },
          tabBarIndicatorStyle: {
            backgroundColor: theme.textPrimary,
            height: 3,
            borderRadius: 3,
          },
          tabBarActiveTintColor: theme.textPrimary,
          tabBarInactiveTintColor: theme.textMuted,
          tabBarLabelStyle: {
            fontSize: 14,
            fontWeight: '800',
            textTransform: 'none',
          },
          tabBarPressColor: theme.activePill,
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

export default MusicScreen;

