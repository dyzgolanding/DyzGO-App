import { BlurView } from '../../components/BlurSurface';
import { Tabs, useRouter } from 'expo-router';
import { Compass, House, Store, User } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const ICONS: Record<string, { icon: React.ComponentType<any>; label: string }> = {
  home: { icon: House, label: 'Home' },
  explore: { icon: Compass, label: 'Explore' },
  marketplace: { icon: Store, label: 'Shop' },
  profile: { icon: User, label: 'Profile' },
};

const TabItem = ({ route, index, state, navigation, tabWidth, leftEdge, rightEdge }: any) => {
  const isFocused = state.index === index;
  const { icon: Icon, label } = ICONS[route.name] || { icon: House, label: 'App' };
  const router = useRouter();
  const isNavigating = React.useRef(false);

  const animatedScaleStyle = useAnimatedStyle(() => {
    if (tabWidth === 0) return {};

    const tabCenter = index * tabWidth;
    const bubbleCenter = (leftEdge.value + rightEdge.value) / 2;
    const distanceFromCenter = Math.abs(bubbleCenter - tabCenter);

    const scale = interpolate(
      distanceFromCenter,
      [0, tabWidth * 0.5],
      [1.08, 1],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ scale }],
    };
  });

  const handlePress = async () => {
    if (isFocused || isNavigating.current) return;

    // Tab Profile requiere autenticación
    if (route.name === 'profile') {
      isNavigating.current = true;
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push({ pathname: '/login', params: { redirect: '/(tabs)/profile' } } as any);
        // Evitaremos nuevos toques por 1 segundo mientras ocurre la animación de la ruta de login
        setTimeout(() => {
          isNavigating.current = false;
        }, 1000);
        return;
      }
      
      isNavigating.current = false;
    }

    isNavigating.current = true;
    setTimeout(() => {
       isNavigating.current = false;
    }, 500);

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  };

  return (
    <AnimatedTouchableOpacity
      onPress={handlePress}
      style={[styles.tabButton, animatedScaleStyle]}
      activeOpacity={1}
    >
      <Icon
        size={22}
        color={isFocused ? '#FFFFFF' : 'rgba(255,255,255,0.4)'}
        strokeWidth={isFocused ? 2.5 : 2}
      />
      <Text style={[
        styles.tabLabel,
        { color: isFocused ? '#FFFFFF' : 'rgba(255,255,255,0.4)', fontWeight: isFocused ? '700' : '500' }
      ]}>
        {label}
      </Text>
    </AnimatedTouchableOpacity>
  );
};

