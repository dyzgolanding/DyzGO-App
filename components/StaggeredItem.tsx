import React, { memo, useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { stagger, timing } from '../lib/animation';

interface Props {
  index: number;
  children: React.ReactNode;
  /** Milliseconds between each item. Default: 55 */
  delay?: number;
}

export const StaggeredItem = memo(function StaggeredItem({
  index,
  children,
  delay = 55,
}: Props) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    const d = stagger(index, delay);
    opacity.value    = withDelay(d, withTiming(1, timing.enter));
    translateY.value = withDelay(d, withTiming(0, timing.enter));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
});
