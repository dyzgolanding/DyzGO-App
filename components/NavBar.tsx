import { BlurView } from './BlurSurface';
import { ChevronLeft } from 'lucide-react-native';
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from './animated/PressableScale';

interface NavBarProps {
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}

/**
 * Pill flotante idéntica a settings.tsx.
 * SIN spacer — el contenido scrollea detrás de la pill.
 *
 * Usa `useNavBarPaddingTop()` en cada pantalla para el paddingTop
 * del primer elemento scrollable, así el contenido empieza justo
 * debajo de la pill y luego sube detrás de ella al hacer scroll.
 *
 * Uso:
 *   const navTop = useNavBarPaddingTop();
 *   <NavBar title="LOGROS" onBack={() => router.back()} />
 *   <ScrollView contentContainerStyle={{ paddingTop: navTop, ... }}>
 */
export const NavBar = memo(function NavBar({ title, onBack, right }: NavBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.floatingHeader, { top: insets.top + 12 }]}>
      <View style={s.pillContainer}>
        <BlurView
          intensity={70}
          tint="dark"
          style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}
        />
        <View style={s.pillContent}>
          <View style={s.side}>
            {onBack && (
              <PressableScale
                onPress={onBack}
                scaleTo={0.82}
                haptic="light"
                style={s.backBtn}
              >
                <ChevronLeft color="white" size={24} />
              </PressableScale>
            )}
          </View>
          <View style={s.center}>
            {title ? <Text style={s.title}>{title}</Text> : null}
          </View>
          <View style={s.sideRight}>
            {right ?? <View style={{ width: 24 }} />}
          </View>
        </View>
      </View>
    </View>
  );
});

/**
 * Hook que retorna el paddingTop exacto para que el primer
 * elemento de un ScrollView empiece justo debajo de la pill,
 * con el mismo gap de 30 px que usa settings.tsx.
 *
 * pill.top(insets.top+12) + pill.height(60) + gap(30) = insets.top + 102
 */
export function useNavBarPaddingTop(): number {
  const insets = useSafeAreaInsets();
  return insets.top + 102;
}

const s = StyleSheet.create({
  floatingHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 999,
    alignItems: 'center',
  },
  pillContainer: {
    width: '90%',
    height: 60,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    position: 'relative',
    overflow: 'hidden',
  },
  pillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '100%',
    paddingHorizontal: 15,
  },
  side:      { width: 24, alignItems: 'flex-start' },
  backBtn:   { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-start' },
  sideRight: { minWidth: 24, alignItems: 'flex-end' },
  center:    { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  title:     { color: 'white', fontSize: 16, fontWeight: '900', fontStyle: 'italic', textAlign: 'center' },
});
