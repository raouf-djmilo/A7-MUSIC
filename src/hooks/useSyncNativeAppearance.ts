import { useEffect } from 'react';
import { Appearance, Platform } from 'react-native';

/**
 * 🌓 iOS & Android Native Appearance Synchronizer
 * 
 * Synchronizes the app's internal theme state (Dark / Light) with the native OS UIWindow
 * via Appearance.setColorScheme(isDark ? 'dark' : 'light').
 * 
 * This instructs UIKit to update the root UIWindow's overrideUserInterfaceStyle:
 * - UITabBarController (Apple Liquid Glass) instantly renders in Dark Liquid Glass (deep frosted obsidian).
 * - Native iOS keyboards, alerts, and system accessories render in matching dark appearance.
 * - Inactive tab icons and labels reflect proper vibrancy levels.
 */
export function useSyncNativeAppearance(isDark: boolean) {
  useEffect(() => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      try {
        Appearance.setColorScheme(isDark ? 'dark' : 'light');
      } catch (error) {
        console.warn('[AppearanceSync] Error setting native color scheme:', error);
      }
    }
  }, [isDark]);
}

export default useSyncNativeAppearance;
