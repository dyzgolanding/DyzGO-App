import React, { useEffect } from 'react';
import { Switch as RNSwitch, Platform, TouchableWithoutFeedback, View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, interpolateColor } from 'react-native-reanimated';
import { COLORS } from '../constants/colors';

interface CustomSwitchProps {
  value: boolean;
  onValueChange: (val: boolean) => void;
}

export function CustomSwitch({ value, onValueChange }: CustomSwitchProps) {
  if (Platform.OS !== 'web') {
    // Native switch is perfect. Re-using app colors
    return (
      <RNSwitch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(255,49,216,0.3)' }}
        thumbColor={value ? COLORS.neonPink : '#FBFBFB'}
        ios_backgroundColor='rgba(255,255,255,0.1)'
      />
    );
  }

  // Web-only Custom Reanimated Flowing Switch Emulator to mimic iOS hardware toggles
  const progress = useSharedValue(value ? 1 : 0);
  
  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, { mass: 1, damping: 15, stiffness: 120 });
  }, [value]);

  const animatedTrackStyle = useAnimatedStyle(() => {
    const bg = interpolateColor(
      progress.value,
      [0, 1],
      ['rgba(255,255,255,0.1)', 'rgba(255,49,216,0.3)']
    );
    return { backgroundColor: bg };
  });

  const animatedThumbStyle = useAnimatedStyle(() => {
    const leftPos = progress.value * (51 - 31); // Total tracking available for thumb bounds
    const color = interpolateColor(
      progress.value,
      [0, 1],
      ['#FBFBFB', COLORS.neonPink]
    );
    return { transform: [{ translateX: leftPos }], backgroundColor: color };
  });

  return (
    <TouchableWithoutFeedback onPress={() => onValueChange(!value)}>
      <Animated.View style={[styles.track, animatedTrackStyle]}>
        <Animated.View style={[styles.thumb, animatedThumbStyle]} />
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 51,
    height: 31,
    borderRadius: 16,
    padding: 2,
    justifyContent: 'center',
    cursor: 'pointer',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  thumb: {
    width: 25,
    height: 25,
    borderRadius: 13,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  }
});
