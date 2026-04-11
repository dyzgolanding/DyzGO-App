/**
 * useNavRouter — drop-in replacement for expo-router's useRouter.
 * Wraps push/navigate/replace with a global nav lock so rapid taps
 * never push duplicate screens.
 *
 * Usage: replace `import { useRouter } from 'expo-router'`
 *        with   `import { useNavRouter as useRouter } from '../hooks/useNavRouter'`
 */

import { useRouter } from 'expo-router';
import { navLock } from '../lib/navLock';

export function useNavRouter() {
  const router = useRouter();

  const push: typeof router.push = (...args) => {
    if (!navLock.tryLock()) return;
    router.push(...args);
  };

  const navigate: typeof router.navigate = (...args) => {
    if (!navLock.tryLock()) return;
    router.navigate(...args);
  };

  const replace: typeof router.replace = (...args) => {
    if (!navLock.tryLock()) return;
    router.replace(...args);
  };

  return { ...router, push, navigate, replace };
}
