import { LinearGradient } from 'expo-linear-gradient';
import { useNavRouter as useRouter } from '../hooks/useNavRouter';
import {
    ArrowRight,
    BellRing,
    Calendar,
    Check,
    CheckCircle2,
    Clock,
    DollarSign,
    MoveHorizontal,
    Star,
    Ticket,
    Trash2,
    Trophy,
    UserPlus,
    Users,
    X
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReAnimated, {
  FadeIn, FadeInUp,
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, runOnJS,
  interpolate, Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
    Alert,
    Animated,
    Dimensions,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { NavBar, useNavBarPaddingTop } from '../components/NavBar';
import { COLORS as THEME } from '../constants/colors';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const isSmallScreen = width < 400;
// Dimensiones del pill de borrar
const PILL_W    = 52;   // ancho/alto del cuadrado rojo (square)
const PILL_GAP  = 10;   // distancia desde el borde derecho del wrapper al pill
const CARD_GAP  = 8;    // espacio entre el borde derecho de la tarjeta y el pill
// Umbrales para el swipe estilo Instagram
const SNAP_OPEN       = -(PILL_W + PILL_GAP + CARD_GAP); // quedar abierto con gap
const DELETE_THRESHOLD = -width * 0.45;                   // si pasa → borrar

// ─── Swipeable wrapper — UI-thread (Gesture Handler + Reanimated) ─────────────
const SwipeableNotification = React.memo(({ n, onDelete, children }: {
  n: any;
  onDelete: (id: string, type: string, relatedId?: string) => void;
  children: React.ReactNode;
}) => {
  const x      = useSharedValue(0);
  const startX = useSharedValue(0);

  const doDelete = useCallback(() => {
    onDelete(n.id, n.type, n.related_id);
  }, [onDelete, n.id, n.type, n.related_id]);

  const animateDelete = useCallback(() => {
    x.value = withTiming(-width, { duration: 220 }, () => {
      runOnJS(doDelete)();
    });
  }, [doDelete, x]);

  // La tarjeta se desliza
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  // El pill se mueve en sincronía EXACTA con la tarjeta (mismo shared value x)
  // x=0 → pillTX = PILL_W+PILL_GAP (pill fuera de pantalla a la derecha, oculto)
  // x=-(PILL_W+PILL_GAP) → pillTX = 0 (pill visible en su posición right:PILL_GAP)
  const pillStyle = useAnimatedStyle(() => {
    const pillTX = interpolate(
      x.value,
      [-(PILL_W + PILL_GAP), 0],
      [0, PILL_W + PILL_GAP],
      Extrapolation.CLAMP,
    );
    return { transform: [{ translateX: pillTX }] };
  });

  // El ícono escala levemente al acercarse al threshold de borrado
  const trashIconStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      x.value,
      [DELETE_THRESHOLD, SNAP_OPEN, 0],
      [1.2, 1, 0.85],
      Extrapolation.CLAMP,
    );
    return { transform: [{ scale }] };
  });

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-15, 15])
    .onStart(() => { startX.value = x.value; })
    .onUpdate(e => {
      x.value = Math.min(0, Math.max(-width, startX.value + e.translationX));
    })
    .onEnd(() => {
      if (x.value <= DELETE_THRESHOLD) {
        // Umbral de borrado superado → animar y borrar
        x.value = withTiming(-width, { duration: 220 }, () => {
          runOnJS(doDelete)();
        });
      } else if (x.value < SNAP_OPEN / 2) {
        // Pasó la mitad del umbral de apertura → quedar abierto
        x.value = withSpring(SNAP_OPEN, { damping: 60, stiffness: 400 });
      } else {
        // Poco desplazamiento → volver al inicio
        x.value = withSpring(0, { damping: 60, stiffness: 400 });
      }
    });

  return (
    <View style={swipeStyles.wrapper}>
      {/* pillContainer: absoluto top-bottom-right, centra el cuadrado verticalmente */}
      <ReAnimated.View style={[swipeStyles.pillContainer, pillStyle]}>
        <ReAnimated.View style={[swipeStyles.deletePill, trashIconStyle]}>
          <TouchableOpacity onPress={animateDelete} style={swipeStyles.trashBtn} hitSlop={10}>
            <Trash2 color="rgba(255, 80, 65, 1)" size={20} />
          </TouchableOpacity>
        </ReAnimated.View>
      </ReAnimated.View>

      {/* Tarjeta que se desliza */}
      <GestureDetector gesture={pan}>
        <ReAnimated.View style={cardStyle}>
          {children}
        </ReAnimated.View>
      </GestureDetector>
    </View>
  );
});

