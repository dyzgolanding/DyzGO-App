/**
 * PermissionModal — Modal de explicación de permisos al estilo DyzGO.
 *
 * Muestra una hoja inferior que explica POR QUÉ se necesita el permiso,
 * ANTES de que iOS muestre su diálogo de sistema. Esto reduce los rechazos
 * y cumple con las guías de Apple (guideline 5.1.1).
 *
 * Uso:
 *   <PermissionModal
 *     visible={showModal}
 *     icon={<MapPin color="#FF31D8" size={36} />}
 *     title="¿Dónde estás?"
 *     description="Necesitamos tu ubicación para mostrarte eventos cerca de ti."
 *     onAllow={() => { setShowModal(false); requestPermission(); }}
 *     onDeny={() => setShowModal(false)}
 *   />
 */
import { BlurView } from 'expo-blur';
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
      {/* Overlay oscuro que cierra el modal al tocarlo */}
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onDeny}
          activeOpacity={1}
        />

        {/* Hoja inferior */}
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}>
          <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />

          {/* Glow magenta sutil en la parte superior */}
          <LinearGradient
            colors={['rgba(255,49,216,0.18)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.glow}
            pointerEvents="none"
          />

          {/* Borde de vidrio */}
          <View style={styles.glassBorder} pointerEvents="none" />

          {/* Handle */}
          <View style={styles.handle} />

          {/* Ícono */}
          <View style={styles.iconWrapper}>
            <BlurView intensity={40} tint="dark" style={styles.iconBlur} />
            <View style={styles.iconGlowBorder} />
            {icon}
          </View>

          {/* Textos */}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          {/* Botón principal — Permitir */}
          <TouchableOpacity
            style={styles.allowBtn}
            onPress={onAllow}
            activeOpacity={0.85}
          >
            <Text style={styles.allowText}>{allowLabel}</Text>
          </TouchableOpacity>

          {/* Botón secundario — Ahora no */}
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
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    overflow: 'hidden',
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: 'rgba(10,10,10,0.3)',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 28,
  },
  iconWrapper: {
    alignSelf: 'center',
    width: 80,
    height: 80,
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
    borderColor: 'rgba(255,49,216,0.35)',
  },
  title: {
    color: '#FBFBFB',
    fontSize: 22,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    color: 'rgba(251,251,251,0.6)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  allowBtn: {
    height: 58,
    borderRadius: 100,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#FF31D8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  allowText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.3,
  },
  denyBtn: {
    height: 52,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  denyText: {
    color: 'rgba(251,251,251,0.45)',
    fontSize: 14,
    fontWeight: '700',
  },
});
