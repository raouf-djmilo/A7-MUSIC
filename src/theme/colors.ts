import { Platform } from 'react-native';
import { ThemeTokens } from './types';

export const lightTheme: ThemeTokens = {
  mode: 'light',
  background: '#F8F9FB',           // Pure Ice
  surface: '#FFFFFF',              // Card/Surface
  surfaceSubtle: '#F0F2F5',        // Subtle background fill
  glassCard: 'rgba(255, 255, 255, 0.75)', // Milky Frosted
  glassBorder: 'rgba(0, 0, 0, 0.06)',     // 1px solid
  blurIntensity: 35,
  blurTint: Platform.OS === 'ios' ? 'systemUltraThinMaterialLight' : 'light',
  textPrimary: '#111827',          // Dark slate text
  textSecondary: 'rgba(17, 24, 39, 0.60)', // Secondary & units
  textMuted: '#6B7280',            // Inactive / Muted
  border: 'rgba(0, 0, 0, 0.06)',
  borderSubtle: 'rgba(0, 0, 0, 0.04)',
  accentSport: '#FC5200',          // Saturated Strava orange
  accentMusic: '#007AFF',          // Saturated Music blue
  activePill: 'rgba(17, 24, 39, 0.08)',
  androidSurfaceFallback: '#F8F9FB',
  cardShadow: {
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  statusBar: 'dark',
};

export const darkTheme: ThemeTokens = {
  mode: 'dark',
  background: '#0D1117',           // Deep Carbon
  surface: '#161B22',              // Elevated carbon
  surfaceSubtle: '#21262D',        // Sub-surface element tone
  glassCard: 'rgba(255, 255, 255, 0.05)', // Frosted Matte
  glassBorder: 'rgba(255, 255, 255, 0.08)', // 1px subtle sheen
  blurIntensity: 25,
  blurTint: Platform.OS === 'ios' ? 'systemUltraThinMaterialDark' : 'dark',
  textPrimary: '#FFFFFF',          // Pure white
  textSecondary: 'rgba(255, 255, 255, 0.60)', // Secondary & units
  textMuted: 'rgba(255, 255, 255, 0.40)',
  border: 'rgba(255, 255, 255, 0.08)',
  borderSubtle: 'rgba(255, 255, 255, 0.04)',
  accentSport: '#FC5200',          // Saturated Strava orange
  accentMusic: '#007AFF',          // Saturated Music blue
  activePill: 'rgba(255, 255, 255, 0.12)',
  androidSurfaceFallback: '#0D1117',
  cardShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.40,
    shadowRadius: 20,
    elevation: 8,
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
