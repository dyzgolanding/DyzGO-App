import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import {
    ArrowLeft,
    ArrowRight,
    AtSign,
    Camera,
    CheckCircle2,
    CreditCard,
    Phone,
    X,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import React, { useState, useEffect } from 'react';
import * as ExpoLinking from 'expo-linking';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    FadeIn,
    FadeOutLeft,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
    Easing,
    interpolate,
} from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { useOnboarding } from '../../context/OnboardingContext';

const { width, height } = Dimensions.get('window');
const S = Math.min(height / 932, 1);


// Opciones de Configuración
const GENDERS = ['Masculino', 'Femenino', 'Prefiero no decirlo'];
const MUSIC_GENRES = ['Reggaeton', 'Techno', 'House', 'Trap', 'Pop', 'Rock', 'Indie', 'Cumbia', '80s/90s'];
const FREQUENCIES = ['Todos los findes 🔥', '1-2 veces al mes 🍹', 'Solo ocasiones especiales 🎉', 'Casi nunca 🏠'];

// Metadata visual por paso
const STEP_META: Record<number, { title: string; sub: string }> = {
  0: { title: 'Elige tu username', sub: 'Solo letras, números y guión bajo. Mín. 4, máx. 20.' },
  1: { title: '¿Cuándo naciste?', sub: 'Queremos prepararte la mejor experiencia para ti.' },
  2: { title: 'Ingresa tu RUT', sub: 'Sin puntos, solo guion (Ej: 12345678-9).' },
  3: { title: 'Tu número de celular', sub: 'Lo usaremos para contactarte sobre tus tickets y eventos.' },
  4: { title: '¿Cómo te identificas?', sub: 'Nos ayuda a personalizar tu experiencia.' },
  5: { title: 'Cuéntanos sobre tus gustos', sub: 'Elige tus favoritos (puedes marcar varios).' },
  6: { title: '¿Con qué frecuencia sales?', sub: 'Para recomendarte eventos con la intensidad correcta.' },
  7: { title: 'Selecciona tu foto de perfil', sub: '¡Opcional! Puedes hacerlo más tarde.' },
};

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setNeedsOnboarding } = useOnboarding();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // --- ESTADOS DEL FORMULARIO ---
  const [username, setUsername] = useState('');
  const [needsUsername, setNeedsUsername] = useState<boolean | null>(null);
  const defaultDob = new Date(new Date().getFullYear() - 22, 5, 15);
  const [dobDate, setDobDate] = useState(defaultDob);
  const [birthDate, setBirthDate] = useState(() => {
    const d = String(defaultDob.getDate()).padStart(2, '0');
    const m = String(defaultDob.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${defaultDob.getFullYear()}`;
  });
  const [rut, setRut] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [musicPrefs, setMusicPrefs] = useState<string[]>([]);
  const [frequency, setFrequency] = useState('');
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [dataConsent, setDataConsent] = useState(false);



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
        if (!dataConsent) return Alert.alert('Consentimiento requerido', 'Debes aceptar el uso de tus datos para continuar.');
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
        if (phone.length !== 9) return Alert.alert("Teléfono inválido", "Debes ingresar exactamente 9 dígitos después de +56.");

        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data } = await supabase
                .from('profiles')
                .select('id')
                .eq('phone', `+56${phone}`)
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
        phone: `+56${phone}`,
        gender: gender,
        music_preferences: musicPrefs,
        party_frequency: frequency,
        avatar_url: avatarUrl,
        instagram_username: null
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

  // --- Computed step metadata ---
  const currentLogicalStep = needsUsername ? step - 1 : step;
  const metaKey = needsUsername && step === 1 ? 0 : currentLogicalStep;
  const meta = STEP_META[metaKey] || STEP_META[1];
  const isLastStep = step === totalSteps;
  const isAvatarStep = (needsUsername ? step - 1 : step) === 7;

  // --- RENDERIZADORES DE PASOS ---

  const renderStep0_Username = () => (
    <View>
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
        <View style={styles.validationRow}>
          <View style={[styles.validationDot, { backgroundColor: username.length >= 4 ? COLORS.neonPink : 'rgba(255,255,255,0.15)' }]} />
          <Text style={{ color: username.length >= 4 ? COLORS.neonPink : 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '700' }}>
            {username.length}/20 {username.length >= 4 ? '✓' : `(faltan ${4 - username.length})`}
          </Text>
        </View>
      )}
    </View>
  );

  const renderStep1_BirthDate = () => (
    <View style={{ gap: 16 }}>
      <View style={pickerStyles.outer}>
        <DateTimePicker
          value={dobDate}
          mode="date"
          display="spinner"
          locale="es-CL"
          maximumDate={new Date()}
          minimumDate={new Date(1920, 0, 1)}
          textColor="#FBFBFB"
          onChange={(_, selected) => {
            if (!selected) return;
            setDobDate(selected);
            const d = String(selected.getDate()).padStart(2, '0');
            const m = String(selected.getMonth() + 1).padStart(2, '0');
            setBirthDate(`${d}/${m}/${selected.getFullYear()}`);
          }}
          style={{ width: '100%' }}
        />
      </View>

      {/* Consentimiento de datos */}
      <TouchableOpacity
        style={pickerStyles.consentRow}
        onPress={() => setDataConsent(v => !v)}
        activeOpacity={0.8}
      >
        <View style={[pickerStyles.checkbox, dataConsent && pickerStyles.checkboxActive]}>
          {dataConsent && <CheckCircle2 color="#fff" size={14} />}
        </View>
        <Text style={pickerStyles.consentText}>
          Acepto que DyzGO use mis datos personales (fecha de nacimiento, RUT, teléfono y género) para mejorar mi experiencia en la app y facilitar la compra de entradas, de acuerdo con la{' '}
          <Text style={pickerStyles.consentLink} onPress={() => ExpoLinking.openURL('https://dyzgo.com/privacy')}>
            Política de Privacidad
          </Text>
          .
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderStep2_RUT = () => (
    <View>
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
      <View style={styles.glassInputContainer}>
        <View style={styles.prefixBox}>
          <Phone color={COLORS.neonPink} size={16} />
          <Text style={styles.prefixText}>+56</Text>
        </View>
        <View style={styles.prefixDivider} />
        <TextInput
          style={[styles.input, { paddingLeft: 12 }]}
          placeholderTextColor="#666"
          value={phone}
          onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, '').slice(0, 9))}
          keyboardType="numeric"
          returnKeyType="done"
          maxLength={9}
        />
      </View>
    </View>
  );

  const renderStep4_Gender = () => (
    <View style={{ gap: 12 }}>
      {GENDERS.map((g) => {
        const selected = gender === g;
        return (
          <TouchableOpacity 
            key={g} 
            style={[styles.reasonItem, selected && styles.reasonActive]}
            onPress={() => setGender(g)}
            activeOpacity={0.8}
          >
            <Text style={[styles.reasonText, selected && { color: '#FBFBFB', fontWeight: '800' }]}>{g}</Text>
            {selected && <CheckCircle2 color={COLORS.neonPink} size={18} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderChip = (genre: string) => {
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
    );
  };

  const renderStep5_Music = () => (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
        {MUSIC_GENRES.slice(0, 4).map(renderChip)}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
        {MUSIC_GENRES.slice(4, 7).map(renderChip)}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
        {MUSIC_GENRES.slice(7, 9).map(renderChip)}
      </View>
    </View>
  );

  const renderStep6_Frequency = () => (
    <View style={{ gap: 12 }}>
      {FREQUENCIES.map((f) => {
        const selected = frequency === f;
        return (
          <TouchableOpacity 
            key={f} 
            style={[styles.reasonItem, selected && styles.reasonActive]}
            onPress={() => setFrequency(f)}
            activeOpacity={0.8}
          >
            <Text style={[styles.reasonText, selected && { color: '#FBFBFB', fontWeight: '800' }]}>{f}</Text>
            {selected && <CheckCircle2 color={COLORS.neonPink} size={18} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderStep7_Avatar = () => (
    <View style={{ alignItems: 'center' }}>
      <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
        <View style={styles.avatarCircle}>
          {avatarImage ? (
            <Image source={{ uri: avatarImage }} style={styles.avatarImage} contentFit="cover" transition={150} cachePolicy="memory-disk" />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Camera size={36} color="#FBFBFB" />
              <Text style={styles.uploadText}>SUBIR</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {avatarImage && (
        <TouchableOpacity onPress={() => setAvatarImage(null)} style={{ marginTop: 16 }}>
          <Text style={styles.removePhotoText}>Eliminar foto</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // --- Progress Dots ---
  const renderDots = () => (
    <View style={styles.dotsContainer}>
      {Array.from({ length: totalSteps }, (_, i) => {
        const isActive = i + 1 === step;
        const isPast = i + 1 < step;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              isPast && styles.dotPast,
              isActive && styles.dotActive,
            ]}
          />
        );
      })}
    </View>
  );

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
          keyboardVerticalOffset={0}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={{ flex: 1, minHeight: '100%' }}>
               
                {/* HEADER */}
                <View style={[styles.header, { paddingTop: insets.top + Math.round(10 * S) }]}>
                  <View style={styles.headerRow}>
                    <TouchableOpacity onPress={step > 1 ? handleBack : handleExit} style={styles.headerBtn} activeOpacity={0.7}>
                      {step > 1 ? <ArrowLeft color="#fff" size={20} /> : <X color="#fff" size={20} />}
                    </TouchableOpacity>
                    {renderDots()}
                    <Text style={styles.stepLabel}>{step}/{totalSteps}</Text>
                  </View>
                </View>

                {/* CONTENT */}
                <View style={styles.content}>
                  <Animated.View
                    key={step}
                    entering={FadeIn.duration(250)}
                    exiting={FadeOutLeft.duration(200)}
                    style={{ width: '100%' }}
                  >
                    {/* Título */}
                    <Text style={styles.questionTitle}>{meta.title}</Text>
                    <Text style={styles.questionSub}>{meta.sub}</Text>

                    {/* Step Content */}
                    {needsUsername && step === 1 && renderStep0_Username()}
                    {(needsUsername ? step - 1 : step) === 1 && !(needsUsername && step === 1) && renderStep1_BirthDate()}
                    {(needsUsername ? step - 1 : step) === 2 && renderStep2_RUT()}
                    {(needsUsername ? step - 1 : step) === 3 && renderStep3_Phone()}
                    {(needsUsername ? step - 1 : step) === 4 && renderStep4_Gender()}
                    {(needsUsername ? step - 1 : step) === 5 && renderStep5_Music()}
                    {(needsUsername ? step - 1 : step) === 6 && renderStep6_Frequency()}
                    {(needsUsername ? step - 1 : step) === 7 && renderStep7_Avatar()}
                  </Animated.View>
                </View>

                {/* FOOTER */}
                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) + Math.round(10 * S) }]}>
                  <TouchableOpacity style={styles.nextButton} onPress={handleNext} disabled={loading} activeOpacity={0.9}>
                    <View style={styles.btnContent}>
                      {loading ? <ActivityIndicator color="black"/> : (
                        <>
                          <Text style={styles.btnText}>
                            {isLastStep ? (avatarImage ? '¡LISTO! ENTRAR' : 'OMITIR Y ENTRAR') : 'SIGUIENTE'}
                          </Text>
                          <ArrowRight color="black" size={22} />
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                </View>

              </View>
            </TouchableWithoutFeedback>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Header
  header: { paddingHorizontal: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: {
    width: Math.round(38 * S),
    height: Math.round(38 * S),
    borderRadius: Math.round(19 * S),
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  stepLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Progress Dots
  dotsContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Math.round(8 * S),
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dotPast: {
    backgroundColor: 'rgba(255, 49, 216, 0.4)',
  },
  dotActive: {
    width: 28,
    borderRadius: 14,
    backgroundColor: COLORS.neonPink,
    shadowColor: COLORS.neonPink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6,
  },

  // Content
  content: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  contentScroll: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' },
  
  questionTitle: {
    fontSize: Math.round(30 * S),
    fontWeight: '900',
    color: '#FBFBFB',
    marginBottom: 8,
    fontStyle: 'italic',
    letterSpacing: -1,
    textAlign: 'center',
    paddingRight: 1,
  },
  questionSub: {
    fontSize: 14,
    color: COLORS.textZinc,
    marginBottom: Math.round(24 * S),
    lineHeight: 21,
    fontWeight: '500',
    textAlign: 'center',
  },
  
  // Inputs Glass
  glassInputContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: COLORS.glassBg, 
    borderRadius: 18, 
    height: Math.round(60 * S), 
    borderWidth: 1, 
    borderColor: COLORS.glassBorder,
  },
  iconBox: { width: 50, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, color: 'white', fontSize: 17, fontWeight: '700', paddingRight: 20 },

  // Validation
  validationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  validationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Phone prefix
  prefixBox:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
  prefixText:    { color: 'white', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  prefixDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.15)' },
  phonePreviewRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, paddingHorizontal: 4 },
  phonePreviewLabel: { color: COLORS.textZinc, fontSize: 13, fontWeight: '500' },
  phonePreviewValue: { color: 'rgba(255,255,255,0.4)', fontSize: 15, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1 },
  
  // Option items (Gender, Frequency) — identical to delete-account
  reasonItem: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: Math.round(16 * S), 
    backgroundColor: COLORS.glassBg, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: COLORS.glassBorder,
  },
  reasonActive: { 
    backgroundColor: 'rgba(255,49,216,0.12)', 
    borderColor: 'rgba(255,49,216,0.35)',
  },
  reasonText: { color: 'rgba(251,251,251,0.45)', fontSize: 14, fontWeight: '600' },
  
  // Chips (Music) - same visual as reasonItem but pill size
  glassChip: { 
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Math.round(16 * S), 
    paddingVertical: Math.round(11 * S), 
    borderRadius: 20,
    backgroundColor: COLORS.glassBg, 
    borderWidth: 1, 
    borderColor: COLORS.glassBorder, 
  },
  glassChipSelected: { 
    backgroundColor: 'rgba(255,49,216,0.12)',
    borderColor: 'rgba(255,49,216,0.35)',
  },
  chipText: { color: 'rgba(251,251,251,0.45)', fontSize: 13, fontWeight: '600' },
  chipTextSelected: { color: '#FBFBFB', fontWeight: '800' },

  // Avatar
  avatarCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    borderColor: COLORS.neonPink,
    backgroundColor: 'rgba(255, 49, 216, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarPlaceholder: { alignItems: 'center', gap: 8 },
  uploadText: { color: '#FBFBFB', fontWeight: '900', fontSize: 11, letterSpacing: 2 },
  avatarImage: { width: '100%', height: '100%' },
  removePhotoText: { color: COLORS.neonPink, fontSize: 12, fontWeight: '800' },

  // Footer
  footer: { paddingHorizontal: 24, paddingBottom: Math.round(24 * S) },
  footerHint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: 0.5,
  },
  nextButton: { 
    height: Math.round(65 * S), 
    borderRadius: 100, 
    backgroundColor: '#fff', 
    width: '100%', 
    justifyContent: 'center', 
    alignItems: 'center',
    shadowColor: COLORS.neonPink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btnText: { color: '#000', fontSize: Math.round(18 * S), fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5 },
});

const pickerStyles = StyleSheet.create({
  outer: {
    backgroundColor: COLORS.glassBg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    overflow: 'hidden',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: COLORS.glassBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 14,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxActive: {
    backgroundColor: COLORS.neonPink,
    borderColor: COLORS.neonPink,
  },
  consentText: {
    flex: 1,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  consentLink: {
    color: COLORS.neonPink,
    fontWeight: '700',
  },
});