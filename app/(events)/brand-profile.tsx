import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft, Calendar, Clock,
  Globe, Instagram, Layers, MapPin, Share2, UserCheck
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, FlatList, Image, ImageBackground, Linking,
  Share, StatusBar, StyleSheet, Text, TouchableOpacity, View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import { useSaved } from '../../context/SavedContext';
import { supabase } from '../../lib/supabase';
import { useUserLocation } from '../../lib/useUserLocation';
import { getDistanceFromLatLonInKm, formatDistance } from '../../utils/location';

const { width } = Dimensions.get('window');
const BANNER_H = 310;

const isEventFinished = (evt: any) => {
  if (!evt) return false;
  if (evt.is_active === false) return true;
  if (evt.status === 'finished' || evt.status === 'inactive') return true;
  const dateStr = evt.end_date || evt.date;
  const timeStr = evt.end_time || evt.hour || '05:00';
  if (dateStr) return new Date(`${dateStr}T${timeStr}`) < new Date();
  return false;
};

const formatDateBadge = (dateString: string) => {
  try {
    const [year, month, day] = dateString.split('T')[0].split('-');
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return { day: day.padStart(2, '0'), month: d.toLocaleString('es-ES', { month: 'short' }).toUpperCase() };
  } catch { return { day: '00', month: '---' }; }
};

