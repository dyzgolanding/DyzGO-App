/**
 * AnimatedEntry — Fade + slide entrance with stagger.
 *
 * Used for CHILDREN inside a screen (cards, rows, buttons).
 * The screen container itself uses useScreenEntry().
 *
 * Key design decisions:
 *  - fromY is small (12px) — subtle, not dramatic
 *  - stagger is capped at 240ms — long lists still feel snappy
 *  - Single memo wrapper to prevent re-renders from parent
 *  - Uses Reanimated FadeInUp with springify for natural motion
 */

import React, { memo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

interface AnimatedEntryProps {
  children: React.ReactNode;
  index?: number;
  staggerMs?: number;
  fromY?: number;
  fromScale?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

export const AnimatedEntry = memo(function AnimatedEntry({
  children,
  style,
  index = 0,
  staggerMs = 80,
  delay,
}: AnimatedEntryProps) {
  const entryDelay = delay ?? Math.min(index * staggerMs, 240);
  return (
    <Animated.View entering={FadeInUp.duration(300).delay(entryDelay).springify()} style={style}>
      {children}
    </Animated.View>
  );
});
