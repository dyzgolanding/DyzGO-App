import { BlurView } from '../../components/BlurSurface';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { ShoppingCart, Plus, Minus, Wine, X, ChevronLeft } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Dimensions, FlatList, Modal,
  ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import Animated, {
  FadeInUp,
  useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import { SkeletonBox } from '../../components/SkeletonBox';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavBar, useNavBarPaddingTop } from '../../components/NavBar';
import { COLORS } from '../../constants/colors';
import { Spring, timing } from '../../lib/animation';
import { supabase } from '../../lib/supabase';
import { useNavRouter } from '../../hooks/useNavRouter';

const { width } = Dimensions.get('window');

const ALCOHOL_COLORS: Record<string, string> = {
  none: '#22c55e',
  low: '#3b82f6',
  medium: '#f59e0b',
  high: '#ef4444',
};
const ALCOHOL_LABELS: Record<string, string> = {
  none: 'Sin alcohol',
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

interface Category { id: string; name: string; is_active: boolean }
interface MenuItem {
  id: string; category_id: string | null; name: string; description: string | null;
  price: number; image_url: string | null; is_available: boolean; stock_enabled: boolean;
  stock_remaining: number | null; prep_time_seconds: number; alcohol_content: string;
}

const withAlpha = (hex: string, alpha: number) => {
  const clean = hex.startsWith('#') ? hex : `#${hex}`;
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${clean}${a}`;
};

export default function ConsumptionMenuScreen() {
  const router = useNavRouter();
  const insets = useSafeAreaInsets();
  const navTop = useNavBarPaddingTop();
  const params = useLocalSearchParams();

  const eventId = params.eventId as string;
  const eventName = params.eventName as string;
  const accentColor = (params.accentColor as string) || COLORS.neonPurple;

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCart, setShowCart] = useState(false);

  // Reanimated — cart modal slide
  const slideY = useSharedValue(600);
  const cartAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value }],
  }));

  const openCart = useCallback(() => {
    setShowCart(true);
    slideY.value = 600;
    slideY.value = withSpring(0, Spring.default);
  }, []);

  const closeCart = useCallback(() => {
    slideY.value = withTiming(600, timing.exit, (finished) => {
      if (finished) runOnJS(setShowCart)(false);
    });
  }, []);

  useEffect(() => {
    loadMenu();
  }, [eventId]);

  const loadMenu = async () => {
    setLoading(true);
    const [{ data: cats }, { data: its }] = await Promise.all([
      supabase.from('consumption_categories').select('id, name, is_active').eq('event_id', eventId).eq('is_active', true).order('sort_order'),
      supabase.from('consumption_items').select('*').eq('event_id', eventId).eq('is_available', true).order('sort_order'),
    ]);
    setCategories(cats || []);
    setItems(its || []);
    setLoading(false);
  };

  const addToCart = (itemId: string) => {
    setCart(prev => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const next = { ...prev };
      if ((next[itemId] || 0) <= 1) delete next[itemId];
      else next[itemId]--;
      return next;
    });
  };

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = items.find(i => i.id === id);
    return sum + (item?.price || 0) * qty;
  }, 0);

  const filteredItems = selectedCat === 'all'
    ? items
    : items.filter(i => i.category_id === selectedCat);

  const handleCheckout = () => {
    if (cartCount === 0) return;
    const cartData = Object.entries(cart).map(([item_id, quantity]) => ({
      item_id,
      quantity,
      price: items.find(i => i.id === item_id)?.price || 0,
      name: items.find(i => i.id === item_id)?.name || '',
    }));
    closeCart();
    router.push({
      pathname: '/(consumption)/consumption-payment',
      params: {
        eventId,
        eventName,
        accentColor,
        cartData: JSON.stringify(cartData),
      },
    });
  };

  if (loading) return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={[withAlpha(accentColor, 0.2), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', withAlpha(accentColor, 0.15)]} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </View>
      <NavBar title="CARTA DE CONSUMOS" onBack={() => router.back()} />
      <View style={{ flex: 1, padding: 20, paddingTop: navTop + 52 }}>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          {[1, 2, 3, 4].map(i => <SkeletonBox key={i} height={36} width={72} borderRadius={20} />)}
        </View>
        {[1, 2, 3, 4].map(i => (
          <View key={i} style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <SkeletonBox height={90} width={90} borderRadius={12} />
            <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
              <SkeletonBox height={20} borderRadius={6} />
              <SkeletonBox height={14} borderRadius={6} width="65%" />
              <SkeletonBox height={14} borderRadius={6} width="40%" />
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <Animated.View entering={FadeInUp.duration(300).springify()} style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Gradiente de fondo */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient colors={[withAlpha(accentColor, 0.2), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', withAlpha(accentColor, 0.15)]} start={{ x: 0.4, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['transparent', withAlpha(accentColor, 0.05), 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0.3, 0.5, 0.7]} style={StyleSheet.absoluteFill} />
      </View>

      <NavBar title="CARTA DE CONSUMOS" onBack={() => router.back()} />

      {/* Category tabs flotando */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: navTop - 12, zIndex: 10, alignItems: 'center', paddingHorizontal: 20 }}>
        {categories.length > 0 && (
          <View style={{ overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(251,251,251,0.06)', maxWidth: '100%' }}>
            <BlurView intensity={50} tint="dark" style={{ flexDirection: 'row', height: 44, padding: 4 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 2, flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
                {[{ id: 'all', name: 'Todo' }, ...categories].map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setSelectedCat(cat.id)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
                      borderRadius: 18, height: '100%',
                      backgroundColor: selectedCat === cat.id ? 'rgba(255,255,255,0.12)' : 'transparent'
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{
                      color: selectedCat === cat.id ? '#FBFBFB' : 'rgba(251,251,251,0.45)',
                      fontWeight: selectedCat === cat.id ? '800' : '600',
                      fontSize: 13
                    }}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </BlurView>
          </View>
        )}
      </View>

      {/* Items */}
      <FlatList
        data={filteredItems}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 20, paddingTop: categories.length > 0 ? navTop + 52 : navTop, paddingBottom: insets.bottom + 100, gap: 12 }}
        removeClippedSubviews={true}
        maxToRenderPerBatch={8}
        windowSize={5}
        initialNumToRender={6}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const qty = cart[item.id] || 0;
          return (
            <View style={styles.itemCard}>
              {item.image_url ? (
                <ExpoImage source={{ uri: item.image_url }} style={styles.itemImage} contentFit="cover" />
              ) : (
                <View style={[styles.itemImagePlaceholder, { backgroundColor: accentColor + '15' }]}>
                  <Wine size={28} color={accentColor + '60'} />
                </View>
              )}
              <View style={{ flex: 1, padding: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.itemPrice, { color: accentColor }]}>
                    ${item.price.toLocaleString('es-CL')}
                  </Text>
                </View>
                {item.description && (
                  <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <View style={[styles.alcoholBadge, { borderColor: ALCOHOL_COLORS[item.alcohol_content] + '50', backgroundColor: ALCOHOL_COLORS[item.alcohol_content] + '20' }]}>
                    <Text style={[styles.alcoholText, { color: ALCOHOL_COLORS[item.alcohol_content] }]}>
                      {ALCOHOL_LABELS[item.alcohol_content]}
                    </Text>
                  </View>
                  {qty === 0 ? (
                    <TouchableOpacity onPress={() => addToCart(item.id)} style={[styles.addBtn, { backgroundColor: withAlpha(accentColor, 0.15), borderWidth: 1, borderColor: withAlpha(accentColor, 0.35) }]}>
                      <Plus size={16} color={accentColor} />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.qtyControl}>
                      <TouchableOpacity onPress={() => removeFromCart(item.id)} style={styles.qtyBtn}>
                        <Minus size={14} color={COLORS.textWhite} />
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{qty}</Text>
                      <TouchableOpacity onPress={() => addToCart(item.id)} style={[styles.qtyBtn, { backgroundColor: withAlpha(accentColor, 0.35) }]}>
                        <Plus size={14} color={accentColor} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Wine size={48} color="rgba(255,255,255,0.1)" />
            <Text style={styles.emptyText}>No hay ítems disponibles{'\n'}en este momento</Text>
          </View>
        )}
      />

      {/* Floating cart button */}
      {cartCount > 0 && (
        <View style={[styles.floatingCart, { bottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            onPress={openCart}
            style={[styles.floatingCartBtn, {
              backgroundColor: withAlpha(accentColor, 0.15),
              borderWidth: 1,
              borderColor: withAlpha(accentColor, 0.35),
            }]}
            activeOpacity={0.9}
          >
            <ShoppingCart size={18} color={accentColor} />
            <Text style={[styles.floatingCartText, { color: accentColor }]}>Ver pedido · {cartCount} ítem{cartCount > 1 ? 's' : ''}</Text>
            <Text style={[styles.floatingCartPrice, { color: accentColor }]}>${cartTotal.toLocaleString('es-CL')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Cart Modal */}
      <Modal visible={showCart} transparent animationType="none" onRequestClose={closeCart}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={closeCart} />
          <Animated.View style={[styles.cartModal, cartAnimStyle]}>
            <View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }]}>
              <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
            </View>
            <View style={styles.cartHandle} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={styles.cartTitle}>Tu Pedido</Text>
              <TouchableOpacity onPress={closeCart}><X size={20} color="rgba(255,255,255,0.4)" /></TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {Object.entries(cart).map(([itemId, qty]) => {
                const item = items.find(i => i.id === itemId);
                if (!item) return null;
                return (
                  <View key={itemId} style={styles.cartItem}>
                    <Text style={styles.cartItemName}>{item.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={styles.qtyControl}>
                        <TouchableOpacity onPress={() => removeFromCart(itemId)} style={styles.qtyBtn}>
                          <Minus size={12} color={COLORS.textWhite} />
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{qty}</Text>
                        <TouchableOpacity onPress={() => addToCart(itemId)} style={[styles.qtyBtn, { backgroundColor: withAlpha(accentColor, 0.35) }]}>
                          <Plus size={12} color={accentColor} />
                        </TouchableOpacity>
                      </View>
                      <Text style={{ color: accentColor, fontWeight: '800', fontSize: 14 }}>
                        ${(item.price * qty).toLocaleString('es-CL')}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.cartDivider} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '600', fontSize: 14 }}>Total</Text>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>${cartTotal.toLocaleString('es-CL')}</Text>
            </View>
            <TouchableOpacity onPress={handleCheckout} style={[styles.checkoutBtn, { backgroundColor: withAlpha(accentColor, 0.15), borderWidth: 1, borderColor: withAlpha(accentColor, 0.35) }]} activeOpacity={0.85}>
              <Text style={[styles.checkoutBtnText, { color: accentColor }]}>Ir al Pago →</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030303' },
  center: { flex: 1, backgroundColor: '#030303', justifyContent: 'center', alignItems: 'center' },
  catScroll: { maxHeight: 52, marginBottom: 8 },
  catChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', height: 36, justifyContent: 'center' },
  catChipText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700' },
  itemCard: { flexDirection: 'row', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.glassBorder, backgroundColor: COLORS.glassBg, height: 110 },
  itemImage: { width: 100, height: '100%' },
  itemImagePlaceholder: { width: 100, height: '100%', justifyContent: 'center', alignItems: 'center' },
  itemName: { color: '#fff', fontWeight: '800', fontSize: 14, flex: 1 },
  itemPrice: { fontWeight: '900', fontSize: 15 },
  itemDesc: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4, lineHeight: 15 },
  alcoholBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  alcoholText: { fontSize: 10, fontWeight: '700' },
  addBtn: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20, paddingHorizontal: 4, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  qtyText: { color: '#fff', fontWeight: '900', fontSize: 13, minWidth: 20, textAlign: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 60, gap: 16 },
  emptyText: { color: 'rgba(255,255,255,0.2)', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  floatingCart: { position: 'absolute', left: 20, right: 20 },
  floatingCartBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderRadius: 20, gap: 10 },
  floatingCartText: { fontWeight: '800', fontSize: 14, flex: 1 },
  floatingCartPrice: { fontWeight: '900', fontSize: 15 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  cartModal: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40, borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  cartHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 20 },
  cartTitle: { color: '#fff', fontWeight: '900', fontSize: 20 },
  cartItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  cartItemName: { color: '#fff', fontWeight: '700', fontSize: 14, flex: 1 },
  cartDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 16 },
  checkoutBtn: { paddingVertical: 16, borderRadius: 20, alignItems: 'center' },
  checkoutBtnText: { fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
});
