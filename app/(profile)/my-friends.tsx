import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from '../../components/BlurSurface';
import ReAnimated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import {
  Check, ChevronRight, Globe, Search, User,
  UserPlus, Users, Wifi, X as XIcon,
} from 'lucide-react-native';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Dimensions, FlatList,
  PanResponder, Platform, RefreshControl, ScrollView, Share,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { COLORS } from '../../constants/colors';
import { sendPushNotification } from '../../lib/push';
import { supabase } from '../../lib/supabase';
import { SkeletonBox } from '../../components/SkeletonBox';

const { width } = Dimensions.get('window');
const isSmall = width < 400;
const SLIDER_W = (width - 48) / 2;
const BATCH_SIZE = 20;
const CARD_W = width * 0.72;
const DISMISSED_KEY = '@dyzgo/dismissed_suggestions';

const LEVEL_COLORS: Record<number, string> = {
  1: '#8A2BE2', 2: '#9D50BB', 3: '#4776E6', 4: '#00B4DB',
  5: '#56ab2f', 6: '#f7971e', 7: '#eb3349', 8: '#FF512F',
  9: '#1A2980', 10: '#FFD700',
};

interface UserItem {
  id: string; full_name: string; username?: string;
  avatar_url?: string; xp?: number; level?: number;
}
interface UserItemWithMutual extends UserItem { mutualCount?: number; }

