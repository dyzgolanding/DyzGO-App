import ReAnimated, {
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    interpolate,
} from 'react-native-reanimated';
import { PressableScale } from '../../components/animated/PressableScale';
import { AnimatedEntry } from '../../components/animated/AnimatedEntry';
import { useScreenEntry } from '../../hooks/useScreenEntry';
import { timing } from '../../lib/animation';
import * as Clipboard from 'expo-clipboard';
import { BlurView } from '../../components/BlurSurface';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import {
    ArrowLeft,
    Calendar,
    UserCheck,
    ChevronRight,
    Copy,
    Instagram,
    MapPin,
    Navigation,
    Share2
} from 'lucide-react-native';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    InteractionManager,
    Linking,
    Platform,
    RefreshControl,
    ScrollView,
    Share,
    StatusBar,
    StyleSheet,
    Text,
    View
} from 'react-native';

const AnimatedScrollView = ReAnimated.createAnimatedComponent(ScrollView);
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSaved } from '../../context/SavedContext';
import { supabase } from '../../lib/supabase';

const { height, width } = Dimensions.get('window');
const isSmallScreen = width < 400;

const SCALE = {
    padding: isSmallScreen ? 20 : 24,
    cardPadding: isSmallScreen ? 20 : 24,
    gap: isSmallScreen ? 8 : 12,
    titleSize: isSmallScreen ? 28 : 34, 
    subtitleSize: isSmallScreen ? 13 : 14,
    labelSize: isSmallScreen ? 9 : 10,
    valueSize: isSmallScreen ? 16 : 20,
    iconSize: isSmallScreen ? 14 : 16,
    buttonIconSize: isSmallScreen ? 16 : 18,
    buttonTextSize: isSmallScreen ? 14 : 16,
    sectionGap: isSmallScreen ? 25 : 30,
    dateMonthSize: isSmallScreen ? 13 : 13.5, 
    dateDaySize: isSmallScreen ? 26 : 29,    
};

const COLORS = {
    deepPurple: '#2d0a3d',
    neonPink: '#FF31D8',
    neonPurple: '#FF31D8',
    glassBg: 'rgba(255, 255, 255, 0.05)', 
    glassBorder: 'rgba(251, 251, 251, 0.05)',
    neonBorderPurple: 'rgba(251, 251, 251, 0.05)',
    textZinc: 'rgba(251, 251, 251, 0.6)'
};

const INITIAL_REGION = {
    latitude: -33.4489,
    longitude: -70.6693,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
};

