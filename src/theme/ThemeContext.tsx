import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme } from './colors';
import { ThemeTokens, ThemeMode, ThemeContextType } from './types';

const THEME_STORAGE_KEY = '@nouble_theme_preference';

const ThemeContext = createContext<ThemeContextType | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 🚀 Start immediately in 'light' mode to prevent any theme flicker/flash
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const themeProgress = useSharedValue<number>(0);

  useEffect(() => {
    // Read saved preference on first mount asynchronously
    const loadSavedTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'dark' || saved === 'light') {
          setThemeModeState(saved);
          themeProgress.value = saved === 'dark' ? 1 : 0;
        }
      } catch (e) {
        // Fallback silently to light
      }
    };
    loadSavedTheme();
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    themeProgress.value = withTiming(mode === 'dark' ? 1 : 0, {
      duration: 350,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
  }, [themeProgress]);

  const toggleTheme = useCallback(() => {
    setThemeModeState((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      themeProgress.value = withTiming(next === 'dark' ? 1 : 0, {
        duration: 350,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
      AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, [themeProgress]);

  const theme: ThemeTokens = useMemo(() => {
    return themeMode === 'dark' ? darkTheme : lightTheme;
  }, [themeMode]);

  const value = useMemo<ThemeContextType>(() => ({
    theme,
    themeMode,
    isDark: themeMode === 'dark',
    themeProgress,
    toggleTheme,
    setThemeMode,
  }), [theme, themeMode, themeProgress, toggleTheme, setThemeMode]);


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
