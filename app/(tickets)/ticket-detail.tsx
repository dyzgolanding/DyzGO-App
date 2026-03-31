import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  ChevronLeft,
  MoveHorizontal,
  Share2,
  Ticket as TicketIcon,
  Users,
  X
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendPushNotification } from '../../lib/push';
import { COLORS } from '../../constants/colors';
import { supabase } from '../../lib/supabase';

const { width, height } = Dimensions.get('window');
const isSmallScreen = width < 400;

const formatDate = (dateString: string) => {
    if (!dateString) return 'PENDIENTE';
    const date = new Date(dateString);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}-${month}-${year}`;
};

// --- FUNCIÓN HELPER MEJORADA Y A PRUEBA DE ZONAS HORARIAS ---
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
            const now = new Date();
            return eventDateTime < now;
        } catch (e) {
            return false;
        }
    }
    return false;
};

export default function TicketDetailScreen() {
  const { ticketId } = useLocalSearchParams();
  const safeTicketId = Array.isArray(ticketId) ? ticketId[0] : ticketId;
  const insets = useSafeAreaInsets();
  const headerBgAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [isSent, setIsSent] = useState(false);
  
  const [friendModalVisible, setFriendModalVisible] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  const [showRateModal, setShowRateModal] = useState(false);
  const [isListed, setIsListed] = useState(false);
  
  // --- ESTADOS SEPARADOS PARA SABER EXACTAMENTE POR QUÉ SE BLOQUEA ---
  const [isFinished, setIsFinished] = useState(false);
  const [isUsed, setIsUsed] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (!loading && ticket) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
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
        filter: `id=eq.${safeTicketId}` 
      }, async (payload) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (payload.new.user_id !== user?.id) {
            setIsSent(true); 
        }
      })
      .subscribe();

    return () => { 
        supabase.removeChannel(ownershipChannel); 
    };
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

      // Verificamos si el evento finalizó y si el ticket ya se usó de forma independiente
      const eventFinished = isEventFinished(ticketData.events);
      const ticketUsed = ticketData.used === true || (ticketData.status !== 'valid' && ticketData.status !== 'active');
      
      setIsFinished(eventFinished);
      setIsUsed(ticketUsed);

      const { data: listingData } = await supabase
        .from('resale_listings')
        .select('id')
        .eq('ticket_id', safeTicketId)
        .eq('status', 'active')
        .single();

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
      Alert.alert("Transferencia Bloqueada", "El organizador no permite transferencias para este evento.");
      return;
    }

    try {
      setTransferring(true);
      const { data: { user } } = await supabase.auth.getUser();
      const secretToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); 

      const { error } = await supabase.from('ticket_transfers').insert({
        ticket_id: safeTicketId,
        sender_id: user?.id,
        token: secretToken,
        is_used: false,
        expires_at: expiresAt.toISOString()
      });

      if (error) throw error;

      const shareUrl = Linking.createURL('/claim-ticket', {
        queryParams: { token: secretToken },
      });

      await Share.share({
        url: shareUrl,
        message: `🎟️ Aquí tienes tu entrada para ${ticket.events?.title}. Reclámala antes de que expire: ${shareUrl}`,
      });

    } catch (err) {
      Alert.alert("Error", "No se pudo generar el enlace.");
      console.error(err);
    } finally { setTransferring(false); }
  };

  const openFriendSelector = async () => {
    if (ticket?.events?.is_transferable === false) {
      Alert.alert("Transferencia Bloqueada", "El organizador no permite transferencias para este evento.");
      return;
    }

    setFriendModalVisible(true);
    setLoadingFriends(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .eq('status', 'accepted'); 

      const friendIds = follows?.map(f => f.following_id) || [];

      if (friendIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('*')
            .in('id', friendIds);
          setFriends(profiles || []);
      } else {
          setFriends([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleDirectTransfer = async (friendId: string, friendName: string) => {
    Alert.alert(
      "Confirmar Transferencia",
      `¿Enviar entrada a ${friendName}? \n\nEsta acción es irreversible y la entrada desaparecerá de tu cuenta.`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Enviar ahora", 
          style: "destructive",
          onPress: async () => {
            try {
              setTransferring(true);
              setFriendModalVisible(false);

              const { error } = await supabase.rpc('transfer_ticket_direct', {
                p_ticket_id: safeTicketId,
                p_recipient_id: friendId
              });

              if (error) throw error;

              // Notificación in-app al receptor
              await supabase.from('notifications').insert({
                user_id: friendId,
                type: 'ticket_received',
                title: '¡Recibiste una entrada!',
                message: `Te enviaron una entrada para ${ticket?.events?.title}. Ya está en tu cuenta.`,
                related_id: safeTicketId,
                is_read: false,
              }).then(undefined, console.error);

              // Push al receptor
              const { data: recipient } = await supabase
                .from('profiles').select('expo_push_token').eq('id', friendId).single();
              if (recipient?.expo_push_token) {
                sendPushNotification(
                  recipient.expo_push_token,
                  '🎟️ ¡Recibiste una entrada!',
                  `Te enviaron una entrada para ${ticket?.events?.title}.`,
                  { url: '/my-tickets' }
                ).then(undefined, console.error);
              }

              setIsSent(true);

            } catch (e: any) {
              Alert.alert("Error", `Falló la transferencia: ${e.message}`);
              console.error(e);
              setTransferring(false);
            }
          }
        }
      ]
    );
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `¡Mira mi entrada para ${ticket?.events?.title}! en DyzGO.`,
      });
    } catch (error) {
      console.error('[ticket-detail]', error instanceof Error ? error.message : error);
    }
  };

  // --- CAMBIO AQUÍ: Se reemplaza la pantalla negra por el mismo fondo de la app ---
  if (loading) {
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
        <View style={[styles.fixedHeader, { top: insets.top + 8 }]}>
          <Animated.View style={[styles.pillBg, { opacity: headerBgAnim }]}>
              <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 50, overflow: 'hidden' }]} />
          </Animated.View>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <ChevronLeft color="white" size={20} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isSent) {
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
        <View style={styles.successContent}>
          <TicketIcon color={COLORS.neonPink} size={80} style={{marginBottom: 20}} />
          <Text style={styles.successTitle}>¡TICKET ENVIADO!</Text>
          <Text style={styles.successSubtitle}>
            La entrada para {ticket?.events?.title} ha sido transferida exitosamente y ya no está en tu posesión.
          </Text>
          
          <TouchableOpacity 
            style={styles.homeBtn} 
            onPress={() => router.replace('/(tabs)/home')} 
          >
            <LinearGradient 
              colors={[COLORS.neonPink, COLORS.neonPink]} 
              start={{x:0, y:0}} end={{x:1, y:0}} 
              style={styles.btnGradient}
            >
              <Text style={styles.btnText}>VOLVER AL INICIO</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- LÓGICA DE BLOQUEO DE BOTONES ---
  const isTransferBlocked = ticket?.events?.is_transferable === false;
  
  const blockReason = isFinished 
    ? 'EVENTO FINALIZADO' 
    : isUsed 
        ? 'TICKET YA USADO' 
        : isTransferBlocked 
            ? 'TRANSFERENCIA NO DISPONIBLE' 
            : null;

  const isDisabled = transferring || isListed || !!blockReason;

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
      
      {/* Pill animado — idéntico al de event-detail */}
      <View style={[styles.fixedHeader, { top: insets.top + 8 }]}>
        <Animated.View style={[styles.pillBg, { opacity: headerBgAnim }]}>
                        <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 50, overflow: 'hidden' }]} />
                      </Animated.View>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <ChevronLeft color="white" size={20} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleShare} style={styles.iconBtn}>
          <Share2 color="white" size={20} />
        </TouchableOpacity>
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 66 }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          headerBgAnim.setValue(Math.min(1, e.nativeEvent.contentOffset.y / 120));
        }}
      >
          <BlurView intensity={50} tint="systemThinMaterialDark" style={styles.glassCard}>
              <View style={styles.ticketHeader}>
                  <View style={styles.passBadge}>
                      <Text style={styles.passText}>DyzGO PASSsss</Text>
                  </View>
                  <TicketIcon color={COLORS.textZinc} size={24} />
              </View>

              <Text style={styles.eventTitle}>{ticket?.events?.title}</Text>
              
              <View style={styles.eventDetailsRow}>
                  <View>
                      <Text style={styles.detailLabel}>FECHA</Text>
                      <Text style={styles.detailValue}>{formatDate(ticket?.events?.date)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.detailLabel}>TIPO</Text>
                      <Text style={styles.detailValueMagenta}>
                          {ticket?.ticket_tiers?.name || ticket?.ticket_type || 'GENERAL'}
                      </Text>
                  </View>
              </View>

              <View style={styles.dashedSeparator} />

              <View style={styles.qrOuterContainer}>
                  <View style={styles.qrInnerContainer}>
                    <QRCode 
                        value={ticket?.qr_hash || "no-data"} 
                        size={width * (isSmallScreen ? 0.5 : 0.6)} 
                        color="black" 
                        backgroundColor="white" 
                    />
                  </View>
              </View>

              <Text style={styles.ticketCode}>{ticket?.id || 'ID NO DISPONIBLE'}</Text>
              <Text style={styles.footerTextMagenta}>MUESTRA ESTE QR EN PUERTA</Text>
          </BlurView>

          <View style={styles.actionArea}>
              
              {/* BOTÓN ENVIAR POR ENLACE */}
              <TouchableOpacity
                  style={[styles.transBtn, blockReason
                      ? { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }
                      : { backgroundColor: 'rgba(255,49,216,0.15)', borderColor: 'rgba(255,49,216,0.35)' },
                      (isListed || blockReason) && { opacity: 0.4 }
                  ]}
                  onPress={handleAppleTransfer}
                  disabled={isDisabled}
              >
                  {transferring ? (
                      <ActivityIndicator color="#FF31D8" />
                  ) : (
                      <>
                          <MoveHorizontal color={blockReason ? 'rgba(255,255,255,0.4)' : '#FF31D8'} size={20} />
                          <Text style={[styles.btnText, { color: blockReason ? 'rgba(255,255,255,0.4)' : '#FF31D8' }]}>
                              {blockReason || (isListed ? 'BLOQUEADO (EN VENTA)' : 'ENVIAR POR ENLACE')}
                          </Text>
                      </>
                  )}
              </TouchableOpacity>

              {/* BOTÓN ENVIAR A AMIGO */}
              <TouchableOpacity
                  style={[styles.friendBtn, blockReason
                      ? { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }
                      : { backgroundColor: 'rgba(91,141,239,0.15)', borderColor: 'rgba(91,141,239,0.35)' },
                      (isListed || blockReason) && { opacity: 0.4 }
                  ]}
                  onPress={openFriendSelector}
                  disabled={isDisabled}
              >
                  <Users color={blockReason ? 'rgba(255,255,255,0.4)' : '#5B8DEF'} size={20} />
                  <Text style={[styles.btnText, { color: blockReason ? 'rgba(255,255,255,0.4)' : '#5B8DEF' }]}>ENVIAR A AMIGO</Text>
              </TouchableOpacity>
          </View>
      </ScrollView>

      {/* MODAL AMIGOS */}
      <Modal
        visible={friendModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFriendModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
            <TouchableOpacity style={{flex:1}} onPress={() => setFriendModalVisible(false)} />
            
            <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>SELECCIONAR AMIGO</Text>
                        <TouchableOpacity onPress={() => setFriendModalVisible(false)} style={styles.modalCloseBtn}>
                            <X color={COLORS.textZinc} size={20} />
                        </TouchableOpacity>
                    </View>
                    {loadingFriends ? (
                        <ActivityIndicator size="large" color={COLORS.neonPink} style={{marginTop: 50}} />
                    ) : (
                        <FlatList 
                            data={friends}
                            keyExtractor={(item) => item.id}
                            style={{marginTop: 10}}
                            ListEmptyComponent={
                                <Text style={styles.emptyText}>No tienes amigos confirmados.</Text>
                            }
                            renderItem={({item}) => (
                                <TouchableOpacity 
                                    style={styles.glassFriendRow} 
                                    onPress={() => handleDirectTransfer(item.id, item.full_name)}
                                >
                                    <Image 
                                        source={item.avatar_url ? {uri: item.avatar_url} : {uri: 'https://via.placeholder.com/50'}} 
                                        style={styles.avatar}
                                    />
                                    <Text style={styles.friendName}>{item.full_name}</Text>
                                    <View style={styles.sendIconBox}>
                                        <ArrowLeft color="white" size={16} style={{transform: [{rotate: '180deg'}]}} />
                                    </View>
                                </TouchableOpacity>
                            )}
                        />
                    )}
            </View>
        </View>
      </Modal>

      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030303' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  // Pill animado — idéntico al de event-detail
  fixedHeader: { position: 'absolute', left: 16, right: 16, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 50, paddingHorizontal: 6 },
  pillBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 50, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  iconBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  // paddingTop se aplica inline con insets.top + 66
  scrollContent: { paddingBottom: 40, flexGrow: 1, justifyContent: isSmallScreen ? 'center' : 'flex-start' },
  glassCard: { marginHorizontal: isSmallScreen ? 25 : 30, borderRadius: 35, padding: isSmallScreen ? 25 : 35, alignItems: 'center', marginTop: 0, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, borderWidth: 1, borderColor: 'rgba(251, 251, 251, 0.05)', overflow: 'hidden' },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, width: '100%' },
  passBadge: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)' },
  passText: { color: COLORS.textZinc, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  eventTitle: { fontSize: isSmallScreen ? 24 : 28, fontWeight: '900', color: '#FBFBFB', textAlign: 'center', fontStyle: 'italic', marginBottom: 25, letterSpacing: -1 },
  eventDetailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, width: '100%' },
  detailLabel: { color: COLORS.textZinc, fontSize: 12, fontWeight: '500', marginBottom: 5, letterSpacing: 1 },
  detailValue: { color: '#FBFBFB', fontSize: 16, fontWeight: '700', letterSpacing: -1 },
  detailValueMagenta: { color: COLORS.neonPink, fontSize: 16, fontWeight: '700', textTransform: 'uppercase' },
  dashedSeparator: { height: 1, width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.2)', marginBottom: 25, borderStyle: 'dashed', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)' },
  qrOuterContainer: { alignItems: 'center', marginBottom: 20 },
  qrInnerContainer: { padding: 15, backgroundColor: 'white', borderRadius: 25 },
  ticketCode: { color: COLORS.textZinc, fontSize: 12, fontWeight: '500', textAlign: 'center', marginBottom: 5, letterSpacing: 1, marginTop: 5 },
  footerTextMagenta: { color: COLORS.neonPink, fontSize: 12, fontWeight: '700', textAlign: 'center', letterSpacing: 1, marginTop: 10 },
  actionArea: { padding: isSmallScreen ? 25 : 40, alignItems: 'center', gap: isSmallScreen ? 10 : 15 },
  transBtn: { width: '100%', height: isSmallScreen ? 50 : 58, borderRadius: 20, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  friendBtn: { width: '100%', height: isSmallScreen ? 50 : 58, borderRadius: 20, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  btnGradient: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  btnText: { color: '#FBFBFB', fontWeight: '900', fontSize: isSmallScreen ? 14 : 16 },
  successContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  successTitle: { color: '#FBFBFB', fontSize: 28, fontWeight: '900', marginTop: 25, letterSpacing: -1, fontStyle: 'italic' },
  successSubtitle: { color: COLORS.textZinc, fontSize: 16, textAlign: 'center', marginTop: 15, marginBottom: 40, lineHeight: 22 },
  homeBtn: { width: '100%', height: 60, borderRadius: 20, overflow: 'hidden' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { height: height * 0.6, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', backgroundColor: COLORS.modalBg, borderTopWidth: 1, borderColor: COLORS.glassBorder, padding: 25 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.07)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { color: '#FBFBFB', fontSize: 16, fontWeight: '900', letterSpacing: -1, fontStyle: 'italic' },
  emptyText: { color: COLORS.textZinc, textAlign: 'center', marginTop: 30 },
  glassFriendRow: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: COLORS.glassBg, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.glassBorder },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 15 },
  friendName: { color: '#FBFBFB', fontWeight: '800', fontSize: 15, flex: 1 },
  sendIconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.neonPink, justifyContent: 'center', alignItems: 'center' },
});