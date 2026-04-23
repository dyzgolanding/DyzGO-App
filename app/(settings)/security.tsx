import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import * as SecureStore from 'expo-secure-store';
import {
    ChevronRight,
    Fingerprint,
    KeyRound as KeyIcon,
    KeyRound,
    Lock,
    Mail,
    ShieldCheck,
    Smartphone,
    X
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { BlurView } from '../../components/BlurSurface';
import Animated, {
    Easing,
    FadeInUp,
    interpolate,
    interpolateColor,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming
} from 'react-native-reanimated';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import { COLORS } from '../../constants/colors';
import { supabase } from '../../lib/supabase';

const { width, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isSmallScreen = width < 400;

export default function SecurityScreen() {
    const router = useRouter();
    const navTop = useNavBarPaddingTop();

    // --- ESTADOS LÓGICOS ---
    const [faceId, setFaceId] = useState(false);
    const [twoStep, setTwoStep] = useState(false);

    // --- ESTADOS MODAL Y AUTH ---
    const [modalVisible, setModalVisible] = useState(false);
    // Steps: 1-3 (Password), 10 (2FA Setup)
    const [resetStep, setResetStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [userEmail, setUserEmail] = useState('');

    // Inputs del formulario
    const [otpCode, setOtpCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Animación Fuerza de Contraseña
    const [passStrength, setPassStrength] = useState(0);
    const strengthAnim = useSharedValue(0);

    // Animación del sheet
    const sheetOffset = useSharedValue(SCREEN_HEIGHT);
    const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetOffset.value }] }));
    const overlayStyle = useAnimatedStyle(() => ({ opacity: interpolate(sheetOffset.value, [0, SCREEN_HEIGHT], [1, 0]) }));

    useEffect(() => {
        if (modalVisible) {
            sheetOffset.value = SCREEN_HEIGHT;
            sheetOffset.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
        }
    }, [modalVisible]);

    const handlePan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, g) => { if (g.dy > 0) sheetOffset.value = g.dy; },
        onPanResponderRelease: (_, g) => {
            if (g.dy > 80 || g.vy > 0.5) {
                sheetOffset.value = withTiming(SCREEN_HEIGHT, { duration: 250 }, () => { runOnJS(_resetModal)(); });
            } else {
                sheetOffset.value = withTiming(0, { duration: 260 });
            }
        },
    })).current;

    useEffect(() => {
        checkSettings();
    }, []);

    const checkSettings = async () => {
        // 1. Cargar Usuario
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) setUserEmail(user.email);

        // 2. Verificar Biometría en Storage Local (SecureStore no disponible en web)
        if (Platform.OS !== 'web') {
            const bioState = await SecureStore.getItemAsync('biometrics_enabled');
            setFaceId(bioState === 'true');
        }

        // 3. Verificar 2FA por email en metadata del usuario
        if (user) {
            setTwoStep(!!user.user_metadata?.email_2fa_enabled);
        }
    };

    // --- LÓGICA BIOMETRÍA (FACE ID / HUELLA) ---
    const toggleFaceId = async (value: boolean) => {
        if (value) {
            // Activar
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            if (!hasHardware) return Alert.alert("Error", "Tu dispositivo no soporta biometría.");

            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            if (!isEnrolled) return Alert.alert("Error", "No tienes biometría configurada en este dispositivo.");

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Confirma para activar el acceso biométrico',
            });

            if (result.success) {
                await SecureStore.setItemAsync('biometrics_enabled', 'true');
                setFaceId(true);
            }
        } else {
            // Desactivar
            await SecureStore.deleteItemAsync('biometrics_enabled');
            setFaceId(false);
        }
    };

    // --- LÓGICA VERIFICACIÓN EN 2 PASOS (EMAIL) ---
    const toggleTwoStep = async (value: boolean) => {
        if (value) {
            Alert.alert(
                "Activar verificación por email",
                "Al iniciar sesión recibirás un código en tu correo para confirmar tu identidad.",
                [
                    { text: "Cancelar", style: "cancel" },
                    {
                        text: "Activar",
                        onPress: async () => {
                            setLoading(true);
                            try {
                                const { error } = await supabase.auth.updateUser({
                                    data: { email_2fa_enabled: true }
                                });
                                if (error) throw error;
                                setTwoStep(true);
                                Alert.alert("¡Listo!", "Verificación en 2 pasos activada.");
                            } catch (e: any) {
                                Alert.alert("Error", e.message);
                            } finally {
                                setLoading(false);
                            }
                        }
                    }
                ]
            );
        } else {
            Alert.alert("Desactivar 2FA", "¿Estás seguro? Tu cuenta será menos segura.", [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Desactivar",
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        try {
                            const { error } = await supabase.auth.updateUser({
                                data: { email_2fa_enabled: false }
                            });
                            if (error) throw error;
                            setTwoStep(false);
                            Alert.alert("Listo", "Verificación en 2 pasos desactivada.");
                        } catch (e: any) {
                            Alert.alert("Error", e.message);
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]);
        }
    };

    // --- LÓGICA DE CONTRASEÑA (TUYA ORIGINAL) ---
    const handlePasswordInput = (text: string) => {
        setNewPassword(text);
        let score = 0;
        if (text.length === 0) score = 0;
        else if (text.length < 8) score = 1;
        else {
            const hasUpper = /[A-Z]/.test(text);
            const hasNumber = /\d/.test(text);
            if (hasUpper && hasNumber) score = 3;
            else score = 2;
        }
        setPassStrength(score);
        strengthAnim.value = withTiming(score, { duration: 400 });
    };

    const animatedBarStyle = useAnimatedStyle(() => {
        const widthPercent = interpolate(strengthAnim.value, [0, 1, 2, 3], [0, 33, 66, 100]);
        const color = interpolateColor(strengthAnim.value, [0, 1, 2, 3], ['#333333', '#FF4444', '#FFAA00', '#00FF7F']);
        return { width: `${widthPercent}%`, backgroundColor: color };
    });

    const handleChangePassword = async () => {
        if (!userEmail) return Alert.alert("Error", "No se pudo obtener tu email.");
        setModalVisible(true);
        setResetStep(1);
    };

    const sendCode = async () => {
        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(userEmail);
            if (error) throw error;
            setResetStep(2);
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setLoading(false);
        }
    };

    const verifyCode = async () => {
        if (otpCode.length < 6) return Alert.alert("Error", "Código incompleto.");
        setLoading(true);
        try {
            const { error } = await supabase.auth.verifyOtp({ email: userEmail, token: otpCode, type: 'recovery' });
            if (error) throw error;
            setResetStep(3);
        } catch (error: any) {
            Alert.alert("Error", "Código inválido.");
        } finally {
            setLoading(false);
        }
    };

    const updatePassword = async () => {
        if (newPassword.length < 8) return Alert.alert("Contraseña corta", "Mínimo 8 caracteres.");
        if (newPassword !== confirmPassword) return Alert.alert("Error", "Las contraseñas no coinciden.");

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            Alert.alert("¡Éxito!", "Contraseña actualizada.");
            closeModal();
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setLoading(false);
        }
    };

    const _resetModal = () => {
        setModalVisible(false);
        setOtpCode('');
        setNewPassword('');
        setConfirmPassword('');
        setResetStep(1);
        setPassStrength(0);
        strengthAnim.value = withTiming(0);
    };

    const closeModal = () => {
        sheetOffset.value = withTiming(SCREEN_HEIGHT, { duration: 250 }, () => { runOnJS(_resetModal)(); });
    };

    return (
        <View style={styles.container}>
            {Platform.OS !== 'web' && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <LinearGradient colors={['rgba(255, 49, 216, 0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.05)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFill} />
            </View>
            )}

            <NavBar title="SEGURIDAD" onBack={() => router.back()} />

            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: navTop }]} showsVerticalScrollIndicator={false}>
                <Animated.View entering={FadeInUp.duration(300).delay(0).springify()}>
                <View style={styles.shieldIconContainer}>
                    <View style={styles.glowCircle}>
                        <ShieldCheck color={twoStep ? "#00FF88" : COLORS.neonPink} size={isSmallScreen ? 35 : 40} />
                    </View>
                    <Text style={[styles.shieldText, twoStep && {color: '#00FF88'}]}>
                        {twoStep ? "PROTECCIÓN MÁXIMA" : "CUENTA PROTEGIDA"}
                    </Text>
                </View>

                </Animated.View>

                <Animated.View entering={FadeInUp.duration(300).delay(80).springify()}>
                <Text style={styles.sectionLabel}>Credenciales</Text>
                <View style={styles.glassCard}>
                    <TouchableOpacity style={styles.rowItem} onPress={handleChangePassword}>
                        <View style={styles.iconBox}><KeyRound color={COLORS.neonPink} size={18} /></View>
                        <Text style={styles.rowTitle}>Cambiar Contraseña</Text>
                        <ChevronRight color={COLORS.textZinc} size={20} />
                    </TouchableOpacity>
                </View>

                </Animated.View>

                <Animated.View entering={FadeInUp.duration(300).delay(160).springify()}>
                <Text style={styles.sectionLabel}>Acceso Biométrico</Text>
                <View style={styles.glassCard}>
                    <View style={styles.rowItem}>
                        <View style={styles.iconBox}><Fingerprint color={COLORS.neonPink} size={18} /></View>
                        <View style={{flex: 1}}>
                            <Text style={styles.rowTitle}>{Platform.OS === 'ios' ? 'Face ID' : 'Huella Digital'}</Text>
                            <Text style={styles.rowSub}>Acceso rápido y seguro</Text>
                        </View>
                        <Switch
                            value={faceId} onValueChange={toggleFaceId}
                            trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#7B1E6B' }} thumbColor={faceId ? COLORS.neonPink : '#FBFBFB'}
                            ios_backgroundColor='rgba(255,255,255,0.1)'
                        />
                    </View>
                </View>

                </Animated.View>

                <Animated.View entering={FadeInUp.duration(300).delay(240).springify()}>
                <Text style={styles.sectionLabel}>Avanzado</Text>
                <View style={styles.glassCard}>
                    <View style={styles.rowItem}>
                        <View style={styles.iconBox}><Smartphone color="#00F0FF" size={18} /></View>
                        <View style={{flex: 1}}>
                            <Text style={styles.rowTitle}>Verificación en 2 pasos</Text>
                            <Text style={styles.rowSub}>Código por Email</Text>
                        </View>
                        <Switch
                            value={twoStep} onValueChange={toggleTwoStep}
                            trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#7B1E6B' }} thumbColor={twoStep ? COLORS.neonPink : '#FBFBFB'}
                            ios_backgroundColor='rgba(255,255,255,0.1)'
                        />
                    </View>
                </View>
                </Animated.View>

            </ScrollView>

            {/* --- MODAL UNIFICADO --- */}
            <Modal animationType="none" transparent={true} visible={modalVisible} onRequestClose={closeModal}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }, overlayStyle]}>
                        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeModal} />
                    </Animated.View>

                    <Animated.View style={[styles.modalContent, sheetStyle]}>
                        <View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }]}>
                            <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
                        </View>

                        {/* Handle — arrastra para cerrar */}
                        <View style={{ alignItems: 'center', paddingVertical: 18, paddingHorizontal: 40 }} {...handlePan.panHandlers}>
                            <View style={styles.modalHandle} />
                        </View>

                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={closeModal} style={[styles.closeBtn, { marginLeft: 'auto' }]}>
                                <X color="rgba(255,255,255,0.6)" size={20} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalBody}>

                            {/* PASO 1: SOLICITAR EMAIL */}
                            {resetStep === 1 && (
                                <View style={{alignItems: 'center', gap: 20, paddingVertical: 20}}>
                                    <View style={styles.bigIconCircle}>
                                        <Mail color={COLORS.neonPink} size={35} />
                                    </View>
                                    <View style={{alignItems: 'center'}}>
                                        <Text style={styles.modalSubtitle}>Te enviaremos un código a:</Text>
                                        <Text style={styles.emailHighlight}>{userEmail}</Text>
                                    </View>
                                    <ActionButton onPress={sendCode} loading={loading} text="ENVIAR CÓDIGO" />
                                </View>
                            )}

                            {/* PASO 2: VERIFICAR EMAIL (ORIGINAL) */}
                            {resetStep === 2 && (
                                <View style={{gap: 20, paddingVertical: 20}}>
                                    <Text style={styles.modalSubtitleLeft}>Introduce el código de email:</Text>

                                    <View style={styles.modalGlassInput}>
                                        <KeyIcon color={COLORS.neonPink} size={20} style={{marginHorizontal: 15}} />
                                        <TextInput
                                            placeholder="123456" placeholderTextColor="#666" style={styles.modalActualInput}
                                            keyboardType="number-pad" maxLength={6} value={otpCode} onChangeText={setOtpCode}
                                        />
                                    </View>
                                    <ActionButton onPress={verifyCode} loading={loading} text="VERIFICAR CÓDIGO" />
                                </View>
                            )}

                            {/* PASO 3: NUEVA CONTRASEÑA (ORIGINAL) */}
                            {resetStep === 3 && (
                                <View style={{gap: 20, paddingVertical: 20}}>
                                    <Text style={styles.modalSubtitleLeft}>Crea tu nueva contraseña:</Text>

                                    <View>
                                        <View style={styles.modalGlassInput}>
                                            <Lock color={COLORS.neonPink} size={20} style={{marginHorizontal: 15}} />
                                            <TextInput
                                                placeholder="Nueva contraseña" placeholderTextColor="#666" style={styles.modalActualInput}
                                                secureTextEntry value={newPassword} onChangeText={handlePasswordInput}
                                            />
                                        </View>
                                        <View style={styles.strengthBarContainer}>
                                            <Animated.View style={[styles.strengthBarFill, animatedBarStyle]} />
                                        </View>
                                    </View>

                                    <View style={styles.modalGlassInput}>
                                        <Lock color={COLORS.neonPink} size={20} style={{marginHorizontal: 15}} />
                                        <TextInput
                                            placeholder="Confirmar contraseña" placeholderTextColor="#666" style={styles.modalActualInput}
                                            secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword}
                                        />
                                    </View>

                                    <ActionButton onPress={updatePassword} loading={loading} text="ACTUALIZAR CONTRASEÑA" />
                                </View>
                            )}
                        </View>
                    </Animated.View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