const isEventFinished = (evt: any) => {
  if (!evt) return false;
  if (evt.is_active === false) return true;
  if (evt.status === 'finished' || evt.status === 'inactive') return true;
  
  const dateStr = evt.end_date || evt.date;
  const timeStr = evt.end_time || '05:00';

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

const getMinPrice = (evt: any) => {
    if (evt.ticket_tiers && Array.isArray(evt.ticket_tiers) && evt.ticket_tiers.length > 0) {
        const prices = evt.ticket_tiers
            .map((t: any) => Number(t.price || 0))
            .filter((p: number) => !isNaN(p) && p > 0);
            
        if (prices.length > 0) return Math.min(...prices);
    }
    return evt.min_price || evt.price || 0;
};

const formatDate = (dateString: string) => {
    try {
        const cleanDate = dateString.split('T')[0]; 
        const [year, month, day] = cleanDate.split('-');
        const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
        const monthStr = dateObj.toLocaleString('es-ES', { month: 'short' }).toUpperCase();
        return { day: day.padStart(2, '0'), month: monthStr };
    } catch (e) {
        return { day: '00', month: '---' };
    }
};

export default function ClubDetailScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { toggleSave, savedItems } = useSaved();

    // ── Optimistic UI: datos visuales pasados por parámetro ──
    const optImageUrl     = params.imageUrl as string | undefined;
    const optName         = params.name as string | undefined;
    const optInstagramUrl = params.instagramUrl as string | undefined;
    const hasOptimisticData = !!(optImageUrl || optName);

    const insets = useSafeAreaInsets();
    const screenStyle  = useScreenEntry();
    const scrollY      = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler(e => { scrollY.value = e.contentOffset.y; });
    const headerBgStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollY.value, [0, 150], [0, 1], 'clamp'),
    }));

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [club, setClub] = useState<any>(null);
    const [relatedEvents, setRelatedEvents] = useState<any[]>([]);
    const [region, setRegion] = useState(INITIAL_REGION);

    // Pull-to-refresh: recarga sin flash de loading (isRefresh=true)
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchClubAndEvents(true);
        setRefreshing(false);
    }, [params.id]);

    const isSaved = savedItems?.some((item: any) => item.id.toString() === params.id?.toString());

    useEffect(() => {
        if (!params.id) return;
        // InteractionManager garantiza que el fetch sólo ocurre DESPUÉS de que
        // la animación de navegación termine — el hilo JS queda libre para 60fps.
        const task = InteractionManager.runAfterInteractions(() => {
            fetchClubAndEvents();
        });
        return () => task.cancel();
    }, [params.id]);

    async function fetchClubAndEvents(isRefresh = false) {
        try {
            // Durante pull-to-refresh no reseteamos a loading=true para evitar el flash
            if (!isRefresh) setLoading(true);
            
            const { data: clubData, error: clubError } = await supabase
                .from('clubs')
                .select('*')
                .eq('id', params.id)
                .single();

            if (clubError || !clubData) {
                console.error("Error fetching club:", clubError);
                setLoading(false);
                return;
            }

            setClub(clubData);

            if (clubData.latitude && clubData.longitude) {
                setRegion({
                    latitude: clubData.latitude,
                    longitude: clubData.longitude,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                });
            }

            const d = new Date();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const today = `${year}-${month}-${day}`;

            const { data: eventsData, error: eventsError } = await supabase
                .from('events')
                .select('*, ticket_tiers(*), experiences(id, name, logo_url)') 
                .eq('club_name', clubData.name)
                .gte('end_date', today) 
                .order('date', { ascending: true });

            if (eventsData) {
                const upcomingEvents = eventsData.filter(e => (e.status === 'active' || e.status === 'info') && !isEventFinished(e));
                setRelatedEvents(upcomingEvents);
            } else if (eventsError) {
                console.error("Error fetching events:", eventsError);
            }

        } catch (error) {
            console.error("Error general:", error);
        } finally {
            setTimeout(() => setLoading(false), 50);
        }
    }

    const openInGoogleMaps = () => {
        const lat = club?.latitude || region.latitude;
        const lng = club?.longitude || region.longitude;
        const label = encodeURIComponent(club?.name || "Club");
        const fallbackMaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

        if (Platform.OS === 'web') {
            window.open(fallbackMaps, '_blank');
            return;
        }
        
        const url = Platform.select({
            ios: `comgooglemaps://?q=${lat},${lng}(${label})`,
            android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`
        });

        Linking.canOpenURL(url!).then(supported => {
            if (supported) {
                Linking.openURL(url!);
            } else {
                Linking.openURL(fallbackMaps);
            }
        });
    };

    const openUber = () => {
        const lat = club?.latitude || region.latitude;
        const lng = club?.longitude || region.longitude;
        const nickName = encodeURIComponent(club?.name || "Club");
        const formattedAddress = encodeURIComponent(club?.location || "Ubicación");
        const webUrl = `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}&dropoff[nickname]=${nickName}&dropoff[formatted_address]=${formattedAddress}`;

        if (Platform.OS === 'web') {
            window.open(webUrl, '_blank');
            return;
        }

        const uberUrl = `uber://?action=setPickup&pickup=my_location&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}&dropoff[nickname]=${nickName}&dropoff[formatted_address]=${formattedAddress}`;

        Linking.canOpenURL(uberUrl).then(supported => {
            if (supported) {
                Linking.openURL(uberUrl);
            } else {
                Linking.openURL(webUrl);
            }
        });
    };

    const handleCopyAddress = async () => {
        if (club?.location) {
            await Clipboard.setStringAsync(club.location);
            Alert.alert("Copiado", "Dirección copiada al portapapeles.");
        }
    };

    const handleToggleSave = () => {
        if (!club) return;
        toggleSave(club.id, club, 'club'); 
    };

    const handleShare = async () => {
        try {
            if (!club) return;
            const deepLink = `dyzgo://club-detail?id=${club.id}`;
            
            await Share.share({
                title: club.name,
                message: `¡Mira este club en DyzGO! 🪩\n\n${club.name}\n📍 ${club.location}\n\nAbrelo en la app: ${deepLink}`, 
                url: deepLink 
            });
        } catch (error) {
            // El usuario canceló el share — ignoramos este caso específico
        }
    };

    const openLink = (url: string) => {
        if (url) {
            const finalUrl = url.startsWith('http') ? url : `https://${url}`;
            Linking.openURL(finalUrl).catch(() => {});
        }
    };

    const instagramLink = club?.instagram || club?.instagram_url || optInstagramUrl;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            
            {Platform.OS !== 'web' && (
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
            )}
            
            <ReAnimated.View style={screenStyle}>

                {/* NavBar pill — fondo transparente arriba, opaco al hacer scroll */}
                <View style={[styles.fixedHeader, { top: insets.top + 8 }]}>
                    <ReAnimated.View style={[styles.pillBg, headerBgStyle]}>
                        <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 50, overflow: 'hidden' }]} />
                      </ReAnimated.View>

                    <PressableScale scaleTo={0.82} haptic="light" onPress={() => router.back()} style={styles.iconBtn}>
                        <ArrowLeft color="white" size={20} />
                    </PressableScale>
                    <PressableScale scaleTo={0.82} haptic="light" style={styles.iconBtn} onPress={handleShare}>
                        <Share2 color="white" size={20} />
                    </PressableScale>
                </View>

                <AnimatedScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 10 }}
                    bounces={true}
                    overScrollMode="always"
                    scrollEventThrottle={16}
                    onScroll={scrollHandler}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={COLORS.neonPink}
                            colors={[COLORS.neonPink, '#FF31D8']}
                            progressBackgroundColor="#111"
                        />
                    }
                >
                    <AnimatedEntry index={0} style={[styles.imageWrapper, { paddingTop: insets.top + 64 }]}>
                        {(club?.image || optImageUrl) ? (
                            <Image
                                source={{ uri: club?.image || optImageUrl }}
                                style={styles.squareImage}
                                contentFit="cover"
                                transition={150}
                                cachePolicy="memory-disk"
                                placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }}
                            />
                        ) : (
                            <View style={[styles.squareImage, { backgroundColor: '#111' }]} />
                        )}
                    </AnimatedEntry>

                    <View style={styles.contentCard}>

                        <AnimatedEntry index={1} style={styles.headerSection}>
                            <Text style={[styles.title, { fontSize: SCALE.titleSize }]}>{club?.name || optName}</Text>

                            <View style={styles.tagsRow}>
                                {instagramLink && (
                                    <PressableScale scaleTo={0.9} haptic="light" style={styles.instagramLiquidGlass} onPress={() => openLink(instagramLink)}>
                                        <Instagram size={14} color="rgba(251,251,251,0.7)" />
                                        <Text style={styles.followPillText}>Instagram</Text>
                                    </PressableScale>
                                )}
                                <PressableScale
                                    scaleTo={0.9}
                                    haptic="medium"
                                    style={[styles.followPill, isSaved && styles.followPillActive]}
                                    onPress={handleToggleSave}
                                >
                                    <UserCheck size={14} color={isSaved ? COLORS.neonPink : 'rgba(251,251,251,0.7)'} />
                                    <Text style={[styles.followPillText, isSaved && styles.followPillTextActive]}>
                                        {isSaved ? 'Siguiendo' : 'Seguir'}
                                    </Text>
                                </PressableScale>
                            </View>
                        </AnimatedEntry>

                        <View style={styles.divider} />

                        <AnimatedEntry index={2} style={styles.mbSection}>
                            <Text style={[styles.sectionHeader, { fontSize: 18 }]}>Sobre el Club</Text>
                            <Text style={[styles.descriptionText, { fontSize: SCALE.subtitleSize }]}>
                                {club?.description || "El mejor ambiente de la ciudad."}
                            </Text>
                        </AnimatedEntry>

                        <AnimatedEntry index={3} style={styles.mbSection}>
                            <Text style={[styles.sectionHeader, { fontSize: 18 }]}>Ubicación y Llegada</Text>
                            <View style={[styles.glassCard, { marginBottom: 0 }]}>
                                <View style={[styles.mapContainer, Platform.OS === 'web' && { height: 320 }]} pointerEvents="none">
                                    {Platform.OS === 'web' ? (
                                        <iframe
                                            src={`https://maps.google.com/maps?q=${region.latitude},${region.longitude}&t=k&z=15&ie=UTF8&iwloc=&output=embed`}
                                            style={{ width: '100%', height: '100%', border: 0 }}
                                        />
                                    ) : (
                                        <MapView 
                                            provider={PROVIDER_GOOGLE} 
                                            style={styles.map} 
                                            scrollEnabled={false} 
                                            zoomEnabled={false} 
                                            region={region} 
                                            mapType="hybrid"
                                            liteMode={true} 
                                        >
                                            <Marker coordinate={{ latitude: region.latitude, longitude: region.longitude }}>
                                                <View style={styles.classicPin}><MapPin size={36} color="white" fill={COLORS.neonPink} /></View>
                                            </Marker>
                                        </MapView>
                                    )}
                                </View>

                                {club?.location && (
                                    <View style={styles.addressContainer}>
                                        <Text style={styles.addressText} numberOfLines={1}>{club?.location}</Text>
                                        <PressableScale scaleTo={0.88} haptic="light" onPress={handleCopyAddress} style={styles.copyButton}>
                                            <Copy size={12} color={COLORS.neonPurple} />
                                            <Text style={styles.copyButtonText}>Copiar</Text>
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
                        </AnimatedEntry>

                        <View style={styles.divider} />

                        <AnimatedEntry index={4} style={styles.mbSection}>
                            <View style={styles.eventsHeader}>
                                <View style={styles.eventsIconBox}>
                                    <Calendar color={COLORS.neonPink} size={15} />
                                </View>
                                <Text style={[styles.sectionHeader, { fontSize: 18, marginBottom: 0 }]}>Próximos Eventos</Text>
                                <View style={styles.eventsHeaderLine} />
                            </View>

                            {relatedEvents.length > 0 ? (
                                <FlatList
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    style={{ marginHorizontal: -SCALE.padding }}
                                    contentContainerStyle={styles.horizontalEventsContainer}
                                    data={relatedEvents}
                                    keyExtractor={(item: any) => item.id.toString()}
                                    removeClippedSubviews={true}
                                    initialNumToRender={3}
                                    maxToRenderPerBatch={3}
                                    windowSize={5}
                                    renderItem={({ item: event }: any) => {
                                        const { day, month } = formatDate(event.date);
                                        return (
                                            <PressableScale
                                                scaleTo={0.96}
                                                haptic="light"
                                                style={styles.glassEventCard}
                                                onPress={() => { const exp = Array.isArray(event.experiences) ? event.experiences[0] : event.experiences; router.push({ pathname: '/event-detail', params: { id: event.id, imageUrl: event.image_url, title: event.title, date: event.date, category: event.area || event.category, hour: event.hour, clubName: club?.name, clubImage: club?.image, producerName: exp?.name, producerLogo: exp?.logo_url, producerId: exp?.id, instagramUrl: event.instagram_url, status: event.status } }); }}
                                            >
                                                <View style={styles.glassEventImgWrap}>
                                                    {event?.image_url ? (
                                                        <Image
                                                            source={{ uri: event.image_url }}
                                                            style={StyleSheet.absoluteFill}
                                                            contentFit="cover"
                                                            transition={150}
                                                            cachePolicy="memory-disk"
                                                            placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }}
                                                        />
                                                    ) : (
                                                        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: '#111' }} />
                                                    )}
                                                    <View style={styles.glassEventOverlay} />
                                                    <BlurView intensity={30} tint="dark" style={styles.glassEventDateBadge}>
                                                        <Text style={styles.glassEventDateDay}>{day}</Text>
                                                        <Text style={styles.glassEventDateMonth}>{month}</Text>
                                                    </BlurView>
                                                </View>
                                                <View style={styles.glassEventInfo}>
                                                    <Text style={styles.glassEventTitle} numberOfLines={2}>{event.title}</Text>
                                                    <Text style={styles.glassEventSub}>Ver tickets →</Text>
                                                </View>
                                            </PressableScale>
                                        );
                                    }}
                                />
                            ) : (
                                <View style={styles.emptyState}>
                                    <Calendar color="#555" size={32} />
                                    <Text style={styles.emptyText}>No hay eventos programados</Text>
                                </View>
                            )}
                        </AnimatedEntry>

                        <AnimatedEntry index={5} style={styles.legalSection}>
                            <Text style={styles.legalText}>
                                Un club es el recinto físico donde se llevan a cabo los eventos. Esta pantalla te ayuda a conocer su ubicación e instalaciones. Para adquirir tickets o ver detalles específicos, por favor ingresa al perfil del evento deseado.
                            </Text>
                        </AnimatedEntry>

                    </View>
                </AnimatedScrollView>
            </ReAnimated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#030303' },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    // 'top' se aplica inline con insets.top + 10 para respetar el safe area real del dispositivo
    fixedHeader: {
        position: 'absolute', left: 16, right: 16, zIndex: 10,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        height: 50, paddingHorizontal: 6,
    },
    pillBg: { overflow: 'hidden',
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        borderRadius: 50,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    iconBtn: {
        width: 38, height: 38, borderRadius: 19,
        justifyContent: 'center', alignItems: 'center',
    },
    imageWrapper: { width: '100%', paddingHorizontal: 20, paddingTop: 110, alignItems: 'center' },
    squareImage: {
        width: '100%', maxWidth: 450, aspectRatio: 1, borderRadius: 20, backgroundColor: '#111'
    },

    contentCard: { flex: 1, paddingHorizontal: SCALE.padding, paddingTop: SCALE.sectionGap },
    headerSection: { marginBottom: SCALE.sectionGap / 1.5, alignItems: 'flex-start' },
    title: { color: '#FBFBFB', fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, marginBottom: 8 },
    
    tagsRow: { flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' },
    instagramLiquidGlass: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 16, paddingVertical: 8,
        borderRadius: 20, borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    instagramTagText: { color: 'rgba(251,251,251,0.7)', fontSize: 13, fontWeight: '700' },

    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: SCALE.sectionGap },
    
    mbSection: { marginBottom: SCALE.sectionGap },
    sectionHeader: { color: 'white', fontWeight: '900', marginBottom: 15 },
    descriptionText: { color: COLORS.textZinc, lineHeight: 24 },

    glassCard: { backgroundColor: COLORS.glassBg, borderRadius: 24, padding: SCALE.cardPadding, borderWidth: 1, borderColor: COLORS.neonBorderPurple, overflow: 'hidden' },
    mapContainer: { height: 160, width: '100%', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 10 },
    map: { flex: 1 },
    classicPin: { shadowColor: COLORS.neonPink, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4, elevation: 5 },
    addressContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    addressText: { color: '#aaa', fontSize: 11, flex: 1, marginRight: 10 },
    copyButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.glassBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: COLORS.glassBorder },
    copyButtonText: { color: COLORS.neonPurple, fontSize: 10, fontWeight: '800' },

    transportDualRow: { flexDirection: 'row', gap: 12 },
    transportButtonHalf: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.glassBg, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1, borderColor: COLORS.glassBorder, gap: 10 },
    transportButtonText: { color: 'white', fontSize: 13, fontWeight: '800' },
    
    uberIconBox: { backgroundColor: 'black', width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    uberIconText: { color: 'white', fontWeight: '900', fontSize: 9 },
    mapsIconBox: { backgroundColor: 'rgba(66, 133, 244, 0.15)', width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(66, 133, 244, 0.3)', justifyContent: 'center', alignItems: 'center' },

    eventsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
    eventsIconBox: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,0,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,0,255,0.25)', justifyContent: 'center', alignItems: 'center' },
    eventsHeaderLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
    countBadge: { backgroundColor: '#8A2BE2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    countText: { color: 'white', fontWeight: '800', fontSize: 12 },
    
    horizontalEventsContainer: { gap: 15, paddingRight: SCALE.padding, paddingBottom: 10, paddingLeft: SCALE.padding },
    
    glassEventCard: {
        width: 255,
        borderRadius: 26,
        overflow: 'hidden',
        backgroundColor: COLORS.glassBg,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
    },
    glassEventImgWrap: { width: '100%', aspectRatio: 1, position: 'relative' },
    glassEventOverlay: { ...StyleSheet.absoluteFillObject as any, backgroundColor: 'rgba(0,0,0,0.35)' },
    glassEventDateBadge: {
        position: 'absolute', bottom: 12, left: 12,
        backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20,
        paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center',
        overflow: 'hidden',
    },
    glassEventDateDay: { color: 'white', fontSize: 26, fontWeight: '900', lineHeight: 28 },
    glassEventDateMonth: { color: COLORS.textZinc, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
    glassEventInfo: { padding: 16 },
    glassEventTitle: { color: 'white', fontSize: 18, fontWeight: '800', fontStyle: 'italic', letterSpacing: -0.3, marginBottom: 8 },
    glassEventSub: { color: COLORS.neonPink, fontSize: 13, fontWeight: '700' },

    emptyState: { 
        alignItems: 'center', padding: 40, backgroundColor: 'rgba(255,255,255,0.02)', 
        borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderStyle: 'dashed' 
    },
    emptyText: { color: '#444', marginTop: 10, fontWeight: '500' },

    followPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 16, paddingVertical: 8,
        borderRadius: 20, borderWidth: 1,

        borderColor: 'rgba(255,255,255,0.15)',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    followPillActive: {
        borderColor: 'rgba(255,49,216,0.4)',
        backgroundColor: 'rgba(255,49,216,0.1)',
    },
    followPillText: { color: 'rgba(251,251,251,0.7)', fontSize: 13, fontWeight: '700' },
    followPillTextActive: { color: '#FF31D8' },

    legalSection: {
        marginTop: 0,
        marginBottom: 0,
        paddingHorizontal: 10,
    },
    legalText: {
        color: 'rgba(251, 251, 251, 0.6)',
        fontSize: 11,
        textAlign: 'center',
        lineHeight: 16,
        marginBottom: 8,
    }
});