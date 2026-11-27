import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

export interface MarqueeTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  pauseStartMs?: number;
  pauseEndMs?: number;
  speedPxPerSec?: number;
  writingDirection?: 'ltr' | 'rtl' | 'auto';
}

/**
 * Smooth Apple Music style ticker marquee:
 * - Static single line when the title fits inside available width.
 * - When overflowing: pauses briefly at start, glides slowly until full text
 *   end is readable, pauses briefly at the end, returns smoothly to start,
 *   pauses, and repeats.
 */
export const MarqueeText: React.FC<MarqueeTextProps> = React.memo(
  ({
    text,
    style,
    containerStyle,
    pauseStartMs = 1800,
    pauseEndMs = 1500,
    speedPxPerSec = 28,
    writingDirection,
  }) => {
    const [containerWidth, setContainerWidth] = useState(0);
    const [textWidth, setTextWidth] = useState(0);
    const translateX = useRef(new Animated.Value(0)).current;
    const animRef = useRef<Animated.CompositeAnimation | null>(null);

    const overflowDistance = Math.max(0, textWidth - containerWidth);
    const shouldScroll = containerWidth > 0 && overflowDistance > 2;
    const isRtl = writingDirection === 'rtl';

    useEffect(() => {
      if (animRef.current) {
        animRef.current.stop();
        animRef.current = null;
      }
      translateX.setValue(0);

      if (!shouldScroll) {
        return;
      }

      const travel = overflowDistance + 12;
      const targetX = isRtl ? travel : -travel;
      const scrollDurationMs = Math.max(2400, Math.round((travel / speedPxPerSec) * 1000));

      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(pauseStartMs),
          Animated.timing(translateX, {
            toValue: targetX,
            duration: scrollDurationMs,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.delay(pauseEndMs),
          Animated.timing(translateX, {
            toValue: 0,
            duration: 380,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ])
      );

      animRef.current = loop;
      loop.start();

      return () => {
        loop.stop();
        animRef.current = null;
      };
    }, [text, shouldScroll, overflowDistance, isRtl, pauseStartMs, pauseEndMs, speedPxPerSec, translateX]);

    return (
      <View
        style={[styles.clipBox, containerStyle]}
        onLayout={(e) => {
          const w = Math.floor(e.nativeEvent.layout.width);
          if (w > 0 && Math.abs(w - containerWidth) > 1) {
            setContainerWidth(w);
          }
        }}
      >
        {/* Invisible unconstrained single-line probe to measure exact full text width */}
        <View style={styles.measureProbeRow} pointerEvents="none">
          <Text
            numberOfLines={1}
            style={[style, styles.measureProbeText]}
            onLayout={(e) => {
              const w = Math.ceil(e.nativeEvent.layout.width);
              if (w > 0 && Math.abs(w - textWidth) > 1) {
                setTextWidth(w);
              }
            }}
          >
            {text}
          </Text>
        </View>

        {shouldScroll ? (
          <View style={styles.scrollingMask}>
            <Animated.View
              style={{
                flexDirection: 'row',
                width: textWidth + 24,
                transform: [{ translateX }],
              }}
            >
              <Text
                numberOfLines={1}
                style={[style, { width: textWidth + 24, writingDirection }]}
              >
                {text}
              </Text>
            </Animated.View>
          </View>
        ) : (
          <Text
            numberOfLines={1}
            style={[style, { writingDirection }]}
          >
            {text}
          </Text>
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  clipBox: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  measureProbeRow: {
    position: 'absolute',
    opacity: 0,
    flexDirection: 'row',
    width: 9999,
    left: 0,
    top: 0,
  },
  measureProbeText: {
    flexShrink: 0,
  },
  scrollingMask: {
    overflow: 'hidden',
    width: '100%',
  },
});

export default MarqueeText;
