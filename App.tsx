import React, { useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { View, StyleSheet, Platform } from 'react-native';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Providers
import { AuthProvider } from './src/providers/AuthProvider';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

// Navigator & Components
import { RootNavigator } from './src/navigation/RootNavigator';
import { InAppToast, setupToast } from './src/components/InAppToast';
import { NoubleMiniPlayer } from './src/components/NoubleMiniPlayer';
import { FullPlayerModal } from './src/components/FullPlayerModal';
import { GlobalAudioBridge } from './src/components/GlobalAudioBridge';
import { SetupService } from './src/lib/trackPlayerServices';
import { useAudioStore } from './src/store/useAudioStore';

const AppContent = () => {
  const { theme } = useTheme();
  const toastRef = useRef<any>(null);
  const { isPlayerModalVisible, setPlayerModalVisible } = useAudioStore();

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar style={theme.statusBar} />
      <RootNavigator />
      
      {/* 🎵 Global Audio Bridge & Mini Player */}
      <GlobalAudioBridge />
      <NoubleMiniPlayer />

      {/* 🎵 Root-Level Global Player Modal (Opens above all screens) */}
      <FullPlayerModal
        visible={isPlayerModalVisible}
        onClose={() => setPlayerModalVisible(false)}
      />

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
    // 🚀 Enable Background Audio & Professional Mode
    const setupAudio = async () => {
      try {
        await SetupService();
      } catch (e) {
        console.warn('Audio Setup Error:', e);
      }
    };
    setupAudio();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={Platform.OS === 'web' ? undefined : initialWindowMetrics}>
        <AuthProvider>
          <ThemeProvider>
            <NavigationContainer>
              <AppContent />
            </NavigationContainer>
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
});
