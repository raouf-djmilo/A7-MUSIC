import { SharedValue } from 'react-native-reanimated';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeShadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface ThemeTokens {
  mode: 'light' | 'dark';
  background: string;
  surface: string;
  surfaceSubtle: string;
  glassCard: string;
  glassBorder: string;
  blurIntensity: number;
  blurTint: 'systemUltraThinMaterialLight' | 'systemUltraThinMaterialDark' | 'light' | 'dark';
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderSubtle: string;
  accentSport: string;
  accentMusic: string;
  activePill: string;
  androidSurfaceFallback: string;
  cardShadow: ThemeShadow;
  statusBar: 'light' | 'dark' | 'auto';
}

export interface ThemeContextType {
  theme: ThemeTokens;
  themeMode: ThemeMode;
  themePreference: ThemePreference;
  isDark: boolean;
  themeProgress: SharedValue<number>; // 0 = Light, 1 = Dark (60fps UI Thread color interpolation)
  toggleTheme: () => void;
  setThemeMode: (mode: ThemePreference) => void;
}

