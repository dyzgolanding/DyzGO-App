import { BlurView } from '../../components/BlurSurface';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { Globe, Medal, Users, UserPlus, ChevronRight } from 'lucide-react-native';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, 
  Animated,
  Dimensions,
  PanResponder,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
 } from 'react-native';
import ReAnimated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { SkeletonBox } from '../../components/SkeletonBox';

const { width } = Dimensions.get('window');
const isSmall = width < 400;

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
const MEDAL_GLOW   = ['rgba(255,215,0,0.25)', 'rgba(192,192,192,0.2)', 'rgba(205,127,50,0.2)'];

const LEVEL_NAMES: Record<number, string> = {
  1: 'Novato', 2: 'Iniciado', 3: 'Avanzado', 4: 'Constante', 5: 'Elite',
  6: 'Experto', 7: 'Maestro', 8: 'Leyenda', 9: 'Mitico', 10: 'Inmortal',
};

const LEVEL_COLORS: Record<number, string> = {
  1: '#8A2BE2', 2: '#9D50BB', 3: '#4776E6', 4: '#00B4DB',
  5: '#56ab2f', 6: '#f7971e', 7: '#eb3349', 8: '#FF512F',
  9: '#1A2980', 10: '#FFD700',
};

interface RankUser {
  id: string; name: string; username?: string; points: number; level: number;
  avatarUrl: string | null; avatarChar: string; color: string;
  isFriend: boolean;
}

// --- AVATAR ---
function Avatar({ user, size, border }: { user: RankUser; size: number; border?: string }) {
  const ringColor = border ?? user.color;
  const hasPhoto = !!user.avatarUrl;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden',
      borderWidth: 2, borderColor: hasPhoto ? ringColor + '90' : ringColor,
      backgroundColor: hasPhoto ? 'rgba(255,255,255,0.05)' : ringColor + '33', justifyContent: 'center', alignItems: 'center' }}>
      {hasPhoto
        ? <Image source={{ uri: user.avatarUrl! }} style={{ width: size, height: size }} contentFit="cover" transition={150} cachePolicy="memory-disk" placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }} />
        : <Text style={{ color: '#FBFBFB', fontWeight: '900', fontSize: size * 0.38, textAlign: 'center', lineHeight: size }}>
            {user.avatarChar}
          </Text>
      }
    </View>
  );
}

