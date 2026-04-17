import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Session } from '@supabase/supabase-js';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef, useState } from 'react';
import { Easing, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { AppDataProvider, useAppData } from '../context/AppDataContext';
import { SavedProvider } from '../context/SavedContext';
import { OnboardingContext } from '../context/OnboardingContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { PermissionModal } from '../components/PermissionModal';
import { registerForPushNotificationsAsync } from '../lib/push';
import { supabase } from '../lib/supabase';

// ─── Custom modal animation (native only) ────────────────────────────────────
const NAV_EASING      = Easing.bezier(0.25, 0.46, 0.45, 0.94);
const NAV_BACK_EASING = Easing.bezier(0.55, 0, 0.45, 1);

function SessionPreloader({ session }: { session: Session | null }) {
  const { preload } = useAppData();
  useEffect(() => { preload(); }, []);
  return null;
}

const PureBlackTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: Platform.OS === 'web' ? 'transparent' : '#000000', card: '#000000', border: '#222222' },
};

// ─── Desktop phone-shell wrapper (web only) ───────────────────────────────────
function WebShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.backgroundColor = '#000000';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    // Enhanced pink/purple gradients for a more vibrant, premium look
    document.body.style.backgroundImage = [
      'radial-gradient(ellipse 90% 90% at 15% 20%, rgba(255,49,216,0.30) 0%, transparent 65%)',
      'radial-gradient(ellipse 80% 80% at 85% 85%, rgba(255,49,216,0.28) 0%, transparent 65%)',
      'radial-gradient(ellipse 60% 60% at 50% 0%, rgba(255,49,216,0.15) 0%, transparent 50%)'
    ].join(', ');

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      const isScrollable = (el: HTMLElement) => {
         const overflowY = window.getComputedStyle(el).overflowY;
         return (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
      };
      
      let curr: HTMLElement | null = target;
      let targetIsScrollable = false;
      while (curr && curr !== document.body) {
         if (isScrollable(curr)) {
             targetIsScrollable = true;
             break;
         }
         curr = curr.parentElement;
      }
      
      if (!targetIsScrollable) {
         const allNodes = document.querySelectorAll('*');
         let mainScroller: HTMLElement | null = null;
         for (let i = 0; i < allNodes.length; i++) {
            const el = allNodes[i] as HTMLElement;
            if (isScrollable(el)) {
               if (!mainScroller || el.clientHeight > mainScroller.clientHeight) {
                   mainScroller = el;
               }
            }
         }
         if (mainScroller) {
             mainScroller.scrollTop += e.deltaY;
         }
      }
    };
    
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <View style={styles.webOuter}>
      <View style={styles.webShell}>
        {children}
      </View>
    </View>
  );
}

