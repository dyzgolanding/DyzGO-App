import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Crown, Gift, Lock, QrCode, Star, Ticket, Trophy, X, Zap } from 'lucide-react-native';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
// insets se usa solo para el paddingBottom del scroll
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');
const CARD_SIZE = (width - 20 * 2 - 12) / 2;

const REWARDS: Record<number, { prize: string; info: string; icon: React.ComponentType<{ color: string; size: number }> }> = {
  1:  { prize: 'Shot de Bienvenida',  info: 'Canjeable en barra.',         icon: Zap },
  2:  { prize: '2x1 Cervezas',        info: 'Marcas nacionales.',           icon: Gift },
  3:  { prize: 'Entrada Gratis',      info: 'Cualquier evento.',            icon: Ticket },
  4:  { prize: 'Coctel Premium',      info: 'Carta seleccionada.',          icon: Star },
  5:  { prize: 'Fast Pass VIP',       info: 'Sin filas.',                   icon: Zap },
  6:  { prize: 'Reserva de Mesa',     info: 'Ubicacion preferencial.',      icon: Crown },
  7:  { prize: 'Botella de Pisco',    info: 'Para tu grupo.',               icon: Gift },
  8:  { prize: 'Backstage Pass',      info: 'Acceso total.',                icon: Star },
  9:  { prize: 'Mesa VIP Gold',       info: 'Servicio incluido.',           icon: Crown },
  10: { prize: 'God Mode',            info: 'Entradas gratis x 1 anio.',   icon: Trophy },
};

const LEVELS = [
  { level: 1,  min: 0,      label: 'Novato',    color: '#8A2BE2' },
  { level: 2,  min: 1000,   label: 'Iniciado',  color: '#9D50BB' },
  { level: 3,  min: 3500,   label: 'Avanzado',  color: '#4776E6' },
  { level: 4,  min: 8000,   label: 'Constante', color: '#00B4DB' },
  { level: 5,  min: 15000,  label: 'Elite',     color: '#56ab2f' },
  { level: 6,  min: 25000,  label: 'Experto',   color: '#f7971e' },
  { level: 7,  min: 40000,  label: 'Maestro',   color: '#eb3349' },
  { level: 8,  min: 65000,  label: 'Leyenda',   color: '#FF512F' },
  { level: 9,  min: 100000, label: 'Mitico',    color: '#1A2980' },
  { level: 10, min: 150000, label: 'Inmortal',  color: '#FFD700' },
];

