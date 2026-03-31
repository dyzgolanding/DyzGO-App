import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import { ChevronRight, CreditCard, MessageSquare, Search, Ticket, User, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../../constants/colors';

const { width } = Dimensions.get('window');
const isSmallScreen = width < 400;

export default function HelpScreen() {
    const router = useRouter();
    const navTop = useNavBarPaddingTop();
    const [searchQuery, setSearchQuery] = useState('');

    const categories = [
        { title: 'Mis Entradas', icon: <Ticket color={COLORS.neonPink} size={isSmallScreen ? 18 : 20} />, id: 'tickets' },
        { title: 'Pagos y Reembolsos', icon: <CreditCard color={COLORS.neonPurple} size={isSmallScreen ? 18 : 20} />, id: 'payments' },
        { title: 'Mi Perfil', icon: <User color="#00F0FF" size={isSmallScreen ? 18 : 20} />, id: 'profile' },
        { title: 'Soporte en Vivo', icon: <MessageSquare color="#30D158" size={isSmallScreen ? 18 : 20} />, id: 'chat' },
    ];

    const faqs = [
        { q: '¿Cómo funcionan los puntos DyzGO?', a: 'Cada entrada que compras suma XP a tu nivel. A mayor nivel, mejores descuentos en preventas.' },
        { q: 'Políticas de cancelación', a: 'Puedes cancelar hasta 24 horas antes del evento para obtener un reembolso en créditos DyzGO.' },
        { q: '¿Qué es el VIP Access?', a: 'Es un beneficio premium que te permite saltar la fila en clubes seleccionados.' },
        { q: '¿Cómo transfiero una entrada?', a: 'En tu ticket, selecciona "Transferir" e ingresa el @usuario del destinatario.' },
    ];

    // Lógica de filtrado
    const filteredFaqs = useMemo(() => {
        return faqs.filter(item => 
            item.q.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [searchQuery]);

    const handleFaqPress = (item: typeof faqs[0]) => {
        Alert.alert(item.q, item.a);
    };

    const handleContactSupport = () => {
        Alert.alert("Soporte", "Conectando con un agente de DyzGO. Espere un momento...");
    };

    return (
        <View style={styles.container}>
            {/* FONDO ESTÁTICO DEGRADADO */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <LinearGradient colors={['rgba(255, 49, 216, 0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.05)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFill} />
            </View>
            
            <NavBar title="CENTRO DE AYUDA" onBack={() => router.back()} />

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingTop: navTop }]}>
                <Text style={styles.heroTitle}>¿Cómo podemos ayudarte?</Text>
                
                <View style={styles.searchBar}>
                    <Search color={COLORS.textZinc} size={18} />
                    <TextInput 
                        placeholder="Busca un problema..." 
                        placeholderTextColor="#666" 
                        style={styles.searchInput}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <X color={COLORS.textZinc} size={18} />
                        </TouchableOpacity>
                    )}
                </View>

                {searchQuery === '' && (
                    <View style={styles.grid}>
                        {categories.map((cat, i) => (
                            <TouchableOpacity 
                                key={cat.id} 
                                style={styles.glassCatCard}
                                onPress={cat.id === 'chat' ? handleContactSupport : undefined}
                            >
                                <View style={styles.catIcon}>{cat.icon}</View>
                                <Text style={styles.catText}>{cat.title}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                <Text style={styles.sectionLabel}>
                    {searchQuery ? 'Resultados de búsqueda' : 'Preguntas Frecuentes'}
                </Text>
                
                <View style={styles.glassCard}>
                    {filteredFaqs.length > 0 ? filteredFaqs.map((item, i) => (
                        <TouchableOpacity 
                            key={i} 
                            style={[styles.faqRow, i === filteredFaqs.length - 1 && { borderBottomWidth: 0 }]}
                            onPress={() => handleFaqPress(item)}
                        >
                            <Text style={styles.faqText}>{item.q}</Text>
                            <ChevronRight color={COLORS.textZinc} size={18} />
                        </TouchableOpacity>
                    )) : (
                        <View style={styles.noResults}>
                            <Text style={styles.noResultsText}>No encontramos lo que buscas. Intenta con otras palabras.</Text>
                        </View>
                    )}
                </View>

                <TouchableOpacity style={styles.supportBanner} onPress={handleContactSupport}>
                    <LinearGradient 
                        colors={['rgba(138, 43, 226, 0.2)', 'rgba(255, 0, 127, 0.1)']} 
                        style={styles.supportGradient}
                        start={{x:0, y:0}} end={{x:1, y:0}}
                    >
                        <MessageSquare color={COLORS.neonPink} size={24} />
                        <View style={{flex: 1, marginLeft: 15}}>
                            <Text style={styles.supportTitle}>¿No encuentras respuesta?</Text>
                            <Text style={styles.supportSub}>Habla con nuestro equipo 24/7</Text>
                        </View>
                        <ChevronRight color="white" size={20} />
                    </LinearGradient>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    
    scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
    
    // TÍTULO ESCALADO
    heroTitle: { 
        color: 'white', 
        fontSize: isSmallScreen ? 22 : 26, 
        fontWeight: '900', 
        textAlign: 'center', 
        marginTop: isSmallScreen ? 5 : 10, 
        marginBottom: isSmallScreen ? 20 : 25, 
        fontStyle: 'italic' 
    },
    
    // BARRA DE BÚSQUEDA ESCALADA
    searchBar: { 
        flexDirection: 'row', backgroundColor: COLORS.glassBg, borderRadius: 16, paddingHorizontal: 15, 
        height: isSmallScreen ? 48 : 55, 
        alignItems: 'center', 
        marginBottom: isSmallScreen ? 20 : 25, 
        borderWidth: 1, borderColor: COLORS.glassBorder 
    },
    searchInput: { flex: 1, color: 'white', marginLeft: 10, fontSize: 16, fontWeight: '500' },
    
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    
    // CATEGORY CARD ESCALADA
    glassCatCard: { 
        width: '47%', backgroundColor: COLORS.glassBg, borderRadius: 24, 
        padding: isSmallScreen ? 15 : 20, 
        marginBottom: 15, 
        alignItems: 'center', borderWidth: 1, borderColor: COLORS.glassBorder 
    },
    catIcon: { 
        width: isSmallScreen ? 42 : 48, 
        height: isSmallScreen ? 42 : 48, 
        borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', 
        justifyContent: 'center', alignItems: 'center', 
        marginBottom: isSmallScreen ? 8 : 12 
    },
    catText: { 
        color: 'white', 
        fontSize: isSmallScreen ? 11 : 13, 
        fontWeight: '700', textAlign: 'center' 
    },
    
    sectionLabel: {
        color: COLORS.neonPink,
        fontSize: 11, fontWeight: '900',
        marginTop: isSmallScreen ? 15 : 25,
        marginBottom: 15,
        textTransform: 'uppercase', letterSpacing: 1.5
    },
    
    // FAQ CARD
    glassCard: { 
        backgroundColor: COLORS.glassBg, borderRadius: 24, 
        borderWidth: 1, borderColor: COLORS.glassBorder, overflow: 'hidden' 
    },
    faqRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    faqText: { color: COLORS.textZinc, fontSize: 14, fontWeight: '500', flex: 1, marginRight: 10 },
    
    noResults: { padding: 30, alignItems: 'center' },
    noResultsText: { color: COLORS.textZinc, textAlign: 'center', fontSize: 14 },
    
    supportBanner: { marginTop: 30, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 49, 216, 0.3)' },
    supportGradient: { padding: 20, flexDirection: 'row', alignItems: 'center' },
    supportTitle: { color: 'white', fontSize: 15, fontWeight: '900', fontStyle: 'italic' },
    supportSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }
});