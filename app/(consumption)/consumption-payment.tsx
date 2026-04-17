import { BlurView } from '../../components/BlurSurface';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import {
  CheckCircle2, Clock, CreditCard, Lock, Plus, ShieldCheck, X, Zap,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReAnimated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { SkeletonBox } from '../../components/SkeletonBox';
import {
  ActivityIndicator, Alert, Dimensions, Modal, ScrollView,
  StatusBar, StyleSheet, Text, TouchableOpacity, View, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import { COLORS as APP_COLORS } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { useNavRouter } from '../../hooks/useNavRouter';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  bgDark: '#030303',
  neonPurple: APP_COLORS.neonPurple,
  textWhite: '#FBFBFB',
  textGray: 'rgba(251,251,251,0.6)',
  success: '#22c55e',
  warning: '#f59e0b',
  glassBg: 'rgba(255,255,255,0.05)',
  glassBorder: 'rgba(255,255,255,0.1)',
};

const withAlpha = (hex: string, alpha: number) => {
  const clean = hex.startsWith('#') ? hex : `#${hex}`;
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${clean}${a}`;
};

export default function ConsumptionPaymentScreen() {
  const router = useNavRouter();
  const navTop = useNavBarPaddingTop();
  const navigation = useNavigation();
  const params = useLocalSearchParams();

  const eventId = params.eventId as string;
  const eventName = params.eventName as string;
  const accentColor = (params.accentColor as string) || COLORS.neonPurple;

  const cart: { item_id: string; quantity: number; price: number; name: string }[] =
    params.cartData ? JSON.parse(params.cartData as string) : [];

  const total = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);

  const [loadingReservation, setLoadingReservation] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [savedCards, setSavedCards] = useState<any[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string>('webpay');
  const [showWebpayModal, setShowWebpayModal] = useState(false);
  const [showOneClickModal, setShowOneClickModal] = useState(false);

  const webViewRef = useRef<WebView>(null);
  const commitAttempted = useRef(false);

  // Bloquear swipe-back durante el pago
  useFocusEffect(useCallback(() => {
    if (paymentUrl) navigation.setOptions({ gestureEnabled: false });
    return () => navigation.setOptions({ gestureEnabled: true });
  }, [paymentUrl]));

  // Cargar tarjetas guardadas
  useFocusEffect(useCallback(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('user_payment_methods')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (data) setSavedCards(data);
    };
    load();
  }, []));

  // Crear transacción al entrar
  useEffect(() => {
    createTransaction();
  }, []);

  const createTransaction = async () => {
    setLoadingReservation(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión activa');

      const { data, error } = await supabase.functions.invoke('webpay', {
        body: {
          action: 'create_consumption_order',
          cart: cart.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
          user_id: session.user.id,
          event_id: eventId,
        },
      });

      if (error || !data?.order_id)
        throw new Error(data?.error || 'Error iniciando el pago');

      setOrderId(data.order_id);
      setExpiresAt(data.expires_at);
    } catch (err: any) {
      Alert.alert('Error', err.message, [{ text: 'Volver', onPress: () => router.back() }]);
    } finally {
      setLoadingReservation(false);
    }
  };

  // Timer de expiración
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('00:00');
        Alert.alert('Tiempo agotado', 'La sesión de pago expiró.', [{ text: 'OK', onPress: () => router.back() }]);
        return;
      }
      const m = Math.floor(diff / 60000).toString().padStart(2, '0');
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      setTimeLeft(`${m}:${s}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const handlePaymentButtonPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selectedMethod === 'webpay') setShowWebpayModal(true);
    else setShowOneClickModal(true);
  };

  const handleProceedToWebpay = async () => {
    setShowWebpayModal(false);
    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión activa');

      const { data, error } = await supabase.functions.invoke('webpay', {
        body: { 
          action: 'init_webpay_consumption', 
          order_id: orderId, 
          user_id: session.user.id,
          return_url: Platform.OS === 'web' ? window.location.origin + '/tbk-consumption' : undefined
        },
      });

      if (error || !data?.url || !data?.token)
        throw new Error(data?.error || 'Error iniciando Webpay');

      setAuthToken(data.token);
      commitAttempted.current = false;
      setPaymentUrl(data.url);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setProcessing(false);
    }
  };

  const isCallbackUrl = (url: string): boolean => {
    const callbackHost = process.env.EXPO_PUBLIC_CALLBACK_HOST ?? 'dyzgo.com';
    return url.includes(callbackHost) && (
      url.includes('/tbk-plus') ||
      url.includes('/tbk-consumption') ||
      url.includes('token_ws=') ||
      url.includes('callback=dyzgo_final')
    );
  };

  const commitConsumptionPayment = async () => {
    setPaymentUrl(null);
    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('webpay', {
        body: { action: 'commit_consumption', token_ws: authToken },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (error) throw error;

      const approved = data?.status === 'AUTHORIZED' && data?.response_code === 0;
      if (approved) {
        router.replace('/(consumption)/consumption-confirmation' as any);
      } else {
        Alert.alert('Pago rechazado', 'El banco no autorizó la transacción.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message, [{ text: 'OK', onPress: () => router.back() }]);
    } finally {
      setProcessing(false);
    }
  };

  const handleShouldStartLoadWithRequest = (request: any): boolean => {
    if (isCallbackUrl(request.url) && authToken) {
      if (!commitAttempted.current) {
        commitAttempted.current = true;
        commitConsumptionPayment();
      }
      return false;
    }
    return true;
  };

  const handleWebViewNav = (navState: any) => {
    if (isCallbackUrl(navState.url) && authToken) {
      if (!commitAttempted.current) {
        commitAttempted.current = true;
        webViewRef.current?.stopLoading();
        commitConsumptionPayment();
      }
    }
  };

  const handleOneClickPayment = async () => {
    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión');

      const { data, error } = await supabase.functions.invoke('webpay', {
        body: {
          action: 'authorize_oneclick_consumption',
          order_id: orderId,
          card_id: selectedMethod,
          user_id: session.user.id,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      if (data?.status === 'SUCCESS') {
        router.replace('/(consumption)/consumption-confirmation' as any);
      } else {
        throw new Error(data?.error || 'Pago rechazado');
      }
    } catch (e: any) {
      Alert.alert('Error en Pago', e.message);
    } finally {
      setProcessing(false);
    }
  };

  // Skeleton mientras crea la reserva
  if (loadingReservation) return (
    <View style={[styles.container, { paddingTop: navTop }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={[withAlpha(accentColor, 0.18), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', withAlpha(accentColor, 0.12)]} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </View>
      <NavBar title="CONSUMOS — PAGO" onBack={() => router.back()} accentColor={accentColor} />
      <View style={{ flex: 1, padding: 20 }}>
        <SkeletonBox height={70} borderRadius={16} style={{ marginBottom: 16 }} />
        <SkeletonBox height={180} borderRadius={16} style={{ marginBottom: 16 }} />
        <SkeletonBox height={24} borderRadius={6} width="40%" style={{ marginBottom: 12 }} />
        <SkeletonBox height={72} borderRadius={16} style={{ marginBottom: 10 }} />
        <SkeletonBox height={72} borderRadius={16} style={{ marginBottom: 10 }} />
        <SkeletonBox height={44} borderRadius={12} width="55%" style={{ marginTop: 4 }} />
      </View>
      <View style={{ padding: 20 }}>
        <SkeletonBox height={56} borderRadius={16} />
      </View>
    </View>
  );

  // Pantalla WebView
  if (paymentUrl) {
    if (Platform.OS === 'web') {
      return <WebRedirector url={paymentUrl} token={authToken} color={accentColor} />;
    }

    return (
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <WebView
          ref={webViewRef}
          source={{
            uri: paymentUrl,
            method: 'POST',
            body: `token_ws=${authToken}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          }}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          onNavigationStateChange={handleWebViewNav}
          onLoadStart={(e) => {
            const url = e.nativeEvent.url;
            if (isCallbackUrl(url) && authToken && !commitAttempted.current) {
              commitAttempted.current = true;
              webViewRef.current?.stopLoading();
              commitConsumptionPayment();
            }
          }}
          style={{ flex: 1 }}
          startInLoadingState
          renderLoading={() => (
            <ActivityIndicator size="large" color={accentColor} style={StyleSheet.absoluteFill} />
          )}
        />
        <TouchableOpacity onPress={() => { setPaymentUrl(null); commitAttempted.current = false; }} style={styles.floatingCloseBtn}>
          <X color="#333" size={24} />
        </TouchableOpacity>
      </View>
    );
  }

  // Pantalla principal
  return (
    <ReAnimated.View entering={FadeInUp.duration(300).springify()} style={[styles.container, { paddingTop: navTop }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={[withAlpha(accentColor, 0.18), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', withAlpha(accentColor, 0.12)]} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', withAlpha(accentColor, 0.04), 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFill} />
      </View>

      <NavBar title="CONSUMOS — PAGO" onBack={() => router.back()} accentColor={accentColor} />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>

        {/* Info seguridad */}
        <ReAnimated.View entering={FadeInUp.duration(300).delay(0).springify()}>
          <View style={styles.infoBox}>
            <ShieldCheck color={accentColor} size={18} />
            <Text style={styles.infoBoxText}>
              Tus bebidas quedarán <Text style={{ fontWeight: '800', color: '#fff' }}>inactivas</Text> hasta que las actives en el evento.
            </Text>
          </View>
        </ReAnimated.View>

        {/* Detalle del pedido */}
        <ReAnimated.View entering={FadeInUp.duration(300).delay(80).springify()}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tu Pedido — {eventName}</Text>
            {cart.map((item, idx) => (
              <View key={idx} style={styles.row}>
                <Text style={styles.rowLabel}>{item.quantity}x {item.name}</Text>
                <Text style={styles.rowValue}>${(item.price * item.quantity).toLocaleString('es-CL')}</Text>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: '#fff', fontWeight: '900', fontSize: 16 }]}>Total a Pagar</Text>
              <Text style={[styles.rowValue, { color: accentColor, fontWeight: '900', fontSize: 18 }]}>
                ${total.toLocaleString('es-CL')}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <Zap size={12} color={COLORS.success} />
              <Text style={{ color: COLORS.success, fontSize: 11, fontWeight: '700' }}>Sin cargo por servicio</Text>
            </View>
          </View>
        </ReAnimated.View>

        {/* Método de pago */}
        <ReAnimated.View entering={FadeInUp.duration(300).delay(160).springify()}>
          <Text style={styles.sectionTitle}>Método de pago</Text>

          {/* WebPay */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setSelectedMethod('webpay')}
            style={[styles.paymentOption, selectedMethod === 'webpay' && {
              borderColor: withAlpha(accentColor, 0.7),
              backgroundColor: withAlpha(accentColor, 0.07),
            }]}
          >
            <View style={selectedMethod === 'webpay'
              ? [styles.radioSelected, { borderColor: accentColor }]
              : styles.radioUnselected}>
              {selectedMethod === 'webpay' && <View style={[styles.radioInner, { backgroundColor: accentColor }]} />}
            </View>
            <View style={{ flex: 1, marginLeft: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <CreditCard color={COLORS.textWhite} size={18} />
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

          {/* Tarjetas guardadas (OneClick) */}
          {savedCards.map(card => (
            <TouchableOpacity
              key={card.id}
              activeOpacity={0.8}
              onPress={() => setSelectedMethod(card.id)}
              style={[styles.paymentOption, { marginTop: 10 }, selectedMethod === card.id && {
                borderColor: withAlpha(accentColor, 0.7),
                backgroundColor: withAlpha(accentColor, 0.07),
              }]}
            >
              <View style={selectedMethod === card.id
                ? [styles.radioSelected, { borderColor: accentColor }]
                : styles.radioUnselected}>
                {selectedMethod === card.id && <View style={[styles.radioInner, { backgroundColor: accentColor }]} />}
              </View>
              <View style={{ flex: 1, marginLeft: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <CreditCard color={accentColor} size={18} />
                    <Text style={styles.paymentMethodTitle}>{card.card_type} •••• {card.card_number.slice(-4)}</Text>
                    <View style={[styles.oneClickBadge, { backgroundColor: accentColor }]}>
                      <Text style={styles.oneClickText}>1-CLICK</Text>
                    </View>
                  </View>
                  <Text style={styles.paymentMethodSubtitle}>Pago rápido sin salir de la app</Text>
                </View>
                <Image
                  source={{
                    uri: card.card_type?.toLowerCase().includes('visa')
                      ? 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Visa_Inc._logo.svg/2560px-Visa_Inc._logo.svg.png'
                      : 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/1280px-Mastercard-logo.svg.png'
                  }}
                  style={{ width: 35, height: 20 }}
                  contentFit="contain"
                  transition={150}
                  cachePolicy="memory-disk"
                />
              </View>
              {selectedMethod === card.id && <CheckCircle2 color={COLORS.success} size={18} style={{ marginLeft: 8 }} />}
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.addCardBtn} onPress={() => router.push('/payment-methods' as any)}>
            <Plus color={COLORS.textGray} size={18} />
            <Text style={styles.addCardText}>AGREGAR NUEVA TARJETA</Text>
          </TouchableOpacity>

          <View style={styles.secureFooter}>
            <Lock color={COLORS.textGray} size={13} />
            <Text style={styles.secureFooterText}>Pagos procesados de forma segura por Transbank</Text>
          </View>
        </ReAnimated.View>
      </ScrollView>

      {/* Timer flotante */}
      {loadingReservation ? (
        <BlurView intensity={80} tint="dark" style={styles.timerBar}>
          <ActivityIndicator color={accentColor} size="small" />
          <Text style={{ color: COLORS.textGray, fontSize: 12, marginLeft: 8 }}>Preparando pago...</Text>
        </BlurView>
      ) : timeLeft ? (
        <BlurView intensity={80} tint="dark" style={styles.timerBar}>
          <Clock color={COLORS.warning} size={15} />
          <Text style={styles.timerText}>Sesión expira en: <Text style={{ fontWeight: '800' }}>{timeLeft}</Text></Text>
        </BlurView>
      ) : null}

      {/* Footer botón */}
      <BlurView intensity={80} tint="dark" style={styles.footer}>
        <TouchableOpacity
          style={[styles.payBtn, (loadingReservation || processing) && { opacity: 0.5 }, {
            backgroundColor: withAlpha(accentColor, 0.15),
            borderWidth: 1,
            borderColor: withAlpha(accentColor, 0.35),
          }]}
          onPress={handlePaymentButtonPress}
          disabled={loadingReservation || processing}
          activeOpacity={0.65}
        >
          {processing
            ? <ActivityIndicator color={accentColor} />
            : <Text style={[styles.payBtnText, { color: accentColor }]}>
              {loadingReservation ? 'CARGANDO...' : 'FINALIZAR COMPRA'}
            </Text>
          }
        </TouchableOpacity>
      </BlurView>

      {/* Modal confirmación WebPay */}
      <Modal visible={showWebpayModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowWebpayModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowWebpayModal(false)} activeOpacity={1} />
          <BlurView intensity={80} tint="dark" style={styles.modalCard}>
            <View style={[styles.modalIconBg, { backgroundColor: withAlpha(accentColor, 0.12), borderColor: withAlpha(accentColor, 0.25) }]}>
              <Lock color={accentColor} size={28} />
            </View>
            <Text style={styles.modalTitle}>Ir a Webpay</Text>
            <Text style={styles.modalSubtitle}>
              Serás redirigido a Webpay para pagar{' '}
              <Text style={{ color: '#fff', fontWeight: '800' }}>${total.toLocaleString('es-CL')}</Text>.
              {timeLeft ? `\nTienes ${timeLeft} para completarlo.` : ''}
            </Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowWebpayModal(false)}>
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

      {/* Modal confirmación OneClick */}
      <Modal visible={showOneClickModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowOneClickModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowOneClickModal(false)} activeOpacity={1} />
          <BlurView intensity={80} tint="dark" style={styles.modalCard}>
            <View style={[styles.modalIconBg, { backgroundColor: withAlpha(accentColor, 0.12), borderColor: withAlpha(accentColor, 0.25) }]}>
              <CreditCard color={accentColor} size={28} />
            </View>
            <Text style={styles.modalTitle}>Confirmar Pago</Text>
            <Text style={styles.modalSubtitle}>
              ¿Pagar <Text style={{ color: '#fff', fontWeight: '800' }}>${total.toLocaleString('es-CL')}</Text> con tu tarjeta guardada?
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
    </ReAnimated.View>
  );
}

const WebRedirector = ({ url, token, color }: any) => {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'token_ws';
    input.value = token || '';
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  }, [url, token]);

  return (
    <View style={{ flex: 1, backgroundColor: '#030303', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={color} />
      <Text style={{ color: 'white', marginTop: 20, fontWeight: '700', fontSize: 16 }}>Redirigiendo a Webpay Seguro...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDark },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  infoBoxText: { color: COLORS.textGray, fontSize: 12, flex: 1, lineHeight: 18 },
  card: { backgroundColor: COLORS.glassBg, borderRadius: 20, borderWidth: 1, borderColor: COLORS.glassBorder, padding: 20, marginBottom: 16 },
  cardTitle: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  rowLabel: { color: COLORS.textWhite, fontWeight: '600', fontSize: 14, flex: 1 },
  rowValue: { color: 'rgba(255,255,255,0.7)', fontWeight: '800', fontSize: 14 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 10 },
  sectionTitle: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, marginTop: 4 },
  paymentOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glassBg, borderRadius: 18, borderWidth: 1, borderColor: COLORS.glassBorder, padding: 16 },
  radioSelected: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  radioUnselected: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  paymentMethodTitle: { color: COLORS.textWhite, fontWeight: '700', fontSize: 14 },
  paymentMethodSubtitle: { color: COLORS.textGray, fontSize: 11, marginTop: 2 },
  oneClickBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  oneClickText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  addCardBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 6, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.12)', justifyContent: 'center' },
  addCardText: { color: COLORS.textGray, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  secureFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 16, marginBottom: 8 },
  secureFooterText: { color: 'rgba(255,255,255,0.25)', fontSize: 11 },
  timerBar: { position: 'absolute', bottom: 90, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  timerText: { color: COLORS.textGray, fontSize: 13 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 36, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 20 },
  payBtnText: { fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
  floatingCloseBtn: { position: 'absolute', top: 55, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.15)', justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 24 },
  modalCard: { width: '100%', maxWidth: Platform.OS === 'web' ? 400 : undefined, borderRadius: 28, padding: 28, alignItems: 'center', gap: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  modalIconBg: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', borderWidth: 1, marginBottom: 4 },
  modalTitle: { color: '#fff', fontWeight: '900', fontSize: 20 },
  modalSubtitle: { color: COLORS.textGray, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  modalBtnRow: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 8 },
  modalBtnCancel: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center' },
  modalBtnCancelText: { color: COLORS.textGray, fontWeight: '700', fontSize: 14 },
  modalBtnConfirm: { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  modalBtnConfirmText: { fontWeight: '900', fontSize: 14 },
});
