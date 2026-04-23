import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { BlurView } from '../../components/BlurSurface';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  Camera,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  CircleHelp,
  CreditCard,
  Lock,
  LogOut,
  Trash2
} from 'lucide-react-native';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import ReAnimated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
} from 'react-native';

const isSmallScreen = Dimensions.get('window').width < 400;
import { COLORS } from '../../constants/colors';
import { supabase } from '../../lib/supabase';

export default function SettingsScreen() {
    const router = useRouter();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();

    const [fetching, setFetching] = useState(true);
    const [loading, setLoading] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (!fetching) {
            Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        }
    }, [fetching]);
    
    const [fullName, setFullName] = useState('');
    const [username, setUsername] = useState('');
    const [instagram, setInstagram] = useState('');
    const [email, setEmail] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [notifications, setNotifications] = useState(true);
    const [isPrivate, setIsPrivate] = useState(false);

    const [savedFullName, setSavedFullName] = useState('');
    const [savedUsername, setSavedUsername] = useState('');
    const [savedInstagram, setSavedInstagram] = useState('');
    const isDirty = fullName !== savedFullName || username !== savedUsername || instagram !== savedInstagram;

    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
            if (!isDirty) return;
            e.preventDefault();
            if (Platform.OS === 'web') {
                if (window.confirm('¿Quieres salir sin guardar los cambios?')) {
                    navigation.dispatch(e.data.action);
                }
                return;
            }

            Alert.alert(
                'Cambios sin guardar',
                '¿Quieres salir sin guardar los cambios?',
                [
                    { text: 'Seguir editando', style: 'cancel' },
                    { text: 'Descartar', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
                ]
            );
        });
        return unsubscribe;
    }, [navigation, isDirty]);

    useEffect(() => {
        fetchProfile();
    }, []);

    async function fetchProfile() {
        try {
            setFetching(true);
            const { data: { user } } = await supabase.auth.getUser();
            
            if (user) {
                setEmail(user.email || '');
                const { data } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .maybeSingle();

                if (data) {
                    const fn = data.full_name || '';
                    const un = data.username || '';
                    const ig = data.instagram_username || '';
                    setFullName(fn); setSavedFullName(fn);
                    setUsername(un); setSavedUsername(un);
                    setInstagram(ig); setSavedInstagram(ig);
                    setAvatarUrl(data.avatar_url || null);
                    setIsPrivate(data.is_private ?? false);
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setFetching(false);
        }
    }

    // --- LOGICA BLINDADA ---

    const handleFullNameChange = (text: string) => {
        const clean = text.replace(/[^a-zA-ZÀ-ÿ\s]/g, '');
        if (clean.length <= 20) {
            setFullName(clean);
        }
    };

    const handleUsernameChange = (text: string) => {
        const clean = text.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        if (clean.length <= 20) {
            setUsername(clean);
        }
    };

    const handleInstagramChange = (text: string) => {
        const clean = text.replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase();
        if (clean.length <= 30) {
            setInstagram(clean);
        }
    };

    // --- IMAGEN DE PERFIL ---

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
            base64: true,
        });

        if (!result.canceled && result.assets[0].base64) {
            uploadAvatar(result.assets[0].base64);
        }
    };

    async function uploadAvatar(base64: string) {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const filePath = `${user.id}/${Date.now()}.png`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, decode(base64), { 
                    contentType: 'image/png',
                    upsert: true 
                });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', user.id);

            if (updateError) throw updateError;

            setAvatarUrl(publicUrl);
            Alert.alert("Éxito", "Foto actualizada.");
        } catch (error: any) {
            Alert.alert("Error", "No se pudo subir la foto.");
        } finally {
            setLoading(false);
        }
    }

    // --- ACTUALIZAR DATOS ---

    async function handleUpdateProfile() {
        if (username.length < 4) return Alert.alert("Error", "El usuario debe tener al menos 4 caracteres.");
        if (fullName.length < 3) return Alert.alert("Error", "El nombre es muy corto.");

        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) return;

            const { data: existing } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', username)
                .neq('id', user.id)
                .maybeSingle();

            if (existing) {
                setLoading(false);
                return Alert.alert("Ocupado", "Este nombre de usuario ya está en uso.");
            }

            const { error } = await supabase.from('profiles').update({
                full_name: fullName.trim(),
                username: username.trim(),
                instagram_username: instagram.trim() || null 
            }).eq('id', user.id);

            if (error) throw error;
            setSavedFullName(fullName.trim());
            setSavedUsername(username.trim());
            setSavedInstagram(instagram.trim());
            Alert.alert("Guardado", "Tu perfil se ha actualizado.");
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setLoading(false);
        }
    }

    const handlePrivacyToggle = async (value: boolean) => {
        setIsPrivate(value);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('profiles').update({ is_private: value }).eq('id', user.id);
        }
    };

    const handleLogout = async () => {
        if (Platform.OS === 'web') {
            if (window.confirm("¿Seguro que quieres salir?")) {
                await supabase.auth.signOut();
                router.replace('/(tabs)/home');
                setTimeout(() => { router.push('/login'); }, 100);
            }
            return;
        }

        Alert.alert("Cerrar Sesión", "¿Seguro que quieres salir?", [
            { text: "Cancelar", style: "cancel" },
            { text: "Salir", style: "destructive", onPress: async () => {
                await supabase.auth.signOut();
                router.replace('/(tabs)/home');
                setTimeout(() => {
                    router.push('/login');
                }, 100);
            }}
        ]);
    };

    return (
        <ReAnimated.View entering={FadeIn.duration(250)} style={styles.container}>
            <StatusBar barStyle="light-content" />
            
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
            
            {/* PASTILLA FLOTANTE */}
            <View style={[styles.floatingHeader, { top: insets.top + 12 }]}>
                <View style={styles.pillContainer}>
                    <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]} />
                    <View style={styles.pillContent}>
                        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                            <ChevronLeft color="white" size={24} />
                        </TouchableOpacity>
                        <Text style={styles.pillTitle}>CONFIGURACIÓN</Text>
                        <View style={{ width: 24 }} />
                    </View>
                </View>
            </View>

            <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 102 }]}>
                    
                    <ReAnimated.View entering={FadeInUp.duration(300).delay(0).springify()}>
                    <View style={styles.avatarSection}>
                        <View style={styles.avatarContainer}>
                            <LinearGradient colors={['rgba(255,49,216,0.2)', 'rgba(255,49,216,0.2)']} style={styles.avatarGradient}>
                                {avatarUrl ? (
                                    <Image source={{ uri: avatarUrl }} style={styles.avatarImageReal} contentFit="cover" transition={150} cachePolicy="memory-disk" />
                                ) : (
                                    <Text style={styles.avatarInitial}>{fullName ? fullName[0].toUpperCase() : '?'}</Text>
                                )}
                            </LinearGradient>
                            <TouchableOpacity style={styles.editBadge} onPress={pickImage} disabled={loading}>
                                {loading ? <ActivityIndicator size="small" color="white" /> : <Camera color="white" size={14} />}
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.userName}>{fullName || 'Usuario'}</Text>
                        <Text style={styles.userHandle}>@{username || 'sin_usuario'}</Text>
                    </View>
                    </ReAnimated.View>

                    {/* FORMULARIO */}
                    <ReAnimated.View entering={FadeInUp.duration(300).delay(80).springify()}>
                    <Text style={styles.sectionLabel}>Cuenta</Text>
                    <View style={styles.glassCard}>
                        <SettingInput 
                            label="Nombre completo" 
                            value={fullName} 
                            onChangeText={handleFullNameChange} 
                            placeholder="Tu nombre"
                        />
                        <View style={styles.divider} />
                        <SettingInput 
                            label="Nombre de usuario (@)" 
                            value={username} 
                            onChangeText={handleUsernameChange} 
                            autoCapitalize="none"
                            placeholder="usuario_unico"
                        />
                        <View style={styles.divider} />
                        <SettingInput 
                            label="Instagram (Sin @)" 
                            value={instagram} 
                            onChangeText={handleInstagramChange} 
                            autoCapitalize="none"
                            placeholder="tu_instagram"
                        />
                        <View style={styles.divider} />
                        <View style={styles.inputWrapper}>
                            <Text style={styles.inputLabel}>Correo electrónico</Text>
                            <Text style={[styles.input, { opacity: 0.5 }]}>{email}</Text>
                        </View>
                        <View style={styles.divider} />
                        <SettingNavigation icon={<Lock color={COLORS.neonPink} size={18} />} title="Seguridad y Contraseña" onPress={() => router.push('/security')} />
                    </View>

                    {/* BOTÓN GUARDAR */}
                    <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateProfile} disabled={loading}>
                        {loading ? (
                            <ActivityIndicator color="#FF31D8" />
                        ) : (
                            <>
                                <Text style={styles.saveText}>GUARDAR CAMBIOS</Text>
                                <CheckCircle2 color="#FF31D8" size={18} />
                            </>
                        )}
                    </TouchableOpacity>
                    </ReAnimated.View>

                    <ReAnimated.View entering={FadeInUp.duration(300).delay(160).springify()}>
                    <Text style={styles.sectionLabel}>Privacidad</Text>
                    <View style={styles.glassCard}>
                        <SettingSwitch
                            icon={<Lock color={COLORS.neonPink} size={18} />}
                            title="Cuenta privada"
                            subtitle="No apareces en rankings ni como asistente en eventos"
                            value={isPrivate}
                            onValueChange={handlePrivacyToggle}
                        />
                    </View>
                    </ReAnimated.View>

                    <ReAnimated.View entering={FadeInUp.duration(300).delay(240).springify()}>
                    <Text style={styles.sectionLabel}>Preferencias</Text>
                    <View style={styles.glassCard}>
                        <SettingSwitch icon={<Bell color={COLORS.neonPink} size={18} />} title="Notificaciones Push" value={notifications} onValueChange={setNotifications} />
                        <View style={styles.divider} />
                        <SettingNavigation 
                            icon={<CreditCard color={COLORS.neonPink} size={18} />} 
                            title="Métodos de Pago" 
                            onPress={() => router.push('/payment-methods')} 
                        />
                        <View style={styles.divider} />
                        <SettingNavigation icon={<CircleHelp color={COLORS.neonPink} size={18} />} title="Centro de Ayuda" onPress={() => router.push('/help')} />
                    </View>
                    </ReAnimated.View>

                    <ReAnimated.View entering={FadeInUp.duration(300).delay(240).springify()}>
                    <View style={styles.legalRow}>
                        <TouchableOpacity onPress={() => Linking.openURL('https://dyzgo.com/privacy')}>
                            <Text style={styles.legalLink}>Política de Privacidad</Text>
                        </TouchableOpacity>
                        <Text style={styles.legalDot}>·</Text>
                        <TouchableOpacity onPress={() => Linking.openURL('https://dyzgo.com/terms')}>
                            <Text style={styles.legalLink}>Términos y Condiciones</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.footerActions}>
                        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                            <LogOut color={COLORS.textZinc} size={18} />
                            <Text style={styles.logoutText}>Cerrar Sesión</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.deleteBtn} onPress={() => router.push('/delete-account')}>
                            <Trash2 color="#FF4444" size={16} />
                            <Text style={styles.deleteText}>Eliminar Cuenta</Text>
                        </TouchableOpacity>
                    </View>
                    </ReAnimated.View>

                </ScrollView>
            </KeyboardAvoidingView>
            </Animated.View>
        </ReAnimated.View>
    );
}

