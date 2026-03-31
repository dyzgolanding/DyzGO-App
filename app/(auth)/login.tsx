import * as AppleAuthentication from 'expo-apple-authentication';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, ArrowRight, AtSign, Eye, EyeOff, KeyRound, Lock, Mail, RefreshCw, User } from 'lucide-react-native';
import React, { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';

WebBrowser.maybeCompleteAuthSession();
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  interpolateColor,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha'; // <-- MAGIA ANTIBOTS
import { COLORS } from '../../constants/colors';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');
const CONTENT_PADDING = 24;
const TAB_WIDTH = (width - (CONTENT_PADDING * 2) - 12) / 2;
const GAP = 15;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // --- ESTADOS ---
  const [isLogin, setIsLogin] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passStrength, setPassStrength] = useState(0);

  const animValue = useSharedValue(0);
  const strengthAnim = useSharedValue(0);
  const captchaRef = useRef<any>(null); // REF PARA EL CAPTCHA

  // --- EFECTO DEL CONTADOR ---
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendTimer > 0 && step === 2) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer, step]);

  // --- VISIBILIDAD ---
  const showTabs = step === 1 && !isResetting;
  const showNameUser = step === 1 && !isResetting && !isLogin;
  const showEmail = step === 1 && !(isResetting && step === 3);
  const showOTP = step === 2;
  const showPasswordInput = (step === 1 && !isResetting) || (isResetting && step === 3);
  const showConfirmPassword = isResetting && step === 3;
  const showForgotLink = isLogin && !isResetting && step === 1;

  // --- HANDLERS ---
  const handleNameInput = (text: string) => {
    const clean = text.replace(/[^a-zA-ZÀ-ÿ\s]/g, '');
    if (clean.length <= 20) setFullName(clean);
  };

  const handleUsernameInput = (text: string) => {
    const clean = text.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    if (clean.length <= 20) setUsername(clean);
  };

  const handleEmailInput = (text: string) => {
    const clean = text.replace(/[^a-zA-Z0-9@._\-+]/g, '');
    setEmail(clean);
  };

  const handlePasswordInput = (text: string) => {
    setPassword(text);
    let score = text.length === 0 ? 0 : text.length < 8 ? 1 : (/[A-Z]/.test(text) && /\d/.test(text)) ? 3 : 2;
    setPassStrength(score);
    strengthAnim.value = withTiming(score, { duration: 400 });
  };

  const handleTabChange = (type: 'login' | 'signup') => {
    if (step > 1 || isResetting) return;
    const toValue = type === 'login' ? 0 : 1;
    animValue.value = withTiming(toValue, { duration: 220, easing: Easing.out(Easing.cubic) });
    setIsLogin(type === 'login');
    resetForm();
  };

  const resetForm = () => {
    setConfirmPassword('');
    setPassword('');
    setPassStrength(0);
    strengthAnim.value = withTiming(0);
  };

  // --- VERIFICACIÓN + CREACIÓN DE PERFIL ---
  const handleVerifyCode = async () => {
    if (otpCode.length < 6) return Alert.alert("Error", "Código incompleto.");
    setLoading(true);
    try {
      const verifyType: 'signup' | 'recovery' = isResetting ? 'recovery' : 'signup';
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: verifyType
      });

      if (error) throw error;

      if (isResetting) {
        setStep(3);
        resetForm();
      } else if (data.session) {
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: data.session.user.id,
          email: email.trim(),
          username: username,
          full_name: fullName.trim(),
        });

        if (profileError) {
          throw new Error("Error creando perfil: " + profileError.message);
        }

        router.replace('/onboarding');
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Código inválido o expirado.");
    } finally {
      setLoading(false);
    }
  };

  // --- DISPARADOR DEL CAPTCHA ---
  const handleMainAction = async () => {
    if (isResetting) {
      if (step === 1) return handleSendRecoveryCode();
      if (step === 2) return handleVerifyCode();
      if (step === 3) return handleUpdatePassword();
      return;
    }
    if (!isLogin && step === 2) return handleVerifyCode();

    if (!EMAIL_REGEX.test(email)) return Alert.alert("Error", "Formato de email inválido.");

    if (!isLogin) {
      if (password.length < 8) return Alert.alert("Error", "La contraseña debe tener al menos 8 caracteres");
      if (fullName.length < 3 || username.length < 4) return Alert.alert("Error", "Revisa los campos (min: nombre 3, user 4).");
    }

    setLoading(true);
    // Iniciamos la validación de hCaptcha
    captchaRef.current?.show();
  };

  // --- EJECUCIÓN REAL CON TOKEN DE CAPTCHA ---
  const executeAuthWithCaptcha = async (captchaToken: string) => {
    try {
      if (isLogin) {
        // --- LOGIN ---
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
          options: { captchaToken } // Pasamos el token a Supabase
        });
        if (error) throw error;
        router.replace('/(tabs)/home');
      } else {
        // --- SIGNUP ---
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', username)
          .maybeSingle();

        if (existingUser) {
          setLoading(false);
          return Alert.alert("Error", "El nombre de usuario ya está en uso.");
        }

        const { data: existingEmail } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email.trim())
          .maybeSingle();

        if (existingEmail) {
          setLoading(false);
          return Alert.alert("Error", "Este correo ya está registrado. Intenta iniciar sesión.");
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: { captchaToken } // Pasamos el token a Supabase
        });

        if (error) {
          if (error.message.includes("already registered") || error.status === 422) {
            throw new Error("Este email ya tiene una cuenta.");
          }
          throw error;
        }
        setStep(2);
        setResendTimer(60); // INICIA EL CONTADOR AL REGISTRARSE
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendRecoveryCode = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      setStep(2);
      setResendTimer(60); // INICIA EL CONTADOR AL PEDIR RECUPERACIÓN
    } catch (error: any) { Alert.alert("Error", error.message); }
    finally { setLoading(false); }
  };

  const handleAppleAuth = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No se recibió token de Apple');

      const { data: sessionData, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;

      const user = sessionData.session?.user;
      if (user) {
        const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
          .filter(Boolean).join(' ');
        await supabase.from('profiles').upsert({
          id: user.id,
          email: user.email || credential.email,
          ...(fullName && { full_name: fullName }),
        }, { onConflict: 'id', ignoreDuplicates: true });
      }
    } catch (error: any) {
      if (error.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Error', error.message || 'No se pudo iniciar sesión con Apple');
      }
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      const redirectTo = 'dizgo://';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
      });
      if (error || !data.url) throw error || new Error('Error iniciando autenticación');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success') {
        const fragmentStr = result.url.includes('#')
          ? result.url.split('#')[1]
          : result.url.split('?')[1] || '';
        const params = new URLSearchParams(fragmentStr);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token') || '';
        if (!accessToken) throw new Error('No se recibió sesión de Google');

        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;

        const user = sessionData.session?.user;
        if (user) {
          await supabase.from('profiles').upsert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
          }, { onConflict: 'id', ignoreDuplicates: true });
        }
        // _layout.tsx onAuthStateChange maneja el routing automáticamente
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo iniciar sesión con Google');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: password });
      if (error) throw error;
      Alert.alert("Éxito", "Contraseña actualizada.");
      setIsResetting(false); setStep(1); setIsLogin(true);
    } catch (error: any) { Alert.alert("Error", error.message); }
    finally { setLoading(false); }
  };

  // --- REENVÍO DE CÓDIGO ACTUALIZADO ---
  const handleResendCode = async () => {
    if (resendTimer > 0) return;
    setLoading(true);
    try {
      if (isResetting) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: false },
        });
        if (error) throw error;
      }
      Alert.alert("Enviado", "Se ha enviado un nuevo código a tu correo.");
      setResendTimer(60); // REINICIA EL CONTADOR TRAS EL ENVÍO EXITOSO
    } catch (error: any) {
      if (error.status === 429) {
        Alert.alert("Demasiados intentos", "Por favor, espera 60 segundos antes de pedir otro código.");
      } else {
        Alert.alert("Error", error.message || "No se pudo reenviar el código.");
      }
    } finally {
      setLoading(false);
    }
  };

  // --- GESTO DE DESLIZAMIENTO ---
  const context = useSharedValue(0);

  const pan = Gesture.Pan()
    .onStart(() => {
      context.value = animValue.value;
    })
    .onUpdate((e) => {
      const progress = e.translationX / TAB_WIDTH;
      const newValue = context.value + progress;
      animValue.value = Math.max(0, Math.min(1, newValue));
    })
    .onEnd(() => {
      if (animValue.value > 0.5) {
        animValue.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
        runOnJS(setIsLogin)(false);
        runOnJS(resetForm)();
      } else {
        animValue.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
        runOnJS(setIsLogin)(true);
        runOnJS(resetForm)();
      }
    });

  // --- ANIMACIONES ---
  const selectorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(animValue.value, [0, 1], [0, TAB_WIDTH]) }] }));
  const animatedBarStyle = useAnimatedStyle(() => ({
    width: `${interpolate(strengthAnim.value, [0, 1, 2, 3], [0, 33, 66, 100])}%`,
    backgroundColor: interpolateColor(strengthAnim.value, [0, 1, 2, 3], ['#444', '#FF0000', '#FFFF00', '#00FF00'])
  }));

  const containerLayoutAnim = LinearTransition.duration(280).easing(Easing.out(Easing.cubic));
  const simpleFadeIn = FadeIn.duration(250);
  const simpleFadeOut = FadeOut.duration(200);

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={['rgba(255, 49, 216, 0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.05)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFill} />
      </View>

      <View style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

            <Animated.View style={styles.header} layout={containerLayoutAnim}>
              <Text style={styles.logoText}>DyzGO<Text style={{ color: COLORS.neonPink }}>.</Text></Text>
              <Text style={styles.subtitle}>
                {isResetting ? 'Recuperación' : step === 2 ? 'Verificación' : isLogin ? 'Entrar' : 'Unirse'}
              </Text>
            </Animated.View>

            {showTabs && (
              <GestureDetector gesture={pan}>
                <Animated.View style={styles.tabContainer} layout={containerLayoutAnim}>
                  <Animated.View style={[styles.selector, selectorStyle]}>
                    <LinearGradient colors={[COLORS.neonPink, COLORS.neonPink]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
                  </Animated.View>
                  <TouchableOpacity style={styles.tabButton} onPress={() => handleTabChange('login')} activeOpacity={1}>
                    <Text style={[styles.tabText, isLogin ? styles.activeText : styles.inactiveText]}>ENTRAR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.tabButton} onPress={() => handleTabChange('signup')} activeOpacity={1}>
                    <Text style={[styles.tabText, !isLogin ? styles.activeText : styles.inactiveText]}>UNIRSE</Text>
                  </TouchableOpacity>
                </Animated.View>
              </GestureDetector>
            )}

            <Animated.View style={styles.formWrapper} layout={containerLayoutAnim}>
              {!showOTP ? (
                <>
                  {showNameUser && (
                    <Animated.View entering={simpleFadeIn} exiting={simpleFadeOut}>
                      <GlassInput label="NOMBRE COMPLETO" icon={<User color={COLORS.neonPink} size={18} />} placeholder="Nombre Apellido" value={fullName} onChangeText={handleNameInput} />
                      <GlassInput label="USERNAME" icon={<AtSign color={COLORS.neonPink} size={18} />} placeholder="tu_usuario" value={username} onChangeText={handleUsernameInput} autoCapitalize="none" />
                    </Animated.View>
                  )}

                  {showEmail && (
                    <View>
                      <GlassInput label="EMAIL" icon={<Mail color={COLORS.neonPink} size={18} />} placeholder="email@ejemplo.com" value={email} onChangeText={handleEmailInput} keyboardType="email-address" autoCapitalize="none" />
                    </View>
                  )}

                  {showPasswordInput && (
                    <View style={{ marginBottom: GAP }}>
                      <Text style={styles.label}>
                        CONTRASEÑA {(!isLogin || isResetting) && <Text style={{ fontSize: 9, opacity: 0.6 }}>(MÍN. 8)</Text>}
                      </Text>
                      <View style={styles.inputContainer}>
                        <View style={styles.iconBox}><Lock color={COLORS.neonPink} size={18} /></View>
                        <TextInput placeholder="••••••••" placeholderTextColor="#666" style={styles.input} secureTextEntry={!showPassword} value={password} onChangeText={handlePasswordInput} autoCapitalize="none" />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ marginRight: 15 }}>
                          {showPassword ? <EyeOff color="#999" size={18} /> : <Eye color="#999" size={18} />}
                        </TouchableOpacity>
                      </View>
                      {(!isLogin || isResetting) && <View style={styles.strengthBarContainer}><Animated.View style={[styles.strengthBarFill, animatedBarStyle]} /></View>}

                      {showForgotLink && (
                        <Animated.View entering={simpleFadeIn} exiting={simpleFadeOut}>
                          <TouchableOpacity style={{ alignSelf: 'flex-end', marginTop: 10 }} onPress={() => { setIsResetting(true); setStep(1); }}>
                            <Text style={styles.forgotText}>¿OLVIDASTE TU CONTRASEÑA?</Text>
                          </TouchableOpacity>
                        </Animated.View>
                      )}
                    </View>
                  )}

                  {showConfirmPassword && (
                    <Animated.View entering={simpleFadeIn} exiting={simpleFadeOut}>
                      <GlassInput label="CONFIRMAR" icon={<Lock color={COLORS.neonPink} size={18} />} placeholder="••••••••" secureTextEntry={!showPassword} value={confirmPassword} onChangeText={setConfirmPassword} />
                    </Animated.View>
                  )}
                </>
              ) : (
                <Animated.View entering={simpleFadeIn} exiting={simpleFadeOut} style={{ width: '100%', alignItems: 'center' }}>
                  <Text style={styles.otpInfo}>Código enviado a{"\n"}<Text style={{ color: '#fff', fontWeight: '800' }}>{email}</Text></Text>
                  <GlassInput label="CÓDIGO" icon={<KeyRound color={COLORS.neonPink} size={20} />} placeholder="000000" value={otpCode} onChangeText={setOtpCode} keyboardType="number-pad" maxLength={6} />
                  <View style={styles.resendContainer}>
                    <TouchableOpacity onPress={() => { setStep(1); setIsResetting(false); }} style={styles.backBtn}>
                      <ArrowLeft color="#888" size={14} />
                      <Text style={styles.backBtnText}>CORREGIR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleResendCode}
                      style={[styles.backBtn, resendTimer > 0 && { opacity: 0.5 }]}
                      disabled={resendTimer > 0 || loading}
                    >
                      <RefreshCw color={resendTimer > 0 ? '#666' : COLORS.neonPink} size={14} />
                      <Text style={[styles.backBtnText, { color: resendTimer > 0 ? '#666' : COLORS.neonPink }]}>
                        {resendTimer > 0 ? `REENVIAR (${resendTimer}s)` : 'REENVIAR'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}
            </Animated.View>

            <Animated.View layout={containerLayoutAnim} style={{ width: '100%' }}>
              <TouchableOpacity style={styles.mainButton} onPress={handleMainAction} disabled={loading} activeOpacity={0.9}>
                {loading ? (
                  <ActivityIndicator color="black" />
                ) : (
                  <>
                    <Text style={styles.buttonText}>
                      {isResetting ? 'SIGUIENTE' : step === 2 ? 'VERIFICAR' : isLogin ? 'ENTRAR' : 'COMENZAR'}
                    </Text>
                    <ArrowRight color="black" size={22} />
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>

            {step === 1 && !isResetting && (
              <Animated.View layout={containerLayoutAnim} style={{ width: '100%' }}>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>o</Text>
                  <View style={styles.dividerLine} />
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity style={[styles.googleButton, { flex: 1 }]} onPress={handleGoogleAuth} disabled={loading} activeOpacity={0.85}>
                    <Svg width={20} height={20} viewBox="0 0 24 24">
                      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </Svg>
                    <Text style={styles.googleButtonText}>Google</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.googleButton, { flex: 1 }]} onPress={handleAppleAuth} disabled={loading} activeOpacity={0.85}>
                    <Ionicons name="logo-apple" size={22} color="#fff" />
                    <Text style={styles.googleButtonText}>Apple</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {isResetting && step === 1 && (
              <TouchableOpacity onPress={() => { setIsResetting(false); resetForm(); }} style={{ marginTop: 25 }}>
                <Text style={styles.backLink}>VOLVER AL LOGIN</Text>
              </TouchableOpacity>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* COMPONENTE INVISIBLE DE HCAPTCHA */}
      <ConfirmHcaptcha
        ref={captchaRef}
        siteKey="4e10b7a0-804e-4efa-89b4-5c6a29a43daa"
        baseUrl="https://dyzgo.app" // Tu dominio base o uno ficticio para React Native
        languageCode="es"
        onMessage={(event: any) => {
          if (event && event.nativeEvent.data) {
            if (['cancel', 'error', 'expired'].includes(event.nativeEvent.data)) {
              captchaRef.current?.hide();
              setLoading(false);
            } else {
              captchaRef.current?.hide();
              // ¡Pasó la prueba! Mandamos el token a Supabase
              executeAuthWithCaptcha(event.nativeEvent.data);
            }
          }
        }}
      />
    </GestureHandlerRootView>
  );
}

const GlassInput = ({ label, icon, placeholder, value, onChangeText, ...props }: any) => (
  <View style={{ marginBottom: GAP, width: '100%' }}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputContainer}>
      <View style={styles.iconBox}>{icon}</View>
      <TextInput placeholder={placeholder} placeholderTextColor="#666" style={styles.input} value={value} onChangeText={onChangeText} {...props} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: {
    padding: CONTENT_PADDING,
    justifyContent: 'center',
    flexGrow: 1,
    alignItems: 'center'
  },
  header: { alignItems: 'center', marginBottom: 40 },
  logoText: { fontSize: 54, fontWeight: '900', color: 'white', fontStyle: 'italic', letterSpacing: -3 },
  subtitle: { color: COLORS.textZinc, fontSize: 13, fontWeight: '900', letterSpacing: 0, marginTop: 5 },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 100,
    marginBottom: 30,
    padding: 5,
    height: 55,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    overflow: 'hidden'
  },
  selector: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: TAB_WIDTH,
    height: 43,
    borderRadius: 100,
    overflow: 'hidden'
  },
  tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabText: { fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  activeText: { color: 'white' },
  inactiveText: { color: '#888' },
  formWrapper: { width: '100%' },
  label: { color: 'rgba(255,255,255,0.5)', marginBottom: 8, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glassBg, borderRadius: 18, height: 60, borderWidth: 1, borderColor: COLORS.glassBorder },
  iconBox: { width: 45, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, color: 'white', fontSize: 15, fontWeight: '700' },
  strengthBarContainer: { height: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, marginTop: 10, overflow: 'hidden' },
  strengthBarFill: { height: '100%' },
  forgotText: { color: COLORS.neonPink, fontSize: 10, fontWeight: '900' },
  mainButton: {
    height: 65,
    marginTop: 20,
    borderRadius: 100,
    backgroundColor: '#fff',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    shadowColor: COLORS.neonPink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10
  },
  buttonText: { color: '#000', fontSize: 18, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5 },
  otpInfo: { color: COLORS.textZinc, marginBottom: 25, textAlign: 'center', fontSize: 14, opacity: 0.8 },
  resendContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 15 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  backBtnText: { color: '#888', fontSize: 11, fontWeight: '900' },
  backLink: { color: '#888', fontSize: 11, fontWeight: '900', textDecorationLine: 'underline' },
  divider: { flexDirection: 'row', alignItems: 'center', width: '100%', marginTop: 20, marginBottom: 16, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerText: { color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: '600' },
  googleButton: {
    height: 65,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  googleButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});