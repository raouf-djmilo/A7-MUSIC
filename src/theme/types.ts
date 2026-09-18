import { SharedValue } from 'react-native-reanimated';

export type ThemeMode = 'light' | 'dark';

export interface ThemeShadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface ThemeTokens {
  mode: ThemeMode;
  background: string;
  surface: string;
  surfaceSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderSubtle: string;
  activePill: string;
  androidSurfaceFallback: string;
  blurTint: 'systemUltraThinMaterialLight' | 'systemUltraThinMaterialDark' | 'light' | 'dark';
  cardShadow: ThemeShadow;
  statusBar: 'light' | 'dark' | 'auto';
}

export interface ThemeContextType {
  theme: ThemeTokens;
  themeMode: ThemeMode;
  isDark: boolean;
  themeProgress: SharedValue<number>; // 0 = Light, 1 = Dark (60fps UI Thread color interpolation)
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

