import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { Check, UserCheck, UserPlus, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import ReAnimated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { SkeletonBox } from '../../components/SkeletonBox';
import { Image } from 'expo-image';
import { Alert, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../../constants/colors';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');

const AmbientBg = () => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <LinearGradient colors={['rgba(255, 49, 216, 0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
    <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    <LinearGradient colors={['transparent', 'rgba(255, 49, 216, 0.05)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFill} />
  </View>
);

export default function AddFriendScreen() {
  const { inviteId, token } = useLocalSearchParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [sender, setSender] = useState<any>(null);
  const [status, setStatus] = useState<'pending' | 'success' | 'error' | 'already_friends'>('pending');

  useEffect(() => {
    if (inviteId && token) {
      resetAndVerify();
    } else if (!loading && (!inviteId || !token)) {
      setStatus('error');
    }
  }, [inviteId, token]);

  const resetAndVerify = () => {
    setLoading(true);
    setStatus('pending');
    setSender(null);
    verifyInvite();
  };

  const verifyInvite = async () => {
    try {
      const { data: invite, error } = await supabase
        .from('friend_invites')
        .select('*')
        .eq('id', inviteId)
        .single();

      if (error || !invite) throw new Error("Invitación no encontrada");
      if (invite.token !== token) throw new Error("Token inválido");

      const { data: senderProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', invite.sender_id)
        .single();

      if (profileError || !senderProfile) throw new Error("Perfil no encontrado");

      setSender(senderProfile);

      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: friendship } = await supabase
          .from('follows')
          .select('status')
          .match({ follower_id: user.id, following_id: senderProfile.id })
          .single();

        if (friendship?.status === 'accepted') {
          setStatus('already_friends');
          setLoading(false);
          return;
        }
      }

      if (invite.is_used) throw new Error("Esta invitación ya expiró");
      setLoading(false);

    } catch (e) {
      console.error("Error verify:", e);
      setStatus('error');
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Acceso denegado", "Debes iniciar sesión.");
        setLoading(false);
        return;
      }

      if (user.id === sender.id) {
        Alert.alert("Error", "No puedes agregarte a ti mismo.");
        setLoading(false);
        return;
      }

      const { error: followError1 } = await supabase
        .from('follows')
        .insert({ follower_id: user.id, following_id: sender.id, status: 'accepted' });

      const { error: followError2 } = await supabase
        .from('follows')
        .insert({ follower_id: sender.id, following_id: user.id, status: 'accepted' });

      if (followError1 && followError1.code !== '23505') throw followError1;
      if (followError2 && followError2.code !== '23505') throw followError2;

      await supabase.from('friend_invites').update({ is_used: true }).eq('id', inviteId);

      await supabase.from('notifications').insert({
        user_id: sender.id,
        related_id: user.id,
        type: 'friend_connected',
        title: '¡Conexión Exitosa!',
        message: `${user.email} aceptó tu invitación de radar.`,
        is_read: false,
      });

      setStatus('success');

    } catch (e) {
      console.error("Error handleAccept:", e);
      Alert.alert("Error", "Hubo un problema al conectar.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <View style={styles.container}>
      <AmbientBg />
      <View style={{ alignItems: 'center', gap: 16, width: '100%', paddingHorizontal: 24 }}>
        <SkeletonBox height={80} width={80} borderRadius={40} />
        <SkeletonBox height={24} borderRadius={6} width="50%" />
        <SkeletonBox height={16} borderRadius={6} width="35%" />
        <SkeletonBox height={16} borderRadius={6} width="80%" style={{ marginTop: 4 }} />
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' }}>
          <SkeletonBox height={52} borderRadius={16} style={{ flex: 1 }} />
          <SkeletonBox height={52} borderRadius={16} style={{ flex: 2 }} />
        </View>
      </View>
    </View>
  );

  if (status === 'already_friends') return (
    <View style={styles.container}>
      <AmbientBg />
      <View style={styles.stateCard}>
        <View style={styles.iconCircle}>
          <UserCheck color={COLORS.neonPink} size={38} />
        </View>
        <Text style={styles.stateTitle}>Ya son amigos</Text>
        <Text style={styles.stateSub}>No se puede ejecutar esta acción, ustedes ya están conectados.</Text>
      </View>
      <TouchableOpacity style={styles.btn} onPress={() => router.replace('/my-friends')}>
        <Text style={styles.btnText}>Volver a mis amigos</Text>
      </TouchableOpacity>
    </View>
  );

  if (status === 'error') return (
    <View style={styles.container}>
      <AmbientBg />
      <View style={styles.stateCard}>
        <View style={[styles.iconCircle, styles.iconCircleError]}>
          <X color="#FF4444" size={38} />
        </View>
        <Text style={styles.stateTitle}>Enlace inválido</Text>
        <Text style={styles.stateSub}>Esta invitación expiró o el código es incorrecto.</Text>
      </View>
      <TouchableOpacity style={styles.btn} onPress={() => router.replace('/home')}>
        <Text style={styles.btnText}>Volver al Inicio</Text>
      </TouchableOpacity>
    </View>
  );

  if (status === 'success') return (
    <View style={styles.container}>
      <AmbientBg />
      <View style={styles.stateCard}>
        <View style={[styles.iconCircle, styles.iconCircleSuccess]}>
          <Check color="#00FF88" size={38} />
        </View>
        <Text style={styles.stateTitle}>¡CONECTADOS!</Text>
        <Text style={styles.stateSub}>Ahora tú y {sender?.full_name} son amigos.</Text>
      </View>
      <TouchableOpacity style={styles.btn} onPress={() => router.replace('/my-friends')}>
        <Text style={styles.btnText}>Ir a Mis Amigos</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ReAnimated.View entering={FadeIn.duration(250)} style={styles.container}>
      <AmbientBg />
      <ReAnimated.View entering={FadeInUp.duration(300).delay(0).springify()} style={styles.card}>
        <View style={styles.avatarContainer}>
          {sender?.avatar_url
            ? <Image source={{ uri: sender.avatar_url }} style={styles.avatar} contentFit="cover" transition={150} cachePolicy="memory-disk" />
            : <View style={[styles.avatar, { backgroundColor: 'rgba(255,49,216,0.2)', justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: '#FBFBFB', fontWeight: '800', fontSize: 36 }}>
                  {sender?.full_name?.[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
          }
          <View style={styles.badge}>
            <UserPlus color="white" size={18} />
          </View>
        </View>
        <Text style={styles.name}>{sender?.full_name}</Text>
        <Text style={styles.username}>@{sender?.username || 'usuario'}</Text>
        <Text style={styles.label}>Quiere conectar contigo inmediatamente.</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.rejectBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.replace('/home'); }}>
            <X color={COLORS.textZinc} size={22} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.acceptBtn}
            activeOpacity={0.65}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleAccept(); }}
          >
            <Text style={styles.acceptText}>CONECTAR</Text>
          </TouchableOpacity>
        </View>
      </ReAnimated.View>
    </ReAnimated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', padding: 24 },

  card: {
    width: width * 0.85,
    backgroundColor: COLORS.glassBg,
    borderRadius: 30,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },

  avatarContainer: { marginBottom: 20 },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: COLORS.neonPink },
  badge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: COLORS.neonPink,
    width: 34, height: 34, borderRadius: 17,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: COLORS.background,
  },

  name: { color: COLORS.textWhite, fontSize: 24, fontWeight: '900', fontStyle: 'italic', textAlign: 'center', letterSpacing: -1 },
  username: { color: COLORS.textZinc, fontSize: 15, marginTop: 4, textAlign: 'center' },
  label: { color: COLORS.textZinc, marginTop: 16, marginBottom: 28, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  actions: { flexDirection: 'row', gap: 12, width: '100%' },

  rejectBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  acceptBtn: {
    flex: 1, height: 56, borderRadius: 16,
    backgroundColor: 'rgba(255,49,216,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,49,216,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  acceptText: { color: COLORS.neonPink, fontWeight: '900', fontSize: 14, letterSpacing: 1 },

  // Estado screens
  stateCard: {
    backgroundColor: COLORS.glassBg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(138, 43, 226, 0.1)',
    borderWidth: 1, borderColor: 'rgba(138, 43, 226, 0.3)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 18,
  },
  iconCircleError: { backgroundColor: 'rgba(255,68,68,0.1)', borderColor: 'rgba(255,68,68,0.3)' },
  iconCircleSuccess: { backgroundColor: 'rgba(0,255,136,0.1)', borderColor: 'rgba(0,255,136,0.3)' },

  stateTitle: { color: COLORS.textWhite, fontSize: 26, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, textAlign: 'center', marginBottom: 10 },
  stateSub: { color: COLORS.textZinc, fontSize: 14, textAlign: 'center', lineHeight: 22 },

  btn: {
    width: '100%', height: 58, borderRadius: 20,
    backgroundColor: 'rgba(255,49,216,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,49,216,0.35)',
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
  },
  btnText: { color: '#FF31D8', fontWeight: '900', fontSize: 15 },
});
