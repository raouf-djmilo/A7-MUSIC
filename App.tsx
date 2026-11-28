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
import { useSyncNativeAppearance } from './src/hooks/useSyncNativeAppearance';

// Navigator & Components
import { RootNavigator } from './src/navigation/RootNavigator';
import { InAppToast, setupToast } from './src/components/InAppToast';
import { AuthPromptModal, setupAuthPrompt } from './src/components/AuthPromptModal';
import { navigationRef } from './src/navigation/navigationService';
import { UnifiedPlayerSheet } from './src/components/UnifiedPlayerSheet';
import { GlobalAudioBridge } from './src/components/GlobalAudioBridge';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SetupService } from './src/lib/trackPlayerServices';
import { configureAudioSession } from './src/services/audioSessionService';
import { useAudioStore } from './src/store/useAudioStore';
import { initNetworkMonitor } from './src/services/networkService';
import { OfflineGuardModal } from './src/components/OfflineGuardModal';
import { OfflineStatusBanner } from './src/components/OfflineStatusBanner';
import { inspectOfflineStorage } from './src/services/downloadService';
import { useUpdateStore, runSmartOtaMigrationIfNeeded } from './src/services/updateService';
import { OtaUpdateProgressModal } from './src/components/OtaUpdateProgressModal';
import {
  getNotifications,
  safeGetPermissionsAsync,
  safeRequestPermissionsAsync,
  safeSetNotificationHandler,
} from './src/services/notificationService';

const AppContent = () => {
  const { theme, isDark } = useTheme();
  const { session } = useAuth();
  const toastRef = useRef<any>(null);
  const authPromptRef = useRef<any>(null);

  // Synchronize internal app theme preference with native UIWindow (iOS UITabBar & Android System)
  useSyncNativeAppearance(isDark);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar style={theme.statusBar} />
      <RootNavigator />
      
      {/* 🎵 Global Audio Bridge & Unified Player active for all users (Registered & Guests) */}
      <UnifiedPlayerSheet />
      <GlobalAudioBridge />

      {/* 🛡️ Enterprise First-Time Offline Session Guard */}
      <OfflineGuardModal />

      {/* ☁️ Non-blocking Apple Liquid Glass Offline Notification Pill */}
      <OfflineStatusBanner />

      {/* ⚡ Professional OTA Update Progress & Restart Modal */}
      <OtaUpdateProgressModal />

      <InAppToast
        ref={(r) => {
          toastRef.current = r;
          if (r) setupToast(r);
        }}
      />

      <AuthPromptModal
        ref={(r) => {
          authPromptRef.current = r;
          if (r) setupAuthPrompt(r);
        }}
      />
    </View>
  );
};

export default function App() {
  React.useEffect(() => {
    // 🌐 Real-Time Network Hardware Monitor & Offline Guard
    initNetworkMonitor();

    // 🧠 Smart Data Schema Migration (cleans stale caches across OTA updates safely)
    runSmartOtaMigrationIfNeeded().catch(() => {});

    // 💾 Physical Offline Storage Inspection (deferred to ensure 0ms UI mount)
    const storageTimer = setTimeout(() => {
      inspectOfflineStorage();
    }, 2000);

    // ⚡ Silent iOS Fast OTA Check & Background Pre-Fetch (0ms startup impact)
    const otaTimer = setTimeout(() => {
      useUpdateStore.getState().checkAndStageOtaInBackground().catch(() => {});
    }, 4500);

    // 🔔 Open OTA Update Progress Modal when user taps the system update notification
    const notif = getNotifications();
    const notifSub = notif?.addNotificationResponseReceivedListener?.((response: any) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.action === 'ota_update') {
        useUpdateStore.getState().openOtaModal();
      }
    });

    let lastForegroundOtaCheck = Date.now();

    // 🚀 Enable Background Audio & Professional Mode (SetupService first so TrackPlayer is 100% ready at 0ms)
    const setupAudio = async () => {
      try {
        const savedBg = await AsyncStorage.getItem('@nouble_background_playback_pref');
        const bgEnabled = savedBg !== null ? savedBg === 'true' : true;
        await SetupService();
        useAudioStore.getState().setBackgroundAudioEnabled(bgEnabled);
        await configureAudioSession(bgEnabled, false, 'youtube');
        if (bgEnabled) {
          require('./src/services/audioSessionService').prewarmSilentBackgroundAnchor().catch(() => {});
        }
      } catch (e) {
        console.warn('Audio Setup Error:', e);
      }
    };
    setupAudio();

    // 🔔 Request System Media/Notification Permission cleanly once on initial app entry
    const permissionTimer = setTimeout(async () => {
      try {
        const alreadyPrompted = await AsyncStorage.getItem('@a7music_initial_notif_prompt_v1');
        if (alreadyPrompted) return;
        await AsyncStorage.setItem('@a7music_initial_notif_prompt_v1', 'true');

        const perms = await safeGetPermissionsAsync();
        let granted = perms.granted;
        if (!granted && perms.canAskAgain) {
          const req = await safeRequestPermissionsAsync();
          granted = req.granted;
        }
        if (granted) {
          safeSetNotificationHandler({
            handleNotification: async () => ({
              shouldShowAlert: true,
              shouldPlaySound: true,
              shouldSetBadge: true,
              shouldShowBanner: true,
              shouldShowList: true,
            }),
          });
          await AsyncStorage.setItem('@a7music_notifications_opt_in', 'true');
        }
      } catch {}
    }, 1400);

    // 📱 Deterministic AppState Background Audio Guard
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      const { isPlaying, backgroundAudioEnabled, pauseTrack } = useAudioStore.getState();

      // When Background Playback is OFF: exiting the app or locking the phone ('background') stops playback completely.
      if (nextAppState === 'background' && !backgroundAudioEnabled) {
        if (isPlaying) {
          console.log('[Background Guard] App backgrounded/locked with background audio OFF -> Stopping playback');
          pauseTrack();
        }
      }
      // Only refresh if session mode was not already set for active engine
      if (nextAppState === 'active' && backgroundAudioEnabled && isPlaying) {
        configureAudioSession(true, false, useAudioStore.getState().activeEngine).catch(() => {});
      }
      // Check OTA silently when returning to foreground (throttled every 10 minutes)
      if (nextAppState === 'active' && Date.now() - lastForegroundOtaCheck > 10 * 60 * 1000) {
        lastForegroundOtaCheck = Date.now();
        useUpdateStore.getState().checkAndStageOtaInBackground().catch(() => {});
      }
    });

    return () => {
      clearTimeout(storageTimer);
      clearTimeout(otaTimer);
      clearTimeout(permissionTimer);
      notifSub?.remove?.();
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
            <ThemedNavigationContainer getActiveRouteName={getActiveRouteName} />
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const ThemedNavigationContainer = ({ getActiveRouteName }: any) => {
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
      ref={navigationRef}
      theme={navigationTheme}
      onReady={() => {
        const state = navigationRef.getRootState();
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
