import { getImageUrl } from '../../utils/format';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import {
  Bell, BellOff, Building2, Ghost, MapPin, Sparkles, Trash2, UserCheck
} from 'lucide-react-native';
import { Image } from 'expo-image';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Platform, Dimensions, PanResponder, ScrollView, StatusBar,
  StyleSheet, Text, TouchableOpacity, View, Alert, Switch } from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_H_PAD = 18;
const CARD_SIZE = Platform.OS === 'web' ? 400 : SCREEN_W - CARD_H_PAD * 2;
import PagerView from 'react-native-pager-view';
import ReAnimated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolation,
} from 'react-native-reanimated';

const AnimatedScrollView = ReAnimated.createAnimatedComponent(ScrollView);
const SNAP = CARD_SIZE + CARD_GAP;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from '../../components/BlurSurface';
import { NavBar } from '../../components/NavBar';
import { StaggeredItem } from '../../components/StaggeredItem';
import { COLORS } from '../../constants/colors';
import { useSaved } from '../../context/SavedContext';
import { SkeletonBox } from '../../components/SkeletonBox';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync } from '../../lib/push';
import { supabase } from '../../lib/supabase';
import { EmptyStateCard } from '../../components/EmptyStateCard';

const TABS = ['Productoras', 'Clubes'];

// ─── Module-level card components ────────────────────────────────────────────
// IMPORTANT: defined outside SavedScreen so their type identity is stable across
// parent re-renders. If defined inside, React unmounts/remounts them on every
// state change (e.g. setPushEnabled), re-triggering the entering animation → flash.

type ClubCardProps = {
  item: any; index: number; scrollY: any;
  onPress: () => void; onDelete: () => void;
};
const ClubCard = React.memo(({ item, index, scrollY, onPress, onDelete }: ClubCardProps) => {
  const animStyle = useAnimatedStyle(() => {
    const dist = Math.abs(scrollY.value - index * SNAP);
    const scale = interpolate(dist, [0, SNAP], [1, 0.88], Extrapolation.CLAMP);
    const opacity = interpolate(dist, [0, SNAP * 0.7], [1, 0.4], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });
  return (
    <ReAnimated.View style={[s.cardShadowWrap, animStyle]}>
      <ReAnimated.View entering={FadeInDown.duration(250).delay(Math.min(index * 40, 160)).springify()}>
        <TouchableOpacity style={s.mktCard} activeOpacity={0.88} onPress={onPress}>
          {(item.image_url || item.image)
            ? <Image source={{ uri: getImageUrl(item.image_url || item.image, 800) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }} />
            : <View style={s.cardPlaceholder} />}
          <LinearGradient colors={['transparent', 'rgba(3,3,3,0.65)', '#030303']} locations={[0.3, 0.65, 1]} style={s.mktOverlay}>
            <View style={{ alignItems: 'flex-end' }}>
              <TouchableOpacity style={s.mktTrashBtn} onPress={onDelete}>
                <BlurView intensity={35} tint="dark" style={[StyleSheet.absoluteFill, s.mktTrashBlur]}>
                  <Trash2 color="#ff4a4a" size={18} />
                </BlurView>
              </TouchableOpacity>
            </View>
            <View style={s.mktCardInfo}>
              <BlurView intensity={30} tint="dark" style={s.followingPill}>
                <UserCheck size={12} color={COLORS.neonPink} />
                <Text style={s.followingPillText}>Siguiendo</Text>
              </BlurView>
              <Text style={s.mktCardTitle} numberOfLines={1}>{item.name}</Text>
              {item.location && (
                <View style={s.cardLocation}>
                  <MapPin size={12} color={COLORS.textZinc} />
                  <Text style={s.cardLocationText} numberOfLines={1}>{item.location}</Text>
                </View>
              )}
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </ReAnimated.View>
    </ReAnimated.View>
  );
});

type BrandCardProps = {
  brand: any; index: number; scrollY: any;
  onPress: () => void; onDelete: () => void;
};
const BrandCard = React.memo(({ brand, index, scrollY, onPress, onDelete }: BrandCardProps) => {
  const logoColor = brand.primary_color ?? COLORS.neonPink;
  const animStyle = useAnimatedStyle(() => {
    const dist = Math.abs(scrollY.value - index * SNAP);
    const scale = interpolate(dist, [0, SNAP], [1, 0.88], Extrapolation.CLAMP);
    const opacity = interpolate(dist, [0, SNAP * 0.7], [1, 0.4], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });
  return (
    <ReAnimated.View style={[s.cardShadowWrap, animStyle]}>
      <ReAnimated.View entering={FadeInDown.duration(250).delay(Math.min(index * 40, 160)).springify()}>
        <TouchableOpacity style={s.mktCard} activeOpacity={0.88} onPress={onPress}>
          {brand.banner_url
            ? <Image source={{ uri: brand.banner_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }} />
            : <View style={s.cardPlaceholder} />}
          <LinearGradient colors={['rgba(0,0,0,0.18)', 'rgba(3,3,3,0.6)', '#030303']} locations={[0, 0.55, 1]} style={s.mktOverlay}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              {brand.logo_url ? (
                <View style={[s.brandLogoRing, { backgroundColor: COLORS.background, shadowColor: logoColor }]}>
                  <View style={s.brandLogoInner}>
                    <Image source={{ uri: getImageUrl(brand.logo_url, 120) }} style={s.brandLogoImg} contentFit="cover" transition={150} cachePolicy="memory-disk" placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }} />
                  </View>
                </View>
              ) : <View />}
              <TouchableOpacity style={s.mktTrashBtn} onPress={onDelete}>
                <BlurView intensity={35} tint="dark" style={[StyleSheet.absoluteFill, s.mktTrashBlur]}>
                  <Trash2 color="#ff4a4a" size={18} />
                </BlurView>
              </TouchableOpacity>
            </View>
            <View style={s.mktCardInfo}>
              <BlurView intensity={30} tint="dark" style={s.followingPill}>
                <UserCheck size={12} color={COLORS.neonPink} />
                <Text style={s.followingPillText}>Siguiendo</Text>
              </BlurView>
              <Text style={s.mktCardTitle} numberOfLines={1}>{brand.name}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </ReAnimated.View>
    </ReAnimated.View>
  );
});

