import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import {
    Bell,
    ChevronLeft,
    ChevronRight,
    Crown,
    MapPin,
    Ticket,
    Users,
    Wifi,
    Sparkles,
    Flame
} from 'lucide-react-native';
import React, { useCallback, memo, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    ImageBackground,
    InteractionManager,
    Platform,
    ScrollView,
    Share,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { AnimatedEntry } from '../../components/animated/AnimatedEntry';
import { PressableScale } from '../../components/animated/PressableScale';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from '../../components/BlurSurface';

import Animated, {
    Easing,
    Extrapolation,
    interpolate,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useSharedValue
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { supabase } from '../../lib/supabase';
import { SkeletonBox } from '../../components/SkeletonBox';
import { useLocation } from '../../context/LocationContext';
import { formatDistance, getDistanceFromLatLonInKm } from '../../utils/location';
import { COLORS } from '../../constants/colors';
import { safeFormatDate, formatDayShort, getImageUrl } from '../../utils/format';
import { PermissionModal } from '../../components/PermissionModal';
import { useMouseScroll } from '../../hooks/useMouseScroll';

const { width: windowWidth, height } = Dimensions.get('window');
const width = Platform.OS === 'web' ? Math.min(windowWidth, 800) : windowWidth;
const S = Platform.OS === 'web' ? 1 : width / 430; // scale factor vs iPhone 15 Pro Max

const CARD_BASE_WIDTH = Platform.OS === 'web' ? 430 : width;
const ITEM_WIDTH = Math.round(CARD_BASE_WIDTH * 0.75); // Tarjetas de club
const SPACING = 16;
const FULL_SIZE = ITEM_WIDTH + SPACING;

// Próximos eventos carousel — equal to brand-profile approach
const EVENT_CARD_W = Platform.OS === 'web' ? 400 : width - 52;
const EVENT_GAP = 12;
const EVENT_SNAP = EVENT_CARD_W + EVENT_GAP;

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const ClubItem = memo(function ClubItem({ item, index, scrollX, location, onScrollTo }: {
    item: any;
    index: number;
    scrollX: SharedValue<number>;
    location: any;
    onScrollTo: (index: number) => void;
}) {
    const router = useRouter();

    const distanceText = useMemo(() => {
        if (!location || !item.latitude || !item.longitude) return '';
        const dist = getDistanceFromLatLonInKm(
            location.coords.latitude,
            location.coords.longitude,
            item.latitude,
            item.longitude
        );
        return formatDistance(dist);
    }, [location, item.latitude, item.longitude]);

    const activeEvents = useMemo(() =>
        (item.active_events || []).filter((e: any) => e.is_active === true && (e.status === 'active' || e.status === 'info')),
        [item.active_events]
    );

    const animatedStyle = useAnimatedStyle(() => {
        const inputRange = [
            (index - 1) * FULL_SIZE,
            index * FULL_SIZE,
            (index + 1) * FULL_SIZE
        ];

        const scale = interpolate(scrollX.value, inputRange, [0.9, 1, 0.9], Extrapolation.CLAMP);
        const opacity = interpolate(scrollX.value, inputRange, [0.6, 1, 0.6], Extrapolation.CLAMP);
        const translateY = interpolate(scrollX.value, inputRange, [15, 0, 15], Extrapolation.CLAMP);

        return { transform: [{ scale }, { translateY }], opacity };
    });

    const handlePress = () => {
        const targetX = index * FULL_SIZE;
        if (Math.abs(scrollX.value - targetX) > FULL_SIZE * 0.4) {
            onScrollTo(index);
        } else {
            router.push({ pathname: '/club-detail', params: Platform.OS === 'web' ? { id: item.id } : { id: item.id, imageUrl: item.image, name: item.name } });
        }
    };

    return (
        <Animated.View style={[{ width: ITEM_WIDTH, marginRight: SPACING }, animatedStyle, Platform.OS === 'web' && { scrollSnapAlign: 'center' } as any]}>
            <PressableScale
                scaleTo={0.97}
                haptic="light"
                onPress={handlePress}
                style={styles.clubCardContainer}
            >
                <ImageBackground source={{ uri: getImageUrl(item.image, 800) }} style={styles.clubImgRounded} imageStyle={{ borderRadius: 31 }}>
                    <LinearGradient colors={['transparent', 'rgba(3, 3, 3, 0.8)', '#030303']} style={styles.clubOverlay} locations={[0.3, 0.8, 1]}>
                        <View style={styles.clubHeaderRow}>
                            {distanceText ? (
                                <BlurView intensity={30} tint="dark" style={styles.glassBadge}>
                                    <MapPin size={12} color="rgba(251, 251, 251, 0.5)" />
                                    <Text style={styles.glassBadgeText}>{distanceText}</Text>
                                </BlurView>
                            ) : <View />}
                        </View>

                        <View style={styles.clubInfoFooter}>
                            <Text style={styles.clubNameTitle} numberOfLines={1}>{item.name}</Text>
                            <Text style={styles.clubLocText} numberOfLines={1}>{item.location}</Text>
                        </View>
                    </LinearGradient>
                </ImageBackground>
            </PressableScale>
        </Animated.View>
    );
});

export default function HomeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    
    // Ocultamiento seguro para Web
    const [isScreenFocused, setIsScreenFocused] = useState(true);
    useFocusEffect(
        useCallback(() => {
            setIsScreenFocused(true);
            return () => setIsScreenFocused(false);
        }, [])
    );

    const params = useLocalSearchParams();
    const { location, needsPermission, requestPermission } = useLocation();
    const [showLocationModal, setShowLocationModal] = useState(false);

    // --- DATOS PRECARGADOS ---
    const initialData = useMemo(() => {
        if (params.preloadedData) {
            try { return JSON.parse(params.preloadedData as string); }
            catch (e) { return null; }
        }
        return null;
    }, [params.preloadedData]);

    const [userName, setUserName] = useState(initialData?.profile?.full_name || '');
    const [avatarUrl, setAvatarUrl] = useState(initialData?.profile?.avatar_url || null);

    const [topClubs, setTopClubs] = useState<any[]>(() => {
        const clubs = initialData?.clubs || [];
        return clubs.map((c: any) => ({
            ...c, active_events: (c.active_events || []).filter((e: any) => e.is_active === true && e.status === 'active')
        }));
    });

    const [featuredEvents, setFeaturedEvents] = useState<any[]>(() => {
        const evs = (initialData?.events || []).filter((e: any) => e.is_active === true && (e.status === 'active' || e.status === 'info') && e.image_url);
        return evs.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 6);
    });

    const [loading, setLoading] = useState(!initialData);
    const [connecting, setConnecting] = useState(false);

    // Mostrar modal de explicación cuando el permiso de ubicación no ha sido decidido
    useEffect(() => {
        if (Platform.OS === 'web') return; // En la web no queremos molestar con esto
        if (needsPermission && !loading) {
            const timer = setTimeout(() => setShowLocationModal(true), 600);
            return () => clearTimeout(timer);
        }
    }, [needsPermission, loading]);
    const [hasUnreadNotifs, setHasUnreadNotifs] = useState(false);

    // Redirige al login con param redirect si no hay sesión, retorna false
    const requireAuth = async (destination: string): Promise<boolean> => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            router.push({ pathname: '/login', params: { redirect: destination } } as any);
            return false;
        }
        return true;
    };

    const flatListRef = useRef<FlatList>(null);
    const featuredListRef = useRef<FlatList>(null);
    const mouseScrollClubs = useMouseScroll(flatListRef, FULL_SIZE);
    const featuredScrollX = useRef(0);
    const hasCentered = useRef(false);
    const scrollX = useSharedValue(0);

    const handleFeaturedPress = (index: number, event: any) => {
        const targetOffset = index * EVENT_SNAP;
        const currentOffset = featuredScrollX.current;
        if (Math.abs(currentOffset - targetOffset) > EVENT_SNAP / 2) {
            featuredListRef.current?.scrollToOffset({ offset: targetOffset, animated: true });
        } else {
            const cl = Array.isArray(event.clubs) ? event.clubs[0] : event.clubs;
            const exp = Array.isArray(event.experiences) ? event.experiences[0] : event.experiences;
            router.push({ pathname: '/event-detail', params: Platform.OS === 'web' ? { id: event.id } : { id: event.id, imageUrl: event.image_url, title: event.title, date: event.date, accentColor: event.accent_color, category: event.area || event.category, hour: event.hour, clubName: cl?.name || event.club_name, clubImage: cl?.image, producerName: exp?.name, producerLogo: exp?.logo_url, producerId: exp?.id, instagramUrl: event.instagram_url, status: event.status } });
        }
    };

    const onScrollHandler = useAnimatedScrollHandler((event) => {
        scrollX.value = event.contentOffset.x;
    });

    const infiniteClubs = useMemo(() => {
        if (!topClubs || topClubs.length === 0) return [];
        return Array(6).fill(topClubs).flat();
    }, [topClubs]);

    const startIndex = useMemo(() => {
        return topClubs.length > 0 ? Math.floor(infiniteClubs.length / 2) : 0;
    }, [topClubs, infiniteClubs]);

    const getItemLayout = (data: any, index: number) => ({
        length: FULL_SIZE, offset: FULL_SIZE * index, index,
    });

    // --- CARGA DE DATOS ---
    const fetchData = useCallback(async () => {
        if (topClubs.length === 0 && featuredEvents.length === 0) setLoading(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user ?? null;
            if (user) {
                const [{ data: profile }, { count: unreadCount }] = await Promise.all([
                    supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single(),
                    supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false),
                ]);

                if (profile) {
                    setUserName(profile.full_name || '');
                    setAvatarUrl(profile.avatar_url || null);
                }
                setHasUnreadNotifs((unreadCount ?? 0) > 0);
            } else {
                setUserName('');
                setAvatarUrl(null);
                setHasUnreadNotifs(false);
            }

            const { data: clubs } = await supabase.from('clubs').select('*').order('name', { ascending: true }).limit(10);
            const { data: allActiveEvents } = await supabase.from('events').select('id, title, image_url, club_id, club_name, status, is_active, date').eq('is_active', true).in('status', ['active', 'info']);

            let processedClubs = clubs || [];
            if (clubs && allActiveEvents) {
                processedClubs = clubs.map((club: any) => {
                    const cEvents = allActiveEvents.filter((e: any) =>
                        e.is_active === true && (e.status === 'active' || e.status === 'info') &&
                        (e.club_id === club.id || (e.club_name && e.club_name.trim().toLowerCase() === club.name.trim().toLowerCase()))
                    );
                    return { ...club, active_events: cEvents };
                });
            }
            if (processedClubs) setTopClubs(processedClubs);

            const { data: events } = await supabase
                .from('events')
                .select('*, clubs(latitude, longitude, name, image), experiences(id, name, logo_url)')
                .eq('is_active', true)
                .in('status', ['active', 'info'])
                .not('image_url', 'is', null)
                .order('date', { ascending: true })
                .limit(6);

            if (events && events.length > 0) {
                let eventsWithAttendees = events.map((event: any) => ({ ...event, attendeesAvatars: [], friendsCount: 0 }));

                if (user) {
                    const [myFollowing, theirFollowing] = await Promise.all([
                        supabase.from('follows').select('following_id').eq('follower_id', user.id).eq('status', 'accepted'),
                        supabase.from('follows').select('follower_id').eq('following_id', user.id).eq('status', 'accepted'),
                    ]);
                    const iFollow = myFollowing.data?.map((f: any) => f.following_id) ?? [];
                    const theyFollow = theirFollowing.data?.map((f: any) => f.follower_id) ?? [];
                    const friendIds = iFollow.filter((id: string) => theyFollow.includes(id));

                    if (friendIds.length > 0) {
                        const eventIds = events.map((e: any) => e.id);
                        const { data: tickets } = await supabase
                            .from('tickets')
                            .select('event_id, user_id, profiles(avatar_url)')
                            .in('event_id', eventIds)
                            .in('user_id', friendIds);

                        eventsWithAttendees = events.map((event: any) => {
                            const relevantTickets = tickets?.filter((t: any) => t.event_id === event.id) || [];
                            const uniqueAvatars = new Set();
                            const attendeesAvatars: string[] = [];
                            relevantTickets.forEach((t: any) => {
                                if (t.user_id === user.id) return;
                                const url = t.profiles?.avatar_url;
                                if (url && !uniqueAvatars.has(url)) {
                                    uniqueAvatars.add(url);
                                    attendeesAvatars.push(url);
                                }
                            });
                            return { ...event, attendeesAvatars, friendsCount: attendeesAvatars.length };
                        });
                    }
                }

                setFeaturedEvents(eventsWithAttendees);
                eventsWithAttendees.forEach((e: any) => {
                    const cl = Array.isArray(e.clubs) ? e.clubs[0] : e.clubs;
                    const exp = Array.isArray(e.experiences) ? e.experiences[0] : e.experiences;
                    if (cl?.image) ExpoImage.prefetch(cl.image);
                    if (exp?.logo_url) ExpoImage.prefetch(exp.logo_url);
                });
            } else {
                setFeaturedEvents([]);
            }
        } catch (error) {
            console.error("Error Home:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            hasCentered.current = false;
            const task = InteractionManager.runAfterInteractions(() => {
                fetchData();
                // Re-snap al card más cercano si quedó en posición rara al volver de navegación
                if (featuredListRef.current && featuredScrollX.current > 0) {
                    const nearest = Math.round(featuredScrollX.current / EVENT_SNAP) * EVENT_SNAP;
                    if (Math.abs(featuredScrollX.current - nearest) > 2) {
                        featuredListRef.current.scrollToOffset({ offset: nearest, animated: false });
                    }
                }
            });
            return () => task.cancel();
        }, [fetchData])
    );

    useEffect(() => {
        if (!topClubs.length || !flatListRef.current || hasCentered.current) return;
        const frame = requestAnimationFrame(() => {
            if (flatListRef.current && infiniteClubs.length > startIndex) {
                scrollX.value = startIndex * FULL_SIZE;
                flatListRef.current.scrollToOffset({ offset: startIndex * FULL_SIZE, animated: false });
                hasCentered.current = true;
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [startIndex]);

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const node = (flatListRef.current as any)?.getScrollableNode?.() ?? flatListRef.current;
        if (!node) return;
        node.style.scrollSnapType = 'x mandatory';
        node.style.webkitOverflowScrolling = 'touch';
    }, [topClubs]);

    const handleProximityConnect = async () => {
        if (!(await requireAuth('/(tabs)/home'))) return;
        try {
            setConnecting(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const secretToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            const { data: invite, error } = await supabase.from('friend_invites').insert({ sender_id: user.id, token: secretToken }).select().single();
            if (error) throw error;
            const shareUrl = Linking.createURL('/add-friend', { queryParams: { inviteId: invite.id, token: secretToken } });
            await Share.share(
                Platform.OS === 'ios'
                    ? { url: shareUrl, message: `¡Conectemos en DyzGO! 🤜🤛 Acepta aquí: ${shareUrl}` }
                    : { message: `¡Conectemos en DyzGO! 🤜🤛 Acepta aquí: ${shareUrl}` }
            );
        } catch (e) {
            console.error("Error connecting:", e);
        } finally {
            setConnecting(false);
        }
    };

    const renderClubItem = useCallback(({ item, index }: { item: any; index: number }) => (
        <ClubItem
            item={item}
            index={index}
            scrollX={scrollX}
            location={location}
            onScrollTo={(idx) => {
                flatListRef.current?.scrollToOffset({ offset: idx * FULL_SIZE, animated: true });
            }}
        />
    ), [scrollX, location]);
    
    return (
        <View style={[styles.container, Platform.OS === 'web' && !isScreenFocused && { opacity: 0 }]} pointerEvents={Platform.OS === 'web' && !isScreenFocused ? 'none' : 'auto'}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* GLOW ROJO SUTIL EN EL FONDO - Luces difuminadas sin oscurecer el negro */}
            {Platform.OS !== 'web' && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                {/* Luz superior izquierda */}
                <LinearGradient
                    colors={['rgba(255, 49, 216, 0.2)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.6, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                />
                {/* Luz inferior derecha */}
                <LinearGradient
                    colors={['transparent', 'rgba(255, 49, 216, 0.15)']}
                    start={{ x: 0.4, y: 0.5 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                {/* Destello muy sutil cruzado */}
                <LinearGradient
                    colors={['transparent', 'rgba(255, 49, 216, 0.05)', 'transparent']}
                    start={{ x: 1, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    locations={[0.3, 0.5, 0.7]}
                    style={StyleSheet.absoluteFill}
                />
            </View>
            )}



            {/* NAVBAR FLOTANTE ESTILO GLASSMORPHISM */}
            <View style={[styles.floatingHeader, { top: insets.top + 10 }]}>
                <BlurView intensity={50} tint="dark" style={styles.blurNavbar}>
                    <View style={styles.brandRow}>
                        <Text style={styles.brandText}>DyzGO<Text style={{ color: '#FF31D8' }}>.</Text></Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                        <PressableScale scaleTo={0.82} haptic="light" style={styles.bellContainer} onPress={async () => { if (await requireAuth('/notifications')) router.push('/notifications'); }}>
                            <Bell color="rgba(251, 251, 251, 0.5)" size={24} />
                            {hasUnreadNotifs && <View style={styles.notifDot} />}
                        </PressableScale>

                        <PressableScale scaleTo={0.88} haptic="light" onPress={async () => { if (await requireAuth('/profile')) router.push('/profile'); }}>
                            <View style={styles.avatarBorder}>
                                {avatarUrl ? (
                                    <ExpoImage source={{ uri: avatarUrl ?? undefined }} style={styles.avatarImage} contentFit="cover" cachePolicy="memory-disk" />
                                ) : (
                                    <View style={styles.avatarFallback}>
                                        <Text style={styles.avatarInitial}>{userName ? userName[0].toUpperCase() : '?'}</Text>
                                    </View>
                                )}
                            </View>
                        </PressableScale>
                    </View>
                </BlurView>
            </View>

            <AnimatedScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120, paddingTop: insets.top + Math.round(80 * S) }}
            >
                {/* 1. HERO GREETING */}
                <AnimatedEntry index={0} fromY={20} style={styles.heroSection}>
                    <Text style={styles.greetingText}>
                        {userName ? `Hola, ${userName.split(' ')[0]}` : '\u00a1Hola!'}
                    </Text>
                    <Text style={styles.heroMainText}>
                        ¿Dónde salimos <Text style={styles.nocheText}>hoy?</Text>
                    </Text>
                </AnimatedEntry>

                {/* 2. EVENTOS DESTACADOS IMMERSIVOS */}
                <View style={styles.sectionMargin}>
                    <View style={styles.sectionHeaderLine}>
                        <Text style={styles.sectionTitle}>Próximos eventos</Text>
                        <PressableScale scaleTo={0.92} haptic="light" onPress={() => router.push({ pathname: '/explore', params: { tab: 'Eventos' } })}>
                            <View style={styles.seeAllBadge}>
                                <Text style={styles.seeAllText}>Ver todos</Text>
                            </View>
                        </PressableScale>
                    </View>

                    {loading && featuredEvents.length === 0 ? (
                        <FlatList
                            horizontal
                            data={[1, 2]}
                            keyExtractor={(i) => String(i)}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingLeft: 26, paddingRight: 14, gap: EVENT_GAP }}
                            renderItem={() => (
                                <SkeletonBox height={EVENT_CARD_W} width={EVENT_CARD_W} borderRadius={30} />
                            )}
                        />
                    ) : (
                        <FlatList
                            ref={featuredListRef}
                            horizontal
                            data={featuredEvents}
                            keyExtractor={(item: any) => item.id}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingLeft: 26, paddingRight: 14, gap: EVENT_GAP }}
                            snapToInterval={EVENT_SNAP}
                            decelerationRate="fast"
                            removeClippedSubviews={true}
                            maxToRenderPerBatch={8}
                            windowSize={5}
                            initialNumToRender={6}
                            onScroll={(e) => { featuredScrollX.current = e.nativeEvent.contentOffset.x; }}
                            onMomentumScrollEnd={(e) => { featuredScrollX.current = e.nativeEvent.contentOffset.x; }}
                            scrollEventThrottle={16}
                            renderItem={({ item: event, index }) => {
                                const cl = Array.isArray(event.clubs) ? event.clubs[0] : event.clubs;
                                const targetLat = event.latitude || cl?.latitude;
                                const targetLong = event.longitude || cl?.longitude;
                                let distanceText = '';
                                if (location && targetLat && targetLong) {
                                    distanceText = formatDistance(getDistanceFromLatLonInKm(location.coords.latitude, location.coords.longitude, targetLat, targetLong));
                                }
                                const minAge = Math.min(event.min_age_men || 18, event.min_age_women || 18);
                                return (
                                    <PressableScale
                                        scaleTo={0.97}
                                        haptic="light"
                                        style={styles.bigEventCard}
                                        onPress={() => handleFeaturedPress(index, event)}
                                    >
                                        <ImageBackground source={{ uri: getImageUrl(event.image_url, 800) }} style={styles.fullImg} imageStyle={{ borderRadius: 31 }}>
                                            <LinearGradient colors={['transparent', 'rgba(3, 3, 3, 0.7)', '#030303']} locations={[0.4, 0.8, 1]} style={styles.fullImgOverlay}>
                                                {/* Top Badges */}
                                                <View style={styles.eventTopRow}>
                                                    <View style={styles.eventTopRowContent}>
                                                        <View style={{ flexDirection: 'row', gap: 8 }}>
                                                            <BlurView intensity={30} tint="dark" style={styles.glassDateBadge}>
                                                                <Text style={styles.glassDateText}>{formatDayShort(event.date)}</Text>
                                                            </BlurView>
                                                            <BlurView intensity={30} tint="dark" style={[styles.glassDateBadge, { paddingHorizontal: 10 }]}>
                                                                <Text style={styles.glassDateText}>{minAge}+</Text>
                                                            </BlurView>
                                                        </View>
                                                        {distanceText ? (
                                                            <BlurView intensity={30} tint="dark" style={styles.glassBadge}>
                                                                <MapPin size={12} color="rgba(251, 251, 251, 0.5)" />
                                                                <Text style={styles.glassBadgeText}>{distanceText}</Text>
                                                            </BlurView>
                                                        ) : <View />}
                                                    </View>
                                                </View>
                                                {/* Bottom Content */}
                                                <View>
                                                    <Text
                                                        style={[styles.bigEventTitle, (() => {
                                                            const l = (event.title || '').length;
                                                            const size = l <= 12 ? 36 : l <= 20 ? 28 : l <= 30 ? 22 : 18;
                                                            return { fontSize: size, lineHeight: size * 1.1 };
                                                        })()]}
                                                        numberOfLines={3}
                                                    >{event.title}</Text>
                                                    <Text style={[styles.bigEventClub, { marginTop: 6 }]}>{event.club_name || event.location}</Text>
                                                </View>
                                            </LinearGradient>
                                        </ImageBackground>
                                    </PressableScale>
                                );
                            }}
                        />
                    )}
                </View>

                {/* 3. BENTO GRID - EXPERIENCIA DYZGO */}
                <View style={styles.sectionMargin}>
                    <Text style={[styles.sectionTitle, { marginLeft: 24, marginBottom: 16 }]}>Explora</Text>

                    <View style={{ paddingHorizontal: 24, gap: 12 }}>
                        {/* FILA 1: Tickets y Radar */}
                        <View style={{ flexDirection: 'row', gap: 12, height: 160 }}>
                            {/* Tarjeta 1: Mis Tickets */}
                            <PressableScale scaleTo={0.95} haptic="light" style={styles.bentoBox} onPress={async () => { if (await requireAuth('/my-tickets')) router.push('/my-tickets'); }}>
                                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

                                <View style={styles.bentoIconRounded}>
                                    <Ticket color="#FF31D8" size={24} />
                                </View>
                                <View style={{ marginTop: 'auto' }}>
                                    <Text style={styles.bentoTitle}>Tus entradas</Text>
                                    <Text style={styles.bentoSubtitle}>Accesos para hoy</Text>
                                </View>
                            </PressableScale>

                            {/* Tarjeta 2: Radar / Amigos */}
                            {Platform.OS === 'ios' ? (
                                <PressableScale scaleTo={0.95} haptic="light" style={styles.bentoBox} onPress={handleProximityConnect} disabled={connecting}>
                                    <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

                                    <View style={styles.bentoIconRounded}>
                                        {connecting ? <ActivityIndicator color="#FF31D8" /> : <Wifi color="#FF31D8" size={24} />}
                                    </View>
                                    <View style={{ marginTop: 'auto' }}>
                                        <Text style={styles.bentoTitle}>Radar</Text>
                                        <Text style={styles.bentoSubtitle}>Conectar móvil</Text>
                                    </View>
                                </PressableScale>
                            ) : (
                                <PressableScale scaleTo={0.95} haptic="light" style={styles.bentoBox} onPress={() => router.push('/my-friends')}>
                                    <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

                                    <View style={styles.bentoIconRounded}>
                                        <Users color="#FF31D8" size={24} />
                                    </View>
                                    <View style={{ marginTop: 'auto' }}>
                                        <Text style={styles.bentoTitle}>Amigos</Text>
                                        <Text style={styles.bentoSubtitle}>Tus conexiones</Text>
                                    </View>
                                </PressableScale>
                            )}
                        </View>

                        {/* FILA 2: Rankings */}
                        <View style={{ flexDirection: 'row', gap: 12, height: 110 }}>
                            <PressableScale scaleTo={0.95} haptic="light" style={styles.bentoBox} onPress={async () => { if (await requireAuth('/rankings')) router.push('/rankings'); }}>
                                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
                                    <View style={{ justifyContent: 'center' }}>
                                        <Text style={[styles.bentoTitle, { fontSize: 22 }]}>Rankings</Text>
                                        <Text style={styles.bentoSubtitle}>Descubre los tops del mes</Text>
                                    </View>
                                    <View style={[styles.bentoIconRounded, {}]}>
                                        <Crown color="#FF31D8" size={26} />
                                    </View>
                                </View>
                            </PressableScale>
                        </View>
                    </View>
                </View>

                {/* 4. CLUBES POPULARES (CARRUSEL INFERIOR FLUIDO) */}
                <View style={styles.sectionMargin}>
                    <Text style={[styles.sectionTitle, { marginLeft: 24, marginBottom: 16 }]}>Clubes Top</Text>

                    {loading && topClubs.length === 0 ? (
                        <ScrollView horizontal contentContainerStyle={{ paddingHorizontal: (width - ITEM_WIDTH) / 2 }}>
                            {[1, 2, 3].map(i => <SkeletonBox key={i} height={200} width={ITEM_WIDTH} borderRadius={24} style={{ marginRight: SPACING }} />)}
                        </ScrollView>
                    ) : topClubs.length > 0 && (
                        <AnimatedFlatList
                            {...mouseScrollClubs}
                            ref={flatListRef}
                            data={infiniteClubs}
                            keyExtractor={(item: any, index) => `${item.id}-${index}`}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            snapToInterval={FULL_SIZE}
                            decelerationRate="fast"
                            getItemLayout={getItemLayout}
                            initialScrollIndex={topClubs.length > 0 ? startIndex : undefined}
                            onLayout={() => {
                                if (topClubs.length > 0 && flatListRef.current && !hasCentered.current && infiniteClubs.length > startIndex) {
                                    scrollX.value = startIndex * FULL_SIZE;
                                    flatListRef.current.scrollToOffset({ offset: startIndex * FULL_SIZE, animated: false });
                                    hasCentered.current = true;
                                }
                            }}
                            removeClippedSubviews={true}
                            maxToRenderPerBatch={8}
                            initialNumToRender={5}
                            windowSize={5}
                            contentContainerStyle={{ paddingHorizontal: (width - ITEM_WIDTH) / 2 }}
                            onScroll={onScrollHandler}
                            scrollEventThrottle={16}
                            renderItem={renderClubItem}
                            onScrollEndDrag={() => {
                                if (Platform.OS === 'web') {
                                    const offset = scrollX.value;
                                    const idx = Math.round(offset / FULL_SIZE);
                                    flatListRef.current?.scrollToOffset({ offset: idx * FULL_SIZE, animated: true });
                                }
                            }}
                            onMomentumScrollEnd={() => {
                                if (Platform.OS === 'web') {
                                    const offset = scrollX.value;
                                    const idx = Math.round(offset / FULL_SIZE);
                                    flatListRef.current?.scrollToOffset({ offset: idx * FULL_SIZE, animated: true });
                                }
                            }}
                        />
                    )}
                </View>

            </AnimatedScrollView>

            {/* Modal de permiso de ubicación — aparece antes del diálogo del sistema iOS */}
            <PermissionModal
                visible={showLocationModal}
                icon={<MapPin color="#FF31D8" size={36} />}
                title="¿Dónde estás?"
                description="Necesitamos tu ubicación para mostrarte eventos cerca de ti y calcular la distancia a cada lugar."
                allowLabel="Compartir ubicación"
                denyLabel="Ahora no"
                onAllow={() => {
                    setShowLocationModal(false);
                    requestPermission();
                }}
                onDeny={() => setShowLocationModal(false)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#030303' },

    floatingHeader: { position: 'absolute', zIndex: 100, left: 16, right: 16 },
    blurNavbar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: 60,
        paddingHorizontal: 16,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: 'rgba(251, 251, 251, 0.05)',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        overflow: 'hidden'
    },
    brandRow: { flexDirection: 'row', alignItems: 'center' },
    brandText: { color: '#FBFBFB', fontSize: 24, fontWeight: '900', letterSpacing: -1, fontStyle: 'italic', paddingLeft: 4 },

    bellContainer: { position: 'relative', padding: 4 },
    notifDot: { position: 'absolute', top: 3, right: 3, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF31D8', borderWidth: 2, borderColor: '#030303' },

    avatarBorder: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1.5,
        borderColor: '#FF31D8',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden'
    },
    avatarImage: { width: '100%', height: '100%', borderRadius: 22 },
    avatarFallback: { width: '100%', height: '100%', borderRadius: 22, backgroundColor: 'rgba(255, 49, 216, 0.2)', justifyContent: 'center', alignItems: 'center' },
    avatarInitial: { color: '#FBFBFB', fontWeight: '800', fontSize: 18 },

    heroSection: { paddingHorizontal: 24, marginTop: Math.round(24 * S), marginBottom: Math.round(24 * S) },
    greetingText: { color: 'rgba(251, 251, 251, 0.6)', fontSize: Math.round(16 * S), fontWeight: '500', marginBottom: Math.round(6 * S) },
    heroMainText: { color: '#FBFBFB', fontSize: Math.round(28 * S), fontWeight: '900', letterSpacing: -1, fontStyle: 'italic' },

    sectionMargin: { marginBottom: Math.round(30 * S) },
    sectionHeaderLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, marginBottom: Math.round(16 * S) },
    sectionTitle: { color: '#FBFBFB', fontSize: Math.round(18 * S), fontWeight: '800' },
    seeAllBadge: { backgroundColor: 'rgba(255,49,216,0.15)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,49,216,0.35)' },
    seeAllText: { color: '#FF31D8', fontSize: 13, fontWeight: '700' },

    horizontalPad: { paddingLeft: 24, paddingRight: 16 },
    horizontalPadEvent: { paddingLeft: 26, paddingRight: 14 },

    bigEventCard: { width: EVENT_CARD_W, height: EVENT_CARD_W, borderRadius: 32, overflow: 'hidden', backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
    fullImg: { flex: 1, borderRadius: 32 },
    fullImgOverlay: { flex: 1, padding: 24, justifyContent: 'space-between' },

    eventTopRow: { flexDirection: 'row' },
    eventTopRowContent: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    glassDateBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.05)', overflow: 'hidden', borderWidth: 0, borderColor: 'transparent' },
    glassDateText: { color: '#FBFBFB', fontWeight: '700', fontSize: 13 },

    glassBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.05)', overflow: 'hidden', borderWidth: 0, borderColor: 'transparent' },
    glassBadgeText: { color: '#FBFBFB', fontSize: 13, fontWeight: '700' },

    socialProofModern: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    avatarStack: { flexDirection: 'row' },
    stackAvatar: { width: 26, height: 26, borderRadius: 13 },
    socialProofText: { color: 'rgba(251, 251, 251, 0.6)', fontSize: 11, fontWeight: '500' },

    bigEventTitle: { color: '#FBFBFB', fontSize: Math.round(36 * S), fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, lineHeight: Math.round(42 * S) },
    bigEventClub: { color: 'rgba(251, 251, 251, 0.6)', fontSize: Math.round(14 * S), fontWeight: '700', textTransform: 'uppercase' },

    bentoContainer: { flexDirection: 'row', paddingHorizontal: 24, gap: 12, height: Math.round(160 * S) },
    bentoBox: { flex: 1, borderRadius: 24, padding: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(251, 251, 251, 0.05)', justifyContent: 'space-between', backgroundColor: 'rgba(255, 255, 255, 0.05)' },

    bentoIconRounded: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(3, 3, 3, 0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 0, borderColor: 'transparent', shadowColor: '#FF31D8', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 8 },
    bentoTitle: { color: '#FBFBFB', fontSize: 16, fontWeight: '800' },
    bentoSubtitle: { color: 'rgba(251, 251, 251, 0.6)', fontSize: 12, marginTop: 2, fontWeight: '500' },

    clubCardContainer: { borderRadius: 32, overflow: 'hidden', height: Math.round(340 * S), backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
    clubImgRounded: { flex: 1, borderRadius: 32 },
    clubOverlay: { flex: 1, justifyContent: 'space-between', padding: 20 },
    clubHeaderRow: { flexDirection: 'row', justifyContent: 'flex-end' },
    clubInfoFooter: { gap: 6 },
    clubNameTitle: { color: '#FBFBFB', fontSize: Math.round(24 * S), fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5 },
    clubLocText: { color: 'rgba(251, 251, 251, 0.6)', fontSize: Math.round(13 * S), fontWeight: '500' },
    clubEventRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    clubEventText: { color: '#FF31D8', fontSize: Math.round(13 * S), fontWeight: '700' },
    nocheText: {
        color: '#FF31D8',
        fontStyle: 'italic',
        fontWeight: '900',
        letterSpacing: -1,
    }
});