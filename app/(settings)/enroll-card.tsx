import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import ReAnimated, { FadeIn } from 'react-native-reanimated';
import { ActivityIndicator, Alert, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS } from '../../constants/colors';
import { supabase } from '../../lib/supabase';

export default function EnrollCardScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [enrollUrl, setEnrollUrl] = useState<string | null>(null);
    
    // --- NUEVO: Memoria para guardar el token ---
    const enrollmentToken = useRef<string | null>(null);
    
    // Referencias para evitar ejecuciones dobles
    const webViewRef = useRef<WebView>(null);
    const finishAttempted = useRef(false);

    useEffect(() => {
        startEnrollment();
    }, []);

    const startEnrollment = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No hay usuario autenticado");

            console.log("Iniciando inscripción...");

            // 1. Pedir URL de inscripción al Backend
            const { data, error } = await supabase.functions.invoke('webpay', {
                body: { 
                    action: 'oneclick_enroll_start',
                    user_id: user.id,
                    email: user.email 
                }
            });

            if (error) throw new Error(`Error Backend: ${error.message}`);
            if (!data?.token) {
                const msg = data?.error_message || JSON.stringify(data);
                throw new Error(`Rechazo Transbank Inicio: ${msg}`);
            }

            // --- AQUÍ EL TRUCO: Guardamos el token en memoria ---
            enrollmentToken.current = data.token;
            console.log("Token guardado en memoria:", data.token);

            // Construimos la URL
            setEnrollUrl(`${data.url_webpay}?TBK_TOKEN=${data.token}`);
            
        } catch (e: any) {
            console.error("Error start:", e);
            Alert.alert("Error al Iniciar", e.message);
            router.back();
        }
    };

    const handleWebViewNavigation = async (navState: any) => {
        const { url } = navState;

        // Detectar si volvimos a nuestra "URL de retorno"
        // NOTA: Transbank hace un POST, por eso no vemos el token en la URL,
        // pero solo el hecho de llegar aquí significa que terminó.
        const callbackHost = process.env.EXPO_PUBLIC_CALLBACK_HOST;
        if (!callbackHost) {
          console.error('[CONFIG ERROR] EXPO_PUBLIC_CALLBACK_HOST no definida');
          return;
        }
        if (url.includes(callbackHost) && url.includes('callback=dyzgo_oneclick')) {
            
            if (finishAttempted.current) return;
            finishAttempted.current = true;

            // Detener visualmente el WebView
            if (webViewRef.current) webViewRef.current.stopLoading();
            setLoading(true);
            setEnrollUrl(null); 

            try {
                console.log("Retorno detectado. Usando token de memoria...");

                // --- USAMOS EL TOKEN QUE GUARDAMOS AL PRINCIPIO ---
                const token = enrollmentToken.current;

                if (!token) {
                    throw new Error("Error fatal: Perdimos el token de memoria.");
                }

                const { data: { user } } = await supabase.auth.getUser();

                // 2. Confirmar y Guardar en Backend
                const { data, error } = await supabase.functions.invoke('webpay', {
                    body: { 
                        action: 'oneclick_enroll_finish',
                        token: token, // Enviamos el mismo token
                        user_id: user?.id 
                    }
                });

                if (error) throw new Error(error.message);

                if (data?.status === 'SUCCESS') {
                    Alert.alert("¡Éxito!", `Tarjeta guardada correctamente\nTerminada en: ${data.card}`);
                    router.back(); 
                } else {
                    throw new Error(data?.error || "El banco rechazó la inscripción final.");
                }

            } catch (e: any) {
                console.error(e);
                Alert.alert("Error al Guardar", e.message);
                router.back();
            }
        }
    };

    return (
        <ReAnimated.View entering={FadeIn.duration(250)} style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar barStyle="light-content" />
            <View style={{ flex: 1 }}>
                {enrollUrl ? (
                    <WebView
                        ref={webViewRef}
                        source={{ uri: enrollUrl }}
                        onNavigationStateChange={handleWebViewNavigation}
                        onLoadEnd={() => setLoading(false)}
                        style={{ flex: 1 }}
                        sharedCookiesEnabled={true}
                        thirdPartyCookiesEnabled={true}
                    />
                ) : null}
                
                {loading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color={COLORS.neonPink} />
                        <View style={{marginTop: 20}}></View>
                    </View>
                )}

                <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
                    <X color="white" size={24} />
                </TouchableOpacity>
            </View>
        </ReAnimated.View>
    );
}

const styles = StyleSheet.create({
    closeBtn: {
        position: 'absolute', top: 20, right: 20,
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
        justifyContent: 'center', alignItems: 'center', elevation: 5, zIndex: 10
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: COLORS.background,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 5
    }
});