// ─── Tarjeta grande para el carrusel de sugerencias ──────────────────────────
function SuggestionCard({
  item, isRequestSent, onPress, onAdd, onDismiss,
}: {
  item: UserItemWithMutual; isRequestSent: boolean;
  onPress: () => void; onAdd: () => void; onDismiss: () => void;
}) {
  const lc = LEVEL_COLORS[item.level ?? 1] ?? COLORS.neonPink;
  const initials = item.full_name ? item.full_name[0].toUpperCase() : '?';

  return (
    <TouchableOpacity style={[sug.card, { shadowColor: lc }]} onPress={onPress} activeOpacity={0.9}>
      <LinearGradient
        colors={['rgba(255,255,255,0.03)', lc + '15']}
        style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
      />

      {!isRequestSent && (
        <TouchableOpacity
          style={sug.dismiss}
          onPress={e => { e.stopPropagation(); onDismiss(); }}
          activeOpacity={0.7}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <XIcon color={COLORS.textSecondary} size={14} />
        </TouchableOpacity>
      )}

      <View style={[sug.ring, { borderColor: '#FF31D8', shadowColor: '#FF31D8' }]}>
        <LinearGradient colors={['rgba(255,49,216,0.3)', 'rgba(255,49,216,0.08)']} style={StyleSheet.absoluteFill} />
        {item.avatar_url
          ? <Image source={{ uri: item.avatar_url }} style={sug.avatar} contentFit="cover" transition={150} cachePolicy="memory-disk" />
          : <Text style={sug.initials}>{initials}</Text>}
      </View>

      <View style={sug.info}>
        <Text style={sug.name} numberOfLines={1}>{item.full_name}</Text>
        <Text style={sug.username}>@{item.username || 'usuario'}</Text>
        {!!item.level && (
          <View style={[sug.levelPill, { backgroundColor: lc + '20', borderColor: lc + '40' }]}>
            <Text style={[sug.levelText, { color: lc }]}>NIVEL {item.level}</Text>
          </View>
        )}
        {(item.mutualCount ?? 0) > 0 && (
          <Text style={sug.mutual}>
            {item.mutualCount === 1 ? '1 amigo en común' : `${item.mutualCount} amigos en común`}
          </Text>
        )}
      </View>

      <View style={sug.action}>
        {isRequestSent ? (
          <View style={[sug.chip, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)' }]}>
            <Check color={COLORS.textSecondary} size={16} />
            <Text style={[sug.chipText, { color: COLORS.textSecondary }]}>Solicitud Enviada</Text>
          </View>
        ) : (
          <TouchableOpacity style={sug.addBtn} onPress={onAdd} activeOpacity={0.8}>
            <UserPlus color="white" size={18} />
            <Text style={sug.addBtnText}>Agregar Amigo</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Fila compacta de amigo (Tarjeta Liquid Glass) ────────────────────────────
function FriendRow({ item, onPress }: { item: UserItem; onPress: () => void }) {
  const lc = LEVEL_COLORS[item.level ?? 1] ?? COLORS.neonPink;
  const initials = item.full_name ? item.full_name[0].toUpperCase() : '?';
  return (
    <TouchableOpacity style={row.wrap} onPress={onPress} activeOpacity={0.75}>
      <LinearGradient 
        colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.01)']} 
        style={StyleSheet.absoluteFill} 
      />
      <View style={[row.ring, { borderColor: '#FF31D8' }]}>
        {item.avatar_url
          ? <Image source={{ uri: item.avatar_url }} style={row.avatar} contentFit="cover" transition={150} cachePolicy="memory-disk" />
          : <Text style={row.initials}>{initials}</Text>}
      </View>
      <View style={row.info}>
        <Text style={row.name} numberOfLines={1}>{item.full_name}</Text>
        <Text style={row.username}>@{item.username || 'usuario'}</Text>
      </View>
      {!!item.level && (
        <View style={[row.levelPill, { backgroundColor: lc + '20', borderColor: lc + '40' }]}>
          <Text style={[row.levelText, { color: lc }]}>Nv.{item.level}</Text>
        </View>
      )}
      <ChevronRight color="rgba(255,255,255,0.25)" size={18} style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );
}

// ─── Fila de resultado de búsqueda (Tarjeta Liquid Glass) ─────────────────────
function SearchRow({
  item, isFriend, isRequestSent, onPress, onAdd,
}: {
  item: UserItem; isFriend: boolean; isRequestSent: boolean;
  onPress: () => void; onAdd: () => void;
}) {
  const lc = LEVEL_COLORS[item.level ?? 1] ?? COLORS.neonPink;
  const initials = item.full_name ? item.full_name[0].toUpperCase() : '?';
  return (
    <TouchableOpacity style={row.wrap} onPress={onPress} activeOpacity={0.75}>
      <LinearGradient 
        colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.01)']} 
        style={StyleSheet.absoluteFill} 
      />
      <View style={[row.ring, { borderColor: '#FF31D8' }]}>
        {item.avatar_url
          ? <Image source={{ uri: item.avatar_url }} style={row.avatar} contentFit="cover" transition={150} cachePolicy="memory-disk" />
          : <Text style={row.initials}>{initials}</Text>}
      </View>
      <View style={row.info}>
        <Text style={row.name} numberOfLines={1}>{item.full_name}</Text>
        <Text style={row.username}>@{item.username || 'usuario'}</Text>
      </View>
      {isFriend ? (
        <View style={[row.badge, { backgroundColor: COLORS.neonPink + '20', borderColor: COLORS.neonPink + '50' }]}>
          <Check color={COLORS.neonPink} size={13} />
          <Text style={[row.badgeText, { color: COLORS.neonPink }]}>Amigo</Text>
        </View>
      ) : isRequestSent ? (
        <View style={[row.badge, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)' }]}>
          <Check color={COLORS.textSecondary} size={13} />
          <Text style={[row.badgeText, { color: COLORS.textSecondary }]}>Enviado</Text>
        </View>
      ) : (
        <TouchableOpacity style={row.addBtn} onPress={onAdd} activeOpacity={0.8}>
          <UserPlus color="white" size={15} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ─── Fila de sugerencia (igual a FriendRow pero con botones add + dismiss) ────
function SuggestionRow({
  item, isRequestSent, onPress, onAdd, onDismiss,
}: {
  item: UserItemWithMutual; isRequestSent: boolean;
  onPress: () => void; onAdd: () => void; onDismiss: () => void;
}) {
  const lc = LEVEL_COLORS[item.level ?? 1] ?? COLORS.neonPink;
  const initials = item.full_name ? item.full_name[0].toUpperCase() : '?';
  return (
    <TouchableOpacity style={row.wrap} onPress={onPress} activeOpacity={0.75}>
      <LinearGradient
        colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.01)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[row.ring, { borderColor: '#FF31D8' }]}>
        {item.avatar_url
          ? <Image source={{ uri: item.avatar_url }} style={row.avatar} contentFit="cover" transition={150} cachePolicy="memory-disk" />
          : <Text style={row.initials}>{initials}</Text>}
      </View>
      <View style={row.info}>
        <Text style={row.name} numberOfLines={1}>{item.full_name}</Text>
        <Text style={row.username} numberOfLines={1}>
          @{item.username || 'usuario'}
          {(item.mutualCount ?? 0) > 0 ? ` · ${item.mutualCount} en común` : ''}
        </Text>
      </View>
      {!!item.level && (
        <View style={[row.levelPill, { backgroundColor: lc + '20', borderColor: lc + '40' }]}>
          <Text style={[row.levelText, { color: lc }]}>Nv.{item.level}</Text>
        </View>
      )}
      {isRequestSent ? (
        <View style={[row.badge, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', marginLeft: 8 }]}>
          <Check color={COLORS.textSecondary} size={13} />
        </View>
      ) : (
        <>
          <TouchableOpacity
            style={[row.addBtn, { backgroundColor: 'rgba(255,49,216,0.15)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.35)', shadowOpacity: 0, marginLeft: 8 }]}
            onPress={onAdd}
            activeOpacity={0.8}
          >
            <UserPlus color="#FF31D8" size={15} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[row.addBtn, { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', shadowOpacity: 0, marginLeft: 6 }]}
            onPress={onDismiss}
            activeOpacity={0.8}
          >
            <XIcon color="rgba(255,255,255,0.4)" size={14} />
          </TouchableOpacity>
        </>
      )}
    </TouchableOpacity>
  );
}

// ─── Screen principal ─────────────────────────────────────────────────────────
export default function MyFriendsScreen() {
  const router = useRouter();
  const navTop = useNavBarPaddingTop();

  const [scope, setScope] = useState<'Amigos' | 'Global'>('Amigos');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [myFriends, setMyFriends] = useState<UserItem[]>([]);
  const [friendIdSet, setFriendIdSet] = useState<Set<string>>(new Set());
  const [sentRequestIds, setSentRequestIds] = useState<Set<string>>(new Set());
  const sentRequestIdsRef = useRef<Set<string>>(new Set());

  const [searchResults, setSearchResults] = useState<UserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Sugerencias
  const allCandidates = useRef<UserItemWithMutual[]>([]);
  const [displayedSuggestions, setDisplayedSuggestions] = useState<UserItemWithMutual[]>([]);
  // Descartados: ref para acceso síncrono en callbacks async, state para re-render
  const dismissedRef = useRef<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const scrollX = useRef(new Animated.Value(0)).current;
  const scopeAnim = useRef(new Animated.Value(0)).current;
  const scopeAnimValue = useRef(0);
  const hasLoaded = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mantener ref de sentRequestIds sincronizada para callbacks asíncronos
  useEffect(() => { sentRequestIdsRef.current = sentRequestIds; }, [sentRequestIds]);

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

  // Cargar descartados persistidos de AsyncStorage al montar
  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then(raw => {
      if (!raw) return;
      try {
        const ids = new Set<string>(JSON.parse(raw) as string[]);
        dismissedRef.current = ids;
        setDismissedIds(ids);
      } catch { /* ignore corrupted storage */ }
    });
  }, []);

  useEffect(() => {
    const id = scopeAnim.addListener(({ value }) => { scopeAnimValue.current = value; });
    return () => scopeAnim.removeListener(id);
  }, []);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5,
    onPanResponderGrant: () => {
      scopeAnim.stopAnimation(v => { scopeAnim.setOffset(v); scopeAnim.setValue(0); });
    },
    onPanResponderMove: (_, g) => { scopeAnim.setValue(g.dx / SLIDER_W); },
    onPanResponderRelease: (_, g) => {
      scopeAnim.flattenOffset();
      const cur = scopeAnimValue.current;
      const to = Math.max(0, Math.min(1, Math.round(cur > 0.5 || g.vx > 0.5 ? 1 : 0)));
      setScope(to === 0 ? 'Amigos' : 'Global');
      Animated.spring(scopeAnim, { toValue: to, useNativeDriver: false, bounciness: 10, speed: 20 }).start();
    },
  })).current;

  const slideLeft = scopeAnim.interpolate({
    inputRange: [0, 1], outputRange: [4, SLIDER_W + 4], extrapolate: 'clamp',
  });

  const handleScopeChange = useCallback((s: 'Amigos' | 'Global') => {
    setScope(s);
    Animated.spring(scopeAnim, {
      toValue: s === 'Amigos' ? 0 : 1, useNativeDriver: false, friction: 8, tension: 40,
    }).start();
  }, [scopeAnim]);

  useFocusEffect(useCallback(() => { fetchInitialData(!hasLoaded.current); }, []));

  // Búsqueda con debounce de 300ms
  useEffect(() => {
    if (scope !== 'Global') return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const trimmed = searchQuery.trim();
    if (!trimmed) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(() => handleSearch(trimmed), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, scope]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchInitialData(false);
    setRefreshing(false);
  }, []);

  const fetchInitialData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [followingRes, followersRes] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', user.id),
        supabase.from('follows').select('follower_id').eq('following_id', user.id).eq('status', 'accepted'),
      ]);

      // O(1) lookups con Set en vez de O(n²) con .includes()
      const mySentSet = new Set<string>((followingRes.data ?? []).map((f: any) => f.following_id));
      const theirSet  = new Set<string>((followersRes.data ?? []).map((f: any) => f.follower_id));
      sentRequestIdsRef.current = mySentSet;
      setSentRequestIds(mySentSet);

      const mutualIds = [...mySentSet].filter(id => theirSet.has(id));
      const mutualSet = new Set<string>(mutualIds);
      setFriendIdSet(mutualSet);

      const friendsRes = mutualIds.length > 0
        ? await supabase.from('profiles').select('id,full_name,username,avatar_url,xp,level').in('id', mutualIds)
        : { data: [] };
      setMyFriends(friendsRes.data ?? []);

      await buildSmartSuggestions(user.id, mutualIds, mySentSet);
    } catch (e) {
      console.error('[my-friends] fetchInitialData:', e);
    } finally {
      hasLoaded.current = true;
      setLoading(false);
    }
  };

  /**
   * Construye sugerencias inteligentes (amigos de amigos).
   * Siempre respeta `dismissedRef.current` para que el refresh no
   * muestre usuarios ya descartados.
   */
  const buildSmartSuggestions = async (
    userId: string,
    friendIds: string[],
    sentIds: Set<string>,
  ) => {
    try {
      const dismissed = dismissedRef.current;
      let candidates: UserItemWithMutual[] = [];

      if (friendIds.length > 0) {
        const { data: fof } = await supabase
          .from('follows')
          .select('following_id')
          .in('follower_id', friendIds)
          .eq('status', 'accepted')
          .neq('following_id', userId);

        const friendSet = new Set(friendIds);
        const mutualCount: Record<string, number> = {};
        (fof ?? []).forEach((f: any) => {
          const id = f.following_id;
          if (!friendSet.has(id) && !sentIds.has(id) && !dismissed.has(id)) {
            mutualCount[id] = (mutualCount[id] ?? 0) + 1;
          }
        });

        const candidateIds = Object.entries(mutualCount)
          .sort(([, a], [, b]) => b - a)
          .map(([id]) => id)
          .slice(0, 30);

        if (candidateIds.length > 0) {
          const { data } = await supabase
            .from('profiles')
            .select('id,full_name,username,avatar_url,xp,level')
            .in('id', candidateIds)
            .or('is_private.is.null,is_private.eq.false');

          candidates = (data ?? [])
            .sort((a: any, b: any) => (mutualCount[b.id] ?? 0) - (mutualCount[a.id] ?? 0))
            .map((p: any) => ({ ...p, mutualCount: mutualCount[p.id] ?? 0 }));
        }
      }

      // Completar con usuarios de alta XP si faltan candidatos
      if (candidates.length < BATCH_SIZE) {
        const excludeSet = new Set([
          ...friendIds, ...sentIds, userId,
          ...candidates.map(c => c.id), ...dismissed,
        ]);
        const excludeParam = excludeSet.size > 0
          ? [...excludeSet].join(',')
          : '00000000-0000-0000-0000-000000000000';

        const { data } = await supabase
          .from('profiles')
          .select('id,full_name,username,avatar_url,xp,level')
          .neq('id', userId)
          .not('id', 'in', `(${excludeParam})`)
          .or('is_private.is.null,is_private.eq.false')
          .order('xp', { ascending: false })
          .limit(20);

        candidates = [...candidates, ...(data ?? []).map((p: any) => ({ ...p, mutualCount: 0 }))];
      }

      allCandidates.current = candidates;
      // Filtrar descartados y enviados al calcular el lote inicial
      const initial = candidates
        .filter(c => !sentIds.has(c.id) && !dismissed.has(c.id))
        .slice(0, BATCH_SIZE);
      setDisplayedSuggestions(initial);
    } catch (e) {
      console.error('[my-friends] buildSmartSuggestions:', e);
    }
  };

  /**
   * Descarta una sugerencia.
   * Bug original: llamaba a setDisplayedSuggestions dentro de setDismissedIds,
   * lo cual React (modo concurrente) puede ignorar o batchar de forma inesperada,
   * provocando que desaparezcan todas las tarjetas.
   * Fix: calcular ambos valores fuera de cualquier setState y llamarlos por separado.
   */
  const dismissSuggestion = useCallback((id: string) => {
    const next = new Set([...dismissedRef.current, id]);
    dismissedRef.current = next;
    setDismissedIds(next);
    // Persistir en AsyncStorage para sobrevivir refreshes y reinicios
    AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])).catch(() => {});

    // Recalcular el lote sin setState anidado
    const nextDisplay = allCandidates.current
      .filter(c => !next.has(c.id) && !sentRequestIdsRef.current.has(c.id))
      .slice(0, BATCH_SIZE);
    setDisplayedSuggestions(nextDisplay);
  }, []); // sin deps: usa refs siempre actualizadas

  const handleSearch = useCallback(async (text: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('id,full_name,username,avatar_url,xp,level')
        .neq('id', user.id)
        .or(`username.ilike.%${text}%,full_name.ilike.%${text}%`)
        .limit(20);
      setSearchResults(data ?? []);
    } catch (e) { console.error('[my-friends] search:', e); }
  }, []);

  const handleAddFriend = useCallback(async (targetId: string) => {
    // Optimistic update
    const next = new Set([...sentRequestIdsRef.current, targetId]);
    sentRequestIdsRef.current = next;
    setSentRequestIds(next);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('follows').insert({
        follower_id: user.id, following_id: targetId, status: 'pending',
      });
      if (error) throw error;

      // Deduplicar notificación
      await supabase.from('notifications').delete()
        .eq('user_id', targetId).eq('related_id', user.id).eq('type', 'friend_request');
      await supabase.from('notifications').insert({
        user_id: targetId, related_id: user.id, type: 'friend_request',
        title: 'Solicitud de Amistad', message: 'te ha enviado una solicitud de amistad.', is_read: false,
      });

      const { data: recipient } = await supabase
        .from('profiles').select('expo_push_token').eq('id', targetId).single();
      if (recipient?.expo_push_token) {
        await sendPushNotification(
          recipient.expo_push_token,
          'Solicitud de Amistad',
          '¡Alguien quiere conectar contigo en DyzGO!',
        );
      }
    } catch (e) {
      console.error('[my-friends] addFriend:', e);
      // Revertir optimistic update
      const reverted = new Set([...sentRequestIdsRef.current]);
      reverted.delete(targetId);
      sentRequestIdsRef.current = reverted;
      setSentRequestIds(reverted);
    }
  }, []);

  const handleRadar = useCallback(async () => {
    try {
      setConnecting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const { data: invite, error } = await supabase
        .from('friend_invites').insert({ sender_id: user.id, token }).select().single();
      if (error) throw error;
      const url = Linking.createURL('/add-friend', { queryParams: { inviteId: invite.id, token } });
      await Share.share(
        Platform.OS === 'ios'
          ? { url, message: `¡Conectemos en DyzGO! 🤜🤛 Acepta aqui: ${url}` }
          : { message: `¡Conectemos en DyzGO! 🤜🤛 Acepta aqui: ${url}` }
      );
    } catch (e) {
      console.error('[my-friends] radar:', e);
    } finally {
      setConnecting(false);
    }
  }, []);

  const showSearch = scope === 'Global' && searchQuery.trim().length > 0;

  const refreshCtrl = (
    <RefreshControl
      refreshing={refreshing} onRefresh={onRefresh}
      tintColor={COLORS.neonPink}
      colors={[COLORS.neonPink, COLORS.neonPink]}
      progressBackgroundColor="#111"
    />
  );

  return (
    <ReAnimated.View entering={FadeIn.duration(250)} style={{ flex: 1, backgroundColor: '#030303' }}>
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

      <NavBar
        title="SOCIAL"
        onBack={() => router.back()}
        right={
          Platform.OS === 'ios' ? (
            <TouchableOpacity style={s.radarBtn} onPress={handleRadar} disabled={connecting} activeOpacity={0.8}>
              {connecting
                ? <ActivityIndicator color="#FF31D8" size="small" />
                : <><Wifi color="#FF31D8" size={14} /><Text style={s.radarText}>RADAR</Text></>}
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Selector + búsqueda — floating */}
      <View style={{ position: 'absolute', top: navTop - 20, left: 0, right: 0, zIndex: 10, paddingHorizontal: 20 }}>
        {/* Selector Amigos / Global */}
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
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

        {scope === 'Global' && (
          <View style={s.searchBar}>
            <BlurView intensity={50} tint="dark" style={s.searchBlur}>
              <Search color="rgba(251,251,251,0.5)" size={16} />
              <TextInput
                placeholder="Buscar por nombre o @usuario..."
                placeholderTextColor="rgba(251,251,251,0.4)"
                style={s.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery !== '' && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                  <XIcon size={16} color="rgba(251,251,251,0.5)" />
                </TouchableOpacity>
              )}
            </BlurView>
          </View>
        )}
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY }] }}>
      {scope === 'Amigos' ? (
        // ── Lista vertical de amigos ─────────────────────────────────────────
        loading && myFriends.length === 0 ? (
          <View style={{ paddingHorizontal: 20, paddingTop: navTop + 36 }}>
            {[0, 1, 2, 3, 4].map(i => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                <SkeletonBox width={46} height={46} borderRadius={23} />
                <View style={{ flex: 1, gap: 6 }}>
                  <SkeletonBox height={14} borderRadius={6} width="55%" />
                  <SkeletonBox height={11} borderRadius={6} width="35%" />
                </View>
                <SkeletonBox width={70} height={28} borderRadius={10} />
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={myFriends}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[s.listContent, { paddingTop: navTop + 36 }]}
            removeClippedSubviews={true}
            maxToRenderPerBatch={8}
            windowSize={5}
            initialNumToRender={6}
            refreshControl={refreshCtrl}
            ListEmptyComponent={
              <View style={s.empty}>
                <View style={s.emptyIcon}><User color={COLORS.neonPink} size={40} /></View>
                <Text style={s.emptyTitle}>Aún no tienes amigos</Text>
                <Text style={s.emptyText}>Ve a "Global" o usa el Radar para conectar con personas.</Text>
              </View>
            }
            renderItem={({ item, index }) => (
              <ReAnimated.View entering={FadeInDown.duration(250).delay(Math.min(index * 40, 160)).springify()}>
                <FriendRow
                  item={item}
                  onPress={() => router.push({ pathname: '/user-profile', params: { id: item.id, name: item.full_name } })}
                />
              </ReAnimated.View>
            )}
          />
        )

      ) : showSearch ? (
        // ── Lista vertical de búsqueda ────────────────────────────────────────
        <FlatList
          style={{ flex: 1 }}
          data={searchResults}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.listContent, { paddingTop: navTop + 100 }]}
          removeClippedSubviews={true}
          maxToRenderPerBatch={8}
          windowSize={5}
          initialNumToRender={6}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={s.emptyIcon}><Search color={COLORS.neonPink} size={40} /></View>
              <Text style={s.emptyTitle}>Sin resultados</Text>
              <Text style={s.emptyText}>Intenta con otro nombre o @usuario.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <ReAnimated.View entering={FadeInDown.duration(250).delay(Math.min(index * 40, 160)).springify()}>
              <SearchRow
                item={item}
                isFriend={friendIdSet.has(item.id)}
                isRequestSent={sentRequestIds.has(item.id)}
                onPress={() => router.push({ pathname: '/user-profile', params: { id: item.id, name: item.full_name } })}
                onAdd={() => handleAddFriend(item.id)}
              />
            </ReAnimated.View>
          )}
        />

      ) : (
        // ── Lista vertical de sugerencias o estado vacío ──────────────────────
        <FlatList
          style={{ flex: 1 }}
          data={displayedSuggestions}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.listContent, { paddingTop: navTop + 100 }]}
          removeClippedSubviews={true}
          maxToRenderPerBatch={8}
          windowSize={5}
          initialNumToRender={6}
          refreshControl={refreshCtrl}
          ListHeaderComponent={displayedSuggestions.length > 0 ? (
            <Text style={[s.sectionLabel, { marginBottom: 14 }]}>SUGERIDOS PARA TI</Text>
          ) : null}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={s.emptyIcon}><Globe color={COLORS.neonPink} size={40} /></View>
              <Text style={s.emptyTitle}>Sin sugerencias</Text>
              <Text style={s.emptyText}>Usa el buscador para encontrar personas.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <ReAnimated.View entering={FadeInDown.duration(250).delay(Math.min(index * 40, 160)).springify()}>
              <SuggestionRow
                item={item}
                isRequestSent={sentRequestIds.has(item.id)}
                onPress={() => router.push({ pathname: '/user-profile', params: { id: item.id, name: item.full_name } })}
                onAdd={() => handleAddFriend(item.id)}
                onDismiss={() => dismissSuggestion(item.id)}
              />
            </ReAnimated.View>
          )}
        />
      )}
      </Animated.View>
    </ReAnimated.View>
  );
}

