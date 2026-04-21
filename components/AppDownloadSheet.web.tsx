import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';

interface AppDownloadSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function AppDownloadSheet({ visible, onDismiss }: AppDownloadSheetProps) {
  const slideY = useRef(new Animated.Value(400)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

  const appStoreUrl = 'https://apps.apple.com/app/dyzgo/id6744001741';
  const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.dyzgo.app';
  const storeUrl = isAndroid ? playStoreUrl : appStoreUrl;
  const storeLabel = isAndroid ? 'Descargar en Google Play' : 'Descargar en App Store';

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(slideY, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideY, { toValue: 400, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity }]} pointerEvents="auto">
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]} pointerEvents="auto">
        <View style={styles.handle} />

        <TouchableOpacity style={styles.closeBtn} onPress={onDismiss} activeOpacity={0.7}>
          <X color="rgba(255,255,255,0.4)" size={18} />
        </TouchableOpacity>

        {/* Icon + branding */}
        <View style={styles.iconRow}>
          <Image
            source={require('../assets/images/icon.png')}
            style={styles.appIcon}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.appName}>DyzGO</Text>
            <Text style={styles.appTagline}>La app de eventos más poderosa</Text>
          </View>
        </View>

        <Text style={styles.headline}>¡No te pierdas nada! 🎉</Text>
        <Text style={styles.body}>
          Con la app accedes a tus tickets, recibes notificaciones de eventos y mucho más.
        </Text>

        <TouchableOpacity
          style={styles.downloadBtn}
          activeOpacity={0.85}
          onPress={() => { if (typeof window !== 'undefined') window.open(storeUrl, '_blank'); }}
        >
          <Text style={styles.downloadBtnText}>{storeLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} style={styles.continueBtn}>
          <Text style={styles.continueBtnText}>Continuar en web</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#111111',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  closeBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  appIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  appName: {
    color: '#FBFBFB',
    fontSize: 18,
    fontWeight: '900',
  },
  appTagline: {
    color: 'rgba(251,251,251,0.45)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  headline: {
    color: '#FBFBFB',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
  },
  body: {
    color: 'rgba(251,251,251,0.55)',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 28,
  },
  downloadBtn: {
    backgroundColor: '#FF31D8',
    borderRadius: 18,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  downloadBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  continueBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  continueBtnText: {
    color: 'rgba(251,251,251,0.35)',
    fontSize: 13,
    fontWeight: '500',
  },
});
