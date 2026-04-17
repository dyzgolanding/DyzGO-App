import { LinearGradient } from 'expo-linear-gradient';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { CheckCheck, Copy, Crown, Gift, Lock, QrCode, Star, Ticket, Trophy, Wine, X, Zap } from 'lucide-react-native';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useState } from 'react';
import { Platform, 
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
 } from 'react-native';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SkeletonBox } from '../../components/SkeletonBox';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
// insets se usa solo para el paddingBottom del scroll
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');
const CARD_SIZE = (width - 20 * 2 - 12) / 2;

const REWARDS: Record<number, { prize: string; info: string; icon: React.ComponentType<{ color: string; size: number }> }> = {
  2:  { prize: 'Código Promo −10%',   info: 'Descuento en tu próxima compra.\nÚnico, personal e intransferible.', icon: Zap },
  3:  { prize: 'Entrada Gratis',      info: 'Cualquier evento.',            icon: Ticket },
  4:  { prize: 'Coctel Premium',      info: 'Carta seleccionada.',          icon: Star },
  5:  { prize: 'Fast Pass VIP',       info: 'Sin filas.',                   icon: Zap },
  6:  { prize: 'Reserva de Mesa',     info: 'Ubicacion preferencial.',      icon: Crown },
  7:  { prize: 'Botella de Pisco',    info: 'Para tu grupo.',               icon: Gift },
  8:  { prize: 'Backstage Pass',      info: 'Acceso total.',                icon: Star },
  9:  { prize: 'Mesa VIP Gold',       info: 'Servicio incluido.',           icon: Crown },
  10: { prize: 'God Mode',            info: 'Entradas gratis x 1 anio.',   icon: Trophy },
};

// Todos los niveles — usados para el hero card (progreso, colores, XP)
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

