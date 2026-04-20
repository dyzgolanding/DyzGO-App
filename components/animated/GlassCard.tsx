/**
 * GlassCard — Glassmorphism card with animated entrance
 *
 * Uses expo-blur for the frosted glass effect.
 * Combines AnimatedEntry for the entrance animation.
 *
 * Usage:
 *   <GlassCard index={0}>
 *     <Text>Content</Text>
 *   </GlassCard>
 */

import { BlurView } from '../BlurSurface';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { AnimatedEntry } from './AnimatedEntry';

interface GlassCardProps {
  children: React.ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
  intensity?: number;     // blur intensity 0–100
  borderColor?: string;
  accentColor?: string;   // subtle top-edge glow color
}

export function GlassCard({
  children,
  index = 0,
  style,
  intensity = 25,
  borderColor = 'rgba(255,255,255,0.12)',
  accentColor = 'rgba(255,49,216,0.15)',
}: GlassCardProps) {
  return (
    <AnimatedEntry index={index} fromY={24} fromScale={0.97}>
      <View style={[styles.wrapper, style]}>
        {/* Frosted glass background */}
        <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />

        {/* Top-edge accent gradient (like a light source) */}
        <LinearGradient
          colors={[accentColor, 'transparent']}
          style={styles.topGlow}
          pointerEvents="none"
        />

        {/* Inner border */}
        <View style={[styles.border, { borderColor }]} pointerEvents="none" />

        {/* Content */}
        <View style={styles.content}>{children}</View>
      </View>
    </AnimatedEntry>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    borderRadius: 20,
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
  },
  content: {
    padding: 16,
  },
});
