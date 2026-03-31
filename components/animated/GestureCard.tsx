/**
 * GestureCard — Drag-to-dismiss card with spring release
 *
 * GSAP Draggable equivalent — but runs 100% on the UI thread.
 *
 * Behavior:
 *  - Drag horizontally
 *  - If released past threshold → card flies out + onDismiss fires
 *  - Otherwise → springs back to center (GSAP throwProps equivalent)
 *
 * Usage:
 *   <GestureCard onDismiss={() => removeCard(id)}>
 *     <MyCard />
 *   </GestureCard>
 */

import * as Haptics from 'expo-haptics';
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Spring, timing } from '../../lib/animation';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DISMISS_THRESHOLD = SCREEN_WIDTH * 0.35;
const ROTATION_FACTOR = 8; // max degrees of tilt during drag

interface GestureCardProps {
  children: React.ReactNode;
  onDismiss?: (direction: 'left' | 'right') => void;
  onDismissProgress?: (progress: number) => void; // 0–1 swipe progress
}

export function GestureCard({ children, onDismiss, onDismissProgress }: GestureCardProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isFlying   = useSharedValue(false);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (isFlying.value) return;
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.2; // subtle vertical parallax
      const progress = Math.abs(e.translationX) / DISMISS_THRESHOLD;
      if (onDismissProgress) runOnJS(onDismissProgress)(Math.min(progress, 1));
    })
    .onEnd((e) => {
      if (isFlying.value) return;
      const shouldDismissRight = e.translationX > DISMISS_THRESHOLD;
      const shouldDismissLeft  = e.translationX < -DISMISS_THRESHOLD;

      if (shouldDismissRight || shouldDismissLeft) {
        // Fly out — like GSAP throwProps with momentum
        isFlying.value   = true;
        const direction  = shouldDismissRight ? 'right' : 'left';
        const flyX       = shouldDismissRight ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
        translateX.value = withTiming(flyX, { duration: 320, easing: undefined });
        translateY.value = withTiming(translateY.value * 3, timing.exit);
        runOnJS(triggerHaptic)();
        if (onDismiss) {
          // Delay callback until card is off-screen
          setTimeout(() => runOnJS(onDismiss)(direction), 320);
        }
      } else {
        // Spring back to center — GSAP throwProps snap-back
        translateX.value = withSpring(0, Spring.fluid);
        translateY.value = withSpring(0, Spring.fluid);
        if (onDismissProgress) runOnJS(onDismissProgress)(0);
      }
    });

  const animStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
      [-ROTATION_FACTOR, 0, ROTATION_FACTOR]
    );
    const opacity = interpolate(
      Math.abs(translateX.value),
      [0, DISMISS_THRESHOLD],
      [1, 0.6]
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate:     `${rotate}deg`   },
      ],
      opacity,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, animStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
  },
});