const swipeStyles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
    overflow: 'hidden', // clipea el pill cuando está a la derecha (reposo)
  },
  // Contenedor que ocupa toda la altura del wrapper y centra el cuadrado verticalmente
  pillContainer: {
    position: 'absolute',
    right: PILL_GAP,
    top: 0,
    bottom: 0,
    width: PILL_W,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // El cuadrado rojo con estilo glassmorphism
  deletePill: {
    width: PILL_W,
    height: PILL_W,
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.38)',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  trashBtn: {
    width: PILL_W,
    height: PILL_W,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const COLORS = {
  ...THEME,
  success: '#00FF88',
  danger: '#FF4444'
};

export default function NotificationsScreen() {
  const router = useRouter();
  const navTop = useNavBarPaddingTop();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current; 

  const isMounted = useRef(true);
  useEffect(() => { return () => { isMounted.current = false; }; }, []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
  const [olderNotifications, setOlderNotifications] = useState<any[]>([]);

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    if (!loading) {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true })
        ]).start();
    }
  }, [loading]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  }, []);

  async function fetchNotifications() {
    try {
      if (!refreshing) setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.rpc('delete_old_notifications');

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Obtener follows pendientes para filtrar solicitudes fantasma
      const { data: pendingFollows } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', user.id)
        .eq('status', 'pending');

      const pendingIds = new Set(pendingFollows?.map(f => f.follower_id) ?? []);

      if (data) {
        // Filtrar friend_request:
        // - is_read: true → ya aceptada, siempre mostrar
        // - is_read: false → solo si el follow sigue pendiente (no fue cancelado)
        const filtered = data.filter(n =>
          n.type !== 'friend_request' || n.is_read || pendingIds.has(n.related_id)
        );

        // Deduplicar: solo 1 friend_request por remitente (el más reciente, data ya viene desc)
        const seenRequesters = new Set<string>();
        const deduped = filtered.filter(n => {
          if (n.type !== 'friend_request') return true;
          if (seenRequesters.has(n.related_id)) return false;
          seenRequesters.add(n.related_id);
          return true;
        });

        // Enriquecer friend_request con el perfil del remitente
        const friendRequestIds = [...new Set(
          deduped
            .filter(n => ['friend_request', 'new_friend', 'friend_connected', 'friend_level'].includes(n.type) && n.related_id)
            .map(n => n.related_id)
        )];

        let profileMap: Record<string, any> = {};
        if (friendRequestIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', friendRequestIds);
          if (profiles) {
            profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
          }
        }

        const enriched = deduped.map(n => ({
          ...n,
          sender_profile: profileMap[n.related_id] ?? null,
        }));

          const now = new Date();
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);

          const recent: any[] = [];
          const older: any[] = [];

          enriched.forEach(n => {
              const notifDate = new Date(n.created_at);
              if (notifDate >= sevenDaysAgo) {
                  recent.push(n);
              } else {
                  older.push(n);
              }
          });

          setRecentNotifications(recent);
          setOlderNotifications(older);
      }
      
    } catch (_e) {
      // Error silencioso: el usuario verá la lista vacía y puede hacer pull-to-refresh
    } finally { 
      if (!refreshing) setTimeout(() => setLoading(false), 50);
      else setLoading(false);
    }
  }

  const handleDeleteNotification = useCallback(async (id: string, type: string, _relatedId?: string) => {
    // Solo elimina la notificación de la UI y de la base de datos.
    // La gestión de follows (amistad) se hace EXCLUSIVAMENTE en handleFriendRequestDecision.
    // Nunca tocar la tabla follows desde aquí para evitar bugs de des-amistad accidental.
    setRecentNotifications(prev => prev.filter(n => n.id !== id));
    setOlderNotifications(prev => prev.filter(n => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  }, []);

  const updateLocalNotification = (id: string, updates: any) => {
      setRecentNotifications(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
      setOlderNotifications(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  // --- LÓGICA DE ACEPTAR AMISTAD ---
  const handleFriendRequestDecision = async (notification: any, accepted: boolean) => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // El related_id en una solicitud de amistad es el ID de quien la envió
        const requesterId = notification.related_id;

        if (accepted) {
            // 1. Aceptar la solicitud entrante (Ellos me siguen a mí -> accepted)
            const { error: error1 } = await supabase
                .from('follows')
                .update({ status: 'accepted' })
                .eq('follower_id', requesterId) // El que solicitó
                .eq('following_id', user.id);   // Yo

            if (error1) throw error1;

            // 2. Seguir de vuelta automáticamente (Yo los sigo a ellos -> accepted)
            // Usamos upsert para evitar errores si ya existía una relación previa
            const { error: error2 } = await supabase
                .from('follows')
                .upsert({ 
                    follower_id: user.id, 
                    following_id: requesterId, 
                    status: 'accepted' 
                });

            if (error2) throw error2;

            if (isMounted.current) Alert.alert("¡Conectados!", "Ahora son amigos.");
        } else {
            // Rechazar: eliminar follow y la notificación del DB
            await supabase
                .from('follows')
                .delete()
                .eq('follower_id', requesterId)
                .eq('following_id', user.id);

            await supabase.from('notifications').delete().eq('id', notification.id);

            // Quitar de la lista local
            setRecentNotifications(prev => prev.filter(n => n.id !== notification.id));
            setOlderNotifications(prev => prev.filter(n => n.id !== notification.id));

            if (isMounted.current) Alert.alert("Solicitud eliminada", "Has rechazado la solicitud.");
            return;
        }

        // Aceptar: marcar como leída (queda visible como "Amigos")
        await supabase.from('notifications').update({ is_read: true }).eq('id', notification.id);
        updateLocalNotification(notification.id, { is_read: true });

    } catch (_e) {
        if (isMounted.current) Alert.alert("Error", "No se pudo procesar la solicitud.");
    }
  };


  const handleNotificationPress = async (notification: any) => {
    // Solicitud pendiente → ir al perfil sin marcar como leída (los botones siguen activos)
    if (!notification.is_read && notification.type === 'friend_request') {
      if (notification.related_id) {
        router.push({ pathname: '/user-profile', params: { id: notification.related_id } });
      }
      return;
    }

    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notification.id);
      updateLocalNotification(notification.id, { is_read: true });

      switch (notification.type) {
        // Sociales → perfil del usuario relacionado
        case 'friend_request':   // ya procesada (is_read: true) → va al perfil
        case 'new_friend':
        case 'friend_connected':
        case 'friend_level':
          if (notification.related_id) {
            router.push({ pathname: '/user-profile', params: { id: notification.related_id } });
          }
          break;
        // Eventos / clubes → detalle del evento
        case 'friend_event':
        case 'low_stock':
        case 'event_reminder':
        case 'new_event_in_club':
          if (notification.related_id) {
            const { data: ev } = await supabase
              .from('events')
              .select('*, clubs(name, image), experiences(name, logo_url, id)')
              .eq('id', notification.related_id)
              .single();
            router.push({ pathname: '/event-detail', params: ev
              ? (Platform.OS === 'web' ? { id: ev.id } : {
                  id: ev.id,
                  status: ev.status,
                  imageUrl: ev.image_url,
                  title: ev.title,
                  date: ev.date,
                  hour: ev.hour,
                  accentColor: ev.accent_color,
                  category: ev.category,
                  clubName: ev.club_name || ev.clubs?.name,
                  clubImage: ev.clubs?.image,
                  producerName: ev.experiences?.name,
                  producerLogo: ev.experiences?.logo_url,
                  producerId: ev.experiences?.id,
                  instagramUrl: ev.instagram_url,
                })
              : { id: notification.related_id } });
          }
          break;
        // Marketplace → gestionar desde allí
        case 'offer_received':
        case 'offer_accepted':
        case 'ticket_sold':
          router.push('/(tabs)/marketplace');
          break;
        // Tickets → mis entradas
        case 'ticket_purchased':
        case 'ticket_received':
        case 'ticket_transfer':
          router.push('/my-tickets');
          break;
        case 'level_up':
          router.push('/rankings');
          break;
        default:
          router.push('/home');
          break;
      }
    } catch (_e) {
      // Error silencioso al navegar
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'low_stock':        return <Ticket color="#FF4444" size={20} />;
      case 'event_reminder':   return <Clock color="#FFD700" size={20} />;
      case 'new_event_in_club':return <Calendar color={COLORS.neonPink} size={20} />;
      case 'ticket_purchased': return <CheckCircle2 color={COLORS.neonPink} size={20} />;
      case 'ticket_received':  return <MoveHorizontal color={COLORS.success} size={20} />;
      case 'ticket_transfer':  return <Ticket color={COLORS.success} size={20} />;
      case 'friend_event':     return <Calendar color={COLORS.neonPink} size={20} />;
      case 'friend_level':     return <Trophy color="#FFD700" size={20} />;
      case 'level_up':         return <Star color="#FFD700" size={20} />;
      case 'friend_request':   return <UserPlus color="#D8B4FE" size={20} />;
      case 'new_friend':
      case 'friend_connected': return <Users color={COLORS.success} size={20} />;
      case 'offer_received':   return <DollarSign color={COLORS.success} size={20} />;
      default:                 return <BellRing color="white" size={20} />;
    }
  };

  const getIconBg = (type: string) => {
    switch (type) {
      case 'low_stock':                          return 'rgba(255, 68, 68, 0.1)';
      case 'event_reminder':
      case 'friend_level':
      case 'level_up':                           return 'rgba(255, 215, 0, 0.1)';
      case 'friend_event':
      case 'new_event_in_club':
      case 'ticket_purchased':                   return 'rgba(255, 0, 127, 0.1)';
      case 'ticket_transfer':
      case 'ticket_received':
      case 'new_friend':
      case 'friend_connected':
      case 'offer_received':                     return 'rgba(0, 255, 136, 0.1)';
      default:                                   return 'rgba(138, 43, 226, 0.1)';
    }
  };

  const NotificationItem = ({ n }: { n: any }) => {
    const isPendingAction = !n.is_read && n.type === 'friend_request';
    // Solicitud de amistad ya procesada (aceptada/rechazada)
    const isProcessedFriendRequest = n.type === 'friend_request' && n.is_read;

    return (
        <TouchableOpacity
            style={[styles.glassCard, n.is_read && !isPendingAction && { opacity: 0.6 }]}
            activeOpacity={0.7}
            onPress={() => handleNotificationPress(n)}
        >
          <View style={[styles.iconContainer, { backgroundColor: getIconBg(n.type) }]}>
              {getIcon(n.type)}
          </View>

          <View style={{ flex: 1, marginLeft: 15 }}>
              <Text style={styles.notifTitle} numberOfLines={1}>{n.title}</Text>
              {n.sender_profile && (
                <Text style={styles.senderName} numberOfLines={1}>
                  @{n.sender_profile.username || n.sender_profile.full_name || 'Usuario'}
                </Text>
              )}
              {!isProcessedFriendRequest && (
                <Text style={styles.notifText} numberOfLines={2}>{n.message}</Text>
              )}

              {/* BOTONES DE ACCIÓN — solo solicitudes de amistad */}
              {isPendingAction && (
                  <View style={styles.actionButtons}>
                      <TouchableOpacity
                          style={[styles.btn, styles.rejectBtn]}
                          onPress={() => handleFriendRequestDecision(n, false)}
                      >
                          <X color="white" size={14} />
                          <Text style={styles.btnText}>Rechazar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                          style={[styles.btn, styles.acceptBtn]}
                          onPress={() => handleFriendRequestDecision(n, true)}
                      >
                          <Check color="black" size={14} />
                          <Text style={[styles.btnText, { color: 'black' }]}>Aceptar</Text>
                      </TouchableOpacity>
                  </View>
              )}

              {/* Badge "Amigos" para solicitud ya aceptada */}
              {isProcessedFriendRequest && (
                  <View style={styles.friendsBadge}>
                      <Users color={COLORS.success} size={12} />
                      <Text style={styles.friendsBadgeText}>Amigos · Toca para ver perfil</Text>
                  </View>
              )}
          </View>

          {!isPendingAction && (
              <View style={styles.arrowContainer}>
                  <ArrowRight color={COLORS.textZinc} size={16} />
              </View>
          )}
        </TouchableOpacity>
    );
  };

  return (
    <ReAnimated.View entering={FadeIn.duration(250)} style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={['rgba(255, 49, 216, 0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.05)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFill} />
      </View>
      
      <NavBar title="NOTIFICACIONES" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: navTop, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
            <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.neonPurple}
                colors={[COLORS.neonPurple, COLORS.neonPink]}
                progressBackgroundColor="#111"
            />
        }
      >
        {(!loading && recentNotifications.length === 0 && olderNotifications.length === 0) ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Star color={COLORS.neonPurple} size={40} />
            </View>
            <Text style={styles.emptyText}>Estás al día</Text>
            <Text style={styles.emptySub}>No tienes notificaciones recientes.</Text>
          </View>
        ) : (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }] }}>
              
              {/* SECCIÓN 1: ÚLTIMOS 7 DÍAS */}
              {recentNotifications.length > 0 && (
                  <ReAnimated.View entering={FadeInUp.duration(300).delay(0).springify()}>
                  <View style={styles.sectionContainer}>
                      <Text style={styles.sectionHeader}>Últimos 7 días</Text>
                      {recentNotifications.map(n => (
                        <SwipeableNotification key={n.id} n={n} onDelete={handleDeleteNotification}>
                          <NotificationItem n={n} />
                        </SwipeableNotification>
                      ))}
                  </View>
                  </ReAnimated.View>
              )}

              {/* SECCIÓN 2: ÚLTIMOS 30 DÍAS */}
              {olderNotifications.length > 0 && (
                  <ReAnimated.View entering={FadeInUp.duration(300).delay(80).springify()}>
                  <View style={styles.sectionContainer}>
                      <Text style={styles.sectionHeader}>Últimos 30 días</Text>
                      {olderNotifications.map(n => (
                        <SwipeableNotification key={n.id} n={n} onDelete={handleDeleteNotification}>
                          <NotificationItem n={n} />
                        </SwipeableNotification>
                      ))}
                  </View>
                  </ReAnimated.View>
              )}

          </Animated.View>
        )}
      </ScrollView>
    </ReAnimated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { marginTop: 50, alignItems: 'center' },

  sectionContainer: { marginBottom: 25 },
  sectionHeader: { 
      color: 'white', 
      fontSize: 16, 
      fontWeight: '900', 
      marginBottom: 15, 
      marginLeft: 4,
      letterSpacing: 0.5 
  },

  glassCard: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glassBg,
      padding: isSmallScreen ? 14 : 16, borderRadius: 20,
      borderWidth: 1, borderColor: COLORS.glassBorder
  },
  iconContainer: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  notifTitle: { color: 'white', fontWeight: '800', fontSize: 14, marginBottom: 2 },
  senderName: { color: '#D8B4FE', fontWeight: '700', fontSize: 13, marginBottom: 3 },
  notifText: { color: COLORS.textZinc, fontSize: 13, lineHeight: 18 },
  arrowContainer: { paddingLeft: 10 },
  
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyIconCircle: { width: 86, height: 86, borderRadius: 43, backgroundColor: 'rgba(138, 43, 226, 0.1)', borderWidth: 1, borderColor: 'rgba(138, 43, 226, 0.3)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyText: { color: 'white', fontSize: 20, fontWeight: '900', fontStyle: 'italic', textAlign: 'center', marginBottom: 8 },
  emptySub: { color: COLORS.textZinc, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  
  friendsBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, backgroundColor: 'rgba(0,255,136,0.08)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(0,255,136,0.2)' },
  friendsBadgeText: { color: COLORS.success, fontSize: 11, fontWeight: '700' },
  actionButtons: { flexDirection: 'row', marginTop: 12, gap: 10 },
  btn: { 
      flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, 
      borderRadius: 12, gap: 6 
  },
  rejectBtn: { backgroundColor: 'rgba(255, 68, 68, 0.2)', borderWidth: 1, borderColor: 'rgba(255, 68, 68, 0.4)' },
  acceptBtn: { backgroundColor: COLORS.success },
  btnText: { color: 'white', fontSize: 12, fontWeight: '800' }
});