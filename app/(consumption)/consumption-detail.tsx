/**
 * consumption-detail.tsx
 *
 * Pantalla de detalle de un ítem de consumo individual.
 * Estados: inactive → queued → preparing → delivered / expired
 *
 * Params: orderItemId
 */
import { LinearGradient } from 'expo-linear-gradient';
import {
  CheckCircle2, Clock, GlassWater, PlayCircle,
  Wine, Zap, AlertTriangle, MapPin, Timer,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Platform, 
  ActivityIndicator, Alert, Dimensions, ScrollView,
  StatusBar, StyleSheet, Text, TouchableOpacity, View,
 } from 'react-native';
import Animated, {
  FadeInUp,
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { timing } from '../../lib/animation';
import { supabase } from '../../lib/supabase';
import { useNavRouter } from '../../hooks/useNavRouter';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';

const { width } = Dimensions.get('window');

interface OrderItem {
  id: string;
  item_name: string;
  item_image_url: string | null;
  unit_price: number;
  status: 'inactive' | 'queued' | 'preparing' | 'delivered' | 'expired';
  bar_id: string | null;
  queue_position: number | null;
  activated_at: string | null;
  preparing_started_at: string | null;
  delivered_at: string | null;
  expired_at: string | null;
  pickup_code: string | null;
  next_up_at: string | null;
  bar?: { id: string; name: string; capacity_per_minute: number };
  order?: { event_id: string };
}

const STATUS_CONFIG = {
  inactive: {
    label: 'Sin Activar',
    desc: 'Pulsa "Activar ahora" cuando quieras tu trago',
    color: '#71717a',
    bgColor: 'rgba(113,113,122,0.1)',
    icon: Wine,
  },
  queued: {
    label: 'En Cola',
    desc: 'Tu pedido está en la fila virtual',
    color: '#f59e0b',
    bgColor: 'rgba(245,158,11,0.1)',
    icon: Clock,
  },
  preparing: {
    label: '¡Preparando!',
    desc: 'El bartender está haciendo tu trago. Acércate a la barra.',
    color: '#f97316',
    bgColor: 'rgba(249,115,22,0.1)',
    icon: Zap,
  },
  delivered: {
    label: 'Entregado',
    desc: '¡Disfrutá tu trago!',
    color: '#22c55e',
    bgColor: 'rgba(34,197,94,0.1)',
    icon: CheckCircle2,
  },
  expired: {
    label: 'Expirado',
    desc: 'El pedido no fue retirado a tiempo',
    color: '#ef4444',
    bgColor: 'rgba(239,68,68,0.1)',
    icon: AlertTriangle,
  },
};

export default function ConsumptionDetailScreen() {
  const router = useNavRouter();
  const navTop = useNavBarPaddingTop();
  const params = useLocalSearchParams();
  const orderItemId = params.orderItemId as string;

  const [item, setItem] = useState<OrderItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [eta, setEta] = useState<number | null>(null);
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const [isNextUp, setIsNextUp] = useState(false);

  // Reanimated — pulse para estado "preparing"
  const pulseScale = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const startPulse = () => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 600 }),
        withTiming(1, { duration: 600 }),
      ),
      -1,
    );
  };

  useEffect(() => {
    fetchItem();

    const channel = supabase
      .channel(`consumption_item:${orderItemId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'consumption_order_items',
        filter: `id=eq.${orderItemId}`,
      }, payload => {
        const updated = payload.new as Partial<OrderItem>;
        setItem(prev => prev ? { ...prev, ...updated } : null);
        if (updated.status === 'preparing') startPulse();
        if (updated.next_up_at) setIsNextUp(true);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderItemId]);

  useEffect(() => {
    if (!item || item.status !== 'queued' || !item.bar_id) return;
    fetchEta();
    const interval = setInterval(fetchEta, 30000);
    return () => clearInterval(interval);
  }, [item?.status, item?.bar_id]);

  const fetchItem = async () => {
    const { data } = await supabase
      .from('consumption_order_items')
      .select(`
        *,
        bars(id, name, capacity_per_minute),
        consumption_orders!inner(event_id)
      `)
      .eq('id', orderItemId)
      .single();

    if (data) {
      setItem({
        ...data,
        bar: data.bars,
        order: data.consumption_orders,
      });
      if (data.status === 'preparing') startPulse();
      if (data.next_up_at) setIsNextUp(true);
    }
    setLoading(false);
  };

  const fetchEta = async () => {
    const { data } = await supabase.rpc('get_queue_eta', { p_order_item_id: orderItemId });
    if (data !== null && data !== undefined) {
      setEta(data);
      const { count } = await supabase
        .from('consumption_order_items')
        .select('*', { count: 'exact', head: true })
        .eq('bar_id', item?.bar_id)
        .in('status', ['queued', 'preparing'])
        .lt('activated_at', item?.activated_at || new Date().toISOString());
      setQueueCount((count ?? 0) + 1);
    }
  };

  const handleActivate = async () => {
    if (!item || item.status !== 'inactive') return;
    setActivating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión');

      const { data, error } = await supabase.functions.invoke('webpay', {
        body: {
          action: 'activate_consumption_item',
          order_item_id: orderItemId,
          user_id: session.user.id,
        },
      });

      if (error || !data?.success) throw new Error(data?.error || error?.message || 'Error activando');

      setItem(prev => prev ? {
        ...prev,
        status: 'queued',
        bar_id: data.bar_id,
        queue_position: data.queue_position,
        activated_at: new Date().toISOString(),
        bar: prev.bar ? { ...prev.bar, id: data.bar_id, name: data.bar_name } : { id: data.bar_id, name: data.bar_name, capacity_per_minute: 4 },
      } : null);

      Alert.alert('¡Activado!', `Tu pedido entró a la cola de ${data.bar_name}. Posición #${data.queue_position}.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setActivating(false);
    }
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={COLORS.neonPurple} />
    </View>
  );

  if (!item) return (
    <View style={styles.center}>
      <Text style={{ color: 'rgba(255,255,255,0.4)' }}>Consumo no encontrado</Text>
    </View>
  );

  const cfg = STATUS_CONFIG[item.status];
  const StatusIcon = cfg.icon;
  const etaMinutes = eta !== null ? Math.ceil(eta / 60) : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Gradiente de fondo */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={['rgba(139,92,246,0.2)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['transparent', 'rgba(139,92,246,0.15)']}
          start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['transparent', 'rgba(139,92,246,0.05)', 'transparent']}
          start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }}
          locations={[0.3, 0.5, 0.7]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <NavBar title="DETALLE" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, paddingTop: navTop, alignItems: 'center' }}>

        {/* Status hero */}
        <Animated.View style={[
          styles.statusHero,
          { backgroundColor: cfg.bgColor, borderColor: cfg.color + '40' },
          item.status === 'preparing' ? pulseStyle : undefined,
        ]}>
          <StatusIcon size={64} color={cfg.color} strokeWidth={1.5} />
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(300).delay(0).springify()} style={{ alignItems: 'center', width: '100%' }}>
        <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
        <Text style={styles.itemName}>{item.item_name}</Text>
        <Text style={styles.statusDesc}>{cfg.desc}</Text>
        </Animated.View>

        {/* Banner "eres el siguiente" */}
        {isNextUp && item.status === 'queued' && (
          <View style={styles.nextUpBanner}>
            <Zap size={18} color="#f97316" />
            <View style={{ flex: 1 }}>
              <Text style={styles.nextUpTitle}>¡Acércate a la barra!</Text>
              <Text style={styles.nextUpDesc}>Están preparando el pedido anterior — eres el siguiente</Text>
            </View>
          </View>
        )}

        {/* Código de retiro */}
        {item.pickup_code && (item.status === 'queued' || item.status === 'preparing') && (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>TU CÓDIGO DE RETIRO</Text>
            <Text style={styles.codeValue}>{item.pickup_code}</Text>
            <Text style={styles.codeHint}>El bartender te pedirá este número antes de preparar tu trago</Text>
          </View>
        )}

        <Animated.View entering={FadeInUp.duration(300).delay(80).springify()} style={{ alignItems: 'center', width: '100%' }}>
        <Text style={styles.price}>${item.unit_price.toLocaleString('es-CL')}</Text>
        <View style={styles.divider} />

        {/* Barra asignada */}
        {item.bar && (item.status === 'queued' || item.status === 'preparing') && (
          <View style={styles.infoRow}>
            <MapPin size={16} color="rgba(255,255,255,0.4)" />
            <Text style={styles.infoLabel}>Barra</Text>
            <Text style={styles.infoValue}>{item.bar.name}</Text>
          </View>
        )}

        {/* Posición en cola */}
        {item.status === 'queued' && queueCount !== null && (
          <View style={styles.infoRow}>
            <GlassWater size={16} color="rgba(255,255,255,0.4)" />
            <Text style={styles.infoLabel}>Posición</Text>
            <Text style={[styles.infoValue, { color: '#f59e0b' }]}>#{queueCount} en la cola</Text>
          </View>
        )}

        {/* ETA */}
        {item.status === 'queued' && etaMinutes !== null && (
          <View style={[styles.etaCard, { borderColor: '#f59e0b40', backgroundColor: 'rgba(245,158,11,0.08)' }]}>
            <Timer size={20} color="#f59e0b" />
            <View>
              <Text style={{ color: '#f59e0b', fontWeight: '900', fontSize: 20 }}>~{etaMinutes} min</Text>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>Tiempo estimado de espera</Text>
            </View>
          </View>
        )}

        {/* Preparando — ir a la barra */}
        {item.status === 'preparing' && item.bar && (
          <View style={[styles.etaCard, { borderColor: '#f9731640', backgroundColor: 'rgba(249,115,22,0.08)' }]}>
            <Zap size={20} color="#f97316" />
            <View>
              <Text style={{ color: '#f97316', fontWeight: '900', fontSize: 16 }}>¡Ve a {item.bar.name}!</Text>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>Tu trago está siendo preparado</Text>
            </View>
          </View>
        )}

        {/* Activate button */}
        {item.status === 'inactive' && (
          <View style={{ width: '100%', marginTop: 16 }}>
            <Text style={styles.activateNote}>
              Una vez que actives tu pedido, entrarás a la fila virtual y el sistema te asignará una barra automáticamente.
            </Text>
            <TouchableOpacity
              onPress={handleActivate}
              disabled={activating}
              style={styles.activateBtn}
              activeOpacity={0.85}
            >
              {activating
                ? <ActivityIndicator color="#a78bfa" />
                : <><PlayCircle size={20} color="#a78bfa" /><Text style={styles.activateBtnText}>Activar Ahora</Text></>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* Delivered */}
        {item.status === 'delivered' && (
          <View style={[styles.etaCard, { borderColor: '#22c55e40', backgroundColor: 'rgba(34,197,94,0.08)' }]}>
            <CheckCircle2 size={20} color="#22c55e" />
            <Text style={{ color: '#22c55e', fontWeight: '900', fontSize: 15 }}>¡A disfrutarlo!</Text>
          </View>
        )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#030303' },
  center: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#030303', justifyContent: 'center', alignItems: 'center' },
  statusHero: { width: 140, height: 140, borderRadius: 70, justifyContent: 'center', alignItems: 'center', borderWidth: 2, marginBottom: 24, marginTop: 8 },
  statusLabel: { fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 },
  itemName: { color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5, marginBottom: 8 },
  statusDesc: { color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 8, paddingHorizontal: 20 },
  price: { color: 'rgba(255,255,255,0.6)', fontWeight: '800', fontSize: 18, marginTop: 4 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', width: '100%', marginVertical: 24 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', marginBottom: 14 },
  infoLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 13, flex: 1, fontWeight: '600' },
  infoValue: { color: '#fff', fontSize: 14, fontWeight: '800' },
  etaCard: { flexDirection: 'row', alignItems: 'center', gap: 14, width: '100%', borderRadius: 20, borderWidth: 1, padding: 20, marginTop: 8 },
  activateNote: { color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 20, paddingHorizontal: 10 },
  activateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 18, borderRadius: 20,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.4)',
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 15, elevation: 8,
  },
  activateBtnText: { color: '#a78bfa', fontWeight: '900', fontSize: 17 },
  nextUpBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(249,115,22,0.4)', backgroundColor: 'rgba(249,115,22,0.1)', padding: 16, marginBottom: 16 },
  nextUpTitle: { color: '#f97316', fontWeight: '900', fontSize: 14, marginBottom: 2 },
  nextUpDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 17 },
  codeCard: { width: '100%', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)', padding: 24, alignItems: 'center', marginBottom: 8 },
  codeLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },
  codeValue: { color: '#fff', fontSize: 48, fontWeight: '900', letterSpacing: 8, marginBottom: 10 },
  codeHint: { color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
