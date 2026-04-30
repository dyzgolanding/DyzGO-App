import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import {
  AlertCircle, Check, ChevronLeft, ChevronRight,
  Clock, Minus, Plus, Users,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import { supabase } from '../../lib/supabase';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';

const PINK = '#FF31D8';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAY_LABELS = ['D','L','M','M','J','V','S'];
const TIMES = [
  '17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30',
  '21:00','21:30','22:00','22:30','23:00','23:30','00:00','00:30',
  '01:00','01:30','02:00','02:30','03:00','03:30','04:00',
];
const REUNION_TYPES = [
  { id: 'familiar',    label: 'Familiar' },
  { id: 'cumpleanos',  label: 'Cumpleaños' },
  { id: 'laboral',     label: 'Laboral' },
  { id: 'otra',        label: 'Otra' },
];

type Step = 'datetime' | 'people' | 'form' | 'success';

// ─── Mini Calendar ────────────────────────────────────────────────────────────
function MiniCalendar({ selected, onSelect }: { selected: string; onSelect: (d: string) => void }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
  const cells: (number|null)[] = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth},(_,i)=>i+1)];

  const prevMonth = () => viewMonth === 0 ? (setViewMonth(11), setViewYear(y=>y-1)) : setViewMonth(m=>m-1);
  const nextMonth = () => viewMonth === 11 ? (setViewMonth(0), setViewYear(y=>y+1)) : setViewMonth(m=>m+1);

  return (
    <View>
      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <TouchableOpacity onPress={prevMonth} style={styles.calBtn}>
          <ChevronLeft size={16} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <Text style={{ color:'#FBFBFB', fontWeight:'800', fontSize:15 }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={nextMonth} style={styles.calBtn}>
          <ChevronRight size={16} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection:'row', marginBottom:6 }}>
        {DAY_LABELS.map((d,i) => (
          <Text key={i} style={{ flex:1, textAlign:'center', color:'rgba(255,255,255,0.3)', fontSize:11, fontWeight:'700' }}>{d}</Text>
        ))}
      </View>
      <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e-${i}`} style={{ width:'14.28%', height:44 }} />;
          const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const isSel = selected === dateStr;
          const isToday = dateStr === todayStr;
          const isPast = dateStr < todayStr;
          return (
            <TouchableOpacity key={dateStr} disabled={isPast} onPress={() => onSelect(dateStr)}
              style={{ width:'14.28%', height:44, alignItems:'center', justifyContent:'center' }}>
              <View style={{
                width:36, height:36, borderRadius:18,
                backgroundColor: isSel ? PINK : 'transparent',
                borderWidth: isToday && !isSel ? 1.5 : 0,
                borderColor: PINK,
                alignItems:'center', justifyContent:'center',
              }}>
                <Text style={{ color: isSel ? '#fff' : isPast ? 'rgba(255,255,255,0.2)' : '#FBFBFB', fontWeight: isSel||isToday?'800':'400', fontSize:13 }}>
                  {day}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Time Picker ──────────────────────────────────────────────────────────────
function TimePicker({ label, value, onChange }: { label: string; value: string; onChange: (t: string) => void }) {
  const idx = TIMES.indexOf(value);
  const atStart = idx === 0;
  const atEnd = idx === TIMES.length - 1;
  return (
    <View style={styles.timePickerWrap}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Clock size={11} color={PINK} />
        <Text style={styles.timeLabel}>{label}</Text>
      </View>
      <View style={styles.timeRow}>
        <TouchableOpacity onPress={() => !atStart && onChange(TIMES[idx - 1])} style={[styles.timeArrow, atStart && { opacity: 0.25 }]}>
          <ChevronLeft size={20} color="#FBFBFB" strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.timeValueBox}>
          <Text style={styles.timeValue}>{value}</Text>
        </View>
        <TouchableOpacity onPress={() => !atEnd && onChange(TIMES[idx + 1])} style={[styles.timeArrow, atEnd && { opacity: 0.25 }]}>
          <ChevronRight size={20} color="#FBFBFB" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Step Bar ─────────────────────────────────────────────────────────────────
function StepBar({ step }: { step: Step }) {
  const steps: Step[] = ['datetime', 'people', 'form'];
  const labels = ['Fecha & Hora', 'Personas', 'Tus Datos'];
  const idx = steps.indexOf(step);
  if (step === 'success') return null;
  return (
    <View style={{ flexDirection:'row', alignItems:'center', marginBottom:24 }}>
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <View style={{ alignItems:'center' }}>
            <View style={[styles.stepCircle, i <= idx && { backgroundColor: PINK, borderColor: PINK }]}>
              {i < idx
                ? <Check size={12} color="#fff" />
                : <Text style={{ color: i <= idx ? '#fff' : 'rgba(255,255,255,0.3)', fontSize:12, fontWeight:'800' }}>{i+1}</Text>
              }
            </View>
            <Text style={{ color: i <= idx ? PINK : 'rgba(255,255,255,0.3)', fontSize:10, fontWeight:'700', marginTop:4, textAlign:'center' }}>
              {labels[i]}
            </Text>
          </View>
          {i < steps.length - 1 && (
            <View style={{ flex:1, height:1.5, backgroundColor: i < idx ? PINK : 'rgba(255,255,255,0.1)', marginHorizontal:6, marginBottom:18 }} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ZoneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { zone, zoneName, venueId } = useLocalSearchParams<{
    zone: string; zoneName: string; zoneIsVip: string; venueId: string; venueName: string;
  }>();

  const [step, setStep] = useState<Step>('datetime');

  // Step 1
  const [selectedDate, setSelectedDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('21:00');
  const [endTime, setEndTime] = useState('00:00');

  // Step 2
  const [partySize, setPartySize] = useState(2);
  const [reunionType, setReunionType] = useState('');
  const [reunionTypeOther, setReunionTypeOther] = useState('');

  // Step 3
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');

  // Result
  const [loading, setLoading] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle();
      if (data?.full_name) setFullName(data.full_name);
      if (data?.phone) setPhone(data.phone);
    });
  }, []);

  const canAdvance = () => {
    if (step === 'datetime') return !!selectedDate;
    if (step === 'people') return partySize >= 1 && !!reunionType && (reunionType !== 'otra' || reunionTypeOther.trim().length >= 2);
    if (step === 'form') return fullName.trim().length >= 3 && age.trim().length >= 1 && phone.trim().length >= 8;
    return false;
  };

  const advance = () => {
    if (step === 'datetime') setStep('people');
    else if (step === 'people') setStep('form');
    else if (step === 'form') handleSubmit();
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { error } = await supabase.from('table_reservations').insert({
        venue_id: venueId,
        zone_id: zone,
        date: selectedDate,
        arrival_time: arrivalTime,
        end_time: endTime,
        party_size: partySize,
        guest_name: fullName.trim(),
        guest_phone: phone.trim(),
        guest_age: parseInt(age) || null,
        reunion_type: reunionType === 'otra' ? reunionTypeOther.trim() : reunionType,
        status: 'pending',
        confirmation_code: code,
      });
      if (!error) {
        setConfirmCode(code);
        setStep('success');
      }
    } finally {
      setLoading(false);
    }
  };

  const navTop = useNavBarPaddingTop();

  const handleBack = () => {
    if (step === 'datetime') router.back();
    else if (step === 'people') setStep('datetime');
    else if (step === 'form') setStep('people');
  };

  const formatDate = (d: string) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day} de ${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Background glow */}
      <LinearGradient
        colors={['rgba(255,49,216,0.12)', 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* NavBar flotante con blur */}
      {step !== 'success' && (
        <NavBar title={zoneName} onBack={handleBack} />
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            step !== 'success' ? { paddingTop: navTop } : { paddingTop: insets.top + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step !== 'success' && <StepBar step={step} />}

          {/* ── Step 1: Fecha & Hora ── */}
          {step === 'datetime' && (
            <Animated.View entering={FadeIn.duration(300)}>

              <Text style={styles.stepTitle}>¿Cuándo vendrás?</Text>
              <Text style={styles.stepHint}>Elige el día que quieres reservar tu mesa.</Text>

              <View style={styles.card}>
                <MiniCalendar selected={selectedDate} onSelect={setSelectedDate} />
              </View>

              <Text style={[styles.stepTitle, { marginTop: 24 }]}>Horario</Text>
              <Text style={styles.stepHint}>Indica desde qué hora llegarás y hasta cuándo estarás. Ej: desde las 18:00 hasta las 22:00.</Text>
              <View style={styles.card}>
                <TimePicker label="Llegada" value={arrivalTime} onChange={setArrivalTime} />
                <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 16 }} />
                <TimePicker label="Hasta" value={endTime} onChange={setEndTime} />
              </View>

              <View style={styles.warningCard}>
                <AlertCircle size={16} color="#f59e0b" />
                <Text style={[styles.warningText, { flex: 1 }]}>
                  Después de las 21:00, <Text style={{ fontWeight: '800' }}>menores solo con adulto responsable mayor de 22</Text>, cumpliendo la Ley de Alcoholes (19.925, Art. 25).
                </Text>
              </View>
            </Animated.View>
          )}

          {/* ── Step 2: Personas & Tipo ── */}
          {step === 'people' && (
            <Animated.View entering={FadeIn.duration(300)}>
              <Text style={styles.stepTitle}>¿Cuántas personas?</Text>
              <View style={[styles.card, { alignItems: 'center', paddingVertical: 32 }]}>
                <View style={styles.counterRow}>
                  <TouchableOpacity
                    onPress={() => setPartySize(p => Math.max(1, p - 1))}
                    style={[styles.counterBtn, partySize <= 1 && { opacity: 0.3 }]}
                  >
                    <Minus size={22} color="#FBFBFB" />
                  </TouchableOpacity>
                  <View style={styles.counterDisplay}>
                    <Text style={styles.counterNumber}>{partySize}</Text>
                    <Text style={styles.counterLabel}>personas</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setPartySize(p => Math.min(30, p + 1))}
                    style={[styles.counterBtn, partySize >= 30 && { opacity: 0.3 }]}
                  >
                    <Plus size={22} color="#FBFBFB" />
                  </TouchableOpacity>
                </View>
                <View style={styles.counterHint}>
                  <Users size={13} color="rgba(255,255,255,0.35)" />
                  <Text style={styles.counterHintText}>Máximo 30 personas por reserva</Text>
                </View>
              </View>

              <Text style={[styles.stepTitle, { marginTop: 24 }]}>Tipo de reunión</Text>
              <View style={styles.typeGrid}>
                {REUNION_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.typeChip, reunionType === t.id && { backgroundColor: `${PINK}22`, borderColor: PINK }]}
                    onPress={() => setReunionType(t.id)}
                  >
                    {reunionType === t.id && <Check size={13} color={PINK} />}
                    <Text style={[styles.typeChipText, reunionType === t.id && { color: PINK }]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {reunionType === 'otra' && (
                <View style={[styles.card, { marginTop: 14 }]}>
                  <Text style={styles.inputLabel}>¿Cuál es la ocasión?</Text>
                  <TextInput
                    style={[styles.input, { marginTop: 6 }]}
                    placeholder="Ej: Aniversario, graduación..."
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    value={reunionTypeOther}
                    onChangeText={setReunionTypeOther}
                    autoCapitalize="sentences"
                    autoFocus
                  />
                </View>
              )}

              <View style={[styles.warningCard, { borderColor: `${PINK}30`, backgroundColor: `${PINK}08` }]}>
                <AlertCircle size={16} color={PINK} />
                <Text style={[styles.warningText, { flex: 1 }]}>
                  <Text style={{ fontWeight: '800' }}>Puntualidad, por favor.</Text> Agradeceríamos que pudieras respetar el horario acordado para asegurar tu espacio.
                </Text>
              </View>

              <View style={styles.warningCard}>
                <AlertCircle size={16} color="#f59e0b" />
                <Text style={[styles.warningText, { flex: 1 }]}>
                  <Text style={{ fontWeight: '800' }}>¿Cambia el número de invitados?</Text> Sin problema, solo avísanos con anticipación para organizarnos mejor y asegurar tu espacio.
                </Text>
              </View>
            </Animated.View>
          )}

          {/* ── Step 3: Tus Datos ── */}
          {step === 'form' && (
            <Animated.View entering={FadeIn.duration(300)}>
              <Text style={styles.stepTitle}>Tus datos</Text>

              <View style={styles.card}>
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>Nombre y Apellido</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ej: Juan Pérez"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                  />
                </View>
                <View style={styles.inputDivider} />
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={[styles.inputWrap, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Edad</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Ej: 25"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      value={age}
                      onChangeText={setAge}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </View>
                  <View style={[styles.inputWrap, { flex: 2 }]}>
                    <Text style={styles.inputLabel}>Teléfono</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="+56 9 XXXX XXXX"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>
              </View>

              {/* Warnings */}
              <View style={styles.warningCard}>
                <AlertCircle size={16} color="#f59e0b" />
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.warningText}>
                    Por normativas del club, <Text style={{ fontWeight: '800' }}>traer carnet físico</Text>. Quien presente identidad falsa o editada tendrá prohibido el ingreso.
                  </Text>
                  <Text style={styles.warningText}>
                    No vendemos <Text style={{ fontWeight: '800' }}>alcohol a menores de edad</Text>.
                  </Text>
                </View>
              </View>

              <View style={[styles.warningCard, { borderColor: `${PINK}30`, backgroundColor: `${PINK}08` }]}>
                <AlertCircle size={16} color={PINK} />
                <Text style={[styles.warningText, { flex: 1 }]}>
                  <Text style={{ fontWeight: '800' }}>Te esperamos 15 minutos</Text> después de tu hora de llegada. Pasado ese tiempo liberaremos la reserva.
                </Text>
              </View>
            </Animated.View>
          )}

          {/* ── Success ── */}
          {step === 'success' && (
            <Animated.View entering={FadeInDown.duration(400)} style={{ paddingBottom: insets.bottom + 32 }}>
              {/* Check */}
              <View style={styles.successCheck}>
                <LinearGradient colors={[`${PINK}30`, `${PINK}08`]} style={StyleSheet.absoluteFill} />
                <Check size={44} color={PINK} strokeWidth={3} />
              </View>
              <Text style={styles.successTitle}>¡Reserva confirmada!</Text>
              <Text style={styles.successSub}>Tu reserva está en camino, pronto te confirmaremos por WhatsApp.</Text>

              {/* Code */}
              <View style={styles.codeCard}>
                <Text style={styles.codeLabel}>Código de reserva</Text>
                <Text style={styles.codeValue}>{confirmCode}</Text>
              </View>

              {/* Summary */}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Tu reserva</Text>
                {[
                  ['Zona', zoneName],
                  ['Fecha', formatDate(selectedDate)],
                  ['Horario', `${arrivalTime} → ${endTime}`],
                  ['Personas', `${partySize}`],
                  ['Tipo', REUNION_TYPES.find(r => r.id === reunionType)?.label ?? ''],
                  ['A nombre de', fullName],
                ].map(([k, v]) => (
                  <View key={k} style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>{k}</Text>
                    <Text style={styles.summaryVal}>{v}</Text>
                  </View>
                ))}
              </View>

              {/* Rules */}
              <View style={styles.rulesCard}>
                <Text style={styles.rulesTitle}>Recuerda</Text>
                {[
                  { icon: '⏰', text: 'Te esperamos 15 minutos después de tu hora de llegada. Pasado ese tiempo, liberaremos la reserva.' },
                  { icon: '🪪', text: 'Trae tu carnet físico y recuérdaselo a tus invitados. Es obligatorio, especialmente pasadas las 21:00.' },
                  { icon: '👶', text: 'Después de las 21:00, menores de edad solo pueden ingresar acompañados de un adulto mayor de 22 años (Ley 19.925, Art. 25).' },
                  { icon: '👥', text: 'Si necesitas cambiar el número de personas, avísanos con anticipación para organizarnos mejor.' },
                  { icon: '🍾', text: 'No vendemos alcohol a menores de edad.' },
                ].map((r, i) => (
                  <View key={i} style={styles.ruleRow}>
                    <Text style={styles.ruleIcon}>{r.icon}</Text>
                    <Text style={styles.ruleText}>{r.text}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.seeYou}>🔥 ¡Nos vemos pronto!</Text>

              <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
                <Text style={styles.doneBtnText}>Volver al inicio</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>

        {/* Bottom CTA */}
        {step !== 'success' && (
          <Animated.View
            entering={FadeInUp.duration(300)}
            style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}
          >
            <TouchableOpacity
              style={[styles.ctaBtn, !canAdvance() && { opacity: 0.4 }]}
              disabled={!canAdvance() || loading}
              onPress={advance}
            >
              <LinearGradient
                colors={[PINK, '#c020aa']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.ctaBtnText}>
                {loading ? 'Confirmando...' : step === 'form' ? 'Confirmar reserva' : 'Continuar'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030303' },
  scroll: { paddingHorizontal: 16, paddingBottom: 120 },
  stepTitle: { color: '#FBFBFB', fontSize: 18, fontWeight: '900', marginBottom: 12 },
  card: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 18 },

  // Calendar
  calBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },

  // Time picker
  timePickerWrap: { gap: 10 },
  timeLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeArrow: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  timeValueBox: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,49,216,0.1)', borderWidth: 1.5, borderColor: 'rgba(255,49,216,0.3)', paddingVertical: 12, borderRadius: 16 },
  timeValue: { color: '#FBFBFB', fontSize: 28, fontWeight: '900', letterSpacing: 1 },

  // Step bar
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },

  // Counter
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 28 },
  counterBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  counterDisplay: { alignItems: 'center' },
  counterNumber: { color: '#FBFBFB', fontSize: 64, fontWeight: '900', lineHeight: 70 },
  counterLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' },
  counterHint: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 16 },
  counterHintText: { color: 'rgba(255,255,255,0.3)', fontSize: 11 },

  // Type chips
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
  typeChipText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '700' },

  // Form
  inputWrap: { gap: 6 },
  inputLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  input: { color: '#FBFBFB', fontSize: 15, fontWeight: '600', paddingVertical: 8 },
  inputDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 12 },
  warningCard: { flexDirection: 'row', gap: 12, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 16, padding: 14, marginTop: 12, alignItems: 'flex-start' },
  warningText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 18 },

  // Bottom CTA
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(3,3,3,0.95)', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  ctaBtn: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },

  // Success
  successCheck: { width: 100, height: 100, borderRadius: 50, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 20, overflow: 'hidden', borderWidth: 2, borderColor: `${PINK}40` },
  successTitle: { color: '#FBFBFB', fontSize: 28, fontWeight: '900', fontStyle: 'italic', textAlign: 'center', marginBottom: 8 },
  successSub: { color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 28, paddingHorizontal: 16 },
  codeCard: { backgroundColor: `${PINK}12`, borderWidth: 1.5, borderColor: `${PINK}40`, borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 16 },
  codeLabel: { color: PINK, fontSize: 11, fontWeight: '900', letterSpacing: 2, marginBottom: 8 },
  codeValue: { color: '#FBFBFB', fontSize: 36, fontWeight: '900', letterSpacing: 6 },
  summaryCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 20, padding: 18, marginBottom: 12, gap: 10 },
  summaryTitle: { color: '#FBFBFB', fontSize: 14, fontWeight: '900', marginBottom: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryKey: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600' },
  summaryVal: { color: '#FBFBFB', fontSize: 13, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
  rulesCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 20, padding: 18, marginBottom: 24, gap: 14 },
  rulesTitle: { color: '#FBFBFB', fontSize: 14, fontWeight: '900', marginBottom: 4 },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  ruleIcon: { fontSize: 16, lineHeight: 22 },
  ruleText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 18, flex: 1 },
  seeYou: { color: '#FBFBFB', fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 24 },
  doneBtn: { height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '800' },
  summaryChip: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 12, gap: 5 },
  summaryChipLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  summaryChipValue: { color: '#FBFBFB', fontSize: 13, fontWeight: '700' },
  stepHint: { color: 'rgba(255,255,255,0.4)', fontSize: 12, lineHeight: 18, marginBottom: 14, marginTop: -4 },
});
