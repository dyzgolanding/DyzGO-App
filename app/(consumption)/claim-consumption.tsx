import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { AlertCircle, CheckCircle } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import ReAnimated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { SkeletonBox } from '../../components/SkeletonBox';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../../constants/colors';
import { sendPushNotification } from '../../lib/push';
import { supabase } from '../../lib/supabase';

export default function ClaimConsumptionScreen() {
  const { token } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Verificando transferencia...');
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (token) {
      procesarReclamo();
    } else {
      setError(true);
      setStatus('Enlace incompleto o inválido.');
      setLoading(false);
    }
  }, [token]);

  const procesarReclamo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Debes iniciar sesión para recibir el pedido.');

      const { data, error: rpcError } = await supabase.rpc('claim_consumption_order_transfer', {
        p_token: token,
        p_new_owner_id: user.id,
      });

      if (rpcError) throw rpcError;

      if (!data || !data.success) {
        throw new Error(data?.message || 'Este enlace ya fue reclamado o expiró.');
      }

      setOrderId(data.order_id ?? null);

      if (data.sender_id) {
        supabase.from('notifications').insert({
          user_id: data.sender_id,
          type: 'consumption_claimed',
          title: 'Pedido reclamado',
          message: `Tu pedido${data.event_title ? ` de ${data.event_title}` : ''} fue recibido por el destinatario.`,
          related_id: data.order_id ?? null,
          is_read: false,
        }).then(undefined, console.error);

        supabase.from('profiles').select('expo_push_token').eq('id', data.sender_id).single()
          .then(({ data: sender }) => {
            if (sender?.expo_push_token) {
              sendPushNotification(
                sender.expo_push_token,
                'Pedido reclamado',
                `Tu pedido${data.event_title ? ` de ${data.event_title}` : ''} fue recibido.`,
                { url: '/my-tickets' }
              ).then(undefined, console.error);
            }
          }).then(undefined, console.error);
      }

      setSuccess(true);
      setLoading(false);
    } catch (err: any) {
      console.error('Error claim consumption:', err);
      setError(true);
      setLoading(false);
      setStatus(err.message || 'Error desconocido al procesar el pedido.');
    }
  };

  return (
    <ReAnimated.View entering={FadeIn.duration(250)} style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={['rgba(255, 49, 216, 0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </View>

      <View style={styles.center}>
        {loading && (
          <View style={styles.stateContainer}>
            <SkeletonBox height={200} borderRadius={20} style={{ marginBottom: 16, width: '100%' }} />
            <SkeletonBox height={24} borderRadius={6} width="60%" style={{ marginBottom: 8 }} />
            <SkeletonBox height={16} borderRadius={6} width="80%" style={{ marginBottom: 20 }} />
            <SkeletonBox height={52} borderRadius={16} />
          </View>
        )}

        {success && (
          <ReAnimated.View entering={FadeInUp.duration(300).delay(0).springify()} style={styles.stateContainer}>
            <View style={styles.glassCard}>
              <View style={styles.iconCircle}>
                <CheckCircle color="#00FF88" size={38} strokeWidth={2.5} />
              </View>
              <Text style={styles.title}>¡YA ES TUYO!</Text>
              <Text style={styles.subtitle}>El pedido se recibió con éxito y ya está disponible en tu cuenta.</Text>
            </View>
            <TouchableOpacity
              style={styles.btnPrimary}
              activeOpacity={0.65}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (orderId) {
                  router.replace({ pathname: '/consumption-order', params: { orderId } } as any);
                } else {
                  router.replace('/(tabs)/home');
                }
              }}
            >
              <Text style={styles.btnPrimaryText}>VER MI PEDIDO</Text>
            </TouchableOpacity>
          </ReAnimated.View>
        )}

        {error && (
          <ReAnimated.View entering={FadeInUp.duration(300).delay(0).springify()} style={styles.stateContainer}>
            <View style={styles.glassCard}>
              <View style={[styles.iconCircle, styles.iconCircleError]}>
                <AlertCircle color="#FF4444" size={38} />
              </View>
              <Text style={styles.errorTitle}>Algo salió mal</Text>
              <Text style={styles.errorText}>{status}</Text>
            </View>
            <TouchableOpacity
              style={styles.btnSecondary}
              activeOpacity={0.65}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.replace('/(tabs)/home'); }}
            >
              <Text style={styles.btnSecondaryText}>VOLVER AL INICIO</Text>
            </TouchableOpacity>
          </ReAnimated.View>
        )}
      </View>
    </ReAnimated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  stateContainer: { alignItems: 'center', width: '100%' },

  glassCard: {
    backgroundColor: COLORS.glassBg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },

  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(138, 43, 226, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(138, 43, 226, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  iconCircleError: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderColor: 'rgba(255, 68, 68, 0.3)',
  },

  title: { color: COLORS.textWhite, fontSize: 26, fontWeight: '900', letterSpacing: -1, fontStyle: 'italic', textAlign: 'center', marginBottom: 10 },
  subtitle: { color: COLORS.textZinc, fontSize: 14, textAlign: 'center', lineHeight: 22 },

  errorTitle: { color: COLORS.textWhite, fontSize: 20, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5, marginBottom: 8 },
  errorText: { color: '#FF4444', fontSize: 14, textAlign: 'center', fontWeight: '500', lineHeight: 20 },

  btnPrimary: {
    width: '100%', height: 58, borderRadius: 20,
    backgroundColor: 'rgba(255,49,216,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,49,216,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  btnPrimaryText: { color: '#FF31D8', fontWeight: '900', fontSize: 15 },

  btnSecondary: {
    width: '100%', height: 58, borderRadius: 20,
    backgroundColor: 'rgba(255,49,216,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,49,216,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  btnSecondaryText: { color: '#FF31D8', fontWeight: '900', fontSize: 15 },
});
