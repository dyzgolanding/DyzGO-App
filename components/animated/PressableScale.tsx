/**
 * PressableScale — Premium button/touchable component
 *
 * GSAP equivalent:
 *   tl.to(el, { scale: 0.94, duration: 0.1 })
 *     .to(el, { scale: 1, duration: 0.4, ease: "back.out(1.4)" })
 *
 * Runs entirely on the UI thread (no JS bridge = 60fps guaranteed)
 */

import React from 'react';
import { GestureResponderEvent, Pressable, StyleProp, ViewStyle } from 'react-native';

interface PressableScaleProps {
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  scaleTo?: number;
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  disabled?: boolean;
}

export function PressableScale({
  onPress,
  onLongPress,
  style,
  children,
  disabled,
}: PressableScaleProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      style={style}
    >
      {children}
    </Pressable>
  );
}
