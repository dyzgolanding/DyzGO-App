import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import {
  Check, ChevronRight, Instagram, Star,
  UserCheck, UserMinus, UserPlus, X,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import ReAnimated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import {
  Alert,
  Dimensions, ScrollView, StatusBar,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import { sendPushNotification } from '../../lib/push';
import { supabase } from '../../lib/supabase';
import { SkeletonBox } from '../../components/SkeletonBox';

const { width } = Dimensions.get('window');

const LEVEL_COLORS: Record<number, string> = {
  1: '#8A2BE2', 2: '#9D50BB', 3: '#4776E6', 4: '#00B4DB',
  5: '#56ab2f', 6: '#f7971e', 7: '#eb3349', 8: '#FF512F',
  9: '#1A2980', 10: '#FFD700',
};
const LEVEL_LABELS: Record<number, string> = {
  1: 'Novato', 2: 'Iniciado', 3: 'Avanzado', 4: 'Constante', 5: 'Elite',
  6: 'Experto', 7: 'Maestro', 8: 'Leyenda', 9: 'Mitico', 10: 'Inmortal',
};

type FriendState = 'none' | 'request_sent' | 'request_received' | 'friends';

export default function UserProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const navTop = useNavBarPaddingTop();
  const { id: profileId, name: initialName } = useLocalSearchParams<{ id: string; name: string }>();

  const [loading, setLoading] = useState(true);
  const [friendState, setFriendState] = useState<FriendState>('none');
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [mutualCount, setMutualCount] = useState(0);
  const [mutualAvatars, setMutualAvatars] = useState<string[]>([]);

  const [profile, setProfile] = useState({
    full_name: initialName || 'Usuario',
    username: '',
    xp: 0,
    level: 1,
    avatar_url: null as string | null,
    instagram_username: null as string | null,
  });

  useEffect(() => { if (profileId) loadAll(); }, [profileId]);

  async function loadAll() {
    await Promise.all([fetchProfile(), checkFriendship(), fetchMutualFriends()]);
    setLoading(false);
  }

  async function fetchMutualFriends() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.id === profileId) return;

      // Amigos míos y amigos de la otra persona
      const [myF, theirF] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', user.id).eq('status', 'accepted'),
        supabase.from('follows').select('following_id').eq('follower_id', profileId).eq('status', 'accepted'),
      ]);

      const myFriendSet = new Set(myF.data?.map(f => f.following_id) ?? []);
      const theirFriendIds = theirF.data?.map(f => f.following_id) ?? [];
      const mutualIds = theirFriendIds.filter(id => myFriendSet.has(id));

      setMutualCount(mutualIds.length);

      if (mutualIds.length > 0) {
        const { data } = await supabase.from('profiles')
          .select('avatar_url')
          .in('id', mutualIds.slice(0, 3));
        setMutualAvatars(data?.map((p: any) => p.avatar_url).filter(Boolean) ?? []);
      }
    } catch (e) {
      console.error('[user-profile] fetchMutualFriends:', e);
    }
  }

  async function fetchProfile() {
    try {
      const { data } = await supabase.from('profiles')
        .select('full_name,username,xp,level,avatar_url,instagram_username')
        .eq('id', profileId)
        .single();
      if (data) setProfile(data as typeof profile);
    } catch (e) {
      console.error('[user-profile] fetchProfile:', e);
    }
  }

  async function checkFriendship() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !profileId) return;
      if (user.id === profileId) { setIsOwnProfile(true); return; }

      const { data } = await supabase.from('follows').select('*')
        .or(`and(follower_id.eq.${user.id},following_id.eq.${profileId}),and(follower_id.eq.${profileId},following_id.eq.${user.id})`);

      const iSent    = data?.find(r => r.follower_id === user.id);
      const theySent = data?.find(r => r.follower_id === profileId);

      if (iSent?.status === 'accepted' && theySent?.status === 'accepted') setFriendState('friends');
      else if (iSent?.status === 'pending') setFriendState('request_sent');
      else if (theySent?.status === 'pending') setFriendState('request_received');
      else setFriendState('none');
    } catch (e) {
      console.error('[user-profile] checkFriendship:', e);
    }
  }

  // Función para manejar las acciones principales (Agregar, Cancelar, Aceptar)
  const handleAction = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      if (friendState === 'none') {
        const { error } = await supabase.from('follows').insert({ follower_id: user.id, following_id: profileId, status: 'pending' });
        if (!error) {
          // Borrar notificación previa del mismo tipo antes de insertar (evita duplicados si reenvía)
          await supabase.from('notifications')
            .delete()
            .eq('user_id', profileId)
            .eq('related_id', user.id)
            .eq('type', 'friend_request');
          await supabase.from('notifications').insert({ user_id: profileId, related_id: user.id, type: 'friend_request', title: 'Solicitud de Amistad', message: 'quiere ser tu amigo', is_read: false });
          // Push al destinatario
          const { data: target } = await supabase.from('profiles').select('expo_push_token, full_name').eq('id', profileId).single();
          if (target?.expo_push_token) {
            sendPushNotification(target.expo_push_token, 'Solicitud de Amistad', `Alguien quiere conectar contigo en DyzGO`, { url: '/notifications' }).catch(console.error);
          }
          setFriendState('request_sent');

        }
      } else if (friendState === 'request_sent') {
        await supabase.from('follows').delete().match({ follower_id: user.id, following_id: profileId });
        // Borrar la notificación de solicitud al cancelar
        await supabase.from('notifications')
          .delete()
          .eq('user_id', profileId)
          .eq('related_id', user.id)
          .eq('type', 'friend_request');
        setFriendState('none');
      } else if (friendState === 'request_received') {
        const [e1, e2] = await Promise.all([
          supabase.from('follows').update({ status: 'accepted' }).match({ follower_id: profileId, following_id: user.id }),
          supabase.from('follows').insert({ follower_id: user.id, following_id: profileId, status: 'accepted' }),
        ]);
        if (!e1.error && !e2.error) {
          setFriendState('friends');

          await supabase.from('notifications').insert({ user_id: profileId, related_id: user.id, type: 'new_friend', title: '¡Solicitud Aceptada!', message: 'aceptó tu solicitud de amistad.', is_read: false });
          // Push al que envió la solicitud original
          const { data: requester } = await supabase.from('profiles').select('expo_push_token').eq('id', profileId).single();
          if (requester?.expo_push_token) {
            sendPushNotification(requester.expo_push_token, '¡Ya son amigos!', 'Tu solicitud de amistad fue aceptada.', { url: `/user-profile?id=${user.id}` }).catch(console.error);
          }
        }
      } else if (friendState === 'friends') {
        // Ya son amigos
      }
    } catch (e) {
      console.error('[user-profile] action:', e);
      Alert.alert('Error', 'No se pudo completar la acción');
    }
  };

  // Función exclusiva para eliminar al amigo
  const handleUnfriend = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    Alert.alert('Terminar Amistad', `¿Seguro que quieres eliminar a ${profile.full_name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await Promise.all([
            supabase.from('follows').delete().match({ follower_id: user.id, following_id: profileId }),
            supabase.from('follows').delete().match({ follower_id: profileId, following_id: user.id }),
          ]);
          setFriendState('none');
        } catch (e) {
          console.error('[user-profile] unfriend:', e);
          Alert.alert('Error', 'No se pudo eliminar al amigo');
        }
      }},
    ]);
  };

  const lc = LEVEL_COLORS[profile.level] ?? COLORS.neonPurple;
  const initials = profile.full_name?.[0]?.toUpperCase() ?? '?';

  // Button config
  const BTN_CONFIG = {
    none:             { label: 'AGREGAR AMIGO',       Icon: UserPlus,  gradient: false, bg: 'rgba(255,49,216,0.15)',       border: 'rgba(255,49,216,0.35)',    textColor: '#FF31D8' },
    request_sent:     { label: 'CANCELAR SOLICITUD',  Icon: X,         gradient: false, bg: 'rgba(255,255,255,0.05)',      border: 'rgba(251,251,251,0.05)',  textColor: COLORS.textSecondary },
    request_received: { label: 'ACEPTAR SOLICITUD',   Icon: Check,     gradient: true,  bg: null,                         border: null,                      textColor: 'white' },
    friends:          { label: 'AMIGOS',              Icon: UserCheck, gradient: false, bg: 'rgba(0,255,136,0.08)',        border: '#00FF88',                 textColor: '#00FF88' },
  }[friendState];

  return (
    <ReAnimated.View entering={FadeIn.duration(250)} style={{ flex: 1, backgroundColor: '#030303' }}>
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

      <NavBar onBack={() => router.back()} />

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40, paddingTop: navTop, flexGrow: 1, justifyContent: 'center' }]} showsVerticalScrollIndicator={false}>

        {/* AVATAR + NOMBRE */}
        {loading ? (
          <View style={[s.heroSection, { gap: 14 }]}>
            <SkeletonBox width={96} height={96} borderRadius={48} />
            <SkeletonBox height={22} width={160} borderRadius={7} />
            <SkeletonBox height={14} width={100} borderRadius={5} />
            <SkeletonBox height={26} width={130} borderRadius={13} />
          </View>
        ) : (
        <ReAnimated.View entering={FadeInUp.duration(300).delay(0).springify()}>
        <View style={s.heroSection}>
          {/* Anillo del avatar con color de nivel */}
          <View style={[s.avatarOuter, { borderColor: lc, shadowColor: lc }]}>
            <LinearGradient colors={[lc + '50', lc + '15', 'transparent']} style={StyleSheet.absoluteFill} />
            <View style={s.avatarInner}>
              {profile.avatar_url
                ? <Image source={{ uri: profile.avatar_url }} style={s.avatarImg} contentFit="cover" transition={150} cachePolicy="memory-disk" />
                : <Text style={s.avatarChar}>{initials}</Text>
              }
            </View>
          </View>

          <Text style={s.name}>{profile.full_name}</Text>
          <Text style={s.username}>@{profile.username || 'usuario'}</Text>

          {/* Nivel + rango */}
          <View style={[s.rankChip, { backgroundColor: lc + '20', borderColor: lc + '50' }]}>
            <Star color={lc} size={12} />
            <Text style={[s.rankText, { color: lc }]}>NIVEL {profile.level} · {LEVEL_LABELS[profile.level] ?? 'Novato'}</Text>
          </View>
        </View>
        </ReAnimated.View>
        )}

        {/* AMIGOS EN COMÚN */}
        {!isOwnProfile && mutualCount > 0 && (
          <ReAnimated.View entering={FadeInUp.duration(300).delay(80).springify()}>
          <View style={s.mutualRow}>
            <View style={s.mutualAvatars}>
              {mutualAvatars.slice(0, 3).map((url, i) => (
                <Image
                  key={i}
                  source={{ uri: url }}
                  style={[s.mutualAvatar, { marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i }]}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                />
              ))}
            </View>
            <Text style={s.mutualText}>
              {mutualCount === 1 ? '1 amigo en común' : `${mutualCount} amigos en común`}
            </Text>
          </View>
          </ReAnimated.View>
        )}

        {/* INSTAGRAM */}
        {profile.instagram_username && (
          <ReAnimated.View entering={FadeInUp.duration(300).delay(160).springify()}>
          <TouchableOpacity
            style={s.igPill}
            onPress={() => {
              const handle = (profile.instagram_username ?? '')
                .replace('@', '')
                .trim()
                .replace(/[^a-zA-Z0-9_.]/g, '');
              if (handle) Linking.openURL(`https://instagram.com/${handle}`);
            }}
            activeOpacity={0.8}
          >
            <Instagram color={COLORS.neonPink} size={18} />
            <Text style={s.igText}>@{profile.instagram_username}</Text>
            <View style={s.igArrow}>
              <ChevronRight color={COLORS.textSecondary} size={14} />
            </View>
          </TouchableOpacity>
          </ReAnimated.View>
        )}

        {/* BOTÓN DE AMISTAD */}
        {!isOwnProfile && (
          <ReAnimated.View entering={FadeInUp.duration(300).delay(240).springify()}>
          <View>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: BTN_CONFIG.bg ?? 'transparent', borderColor: BTN_CONFIG.border ?? 'transparent' }]}
              onPress={handleAction}
              activeOpacity={0.85}
            >
              {BTN_CONFIG.gradient && (
                <LinearGradient
                  colors={friendState === 'request_received' ? ['#00B090', '#00FF88'] : [COLORS.neonPurple, COLORS.neonPink]}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                />
              )}
              <BTN_CONFIG.Icon color={BTN_CONFIG.textColor} size={20} />
              <Text style={[s.actionText, { color: BTN_CONFIG.textColor }]}>{BTN_CONFIG.label}</Text>
            </TouchableOpacity>
          </View>
          </ReAnimated.View>
        )}

        {/* Ya somos amigos – botón eliminar secundario */}
        {friendState === 'friends' && !isOwnProfile && (
          <TouchableOpacity style={s.unfriendBtn} onPress={handleUnfriend}>
            <UserMinus color="rgba(255,60,60,0.6)" size={14} />
            <Text style={s.unfriendText}>Eliminar amigo</Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </ReAnimated.View>
  );
}

