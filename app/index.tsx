import { LinearGradient } from 'expo-linear-gradient';
import { useNavRouter as useRouter } from '../hooks/useNavRouter';
import React, { useEffect, useState } from 'react';
import { Platform, 
  Dimensions,
  StatusBar,
  StyleSheet,
  View
 } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { supabase } from '../lib/supabase';

const COLORS = {
    neonPink: '#FF31D8',
    white: '#FFFFFF',
};

const { width, height } = Dimensions.get('window');
const DOT_SIZE = 18;
const MAX_SCALE = (Math.max(width, height) * 2.5) / DOT_SIZE;

const LOGO_TEXT = "DyzGO";
const LETTERS = LOGO_TEXT.split('');

const SPRING_CONFIG = { damping: 12, stiffness: 100, mass: 1 };
const START_DELAY = 300;
const STAGGER = 80;

// --- SUBCOMPONENTE: cada letra maneja sus propios hooks (fix de Rules of Hooks) ---
const AnimatedLetter = ({ letter, index }: { letter: string; index: number }) => {
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(30);
    const delay = START_DELAY + (index * STAGGER);

    useEffect(() => {
        opacity.value = withDelay(delay, withTiming(1, { duration: 500 }));
        translateY.value = withDelay(delay, withSpring(0, SPRING_CONFIG));
    }, []);

    const animStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    return <Animated.Text style={[styles.brandText, animStyle]}>{letter}</Animated.Text>;
};

export default function SplashScreen() {
    const router = useRouter();

    const [animationDone, setAnimationDone] = useState(false);
    const [dataLoaded, setDataLoaded]       = useState(false);
    const [preloadedData, setPreloadedData] = useState<any>(null);
    const [hasSession, setHasSession]       = useState(false);

    const dotScale       = useSharedValue(0);
    const expansionProgress = useSharedValue(0);

    useEffect(() => {
        const dotDelay = START_DELAY + (LETTERS.length * STAGGER) + 50;
        dotScale.value = withDelay(dotDelay, withSpring(1, { damping: 10, stiffness: 150 }));

        const expansionDelay = dotDelay + 800;
        setTimeout(() => {
            expansionProgress.value = withTiming(1, {
                duration: 800,
                easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            }, (finished) => {
                if (finished) runOnJS(setAnimationDone)(true);
            });
        }, expansionDelay);

        const loadData = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    setHasSession(false);
                    setDataLoaded(true);
                    return;
                }
                setHasSession(true);

                const today = new Date().toISOString().split('T')[0];

                const [profileRes, clubsRes, eventsRes] = await Promise.all([
                    supabase.from('profiles').select('full_name, avatar_url').eq('id', session.user.id).single(),
                    supabase.from('clubs').select('*').order('name', { ascending: true }).limit(10),
                    supabase.from('events')
                        .select('*, clubs(latitude, longitude, name, image), experiences(id, name, logo_url)')
                        .eq('is_active', true)
                        .in('status', ['active', 'info'])
                        .not('image_url', 'is', null)
                        .order('date', { ascending: true })
                        .limit(6)
                ]);

                let finalEvents = eventsRes.data || [];
                if (finalEvents.length > 0) {
                    const eventIds = finalEvents.map(e => e.id);
                    const { data: tickets } = await supabase
                        .from('tickets')
                        .select('event_id, user_id, profiles(avatar_url)')
                        .in('event_id', eventIds)
                        .limit(50);

                    finalEvents = finalEvents.map(event => {
                        const relevantTickets = tickets?.filter((t: any) => t.event_id === event.id) || [];
                        const uniqueAvatars = new Set();
                        const attendeesAvatars: string[] = [];
                        relevantTickets.forEach((t: any) => {
                            if (t.user_id === session.user.id) return;
                            const url = t.profiles?.avatar_url;
                            if (url && !uniqueAvatars.has(url)) {
                                uniqueAvatars.add(url);
                                attendeesAvatars.push(url);
                            }
                        });
                        return { ...event, attendees: attendeesAvatars };
                    });
                }

                setPreloadedData({
                    profile: profileRes.data,
                    clubs: clubsRes.data,
                    events: finalEvents
                });

            } catch (e) {
                console.error('[Splash] Error loading splash data:', e);
            } finally {
                setDataLoaded(true);
            }
        };

        loadData();
    }, []);

    useEffect(() => {
        if (animationDone && dataLoaded) {
            if (hasSession && preloadedData) {
                router.replace({
                    pathname: '/(tabs)/home',
                    params: { preloadedData: JSON.stringify(preloadedData) }
                });
            } else {
                router.replace('/(tabs)/home');
            }
        }
    }, [animationDone, dataLoaded, hasSession]);

    const dotExpandingStyle = useAnimatedStyle(() => {
        const expansionFactor = interpolate(expansionProgress.value, [0, 1], [1, MAX_SCALE]);
        return { transform: [{ scale: dotScale.value * expansionFactor }] };
    });

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
            {Platform.OS !== 'web' && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <LinearGradient colors={['rgba(255,49,216,0.18)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0.6 }} style={StyleSheet.absoluteFill} />
                    <LinearGradient colors={['transparent', 'rgba(255,49,216,0.12)']} start={{ x: 0.3, y: 0.4 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                </View>
            )}
            <View style={styles.centerStage}>
                <View style={styles.logoRow}>
                    {LETTERS.map((letter, index) => (
                        <AnimatedLetter key={index} letter={letter} index={index} />
                    ))}
                    <View style={styles.dotWrapper}>
                        <Animated.View style={[styles.dot, dotExpandingStyle]} />
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : '#030303' },
    centerStage: { flex: 1, justifyContent: 'center', alignItems: 'center', overflow: 'visible' },
    logoRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginLeft: 10, overflow: 'visible', paddingHorizontal: 20 },
    brandText: { color: COLORS.white, fontSize: 68, fontWeight: '900', fontStyle: 'italic', lineHeight: 90, height: 100, textAlignVertical: 'bottom', paddingHorizontal: 4, marginHorizontal: -3, includeFontPadding: false, textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10, overflow: 'visible', zIndex: 10 },
    dotWrapper: { width: 20, height: 20, marginLeft: 2, marginBottom: 16, justifyContent: 'center', alignItems: 'center', zIndex: 100, overflow: 'visible' },
    dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: 900, backgroundColor: COLORS.neonPink, shadowColor: COLORS.neonPink, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 15 }
});
