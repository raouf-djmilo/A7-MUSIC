import { NativeModules, Platform } from 'react-native';

// In Expo Go or environments without the native TrackPlayer module,
// NativeModules is a read-only TurboModule proxy and cannot be mutated directly.
if (!NativeModules.TrackPlayerModule && Platform.OS !== 'web') {
  console.warn('TrackPlayerModule not found. Running in Expo Go fallback mode.');
}
