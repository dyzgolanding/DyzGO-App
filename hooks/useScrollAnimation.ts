/**
 * useScrollAnimation — Scroll-driven animation values
 *
 * GSAP ScrollTrigger equivalent:
 *   scrollTrigger: { trigger, start: "top center", scrub: true }
 *
 * Usage:
 *   const { scrollHandler, getParallax, getFadeIn } = useScrollAnimation();
 *
 *   // On your ScrollView:
 *   <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16}>
 *
 *   // Header parallax:
 *   const headerStyle = useAnimatedStyle(() => ({
 *     transform: [{ translateY: getParallax(0.4) }],
 *   }));
 *
 *   // Fade in an element at scroll position 200:
 *   const cardStyle = useAnimatedStyle(() => ({
 *     opacity: getFadeIn(200, 100), // starts fading at 200, fully visible at 300
 *   }));
 */

import { useScrollViewOffset } from 'react-native-reanimated';
import { interpolate, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

export function useScrollAnimation() {
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  /**
   * Parallax — element moves at a fraction of scroll speed
   * rate: 0.3 = slow (bg), 0.7 = fast (foreground)
   */
  const getParallax = (rate = 0.3) =>
    interpolate(scrollY.value, [0, 500], [0, -500 * rate]);

  /**
   * Fade in when scrolled to a position
   * start: scroll Y where fade begins
   * distance: scroll distance over which element goes 0 → 1 opacity
   */
  const getFadeIn = (start: number, distance = 80) =>
    interpolate(scrollY.value, [start, start + distance], [0, 1], 'clamp');

  /**
   * Scale header on scroll (hero image compression)
   */
  const getHeroScale = (height: number) =>
    interpolate(scrollY.value, [-100, 0, height], [1.3, 1, 0.8], 'clamp');

  /**
   * Sticky header opacity — fades in as you scroll past a threshold
   */
  const getHeaderOpacity = (threshold = 120) =>
    interpolate(scrollY.value, [threshold - 40, threshold], [0, 1], 'clamp');

  return { scrollY, scrollHandler, getParallax, getFadeIn, getHeroScale, getHeaderOpacity };
}
