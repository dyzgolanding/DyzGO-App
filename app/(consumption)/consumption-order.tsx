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
import { BlurView } from '../../components/BlurSurface';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import {
  ArrowRight, CheckCircle2, Clock, Minus, MoveHorizontal, Plus,
  Share2, Users, Wine, X, Zap, AlertTriangle, MapPin, ShoppingBag, Timer,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform,
  ActivityIndicator, Alert, FlatList, Modal, Share, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { sendPushNotification } from '../../lib/push';
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
  const [transferring, setTransferring] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [friendModalVisible, setFriendModalVisible] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  // Reanimated — fade-in al cargar
  const opacity = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    fetchOrder();

    const itemsChannel = supabase
      .channel(`consumption_order:${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'consumption_order_items',
        filter: `order_id=eq.${orderId}`,
      }, () => fetchOrder())
      .subscribe();

    const ownerChannel = supabase
      .channel(`consumption_owner:${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'consumption_orders',
        filter: `id=eq.${orderId}`,
      }, async (payload) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (payload.new.user_id !== user?.id) setIsSent(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(ownerChannel);
    };
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
  const canTransfer = items.length > 0 && items.every(i => i.status === 'inactive');

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

  const handleShareTransfer = async () => {
    try {
      setTransferring(true);
      const { data: { user } } = await supabase.auth.getUser();
      const secretToken =
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const { error } = await supabase.from('consumption_order_transfers').insert({
        order_id: orderId, sender_id: user?.id,
        token: secretToken, is_used: false, expires_at: expiresAt.toISOString(),
      });
      if (error) throw error;

      const shareUrl = Linking.createURL('/claim-consumption', { queryParams: { token: secretToken } });
      await Share.share({
        url: shareUrl,
        message: `🥂 Aquí tienes tu pedido${order?.event?.title ? ` de ${order.event.title}` : ''}. Reclámalo antes de que expire: ${shareUrl}`,
      });
    } catch (err) {
      Alert.alert('Error', 'No se pudo generar el enlace.');
      console.error(err);
    } finally { setTransferring(false); }
  };

  const openFriendSelector = useCallback(async () => {
    setFriendModalVisible(true);
    setLoadingFriends(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: follows } = await supabase
        .from('follows').select('following_id')
        .eq('follower_id', user.id).eq('status', 'accepted');
      const friendIds = follows?.map((f: any) => f.following_id) || [];
      if (friendIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', friendIds);
        setFriends(profiles || []);
      } else { setFriends([]); }
    } catch (e) { console.error(e); }
    finally { setLoadingFriends(false); }
  }, []);

  const handleDirectTransfer = async (friendId: string, friendName: string) => {
    Alert.alert(
      'Confirmar Transferencia',
      `¿Enviar el pedido a ${friendName}?\n\nEsta acción es irreversible y el pedido desaparecerá de tu cuenta.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar ahora',
          style: 'destructive',
          onPress: async () => {
            try {
              setTransferring(true);
              setFriendModalVisible(false);
              const { error } = await supabase.rpc('transfer_consumption_order_direct', {
                p_order_id: orderId,
                p_recipient_id: friendId,
              });
              if (error) throw error;

              const { data: recipient } = await supabase
                .from('profiles').select('expo_push_token').eq('id', friendId).single();
              if (recipient?.expo_push_token) {
                sendPushNotification(
                  recipient.expo_push_token,
                  '🥂 ¡Recibiste un pedido!',
                  `Te enviaron un pedido${order?.event?.title ? ` de ${order.event.title}` : ''}.`,
                  { url: '/my-tickets' }
                ).then(undefined, console.error);
              }
              setIsSent(true);
            } catch (e: any) {
              Alert.alert('Error', `Falló la transferencia: ${e.message}`);
              console.error(e);
              setTransferring(false);
            }
          },
        },
      ]
    );
  };

  if (isSent) return (
    <View style={{ flex: 1, backgroundColor: '#030303', justifyContent: 'center', alignItems: 'center', padding: 30 }}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={['rgba(255,49,216,0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(255,49,216,0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.sentCard}>
        <MoveHorizontal size={44} color="#FF31D8" />
        <Text style={styles.sentTitle}>¡PEDIDO ENVIADO!</Text>
        <Text style={styles.sentSubtitle}>El pedido ya está en la cuenta del destinatario.</Text>
      </View>
      <TouchableOpacity
        style={styles.sentBtn}
        activeOpacity={0.7}
        onPress={() => router.replace('/(tabs)/home')}
      >
        <Text style={styles.sentBtnText}>VOLVER AL INICIO</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={['rgba(255,49,216,0.15)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(255,49,216,0.1)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
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
          colors={['rgba(255,49,216,0.15)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['transparent', 'rgba(255,49,216,0.1)']}
          start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['transparent', 'rgba(255,49,216,0.03)', 'transparent']}
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
          <View style={[styles.orderIconWrapper, { backgroundColor: 'rgba(255,49,216,0.15)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.3)' }]}>
            <ShoppingBag size={22} color="#FF31D8" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eventTitle}>{order.event?.title ?? 'Evento'}</Text>
            <Text style={styles.orderMeta}>
              {items.length} {items.length === 1 ? 'ítem' : 'ítems'} · <Text style={{ color: '#fff', fontWeight: '800' }}>${order.total_amount.toLocaleString('es-CL')}</Text>
            </Text>
          </View>
        </View>
        </Animated.View>

        {/* ─── TRANSFERIR (solo si todos los ítems están inactive) ─── */}
        {canTransfer && (
          <Animated.View entering={FadeInUp.duration(300).delay(40).springify()}>
          <View style={styles.transferRow}>
            <TouchableOpacity
              style={styles.transferBtn}
              onPress={openFriendSelector}
              disabled={transferring}
              activeOpacity={0.75}
            >
              <Users size={16} color="#FF31D8" />
              <Text style={styles.transferBtnText}>Enviar a amigo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.transferBtn}
              onPress={handleShareTransfer}
              disabled={transferring}
              activeOpacity={0.75}
            >
              {transferring
                ? <ActivityIndicator size={16} color="#FF31D8" />
                : <Share2 size={16} color="#FF31D8" />}
              <Text style={styles.transferBtnText}>Compartir link</Text>
            </TouchableOpacity>
          </View>
          </Animated.View>
        )}

        {/* ─── SECCIÓN: ACTIVAR ─── */}
        {inactiveProducts.length > 0 && (
          <Animated.View entering={FadeInUp.duration(300).delay(80).springify()}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBadge, { backgroundColor: 'rgba(255,49,216,0.15)' }]}>
                <Zap size={18} color="#FF31D8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Activar bebidas</Text>
                <Text style={styles.sectionSubtitle}>Seleccioná cuántos de cada bebida querés pedir ahora. Entrarán juntos como un solo pedido.</Text>
              </View>
            </View>

            <View style={styles.productsContainer}>
              {productsWithSelection.map((product, idx) => {
                const qty = product.selected;
                const max = product.ids.length;
                const isLast = idx === productsWithSelection.length - 1;
                return (
                  <View key={product.item_name} style={[styles.productRow, isLast && { borderBottomWidth: 0 }]}>
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
            </View>

            <TouchableOpacity
              onPress={handleActivate}
              disabled={activating || totalSelected === 0}
              style={[
                styles.activateBtn,
                totalSelected > 0 && {
                  backgroundColor: '#FF31D8',
                  borderColor: '#FF7BED',
                  shadowOpacity: 0.6,
                },
                totalSelected === 0 && { opacity: 0.4 }
              ]}
              activeOpacity={0.85}
            >
              {activating
                ? <ActivityIndicator color={totalSelected > 0 ? "#fff" : "#FF31D8"} />
                : <>
                    <Zap size={18} color={totalSelected > 0 ? "#fff" : "#FF31D8"} />
                    <Text style={[styles.activateBtnText, totalSelected > 0 && { color: '#fff' }]}>
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
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBadge, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                <Clock size={18} color="#f59e0b" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>En progreso</Text>
                <Text style={styles.sectionSubtitle}>Tus pedidos en preparación o en cola</Text>
              </View>
            </View>

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
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconBadge, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                <ShoppingBag size={18} color="rgba(255,255,255,0.6)" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Historial</Text>
                <Text style={styles.sectionSubtitle}>Pedidos entregados o expirados</Text>
              </View>
            </View>

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

      {/* ─── MODAL: Seleccionar amigo ─── */}
      <Modal
        visible={friendModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFriendModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enviar a un amigo</Text>
              <TouchableOpacity onPress={() => setFriendModalVisible(false)} style={styles.modalCloseBtn}>
                <X size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>

            {loadingFriends ? (
              <ActivityIndicator color="#FF31D8" style={{ marginTop: 30 }} />
            ) : friends.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Users size={36} color="rgba(255,255,255,0.15)" />
                <Text style={{ color: 'rgba(255,255,255,0.3)', marginTop: 12, fontSize: 14, fontWeight: '600' }}>
                  No tienes amigos agregados aún
                </Text>
              </View>
            ) : (
              <FlatList
                data={friends}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.friendRow}
                    activeOpacity={0.7}
                    onPress={() => handleDirectTransfer(item.id, item.full_name || item.username || 'este usuario')}
                  >
                    <View style={styles.friendAvatar}>
                      <Text style={styles.friendAvatarText}>
                        {(item.full_name || item.username || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.friendName}>{item.full_name || item.username}</Text>
                      {item.username && item.full_name && (
                        <Text style={styles.friendUsername}>@{item.username}</Text>
                      )}
                    </View>
                    <ArrowRight size={16} color="rgba(255,255,255,0.3)" />
                  </TouchableOpacity>
                )}
                contentContainerStyle={{ paddingBottom: 20 }}
              />
            )}
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#030303' },
  center: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#030303', justifyContent: 'center', alignItems: 'center' },
  orderIconWrapper: {
    width: 48, height: 48, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  orderHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    padding: 16, marginBottom: 28,
  },
  eventTitle: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: -0.3 },
  orderMeta: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 3, fontWeight: '500' },
  section: { marginBottom: 32 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16,
  },
  sectionIconBadge: {
    width: 38, height: 38, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  sectionSubtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 18, marginTop: 2 },
  productsContainer: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
  },
  productRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  productName: { color: '#fff', fontWeight: '800', fontSize: 15 },
  productAvail: { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2, fontWeight: '500' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperBtn: {
    width: 36, height: 36, borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center', alignItems: 'center',
  },
  stepperQty: { color: '#fff', fontWeight: '900', fontSize: 18, minWidth: 24, textAlign: 'center' },
  activateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginTop: 20, paddingVertical: 16, borderRadius: 20,
    backgroundColor: 'rgba(255,49,216,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,49,216,0.3)',
    shadowColor: '#FF31D8', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 8,
  },
  activateBtnText: { color: '#FF31D8', fontWeight: '900', fontSize: 16 },
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

  // Transfer buttons
  transferRow: {
    flexDirection: 'row', gap: 10, marginBottom: 20,
  },
  transferBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 16,
    backgroundColor: 'rgba(255,49,216,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,49,216,0.25)',
  },
  transferBtnText: { color: '#FF31D8', fontWeight: '800', fontSize: 13 },

  // isSent screen
  sentCard: {
    alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,49,216,0.08)',
    borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,49,216,0.25)',
    padding: 32, width: '100%', marginBottom: 20,
  },
  sentTitle: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -1, fontStyle: 'italic', textAlign: 'center' },
  sentSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  sentBtn: {
    width: '100%', height: 58, borderRadius: 20,
    backgroundColor: 'rgba(255,49,216,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,49,216,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  sentBtnText: { color: '#FF31D8', fontWeight: '900', fontSize: 15 },

  // Friend modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, maxHeight: '70%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: -0.4 },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  friendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  friendAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,49,216,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  friendAvatarText: { color: '#FF31D8', fontWeight: '900', fontSize: 18 },
  friendName: { color: '#fff', fontWeight: '800', fontSize: 15 },
  friendUsername: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
});
