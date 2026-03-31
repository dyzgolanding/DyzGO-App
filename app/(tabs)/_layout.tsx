import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import { Bookmark, Compass, House, Store, User } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

// --- AQUÍ QUITÉ "decide" PARA DEJAR TUS 5 PESTAÑAS EXACTAS ---
const ICONS: Record<string, any> = {
  home: { icon: House, label: 'Home' },
  explore: { icon: Compass, label: 'Explore' },
  marketplace: { icon: Store, label: 'Shop' },
  saved: { icon: Bookmark, label: 'Saved' },
  profile: { icon: User, label: 'Profile' },
};

const TabItem = ({ route, index, state, navigation, tabWidth, leftEdge, rightEdge }: any) => {
  const isFocused = state.index === index;
  const { icon: Icon, label } = ICONS[route.name] || { icon: House, label: 'App' };

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

  const handlePress = () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isDragging.value = true;
      // Al empezar a arrastrar, sincronizar edges con la posición actual de tap
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

      // Sincronizar tapPosition con la posición actual del drag antes de cambiar el modo
      tapPosition.value = leftEdge.value;
      isDragging.value = false;

      // Ahora animar desde la posición actual del drag hasta el destino
      tapPosition.value = withSpring(targetLeft, { damping: 20, stiffness: 200, mass: 0.8 });
      leftEdge.value = targetLeft;
      rightEdge.value = targetLeft + tabWidth;

      runOnJS(navigateToTab)(index);
    });

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
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.glassBorder} />

        <View style={styles.paddingWrapper}>
          <GestureDetector gesture={panGesture}>
            <View
              style={styles.contentContainer}
              onLayout={(e: LayoutChangeEvent) => setLayout(e.nativeEvent.layout)}
            >
              {layout.width > 0 && (
                <Animated.View style={[styles.activeIndicatorContainer, animatedIndicatorStyle]}>
                  <View style={styles.indicatorPill}>
                    <BlurView intensity={25} tint="light" style={StyleSheet.absoluteFill} />
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
        </View>
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
      <Tabs tabBar={props => <CustomTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#000000' } }}>
        <Tabs.Screen name="home" />
        <Tabs.Screen name="explore" />
        <Tabs.Screen name="marketplace" />
        <Tabs.Screen name="profile" />
      </Tabs>
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