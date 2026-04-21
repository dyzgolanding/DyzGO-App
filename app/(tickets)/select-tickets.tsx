import { BlurView } from '../../components/BlurSurface';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { ArrowRight, ChevronDown, ChevronUp, Info, Minus, Plus, UserCheck, X } from 'lucide-react-native';
import React, { useCallback, useState, useEffect } from 'react';
import { Platform, 
    Alert,
    Dimensions,
    InteractionManager,
    Modal,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
 } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isSmallScreen = SCREEN_WIDTH < 400;
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import { AnimatedEntry } from '../../components/animated/AnimatedEntry';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../constants/colors';

export default function SelectTicketsScreen() {
    const router = useRouter();
    const navTop = useNavBarPaddingTop();
    const params = useLocalSearchParams();
    
    const eventId = params.eventId as string || params.id as string;
    const eventName = params.eventName as string || params.title as string;
    const eventDate = params.eventDate as string || params.date as string;
    const eventLocation = params.eventLocation as string || params.location as string;
    const paramAccentColor = params.accentColor as string | undefined;

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [tiers, setTiers] = useState<any[]>([]);
    const [cart, setCart] = useState<{[key: string]: number}>({});
    const [eventDetails, setEventDetails] = useState<any>(null);
    const [isBlacklisted, setIsBlacklisted] = useState(false);

    const [maxPerPerson, setMaxPerPerson] = useState(10);
    const [showNominativeInfo, setShowNominativeInfo] = useState(false);
    const [expandedDescriptions, setExpandedDescriptions] = useState<{[key: string]: boolean}>({});
    const [truncatedDescriptions, setTruncatedDescriptions] = useState<{[key: string]: boolean}>({});

    const [currentTime, setCurrentTime] = useState(new Date());

    const SERVICE_FEE_PERCENTAGE = 0.12;

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 10000);
        return () => clearInterval(timer);
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (!eventId) return;
            setCart({});
            // Espera a que termine la animación de entrada antes de hacer el fetch
            const task = InteractionManager.runAfterInteractions(() => {
                loadData(true);
            });
            return () => task.cancel();
        }, [eventId])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData(true);
        setRefreshing(false);
    }, [eventId]);

    const loadData = async (isRefresh = false) => {
        if (!isRefresh) setLoading(true);
        try {
            await Promise.all([fetchTiers(), fetchEventSettings()]);
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Error al cargar entradas.");
        } finally {
            setLoading(false);
        }
    };

    const fetchEventSettings = async () => {
        const { data } = await supabase
            .from('events')
            .select('max_tickets_per_person, image_url, date, end_date, hour, end_time, location, club_name, title, accent_color, experience_id, clubs(name), experiences(name)')
            .eq('id', eventId)
            .single();

        if (data) {
            if (data.max_tickets_per_person) {
                setMaxPerPerson(data.max_tickets_per_person);
            }
            setEventDetails(data);

            // Verificar blacklist via RPC (SECURITY DEFINER → bypassa RLS, chequea email y RUT)
            try {
                const { data: blocked } = await supabase
                    .rpc('check_blacklist', { p_event_id: eventId });
                if (blocked) setIsBlacklisted(true);
            } catch (_e) {}
        }
    };

    const fetchTiers = async () => {
        try {
            const { data, error } = await supabase
                .from('ticket_tiers')
                .select('*') 
                .eq('event_id', eventId)
                .eq('is_active', true)
                .order('sort_order', { ascending: true });

            if (error) throw error;
            setTiers(data || []);
        } catch (e) {
            console.error(e);
            throw e; 
        }
    };

    const updateQuantity = (tierId: string, delta: number, availableStock: number) => {
        setCart(prev => {
            const currentQty = prev[tierId] || 0;
            const newQty = currentQty + delta;
            
            if (newQty < 0) return prev;
            
            if (newQty > availableStock) { 
                Alert.alert("Stock Limitado", `Solo quedan ${availableStock} entradas disponibles.`); 
                return prev; 
            }

            const currentTotalTickets = Object.values(prev).reduce((a, b) => a + b, 0);
            
            if (delta > 0 && (currentTotalTickets + delta) > maxPerPerson) { 
                Alert.alert("Límite", `Máximo ${maxPerPerson} entradas por persona para este evento.`); 
                return prev; 
            }

            return { ...prev, [tierId]: newQty };
        });
    };

    const visibleTiers = tiers.filter(tier => {
        const startString = tier.start_date || tier.sales_start_at; 
        if (!startString) return true; 
        const salesStart = new Date(startString);
        return currentTime >= salesStart; 
    });

    const totalTickets = Object.values(cart).reduce((a, b) => a + b, 0);
    const subtotal = visibleTiers.reduce((acc, tier) => acc + (Number(tier.price) * (cart[tier.id] || 0)), 0);
    const serviceFee = subtotal * SERVICE_FEE_PERCENTAGE;
    const totalToPay = Math.round(subtotal + serviceFee);

    const handleContinue = () => {
        if (totalTickets === 0) return;
        
        const cleanCart = Object.entries(cart)
            .filter(([_, qty]) => qty > 0)
            .map(([tierId, qty]) => {
                const tier = tiers.find(t => t.id === tierId);
                return { 
                    id: tierId, 
                    name: tier?.name, 
                    price: tier?.price, 
                    quantity: qty,
                    ticketsIncluded: tier?.tickets_included || 1 
                };
            });

        const resolvedName = eventDetails?.title || eventName;
        const resolvedDate = eventDetails?.date || eventDate;
        if (Platform.OS === 'web') {
            sessionStorage.setItem('dyzgo_cart', JSON.stringify({
                cartData: cleanCart,
                totalToPay,
                serviceFee: Math.round(serviceFee),
            }));
            router.push({ pathname: '/payment', params: { eventId } });
        } else {
            router.push({
                pathname: '/payment',
                params: {
                    eventId,
                    eventName: resolvedName,
                    eventDate: resolvedDate,
                    cartData: JSON.stringify(cleanCart),
                    totalToPay: totalToPay.toString(),
                    serviceFee: Math.round(serviceFee).toString(),
                    accentColor,
                }
            });
        }
    };

    const formatEventDateTime = (evt: any) => {
        if (!evt) return null;
        try {
            const dateStr = evt.date;
            if (!dateStr) return null;

            const [year, month, day] = dateStr.split('-');
            const d = new Date(Number(year), Number(month) - 1, Number(day));

            const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

            const dayName = days[d.getDay()];
            const dayNum = d.getDate();
            const monthName = months[d.getMonth()];

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
            } else if (startTime) {
                timeString = `, a las ${startTime}`;
            }

            return `${dayName} ${dayNum} de ${monthName}${timeString}`;
        } catch (e) {
            return null;
        }
    };

    const displayDate = formatEventDateTime(eventDetails) || eventDate;
    const producerName = Array.isArray(eventDetails?.experiences) ? eventDetails?.experiences[0]?.name : eventDetails?.experiences?.name;

    const accentColor = eventDetails?.accent_color || paramAccentColor || '#FF31D8';
    const withAlpha = (hex: string, alpha: number) => {
        const clean = hex.startsWith('#') ? hex : `#${hex}`;
        const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
        return `${clean}${a}`;
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Fondo — 3 capas de luz con accent_color */}
            {Platform.OS !== 'web' && (
<View style={StyleSheet.absoluteFill} pointerEvents="none">
                <LinearGradient
                    colors={[withAlpha(accentColor, 0.2), 'transparent']}
                    start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                    colors={['transparent', withAlpha(accentColor, 0.15)]}
                    start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                    colors={['transparent', withAlpha(accentColor, 0.05), 'transparent']}
                    start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }}
                    locations={[0.3, 0.5, 0.7]}
                    style={StyleSheet.absoluteFill}
                />
            </View>
)}
            
            <View style={{ flex: 1 }}>
                <NavBar title="SELECCIONAR ENTRADAS" onBack={() => router.back()} />

                <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={[styles.scrollContent, { paddingTop: navTop }]}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor={accentColor}
                                colors={[accentColor]}
                                progressBackgroundColor="#111"
                            />
                        }
                    >
                        
                        <AnimatedEntry index={0}>
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
                                                Producido por <Text style={{fontWeight: '800', color: 'white'}}>{producerName}</Text>
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        </AnimatedEntry>

                        <Text style={styles.sectionLabel}>Tipos de Entrada</Text>
                        
                        <View style={styles.tiersList}>
                            {visibleTiers.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Info color={COLORS.textZinc} size={32} />
                                    <Text style={styles.emptyText}>No hay entradas disponibles en este momento.</Text>
                                </View>
                            ) : (
                                visibleTiers.map((tier, i) => {
                                    const qty = cart[tier.id] || 0;
                                    
                                    const sold = tier.sold_tickets || 0;
                                    const total = tier.total_stock || 0;
                                    const remainingStock = Math.max(0, total - sold);
                                    
                                    const endString = tier.end_date || tier.sales_end_at;
                                    const salesEnd = endString ? new Date(endString) : null;
                                    const isExpired = salesEnd && currentTime >= salesEnd;
                                    
                                    const isSoldOut = remainingStock <= 0 || tier.fake_sold || tier.is_ghost_sold_out || isExpired;
                                    
                                    return (
                                        <AnimatedEntry index={i + 1} key={tier.id}>
                                            <View style={[
                                                styles.tierCard, 
                                                qty > 0 && { borderColor: withAlpha(accentColor, 0.55), backgroundColor: withAlpha(accentColor, 0.07), shadowColor: accentColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 },
                                                isSoldOut && styles.tierCardSoldOut
                                            ]}>
                                                <View style={{flex: 1, paddingRight: 10, justifyContent: 'center'}}>
                                                    <Text style={[
                                                        styles.tierName,
                                                        qty > 0 && !isSoldOut && { color: accentColor },
                                                        isSoldOut && styles.tierNameSoldOut
                                                    ]}>{tier.name}</Text>

                                                    {(tier.tickets_included > 1 || tier.nominative) && (
                                                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4}}>
                                                            {tier.tickets_included > 1 && (
                                                                <View style={{backgroundColor: 'rgba(59, 130, 246, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.4)'}}>
                                                                    <Text style={{color: '#93c5fd', fontSize: 9, fontWeight: '800'}}>INCLUYE {tier.tickets_included} QRs</Text>
                                                                </View>
                                                            )}
                                                            {tier.nominative && (
                                                                <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                                                                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(168, 85, 247, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(168, 85, 247, 0.4)'}}>
                                                                        <UserCheck color="#d8b4fe" size={9} />
                                                                        <Text style={{color: '#d8b4fe', fontSize: 9, fontWeight: '800'}}>NOMINATIVO</Text>
                                                                    </View>
                                                                    <TouchableOpacity
                                                                        onPress={() => setShowNominativeInfo(true)}
                                                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                                    >
                                                                        <Info color="rgba(168, 85, 247, 0.7)" size={14} />
                                                                    </TouchableOpacity>
                                                                </View>
                                                            )}
                                                        </View>
                                                    )}
                                                    {tier.description ? (
                                                        <>
                                                            {/* Texto oculto para medir líneas reales sin numberOfLines */}
                                                            <View style={{ height: 0, overflow: 'hidden' }}>
                                                                <Text
                                                                    style={styles.tierDescription}
                                                                    onTextLayout={(e) => {
                                                                        const isTruncated = e.nativeEvent.lines.length > 2;
                                                                        setTruncatedDescriptions(prev => {
                                                                            if (prev[tier.id] === isTruncated) return prev;
                                                                            return { ...prev, [tier.id]: isTruncated };
                                                                        });
                                                                    }}
                                                                >
                                                                    {tier.description}
                                                                </Text>
                                                            </View>
                                                            <Text
                                                                style={styles.tierDescription}
                                                                numberOfLines={expandedDescriptions[tier.id] ? undefined : 2}
                                                            >
                                                                {tier.description}
                                                            </Text>
                                                        </>
                                                    ) : null}

                                                    {/* Precio + botón expandir inline */}
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                        <Text style={[
                                                            styles.tierPrice,
                                                            isSoldOut && styles.tierPriceSoldOut
                                                        ]}>${tier.price.toLocaleString()}</Text>
                                                        {truncatedDescriptions[tier.id] && (
                                                            <TouchableOpacity
                                                                onPress={() => setExpandedDescriptions(prev => ({ ...prev, [tier.id]: !prev[tier.id] }))}
                                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                                activeOpacity={0.5}
                                                            >
                                                                {expandedDescriptions[tier.id]
                                                                    ? <ChevronUp color="rgba(251,251,251,0.2)" size={13} />
                                                                    : <ChevronDown color="rgba(251,251,251,0.2)" size={13} />
                                                                }
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>

                                                    {!isSoldOut && remainingStock < 20 && <Text style={styles.lowStockText}>¡Quedan pocas!</Text>}
                                                </View>

                                                {/* Lado derecho: Contador si hay stock, "SOLD OUT" si está agotado */}
                                                {isSoldOut ? (
                                                    <View style={styles.soldOutContainer}>
                                                        <Text style={styles.soldOutText}>SOLD OUT</Text>
                                                    </View>
                                                ) : (
                                                    <View style={styles.counter}>
                                                        <TouchableOpacity
                                                            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateQuantity(tier.id, -1, remainingStock); }}
                                                            disabled={qty === 0}
                                                            style={[styles.counterBtn, qty === 0 && {backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)'}]}
                                                        >
                                                            <Minus color={qty === 0 ? 'rgba(255,255,255,0.25)' : 'white'} size={16} />
                                                        </TouchableOpacity>

                                                        <Text style={styles.qtyText}>{qty}</Text>

                                                        <TouchableOpacity
                                                            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateQuantity(tier.id, 1, remainingStock); }}
                                                            style={[styles.counterBtn, {backgroundColor: withAlpha(accentColor, 0.15), borderColor: withAlpha(accentColor, 0.35)}]}
                                                        >
                                                            <Plus color={accentColor} size={16} />
                                                        </TouchableOpacity>
                                                    </View>
                                                )}
                                            </View>
                                        </AnimatedEntry>
                                    );
                                })
                            )}
                        </View>

                        {totalTickets > 0 && (
                            <AnimatedEntry index={visibleTiers.length + 1}>
                                <View style={styles.glassSummaryContainer}>
                                    <Text style={styles.summaryTitle}>Resumen</Text>
                                    <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryValue}>${subtotal.toLocaleString()}</Text></View>
                                    <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Cargo por servicio</Text><Text style={styles.summaryValue}>${serviceFee.toLocaleString()}</Text></View>
                                    <View style={styles.divider} />
                                    <View style={styles.summaryRow}><Text style={styles.totalLabel}>Total</Text><Text style={[styles.totalValue, { color: accentColor }]}>${totalToPay.toLocaleString()}</Text></View>
                                </View>
                            </AnimatedEntry>
                        )}

                    </ScrollView>

                <BlurView intensity={80} tint="dark" style={styles.footer}>
                    {isBlacklisted ? (
                        <View style={[styles.buyBtnContainer, { backgroundColor: 'rgba(255,59,48,0.08)', borderWidth: 1, borderColor: 'rgba(255,59,48,0.3)', flexDirection: 'column', gap: 2 }]}>
                            <Text style={[styles.buyBtnText, { color: '#FF3B30', fontSize: 13 }]}>ACCESO RESTRINGIDO</Text>
                            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '600', textAlign: 'center' }}>No puedes adquirir entradas de este organizador</Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={[styles.buyBtnContainer, {
                                backgroundColor: totalTickets === 0 ? 'rgba(255,255,255,0.05)' : withAlpha(accentColor, 0.15),
                                borderWidth: 1,
                                borderColor: totalTickets === 0 ? '#333' : withAlpha(accentColor, 0.35),
                            }]}
                            disabled={totalTickets === 0}
                            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleContinue(); }}
                            activeOpacity={0.65}
                        >
                            <Text style={[styles.buyBtnText, { color: totalTickets === 0 ? 'rgba(251,251,251,0.4)' : accentColor }]}>
                                {totalTickets > 0 ? 'IR A PAGAR' : 'SELECCIONA'}
                            </Text>
                            {totalTickets > 0 && <ArrowRight color={accentColor} size={18} />}
                        </TouchableOpacity>
                    )}
                </BlurView>

            </View>

            {/* Modal Ticket Nominativo */}
            <Modal
                visible={showNominativeInfo}
                transparent
                animationType="fade"
                statusBarTranslucent
                onRequestClose={() => setShowNominativeInfo(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        {/* Header row: tag + close */}
                        <View style={styles.modalHeader}>
                            <View style={styles.modalTag}>
                                <Text style={styles.modalTagText}>TICKET NOMINATIVO</Text>
                            </View>
                            <TouchableOpacity style={styles.modalClose} onPress={() => setShowNominativeInfo(false)}>
                                <X color="rgba(255,255,255,0.5)" size={16} />
                            </TouchableOpacity>
                        </View>

                        {/* Icon */}
                        <View style={styles.modalIconContainer}>
                            <UserCheck color={accentColor} size={38} />
                        </View>

                        {/* Title */}
                        <Text style={styles.modalTitle}>Ticket Personal</Text>

                        {/* Body */}
                        <Text style={styles.modalBody}>
                            Este ticket es <Text style={{color: 'rgba(255,255,255,0.9)', fontWeight: '800'}}>personal e intransferible</Text>. Al ingresar deberás presentar tu{' '}
                            <Text style={{color: 'rgba(255,255,255,0.9)', fontWeight: '800'}}>carnet de identidad (RUT o pasaporte)</Text>{' '}
                            para validar que el ticket está registrado a tu nombre.
                        </Text>

                        {/* Button */}
                        <TouchableOpacity style={styles.modalBtn} onPress={() => setShowNominativeInfo(false)}>
                            <LinearGradient
                                colors={[accentColor, accentColor]}
                                start={{x: 0, y: 0}} end={{x: 1, y: 0}}
                                style={styles.modalBtnGradient}
                            >
                                <Text style={styles.modalBtnText}>Entendido</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#030303' },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    scrollContent: { paddingHorizontal: 25, paddingBottom: 150 },
    
    eventHeaderRow: {
        width: '100%',
        flexDirection: 'row',
        marginBottom: 25,
        alignItems: 'center',
        gap: 15,
    },
    eventSquareImage: {
        width: 80,
        height: 80,
        borderRadius: 14,
        backgroundColor: '#111',
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
    },
    eventHeaderTextContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    eventHeaderTitle: {
        color: '#FBFBFB',
        fontSize: 20,
        fontWeight: '900',
        fontStyle: 'italic',
        marginBottom: 8,
        lineHeight: 24,
        letterSpacing: -1,
    },
    eventHeaderSubRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    eventHeaderText: {
        color: 'rgba(251,251,251,0.45)',
        fontSize: 12,
        fontWeight: '600',
        flex: 1,
    },
    
    sectionLabel: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', marginBottom: 15, textTransform: 'uppercase', letterSpacing: 1.5 },
    
    tiersList: { gap: 12, marginBottom: 30 },
    
    tierCard: {
        width: '100%',
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: COLORS.glassBg, padding: 16, borderRadius: 20,
        borderWidth: 1, borderColor: COLORS.glassBorder, overflow: 'hidden'
    },
    
    tierCardSoldOut: {
        borderColor: 'rgba(255, 59, 48, 0.3)', 
        backgroundColor: 'rgba(255, 59, 48, 0.03)', 
        shadowColor: '#FF3B30',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 2,
    },
    
    tierName: { color: '#FBFBFB', fontSize: 16, fontWeight: '800', marginBottom: 4, letterSpacing: -1 },
    
    // <-- ESTILOS NUEVOS GRIS REAL PARA SOLD OUT -->
    tierNameSoldOut: { color: 'rgba(255, 255, 255, 0.3)' }, 
    tierPriceSoldOut: { color: 'rgba(255, 255, 255, 0.3)', textDecorationLine: 'line-through' },
    
    tierDescription: { color: 'rgba(251,251,251,0.45)', fontSize: 12, fontWeight: '600', marginBottom: 6, fontStyle: 'italic' },
    tierPrice: { color: '#FBFBFB', fontSize: 14, fontWeight: '700' },
    
    soldOutContainer: {
        justifyContent: 'center',
        alignItems: 'flex-end',
        paddingLeft: 10,
    },
    soldOutText: { color: '#FF3B30', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
    
    lowStockText: { color: '#FF3B30', fontSize: 10, fontWeight: '800', marginTop: 4 },
    
    counter: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(0,0,0,0.2)', padding: 6, borderRadius: 14 },
    counterBtn: { 
        width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', 
        backgroundColor: COLORS.glassBg, borderWidth: 1, borderColor: COLORS.glassBorder 
    },
    qtyText: { color: '#FBFBFB', fontSize: 16, fontWeight: '800', minWidth: 20, textAlign: 'center' },
    
    emptyState: { alignItems: 'center', padding: 30, opacity: 0.7 },
    emptyText: { color: COLORS.textZinc, marginTop: 10, textAlign: 'center' },
    
    glassSummaryContainer: { 
        backgroundColor: COLORS.glassBg, padding: 20, borderRadius: 24, 
        borderWidth: 1, borderColor: COLORS.glassBorder 
    },
    summaryTitle: { color: '#FBFBFB', fontWeight: '800', marginBottom: 15 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    summaryLabel: { color: 'rgba(251,251,251,0.45)', fontWeight: '600' },
    summaryValue: { color: '#FBFBFB', fontWeight: '500' },
    
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 12 },
    
    totalLabel: { color: '#FBFBFB', fontSize: 16, fontWeight: '900' },
    totalValue: { color: '#FF31D8', fontSize: 20, fontWeight: '900' },
    
    footer: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'rgba(255,255,255,0.08)', borderTopWidth: 1, borderTopColor: 'rgba(251,251,251,0.15)', paddingHorizontal: isSmallScreen ? 20 : 24, paddingVertical: isSmallScreen ? 20 : 24, paddingBottom: isSmallScreen ? 25 : 35 },
    buyBtnContainer: { height: isSmallScreen ? 50 : 58, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
    buyBtnText: { fontWeight: '900', fontSize: isSmallScreen ? 14 : 16 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalCard: { width: '100%', backgroundColor: '#030303', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(251, 251, 251, 0.05)', padding: 22, gap: 18, shadowColor: '#FF31D8', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 30, elevation: 14 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalTag: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    modalTagText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    modalIconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,49,216,0.1)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.25)', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', shadowColor: '#FF31D8', shadowOpacity: 0.4, shadowRadius: 16 },
    modalTitle: { color: '#FBFBFB', fontSize: 26, fontWeight: '900', fontStyle: 'italic', textAlign: 'center', letterSpacing: -1 },
    modalBody: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', lineHeight: 22 },
    modalBtn: { width: '100%', height: 54, borderRadius: 27, overflow: 'hidden', shadowColor: '#FF31D8', shadowOpacity: 0.35, shadowRadius: 10 },
    modalBtnGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    modalBtnText: { color: '#FBFBFB', fontWeight: '900', fontSize: 15, letterSpacing: 1, fontStyle: 'italic' },
});