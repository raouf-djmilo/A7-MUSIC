import { Platform } from 'react-native';
import { ThemeTokens } from './types';

export const lightTheme: ThemeTokens = {
  mode: 'light',
  background: '#FAFAF9',           // Warm white base
  surface: '#F0EFEA',              // Warm grey matte surface
  surfaceSubtle: '#E7E6E1',        // Slightly darker warm grey for pill/sub-elements
  textPrimary: '#1E2022',          // Soft dark charcoal (high readability)
  textSecondary: '#4B5563',        // Neutral secondary text
  textMuted: '#71717A',            // Muted subtitle & inactive icon tone
  border: 'rgba(228, 228, 231, 0.70)',
  borderSubtle: 'rgba(228, 228, 231, 0.40)',
  activePill: 'rgba(30, 32, 34, 0.08)', // Subtle warm charcoal wash for active indicator
  androidSurfaceFallback: 'rgba(240, 239, 234, 0.94)',
  blurTint: Platform.OS === 'ios' ? 'systemUltraThinMaterialLight' : 'light',
  cardShadow: {
    shadowColor: '#1E2022',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 3,
  },
  statusBar: 'dark',
};

export const darkTheme: ThemeTokens = {
  mode: 'dark',
  background: '#0D0E11',           // Deep matte dark
  surface: '#18191E',              // Dark slate matte surface
  surfaceSubtle: '#222328',        // Sub-surface element tone
  textPrimary: '#FFFFFF',          // Pure white
  textSecondary: '#D1D5DB',        // Soft light grey
  textMuted: '#A1A1AA',            // Muted inactive grey
  border: 'rgba(255, 255, 255, 0.08)',
  borderSubtle: 'rgba(255, 255, 255, 0.04)',
  activePill: 'rgba(255, 255, 255, 0.12)', // Subtle white matte indicator
  androidSurfaceFallback: 'rgba(24, 25, 30, 0.94)',
  blurTint: Platform.OS === 'ios' ? 'systemUltraThinMaterialDark' : 'dark',
  cardShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
  },
  statusBar: 'light',
};

// Backward-compatibility export for existing components referencing static colors
export const colors = {
  primary: '#1E2022',
  secondary: '#71717A',
  background: '#FAFAF9',
  surface: '#F0EFEA',
  text: '#1E2022',
  textSecondary: '#71717A',
  glass: 'rgba(240, 239, 234, 0.85)',
  glassBorder: 'rgba(228, 228, 231, 0.70)',
  inputBackground: '#F0EFEA',
  border: 'rgba(228, 228, 231, 0.70)',
  error: '#FF3B30',
};
