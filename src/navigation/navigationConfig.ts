import { Platform, UIManager } from 'react-native';

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
 * on runtimes/binaries that do not register `RNSTabsHostIOS` & `RNSTabsScreenIOS`,
 * while enabling Native Liquid Tabs whenever the host iOS binary supports them
 * (including standalone builds and Expo SDK 58+ runtimes with codegen view configs).
 */
export function isNativeLiquidTabsAvailable(): boolean {
  if (!USE_NATIVE_LIQUID_TABS || Platform.OS !== 'ios') {
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
