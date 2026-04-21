import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Copy, MessageCircle, Instagram, X } from 'lucide-react-native';
import { COLORS } from '../constants/colors';

interface WebShareSheetProps {
  visible: boolean;
  url: string;
  title: string;
  onClose: () => void;
}

export default function WebShareSheet({ visible, url, title, onClose }: WebShareSheetProps) {
  const slideY = useRef(new Animated.Value(300)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(slideY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideY, { toValue: 300, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`¡Mira este evento en DyzGO! 🎉\n${title}\n\n${url}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
    onClose();
  };

  const handleInstagram = async () => {
    await handleCopy();
    window.open('https://www.instagram.com/', '_blank');
    onClose();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Overlay */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, { opacity }]} pointerEvents="auto">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]} pointerEvents="auto">
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Compartir evento</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <X color="rgba(255,255,255,0.5)" size={18} />
          </TouchableOpacity>
        </View>

        {/* URL pill */}
        <View style={styles.urlPill}>
          <Text style={styles.urlText} numberOfLines={1}>{url}</Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleCopy} activeOpacity={0.8}>
            <View style={[styles.actionIcon, { backgroundColor: copied ? 'rgba(48,209,88,0.15)' : 'rgba(255,255,255,0.07)' }]}>
              <Copy color={copied ? '#30D158' : '#FBFBFB'} size={22} />
            </View>
            <Text style={[styles.actionLabel, copied && { color: '#30D158' }]}>
              {copied ? '¡Copiado!' : 'Copiar link'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={handleWhatsApp} activeOpacity={0.8}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(37,211,102,0.12)' }]}>
              <MessageCircle color="#25D166" size={22} />
            </View>
            <Text style={styles.actionLabel}>WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={handleInstagram} activeOpacity={0.8}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(225,48,108,0.12)' }]}>
              <Instagram color="#E1306C" size={22} />
            </View>
            <Text style={styles.actionLabel}>Instagram</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#111111',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingBottom: 36,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    color: '#FBFBFB',
    fontSize: 17,
    fontWeight: '800',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  urlPill: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 24,
  },
  urlText: {
    color: 'rgba(251,251,251,0.45)',
    fontSize: 12,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionBtn: {
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  actionLabel: {
    color: 'rgba(251,251,251,0.7)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
