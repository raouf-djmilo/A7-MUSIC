import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme } from './colors';
import { ThemeTokens, ThemePreference, ThemeMode, ThemeContextType } from './types';

const THEME_STORAGE_KEY = '@nouble_theme_preference';

const ThemeContext = createContext<ThemeContextType | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const themeProgress = useSharedValue<number>(0);

  // Compute resolved mode based on user preference or system appearance
  const resolvedMode: 'light' | 'dark' = useMemo(() => {
    if (themePreference === 'system') {
      return systemColorScheme === 'dark' ? 'dark' : 'light';
    }
    return themePreference;
  }, [themePreference, systemColorScheme]);

  useEffect(() => {
    themeProgress.value = withTiming(resolvedMode === 'dark' ? 1 : 0, {
      duration: 350,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [resolvedMode, themeProgress]);

  useEffect(() => {
    const loadSavedTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'dark' || saved === 'light' || saved === 'system') {
          setThemePreference(saved as ThemePreference);
        }
      } catch (e) {
        // Fallback silently
      }
    };
    loadSavedTheme();
  }, []);

  const setThemeMode = useCallback((mode: ThemePreference) => {
    setThemePreference(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setThemePreference((prev) => {
      const currentResolved = prev === 'system' 
        ? (systemColorScheme === 'dark' ? 'dark' : 'light') 
        : prev;
      const next = currentResolved === 'light' ? 'dark' : 'light';
      AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, [systemColorScheme]);

  const theme: ThemeTokens = useMemo(() => {
    return resolvedMode === 'dark' ? darkTheme : lightTheme;
  }, [resolvedMode]);

  const value = useMemo<ThemeContextType>(() => ({
    theme,
    themeMode: resolvedMode,
    themePreference,
    isDark: resolvedMode === 'dark',
    themeProgress,
    toggleTheme,
    setThemeMode,
  }), [theme, resolvedMode, themePreference, themeProgress, toggleTheme, setThemeMode]);


  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

/**
 * High-performance helper hook that memoizes StyleSheet creations
 * so styles are NOT re-allocated in memory on every render.
 */
export function useThemedStyles<T>(stylesFactory: (theme: ThemeTokens) => T): T {
  const { theme } = useTheme();
  return useMemo(() => stylesFactory(theme), [stylesFactory, theme]);
}
