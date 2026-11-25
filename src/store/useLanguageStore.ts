import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type AppLanguage = 'ar' | 'en';

const LANGUAGE_STORAGE_KEY = '@a7music_app_language';

interface LanguageState {
  language: AppLanguage;
  hydrated: boolean;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  hydrateLanguage: () => Promise<void>;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: 'ar',
  hydrated: false,

  setLanguage: async (lang: AppLanguage) => {
    set({ language: lang, hydrated: true });
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // Ignore storage write error
    }
  },

  hydrateLanguage: async () => {
    try {
      const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === 'ar' || saved === 'en') {
        set({ language: saved, hydrated: true });
        return;
      }
    } catch {
      // Ignore storage read error
    }
    set({ hydrated: true });
  },
}));

// Hydrate automatically on module load
useLanguageStore.getState().hydrateLanguage().catch(() => {});
