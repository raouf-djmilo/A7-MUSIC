import React, { useState, useEffect, useMemo, memo } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Image, ImageContentFit } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../theme/ThemeContext';

export interface CachedArtworkProps {
  /** Single image URL string */
  uri?: string | null;
  /** Direct source or cascade array (ImageSource[]) for multi-tier fallback */
  source?: any;
  /** Unique recyclingKey per card to eliminate flicker during fast scrolling */
  recyclingKey?: string;
  /** Container dimensions and styling (width, height, flex) */
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  contentFit?: ImageContentFit;
  isDark?: boolean;
  priority?: 'low' | 'normal' | 'high';
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  fallbackIconSize?: number;
}

/**
 * 🖼️ State-Driven Sequential Cascade CachedArtwork (Exclusively expo-image)
 * - Solves the expo-image 404 limitation: sequentially tests URLs on onError
 * - Tiers: 1200x1200bb Studio -> maxresdefault -> hq720 -> hqdefault -> original thumbnail
 * - Automatically advances to the next working tier in milliseconds
 * - Fallback note icon (♪) ONLY rendered if all candidate URLs fail
 */
export const CachedArtwork: React.FC<CachedArtworkProps> = memo(
  ({
    uri,
    source,
    recyclingKey,
    style,
    borderRadius = 8,
    contentFit = 'cover',
    isDark: isDarkProp,
    priority = 'high',
    fallbackIcon = 'musical-note',
    fallbackIconSize = 22,
  }) => {
    const { isDark: contextDark } = useTheme();
    const isDark = isDarkProp ?? contextDark;

    // 1. Flatten all candidate URLs into a prioritized, de-duplicated string array
    const urls: string[] = useMemo(() => {
      const list: string[] = [];
      const seen = new Set<string>();

      const addUrl = (candidate: any) => {
        if (!candidate) return;
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
          const clean = candidate.trim();
          if (!seen.has(clean)) {
            seen.add(clean);
            list.push(clean);
          }
        } else if (typeof candidate === 'object') {
          if (Array.isArray(candidate)) {
            candidate.forEach((item) => {
              const u = typeof item === 'object' && item?.uri ? item.uri : item;
              addUrl(u);
            });
          } else if (candidate.uri) {
            addUrl(candidate.uri);
          }
        }
      };

      addUrl(source);
      addUrl(uri);
      return list;
    }, [source, uri]);

    const [tierIndex, setTierIndex] = useState(0);
    const [hasError, setHasError] = useState(false);

    // Reset tier index whenever the item/URL set changes
    const urlsKey = recyclingKey || urls[0] || 'empty';
    useEffect(() => {
      setTierIndex(0);
      setHasError(false);
    }, [urlsKey]);

    const currentUri = urls[tierIndex] || null;
    const isExhausted = !currentUri || hasError;

    const handleTierError = () => {
      if (tierIndex < urls.length - 1) {
        // Sequentially cascade to the next tier (e.g. maxres 404 -> test hq720 or hqdefault)
        setTierIndex((prev) => prev + 1);
      } else {
        // All tiers exhausted
        setHasError(true);
      }
    };

    return (
      <View
        style={[
          styles.container,
          {
            borderRadius,
            backgroundColor: isDark ? '#1C1F26' : '#E5E7EB',
          },
          style,
        ]}
      >
        {isExhausted ? (
          <Ionicons
            name={fallbackIcon}
            size={fallbackIconSize}
            color={isDark ? 'rgba(255, 255, 255, 0.30)' : 'rgba(0, 0, 0, 0.25)'}
          />
        ) : (
          <Image
            source={{ uri: currentUri }}
            recyclingKey={`${recyclingKey || currentUri}-tier-${tierIndex}`}
            style={StyleSheet.absoluteFill}
            contentFit={contentFit}
            priority={priority}
            cachePolicy="memory-disk"
            transition={140}
            onError={handleTierError}
          />
        )}
      </View>
    );
  },
  (prev, next) =>
    prev.uri === next.uri &&
    prev.source === next.source &&
    prev.borderRadius === next.borderRadius &&
    prev.contentFit === next.contentFit &&
    prev.recyclingKey === next.recyclingKey &&
    prev.isDark === next.isDark
);

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CachedArtwork;
