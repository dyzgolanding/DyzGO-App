import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { BlurView } from '../../components/BlurSurface';
import {
  Award,
  ChevronRight,
  Settings,
  Ticket,
  TrendingUp,
  UserCheck,
  Users
} from 'lucide-react-native';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedEntry } from '../../components/animated/AnimatedEntry';
import { PressableScale } from '../../components/animated/PressableScale';
import { timing } from '../../lib/animation';
import { supabase } from '../../lib/supabase';
import { SkeletonBox } from '../../components/SkeletonBox';

const { width } = Dimensions.get('window');
const S = width / 430;
const isSmallScreen = width < 400;
const isLargeScreen = width >= 428;

const SCALE = {
  padding: isSmallScreen ? 16 : 20,
  avatarSize: isSmallScreen ? 70 : 80,
  titleSize: isSmallScreen ? 20 : 24,
  statValueSize: isSmallScreen ? 22 : 26,
};

const COLORS = {
  neonPink: '#FF31D8',
  neonPurple: '#FF31D8',
  textZinc: 'rgba(251, 251, 251, 0.6)',
};

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const hasLoaded = React.useRef(false);
  const fadeAnim = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fadeAnim.value }));

  useEffect(() => {
    if (!loading) fadeAnim.value = withTiming(1, timing.enter);
  }, [loading]);

  const [profile, setProfile] = useState({
    id: '',
    full_name: 'Cargando...',
    username: '...',
    xp: 0,
    level: 1,
    avatar_url: null as string | null,
    events_attended: 0
  });

  const fetchUserData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        const { count: usedTicketsCount } = await supabase
          .from('tickets')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('used', true);

        if (profileData) {
          setProfile({
            id: user.id,
            full_name: profileData.full_name,
            username: profileData.username,
            xp: profileData.xp || 0,
            level: profileData.level || 1,
            avatar_url: profileData.avatar_url,
            events_attended: usedTicketsCount || 0
          });
        }
      }
    } catch (error) {
      console.error("Error perfil:", error);
    } finally {
      hasLoaded.current = true;
      setProfileReady(true);
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchUserData(!hasLoaded.current);
    }, [fetchUserData])
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

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

      <Animated.View style={[{ flex: 1 }, fadeStyle]}>

        {/* NAVBAR FLOTANTE ESTILO HOME */}
        <View style={[styles.floatingHeader, { top: insets.top + 10 }]}>
          <BlurView intensity={50} tint="dark" style={styles.blurNavbar}>
            <View style={styles.brandRow}>
              <Text style={styles.brandText}>DyzGO<Text style={{ color: '#FF31D8' }}>.</Text></Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <PressableScale scaleTo={0.82} haptic="light" style={styles.iconContainer} onPress={() => router.push('/settings')}>
                <Settings color="rgba(251, 251, 251, 0.5)" size={24} />
              </PressableScale>
            </View>
          </BlurView>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 80 }]}>

          {/* 1. HERO GREETING Y AVATAR */}
          {!profileReady ? (
            <View style={[styles.heroSection, { gap: 10 }]}>
              <View style={styles.userInfo}>
                <SkeletonBox height={28} width={180} borderRadius={8} style={{ marginBottom: 8 }} />
                <SkeletonBox height={16} width={110} borderRadius={6} style={{ marginBottom: 10 }} />
                <SkeletonBox height={22} width={80} borderRadius={11} />
              </View>
              <SkeletonBox width={80} height={80} borderRadius={40} />
            </View>
          ) : (
          <AnimatedEntry index={0} fromY={20}>
            <View style={styles.heroSection}>
              <View style={styles.userInfo}>
                <Text style={styles.heroMainText} numberOfLines={1} adjustsFontSizeToFit>
                  {profile.full_name || 'Usuario'}
                </Text>
                <Text style={styles.greetingText}>
                  @{profile.username || '...'}
                </Text>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelText}>NIVEL {profile.level}</Text>
                </View>
              </View>
              <View style={styles.avatarBorderBig}>
                {profile.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.avatarImageReal} contentFit="cover" transition={150} cachePolicy="memory-disk" />
                ) : (
                  <View style={styles.avatarFallbackBig}>
                    <Text style={styles.avatarInitialBig}>
                      {profile.full_name && profile.full_name !== 'Cargando...' ? profile.full_name[0].toUpperCase() : '?'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </AnimatedEntry>
          )}

          {/* 2. MI ACTIVIDAD */}
          <AnimatedEntry index={1} fromY={24}>
            <View style={styles.sectionWrapper}>
              <SectionLabel title="Mi Actividad" />
              <View style={styles.bentoRow}>
                <BentoCard
                  style={{ flex: 1 }}
                  icon={<UserCheck color={COLORS.neonPink} size={20} />}
                  title="Seguidos"
                  subtitle="Clubes y productoras"
                  onPress={() => router.push('/saved')}
                />
                <BentoCard
                  style={{ flex: 1 }}
                  icon={<Ticket color={COLORS.neonPurple} size={20} />}
                  title="Mis Tickets"
                  subtitle="Entradas activas"
                  onPress={() => router.push('/my-tickets')}
                />
              </View>
            </View>
          </AnimatedEntry>

          {/* 3. SOCIAL */}
          <AnimatedEntry index={2} fromY={24}>
            <View style={styles.sectionWrapper}>
              <SectionLabel title="Social" />
              <View style={styles.bentoRow}>
                <BentoCard
                  style={{ flex: 1 }}
                  icon={<Users color={COLORS.neonPink} size={20} />}
                  title="Amigos"
                  subtitle="Tu círculo"
                  onPress={() => router.push('/my-friends')}
                />
                <BentoCard
                  style={{ flex: 1 }}
                  icon={<Award color={COLORS.neonPink} size={20} />}
                  title="Logros"
                  subtitle="Tus medallas"
                  onPress={() => router.push('/achievements')}
                />
              </View>
              <View style={styles.bentoRow}>
                <BentoCard
                  style={{ flex: 1 }}
                  icon={<TrendingUp color={COLORS.neonPink} size={20} />}
                  title="Rankings"
                  subtitle="Posición global y local"
                  onPress={() => router.push('/rankings')}
                  isHorizontal
                />
              </View>
            </View>
          </AnimatedEntry>

        </ScrollView>
      </Animated.View>
    </View>
  );
}

