import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useNavRouter as useRouter } from '../hooks/useNavRouter';
import { ArrowLeft, Calendar, Check, ChevronRight, Clock, X, AlertCircle, UtensilsCrossed } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Dimensions, Platform, RefreshControl, ScrollView,
  StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from '../components/BlurSurface';
import { supabase } from '../lib/supabase';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

const { width: windowWidth } = Dimensions.get('window');
const width = Platform.OS === 'web' ? Math.min(windowWidth, 800) : windowWidth;
const ACCENT = '#FF6B35';

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DAY_NAMES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

interface Reservation {
  id: string;
  date: string;
  arrival_time: string | null;
  end_time: string | null;
  party_size: number;
  status: string;
  confirmation_code: string;
  notes: string | null;
  guest_name: string;
  reunion_type: string | null;
  venue_zones: { name: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:   { label: 'Pendiente',   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  icon: <AlertCircle size={13} color="#F59E0B" /> },
  confirmed: { label: 'Confirmada',  color: '#22C55E', bg: 'rgba(34,197,94,0.12)',   icon: <Check size={13} color="#22C55E" /> },
  cancelled: { label: 'Cancelada',   color: '#EF4444', bg: 'rgba(239,68,68,0.12)',   icon: <X size={13} color="#EF4444" /> },
  seated:    { label: 'En local',    color: ACCENT,    bg: 'rgba(255,107,53,0.12)',  icon: <UtensilsCrossed size={13} color={ACCENT} /> },
  completed: { label: 'Completada',  color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', icon: <Check size={13} color="#8B5CF6" /> },
  no_show:   { label: 'No se presentó', color: '#6B7280', bg: 'rgba(107,114,128,0.1)', icon: <X size={13} color="#6B7280" /> },
};

function formatDate(d: string) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  const obj = new Date(y, m-1, day);
  return `${DAY_NAMES[obj.getDay()]} ${day} ${MONTH_NAMES[m-1]} ${y}`;
}

export default function MyReservationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const [isScreenFocused, setIsScreenFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setIsScreenFocused(true);
    return () => setIsScreenFocused(false);
  }, []));

  useFocusEffect(useCallback(() => {
    fetchReservations();
  }, []));

  const fetchReservations = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('table_reservations')
        .select('*, venue_zones(name)')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      setReservations((data as Reservation[]) ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCancel = async (id: string) => {
    setCancelling(id);
    try {
      await supabase.from('table_reservations').update({ status: 'cancelled' }).eq('id', id);
      setReservations(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' } : r));
    } finally {
      setCancelling(null);
    }
  };

  const upcoming = reservations.filter(r => !['cancelled','completed','no_show'].includes(r.status));
  const past = reservations.filter(r => ['cancelled','completed','no_show'].includes(r.status));

  return (
    <View style={[styles.container, Platform.OS === 'web' && !isScreenFocused && { opacity: 0 }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={['rgba(255,107,53,0.12)','transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </View>

      {/* Header */}
      <Animated.View entering={FadeInDown.duration(300)} style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color="#FBFBFB" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Mis Reservas</Text>
          <Text style={styles.headerSub}>Club Gordos</Text>
        </View>
      </Animated.View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchReservations(true); }} tintColor={ACCENT} />
        }
      >
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <View key={i} style={[styles.skeleton, { marginBottom: 12 }]} />
          ))
        ) : reservations.length === 0 ? (
          <Animated.View entering={FadeInUp.delay(100).duration(350)} style={styles.emptyBox}>
            <UtensilsCrossed size={40} color="rgba(255,107,53,0.4)" />
            <Text style={styles.emptyTitle}>Sin reservas aún</Text>
            <Text style={styles.emptySub}>Reserva una mesa en Club Gordos y aparecerá aquí.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/reserve' as any)}>
              <LinearGradient colors={[ACCENT, '#e8522a']} style={styles.emptyBtnGrad}>
                <Text style={styles.emptyBtnText}>Reservar Mesa</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <>
            {upcoming.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Próximas</Text>
                {upcoming.map((r, i) => (
                  <ReservationCard
                    key={r.id}
                    reservation={r}
                    index={i}
                    onCancel={r.status === 'pending' ? () => handleCancel(r.id) : undefined}
                    cancelling={cancelling === r.id}
                  />
                ))}
              </>
            )}
            {past.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Historial</Text>
                {past.map((r, i) => (
                  <ReservationCard key={r.id} reservation={r} index={i} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* FAB */}
      {!loading && (
        <Animated.View entering={FadeInDown.delay(200)} style={[styles.fab, { bottom: insets.bottom + 24 }]}>
          <TouchableOpacity onPress={() => router.push('/reserve' as any)} activeOpacity={0.88}>
            <LinearGradient colors={[ACCENT, '#e8522a']} style={styles.fabGrad}>
              <UtensilsCrossed size={18} color="#fff" />
              <Text style={styles.fabText}>Nueva Reserva</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

function ReservationCard({ reservation: r, index, onCancel, cancelling }: {
  reservation: Reservation;
  index: number;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
  return (
    <Animated.View entering={FadeInUp.delay(index * 60).duration(300)}>
      <View style={styles.card}>
        {/* Top row: code + status */}
        <View style={styles.cardTop}>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>Código</Text>
            <Text style={styles.codeVal}>{r.confirmation_code}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            {cfg.icon}
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.cardMeta}>
          <MetaRow icon={<Calendar size={13} color={ACCENT} />} text={formatDate(r.date)} />
          {(r.arrival_time || r.end_time) && (
            <MetaRow icon={<Clock size={13} color={ACCENT} />} text={`${r.arrival_time ?? ''} → ${r.end_time ?? ''}`} />
          )}
          <MetaRow
            icon={<UtensilsCrossed size={13} color={ACCENT} />}
            text={`${r.venue_zones?.name ?? '—'} · ${r.party_size} personas${r.reunion_type ? ` · ${r.reunion_type}` : ''}`}
          />
        </View>

        {r.notes ? (
          <Text style={styles.notes} numberOfLines={2}>"{r.notes}"</Text>
        ) : null}

        {onCancel && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            disabled={cancelling}
          >
            <X size={13} color="#EF4444" />
            <Text style={styles.cancelText}>{cancelling ? 'Cancelando...' : 'Cancelar reserva'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

function MetaRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      {icon}
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030303' },
  header: { paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FBFBFB', fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  headerSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 },
  card: { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 20, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  codeBox: { gap: 2 },
  codeLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  codeVal: { color: '#FF6B35', fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardMeta: { gap: 0 },
  metaText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '500' },
  notes: { color: 'rgba(255,255,255,0.35)', fontSize: 12, fontStyle: 'italic', marginTop: 10, lineHeight: 18 },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  cancelText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  skeleton: { height: 130, borderRadius: 20, backgroundColor: '#111' },
  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { color: '#FBFBFB', fontSize: 20, fontWeight: '900', marginTop: 8 },
  emptySub: { color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },
  emptyBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 16 },
  emptyBtnGrad: { paddingHorizontal: 28, paddingVertical: 14 },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  fab: { position: 'absolute', left: 20, right: 20 },
  fabGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, borderRadius: 18 },
  fabText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