// --- BARRA ANIMADA ---
function ProgressBar({ progress, color }: { progress: number; color: string }) {
  const w = useSharedValue(0);
  useEffect(() => { w.value = withDelay(300, withTiming(progress, { duration: 1400 })); }, [progress]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` as `${number}%` }));
  return (
    <View style={bar.track}>
      <Animated.View style={[bar.fill, style, { backgroundColor: color, shadowColor: color }]} />
    </View>
  );
}
const bar = StyleSheet.create({
  track: { height: 6, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden', marginVertical: 12 },
  fill:  { height: '100%', borderRadius: 3, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6 },
});

// --- TARJETA DE MEDALLA ---
interface MedalProps { data: typeof LEVELS[0]; isUnlocked: boolean; onPress: () => void }
function MedalCard({ data, isUnlocked, onPress }: MedalProps) {
  const scale = useSharedValue(1);
  const RewardIcon = REWARDS[data.level].icon;
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    if (!isUnlocked) return;
    scale.value = withSpring(0.93, {}, () => { scale.value = withSpring(1); });
    onPress();
  };

  return (
    <Animated.View style={[animStyle, { width: CARD_SIZE }]}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={isUnlocked ? 0.85 : 1}
        style={[
          ms.card,
          isUnlocked
            ? { borderColor: data.color + '50', backgroundColor: data.color + '0D' }
            : ms.locked,
        ]}
      >
        {isUnlocked && (
          <LinearGradient
            colors={[data.color + '18', 'transparent']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
          />
        )}
        <View style={[ms.badge, { backgroundColor: isUnlocked ? data.color + '25' : 'rgba(255,255,255,0.04)' }]}>
          <Text style={[ms.badgeText, { color: isUnlocked ? data.color : '#444' }]}>{data.level}</Text>
        </View>
        <View style={[ms.iconWrap, isUnlocked
          ? { borderColor: data.color + '60', backgroundColor: data.color + '18' }
          : { borderColor: '#2a2a2a', backgroundColor: 'rgba(0,0,0,0.2)' }
        ]}>
          {isUnlocked ? <RewardIcon color={data.color} size={22} /> : <Lock color="#3a3a3a" size={20} />}
        </View>
        <Text style={[ms.label, !isUnlocked && { color: '#3a3a3a' }]} numberOfLines={1}>
          {data.label.toUpperCase()}
        </Text>
        <Text style={[ms.prize, !isUnlocked && { color: '#2a2a2a' }]} numberOfLines={1}>
          {isUnlocked ? REWARDS[data.level].prize : '???'}
        </Text>
        {isUnlocked && (
          <View style={[ms.dot, { backgroundColor: data.color, shadowColor: data.color }]} />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}
const ms = StyleSheet.create({
  card:      { height: CARD_SIZE * 1.1, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 12, overflow: 'hidden', gap: 6 },
  locked:    { borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.01)' },
  badge:     { position: 'absolute', top: 10, left: 10, width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  badgeText: { fontSize: 10, fontWeight: '900' },
  iconWrap:  { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  label:     { color: 'white', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 2 },
  prize:     { color: COLORS.textSecondary, fontSize: 10, fontWeight: '500', textAlign: 'center' },
  dot:       { position: 'absolute', top: 10, right: 10, width: 7, height: 7, borderRadius: 4, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 6 },
});

// --- PANTALLA PRINCIPAL ---
export default function AchievementsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const navTop = useNavBarPaddingTop();
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(1);
  const [modal, setModal] = useState<number | null>(null);

  useEffect(() => { fetchProgress(); }, []);

  const fetchProgress = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('xp, level').eq('id', user.id).single();
      if (data) { setXp(data.xp ?? 0); setLevel(data.level ?? 1); }
    } catch (e) {
      console.error('[achievements] fetchProgress:', e);
    }
  };

  const currentLevel = LEVELS.find(l => l.level === level) ?? LEVELS[0];
  const nextLevel    = LEVELS.find(l => l.level === level + 1);
  const progress     = nextLevel
    ? Math.min(1, (xp - currentLevel.min) / (nextLevel.min - currentLevel.min))
    : 1;
  const xpLeft       = nextLevel ? nextLevel.min - xp : 0;
  const modalLevel   = LEVELS[(modal ?? 1) - 1] ?? LEVELS[0];
  const ModalIcon    = REWARDS[modal ?? 1]?.icon ?? Trophy;

  const BG = ['#030303'] as const;

  return (
    <View style={{ flex: 1, backgroundColor: '#030303' }}>
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

      <NavBar title="LOGROS" onBack={() => router.back()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingTop: navTop, paddingBottom: insets.bottom + 40 }]}
      >
        {/* HERO CARD */}
        <View style={[s.heroCard, { borderColor: currentLevel.color + '40' }]}>
          <LinearGradient
            colors={[currentLevel.color + '20', currentLevel.color + '08', 'transparent']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
          />
          <View style={s.heroTop}>
            {/* Orb de nivel */}
            <View style={[s.orb, { borderColor: currentLevel.color, shadowColor: currentLevel.color }]}>
              <LinearGradient colors={[currentLevel.color + '30', 'transparent']} style={StyleSheet.absoluteFill} />
              <Text style={[s.orbLvLabel, { color: currentLevel.color }]}>LVL</Text>
              <Text style={s.orbNum}>{level}</Text>
            </View>
            {/* Info de rango */}
            <View style={s.heroInfo}>
              <Text style={[s.rankLabel, { color: currentLevel.color }]}>RANGO ACTUAL</Text>
              <Text style={s.rankName}>{currentLevel.label.toUpperCase()}</Text>
              <View style={[s.xpChip, { backgroundColor: currentLevel.color + '20', borderColor: currentLevel.color + '40' }]}>
                <Star color={currentLevel.color} size={11} />
                <Text style={[s.xpChipText, { color: currentLevel.color }]}>{xp.toLocaleString()} XP</Text>
              </View>
            </View>
          </View>
          <ProgressBar progress={progress} color={currentLevel.color} />
          <View style={s.progressFooter}>
            <Text style={s.progressLabel}>Progreso al siguiente</Text>
            <Text style={[s.progressValue, { color: currentLevel.color }]}>
              {level >= 10 ? 'NIVEL MAXIMO' : `${xpLeft.toLocaleString()} XP restantes`}
            </Text>
          </View>
        </View>

        {/* COMO GANAR XP */}
        <Text style={s.sectionTitle}>COMO GANAR XP</Text>
        <View style={s.xpRow}>
          {([
            { Icon: Ticket, label: 'Comprar entrada',   value: '+50 XP' },
            { Icon: QrCode, label: 'Asistir al evento', value: '+100 XP' },
            { Icon: Trophy, label: 'Subir de nivel',    value: 'Recompensa' },
          ] as const).map(({ Icon, label, value }) => (
            <View key={label} style={s.xpPill}>
              <Icon color={COLORS.neonPurple} size={18} />
              <Text style={s.xpPillLabel}>{label}</Text>
              <Text style={s.xpPillValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* MEDALLAS */}
        <View style={s.sectionRow}>
          <Crown color={COLORS.neonPink} size={16} />
          <Text style={[s.sectionTitle, { marginLeft: 8 }]}>SALON DE LA FAMA</Text>
        </View>
        <Text style={s.sectionSub}>Desbloquea niveles para obtener recompensas exclusivas</Text>

        <View style={s.grid}>
          {LEVELS.map((l) => (
            <MedalCard
              key={l.level}
              data={l}
              isUnlocked={level >= l.level}
              onPress={() => setModal(l.level)}
            />
          ))}
        </View>
      </ScrollView>

      {/* MODAL DE CANJE */}
      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <View style={s.overlay}>
          <View style={[s.modal, { borderColor: modalLevel.color + '50' }]}>
            <LinearGradient
              colors={[modalLevel.color + '30', 'transparent']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.5 }}
            />
            <TouchableOpacity style={s.closeBtn} onPress={() => setModal(null)}>
              <X color="#FBFBFB" size={20} />
            </TouchableOpacity>
            <View style={[s.modalHalo, {
              borderColor: modalLevel.color,
              backgroundColor: modalLevel.color + '20',
              shadowColor: modalLevel.color,
            }]}>
              <ModalIcon color={modalLevel.color} size={42} />
            </View>
            <Text style={[s.modalLevelText, { color: modalLevel.color }]}>
              RECOMPENSA · NIVEL {modal}
            </Text>
            <Text style={s.modalPrize}>{REWARDS[modal ?? 1]?.prize}</Text>
            <Text style={s.modalInfo}>{REWARDS[modal ?? 1]?.info}</Text>
            <View style={s.codeBox}>
              <Text style={s.codeLabel}>CODIGO DE CANJE</Text>
              <Text style={[s.codeValue, { color: modalLevel.color }]}>
                DYZ-{modal}-{Math.floor(1000 + Math.random() * 9000)}
              </Text>
            </View>
            <TouchableOpacity
              style={[s.redeemBtn, { backgroundColor: modalLevel.color, shadowColor: modalLevel.color }]}
              onPress={() => setModal(null)}
              activeOpacity={0.8}
            >
              <Text style={s.redeemText}>CANJEAR RECOMPENSA</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  scroll:         { paddingHorizontal: 20, paddingTop: 0, gap: 20 },

  heroCard:       { borderRadius: 28, borderWidth: 1, padding: 22, backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' },
  heroTop:        { flexDirection: 'row', alignItems: 'center', gap: 18 },
  orb:            { width: 90, height: 90, borderRadius: 45, borderWidth: 2, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.5)', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 18, elevation: 10 },
  orbLvLabel:     { fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  orbNum:         { color: 'white', fontSize: 42, fontWeight: '900', fontStyle: 'italic', lineHeight: 44 },
  heroInfo:       { flex: 1, gap: 4 },
  rankLabel:      { fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  rankName:       { color: '#FBFBFB', fontSize: 28, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1 },
  xpChip:         { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, marginTop: 2 },
  xpChipText:     { fontSize: 12, fontWeight: '800' },
  progressFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel:  { color: COLORS.textZinc, fontSize: 11, fontWeight: '500' },
  progressValue:  { fontSize: 12, fontWeight: '800' },

  sectionRow:     { flexDirection: 'row', alignItems: 'center' },
  sectionTitle:   { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase' },
  sectionSub:     { color: COLORS.textSecondary, fontSize: 12, marginTop: -12 },
  xpRow:          { gap: 10 },
  xpPill:         { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, paddingVertical: 13, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  xpPillLabel:    { flex: 1, color: COLORS.textZinc, fontSize: 13, fontWeight: '500' },
  xpPillValue:    { color: '#FBFBFB', fontSize: 13, fontWeight: '900' },
  grid:           { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modal:          { width: '100%', borderRadius: 32, padding: 28, alignItems: 'center', borderWidth: 1.5, overflow: 'hidden', backgroundColor: COLORS.modalBg, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.7, shadowRadius: 40, elevation: 25 },
  closeBtn:       { position: 'absolute', top: 14, right: 14, zIndex: 10, padding: 8, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 20 },
  modalHalo:      { width: 82, height: 82, borderRadius: 41, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, marginBottom: 16, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 20 },
  modalLevelText: { fontSize: 11, fontWeight: '900', letterSpacing: 3, marginBottom: 8 },
  modalPrize:     { color: '#FBFBFB', fontSize: 28, fontWeight: '900', fontStyle: 'italic', textAlign: 'center', marginBottom: 6, letterSpacing: -1 },
  modalInfo:      { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  codeBox:        { width: '100%', backgroundColor: 'rgba(0,0,0,0.5)', padding: 18, borderRadius: 18, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'dashed' },
  codeLabel:      { color: COLORS.textSecondary, fontSize: 10, fontWeight: '900', letterSpacing: 3, marginBottom: 6 },
  codeValue:      { fontSize: 26, fontWeight: '900', letterSpacing: 4 },
  redeemBtn:      { width: '100%', padding: 17, borderRadius: 18, alignItems: 'center', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 18, elevation: 10 },
  redeemText:     { color: '#FBFBFB', fontWeight: '900', fontSize: 14, letterSpacing: 2 },
});
