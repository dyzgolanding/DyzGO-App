import { BlurView } from '../../components/BlurSurface';
import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import ReAnimated, { FadeInUp } from 'react-native-reanimated';
import { SkeletonBox } from '../../components/SkeletonBox';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import {
  ArrowRight,
  ChevronLeft,
  MoveHorizontal,
  RefreshCw,
  Share2,
  Ticket as TicketIcon,
  Users,
  Wallet,
  X,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendPushNotification } from '../../lib/push';
import { COLORS } from '../../constants/colors';
import { supabase } from '../../lib/supabase';

const { width, height } = Dimensions.get('window');
const isSmallScreen = width < 400;

// Card dimensions
const CARD_MARGIN = 22;
const CARD_WIDTH = width - CARD_MARGIN * 2;
const CARD_HEIGHT = CARD_WIDTH;          // front face: square
const CARD_HEIGHT_BACK = CARD_WIDTH * 1.3; // back face: taller for QR

const formatDate = (dateString: string) => {
  if (!dateString) return 'PENDIENTE';
  const date = new Date(dateString);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
};

// Formato “Sáb, 26 de abr” — igual que en el resto de la app
const formatDateShort = (dateString: string) => {
  if (!dateString) return 'PENDIENTE';
  try {
    const [year, month, day] = dateString.split('T')[0].split('-');
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${dias[d.getDay()]}, ${parseInt(day, 10)} de ${meses[d.getMonth()]}`;
  } catch { return dateString; }
};

const isEventFinished = (evt: any) => {
  if (!evt) return false;
  if (evt.is_active === false) return true;
  if (evt.status === 'finished' || evt.status === 'inactive' || evt.status === 'ended') return true;
  const dateStr = evt.end_date || evt.date;
  const timeStr = evt.end_time || evt.hour || '05:00';
  if (dateStr && timeStr) {
    try {
      const [year, month, day] = dateStr.split('-');
      const [hour, minute] = timeStr.split(':');
      const eventDateTime = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
      return eventDateTime < new Date();
    } catch { return false; }
  }
  return false;
};

// ── Notch divider — only the dashed line; circles are rendered outside the card ──
function NotchDivider() {
  return (
    <View style={notchStyles.wrapper}>
      <View style={notchStyles.line} />
    </View>
  );
}
const notchStyles = StyleSheet.create({
  wrapper: { marginHorizontal: 18 },
  line: { height: 1, borderStyle: 'dashed', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
});

// ── App background (original pink magenta) ──
function AppBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={['rgba(255,49,216,0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['transparent', 'rgba(255,49,216,0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['transparent', 'rgba(255,49,216,0.05)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

export default function TicketDetailScreen() {
  const { ticketId } = useLocalSearchParams();
  const safeTicketId = Array.isArray(ticketId) ? ticketId[0] : ticketId;
  const insets = useSafeAreaInsets();
  const headerBgAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Flip animation state ──
  const flipAnim = useRef(new Animated.Value(0)).current;
  const cardHeightAnim = useRef(new Animated.Value(CARD_HEIGHT)).current;
  const [isFlipped, setIsFlipped] = useState(false);

  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const [friendModalVisible, setFriendModalVisible] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  const [isListed, setIsListed] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isUsed, setIsUsed] = useState(false);

  const router = useRouter();

  // ── Flip interpolations ──
  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const frontOpacity = flipAnim.interpolate({ inputRange: [0, 0.5, 0.5, 1], outputRange: [1, 1, 0, 0] });
  const backOpacity = flipAnim.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [0, 0, 1, 1] });

  const handleFlip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const toValue = isFlipped ? 0 : 1;
    const targetHeight = isFlipped ? CARD_HEIGHT : CARD_HEIGHT_BACK;
    Animated.parallel([
      Animated.spring(flipAnim, {
        toValue,
        friction: 7,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.spring(cardHeightAnim, {
        toValue: targetHeight,
        friction: 8,
        tension: 50,
        useNativeDriver: false, // height cannot use native driver
      }),
    ]).start();
    setIsFlipped(!isFlipped);
  };

  useEffect(() => {
    if (!loading && ticket) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [loading, ticket]);

  useEffect(() => {
    if (!safeTicketId) return;
    fetchTicketAndListingStatus();

    const ownershipChannel = supabase
      .channel(`ownership_${safeTicketId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'tickets',
        filter: `id=eq.${safeTicketId}`,
      }, async (payload) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (payload.new.user_id !== user?.id) setIsSent(true);
      })
      .subscribe();

    return () => { supabase.removeChannel(ownershipChannel); };
  }, [safeTicketId]);

  const fetchTicketAndListingStatus = async () => {
    try {
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select('*, events(*), ticket_tiers(name, price)')
        .eq('id', safeTicketId)
        .single();

      if (ticketError) throw ticketError;
      setTicket(ticketData);

      setIsFinished(isEventFinished(ticketData.events));
      setIsUsed(ticketData.used === true || (ticketData.status !== 'valid' && ticketData.status !== 'active'));

      const { data: listingData } = await supabase
        .from('resale_listings').select('id')
        .eq('ticket_id', safeTicketId).eq('status', 'active').single();
      setIsListed(!!listingData);
    } catch (err) {
      console.error(err);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleAppleTransfer = async () => {
    if (ticket?.events?.is_transferable === false) {
      Alert.alert('Transferencia Bloqueada', 'El organizador no permite transferencias para este evento.');
      return;
    }
    try {
      setTransferring(true);
      const { data: { user } } = await supabase.auth.getUser();
      const secretToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const { error } = await supabase.from('ticket_transfers').insert({
        ticket_id: safeTicketId, sender_id: user?.id,
        token: secretToken, is_used: false, expires_at: expiresAt.toISOString(),
      });
      if (error) throw error;

      const shareUrl = Linking.createURL('/claim-ticket', { queryParams: { token: secretToken } });
      await Share.share({
        url: shareUrl,
        message: `🎟️ Aquí tienes tu entrada para ${ticket.events?.title}. Reclámala antes de que expire: ${shareUrl}`,
      });
    } catch (err) {
      Alert.alert('Error', 'No se pudo generar el enlace.');
      console.error(err);
    } finally { setTransferring(false); }
  };

  const openFriendSelector = async () => {
    if (ticket?.events?.is_transferable === false) {
      Alert.alert('Transferencia Bloqueada', 'El organizador no permite transferencias para este evento.');
      return;
    }
    setFriendModalVisible(true);
    setLoadingFriends(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', user.id).eq('status', 'accepted');
      const friendIds = follows?.map(f => f.following_id) || [];
      if (friendIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', friendIds);
        setFriends(profiles || []);
      } else { setFriends([]); }
    } catch (e) { console.error(e); }
    finally { setLoadingFriends(false); }
  };

  const handleDirectTransfer = async (friendId: string, friendName: string) => {
    Alert.alert(
      'Confirmar Transferencia',
      `¿Enviar entrada a ${friendName}? \n\nEsta acción es irreversible y la entrada desaparecerá de tu cuenta.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar ahora',
          style: 'destructive',
          onPress: async () => {
            try {
              setTransferring(true);
              setFriendModalVisible(false);
              const { error } = await supabase.rpc('transfer_ticket_direct', { p_ticket_id: safeTicketId, p_recipient_id: friendId });
              if (error) throw error;

              await supabase.from('notifications').insert({
                user_id: friendId, type: 'ticket_received',
                title: '¡Recibiste una entrada!',
                message: `Te enviaron una entrada para ${ticket?.events?.title}. Ya está en tu cuenta.`,
                related_id: safeTicketId, is_read: false,
              }).then(undefined, console.error);

              const { data: recipient } = await supabase.from('profiles').select('expo_push_token').eq('id', friendId).single();
              if (recipient?.expo_push_token) {
                sendPushNotification(recipient.expo_push_token, '🎟️ ¡Recibiste una entrada!', `Te enviaron una entrada para ${ticket?.events?.title}.`, { url: '/my-tickets' }).then(undefined, console.error);
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

  const handleShare = async () => {
    try { await Share.share({ message: `¡Mira mi entrada para ${ticket?.events?.title}! en DyzGO.` }); }
    catch (error) { console.error('[ticket-detail]', error instanceof Error ? error.message : error); }
  };

  const handleAddToWallet = async () => {
    try {
      setWalletLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Error', 'No estás autenticado.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('generate-wallet-pass', {
        body: { ticket_id: safeTicketId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('No se recibió URL del pass.');

      await Linking.openURL(data.url);
    } catch (err: any) {
      console.error('[wallet]', err);
      Alert.alert(
        'Error al generar el pass',
        err?.message ?? 'Algo salió mal. Intentá de nuevo.',
      );
    } finally {
      setWalletLoading(false);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <View style={styles.container}>
        <AppBackground />
        <View style={[styles.fixedHeader, { top: insets.top + 8 }]}>
          <Animated.View style={[styles.pillBg, { opacity: headerBgAnim }]}>
            <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 50, overflow: 'hidden' }]} />
          </Animated.View>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <ChevronLeft color="white" size={20} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, padding: 20, paddingTop: insets.top + 80 }}>
          <SkeletonBox height={CARD_HEIGHT} borderRadius={28} style={{ marginBottom: 16 }} />
          <SkeletonBox height={56} borderRadius={18} style={{ marginBottom: 10 }} />
          <SkeletonBox height={56} borderRadius={18} />
        </View>
      </View>
    );
  }

  // ── Sent ──
  if (isSent) {
    return (
      <View style={styles.container}>
        <AppBackground />
        <View style={styles.successContent}>
          <ReAnimated.View entering={FadeInUp.duration(400).springify()} style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <CheckCircle2 color="#FF31D8" size={40} strokeWidth={1.5} />
            </View>
            <Text style={styles.successTitle}>¡TICKET ENVIADO!</Text>
            <Text style={styles.successSubtitle}>
              La entrada para{' '}
              <Text style={{ fontWeight: '900', color: COLORS.textWhite }}>{ticket?.events?.title}</Text>
              {' '}ha sido transferida exitosamente.
            </Text>
          </ReAnimated.View>
          <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/(tabs)/home')} activeOpacity={0.85}>
            <Text style={styles.homeBtnText}>VOLVER AL INICIO</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Block logic ──
  const isTransferBlocked = ticket?.events?.is_transferable === false;
  const blockReason = isFinished ? 'EVENTO FINALIZADO' : isUsed ? 'TICKET YA USADO' : isTransferBlocked ? 'TRANSFERENCIA NO DISPONIBLE' : null;
  const isDisabled = transferring || isListed || !!blockReason;

  const statusConfig = isFinished
    ? { label: 'FINALIZADO', color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.08)', Icon: Clock }
    : isUsed
      ? { label: 'USADO', color: '#FF4444', bg: 'rgba(255,68,68,0.15)', Icon: XCircle }
      : { label: 'VÁLIDO', color: '#00E87A', bg: 'rgba(0,232,122,0.15)', Icon: CheckCircle2 };

  const eventImageUri = ticket?.events?.image_url || ticket?.events?.cover_image || null;
  const tierName = ticket?.ticket_tiers?.name || ticket?.ticket_type || 'GENERAL';

  return (
    <ReAnimated.View entering={FadeInUp.duration(300).springify()} style={styles.container}>
      <AppBackground />

      {/* Pill header */}
      <View style={[styles.fixedHeader, { top: insets.top + 8 }]}>
        <Animated.View style={[styles.pillBg, { opacity: headerBgAnim }]}>
          <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 50, overflow: 'hidden' }]} />
        </Animated.View>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <ChevronLeft color="white" size={20} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleShare(); }} style={styles.iconBtn}>
          <Share2 color="white" size={20} />
        </TouchableOpacity>
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 72 }]}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => { headerBgAnim.setValue(Math.min(1, e.nativeEvent.contentOffset.y / 120)); }}
        >

          {/* ══ FLIP CARD ══ */}
          <ReAnimated.View entering={FadeInUp.duration(350).springify()}>
            {/* Outer wrapper animates height so the card grows when flipped to back */}
            <Animated.View style={[styles.flipWrapper, { height: cardHeightAnim }]}>
              <TouchableOpacity
                activeOpacity={0.97}
                onPress={handleFlip}
                style={styles.flipContainer}
              >
                {/* ── FRONT FACE: event photo ── */}
                <Animated.View
                  style={[
                    styles.face,
                    styles.faceFront,
                    {
                      height: CARD_HEIGHT,
                      opacity: frontOpacity,
                      transform: [{ perspective: 1400 }, { rotateY: frontRotate }],
                    },
                  ]}
                >
                  {/* Event image */}
                  {eventImageUri ? (
                    <Image source={{ uri: eventImageUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
                  ) : (
                    <LinearGradient colors={['#3a0d6e', '#1a0d40', '#0a0820']} style={StyleSheet.absoluteFill} />
                  )}

                  {/* Dark overlay */}
                  <LinearGradient
                    colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />

                  {/* Status chip */}
                  <View style={styles.frontStatusChip}>
                    <BlurView intensity={55} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 10, overflow: 'hidden' }]} />
                    <View style={[StyleSheet.absoluteFill, { borderRadius: 10, backgroundColor: statusConfig.bg }]} />
                    <statusConfig.Icon color={statusConfig.color} size={12} strokeWidth={2.5} />
                    <Text style={[styles.frontStatusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
                  </View>

                  {/* Bottom info */}
                  <View style={styles.frontBottom}>
                    <Text style={styles.frontTitle} numberOfLines={2}>{ticket?.events?.title}</Text>
                    <Text style={styles.frontDate}>{formatDate(ticket?.events?.date)}</Text>

                    {/* Tap hint */}
                    <View style={styles.tapHintRow}>
                      <BlurView intensity={60} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 20, overflow: 'hidden' }]} />
                      <View style={[StyleSheet.absoluteFill, { borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }]} />
                      <RefreshCw color="rgba(255,255,255,0.75)" size={14} />
                      <Text style={styles.tapHintText}>Toca para ver tu entrada</Text>
                    </View>
                  </View>
                </Animated.View>

                {/* ── BACK FACE: QR + details ── */}
                <Animated.View
                  style={[
                    styles.face,
                    styles.faceBack,
                    {
                      height: CARD_HEIGHT_BACK,
                      opacity: backOpacity,
                      transform: [{ perspective: 1400 }, { rotateY: backRotate }],
                    },
                  ]}
                >

                  {/* Top strip */}
                  <View style={styles.backTopStrip}>
                    <Text style={styles.backTitle} numberOfLines={1}>{ticket?.events?.title}</Text>
                  </View>

                  {/* Info grid: Fecha + Hora en la misma fila, Tipo abajo */}
                  <View style={styles.backInfoGrid}>
                    <View style={styles.backInfoItem}>
                      <Text style={styles.backInfoLabel}>FECHA</Text>
                      <Text style={styles.backInfoValue}>{formatDateShort(ticket?.events?.date)}</Text>
                    </View>
                    <View style={[styles.backInfoItem, { alignItems: 'flex-end' }]}>
                      <Text style={styles.backInfoLabel}>HORA</Text>
                      <Text style={styles.backInfoValue}>
                        {ticket?.events?.hour ? ticket.events.hour.slice(0, 5) : '—'}
                        {ticket?.events?.end_time ? ` – ${ticket.events.end_time.slice(0, 5)}` : ''}
                      </Text>
                    </View>
                  </View>
                  {/* Fila extra: Tipo */}
                  <View style={styles.backTipoRow}>
                    <Text style={[styles.backInfoLabel, { textAlign: 'center' }]}>TIPO</Text>
                    <Text style={[styles.backInfoValue, { color: '#FF31D8', marginTop: 2, textAlign: 'center' }]} numberOfLines={1}>{tierName.toUpperCase()}</Text>
                  </View>


                  {/* QR area — larger and centered */}
                  <View style={styles.backQrArea}>
                    <View style={styles.qrInnerContainer}>
                      <QRCode
                        value={ticket?.qr_hash || 'no-data'}
                        size={CARD_WIDTH * 0.58}
                        color="black"
                        backgroundColor="white"
                      />
                    </View>
                    <Text style={styles.ticketCode}>{ticket?.id || 'ID NO DISPONIBLE'}</Text>
                    <Text style={styles.scanHint}>MUESTRA ESTE QR EN PUERTA</Text>
                  </View>

                  {/* Flip back hint */}
                  <TouchableOpacity style={styles.flipBackHint} onPress={handleFlip}>
                    <RefreshCw color="rgba(255,255,255,0.3)" size={12} />
                    <Text style={styles.flipBackHintText}>Ver portada</Text>
                  </TouchableOpacity>
                </Animated.View>

              </TouchableOpacity>
            </Animated.View>
          </ReAnimated.View>

          {/* ── ACTION BUTTONS ── */}
          <ReAnimated.View entering={FadeInUp.duration(350).delay(100).springify()}>
            <View style={styles.actionArea}>

              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={[styles.actionBtn, isDisabled && { opacity: 0.38 }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleAppleTransfer(); }}
                  disabled={isDisabled}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={blockReason
                      ? ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.04)']
                      : ['rgba(255,49,216,0.18)', 'rgba(180,30,160,0.10)']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={[styles.actionBtnInner, { borderColor: blockReason ? 'rgba(255,255,255,0.08)' : 'rgba(255,49,216,0.4)' }]}
                  >
                    {transferring ? (
                      <ActivityIndicator color="#FF31D8" size="small" />
                    ) : (
                      <>
                        <MoveHorizontal color={blockReason ? 'rgba(255,255,255,0.3)' : '#FF31D8'} size={18} />
                        <Text style={[styles.actionBtnText, { color: blockReason ? 'rgba(255,255,255,0.3)' : '#FF31D8' }]}>
                          {blockReason || (isListed ? 'BLOQUEADO (EN VENTA)' : 'TRANSFERIR POR APROXIMACIÓN')}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.actionBtn, isDisabled && { opacity: 0.38 }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openFriendSelector(); }}
                disabled={isDisabled}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={blockReason
                    ? ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.04)']
                    : ['rgba(91,141,239,0.18)', 'rgba(60,100,220,0.08)']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={[styles.actionBtnInner, { borderColor: blockReason ? 'rgba(255,255,255,0.08)' : 'rgba(91,141,239,0.4)' }]}
                >
                  <Users color={blockReason ? 'rgba(255,255,255,0.3)' : '#5B8DEF'} size={18} />
                  <Text style={[styles.actionBtnText, { color: blockReason ? 'rgba(255,255,255,0.3)' : '#5B8DEF' }]}>
                    TRANSFERIR A AMIGO
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* ── ADD TO APPLE WALLET (iOS only) ── */}
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={[styles.actionBtn, walletLoading && { opacity: 0.55 }]}
                  onPress={handleAddToWallet}
                  disabled={walletLoading}
                  activeOpacity={0.8}
                >
                  <View style={[styles.actionBtnInner, { backgroundColor: '#000000', borderColor: 'rgba(255,255,255,0.5)' }]}>
                    {walletLoading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <FontAwesome name="apple" size={20} color="#FFFFFF" />
                        <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>
                          AGREGAR A APPLE WALLET
                        </Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              )}

            </View>
          </ReAnimated.View>
        </ScrollView>

        {/* ── MODAL AMIGOS ── */}
        <Modal visible={friendModalVisible} animationType="slide" transparent={true} onRequestClose={() => setFriendModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setFriendModalVisible(false)} />
            <BlurView intensity={60} tint="dark" style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>SELECCIONAR AMIGO</Text>
                <TouchableOpacity onPress={() => setFriendModalVisible(false)} style={styles.modalCloseBtn}>
                  <X color={COLORS.textZinc} size={18} />
                </TouchableOpacity>
              </View>
              {loadingFriends ? (
                <ActivityIndicator size="large" color={COLORS.neonPink} style={{ marginTop: 50 }} />
              ) : (
                <FlatList
                  data={friends}
                  keyExtractor={(item) => item.id}
                  style={{ marginTop: 10 }}
                  removeClippedSubviews={true} maxToRenderPerBatch={8} windowSize={5} initialNumToRender={6}
                  showsVerticalScrollIndicator={false}
                  ListEmptyComponent={<Text style={styles.emptyText}>No tienes amigos confirmados.</Text>}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.glassFriendRow} onPress={() => handleDirectTransfer(item.id, item.full_name)} activeOpacity={0.75}>
                      <Image source={item.avatar_url ? { uri: item.avatar_url } : { uri: 'https://via.placeholder.com/50' }} style={styles.avatar} contentFit="cover" transition={150} cachePolicy="memory-disk" />
                      <Text style={styles.friendName}>{item.full_name}</Text>
                      <View style={styles.sendIconBox}>
                        <ArrowRight color="white" size={15} />
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )}
            </BlurView>
          </View>
        </Modal>
      </Animated.View>
    </ReAnimated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#030303' },

  // ── Header pill ──
  fixedHeader: { position: 'absolute', left: 16, right: 16, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 50, paddingHorizontal: 6 },
  pillBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 50, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  iconBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },

  scrollContent: { paddingBottom: 48, flexGrow: 1, justifyContent: 'center' },

  // ── Flip card wrapper ──
  flipWrapper: {
    width: CARD_WIDTH,
    marginHorizontal: CARD_MARGIN,
    marginBottom: 4,
    overflow: 'visible',
  },
  flipContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT_BACK, // tall enough for both faces
  },

  // ── Both faces share these ──
  face: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 28,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
  },

  // ── FRONT face ──
  faceFront: {},
  frontStatusChip: {
    position: 'absolute', top: 16, left: 16,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  frontStatusText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  frontBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 22, paddingBottom: 20,
  },
  frontTitle: {
    fontSize: isSmallScreen ? 24 : 28,
    fontWeight: '900',
    color: '#FBFBFB',
    letterSpacing: -0.5,
    lineHeight: isSmallScreen ? 28 : 33,
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  frontDate: {
    fontSize: 13, fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.5, marginBottom: 16,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tapHintRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  tapHintText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },

  // ── BACK face ──
  faceBack: {
    backgroundColor: COLORS.glassBg,
  },
  backTopStrip: {
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
  },
  backBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  backBrandText: { color: 'rgba(255,49,216,0.5)', fontSize: 10, fontWeight: '700', letterSpacing: 3 },
  backTitle: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '900', letterSpacing: -0.3 },
  backInfoGrid: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 18, paddingVertical: 10, gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
  },
  backInfoItem: { flex: 1 },
  backTipoRow: {
    paddingHorizontal: 18, paddingBottom: 10, paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
    alignItems: 'center',
  },
  backInfoLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 3 },
  backInfoValue: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '800' },
  backQrArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  qrInnerContainer: { padding: 11, backgroundColor: 'white', borderRadius: 16, marginBottom: 10 },
  ticketCode: { color: 'rgba(255,255,255,0.22)', fontSize: 9, fontWeight: '600', letterSpacing: 1, marginBottom: 5 },
  scanHint: { color: '#FF31D8', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  flipBackHint: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'center', paddingBottom: 10,
  },
  flipBackHintText: { color: 'rgba(255,255,255,0.25)', fontSize: 11, fontWeight: '500' },

  // ── Action buttons ──
  actionArea: { paddingHorizontal: CARD_MARGIN, paddingTop: 16, gap: 12 },
  actionBtn: { width: '100%', borderRadius: 18, overflow: 'hidden' },
  actionBtnInner: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
    height: isSmallScreen ? 52 : 58, borderRadius: 18, borderWidth: 1, paddingHorizontal: 20,
  },
  actionBtnText: { fontWeight: '800', fontSize: isSmallScreen ? 14 : 15, letterSpacing: 0.5 },

  // ── Success ──
  successContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, gap: 20 },
  successCard: {
    backgroundColor: COLORS.glassBg, borderRadius: 24,
    borderWidth: 1, borderColor: COLORS.glassBorder, padding: 28,
    alignItems: 'center', width: '100%',
  },
  successIconCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,49,216,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,49,216,0.3)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 18,
  },
  successTitle: { color: '#FBFBFB', fontSize: 26, fontWeight: '900', letterSpacing: -1, textAlign: 'center', marginBottom: 10 },
  successSubtitle: { color: COLORS.textZinc, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  homeBtn: {
    width: '100%', height: 58, borderRadius: 20,
    backgroundColor: 'rgba(255,49,216,0.15)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  homeBtnText: { color: '#FF31D8', fontWeight: '900', fontSize: 15 },

  // ── Modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { height: height * 0.6, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 24 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalCloseBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.07)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { color: '#FBFBFB', fontSize: 15, fontWeight: '900', letterSpacing: -0.5 },
  emptyText: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 30, fontSize: 14 },
  glassFriendRow: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 18, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  avatar: { width: 42, height: 42, borderRadius: 21, marginRight: 14 },
  friendName: { color: '#FBFBFB', fontWeight: '700', fontSize: 15, flex: 1 },
  sendIconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.neonPink, justifyContent: 'center', alignItems: 'center' },

});