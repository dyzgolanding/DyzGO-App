import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import {
    ChevronDown, ChevronRight, ChevronUp, CreditCard,
    MessageSquare, Search, Ticket, User, X, AlertCircle,
    ShieldCheck, Star
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import ReAnimated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { Platform, Dimensions, Linking, ScrollView, StyleSheet,
    Text, TextInput, TouchableOpacity, View, LayoutAnimation } from 'react-native';
import { COLORS } from '../../constants/colors';

const { width } = Dimensions.get('window');
const isSmallScreen = width < 400;

const WHATSAPP_NUMBER = '56959241771';

const openWhatsApp = (message = '') => {
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    Linking.openURL(url);
};

// ─── DATOS ────────────────────────────────────────────────────────────────────

const categories = [
    { id: 'tickets', title: 'Mis Entradas', icon: 'ticket', color: COLORS.neonPink },
    { id: 'payments', title: 'Pagos y Reembolsos', icon: 'card', color: COLORS.neonPurple },
    { id: 'account', title: 'Mi Cuenta', icon: 'user', color: '#00F0FF' },
    { id: 'chat', title: 'Soporte en Vivo', icon: 'chat', color: '#30D158' },
];

type FAQ = { q: string; a: string; category: string };

const ALL_FAQS: FAQ[] = [
    // TICKETS
    {
        category: 'tickets',
        q: '¿Cómo veo mis entradas?',
        a: 'Ve a la pestaña "Perfil" → "Mis Tickets". Ahí encontrarás todas tus entradas activas, usadas y pendientes. Cada ticket tiene su QR listo para mostrar en la puerta.',
    },
    {
        category: 'tickets',
        q: '¿Cómo transfiero una entrada a otra persona?',
        a: 'Abre el ticket desde "Mis Tickets" → toca "Transferir" → ingresa el @usuario de DyzGO del destinatario. La transferencia es instantánea y el ticket desaparece de tu cuenta. Solo puedes transferir antes del evento.',
    },
    {
        category: 'tickets',
        q: 'Mi QR no funciona al ingresar al evento',
        a: 'Asegúrate de tener conexión a internet al mostrar el QR. Los QR son dinámicos y necesitan actualizarse. Si el problema persiste, el staff puede validarte por tu RUT/carnet de identidad si tu ticket es nominativo.',
    },
    {
        category: 'tickets',
        q: '¿Puedo usar un screenshot del QR?',
        a: 'No. Los QR de DyzGO son dinámicos y cambian constantemente para evitar fraude. Un screenshot será rechazado automáticamente en la puerta. Siempre muestra el ticket desde la app.',
    },
    {
        category: 'tickets',
        q: '¿Cómo revendo mi entrada?',
        a: 'Abre el ticket → toca "Poner en Venta" → fija tu precio (respetando el tope máximo permitido). Tu entrada aparecerá en el Marketplace para que otros usuarios la compren. Recibes el pago una vez que se venda.',
    },
    {
        category: 'tickets',
        q: 'Compré una entrada pero no aparece en la app',
        a: 'Espera 2-3 minutos y recarga la pantalla. Si el pago fue aprobado pero el ticket no aparece después de 10 minutos, contáctanos por WhatsApp con el comprobante de tu banco.',
    },
    // PAYMENTS
    {
        category: 'payments',
        q: '¿Qué métodos de pago aceptan?',
        a: 'Aceptamos tarjetas de débito y crédito Visa, Mastercard y Redcompra a través de Transbank WebPay Plus. No almacenamos datos de tarjetas en nuestros servidores.',
    },
    {
        category: 'payments',
        q: '¿Hacen reembolsos?',
        a: 'Los tickets no son reembolsables por cambio de opinión. Sin embargo:\n\n• Si el evento es CANCELADO → reembolso automático al método de pago original en 5-15 días hábiles.\n• Si el evento es REPROGRAMADO → tienes 5 días para solicitar reembolso.\n• El cargo por servicio nunca es reembolsable.',
    },
    {
        category: 'payments',
        q: 'Mi pago fue rechazado',
        a: 'Verifica que:\n1. Tu tarjeta tiene fondos suficientes.\n2. Tu banco no bloqueó la transacción (algunos bancos bloquean pagos en apps nuevas).\n3. Los datos de la tarjeta están correctos.\n\nSi el problema persiste, intenta con otra tarjeta o contacta a tu banco.',
    },
    {
        category: 'payments',
        q: '¿Qué es el cargo por servicio?',
        a: 'Es una tarifa que DyzGO cobra por procesar la compra, gestionar la plataforma y garantizar la validez del ticket. Este cargo se muestra claramente antes de confirmar tu compra y no es reembolsable.',
    },
    {
        category: 'payments',
        q: 'Me cobraron pero el evento fue cancelado',
        a: 'Si el organizador canceló el evento, DyzGO procesa el reembolso automáticamente al método de pago original. Si no lo recibes en 15 días hábiles, contáctanos por WhatsApp con tu comprobante.',
    },
    // ACCOUNT
    {
        category: 'account',
        q: '¿Cómo cambio mi foto de perfil?',
        a: 'Ve a "Perfil" → "Configuración" → toca el ícono de cámara sobre tu foto. Puedes seleccionar una imagen de tu galería. La foto se actualiza de inmediato.',
    },
    {
        category: 'account',
        q: '¿Cómo funciona el sistema de XP y Ranking?',
        a: 'Ganas XP cada vez que compras una entrada, asistes a eventos y completas logros. A mayor XP, mayor tu nivel. El Ranking muestra quiénes más eventos han asistido en la plataforma. El XP y los logros son virtuales y no tienen valor monetario.',
    },
    {
        category: 'account',
        q: 'Olvidé mi contraseña',
        a: 'En la pantalla de inicio de sesión, toca "¿Olvidaste tu contraseña?" → ingresa tu email → recibirás un código de verificación → crea tu nueva contraseña. Si no recibes el email, revisa tu carpeta de spam.',
    },
    {
        category: 'account',
        q: '¿Cómo elimino mi cuenta?',
        a: 'Ve a "Perfil" → "Configuración" → "Seguridad" → "Eliminar Cuenta". Se te pedirá un código de verificación por email. La eliminación es permanente e irreversible: se borran todos tus datos, tickets y progreso.',
    },
    {
        category: 'account',
        q: '¿Cómo activo o desactivo las notificaciones?',
        a: 'Ve a "Perfil" → "Configuración" → activa o desactiva "Notificaciones Push". También puedes controlar los recordatorios de eventos específicos desde "Guardados".',
    },
    {
        category: 'account',
        q: '¿Cómo agrego amigos?',
        a: 'Ve a "Perfil" → "Mis Amigos" → busca por @usuario. También puedes aceptar solicitudes de amistad desde ahí. Tus amigos pueden ver tus eventos asistidos si tu perfil es público.',
    },
];

// ─── COMPONENTE FAQ EXPANDIBLE ────────────────────────────────────────────────

const FaqItem = ({ item, isLast }: { item: FAQ; isLast: boolean }) => {
    const [open, setOpen] = useState(false);

    const toggle = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOpen(v => !v);
    };

    return (
        <TouchableOpacity
            onPress={toggle}
            activeOpacity={0.8}
            style={[styles.faqRow, isLast && { borderBottomWidth: 0 }]}
        >
            <View style={styles.faqHeader}>
                <Text style={styles.faqQuestion}>{item.q}</Text>
                {open
                    ? <ChevronUp color={COLORS.neonPink} size={18} />
                    : <ChevronDown color={COLORS.textZinc} size={18} />
                }
            </View>
            {open && (
                <Text style={styles.faqAnswer}>{item.a}</Text>
            )}
        </TouchableOpacity>
    );
};

