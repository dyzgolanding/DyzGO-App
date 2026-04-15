/**
 * BlurSurface — reemplazo de BlurView compatible con iOS y Android.
 * En iOS usa expo-blur (blur real).
 * En Android usa un View con fondo semitransparente (blur no disponible en RN sin módulo nativo extra).
 */
import { BlurView as ExpoBlurView, BlurViewProps } from 'expo-blur';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

const ANDROID_BG: Record<string, string> = {
  dark:                    'rgba(14, 14, 14, 0.86)',
  light:                   'rgba(240, 240, 240, 0.88)',
  extraLight:              'rgba(255, 255, 255, 0.93)',
  default:                 'rgba(18, 18, 18, 0.80)',
  systemMaterial:          'rgba(22, 22, 22, 0.82)',
  systemThickMaterial:     'rgba(14, 14, 14, 0.90)',
  systemThinMaterial:      'rgba(22, 22, 22, 0.70)',
  systemUltraThinMaterial: 'rgba(22, 22, 22, 0.60)',
  systemChromeMaterial:    'rgba(14, 14, 14, 0.86)',
};

export function BlurView({ tint = 'default', intensity, style, children, ...rest }: BlurViewProps) {
  if (Platform.OS === 'android') {
    const bg = ANDROID_BG[tint as string] ?? ANDROID_BG.default;
    const flatStyle = StyleSheet.flatten(style) ?? {};
    const { backgroundColor: _ignored, ...styleWithoutBg } = flatStyle as any;
    return (
      <View style={[styleWithoutBg, { backgroundColor: bg }]} {...rest}>
        {children}
      </View>
    );
  }
  return (
    <ExpoBlurView tint={tint} intensity={intensity} style={style} {...rest}>
      {children}
    </ExpoBlurView>
  );
}