// Salón de la fama — solo niveles con recompensa (nivel 1 no tiene medalla)
const SALON_LEVELS = LEVELS.filter(l => l.level >= 2);

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
  const RewardIcon = (REWARDS[data.level] ?? REWARDS[2]).icon;

  const handlePress = () => {
    if (!isUnlocked) return;
    onPress();
  };

  return (
    <View style={{ width: CARD_SIZE }}>
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
          {isUnlocked ? (REWARDS[data.level] ?? REWARDS[2]).prize : '???'}
        </Text>
        {isUnlocked && (
          <View style={[ms.dot, { backgroundColor: data.color, shadowColor: data.color }]} />
        )}
      </TouchableOpacity>
    </View>
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
  const [loadingXP, setLoadingXP] = useState(true);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoUsedAt, setPromoUsedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { fetchProgress(); }, []);

  const fetchProgress = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Core query — always works (columns guaranteed to exist)
      const { data, error } = await supabase
        .from('profiles')
        .select('xp, level')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      if (data) {
        setXp(data.xp ?? 0);
        setLevel(data.level ?? 1);
      }

      // Promo code query — only if migration has been run
      const { data: promoData } = await supabase
        .from('profiles')
        .select('level2_promo_code, level2_promo_used_at')
        .eq('id', user.id)
        .single();
      if (promoData) {
        setPromoCode(promoData.level2_promo_code ?? null);
        setPromoUsedAt(promoData.level2_promo_used_at ?? null);
      }
    } catch (e) {
      console.error('[achievements] fetchProgress:', e);
    } finally {
      setLoadingXP(false);
    }
  };

  const currentLevel = LEVELS.find(l => l.level === level) ?? LEVELS[0];
  const nextLevel    = LEVELS.find(l => l.level === level + 1);
  const progress     = nextLevel
    ? Math.min(1, (xp - currentLevel.min) / (nextLevel.min - currentLevel.min))
    : 1;
  const xpLeft       = nextLevel ? nextLevel.min - xp : 0;
  const modalLevel   = LEVELS.find(l => l.level === modal) ?? LEVELS[1];
  const ModalIcon    = REWARDS[modal ?? 2]?.icon ?? Trophy;

  const BG = ['#030303'] as const;

  return (
    <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#030303' }}>
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
        {loadingXP ? (
          <SkeletonBox height={160} borderRadius={20} />
        ) : (
          <Animated.View entering={FadeInUp.duration(300).delay(0).springify()}>
            <View style={[s.heroCard, { borderColor: currentLevel.color + '40' }]}>
              <LinearGradient
                colors={[currentLevel.color + '20', currentLevel.color + '08', 'transparent']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
              />
              <View style={s.heroTop}>
                <View style={[s.orb, { borderColor: currentLevel.color, shadowColor: currentLevel.color }]}>
                  <LinearGradient colors={[currentLevel.color + '30', 'transparent']} style={StyleSheet.absoluteFill} />
                  <Text style={[s.orbLvLabel, { color: currentLevel.color }]}>LVL</Text>
                  <Text style={s.orbNum}>{level}</Text>
                </View>
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
          </Animated.View>
        )}

        {/* COMO GANAR XP */}
        {loadingXP ? (
          <View style={{ gap: 10 }}>
            <SkeletonBox height={16} borderRadius={6} width="45%" />
            <SkeletonBox height={52} borderRadius={12} />
            <SkeletonBox height={52} borderRadius={12} />
            <SkeletonBox height={52} borderRadius={12} />
            <SkeletonBox height={52} borderRadius={12} />
          </View>
        ) : (
          <Animated.View entering={FadeInUp.duration(300).delay(80).springify()}>
            <Text style={s.sectionTitle}>COMO GANAR XP</Text>
            <View style={s.xpRow}>
              {([
                { Icon: Ticket, label: 'Comprar entrada',   value: '+50 XP' },
                { Icon: Wine,   label: 'Comprar consumo',   value: '+40 XP c/u' },
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
          </Animated.View>
        )}

        {/* SALON DE LA FAMA */}
        {loadingXP ? (
          <View style={{ gap: 12 }}>
            <SkeletonBox height={16} borderRadius={6} width="55%" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <SkeletonBox key={i} height={CARD_SIZE * 1.1} width={CARD_SIZE} borderRadius={22} />
              ))}
            </View>
          </View>
        ) : (
          <Animated.View entering={FadeInUp.duration(300).delay(160).springify()}>
            <View style={s.sectionRow}>
              <Crown color={COLORS.neonPink} size={16} />
              <Text style={[s.sectionTitle, { marginLeft: 8, marginBottom: 0 }]}>SALON DE LA FAMA</Text>
            </View>
            <Text style={s.sectionSub}>Desbloquea niveles para obtener recompensas exclusivas</Text>
            <View style={s.grid}>
              {SALON_LEVELS.map((l) => (
                <MedalCard
                  key={l.level}
                  data={l}
                  isUnlocked={level >= l.level}
                  onPress={() => setModal(l.level)}
                />
              ))}
            </View>
          </Animated.View>
        )}
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
            <Text style={s.modalPrize}>{REWARDS[modal ?? 2]?.prize}</Text>
            <Text style={s.modalInfo}>{REWARDS[modal ?? 2]?.info}</Text>

            {modal === 2 && (
              promoUsedAt ? (
                <View style={[s.codeBox, { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)' }]}>
                  <Text style={[s.codeLabel, { color: '#ef4444' }]}>YA CANJEADO</Text>
                  <Text style={{ color: 'rgba(239,68,68,0.6)', fontSize: 13, fontWeight: '600', marginTop: 4 }}>
                    Este código ya fue utilizado.
                  </Text>
                </View>
              ) : promoCode ? (
                <View style={s.codeBox}>
                  <Text style={s.codeLabel}>TU CÓDIGO PERSONAL</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                    <Text
                      style={[s.codeValue, { color: modalLevel.color, flex: 1 }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {promoCode}
                    </Text>
                    <TouchableOpacity
                      onPress={async () => {
                        await Clipboard.setStringAsync(promoCode);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      style={[s.copyBtn, { borderColor: modalLevel.color + '50', backgroundColor: modalLevel.color + '15' }]}
                      activeOpacity={0.7}
                    >
                      {copied
                        ? <CheckCheck color={modalLevel.color} size={16} />
                        : <Copy color={modalLevel.color} size={16} />
                      }
                    </TouchableOpacity>
                  </View>
                  <Text style={{ color: 'rgba(251,251,251,0.4)', fontSize: 11, marginTop: 8 }}>
                    Ingrésalo al pagar para obtener −10%
                  </Text>
                </View>
              ) : (
                <View style={s.codeBox}>
                  <Text style={[s.codeLabel, { color: 'rgba(251,251,251,0.4)' }]}>CÓDIGO NO DISPONIBLE</Text>
                </View>
              )
            )}

            <TouchableOpacity
              style={[s.redeemBtn, { backgroundColor: modalLevel.color, shadowColor: modalLevel.color }]}
              onPress={() => setModal(null)}
              activeOpacity={0.8}
            >
              <Text style={s.redeemText}>
                {modal === 2 && promoUsedAt ? 'CERRAR' : 'ENTENDIDO'}
              </Text>
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

  sectionRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  sectionTitle:   { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 },
  sectionSub:     { color: COLORS.textSecondary, fontSize: 12, marginBottom: 14 },
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
  codeValue:      { fontSize: 24, fontWeight: '900', letterSpacing: 1 },
  copyBtn:        { width: 34, height: 34, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  redeemBtn:      { width: '100%', padding: 17, borderRadius: 18, alignItems: 'center', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 18, elevation: 10 },
  redeemText:     { color: '#FBFBFB', fontWeight: '900', fontSize: 14, letterSpacing: 2 },
});