// COMPONENTE DE BOTÓN REUTILIZABLE
const ActionButton = ({ onPress, loading, text }: any) => (
    <TouchableOpacity style={styles.modalMainBtn} onPress={onPress} disabled={loading} activeOpacity={0.8}>
        {loading ? <ActivityIndicator color={COLORS.neonPink} /> : <Text style={styles.btnText}>{text}</Text>}
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : COLORS.background },

    scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },

    shieldIconContainer: { alignItems: 'center', marginVertical: isSmallScreen ? 20 : 30 },
    glowCircle: {
        width: isSmallScreen ? 70 : 80, height: isSmallScreen ? 70 : 80, borderRadius: 40,
        backgroundColor: 'rgba(138, 43, 226, 0.1)', justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(138, 43, 226, 0.3)', marginBottom: 15
    },
    shieldText: { color: COLORS.neonPink, fontSize: 12, fontWeight: '900', letterSpacing: 1 },

    sectionLabel: {
        color: '#FBFBFB', fontSize: 11, fontWeight: '900', marginBottom: 10,
        marginTop: isSmallScreen ? 20 : 25, marginLeft: 10, textTransform: 'uppercase', letterSpacing: 1.5
    },

    glassCard: {
        backgroundColor: COLORS.glassBg, borderRadius: 24,
        borderWidth: 1, borderColor: COLORS.glassBorder, overflow: 'hidden'
    },

    rowItem: { flexDirection: 'row', alignItems: 'center', padding: isSmallScreen ? 16 : 20 },
    iconBox: {
        width: isSmallScreen ? 36 : 40, height: isSmallScreen ? 36 : 40, borderRadius: 12,
        backgroundColor: COLORS.glassBg, justifyContent: 'center', alignItems: 'center', marginRight: 15
    },
    rowTitle: { color: 'white', fontSize: isSmallScreen ? 14 : 15, flex: 1, fontWeight: '500' },
    rowSub: { color: COLORS.textZinc, fontSize: 12, marginTop: 2 },

    sessionsBtn: { marginTop: 40, alignItems: 'center', padding: 15 },
    sessionsText: { color: COLORS.neonPink, fontSize: 13, fontWeight: '700' },

    // MODAL STYLES
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalContent: {
        backgroundColor: 'transparent', borderTopLeftRadius: 32, borderTopRightRadius: 32,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingBottom: 30, maxHeight: '85%',
    },
    modalHandle: { width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 20 },
    modalTitle: { color: '#FBFBFB', fontSize: 22, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5 },
    closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' },
    modalBody: { paddingHorizontal: 24, paddingBottom: 10 },

    bigIconCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255, 49, 216, 0.1)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255, 49, 216, 0.3)', marginBottom: 10 },
    modalSubtitle: { color: COLORS.textZinc, textAlign: 'center', fontSize: 15, marginBottom: 5 },
    modalSubtitleLeft: { color: COLORS.textZinc, textAlign: 'left', fontSize: 15, marginBottom: 5 },
    emailHighlight: { color: 'white', fontWeight: '800', fontSize: 18 },

    modalGlassInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glassBg, borderRadius: 18, height: 58, borderWidth: 1, borderColor: COLORS.glassBorder },
    modalActualInput: { flex: 1, color: 'white', fontSize: 17, height: '100%', paddingRight: 15 },

    modalMainBtn: {
        height: isSmallScreen ? 50 : 58, borderRadius: 20, marginTop: 10, width: '100%',
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
        backgroundColor: 'rgba(255,49,216,0.15)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.35)',
    },
    btnText: { color: '#FF31D8', fontWeight: '900', fontSize: isSmallScreen ? 14 : 16 },

    strengthBarContainer: { height: 4, backgroundColor: '#222', borderRadius: 2, overflow: 'hidden', marginTop: 8, marginHorizontal: 5 },
    strengthBarFill: { height: '100%', borderRadius: 2 },
});
