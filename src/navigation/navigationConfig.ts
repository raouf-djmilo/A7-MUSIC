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