const s = StyleSheet.create({

  scroll:       { paddingHorizontal: 24, paddingTop: 0, gap: 20 },

  // Glow de fondo con color del nivel
  levelGlow:    { position: 'absolute', top: -60, left: width / 2 - 120, width: 240, height: 240, borderRadius: 120, opacity: 0.12, zIndex: 0 },

  // Hero
  heroSection:  { alignItems: 'center', gap: 8 },
  avatarOuter:  { width: 120, height: 120, borderRadius: 60, borderWidth: 2.5, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 24, elevation: 12, marginBottom: 4 },
  avatarInner:  { width: 110, height: 110, borderRadius: 55, backgroundColor: '#030303', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImg:    { width: 110, height: 110 },
  avatarChar:   { color: '#FBFBFB', fontSize: 44, fontWeight: '900' },
  name:         { color: '#FBFBFB', fontSize: 28, fontWeight: '900', fontStyle: 'italic', textAlign: 'center', letterSpacing: -1 },
  username:     { color: COLORS.textSecondary, fontSize: 15, marginTop: -2 },
  rankChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, marginTop: 4 },
  rankText:     { fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  // Stats
  statsRow:     { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(251,251,251,0.05)', padding: 20 },
  statItem:     { flex: 1, alignItems: 'center', gap: 4 },
  statValue:    { color: '#FBFBFB', fontSize: 18, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1 },
  statLabel:    { color: COLORS.textSecondary, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  statDivider:  { width: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 2 },

  // Instagram
  igPill:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 18, borderWidth: 1, borderColor: 'rgba(251,251,251,0.05)' },
  igText:       { color: '#FBFBFB', fontSize: 14, fontWeight: '500', flex: 1 },
  igArrow:      { opacity: 0.5 },

  // Action button
  actionBtn:    { height: 58, borderRadius: 22, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 10, borderWidth: 1, overflow: 'hidden', shadowColor: COLORS.neonPink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
  actionText:   { fontSize: 15, fontWeight: '900', letterSpacing: 1, fontStyle: 'italic' },

  // Amigos en común
  mutualRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(251,251,251,0.05)' },
  mutualAvatars: { flexDirection: 'row' },
  mutualAvatar:  { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#030303' },
  mutualText:    { color: COLORS.textSecondary, fontSize: 12, fontWeight: '500', flex: 1 },

  // Unfriend
  unfriendBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: -8 },
  unfriendText: { color: 'rgba(255,60,60,0.5)', fontSize: 12, fontWeight: '500' },
});