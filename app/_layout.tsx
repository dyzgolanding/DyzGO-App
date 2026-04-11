import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { createStackNavigator, TransitionPresets } from '@react-navigation/stack';
import { Session } from '@supabase/supabase-js';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { withLayoutContext, useRouter, useSegments } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef, useState } from 'react';
import { Easing, StatusBar, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { AppDataProvider, useAppData } from '../context/AppDataContext';
import { SavedProvider } from '../context/SavedContext';
import { OnboardingContext } from '../context/OnboardingContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { PermissionModal } from '../components/PermissionModal';
import { registerForPushNotificationsAsync } from '../lib/push';
import { supabase } from '../lib/supabase';


const { Navigator, Screen: StackScreen } = createStackNavigator();
const Stack = withLayoutContext(Navigator);

// ─── Navigation transition — timing-based (predictable duration, no spring jank)
// Uses a custom interpolator: new screen fades in + slides 15% from right.
// Previous screen is untouched (no scale/dim) — less GPU work = no frame drops.
const NAV_EASING       = Easing.bezier(0.25, 0.46, 0.45, 0.94); // ease-out-quad
const NAV_BACK_EASING  = Easing.bezier(0.55, 0, 0.45, 1);       // ease-in-out-quad

const pushTransitionSpec = {
  open:  { animation: 'timing' as const, config: { duration: 120, easing: NAV_EASING      } },
  close: { animation: 'timing' as const, config: { duration: 100, easing: NAV_BACK_EASING } },
};

const modalTransitionSpec = {
  open:  { animation: 'timing' as const, config: { duration: 200, easing: NAV_EASING      } },
  close: { animation: 'timing' as const, config: { duration: 160, easing: NAV_BACK_EASING } },
};

// Lightweight interpolator: 100% horizontal slide only.
// Avoids scaling the departing screen (expensive, causes visual artifacts).
// 100% width is absolutely necessary for the swipe-to-back gesture to follow the finger perfectly 1:1.
const pushInterpolator = ({ current, layouts }: any) => ({
  cardStyle: {
    transform: [{
      translateX: current.progress.interpolate({
        inputRange:  [0, 1],
        outputRange: [layouts.screen.width, 0],
        extrapolate: 'clamp',
      }),
    }],
  },
});

// Modal: slides up from bottom, overlays with dark scrim.
const modalInterpolator = ({ current, layouts }: any) => ({
  cardStyle: {
    transform: [{
      translateY: current.progress.interpolate({
        inputRange:  [0, 1],
        outputRange: [layouts.screen.height, 0],
        extrapolate: 'clamp',
      }),
    }],
  },
  overlayStyle: {
    opacity: current.progress.interpolate({
      inputRange:  [0, 1],
      outputRange: [0, 0.5],
      extrapolate: 'clamp',
    }),
  },
});

function SessionPreloader({ session }: { session: Session | null }) {
  const { preload } = useAppData();
  useEffect(() => {
    if (session) preload();
  }, [session]);
  return null;
}

const PureBlackTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#000000', 
    card: '#000000',
    border: '#222222',
  },
};

function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [isBiometricAuthorized, setIsBiometricAuthorized] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  // Modal de permisos push — se muestra antes del diálogo de iOS
  const [showPushModal, setShowPushModal] = useState(false);
  const pendingPushUserId = useRef<string | null>(null);

  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync('#000000');

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
        setNeedsOnboarding(null);
      }
      setSession(session);

      if (event === 'SIGNED_IN' && session) {
        checkOnboardingStatus(session.user.id);
        checkAndRequestPush(session.user.id);
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      if (data?.url) {
        router.push(data.url);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  // Verifica el estado del permiso push ANTES de pedirlo al sistema.
  // Si ya fue decidido (granted/denied), no mostramos nuestro modal.
  // Si es 'undetermined', mostramos nuestra explicación primero.
  const checkAndRequestPush = async (userId: string) => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'undetermined') {
        pendingPushUserId.current = userId;
        setShowPushModal(true);
      } else {
        registerForPushNotificationsAsync(userId).catch(() => {});
      }
    } catch {
      // Si falla la verificación, intentamos igual de forma silenciosa
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
    try {
      const bioEnabled = await SecureStore.getItemAsync('biometrics_enabled');
      if (bioEnabled === 'true') {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Desbloquear DyzGO',
          disableDeviceFallback: false,
          cancelLabel: 'Cancelar'
        });
        if (result.success) {
          setIsBiometricAuthorized(true);
          setIsReady(true); 
        } 
      } else {
        setIsBiometricAuthorized(true);
        setIsReady(true);
      }
    } catch (e) {
      setIsBiometricAuthorized(true);
      setIsReady(true);
    }
  };

  useEffect(() => {
    if (!isReady || !isBiometricAuthorized || needsOnboarding === null) return;
    const inProtectedArea = segments[0] !== undefined && segments[0] !== '(auth)';
    const inOnboarding    = segments[1] === 'onboarding';

    if (!session && inProtectedArea) {
      router.replace('/login');
    } else if (session && !isRecoveryMode) {
      if (needsOnboarding && !inOnboarding) {
        router.replace('/onboarding');
      } else if (!needsOnboarding && segments[0] === '(auth)' && !inOnboarding) {
        router.replace('/(tabs)/home');
      }
    }
  }, [session, segments, isReady, isRecoveryMode, isBiometricAuthorized, needsOnboarding]);

  if (!isReady || !isBiometricAuthorized) {
    return <View style={{flex: 1, backgroundColor: '#030303'}} />;
  }

  return (
    <ErrorBoundary>
      <OnboardingContext.Provider value={{ setNeedsOnboarding }}>
      <AppDataProvider>
        <SessionPreloader session={session} />
        <SavedProvider>
          <ThemeProvider value={PureBlackTheme}>
            <StatusBar barStyle="light-content" backgroundColor="#000000" />

            {/* Modal de permisos push — aparece antes del diálogo del sistema iOS */}
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
            
            <Stack
                  screenOptions={{
                    headerShown: false,
                    cardStyle: { backgroundColor: '#000000' },
                    gestureEnabled: true,
                    gestureDirection: 'horizontal',
                    ...TransitionPresets.SlideFromRightIOS,
                  }}
                >
                <StackScreen name="(auth)" />
                <StackScreen name="(tabs)" />
                <StackScreen name="(events)" />

                {/* Bottom-sheet style modal — slides up from bottom */}
                <StackScreen
                  name="(tickets)/select-tickets"
                  options={{
                    presentation: 'transparentModal',
                    cardStyle: { backgroundColor: 'transparent' },
                    animationEnabled: true,
                    transitionSpec:        modalTransitionSpec,
                    cardStyleInterpolator:  modalInterpolator,
                    gestureEnabled: true,
                    gestureDirection: 'vertical',
                  }}
                />

                <StackScreen name="(tickets)" />
                <StackScreen name="(profile)" />
                <StackScreen name="(settings)" />
                <StackScreen name="(staff)" />
              </Stack>

          </ThemeProvider>
        </SavedProvider>
      </AppDataProvider>
      </OnboardingContext.Provider>
    </ErrorBoundary>
  );
}

export default RootLayout;