const formatDateTimeFull = (dateStr: string, timeStr: string) => {
  try {
    const [year, month, day] = dateStr.split('T')[0].split('-');
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${dias[d.getDay()]} ${parseInt(day, 10)} ${meses[d.getMonth()]}`;
  } catch { return ''; }
};

export default function BrandProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const experienceId = Array.isArray(id) ? id[0] : id as string;

  const { isBrandSaved, toggleSaveBrand } = useSaved();
  const { location } = useUserLocation();
  const followed = isBrandSaved(experienceId);

  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [pastEvents, setPastEvents] = useState<any[]>([]);

  const headerBgAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { if (id) fetchBrandData(); }, [id]);
  useEffect(() => {
    if (!loading && brand) Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [loading, brand]);

  const handleShare = async () => {
    if (!brand) return;
    try {
      await Share.share({ message: `${brand.name} — DyzGO\ndyzgo.app/brand/${experienceId}` });
    } catch {}
  };

  const handleFollow = () => {
    if (!brand) return;
    toggleSaveBrand(experienceId, {
      name: brand.name,
      logo_url: brand.logo_url ?? null,
      banner_url: brand.banner_url ?? null,
    });
  };

  const fetchBrandData = async () => {
    try {
      setLoading(true);
      const { data: brandData, error: brandError } = await supabase.from('experiences').select('*').eq('id', id).single();
      if (brandError) throw brandError;
      setBrand(brandData);

      const [{ data: upcomingData }, { data: pastData }] = await Promise.all([
        supabase.from('events').select('*, clubs(name, latitude, longitude)')
          .eq('experience_id', id)
          .eq('status', 'active')
          .eq('is_active', true),
        supabase.from('events').select('*, clubs(name)')
          .eq('experience_id', id)
          .neq('status', 'draft')
          .or('status.eq.finished,status.eq.inactive,is_active.eq.false'),
      ]);

      const upcoming = (upcomingData || []).filter(e =>
        e.image_url && !isEventFinished(e)
      ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const past = (pastData || []).filter(e =>
        e.image_url && isEventFinished(e)
      ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setEvents(upcoming);
      setPastEvents(past);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const openInstagram = () => {
    if (brand?.instagram_handle) {
      Linking.openURL(`https://instagram.com/${brand.instagram_handle.replace('@', '').trim()}`).catch(() => {});
    }
  };

  const openWebsite = () => {
    if (brand?.website_url) {
      let url = brand.website_url.trim();
      if (!url.startsWith('http')) url = `https://${url}`;
      Linking.openURL(url).catch(() => {});
    }
  };



  const pColor = brand?.primary_color || COLORS.neonPink;

  // ── Scroll & Tap-to-Center logic ──
  const upcomingListRef = useRef<FlatList>(null);
  const pastListRef = useRef<FlatList>(null);
  const upcomingScrollX = useRef(0);
  const pastScrollX = useRef(0);

  const UPCOMING_W = width - 48;
  const UPCOMING_GAP = 12;
  const UPCOMING_SNAP = UPCOMING_W + UPCOMING_GAP;

  const handleUpcomingPress = (index: number, id: string) => {
    const targetOffset = index * UPCOMING_SNAP;
    const currentOffset = upcomingScrollX.current;
    if (Math.abs(currentOffset - targetOffset) > UPCOMING_SNAP / 2) {
      upcomingListRef.current?.scrollToOffset({ offset: targetOffset, animated: true });
    } else {
      router.push({ pathname: '/event-detail', params: { id } });
    }
  };

  const PAST_W = 255;
  const PAST_GAP = 14;
  const PAST_SNAP = PAST_W + PAST_GAP;

  const handlePastPress = (index: number, id: string) => {
    const targetOffset = index * PAST_SNAP;
    const currentOffset = pastScrollX.current;
    if (Math.abs(currentOffset - targetOffset) > PAST_SNAP / 2) {
      pastListRef.current?.scrollToOffset({ offset: targetOffset, animated: true });
    } else {
      router.push({ pathname: '/event-detail', params: { id } });
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Ambient background */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <LinearGradient colors={[`${pColor}2E`, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFillObject} />
        <LinearGradient colors={['transparent', `${pColor}1F`]} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
      </View>

      {/* ── FLOATING NAV ── */}
      <View style={[s.fixedHeader, { top: insets.top + 8 }]}>
        <Animated.View style={[s.pillBg, { opacity: headerBgAnim }]}>
          <BlurView intensity={50} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 30, overflow: 'hidden' }]} />
        </Animated.View>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} activeOpacity={0.7}>
          <ArrowLeft color="white" size={20} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleShare} style={s.iconBtn} activeOpacity={0.7}>
          <Share2 color="white" size={20} />
        </TouchableOpacity>
      </View>

      {/* ── MAIN SCROLL ── */}
      {brand ? (
        <Animated.ScrollView
          style={{ flex: 1, opacity: fadeAnim }}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            headerBgAnim.setValue(Math.min(1, y / 150));
          }}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          {/* 1. BANNER */}
          <View style={s.banner}>
            {brand.banner_url
              ? <Image source={{ uri: brand.banner_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              : <LinearGradient colors={['rgba(255,49,216,0.25)', 'rgba(138,43,226,0.25)', 'transparent']} style={StyleSheet.absoluteFill} />}
            <LinearGradient
              colors={['rgba(3,3,3,0.15)', 'transparent', COLORS.background]}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>

          {/* 2. LOGO + PROFILE INFO (centrado) */}
          <View style={s.profileSection}>
            {/* Logo centrado sobre el banner */}
            <View style={[s.logoRing, { shadowColor: pColor }]}>
              <View style={s.logoContainer}>
                {brand.logo_url
                  ? <Image source={{ uri: brand.logo_url }} style={s.logoImg} resizeMode="cover" />
                  : (
                    <LinearGradient colors={[pColor, '#bc1888']} style={s.logoImg}>
                      <Layers color="white" size={38} />
                    </LinearGradient>
                  )}
              </View>
            </View>

            {/* Nombre */}
            <Text style={s.brandName}>{brand.name}</Text>

            {/* Follow pill */}
            <TouchableOpacity
              onPress={handleFollow}
              activeOpacity={0.8}
              style={[s.statPill, { overflow: 'hidden', borderWidth: 0 }]}
            >
              <BlurView intensity={30} tint="dark" style={[StyleSheet.absoluteFillObject, { backgroundColor: followed ? `${pColor}1A` : 'rgba(255,255,255,0.05)' }]} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <UserCheck size={12} color={followed ? pColor : 'white'} />
                <Text style={[s.statLabel, { color: followed ? pColor : 'white' }]}>
                  {followed ? 'Siguiendo' : 'Seguir'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Descripción */}
            {brand.description ? (
              <Text style={s.brandDesc} numberOfLines={4}>{brand.description}</Text>
            ) : null}
          </View>

          {/* 3. LINKS */}
          {(brand.instagram_handle || brand.website_url) && (
            <View style={s.actionsContainer}>
              <View style={s.socialRow}>
                {brand.instagram_handle && (
                  <TouchableOpacity style={[s.socialChip, s.chipInstagram]} activeOpacity={0.8} onPress={openInstagram}>
                    <Instagram size={15} color={COLORS.neonPink} />
                    <Text style={[s.chipLabel, { color: 'rgba(255,255,255,0.85)' }]}>Instagram</Text>
                  </TouchableOpacity>
                )}
                {brand.website_url && (
                  <TouchableOpacity style={[s.socialChip, { backgroundColor: `${pColor}12`, borderColor: `${pColor}33` }]} activeOpacity={0.8} onPress={openWebsite}>
                    <Globe size={15} color={pColor} />
                    <Text style={[s.chipLabel, { color: pColor }]}>Sitio Web</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* 4. PRÓXIMOS EVENTOS — carousel horizontal */}
          <View style={s.sectionHeader}>
            <View style={[s.sectionIconBox, { backgroundColor: `${pColor}1A`, borderColor: `${pColor}40` }]}>
              <Calendar color={pColor} size={15} />
            </View>
            <Text style={s.sectionTitle}>Próximos eventos</Text>
            <View style={s.sectionLine} />
          </View>

          {events.length === 0 ? (
            <View style={s.emptyEvents}>
              <Text style={s.emptyEventsText}>Sin eventos próximos</Text>
            </View>
          ) : (
            <FlatList
              ref={upcomingListRef}
              horizontal
              data={events}
              keyExtractor={item => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 24, paddingRight: 24, gap: UPCOMING_GAP }}
              snapToInterval={UPCOMING_SNAP}
              decelerationRate="fast"
              onScroll={e => upcomingScrollX.current = e.nativeEvent.contentOffset.x}
              scrollEventThrottle={16}
              renderItem={({ item, index }) => {
                const titleLen = (item.title || '').length;
                const titleSize = titleLen <= 12 ? 36 : titleLen <= 20 ? 28 : titleLen <= 30 ? 22 : 18;
                return (
                  <TouchableOpacity
                    style={s.eventCard}
                    activeOpacity={0.9}
                    onPress={() => handleUpcomingPress(index, item.id)}
                  >
                    <ImageBackground source={{ uri: item.image_url }} style={s.eventCardImg} imageStyle={{ borderRadius: 28 }}>
                      <LinearGradient
                        colors={['transparent', 'rgba(3,3,3,0.7)', '#030303']}
                        locations={[0.4, 0.8, 1]}
                        style={s.eventCardOverlay}
                      >
                        <View style={[s.eventTopRow, { justifyContent: 'space-between' }]}>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <BlurView intensity={30} tint="dark" style={s.glassDateBadge}>
                              <Text style={s.glassDateText}>{formatDateTimeFull(item.date, item.hour)}</Text>
                            </BlurView>
                            {(item.min_age_men || item.min_age_women) && (
                              <BlurView intensity={30} tint="dark" style={s.glassDateBadge}>
                                <Text style={s.glassDateText}>{Math.min(item.min_age_men || 18, item.min_age_women || 18)}+</Text>
                              </BlurView>
                            )}
                          </View>
                          {(() => {
                            const lat = item.latitude ?? item.clubs?.latitude;
                            const lon = item.longitude ?? item.clubs?.longitude;
                            if (!location || !lat || !lon) return null;
                            const dist = getDistanceFromLatLonInKm(location.coords.latitude, location.coords.longitude, lat, lon);
                            return (
                              <BlurView intensity={30} tint="dark" style={[s.glassDateBadge, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                                <MapPin size={12} color="rgba(251,251,251,0.5)" />
                                <Text style={s.glassDateText}>{formatDistance(dist)}</Text>
                              </BlurView>
                            );
                          })()}
                        </View>
                        <View>
                          <Text style={[s.eventCardTitle, { fontSize: titleSize, lineHeight: titleSize * 1.1 }]} numberOfLines={3}>
                            {item.title}
                          </Text>
                          <Text style={s.eventCardPlace} numberOfLines={1}>
                            {item.club_name || item.clubs?.name || ''}
                          </Text>
                        </View>
                      </LinearGradient>
                    </ImageBackground>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* 5. EVENTOS PASADOS — carousel horizontal */}
          {pastEvents.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <View style={s.sectionHeader}>
                <View style={[s.sectionIconBox, { backgroundColor: `${pColor}1A`, borderColor: `${pColor}40` }]}>
                  <Clock color={pColor} size={15} />
                </View>
                <Text style={s.sectionTitle}>Eventos pasados</Text>
                <View style={s.sectionLine} />
              </View>

              <FlatList
                ref={pastListRef}
                horizontal
                data={pastEvents}
                keyExtractor={item => item.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingLeft: 24, paddingRight: 16, gap: PAST_GAP, paddingBottom: 4 }}
                snapToInterval={PAST_SNAP}
                decelerationRate="fast"
                onScroll={e => pastScrollX.current = e.nativeEvent.contentOffset.x}
                scrollEventThrottle={16}
                renderItem={({ item, index }) => {
                  const { day, month } = formatDateBadge(item.date);
                  return (
                    <TouchableOpacity
                      style={s.pastCard}
                      activeOpacity={0.85}
                      onPress={() => handlePastPress(index, item.id)}
                    >
                      <View style={s.pastImgWrap}>
                        <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        <View style={s.pastOverlay} />
                        <BlurView intensity={30} tint="dark" style={s.pastDateBadge}>
                          <Text style={s.pastDateDay}>{day}</Text>
                          <Text style={s.pastDateMonth}>{month}</Text>
                        </BlurView>
                      </View>
                      <View style={s.pastInfo}>
                        <Text style={s.pastTitle} numberOfLines={2}>{item.title}</Text>
                        <Text style={[s.pastSub, { color: pColor }]}>Ver detalles →</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          )}
        </Animated.ScrollView>
      ) : (
        <View style={s.loadingWrap}>
          {/* loading state vacío — fadeAnim empieza en 0 así que nada se ve */}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  loadingWrap: { flex: 1 },

  // ── Fixed nav ──
  fixedHeader: {
    position: 'absolute', left: 16, right: 16, zIndex: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    height: 50, paddingHorizontal: 6,
  },
  pillBg: {
    overflow: 'hidden', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 30, borderWidth: 1, borderColor: COLORS.glassBorder,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  iconBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },

  // ── Banner ──
  banner: { width: '100%', height: BANNER_H },

  // ── Profile section ──
  profileSection: { alignItems: 'center', paddingHorizontal: 24, marginTop: -70 },
  logoRing: {
    width: 124, height: 124, borderRadius: 62,
    backgroundColor: COLORS.background,
    padding: 3,
    shadowColor: COLORS.neonPink, shadowOpacity: 0.5, shadowRadius: 20, elevation: 16,
    marginBottom: 16,
  },
  logoContainer: {
    width: '100%', height: '100%', borderRadius: 60,
    overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#111',
  },
  logoImg: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },

  brandName: {
    color: COLORS.textWhite, fontSize: 30, fontWeight: '900',
    fontStyle: 'italic', letterSpacing: -1.2, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
    marginBottom: 10,
  },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    marginBottom: 14,
  },
  statPillActive: { backgroundColor: 'rgba(255,49,216,0.1)', borderColor: 'rgba(255,49,216,0.3)' },
  statPillFollow: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' },
  statNum: { color: COLORS.textWhite, fontSize: 13, fontWeight: '800' },
  statLabel: { color: COLORS.textZinc, fontSize: 12, fontWeight: '500' },

  brandDesc: {
    color: COLORS.textZinc, fontSize: 13, lineHeight: 20,
    textAlign: 'center', fontWeight: '400', maxWidth: width - 64,
  },

  // ── Actions ──
  actionsContainer: { paddingHorizontal: 20, marginTop: 20, marginBottom: 8 },

  socialRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  socialChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  chipWeb: { backgroundColor: 'rgba(0,229,255,0.07)', borderColor: 'rgba(0,229,255,0.2)' },
  chipInstagram: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(225,48,108,0.25)' },
  igIconBox: { width: 20, height: 20, borderRadius: 6, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  igIconText: { color: 'white', fontSize: 10, fontWeight: '900', fontStyle: 'italic' },
  chipLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },

  // ── Section header ──
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, marginTop: 28, marginBottom: 16,
  },
  sectionIconBox: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: 'rgba(255,49,216,0.1)', borderWidth: 1, borderColor: 'rgba(255,49,216,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  sectionTitle: { color: COLORS.textWhite, fontSize: 17, fontWeight: '900' },
  sectionLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },

  // ── Event card (próximos) — mismo estilo que home ──
  eventCard: {
    width: width - 48, height: 420,
    borderRadius: 32, overflow: 'hidden',
    backgroundColor: '#0A0A0A',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  eventCardImg: { flex: 1, borderRadius: 32 },
  eventCardOverlay: { flex: 1, padding: 24, justifyContent: 'space-between' },
  eventTopRow: { flexDirection: 'row', gap: 8 },
  glassDateBadge: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'hidden',
  },
  glassDateText: { color: '#FBFBFB', fontWeight: '800', fontSize: 13 },
  eventCardTitle: {
    color: '#FBFBFB', fontSize: 36, fontWeight: '900',
    fontStyle: 'italic', letterSpacing: -1, lineHeight: 42,
  },
  eventCardPlace: {
    color: 'rgba(251,251,251,0.6)', fontSize: 14,
    fontWeight: '700', textTransform: 'uppercase', marginTop: 6,
  },

  emptyEvents: { alignItems: 'center', paddingVertical: 32 },
  emptyEventsText: { color: COLORS.textZinc, fontSize: 14, fontStyle: 'italic' },

  // ── Past events (historial) ──
  pastCard: {
    width: 255, borderRadius: 26, overflow: 'hidden',
    backgroundColor: COLORS.glassBg,
    borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  pastImgWrap: { width: '100%', aspectRatio: 1, position: 'relative' },
  pastOverlay: { ...StyleSheet.absoluteFillObject as any, backgroundColor: 'rgba(0,0,0,0.35)' },
  pastDateBadge: {
    position: 'absolute', bottom: 12, left: 12,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center',
    overflow: 'hidden',
  },
  pastDateDay: { color: 'white', fontSize: 26, fontWeight: '900', lineHeight: 28 },
  pastDateMonth: { color: COLORS.textZinc, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  pastInfo: { padding: 16 },
  pastTitle: { color: COLORS.textWhite, fontSize: 18, fontWeight: '800', fontStyle: 'italic', letterSpacing: -0.3, marginBottom: 8 },
  pastSub: { color: COLORS.neonPink, fontSize: 13, fontWeight: '700' },
});