// ─── Root layout ──────────────────────────────────────────────────────────────
function RootLayout() {
  const [session, setSession]                             = useState<Session | null>(null);
  const [isReady, setIsReady]                             = useState(false);
  const [isRecoveryMode, setIsRecoveryMode]               = useState(false);
  const [isBiometricAuthorized, setIsBiometricAuthorized] = useState(false);
  const [needsOnboarding, setNeedsOnboarding]             = useState<boolean | null>(null);
  const [showPushModal, setShowPushModal]                 = useState(false);
  const pendingPushUserId = useRef<string | null>(null);

  const notifListener    = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  const segments = useSegments();
  const router   = useRouter();

  useEffect(() => {
    if (Platform.OS !== 'web') {
      SystemUI.setBackgroundColorAsync('#000000').catch(() => {});
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        checkOnboardingStatus(session.user.id);
        handleBiometricCheck();
        checkAndRequestPush(session.user.id);
      } else {
        setNeedsOnboarding(false);
        setIsBiometricAuthorized(true);
        setIsReady(true);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setIsRecoveryMode(true);
      if (event === 'SIGNED_OUT') {
        setIsRecoveryMode(false);
        setIsBiometricAuthorized(true);
        setNeedsOnboarding(false);
      }
      setSession(session);
      if (event === 'SIGNED_IN' && session) {
        checkOnboardingStatus(session.user.id);
        checkAndRequestPush(session.user.id);
      }
    });

    if (Platform.OS !== 'web') {
      notifListener.current    = Notifications.addNotificationReceivedListener(() => {});
      responseListener.current = Notifications.addNotificationResponseReceivedListener(r => {
        const data = r.notification.request.content.data as any;
        if (data?.url) router.push(data.url);
      });
    }

    return () => {
      authListener.subscription.unsubscribe();
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  const checkAndRequestPush = async (userId: string) => {
    if (Platform.OS === 'web') return;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'undetermined') {
        pendingPushUserId.current = userId;
        setShowPushModal(true);
      } else {
        registerForPushNotificationsAsync(userId).catch(() => {});
      }
    } catch {
      registerForPushNotificationsAsync(userId).catch(() => {});
    }
  };

  const checkOnboardingStatus = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('birth_date')
        .eq('id', userId)
        .single();
      setNeedsOnboarding(!data?.birth_date);
    } catch {
      setNeedsOnboarding(false);
    }
  };

  const handleBiometricCheck = async () => {
    if (Platform.OS === 'web') {
      setIsBiometricAuthorized(true);
      setIsReady(true);
      return;
    }
    try {
      const bioEnabled = await SecureStore.getItemAsync('biometrics_enabled');
      if (bioEnabled === 'true') {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Desbloquear DyzGO',
          disableDeviceFallback: false,
          cancelLabel: 'Cancelar',
        });
        if (result.success) {
          setIsBiometricAuthorized(true);
          setIsReady(true);
        }
      } else {
        setIsBiometricAuthorized(true);
        setIsReady(true);
      }
    } catch {
      setIsBiometricAuthorized(true);
      setIsReady(true);
    }
  };

  useEffect(() => {
    if (!isReady || !isBiometricAuthorized || needsOnboarding === null) return;
    const inOnboarding = segments[1] === 'onboarding';
    if (session && !isRecoveryMode) {
      if (needsOnboarding && !inOnboarding) {
        router.replace('/onboarding');
      } else if (!needsOnboarding && segments[0] === '(auth)' && !inOnboarding) {
        router.replace('/(tabs)/home');
      }
    }
  }, [session, segments, isReady, isRecoveryMode, isBiometricAuthorized, needsOnboarding]);

  if (!isReady || !isBiometricAuthorized) {
    return <View style={{ flex: 1, backgroundColor: '#030303' }} />;
  }

  const appContent = (
    <ErrorBoundary>
      <OnboardingContext.Provider value={{ setNeedsOnboarding }}>
        <AppDataProvider>
          <SessionPreloader session={session} />
          <SavedProvider>
            <ThemeProvider value={PureBlackTheme}>
              {Platform.OS !== 'web' && (
                <StatusBar barStyle="light-content" backgroundColor="#000000" />
              )}

              {Platform.OS !== 'web' && (
                <PermissionModal
                  visible={showPushModal}
                  icon={<Bell color="#FF31D8" size={36} />}
                  title="Mantente al día"
                  description="Activa las notificaciones para enterarte primero de nuevos eventos, preventas y actualizaciones de tus tickets."
                  allowLabel="Activar notificaciones"
                  denyLabel="Ahora no"
                  onAllow={() => {
                    setShowPushModal(false);
                    if (pendingPushUserId.current) {
                      registerForPushNotificationsAsync(pendingPushUserId.current).catch(() => {});
                      pendingPushUserId.current = null;
                    }
                  }}
                  onDeny={() => {
                    setShowPushModal(false);
                    pendingPushUserId.current = null;
                  }}
                />
              )}

              {/* Use expo-router's built-in Stack — avoids @react-navigation/stack
                  circular dependency issues on web */}
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: Platform.OS === 'web' ? 'transparent' : '#000000' },
                  gestureEnabled: Platform.OS !== 'web',
                  animation: Platform.OS !== 'web' ? 'slide_from_right' : 'none',
                }}
              >
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(events)" />
                <Stack.Screen
                  name="(tickets)/select-tickets"
                  options={{
                    headerShown: false,
                    gestureEnabled: Platform.OS !== 'web',
                    animation: Platform.OS !== 'web' ? 'slide_from_right' : 'none',
                  }}
                />
                <Stack.Screen
                  name="(tickets)/payment"
                  options={{
                    headerShown: false,
                    gestureEnabled: Platform.OS !== 'web',
                    animation: Platform.OS !== 'web' ? 'slide_from_right' : 'none',
                  }}
                />
                <Stack.Screen name="(tickets)" />
                <Stack.Screen name="(profile)" />
                <Stack.Screen name="(settings)" />
                <Stack.Screen name="(staff)" />
              </Stack>
            </ThemeProvider>
          </SavedProvider>
        </AppDataProvider>
      </OnboardingContext.Provider>
    </ErrorBoundary>
  );

  if (Platform.OS === 'web') {
    return <WebShell>{appContent}</WebShell>;
  }
  return appContent;
}

export default RootLayout;

const styles = StyleSheet.create({
  webOuter: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  webShell: {
    width: '100%',
    maxWidth: 800,
    flex: 1,
    backgroundColor: 'transparent',
  },
});
