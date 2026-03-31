import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, CheckCircle } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../../constants/colors';
import { sendPushNotification } from '../../lib/push';
import { supabase } from '../../lib/supabase';

export default function ClaimTicketScreen() {
  const { token } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Verificando transferencia...');
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (token) {
      procesarReclamo();
    } else {
      setError(true);
      setStatus("Enlace incompleto o inválido.");
      setLoading(false);
    }
  }, [token]);

  const procesarReclamo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Debes iniciar sesión para recibir la entrada.");

      const { data, error: rpcError } = await supabase.rpc('claim_ticket_transfer', {
        p_token: token,
        p_new_owner_id: user.id
      });

      if (rpcError) throw rpcError;

      if (!data || !data.success) {
        throw new Error(data?.message || "Esta entrada ya fue reclamada o expiró.");
      }

      if (data.sender_id) {
        supabase.from('notifications').insert({
          user_id: data.sender_id,
          type: 'ticket_received',
          title: 'Entrada reclamada',
          message: `Tu entrada${data.event_title ? ` para ${data.event_title}` : ''} fue recibida por el destinatario.`,
          related_id: data.ticket_id || null,
          is_read: false,
        }).then(undefined, console.error);

        supabase.from('profiles').select('expo_push_token').eq('id', data.sender_id).single()
          .then(({ data: sender }) => {
            if (sender?.expo_push_token) {
              sendPushNotification(
                sender.expo_push_token,
                'Entrada reclamada',
                `Tu entrada${data.event_title ? ` para ${data.event_title}` : ''} fue recibida.`,
                { url: '/my-tickets' }
              ).then(undefined, console.error);
            }
          }).then(undefined, console.error);
      }

      setSuccess(true);
      setLoading(false);

    } catch (err: any) {
      console.error("Error claim:", err);
      setError(true);
      setLoading(false);
      setStatus(err.message || "Error desconocido al procesar el ticket.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={['rgba(255, 49, 216, 0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.05)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFill} />
      </View>

      <View style={styles.center}>
        {loading && (
          <View style={styles.stateContainer}>
            <ActivityIndicator size="large" color={COLORS.neonPink} />
            <Text style={styles.loadingText}>{status}</Text>
          </View>
        )}

        {success && (
          <View style={styles.stateContainer}>
            <View style={styles.iconCircle}>
              <CheckCircle color="#00FF88" size={48} strokeWidth={2.5} />
            </View>
            <Text style={styles.title}>¡YA ES TUYA!</Text>
            <Text style={styles.subtitle}>El ticket se ha recibido con éxito y ya está disponible en tu cuenta.</Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => router.replace('/my-tickets')}>
              <Text style={styles.btnPrimaryText}>VER MIS TICKETS</Text>
            </TouchableOpacity>
          </View>
        )}

        {error && (
          <View style={styles.stateContainer}>
            <View style={[styles.iconCircle, styles.iconCircleError]}>
              <AlertCircle color="#FF4444" size={48} />
            </View>
            <Text style={styles.errorTitle}>Algo salió mal</Text>
            <Text style={styles.errorText}>{status}</Text>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => router.replace('/(tabs)/home')}>
              <Text style={styles.btnSecondaryText}>VOLVER AL INICIO</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  stateContainer: { alignItems: 'center', width: '100%' },

  iconCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(138, 43, 226, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(138, 43, 226, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircleError: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderColor: 'rgba(255, 68, 68, 0.3)',
  },

  loadingText: { color: COLORS.textZinc, marginTop: 20, fontSize: 16, textAlign: 'center', fontWeight: '500' },
  title: { color: COLORS.textWhite, fontSize: 32, fontWeight: '900', letterSpacing: -1, fontStyle: 'italic', textAlign: 'center' },
  subtitle: { color: COLORS.textZinc, fontSize: 14, textAlign: 'center', marginTop: 10, marginBottom: 32, lineHeight: 22 },

  errorTitle: { color: COLORS.textWhite, fontSize: 20, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5 },
  errorText: { color: '#FF4444', marginTop: 8, fontSize: 14, textAlign: 'center', fontWeight: '500', paddingHorizontal: 20, marginBottom: 32 },

  btnPrimary: {
    width: '100%',
    height: 56,
    borderRadius: 20,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#000', fontWeight: '900', fontSize: 15, fontStyle: 'italic' },

  btnSecondary: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSecondaryText: { color: COLORS.textZinc, fontWeight: '700', fontSize: 14 },
});
