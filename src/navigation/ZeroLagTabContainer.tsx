// src/navigation/ZeroLagTabContainer.tsx

import React, { useRef, memo } from 'react';
import { View, StyleSheet } from 'react-native';

export interface TabScreenConfig {
  key: string;
  component: React.ComponentType<any>;
}

interface ZeroLagTabContainerProps {
  screens: TabScreenConfig[];
  activeIndex: number;
}

/**
 * تغليف كل شاشة بـ React.memo يضمن أن تغيير activeIndex
 * لن يسبب إعادة رسم (Re-render) للشاشات الأخرى أبداً
 */
const IsolatedScreen = memo(
  ({
    Component,
    isActive,
  }: {
    Component: React.ComponentType<any>;
    isActive: boolean;
  }) => {
    return (
      <View
        // إخفاء فوري على مستوى الـ GPU بدون هدم الشاشة من الذاكرة
        style={[
          StyleSheet.absoluteFill,
          isActive ? styles.activeScreen : styles.hiddenScreen,
        ]}
        pointerEvents={isActive ? 'auto' : 'none'}
        // إزالة الشاشة المخفية من شجرة اللمس والقراءة لتخفيف الحمل
        accessibilityElementsHidden={!isActive}
        importantForAccessibility={isActive ? 'auto' : 'no-hide-descendants'}
      >
        <Component />
      </View>
    );
  },
  // لا تقم بإعادة الرسم إلا إذا تغيرت حالة الظهور لهذه الشاشة فقط
  (prev, next) => prev.isActive === next.isActive
);

export const ZeroLagTabContainer: React.FC<ZeroLagTabContainerProps> = ({
  screens,
  activeIndex,
}) => {
  // تتبع الشاشات التي تم فتحها مسبقاً لتطبيق Lazy Mounting
  const mountedIndicesRef = useRef<Set<number>>(new Set([activeIndex]));
  mountedIndicesRef.current.add(activeIndex);

  return (
    <View style={styles.container}>
      {screens.map((screen, index) => {
        // لا تقم ببناء الشاشة قبل زيارتها لأول مرة
        if (!mountedIndicesRef.current.has(index)) {
          return null;
        }

        return (
          <IsolatedScreen
            key={screen.key}
            Component={screen.component}
            isActive={index === activeIndex}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  activeScreen: {
    opacity: 1,
    zIndex: 2,
  },
  hiddenScreen: {
    opacity: 0,
    zIndex: 0,
  },
});

export default ZeroLagTabContainer;
