import React, { useRef } from 'react';
import { NavigationContainer, DefaultTheme as NavDefaultTheme, DarkTheme as NavDarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { View, StyleSheet, Platform, AppState } from 'react-native';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Providers
import { AuthProvider, useAuth } from './src/providers/AuthProvider';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

// Navigator & Components
import { RootNavigator } from './src/navigation/RootNavigator';
import { InAppToast, setupToast } from './src/components/InAppToast';
import { UnifiedPlayerSheet } from './src/components/UnifiedPlayerSheet';
import { GlobalAudioBridge } from './src/components/GlobalAudioBridge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SetupService } from './src/lib/trackPlayerServices';
import { configureAudioSession } from './src/services/audioSessionService';
import { useAudioStore } from './src/store/useAudioStore';
import { initNetworkMonitor } from './src/services/networkService';
import { OfflineGuardModal } from './src/components/OfflineGuardModal';
import { inspectOfflineStorage } from './src/services/downloadService';

const AppContent = () => {
  const { theme } = useTheme();
  const { session } = useAuth();
  const toastRef = useRef<any>(null);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar style={theme.statusBar} />
      <RootNavigator />
      
      {/* 🎵 Global Audio Bridge & Unified Player only when authenticated */}
      {!!session && (
        <>
          <GlobalAudioBridge />
          <UnifiedPlayerSheet />
        </>
      )}

      {/* 🛡️ Enterprise First-Time Offline Session Guard */}
      <OfflineGuardModal />

      <InAppToast
        ref={(r) => {
          toastRef.current = r;
          if (r) setupToast(r);
        }}
      />
    </View>
  );
};

export default function App() {
  React.useEffect(() => {
    // 🌐 Real-Time Network Hardware Monitor & Offline Guard
    initNetworkMonitor();

    // 💾 Physical Offline Storage Inspection on boot
    inspectOfflineStorage();

    // 🚀 Enable Background Audio & Professional Mode
    const setupAudio = async () => {
      try {
        const savedBg = await AsyncStorage.getItem('@nouble_background_playback_pref');
        const bgEnabled = savedBg !== null ? savedBg === 'true' : true;
        useAudioStore.getState().setBackgroundAudioEnabled(bgEnabled);
        await configureAudioSession(bgEnabled);
        await SetupService();
      } catch (e) {
        console.warn('Audio Setup Error:', e);
      }
    };
    setupAudio();

    // 📱 Deterministic AppState Background Audio Guard
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      const { isPlaying, backgroundAudioEnabled, pauseTrack } = useAudioStore.getState();

      // If the app is transitioning to background/inactive and background playback is turned OFF:
      if (nextAppState.match(/inactive|background/) && isPlaying && !backgroundAudioEnabled) {
        console.log('[Background Guard] App minimized with background audio OFF -> Pausing immediately');
        pauseTrack();
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, []);

  const getActiveRouteName = (state: any): string => {
    if (!state) return '';
    const route = state.routes[state.index ?? 0];
    if (route.state) {
      return getActiveRouteName(route.state);
    }
    return route.name || '';
  };

  const navRef = useRef<any>(null);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0D1117' }}>
      <SafeAreaProvider initialMetrics={Platform.OS === 'web' ? undefined : initialWindowMetrics}>
        <AuthProvider>
          <ThemeProvider>
            <ThemedNavigationContainer navRef={navRef} getActiveRouteName={getActiveRouteName} />
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const ThemedNavigationContainer = ({ navRef, getActiveRouteName }: any) => {
  const { theme, isDark } = useTheme();

  const navigationTheme = React.useMemo(() => {
    const base = isDark ? NavDarkTheme : NavDefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: theme.background,
        card: theme.surface,
        text: theme.textPrimary,
        border: theme.border,
        primary: theme.accentSport,
      },
    };
  }, [isDark, theme]);

  return (
    <NavigationContainer
      ref={navRef}
      theme={navigationTheme}
      onReady={() => {
        const state = navRef.current?.getRootState();
        const activeRouteName = getActiveRouteName(state);
        if (activeRouteName) {
          useAudioStore.getState().setCurrentRouteName(activeRouteName);
        }
      }}
      onStateChange={(state) => {
        const activeRouteName = getActiveRouteName(state);
        if (activeRouteName) {
          useAudioStore.getState().setCurrentRouteName(activeRouteName);
        }
      }}
    >
      <AppContent />
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
});