function CustomTabBar({ state, descriptors, navigation }: any) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const insets = useSafeAreaInsets();
  const isDragging = useSharedValue(false);

  // Para tap: posición única sin deformación
  const tapPosition = useSharedValue(0);

  // Para drag: bordes independientes que permiten estirar la burbuja
  const leftEdge = useSharedValue(0);
  const rightEdge = useSharedValue(0);

  const totalTabs = state.routes.length;
  const tabWidth = layout.width > 0 ? layout.width / totalTabs : 0;

  useEffect(() => {
    if (tabWidth > 0 && leftEdge.value === 0 && rightEdge.value === 0 && state.index === 0) {
      tapPosition.value = 0;
      leftEdge.value = 0;
      rightEdge.value = tabWidth;
    }
  }, [tabWidth]);

  useEffect(() => {
    if (tabWidth > 0 && !isDragging.value) {
      const targetLeft = state.index * tabWidth;
      // Tap: un solo spring limpio, sin deformación
      tapPosition.value = withSpring(targetLeft, { damping: 20, stiffness: 200, mass: 0.8 });
      // Sincronizar edges para que el drag sepa desde dónde partir
      leftEdge.value = targetLeft;
      rightEdge.value = targetLeft + tabWidth;
    }
  }, [state.index, tabWidth]);

  const navigateToTab = (index: number) => {
    const route = state.routes[index];
    if (state.index !== index) {
      navigation.navigate(route.name);
    }
  };

  // Pan gesture only on native — web doesn't support it reliably
  const panGesture = Platform.OS !== 'web'
    ? Gesture.Pan()
        .onStart(() => {
          isDragging.value = true;
          leftEdge.value = tapPosition.value;
          rightEdge.value = tapPosition.value + tabWidth;
        })
        .onUpdate((e) => {
          const targetLeft = e.x - tabWidth / 2;
          const maxTranslate = layout.width - tabWidth;
          const clampedLeft = Math.max(0, Math.min(targetLeft, maxTranslate));
          leftEdge.value = clampedLeft;
          rightEdge.value = clampedLeft + tabWidth;
        })
        .onEnd((e) => {
          const targetIndex = Math.round(e.x / tabWidth);
          const index = Math.max(0, Math.min(targetIndex, totalTabs - 1));
          const targetLeft = index * tabWidth;
          tapPosition.value = leftEdge.value;
          isDragging.value = false;
          tapPosition.value = withSpring(targetLeft, { damping: 20, stiffness: 200, mass: 0.8 });
          leftEdge.value = targetLeft;
          rightEdge.value = targetLeft + tabWidth;
          runOnJS(navigateToTab)(index);
        })
    : Gesture.Pan(); // no-op gesture on web

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    if (isDragging.value) {
      // Drag: deforma la burbuja entre los dos bordes
      const currentWidth = rightEdge.value - leftEdge.value;
      const scaleX = currentWidth / tabWidth;
      const translateX = leftEdge.value + (currentWidth - tabWidth) / 2;
      return {
        transform: [{ translateX: translateX || 0 }, { scaleX: scaleX || 1 }],
        width: tabWidth,
      };
    } else {
      // Tap: deslizamiento limpio sin deformación
      return {
        transform: [{ translateX: tapPosition.value || 0 }, { scaleX: 1 }],
        width: tabWidth,
      };
    }
  });

  const bottomOffset = Math.max(insets.bottom + 8, 20);

  return (
    <View style={[styles.floatingWrapper, { bottom: bottomOffset }]}>
      <View style={styles.tabBarContainer}>
        <BlurView
          intensity={50}
          tint="dark"
          style={[StyleSheet.absoluteFill, { borderRadius: 32 }]}
        />
        <View style={styles.glassBorder} />

        <View style={styles.paddingWrapper}>
          {/* Pan gesture — native only; GestureDetector throws on web */}
          {Platform.OS !== 'web' ? (
            <GestureDetector gesture={panGesture}>
              <View
                style={styles.contentContainer}
                onLayout={(e: LayoutChangeEvent) => setLayout(e.nativeEvent.layout)}
              >
                {layout.width > 0 && (
                  <Animated.View style={[styles.activeIndicatorContainer, animatedIndicatorStyle]}>
                    <View style={styles.indicatorPill}>
                      <BlurView intensity={25} tint="light" style={[StyleSheet.absoluteFill, { borderRadius: 100 }]} />
                    </View>
                  </Animated.View>
                )}
                {state.routes.map((route: any, index: number) => (
                  <TabItem
                    key={route.key}
                    route={route}
                    index={index}
                    state={state}
                    navigation={navigation}
                    tabWidth={tabWidth}
                    leftEdge={leftEdge}
                    rightEdge={rightEdge}
                  />
                ))}
              </View>
            </GestureDetector>
          ) : (
            <View
              style={styles.contentContainer}
              onLayout={(e: LayoutChangeEvent) => setLayout(e.nativeEvent.layout)}
            >
              {layout.width > 0 && (
                <Animated.View style={[styles.activeIndicatorContainer, animatedIndicatorStyle]}>
                  <View style={styles.indicatorPill}>
                    <BlurView intensity={25} tint="light" style={[StyleSheet.absoluteFill, { borderRadius: 100 }]} />
                  </View>
                </Animated.View>
              )}
              {state.routes.map((route: any, index: number) => (
                <TabItem
                  key={route.key}
                  route={route}
                  index={index}
                  state={state}
                  navigation={navigation}
                  tabWidth={tabWidth}
                  leftEdge={leftEdge}
                  rightEdge={rightEdge}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const tabs = (
    <Tabs tabBar={props => <CustomTabBar {...props} />} screenOptions={{ headerShown: false, unmountOnBlur: Platform.OS === 'web', sceneStyle: { backgroundColor: Platform.OS === 'web' ? 'transparent' : '#000000' } }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="marketplace" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );

  // GestureHandlerRootView is native-only — causes 'loading' TDZ on web
  if (Platform.OS === 'web') return tabs;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#000000' }}>
      {tabs}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  floatingWrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 1000,
  },
  tabBarContainer: {
    width: '100%',
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    flexDirection: 'row',
  },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(251, 251, 251, 0.05)',
  },
  paddingWrapper: {
    flex: 1,
    paddingHorizontal: 12,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  tabButton: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    backgroundColor: 'transparent',
  },
  tabLabel: {
    fontSize: 9,
    marginTop: 4,
  },
  activeIndicatorContainer: {
    position: 'absolute',
    height: '100%',
    top: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  indicatorPill: {
    width: '100%',
    height: '75%',
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
  },
});