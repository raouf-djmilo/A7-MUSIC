import { Platform, UIManager } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { isRunningInExpoGo } from 'expo';

/**
 * [LOCKED MODULE - DO NOT REVERT]
 * 🧪 Phase 2 Feature Flag: Native iOS 26+ Liquid Glass TabBar
 * الشريط السفلي الأصلي لنظام Apple Liquid Glass (react-native-screens)
 * معتمد نهائياً؛ يُمنع إرجاعه إلى false أو استبداله بالشريط المخصص القديم.
 * 
 * - true: Apple Native UIKit BottomTabs (Tabs.Host / Tabs.Screen) from react-native-screens 4.30.
 * - Locked permanently to true as const to prevent accidental regression.
 */
export const USE_NATIVE_LIQUID_TABS = true as const;

/**
 * Runtime native capability guard:
 * Prevents `Invariant Violation: View config not found for component RNSTabsScreenIOS`
 * when previewing in Expo Go (whose native binary lacks RNS 4.30 UIKit BottomTabs)
 * or on incompatible runtimes/platforms, while always enabling Native Liquid Tabs
 * in standalone custom A7-MUSIC iOS builds where `RNSTabsHostIOS` & `RNSTabsScreenIOS` exist.
 */
export function isNativeLiquidTabsAvailable(): boolean {
  if (!USE_NATIVE_LIQUID_TABS || Platform.OS !== 'ios') {
    return false;
  }

  const runningInExpoGo =
    isRunningInExpoGo() ||
    Constants?.executionEnvironment === ExecutionEnvironment.StoreClient ||
    (Constants as any)?.appOwnership === 'expo';

  if (runningInExpoGo) {
    return false;
  }

  try {
    return Boolean(
      UIManager?.hasViewManagerConfig?.('RNSTabsHostIOS') &&
        UIManager?.hasViewManagerConfig?.('RNSTabsScreenIOS')
    );
  } catch {
    return false;
  }
}