// ─── Estilos de filas compactas (FriendRow / SearchRow) ──────────────────────
const row = StyleSheet.create({
  wrap:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)', overflow: 'hidden' },
  ring:      { width: 52, height: 52, borderRadius: 26, borderWidth: 2, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', marginRight: 14, backgroundColor: 'rgba(255,49,216,0.2)' },
  avatar:    { width: 52, height: 52 },
  initials:  { color: '#FBFBFB', fontSize: 20, fontWeight: '800' },
  info:      { flex: 1 },
  name:      { color: '#FBFBFB', fontSize: 15, fontWeight: '700', letterSpacing: -0.5 },
  username:  { color: COLORS.textSecondary, fontSize: 12, fontWeight: '500', marginTop: 2 },
  levelPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginLeft: 8 },
  levelText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  badge:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: 1, marginLeft: 8 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  addBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.neonPink, justifyContent: 'center', alignItems: 'center', marginLeft: 8, shadowColor: COLORS.neonPink, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
});

// ─── Estilos de tarjeta grande (SuggestionCard) ───────────────────────────────
const sug = StyleSheet.create({
  card:      { width: '100%', height: 370, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'space-between', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  dismiss:   { position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  ring:      { width: 110, height: 110, borderRadius: 55, borderWidth: 3, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', marginTop: 24, shadowOpacity: 0.6, shadowRadius: 15, shadowOffset: { width: 0, height: 0 }, backgroundColor: 'rgba(255,49,216,0.2)' },
  avatar:    { width: 110, height: 110 },
  initials:  { color: '#FBFBFB', fontSize: 44, fontWeight: '900' },
  info:      { alignItems: 'center', gap: 8, paddingHorizontal: 10, width: '100%' },
  name:      { color: '#FBFBFB', fontSize: 22, fontWeight: '800', textAlign: 'center', letterSpacing: -0.5 },
  username:  { color: COLORS.textSecondary, fontSize: 14, fontWeight: '500', marginTop: -4 },
  levelPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, borderWidth: 1, marginTop: 4 },
  levelText: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  mutual:    { color: COLORS.neonPink, fontSize: 12, fontWeight: '700', marginTop: 5 },
  action:    { width: '100%', marginTop: 10 },
  chip:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 48, borderRadius: 16, borderWidth: 1 },
  chipText:  { fontSize: 14, fontWeight: '800' },
  addBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 48, borderRadius: 16, backgroundColor: COLORS.neonPink, shadowColor: COLORS.neonPink, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 12 },
  addBtnText:{ color: 'white', fontSize: 15, fontWeight: '800' },
});

// ─── Estilos globales de la pantalla ─────────────────────────────────────────
const s = StyleSheet.create({
  radarBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,49,216,0.15)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,49,216,0.35)' },
  radarText:   { color: '#FF31D8', fontSize: 13, fontWeight: '700' },
  searchBar:   { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(251,251,251,0.05)' },
  searchBlur:  { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.05)', gap: 8 },
  searchInput: { flex: 1, marginLeft: 4, color: '#FBFBFB', fontSize: 15, height: '100%' },
  sectionLabel:{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 10, textAlign: 'center' },
  carousel:    { paddingHorizontal: (width - CARD_W) / 2 - 8, alignItems: 'center', paddingBottom: 40 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40, flexGrow: 1 },
  empty:       { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyIcon:   { width: 86, height: 86, borderRadius: 43, backgroundColor: 'rgba(138, 43, 226, 0.1)', borderWidth: 1, borderColor: 'rgba(138, 43, 226, 0.3)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle:  { color: '#FBFBFB', fontSize: 20, fontWeight: '900', fontStyle: 'italic', textAlign: 'center', marginBottom: 8, letterSpacing: -1 },
  emptyText:   { color: COLORS.textZinc, fontSize: 14, textAlign: 'center', lineHeight: 22 },
});