const SettingInput = ({ label, value, onChangeText, autoCapitalize, placeholder }: any) => (
    <View style={styles.inputWrapper}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TextInput
            style={[styles.input, { color: 'white' }]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#666"
            autoCapitalize={autoCapitalize || "sentences"}
            autoCorrect={false}
        />
    </View>
);

const SettingSwitch = ({ icon, title, subtitle, value, onValueChange }: any) => (
    <View style={styles.rowItem}>
        <View style={styles.iconBox}>{icon}</View>
        <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{title}</Text>
            {subtitle ? <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>{subtitle}</Text> : null}
        </View>
        <Switch
            value={value}
            onValueChange={onValueChange}
            trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#7B1E6B' }}
        thumbColor={value ? COLORS.neonPink : '#FBFBFB'}
        ios_backgroundColor='rgba(255,255,255,0.1)'
        />
    </View>
);

const SettingNavigation = ({ icon, title, onPress }: any) => (
    <TouchableOpacity style={styles.rowItem} onPress={onPress}>
        <View style={styles.iconBox}>{icon}</View>
        {/* Se agrega flex: 1 directamente al texto en la navegación */}
        <Text style={[styles.rowTitle, { flex: 1 }]}>{title}</Text>
        <ChevronRight color={COLORS.textZinc} size={20} />
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#030303' },
    
    floatingHeader: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 999,
        alignItems: 'center',
    },
    
    pillContainer: {
        width: '90%', 
        height: 60, 
        borderRadius: 24, 
        borderWidth: 1, 
        borderColor: COLORS.glassBorder,
        position: 'relative', 
    },
    
    pillContent: {
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        height: '100%',
        paddingHorizontal: 15,
    },
    
    backButton: { width: 24 }, 

    pillTitle: {
        color: '#FBFBFB',
        fontSize: 16,
        fontWeight: '900',
        fontStyle: 'italic',
        textAlign: 'center',
        letterSpacing: -1,
    },
    
    scrollContent: {
        padding: 20,
        paddingBottom: 60,
    },

    avatarSection: { alignItems: 'center', marginBottom: 0 },
    avatarContainer: { position: 'relative', marginBottom: 15, borderWidth: 2.5, borderColor: '#FF31D8', borderRadius: 50, shadowColor: '#FF31D8', shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
    avatarGradient: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    avatarInitial: { color: '#FBFBFB', fontSize: 38, fontWeight: '800' },
    avatarImageReal: { width: '100%', height: '100%', borderRadius: 50 },
    editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: 'rgba(10,0,20,0.9)', padding: 8, borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255, 49, 216, 0.5)' },
    
    userName: { color: '#FBFBFB', fontSize: 22, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1 },
    userHandle: { color: COLORS.textZinc, fontSize: 14, marginTop: 2 },
    
    sectionLabel: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', marginBottom: 10, marginTop: 30, marginLeft: 10, textTransform: 'uppercase', letterSpacing: 1.5 },
    
    glassCard: { 
        backgroundColor: COLORS.glassBg, borderRadius: 24, padding: 5, 
        borderWidth: 1, borderColor: COLORS.glassBorder 
    },
    divider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', marginHorizontal: 15 },
    
    inputWrapper: { paddingVertical: 12, paddingHorizontal: 15 },
    inputLabel: { color: COLORS.textZinc, fontSize: 10, marginBottom: 5, fontWeight: '900', textTransform: 'uppercase' },
    input: { fontSize: 16, fontWeight: '500', color: '#FBFBFB' },
    
    rowItem: { flexDirection: 'row', alignItems: 'center', padding: 18 },
    iconBox: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.glassBg, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    // flex: 1 se eliminó de aquí para que no rompa el centrado cuando hay un contenedor intermedio
    rowTitle: { color: '#FBFBFB', fontSize: 15, fontWeight: '500' },
    
    saveBtn: {
        marginTop: 20, height: 58, borderRadius: 20,
        backgroundColor: 'rgba(255,49,216,0.15)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.35)',
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
    },
    saveText: { color: '#FF31D8', fontWeight: '900', fontSize: isSmallScreen ? 14 : 16 },
    
    footerActions: { marginTop: 40, alignItems: 'center', gap: 20 },
    logoutBtn: { 
        flexDirection: 'row', alignItems: 'center', gap: 10, 
        backgroundColor: COLORS.glassBg, paddingVertical: 14, paddingHorizontal: 30, borderRadius: 25, 
        borderWidth: 1, borderColor: COLORS.glassBorder 
    },
    logoutText: { color: '#FBFBFB', fontSize: 15, fontWeight: '500' },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.5 },
    deleteText: { color: '#FF4444', fontSize: 12, fontWeight: '800' },
    legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 24 },
    legalLink: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '600' },
    legalDot: { color: 'rgba(255,255,255,0.2)', fontSize: 11 },
});