// --- PODIO TOP 3 ---
function Podium({ top3, currentUserId, onPress, showFriendBadge }: {
  top3: RankUser[]; currentUserId: string | null;
  onPress: (u: RankUser) => void; showFriendBadge?: boolean;
}) {
  if (top3.length === 0) return null;

  const positions = [
    { rank: 2, user: top3[1], height: 100, avatarSize: 52 },
    { rank: 1, user: top3[0], height: 130, avatarSize: 64 },
    { rank: 3, user: top3[2], height: 80,  avatarSize: 48 },
  ];

  return (
    <View style={pod.wrapper}>
      {positions.map((pos, i) => {
        // Renderizar un "Fantasma" si el puesto está vacío
        if (!pos.user) {
          return (
            <View key={`empty-${i}`} style={[pod.column, { opacity: 0.6 }]}>
              <View style={[pod.avatarHalo, { shadowColor: 'transparent', backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.1)' }]}>
                <View style={{ width: pos.avatarSize, height: pos.avatarSize, borderRadius: pos.avatarSize / 2, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' }}>
                   <UserPlus size={pos.avatarSize * 0.4} color="rgba(255,255,255,0.2)" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[pod.name, { color: 'rgba(255,255,255,0.3)' }]} numberOfLines={1}>
                  Vacío
                </Text>
              </View>
              <Text style={[pod.xp, { color: 'rgba(255,255,255,0.2)' }]}>---</Text>
              <Text style={[pod.xpLabel, { color: 'rgba(255,255,255,0.1)' }]}>XP</Text>

              <View style={[pod.block, { height: pos.height, backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }]}>
                <Text style={[pod.rankNum, { color: 'rgba(255,255,255,0.15)' }]}>{pos.rank}</Text>
              </View>
            </View>
          );
        }

        const { user, rank, height, avatarSize } = pos;
        const mc = MEDAL_COLORS[rank - 1];
        const mg = MEDAL_GLOW[rank - 1];
        const isMe = user.id === currentUserId;

        return (
          <TouchableOpacity key={user.id} style={pod.column} onPress={() => onPress(user)} activeOpacity={0.8}>
            <View style={[pod.avatarHalo, { shadowColor: mc, backgroundColor: mg, borderColor: mc + '60' }]}>
              <Avatar user={user} size={avatarSize} border={mc} />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[pod.name, rank === 1 && { color: '#FBFBFB', fontSize: 13 }]} numberOfLines={1}>
                {user.name.split(' ')[0]}{isMe ? ' ✦' : ''}
              </Text>
              {showFriendBadge && user.isFriend && !isMe && (
                <Users size={8} color={COLORS.neonPink} />
              )}
            </View>
            <Text style={[pod.xp, { color: mc }]}>{user.points.toLocaleString()}</Text>
            <Text style={pod.xpLabel}>XP</Text>

            <View style={[pod.block, { height: height, backgroundColor: mc + '18', borderColor: mc + '40' }]}>
              <LinearGradient
                colors={[mc + '25', 'transparent']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
              />
              <Text style={[pod.rankNum, { color: mc }]}>{rank}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const pod = StyleSheet.create({
  wrapper:    { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, marginBottom: 24, marginTop: 8 },
  column:     { flex: 1, alignItems: 'center', gap: 4 },
  avatarHalo: { borderRadius: 40, borderWidth: 1.5, padding: 3, marginBottom: 4, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 14 },
  name:       { color: 'rgba(251, 251, 251, 0.8)', fontSize: 11, fontWeight: '800', textAlign: 'center' },
  xp:         { fontSize: 14, fontWeight: '900', fontStyle: 'italic' },
  xpLabel:    { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '700', marginTop: -4 },
  block:      { width: '100%', borderTopLeftRadius: 14, borderTopRightRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rankNum:    { fontSize: 28, fontWeight: '900', fontStyle: 'italic' },
});

// --- FILA RANKING (posición 4+) ---
function RankRow({ user, rank, currentUserId, onPress, showFriendBadge }: {
  user: RankUser; rank: number; currentUserId: string | null;
  onPress: () => void; showFriendBadge?: boolean;
}) {
  const isMe = user.id === currentUserId;
  const showBadge = showFriendBadge && user.isFriend && !isMe;
  const lc = LEVEL_COLORS[user.level] ?? COLORS.neonPink;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[row.card, isMe && row.myCard]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.01)']}
        style={StyleSheet.absoluteFill}
      />
      {isMe && (
        <LinearGradient
          colors={['rgba(255,49,216,0.08)', 'transparent']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        />
      )}

      <Text style={[row.rankNum, isMe && { color: COLORS.neonPink }]}>{rank}</Text>

      <View style={[row.ring, { borderColor: '#FF31D8' }]}>
        {user.avatarUrl
          ? <Image source={{ uri: user.avatarUrl }} style={row.avatar} contentFit="cover" transition={150} cachePolicy="memory-disk" placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }} />
          : <Text style={row.initials}>{user.avatarChar}</Text>}
      </View>

      <View style={row.info}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={row.name} numberOfLines={1}>
            {user.name}{isMe ? ' ✦' : ''}
          </Text>
          {showBadge && (
            <View style={row.friendBadge}>
              <Users size={8} color={COLORS.neonPink} />
            </View>
          )}
        </View>
        <Text style={row.username} numberOfLines={1}>
          {user.username ? `@${user.username}` : `${user.points.toLocaleString()} XP`}
        </Text>
      </View>

      <View style={[row.levelPill, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' }]}>
        <Text style={[row.levelText, { color: '#FBFBFB' }]}>{user.points.toLocaleString()} XP</Text>
      </View>

      <ChevronRight color="rgba(255,255,255,0.25)" size={18} style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );
}

const row = StyleSheet.create({
  card:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)', overflow: 'hidden' },
  myCard:      { borderColor: 'rgba(255,49,216,0.35)', borderLeftWidth: 3, borderLeftColor: COLORS.neonPink },
  friendBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(138,43,226,0.15)', borderWidth: 1, borderColor: 'rgba(138,43,226,0.3)' },
  rankNum:     { width: 28, color: 'rgba(255,255,255,0.35)', fontWeight: '900', fontSize: 13, textAlign: 'center', marginRight: 2 },
  ring:        { width: 52, height: 52, borderRadius: 26, borderWidth: 2, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', marginRight: 14, backgroundColor: 'rgba(255,49,216,0.2)' },
  avatar:      { width: 52, height: 52 },
  initials:    { color: '#FBFBFB', fontSize: 20, fontWeight: '800' },
  info:        { flex: 1 },
  name:        { color: '#FBFBFB', fontSize: 15, fontWeight: '700', letterSpacing: -0.5 },
  username:    { color: COLORS.textSecondary, fontSize: 12, fontWeight: '500', marginTop: 2 },
  levelPill:   { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginLeft: 8 },
  levelText:   { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
});

// --- PANTALLA PRINCIPAL ---
export default function RankingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const navTop = useNavBarPaddingTop();
  const [scope, setScope] = useState<'Amigos' | 'Global'>('Amigos');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const [amigosRankings, setAmigosRankings] = useState<RankUser[]>([]);
  const [globalRankings, setGlobalRankings] = useState<RankUser[]>([]);
  
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const scopeAnim = useRef(new Animated.Value(0)).current;
  const scopeAnimValue = useRef(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const listener = scopeAnim.addListener(({ value }) => { scopeAnimValue.current = value; });
    return () => scopeAnim.removeListener(listener);
  }, []);

  useFocusEffect(useCallback(() => { fetchRankings(!hasLoaded.current); }, []));

  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (loading) { fadeAnim.setValue(0); translateY.setValue(20); }
    else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 100, useNativeDriver: true })
      ]).start();
    }
  }, [loading]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRankings(false); 
    setRefreshing(false);
  }, []);

  async function fetchRankings(showLoading = true) {
    try {
      if (showLoading) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);
      if (!user) return;

      const [myF, theirF] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', user.id).eq('status', 'accepted'),
        supabase.from('follows').select('follower_id').eq('following_id', user.id).eq('status', 'accepted'),
      ]);
      const iFollow    = myF.data?.map(f => f.following_id) ?? [];
      const theyFollow = theirF.data?.map(f => f.follower_id) ?? [];
      const mutualIds  = iFollow.filter(id => theyFollow.includes(id));
      const mutualSet  = new Set(mutualIds);

      // --- Query Amigos ---
      const amigosIds = [...new Set([...mutualIds, user.id])];
      let queryAmigos = supabase.from('profiles').select('id, full_name, username, xp, level, avatar_url')
        .in('id', amigosIds)
        .order('xp', { ascending: false }).limit(50);

      // --- Query Global ---
      let queryGlobal = supabase.from('profiles').select('id, full_name, username, xp, level, avatar_url');
      if (mutualIds.length > 0) {
        queryGlobal = queryGlobal.or(`is_private.is.null,is_private.eq.false,id.in.(${mutualIds.join(',')})`);
      } else {
        queryGlobal = queryGlobal.or('is_private.is.null,is_private.eq.false');
      }
      queryGlobal = queryGlobal.order('xp', { ascending: false }).limit(50);

      const [resAmigos, resGlobal] = await Promise.all([queryAmigos, queryGlobal]);

      if (resAmigos.error) throw resAmigos.error;
      if (resGlobal.error) throw resGlobal.error;

      const mapToRankUser = (u: any, i: number) => ({
        id: u.id,
        name: u.full_name || 'Anonimo',
        username: u.username,
        points: u.xp || 0,
        level: u.level || 1,
        avatarUrl: u.avatar_url,
        avatarChar: u.full_name ? u.full_name[0].toUpperCase() : '?',
        color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : COLORS.neonPink,
        isFriend: mutualSet.has(u.id),
      });

      setAmigosRankings((resAmigos.data ?? []).map(mapToRankUser));
      setGlobalRankings((resGlobal.data ?? []).map(mapToRankUser));
    } catch (err) {
      console.error('[rankings] fetchRankings:', err);
    } finally {
      hasLoaded.current = true;
      setLoading(false);
    }
  }

  const handleScopeChange = (s: 'Amigos' | 'Global') => {
    setScope(s);
    Animated.spring(scopeAnim, {
      toValue: s === 'Amigos' ? 0 : 1,
      useNativeDriver: false,
      friction: 8, tension: 40,
    }).start();
  };

  const slideW = (width - 40) / 2;
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5,
    onPanResponderGrant: () => {
      scopeAnim.stopAnimation(v => { scopeAnim.setOffset(v); scopeAnim.setValue(0); });
    },
    onPanResponderMove: (_, g) => { scopeAnim.setValue(g.dx / slideW); },
    onPanResponderRelease: (_, g) => {
      scopeAnim.flattenOffset();
      const cur = scopeAnimValue.current;
      const to = Math.max(0, Math.min(1, Math.round(cur > 0.5 || g.vx > 0.5 ? 1 : 0)));
      setScope(to === 0 ? 'Amigos' : 'Global');
      Animated.spring(scopeAnim, { toValue: to, useNativeDriver: false, bounciness: 10, speed: 20 }).start();
    },
  })).current;

  const slideLeft = scopeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [4, (width - 48) / 2 + 4],
    extrapolate: 'clamp',
  });

  const currentRankings = scope === 'Amigos' ? amigosRankings : globalRankings;
  const top3 = currentRankings.slice(0, 3);
  const rest = currentRankings.slice(3);

  return (
    <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#030303' }}>
      {Platform.OS !== 'web' && (
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
)}

      <NavBar
        title="LEADERBOARD"
        onBack={() => router.back()}
      />

      {/* Selector Amigos / Global — floating */}
      <View style={{ position: 'absolute', top: navTop - 20, left: 0, right: 0, zIndex: 10, alignItems: 'center', paddingHorizontal: 20 }}>
        <View style={{ overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(251,251,251,0.06)' }}>
          <BlurView intensity={50} tint="dark" style={{ flexDirection: 'row', height: 44, padding: 4, gap: 2 }}>
            <TouchableOpacity
              onPress={() => handleScopeChange('Amigos')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: scope === 'Amigos' ? 'rgba(255,255,255,0.12)' : 'transparent' }}
              activeOpacity={0.8}
            >
              <Users size={14} color={scope === 'Amigos' ? '#FF31D8' : 'rgba(251,251,251,0.45)'} />
              <Text style={{ color: scope === 'Amigos' ? '#FBFBFB' : 'rgba(251,251,251,0.45)', fontWeight: scope === 'Amigos' ? '800' : '600', fontSize: 13 }}>Amigos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleScopeChange('Global')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: scope === 'Global' ? 'rgba(255,255,255,0.12)' : 'transparent' }}
              activeOpacity={0.8}
            >
              <Globe size={14} color={scope === 'Global' ? '#FF31D8' : 'rgba(251,251,251,0.45)'} />
              <Text style={{ color: scope === 'Global' ? '#FBFBFB' : 'rgba(251,251,251,0.45)', fontWeight: scope === 'Global' ? '800' : '600', fontSize: 13 }}>Global</Text>
            </TouchableOpacity>
          </BlurView>
        </View>
      </View>

      <ReAnimated.View entering={FadeIn.duration(250)} style={{ flex: 1, paddingHorizontal: 20 }}>
        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY }] }}>
            {loading ? (
              <View style={{ paddingHorizontal: 20, paddingTop: navTop + 44 }}>
                {/* Podium skeleton */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', marginBottom: 30, height: 140 }}>
                  <SkeletonBox width={80} height={100} borderRadius={16} />
                  <SkeletonBox width={80} height={130} borderRadius={16} />
                  <SkeletonBox width={80} height={85} borderRadius={16} />
                </View>
                {/* Row skeletons */}
                {[0, 1, 2, 3, 4].map(i => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <SkeletonBox width={32} height={16} borderRadius={6} />
                    <SkeletonBox width={44} height={44} borderRadius={22} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <SkeletonBox height={14} borderRadius={6} width="60%" />
                      <SkeletonBox height={11} borderRadius={6} width="35%" />
                    </View>
                    <SkeletonBox width={55} height={22} borderRadius={10} />
                  </View>
                ))}
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingTop: navTop + 44, paddingBottom: insets.bottom + 40 }}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing} onRefresh={onRefresh}
                    tintColor={COLORS.neonPink}
                    colors={[COLORS.neonPink, COLORS.neonPink]}
                    progressBackgroundColor="#111"
                  />
                }
              >
                {/* PODIO TOP 3 */}
                {top3.length > 0 && (
                  <ReAnimated.View entering={FadeInUp.duration(300).delay(0).springify()}>
                    <Podium
                      top3={top3}
                      currentUserId={currentUserId}
                      showFriendBadge={scope === 'Global'}
                      onPress={(u) => router.push({ pathname: '/user-profile', params: { id: u.id, name: u.name } })}
                    />
                  </ReAnimated.View>
                )}

                {/* DIVISOR */}
                {rest.length > 0 && (
                  <ReAnimated.View entering={FadeInUp.duration(300).delay(80).springify()}>
                  <View style={s.divider}>
                    <View style={s.dividerLine} />
                    <BlurView intensity={40} tint="dark" style={s.dividerChip}>
                      <Text style={s.dividerText}>CLASIFICACIÓN</Text>
                    </BlurView>
                    <View style={s.dividerLine} />
                  </View>
                  </ReAnimated.View>
                )}

                {/* LISTA 4+ */}
                {rest.map((user, i) => (
                  <ReAnimated.View key={user.id} entering={FadeInDown.duration(300).delay(i * 50).springify()}>
                    <RankRow
                      user={user}
                      rank={i + 4}
                      currentUserId={currentUserId}
                      showFriendBadge={scope === 'Global'}
                      onPress={() => router.push({ pathname: '/user-profile', params: { id: user.id, name: user.name } })}
                    />
                  </ReAnimated.View>
                ))}

                {/* CTA INVITAR AMIGOS: Tarjeta Grande (3 o menos) */}
                {scope === 'Amigos' && currentRankings.length <= 3 && (
                  <ReAnimated.View entering={FadeInUp.duration(300).delay(240).springify()}>
                  <View style={s.emptyStateCard}>
                    <View style={s.emptyStateIcon}>
                      <UserPlus color={COLORS.neonPink} size={32} />
                    </View>
                    <Text style={s.emptyStateTitle}>Compite con tus amigos</Text>
                    <Text style={s.emptyStateSub}>Agrega al menos a 2 amigos para completar el podio y empezar a competir entre ustedes.</Text>
                    <TouchableOpacity
                      style={s.emptyStateBtn}
                      onPress={() => router.push({ pathname: '/my-friends', params: { scope: 'Global' } })}
                      activeOpacity={0.8}
                    >
                      <Text style={s.emptyStateBtnText}>BUSCAR AMIGOS</Text>
                    </TouchableOpacity>
                  </View>
                  </ReAnimated.View>
                )}

                {/* CTA INVITAR AMIGOS: Banner Dinámico (4 o más) */}
                {scope === 'Amigos' && currentRankings.length > 3 && (
                  <ReAnimated.View entering={FadeInUp.duration(300).delay(240).springify()}>
                  <TouchableOpacity
                    style={s.smallInviteBanner}
                    onPress={() => router.push({ pathname: '/my-friends', params: { scope: 'Global' } })}
                    activeOpacity={0.8}
                  >
                    <View style={s.smallInviteIcon}>
                      <UserPlus color={COLORS.neonPink} size={18} />
                    </View>
                    <View style={{ flex: 1, paddingHorizontal: 12 }}>
                      <Text style={s.smallInviteTitle}>¡Sube el nivel!</Text>
                      <Text style={s.smallInviteSub}>Invita a más amigos a competir.</Text>
                    </View>
                    <ChevronRight color="rgba(255,255,255,0.2)" size={18} />
                  </TouchableOpacity>
                  </ReAnimated.View>
                )}

                {/* EMPTY STATE GLOBAL */}
                {scope === 'Global' && currentRankings.length === 0 && (
                  <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
                    <Users color="rgba(255,255,255,0.2)" size={40} />
                    <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, fontWeight: '500' }}>
                      Sin datos disponibles.
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
        </Animated.View>
      </ReAnimated.View>
    </View>
  );
}

const s = StyleSheet.create({

  divider:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  dividerLine:  { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  dividerText:  { color: '#FBFBFB', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },

  // Tarjeta Grande (<= 3 amigos)
  emptyStateCard: { marginTop: 40, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
  emptyStateIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,49,216,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,49,216,0.35)' },
  emptyStateTitle: { color: '#FBFBFB', fontSize: 18, fontWeight: '900', marginBottom: 8, fontStyle: 'italic', textAlign: 'center', letterSpacing: -1 },
  emptyStateSub:   { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 22 },
  emptyStateBtn:   { backgroundColor: 'rgba(255,49,216,0.15)', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,49,216,0.35)' },
  emptyStateBtnText: { color: '#FF31D8', fontWeight: '900', fontSize: isSmall ? 14 : 16 },

  // Banner Dinámico (> 3 amigos)
  smallInviteBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 20, padding: 16, marginTop: 8, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  smallInviteIcon:   { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(138,43,226,0.15)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(138,43,226,0.3)' },
  smallInviteTitle:  { color: '#FBFBFB', fontSize: 14, fontWeight: '800' },
  smallInviteSub:    { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
});