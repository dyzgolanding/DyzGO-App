/**
 * consumption-order.tsx
 *
 * Hub de un pedido de consumo completo.
 * - Sección "Activar": ítems inactivos con steppers de cantidad
 * - Sección "En progreso": grupos activos (código de retiro, ETA)
 * - Sección "Historial": entregados / expirados
 *
 * Params: orderId
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import {
  CheckCircle2, Clock, Minus, Plus,
  Wine, Zap, AlertTriangle, MapPin, ShoppingBag, Timer,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import Animated, {
  FadeInUp,
  useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';
import { COLORS } from '../../constants/colors';
import { timing } from '../../lib/animation';
import { supabase } from '../../lib/supabase';
import { useNavRouter } from '../../hooks/useNavRouter';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import { SkeletonBox } from '../../components/SkeletonBox';

interface OrderItem {
  id: string;
  item_name: string;
  unit_price: number;
  status: 'inactive' | 'queued' | 'preparing' | 'delivered' | 'expired';
  bar_id: string | null;
  activation_group_id: string | null;
  pickup_code: string | null;
  activated_at: string | null;
  next_up_at: string | null;
}

interface OrderMeta {
  id: string;
  event_id: string;
  total_amount: number;
  event?: { title: string };
}

interface InactiveProduct {
  item_name: string;
  unit_price: number;
  ids: string[];
  selected: number;
}

interface ActiveGroup {
  group_id: string;
  pickup_code: string | null;
  status: 'queued' | 'preparing';
  bar_id: string | null;
  activated_at: string | null;
  next_up_at: string | null;
  items: OrderItem[];
}

const STATUS_ICON: Record<string, any> = {
  queued: Clock,
  preparing: Zap,
  delivered: CheckCircle2,
  expired: AlertTriangle,
};
const STATUS_COLOR: Record<string, string> = {
  queued: '#f59e0b',
  preparing: '#f97316',
  delivered: '#22c55e',
  expired: '#ef4444',
};

export default function ConsumptionOrderScreen() {
  const router = useNavRouter();
  const navTop = useNavBarPaddingTop();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const [order, setOrder] = useState<OrderMeta | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [barNames, setBarNames] = useState<Record<string, string>>({});
  const [barCapacity, setBarCapacity] = useState<Record<string, number>>({});
  const [queueInfo, setQueueInfo] = useState<Record<string, { position: number; etaMinutes: number | null }>>({});
  const [selections, setSelections] = useState<Record<string, number>>({});

  // Reanimated — fade-in al cargar
  const opacity = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    fetchOrder();

    const channel = supabase
      .channel(`consumption_order:${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'consumption_order_items',
        filter: `order_id=eq.${orderId}`,
      }, () => fetchOrder())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      const { data: orderData } = await supabase
        .from('consumption_orders')
        .select('id, event_id, total_amount, events(title)')
        .eq('id', orderId)
        .single();

      const { data: itemsData } = await supabase
        .from('consumption_order_items')
        .select('id, item_name, unit_price, status, bar_id, activation_group_id, pickup_code, activated_at, next_up_at')
        .eq('order_id', orderId)
        .order('activated_at', { ascending: true });

      if (orderData) {
        setOrder({ ...orderData, event: (orderData.events as any) });
      }
      if (itemsData) {
        setItems(itemsData);
        const barIds = [...new Set(itemsData.filter(i => i.bar_id).map(i => i.bar_id!))];
        if (barIds.length > 0) {
          const { data: bars } = await supabase
            .from('bars').select('id, name, capacity_per_minute').in('id', barIds);
          const nameMap: Record<string, string> = {};
          const capMap: Record<string, number> = {};
          bars?.forEach(b => { nameMap[b.id] = b.name; capMap[b.id] = b.capacity_per_minute ?? 4; });
          setBarNames(nameMap);
          setBarCapacity(capMap);
          await fetchQueueInfo(itemsData, capMap);
        }
      }
      opacity.value = withTiming(1, timing.enter);
    } catch (_e) {
      // Error silencioso: el usuario verá el spinner y puede volver atrás
    } finally {
      setLoading(false);
    }
  };

  const fetchQueueInfo = async (
    allItems: OrderItem[],
    capMap: Record<string, number> = barCapacity,
  ) => {
    const activeItems = allItems.filter(i => i.status === 'queued' || i.status === 'preparing');
    if (activeItems.length === 0) return;

    const barIds = [...new Set(activeItems.filter(i => i.bar_id).map(i => i.bar_id!))];
    const infoMap: Record<string, { position: number; etaMinutes: number | null }> = {};

    for (const bid of barIds) {
      const { data: barQueueItems } = await supabase
        .from('consumption_order_items')
        .select('id, activation_group_id, activated_at')
        .eq('bar_id', bid)
        .in('status', ['queued', 'preparing'])
        .order('activated_at', { ascending: true });

      if (!barQueueItems) continue;

      const groupMap: Record<string, { activatedAt: string; itemCount: number }> = {};
      barQueueItems.forEach(row => {
        const key = row.activation_group_id ?? row.id;
        if (!groupMap[key]) groupMap[key] = { activatedAt: row.activated_at ?? '', itemCount: 0 };
        groupMap[key].itemCount++;
      });

      const sortedGroups = Object.entries(groupMap).sort((a, b) =>
        a[1].activatedAt.localeCompare(b[1].activatedAt)
      );

      const capacity = capMap[bid] ?? 4;
      const userGroupsAtBar = activeItems
        .filter(i => i.bar_id === bid && i.activation_group_id)
        .map(i => i.activation_group_id!);
      const uniqueUserGroups = [...new Set(userGroupsAtBar)];

      for (const gid of uniqueUserGroups) {
        const myIndex = sortedGroups.findIndex(([key]) => key === gid);
        if (myIndex === -1) continue;
        const position = myIndex + 1;
        const itemsAhead = sortedGroups
          .slice(0, myIndex)
          .reduce((sum, [, g]) => sum + g.itemCount, 0);
        const etaMinutes = myIndex === 0 ? null : Math.ceil(itemsAhead / capacity);
        infoMap[gid] = { position, etaMinutes };
      }
    }

    setQueueInfo(infoMap);
  };

  useEffect(() => {
    const hasQueued = items.some(i => i.status === 'queued');
    if (!hasQueued) return;
    const interval = setInterval(() => fetchQueueInfo(items), 30000);
    return () => clearInterval(interval);
  }, [items]);

  const inactiveItems = items.filter(i => i.status === 'inactive');
  const activeItems = items.filter(i => i.status === 'queued' || i.status === 'preparing');
  const pastItems = items.filter(i => i.status === 'delivered' || i.status === 'expired');

  const inactiveByProduct = inactiveItems.reduce<Record<string, InactiveProduct>>((acc, item) => {
    if (!acc[item.item_name]) {
      acc[item.item_name] = { item_name: item.item_name, unit_price: item.unit_price, ids: [], selected: 0 };
    }
    acc[item.item_name].ids.push(item.id);
    return acc;
  }, {});
  const inactiveProducts = Object.values(inactiveByProduct);

  const productsWithSelection = inactiveProducts.map(p => ({
    ...p,
    selected: Math.min(selections[p.item_name] ?? 0, p.ids.length),
  }));

  const activeGroups = activeItems.reduce<Record<string, ActiveGroup>>((acc, item) => {
    const key = item.activation_group_id ?? item.id;
    if (!acc[key]) {
      acc[key] = {
        group_id: key,
        pickup_code: item.pickup_code,
        status: item.status as any,
        bar_id: item.bar_id,
        activated_at: item.activated_at,
        next_up_at: item.next_up_at,
        items: [],
      };
    }
    acc[key].items.push(item);
    if (item.status === 'preparing') acc[key].status = 'preparing';
    if (item.next_up_at) acc[key].next_up_at = item.next_up_at;
    return acc;
  }, {});
  const activeGroupList = Object.values(activeGroups).sort((a, b) =>
    (a.activated_at ?? '').localeCompare(b.activated_at ?? '')
  );

  const pastGroups = pastItems.reduce<Record<string, { status: string; items: OrderItem[] }>>((acc, item) => {
    const key = item.activation_group_id ?? item.id;
    if (!acc[key]) acc[key] = { status: item.status, items: [] };
    acc[key].items.push(item);
    return acc;
  }, {});

  const totalSelected = productsWithSelection.reduce((s, p) => s + p.selected, 0);

  const setQty = (productName: string, delta: number, max: number) => {
    setSelections(prev => {
      const cur = prev[productName] ?? 0;
      const next = Math.max(0, Math.min(max, cur + delta));
      return { ...prev, [productName]: next };
    });
  };

  const handleActivate = async () => {
    if (totalSelected === 0) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { Alert.alert('Error', 'Sin sesión activa'); return; }

    const selectedIds: string[] = [];
    productsWithSelection.forEach(p => {
      selectedIds.push(...p.ids.slice(0, p.selected));
    });

    setActivating(true);
    try {
      const { data, error } = await supabase.functions.invoke('webpay', {
        body: {
          action: 'activate_consumption_group',
          order_id: orderId,
          item_ids: selectedIds,
          user_id: session.user.id,
        },
      });

      if (error || !data?.success) throw new Error(data?.error || error?.message || 'Error activando');

      setSelections({});
      Alert.alert(
        '¡Activado!',
        `${data.item_count} ${data.item_count === 1 ? 'ítem entraron' : 'ítems entraron'} a la cola de ${data.bar_name}.\n\nCódigo de retiro: ${data.pickup_code}`,
      );
      await fetchOrder();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setActivating(false);
    }
  };

  if (loading) return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={['rgba(139,92,246,0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(139,92,246,0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </View>
      <NavBar title="MI PEDIDO" onBack={() => router.back()} />
      <View style={{ flex: 1, padding: 20, paddingTop: navTop }}>
        <SkeletonBox height={60} borderRadius={16} style={{ marginBottom: 16 }} />
        <SkeletonBox height={200} borderRadius={16} style={{ marginBottom: 12 }} />
        <SkeletonBox height={160} borderRadius={16} style={{ marginBottom: 12 }} />
        <SkeletonBox height={52} borderRadius={16} />
      </View>
    </View>
  );

  if (!order) return (
    <View style={styles.center}>
      <Text style={{ color: 'rgba(255,255,255,0.4)' }}>Pedido no encontrado</Text>
    </View>
  );

  return (
    <Animated.View entering={FadeInUp.duration(300).springify()} style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

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

      <NavBar title="MI PEDIDO" onBack={() => router.back()} />

      <Animated.ScrollView
        style={fadeStyle}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 80, paddingTop: navTop }}
      >
        {/* Header */}
        <Animated.View entering={FadeInUp.duration(300).delay(0).springify()}>
        <View style={styles.orderHeader}>
          <ShoppingBag size={20} color="#a78bfa" />
          <View style={{ flex: 1 }}>
            <Text style={styles.eventTitle}>{order.event?.title ?? 'Evento'}</Text>
            <Text style={styles.orderMeta}>
              {items.length} {items.length === 1 ? 'ítem' : 'ítems'} · ${order.total_amount.toLocaleString('es-CL')}
            </Text>
          </View>
        </View>

        </Animated.View>

        {/* ─── SECCIÓN: ACTIVAR ─── */}
        {inactiveProducts.length > 0 && (
          <Animated.View entering={FadeInUp.duration(300).delay(80).springify()}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activar bebidas</Text>
            <Text style={styles.sectionHint}>
              Seleccioná cuántos de cada bebida querés pedir ahora. Entrarán juntos como un solo pedido.
            </Text>

            {productsWithSelection.map(product => {
              const qty = product.selected;
              const max = product.ids.length;
              return (
                <View key={product.item_name} style={styles.productRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName}>{product.item_name}</Text>
                    <Text style={styles.productAvail}>{max} disponible{max !== 1 ? 's' : ''}</Text>
                  </View>
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      onPress={() => setQty(product.item_name, -1, max)}
                      style={[styles.stepperBtn, { opacity: qty === 0 ? 0.3 : 1 }]}
                      disabled={qty === 0}
                    >
                      <Minus size={16} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.stepperQty}>{qty}</Text>
                    <TouchableOpacity
                      onPress={() => setQty(product.item_name, +1, max)}
                      style={[styles.stepperBtn, { opacity: qty === max ? 0.3 : 1 }]}
                      disabled={qty === max}
                    >
                      <Plus size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            <TouchableOpacity
              onPress={handleActivate}
              disabled={activating || totalSelected === 0}
              style={[styles.activateBtn, { opacity: totalSelected === 0 ? 0.4 : 1 }]}
              activeOpacity={0.85}
            >
              {activating
                ? <ActivityIndicator color="#a78bfa" />
                : <>
                    <Zap size={18} color="#a78bfa" />
                    <Text style={styles.activateBtnText}>
                      Activar {totalSelected > 0 ? `${totalSelected} ítem${totalSelected !== 1 ? 's' : ''}` : 'pedido'}
                    </Text>
                  </>
              }
            </TouchableOpacity>
          </View>
          </Animated.View>
        )}

        {/* ─── SECCIÓN: EN PROGRESO ─── */}
        {activeGroupList.length > 0 && (
          <Animated.View entering={FadeInUp.duration(300).delay(160).springify()}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>En progreso</Text>

            {activeGroupList.map((group) => {
              const isPreparing = group.status === 'preparing';
              const color = isPreparing ? '#f97316' : '#f59e0b';
              const GroupIcon = isPreparing ? Zap : Clock;
              const barName = group.bar_id ? barNames[group.bar_id] : null;
              const info = queueInfo[group.group_id];
              const realPosition = info?.position ?? null;
              const etaMinutes = info?.etaMinutes ?? null;

              const countMap: Record<string, number> = {};
              group.items.forEach(i => { countMap[i.item_name] = (countMap[i.item_name] || 0) + 1; });
              const summary = Object.entries(countMap).map(([n, q]) => `${q}x ${n}`).join(' · ');

              return (
                <View key={group.group_id} style={[styles.groupCard, { borderColor: color + '35' }]}>
                  <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />

                  <View style={styles.groupTop}>
                    <View style={[styles.statusBadge, { backgroundColor: color + '15', borderColor: color + '40' }]}>
                      <GroupIcon size={12} color={color} />
                      <Text style={[styles.statusBadgeText, { color }]}>
                        {isPreparing ? '¡Preparando!' : 'En cola'}
                      </Text>
                    </View>
                    {realPosition !== null && (
                      <View style={styles.positionRow}>
                        <Text style={styles.positionLabel}>Tu posición en la fila</Text>
                        <View style={[styles.positionBadge, { borderColor: color + '40' }]}>
                          <Text style={[styles.positionNum, { color }]}>{realPosition}</Text>
                        </View>
                      </View>
                    )}
                  </View>

                  <Text style={styles.groupSummary}>{summary}</Text>

                  {!isPreparing && etaMinutes !== null && etaMinutes > 0 && (
                    <View style={styles.etaRow}>
                      <Timer size={13} color="#f59e0b" />
                      <Text style={styles.etaText}>~{etaMinutes} min de espera</Text>
                    </View>
                  )}

                  {group.next_up_at && !isPreparing && (
                    <View style={styles.nextUpRow}>
                      <Zap size={13} color="#f97316" />
                      <Text style={styles.nextUpText}>¡Acércate! Están preparando el pedido anterior</Text>
                    </View>
                  )}

                  <View style={styles.groupFooter}>
                    {barName && (
                      <View style={styles.barRow}>
                        <MapPin size={12} color="rgba(255,255,255,0.35)" />
                        <Text style={styles.barText}>{barName}</Text>
                      </View>
                    )}
                    {group.pickup_code && (
                      <View style={styles.codeChip}>
                        <Text style={styles.codeValue}>{group.pickup_code}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
          </Animated.View>
        )}

        {/* ─── SECCIÓN: HISTORIAL ─── */}
        {Object.keys(pastGroups).length > 0 && (
          <Animated.View entering={FadeInUp.duration(300).delay(240).springify()}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Historial</Text>

            {Object.entries(pastGroups).map(([key, group]) => {
              const color = STATUS_COLOR[group.status] ?? '#71717a';
              const Icon = STATUS_ICON[group.status] ?? Wine;
              const countMap: Record<string, number> = {};
              group.items.forEach(i => { countMap[i.item_name] = (countMap[i.item_name] || 0) + 1; });
              const summary = Object.entries(countMap).map(([n, q]) => `${q}x ${n}`).join(' · ');

              return (
                <View key={key} style={[styles.historyRow, { borderColor: color + '25' }]}>
                  <Icon size={16} color={color} />
                  <Text style={styles.historyText} numberOfLines={1}>{summary}</Text>
                  <Text style={[styles.historyStatus, { color }]}>
                    {group.status === 'delivered' ? 'Entregado' : 'Expirado'}
                  </Text>
                </View>
              );
            })}
          </View>
          </Animated.View>
        )}

        {items.length === 0 && (
          <View style={styles.emptyState}>
            <Wine size={48} color="rgba(255,255,255,0.1)" />
            <Text style={styles.emptyText}>Sin ítems en este pedido</Text>
          </View>
        )}
      </Animated.ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030303' },
  center: { flex: 1, backgroundColor: '#030303', justifyContent: 'center', alignItems: 'center' },
  orderHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.glassBg, borderRadius: 18,
    borderWidth: 1, borderColor: COLORS.glassBorder,
    padding: 16, marginBottom: 24,
  },
  eventTitle: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: -0.3 },
  orderMeta: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 3, fontWeight: '600' },
  section: { marginBottom: 28 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: -0.5, fontStyle: 'italic', marginBottom: 6 },
  sectionHint: { color: 'rgba(255,255,255,0.35)', fontSize: 13, lineHeight: 19, marginBottom: 16 },
  productRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  productName: { color: '#fff', fontWeight: '800', fontSize: 15 },
  productAvail: { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperBtn: {
    width: 34, height: 34, borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
  },
  stepperQty: { color: '#fff', fontWeight: '900', fontSize: 18, minWidth: 22, textAlign: 'center' },
  activateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginTop: 20, paddingVertical: 16, borderRadius: 18,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1, borderColor: 'rgba(139,92,246,0.4)',
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8,
  },
  activateBtnText: { color: '#a78bfa', fontWeight: '900', fontSize: 16 },
  groupCard: {
    borderRadius: 20, borderWidth: 1, overflow: 'hidden',
    padding: 16, marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  groupTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  positionBadge: {
    width: 32, height: 32, borderRadius: 10, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  positionNum: { fontSize: 16, fontWeight: '900' },
  groupSummary: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: -0.2, marginBottom: 10 },
  positionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  positionLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600' },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  etaText: { color: '#f59e0b', fontSize: 13, fontWeight: '800' },
  nextUpRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(249,115,22,0.08)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(249,115,22,0.25)',
  },
  nextUpText: { color: '#f97316', fontSize: 12, fontWeight: '700', flex: 1 },
  groupFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  barText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600' },
  codeChip: {
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  codeValue: { color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: 4 },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1,
  },
  historyText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '700', flex: 1 },
  historyStatus: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 16, fontWeight: '700' },
});
