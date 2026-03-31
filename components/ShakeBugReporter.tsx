import React, { useState, useEffect } from 'react';
import { Accelerometer } from 'expo-sensors';
import { Alert, Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Keyboard, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Send, Bug } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/colors';
import { supabase } from '../lib/supabase'; // <-- Importamos tu Supabase

const SHAKE_THRESHOLD = 2.5; 
const MIN_TIME_BETWEEN_SHAKES = 3000; 

export function ShakeBugReporter({ children }: { children: React.ReactNode }) {
    const [reporting, setReporting] = useState(false);
    const [bugText, setBugText] = useState('');
    const [lastShakeTime, setLastShakeTime] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false); // Para mostrar que está enviando

    useEffect(() => {
        Accelerometer.setUpdateInterval(150);

        const subscription = Accelerometer.addListener(accelerometerData => {
            const { x, y, z } = accelerometerData;
            const acceleration = Math.sqrt(x * x + y * y + z * z);

            if (acceleration > SHAKE_THRESHOLD) {
                const now = Date.now();
                if (now - lastShakeTime > MIN_TIME_BETWEEN_SHAKES && !reporting) {
                    setLastShakeTime(now);
                    triggerBugReport();
                }
            }
        });

        return () => subscription.remove();
    }, [lastShakeTime, reporting]);

    const triggerBugReport = () => {
        Alert.alert(
            "¿Algo no funciona bien?",
            "Agitaste tu teléfono. ¿Quieres reportar un problema en DyzGO.?",
            [
                { text: "Cancelar", style: "cancel" },
                { text: "Reportar Problema", onPress: () => setReporting(true) }
            ]
        );
    };

    // MAGIA: Ahora esta función es asíncrona y guarda en Supabase
    const submitReport = async () => {
        if (bugText.trim().length < 5) {
            Alert.alert("Detalla un poco más", "Por favor, cuéntanos qué pasó para poder arreglarlo.");
            return;
        }

        setIsSubmitting(true);

        try {
            // 1. Buscamos quién es el usuario actual
            const { data: { user } } = await supabase.auth.getUser();

            // 2. Guardamos el reporte en la tabla nueva
            const { error } = await supabase
                .from('bug_reports')
                .insert([
                    { 
                        description: bugText, 
                        user_id: user?.id || null // Si no está logueado, lo manda anónimo
                    }
                ]);

            if (error) throw error;

            // 3. Cerramos todo y damos las gracias
            Keyboard.dismiss();
            setReporting(false);
            setBugText('');
            
            setTimeout(() => {
                Alert.alert("¡Gracias, crack! 🚀", "Tu reporte ya está en nuestra base de datos. Lo revisaremos enseguida.");
            }, 500);

        } catch (error) {
            console.error("Error enviando reporte:", error);
            Alert.alert("Ups", "No pudimos enviar el reporte. Revisa tu conexión a internet.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <View style={{ flex: 1 }}>
            {children}

            <Modal visible={reporting} animationType="fade" transparent>
                <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalOverlay}
                >
                    <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
                    
                    <View style={styles.modalContent}>
                        <View style={styles.header}>
                            <View style={styles.iconCircle}>
                                <Bug color={COLORS.neonPink} size={24} />
                            </View>
                            <TouchableOpacity onPress={() => setReporting(false)} style={styles.closeBtn}>
                                <X color="white" size={24} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.title}>Reportar un problema</Text>
                        <Text style={styles.subtitle}>Cuéntanos qué estabas haciendo y qué falló. Nuestro equipo lo revisará a la velocidad de la luz.</Text>

                        <TextInput
                            style={styles.textInput}
                            multiline
                            placeholder="Ej: Intenté comprar la entrada de Sunset y el botón se quedó pegado..."
                            placeholderTextColor="rgba(255,255,255,0.3)"
                            value={bugText}
                            onChangeText={setBugText}
                            autoFocus
                        />

                        <TouchableOpacity onPress={submitReport} activeOpacity={0.8} disabled={isSubmitting} style={{ marginTop: 20 }}>
                            <LinearGradient
                                colors={[COLORS.neonPurple, COLORS.neonPink]}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                style={styles.submitBtn}
                            >
                                {isSubmitting ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <>
                                        <Send color="white" size={18} />
                                        <Text style={styles.submitBtnText}>Enviar Reporte</Text>
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { width: '100%', backgroundColor: '#111', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', shadowColor: COLORS.neonPurple, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    iconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,0,255,0.1)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,0,255,0.3)' },
    closeBtn: { padding: 5 },
    title: { color: 'white', fontSize: 24, fontWeight: '900', fontStyle: 'italic', marginBottom: 8 },
    subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 20, marginBottom: 20 },
    textInput: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, color: 'white', fontSize: 16, height: 120, textAlignVertical: 'top', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    submitBtn: { flexDirection: 'row', height: 54, borderRadius: 16, justifyContent: 'center', alignItems: 'center', gap: 10 },
    submitBtnText: { color: 'white', fontSize: 16, fontWeight: '900' }
});