/**
 * PressableScale — Premium button/touchable component
 *
 * GSAP equivalent:
 *   tl.to(el, { scale: 0.94, duration: 0.1 })
 *     .to(el, { scale: 1, duration: 0.4, ease: "back.out(1.4)" })
 *
 * Runs entirely on the UI thread (no JS bridge = 60fps guaranteed)
 */

import * as Haptics from 'expo-haptics';
import React from 'react';
import { GestureResponderEvent, Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Spring, timing } from '../../lib/animation';

interface PressableScaleProps {
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  scaleTo?: number;
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  disabled?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({
  onPress,
  onLongPress,
  scaleTo = 0.94,
  haptic = 'light',
  style,
  children,
  disabled,
}: PressableScaleProps) {
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  const handlePressIn = () => {
    // Compress instantly (like GSAP's 0.1s snap-down)
    scale.value   = withTiming(scaleTo, timing.fast);
    opacity.value = withTiming(0.85,   timing.fast);
    if (haptic !== 'none') {
      Haptics.impactAsync(
        haptic === 'light'  ? Haptics.ImpactFeedbackStyle.Light  :
        haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium :
                              Haptics.ImpactFeedbackStyle.Heavy
      );
    }
  };

  const handlePressOut = () => {
    // Release with spring — GSAP "back.out" feel
    scale.value   = withSpring(1, Spring.snappy);
    opacity.value = withTiming(1, timing.fast);
  };

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      style={[animStyle, style]}
    >
      {children}
    </AnimatedPressable>
  );
}
