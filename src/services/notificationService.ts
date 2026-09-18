import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { isRunningInExpoGo } from 'expo';

/**
 * 🛡️ Safe Environment Detection for Expo Go
 * Android Push Notifications (remote notifications) were removed from Expo Go in SDK 53+.
 * Attempting to import or call push token methods in Expo Go on Android throws an unhandled error.
 */
export const isExpoGo: boolean =
  isRunningInExpoGo() ||
  Constants?.executionEnvironment === ExecutionEnvironment.StoreClient ||
  (Constants as any)?.appOwnership === 'expo';

export const isPushSupported: boolean = !(Platform.OS === 'android' && isExpoGo);

// Lazily load expo-notifications only when supported to prevent module load-time crashes
let NotificationsModule: typeof import('expo-notifications') | null = null;

export const getNotifications = (): typeof import('expo-notifications') | null => {
  if (!isPushSupported) {
    return null;
  }
  if (!NotificationsModule) {
    try {
      NotificationsModule = require('expo-notifications');
    } catch (error) {
      console.warn('[notificationService] Failed to load expo-notifications module:', error);
      NotificationsModule = null;
    }
  }
  return NotificationsModule;
};

/**
 * Safe wrapper for setNotificationHandler
 */
export const safeSetNotificationHandler = (handler: any) => {
  if (!isPushSupported) return;
  try {
    const notif = getNotifications();
    if (notif?.setNotificationHandler) {
      notif.setNotificationHandler(handler);
    }
  } catch (error) {
    console.warn('[notificationService] safeSetNotificationHandler error:', error);
  }
};

/**
 * Safe wrapper for getPermissionsAsync
 */
export const safeGetPermissionsAsync = async () => {
  if (!isPushSupported) {
    return { status: 'undetermined' as const, granted: false, canAskAgain: false };
  }
  try {
    const notif = getNotifications();
    if (notif?.getPermissionsAsync) {
      return await notif.getPermissionsAsync();
    }
  } catch (error) {
    console.warn('[notificationService] safeGetPermissionsAsync error:', error);
  }
  return { status: 'undetermined' as const, granted: false, canAskAgain: false };
};

/**
 * Safe wrapper for requestPermissionsAsync
 */
export const safeRequestPermissionsAsync = async () => {
  if (!isPushSupported) {
    return { status: 'undetermined' as const, granted: false, canAskAgain: false };
  }
  try {
    const notif = getNotifications();
    if (notif?.requestPermissionsAsync) {
      return await notif.requestPermissionsAsync();
    }
  } catch (error) {
    console.warn('[notificationService] safeRequestPermissionsAsync error:', error);
  }
  return { status: 'undetermined' as const, granted: false, canAskAgain: false };
};

/**
 * Safe wrapper for getExpoPushTokenAsync
 */
export const safeGetExpoPushTokenAsync = async (options?: any) => {
  if (!isPushSupported) {
    console.warn('[notificationService] Push Notifications are disabled in Expo Go on Android (SDK 53+). Skipping token fetch.');
    return { data: null };
  }
  try {
    const notif = getNotifications();
    if (notif?.getExpoPushTokenAsync) {
      return await notif.getExpoPushTokenAsync(options);
    }
  } catch (error) {
    console.warn('[notificationService] safeGetExpoPushTokenAsync error:', error);
  }
  return { data: null };
};

/**
 * Safe wrapper for addPushTokenListener
 */
export const safeAddPushTokenListener = (listener: (token: any) => void) => {
  if (!isPushSupported) {
    return { remove: () => {} };
  }
  try {
    const notif = getNotifications();
    if (notif?.addPushTokenListener) {
      return notif.addPushTokenListener(listener);
    }
  } catch (error) {
    console.warn('[notificationService] safeAddPushTokenListener error:', error);
  }
  return { remove: () => {} };
};
