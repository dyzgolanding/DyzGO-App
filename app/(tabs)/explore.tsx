import { Image as ExpoImage } from 'expo-image';
import { eventCache } from '../../lib/eventCache';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from '../../components/BlurSurface';
import { useNavRouter as useRouter } from '../../hooks/useNavRouter';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Calendar,
  Check,
  Filter,
  List,
  Map as MapIcon,
  MapPin,
  Music,
  Search,
  Tag,
  Users,
  X,
} from 'lucide-react-native';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  ImageBackground,
  InteractionManager,
  Modal,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from 'expo-router';
import { useUserLocation } from '../../lib/useUserLocation';
import { formatDistance, getDistanceFromLatLonInKm } from '../../utils/location';
import { COLORS } from '../../constants/colors';
import { formatEventDateTime } from '../../utils/format';
import { useAppData } from '../../context/AppDataContext';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useMouseScroll } from '../../hooks/useMouseScroll';
import Animated, {
  LinearTransition,
  runOnJS,
  withTiming,
  FadeInRight,
  Easing,
  Extrapolation,
  FadeIn,
  FadeOut,
  FadeInDown,
  SlideInDown,
  SlideOutDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

const { width: windowWidth, height } = Dimensions.get('window');
const width = Platform.OS === 'web' ? Math.min(windowWidth, 800) : windowWidth;
const CARD_W = width * 0.54;
const CARD_GAP = 12;

const normalizeText = (text: string) => text ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const formatDayShort = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr.split('T')[0] + 'T12:00:00');
    return `${DAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  } catch { return ''; }
};

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0f0f0f' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4a4a4a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f0f0f' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#606060' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#111111' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#1e1e1e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0a0a0a' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#3a3a3a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#232323' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#131313' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#333333' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050505' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#1a1a1a' }] },
];

const SORT_OPTIONS = ['Distancia', 'Precio', 'Fecha'];
const DISTANCE_OPTIONS = [5, 10, 20, 50];
const DATE_OPTIONS = ['Hoy', 'Mañana', 'Esta Semana', 'Cualquiera'];
const AGE_OPTIONS = ['Todo Público', '+18', '+21'];
const CATEGORY_OPTIONS = ['Sunset', 'Rooftop', 'Afteroffice', 'Afterparty', 'Universitario', 'Nocturno'];
const MUSIC_OPTIONS = ['Reggaeton', 'Techno', 'House', 'Edm', 'Trap'];

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

const MapCarouselCard = memo(function MapCarouselCard({ item, index, scrollX, isTabEv, onPress }: {
  item: any;
  index: number;
  scrollX: SharedValue<number>;
  isTabEv: boolean;
  onPress: () => void;
}) {
  const SNAP = CARD_W + CARD_GAP;
  const animStyle = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * SNAP, index * SNAP, (index + 1) * SNAP];
    const scale = interpolate(scrollX.value, inputRange, [0.84, 1, 0.84], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.62, 1, 0.62], Extrapolation.CLAMP);
    const translateY = interpolate(scrollX.value, inputRange, [16, 0, 16], Extrapolation.CLAMP);
    return { transform: [{ scale }, { translateY }], opacity };
  });

  const clubObj = Array.isArray(item.clubs) ? item.clubs[0] : item.clubs;

  return (
    <Animated.View style={[styles.cardWrapper, animStyle]}>
      <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={onPress}>
        <ImageBackground source={{ uri: item.image_url || item.image }} style={styles.cardImg}>
          <LinearGradient colors={['transparent', 'rgba(3,3,3,0.72)', '#030303']} locations={[0.3, 0.68, 1]} style={styles.cardGradient}>
            {/* Badges superiores */}
            <View style={styles.cardTopRow}>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {isTabEv && item.date && formatDayShort(item.date) ? (
                  <BlurView intensity={30} tint="dark" style={styles.cardBadge}>
                    <Text style={styles.cardBadgeText}>{formatDayShort(item.date)}</Text>
                  </BlurView>
                ) : null}
                {item.effectiveMinAge > 0 ? (
                  <BlurView intensity={30} tint="dark" style={styles.cardBadge}>
                    <Text style={styles.cardBadgeText}>{item.effectiveMinAge}+</Text>
                  </BlurView>
                ) : null}
              </View>
              {item.distanceText ? (
                <BlurView intensity={30} tint="dark" style={[styles.cardBadge, { flexDirection: 'row', gap: 4 }]}>
                  <MapPin size={11} color="rgba(251,251,251,0.6)" />
                  <Text style={styles.cardBadgeText}>{item.distanceText}</Text>
                </BlurView>
              ) : null}
            </View>
            {/* Info inferior */}
            <View>
              {isTabEv && (clubObj?.name || item.club_name) ? (
                <Text style={styles.cardVenue} numberOfLines={1}>{clubObj?.name || item.club_name}</Text>
              ) : null}
              <View style={styles.cardFooter}>
                <Text style={[styles.cardTitle, (() => {
                  const l = (item.title || item.name || '').length;
                  const size = l <= 10 ? 20 : l <= 18 ? 16 : l <= 26 ? 13 : 11;
                  return { fontSize: size, lineHeight: size * 1.15 };
                })()]} numberOfLines={2}>
                  {item.title || item.name}
                </Text>
                <View style={styles.cardArrow}>
                  <ArrowRight size={16} color="white" />
                </View>
              </View>
            </View>
          </LinearGradient>
        </ImageBackground>
      </TouchableOpacity>
    </Animated.View>
  );
});

const CAT_CARD_GAP = 10;
const CAT_BIG_H = Math.round(width * 0.75);
const CAT_SMALL_W = Math.floor((width - 32 - CAT_CARD_GAP) / 2);
const CAT_SMALL_H = Math.round(CAT_SMALL_W * 1.0);
const CAT_GROUP_H = CAT_BIG_H + CAT_CARD_GAP + CAT_SMALL_H + 16; // 16 = marginBottom del grupo

function opt(v: any) { return (v && v !== 'undefined') ? v : undefined; }

function buildCatCardParams(item: any, isTabEv: boolean) {
  const exp = Array.isArray(item.experiences) ? item.experiences[0] : item.experiences;
  const clubObj = Array.isArray(item.clubs) ? item.clubs[0] : item.clubs;
  let cleanDate = item.date;
  if (cleanDate?.includes('T')) cleanDate = cleanDate.split('T')[0];
  const venue = isTabEv ? (clubObj?.name || item.club_name) : (item.location || item.address);
  const price = isTabEv
    ? (item.minTicketPrice >= 0 ? `Desde $${item.minTicketPrice.toLocaleString()}` : null)
    : null;
  return { exp, clubObj, cleanDate, venue, price };
}

function renderCatCard(item: any, isTabEv: boolean, router: any, big = true) {
  if (!item) return <View style={{ width: big ? width - 32 : CAT_SMALL_W, height: big ? CAT_BIG_H : CAT_SMALL_H }} />;
  const { exp, clubObj, cleanDate, venue, price } = buildCatCardParams(item, isTabEv);
  const titleLen = (item.title || item.name || '').length;
  const titleSize = big
    ? (titleLen <= 10 ? 26 : titleLen <= 18 ? 22 : titleLen <= 26 ? 18 : 15)
    : (titleLen <= 10 ? 14 : titleLen <= 18 ? 12 : 10);

  return (
    <TouchableOpacity
      key={item.id}
      style={{ width: big ? width - 32 : CAT_SMALL_W, height: big ? CAT_BIG_H : CAT_SMALL_H, borderRadius: big ? 24 : 18, overflow: 'hidden', backgroundColor: '#0A0A0A' }}
      activeOpacity={0.92}
      onPress={() => {
        if (isTabEv) eventCache.set(String(item.id), item);
        router.push({
          pathname: isTabEv ? '/event-detail' : '/club-detail',
          params: isTabEv
            ? (Platform.OS === 'web' ? { id: item.id } : {
                id: item.id, imageUrl: item.image_url || item.image || '',
                title: item.title || item.name, date: cleanDate, hour: item.hour,
                clubName: clubObj?.name || item.club_name, clubImage: clubObj?.image || item.club_image,
                accentColor: item.accent_color || item.theme_color || COLORS.neonPurple,
                themeColorEnd: item.theme_color_end || '#0a0014',
                category: item.category || item.area, area: item.area || item.category,
                producerName: exp?.name, producerLogo: exp?.logo_url, producerId: exp?.id, instagramUrl: item.instagram_url, status: item.status,
              })
            : (Platform.OS === 'web' ? { id: item.id } : { id: item.id, imageUrl: item.image || item.image_url, name: item.name || item.title, instagramUrl: opt(item.instagram || item.instagram_url) }),
        });
      }}
    >
      <ImageBackground source={{ uri: item.image_url || item.image }} style={{ flex: 1 }}>
        <LinearGradient colors={['transparent', 'rgba(3,3,3,0.65)', '#030303']} locations={[0.3, 0.72, 1]} style={{ flex: 1, padding: big ? 16 : 10, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {isTabEv && formatDayShort(item.date) ? (
              <BlurView intensity={30} tint="dark" style={styles.catBadge}>
                <Text style={styles.catBadgeText}>{formatDayShort(item.date)}</Text>
              </BlurView>
            ) : null}
            {big && isTabEv && (item.category || item.area) ? (
              <BlurView intensity={30} tint="dark" style={styles.catBadge}>
                <Text style={styles.catBadgeText}>{item.category || item.area}</Text>
              </BlurView>
            ) : null}
            {big && item.effectiveMinAge > 0 ? (
              <BlurView intensity={30} tint="dark" style={styles.catBadge}>
                <Text style={styles.catBadgeText}>{item.effectiveMinAge}+</Text>
              </BlurView>
            ) : null}
          </View>
          <View>
            {venue ? <Text style={[styles.catCardVenue, !big && { fontSize: 10 }]} numberOfLines={1}>{venue}</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#FBFBFB', fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5, fontSize: titleSize, lineHeight: titleSize * 1.15 }} numberOfLines={big ? 3 : 2}>
                  {item.title || item.name}
                </Text>
                {big && price ? <Text style={styles.catCardPrice}>{price}</Text> : null}
              </View>
              {big ? (
                <BlurView intensity={30} tint="dark" style={[styles.cardArrow, { marginLeft: 10, overflow: 'hidden' }]}>
                  <ArrowRight size={16} color="white" />
                </BlurView>
              ) : null}
            </View>
          </View>
        </LinearGradient>
      </ImageBackground>
    </TouchableOpacity>
  );
}

const CatRowFocused = memo(function CatRowFocused({ group, rowIdx, scrollY, isTabEv, router }: {
  group: [any, any | null, any | null];
  rowIdx: number;
  scrollY: SharedValue<number>;
  isTabEv: boolean;
  router: any;
}) {
  const animStyle = useAnimatedStyle(() => {
    const dist = Math.abs(scrollY.value - rowIdx * CAT_GROUP_H);
    const scale = interpolate(dist, [0, CAT_GROUP_H], [1, 0.88], Extrapolation.CLAMP);
    const opacity = interpolate(dist, [0, CAT_GROUP_H], [1, 0.45], Extrapolation.CLAMP);
    return { transform: [{ scale }], opacity };
  });

  return (
    <Animated.View style={[{ marginBottom: 16 }, animStyle]}>
      {renderCatCard(group[0], isTabEv, router, true)}
      {(group[1] || group[2]) ? (
        <View style={{ flexDirection: 'row', gap: CAT_CARD_GAP, marginTop: CAT_CARD_GAP }}>
          {renderCatCard(group[1], isTabEv, router, false)}
          {renderCatCard(group[2], isTabEv, router, false)}
        </View>
      ) : null}
    </Animated.View>
  );
});

export default function ExploreScreen() {
  const router = useRouter();
  
  // Ocultamiento seguro para Web
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  useFocusEffect(
      useCallback(() => {
          setIsScreenFocused(true);
          return () => setIsScreenFocused(false);
      }, [])
  );
  
  const { location } = useUserLocation();
  const { events: cachedEvents, clubs: cachedClubs, isLoaded: cacheLoaded, refresh: refreshCache } = useAppData();

  const insets = useSafeAreaInsets();

  const [events, setEvents] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [activeTabIndex, setActiveTabIndex] = useState(0); // 0 = Eventos, 1 = Clubes
  const tabs = ['Eventos', 'Clubes'];

  // NUEVO: Índice del item activo en el Carrusel Inferior
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);
  const mapRef = useRef<MapView>(null);
  const flatListRef = useRef<FlatList>(null);
  const mouseScrollParams = useMouseScroll(flatListRef);

  // 'map' = mapa + carrusel, 'catalog' = lista completa
  const [viewMode, setViewMode] = useState<'map' | 'catalog'>('catalog');

  const viewModePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderRelease: (_, g) => {
      if (g.dx < -30) setViewMode('catalog');
      else if (g.dx > 30) setViewMode('map');
    },
  })).current;

  const tabPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderRelease: (_, g) => {
      if (g.dx < -30) setActiveTabIndex(1);
      else if (g.dx > 30) setActiveTabIndex(0);
    },
  })).current;

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [activeFilterModal, setActiveFilterModal] = useState<string | null>(null);

  // ── INTERACTIVE DISMISS ──
  const filterOffset = useSharedValue(height);
  const _resetFilter = () => { setShowFilterMenu(false); setActiveFilterModal(null); };

  const closeFilterModal = () => {
    filterOffset.value = withTiming(height, { duration: 320, easing: Easing.inOut(Easing.quad) }, () => { runOnJS(_resetFilter)(); });
  };

  const filterSheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: filterOffset.value }] }));
  const filterOverlayStyle = useAnimatedStyle(() => ({ opacity: interpolate(filterOffset.value, [0, height], [1, 0], Extrapolation.CLAMP) }));

  useEffect(() => {
    if (showFilterMenu) {
      filterOffset.value = height;
      filterOffset.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
    }
  }, [showFilterMenu]);

  const filterPan = Gesture.Pan()
    .onUpdate(e => { if (e.translationY > 0) filterOffset.value = e.translationY; })
    .onEnd(e => {
      if (e.translationY > 100 || e.velocityY > 800) {
        filterOffset.value = withTiming(height, { duration: 250 }, () => { runOnJS(_resetFilter)(); });
      } else {
        filterOffset.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
      }
    });

  const [filters, setFilters] = useState({
    sortBy: 'Distancia',
    comuna: '',
    maxDistance: null as number | null,
    date: 'Cualquiera',
    category: '',
    minAge: '',
    musicGenre: ''
  });

  useEffect(() => {
    if (cacheLoaded && cachedEvents.length > 0) {
      setEvents(cachedEvents);
      setClubs(cachedClubs);
      setLoading(false);
    } else {
      const task = InteractionManager.runAfterInteractions(() => { fetchData(false); });
      return () => task.cancel();
    }
  }, [cacheLoaded]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshCache(), fetchData(true)]);
    setRefreshing(false);
  }, [refreshCache]);

  const geocodeAndSave = async (id: string, address: string, table: 'events' | 'clubs') => {
    if (!address || address.length < 4) return null;
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ", Chile")}&format=json&limit=1`,
        { headers: { 'User-Agent': 'DisgoApp' } }
      );
      const data = await response.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        await supabase.from(table).update({ latitude: lat, longitude: lon }).eq('id', id);
        return { latitude: lat, longitude: lon };
      }
    } catch (e) { return null; }
    return null;
  };

  async function fetchData(isRefresh = false) {
    try {
      if (!isRefresh) setLoading(true);

      const { data: evData, error: evError } = await supabase
        .from('events')
        .select('*, clubs(name, location, image), ticket_tiers(price), experiences(id, name, logo_url)')
        .eq('is_active', true)
        .in('status', ['active', 'info'])
        .order('date', { ascending: true })
        .limit(1000);

      const { data: clData, error: clError } = await supabase.from('clubs').select('*');

      setEvents(evData || []);
      setClubs(clData || []);
      (evData || []).forEach((e: any) => {
        const cl = Array.isArray(e.clubs) ? e.clubs[0] : e.clubs;
        const exp = Array.isArray(e.experiences) ? e.experiences[0] : e.experiences;
        if (cl?.image) ExpoImage.prefetch(cl.image);
        if (exp?.logo_url) ExpoImage.prefetch(exp.logo_url);
      });
      (clData || []).forEach((c: any) => {
        if (c.image) ExpoImage.prefetch(c.image);
      });

      if (!isRefresh) setLoading(false);

    } catch (err) {
      console.error('[explore] fetchData failed:', err);
    } finally {
      setLoading(false);
    }
  }

  const getFilteredItemsForTab = (tabName: string) => {
    const rawItems = tabName === 'Eventos' ? events : clubs;

    const processedItems = rawItems.map(item => {
      let distance = null;
      let distanceText = '';
      if (location && item.latitude && item.longitude) {
        distance = getDistanceFromLatLonInKm(
          location.coords.latitude,
          location.coords.longitude,
          item.latitude,
          item.longitude
        );
        distanceText = formatDistance(distance);
      }

      let minTicketPrice = Infinity;
      if (item.ticket_tiers && item.ticket_tiers.length > 0) {
        minTicketPrice = Math.min(...item.ticket_tiers.map((t: any) => t.price));
      } else if (item.price !== undefined && item.price !== null) {
        minTicketPrice = item.price;
      } else {
        minTicketPrice = 0;
      }

      const ageMen = item.min_age_men || 18;
      const ageWomen = item.min_age_women || 18;
      const effectiveMinAge = Math.min(ageMen, ageWomen);

      return { ...item, distance, distanceText, minTicketPrice, effectiveMinAge };
    });

    const filtered = processedItems.filter(item => {
      const query = normalizeText(searchQuery);
      const matchesSearch = normalizeText(item.title || item.name || "").includes(query) ||
        normalizeText(item.location || item.address || "").includes(query);

      const matchesComuna = filters.comuna
        ? normalizeText(item.location || item.address || item.area || "").includes(normalizeText(filters.comuna))
        : true;

      const matchesDistance = filters.maxDistance && item.distance !== null
        ? item.distance <= filters.maxDistance
        : true;

      const matchesCategory = filters.category
        ? normalizeText(item.category || item.tags || "").includes(normalizeText(filters.category))
        : true;

      const matchesMusic = filters.musicGenre
        ? normalizeText(item.music_genre || "").includes(normalizeText(filters.musicGenre))
        : true;

      let matchesAge = true;
      if (filters.minAge) {
        if (filters.minAge === '+18') matchesAge = item.effectiveMinAge >= 18;
        else if (filters.minAge === '+21') matchesAge = item.effectiveMinAge >= 21;
        else if (filters.minAge === 'Todo Público') matchesAge = true;
      }

      let matchesDate = true;
      if (filters.date !== 'Cualquiera') {
        if (!item.date) {
          matchesDate = false;
        } else {
          const itemDate = new Date(item.date + 'T00:00:00');
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

          if (filters.date === 'Hoy') {
            matchesDate = itemDate.getTime() === today.getTime();
          } else if (filters.date === 'Mañana') {
            matchesDate = itemDate.getTime() === tomorrow.getTime();
          } else if (filters.date === 'Esta Semana') {
            const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
            matchesDate = itemDate >= today && itemDate <= nextWeek;
          }
        }
      }

      return matchesSearch && matchesComuna && matchesDistance && matchesCategory && matchesMusic && matchesAge && matchesDate;
    }).sort((a, b) => {
      if (filters.sortBy === 'Precio') {
        const priceA = a.minTicketPrice === Infinity ? 9999999 : a.minTicketPrice;
        const priceB = b.minTicketPrice === Infinity ? 9999999 : b.minTicketPrice;
        return priceA - priceB;
      } else if (filters.sortBy === 'Fecha') {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      } else {
        const distA = a.distance !== null ? a.distance : 999999;
        const distB = b.distance !== null ? b.distance : 999999;
        return distA - distB;
      }
    });

    return filtered;
  };

  // Solo items con coords (para el mapa)
  const currentData = useMemo(
    () => getFilteredItemsForTab(tabs[activeTabIndex]).filter(f => f.latitude && f.longitude),
    [events, clubs, location, searchQuery, filters, activeTabIndex]
  );
  // Todos los items filtrados (para el catálogo)
  const catalogData = useMemo(
    () => getFilteredItemsForTab(tabs[activeTabIndex]),
    [events, clubs, location, searchQuery, filters, activeTabIndex]
  );

  // Carousel scroll tracking for scale effect
  const scrollX = useSharedValue(0);
  const onScrollHandler = useAnimatedScrollHandler(e => {
    scrollX.value = e.contentOffset.x;
  });

  const catalogScrollY = useSharedValue(0);
  const catalogScrollHandler = useAnimatedScrollHandler(e => {
    catalogScrollY.value = e.contentOffset.y;
  });

  const catPairs = useMemo(() => {
    const groups: [any, any | null, any | null][] = [];
    for (let i = 0; i < catalogData.length; i += 3) groups.push([catalogData[i], catalogData[i + 1] ?? null, catalogData[i + 2] ?? null]);
    return groups;
  }, [catalogData]);


  const SNAP = CARD_W + CARD_GAP;
  const N = catalogData.length;

  // 200 copias → el usuario nunca llega al borde en uso normal.
  // FlatList virtualiza los items (solo ~windowSize en memoria), sin costo extra.
  const LOOP_MULTIPLIER = N > 1 ? 200 : 1;
  const LOOP_MID = Math.floor(LOOP_MULTIPLIER / 2); // copia central = índice 100

  const loopedData = useMemo(() => {
    if (N === 0) return [];
    if (N === 1) return [...catalogData];
    return Array.from({ length: LOOP_MULTIPLIER }, () => catalogData).flat();
  }, [catalogData, LOOP_MULTIPLIER]);

  // ANIMATED MAP CENTERING
  const animateMapToIndex = useCallback((loopedIdx: number) => {
    if (N === 0) return;
    const actualIdx = ((loopedIdx % N) + N) % N;
    const item = currentData[actualIdx] ?? currentData[0];
    if (item?.latitude && item?.longitude && mapRef.current) {
      setActiveCarouselIndex(actualIdx);
      mapRef.current.animateCamera({
        center: { latitude: item.latitude - 0.005, longitude: item.longitude },
        zoom: 14.5,
        pitch: 45,
      }, { duration: 500 });
    }
  }, [currentData, N]);

  // Predice el destino del snap antes de que termine la inercia (mueve el mapa ya)
  const onScrollEndDrag = useCallback((event: any) => {
    const { contentOffset, velocity } = event.nativeEvent;
    let loopedIdx = Math.round(contentOffset.x / SNAP);
    if (velocity?.x > 0.3) loopedIdx = Math.min(loopedData.length - 1, Math.floor(contentOffset.x / SNAP) + 1);
    else if (velocity?.x < -0.3) loopedIdx = Math.max(0, Math.ceil(contentOffset.x / SNAP) - 1);
    loopedIdx = Math.max(0, Math.min(loopedData.length - 1, loopedIdx));
    animateMapToIndex(loopedIdx);
  }, [animateMapToIndex, loopedData.length, SNAP]);

  // Corrección final cuando el snap se detiene
  const onMomentumScrollEnd = useCallback((event: any) => {
    const loopedIdx = Math.round(event.nativeEvent.contentOffset.x / SNAP);
    animateMapToIndex(loopedIdx);
  }, [animateMapToIndex, SNAP]);

  // Resetear al cambiar de tab — siempre al item 0 de la copia central
  useEffect(() => {
    setActiveCarouselIndex(0);
    const startOffset = LOOP_MID * N * SNAP;
    flatListRef.current?.scrollToOffset({ offset: startOffset, animated: false });
    if (catalogData.length > 0) {
      const item = catalogData[0];
      if (item.latitude && item.longitude && mapRef.current) {
        mapRef.current.animateCamera({
          center: { latitude: item.latitude - 0.005, longitude: item.longitude },
          zoom: 14.5,
          pitch: 45,
        }, { duration: 600 });
      }
    }
  }, [activeTabIndex, N]);


  const renderFilterContent = () => {
    switch (activeFilterModal) {
      case 'sort':
        return (
          <>
            <Text style={styles.modalTitle}>Ordenar por</Text>
            <View style={styles.verticalOptions}>
              {SORT_OPTIONS.map(opt => (
                <TouchableOpacity key={opt} style={styles.optionRow} onPress={() => { setFilters({ ...filters, sortBy: opt }); setActiveFilterModal(null); }}>
                  <Text style={[styles.optionText, filters.sortBy === opt && styles.optionTextActive]}>{opt}</Text>
                  {filters.sortBy === opt && <Check size={18} color={COLORS.neonPurple} />}
                </TouchableOpacity>
              ))}
            </View>
          </>
        );
      case 'date':
        return (
          <>
            <Text style={styles.modalTitle}>¿Cuándo?</Text>
            <View style={styles.verticalOptions}>
              {DATE_OPTIONS.map(opt => (
                <TouchableOpacity key={opt} style={styles.optionRow} onPress={() => { setFilters({ ...filters, date: opt }); setActiveFilterModal(null); }}>
                  <Text style={[styles.optionText, filters.date === opt && styles.optionTextActive]}>{opt}</Text>
                  {filters.date === opt && <Check size={18} color={COLORS.neonPurple} />}
                </TouchableOpacity>
              ))}
            </View>
          </>
        );
      case 'distance':
        return (
          <>
            <Text style={styles.modalTitle}>Ubicación y Distancia</Text>
            <Text style={styles.filterLabel}>Escribir Comuna</Text>
            <TextInput
              style={styles.filterInput}
              placeholder="Ej: Las Condes"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={filters.comuna}
              onChangeText={(t) => setFilters({ ...filters, comuna: t })}
            />
            {location && (
              <>
                <Text style={styles.filterLabel}>Distancia Máxima</Text>
                <View style={styles.chipsContainer}>
                  {DISTANCE_OPTIONS.map(dist => (
                    <TouchableOpacity
                      key={dist}
                      style={[styles.chip, filters.maxDistance === dist && styles.chipActive]}
                      onPress={() => setFilters({ ...filters, maxDistance: filters.maxDistance === dist ? null : dist })}
                    >
                      <Text style={[styles.chipText, filters.maxDistance === dist && styles.chipTextActive]}>{dist} km</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <TouchableOpacity style={styles.mainBtn} onPress={closeFilterModal}>
              <LinearGradient colors={['#FF31D8', '#FF31D8']} style={styles.mainBtnGradient}>
                <Text style={styles.mainBtnText}>Aplicar Cambios</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        );
      case 'category':
        return (
          <>
            <Text style={styles.modalTitle}>Categorías</Text>
            <View style={styles.chipsContainer}>
              {CATEGORY_OPTIONS.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, filters.category === cat && styles.chipActive]}
                  onPress={() => setFilters({ ...filters, category: filters.category === cat ? '' : cat })}
                >
                  <Text style={[styles.chipText, filters.category === cat && styles.chipTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.mainBtn} onPress={closeFilterModal}>
              <LinearGradient colors={['#FF31D8', '#FF31D8']} style={styles.mainBtnGradient}>
                <Text style={styles.mainBtnText}>Aplicar Cambios</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        );
      case 'music':
        return (
          <>
            <Text style={styles.modalTitle}>Estilo Musical</Text>
            <View style={styles.chipsContainer}>
              {MUSIC_OPTIONS.map(music => (
                <TouchableOpacity
                  key={music}
                  style={[styles.chip, filters.musicGenre === music && styles.chipActive]}
                  onPress={() => setFilters({ ...filters, musicGenre: filters.musicGenre === music ? '' : music })}
                >
                  <Text style={[styles.chipText, filters.musicGenre === music && styles.chipTextActive]}>{music}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.mainBtn} onPress={closeFilterModal}>
              <LinearGradient colors={['#FF31D8', '#FF31D8']} style={styles.mainBtnGradient}>
                <Text style={styles.mainBtnText}>Aplicar Cambios</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        );
      case 'age':
        return (
          <>
            <Text style={styles.modalTitle}>Edad Permitida</Text>
            <View style={styles.verticalOptions}>
              {AGE_OPTIONS.map(opt => (
                <TouchableOpacity key={opt} style={styles.optionRow} onPress={() => { setFilters({ ...filters, minAge: filters.minAge === opt ? '' : opt }); setActiveFilterModal(null); }}>
                  <Text style={[styles.optionText, filters.minAge === opt && styles.optionTextActive]}>{opt}</Text>
                  {filters.minAge === opt && <Check size={18} color={COLORS.neonPurple} />}
                </TouchableOpacity>
              ))}
            </View>
          </>
        );
      default:
        return null;
    }
  };

  const activeFiltersCount = [
    filters.date !== 'Cualquiera',
    filters.sortBy !== 'Distancia',
    !!filters.category,
    !!filters.musicGenre,
    !!filters.minAge,
    !!filters.comuna || !!filters.maxDistance,
  ].filter(Boolean).length;

  return (
    <View style={[styles.container, Platform.OS === 'web' && !isScreenFocused && { opacity: 0 }]} pointerEvents={Platform.OS === 'web' && !isScreenFocused ? 'none' : 'auto'}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* MAPA — siempre montado para no perder el estado */}
      <View style={[StyleSheet.absoluteFill, Platform.OS === 'web' && viewMode === 'catalog' && { opacity: 0, pointerEvents: 'none' }]}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          userInterfaceStyle="dark"
          initialRegion={{ latitude: location ? location.coords.latitude - 0.005 : -33.4489, longitude: location ? location.coords.longitude : -70.6693, latitudeDelta: 0.1, longitudeDelta: 0.1 }}
          mapType="hybrid"
          showsUserLocation={true} showsPointsOfInterest={false} showsBuildings={true} showsTraffic={false} pitchEnabled={true} rotateEnabled={true} compassOffset={{ x: -30, y: height / 2 }}
        >
          {viewMode === 'map' && currentData.map((item: any, idx: number) => {
            const isSelected = activeCarouselIndex === idx;
            return (
              <Marker key={item.id} coordinate={{ latitude: item.latitude, longitude: item.longitude }} tracksViewChanges={isSelected} anchor={{ x: 0.5, y: 0.5 }}>
                {isSelected ? (
                  <View style={styles.activePinContainer}>
                    <View style={styles.activePinRing}><View style={styles.activePinInner} /></View>
                  </View>
                ) : (
                  <View style={styles.inactivePin}><View style={styles.inactivePinDot} /></View>
                )}
              </Marker>
            );
          })}
        </MapView>
      </View>

      {/* FONDO CATÁLOGO — cubre el mapa cuando el modo es catálogo (En Web es transparente para dejar ver el WebShell) */}
      <View style={[StyleSheet.absoluteFill, styles.catalogBg, { display: viewMode === 'catalog' ? 'flex' : 'none' }]} pointerEvents="none">
        {Platform.OS !== 'web' && (
           <>
              <LinearGradient colors={['rgba(255,49,216,0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
              <LinearGradient colors={['transparent', 'rgba(255,49,216,0.15)']} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <LinearGradient colors={['transparent', 'rgba(255,49,216,0.05)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFill} />
           </>
        )}
      </View>

      {/* GRADIENTE SUPERIOR — solo en modo mapa */}
      <LinearGradient colors={['rgba(3,3,3,0.85)', 'transparent']} style={[styles.topVignette, { display: viewMode === 'map' ? 'flex' : 'none' }]} pointerEvents="none" />

      {/* HUD */}
      {(() => {
        return (
          <Animated.View entering={FadeInDown.duration(300).delay(80).springify()} style={[styles.hudContainer, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">

            {/* Fila 1: Barra principal pill */}
            <View style={{ marginBottom: 10 }}>
              <BlurView intensity={50} tint="dark" style={styles.navbarBlur}>
                <Search size={16} color="rgba(251,251,251,0.5)" />
                <TextInput
                  placeholder="Busca en la ciudad..."
                  placeholderTextColor="rgba(251,251,251,0.4)"
                  style={styles.navbarInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery !== '' && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                    <X size={16} color="rgba(251,251,251,0.5)" />
                  </TouchableOpacity>
                )}
                <View style={{ width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 4 }} />
                <TouchableOpacity style={{ position: 'relative', padding: 4 }} onPress={() => setShowFilterMenu(true)}>
                  <Filter size={24} color={activeFiltersCount > 0 ? '#FF31D8' : 'rgba(251,251,251,0.5)'} />
                  {activeFiltersCount > 0 && (
                    <View style={{ position: 'absolute', top: 3, right: 3, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF31D8', borderWidth: 2, borderColor: '#030303' }} />
                  )}
                </TouchableOpacity>
              </BlurView>
            </View>

            {/* Fila 2: Toggle modo + Tabs */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
              {/* Toggle Mapa / Catálogo */}
              <View {...viewModePan.panHandlers} style={{ overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(251,251,251,0.06)' }}>
                <BlurView intensity={50} tint="dark" style={{ flexDirection: 'row', height: 44, padding: 4, gap: 2, borderRadius: 22 }}>
                  <TouchableOpacity
                    onPress={() => setViewMode('catalog')}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: viewMode === 'catalog' ? 'rgba(255,255,255,0.12)' : 'transparent' }}
                    activeOpacity={0.8}
                  >
                    <List size={14} color={viewMode === 'catalog' ? '#FF31D8' : 'rgba(251,251,251,0.45)'} />
                    <Text style={{ color: viewMode === 'catalog' ? '#FBFBFB' : 'rgba(251,251,251,0.45)', fontWeight: viewMode === 'catalog' ? '800' : '600', fontSize: 13 }}>Catálogo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setViewMode('map')}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: viewMode === 'map' ? 'rgba(255,255,255,0.12)' : 'transparent' }}
                    activeOpacity={0.8}
                  >
                    <MapIcon size={14} color={viewMode === 'map' ? '#FF31D8' : 'rgba(251,251,251,0.45)'} />
                    <Text style={{ color: viewMode === 'map' ? '#FBFBFB' : 'rgba(251,251,251,0.45)', fontWeight: viewMode === 'map' ? '800' : '600', fontSize: 13 }}>Mapa</Text>
                  </TouchableOpacity>
                </BlurView>
              </View>

              {/* Tabs Eventos / Clubes */}
              <View {...tabPan.panHandlers} style={{ overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(251,251,251,0.06)', flex: 1 }}>
                <BlurView intensity={40} tint="dark" style={{ flexDirection: 'row', height: 44, padding: 4, gap: 2, borderRadius: 22 }}>
                  {tabs.map((t, idx) => (
                    <TouchableOpacity
                      key={t}
                      style={{ flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 18, backgroundColor: activeTabIndex === idx ? 'rgba(255,255,255,0.12)' : 'transparent' }}
                      onPress={() => setActiveTabIndex(idx)}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: activeTabIndex === idx ? '#FBFBFB' : 'rgba(251,251,251,0.45)', fontWeight: activeTabIndex === idx ? '800' : '600', fontSize: 13 }}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </BlurView>
              </View>
            </View>

            {/* Filter modal moved out of HUD */}
          </Animated.View>
        );
      })()}

      {/* HINT MAPA */}
      <View style={{ display: viewMode === 'map' && currentData.length > 0 ? 'flex' : 'none', position: 'absolute', bottom: Math.max(insets.bottom + 96, 110) + 218, left: 0, right: 0, alignItems: 'center', zIndex: 9 }} pointerEvents="none">
        <BlurView intensity={30} tint="dark" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <Text style={{ color: 'rgba(251,251,251,0.45)', fontSize: 12, fontWeight: '500' }}>← Desliza las tarjetas para navegar el mapa →</Text>
        </BlurView>
      </View>

      {/* CARRUSEL INFERIOR — siempre montado, oculto en modo catálogo */}
      <View style={[styles.carouselContainer, { bottom: Math.max(insets.bottom + 96, 110), display: viewMode === 'map' ? 'flex' : 'none' }]}>
        {catalogData.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Sin resultados</Text>
            <Text style={styles.emptySubtitle}>No hay eventos en esta zona.</Text>
          </View>
        ) : (
          <AnimatedFlatList
            {...mouseScrollParams}
            ref={flatListRef}
            data={loopedData}
            keyExtractor={(item: any, index: number) => `${item.id}-${index}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={SNAP}
            decelerationRate="fast"
            disableIntervalMomentum={true}
            removeClippedSubviews={true}
            maxToRenderPerBatch={8}
            windowSize={5}
            initialNumToRender={6}
            getItemLayout={(_: any, index: number) => ({ length: SNAP, offset: (width - CARD_W) / 2 + index * SNAP, index })}
            onLayout={() => {
              if (N > 1) flatListRef.current?.scrollToOffset({ offset: LOOP_MID * N * SNAP, animated: false });
            }}
            onScrollEndDrag={onScrollEndDrag}
            onMomentumScrollEnd={onMomentumScrollEnd}
            onScroll={onScrollHandler}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingHorizontal: (width - CARD_W) / 2 }}
            renderItem={({ item, index }: { item: any; index: number }) => {
              const isTabEv = tabs[activeTabIndex] === 'Eventos';
              const exp = Array.isArray(item.experiences) ? item.experiences[0] : item.experiences;
              const clubObj = Array.isArray(item.clubs) ? item.clubs[0] : item.clubs;
              let cleanDate = item.date;
              if (cleanDate && typeof cleanDate === 'string' && cleanDate.includes('T')) cleanDate = cleanDate.split('T')[0];
              return (
                <MapCarouselCard
                  item={item}
                  index={index}
                  scrollX={scrollX}
                  isTabEv={isTabEv}
                  onPress={() => {
                    const actualIdx = N > 0 ? ((index % N) + N) % N : index;
                    if (actualIdx !== activeCarouselIndex) {
                      flatListRef.current?.scrollToOffset({ offset: index * SNAP, animated: true });
                      animateMapToIndex(index);
                      return;
                    }
                    if (isTabEv) eventCache.set(String(item.id), item);
                    router.push({
                      pathname: isTabEv ? '/event-detail' : '/club-detail',
                      params: isTabEv
                        ? (Platform.OS === 'web' ? { id: item.id } : {
                            id: item.id, imageUrl: item.image_url || item.image || '',
                            title: item.title || item.name, date: cleanDate, hour: item.hour,
                            clubName: clubObj?.name || item.club_name, clubImage: clubObj?.image || item.club_image,
                            accentColor: item.accent_color || item.theme_color || COLORS.neonPurple,
                            themeColorEnd: item.theme_color_end || '#0a0014',
                            category: item.category || item.area, area: item.area || item.category,
                            producerName: exp?.name, producerLogo: exp?.logo_url, producerId: exp?.id, instagramUrl: item.instagram_url, status: item.status,
                          })
                        : (Platform.OS === 'web' ? { id: item.id } : { id: item.id, imageUrl: item.image || item.image_url, name: item.name || item.title, instagramUrl: item.instagram || item.instagram_url }),
                    });
                  }}
                />
              );
            }}
          />
        )}
      </View>

      {/* MODO CATÁLOGO — siempre montado, oculto en modo mapa */}
      <AnimatedFlatList
        style={[StyleSheet.absoluteFill, { zIndex: 5, display: viewMode === 'catalog' ? 'flex' : 'none' }]}
        data={catPairs}
        keyExtractor={(_: any, idx: number) => idx.toString()}
        showsVerticalScrollIndicator={false}
        onScroll={catalogScrollHandler}
        scrollEventThrottle={16}
        snapToInterval={CAT_GROUP_H}
        decelerationRate="fast"
        removeClippedSubviews={true}
        maxToRenderPerBatch={8}
        windowSize={5}
        initialNumToRender={6}
        contentContainerStyle={{ paddingTop: insets.top + 170, paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF31D8" />}
        renderItem={({ item: group, index: rowIdx }: { item: any; index: number }) => (
          <CatRowFocused
            group={group}
            rowIdx={rowIdx}
            scrollY={catalogScrollY}
            isTabEv={tabs[activeTabIndex] === 'Eventos'}
            router={router}
          />
        )}
      />

      {/* ── MODAL FILTROS INTERACTIVO ── */}
      <Modal
        visible={showFilterMenu}
        transparent
        animationType="none"
        onRequestClose={closeFilterModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[{ flex: 1, justifyContent: 'flex-end' }]}
        >
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }, filterOverlayStyle]}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={closeFilterModal}
            />
          </Animated.View>
          <Animated.View layout={LinearTransition.duration(250).easing(Easing.out(Easing.quad))} style={[styles.modalSheetPremium, { overflow: 'visible', paddingBottom: insets.bottom + 24, maxHeight: height * 0.76 }, filterSheetStyle]}>
            <View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }]}>
              <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
            </View>

            <GestureDetector gesture={filterPan}>
              <View style={{ alignItems: 'center', paddingVertical: 14, marginHorizontal: -25 }}>
                <View style={[styles.modalHandleThin, { marginBottom: 0 }]} />
              </View>
            </GestureDetector>

            {/* Header del Modal */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {activeFilterModal !== null && (
                  <TouchableOpacity
                    onPress={() => setActiveFilterModal(null)}
                    style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' }}
                  >
                    <ArrowLeft color="white" size={20} />
                  </TouchableOpacity>
                )}
                <View>
                  <Text style={[styles.modalTitle, { marginBottom: 0 }]}>
                    {activeFilterModal === null ? 'Filtros' : 'Opciones'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={closeFilterModal}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' }}
              >
                <X color="rgba(255,255,255,0.6)" size={20} />
              </TouchableOpacity>
            </View>

            {/* Contenido */}
            {activeFilterModal === null ? (
              <Animated.View entering={FadeIn.duration(250)} style={{ width: '100%' }}>
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: height * 0.52 }} contentContainerStyle={{ paddingBottom: 30 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
                    {activeFiltersCount > 0 && (
                      <TouchableOpacity
                        onPress={() => { setFilters({ sortBy: 'Distancia', comuna: '', maxDistance: null, date: 'Cualquiera', category: '', minAge: '', musicGenre: '' }); closeFilterModal(); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)' }}
                      >
                        <X size={12} color="#FF4444" />
                        <Text style={{ color: '#FF4444', fontSize: 12, fontWeight: '800' }}>Borrar todo</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {[
                    { key: 'sort', icon: <ArrowUpDown size={16} color={filters.sortBy !== 'Distancia' ? '#FF31D8' : 'rgba(255,255,255,0.6)'} />, label: 'Ordenar por', value: filters.sortBy !== 'Distancia' ? filters.sortBy : null },
                    { key: 'date', icon: <Calendar size={16} color={filters.date !== 'Cualquiera' ? '#FF31D8' : 'rgba(255,255,255,0.6)'} />, label: 'Fecha', value: filters.date !== 'Cualquiera' ? filters.date : null },
                    { key: 'distance', icon: <MapPin size={16} color={(filters.comuna || filters.maxDistance) ? '#FF31D8' : 'rgba(255,255,255,0.6)'} />, label: 'Ubicación', value: filters.comuna || (filters.maxDistance ? `${filters.maxDistance} km` : null) },
                    { key: 'category', icon: <Tag size={16} color={filters.category ? '#FF31D8' : 'rgba(255,255,255,0.6)'} />, label: 'Categoría', value: filters.category || null },
                    { key: 'music', icon: <Music size={16} color={filters.musicGenre ? '#FF31D8' : 'rgba(255,255,255,0.6)'} />, label: 'Estilo musical', value: filters.musicGenre || null },
                    { key: 'age', icon: <Users size={16} color={filters.minAge ? '#FF31D8' : 'rgba(255,255,255,0.6)'} />, label: 'Edad', value: filters.minAge || null },
                  ].map(row => (
                    <TouchableOpacity
                      key={row.key}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', gap: 14 }}
                      onPress={() => setActiveFilterModal(row.key)}
                    >
                      {row.icon}
                      <Text style={{ flex: 1, color: 'white', fontSize: 15, fontWeight: '700' }}>{row.label}</Text>
                      {row.value ? (
                        <Text style={{ color: '#FF31D8', fontSize: 13, fontWeight: '700', maxWidth: 140 }} numberOfLines={1}>{row.value}</Text>
                      ) : (
                        <ArrowRight size={16} color="rgba(255,255,255,0.3)" />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeInRight.duration(300)} style={{ width: '100%' }}>
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: height * 0.52 }} contentContainerStyle={{ paddingBottom: 30 }}>
                  {renderFilterContent()}
                </ScrollView>
              </Animated.View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#030303' },
  topVignette: { position: 'absolute', top: 0, left: 0, right: 0, height: 220, zIndex: 1 },
  catalogBg: { backgroundColor: Platform.OS === 'web' ? 'transparent' : '#030303' },

  // Catálogo — scroll vertical focus
  catBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', alignItems: 'center' },
  catBadgeText: { color: '#FBFBFB', fontWeight: '700', fontSize: 11 },
  catCardVenue: { color: 'rgba(251,251,251,0.6)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.3 },
  catCardPrice: { color: '#FF31D8', fontSize: 14, fontWeight: '800', marginTop: 4 },

  // Pins del mapa
  activePinContainer: { alignItems: 'center', justifyContent: 'center' },
  activePinRing: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,49,216,0.18)', justifyContent: 'center', alignItems: 'center', shadowColor: '#FF31D8', shadowRadius: 10, shadowOpacity: 0.8, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  activePinInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF31D8' },
  inactivePin: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,49,216,0.10)', justifyContent: 'center', alignItems: 'center', shadowColor: '#FF31D8', shadowRadius: 5, shadowOpacity: 0.45, shadowOffset: { width: 0, height: 0 } },
  inactivePinDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,49,216,0.7)' },

  // HUD
  hudContainer: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingHorizontal: 16 },

  navbarBlur: { flexDirection: 'row', alignItems: 'center', height: 60, paddingHorizontal: 16, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(251,251,251,0.05)', backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'hidden', gap: 8 },
  navbarInput: { flex: 1, marginLeft: 4, color: '#FBFBFB', fontSize: 15, height: '100%' },

  hudRow2: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  tabPill: { flexDirection: 'row', height: 38, borderRadius: 19, overflow: 'hidden', padding: 3, borderWidth: 1, borderColor: 'rgba(251,251,251,0.06)' },
  tabBtn: { paddingHorizontal: 16, height: '100%', justifyContent: 'center', alignItems: 'center', borderRadius: 16 },
  tabBtnActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  tabText: { color: 'rgba(251,251,251,0.5)', fontWeight: '500', fontSize: 13 },
  tabTextActive: { color: '#FBFBFB', fontWeight: '800' },

  filterChipsContent: { gap: 6, alignItems: 'center', paddingRight: 4 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(251,251,251,0.07)' },
  filterChipActive: { backgroundColor: 'rgba(255,49,216,0.1)', borderColor: 'rgba(255,49,216,0.35)' },
  filterChipText: { color: 'rgba(251,251,251,0.55)', fontWeight: '500', fontSize: 12 },
  filterChipTextActive: { color: '#FF31D8', fontWeight: '700' },

  // Carrusel
  carouselContainer: { position: 'absolute', left: 0, right: 0, height: 210, zIndex: 10 },
  cardWrapper: { width: CARD_W, height: 210, marginRight: CARD_GAP },
  card: { flex: 1, borderRadius: 32, overflow: 'hidden', backgroundColor: '#0A0A0A', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  cardImg: { flex: 1 },
  cardGradient: { flex: 1, padding: 16, justifyContent: 'space-between' },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  cardBadgeText: { color: '#FBFBFB', fontWeight: '500', fontSize: 10 },
  cardVenue: { color: 'rgba(251,251,251,0.55)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2, letterSpacing: 0.3 },
  cardTitle: { flex: 1, color: '#FBFBFB', fontSize: 20, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5, marginRight: 10 },
  cardFooter: { flexDirection: 'row', alignItems: 'center' },
  cardPrice: { color: '#FF31D8', fontSize: 15, fontWeight: '800' },
  cardArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },

  emptyBox: { width: '80%', height: 72, alignSelf: 'center', borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(10,10,10,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  emptyTitle: { color: '#FBFBFB', fontWeight: '800', fontSize: 15 },
  emptySubtitle: { color: 'rgba(251,251,251,0.5)', fontSize: 12, fontWeight: '500', marginTop: 2 },


  // Modales de filtros
  modalBackdropDark: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheetPremium: { backgroundColor: 'transparent', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 24, paddingBottom: 50, paddingTop: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  modalHandleThin: { width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  modalTitle: { color: '#FBFBFB', fontSize: 22, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5, marginBottom: 24 },
  filterLabel: { color: 'rgba(251,251,251,0.45)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10, marginTop: 10, letterSpacing: 1 },
  filterInput: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, color: '#FBFBFB', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 20, fontSize: 15 },
  verticalOptions: { gap: 0 },
  optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  optionText: { color: 'rgba(251,251,251,0.55)', fontSize: 16, fontWeight: '500' },
  optionTextActive: { color: '#FBFBFB', fontWeight: '800' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  chipActive: { backgroundColor: 'rgba(255,49,216,0.12)', borderColor: 'rgba(255,49,216,0.4)' },
  chipText: { color: 'rgba(251,251,251,0.55)', fontSize: 14, fontWeight: '500' },
  chipTextActive: { color: '#FF31D8', fontWeight: '800' },
  mainBtn: { overflow: 'hidden', borderRadius: 20, marginTop: 10, height: 52 },
  mainBtnGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mainBtnText: { color: 'white', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
});