// src/navigation/FastTabViewport.tsx

import React, { useRef, memo, startTransition, useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';

export interface TabItem {
  key: string;
  component: React.ComponentType<any>;
}

interface FastTabViewportProps {
  tabs: TabItem[];
  activeIndex: number;
}

/**
 * عزل كل شاشة بحيث:
 * 1. عند إخفائها تأخذ display: 'none' -> يتوقف الـ GPU تماماً عن رسمها أو حساب الـ Blur الخاص بها
 * 2. تبقى محفوظة في الذاكرة (لا يتم هدمها ولا إعادة تحميل صورها)
 */
const CachedTabPane = memo(
  ({
    Component,
    isVisible,
  }: {
    Component: React.ComponentType<any>;
    isVisible: boolean;
  }) => {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          isVisible ? styles.visiblePane : styles.hiddenPane,
        ]}
        // يمنع معالجة اللمس أو الحسابات البصرية للشاشات المخفية
        pointerEvents={isVisible ? 'auto' : 'none'}
        removeClippedSubviews={!isVisible}
      >
        <Component />
      </View>
    );
  },
  (prev, next) => prev.isVisible === next.isVisible
);

export const FastTabViewport: React.FC<FastTabViewportProps> = ({
  tabs,
  activeIndex,
}) => {
  // حالة عرض الشاشة يتم تحديثها بأولوية منخفضة (Transition) حتى لا تجمّد حركة الفقاعة
  const [renderedIndex, setRenderedIndex] = useState(activeIndex);
  const visitedTabs = useRef<Set<number>>(new Set([activeIndex]));

  useEffect(() => {
    visitedTabs.current.add(activeIndex);
    // startTransition تخبر React: "حرّك الفقاعة أولاً، ثم بدّل الشاشة بسلاسة دون تجميد"
    startTransition(() => {
      setRenderedIndex(activeIndex);
    });
  }, [activeIndex]);

  return (
    <View style={styles.root}>
      {tabs.map((tab, index) => {
        if (!visitedTabs.current.has(index)) {
          return null;
        }
        return (
          <CachedTabPane
            key={tab.key}
            Component={tab.component}
            isVisible={index === renderedIndex}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  visiblePane: {
    display: 'flex',
    zIndex: 1,
  },
  hiddenPane: {
    display: 'none', // يوقف رسم الشاشة والـ Blur على الـ GPU فوراً
    zIndex: 0,
  },
});

export default FastTabViewport;
