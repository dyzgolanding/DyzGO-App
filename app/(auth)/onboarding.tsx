import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
    ArrowLeft,
    ArrowRight,
    AtSign,
    Calendar,
    Camera,
    Check,
    CreditCard,
    Phone,
    X,
    Zap
} from 'lucide-react-native';
import React, { useState, useEffect } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    FadeInRight,
    FadeOutLeft,
    useAnimatedStyle,
    withTiming
} from 'react-native-reanimated';
import { COLORS } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { useOnboarding } from '../../context/OnboardingContext';

const { width } = Dimensions.get('window');

// Opciones de Configuración
const GENDERS = ['Masculino', 'Femenino', 'Prefiero no decirlo'];
const MUSIC_GENRES = ['Reggaeton', 'Techno', 'House', 'Trap', 'Pop', 'Rock', 'Indie', 'Cumbia', '80s/90s'];
const FREQUENCIES = ['Todos los findes 🔥', '1-2 veces al mes 🍹', 'Solo ocasiones especiales 🎉', 'Casi nunca 🏠'];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setNeedsOnboarding } = useOnboarding();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // --- ESTADOS DEL FORMULARIO ---
  const [username, setUsername] = useState('');
  const [needsUsername, setNeedsUsername] = useState<boolean | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [rut, setRut] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [musicPrefs, setMusicPrefs] = useState<string[]>([]);
  const [frequency, setFrequency] = useState('');
  const [avatarImage, setAvatarImage] = useState<string | null>(null);

  useEffect(() => {
    const checkUsername = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setNeedsUsername(false); return; }
        const { data } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle();
        setNeedsUsername(!data?.username);
      } catch {
        setNeedsUsername(false);
      }
    };
    checkUsername();
  }, []);

  const totalSteps = needsUsername ? 8 : 7;

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleExit = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const handleUsernameInput = (text: string) => {
    const clean = text.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    if (clean.length <= 20) setUsername(clean);
  };

  // --- VALIDADORES (Lógica Intacta) ---
  const validateRutDigit = (rut: string): boolean => {
    const clean = rut.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length < 2) return false;
    const digits = clean.slice(0, -1);
    const verifier = clean.slice(-1);
    let sum = 0;
    let multiplier = 2;
    for (let i = digits.length - 1; i >= 0; i--) {
      sum += parseInt(digits[i]) * multiplier;
      multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }
    const remainder = 11 - (sum % 11);
    const expected = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
    return verifier === expected;
  };

  const formatRut = (t: string) => {
    let val = t.replace(/[^0-9kK]/g, '');
    if (val.length > 9) val = val.slice(0, 9);
    if (val.length > 1) val = val.slice(0, -1) + '-' + val.slice(-1);
    setRut(val);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      setAvatarImage(result.assets[0].uri);
    }
  };

  const handleNext = async () => {
    const s = needsUsername ? step - 1 : step; // paso relativo al flujo original

    if (needsUsername && step === 1) {
        if (username.length < 4) return Alert.alert("Username inválido", "Mínimo 4 caracteres.");
        setLoading(true);
        try {
            const { data } = await supabase.from('profiles').select('username').eq('username', username).maybeSingle();
            if (data) return Alert.alert("En uso", "Ese username ya está tomado.");
            const { data: { user } } = await supabase.auth.getUser();
            await supabase.from('profiles').update({ username }).eq('id', user!.id);
            setStep(step + 1);
        } catch {
            Alert.alert("Error", "No se pudo verificar el username.");
        } finally {
            setLoading(false);
        }
        return;
    }

    if (s === 1) {
        const dateRegex = /^([0-2][0-9]|(3)[0-1])(\/)(((0)[0-9])|((1)[0-2]))(\/)\d{4}$/;
        if (!dateRegex.test(birthDate)) return Alert.alert("Fecha inválida", "Usa el formato DD/MM/AAAA");
        setStep(step + 1);
    }
    else if (s === 2) {
        if (rut.length < 8) return Alert.alert("RUT incompleto", "Ingresa un RUT válido.");
        if (!validateRutDigit(rut)) return Alert.alert("RUT inválido", "El RUT ingresado no existe o fue ingresado incorrectamente.");

        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data } = await supabase
                .from('profiles')
                .select('id')
                .eq('rut', rut)
                .neq('id', user?.id)
                .maybeSingle();

            if (data) {
                setLoading(false);
                return Alert.alert("RUT en uso", "Este RUT ya está asociado a otra cuenta.");
            }
            setStep(step + 1);
        } catch (e) {
            Alert.alert("Error", "No se pudo validar el RUT.");
        } finally {
            setLoading(false);
        }
    }
    else if (s === 3) {
        if (phone.length !== 8) return Alert.alert("Teléfono inválido", "Debes ingresar exactamente 8 dígitos después de +569.");

        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data } = await supabase
                .from('profiles')
                .select('id')
                .eq('phone', `+569${phone}`)
                .neq('id', user?.id)
                .maybeSingle();

            if (data) {
                setLoading(false);
                return Alert.alert("Teléfono en uso", "Este número ya está asociado a otra cuenta.");
            }
            setStep(step + 1);
        } catch (e) {
            Alert.alert("Error", "No se pudo validar el teléfono.");
        } finally {
            setLoading(false);
        }
    }
    else if (s === 4) {
        if (!gender) return Alert.alert("Selección requerida", "Por favor selecciona una opción.");
        setStep(step + 1);
    }
    else if (s === 5) {
        if (musicPrefs.length === 0) return Alert.alert("Gustos", "Selecciona al menos uno.");
        setStep(step + 1);
    }
    else if (s === 6) {
        if (!frequency) return Alert.alert("Frecuencia", "Selecciona una opción.");
        setStep(step + 1);
    }
    else {
        await saveProfile();
    }
  };

  const saveProfile = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No usuario");

      let avatarUrl = null;
      if (avatarImage) {
          const ext = avatarImage.substring(avatarImage.lastIndexOf('.') + 1);
          const fileName = `${user.id}.${ext}`;
          const formData = new FormData();
          
          formData.append('files', {
            uri: avatarImage,
            name: fileName,
            type: `image/${ext}`
          } as any);

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, formData, { upsert: true });

          if (!uploadError) {
             const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
             avatarUrl = publicUrl;
          }
      }

      const [day, month, year] = birthDate.split('/');
      const isoDate = `${year}-${month}-${day}`;

      const { error } = await supabase.from('profiles').update({
        birth_date: isoDate,
        rut: rut,
        phone: `+569${phone}`,
        gender: gender,
        music_preferences: musicPrefs,
        party_frequency: frequency,
        avatar_url: avatarUrl
      }).eq('id', user.id);

      if (error) throw error;

      // Actualizar estado en el layout ANTES de navegar para evitar el bucle de redirección
      setNeedsOnboarding(false);
      router.replace('/(tabs)/home');

    } catch (error: any) {
      Alert.alert("Error al guardar", error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- RENDERIZADORES DE PASOS (Estética Mejorada) ---

  const renderStep0_Username = () => (
    <View>
      <Text style={styles.questionTitle}>Elige tu username 🎭</Text>
      <Text style={styles.questionSub}>Solo letras, números y guión bajo. Mín. 4, máx. 20.</Text>
      <View style={styles.glassInputContainer}>
        <View style={styles.iconBox}><AtSign color={COLORS.neonPink} size={20} /></View>
        <TextInput
          style={styles.input}
          placeholder="tu_usuario"
          placeholderTextColor="#666"
          value={username}
          onChangeText={handleUsernameInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {username.length > 0 && (
        <Text style={{ color: username.length >= 4 ? COLORS.neonPink : 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '700', marginTop: 10, marginLeft: 4 }}>
          {username.length}/20 {username.length >= 4 ? '✓' : `(faltan ${4 - username.length})`}
        </Text>
      )}
    </View>
  );

  const renderStep1_BirthDate = () => (
    <View>
        <Text style={styles.questionTitle}>¿Cuándo naciste? 🎂</Text>
        <Text style={styles.questionSub}>Necesitamos verificar que eres mayor de edad.</Text>
        
        {/* Input estilo Glass igual al Login */}
        <View style={styles.glassInputContainer}>
            <View style={styles.iconBox}><Calendar color={COLORS.neonPink} size={20} /></View>
            <TextInput 
                style={styles.input} 
                placeholder="DD/MM/AAAA" 
                placeholderTextColor="#666"
                value={birthDate}
                onChangeText={(t) => {
                    let text = t.replace(/[^0-9]/g, '');
                    if (text.length > 2) text = text.slice(0, 2) + '/' + text.slice(2);
                    if (text.length > 5) text = text.slice(0, 5) + '/' + text.slice(5);
                    if (text.length > 10) text = text.slice(0, 10);
                    setBirthDate(text);
                }}
                keyboardType="numeric"
                returnKeyType="done"
                maxLength={10}
            />
        </View>
    </View>
  );

  const renderStep2_RUT = () => (
    <View>
        <Text style={styles.questionTitle}>Tu RUT chileno 🇨🇱</Text>
        <Text style={styles.questionSub}>Sin puntos, solo guion (Ej: 12345678-9).</Text>
        
        <View style={styles.glassInputContainer}>
            <View style={styles.iconBox}><CreditCard color={COLORS.neonPink} size={20} /></View>
            <TextInput 
                style={styles.input} 
                placeholder="12345678-9" 
                placeholderTextColor="#666"
                value={rut}
                onChangeText={formatRut}
                keyboardType="default" 
                autoCapitalize="characters"
                maxLength={10} 
            />
        </View>
    </View>
  );

  const renderStep3_Phone = () => (
    <View>
        <Text style={styles.questionTitle}>Tu número de celular 📱</Text>
        <Text style={styles.questionSub}>Lo usaremos para contactarte sobre tus tickets y eventos.</Text>

        <View style={styles.glassInputContainer}>
            <View style={styles.prefixBox}>
                <Phone color={COLORS.neonPink} size={16} style={{ marginBottom: 2 }} />
                <Text style={styles.prefixText}>+569</Text>
            </View>
            <View style={styles.prefixDivider} />
            <TextInput
                style={styles.input}
                placeholder="12345678"
                placeholderTextColor="#666"
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, '').slice(0, 8))}
                keyboardType="numeric"
                returnKeyType="done"
                maxLength={8}
            />
        </View>

        {phone.length > 0 && (
            <View style={styles.phonePreviewRow}>
                <Text style={styles.phonePreviewLabel}>Número completo:</Text>
                <Text style={[styles.phonePreviewValue, phone.length === 8 && { color: COLORS.neonPink }]}>
                    +569{phone}{phone.length < 8 ? '·'.repeat(8 - phone.length) : ''}
                </Text>
            </View>
        )}
    </View>
  );

  const renderStep4_Gender = () => (
    <View>
        <Text style={styles.questionTitle}>¿Cómo te identificas?</Text>
        <Text style={styles.questionSub}>Nos ayuda a personalizar tu experiencia.</Text>
        <View style={{ gap: 12, marginTop: 20 }}>
            {GENDERS.map((g) => (
                <TouchableOpacity 
                    key={g} 
                    style={[styles.glassOptionBtn, gender === g && styles.glassOptionBtnSelected]}
                    onPress={() => setGender(g)}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.optionText, gender === g && styles.optionTextSelected]}>{g}</Text>
                    {gender === g && <Check size={18} color={COLORS.neonPink} strokeWidth={3} />}
                </TouchableOpacity>
            ))}
        </View>
    </View>
  );

  const renderStep4_Music = () => (
    <View>
        <Text style={styles.questionTitle}>¿Qué música te mueve? 🎧</Text>
        <Text style={styles.questionSub}>Elige tus favoritos (puedes marcar varios).</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
            {MUSIC_GENRES.map((genre) => {
                const isSelected = musicPrefs.includes(genre);
                return (
                    <TouchableOpacity 
                        key={genre} 
                        style={[styles.glassChip, isSelected && styles.glassChipSelected]}
                        onPress={() => {
                            if (isSelected) setMusicPrefs(musicPrefs.filter(m => m !== genre));
                            else setMusicPrefs([...musicPrefs, genre]);
                        }}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{genre}</Text>
                    </TouchableOpacity>
                )
            })}
        </View>
    </View>
  );

  const renderStep5_Frequency = () => (
    <View>
        <Text style={styles.questionTitle}>¿Qué tan fiestero eres? ⚡</Text>
        <Text style={styles.questionSub}>Para recomendarte eventos con la intensidad correcta.</Text>
        <View style={{ gap: 12, marginTop: 20 }}>
            {FREQUENCIES.map((f) => (
                <TouchableOpacity 
                    key={f} 
                    style={[styles.glassOptionBtn, frequency === f && styles.glassOptionBtnSelected]}
                    onPress={() => setFrequency(f)}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.optionText, frequency === f && styles.optionTextSelected]}>{f}</Text>
                    {frequency === f && <Zap size={18} color="#FFD700" fill="#FFD700" />}
                </TouchableOpacity>
            ))}
        </View>
    </View>
  );

  const renderStep6_Avatar = () => (
    <View style={{ alignItems: 'center' }}>
        <Text style={styles.questionTitle}>Foto de perfil 📸</Text>
        <Text style={[styles.questionSub, { textAlign: 'center' }]}>¡Opcional! Puedes hacerlo más tarde.</Text>
        
        <TouchableOpacity onPress={pickImage} style={styles.avatarContainer} activeOpacity={0.8}>
            {avatarImage ? (
                <Image source={{ uri: avatarImage }} style={styles.avatarImage} />
            ) : (
                <View style={styles.avatarPlaceholder}>
                    <Camera size={40} color={COLORS.neonPink} />
                    <Text style={styles.uploadText}>Subir foto</Text>
                </View>
            )}
        </TouchableOpacity>

        {avatarImage && (
            <TouchableOpacity onPress={() => setAvatarImage(null)} style={{ marginTop: 20 }}>
                <Text style={styles.removePhotoText}>Eliminar foto</Text>
            </TouchableOpacity>
        )}
    </View>
  );

  const progressWidth = useAnimatedStyle(() => {
    return {
        width: withTiming(`${(step / totalSteps) * 100}%`, { duration: 500 })
    };
  });

  if (needsUsername === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.neonPink} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={['rgba(255, 49, 216, 0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.05)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFill} />
      </View>
      
      <View style={{ flex: 1 }}>
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
            style={{ flex: 1 }}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={{ flex: 1 }}>
                    
                    {/* HEADER PROGRESO */}
                    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
                        <View style={styles.headerRow}>
                            <TouchableOpacity onPress={step > 1 ? handleBack : handleExit} style={styles.headerBtn} activeOpacity={0.7}>
                                {step > 1 ? <ArrowLeft color="#fff" size={20} /> : <X color="#fff" size={20} />}
                            </TouchableOpacity>
                            <View style={[styles.progressBarBg, { flex: 1 }]}>
                                <Animated.View style={[styles.progressBarFill, progressWidth]}>
                                    <LinearGradient colors={[COLORS.neonPink, '#c026d3']} style={{flex:1}} start={{x:0,y:0}} end={{x:1,y:0}} />
                                </Animated.View>
                            </View>
                            <Text style={styles.stepIndicator}>PASO {step} DE {totalSteps}</Text>
                        </View>
                    </View>

                    <View style={styles.content}>
                        <Animated.View
                            key={step}
                            entering={FadeInRight.duration(400)}
                            exiting={FadeOutLeft.duration(200)}
                            style={{ width: '100%' }}
                        >
                            {needsUsername && step === 1 && renderStep0_Username()}
                            {(needsUsername ? step - 1 : step) === 1 && !(needsUsername && step === 1) && renderStep1_BirthDate()}
                            {(needsUsername ? step - 1 : step) === 2 && renderStep2_RUT()}
                            {(needsUsername ? step - 1 : step) === 3 && renderStep3_Phone()}
                            {(needsUsername ? step - 1 : step) === 4 && renderStep4_Gender()}
                            {(needsUsername ? step - 1 : step) === 5 && renderStep4_Music()}
                            {(needsUsername ? step - 1 : step) === 6 && renderStep5_Frequency()}
                            {(needsUsername ? step - 1 : step) === 7 && renderStep6_Avatar()}
                        </Animated.View>
                    </View>

                    {/* FOOTER BOTÓN */}
                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.nextButton} onPress={handleNext} disabled={loading} activeOpacity={0.9}>
                            <View style={styles.btnContent}>
                                {loading ? <ActivityIndicator color="black"/> : (
                                    <>
                                        <Text style={styles.btnText}>
                                            {step === totalSteps ? (avatarImage ? '¡LISTO! ENTRAR' : 'OMITIR Y ENTRAR') : 'SIGUIENTE'}
                                        </Text>
                                        <ArrowRight color="black" size={22} />
                                    </>
                                )}
                            </View>
                        </TouchableOpacity>
                    </View>

                </View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { padding: 24, paddingTop: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  progressBarBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 10, overflow: 'hidden' },
  stepIndicator: { color: COLORS.textZinc, fontSize: 10, fontWeight: '900', letterSpacing: 1, minWidth: 70, textAlign: 'right' },
  
  content: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  
  questionTitle: { fontSize: 32, fontWeight: '900', color: 'white', marginBottom: 10, fontStyle: 'italic', letterSpacing: -1 },
  questionSub: { fontSize: 15, color: COLORS.textZinc, marginBottom: 30, lineHeight: 22, fontWeight: '500' },
  
  // Inputs estilo Glass (Igual Login)
  glassInputContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: COLORS.glassBg, 
    borderRadius: 18, 
    height: 60, 
    borderWidth: 1, 
    borderColor: COLORS.glassBorder 
  },
  iconBox: { width: 50, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, color: 'white', fontSize: 18, fontWeight: '700', paddingRight: 20 },

  // Prefijo del teléfono
  prefixBox:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
  prefixText:    { color: 'white', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  prefixDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.15)' },

  // Preview del número completo
  phonePreviewRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, paddingHorizontal: 4 },
  phonePreviewLabel: { color: COLORS.textZinc, fontSize: 13, fontWeight: '500' },
  phonePreviewValue: { color: 'rgba(255,255,255,0.4)', fontSize: 15, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1 },
  
  // Botones de Opción (Genero, Frecuencia) estilo Glass
  glassOptionBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    backgroundColor: COLORS.glassBg, 
    padding: 20, 
    borderRadius: 18, 
    borderWidth: 1, 
    borderColor: COLORS.glassBorder 
  },
  glassOptionBtnSelected: {
    borderColor: COLORS.accentPurpleBorder,
    backgroundColor: COLORS.accentPurpleBg
  },
  optionText: { color: '#CCC', fontSize: 16, fontWeight: '500' },
  optionTextSelected: { color: 'white' },
  
  // Chips (Musica) estilo Pill
  glassChip: { 
    paddingHorizontal: 20, 
    paddingVertical: 12, 
    borderRadius: 100, // Pill shape
    backgroundColor: COLORS.glassBg, 
    borderWidth: 1, 
    borderColor: COLORS.glassBorder, 
    marginBottom: 6 
  },
  glassChipSelected: { 
    backgroundColor: COLORS.neonPink, 
    borderColor: COLORS.neonPink 
  },
  chipText: { color: '#CCC', fontSize: 13, fontWeight: '700' },
  chipTextSelected: { color: '#000' }, // Texto negro sobre rosa neón para contraste

  // Avatar
  avatarContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.glassBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.neonPink,
    borderStyle: 'dashed',
    overflow: 'hidden'
  },
  avatarPlaceholder: { alignItems: 'center', gap: 10 },
  uploadText: { color: COLORS.neonPink, fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  avatarImage: { width: '100%', height: '100%' },
  removePhotoText: { color: COLORS.neonPink, fontSize: 12, fontWeight: '900', textDecorationLine: 'underline' },

  footer: { padding: 24, paddingBottom: 30 },
  // Botón Principal estilo Login
  nextButton: { 
    height: 65, 
    borderRadius: 100, 
    backgroundColor: '#fff', 
    width: '100%', 
    justifyContent: 'center', 
    alignItems: 'center',
    shadowColor: COLORS.neonPink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10
  },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btnText: { color: '#000', fontSize: 18, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5 }
});