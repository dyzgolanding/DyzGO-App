import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import { ArrowLeft, Check, ChevronRight, Copy, Crown, Gift, Info, Instagram, Navigation, Share2, Sparkles, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Animated as RNAnimated,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from '../../components/BlurSurface';
import { PressableScale } from '../../components/animated/PressableScale';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../constants/colors';
import { getImageUrl } from '../../utils/format';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';


const { width: windowWidth } = Dimensions.get('window');
const ACCENT2 = '#FF31D8';
interface VenueZone {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  is_vip: boolean;
  sort_order: number;
  table_count?: number;
}


interface VenueData {
  id: string;
  name: string;
  image_url: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  birthday_banner_url: string | null;
  instagram_url: string | null;
}

const ZONE_PALETTES = [
  { gradient: ['#2a0520', '#150210'] as const, accent: '#FF31D8' },
  { gradient: ['#1a0830', '#0d0420'] as const, accent: '#a78bfa' },
  { gradient: ['#2a0520', '#150210'] as const, accent: '#FF31D8' },
  { gradient: ['#1a0830', '#0d0420'] as const, accent: '#a78bfa' },
];

function ZoneDuoLayout({ zones, onPress }: { zones: VenueZone[]; onPress: (z: VenueZone) => void }) {
  return (
    <View style={{ gap: 20 }}>
      {zones.map((zone, idx) => {
        const palette = ZONE_PALETTES[idx % ZONE_PALETTES.length];
        const accent = zone.is_vip ? '#FFD700' : palette.accent;
        const grad = zone.is_vip ? (['#1a0830', '#0f0520'] as const) : palette.gradient;
        return (
          <Animated.View key={zone.id} entering={FadeInUp.delay(200 + idx * 100).duration(380)}>
            <TouchableOpacity
              style={styles.duoCard}
              activeOpacity={0.85}
              onPress={() => onPress(zone)}
            >
              {zone.image_url ? (
                <ExpoImage
                  source={{ uri: zone.image_url }}
                  style={[StyleSheet.absoluteFill, { opacity: 0.65 }]}
                  contentFit="cover"
                />
              ) : (
                <LinearGradient colors={grad} style={StyleSheet.absoluteFill} />
              )}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.88)']}
                start={{ x: 0.5, y: 0.2 }} end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.duoBgName}>{zone.name.toUpperCase()}</Text>
              {zone.is_vip && (
                <View style={[styles.duoLabelBadge, { borderColor: `${accent}55`, backgroundColor: `${accent}18`, flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
                  <Crown size={9} color={accent} />
                  <Text style={[styles.duoLabelText, { color: accent }]}>VIP</Text>
                </View>
              )}
              <View style={styles.duoContent}>
                <Text style={styles.duoZoneName}>{zone.name}</Text>
                {zone.description ? (
                  <Text style={styles.duoZoneDesc} numberOfLines={2}>{zone.description}</Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.duoBtn, { borderColor: `${accent}60`, overflow: 'hidden' }]}
                  activeOpacity={0.8}
                  onPress={() => onPress(zone)}
                >
                  <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: `${accent}30`, borderRadius: 30 }]} />
                  <Text style={[styles.duoBtnText, { color: '#FBFBFB' }]}>Reservar</Text>
                  <ChevronRight size={15} color="#FBFBFB" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </View>
  );
}

export default function ReserveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [zones, setZones] = useState<VenueZone[]>([]);
  const [venue, setVenue] = useState<VenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBdayModal, setShowBdayModal] = useState(false);
  const headerBgAnim = React.useRef(new RNAnimated.Value(0)).current;
  const modalHeaderBgAnim = React.useRef(new RNAnimated.Value(0)).current;
  const AnimatedBlurView = React.useMemo(() => RNAnimated.createAnimatedComponent(BlurView), []);

  const [isScreenFocused, setIsScreenFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      return () => setIsScreenFocused(false);
    }, [])
  );

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: venueData } = await supabase
        .from('bar_venues')
        .select('*')
        .eq('name', 'Club Gordos')
        .single();

      if (!venueData) return;
      setVenue(venueData);

      const { data: zonesData } = await supabase
        .from('venue_zones')
        .select('*')
        .eq('venue_id', venueData.id)
        .eq('is_active', true)
        .order('sort_order');

      if (zonesData) {
        const zonesWithCount = await Promise.all(
          zonesData.map(async (z) => {
            const { count } = await supabase
              .from('venue_tables')
              .select('*', { count: 'exact', head: true })
              .eq('zone_id', z.id)
              .eq('is_available', true);
            return { ...z, table_count: count ?? 0 };
          })
        );
        setZones(zonesWithCount);
      }
    } catch (e) {
      console.error('[reserve] fetchData error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleZonePress = (zone: VenueZone) => {
    router.push({
      pathname: '/reserve/[zone]',
      params: {
        zone: zone.id,
        zoneName: zone.name,
        zoneIsVip: zone.is_vip ? '1' : '0',
        venueId: venue?.id ?? '',
        venueName: venue?.name ?? 'Club Gordos',
      },
    });
  };

  // Coordenadas del venue (fallback: Club Gordos, Vitacura)
  const GORDOS_LAT = -33.39867946136609;
  const GORDOS_LNG = -70.58608651854662;
  const venueLat = GORDOS_LAT; // Puedes cambiar esto a venue.latitude si agregas la columna
  const venueLng = GORDOS_LNG; // Puedes cambiar esto a venue.longitude si agregas la columna
  const venueAddress = [venue?.address, venue?.city].filter(Boolean).join(', ') || 'Av Vitacura 4607, LOCAL 12A, 7630290 Santiago, Vitacura, Región Metropolitana';

  const region = {
    latitude: venueLat,
    longitude: venueLng,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  };

  const hasValidInstagram = Boolean(
    venue?.instagram_url && venue.instagram_url.trim() !== '' && venue.instagram_url !== 'EMPTY'
  );

  const openInstagram = () => {
    if (!venue?.instagram_url) return;
    const url = venue.instagram_url.startsWith('http')
      ? venue.instagram_url
      : `https://instagram.com/${venue.instagram_url.replace('@', '')}`;
    Linking.openURL(url).catch(() => {});
  };

  const handleShare = async () => {
    try {
      const text = `📍 ${venue?.name ?? 'Club Gordos'}\n${venueAddress}\n\nReserva tu mesa en DyzGO`;
      if (Platform.OS === 'web') return;
      await Share.share({ message: text });
    } catch { }
  };

  const openInGoogleMaps = () => {
    const query = encodeURIComponent(`${venueAddress}, Chile`);
    const fallback = `https://www.google.com/maps/search/?api=1&query=${query}`;
    if (Platform.OS === 'web') { Linking.openURL(fallback); return; }
    const url = Platform.select({
      ios: `comgooglemaps://?q=${query}`,
      android: `geo:0,0?q=${query}`,
    });
    Linking.canOpenURL(url!)
      .then(ok => Linking.openURL(ok ? url! : fallback))
      .catch(() => Linking.openURL(fallback));
  };

  const openUber = () => {
    const nick = encodeURIComponent(venue?.name ?? 'Club Gordos');
    const fallback = `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${venueLat}&dropoff[longitude]=${venueLng}&dropoff[nickname]=${nick}`;
    if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.open(fallback, '_blank'); return; }
    const url = `uber://?action=setPickup&pickup=my_location&dropoff[latitude]=${venueLat}&dropoff[longitude]=${venueLng}&dropoff[nickname]=${nick}`;
    Linking.canOpenURL(url)
      .then(ok => Linking.openURL(ok ? url : fallback))
      .catch(() => Linking.openURL(fallback));
  };

  const handleCopyAddress = () => {
    if (venueAddress) Alert.alert('Copiado', 'Dirección copiada al portapapeles.');
  };

  const bannerUri = venue?.image_url ? (getImageUrl(venue.image_url, 1200, 85) ?? venue.image_url) : null;

  return (
    <View style={[styles.container, Platform.OS === 'web' && !isScreenFocused && { opacity: 0 }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Background glow */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={['rgba(255,49,216,0.18)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', 'rgba(255,49,216,0.12)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </View>

      {/* Floating header — igual que event-detail */}
      <View style={[styles.fixedHeader, { top: insets.top + 8 }]}>
        <AnimatedBlurView intensity={50} tint="dark" style={[styles.pillBg, { opacity: headerBgAnim }]} />
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.75}>
          <ArrowLeft size={20} color="#FBFBFB" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={handleShare} activeOpacity={0.75}>
          <Share2 size={20} color="#FBFBFB" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          headerBgAnim.setValue(Math.min(1, y / 180));
        }}
      >
        {/* Banner hero */}
        <Animated.View
          entering={FadeInDown.duration(400)}
          style={[styles.bannerContainer, { paddingTop: insets.top + 60 }]}
        >
          <View style={styles.bannerGlowWrap}>
            <View style={styles.bannerImageCard}>
              {bannerUri ? (
                <ExpoImage
                  source={{ uri: bannerUri }}
                  style={styles.bannerImage}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <LinearGradient colors={['#1a0828', '#060110']} style={StyleSheet.absoluteFill} />
              )}
              <LinearGradient
                colors={['transparent', 'rgba(3,3,3,0.45)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
          </View>
        </Animated.View>

        {/* Section title */}
        <Animated.View entering={FadeInUp.delay(150).duration(350)} style={styles.sectionHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={styles.sectionTitle}>{venue?.name ?? 'Club Gordos'}</Text>
            {hasValidInstagram && (
              <TouchableOpacity style={styles.instagramSquareIcon} onPress={openInstagram} activeOpacity={0.75}>
                <Instagram size={18} color="#FBFBFB" />
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.heroSubtitle}>Elige una zona para reservar tu mesa</Text>
        </Animated.View>

        {/* Zone duo grid */}
        <View style={{ paddingHorizontal: 16 }}>
          {loading ? (
            <View style={{ gap: 14 }}>
              <View style={[styles.skeletonCard, { height: 220 }]} />
              <View style={[styles.skeletonCard, { height: 220 }]} />
            </View>
          ) : (
            <ZoneDuoLayout zones={zones} onPress={handleZonePress} />
          )}
        </View>

        {/* Divider */}
        <View style={styles.sectionDivider} />

        {/* Birthday teaser card */}
        <Animated.View entering={FadeInUp.delay(400).duration(350)} style={{ paddingHorizontal: 16, marginTop: 0 }}>
          <TouchableOpacity style={styles.bdayCard} activeOpacity={0.88} onPress={() => setShowBdayModal(true)}>
            {venue?.birthday_banner_url ? (
              <ExpoImage
                source={{ uri: getImageUrl(venue.birthday_banner_url, 800, 80) ?? venue.birthday_banner_url }}
                style={[StyleSheet.absoluteFill, { opacity: 0.45 }]}
                contentFit="cover"
              />
            ) : (
              <LinearGradient colors={['#260840', '#10031e', '#06010f']} style={StyleSheet.absoluteFill} />
            )}
            <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.65)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={['rgba(255,49,216,0.22)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={styles.bdayCardRow}>
              <View style={styles.bdayIconCircle}>
                <Gift size={20} color={ACCENT2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bdayCardTitle}>Celebra tu cumpleaños</Text>
                <Text style={styles.bdayCardSub}>Club Gordos · Ver beneficios</Text>
              </View>
              <View style={[styles.bentoArrowBtn, { borderColor: `${ACCENT2}55`, overflow: 'hidden' }]}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: `${ACCENT2}25` }]} />
                <ChevronRight size={16} color={ACCENT2} />
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Divider */}
        <View style={styles.sectionDivider} />

        {/* Location card idéntica a event-detail */}
        <Animated.View entering={FadeInUp.delay(500).duration(350)} style={{ paddingHorizontal: 16, marginTop: 0 }}>
          <Text style={{ color: '#FBFBFB', fontWeight: '900', fontSize: 18, marginBottom: 15 }}>Ubicación y Llegada</Text>
          <View style={[styles.glassCard, { marginBottom: 0 }]}>
            <View style={[styles.mapContainer, { height: 200 }]} pointerEvents="none">
              {Platform.OS === 'web' ? (
                <iframe
                  src={`https://maps.google.com/maps?q=${region.latitude},${region.longitude}&t=k&z=15&output=embed`}
                  style={{ width: '100%', height: '100%', border: 0 }}
                />
              ) : (
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.map}
                  region={region}
                  mapType="hybrid"
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                >
                  <Marker
                    coordinate={{ latitude: region.latitude, longitude: region.longitude }}
                    pinColor={ACCENT2}
                  />
                </MapView>
              )}
            </View>
            {venueAddress && (
              <View style={styles.addressContainer}>
                <Text style={styles.addressText} numberOfLines={1}>{venueAddress}</Text>
                <PressableScale scaleTo={0.88} haptic="light" onPress={handleCopyAddress} style={styles.copyButton}>
                  <Copy size={12} color={ACCENT2} />
                  <Text style={[styles.copyButtonText, { color: ACCENT2 }]}>Copiar</Text>
                </PressableScale>
              </View>
            )}
            <View style={styles.transportDualRow}>
              <PressableScale scaleTo={0.94} haptic="medium" style={styles.transportButtonHalf} onPress={openUber}>
                <View style={styles.uberIconBox}><Text style={styles.uberIconText}>Uber</Text></View>
                <Text style={styles.transportButtonText}>Pedir Uber</Text>
              </PressableScale>
              <PressableScale scaleTo={0.94} haptic="medium" style={styles.transportButtonHalf} onPress={openInGoogleMaps}>
                <View style={styles.mapsIconBox}><Navigation size={14} color="#4285F4" /></View>
                <Text style={styles.transportButtonText}>Navegar</Text>
              </PressableScale>
            </View>
          </View>
        </Animated.View>

        {/* Legal */}
        <View style={{ marginTop: 32, marginBottom: 12, paddingHorizontal: 20 }}>
          <Text style={{ color: 'rgba(251,251,251,0.6)', fontSize: 11, textAlign: 'center', lineHeight: 16, marginBottom: 8 }}>
            {'Por normativas del club, '}
            <Text style={{ fontWeight: '800' }}>traer carnet físico.</Text>
            {' Quien presente identidad falsa o editada tendrá prohibido el ingreso.'}
          </Text>
          <Text style={{ color: 'rgba(251,251,251,0.6)', fontSize: 11, textAlign: 'center', lineHeight: 16 }}>
            {'No vendemos '}
            <Text style={{ fontWeight: '800' }}>alcohol a menores de edad.</Text>
          </Text>
        </View>

        {/* Birthday modal */}
        <Modal
          visible={showBdayModal}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setShowBdayModal(false)}
        >
          <View style={styles.modalContainer}>
            <StatusBar barStyle="light-content" />

            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <LinearGradient colors={['rgba(255,49,216,0.22)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0.6 }} style={StyleSheet.absoluteFill} />
              <LinearGradient colors={['transparent', 'rgba(255,49,216,0.14)']} start={{ x: 0.3, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            </View>

            {/* Header flotante — exactamente igual que el index */}
            <View style={[styles.fixedHeader, { top: insets.top + 8 }]}>
              <AnimatedBlurView intensity={50} tint="dark" style={[styles.pillBg, { opacity: modalHeaderBgAnim }]} />
              <TouchableOpacity style={styles.iconBtn} onPress={() => setShowBdayModal(false)} activeOpacity={0.75}>
                <ArrowLeft size={20} color="#FBFBFB" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={handleShare} activeOpacity={0.75}>
                <Share2 size={20} color="#FBFBFB" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
              scrollEventThrottle={16}
              onScroll={(e) => {
                const y = e.nativeEvent.contentOffset.y;
                modalHeaderBgAnim.setValue(Math.min(1, y / 180));
              }}
            >

              {/* Banner card — igual que el index */}
              <Animated.View entering={FadeInDown.duration(400)} style={[styles.bannerContainer, { paddingTop: insets.top + 60 }]}>
                <View style={styles.bannerGlowWrap}>
                  <View style={styles.bannerImageCard}>
                    {venue?.birthday_banner_url ? (
                      <ExpoImage
                        source={{ uri: getImageUrl(venue.birthday_banner_url, 800, 80) ?? venue.birthday_banner_url }}
                        style={styles.bannerImage}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : (
                      <LinearGradient colors={['#1a0828', '#060110']} style={StyleSheet.absoluteFill} />
                    )}
                    <LinearGradient
                      colors={['transparent', 'rgba(3,3,3,0.45)']}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 0, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                  </View>
                </View>
              </Animated.View>

              {/* Título debajo del banner */}
              <Animated.View entering={FadeInUp.delay(150).duration(350)} style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, gap: 6 }}>
                <Text style={styles.sectionTitle}>{'Celebra tu\ncumpleaños'}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500' }}>Beneficios exclusivos para tu día especial</Text>
              </Animated.View>

              {/* Content */}
              <View style={styles.modalContent}>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                  <Text style={[styles.smallSectionLabel, { marginBottom: 0 }]}>Beneficios por tramo</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                </View>

                {[
                  {
                    label: '+15 INVITADOS', rank: '01', accent: '#FFD700',
                    grad: ['rgba(255,215,0,0.12)', 'rgba(255,215,0,0.03)'] as [string, string],
                    border: 'rgba(255,215,0,0.22)',
                    items: ['1 botella de pisco o espumante + 1 bebida 1.5L', 'Torta de shots para todos'],
                  },
                  {
                    label: '10 A 14 INVITADOS', rank: '02', accent: ACCENT2,
                    grad: ['rgba(255,49,216,0.10)', 'rgba(255,49,216,0.02)'] as [string, string],
                    border: 'rgba(255,49,216,0.2)',
                    items: ['2 tragos (mojito / piscola / gin tonic / shot)', 'Torta de shots'],
                  },
                  {
                    label: 'MENOS DE 10', rank: '03', accent: '#a78bfa',
                    grad: ['rgba(167,139,250,0.08)', 'rgba(167,139,250,0.02)'] as [string, string],
                    border: 'rgba(167,139,250,0.18)',
                    items: ['1 trago (mojito / piscola / gin tonic / shot)', 'Torta de shots para todos'],
                  },
                ].map((tier, i) => (
                  <Animated.View key={i} entering={FadeInUp.delay(i * 70).duration(320)} style={{ marginBottom: 10 }}>
                    <LinearGradient
                      colors={tier.grad}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.tierCard, { borderColor: tier.border }]}
                    >
                      <Text style={[styles.tierRankWatermark, { color: tier.accent }]}>{tier.rank}</Text>
                      <View style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: `${tier.accent}50`, backgroundColor: `${tier.accent}15`, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 30, marginBottom: 14 }}>
                        <Text style={{ color: tier.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }}>{tier.label}</Text>
                      </View>
                      {tier.items.map((item, j) => (
                        <View key={j} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: j < tier.items.length - 1 ? 8 : 0 }}>
                          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: `${tier.accent}20`, borderWidth: 1, borderColor: `${tier.accent}45`, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                            <Check size={11} color={tier.accent} />
                          </View>
                          <Text style={{ color: '#FBFBFB', fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 20 }}>{item}</Text>
                        </View>
                      ))}
                    </LinearGradient>
                  </Animated.View>
                ))}

                <Animated.View entering={FadeInUp.delay(240).duration(320)} style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                    <Text style={[styles.smallSectionLabel, { marginBottom: 0 }]}>Extras</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                  </View>
                  <View style={[styles.glassCard, { padding: 16, gap: 12 }]}>
                    {[
                      { text: 'Puedes decorar tu espacio' },
                      { text: 'Puedes traer tu propia torta' },
                    ].map((item, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,49,216,0.1)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                          {i === 0 ? <Sparkles size={16} color={ACCENT2} /> : <Gift size={16} color={ACCENT2} />}
                        </View>
                        <Text style={{ color: '#FBFBFB', fontSize: 14, fontWeight: '600', flex: 1 }}>{item.text}</Text>
                      </View>
                    ))}
                  </View>
                </Animated.View>

                <Animated.View entering={FadeInUp.delay(310).duration(320)} style={{ marginTop: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ marginTop: 1 }}>
                    <Info size={14} color="rgba(255,255,255,0.4)" />
                  </View>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, flex: 1, lineHeight: 17, fontStyle: 'italic' }}>
                    La promoción de pisco o espumante válido solo de lunes a jueves.
                  </Text>
                </Animated.View>

              </View>
            </ScrollView>
          </View>
        </Modal>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030303' },
  // Floating header
  fixedHeader: { position: 'absolute', left: 16, right: 16, zIndex: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 50, paddingHorizontal: 6 },
  pillBg: { overflow: 'hidden', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)' },
  iconBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  instagramSquareIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  // Banner — estilo event-detail horizontal
  bannerContainer: { width: '100%', paddingHorizontal: 16, paddingBottom: 14 },
  bannerGlowWrap: {
    borderRadius: 28,
    shadowColor: ACCENT2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  bannerImageCard: { width: '100%', aspectRatio: 16 / 9, borderRadius: 28, overflow: 'hidden', backgroundColor: '#0a0a0a', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  bannerImage: { width: '100%', height: '100%' },
  bannerInfo: { paddingTop: 14, paddingHorizontal: 4, gap: 5 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, overflow: 'hidden', alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,49,216,0.35)' },
  heroBadgeText: { fontSize: 11, fontWeight: '700' },
  heroTitle: { color: '#FBFBFB', fontSize: 30, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5 },
  heroSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500' },
  scrollContent: { paddingTop: 0 },
  sectionHeader: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16, gap: 6 },
  sectionTitle: { color: '#FBFBFB', fontSize: 28, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1 },
  sectionSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '500' },
  zoneCard: { borderRadius: 22, overflow: 'hidden', marginBottom: 14, height: 160, flexDirection: 'row', alignItems: 'flex-end', padding: 16, backgroundColor: '#111' },
  zoneCardImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  zoneCardImagePlaceholder: { color: 'rgba(255,255,255,0.08)', fontSize: 80, fontWeight: '900' },
  vipBadge: { position: 'absolute', top: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.4)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  vipBadgeText: { color: '#FFD700', fontSize: 11, fontWeight: '800' },
  zoneCardContent: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  zoneName: { color: '#FBFBFB', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  zoneDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 3 },
  zoneMetaRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  zoneMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoneMetaText: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600' },
  zoneArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  sectionDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 20, marginVertical: 32 },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,107,53,0.07)', borderWidth: 1, borderColor: 'rgba(255,107,53,0.2)', borderRadius: 16, padding: 14, marginTop: 8 },
  infoText: { flex: 1, color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 18 },
  skeletonCard: { borderRadius: 22, backgroundColor: '#111' },
  // Duo zone layout
  duoGrid: { flexDirection: 'row', gap: 10 },
  duoCard: { height: 240, borderRadius: 22, overflow: 'hidden', backgroundColor: '#0d0d0d' },
  duoAccentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  duoBgName: { position: 'absolute', right: -18, top: 60, fontSize: 36, fontWeight: '900', fontStyle: 'italic', opacity: 0.07, color: '#FFFFFF', letterSpacing: -1, transform: [{ rotate: '-90deg' }] },
  duoLabelBadge: { position: 'absolute', top: 14, left: 12, borderWidth: 1, borderRadius: 30, paddingHorizontal: 9, paddingVertical: 3 },
  duoLabelText: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  duoContent: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 18, gap: 5 },
  duoZoneName: { color: '#FBFBFB', fontSize: 20, fontWeight: '900', letterSpacing: -0.5, lineHeight: 24 },
  duoZoneDesc: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '500', lineHeight: 15 },
  duoMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  duoMetaText: { fontSize: 11, fontWeight: '700' },
  duoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderRadius: 30, paddingVertical: 7, marginTop: 6 },
  duoBtnText: { fontSize: 12, fontWeight: '800' },
  // Legacy (kept for VIP badge if needed)
  bentoArrowBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  smallSectionLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 },
  bdayCard: { borderRadius: 20, overflow: 'hidden', height: Math.round((windowWidth - 32) / 2.45), justifyContent: 'flex-end', backgroundColor: '#0a0212' },
  bdayCardRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12 },
  bdayIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,49,216,0.15)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.3)', alignItems: 'center', justifyContent: 'center' },
  bdayCardTitle: { color: '#FBFBFB', fontSize: 15, fontWeight: '800' },
  bdayCardSub: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  modalContainer: { flex: 1, backgroundColor: '#030303' },
  modalHero: { height: 400, justifyContent: 'flex-end', overflow: 'hidden' },
  modalCloseBtn: { position: 'absolute', top: 52, right: 20, zIndex: 10 },
  modalCloseBtnInner: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  modalContent: { paddingHorizontal: 20, paddingTop: 20, gap: 8 },
  tierRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 7 },
  tierText: { color: '#FBFBFB', fontSize: 14, fontWeight: '800', flex: 1, lineHeight: 20, letterSpacing: 0.2 },
  tierSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' },
  modalNote: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontStyle: 'italic', textAlign: 'center', lineHeight: 18, marginTop: 20 },
  modalHeroBottom: { paddingHorizontal: 20, paddingBottom: 36, gap: 6 },
  modalVenueName: { color: ACCENT2, fontSize: 11, fontWeight: '900', letterSpacing: 3, marginBottom: 2 },
  modalHeroTitle: { color: '#FBFBFB', fontSize: 42, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, lineHeight: 46 },
  tierDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: ACCENT2, marginTop: 7 },
  tierCard: { borderRadius: 20, padding: 16, borderWidth: 1, overflow: 'hidden' },
  tierRankWatermark: { position: 'absolute', right: 14, top: 6, fontSize: 56, fontWeight: '900', fontStyle: 'italic', opacity: 0.13, letterSpacing: -2 },
  // Location card (event-detail style)
  glassCard: { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  mapContainer: { width: '100%', borderRadius: 32, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', marginBottom: 10 },
  map: { flex: 1 },
  addressContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  addressText: { color: 'rgba(251, 251, 251, 0.6)', fontSize: 11, flex: 1, marginRight: 10 },
  copyButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255, 255, 255, 0.05)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  copyButtonText: { fontSize: 10, fontWeight: '800' },
  transportDualRow: { flexDirection: 'row', gap: 12 },
  transportButtonHalf: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.05)', paddingVertical: 14, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', gap: 10 },
  transportButtonText: { color: '#FBFBFB', fontSize: 13, fontWeight: '800' },
  uberIconBox: { backgroundColor: 'rgba(3, 3, 3, 0.6)', width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 0, borderColor: 'rgba(255,255,255,0.2)' },
  uberIconText: { color: '#FBFBFB', fontWeight: '900', fontSize: 9 },
  mapsIconBox: { backgroundColor: 'rgba(66, 133, 244, 0.15)', width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(66, 133, 244, 0.3)', justifyContent: 'center', alignItems: 'center' },
});