export default function SavedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const {
    savedItems, toggleSave,
    savedBrands, toggleSaveBrand, toggleBrandPush,
    loading,
  } = useSaved();
  const [activeTab, setActiveTab] = useState(0);

  const brandsScrollY = useSharedValue(0.001);
  const clubsScrollY  = useSharedValue(0.001);
  const brandsScrollHandler = useAnimatedScrollHandler(e => { brandsScrollY.value = e.contentOffset.y; });
  const clubsScrollHandler  = useAnimatedScrollHandler(e => { clubsScrollY.value  = e.contentOffset.y; });

  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    const checkPushStatus = async () => {
      try {
        // 1. Verificar el permiso real en el sistema operativo iOS
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          // iOS tiene notificaciones apagadas — el toggle debe reflejar eso
          setPushEnabled(false);
          return;
        }

        // 2. Solo si iOS permite, verificar si tenemos token guardado en BD
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('profiles')
          .select('expo_push_token')
          .eq('id', user.id)
          .single();
        setPushEnabled(!!data?.expo_push_token);
      } catch {
        setPushEnabled(false);
      }
    };
    checkPushStatus();
  }, []);

  const toggleGlobalPush = async (val: boolean) => {
    setPushEnabled(val);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (val) {
      const token = await registerForPushNotificationsAsync(user.id);
      if (!token) {
        setPushEnabled(false);
        Alert.alert("Permisos necesarios", "Por favor habilita las notificaciones desde la configuración de tu teléfono para recibir alertas.");
        return;
      }
      await supabase.from('saved_brands').update({ push_enabled: true }).eq('user_id', user.id);
    } else {
      await supabase.from('profiles').update({ expo_push_token: null }).eq('id', user.id);
      await supabase.from('saved_brands').update({ push_enabled: false }).eq('user_id', user.id);
    }
  };

  const leftEdgePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dx > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderRelease: (_, gs) => { if (gs.dx > 40 || gs.vx > 0.5) router.back(); },
    })
  ).current;

  const onTabPress = (index: number) => {
    setActiveTab(index);
    pagerRef.current?.setPage(index);
  };

  const followedClubs = (savedItems as any[]).filter(i => i.type === 'club');

  // ─── GLOBAL PUSH TOGGLE ─────────────────────────────────────────────
  const GlobalPushToggle = () => (
    <View style={[s.pushToggleRow, { overflow: 'hidden' }]}>
      <BlurView intensity={50} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 20 }]} />
      <View style={s.pushToggleInfo}>
        <View style={s.pushToggleIcon}>
          <Bell color={pushEnabled ? COLORS.neonPink : COLORS.textZinc} size={18} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.pushToggleTitle}>Recordatorios</Text>
          <Text style={s.pushToggleSub}>Recibe notificaciones de nuevos eventos que tus productoras o clubes favoritos publiquen</Text>
        </View>
      </View>
      <Switch
        value={pushEnabled}
        onValueChange={toggleGlobalPush}
        trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#7B1E6B' }}
        thumbColor={pushEnabled ? COLORS.neonPink : '#FBFBFB'}
        ios_backgroundColor='rgba(255,255,255,0.1)'
      />
    </View>
  );

  // ─── EMPTY STATE ────────────────────────────────────────────
  const EmptyState = ({ label, subtitle }: { label: string; subtitle: string }) => (
    <ReAnimated.View entering={FadeIn.duration(250)} style={{ flex: 1, marginTop: 40 }}>
      <EmptyStateCard
        icon={<Ghost color={COLORS.neonPink} size={40} strokeWidth={1.5} />}
        title={label}
        subtitle={subtitle}
        actionText="EXPLORAR AHORA"
        onAction={() => router.navigate('/(tabs)/explore')}
        marginTop={0}
      />
    </ReAnimated.View>
  );

  const HEADER_H = insets.top + 152;
  const TABS_TOP  = insets.top + 82;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ANTIGRAVITY LIGHTING */}
      {Platform.OS !== 'web' && (
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <LinearGradient colors={['rgba(255,49,216,0.15)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFillObject} />
        <LinearGradient colors={['transparent', 'rgba(255,49,216,0.1)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
        <LinearGradient colors={['transparent', 'rgba(255,49,216,0.05)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFillObject} />
      </View>
      )}

      <View style={s.leftEdge} {...leftEdgePan.panHandlers} />

      <PagerView
        style={StyleSheet.absoluteFill}
        ref={pagerRef}
        onPageSelected={e => setActiveTab(e.nativeEvent.position)}
      >
        {/* TAB 0: PRODUCTORAS */}
        <View key="productoras" style={[s.page, Platform.OS === 'web' && activeTab !== 0 && { display: 'none' }]}>
          <AnimatedScrollView
            contentContainerStyle={[s.scrollContent, { paddingTop: HEADER_H }]}
            showsVerticalScrollIndicator={false}
            snapToInterval={SNAP}
            decelerationRate="fast"
            onScroll={brandsScrollHandler}
            scrollEventThrottle={16}
            removeClippedSubviews={false}
          >
            <GlobalPushToggle />
            {savedBrands.length === 0
              ? <EmptyState label="Sin productoras" subtitle="Sigue productoras desde su perfil para recibir notificaciones de nuevos eventos." />
              : <View style={s.cardsGrid}>{savedBrands.map((brand, i) => <BrandCard key={brand.experience_id} brand={brand} index={i} scrollY={brandsScrollY} onPress={() => router.push({ pathname: '/brand-profile', params: { id: brand.experience_id } })} onDelete={() => toggleSaveBrand(brand.experience_id, brand)} />)}</View>}
          </AnimatedScrollView>
        </View>

        {/* TAB 1: CLUBES */}
        <View key="clubes" style={[s.page, Platform.OS === 'web' && activeTab !== 1 && { display: 'none' }]}>
          <AnimatedScrollView
            contentContainerStyle={[s.scrollContent, { paddingTop: HEADER_H }]}
            showsVerticalScrollIndicator={false}
            snapToInterval={SNAP}
            decelerationRate="fast"
            onScroll={clubsScrollHandler}
            scrollEventThrottle={16}
            removeClippedSubviews={false}
          >
            <GlobalPushToggle />
            {followedClubs.length === 0
              ? <EmptyState label="Sin clubes" subtitle="Sigue tus lugares favoritos desde su perfil." />
              : <View style={s.cardsGrid}>{followedClubs.map((item: any, i: number) => <ClubCard key={item.id} item={item} index={i} scrollY={clubsScrollY} onPress={() => router.push({ pathname: '/club-detail', params: { id: item.id } })} onDelete={() => toggleSave(item.id, 'club')} />)}</View>}
          </AnimatedScrollView>
        </View>
      </PagerView>

      <NavBar title="SEGUIDOS" onBack={() => router.back()} />

      {/* TABS SELECTOR PREMIUM */}
      <View style={[s.tabsFloating, { top: TABS_TOP }]}>
        <View style={{ overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(251,251,251,0.06)' }}>
          <BlurView intensity={50} tint="dark" style={{ flexDirection: 'row', height: 44, padding: 4, gap: 2 }}>
            {TABS.map((tab, idx) => {
              const active = activeTab === idx;
              const Icon = idx === 0 ? Sparkles : Building2;
              return (
                <TouchableOpacity
                  key={tab}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: active ? 'rgba(255,255,255,0.12)' : 'transparent' }}
                  onPress={() => onTabPress(idx)}
                  activeOpacity={0.8}
                >
                  <Icon size={14} color={active ? '#FF31D8' : 'rgba(251,251,251,0.45)'} />
                  <Text style={{ color: active ? '#FBFBFB' : 'rgba(251,251,251,0.45)', fontWeight: active ? '800' : '600', fontSize: 13 }}>{tab}</Text>
                </TouchableOpacity>
              );
            })}
          </BlurView>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : COLORS.background },
  leftEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 25, zIndex: 999 },
  page: { flex: 1, width: Platform.OS === 'web' ? '100%' : undefined },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 110, alignItems: Platform.OS === 'web' ? 'center' : undefined },

  tabsFloating: { position: 'absolute', left: 0, right: 0, zIndex: 10, alignItems: 'center' },
  tabsContainer: {},
  tab: {},
  tabActiveBg: {},
  tabText: {},
  tabTextActive: {},

  // ── Global Push Toggle ──
  pushToggleRow: {
    width: Platform.OS === 'web' ? 400 : undefined,
    alignSelf: Platform.OS === 'web' ? 'center' : 'auto',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20, marginHorizontal: 0,
  },
  pushToggleInfo: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1, marginRight: 12 },
  pushToggleIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  pushToggleTitle: { color: COLORS.textWhite, fontSize: 15, fontWeight: '800' },
  pushToggleSub: { color: 'rgba(251,251,251,0.6)', fontSize: 11, marginTop: 3, lineHeight: 16 },

  // ── Marketplace-style Cards ──
  cardsGrid: { gap: 0, alignItems: Platform.OS === 'web' ? 'center' : 'stretch' },

  cardShadowWrap: {
    paddingVertical: 8,
    borderRadius: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 10,
  },
  mktCard: {
    width: CARD_SIZE, height: CARD_SIZE,
    borderRadius: 28, overflow: 'hidden',
    backgroundColor: '#0A0A0A',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  mktCardImg: { flex: 1, overflow: 'hidden' },
  mktOverlay: { ...StyleSheet.absoluteFillObject, padding: 18, justifyContent: 'space-between' },
  mktCardInfo: { gap: 6 },
  mktCardTitle: {
    color: COLORS.textWhite, fontSize: 24, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5,
  },
  mktTrashBtn: {
    width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
  },
  mktTrashBlur: {
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,74,74,0.15)',
  },

  cardPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,49,216,0.05)',
  },
  followingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    overflow: 'hidden', alignSelf: 'flex-start',
  },
  followingPillText: { color: COLORS.textWhite, fontSize: 11, fontWeight: '800' },
  cardLocation: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardLocationText: { color: 'rgba(251,251,251,0.6)', fontSize: 13, fontWeight: '500' },

  // Brand logo ring (top-left of image)
  brandLogoRing: {
    width: 56, height: 56, borderRadius: 28,
    padding: 3,
    shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  brandLogoInner: {
    width: '100%', height: '100%', borderRadius: 25,
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#111',
  },
  brandLogoImg: { width: '100%', height: '100%' },
  


  // ── Empty state ──
  emptyWrap: {
    flex: 1, marginTop: 60,
    alignItems: 'center', paddingHorizontal: 32, paddingBottom: 40,
  },
  emptyIcon: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,49,216,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,49,216,0.25)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 24,
  },
  emptyTitle: {
    color: COLORS.textWhite, fontSize: 24, fontWeight: '900',
    letterSpacing: -0.5, marginBottom: 10,
  },
  emptySubtitle: {
    color: 'rgba(251,251,251,0.6)', fontSize: 14, textAlign: 'center',
    lineHeight: 22, marginBottom: 30,
  },
  emptyBtn: {
    backgroundColor: COLORS.textWhite, paddingHorizontal: 32,
    paddingVertical: 14, borderRadius: 100,
  },
  emptyBtnText: { color: '#000', fontSize: 15, fontWeight: '900' },
});