// ─── PANTALLA PRINCIPAL ───────────────────────────────────────────────────────

export default function HelpScreen() {
    const router = useRouter();
    const navTop = useNavBarPaddingTop();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<string | null>(null);

    const visibleFaqs = useMemo(() => {
        let list = ALL_FAQS;
        if (activeCategory && activeCategory !== 'chat') {
            list = list.filter(f => f.category === activeCategory);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(f =>
                f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)
            );
        }
        return list;
    }, [searchQuery, activeCategory]);

    const handleCategoryPress = (id: string) => {
        if (id === 'chat') {
            openWhatsApp('Hola, necesito ayuda con DyzGO 👋');
            return;
        }
        setActiveCategory(prev => prev === id ? null : id);
        setSearchQuery('');
    };

    const CategoryIcon = ({ id, color }: { id: string; color: string }) => {
        const size = isSmallScreen ? 20 : 22;
        if (id === 'tickets') return <Ticket color={color} size={size} />;
        if (id === 'payments') return <CreditCard color={color} size={size} />;
        if (id === 'account') return <User color={color} size={size} />;
        if (id === 'chat') return <MessageSquare color={color} size={size} />;
        return null;
    };

    const sectionLabel = searchQuery
        ? `${visibleFaqs.length} resultado${visibleFaqs.length !== 1 ? 's' : ''}`
        : activeCategory
            ? categories.find(c => c.id === activeCategory)?.title ?? 'Preguntas Frecuentes'
            : 'Preguntas Frecuentes';

    return (
        <ReAnimated.View entering={FadeIn.duration(250)} style={styles.container}>
            {Platform.OS !== 'web' && (
<View style={StyleSheet.absoluteFill} pointerEvents="none">
                <LinearGradient colors={['rgba(255, 49, 216, 0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            </View>
)}

            <NavBar title="CENTRO DE AYUDA" onBack={() => router.back()} />

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingTop: navTop }]}>

                <ReAnimated.View entering={FadeInUp.duration(300).delay(0).springify()}>
                <Text style={styles.heroTitle}>¿Cómo podemos ayudarte?</Text>

                {/* BUSCADOR */}
                <View style={styles.searchBar}>
                    <Search color={COLORS.textZinc} size={18} />
                    <TextInput
                        placeholder="Busca tu problema..."
                        placeholderTextColor="#555"
                        style={styles.searchInput}
                        value={searchQuery}
                        onChangeText={t => { setSearchQuery(t); setActiveCategory(null); }}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <X color={COLORS.textZinc} size={18} />
                        </TouchableOpacity>
                    )}
                </View>
                </ReAnimated.View>

                {/* CATEGORÍAS */}
                {searchQuery === '' && (
                    <ReAnimated.View entering={FadeInUp.duration(300).delay(80).springify()}>
                    <View style={styles.grid}>
                        {categories.map(cat => {
                            const isActive = activeCategory === cat.id;
                            return (
                                <TouchableOpacity
                                    key={cat.id}
                                    style={[
                                        styles.catCard,
                                        isActive && { borderColor: cat.color, backgroundColor: `${cat.color}15` }
                                    ]}
                                    onPress={() => handleCategoryPress(cat.id)}
                                    activeOpacity={0.8}
                                >
                                    <View style={[styles.catIcon, { backgroundColor: `${cat.color}15` }]}>
                                        <CategoryIcon id={cat.id} color={cat.color} />
                                    </View>
                                    <Text style={[styles.catText, isActive && { color: cat.color }]}>
                                        {cat.title}
                                    </Text>
                                    {cat.id === 'chat' && (
                                        <View style={styles.liveDot} />
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    </ReAnimated.View>
                )}

                <ReAnimated.View entering={FadeInUp.duration(300).delay(160).springify()}>
                {/* LABEL SECCIÓN */}
                <View style={styles.sectionRow}>
                    <Text style={styles.sectionLabel}>{sectionLabel}</Text>
                    {activeCategory && (
                        <TouchableOpacity onPress={() => setActiveCategory(null)}>
                            <Text style={styles.clearFilter}>Ver todas</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* FAQs */}
                <View style={styles.glassCard}>
                    {visibleFaqs.length > 0 ? (
                        visibleFaqs.map((item, i) => (
                            <FaqItem key={i} item={item} isLast={i === visibleFaqs.length - 1} />
                        ))
                    ) : (
                        <View style={styles.noResults}>
                            <AlertCircle color={COLORS.textZinc} size={28} strokeWidth={1.5} />
                            <Text style={styles.noResultsTitle}>Sin resultados</Text>
                            <Text style={styles.noResultsText}>
                                No encontramos respuesta para "{searchQuery}".{'\n'}Puedes contactarnos directamente.
                            </Text>
                            <TouchableOpacity
                                style={styles.noResultsBtn}
                                onPress={() => openWhatsApp(`Hola, tengo una pregunta sobre: ${searchQuery}`)}
                            >
                                <MessageSquare color="#30D158" size={16} />
                                <Text style={styles.noResultsBtnText}>Preguntar por WhatsApp</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
                </ReAnimated.View>

                <ReAnimated.View entering={FadeInUp.duration(300).delay(240).springify()}>
                {/* ESTADO DEL SERVICIO + SOPORTE */}
                <View style={styles.bottomGroup}>
                    <View style={styles.statusCard}>
                        <ShieldCheck color="#30D158" size={18} />
                        <Text style={styles.statusText}>Todos los servicios operando con normalidad</Text>
                        <View style={styles.statusDot} />
                    </View>

                    <TouchableOpacity
                        style={styles.supportBanner}
                        onPress={() => openWhatsApp('Hola, necesito ayuda con DyzGO 👋')}
                        activeOpacity={0.85}
                    >
                        <LinearGradient
                            colors={['rgba(48,209,88,0.15)', 'rgba(48,209,88,0.05)']}
                            style={styles.supportGradient}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        >
                            <View style={styles.supportIconWrap}>
                                <MessageSquare color="#30D158" size={22} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.supportTitle}>Soporte en Vivo</Text>
                                <Text style={styles.supportSub}>WhatsApp · Tiempo de respuesta: ~5 min</Text>
                            </View>
                            <ChevronRight color="rgba(255,255,255,0.4)" size={20} />
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

                {/* ACCIONES RÁPIDAS */}
                <View style={styles.sectionRow}>
                    <Text style={styles.sectionLabel}>Acciones Rápidas</Text>
                </View>
                <View style={styles.glassCard}>
                    <TouchableOpacity
                        style={[styles.actionRow]}
                        onPress={() => router.push('/my-tickets' as any)}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,49,216,0.1)' }]}>
                            <Ticket color={COLORS.neonPink} size={18} />
                        </View>
                        <Text style={styles.actionText}>Ver mis entradas</Text>
                        <ChevronRight color={COLORS.textZinc} size={18} />
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={styles.actionRow}
                        onPress={() => router.push('/security' as any)}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.actionIcon, { backgroundColor: 'rgba(138,43,226,0.1)' }]}>
                            <ShieldCheck color={COLORS.neonPurple} size={18} />
                        </View>
                        <Text style={styles.actionText}>Seguridad y contraseña</Text>
                        <ChevronRight color={COLORS.textZinc} size={18} />
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={styles.actionRow}
                        onPress={() => openWhatsApp('Hola, quiero reportar un problema con mi cuenta de DyzGO')}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,59,48,0.1)' }]}>
                            <AlertCircle color="#FF3B30" size={18} />
                        </View>
                        <Text style={styles.actionText}>Reportar un problema</Text>
                        <ChevronRight color={COLORS.textZinc} size={18} />
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={styles.actionRow}
                        onPress={() => openWhatsApp('Hola, quiero dar feedback sobre la app DyzGO')}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,204,0,0.1)' }]}>
                            <Star color="#FFCC00" size={18} />
                        </View>
                        <Text style={styles.actionText}>Enviar sugerencia</Text>
                        <ChevronRight color={COLORS.textZinc} size={18} />
                    </TouchableOpacity>
                </View>

                <Text style={styles.versionText}>DyzGO v1.0.0 · legal@dyzgo.com</Text>
                </ReAnimated.View>

            </ScrollView>
        </ReAnimated.View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 60 },

    heroTitle: {
        color: 'white', fontSize: isSmallScreen ? 20 : 24,
        fontWeight: '900', textAlign: 'center', fontStyle: 'italic',
        marginTop: 16, marginBottom: 18,
    },

    searchBar: {
        flexDirection: 'row', backgroundColor: COLORS.glassBg,
        borderRadius: 16, paddingHorizontal: 15,
        height: 52, alignItems: 'center',
        marginBottom: 20,
        borderWidth: 1, borderColor: COLORS.glassBorder,
    },
    searchInput: { flex: 1, color: 'white', marginLeft: 10, fontSize: 15, fontWeight: '500' },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
    catCard: {
        width: '47.5%', backgroundColor: COLORS.glassBg, borderRadius: 20,
        paddingVertical: 18, paddingHorizontal: 12,
        alignItems: 'center', borderWidth: 1, borderColor: COLORS.glassBorder,
        position: 'relative',
    },
    catIcon: {
        width: 44, height: 44, borderRadius: 13,
        justifyContent: 'center', alignItems: 'center', marginBottom: 10,
    },
    catText: { color: 'white', fontSize: isSmallScreen ? 11 : 12, fontWeight: '700', textAlign: 'center' },
    liveDot: {
        position: 'absolute', top: 10, right: 10,
        width: 7, height: 7, borderRadius: 4, backgroundColor: '#30D158',
    },

    sectionRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 28, marginBottom: 10,
    },
    sectionLabel: { color: '#FBFBFB', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 },
    clearFilter: { color: COLORS.textZinc, fontSize: 12, fontWeight: '600' },

    glassCard: {
        backgroundColor: COLORS.glassBg, borderRadius: 20,
        borderWidth: 1, borderColor: COLORS.glassBorder, overflow: 'hidden',
    },

    faqRow: {
        paddingHorizontal: 18, paddingVertical: 16,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    faqQuestion: { color: COLORS.textWhite, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 12, lineHeight: 20 },
    faqAnswer: {
        color: 'rgba(251,251,251,0.5)', fontSize: 13, lineHeight: 21,
        marginTop: 10, fontWeight: '400',
    },

    noResults: { paddingVertical: 32, paddingHorizontal: 24, alignItems: 'center', gap: 8 },
    noResultsTitle: { color: 'white', fontSize: 15, fontWeight: '800' },
    noResultsText: { color: COLORS.textZinc, textAlign: 'center', fontSize: 13, lineHeight: 20 },
    noResultsBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
        backgroundColor: 'rgba(48,209,88,0.1)', borderRadius: 20,
        paddingHorizontal: 18, paddingVertical: 10,
        borderWidth: 1, borderColor: 'rgba(48,209,88,0.25)',
    },
    noResultsBtnText: { color: '#30D158', fontWeight: '700', fontSize: 13 },

    statusCard: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: 'rgba(48,209,88,0.06)', borderRadius: 14,
        paddingHorizontal: 16, paddingVertical: 12,
        borderWidth: 1, borderColor: 'rgba(48,209,88,0.15)',
    },
    statusText: { flex: 1, color: 'rgba(251,251,251,0.45)', fontSize: 12, fontWeight: '500' },
    statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#30D158' },

    supportBanner: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(48,209,88,0.2)' },
    supportGradient: { paddingHorizontal: 18, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
    supportIconWrap: {
        width: 42, height: 42, borderRadius: 13,
        backgroundColor: 'rgba(48,209,88,0.12)',
        justifyContent: 'center', alignItems: 'center',
    },
    supportTitle: { color: 'white', fontSize: 15, fontWeight: '900' },
    supportSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },

    actionRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14, gap: 14,
    },
    actionIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    actionText: { flex: 1, color: COLORS.textWhite, fontSize: 14, fontWeight: '600' },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginHorizontal: 16 },

    bottomGroup: { marginTop: 24, gap: 10 },
    versionText: { color: 'rgba(255,255,255,0.18)', fontSize: 11, textAlign: 'center', marginTop: 32, fontWeight: '500' },
});