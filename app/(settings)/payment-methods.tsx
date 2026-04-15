import { BlurView } from '../../components/BlurSurface';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import { ArrowRight, CreditCard, Plus, Trash2 } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import ReAnimated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isSmallScreen = SCREEN_WIDTH < 400;
import { supabase } from '../../lib/supabase';

import { COLORS } from '../../constants/colors';
import { EmptyStateCard } from '../../components/EmptyStateCard';
const DANGER = '#ef4444';

export default function PaymentMethodsScreen() {
    const router = useRouter();
    const navTop = useNavBarPaddingTop();
    const [cards, setCards] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Cargar tarjetas cada vez que la pantalla gana foco (ej: al volver de inscribir una)
    useFocusEffect(
        useCallback(() => {
            fetchCards();
        }, [])
    );

    const fetchCards = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('user_payment_methods')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setCards(data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCard = (id: string) => {
        Alert.alert("Eliminar Tarjeta", "¿Estás seguro? Tendrás que inscribirla nuevamente para usarla.", [
            { text: "Cancelar", style: "cancel" },
            {
                text: "Eliminar", style: "destructive", onPress: async () => {
                    // Borrado optimista (UI primero)
                    const oldCards = [...cards];
                    setCards(cards.filter(c => c.id !== id));
                    
                    const { error } = await supabase.from('user_payment_methods').delete().eq('id', id);
                    if (error) {
                        Alert.alert("Error", "No se pudo eliminar.");
                        setCards(oldCards); // Revertir si falla
                    }
                }
            }
        ]);
    };

    const renderCardItem = ({ item }: { item: any }) => (
        <View style={styles.cardItem}>
            <View style={styles.cardIconContainer}>
                <CreditCard color={COLORS.neonPink} size={24} />
            </View>
            <View style={{ flex: 1, marginLeft: 15 }}>
                <Text style={styles.cardType}>{item.card_type} •••• {item.card_number.slice(-4)}</Text>
                <Text style={styles.cardSubtitle}>Inscrita en OneClick</Text>
            </View>
            <TouchableOpacity onPress={() => handleDeleteCard(item.id)} style={styles.deleteBtn}>
                <Trash2 color={DANGER} size={20} />
            </TouchableOpacity>
        </View>
    );

    return (
        <ReAnimated.View entering={FadeIn.duration(250)} style={styles.container}>
            <StatusBar barStyle="light-content" />
            
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <LinearGradient colors={['rgba(255, 49, 216, 0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.05)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFill} />
            </View>
            
            <View style={{ flex: 1 }}>
                <NavBar title="MIS TARJETAS" onBack={() => router.back()} />

                <View style={{ flex: 1, paddingHorizontal: 25, paddingBottom: 25, paddingTop: navTop }}>
                    <ReAnimated.View entering={FadeInUp.duration(300).delay(0).springify()}>
                <View style={[styles.infoBox, { overflow: 'hidden' }]}>
                        <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.infoIcon}>
                            <CreditCard color={COLORS.neonPink} size={18} />
                        </View>
                        <Text style={styles.infoText}>Guarda tus tarjetas para comprar tickets en 1 click sin ingresar datos bancarios nuevamente.</Text>
                    </View>
                    </ReAnimated.View>

                    <FlatList
                        data={cards}
                        keyExtractor={item => item.id}
                        renderItem={renderCardItem}
                        contentContainerStyle={{ paddingBottom: 100 }}
                        removeClippedSubviews={true}
                        maxToRenderPerBatch={8}
                        windowSize={5}
                        initialNumToRender={6}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            loading ? null : (
                                <EmptyStateCard
                                    marginTop={40}
                                    icon={<CreditCard color={COLORS.neonPink} size={40} />}
                                    title="Sin tarjetas"
                                    subtitle="No tienes tarjetas guardadas."
                                />
                            )
                        }
                    />
                </View>

                <ReAnimated.View entering={FadeInUp.duration(300).delay(80).springify()}>
                <BlurView intensity={80} tint="dark" style={styles.footer}>
                    <TouchableOpacity style={styles.addBtnMain} onPress={() => router.push('/enroll-card')} activeOpacity={0.8}>
                        <Plus color="#FF31D8" size={18} strokeWidth={2.5} />
                        <Text style={styles.addBtnMainText}>AGREGAR NUEVA TARJETA</Text>
                    </TouchableOpacity>
                </BlurView>
                </ReAnimated.View>
            </View>
        </ReAnimated.View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    
    // Info Box
    infoBox: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 16, borderRadius: 20,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 25,
    },
    infoIcon: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    infoText: { flex: 1, color: 'rgba(251,251,251,0.6)', fontSize: 11, lineHeight: 16 },
    
    // Card Item (Liquid Glass)
    cardItem: { 
        flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glassBg, 
        padding: 16, borderRadius: 20, marginBottom: 15, borderWidth: 1, borderColor: COLORS.glassBorder 
    },
    cardIconContainer: { 
        width: 45, height: 35, backgroundColor: 'rgba(255,255,255,0.05)', 
        borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' 
    },
    cardType: { color: 'white', fontSize: 15, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
    cardSubtitle: { color: COLORS.textZinc, fontSize: 12 },
    deleteBtn: { padding: 10, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 12 },
    
    // Empty State
    emptyContainer: { alignItems: 'center', marginTop: 60, opacity: 0.8 },
    emptyIconWrapper: {
        width: 86, height: 86, borderRadius: 43, backgroundColor: 'rgba(138, 43, 226, 0.1)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: 'rgba(138, 43, 226, 0.3)'
    },
    emptyText: { color: COLORS.textZinc, fontSize: 14 },
    
    // Footer & Button
    footer: {
        position: 'absolute', bottom: 0, width: '100%',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderTopWidth: 1, borderTopColor: 'rgba(251,251,251,0.15)',
        paddingHorizontal: isSmallScreen ? 20 : 24,
        paddingVertical: isSmallScreen ? 20 : 24,
        paddingBottom: isSmallScreen ? 25 : 35,
    },
    addBtnMain: {
        height: isSmallScreen ? 50 : 58,
        borderRadius: 20,
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
        backgroundColor: 'rgba(255,49,216,0.15)',
        borderWidth: 1, borderColor: 'rgba(255,49,216,0.35)',
    },
    addBtnMainText: { color: '#FF31D8', fontWeight: '900', fontSize: isSmallScreen ? 14 : 16 }
});