// --- SUBCOMPONENTES ---


const SectionLabel = ({ title }: { title: string }) => (
  <Text style={styles.sectionLabel}>{title}</Text>
);

const BentoCard = ({ icon, title, subtitle, onPress, style, isHorizontal }: any) => (
  <PressableScale
    onPress={onPress}
    scaleTo={0.95}
    haptic="light"
    style={[
      styles.bentoCard,
      style,
      isHorizontal && { minHeight: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', paddingVertical: 16 }
    ]}
  >
    <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
    <View style={[styles.bentoIconContainer, isHorizontal && { marginBottom: 0, marginRight: 16 }]}>
      {icon}
    </View>
    <View style={[styles.bentoTextContainer, isHorizontal && { flex: 1 }]}>
      <Text style={styles.bentoCardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.bentoCardSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
    </View>
    {isHorizontal && <ChevronRight color="rgba(251,251,251,0.3)" size={20} />}
  </PressableScale>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030303' },
  scrollContent: { padding: SCALE.padding, paddingBottom: isLargeScreen ? 36 : 24 },

  floatingHeader: { position: 'absolute', zIndex: 100, left: 16, right: 16 },
  blurNavbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 60,
    paddingHorizontal: 16,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(251, 251, 251, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden'
  },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  brandText: { color: '#FBFBFB', fontSize: 24, fontWeight: '900', letterSpacing: -1, fontStyle: 'italic', paddingLeft: 4 },
  iconContainer: { position: 'relative', padding: 4 },

  heroSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: isLargeScreen ? 30 : 24, marginBottom: isLargeScreen ? 36 : 28, paddingHorizontal: 4 },
  userInfo: { flex: 1, paddingRight: 10 },
  greetingText: { color: 'rgba(251, 251, 251, 0.6)', fontSize: 16, fontWeight: '500', letterSpacing: 0, marginBottom: 4 },
  heroMainText: { color: '#FBFBFB', fontSize: 32, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, lineHeight: 36 },

  levelBadge: {
    backgroundColor: 'rgba(255, 49, 216, 0.1)',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, marginTop: 8,
    borderWidth: 1, borderColor: 'rgba(255, 49, 216, 0.4)', alignSelf: 'flex-start'
  },
  levelText: { color: COLORS.neonPurple, fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  avatarBorderBig: {
    width: 86, height: 86, borderRadius: 43,
    borderWidth: 2, borderColor: '#FF31D8',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden'
  },
  avatarImageReal: { width: '100%', height: '100%', borderRadius: 43 },
  avatarFallbackBig: { width: '100%', height: '100%', borderRadius: 43, backgroundColor: 'rgba(255, 49, 216, 0.2)', justifyContent: 'center', alignItems: 'center' },
  avatarInitialBig: { color: '#FBFBFB', fontWeight: '800', fontSize: 28 },

  glassStatsCard: {
    borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(251, 251, 251, 0.05)', marginBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)'
  },
  cardPadding: { padding: 20 },
  statsHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' },
  statsTitle: { color: COLORS.neonPurple, fontSize: 12, fontWeight: '800', letterSpacing: 1 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { color: '#FBFBFB', fontSize: SCALE.statValueSize, fontWeight: '900', fontStyle: 'italic' },
  statLabel: { color: 'rgba(251,251,251,0.6)', fontSize: 11, marginTop: 2, fontWeight: '500' },
  statDivider: { width: 1, height: 25, backgroundColor: 'rgba(255,255,255,0.1)' },

  sectionWrapper: {
    marginBottom: isLargeScreen ? 22 : 16,
    gap: isLargeScreen ? 12 : 10,
  },
  sectionLabel: {
    color: '#FBFBFB', fontSize: Math.round(18 * S), fontWeight: '800',
    marginLeft: 8
  },
  bentoRow: {
    flexDirection: 'row', gap: 12
  },
  bentoCard: {
    borderRadius: 24, padding: 18,
    borderWidth: 1, borderColor: 'rgba(251, 251, 251, 0.05)', backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'space-between',
    minHeight: isLargeScreen ? 132 : 120, overflow: 'hidden'
  },
  bentoIconContainer: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(3, 3, 3, 0.6)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16
  },
  bentoTextContainer: {
    justifyContent: 'flex-end',
  },
  bentoCardTitle: {
    color: '#FBFBFB', fontSize: 15, fontWeight: '800'
  },
  bentoCardSubtitle: {
    color: 'rgba(251, 251, 251, 0.6)', fontSize: 11, marginTop: 4, fontWeight: '500'
  },
});
