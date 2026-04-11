/**
 * Animation Design System — Single source of truth
 *
 * Rules:
 *  - ALL timings use these tokens. No hardcoded durations anywhere.
 *  - Navigation transitions use `nav` timing (fast, predictable).
 *  - Screen content uses `enter` / `exit` (slightly slower, more expressive).
 *  - Interactive elements (buttons, cards) use springs — they feel alive.
 *  - Stagger is capped at MAX_STAGGER_DELAY so long lists still feel slow.
 */

import { Easing } from 'react-native-reanimated';

// ─── Easing presets ────────────────────────────────────────────────────────
// Named after GSAP equivalents for mental model consistency.
export const Ease = {
  expoOut: Easing.linear,
  out:     Easing.linear,
  in:      Easing.linear,
  inOut:   Easing.linear,
  nav:     Easing.bezier(0.25, 0.46, 0.45, 0.94),
  navBack: Easing.bezier(0.55, 0, 0.45, 1),
} as const;

// ─── Duration tokens (ms) ─────────────────────────────────────────────────
export const Duration = {
  instant:    50,
  fast:       80,
  normal:    100,
  enter:     100,
  exit:       80,
  navOpen:   180,
  navClose:  140,
} as const;

// ─── Pre-built timing configs ─────────────────────────────────────────────
// Pass directly to withTiming({ ...timing.enter })
export const timing = {
  enter:  { duration: Duration.enter,  easing: Ease.expoOut },
  exit:   { duration: Duration.exit,   easing: Ease.in      },
  fast:   { duration: Duration.fast,   easing: Ease.out     },
  normal: { duration: Duration.normal, easing: Ease.expoOut },
  nav:    { duration: Duration.navOpen, easing: Ease.nav    },
} as const;

// ─── Spring configs ────────────────────────────────────────────────────────
// Use springs for interactive/gesture elements — they match velocity naturally.
export const Spring = {
  // Button presses, icon taps — instant snap
  snappy:  { mass: 0.4, damping: 18, stiffness: 350 },
  // Cards, panels — feels physical
  default: { mass: 0.6, damping: 20, stiffness: 240 },
  // Drag releases — velocity-matched
  fluid:   { mass: 0.8, damping: 24, stiffness: 280 },
  // iOS-style bouncy
  bouncy:  { mass: 0.6, damping: 11, stiffness: 120 },
} as const;

// ─── Stagger utility ──────────────────────────────────────────────────────
// Caps at MAX_STAGGER_DELAY so a list of 30 items never makes the last one
// wait 1.6s. The last item always appears within MAX_STAGGER_DELAY ms.
const MAX_STAGGER_DELAY = 160;

export const stagger = (index: number, baseMs = 40): number =>
  Math.min(index * baseMs, MAX_STAGGER_DELAY);
