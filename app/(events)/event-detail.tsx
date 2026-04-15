import { BlurView } from '../../components/BlurSurface';
import { LinearGradient } from 'expo-linear-gradient';
import * as ExpoLinking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { Image } from 'expo-image';
import {
    Activity,
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Ban,
    CheckCircle2,
    ChevronRight,
    Clock,
    Copy,
    Instagram,
    MapPin,
    Navigation,
    Share2,
    Shirt,
    User,
    Wine,
    Zap
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Alert,
    Dimensions,
    FlatList,
    Linking,
    Modal,
    PanResponder,
    Platform,
    RefreshControl,
    ScrollView,
    Share,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { PressableScale } from '../../components/animated/PressableScale';
import { AnimatedEntry } from '../../components/animated/AnimatedEntry';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import RAnimated, { useSharedValue, withTiming, useAnimatedStyle, runOnJS, Easing, interpolate, Extrapolation } from 'react-native-reanimated';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import RenderHtml from 'react-native-render-html';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../constants/colors';
import { isEventFinished } from '../../utils/format';
import { SkeletonBox } from '../../components/SkeletonBox';

const { height, width } = Dimensions.get('window');
const isSmallScreen = width < 400;

const SCALE = {
    padding: isSmallScreen ? 20 : 24,
    cardPadding: isSmallScreen ? 20 : 24,
    gap: isSmallScreen ? 8 : 12,
    titleSize: isSmallScreen ? 24 : 28,
    subtitleSize: isSmallScreen ? 13 : 14,
    labelSize: isSmallScreen ? 9 : 10,
    valueSize: isSmallScreen ? 16 : 20,
    iconSize: isSmallScreen ? 14 : 16,
    buttonIconSize: isSmallScreen ? 16 : 18,
    buttonTextSize: isSmallScreen ? 14 : 16,
    sectionGap: isSmallScreen ? 20 : 25,
    dateMonthSize: isSmallScreen ? 13 : 13.5,
    dateDaySize: isSmallScreen ? 26 : 29,
};

const INITIAL_REGION = {
    latitude: -33.4489,
    longitude: -70.6693,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
};

const getQueueUI = (status: string) => {
    switch (status) {
        case 'express': return { color: ['#059669', '#10b981'], icon: Zap, label: 'Acceso Express', textColor: '#34d399' };
        case 'high_flow': return { color: ['#d97706', '#f59e0b'], icon: Activity, label: 'Alto Flujo', textColor: '#fbbf24' };
        case 'bottleneck': return { color: ['#7f1d1d', '#ef4444'], icon: AlertTriangle, label: 'Fila Crítica', textColor: '#f87171' };
        case 'chill': return { color: ['#1e3a8a', '#3b82f6'], icon: CheckCircle2, label: 'Mood Temprano', textColor: '#60a5fa' };
        default: return { color: ['#27272a', '#3f3f46'], icon: Clock, label: 'Sin Datos', textColor: '#a1a1aa' };
    }
};

export default function EventDetailScreen() {
    const params = useLocalSearchParams();
    const router = useRouter();

    const p = (k: string) => { const v = params[k] as string | undefined; return v && v !== 'undefined' && v !== '' ? v : undefined; };
    const optImageUrl      = p('imageUrl');
    const optTitle         = p('title');
    const optDate          = p('date');
    const optHour          = p('hour');
    const optClubName      = p('clubName');
    const optClubImage     = p('clubImage');
    const optAccentColor   = p('accentColor');
    const optThemeColorEnd = p('themeColorEnd');
    const optCategory      = p('category') || p('area');
    const optProducerName  = p('producerName');
    const optProducerLogo  = p('producerLogo');
    const optProducerId    = p('producerId');
    const optInstagramUrl  = p('instagramUrl');
    const optStatus        = p('status');

    const insets = useSafeAreaInsets();
    const headerBgAnim = useRef(new Animated.Value(0)).current;



    const hasCachedParams = !!(optProducerName || optClubName);
    const [loading, setLoading] = useState(!hasCachedParams);

    // Prefetch de la imagen del club desde los params — empieza a descargar antes de que el fetch del evento termine
    useEffect(() => {
        if (optClubImage) Image.prefetch(optClubImage);
    }, [optClubImage]);
    const [refreshing, setRefreshing] = useState(false);
    const [event, setEvent] = useState<any>(null);
    const [minPrice, setMinPrice] = useState(0);
    const [friendsGoing, setFriendsGoing] = useState<any[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [hasConsumptionMenu, setHasConsumptionMenu] = useState(false);

    const modalOffset = useSharedValue(height);
    const modalSheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: modalOffset.value }] }));
    const modalOverlayStyle = useAnimatedStyle(() => ({ opacity: interpolate(modalOffset.value, [0, height], [1, 0], Extrapolation.CLAMP) }));

    const closeAttendeeModal = () => {
        modalOffset.value = withTiming(height, { duration: 320, easing: Easing.inOut(Easing.quad) }, () => { runOnJS(setModalVisible)(false); });
    };

    const attendeesPan = Gesture.Pan()
        .onUpdate(e => { if (e.translationY > 0) modalOffset.value = e.translationY; })
        .onEnd(e => {
            if (e.translationY > 80 || e.velocityY > 500) {
                modalOffset.value = withTiming(height, { duration: 250 }, () => { runOnJS(setModalVisible)(false); });
            } else {
                modalOffset.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
            }
        });

    useEffect(() => {
        if (modalVisible) {
            modalOffset.value = height;
            modalOffset.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
        }
    }, [modalVisible]);

    const [region, setRegion] = useState(INITIAL_REGION);
    const [queueStatus, setQueueStatus] = useState<any>(null);
    const [transportModalVisible, setTransportModalVisible] = useState(false);

    useEffect(() => {
        if (!params.id) return;

        const incrementView = async () => {
            try {
                const currentEventId = Array.isArray(params.id) ? params.id[0] : params.id;
                await supabase.rpc('increment_event_views', { event_id: currentEventId });
            } catch (error) { }
        };

        fetchEventData();
        fetchQueueStatus();
        incrementView();
    }, [params.id]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([fetchEventData(true), fetchQueueStatus()]);
        setRefreshing(false);
    }, [params.id]);

    async function fetchQueueStatus() {
        try {
            const { data, error } = await supabase.rpc('get_event_flow_status', { target_event_id: params.id });
            if (!error && data) setQueueStatus(data);
        } catch (e) { }
    }

    async function fetchEventData(isRefresh = false) {
        try {
            if (!isRefresh && !hasCachedParams) setLoading(true);

            const { data: eventData, error: eventError } = await supabase
                .from('events')
                .select('*, clubs(*), ticket_tiers(price), experiences(id, name, logo_url, instagram_handle)')
                .eq('id', params.id)
                .single();

            if (eventError) throw eventError;

            let calculatedMinPrice = 0;
            if (eventData.ticket_tiers && eventData.ticket_tiers.length > 0) {
                const prices = eventData.ticket_tiers.map((t: any) => t.price);
                calculatedMinPrice = Math.min(...prices);
            }
            setMinPrice(calculatedMinPrice);

            let finalClubImage = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80';
            let finalClubName = eventData.club_name || 'Ubicación';
            let clubFoundInJoin = false;

            if (eventData.clubs) {
                const club = Array.isArray(eventData.clubs) ? eventData.clubs[0] : eventData.clubs;
                if (club && club.name) {
                    finalClubName = club.name;
                    if (club.image && club.image.trim() !== '') {
                        finalClubImage = String(club.image).trim();
                    }
                    clubFoundInJoin = true;
                }
            }

            if (!clubFoundInJoin && (eventData.club_id || eventData.club_name)) {
                try {
                    let query = supabase.from('clubs').select('*');
                    if (eventData.club_id) query = query.eq('id', eventData.club_id);
                    else if (eventData.club_name) query = query.ilike('name', `%${eventData.club_name.trim()}%`);

                    const { data: manualClubData } = await query.limit(1);

                    if (manualClubData && manualClubData.length > 0) {
                        const mClub = manualClubData[0];
                        finalClubName = mClub.name || finalClubName;
                        if (mClub.image && mClub.image.trim() !== '') finalClubImage = String(mClub.image).trim();
                        eventData.resolvedClubId = mClub.id;
                    }
                } catch (err) { }
            }

            eventData.finalClubImage = finalClubImage;
            eventData.finalClubName = finalClubName;

            setEvent(eventData);

            // Verificar si el evento tiene carta de consumos activa
            const { count } = await supabase
                .from('consumption_items')
                .select('*', { count: 'exact', head: true })
                .eq('event_id', params.id)
                .eq('is_available', true);
            setHasConsumptionMenu((count ?? 0) > 0);

            if (eventData.latitude && eventData.longitude) {
                setRegion({ latitude: eventData.latitude, longitude: eventData.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });
            }
            else if (eventData.location) {
                const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(eventData.location + ", Chile")}&format=json&limit=1`;
                try {
                    const response = await fetch(searchUrl, { headers: { 'User-Agent': 'DisgoApp' } });
                    const results = await response.json();
                    if (results && results.length > 0) {
                        setRegion({ latitude: parseFloat(results[0].lat), longitude: parseFloat(results[0].lon), latitudeDelta: 0.005, longitudeDelta: 0.005 });
                    }
                } catch (geoError) { }
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: friends, error: friendsError } = await supabase.rpc('get_friends_at_event', { event_lookup_id: params.id, current_user_id: user.id });
                if (!friendsError && friends && friends.length > 0) setFriendsGoing(friends);
            }
        } catch (error) {
            router.back();
        } finally {
            if (!isRefresh) setLoading(false);
        }
    }

    const navigateToClub = async () => {
        let targetClubId = event?.clubs?.id || event?.resolvedClubId || event?.club_id;
        if (targetClubId) router.push({ pathname: '/club-detail', params: { id: String(targetClubId) } });
    };

    const openInGoogleMaps = () => {
        if (!event) return;
        const lat = event.latitude || region.latitude;
        const lng = event.longitude || region.longitude;
        const label = encodeURIComponent(event.title || "Evento");
        const url = Platform.select({
            ios: `comgooglemaps://?q=${lat},${lng}(${label})`,
            android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`
        });

        const fallbackMaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
        Linking.canOpenURL(url!).then(supported => {
            Linking.openURL(supported ? url! : fallbackMaps).catch(() => {});
        }).catch(() => {
            Linking.openURL(fallbackMaps).catch(() => {});
        });
    };

    const openUber = () => {
        if (!event) return;
        const lat = event.latitude || region.latitude;
        const lng = event.longitude || region.longitude;
        const nickName = encodeURIComponent(event.finalClubName || event.title || "Evento");
        const formattedAddress = encodeURIComponent(event.location || "Ubicación del evento");
        const uberUrl = `uber://?action=setPickup&pickup=my_location&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}&dropoff[nickname]=${nickName}&dropoff[formatted_address]=${formattedAddress}`;
        const fallbackUber = `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}&dropoff[nickname]=${nickName}&dropoff[formatted_address]=${formattedAddress}`;

        Linking.canOpenURL(uberUrl).then(supported => {
            Linking.openURL(supported ? uberUrl : fallbackUber).catch(() => {});
        }).catch(() => {
            Linking.openURL(fallbackUber).catch(() => {});
        });
    };

    const finalInstagramUrl = event?.instagram_url || optInstagramUrl;
    const openInstagram = () => {
        if (!finalInstagramUrl || finalInstagramUrl === 'EMPTY' || finalInstagramUrl.trim() === '') return;
        const url = finalInstagramUrl.startsWith('http')
            ? finalInstagramUrl
            : `https://instagram.com/${finalInstagramUrl.replace('@', '')}`;
        if (/^https?:\/\/(www\.)?instagram\.com\//.test(url)) {
            Linking.openURL(url).catch(() => {});
        }
    };

    const handleGetTickets = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            router.push({ pathname: '/login', params: { redirect: 'back' } } as any);
            return;
        }
        router.push({
            pathname: '/select-tickets',
            params: {
                eventId: event?.id || params.id,
                eventName: event?.title || optTitle,
                eventDate: event?.date || optDate,
                eventLocation: event?.location,
                accentColor: activeBg1,
            }
        });
    };

    const handleGetConsumption = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            router.push({ pathname: '/login', params: { redirect: 'back' } } as any);
            return;
        }
        router.push({
            pathname: '/(consumption)/consumption-menu',
            params: {
                eventId: String(params.id),
                eventName: event?.title || optTitle || '',
                accentColor: activeBg1,
            },
        });
    };

    const handleShare = async () => {
        try {
            const eventId = event?.id || params.id;
            const shareUrl = `https://dyzgo.com/event/${eventId}`;
            const venue = event?.finalClubName || event?.location || '';
            await Share.share({
                message: `¡Vamos a ${event?.title || optTitle}! 🚀${venue ? `\nEn: ${venue}` : ''}\n\n${shareUrl}`,
            });
        } catch (error) { }
    };

    const handleCopyAddress = async () => {
        if (event && event.location) {
            await Clipboard.setStringAsync(event.location);
            Alert.alert("Copiado", "Dirección copiada al portapapeles.");
        }
    };

    let dateObj, day, month, prohibitedList, displayEndTime, queueUI, finished, displayEndDay;

    if (event) {
        dateObj = new Date(event.date);
        day = dateObj.getUTCDate();
        month = dateObj.toLocaleString('es-ES', { month: 'short', timeZone: 'UTC' }).toUpperCase();
        prohibitedList = event.prohibited_items ? (Array.isArray(event.prohibited_items) ? event.prohibited_items : event.prohibited_items.split(',')) : [];
        displayEndTime = event.end_time ? event.end_time.substring(0, 5) : '05:00';
        queueUI = queueStatus ? getQueueUI(queueStatus.status) : getQueueUI('no_data');
        finished = isEventFinished(event);

        const endDStr = event.end_date || event.date;
        if (endDStr) {
            const endDObj = new Date(endDStr);
            const eDay = endDObj.getUTCDate();
            const eMonth = endDObj.toLocaleString('es-ES', { month: 'long', timeZone: 'UTC' }).toLowerCase();
            displayEndDay = `el ${eDay} de ${eMonth}`;
        } else {
            displayEndDay = '';
        }
    }

    const isInfo = (event?.status ?? optStatus) === 'info'

    const hasValidInstagram = Boolean(
        finalInstagramUrl && typeof finalInstagramUrl === 'string' &&
        finalInstagramUrl.trim() !== '' && finalInstagramUrl !== 'EMPTY'
    );

    let optDay: number | undefined;
    let optMonth: string | undefined;
    if (optDate && !event) {
        try {
            const [yr, mo, dy] = optDate.split('-');
            const d = new Date(Number(yr), Number(mo) - 1, Number(dy));
            optDay = d.getDate();
            optMonth = d.toLocaleString('es-ES', { month: 'short', timeZone: 'UTC' }).toUpperCase();
        } catch (_e) { }
    }

    const displayCategory = event?.category || event?.area || optCategory;
    const displayClubName = event?.finalClubName || optClubName || 'Ubicación';
    const displayClubImage = optClubImage || event?.finalClubImage || 'https://via.placeholder.com/100';
    const expObj = Array.isArray(event?.experiences) ? event.experiences[0] : event?.experiences;
    const displayProducerName = expObj?.name || optProducerName;
    const displayProducerLogo = expObj?.logo_url || optProducerLogo || 'https://via.placeholder.com/100';
    const displayProducerId = expObj?.id || optProducerId;
    const rawHour = event?.hour || optHour || '23:00';
    const displayHourFast = rawHour.substring(0, 5);

    const activeBg1 = event?.accent_color || optAccentColor || '#FF31D8';
    const activeBg2 = '#030303';

    // Convierte hex a hex+alpha (ej: '#FF31D8' + 0.2 → '#FF31D833')
    const withAlpha = (hex: string, alpha: number) => {
        const clean = hex.startsWith('#') ? hex : `#${hex}`;
        const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
        return `${clean}${a}`;
    };

    if (loading && !event) {
        return (
            <View style={{ flex: 1, backgroundColor: '#030303' }}>
                <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <LinearGradient colors={['rgba(255,49,216,0.18)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
                    <LinearGradient colors={['transparent', 'rgba(255,49,216,0.12)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                </View>
                {/* Header flotante skeleton */}
                <View style={[styles.fixedHeader, { top: insets.top + 8 }]}>
                    <View style={styles.iconBtn} />
                </View>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
                    {/* Imagen hero */}
                    <View style={[styles.imageWrapper, { paddingTop: insets.top + 64 }]}>
                        <SkeletonBox height={width - 52} width={width - 52} borderRadius={24} style={{ alignSelf: 'center' }} />
                    </View>
                    {/* Content card skeleton */}
                    <View style={styles.contentCard}>
                        <View style={styles.titleSection}>
                            <SkeletonBox height={12} width={80} borderRadius={6} style={{ marginBottom: 12 }} />
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                                <View style={{ flex: 1, gap: 8 }}>
                                    <SkeletonBox height={28} width="75%" borderRadius={8} />
                                    <SkeletonBox height={20} width="50%" borderRadius={8} />
                                </View>
                                <View style={{ alignItems: 'center', gap: 4 }}>
                                    <SkeletonBox height={14} width={36} borderRadius={4} />
                                    <SkeletonBox height={36} width={36} borderRadius={8} />
                                </View>
                            </View>
                        </View>
                        {/* Producer skeleton */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <SkeletonBox width={40} height={40} borderRadius={20} />
                            <View style={{ gap: 6 }}>
                                <SkeletonBox height={10} width={55} borderRadius={4} />
                                <SkeletonBox height={13} width={110} borderRadius={4} />
                            </View>
                        </View>
                        {/* Info card skeleton */}
                        <View style={{ borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.04)', padding: 18, marginBottom: 16, flexDirection: 'row', gap: 16 }}>
                            <View style={{ flex: 1, gap: 8 }}>
                                <SkeletonBox width={44} height={44} borderRadius={13} />
                                <SkeletonBox height={12} width="80%" borderRadius={4} />
                                <SkeletonBox height={10} width="55%" borderRadius={4} />
                            </View>
                            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                            <View style={{ flex: 1, gap: 8 }}>
                                <SkeletonBox width={44} height={44} borderRadius={13} />
                                <SkeletonBox height={12} width="70%" borderRadius={4} />
                                <SkeletonBox height={10} width="45%" borderRadius={4} />
                            </View>
                        </View>
                        {/* Descripción skeleton */}
                        <View style={{ gap: 8, marginBottom: 16 }}>
                            <SkeletonBox height={14} width="90%" borderRadius={5} />
                            <SkeletonBox height={14} width="75%" borderRadius={5} />
                            <SkeletonBox height={14} width="60%" borderRadius={5} />
                        </View>
                    </View>
                </ScrollView>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />


            {/* Fondo — 3 capas de luz con accent_color del evento */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <LinearGradient
                    colors={[withAlpha(activeBg1, 0.2), 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.6, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                    colors={['transparent', withAlpha(activeBg1, 0.15)]}
                    start={{ x: 0.4, y: 0.5 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                    colors={['transparent', withAlpha(activeBg1, 0.05), 'transparent']}
                    start={{ x: 1, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    locations={[0.3, 0.5, 0.7]}
                    style={StyleSheet.absoluteFill}
                />
            </View>

            <View style={[styles.fixedHeader, { top: insets.top + 8 }]}>
                <Animated.View style={[styles.pillBg, { opacity: headerBgAnim }]}>
                    <BlurView intensity={50} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 30, overflow: 'hidden' }]} />
                </Animated.View>
                <PressableScale scaleTo={0.82} haptic="light" onPress={() => router.back()} style={styles.iconBtn}>
                    <ArrowLeft color="#FBFBFB" size={20} />
                </PressableScale>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                    <PressableScale scaleTo={0.82} haptic="light" onPress={handleShare} style={styles.iconBtn}>
                        <Share2 color="#FBFBFB" size={20} />
                    </PressableScale>
                </View>
            </View>

            <View style={{ flex: 1 }}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: isInfo ? 40 : 130 }}
                    bounces={true}
                    overScrollMode="always"
                    scrollEventThrottle={16}
                    onScroll={(e) => {
                        const y = e.nativeEvent.contentOffset.y;
                        headerBgAnim.setValue(Math.min(1, y / 150));
                    }}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={activeBg1} colors={[activeBg1, COLORS.neonPink]} progressBackgroundColor="#111" />
                    }
                >
                    <View style={[styles.imageWrapper, { paddingTop: insets.top + 64 }]}>
                        <Image
                            source={{ uri: event?.image_url || optImageUrl || 'https://via.placeholder.com/400' }}
                            style={styles.squareImage}
                            contentFit="cover"
                            transition={0}
                        />
                    </View>

                    <View style={styles.contentCard}>

                        <AnimatedEntry index={1} fromY={28} fromScale={0.98}>
                        <View style={styles.titleSection}>
                            {displayCategory && (
                                <View style={styles.categoryCapsule}>
                                    <Text style={styles.categoryCapsuleText}>{displayCategory}</Text>
                                </View>
                            )}
                            <View style={styles.titleRow}>
                                <Text style={[styles.title, { paddingRight: 90 }]} numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.7}>
                                    {event?.title || optTitle}
                                </Text>
                                <View style={[styles.dateBadge, { position: 'absolute', right: 0, top: 0 }]}>
                                    <Text style={[styles.dateMonth, { fontSize: SCALE.dateMonthSize, color: activeBg1 }]}>{month || optMonth}</Text>
                                    <Text style={[styles.dateDay, { fontSize: SCALE.dateDaySize }]}>{day || optDay}</Text>
                                </View>
                            </View>
                        </View>
                        </AnimatedEntry>

                        {displayProducerName ? (
                            <AnimatedEntry index={2} fromY={20}>
                            <View style={styles.producerSection}>
                                <PressableScale
                                    scaleTo={0.96}
                                    haptic="light"
                                    style={styles.producerPill}
                                    onPress={() => router.push({ pathname: '/brand-profile', params: { id: displayProducerId, name: displayProducerName, logoUrl: displayProducerLogo } })}
                                >
                                    <View style={styles.producerLogoRing}>
                                        <View style={styles.producerLogoWrap}>
                                            <Image source={{ uri: displayProducerLogo }} style={styles.producerLogoImg} contentFit="cover" transition={0} />
                                        </View>
                                    </View>
                                    <View>
                                        <Text style={styles.producerLabel}>PRODUCE</Text>
                                        <Text style={styles.producerName} numberOfLines={1}>{displayProducerName}</Text>
                                    </View>
                                    <ChevronRight size={14} color={activeBg1} />
                                </PressableScale>

                                {hasValidInstagram && (
                                    <PressableScale scaleTo={0.85} haptic="light" onPress={openInstagram} style={styles.instagramSquareIcon}>
                                        <Instagram size={20} color="#FBFBFB" />
                                    </PressableScale>
                                )}
                            </View>
                            </AnimatedEntry>
                        ) : null}

                        <AnimatedEntry index={3} fromY={20}>
                            <View style={styles.mainInfoCardSection}>
                                <View style={[styles.glassCard, { paddingVertical: 18, marginBottom: 0 }]}>
                                    <View style={styles.infoSplitContainer}>
                                        <PressableScale scaleTo={0.94} haptic="light" style={styles.infoHalf} onPress={navigateToClub}>
                                            <View style={{ width: 44, height: 44, borderRadius: 13, padding: 1.5, backgroundColor: withAlpha(activeBg1, 0.45), shadowColor: activeBg1, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.65, shadowRadius: 10, marginBottom: 8 }}>
                                                <View style={{ flex: 1, borderRadius: 11.5, overflow: 'hidden' }}>
                                                    <Image source={{ uri: displayClubImage }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={0} />
                                                </View>
                                            </View>
                                            <Text style={styles.infoLabelSplit} numberOfLines={1}>{displayClubName}</Text>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                                <Text style={styles.infoValueSplit}>Ver más del club</Text>
                                                <ChevronRight size={10} color={COLORS.textZinc} />
                                            </View>
                                        </PressableScale>

                                        <View style={styles.verticalDividerInnerInfo} />

                                        <View style={styles.infoHalf}>
                                            <View style={styles.infoMediaBox}>
                                                <Clock size={20} color={activeBg1} />
                                            </View>
                                            <Text style={styles.infoLabelSplit} numberOfLines={1}>{displayHourFast} HRS</Text>
                                            <Text style={styles.infoValueSplit}>Hora de inicio</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </AnimatedEntry>


                        {event && (<>

                            {queueStatus && (
                                <AnimatedEntry index={4} fromY={24}>
                                    <View style={styles.mbSection}>
                                        <View style={[styles.glassCard, { marginBottom: 0 }]}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                    {queueUI && <queueUI.icon size={16} color={queueUI.textColor} />}
                                                    <Text style={{ color: queueUI?.textColor, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }}>{queueUI?.label}</Text>
                                                </View>
                                                {queueStatus.status !== 'no_data' && (
                                                    <Text style={{ color: queueUI?.textColor, fontSize: 10, fontWeight: '800' }}>LIVE</Text>
                                                )}
                                            </View>
                                            <Text style={{ color: COLORS.textZinc, fontSize: 13, lineHeight: 18 }}>{queueStatus.message || "Sin datos recientes."}</Text>
                                        </View>
                                    </View>
                                </AnimatedEntry>
                            )}

                            {friendsGoing.length > 0 && (
                                <AnimatedEntry index={5} fromY={24}>
                                    <View style={styles.mbSection}>
                                        <PressableScale scaleTo={0.97} haptic="light" style={[styles.glassCard, styles.socialBarInner, { marginBottom: 0, padding: 0, paddingVertical: 10, paddingHorizontal: 16 }]} onPress={() => setModalVisible(true)}>
                                            <View style={styles.avatarsStack}>
                                                {friendsGoing.slice(0, 3).map((f: any, i) => (
                                                    <Image key={f.id} source={{ uri: f.avatar_url || 'https://via.placeholder.com/100' }} style={[styles.avatarStackImg, { zIndex: 3 - i, marginLeft: i === 0 ? 0 : -12 }]} contentFit="cover" transition={0} />
                                                ))}
                                            </View>
                                            <View style={{ flex: 1, paddingLeft: 12 }}>
                                                <Text style={{ fontWeight: '900', color: '#FBFBFB', fontSize: SCALE.subtitleSize }}>
                                                    {friendsGoing[0].full_name}{friendsGoing.length > 1 ? ` y ${friendsGoing.length - 1} más` : ''}
                                                </Text>
                                                <Text style={{ color: 'rgba(251, 251, 251, 0.6)', fontSize: SCALE.subtitleSize - 1, marginTop: 2 }}>
                                                    {friendsGoing.length === 1 ? 'Asistirá a este evento' : 'Asistirán a este evento'}
                                                </Text>
                                            </View>
                                            <ChevronRight size={SCALE.buttonIconSize} color={activeBg1} />
                                        </PressableScale>
                                    </View>
                                </AnimatedEntry>
                            )}

                            {event?.music_genre && (
                                <AnimatedEntry index={6} fromY={24}>
                                    <View style={styles.mbSection}>
                                        <Text style={[styles.sectionHeader, { fontSize: 18 }]}>Tags</Text>
                                        <View style={styles.tagsRow}>
                                            {event.music_genre.split(',').map((tag: string, index: number) => (
                                                <View key={index} style={styles.tagPill}>
                                                    <Text style={styles.tagTextWhite}>{tag.trim()}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                </AnimatedEntry>
                            )}

                            {event?.description && event.description.length > 0 && (
                                <AnimatedEntry index={7} fromY={24}>
                                    <View style={styles.mbSection}>
                                        <Text style={[styles.sectionHeader, { fontSize: 18 }]}>Acerca del evento</Text>
                                        <RenderHtml
                                            contentWidth={width - (SCALE.padding * 2)}
                                            source={{ html: event.description }}
                                            tagsStyles={{
                                                body: { color: 'rgba(251, 251, 251, 0.6)', fontSize: SCALE.subtitleSize, lineHeight: 24 },
                                                b: { color: '#FBFBFB', fontWeight: '800' },
                                                strong: { color: '#FBFBFB', fontWeight: '800' },
                                                i: { fontStyle: 'italic' },
                                                p: { margin: 0, marginBottom: 10 },
                                                u: { textDecorationLine: 'underline', color: '#FBFBFB' }
                                            }}
                                        />
                                    </View>
                                </AnimatedEntry>
                            )}

                            <AnimatedEntry index={8} fromY={24}>
                                <View style={styles.mbSection}>
                                    <Text style={[styles.sectionHeader, { fontSize: 18 }]}>Información Importante</Text>
                                    <View style={[styles.glassCard, { paddingVertical: 20, marginBottom: 0 }]}>
                                        <View style={styles.rulesSplitContainer}>
                                            <View style={styles.ruleHalf}>
                                                <View style={styles.ruleIconBoxSmall}>
                                                    <User size={18} color={activeBg1} />
                                                </View>
                                                <Text style={styles.ruleLabelSplit}>Edad Mínima</Text>
                                                <Text style={styles.ruleValueSplit}>+{event.min_age_women || 18} M   +{event.min_age_men || 18} H</Text>
                                            </View>
                                            <View style={styles.verticalDividerInner} />
                                            <View style={styles.ruleHalf}>
                                                <View style={styles.ruleIconBoxSmall}>
                                                    <Shirt size={18} color={activeBg1} />
                                                </View>
                                                <Text style={styles.ruleLabelSplit}>Dress Code</Text>
                                                <Text style={styles.ruleValueSplit} numberOfLines={1}>{event.dress_code || 'Casual'}</Text>
                                            </View>
                                        </View>

                                        {prohibitedList.length > 0 && (
                                            <>
                                                <View style={[styles.dividerInner, { marginTop: 20 }]} />
                                                <Text style={styles.prohibitedHeader}>Artículos Prohibidos:</Text>
                                                <View style={styles.prohibitedContainer}>
                                                    {prohibitedList.map((item: string, index: number) => (
                                                        <View key={index} style={styles.prohibitedItemSmall}>
                                                            <Ban size={10} color="#ff5959" />
                                                            <Text style={styles.prohibitedTextSmall}>{item.trim()}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            </>
                                        )}
                                    </View>
                                </View>
                            </AnimatedEntry>

                            <AnimatedEntry index={9} fromY={24}>
                                <View style={styles.mbSection}>
                                    <Text style={[styles.sectionHeader, { fontSize: 18 }]}>Ubicación y Llegada</Text>
                                    <View style={[styles.glassCard, { marginBottom: 0 }]}>
                                        <View style={styles.mapContainer} pointerEvents="none">
                                            <MapView provider={PROVIDER_GOOGLE} style={styles.map} scrollEnabled={false} zoomEnabled={false} region={region} mapType="hybrid" liteMode={true}>
                                                <Marker coordinate={{ latitude: region.latitude, longitude: region.longitude }}>
                                                    <View style={[styles.classicPin, { shadowColor: activeBg1 }]}><MapPin size={36} color="#FBFBFB" fill={activeBg1} /></View>
                                                </Marker>
                                            </MapView>
                                        </View>

                                        {event?.location && (
                                            <View style={styles.addressContainer}>
                                                <Text style={styles.addressText} numberOfLines={1}>{event.location}</Text>
                                                <PressableScale scaleTo={0.88} haptic="light" onPress={handleCopyAddress} style={styles.copyButton}>
                                                    <Copy size={12} color={activeBg1} />
                                                    <Text style={[styles.copyButtonText, { color: activeBg1 }]}>Copiar</Text>
                                                </PressableScale>
                                            </View>
                                        )}

                                        <View style={styles.transportDualRow}>
                                            <PressableScale scaleTo={0.94} haptic="medium" style={styles.transportButtonHalf} onPress={openUber}>
                                                <View style={styles.uberIconBox}><Text style={styles.uberIconText}>Uber</Text></View>
                                                <Text style={styles.transportButtonText}>Pedir Uber</Text>
                                            </PressableScale>
                                            <PressableScale scaleTo={0.94} haptic="medium" style={styles.transportButtonHalf} onPress={openInGoogleMaps}>
                                                <View style={styles.mapsIconBox}><Navigation size={14} color="#4285F4" /></View>
                                                <Text style={styles.transportButtonText}>Navegar</Text>
                                            </PressableScale>
                                        </View>
                                    </View>
                                </View>
                            </AnimatedEntry>

                            <AnimatedEntry index={10} fromY={24}>
                                <View style={styles.legalSection}>
                                    {!isInfo && (
                                        <Text style={styles.legalText}>
                                            La producción se reserva el derecho de admisión.
                                            Las personas que no cumplan con la edad mínima o el código de vestimenta establecido no podrán ingresar al recinto y sus entradas no serán reembolsadas.
                                        </Text>
                                    )}
                                    <Text style={styles.legalTextHighlight}>
                                        Este evento tiene como hora de finalización aproximada las {displayEndTime} HRS {displayEndDay}.
                                    </Text>
                                    {isInfo && (
                                        <Text style={[styles.legalText, { marginTop: 10, color: 'rgba(251,251,251,0.5)' }]}>
                                            Este es un evento informativo. No existe venta de tickets ni sistema de compra asociado. Toda la información publicada es de carácter referencial.
                                        </Text>
                                    )}
                                </View>
                            </AnimatedEntry>

                        </>)}

                    </View>
                </ScrollView>

                {!isInfo && (
                <BlurView intensity={80} tint="dark" style={styles.footer}>
                        <>
                            <View style={styles.footerInfo}>
                                <Text style={[styles.footerLabel, { fontSize: SCALE.labelSize }]}>Desde</Text>
                                <Text style={[styles.footerPrice, { fontSize: SCALE.valueSize * 1.4 }]}>${minPrice.toLocaleString()}</Text>
                            </View>

                            <PressableScale
                                scaleTo={0.96}
                                haptic="medium"
                                style={[styles.buyBtnContainer, styles.buyBtnGradient, {
                                    backgroundColor: finished ? 'rgba(255,255,255,0.05)' : withAlpha(activeBg1, 0.15),
                                    borderWidth: 1,
                                    borderColor: finished ? '#333' : withAlpha(activeBg1, 0.35),
                                }]}
                                onPress={handleGetTickets}
                                disabled={!optTitle && !event || (finished ?? false)}
                            >
                                <Text style={[styles.buyBtnText, { fontSize: SCALE.buttonTextSize, color: finished ? 'rgba(251,251,251,0.5)' : activeBg1 }]}>
                                    {finished ? 'EVENTO FINALIZADO' : 'OBTENER TICKETS'}
                                </Text>
                                {!finished && !hasConsumptionMenu && <ArrowRight color={activeBg1} size={SCALE.buttonIconSize} />}
                            </PressableScale>

                            {hasConsumptionMenu && !finished && (
                                <PressableScale
                                    scaleTo={0.94}
                                    haptic="light"
                                    style={[styles.consumptionBtn, {
                                        backgroundColor: withAlpha(activeBg1, 0.1),
                                        borderColor: withAlpha(activeBg1, 0.3),
                                    }]}
                                    onPress={handleGetConsumption}
                                >
                                    <Wine size={22} color={activeBg1} />
                                </PressableScale>
                            )}
                        </>
                </BlurView>
                )}

                <Modal visible={modalVisible} transparent statusBarTranslucent onRequestClose={closeAttendeeModal}>
                    <RAnimated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }, modalOverlayStyle]}>
                        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeAttendeeModal} />
                    </RAnimated.View>
                    <RAnimated.View style={[styles.modalContent, modalSheetStyle]}>
                        <View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }]}>
                            <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
                        </View>
                        <GestureDetector gesture={attendeesPan}>
                            <View style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 24 }}>
                                <View style={styles.modalHandle} />
                            </View>
                        </GestureDetector>
                        <Text style={styles.modalTitle}>
                            {friendsGoing.length === 1 ? 'Asistirá a este evento' : `Asistirán a este evento (${friendsGoing.length})`}
                        </Text>
                        <FlatList
                            data={friendsGoing}
                            keyExtractor={(item) => item.id.toString()}
                            showsVerticalScrollIndicator={false}
                            renderItem={({ item }) => (
                                <PressableScale
                                    scaleTo={0.97}
                                    haptic="light"
                                    style={styles.modalFriendRow}
                                    onPress={() => { closeAttendeeModal(); router.push({ pathname: '/user-profile', params: { id: item.id } }); }}
                                >
                                    <Image source={{ uri: item.avatar_url || 'https://via.placeholder.com/50' }} style={styles.modalAvatar} contentFit="cover" transition={0} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.modalFriendName}>{item.full_name}</Text>
                                        <Text style={styles.modalFriendStatus}>Amigo</Text>
                                    </View>
                                    <CheckCircle2 size={18} color={activeBg1} />
                                </PressableScale>
                            )}
                        />
                    </RAnimated.View>
                </Modal>

                <Modal visible={transportModalVisible} transparent animationType="none">
                    <View style={styles.modalOverlay}>
                        <TouchableOpacity style={{ flex: 1 }} onPress={() => setTransportModalVisible(false)} />
                        <View style={styles.transportModalContent}>
                            <View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }]}>
                                <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
                            </View>
                            <View style={styles.modalGradient}>
                                <View style={styles.modalHandle} />
                                <Text style={styles.modalTitle}>¿Cómo quieres llegar?</Text>
                                <View style={styles.transportOptions}>
                                    <PressableScale scaleTo={0.96} haptic="medium" style={styles.transportBtn} onPress={openUber}>
                                        <View style={styles.transportIcon}><Text style={{ color: '#FBFBFB', fontWeight: '900', fontSize: 18 }}>Uber</Text></View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.transportName}>Pedir Uber</Text>
                                            <Text style={styles.transportTime}>Te lleva directo a la puerta</Text>
                                        </View>
                                        <ChevronRight color={COLORS.textZinc} size={20} />
                                    </PressableScale>
                                    <PressableScale scaleTo={0.96} haptic="medium" style={styles.transportBtn} onPress={openInGoogleMaps}>
                                        <View style={[styles.transportIcon, { backgroundColor: 'rgba(66,133,244,0.15)', borderWidth: 1, borderColor: 'rgba(66,133,244,0.3)' }]}><Navigation color="#4285F4" size={20} /></View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.transportName}>Google Maps</Text>
                                            <Text style={styles.transportTime}>Navegación paso a paso</Text>
                                        </View>
                                        <ChevronRight color={COLORS.textZinc} size={20} />
                                    </PressableScale>
                                </View>
                            </View>
                        </View>
                    </View>
                </Modal>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#030303' },
    fixedHeader: { position: 'absolute', left: 16, right: 16, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 50, paddingHorizontal: 6 },
    pillBg: { overflow: 'hidden', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 30, borderWidth: 1, borderColor: COLORS.glassBorder, backgroundColor: 'rgba(255, 255, 255, 0.05)' },
    iconBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
    imageWrapper: { width: width, paddingHorizontal: 20, paddingTop: 110, alignItems: 'center' },
    squareImage: { width: width - 40, aspectRatio: 1, borderRadius: 32, backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
    contentCard: { flex: 1, paddingHorizontal: SCALE.padding, paddingTop: 10 },
    titleSection: { marginBottom: SCALE.sectionGap },
    categoryCapsule: { alignSelf: 'flex-start', backgroundColor: 'rgba(255, 255, 255, 0.05)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: COLORS.glassBorder, marginBottom: SCALE.sectionGap },
    categoryCapsuleText: { color: '#FBFBFB', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    producerSection: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SCALE.sectionGap },
    mainInfoCardSection: { marginBottom: SCALE.sectionGap },
    mbSection: { marginBottom: SCALE.sectionGap },
    titleRow: { position: 'relative' },
    title: { color: '#FBFBFB', fontWeight: '900', fontStyle: 'italic', fontSize: SCALE.titleSize, letterSpacing: -1 },
    producerPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 18, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 1, borderColor: COLORS.glassBorder, gap: 8 },
    producerLogoRing: { width: 32, height: 32, borderRadius: 16, padding: 1.5, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
    producerLogoWrap: { width: '100%', height: '100%', borderRadius: 14, overflow: 'hidden' },
    producerLogoImg: { width: '100%', height: '100%' },
    producerLabel: { color: 'rgba(251, 251, 251, 0.6)', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
    producerName: { color: '#FBFBFB', fontSize: 13, fontWeight: '900' },
    instagramSquareIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 1, borderColor: COLORS.glassBorder, justifyContent: 'center', alignItems: 'center' },
    dateBadge: { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.glassBorder, minWidth: 70 },
    dateMonth: { fontWeight: '900', textTransform: 'uppercase' },
    dateDay: { color: '#FBFBFB', fontWeight: '900' },
    glassCard: { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 24, padding: SCALE.cardPadding, borderWidth: 1, borderColor: COLORS.glassBorder },
    infoSplitContainer: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
    infoHalf: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 4 },
    infoMediaBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8, backgroundColor: 'rgba(3, 3, 3, 0.6)' },
    infoLabelSplit: { color: '#FBFBFB', fontSize: 14, fontWeight: '900', textAlign: 'center', marginBottom: 4 },
    infoValueSplit: { color: 'rgba(251, 251, 251, 0.6)', fontSize: 11, fontWeight: '500', textAlign: 'center' },
    verticalDividerInnerInfo: { width: 1, height: '100%', minHeight: 85, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 10 },
    dividerInner: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 16 },
    socialBarInner: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 },
    avatarsStack: { flexDirection: 'row' },
    avatarStackImg: { width: 32, height: 32, borderRadius: 16 },
    socialText: { color: 'rgba(251, 251, 251, 0.6)' },
    tagsRow: { flexDirection: 'row', gap: SCALE.gap, flexWrap: 'wrap', alignItems: 'center' },
    tagPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SCALE.gap, paddingVertical: SCALE.gap / 1.5, borderRadius: 14, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 1, borderColor: COLORS.glassBorder },
    tagTextWhite: { color: '#FBFBFB', fontWeight: '700', fontSize: 12 },
    sectionHeader: { color: '#FBFBFB', fontWeight: '900', marginBottom: 15 },
    rulesSplitContainer: { flexDirection: 'row', alignItems: 'center' },
    ruleHalf: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    ruleIconBoxSmall: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(3, 3, 3, 0.6)', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    verticalDividerInner: { width: 1, height: 60, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 10 },
    ruleLabelSplit: { color: 'rgba(251, 251, 251, 0.6)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, textAlign: 'center' },
    ruleValueSplit: { color: '#FBFBFB', fontSize: 14, fontWeight: '800', textAlign: 'center' },
    prohibitedHeader: { color: 'rgba(251, 251, 251, 0.6)', fontSize: 12, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
    prohibitedContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
    prohibitedItemSmall: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255, 0, 0, 0.05)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255, 0, 0, 0.1)' },
    prohibitedTextSmall: { color: '#ff5959', fontWeight: '800', fontSize: 10 },
    mapContainer: { height: 160, width: '100%', borderRadius: 32, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', marginBottom: 10 },
    map: { flex: 1 },
    classicPin: { shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, elevation: 5 },
    addressContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.glassBorder },
    addressText: { color: 'rgba(251, 251, 251, 0.6)', fontSize: 11, flex: 1, marginRight: 10 },
    copyButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255, 255, 255, 0.05)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: COLORS.glassBorder },
    copyButtonText: { fontSize: 10, fontWeight: '800' },
    transportDualRow: { flexDirection: 'row', gap: 12 },
    transportButtonHalf: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.05)', paddingVertical: 14, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1, borderColor: COLORS.glassBorder, gap: 10 },
    transportButtonText: { color: '#FBFBFB', fontSize: 13, fontWeight: '800' },
    uberIconBox: { backgroundColor: 'rgba(3, 3, 3, 0.6)', width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 0, borderColor: 'rgba(255,255,255,0.2)' },
    uberIconText: { color: '#FBFBFB', fontWeight: '900', fontSize: 9 },
    mapsIconBox: { backgroundColor: 'rgba(66, 133, 244, 0.15)', width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(66, 133, 244, 0.3)', justifyContent: 'center', alignItems: 'center' },
    legalSection: { marginTop: 10, marginBottom: 12, paddingHorizontal: 10 },
    legalText: { color: 'rgba(251, 251, 251, 0.6)', fontSize: 11, textAlign: 'center', lineHeight: 16, marginBottom: 8 },
    legalTextHighlight: { color: 'rgba(251, 251, 251, 0.6)', fontSize: 11, textAlign: 'center', fontWeight: '800' },
    footer: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderTopWidth: 1, borderTopColor: 'rgba(251, 251, 251, 0.15)', paddingHorizontal: SCALE.padding, paddingVertical: SCALE.padding, paddingBottom: isSmallScreen ? 25 : 35, flexDirection: 'row', alignItems: 'center' },
    footerInfo: { flex: 1 },
    footerLabel: { color: 'rgba(251, 251, 251, 0.6)', fontWeight: '800' },
    footerPrice: { color: '#FBFBFB', fontWeight: '900', fontStyle: 'italic' },
    buyBtnContainer: { flex: 1.4 },
    buyBtnGradient: { height: isSmallScreen ? 50 : 58, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
    buyBtnText: { color: '#FBFBFB', fontWeight: '900' },
    consumptionBtn: { width: isSmallScreen ? 50 : 58, height: isSmallScreen ? 50 : 58, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1, marginLeft: 8 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalContent: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.55, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 25, paddingBottom: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    modalGradient: { flex: 1, padding: 25 },
    modalHandle: { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', borderRadius: 2 },
    modalTitle: { color: '#FBFBFB', fontSize: 18, fontWeight: '900', fontStyle: 'italic', marginBottom: 20 },
    modalFriendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: 14, borderRadius: 20, borderWidth: 1, borderColor: COLORS.glassBorder },
    modalAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 14 },
    modalFriendName: { color: '#FBFBFB', fontWeight: '800', fontSize: 15 },
    modalFriendStatus: { color: 'rgba(251, 251, 251, 0.6)', fontSize: 12, marginTop: 2 },
    transportModalContent: { height: height * 0.45, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    transportOptions: { gap: 15 },
    transportBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: 16, borderRadius: 20, gap: 15, borderWidth: 1, borderColor: COLORS.glassBorder },
    transportIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(3, 3, 3, 0.6)' },
    transportName: { color: '#FBFBFB', fontSize: 16, fontWeight: '800' },
    transportTime: { color: 'rgba(251, 251, 251, 0.6)', fontSize: 12 }
});