/**
 * AnimatedEntry — Fade + slide entrance with stagger.
 *
 * Used for CHILDREN inside a screen (cards, rows, buttons).
 * The screen container itself uses useScreenEntry().
 *
 * Key design decisions:
 *  - fromY is small (12px) — subtle, not dramatic
 *  - stagger is capped at 160ms — long lists still feel snappy
 *  - scale only used when explicitly requested (fromScale < 1)
 *  - Single memo wrapper to prevent re-renders from parent
 *  - Uses Reanimated Keyframe (UI thread layout animation) explicitly to avoid JS thread stutter!
 */

import React, { memo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { LinearTransition, withDelay, withTiming } from 'react-native-reanimated';
import { stagger, timing } from '../../lib/animation';

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
  index = 0,
  staggerMs = 40,
  fromY = 12,
  fromScale = 1,
  delay = 0,
  style,
}: AnimatedEntryProps) {
  const d = delay + stagger(index, staggerMs);

  // Animación puramente fluida (0 rebote, muy premium) enfocada SOLO en opacidad y escala.
  // IMPORTANTE: Al no tener translateY, los elementos NUNCA cambiarán de posición al aparecer.
  const customEntering = () => {
    'worklet';
    return {
      initialValues: {
        opacity: 0,
        transform: [
          { scale: fromScale }
        ],
      },
      animations: {
        opacity: withDelay(d, withTiming(1, { duration: timing.enter.duration })),
        transform: [
          { scale: withDelay(d, withTiming(1, timing.enter)) },
        ],
      },
    };
  };

  return (
    <Animated.View 
      entering={customEntering} 
      layout={LinearTransition.duration(timing.enter.duration).easing(timing.enter.easing)}
      style={style}
    >
      {children}
    </Animated.View>
  );
});
