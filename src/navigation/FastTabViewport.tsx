// src/navigation/FastTabViewport.tsx

import React, { useRef, memo, startTransition, useState, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { ScreenContainer, Screen } from 'react-native-screens';

export interface TabItem {
  key: string;
  component: React.ComponentType<any>;
}

interface FastTabViewportProps {
  tabs: TabItem[];
  activeIndex: number;
}

/**
 * ⚡ Native Hardware-Accelerated Tab Viewport via react-native-screens
 * - Replaces display: 'none' with native activityState (2 = active, 0 = inactive).
 * - Zero Yoga Layout Spike: When un-hiding a tab, layout dimensions are preserved natively.
 * - 100% GPU suspension for inactive tabs without memory or texture trashing.
 */
const CachedNativeTabPane = memo(
  ({
    Component,
    isVisible,
  }: {
    Component: React.ComponentType<any>;
    isVisible: boolean;
  }) => {
    return (
      <Screen
        activityState={isVisible ? 2 : 0}
        style={StyleSheet.absoluteFill}
      >
        <Component />
      </Screen>
    );
  },
  (prev, next) => prev.isVisible === next.isVisible
);

export const FastTabViewport: React.FC<FastTabViewportProps> = ({
  tabs,
  activeIndex,
}) => {
  const [renderedIndex, setRenderedIndex] = useState(activeIndex);
  const visitedTabs = useRef<Set<number>>(new Set([activeIndex]));

  useEffect(() => {
    visitedTabs.current.add(activeIndex);
    // startTransition: Bubble animates first, screen switches smoothly without freezing the UI thread
    startTransition(() => {
      setRenderedIndex(activeIndex);
    });
  }, [activeIndex]);

  return (
    <ScreenContainer style={styles.root}>
      {tabs.map((tab, index) => {
        if (!visitedTabs.current.has(index)) {
          return null;
        }
        return (
          <CachedNativeTabPane
            key={tab.key}
            Component={tab.component}
            isVisible={index === renderedIndex}
          />
        );
      })}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default FastTabViewport;
