/**
 * PermissionModal — Modal de explicación de permisos al estilo DyzGO.
 *
 * Muestra una hoja inferior que explica POR QUÉ se necesita el permiso,
 * ANTES de que iOS muestre su diálogo de sistema. Esto reduce los rechazos
 * y cumple con las guías de Apple (guideline 5.1.1).
 */
import { BlurView } from './BlurSurface';
import { LinearGradient } from 'expo-linear-gradient';
import React, { ReactNode } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PermissionModalProps {
  visible: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  allowLabel?: string;
  denyLabel?: string;
  onAllow: () => void;
  onDeny: () => void;
}

export function PermissionModal({
  visible,
  icon,
  title,
  description,
  allowLabel = 'Permitir',
  denyLabel = 'Ahora no',
  onAllow,
  onDeny,
}: PermissionModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <View style={styles.modalBackdropDark}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onDeny}
          activeOpacity={1}
        />

        <View style={[styles.modalSheetPremium, { paddingBottom: Math.max(insets.bottom + 24, 50) }]}>
          <View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }]}>
            <BlurView intensity={70} tint="dark" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
          </View>

          <View style={styles.modalHandleThin} />

          <View style={styles.iconWrapper}>
            <BlurView intensity={30} tint="dark" style={styles.iconBlur} />
            <View style={styles.iconGlowBorder} />
            {icon}
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          <TouchableOpacity style={styles.mainBtn} onPress={onAllow} activeOpacity={0.85}>
            <LinearGradient colors={['#FF31D8', '#FF31D8']} style={styles.mainBtnGradient}>
              <Text style={styles.mainBtnText}>{allowLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.denyBtn}
            onPress={onDeny}
            activeOpacity={0.8}
          >
            <Text style={styles.denyText}>{denyLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdropDark: { 
    flex: 1, 
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)', 
  },
  modalSheetPremium: { 
    backgroundColor: 'transparent', 
    borderTopLeftRadius: 32, 
    borderTopRightRadius: 32, 
    paddingHorizontal: 24, 
    paddingTop: 16, 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.07)' 
  },
  modalHandleThin: { 
    width: 36, 
    height: 4, 
    backgroundColor: 'rgba(255,255,255,0.15)', 
    borderRadius: 2, 
    alignSelf: 'center', 
    marginBottom: 24 
  },
  iconWrapper: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconBlur: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  iconGlowBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,49,216,0.3)',
  },
  title: { 
    color: '#FBFBFB', 
    fontSize: 22, 
    fontWeight: '900', 
    fontStyle: 'italic', 
    letterSpacing: -0.5, 
    textAlign: 'center',
    marginBottom: 10 
  },
  description: {
    color: 'rgba(251,251,251,0.55)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  mainBtn: { 
    overflow: 'hidden', 
    borderRadius: 20, 
    height: 52 
  },
  mainBtnGradient: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  mainBtnText: { 
    color: 'white', 
    fontSize: 15, 
    fontWeight: '900', 
    letterSpacing: 0.5 
  },
  denyBtn: {
    height: 52,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  denyText: {
    color: 'rgba(251,251,251,0.45)',
    fontSize: 14,
    fontWeight: '700',
  },
});
