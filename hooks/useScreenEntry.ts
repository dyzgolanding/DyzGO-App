/**
 * useScreenEntry — THE unified screen entrance animation.
 *
 * Every screen in the app uses this one hook. This guarantees:
 *  - Identical entrance feel everywhere (consistency)
 *  - Single shared value instead of 3 (performance)
 *  - Runs entirely on the UI thread (no JS bridge)
 *  - Fast enough to not conflict with navigation transition
 *
 * Usage:
 *   export default function MyScreen() {
 *     const screenStyle = useScreenEntry();
 *     return (
 *       <Animated.View style={[styles.container, screenStyle]}>
 *         ...children (use AnimatedEntry for stagger)
 *       </Animated.View>
 *     );
 *   }
 *
 * Children sequencing:
 *   The container itself fades in over 220ms.
 *   Wrap individual cards/rows with <AnimatedEntry index={i}> for stagger.
 *   AnimatedEntry delays start at 40ms * index, capped at 160ms.
 *   So: container(0ms) → first child(40ms) → last child(≤160ms).
 */

import { useEffect } from 'react';
import {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Duration, Ease } from '../lib/animation';

export function useScreenEntry(): ReturnType<typeof useAnimatedStyle> {
  const progress = useSharedValue(0);

  useEffect(() => {
    // Single shared value drives both opacity and translateY.
    // interpolate() on the UI thread — zero JS work.
    progress.value = withTiming(1, {
      duration: Duration.enter,
      easing:   Ease.expoOut,
    });
  }, []);

  return useAnimatedStyle(() => ({
    flex: 1,
    opacity:   progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [8, 0]) }],
  }));
}
