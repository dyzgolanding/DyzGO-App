import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import ReAnimated, { LinearTransition, Easing, Extrapolation, FadeIn, FadeOut, FadeInDown, FadeInRight, SlideInRight, SlideInDown, SlideOutDown, interpolate, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from '../../components/BlurSurface';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { useFocusEffect } from 'expo-router';
import {
    AlertCircle, ArrowLeft, ArrowUpDown, Calendar, Check, ChevronDown, ChevronRight, ChevronUp,
    Filter, Gavel, Ghost, Plus, ShoppingBag, Tag, Trash, Users, X,
    Ticket, Landmark, User, Hash, CreditCard, Receipt, Music, Store
} from 'lucide-react-native';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, Dimensions, FlatList,
    InteractionManager, KeyboardAvoidingView, Modal, Platform,
    RefreshControl, ScrollView, StyleSheet, Text,
    TextInput, TouchableOpacity, View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import { sendPushNotification } from '../../lib/push';
import { isEventFinished } from '../../utils/format';
import { supabase } from '../../lib/supabase';
import { SkeletonBox } from '../../components/SkeletonBox';
import { AnimatedEntry } from '../../components/animated/AnimatedEntry';
import { PressableScale } from '../../components/animated/PressableScale';
import { EmptyStateCard } from '../../components/EmptyStateCard';

const { width: windowWidth, height } = Dimensions.get('window');
const width = Platform.OS === 'web' ? Math.min(windowWidth, 800) : windowWidth;
const TAB_W = (width - 48) / 2;

// ── CONSTANTES DE FILTROS ──
const SORT_OPTIONS = ['Menor precio primero', 'Mayor precio primero'];
const DATE_OPTIONS = ['Hoy', 'Mañana', 'Esta Semana', 'Cualquiera'];
const AGE_OPTIONS = ['Todo Público', '+18', '+21'];
const CATEGORY_OPTIONS = ['Sunset', 'Rooftop', 'Afteroffice', 'Afterparty', 'Universitario', 'Nocturno'];
const MUSIC_OPTIONS = ['Reggaeton', 'Techno', 'House', 'Edm', 'Trap'];



const BANKS_CHILE = [
    'Banco Estado', 'Banco de Chile', 'Banco Santander', 'BCI',
    'Scotiabank', 'Itaú', 'Banco Falabella', 'Banco Security',
    'Bice', 'Tenpo', 'Mach', 'Mercado Pago', 'Coopeuch', 'Otro'
];
const ACCOUNT_TYPES = ['Cuenta Vista / RUT', 'Cuenta Corriente', 'Cuenta de Ahorro'];

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
    active: { label: 'EN VENTA', color: COLORS.neonGreen, bg: 'rgba(0,255,136,0.1)' },
    reserved: { label: 'RESERVADO', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
    sold: { label: 'VENDIDO', color: COLORS.textZinc, bg: 'rgba(255,255,255,0.05)' },
    cancelled: { label: 'CANCELADO', color: '#FF4444', bg: 'rgba(255,68,68,0.1)' },
};

const AnimatedFlatList = ReAnimated.createAnimatedComponent(FlatList);

// ─────────────────────────────────────────────────────────────
// CARD CARRUSEL VERTICAL MARKETPLACE
// ─────────────────────────────────────────────────────────────
const MarketCard = memo(function MarketCard({ item, index, cardH, scrollY, currentUserId, mode, myPendingOffer, onOffer, onBuy, onPayNow, onOpenOffers, onCancel, onCancelMyOffer }: {
    item: any; index: number; cardH: number; scrollY: any;
    currentUserId: string | null;
    mode: 'buy' | 'sell';
    myPendingOffer?: any;
    onOffer?: (item: any) => void;
    onBuy?: (item: any, direct: boolean) => void;
    onPayNow?: (item: any) => void;
    onOpenOffers?: (item: any) => void;
    onCancel?: (id: string) => void;
    onCancelMyOffer?: (offerId: string) => void;
}) {
    const mine = item.status === 'reserved' && item.reserved_for_user_id === currentUserId;
    const bid = item.current_highest_bid || 0;
    const eventImg = item.tickets?.events?.image_url;
    const eventTitle = item.tickets?.events?.title || 'Evento';
    const tierName = item.tickets?.ticket_tiers?.name || 'General';
    const pending = mode === 'sell' && item.status === 'active' ? (item.resale_offers || []).filter((o: any) => o.status === 'pending') : [];
    const cfg = mode === 'sell' ? (STATUS[item.status] || STATUS.active) : null;
    const isSold = item.status === 'sold';

    const animStyle = useAnimatedStyle(() => {
        const dist = Math.abs(scrollY.value - index * cardH);
        const scale = interpolate(dist, [0, cardH], [1, 0.88], Extrapolation.CLAMP);
        const opacity = interpolate(dist, [0, cardH], [1, 0.45], Extrapolation.CLAMP);
        return { opacity, transform: [{ scale }] };
    });

    return (
        <AnimatedEntry index={index} fromY={40} fromScale={0.95}>
            <ReAnimated.View style={[{ height: cardH, paddingHorizontal: 20, paddingVertical: 8 }, animStyle]}>
                <View style={{ flex: 1, overflow: 'hidden', borderRadius: 28 }}>
                    <BlurView intensity={30} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: isSold ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)' }]} />

                {/* IMAGEN HERO */}
                <View style={{ flex: 1, overflow: 'hidden' }}>
                    {eventImg ? (
                        <ExpoImage source={{ uri: eventImg }} style={[StyleSheet.absoluteFill, isSold && { opacity: 0.35 }]} contentFit="cover" placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }} />
                    ) : (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }]}>
                            <Ticket color={COLORS.neonPink} size={48} opacity={isSold ? 0.2 : 0.4} />
                        </View>
                    )}
                    <LinearGradient colors={['transparent', isSold ? 'rgba(3,3,3,0.98)' : 'rgba(3,3,3,0.95)']} locations={[0.4, 1]} style={StyleSheet.absoluteFill} />

                    {/* Fila badges — arriba del precio (bottom: 68 = 20 + 42 lineHeight + 6 gap) */}
                    <View style={{ position: 'absolute', bottom: 68, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ gap: 4 }}>
                            {mine && (
                                <BlurView intensity={30} tint="dark" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, overflow: 'hidden', alignSelf: 'flex-start' }}>
                                    <Ticket size={11} color="#F59E0B" />
                                    <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '900' }}>RESERVADO PARA TI</Text>
                                </BlurView>
                            )}
                            {myPendingOffer && !mine && (
                                <BlurView intensity={30} tint="dark" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, overflow: 'hidden', alignSelf: 'flex-start' }}>
                                    <Gavel size={11} color={COLORS.neonGreen} />
                                    <Text style={{ color: COLORS.neonGreen, fontSize: 11, fontWeight: '900' }}>MI OFERTA: ${myPendingOffer.offered_price.toLocaleString('es-CL')}</Text>
                                </BlurView>
                            )}
                        </View>
                        <View style={{ gap: 4, alignItems: 'flex-end', flex: 1 }}>
                            {cfg && (
                                <BlurView intensity={30} tint="dark" style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden', alignSelf: 'flex-end' }}>
                                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: cfg.color }} />
                                    <Text style={{ color: cfg.color, fontSize: 10, fontWeight: '900' }}>{cfg.label}</Text>
                                </BlurView>
                            )}
                        </View>
                    </View>

                    {/* Precio + tier — siempre en bottom: 20, fijo en la esquina */}
                    <View style={{ position: 'absolute', bottom: 20, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: isSold ? 'rgba(255,255,255,0.3)' : COLORS.neonPink, fontSize: 38, fontWeight: '900', fontStyle: 'italic', letterSpacing: -2, lineHeight: 42 }}>
                            ${item.price.toLocaleString('es-CL')}
                        </Text>
                        <BlurView intensity={30} tint="dark" style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, overflow: 'hidden', maxWidth: 160 }}>
                            <Text style={{ color: isSold ? 'rgba(255,255,255,0.4)' : 'white', fontSize: 12, fontWeight: '800' }} numberOfLines={1}>{tierName}</Text>
                        </BlurView>
                    </View>
                </View>

                {/* CONTENIDO */}
                <View style={{ padding: 20, gap: 14 }}>
                    <View>
                        <Text style={{ color: isSold ? 'rgba(255,255,255,0.4)' : 'white', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }} numberOfLines={1}>{eventTitle}</Text>
                        {bid > 0 && !mine && !myPendingOffer && mode === 'buy' && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                                <Gavel color={COLORS.neonPink} size={14} />
                                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '500' }}>
                                    Oferta máx: <Text style={{ color: COLORS.neonPink, fontWeight: '800' }}>${bid.toLocaleString('es-CL')}</Text>
                                </Text>
                            </View>
                        )}
                        {mode === 'sell' && pending.length > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                                <Gavel color={COLORS.neonPink} size={14} />
                                <Text style={{ color: COLORS.neonPink, fontSize: 13, fontWeight: '700' }}>{pending.length} oferta{pending.length > 1 ? 's' : ''} pendiente{pending.length > 1 ? 's' : ''}</Text>
                            </View>
                        )}
                        {isSold && mode === 'sell' && (
                            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 4 }}>Esta entrada ya fue vendida.</Text>
                        )}
                    </View>

                    {/* ACCIONES */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        {mode === 'buy' ? (
                            mine ? (
                                <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }} onPress={() => onPayNow?.(item)}>
                                    <CreditCard color="#F59E0B" size={16} />
                                    <Text style={{ color: '#F59E0B', fontWeight: '900', fontSize: 15 }}>PAGAR AHORA</Text>
                                </TouchableOpacity>
                            ) : myPendingOffer ? (
                                <>
                                    <View style={{ flex: 1, backgroundColor: 'rgba(0,255,136,0.1)', borderWidth: 1, borderColor: 'rgba(0,255,136,0.25)', borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: COLORS.neonGreen, fontWeight: '900', fontSize: 13 }}>OFERTA ENVIADA</Text>
                                    </View>
                                    <TouchableOpacity style={{ width: 52, backgroundColor: 'rgba(255,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)', borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' }} onPress={() => onCancelMyOffer?.(myPendingOffer.id)}>
                                        <X size={18} color="#FF4444" />
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <>
                                    <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }} onPress={() => onOffer?.(item)}>
                                        <Gavel color="white" size={15} />
                                        <Text style={{ color: 'white', fontWeight: '800', fontSize: 14 }}>OFERTAR</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(255,49,216,0.15)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.3)', borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }} onPress={() => onBuy?.(item, true)}>
                                        <Text style={{ color: COLORS.neonPink, fontWeight: '900', fontSize: 14 }}>COMPRAR</Text>
                                    </TouchableOpacity>
                                </>
                            )
                        ) : isSold ? (
                            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}>
                                <Text style={{ color: 'rgba(255,255,255,0.25)', fontWeight: '700', fontSize: 14 }}>VENDIDO</Text>
                            </View>
                        ) : item.status === 'active' ? (
                            <>
                                {pending.length > 0 && (
                                    <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(255,49,216,0.15)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.3)', borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }} onPress={() => onOpenOffers?.(item)}>
                                        <Gavel color={COLORS.neonPink} size={15} />
                                        <Text style={{ color: COLORS.neonPink, fontWeight: '900', fontSize: 14 }}>{pending.length} OFERTA{pending.length > 1 ? 'S' : ''}</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity style={[pending.length > 0 ? { width: 52 } : { flex: 1 }, { backgroundColor: 'rgba(255,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)', borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' }]} onPress={() => onCancel?.(item.id)}>
                                    {pending.length > 0 ? <Trash size={18} color="#FF4444" /> : <Text style={{ color: '#FF4444', fontWeight: '800', fontSize: 14 }}>RETIRAR DEL MERCADO</Text>}
                                </TouchableOpacity>
                            </>
                        ) : item.status === 'reserved' ? (
                            <View style={{ flex: 1, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)', borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}>
                                <Text style={{ color: '#F59E0B', fontWeight: '900', fontSize: 14 }}>ESPERANDO PAGO</Text>
                            </View>
                        ) : null}
                    </View>
                </View>
            </View>
        </ReAnimated.View>
        </AnimatedEntry>
    );
});

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function MarketplaceScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    
    // Ocultamiento seguro para native (en web, unmountOnBlur hace esto automáticamente)
    const [isScreenFocused, setIsScreenFocused] = useState(true);
    useFocusEffect(
        useCallback(() => {
            if (Platform.OS === 'web') return;
            setIsScreenFocused(true);
            return () => setIsScreenFocused(false);
        }, [])
    );


    // ── DATA ──
    const [listings, setListings] = useState<any[]>([]);
    const [myListings, setMyListings] = useState<any[]>([]);
    const [myBuyerOffers, setMyBuyerOffers] = useState<any[]>([]);
    const [eventList, setEventList] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // ── CARRUSEL VERTICAL MARKET ──
    const [marketListH, setMarketListH] = useState(0);
    const marketScrollY = useSharedValue(0);
    const marketScrollHandler = useAnimatedScrollHandler(e => { marketScrollY.value = e.contentOffset.y; });
    const sellScrollY = useSharedValue(0);
    const sellScrollHandler = useAnimatedScrollHandler(e => { sellScrollY.value = e.contentOffset.y; });

    // ── FADE ENTRADA ──
    const contentOpacity  = useSharedValue(0);
    const contentTranslateY = useSharedValue(10);
    const contentStyle = useAnimatedStyle(() => ({
        flex: 1,
        opacity:   contentOpacity.value,
        transform: [{ translateY: contentTranslateY.value }],
    }));
    useEffect(() => {
        if (loading) {
            contentOpacity.value    = 0;
            contentTranslateY.value = 10;
        } else {
            contentOpacity.value    = withTiming(1, { duration: 180 });
            contentTranslateY.value = withTiming(0, { duration: 180 });
        }
    }, [loading]);

    // ── TABS con PanResponder ──
    const [tab, setTab] = useState<'market' | 'selling'>('market');
    const switchTab = (t: 'market' | 'selling') => {
        setTab(t);
        if (t === 'selling') fetchMyTickets();
    };

    // Altura de cada tarjeta (igual que explore: menor que el contenedor para que se vea la anterior)
    const CARD_TOP_PAD = insets.top + 155;
    const CARD_BOT_PAD = insets.bottom + 136;
    const cardSnapH = marketListH > 0 ? marketListH - CARD_TOP_PAD - CARD_BOT_PAD : 0;

    // ── FILTROS ──
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [activeFilterModal, setActiveFilterModal] = useState<string | null>(null);
    const [filters, setFilters] = useState({
        event: '',
        sortBy: 'Menor precio primero',
        date: 'Cualquiera',
        category: '',
        musicGenre: '',
        minAge: ''
    });

    // ── VENTA ──
    const [sellModal, setSellModal] = useState(false);
    const [sellStep, setSellStep] = useState(1);
    const [sellSubStep, setSellSubStep] = useState(1);
    const [myTickets, setMyTickets] = useState<any[]>([]);
    const [loadingTickets, setLoadingTickets] = useState(false);
    const [ticketToSell, setTicketToSell] = useState<any>(null);
    const [sellPrice, setSellPrice] = useState('');
    const [bankData, setBankData] = useState({ holderName: '', bank: '', type: '', number: '', rut: '' });
    const [publishing, setPublishing] = useState(false);

    // ── OFERTA ──
    const [offerModal, setOfferModal] = useState(false);
    const [selectedListing, setSelectedListing] = useState<any>(null);
    const [offerPrice, setOfferPrice] = useState('');
    const [offering, setOffering] = useState(false);

    // ── GESTIÓN OFERTAS ──
    const [offersModal, setOffersModal] = useState(false);
    const [managingListing, setManagingListing] = useState<any>(null);
    const [incomingOffers, setIncomingOffers] = useState<any[]>([]);

    // ── COMPRA ──
    const [buyModal, setBuyModal] = useState(false);
    const [buyItem, setBuyItem] = useState<any>(null);
    const [isDirectBuy, setIsDirectBuy] = useState(true);
    const [savedCards, setSavedCards] = useState<any[]>([]);
    const [selectedMethod, setSelectedMethod] = useState<string>('webpay');

    // ── INTERACTIVE DISMISS ──
    const sellOffset = useSharedValue(height);
    const offerOffset = useSharedValue(height);
    const filterOffset = useSharedValue(height);

    const _resetSell = () => { setSellModal(false); setSellStep(1); setSellSubStep(1); setSellPrice(''); setBankData({ holderName: '', bank: '', type: '', number: '', rut: '' }); };
    const _resetOffer = () => { setOfferModal(false); setOfferPrice(''); };
    const _resetFilter = () => { setShowFilterMenu(false); setActiveFilterModal(null); };

    const closeSellModal = () => {
        sellOffset.value = withTiming(height, { duration: 320, easing: Easing.inOut(Easing.quad) }, () => { runOnJS(_resetSell)(); });
    };
    const closeOfferModal = () => {
        offerOffset.value = withTiming(height, { duration: 320, easing: Easing.inOut(Easing.quad) }, () => { runOnJS(_resetOffer)(); });
    };
    const closeFilterModal = () => {
        filterOffset.value = withTiming(height, { duration: 320, easing: Easing.inOut(Easing.quad) }, () => { runOnJS(_resetFilter)(); });
    };

    const sellSheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sellOffset.value }] }));
    const sellOverlayStyle = useAnimatedStyle(() => ({ opacity: interpolate(sellOffset.value, [0, height], [1, 0], Extrapolation.CLAMP) }));

    const offerSheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offerOffset.value }] }));
    const offerOverlayStyle = useAnimatedStyle(() => ({ opacity: interpolate(offerOffset.value, [0, height], [1, 0], Extrapolation.CLAMP) }));

    const filterSheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: filterOffset.value }] }));
    const filterOverlayStyle = useAnimatedStyle(() => ({ opacity: interpolate(filterOffset.value, [0, height], [1, 0], Extrapolation.CLAMP) }));

    useEffect(() => {
        if (sellModal) {
            sellOffset.value = height;
            sellOffset.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
        }
    }, [sellModal]);

    useEffect(() => {
        if (offerModal) {
            offerOffset.value = height;
            offerOffset.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
        }
    }, [offerModal]);

    useEffect(() => {
        if (showFilterMenu) {
            filterOffset.value = height;
            filterOffset.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
        }
    }, [showFilterMenu]);

    const sellPan = Gesture.Pan()
        .onUpdate(e => { if (e.translationY > 0) sellOffset.value = e.translationY; })
        .onEnd(e => {
            if (e.translationY > 100 || e.velocityY > 800) {
                sellOffset.value = withTiming(height, { duration: 250 }, () => { runOnJS(_resetSell)(); });
            } else {
                sellOffset.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
            }
        });

    const offerPan = Gesture.Pan()
        .onUpdate(e => { if (e.translationY > 0) offerOffset.value = e.translationY; })
        .onEnd(e => {
            if (e.translationY > 100 || e.velocityY > 800) {
                offerOffset.value = withTiming(height, { duration: 250 }, () => { runOnJS(_resetOffer)(); });
            } else {
                offerOffset.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
            }
        });

    const filterPan = Gesture.Pan()
        .onUpdate(e => { if (e.translationY > 0) filterOffset.value = e.translationY; })
        .onEnd(e => {
            if (e.translationY > 100 || e.velocityY > 800) {
                filterOffset.value = withTiming(height, { duration: 250 }, () => { runOnJS(_resetFilter)(); });
            } else {
                filterOffset.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
            }
        });

    // ─── INIT ───
    useEffect(() => {
        const task = InteractionManager.runAfterInteractions(() => { init(); });
        return () => task.cancel();
    }, []);
    useEffect(() => { if (currentUserId) fetchData(); }, [currentUserId]);

    const init = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setCurrentUserId(user.id);
        } else {
            setLoading(false);
        }
    };

    const fetchData = async () => {
        if (!currentUserId) return;
        try {
            const [evtsRes, mktRes, mineRes, offersRes] = await Promise.all([
                supabase.from('events').select('title, is_resellable').eq('is_active', true),
                supabase.from('resale_listings')
                    .select('*, tickets!inner(*, events(*), ticket_tiers(name))')
                    .neq('seller_id', currentUserId)
                    .in('status', ['active', 'reserved'])
                    .order('created_at', { ascending: false }),
                supabase.from('resale_listings')
                    .select('*, tickets!inner(*, events(*), ticket_tiers(name)), resale_offers(*)')
                    .eq('seller_id', currentUserId)
                    .neq('status', 'cancelled')
                    .order('created_at', { ascending: false }),
                supabase.from('resale_offers')
                    .select('*')
                    .eq('buyer_id', currentUserId)
                    .eq('status', 'pending'),
            ]);

            if (evtsRes.data) {
                const allowedEvents = evtsRes.data.filter(e => e.is_resellable !== false).map(e => e.title);
                setEventList(Array.from(new Set(allowedEvents)));
            }
            if (mktRes.error) throw mktRes.error;
            setListings((mktRes.data || []).filter(l =>
                l.status === 'active' || (l.status === 'reserved' && l.reserved_for_user_id === currentUserId)
            ));
            if (mineRes.error) throw mineRes.error;
            const sorted = (mineRes.data || []).slice().sort((a: any, b: any) => {
                const aS = a.status === 'sold' ? 1 : 0;
                const bS = b.status === 'sold' ? 1 : 0;
                return aS - bS;
            });
            setMyListings(sorted);
            setMyBuyerOffers(offersRes.data || []);
        } catch (e: any) {
            console.error('[marketplace]', e);
        } finally { setLoading(false); }
    };

    const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

    const fetchMyTickets = async () => {
        setLoadingTickets(true);
        try {
            const { data: td } = await supabase.from('tickets')
                .select('*, events(*), ticket_tiers(name)')
                .eq('user_id', currentUserId).eq('status', 'valid').eq('used', false);
            const { data: al } = await supabase.from('resale_listings').select('ticket_id').eq('status', 'active');
            const used = al?.map(l => l.ticket_id) || [];
            setMyTickets((td || []).filter(t => !used.includes(t.id) && !isEventFinished(t.events)));
        } catch (e: any) { console.error(e); } finally { setLoadingTickets(false); }
    };

    const handlePublish = async () => {
        if (!sellPrice || !bankData.rut || !ticketToSell) { Alert.alert('Faltan datos'); return; }
        setPublishing(true);
        try {
            const { error } = await supabase.rpc('publish_ticket_for_resale', {
                p_ticket_id: ticketToSell.id, p_seller_id: currentUserId,
                p_price: parseFloat(sellPrice), p_bank_data: bankData,
            });
            if (error) throw error;
            Alert.alert('¡Publicado!', 'Tu ticket ya está en el mercado.');
            setSellModal(false); setSellStep(1); onRefresh();
        } catch (e: any) { Alert.alert('Error', e.message); } finally { setPublishing(false); }
    };

    const handleCancel = (id: string) => {
        Alert.alert('Retirar publicación', '¿Seguro que quieres retirar tu ticket del mercado?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Sí, retirar', style: 'destructive', onPress: async () => {
                    try {
                        const { error } = await supabase.from('resale_listings').update({ status: 'cancelled' }).eq('id', id);
                        if (error) throw error;
                        onRefresh();
                    } catch (e: any) { Alert.alert('Error', e.message); }
                }
            },
        ]);
    };

    const fetchPaymentMethods = async () => {
        if (!currentUserId) return;
        try {
            const { data } = await supabase
                .from('user_payment_methods')
                .select('*')
                .eq('user_id', currentUserId)
                .order('created_at', { ascending: false });
            setSavedCards(data || []);
        } catch (e) { console.error(e); }
    };

    const rejectOffer = (offer: any) => {
        Alert.alert('Rechazar oferta', `¿Rechazar la oferta de $${offer.offered_price.toLocaleString('es-CL')}?`, [
            { text: 'No', style: 'cancel' },
            {
                text: 'Rechazar', style: 'destructive', onPress: async () => {
                    try {
                        const { error } = await supabase.rpc('reject_resale_offer', {
                            p_offer_id: offer.id, p_seller_id: currentUserId,
                        });
                        if (error) throw error;
                        setIncomingOffers(prev => prev.filter((o: any) => o.id !== offer.id));
                        if (managingListing?.id) {
                            await supabase.from('notifications').update({ is_read: true })
                                .eq('type', 'offer_received').eq('related_id', managingListing.id).eq('is_read', false);
                        }
                    } catch (e: any) { Alert.alert('Error', e.message); }
                }
            },
        ]);
    };

    const cancelMyOffer = (offerId: string) => {
        Alert.alert('Cancelar oferta', '¿Seguro que quieres cancelar tu oferta?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Sí, cancelar', style: 'destructive', onPress: async () => {
                    try {
                        const { error } = await supabase.rpc('cancel_resale_offer', {
                            p_offer_id: offerId, p_buyer_id: currentUserId,
                        });
                        if (error) throw error;
                        setMyBuyerOffers(prev => prev.filter((o: any) => o.id !== offerId));
                    } catch (e: any) { Alert.alert('Error', e.message); }
                }
            },
        ]);
    };

    const notifyUser = (userId: string, type: string, title: string, message: string, relatedId: string, pushTitle: string, pushBody: string) => {
        (async () => {
            try {
                await supabase.from('notifications').insert({
                    user_id: userId, type, title, message, related_id: relatedId, is_read: false,
                });
            } catch (e) { console.error(e); }
            try {
                const { data: profile } = await supabase.from('profiles').select('expo_push_token').eq('id', userId).single();
                if (profile?.expo_push_token) {
                    await sendPushNotification(profile.expo_push_token, pushTitle, pushBody, { url: '/notifications' });
                }
            } catch (e) { console.error(e); }
        })();
    };

    const handleOffer = async () => {
        if (!offerPrice || !selectedListing || !currentUserId) return;
        setOffering(true);
        try {
            const { error } = await supabase.rpc('create_resale_offer', {
                p_listing_id: selectedListing.id, p_buyer_id: currentUserId,
                p_offered_price: parseFloat(offerPrice),
            });
            if (error) throw error;

            // Notificación in-app + push al vendedor
            const sellerId = selectedListing.seller_id;
            const eventTitle = selectedListing.tickets?.events?.title;
            const priceStr = parseFloat(offerPrice).toLocaleString('es-CL');
            if (sellerId) {
                notifyUser(
                    sellerId,
                    'offer_received',
                    '¡Nueva oferta recibida!',
                    `Alguien ofreció $${priceStr}${eventTitle ? ` por tu entrada de ${eventTitle}` : ''}.`,
                    selectedListing.id,
                    '💰 ¡Nueva oferta!',
                    `Alguien ofreció $${priceStr}${eventTitle ? ` por tu entrada de ${eventTitle}` : ''}.`,
                );
            }

            Alert.alert('¡Oferta enviada!', 'El vendedor será notificado.');
            setOfferModal(false); setOfferPrice('');
        } catch (e: any) { Alert.alert('Error', e.message); } finally { setOffering(false); }
    };

    const openOffers = (listing: any) => {
        setManagingListing(listing);
        const pending = (listing.resale_offers || []).filter((o: any) => o.status === 'pending');
        pending.sort((a: any, b: any) => b.offered_price - a.offered_price);
        setIncomingOffers(pending);
        setOffersModal(true);
    };

    const acceptOffer = (offer: any) => {
        Alert.alert('Aceptar oferta', `¿Vender por $${offer.offered_price.toLocaleString('es-CL')}?`, [
            { text: 'Cancelar' },
            {
                text: 'Aceptar', onPress: async () => {
                    try {
                        const { error } = await supabase.rpc('accept_resale_offer', {
                            p_listing_id: managingListing.id, p_offer_id: offer.id, p_seller_id: currentUserId,
                        });
                        if (error) throw error;

                        // Notificar al comprador que su oferta fue aceptada
                        const buyerId = offer.buyer_id;
                        const eventTitle = managingListing.tickets?.events?.title;
                        const price = offer.offered_price.toLocaleString('es-CL');
                        if (buyerId) {
                            notifyUser(
                                buyerId,
                                'offer_accepted',
                                '¡Tu oferta fue aceptada!',
                                `Tu oferta de $${price}${eventTitle ? ` por ${eventTitle}` : ''} fue aceptada. Completa el pago para asegurar tu entrada.`,
                                managingListing.id,
                                '✅ ¡Oferta aceptada!',
                                `Tu oferta de $${price}${eventTitle ? ` por ${eventTitle}` : ''} fue aceptada.`,
                            );
                        }

                        // Marcar notificación como leída
                        if (managingListing?.id) {
                            await supabase.from('notifications').update({ is_read: true })
                                .eq('type', 'offer_received').eq('related_id', managingListing.id).eq('is_read', false);
                        }
                        setOffersModal(false); onRefresh();
                    } catch (e: any) { Alert.alert('Error', e.message); }
                }
            },
        ]);
    };

    const executeBuy = async () => {
        if (!buyItem) return;
        setBuyModal(false); setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();

            if (selectedMethod !== 'webpay') {
                // OneClick resale
                const { data, error } = await supabase.functions.invoke('webpay', {
                    body: { action: 'authorize_oneclick_resale', listing_id: buyItem.id, buyer_id: user?.id, card_id: selectedMethod },
                });
                if (error || data?.status !== 'SUCCESS') throw new Error(data?.error || error?.message || 'Pago rechazado');
                Alert.alert('¡Compra exitosa!', 'Tu ticket ha sido transferido.');
                onRefresh();
            } else {
                // Webpay Plus
                const { data, error } = await supabase.functions.invoke('webpay', {
                    body: { action: 'create_resale', listing_id: buyItem.id, buyer_id: user?.id },
                });
                if (error || !data?.token) throw new Error(error?.message || 'Sin token');
                router.push({ pathname: '/payment-resale', params: { url: data.url, token: data.token } });
            }
        } catch (e: any) { Alert.alert('Error de pago', e.message); } finally { setLoading(false); }
    };

    const totals = () => {
        if (!buyItem) return { base: 0, fee: 0, total: 0 };
        const base = isDirectBuy ? buyItem.price : buyItem.current_highest_bid;
        const fee = Math.round(base * 0.05);
        return { base, fee, total: Math.round(base * 1.05) };
    };


    // ── Timer ──
    const ReservationTimer = ({ exp }: { exp: string }) => {
        const [t, setT] = useState('');
        useEffect(() => {
            const iv = setInterval(() => {
                const d = new Date(exp).getTime() - Date.now();
                if (d < 0) { setT('Expirado'); clearInterval(iv); return; }
                setT(`${Math.floor((d % 3600000) / 60000)}m ${Math.floor((d % 60000) / 1000)}s`);
            }, 1000);
            return () => clearInterval(iv);
        }, [exp]);
        return <Text style={{ color: COLORS.neonPink, fontWeight: '700', fontSize: 12 }}>⏱ {t}</Text>;
    };

    // ── FORMATTERS ──
    const formatRut = (value: string) => {
        const clean = value.replace(/[^0-9kK]/g, '');
        if (clean.length === 0) return '';
        const verifier = clean.slice(-1).toUpperCase();
        const num = clean.slice(0, -1);
        if (num.length === 0) return verifier;
        let formatted = '';
        num.split('').reverse().forEach((digit, i) => {
            if (i > 0 && i % 3 === 0) formatted = '.' + formatted;
            formatted = digit + formatted;
        });
        return formatted + '-' + verifier;
    };
    const formatAccountNumber = (value: string) => value.replace(/[^0-9]/g, '');

    // ── FILTRO + ORDEN ──
    const filtered = listings
        .filter(item => {
            const ev = item.tickets?.events || {};

            let matchesEvent = true;
            if (filters.event !== '') {
                const itemTitle = ev.title ? ev.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
                const filterTitle = filters.event.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                matchesEvent = itemTitle === filterTitle;
            }

            let matchesCategory = true;
            if (filters.category) {
                const cat = ev.category || ev.tags || "";
                matchesCategory = cat.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
                    .includes(filters.category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
            }

            let matchesMusic = true;
            if (filters.musicGenre) {
                const music = ev.music_genre || "";
                matchesMusic = music.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
                    .includes(filters.musicGenre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
            }

            let matchesAge = true;
            if (filters.minAge) {
                const ageMen = ev.min_age_men || 18;
                const ageWomen = ev.min_age_women || 18;
                const effectiveMinAge = Math.min(ageMen, ageWomen);

                if (filters.minAge === '+18') matchesAge = effectiveMinAge >= 18;
                else if (filters.minAge === '+21') matchesAge = effectiveMinAge >= 21;
                else if (filters.minAge === 'Todo Público') matchesAge = true;
            }

            let matchesDate = true;
            if (filters.date !== 'Cualquiera') {
                if (!ev.date) {
                    matchesDate = false;
                } else {
                    const itemDate = new Date(ev.date + 'T00:00:00');
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

                    if (filters.date === 'Hoy') {
                        matchesDate = itemDate.getTime() === today.getTime();
                    } else if (filters.date === 'Mañana') {
                        matchesDate = itemDate.getTime() === tomorrow.getTime();
                    } else if (filters.date === 'Esta Semana') {
                        const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
                        matchesDate = itemDate >= today && itemDate <= nextWeek;
                    }
                }
            }

            return matchesEvent && matchesCategory && matchesMusic && matchesAge && matchesDate;
        })
        .sort((a, b) => {
            if (filters.sortBy === 'Menor precio primero') return a.price - b.price;
            if (filters.sortBy === 'Mayor precio primero') return b.price - a.price;
            return 0;
        });

    // ─────────────────────────────────────────────────────────────
    // RENDER CARD MERCADO (legacy — kept for reference, not used)
    // ─────────────────────────────────────────────────────────────
    const _renderMarket = ({ item, index }: { item: any; index: number }) => {
        const mine = item.status === 'reserved' && item.reserved_for_user_id === currentUserId;
        const bid = item.current_highest_bid || 0;
        const eventImg = item.tickets?.events?.image_url;
        const eventTitle = item.tickets?.events?.title || 'Evento';
        const tierName = item.tickets?.ticket_tiers?.name || 'General';

        return (
            <ReAnimated.View entering={FadeInDown.duration(300).delay(index * 18).springify()}>
                <View style={{ overflow: 'hidden', borderRadius: 24, marginBottom: 16 }}>
                    <BlurView intensity={30} tint="dark" style={[{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 1, borderColor: mine ? 'rgba(255,49,216,0.4)' : 'rgba(251, 251, 251, 0.05)' }]}>

                        {/* IMAGEN HERO */}
                        <View style={{ height: eventImg ? 140 : 80, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                            {eventImg ? (
                                <ExpoImage source={{ uri: eventImg }} style={StyleSheet.absoluteFill} contentFit="cover" placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }} />
                            ) : (
                                <Ticket color={COLORS.neonPink} size={32} opacity={0.5} />
                            )}
                            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFill} />

                            <View style={{ position: 'absolute', bottom: 12, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                <View>
                                    <Text style={{ color: COLORS.neonPink, fontSize: 34, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, lineHeight: 38 }}>
                                        ${item.price.toLocaleString('es-CL')}
                                    </Text>
                                    {mine && <Text style={{ color: COLORS.neonPink, fontSize: 10, fontWeight: '900', marginTop: 2 }}>RESERVADO</Text>}
                                </View>
                                <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                                    <Text style={{ color: 'white', fontSize: 11, fontWeight: '800' }}>{tierName}</Text>
                                </View>
                            </View>
                        </View>

                        {/* CONTENIDO Y ACCIONES */}
                        <View style={{ padding: 16, gap: 12 }}>
                            <View>
                                <Text style={{ color: 'white', fontSize: 18, fontWeight: '800', marginBottom: 4 }} numberOfLines={1}>{eventTitle}</Text>
                                {bid > 0 && !mine && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Gavel color={COLORS.neonPink} size={12} />
                                        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '500' }}>Oferta máx: <Text style={{ color: COLORS.neonPink, fontWeight: '800' }}>${bid.toLocaleString('es-CL')}</Text></Text>
                                    </View>
                                )}
                                {mine && <View style={{ marginTop: 4 }}><ReservationTimer exp={item.reserved_until} /></View>}
                            </View>

                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                                {mine ? (
                                    <TouchableOpacity style={{ flex: 1, backgroundColor: COLORS.neonPink, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }} onPress={() => { setBuyItem(item); setIsDirectBuy(false); setBuyModal(true); }}>
                                        <Text style={{ color: 'white', fontWeight: '900', fontSize: 14 }}>PAGAR AHORA</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <>
                                        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }} onPress={() => { setSelectedListing(item); setOfferModal(true); }}>
                                            <Gavel color="white" size={14} />
                                            <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>OFERTAR</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={{ flex: 1, backgroundColor: 'white', borderRadius: 14, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }} onPress={() => { setBuyItem(item); setIsDirectBuy(true); setBuyModal(true); }}>
                                            <Text style={{ color: '#000', fontWeight: '900', fontSize: 13 }}>COMPRAR</Text>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>
                        </View>
                    </BlurView>
                </View>
            </ReAnimated.View>
        );
    };

    // ─────────────────────────────────────────────────────────────
    // RENDER CARD MIS VENTAS (legacy — kept for reference, not used)
    // ─────────────────────────────────────────────────────────────
    const _renderSelling = ({ item, index }: { item: any; index: number }) => {
        const cfg = STATUS[item.status] || STATUS.active;
        const pending = (item.resale_offers || []).filter((o: any) => o.status === 'pending');
        const eventImg = item.tickets?.events?.image_url;
        const eventTitle = item.tickets?.events?.title || 'Evento';
        const tierName = item.tickets?.ticket_tiers?.name || 'General';

        return (
            <ReAnimated.View entering={FadeInDown.duration(300).delay(index * 18).springify()}>
                <View style={{ overflow: 'hidden', borderRadius: 24, marginBottom: 12 }}>
                    <BlurView intensity={20} tint="dark" style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 16 }}>

                        <View style={{ flexDirection: 'row', gap: 16 }}>
                            {eventImg ? (
                                <ExpoImage source={{ uri: eventImg }} style={{ width: 80, height: 80, borderRadius: 16 }} contentFit="cover" placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }} />
                            ) : (
                                <View style={{ width: 80, height: 80, borderRadius: 16, backgroundColor: 'rgba(255,49,216,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                                    <Ticket color={COLORS.neonPink} size={28} />
                                </View>
                            )}

                            <View style={{ flex: 1, justifyContent: 'space-between', paddingVertical: 2 }}>
                                {/* TITULO Y PRECIO JUNTOS */}
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <Text style={{ color: 'white', fontSize: 16, fontWeight: '800', flexShrink: 1, marginRight: 8, lineHeight: 20 }} numberOfLines={2}>{eventTitle}</Text>
                                    <Text style={{ color: COLORS.neonPink, fontWeight: '900', fontSize: 16, fontStyle: 'italic', letterSpacing: -0.5 }}>${item.price.toLocaleString('es-CL')}</Text>
                                </View>

                                {/* BADGES (TIPO DE TICKET Y ESTADO) */}
                                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                                    <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                                        <Text style={{ color: 'white', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }} numberOfLines={1}>{tierName}</Text>
                                    </View>
                                    <View style={{ backgroundColor: cfg.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: cfg.color }} />
                                        <Text style={{ color: cfg.color, fontSize: 10, fontWeight: '900' }}>{cfg.label}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        {item.status === 'active' && (
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                                {pending.length > 0 && (
                                    <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(255,49,216,0.15)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.3)', borderRadius: 12, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }} onPress={() => openOffers(item)}>
                                        <Gavel color={COLORS.neonPink} size={14} />
                                        <Text style={{ color: COLORS.neonPink, fontWeight: '900', fontSize: 13 }}>{pending.length} OFERTA{pending.length > 1 ? 'S' : ''}</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity style={[pending.length > 0 ? { width: 44 } : { flex: 1 }, { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)', borderRadius: 12, justifyContent: 'center', alignItems: 'center', paddingVertical: pending.length > 0 ? 0 : 12 }]} onPress={() => handleCancel(item.id)}>
                                    {pending.length > 0 ? (
                                        <Trash size={16} color="#FF4444" />
                                    ) : (
                                        <Text style={{ color: '#FF4444', fontWeight: '800', fontSize: 13 }}>RETIRAR DEL MERCADO</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        )}
                    </BlurView>
                </View>
            </ReAnimated.View>
        );
    };

    // ─────────────────────────────────────────────────────────────
    // RENDER FILTROS MODAL
    // ─────────────────────────────────────────────────────────────
    const renderMktFilterContent = () => {
        switch (activeFilterModal) {
            case 'event':
                return (
                    <>
                        <Text style={s.filterModalTitle}>Filtrar por Evento</Text>
                        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
                            <View style={s.verticalOptions}>
                                <TouchableOpacity style={s.optionRow} onPress={() => { setFilters({ ...filters, event: '' }); setActiveFilterModal(null); }}>
                                    <Text style={[s.optionText, filters.event === '' && s.optionTextActive]}>Todos los eventos</Text>
                                    {filters.event === '' && <Check size={18} color={COLORS.neonPink} />}
                                </TouchableOpacity>
                                {eventList.map(ev => (
                                    <TouchableOpacity key={ev} style={s.optionRow} onPress={() => { setFilters({ ...filters, event: ev }); setActiveFilterModal(null); }}>
                                        <Text style={[s.optionText, filters.event === ev && s.optionTextActive]}>{ev}</Text>
                                        {filters.event === ev && <Check size={18} color={COLORS.neonPink} />}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>
                    </>
                );
            case 'sort':
                return (
                    <>
                        <View style={s.verticalOptions}>
                            {SORT_OPTIONS.map(opt => (
                                <TouchableOpacity key={opt} style={s.optionRow} onPress={() => { setFilters({ ...filters, sortBy: opt }); setActiveFilterModal(null); }}>
                                    <Text style={[s.optionText, filters.sortBy === opt && s.optionTextActive]}>{opt}</Text>
                                    {filters.sortBy === opt && <Check size={18} color={COLORS.neonPink} />}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </>
                );
            case 'date':
                return (
                    <>
                        <View style={s.verticalOptions}>
                            {DATE_OPTIONS.map(opt => (
                                <TouchableOpacity key={opt} style={s.optionRow} onPress={() => { setFilters({ ...filters, date: opt }); setActiveFilterModal(null); }}>
                                    <Text style={[s.optionText, filters.date === opt && s.optionTextActive]}>{opt}</Text>
                                    {filters.date === opt && <Check size={18} color={COLORS.neonPink} />}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </>
                );
            case 'category':
                return (
                    <>
                        <View style={s.chipsContainer}>
                            {CATEGORY_OPTIONS.map(cat => (
                                <TouchableOpacity
                                    key={cat}
                                    style={[s.chip, filters.category === cat && s.chipActive]}
                                    onPress={() => setFilters({ ...filters, category: filters.category === cat ? '' : cat })}
                                >
                                    <Text style={[s.chipText, filters.category === cat && s.chipTextActive]}>{cat}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity style={s.mainBtn} onPress={() => setActiveFilterModal(null)}>
                            <Text style={s.mainBtnText}>Aplicar</Text>
                        </TouchableOpacity>
                    </>
                );
            case 'music': // NUEVO FILTRO MODAL
                return (
                    <>
                        <View style={s.chipsContainer}>
                            {MUSIC_OPTIONS.map(music => (
                                <TouchableOpacity
                                    key={music}
                                    style={[s.chip, filters.musicGenre === music && s.chipActive]}
                                    onPress={() => setFilters({ ...filters, musicGenre: filters.musicGenre === music ? '' : music })}
                                >
                                    <Text style={[s.chipText, filters.musicGenre === music && s.chipTextActive]}>{music}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity style={s.mainBtn} onPress={() => setActiveFilterModal(null)}>
                            <Text style={s.mainBtnText}>Aplicar</Text>
                        </TouchableOpacity>
                    </>
                );
            case 'age':
                return (
                    <>
                        <View style={s.verticalOptions}>
                            {AGE_OPTIONS.map(opt => (
                                <TouchableOpacity key={opt} style={s.optionRow} onPress={() => { setFilters({ ...filters, minAge: filters.minAge === opt ? '' : opt }); setActiveFilterModal(null); }}>
                                    <Text style={[s.optionText, filters.minAge === opt && s.optionTextActive]}>{opt}</Text>
                                    {filters.minAge === opt && <Check size={18} color={COLORS.neonPink} />}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </>
                );
            default:
                return null;
        }
    };

    const activeFiltersCount = [
        filters.event !== '',
        filters.date !== 'Cualquiera',
        filters.category !== '',
        filters.musicGenre !== '',
        filters.minAge !== '',
        filters.sortBy !== 'Menor precio primero',
    ].filter(Boolean).length;

    // ─────────────────────────────────────────────────────────────
    // JSX PRINCIPAL
    // ─────────────────────────────────────────────────────────────
    return (
        <View style={[{ flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#000' }, Platform.OS === 'web' && !isScreenFocused && { opacity: 0 }]} pointerEvents={Platform.OS === 'web' && !isScreenFocused ? 'none' : 'auto'}>
            {Platform.OS !== 'web' && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <LinearGradient colors={['rgba(255, 49, 216, 0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.05)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFill} />
            </View>
            )}

            <View style={{ position: 'absolute', zIndex: 100, left: 16, right: 16, top: insets.top + 10 }}>
                <BlurView intensity={50} tint="dark" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 60, paddingHorizontal: 16, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(251, 251, 251, 0.05)', backgroundColor: 'rgba(255, 255, 255, 0.05)', overflow: 'hidden' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ color: '#FBFBFB', fontSize: 24, fontWeight: '900', letterSpacing: -1, fontStyle: 'italic', paddingLeft: 4 }}>DyzGO<Text style={{ color: '#FF31D8' }}>.</Text></Text>
                    </View>
                    {currentUserId ? (
                        tab === 'market' ? (
                            <TouchableOpacity
                                onPress={() => setShowFilterMenu(true)}
                                style={{ position: 'relative', padding: 4 }}
                            >
                                <Filter size={24} color={activeFiltersCount > 0 ? '#FF31D8' : 'rgba(251,251,251,0.5)'} />
                                {activeFiltersCount > 0 && (
                                    <View style={{ position: 'absolute', top: 3, right: 3, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF31D8', borderWidth: 2, borderColor: '#030303' }} />
                                )}
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                onPress={() => { setLoadingTickets(true); setSellModal(true); fetchMyTickets(); }}
                                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,49,216,0.15)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.3)', justifyContent: 'center', alignItems: 'center' }}
                            >
                                <Plus color={COLORS.neonPink} size={20} />
                            </TouchableOpacity>
                        )
                    ) : null}
                </BlurView>
            </View>

            {/* ── PILL TABS flotando ── */}
            {currentUserId && (
                <View style={{ position: 'absolute', zIndex: 99, top: insets.top + 80, left: 0, right: 0, alignItems: 'center' }}>
                    <View style={{ overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(251,251,251,0.06)' }}>
                        <BlurView intensity={50} tint="dark" style={{ flexDirection: 'row', height: 44, padding: 4, gap: 2 }}>
                            <TouchableOpacity
                                onPress={() => switchTab('market')}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: tab === 'market' ? 'rgba(255,255,255,0.12)' : 'transparent' }}
                                activeOpacity={0.8}
                            >
                                <ShoppingBag size={14} color={tab === 'market' ? '#FF31D8' : 'rgba(251,251,251,0.45)'} />
                                <Text style={{ color: tab === 'market' ? '#FBFBFB' : 'rgba(251,251,251,0.45)', fontWeight: tab === 'market' ? '800' : '600', fontSize: 13 }}>Explorar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => switchTab('selling')}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: tab === 'selling' ? 'rgba(255,255,255,0.12)' : 'transparent' }}
                                activeOpacity={0.8}
                            >
                                <Tag size={14} color={tab === 'selling' ? '#FF31D8' : 'rgba(251,251,251,0.45)'} />
                                <Text style={{ color: tab === 'selling' ? '#FBFBFB' : 'rgba(251,251,251,0.45)', fontWeight: tab === 'selling' ? '800' : '600', fontSize: 13 }}>Mis Ventas</Text>
                            </TouchableOpacity>
                        </BlurView>
                    </View>
                </View>
            )}

            <ReAnimated.View style={[s.screen, contentStyle]}>

                {/* ── LISTA — ocupa toda la pantalla ── */}
                <View style={{ flex: 1 }} onLayout={e => setMarketListH(e.nativeEvent.layout.height)}>

                    {!currentUserId && !loading && (
                        <EmptyStateCard
                            icon={<Store color={COLORS.neonPink} size={32} />}
                            title="Marketplace"
                            subtitle="Inicia sesión para vivir la experiencia del marketplace y conseguir tickets a los mejores precios de la comunidad."
                            actionText="INICIAR SESIÓN"
                            onAction={() => router.push({ pathname: '/login', params: { redirect: '/(tabs)/marketplace' } } as any)}
                            marginTop={-60}
                        />
                    )}

                    {/* SKELETON — imita la forma de las cards de snap vertical */}
                    {loading && listings.length === 0 && tab === 'market' && (
                        <View style={[StyleSheet.absoluteFill, { zIndex: 1, paddingTop: CARD_TOP_PAD, paddingHorizontal: 20 }]}>
                            {[0].map(i => (
                                <View key={i} style={{ flex: 1, borderRadius: 28, overflow: 'hidden', marginBottom: 16 }}>
                                    {/* Área de imagen */}
                                    <SkeletonBox height="65%" borderRadius={0} />
                                    {/* Área de contenido */}
                                    <View style={{ padding: 20, gap: 14, backgroundColor: 'rgba(255,255,255,0.03)' }}>
                                        <SkeletonBox height={22} borderRadius={8} width="65%" />
                                        <SkeletonBox height={14} borderRadius={6} width="40%" />
                                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                                            <SkeletonBox height={52} borderRadius={16} width="48%" />
                                            <SkeletonBox height={52} borderRadius={16} width="48%" />
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* TAB EXPLORAR — siempre montado, display toggle */}
                    <View style={{ flex: 1, display: (currentUserId && tab === 'market') ? 'flex' : 'none' }}>
                        {cardSnapH > 0 && (
                            <AnimatedFlatList
                                style={{ flex: 1 }}
                                data={filtered}
                                keyExtractor={(item: any) => item.id}
                                showsVerticalScrollIndicator={false}
                                snapToInterval={cardSnapH}
                                decelerationRate="fast"
                                removeClippedSubviews={true}
                                maxToRenderPerBatch={8}
                                windowSize={5}
                                initialNumToRender={6}
                                onScroll={marketScrollHandler}
                                scrollEventThrottle={16}
                                contentContainerStyle={{ paddingTop: CARD_TOP_PAD, paddingBottom: CARD_BOT_PAD }}
                                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.neonPink} />}
                                ListEmptyComponent={
                                    <EmptyStateCard
                                        height={cardSnapH}
                                        icon={<Ghost color={COLORS.neonPink} size={38} />}
                                        title="Sin tickets en reventa"
                                        subtitle="No hay tickets disponibles ahora o intenta ajustar tus filtros."
                                    />
                                }
                                renderItem={({ item, index }: { item: any; index: number }) => (
                                    <MarketCard
                                        item={item}
                                        index={index}
                                        cardH={cardSnapH}
                                        scrollY={marketScrollY}
                                        currentUserId={currentUserId}
                                        mode="buy"
                                        myPendingOffer={myBuyerOffers.find((o: any) => o.listing_id === item.id)}
                                        onOffer={(i) => { setSelectedListing(i); setOfferModal(true); }}
                                        onBuy={(i, direct) => { setBuyItem(i); setIsDirectBuy(direct); setSelectedMethod('webpay'); fetchPaymentMethods(); setBuyModal(true); }}
                                        onPayNow={(i) => { setBuyItem(i); setIsDirectBuy(false); setSelectedMethod('webpay'); fetchPaymentMethods(); setBuyModal(true); }}
                                        onCancelMyOffer={(id) => cancelMyOffer(id)}
                                    />
                                )}
                            />
                        )}
                    </View>

                    {/* TAB MIS VENTAS — siempre montado, display toggle */}
                    <View style={{ flex: 1, display: (currentUserId && tab === 'selling') ? 'flex' : 'none' }}>
                        {cardSnapH > 0 && (
                            <AnimatedFlatList
                                style={{ flex: 1 }}
                                data={myListings}
                                keyExtractor={(item: any) => item.id}
                                showsVerticalScrollIndicator={false}
                                snapToInterval={cardSnapH}
                                decelerationRate="fast"
                                removeClippedSubviews={true}
                                maxToRenderPerBatch={8}
                                windowSize={5}
                                initialNumToRender={6}
                                onScroll={sellScrollHandler}
                                scrollEventThrottle={16}
                                contentContainerStyle={{ paddingTop: CARD_TOP_PAD, paddingBottom: CARD_BOT_PAD }}
                                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.neonPink} />}
                                ListEmptyComponent={
                                    <EmptyStateCard
                                        height={cardSnapH}
                                        icon={<Ghost color={COLORS.neonPink} size={38} />}
                                        title="Nada publicado aún"
                                        subtitle="Toca + para publicar un ticket y empezar a vender."
                                    />
                                }
                                renderItem={({ item, index }: { item: any; index: number }) => (
                                    <MarketCard
                                        item={item}
                                        index={index}
                                        cardH={cardSnapH}
                                        scrollY={sellScrollY}
                                        currentUserId={currentUserId}
                                        mode="sell"
                                        onOpenOffers={(i) => openOffers(i)}
                                        onCancel={(id) => handleCancel(id)}
                                    />
                                )}
                            />
                        )}
                    </View>

                </View>
            </ReAnimated.View>

            {/* ── MODAL FILTROS INTERACTIVO ── */}
            <Modal
                visible={showFilterMenu}
                transparent
                animationType="none"
                onRequestClose={closeFilterModal}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={[{ flex: 1, justifyContent: 'flex-end' }]}
                >
                    <ReAnimated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }, filterOverlayStyle]}>
                        <TouchableOpacity
                            style={StyleSheet.absoluteFill}
                            activeOpacity={1}
                            onPress={closeFilterModal}
                        />
                    </ReAnimated.View>
                    <ReAnimated.View layout={LinearTransition.duration(250).easing(Easing.out(Easing.quad))} style={[s.filterSheet, { borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingBottom: insets.bottom + 24, paddingHorizontal: 25, maxHeight: height * 0.76, overflow: 'visible' }, filterSheetStyle]}>
                        <View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }]}>
                            <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
                        </View>

                        <GestureDetector gesture={filterPan}>
                            <View style={{ alignItems: 'center', paddingVertical: 14, marginHorizontal: -25 }}>
                                <View style={[s.filterHandle, { marginBottom: 0 }]} />
                            </View>
                        </GestureDetector>

                        {/* Header del Modal */}
                        <View style={s.modalHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                {activeFilterModal !== null && (
                                    <TouchableOpacity
                                        onPress={() => setActiveFilterModal(null)}
                                        style={s.modalIconBtn}
                                    >
                                        <ArrowLeft color="white" size={20} />
                                    </TouchableOpacity>
                                )}
                                <View>
                                    <Text style={s.modalTitle}>
                                        {activeFilterModal === null ? 'Filtros' : 'Selecciona una opción'}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity
                                onPress={closeFilterModal}
                                style={s.modalIconBtn}
                            >
                                <X color="rgba(255,255,255,0.6)" size={20} />
                            </TouchableOpacity>
                        </View>

                        {/* Contenido */}
                        {activeFilterModal === null ? (
                            <ReAnimated.View entering={FadeIn.duration(250)} style={{ width: '100%' }}>
                                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: height * 0.52 }} contentContainerStyle={{ paddingBottom: 30 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
                                        {activeFiltersCount > 0 && (
                                            <TouchableOpacity
                                                onPress={() => { setFilters({ event: '', sortBy: 'Menor precio primero', date: 'Cualquiera', category: '', musicGenre: '', minAge: '' }); closeFilterModal(); }}
                                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)' }}
                                            >
                                                <X size={12} color="#FF4444" />
                                                <Text style={{ color: '#FF4444', fontSize: 12, fontWeight: '800' }}>Borrar todo</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                    {[
                                        { key: 'sort', icon: <ArrowUpDown size={16} color={filters.sortBy !== 'Menor precio primero' ? '#FF31D8' : 'rgba(255,255,255,0.6)'} />, label: 'Ordenar por precio', value: filters.sortBy !== 'Menor precio primero' ? (filters.sortBy === 'Mayor precio primero' ? 'Mayor precio' : 'Menor precio') : null },
                                        { key: 'event', icon: <Ticket size={16} color={filters.event !== '' ? '#FF31D8' : 'rgba(255,255,255,0.6)'} />, label: 'Evento', value: filters.event || null },
                                        { key: 'date', icon: <Calendar size={16} color={filters.date !== 'Cualquiera' ? '#FF31D8' : 'rgba(255,255,255,0.6)'} />, label: 'Fecha', value: filters.date !== 'Cualquiera' ? filters.date : null },
                                        { key: 'category', icon: <Tag size={16} color={filters.category !== '' ? '#FF31D8' : 'rgba(255,255,255,0.6)'} />, label: 'Categoría', value: filters.category || null },
                                        { key: 'music', icon: <Music size={16} color={filters.musicGenre !== '' ? '#FF31D8' : 'rgba(255,255,255,0.6)'} />, label: 'Estilo musical', value: filters.musicGenre || null },
                                        { key: 'age', icon: <Users size={16} color={filters.minAge !== '' ? '#FF31D8' : 'rgba(255,255,255,0.6)'} />, label: 'Edad', value: filters.minAge || null },
                                    ].map(row => (
                                        <TouchableOpacity
                                            key={row.key}
                                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', gap: 14 }}
                                            onPress={() => setActiveFilterModal(row.key)}
                                        >
                                            {row.icon}
                                            <Text style={{ flex: 1, color: 'white', fontSize: 15, fontWeight: '700' }}>{row.label}</Text>
                                            {row.value ? (
                                                <Text style={{ color: '#FF31D8', fontSize: 13, fontWeight: '700', maxWidth: 120 }} numberOfLines={1}>{row.value}</Text>
                                            ) : (
                                                <ChevronRight size={16} color="rgba(255,255,255,0.3)" />
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </ReAnimated.View>
                        ) : (
                            <ReAnimated.View entering={FadeInRight.duration(300)} style={{ width: '100%' }}>
                                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: height * 0.52 }} contentContainerStyle={{ paddingBottom: 30 }}>
                                    {renderMktFilterContent()}
                                </ScrollView>
                            </ReAnimated.View>
                        )}
                    </ReAnimated.View>
                </KeyboardAvoidingView>
            </Modal>


            {/* ══════════════════════════════════════════════════════════
                MODAL PUBLICAR TICKET
            ══════════════════════════════════════════════════════════ */}
            <Modal
                visible={sellModal}
                transparent
                animationType="none"
                onRequestClose={closeSellModal}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={[{ flex: 1, justifyContent: 'flex-end' }]}
                >
                    <ReAnimated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }, sellOverlayStyle]}>
                        <TouchableOpacity
                            style={StyleSheet.absoluteFill}
                            activeOpacity={1}
                            onPress={closeSellModal}
                        />
                    </ReAnimated.View>
                    <ReAnimated.View layout={LinearTransition.duration(250).easing(Easing.out(Easing.quad))} style={[s.filterSheet, { borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingBottom: insets.bottom + 24, paddingHorizontal: 25, maxHeight: height * 0.76, overflow: 'visible' }, sellSheetStyle]}>
                        <View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }]}>
                            <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
                        </View>

                        <GestureDetector gesture={sellPan}>
                            <View style={{ alignItems: 'center', paddingVertical: 14, marginHorizontal: -25 }}>
                                <View style={[s.filterHandle, { marginBottom: 0 }]} />
                            </View>
                        </GestureDetector>

                        {/* Header */}
                        <View style={s.modalHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                {(sellStep === 2 || sellSubStep > 1) && (
                                    <TouchableOpacity
                                        onPress={() => {
                                            if (sellStep === 2 && sellSubStep > 1) setSellSubStep(ss => ss - 1);
                                            else { setSellStep(1); setSellSubStep(1); }
                                        }}
                                        style={s.modalIconBtn}
                                    >
                                        <ArrowLeft color="white" size={20} />
                                    </TouchableOpacity>
                                )}
                                <View>
                                    <View style={s.stepBadge}>
                                        <Text style={s.stepText}>{sellStep === 1 ? 'PASO 1 DE 2' : `PASO 2 DE 2  ·  ${sellSubStep}/6`}</Text>
                                    </View>
                                    <Text style={s.modalTitle}>
                                        {sellStep === 1 ? 'Selecciona tu ticket' : 'Detalles de venta'}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity
                                onPress={closeSellModal}
                                style={s.modalIconBtn}
                            >
                                <X color="rgba(255,255,255,0.6)" size={20} />
                            </TouchableOpacity>
                        </View>

                        {/* PASO 1: Elegir ticket */}
                        {sellStep === 1 ? (
                            loadingTickets
                                ? <ActivityIndicator color={COLORS.neonPink} style={{ marginVertical: 40 }} />
                                : <ReAnimated.View entering={FadeIn.duration(250)} style={{ width: '100%' }}>
                                    <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: height * 0.52 }} contentContainerStyle={{ paddingBottom: 30 }}>
                                    {myTickets.length === 0
                                        ? <Text style={s.noData}>No tienes tickets válidos para vender en este momento.</Text>
                                        : myTickets.map(t => {
                                            const ok = t.events?.is_resellable !== false;
                                            return (
                                                <TouchableOpacity key={t.id}
                                                    style={[s.ticketCardModern, !ok && { opacity: 0.4 }]}
                                                    onPress={() => { setTicketToSell(t); setSellStep(2); }}
                                                    disabled={!ok}
                                                    activeOpacity={0.7}
                                                >
                                                    {t.events?.image_url
                                                        ? <ExpoImage source={{ uri: t.events.image_url }} style={{ width: 64, height: 64, borderRadius: 16, marginRight: 16 }} contentFit="cover" placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }} />
                                                        : <View style={[s.ticketIconBox, { width: 64, height: 64, borderRadius: 16, marginRight: 16 }]}><Ticket color={COLORS.neonPink} size={28} /></View>
                                                    }
                                                    <View style={{ flex: 1, gap: 6, paddingVertical: 2 }}>
                                                        <Text style={[s.ticketCardTitle, { marginBottom: 0, fontSize: 17 }]} numberOfLines={1}>{t.events?.title}</Text>
                                                        <View style={s.ticketCardTier}>
                                                            <Text style={s.ticketCardTierText}>{t.ticket_tiers?.name || 'General'}</Text>
                                                        </View>
                                                        {!ok && <Text style={{ color: '#FF4444', fontSize: 10, marginTop: 2, fontWeight: '800' }}>REVENTA NO PERMITIDA</Text>}
                                                    </View>
                                                    {ok && <ChevronRight color="rgba(255,255,255,0.3)" size={20} />}
                                                </TouchableOpacity>
                                            );
                                        })
                                    }
                                    </ScrollView>
                                </ReAnimated.View>
                        ) : (
                            /* PASO 2: sub-pasos uno a uno */
                            <ReAnimated.View entering={FadeInRight.duration(300)} style={{ width: '100%' }}>
                            {/* Ticket mini chip */}
                            <View style={[s.selectedTicketRow, { marginBottom: 24 }]}>
                                {ticketToSell?.events?.image_url
                                    ? <ExpoImage source={{ uri: ticketToSell.events.image_url }} style={{ width: 44, height: 44, borderRadius: 12, marginRight: 14 }} contentFit="cover" placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }} />
                                    : <View style={[s.ticketIconBox, { width: 44, height: 44, borderRadius: 12, marginRight: 14 }]}><Ticket color={COLORS.neonPink} size={20} /></View>
                                }
                                <View style={{ flex: 1, gap: 4 }}>
                                    <Text style={[s.ticketCardTitle, { marginBottom: 0, fontSize: 15 }]} numberOfLines={1}>{ticketToSell?.events?.title}</Text>
                                    <Text style={s.ticketCardTierText}>{ticketToSell?.ticket_tiers?.name || 'General'}</Text>
                                </View>
                            </View>

                            {/* Sub-step content */}
                            {sellSubStep === 1 && (
                                <ReAnimated.View entering={SlideInRight.duration(250).easing(Easing.out(Easing.quad))} style={{ alignItems: 'center', paddingVertical: 24 }}>
                                    <Text style={s.priceHeroLabel}>¿A cuánto lo vendes?</Text>
                                    <View style={s.priceInputRow}>
                                        <Text style={s.priceSymbol}>$</Text>
                                        <TextInput
                                            style={s.priceInputMassive}
                                            placeholder="0"
                                            placeholderTextColor="rgba(255,255,255,0.2)"
                                            keyboardType="numeric"
                                            value={sellPrice}
                                            onChangeText={setSellPrice}
                                            autoFocus
                                        />
                                    </View>
                                </ReAnimated.View>
                            )}

                            {sellSubStep === 2 && (
                                <ReAnimated.View entering={SlideInRight.duration(250).easing(Easing.out(Easing.quad))} style={{ paddingVertical: 12 }}>
                                    <Text style={[s.glassSectionTitle, { marginBottom: 16 }]}>Tu RUT</Text>
                                    <View style={s.modernInputWrap}>
                                        <Receipt color="rgba(255,255,255,0.4)" size={18} />
                                        <TextInput style={s.modernInput} placeholder="Ej: 12.345.678-9" placeholderTextColor="rgba(255,255,255,0.3)"
                                            value={bankData.rut}
                                            onChangeText={v => setBankData(p => ({ ...p, rut: formatRut(v) }))}
                                            keyboardType="default" maxLength={12} autoCapitalize="none" autoFocus />
                                    </View>
                                </ReAnimated.View>
                            )}

                            {sellSubStep === 3 && (
                                <ReAnimated.View entering={SlideInRight.duration(250).easing(Easing.out(Easing.quad))} style={{ paddingVertical: 12 }}>
                                    <Text style={[s.glassSectionTitle, { marginBottom: 16 }]}>Selecciona tu banco</Text>
                                    <View style={s.modernDropdown}>
                                        <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                                            {BANKS_CHILE.map(b => (
                                                <TouchableOpacity
                                                    key={b}
                                                    style={[s.modernDropRow, bankData.bank === b && { backgroundColor: 'rgba(255,49,216,0.1)' }]}
                                                    onPress={() => setBankData(p => ({ ...p, bank: b }))}
                                                >
                                                    <Text style={[s.dropText, bankData.bank === b && { color: COLORS.neonPink }]}>{b}</Text>
                                                    {bankData.bank === b && <Check size={16} color={COLORS.neonPink} />}
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </View>
                                </ReAnimated.View>
                            )}

                            {sellSubStep === 4 && (
                                <ReAnimated.View entering={SlideInRight.duration(250).easing(Easing.out(Easing.quad))} style={{ paddingVertical: 12 }}>
                                    <Text style={[s.glassSectionTitle, { marginBottom: 16 }]}>Tipo de cuenta</Text>
                                    <View style={s.modernDropdown}>
                                        <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
                                            {ACCOUNT_TYPES.map(t => (
                                                <TouchableOpacity
                                                    key={t}
                                                    style={[s.modernDropRow, bankData.type === t && { backgroundColor: 'rgba(255,49,216,0.1)' }]}
                                                    onPress={() => setBankData(p => ({ ...p, type: t }))}
                                                >
                                                    <Text style={[s.dropText, bankData.type === t && { color: COLORS.neonPink }]}>{t}</Text>
                                                    {bankData.type === t && <Check size={16} color={COLORS.neonPink} />}
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </View>
                                </ReAnimated.View>
                            )}

                            {sellSubStep === 5 && (
                                <ReAnimated.View entering={SlideInRight.duration(250).easing(Easing.out(Easing.quad))} style={{ paddingVertical: 12 }}>
                                    <Text style={[s.glassSectionTitle, { marginBottom: 16 }]}>Número de cuenta</Text>
                                    <View style={s.modernInputWrap}>
                                        <Hash color="rgba(255,255,255,0.4)" size={18} />
                                        <TextInput style={s.modernInput} placeholder="Ej: 00012345678" placeholderTextColor="rgba(255,255,255,0.3)"
                                            value={bankData.number}
                                            onChangeText={v => setBankData(p => ({ ...p, number: formatAccountNumber(v) }))}
                                            keyboardType="numeric" maxLength={20} autoFocus />
                                    </View>
                                </ReAnimated.View>
                            )}

                            {sellSubStep === 6 && (
                                <ReAnimated.View entering={SlideInRight.duration(250).easing(Easing.out(Easing.quad))} style={{ paddingVertical: 12 }}>
                                    <Text style={[s.glassSectionTitle, { marginBottom: 16 }]}>Nombre del titular</Text>
                                    <View style={s.modernInputWrap}>
                                        <User color="rgba(255,255,255,0.4)" size={18} />
                                        <TextInput style={s.modernInput} placeholder="Nombre completo" placeholderTextColor="rgba(255,255,255,0.3)"
                                            value={bankData.holderName} onChangeText={v => setBankData(p => ({ ...p, holderName: v }))} autoFocus />
                                    </View>
                                </ReAnimated.View>
                            )}

                            {/* Acción principal */}
                            {sellSubStep < 6 ? (
                                <TouchableOpacity
                                    style={[s.primaryBtn, { marginTop: 16, backgroundColor: 'rgba(255,49,216,0.15)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.3)' }]}
                                    onPress={() => setSellSubStep(ss => ss + 1)}
                                >
                                    <Text style={[s.primaryBtnText, { fontSize: 16, color: COLORS.neonPink }]}>SIGUIENTE</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={[s.primaryBtn, { marginTop: 16, backgroundColor: 'rgba(255,49,216,0.15)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.3)' }]}
                                    onPress={handlePublish}
                                    disabled={publishing}
                                >
                                    {publishing
                                        ? <ActivityIndicator color={COLORS.neonPink} />
                                        : <Text style={[s.primaryBtnText, { fontSize: 16, color: COLORS.neonPink }]}>PUBLICAR TICKET</Text>}
                                </TouchableOpacity>
                            )}
                            </ReAnimated.View>
                        )}
                    </ReAnimated.View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ══════════════════════════════════════════════════════════
                RESTO DE MODALES
            ══════════════════════════════════════════════════════════ */}
            <Modal visible={offerModal} transparent animationType="none" onRequestClose={closeOfferModal}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[{ flex: 1, justifyContent: 'flex-end' }]}>
                    <ReAnimated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }, offerOverlayStyle]}>
                        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeOfferModal} />
                    </ReAnimated.View>
                    <ReAnimated.View layout={LinearTransition.duration(250).easing(Easing.out(Easing.quad))} style={[s.filterSheet, { borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingBottom: insets.bottom + 24, paddingHorizontal: 25, overflow: 'visible' }, offerSheetStyle]}>
                        <View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }]}>
                            <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
                        </View>
                        {/* Rellena las esquinas redondeadas del teclado iOS */}
                        <View style={{ position: 'absolute', bottom: -300, left: 0, right: 0, height: 300, backgroundColor: COLORS.modalBg }} />
                        <GestureDetector gesture={offerPan}>
                            <View style={{ alignItems: 'center', paddingVertical: 14, marginHorizontal: -25 }}>
                                <View style={[s.filterHandle, { marginBottom: 0 }]} />
                            </View>
                        </GestureDetector>

                        <View style={s.modalHeader}>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <View style={{ backgroundColor: 'rgba(255,49,216,0.15)', borderRadius: 8, padding: 6 }}>
                                        <Gavel size={14} color={COLORS.neonPink} />
                                    </View>
                                    <Text style={s.modalTitle}>Hacer oferta</Text>
                                </View>
                                <Text style={s.modalSub} numberOfLines={1}>{selectedListing?.tickets?.events?.title}</Text>
                            </View>
                            <TouchableOpacity onPress={closeOfferModal} style={s.modalIconBtn}>
                                <X color="rgba(255,255,255,0.5)" size={18} />
                            </TouchableOpacity>
                        </View>

                        {/* Precio publicado */}
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Precio publicado</Text>
                            <Text style={{ color: 'white', fontWeight: '900', fontSize: 16 }}>${selectedListing?.price?.toLocaleString('es-CL')}</Text>
                        </View>

                        {/* Input neon */}
                        <View style={{ backgroundColor: 'rgba(255,49,216,0.06)', borderRadius: 18, borderWidth: 1, borderColor: offerPrice ? COLORS.neonPink : 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, height: 60, marginBottom: 20 }}>
                            <Text style={{ color: offerPrice ? COLORS.neonPink : 'rgba(255,255,255,0.2)', fontSize: 22, fontWeight: '900', marginRight: 6 }}>$</Text>
                            <TextInput
                                style={{ flex: 1, color: 'white', fontSize: 22, fontWeight: '900' }}
                                placeholder="0"
                                placeholderTextColor="rgba(255,255,255,0.15)"
                                keyboardType="numeric"
                                value={offerPrice}
                                onChangeText={setOfferPrice}
                                autoFocus
                            />
                        </View>

                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity style={[s.ghostBtn, { flex: 1 }]} onPress={() => { setOfferModal(false); setOfferPrice(''); }}>
                                <Text style={s.ghostBtnText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: 'white' }]} activeOpacity={0.65} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleOffer(); }} disabled={offering}>
                                {offering ? <ActivityIndicator color="#000" /> : <Text style={[s.primaryBtnText, { color: '#000' }]}>ENVIAR OFERTA</Text>}
                            </TouchableOpacity>
                        </View>
                    </ReAnimated.View>
                </KeyboardAvoidingView>
            </Modal>

            <Modal visible={offersModal} transparent animationType="slide" onRequestClose={() => setOffersModal(false)}>
                <View style={s.overlay}>
                    <View style={s.sheet}>
                        <View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }]}>
                            <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
                        </View>
                        <View style={s.filterHandle} />
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Ofertas recibidas</Text>
                            <TouchableOpacity onPress={() => setOffersModal(false)} style={s.modalIconBtn}>
                                <X color="rgba(255,255,255,0.5)" size={18} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={incomingOffers} keyExtractor={o => o.id} showsVerticalScrollIndicator={false}
                            ListEmptyComponent={<Text style={s.noData}>Sin ofertas pendientes.</Text>}
                            renderItem={({ item }) => (
                                <View style={s.offerRow}>
                                    <View>
                                        <Text style={s.offerAmt}>${item.offered_price.toLocaleString('es-CL')}</Text>
                                        <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>Oferta pendiente</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <TouchableOpacity style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)', justifyContent: 'center', alignItems: 'center' }} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); rejectOffer(item); }}>
                                            <X size={16} color="#FF4444" />
                                        </TouchableOpacity>
                                        <TouchableOpacity style={s.acceptBtn} activeOpacity={0.65} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); acceptOffer(item); }}>
                                            <Check color="#000" size={13} />
                                            <Text style={s.acceptText}>ACEPTAR</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            <Modal visible={buyModal} transparent animationType="fade" onRequestClose={() => setBuyModal(false)}>
                <View style={[s.overlay, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.82)' }]}>
                    <View style={s.buySheet}>
                        <View style={[StyleSheet.absoluteFill, { borderRadius: 32, overflow: 'hidden' }]}>
                            <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
                        </View>
                        <TouchableOpacity style={s.buyClose} onPress={() => setBuyModal(false)}>
                            <X color="rgba(255,255,255,0.4)" size={18} />
                        </TouchableOpacity>
                        <Text style={s.buyTitle}>Confirmar compra</Text>
                        <Text style={[s.modalSub, { textAlign: 'center', marginBottom: 4 }]}>{buyItem?.tickets?.events?.title}</Text>
                        <Text style={[s.buyTierText, { textAlign: 'center', marginBottom: 20 }]}>{buyItem?.tickets?.ticket_tiers?.name}</Text>
                        <View style={s.priceBox}>
                            <View style={s.priceRow}>
                                <Text style={s.priceRowLabel}>Ticket</Text>
                                <Text style={s.priceRowVal}>${totals().base.toLocaleString('es-CL')}</Text>
                            </View>
                            <View style={s.priceRow}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                    <Text style={s.priceRowLabel}>Servicio (5%)</Text>
                                    <AlertCircle size={11} color={COLORS.textSecondary} />
                                </View>
                                <Text style={s.priceRowVal}>${totals().fee.toLocaleString('es-CL')}</Text>
                            </View>
                            <View style={s.priceDivider} />
                            <View style={s.priceRow}>
                                <Text style={{ color: 'white', fontWeight: '900', fontSize: 15 }}>Total</Text>
                                <Text style={{ color: COLORS.neonPink, fontWeight: '900', fontSize: 20 }}>${totals().total.toLocaleString('es-CL')}</Text>
                            </View>
                        </View>

                        {/* Método de pago */}
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Método de pago</Text>

                        {/* Webpay Plus */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setSelectedMethod('webpay')}
                            style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: selectedMethod === 'webpay' ? 'rgba(255,49,216,0.6)' : 'rgba(255,255,255,0.08)', backgroundColor: selectedMethod === 'webpay' ? 'rgba(255,49,216,0.07)' : 'rgba(255,255,255,0.03)', marginBottom: 10 }}
                        >
                            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selectedMethod === 'webpay' ? COLORS.neonPink : 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                                {selectedMethod === 'webpay' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.neonPink }} />}
                            </View>
                            <CreditCard size={18} color="white" style={{ marginRight: 10 }} />
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: 'white', fontWeight: '800', fontSize: 14 }}>Webpay Plus</Text>
                                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>Débito, crédito o prepago</Text>
                            </View>
                        </TouchableOpacity>

                        {/* Tarjetas guardadas */}
                        {savedCards.map(card => (
                            <TouchableOpacity
                                key={card.id}
                                activeOpacity={0.8}
                                onPress={() => setSelectedMethod(card.id)}
                                style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: selectedMethod === card.id ? 'rgba(255,49,216,0.6)' : 'rgba(255,255,255,0.08)', backgroundColor: selectedMethod === card.id ? 'rgba(255,49,216,0.07)' : 'rgba(255,255,255,0.03)', marginBottom: 10 }}
                            >
                                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selectedMethod === card.id ? COLORS.neonPink : 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                                    {selectedMethod === card.id && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.neonPink }} />}
                                </View>
                                <CreditCard size={18} color={COLORS.neonPink} style={{ marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={{ color: 'white', fontWeight: '800', fontSize: 14 }}>{card.card_type} •••• {card.card_number.slice(-4)}</Text>
                                        <View style={{ backgroundColor: COLORS.neonPink, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                                            <Text style={{ color: 'white', fontSize: 8, fontWeight: '900' }}>1-CLICK</Text>
                                        </View>
                                    </View>
                                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>Pago rápido sin salir de la app</Text>
                                </View>
                            </TouchableOpacity>
                        ))}

                        {/* Agregar nueva tarjeta */}
                        <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginBottom: 14 }}
                            onPress={() => { setBuyModal(false); router.push('/payment-methods'); }}
                        >
                            <Plus size={16} color="rgba(255,255,255,0.4)" />
                            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '500' }}>Agregar nueva tarjeta</Text>
                        </TouchableOpacity>

                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity style={[s.ghostBtn, { flex: 1 }]} onPress={() => setBuyModal(false)}>
                                <Text style={s.ghostBtnText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.primaryBtn, { flex: 1, marginTop: 0, backgroundColor: 'white' }]} activeOpacity={0.65} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); executeBuy(); }}>
                                <Text style={[s.primaryBtnText, { color: '#000' }]}>IR A PAGAR</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    screen: { flex: 1 },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 25, paddingTop: 10, paddingBottom: 0, marginBottom: 15 },
    title: { fontSize: 32, fontWeight: '900', color: 'white', fontStyle: 'italic', letterSpacing: -1 },

    slider: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 25, padding: 4, height: 52, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
    sliderActive: { position: 'absolute', top: 4, width: TAB_W, height: 42, backgroundColor: COLORS.neonPink, borderRadius: 21, shadowColor: COLORS.neonPink, shadowOpacity: 0.75, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
    scopeBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, zIndex: 10 },
    scopeText: { color: 'rgba(255,255,255,0.35)', fontWeight: '700', fontSize: 14 },
    scopeActive: { color: 'white', fontWeight: '900' },

    filterScroll: { paddingHorizontal: 20, gap: 10, paddingVertical: 5 },
    filterPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    filterPillActive: { backgroundColor: 'rgba(255,49,216,0.15)', borderColor: COLORS.neonPink },
    filterPillText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700', marginLeft: 6 },
    filterPillTextActive: { color: 'white', fontWeight: '900' },

    filterOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    filterSheet: { overflow: 'hidden', backgroundColor: 'transparent', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 44, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    filterHandle: { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
    filterModalTitle: { color: 'white', fontSize: 20, fontWeight: '900', fontStyle: 'italic', marginBottom: 20 },

    verticalOptions: { gap: 0 },
    optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    optionText: { color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: '500' },
    optionTextActive: { color: 'white', fontWeight: '800' },

    chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
    chip: {
        paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'
    },
    chipActive: { backgroundColor: 'rgba(255,49,216, 0.2)', borderColor: COLORS.neonPink },
    chipText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '500' },
    chipTextActive: { color: 'white', fontWeight: '800' },

    mainBtn: { backgroundColor: 'white', borderRadius: 20, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
    mainBtnText: { color: 'black', fontSize: 16, fontWeight: '900' },

    noData: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', padding: 20 },

    list: { paddingHorizontal: 20, paddingBottom: 120, gap: 12, flexGrow: 1 },

    glassCard: { flexDirection: 'row', backgroundColor: COLORS.glassBg, padding: 12, borderRadius: 24, borderWidth: 1, borderColor: COLORS.glassBorder, alignItems: 'stretch' },
    cardImg: { width: 100, height: 100, borderRadius: 16, overflow: 'hidden' },
    cardContent: { flex: 1, marginLeft: 14, height: 100, justifyContent: 'space-between' },
    sellCardImg: { width: 88, height: 88, borderRadius: 14, overflow: 'hidden', alignSelf: 'center' },
    sellCardContent: { flex: 1, marginLeft: 12, justifyContent: 'flex-start' },
    cardTitle: { color: 'white', fontSize: 16, fontWeight: '800' },
    tierBadge: { color: COLORS.neonPink, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
    tierRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    tierText: { color: COLORS.neonPink, fontSize: 11, fontWeight: '700' },
    bidText: { color: COLORS.textSecondary, fontSize: 11 },
    pricePill: { backgroundColor: 'rgba(255,49,216,0.12)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,49,216,0.25)' },
    priceText: { color: COLORS.neonPink, fontWeight: '900', fontSize: 12 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 4 },
    statusDot: { width: 5, height: 5, borderRadius: 2.5 },
    statusLabel: { fontSize: 10, fontWeight: '800' },

    cardActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
    btnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
    btnOutlineText: { color: 'white', fontWeight: '800', fontSize: 12 },
    btnFilled: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, paddingVertical: 10, backgroundColor: 'white' },
    btnFilledText: { color: '#000', fontWeight: '900', fontSize: 12 },
    btnFull: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
    btnFullText: { fontWeight: '900', fontSize: 12 },
    offersBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginHorizontal: 16, marginBottom: 10, backgroundColor: 'rgba(255,49,216,0.15)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.3)', paddingVertical: 10, borderRadius: 12 },
    offersBtnText: { color: COLORS.neonPink, fontWeight: '900', fontSize: 12 },
    cancelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingBottom: 12 },
    cancelText: { color: '#FF4444', fontSize: 11, fontWeight: '700' },

    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, paddingTop: 20, gap: 0 },
    emptyIconCircle: { width: 86, height: 86, borderRadius: 43, backgroundColor: 'rgba(255,49,216,0.1)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.3)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { color: 'white', fontSize: 20, fontWeight: '900', fontStyle: 'italic', textAlign: 'center', marginBottom: 8 },
    emptySub: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 22 },

    fab: { position: 'absolute', right: 24, width: 56, height: 56, borderRadius: 28, overflow: 'hidden', shadowColor: COLORS.neonPink, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 16, elevation: 10 },
    fabGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden', padding: 24, paddingBottom: 44, maxHeight: '88%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    buySheet: { width: '92%', borderRadius: 32, overflow: 'hidden', padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    handle: { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
    buyClose: { position: 'absolute', top: 16, right: 16, zIndex: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },

    sellSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', padding: 20, paddingBottom: 32, maxHeight: height * 0.55 },
    selectedTicketRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },

    stepBadge: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 4 },
    stepText: { color: 'white', fontSize: 10, fontWeight: '900', letterSpacing: 1 },

    ticketCardModern: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 24, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    ticketIconBox: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,49,216,0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    ticketCardTitle: { color: 'white', fontSize: 16, fontWeight: '800', marginBottom: 4 },
    ticketCardTier: { backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
    ticketCardTierText: { color: COLORS.neonPink, fontSize: 11, fontWeight: '700' },

    priceHero: { alignItems: 'center', marginVertical: 6 },
    priceHeroLabel: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
    priceInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    priceSymbol: { color: COLORS.neonPink, fontSize: 24, fontWeight: '900', marginRight: 4, marginTop: -2 },
    priceInputMassive: { color: 'white', fontSize: 32, fontWeight: '900', minWidth: 60, textAlign: 'center' },

    glassSection: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 20, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 10 },
    glassSectionTitle: { color: 'white', fontSize: 13, fontWeight: '800', marginBottom: 10 },
    modernInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 14, paddingHorizontal: 14, height: 46, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
    modernInput: { flex: 1, color: 'white', fontSize: 14, marginLeft: 12, fontWeight: '500' },
    modernDropText: { flex: 1, color: 'white', fontSize: 15, marginLeft: 14, fontWeight: '500' },
    modernDropdown: { backgroundColor: COLORS.glassBg, borderRadius: 18, borderWidth: 1, borderColor: COLORS.glassBorder, marginTop: -6, marginBottom: 12, overflow: 'hidden' },
    modernDropRow: { padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    modalIconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.07)', justifyContent: 'center', alignItems: 'center' },
    modalTitle: { color: 'white', fontSize: 20, fontWeight: '900', fontStyle: 'italic' },
    modalSub: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4 },
    buyTitle: { color: 'white', fontSize: 22, fontWeight: '900', fontStyle: 'italic', textAlign: 'center', marginBottom: 4 },
    buyTierText: { color: 'white', fontSize: 14, fontWeight: '700' },

    fieldLabel: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6, marginTop: 14 },
    fieldInput: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, color: 'white', fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
    fieldText: { color: 'white', fontSize: 15 },
    dropdown: { backgroundColor: 'rgba(20,5,35,0.98)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', marginTop: 4 },
    dropRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    dropText: { color: 'rgba(251,251,251,0.85)', fontSize: 14 },

    primaryBtn: { marginTop: 8, height: 56, borderRadius: 16, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
    primaryBtnGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    primaryBtnText: { color: 'white', fontWeight: '900', fontSize: 15, letterSpacing: 0.5 },
    ghostBtn: { height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
    ghostBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },

    priceInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    priceInfoLabel: { color: COLORS.textSecondary, fontSize: 14 },
    priceInfoValue: { color: 'white', fontWeight: '800', fontSize: 15 },

    priceBox: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 12 },
    priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    priceRowLabel: { color: COLORS.textSecondary, fontSize: 14 },
    priceRowVal: { color: 'white', fontWeight: '800', fontSize: 15 },
    priceDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 4 },

    offerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, marginBottom: 10 },
    offerAmt: { color: 'white', fontSize: 18, fontWeight: '900' },
    acceptBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
    acceptText: { color: '#000', fontWeight: '900', fontSize: 12 },
});