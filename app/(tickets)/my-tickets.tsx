import { BlurView } from '../../components/BlurSurface';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { Calendar, Ghost, MapPin, Ticket, Wine, GlassWater, Clock, Zap, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Platform,  FlatList, RefreshControl, SectionList, StyleSheet, Text, TouchableOpacity, View  } from 'react-native';
import { SkeletonBox } from '../../components/SkeletonBox';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AnimatedEntry } from '../../components/animated/AnimatedEntry';
import { PressableScale } from '../../components/animated/PressableScale';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { timing } from '../../lib/animation';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import { COLORS } from '../../constants/colors';
import { supabase } from '../../lib/supabase';

// --- HELPER: Formato de Fecha (Solo para los Headers de las secciones) ---
const formatDateHeader = (dateString: string) => {
  if (!dateString) return 'Fecha pendiente';
  const date = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  try {
    return date.toLocaleDateString('es-ES', options).replace(/^\w/, (c) => c.toUpperCase());
  } catch (e) {
    return date.toDateString();
  }
};

// --- NUEVO HELPER: Formato de Fecha con Hora para la Tarjeta ---
const formatCardDateTime = (dateStr: string, timeStr: string) => {
  if (!dateStr) return 'Fecha pendiente';
  
  const [year, month, day] = dateStr.split('-');
  const d = new Date(Number(year), Number(month) - 1, Number(day));

  const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sáb'];
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const formatTime = (time: string) => {
      if (!time) return "";
      const [h, m] = time.split(':');
      let hour = parseInt(h, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12;
      hour = hour ? hour : 12;
      return `${hour}:${m} ${ampm}`;
  };

  const formattedTime = timeStr ? formatTime(timeStr) : '';
  const timeString = formattedTime ? `, ${formattedTime}` : '';

  return `${days[d.getDay()]} ${d.getDate()} de ${months[d.getMonth()]}${timeString}`;
};

const CONSUMO_STATUS: Record<string, { label: string; color: string; icon: any }> = {
  inactive:  { label: 'Sin Activar',  color: '#71717a', icon: GlassWater },
  queued:    { label: 'En Cola',      color: '#f59e0b', icon: Clock },
  preparing: { label: '¡Preparando!', color: '#f97316', icon: Zap },
  delivered: { label: 'Entregado',    color: '#22c55e', icon: CheckCircle2 },
  expired:   { label: 'Expirado',     color: '#ef4444', icon: AlertTriangle },
};

// --- HELPER ACTUALIZADO: Verificar si el evento finalizó con fecha y hora exacta ---
const isEventFinished = (evt: any) => {
  if (!evt) return false;
  if (evt.is_active === false) return true;
  if (evt.status === 'finished' || evt.status === 'inactive') return true;
  
  const dateStr = evt.end_date || evt.date;
  const timeStr = evt.end_time || evt.hour || '05:00';

  if (dateStr) {
      const eventDateTime = new Date(`${dateStr}T${timeStr}`);
      const now = new Date();
      return eventDateTime < now;
  }
  return false;
};

export default function MyTicketsScreen() {
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<'tickets' | 'consumos'>(tab === 'consumos' ? 'consumos' : 'tickets');
  const [consumoItems, setConsumoItems] = useState<any[]>([]);
  const [consumosLoading, setConsumosLoading] = useState(false);
  const router = useRouter();
  const navTop = useNavBarPaddingTop();
  const insets = useSafeAreaInsets();
  const fadeAnim = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fadeAnim.value }));

  useEffect(() => {
    if (!loading) fadeAnim.value = withTiming(1, timing.enter);
  }, [loading]);

  // useFocusEffect: recarga cada vez que el usuario navega a esta pantalla
  // (ej: vuelve desde comprar un ticket y ve el nuevo inmediatamente)
  useFocusEffect(
    useCallback(() => {
      loadTickets();
      loadConsumos();
    }, [])
  );

  const loadConsumos = async () => {
    setConsumosLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: orders } = await supabase
        .from('consumption_orders')
        .select(`
          id, total_amount, created_at,
          events(title, image_url),
          consumption_order_items(id, status)
        `)
        .eq('user_id', user.id)
        .eq('status', 'paid')
        .order('created_at', { ascending: false });
      setConsumoItems(orders || []);
    } catch (e) {
      console.error('[loadConsumos]', e);
    } finally {
      setConsumosLoading(false);
    }
  };

  const getOrderStatus = (items: { status: string }[]) => {
    if (!items?.length) return 'inactive';
    if (items.some(i => i.status === 'preparing')) return 'preparing';
    if (items.some(i => i.status === 'queued')) return 'queued';
    if (items.every(i => i.status === 'delivered')) return 'delivered';
    if (items.every(i => i.status === 'expired')) return 'expired';
    return 'inactive';
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTickets(true);
    setRefreshing(false);
  }, []);

  const loadTickets = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('tickets')
        .select(`
          id,
          qr_hash,
          used,
          ticket_type,
          status,
          events (
            title,
            date,
            end_date,
            hour,
            end_time,
            club_name,
            image_url,
            status,
            is_active 
          ),
          ticket_tiers (
            name
          )
        `)
        .eq('user_id', user.id)
        .in('status', ['valid', 'used']); 

      if (error) throw error;

      const rawTickets = data || [];

      // --- 1. SEPARAR ACTIVOS DE PASADOS/FINALIZADOS ---
      const activeTickets: any[] = [];
      const pastTickets: any[] = [];

      rawTickets.forEach(ticket => {
        // Un ticket pasa al historial si ya se usó, o si el evento ya terminó
        const finished = isEventFinished(ticket.events);
        if (ticket.used || finished) {
          pastTickets.push(ticket);
        } else {
          activeTickets.push(ticket);
        }
      });

      // --- 2. ORDENAR ---
      // Activos: Los más próximos primero
      activeTickets.sort((a, b) => new Date(a.events?.date || 0).getTime() - new Date(b.events?.date || 0).getTime());
      // Historial: Los más recientes primero
      pastTickets.sort((a, b) => new Date(b.events?.date || 0).getTime() - new Date(a.events?.date || 0).getTime());

      // --- 3. AGRUPAR ACTIVOS POR FECHA ---
      const activeGroups: { [key: string]: any[] } = {};
      activeTickets.forEach(ticket => {
        const dateKey = formatDateHeader(ticket.events?.date);
        if (!activeGroups[dateKey]) activeGroups[dateKey] = [];
        activeGroups[dateKey].push(ticket);
      });

      const finalSections = Object.keys(activeGroups).map(date => ({
        title: date,
        data: activeGroups[date],
        isPastSection: false 
      }));

      // --- 4. AÑADIR SECCIÓN DE HISTORIAL AL FINAL ---
      if (pastTickets.length > 0) {
        finalSections.push({
          title: 'Historial',
          data: pastTickets,
          isPastSection: true
        });
      }

      setSections(finalSections);

    } catch (error) {
      console.error('Error cargando tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- RENDER DE LA TARJETA ---
  const renderTicket = ({ item, index, section }: { item: any, index: number, section: any }) => {
    // Es pasado si está en la sección del historial
    const isPast = section.isPastSection; 
    
    // Configuración dinámica del Badge (Etiqueta)
    let badgeConfig = {
      bg: 'rgba(0, 255, 136, 0.1)',
      border: 'rgba(0, 255, 136, 0.3)',
      text: '#00FF88',
      label: 'ENTRADA VÁLIDA'
    };

    if (item.used) {
      badgeConfig = { bg: 'rgba(255, 59, 48, 0.1)', border: 'rgba(255, 59, 48, 0.3)', text: '#FF3B30', label: 'TICKET VALIDADO' };
    } else if (isPast) {
      // Si está en el historial pero NO fue usado, significa que expiró/finalizó
      badgeConfig = { bg: 'rgba(255, 255, 255, 0.05)', border: 'rgba(255, 255, 255, 0.1)', text: '#888888', label: 'EVENTO FINALIZADO' };
    }

    return (
      <AnimatedEntry index={index} fromY={16} fromScale={0.98}>
      <PressableScale
        scaleTo={isPast ? 1 : 0.97}
        haptic={isPast ? 'none' : 'light'}
        onPress={() => router.push({
          pathname: "/ticket-detail",
          params: { ticketId: item.id }
        })}
        style={[styles.ticketCard, isPast && styles.ticketCardPast]}
      >
        <View style={styles.cardContent}>
          <View style={styles.leftSection}>
            <Text style={[styles.eventName, isPast && { color: '#bbb' }]} numberOfLines={1}>
              {item.events?.title || 'Evento'}
            </Text>
            
            <Text style={[styles.ticketType, isPast && { color: '#888' }]}>
               {item.ticket_tiers?.name || item.ticket_type || 'General'}
            </Text>

            <View style={styles.infoRow}>
              <Calendar size={14} color={isPast ? '#666' : COLORS.neonPink} />
              <Text style={[styles.infoText, isPast && { color: '#666' }]}>
                {formatCardDateTime(item.events?.date, item.events?.hour)}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <MapPin size={14} color={isPast ? '#666' : COLORS.neonPink} />
              <Text style={[styles.infoText, isPast && { color: '#666' }]}>{item.events?.club_name || 'Ubicación'}</Text>
            </View>

            <View style={[styles.badge, { backgroundColor: badgeConfig.bg, borderColor: badgeConfig.border }]}>
              <Text style={[styles.badgeText, { color: badgeConfig.text }]}>
                {badgeConfig.label}
              </Text>
            </View>
          </View>

          <View style={styles.rightSection}>
            <View style={styles.eventImageContainer}>
              {item.events?.image_url ? (
                <>
                  <Image
                    source={{ uri: item.events.image_url }}
                    style={styles.eventImage}
                    contentFit="cover"
                    transition={150}
                    cachePolicy="memory-disk"
                  />
                  {isPast && <View style={styles.pastImageOverlay} />}
                </>
              ) : (
                <LinearGradient
                  colors={isPast ? ['#222', '#111'] : [COLORS.neonPink, COLORS.neonPink]}
                  style={StyleSheet.absoluteFill}
                >
                  <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
                     <Calendar color={isPast ? '#444' : "white"} size={24} />
                  </View>
                </LinearGradient>
              )}
            </View>
          </View>
        </View>
      </PressableScale>
      </AnimatedEntry>
    );
  };

  const renderHeader = ({ section: { title, isPastSection } }: any) => {
    // --- ESTÉTICA DISCRETA Y LINDA PARA EL HISTORIAL ---
    if (isPastSection) {
      return (
        <View style={styles.historyDividerContainer}>
          <View style={styles.historyDividerLine} />
          <Text style={styles.historyDividerText}>HISTORIAL</Text>
          <View style={styles.historyDividerLine} />
        </View>
      );
    }

    return (
      <View style={styles.sectionHeaderContainer}>
        <Text style={styles.sectionHeaderText}>{title}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <LinearGradient
              colors={['rgba(255, 49, 216, 0.2)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.6, y: 0.5 }}
              style={StyleSheet.absoluteFill}
          />
          <LinearGradient
              colors={['transparent', 'rgba(255, 49, 216, 0.15)']}
              start={{ x: 0.4, y: 0.5 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
          />
          <LinearGradient
              colors={['transparent', 'rgba(255, 49, 216, 0.05)', 'transparent']}
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 1 }}
              locations={[0.3, 0.5, 0.7]}
              style={StyleSheet.absoluteFill}
          />
      </View>

      <Animated.View style={[{ flex: 1 }, fadeStyle]}>

        {activeTab === 'tickets' ? (
          <SectionList
            style={{ flex: 1 }}
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderTicket}
            renderSectionHeader={renderHeader}
            contentContainerStyle={[styles.list, { paddingTop: navTop + 52 }]}
            stickySectionHeadersEnabled={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.neonPink}
                colors={[COLORS.neonPink, COLORS.neonPink]}
                progressBackgroundColor="#111"
              />
            }
            ListEmptyComponent={
              loading ? (
                <View style={{ paddingHorizontal: 16, gap: 12 }}>
                  {[0, 1, 2].map(i => (
                    <View key={i} style={{ flexDirection: 'row', gap: 14, padding: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}>
                      <SkeletonBox width={56} height={64} borderRadius={12} />
                      <View style={{ flex: 1, gap: 8 }}>
                        <SkeletonBox height={14} width="70%" borderRadius={6} />
                        <SkeletonBox height={12} width="45%" borderRadius={6} />
                        <SkeletonBox height={12} width="55%" borderRadius={6} />
                      </View>
                      <SkeletonBox width={44} height={44} borderRadius={10} />
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyStateCard
                  icon={<Ghost color={COLORS.neonPink} size={40} />}
                  title="No tienes tickets disponibles"
                  subtitle="Tus próximas entradas aparecerán aquí."
                />
              )
            }
          />
        ) : (
          <FlatList
            data={consumoItems}
            keyExtractor={order => order.id}
            contentContainerStyle={[styles.list, { paddingTop: navTop + 52 }]}
            removeClippedSubviews={true}
            maxToRenderPerBatch={8}
            windowSize={5}
            initialNumToRender={6}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={consumosLoading} onRefresh={loadConsumos} tintColor={COLORS.neonPink} colors={[COLORS.neonPink]} progressBackgroundColor="#111" />
            }
            renderItem={({ item: order }) => {
              const items = order.consumption_order_items ?? [];
              const dominantStatus = getOrderStatus(items);
              const cfg = CONSUMO_STATUS[dominantStatus] ?? CONSUMO_STATUS.inactive;
              const StatusIcon = cfg.icon;
              const eventData = order.events;
              const inactive = items.filter((i: any) => i.status === 'inactive').length;
              const inQueue = items.filter((i: any) => i.status === 'queued' || i.status === 'preparing').length;
              const delivered = items.filter((i: any) => i.status === 'delivered').length;
              return (
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/(consumption)/consumption-order' as any, params: { orderId: order.id } })}
                  style={[styles.ticketCard, { borderColor: cfg.color + '30' }]}
                  activeOpacity={0.85}
                >
                  <View style={styles.cardContent}>
                    <View style={styles.leftSection}>
                      <Text style={styles.eventName} numberOfLines={1}>{eventData?.title ?? 'Evento'}</Text>
                      <Text style={{ color: COLORS.neonPink, fontSize: 12, fontWeight: '900', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                        {items.length} {items.length === 1 ? 'ítem' : 'ítems'} · ${order.total_amount?.toLocaleString('es-CL')}
                      </Text>
                      <View style={[styles.badge, { backgroundColor: cfg.color + '15', borderColor: cfg.color + '40' }]}>
                        <StatusIcon size={10} color={cfg.color} style={{ marginRight: 4 }} />
                        <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label.toUpperCase()}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        {inactive > 0 && <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '700' }}>{inactive} sin activar</Text>}
                        {inQueue > 0 && <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700' }}>{inQueue} en cola</Text>}
                        {delivered > 0 && <Text style={{ color: '#22c55e', fontSize: 11, fontWeight: '700' }}>{delivered} entregado{delivered !== 1 ? 's' : ''}</Text>}
                      </View>
                    </View>
                    <View style={[styles.rightSection, { alignItems: 'center', justifyContent: 'center' }]}>
                      <View style={[styles.eventImageContainer, { backgroundColor: cfg.color + '15', justifyContent: 'center', alignItems: 'center' }]}>
                        {eventData?.image_url
                          ? <Image source={{ uri: eventData.image_url }} style={styles.eventImage} contentFit="cover" transition={150} cachePolicy="memory-disk" />
                          : <StatusIcon size={36} color={cfg.color} />
                        }
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              !consumosLoading ? (
                <EmptyStateCard
                  icon={<Wine color={COLORS.neonPink} size={40} />}
                  title="Sin consumos por ahora"
                  subtitle="Compra bebidas desde la carta de tu evento favorito."
                />
              ) : null
            }
          />
        )}

        <NavBar title="MIS TICKETS" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} />

        {/* Tabs flotando */}
        <View style={[styles.tabRow, { top: insets.top + 82 }]}>
          <View style={{ overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(251,251,251,0.06)' }}>
            <BlurView intensity={50} tint="dark" style={{ flexDirection: 'row', height: 44, padding: 4, gap: 2 }}>
              <TouchableOpacity
                onPress={() => setActiveTab('tickets')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: activeTab === 'tickets' ? 'rgba(255,255,255,0.12)' : 'transparent' }}
                activeOpacity={0.8}
              >
                <Ticket size={14} color={activeTab === 'tickets' ? COLORS.neonPink : 'rgba(251,251,251,0.45)'} />
                <Text style={{ color: activeTab === 'tickets' ? '#FBFBFB' : 'rgba(251,251,251,0.45)', fontWeight: activeTab === 'tickets' ? '800' : '600', fontSize: 13 }}>Tickets</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab('consumos')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: activeTab === 'consumos' ? 'rgba(255,255,255,0.12)' : 'transparent' }}
                activeOpacity={0.8}
              >
                <Wine size={14} color={activeTab === 'consumos' ? COLORS.neonPink : 'rgba(251,251,251,0.45)'} />
                <Text style={{ color: activeTab === 'consumos' ? '#FBFBFB' : 'rgba(251,251,251,0.45)', fontWeight: activeTab === 'consumos' ? '800' : '600', fontSize: 13 }}>
                  Consumos{consumoItems.length > 0 ? ` (${consumoItems.length})` : ''}
                </Text>
              </TouchableOpacity>
            </BlurView>
          </View>
        </View>

      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#030303' },
  list: { paddingHorizontal: 20, paddingBottom: 40, flexGrow: 1 },
  
  // Headers normales
  sectionHeaderContainer: { marginTop: 20, marginBottom: 10, paddingLeft: 4 },
  sectionHeaderText: { color: '#ffffff', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 },
  
  // Header discreto del Historial
  historyDividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 25, opacity: 0.6 },
  historyDividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  historyDividerText: { marginHorizontal: 12, color: '#888', fontSize: 11, fontWeight: '900', letterSpacing: 2 },

  // Tarjetas
  ticketCard: { backgroundColor: COLORS.glassBg, borderRadius: 24, marginBottom: 12, borderWidth: 1, borderColor: COLORS.glassBorder, overflow: 'hidden' },
  ticketCardPast: { opacity: 0.5, borderColor: 'rgba(255,255,255,0.03)', backgroundColor: 'rgba(255,255,255,0.02)' }, // Se apaga la tarjeta
  
  cardContent: { flexDirection: 'row', padding: 20, alignItems: 'center' },
  leftSection: { flex: 1 },
  eventName: { color: '#FBFBFB', fontSize: 20, fontWeight: '900', marginBottom: 2, fontStyle: 'italic', letterSpacing: -1 },
  ticketType: { color: COLORS.neonPink, fontSize: 12, fontWeight: '900', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  infoText: { color: COLORS.textZinc, fontSize: 13, fontWeight: '500' },
  
  badge: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignSelf: 'flex-start', borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  
  rightSection: { flexDirection: 'row', alignItems: 'center' },
  eventImageContainer: { width: 130, height: 130, borderRadius: 16, overflow: 'hidden', backgroundColor: '#222' },
  eventImage: { width: '100%', height: '100%' },
  pastImageOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyIconCircle: { width: 86, height: 86, borderRadius: 43, backgroundColor: 'rgba(255, 49, 216, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255, 49, 216, 0.3)' },
  emptyTitle: { color: '#FBFBFB', fontSize: 20, fontWeight: '900', fontStyle: 'italic', marginBottom: 8, textAlign: 'center', letterSpacing: -1 },
  emptySubtitle: { color: COLORS.textZinc, fontSize: 14, textAlign: 'center', lineHeight: 22, fontWeight: '400' },

  // Tabs
  tabRow: { position: 'absolute', left: 0, right: 0, zIndex: 10, alignItems: 'center' },
});