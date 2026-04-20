import { Platform } from 'react-native';

type PendingNav = { pathname: string; params?: Record<string, string> } | null;

const NAV_KEY     = 'dyzgo_pending_nav';
const HANDLED_KEY = 'dyzgo_nav_handled';

let memPending: PendingNav = null;
let memHandled = false;

export function setPendingNav(nav: PendingNav) {
  if (Platform.OS === 'web') {
    if (nav) sessionStorage.setItem(NAV_KEY, JSON.stringify(nav));
    else sessionStorage.removeItem(NAV_KEY);
  } else {
    memPending = nav;
  }
}

export function consumePendingNav(): PendingNav {
  if (Platform.OS === 'web') {
    try {
      const raw = sessionStorage.getItem(NAV_KEY);
      if (raw) {
        sessionStorage.removeItem(NAV_KEY);
        return JSON.parse(raw);
      }
    } catch {}
    return null;
  }
  const nav = memPending;
  memPending = null;
  return nav;
}

// Called by login.tsx after it already handled the redirect,
// so _layout.tsx knows NOT to override with /(tabs)/home
export function markNavHandled() {
  if (Platform.OS === 'web') sessionStorage.setItem(HANDLED_KEY, '1');
  else memHandled = true;
}

export function wasNavHandled(): boolean {
  if (Platform.OS === 'web') {
    const v = !!sessionStorage.getItem(HANDLED_KEY);
    if (v) sessionStorage.removeItem(HANDLED_KEY);
    return v;
  }
  const v = memHandled;
  memHandled = false;
  return v;
}
