import { useLocalSearchParams, useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS } from '../../constants/colors';
import { supabase } from '../../lib/supabase';

export default function PaymentResaleScreen() {
    const router = useRouter();
    const { url, token } = useLocalSearchParams();
    const [loading, setLoading] = useState(true);

    const webViewRef = useRef<WebView>(null);
    const commitAttempted = useRef(false);

    const handleWebViewNavigation = async (navState: any) => {
        const { url: currentUrl } = navState;
        
        // Detectar URL de retorno real desde variable de entorno
        const callbackHost = process.env.EXPO_PUBLIC_CALLBACK_HOST;
        if (!callbackHost) {
          console.error('[CONFIG ERROR] EXPO_PUBLIC_CALLBACK_HOST no definida');
          return;
        }
        if (currentUrl.includes(callbackHost) && currentUrl.includes('callback=dyzgo_final')) {
            
            if (commitAttempted.current) return;
            commitAttempted.current = true;

            // 1. Matar la web inmediatamente
            if (webViewRef.current) webViewRef.current.stopLoading();

            // 2. Pantalla de carga nativa
            setLoading(true); 

            try {
                const { data: { user } } = await supabase.auth.getUser();
                
                const { data, error } = await supabase.functions.invoke('webpay', {
                    body: { action: 'commit', token_ws: token, user_id: user?.id }
                });

                if (data?.status === 'AUTHORIZED') {
                    router.replace('/(tabs)/marketplace'); 
                } else {
                    const msg = data?.db_error || data?.error || "El pago fue rechazado.";
                    Alert.alert("Transacción Fallida", msg);
                    router.back(); 
                }
            } catch (e: any) {
                Alert.alert("Error de Conexión", e.message);
                router.back();
            }
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar barStyle="light-content" />
            <View style={{ flex: 1 }}>
                <WebView
                    ref={webViewRef}
                    source={{
                        uri: url as string,
                        method: 'POST',
                        body: `token_ws=${token}`,
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    }}
                    onNavigationStateChange={handleWebViewNavigation}
                    onLoadEnd={() => setLoading(false)}
                    style={{ flex: 1 }}
                />
                
                {loading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color={COLORS.neonPink} />
                    </View>
                )}

                <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
                    <X color="white" size={24} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    closeBtn: {
        position: 'absolute', top: 20, right: 20,
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
        justifyContent: 'center', alignItems: 'center', elevation: 5, zIndex: 10
    },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', zIndex: 5 }
});