import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { CheckCircle2 } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ReAnimated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { COLORS } from '../../constants/colors';
import { sendPushNotification } from '../../lib/push';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isSmallScreen = SCREEN_WIDTH < 400;

export default function ConfirmationScreen() {
  const router = useRouter();
  const { eventId, eventName, quantity } = useLocalSearchParams();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();

    createPurchaseNotification();
  }, []);

  const createPurchaseNotification = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const name = Array.isArray(eventName) ? eventName[0] : eventName;
      const eid  = Array.isArray(eventId)   ? eventId[0]   : eventId;

      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'ticket_purchased',
        title: '¡Entradas listas!',
        message: `Tus entradas para ${name} ya están disponibles. ¡Nos vemos ahí!`,
        related_id: eid || null,
        is_read: false,
      });

      const { data: profile } = await supabase
        .from('profiles').select('expo_push_token').eq('id', user.id).single();
      if (profile?.expo_push_token) {
        sendPushNotification(
          profile.expo_push_token,
          '🎟️ ¡Entradas listas!',
          `Tus entradas para ${name} ya están en tu cuenta.`,
          { url: '/my-tickets' }
        ).catch(console.error);
      }
    } catch (e) {
      console.error('[ticket-confirmation] notification:', e);
    }
  };

  const count = Number(quantity) || 1;
  const isMultiple = count > 1;

  return (
    <ReAnimated.View entering={FadeIn.duration(250)} style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={['rgba(255, 49, 216, 0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.05)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFill} />
      </View>

      <View style={styles.content}>
        <Animated.View style={[{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }, styles.glassCard]}>
          <View style={styles.iconCircle}>
            <CheckCircle2 color={COLORS.neonPink} size={48} />
          </View>
          <Text style={styles.title}>{isMultiple ? '¡COMPRA EXITOSA!' : '¡ENTRADA LISTA!'}</Text>
          <Text style={styles.subtitle}>
            <Text style={{ color: COLORS.textZinc }}>Tus entradas para </Text>
            <Text style={{ fontWeight: '900', color: COLORS.textWhite }}>{eventName}</Text>
            <Text style={{ color: COLORS.textZinc }}> ya están disponibles en tu cuenta.</Text>
          </Text>
        </Animated.View>

        <ReAnimated.View entering={FadeInUp.duration(300).delay(80).springify()} style={{ width: '100%', alignItems: 'center' }}>
          <TouchableOpacity style={styles.btn} activeOpacity={0.85} onPress={() => router.replace('/my-tickets')}>
            <Text style={styles.btnText}>VER MIS ENTRADAS</Text>
          </TouchableOpacity>
        </ReAnimated.View>
      </View>
    </ReAnimated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1 },

  glassCard: {
    backgroundColor: COLORS.glassBg,
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    alignItems: 'center',
    width: '90%',
    maxWidth: 340,
  },

  iconCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(138, 43, 226, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(138, 43, 226, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },

  title: {
    color: COLORS.textWhite,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -1,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  subtitle: {
    color: COLORS.textZinc,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 22,
    paddingHorizontal: 10,
  },

  btn: {
    width: '90%',
    maxWidth: 340,
    height: 58,
    borderRadius: 20,
    backgroundColor: 'rgba(255,49,216,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,49,216,0.35)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 30,
  },
  btnText: { color: '#FF31D8', fontWeight: '900', fontSize: isSmallScreen ? 14 : 16, letterSpacing: 0.5 },
});
