import { LinearGradient } from 'expo-linear-gradient';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Trash2
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');
const isSmallScreen = width < 400;

import { COLORS } from '../../constants/colors';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const navTop = useNavBarPaddingTop();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [email, setEmail] = useState('');

  const reasons = [
    "No lo uso lo suficiente",
    "Preocupaciones de privacidad",
    "Tengo otra cuenta",
    "La app falla mucho",
    "Otro motivo"
  ];

  const handleRequestCode = async () => {
    if (!selectedReason) return Alert.alert("Selección", "Por favor elige un motivo.");

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.email) throw new Error("No se pudo identificar al usuario.");
      setEmail(user.email);
      const { error } = await supabase.auth.signInWithOtp({ email: user.email });
      if (error) throw error;
      setStep(2);
    } catch (error: any) {
      Alert.alert("Error", error.message || "No se pudo enviar el código.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (otpCode.length < 6) return Alert.alert("Error", "El código debe tener 6 dígitos.");

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'email' });
      if (error) throw new Error("Código incorrecto o expirado. Inténtalo de nuevo.");
      setStep(3);
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFinally = async () => {
    setLoading(true);
    try {
      // Pasamos el motivo seleccionado a la base de datos
      const { error } = await supabase.rpc('delete_own_user', { 
        p_reason: selectedReason 
      });

      if (error) throw error;
      await supabase.auth.signOut();
      Alert.alert("Cuenta Eliminada", "Lamentamos verte partir. Tu cuenta ha sido borrada.");
      router.replace('/login');
    } catch (error: any) {
      console.error("Error deleting:", error);
      Alert.alert("Error", "No se pudo eliminar la cuenta. Contacta a soporte.");
    } finally {
      setLoading(false);
    }
  };

  const renderStep1_Reason = () => (
    <Animated.View entering={FadeIn.duration(250)} style={styles.stepContainer}>
      <Text style={styles.title}>¿Por qué quieres irte?</Text>
      <Text style={styles.subtitle}>Nos ayuda a mejorar saber el motivo.</Text>
      
      <View style={styles.reasonsList}>
        {reasons.map((reason) => (
          <TouchableOpacity 
            key={reason} 
            style={[styles.reasonItem, selectedReason === reason && styles.reasonActive]}
            onPress={() => setSelectedReason(reason)}
          >
            <Text style={[styles.reasonText, selectedReason === reason && { color: '#FBFBFB', fontWeight: '800' }]}>
              {reason}
            </Text>
            {selectedReason === reason && <CheckCircle2 color={COLORS.neonPink} size={18} />}
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.mainBtn, !selectedReason && { opacity: 0.4 }]}
        onPress={handleRequestCode}
        disabled={!selectedReason || loading}
        activeOpacity={0.8}
      >
        {loading ? <ActivityIndicator color="#FF31D8" /> : <Text style={styles.btnText}>CONTINUAR</Text>}
        <ArrowRight color="#FF31D8" size={18} />
      </TouchableOpacity>
    </Animated.View>
  );

  const renderStep2_OTP = () => (
    <Animated.View entering={FadeInDown.duration(300).delay(80).springify()} style={styles.stepContainer}>
      <View style={styles.iconBig}><KeyRound color={COLORS.neonPink} size={40} /></View>
      <Text style={styles.title}>Revisa tu email</Text>
      <Text style={styles.subtitle}>Enviamos un código de 6 dígitos a{'\n'}{email}</Text>

      <View style={styles.passwordWrapper}>
        <TextInput
          style={styles.passwordInput}
          placeholder="000000"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={otpCode}
          onChangeText={setOtpCode}
          keyboardType="number-pad"
          maxLength={6}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <TouchableOpacity style={styles.mainBtn} onPress={handleVerifyCode} disabled={loading} activeOpacity={0.8}>
        {loading ? <ActivityIndicator color="#FF31D8" /> : <Text style={styles.btnText}>VERIFICAR</Text>}
      </TouchableOpacity>
    </Animated.View>
  );

  const renderStep3_Confirm = () => (
    <Animated.View entering={FadeInDown.duration(300).delay(80).springify()} style={styles.stepContainer}>
      {/* Icono sin el borde neon rosado */}
      <View style={styles.iconBig}>
        <AlertTriangle color={COLORS.neonPink} size={40} />
      </View>
      <Text style={[styles.title, { color: '#FBFBFB' }]}>¿Estás seguro?</Text>
      <Text style={styles.warningText}>
        Esta acción es <Text style={{fontWeight: '900', color: COLORS.neonPink}}>irreversible</Text>. 
        Se eliminarán todos tus datos, progreso, nivel, amigos y tickets.
      </Text>

      {/* Botón final unificado con el estilo de la aplicación y texto modificado */}
      <TouchableOpacity style={styles.mainBtn} onPress={handleDeleteFinally} disabled={loading}>
          <LinearGradient colors={[COLORS.neonPurple, COLORS.neonPink]} style={{ ...StyleSheet.absoluteFillObject, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }} start={{x:0, y:0}} end={{x:1, y:0}}>
          {loading ? (
              <ActivityIndicator color="white" />
          ) : (
              <>
                <Trash2 color={'#FBFBFB'} size={20} />
                <Text style={[styles.btnText, { color: '#FBFBFB' }]}>Sí, eliminar mi cuenta</Text>
              </>
          )}
          </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
        <Text style={styles.cancelText}>Cancelar, me quedo</Text>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
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
      
      <NavBar title="ELIMINAR CUENTA" onBack={() => router.back()} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: navTop }]} showsVerticalScrollIndicator={false}>
            {step === 1 && renderStep1_Reason()}
            {step === 2 && renderStep2_OTP()}
            {step === 3 && renderStep3_Confirm()}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030303' },
  
  content: { paddingHorizontal: isSmallScreen ? 20 : 30, paddingBottom: isSmallScreen ? 20 : 30, alignItems: 'center', flexGrow: 1, justifyContent: 'center' },
  stepContainer: { width: '100%', alignItems: 'center' },
  
  title: { color: '#FBFBFB', fontSize: isSmallScreen ? 24 : 28, fontWeight: '900', marginBottom: 10, textAlign: 'center', fontStyle: 'italic', letterSpacing: -1 },
  subtitle: { color: COLORS.textZinc, fontSize: 14, textAlign: 'center', marginBottom: 30, fontWeight: '500' },
  
  reasonsList: { width: '100%', gap: 12, marginBottom: 30 },
  reasonItem: { 
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
      padding: isSmallScreen ? 14 : 16, backgroundColor: COLORS.glassBg, borderRadius: 20, 
      borderWidth: 1, borderColor: COLORS.glassBorder 
  },
  reasonActive: { backgroundColor: 'rgba(255,49,216,0.12)', borderColor: 'rgba(255,49,216,0.35)' },
  reasonText: { color: 'rgba(251,251,251,0.45)', fontSize: 14, fontWeight: '600' },

  mainBtn: {
    width: '100%', height: isSmallScreen ? 50 : 58, borderRadius: 20, marginTop: 10,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,49,216,0.15)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.35)',
  },
  btnText: { color: '#FF31D8', fontWeight: '900', fontSize: isSmallScreen ? 14 : 16 },
  
  iconBig: { 
      width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.glassBg, 
      justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: COLORS.glassBorder 
  },
  
  passwordWrapper: {
    width: '100%', marginBottom: 30,
    backgroundColor: COLORS.glassBg,
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.glassBorder,
    paddingHorizontal: 18,
  },
  passwordInput: {
    width: '100%', paddingVertical: 16,
    fontSize: 20, color: '#FBFBFB', textAlign: 'center', letterSpacing: 6,
  },
  
  warningText: { color: COLORS.textZinc, textAlign: 'center', fontSize: 15, lineHeight: 24, marginBottom: 40, paddingHorizontal: 10 },
  
  cancelBtn: { padding: 15 },
  cancelText: { color: COLORS.textZinc, fontWeight: '700', opacity: 0.6 }
});