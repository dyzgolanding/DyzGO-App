import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { AlertTriangle, CheckCircle2, Clock, CreditCard, Lock, Plus, ShieldCheck, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReAnimated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { SkeletonBox } from '../../components/SkeletonBox';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isSmallScreen = SCREEN_WIDTH < 400;
import { WebView } from 'react-native-webview';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import { supabase } from '../../lib/supabase';

// --- DEFINICIÓN DE COLORES ---
const COLORS = {
  bgDark: '#030303',
  cardBg: 'rgba(255, 255, 255, 0.05)',
  cardBorder: 'rgba(255, 255, 255, 0.1)',
  neonPurple: '#FF31D8',
  textWhite: '#FBFBFB',
  textGray: 'rgba(251, 251, 251, 0.6)',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  neonPink: '#FF31D8',
  glassBg: 'rgba(255, 255, 255, 0.05)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  textZinc: 'rgba(251, 251, 251, 0.6)',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

export default function PaymentScreen() {
  const router = useRouter();
  const navTop = useNavBarPaddingTop();
  const navigation = useNavigation();
  const params = useLocalSearchParams();

  const eventId = params.eventId as string;
  const eventName = params.eventName as string;
  const paramAccentColor = params.accentColor as string | undefined;

  const rawCart: CartItem[] = params.cartData ? JSON.parse(params.cartData as string) : [];
  const cart: CartItem[] = rawCart.filter((item) => UUID_REGEX.test(item.id));
  const hasCorruptItems = rawCart.length > cart.length;

  const totals = useMemo(() => {
    const subtotal = cart.reduce((acc, item) => acc + (Number(item.price) * Number(item.quantity)), 0);
    const serviceFeeTotal = Math.round(subtotal * 0.12);
    const finalTotal = subtotal + serviceFeeTotal;
    return { subtotal, serviceFeeTotal, finalTotal };
  }, [cart]);

  const isFreeOrder = totals.finalTotal === 0;

  const [loadingReservation, setLoadingReservation] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [preloadedTx, setPreloadedTx] = useState<{ url: string, token: string } | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [showOneClickModal, setShowOneClickModal] = useState(false);

  const [reservationExpiresAt, setReservationExpiresAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const [savedCards, setSavedCards] = useState<any[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string>('webpay');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoFinalAmount, setPromoFinalAmount] = useState<number | null>(null);

  const webViewRef = useRef<WebView>(null);
  const commitAttempted = useRef(false);

  const [eventDetails, setEventDetails] = useState<any>(null);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('image_url, date, hour, end_time, accent_color, experiences(name)')
          .eq('id', eventId)
          .single();
        if (error) throw error;
        if (data) setEventDetails(data);
      } catch {
        // Si falla la carga de detalles, el resumen igual se puede mostrar con los params de navegación
      }
    };
    if (eventId) fetchDetails();
  }, [eventId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (success) return;

      e.preventDefault();

      Alert.alert(
        '¿Perder tu reserva?',
        'Si vuelves atrás, tus entradas reservadas serán liberadas.',
        [
          { text: 'Quedarme', style: 'cancel' },
          {
            text: 'Sí, salir', style: 'destructive',
            onPress: async () => {
              try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user && eventId) {
                  await supabase.functions.invoke('webpay', {
                    body: { action: 'cancel', user_id: user.id, event_id: eventId }
                  });
                }
              } catch (_err) {}
              navigation.dispatch(e.data.action);
            }
          }
        ]
      );
    });

    return unsubscribe;
  }, [navigation, success, eventId]);

  useEffect(() => {
    createReservationOnEntry();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPaymentMethods();
    }, [])
  );

  const fetchPaymentMethods = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('user_payment_methods')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) setSavedCards(data);
  };

  const extractFunctionError = async (error: any): Promise<string> => {
    try {
      if (error?.context) {
        const body = await (error.context as Response).json();
        return body.error || body.message || body.details || error.message;
      }
    } catch (_) {
      try {
        const text = await (error?.context as Response)?.text?.();
        if (text) return text;
      } catch (_) { }
    }
    return error?.message || "Error desconocido";
  };

  const handleInvalidSession = async () => {
    await supabase.auth.signOut();
    Alert.alert(
      "Sesión inválida",
      "Tu sesión ha caducado o fue invalidada. Por favor inicia sesión nuevamente.",
      [{ text: "Ir al Login", onPress: () => router.replace('/login') }]
    );
  };

  const createReservationOnEntry = async () => {
    if (cart.length === 0) return;
    setLoadingReservation(true);

    try {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        await handleInvalidSession();
        return;
      }
      const session = refreshData.session;
      const user = session.user;

      const simplifiedCart = cart.map((item) => ({
        tier_id: item.id,
        quantity: item.quantity
      }));

      const { data, error } = await supabase.functions.invoke('webpay', {
        body: {
          action: 'create',
          cart: simplifiedCart,
          user_id: user.id,
          event_id: eventId
        },
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (error) {
        const msg = await extractFunctionError(error);
        throw new Error(msg);
      }

      if (data && data.status === 'FREE_ORDER') {
        // Orden gratuita: tickets reservados como pending, esperar confirmación del usuario
        if (data.session_id) setCurrentSessionId(data.session_id);
        if (data.expires_at) setReservationExpiresAt(data.expires_at);
        return;
      }

      if (data && data.url && data.token) {
        setPreloadedTx({ url: data.url, token: data.token });
        setAuthToken(data.token);
        if (data.expires_at) setReservationExpiresAt(data.expires_at);
        if (data.session_id) setCurrentSessionId(data.session_id);
        if (data.promo_applied) { setPromoApplied(true); setPromoFinalAmount(data.final_amount ?? null); }
      } else {
        if (data?.error) throw new Error(data.error);
        throw new Error("Respuesta inválida del servidor.");
      }

    } catch (error: any) {
      if (error.message?.toLowerCase().includes('invalid jwt') || error.message?.toLowerCase().includes('invalid_jwt')) {
        await handleInvalidSession();
      } else {
        Alert.alert("Error de Reserva", error.message, [{ text: "Volver", onPress: () => router.back() }]);
      }
    } finally {
      setLoadingReservation(false);
    }
  };

  useEffect(() => {
    if (!reservationExpiresAt) return;

    const tick = () => {
      const now = new Date().getTime();
      const expiration = new Date(reservationExpiresAt).getTime();
      const distance = expiration - now;
      if (distance < 0) {
        clearInterval(interval);
        setTimeLeft("00:00");
        Alert.alert("Tiempo agotado", "Reserva liberada.", [{ text: "OK", onPress: () => router.back() }]);
        setPaymentUrl(null);
        setPreloadedTx(null);
        setReservationExpiresAt(null);
      } else {
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        setTimeLeft(`${minutes}:${seconds < 10 ? '0' : ''}${seconds}`);
      }
    };

    tick(); // mostrar inmediatamente sin esperar 1 segundo
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [reservationExpiresAt]);

  const handleCancelAndExit = () => {
    router.back();
  };

  const handlePaymentButtonPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isFreeOrder) {
      handleConfirmFree();
      return;
    }
    if (selectedMethod === 'webpay') {
      setShowConfirmationModal(true);
    } else {
      setShowOneClickModal(true);
    }
  };

  const handleConfirmFree = async () => {
    setProcessing(true);
    try {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        await handleInvalidSession();
        return;
      }
      const session = refreshData.session;

      const { data, error } = await supabase.functions.invoke('webpay', {
        body: {
          action: 'confirm_free',
          user_id: session.user.id,
          event_id: eventId,
          session_id: currentSessionId
        },
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (error) {
        const msg = await extractFunctionError(error);
        throw new Error(msg);
      }

      if (data?.status === 'FREE_CONFIRMED') {
        setSuccess(true);
        setReservationExpiresAt(null);
        setTimeLeft(null);
        finishProcess();
      } else {
        throw new Error(data?.error || 'Error confirmando entradas gratuitas.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudieron confirmar las entradas.');
    } finally {
      setProcessing(false);
    }
  };

  const handleOneClickPayment = async () => {
    setProcessing(true);
    try {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        await handleInvalidSession();
        return;
      }
      const session = refreshData.session;

      const { data, error } = await supabase.functions.invoke('webpay', {
        body: {
          action: 'authorize_oneclick',
          user_id: session.user.id,
          card_id: selectedMethod,
          event_id: eventId,
          session_id: currentSessionId
        },
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (error) throw error;

      if (data.status === 'SUCCESS') {
        setSuccess(true);
        setReservationExpiresAt(null);
        setTimeLeft(null);
        finishProcess();
      } else {
        throw new Error(data.error || "Pago rechazado");
      }

    } catch (e: any) {
      Alert.alert("Error en Pago", e.message || "No se pudo procesar el pago OneClick.");
    } finally {
      setProcessing(false);
    }
  };

  const handleProceedToWebpay = () => {
    setShowConfirmationModal(false);
    if (!preloadedTx) {
      Alert.alert("Error", "Reserva no lista.");
      return;
    }
    setPaymentUrl(preloadedTx.url);
  };

  const isCallbackUrl = (url: string): boolean => {
    const callbackHost = process.env.EXPO_PUBLIC_CALLBACK_HOST;
    if (!callbackHost) return false;
    return url.includes(callbackHost) && url.includes('callback=dyzgo_final');
  };

  const commitPayment = async () => {
    setPaymentUrl(null);
    setProcessing(true);
    try {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        await handleInvalidSession();
        return;
      }
      const session = refreshData.session;
      const { data, error } = await supabase.functions.invoke('webpay', {
        body: { action: 'commit', token_ws: authToken, user_id: session.user.id },
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (error) throw error;
      if (data.db_error) {
        Alert.alert("Atención", "Error registrando tickets.");
        return;
      }

      if (data.status === 'AUTHORIZED' && data.response_code === 0) {
        setSuccess(true);
        setReservationExpiresAt(null);
        setTimeLeft(null);
        finishProcess();
      } else {
        Alert.alert("Pago Rechazado", "Transacción no autorizada.");
      }
    } catch (e: any) {
      Alert.alert("Error", "Error confirmando compra.");
    } finally {
      setProcessing(false);
    }
  };

  const handleShouldStartLoadWithRequest = (request: any): boolean => {
    if (isCallbackUrl(request.url) && authToken) {
      if (!commitAttempted.current) {
        commitAttempted.current = true;
        commitPayment();
      }
      return false;
    }
    return true;
  };

  const handleWebViewNavigation = (navState: any) => {
    if (isCallbackUrl(navState.url) && authToken) {
      if (!commitAttempted.current) {
        commitAttempted.current = true;
        webViewRef.current?.stopLoading();
        commitPayment();
      }
    }
  };

  const finishProcess = () => {
    const totalQuantity = cart.reduce((acc, item) => acc + item.quantity, 0);

    router.replace({
      pathname: '/ticket-confirmation',
      params: {
        eventId,
        eventName,
        quantity: totalQuantity.toString()
      }
    });
  };

  const formatEventDateTime = (evt: any) => {
    if (!evt || !evt.date) return "";

    const [year, month, day] = evt.date.split('-');
    const d = new Date(Number(year), Number(month) - 1, Number(day));

    const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sáb'];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const formatTime = (timeStr: string) => {
      if (!timeStr) return "";
      const [h, m] = timeStr.split(':');
      let hour = parseInt(h, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12;
      hour = hour ? hour : 12;
      return `${hour.toString().padStart(2, '0')}:${m} ${ampm}`;
    };

    const startTime = formatTime(evt.hour);
    const endTime = formatTime(evt.end_time);

    let timeString = "";
    if (startTime && endTime) {
      timeString = `, de ${startTime} a ${endTime}`;
    }

    return `${days[d.getDay()]} ${d.getDate()} de ${months[d.getMonth()]}${timeString}`;
  };

  const displayDate = formatEventDateTime(eventDetails) || params.eventDate as string;
  const producerName = Array.isArray(eventDetails?.experiences) ? eventDetails?.experiences[0]?.name : eventDetails?.experiences?.name;

  const accentColor = eventDetails?.accent_color || paramAccentColor || '#FF31D8';
  const withAlpha = (hex: string, alpha: number) => {
    const clean = hex.startsWith('#') ? hex : `#${hex}`;
    const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return `${clean}${a}`;
  };

  if (loadingReservation) return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={[withAlpha(accentColor, 0.2), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', withAlpha(accentColor, 0.15)]} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </View>
      <NavBar title="RESUMEN DE COMPRA" onBack={handleCancelAndExit} />
      <View style={{ flex: 1, padding: 20 }}>
        <View style={{ flexDirection: 'row', gap: 14, marginBottom: 16 }}>
          <SkeletonBox height={80} width={80} borderRadius={12} />
          <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
            <SkeletonBox height={20} borderRadius={6} />
            <SkeletonBox height={16} borderRadius={6} width="60%" />
            <SkeletonBox height={14} borderRadius={6} width="45%" />
          </View>
        </View>
        <SkeletonBox height={60} borderRadius={16} style={{ marginBottom: 16 }} />
        <SkeletonBox height={180} borderRadius={20} style={{ marginBottom: 16 }} />
        <SkeletonBox height={24} borderRadius={6} width="40%" style={{ marginBottom: 12 }} />
        <SkeletonBox height={72} borderRadius={16} style={{ marginBottom: 10 }} />
        <SkeletonBox height={72} borderRadius={16} />
      </View>
      <View style={{ padding: 20 }}>
        <SkeletonBox height={56} borderRadius={16} />
      </View>
    </View>
  );

  if (paymentUrl) {
    return (
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <View style={{ flex: 1, position: 'relative' }}>
          <WebView
            ref={webViewRef}
            source={{
              uri: paymentUrl,
              method: 'POST',
              body: `token_ws=${authToken}`,
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            onNavigationStateChange={handleWebViewNavigation}
            style={{ flex: 1, backgroundColor: '#ffffff' }}
            startInLoadingState={true}
            renderLoading={() => <ActivityIndicator size="large" color={accentColor} style={StyleSheet.absoluteFill} />}
          />
          <TouchableOpacity onPress={() => setPaymentUrl(null)} style={styles.floatingCloseBtn}>
            <X color="#333" size={24} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ReAnimated.View entering={FadeInUp.duration(300).springify()} style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Fondo — 3 capas con accent_color */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={[withAlpha(accentColor, 0.2), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', withAlpha(accentColor, 0.15)]} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', withAlpha(accentColor, 0.05), 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFill} />
      </View>

      <View style={{ flex: 1 }}>
        <NavBar title="RESUMEN DE COMPRA" onBack={handleCancelAndExit} />

        <ScrollView contentContainerStyle={[styles.content, { paddingTop: navTop }]} showsVerticalScrollIndicator={false}>
          <ReAnimated.View entering={FadeInUp.duration(300).delay(0).springify()}>
            <View style={styles.eventHeaderRow}>
              <Image
                source={{ uri: eventDetails?.image_url || 'https://via.placeholder.com/150' }}
                style={[styles.eventSquareImage, { borderColor: withAlpha(accentColor, 0.5), shadowColor: accentColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10 }]}
                contentFit="cover"
                transition={150}
                cachePolicy="memory-disk"
              />
              <View style={styles.eventHeaderTextContainer}>
                <Text style={styles.eventHeaderTitle} numberOfLines={2}>{eventName}</Text>

                {displayDate && (
                  <View style={styles.eventHeaderSubRow}>
                    <Text style={styles.eventHeaderText}>{displayDate}</Text>
                  </View>
                )}

                {producerName && (
                  <View style={styles.eventHeaderSubRow}>
                    <Text style={styles.eventHeaderText}>
                      Producido por <Text style={{ fontWeight: '800', color: 'white' }}>{producerName}</Text>
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </ReAnimated.View>

          {!isFreeOrder && (
            <ReAnimated.View entering={FadeInUp.duration(300).delay(80).springify()}>
              <View style={styles.infoBox}>
                <ShieldCheck color={accentColor} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoBoxText}>
                    Tus entradas están <Text style={{ fontWeight: '800', color: 'white' }}>reservadas temporalmente</Text>. Completa el pago antes de que el contador llegue a cero.
                  </Text>
                </View>
              </View>
            </ReAnimated.View>
          )}

          {hasCorruptItems && (
            <View style={styles.errorBanner}>
              <AlertTriangle color="#ef4444" size={20} />
              <Text style={styles.errorText}>Algunos items no disponibles.</Text>
            </View>
          )}

          <ReAnimated.View entering={FadeInUp.duration(300).delay(160).springify()}>
            <View style={styles.glassCard}>
              <Text style={styles.cardTitle}>Detalle de tickets</Text>
              {cart.map((item: any, index: number) => {
                return (
                  <View key={index} style={styles.ticketRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ticketName}>{item.quantity}x {item.name}</Text>
                    </View>
                    <Text style={styles.ticketPrice}>${(item.price * item.quantity).toLocaleString()}</Text>
                  </View>
                );
              })}

              <View style={styles.divider} />

              <View style={styles.ticketRow}>
                <Text style={styles.ticketName}>Cargo por servicio (12%)</Text>
                <Text style={styles.ticketPrice}>${totals.serviceFeeTotal.toLocaleString()}</Text>
              </View>

              {promoApplied && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(34,197,94,0.08)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' }}>
                  <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: '700' }}>🎉 Descuento Nivel 1 (−10%)</Text>
                  <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: '800' }}>−${Math.round(totals.finalTotal * 0.10).toLocaleString()}</Text>
                </View>
              )}

              <View style={[styles.summaryRow, { marginTop: 15 }]}>
                <Text style={styles.totalLabelFinal}>Total a Pagar</Text>
                <Text style={[styles.totalValueFinal, { color: accentColor }]}>
                  {promoApplied && promoFinalAmount != null
                    ? `$${promoFinalAmount.toLocaleString()}`
                    : `$${totals.finalTotal.toLocaleString()}`}
                </Text>
              </View>
            </View>
          </ReAnimated.View>

          {!isFreeOrder && (
            <ReAnimated.View entering={FadeInUp.duration(300).delay(240).springify()}>
              <>
                <Text style={styles.sectionTitle}>Método de pago</Text>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedMethod('webpay')}
                  style={[styles.paymentOption, selectedMethod === 'webpay' && { borderColor: withAlpha(accentColor, 0.7), backgroundColor: withAlpha(accentColor, 0.07) }]}
                >
                  <View style={selectedMethod === 'webpay' ? [styles.radioSelected, { borderColor: accentColor }] : styles.radioUnselected}>
                    {selectedMethod === 'webpay' && <View style={[styles.radioInner, { backgroundColor: accentColor }]} />}
                  </View>

                  <View style={{ flex: 1, marginLeft: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <CreditCard color={COLORS.textWhite} size={20} />
                        <Text style={styles.paymentMethodTitle}>Webpay Plus</Text>
                      </View>
                      <Text style={styles.paymentMethodSubtitle}>Débito, Crédito, Prepago</Text>
                    </View>
                    <Image
                      source={{ uri: 'https://www.transbank.cl/public/img/logos/webpay-plus-white.png' }}
                      style={{ width: 60, height: 20 }}
                      contentFit="contain"
                      transition={150}
                      cachePolicy="memory-disk"
                    />
                  </View>
                </TouchableOpacity>

                {savedCards.map((card) => (
                  <TouchableOpacity
                    key={card.id}
                    activeOpacity={0.8}
                    onPress={() => setSelectedMethod(card.id)}
                    style={[styles.paymentOption, selectedMethod === card.id && { borderColor: withAlpha(accentColor, 0.7), backgroundColor: withAlpha(accentColor, 0.07) }, { marginTop: 10 }]}
                  >
                    <View style={selectedMethod === card.id ? [styles.radioSelected, { borderColor: accentColor }] : styles.radioUnselected}>
                      {selectedMethod === card.id && <View style={[styles.radioInner, { backgroundColor: accentColor }]} />}
                    </View>

                    <View style={{ flex: 1, marginLeft: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <CreditCard color={accentColor} size={20} />
                          <Text style={styles.paymentMethodTitle}>{card.card_type} •••• {card.card_number.slice(-4)}</Text>
                          <View style={[styles.oneClickBadge, { backgroundColor: accentColor }]}>
                            <Text style={styles.oneClickText}>1-CLICK</Text>
                          </View>
                        </View>
                        <Text style={styles.paymentMethodSubtitle}>Pago rápido sin salir de la app</Text>
                      </View>

                      <Image
                        source={{ uri: card.card_type.toLowerCase().includes('visa') ? 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Visa_Inc._logo.svg/2560px-Visa_Inc._logo.svg.png' : 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/1280px-Mastercard-logo.svg.png' }}
                        style={{ width: 35, height: 20 }}
                        contentFit="contain"
                        transition={150}
                        cachePolicy="memory-disk"
                      />
                    </View>
                    {selectedMethod === card.id && <CheckCircle2 color={COLORS.success} size={20} style={{ marginLeft: 10 }} />}
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={styles.addCardBtn}
                  onPress={() => router.push('/payment-methods')}
                >
                  <Plus color={COLORS.textZinc} size={20} />
                  <Text style={styles.addCardText}>AGREGAR NUEVA TARJETA</Text>
                </TouchableOpacity>

                <View style={styles.secureFooter}>
                  <Lock color={COLORS.textGray} size={14} />
                  <Text style={styles.secureFooterText}>Pagos procesados de forma segura por Transbank</Text>
                </View>
              </>
            </ReAnimated.View>
          )}
        </ScrollView>

        {!isFreeOrder && (
          <>
            {loadingReservation ? (
              <BlurView intensity={80} tint="dark" style={styles.timerAbove}>
                <ActivityIndicator color={accentColor} size="small" />
                <Text style={{ color: COLORS.textGray, fontSize: 12, marginLeft: 8 }}>Reservando tus tickets...</Text>
              </BlurView>
            ) : timeLeft ? (
              <BlurView intensity={80} tint="dark" style={styles.timerAbove}>
                <Clock color={COLORS.warning} size={16} />
                <Text style={styles.timerText}>Reserva expira en: <Text style={{ fontWeight: '800' }}>{timeLeft}</Text></Text>
              </BlurView>
            ) : null}

            <BlurView intensity={80} tint="dark" style={styles.footer}>
              <TouchableOpacity
                style={[styles.payBtnMain, (loadingReservation || processing || cart.length === 0) && { opacity: 0.6 }, {
                  backgroundColor: withAlpha(accentColor, 0.15),
                  borderWidth: 1,
                  borderColor: withAlpha(accentColor, 0.35),
                }]}
                onPress={handlePaymentButtonPress}
                disabled={loadingReservation || processing || cart.length === 0}
                activeOpacity={0.65}
              >
                {processing ? (
                  <ActivityIndicator color={accentColor} />
                ) : (
                  <Text style={[styles.payBtnMainText, { color: accentColor }]}>
                    {loadingReservation ? "CARGANDO..." : "FINALIZAR COMPRA"}
                  </Text>
                )}
              </TouchableOpacity>
            </BlurView>
          </>
        )}

        {isFreeOrder && (
          <BlurView intensity={80} tint="dark" style={styles.footer}>
            <TouchableOpacity
              style={[styles.payBtnMain, (loadingReservation || processing) && { opacity: 0.6 }, {
                backgroundColor: withAlpha(accentColor, 0.15),
                borderWidth: 1,
                borderColor: withAlpha(accentColor, 0.35),
              }]}
              onPress={handlePaymentButtonPress}
              disabled={loadingReservation || processing}
              activeOpacity={0.65}
            >
              {processing ? (
                <ActivityIndicator color={accentColor} />
              ) : (
                <Text style={[styles.payBtnMainText, { color: accentColor }]}>
                  {loadingReservation ? "CARGANDO..." : "OBTENER ENTRADAS"}
                </Text>
              )}
            </TouchableOpacity>
          </BlurView>
        )}
      </View>

      {/* --- MODAL ONE-CLICK REDISEÑADO --- */}
      <Modal visible={showOneClickModal} transparent={true} animationType="fade" onRequestClose={() => setShowOneClickModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowOneClickModal(false)} activeOpacity={1} />
          <BlurView intensity={80} tint="dark" style={styles.modalCard}>
            <View style={[styles.modalIconBg, { backgroundColor: withAlpha(accentColor, 0.12), borderColor: withAlpha(accentColor, 0.25) }]}>
              <CreditCard color={accentColor} size={28} />
            </View>
            <Text style={styles.modalTitle}>Confirmar Pago</Text>
            <Text style={styles.modalSubtitle}>
              ¿Pagar <Text style={{ color: COLORS.textWhite, fontWeight: '800' }}>${(promoApplied && promoFinalAmount != null ? promoFinalAmount : totals.finalTotal).toLocaleString()}</Text> con tu tarjeta guardada?
            </Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowOneClickModal(false)}>
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnConfirm, { backgroundColor: withAlpha(accentColor, 0.15), borderWidth: 1, borderColor: withAlpha(accentColor, 0.35) }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowOneClickModal(false); handleOneClickPayment(); }}
                activeOpacity={0.65}
              >
                <Text style={[styles.modalBtnConfirmText, { color: accentColor }]}>PAGAR AHORA</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </Modal>

      {/* --- MODAL WEBPAY REDISEÑADO --- */}
      <Modal visible={showConfirmationModal} transparent={true} animationType="fade" onRequestClose={() => setShowConfirmationModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowConfirmationModal(false)} activeOpacity={1} />
          <BlurView intensity={80} tint="dark" style={styles.modalCard}>
            <View style={[styles.modalIconBg, { backgroundColor: withAlpha(accentColor, 0.12), borderColor: withAlpha(accentColor, 0.25) }]}>
              <Lock color={accentColor} size={28} />
            </View>
            <Text style={styles.modalTitle}>Ir a Webpay</Text>
            <Text style={styles.modalSubtitle}>
              Serás redirigido a Webpay para completar el pago de <Text style={{ color: COLORS.textWhite, fontWeight: '800' }}>${(promoApplied && promoFinalAmount != null ? promoFinalAmount : totals.finalTotal).toLocaleString()}</Text>.
              {timeLeft ? `\nCuentas con ${timeLeft} para finalizar.` : ''}
            </Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setShowConfirmationModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnConfirm, { backgroundColor: withAlpha(accentColor, 0.15), borderWidth: 1, borderColor: withAlpha(accentColor, 0.35) }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleProceedToWebpay(); }}
                activeOpacity={0.65}
              >
                <Text style={[styles.modalBtnConfirmText, { color: accentColor }]}>CONTINUAR</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </Modal>

    </ReAnimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030303'
  },
  content: {
    padding: 20,
    paddingBottom: 155
  },
  eventHeaderRow: {
    flexDirection: 'row',
    marginBottom: 25,
    alignItems: 'center',
    gap: 15
  },
  eventSquareImage: {
    width: 80,
    height: 80,
    borderRadius: 14,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: COLORS.glassBorder
  },
  eventHeaderTextContainer: {
    flex: 1,
    justifyContent: 'center'
  },
  eventHeaderTitle: {
    color: '#FBFBFB',
    fontSize: 20,
    fontWeight: '900',
    fontStyle: 'italic',
    marginBottom: 8,
    lineHeight: 24,
    letterSpacing: -1
  },
  eventHeaderSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4
  },
  eventHeaderText: {
    color: 'rgba(251,251,251,0.45)',
    fontSize: 12,
    fontWeight: '600',
    flex: 1
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 25,
    gap: 12,
    alignItems: 'center'
  },
  infoBoxText: {
    color: 'rgba(251,251,251,0.45)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18
  },
  eventNameLarge: {
    color: COLORS.textWhite,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 20,
    letterSpacing: 0.5
  },
  glassCard: {
    backgroundColor: COLORS.glassBg,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    marginBottom: 25
  },
  cardTitle: {
    color: 'rgba(251,251,251,0.4)',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 15,
    textTransform: 'uppercase',
    letterSpacing: 1.5
  },
  ticketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  ticketName: {
    color: 'rgba(251,251,251,0.45)',
    fontSize: 15,
    fontWeight: '600'
  },
  ticketPrice: {
    color: COLORS.textWhite,
    fontSize: 15,
    fontWeight: '500'
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 15
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  totalLabelFinal: {
    color: COLORS.textWhite,
    fontSize: 18,
    fontWeight: '900'
  },
  totalValueFinal: {
    color: '#FF31D8',
    fontSize: 20,
    fontWeight: '900'
  },
  sectionTitle: {
    color: 'rgba(251,251,251,0.4)',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 15,
    textTransform: 'uppercase',
    letterSpacing: 1.5
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glassBg,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder
  },
  paymentOptionSelected: {
    backgroundColor: 'rgba(138, 43, 226, 0.15)',
    borderColor: '#FF31D8'
  },
  radioUnselected: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.textGray,
    justifyContent: 'center',
    alignItems: 'center'
  },
  radioSelected: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FF31D8',
    justifyContent: 'center',
    alignItems: 'center'
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF31D8'
  },
  paymentMethodTitle: {
    color: COLORS.textWhite,
    fontSize: 16,
    fontWeight: '500'
  },
  paymentMethodSubtitle: {
    color: COLORS.textGray,
    fontSize: 12
  },
  oneClickBadge: {
    backgroundColor: '#FF31D8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8
  },
  oneClickText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '800'
  },
  secureFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 12,
    gap: 6
  },
  secureFooterText: {
    color: COLORS.textGray,
    fontSize: 12
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(251,251,251,0.15)',
    paddingHorizontal: isSmallScreen ? 20 : 24,
    paddingVertical: isSmallScreen ? 20 : 24,
    paddingBottom: isSmallScreen ? 25 : 35,
  },
  payBtnMain: {
    height: isSmallScreen ? 50 : 58,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  payBtnMainText: {
    color: COLORS.textWhite,
    fontSize: isSmallScreen ? 14 : 16,
    fontWeight: '900',
  },
  errorBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    gap: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)'
  },
  errorText: {
    color: '#fca5a5',
    flex: 1,
    fontSize: 13
  },
  floatingCloseBtn: {
    position: 'absolute',
    top: 10,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.8)',
    padding: 8,
    borderRadius: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3
  },
  timerAbove: {
    position: 'absolute',
    bottom: isSmallScreen ? 95 : 117,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(245, 158, 11, 0.2)',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)'
  },
  timerText: {
    color: COLORS.warning,
    fontSize: 14
  },
  addCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 12,
    borderStyle: 'dashed',
    gap: 8
  },
  addCardText: {
    color: COLORS.textZinc,
    fontSize: isSmallScreen ? 14 : 16,
    fontWeight: '900',
  },

  // --- NUEVOS ESTILOS PARA LOS MODALES DE CONFIRMACIÓN ---
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 24
  },
  modalCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251,251,251,0.15)',
    overflow: 'hidden',
  },
  modalIconBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,49,216, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,49,216, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16
  },
  modalTitle: {
    color: COLORS.textWhite,
    fontSize: 22,
    fontWeight: '900',
    fontStyle: 'italic',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -1
  },
  modalSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%'
  },
  modalBtnCancel: {
    flex: 1,
    height: 52,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)'
  },
  modalBtnCancelText: {
    color: '#FBFBFB',
    fontSize: 14,
    fontWeight: '700'
  },
  modalBtnConfirm: {
    flex: 1,
    height: 52,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnConfirmText: {
    fontSize: 14,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 0.5
  }
});