import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Dimensions, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

interface QueueRateModalProps {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  onSuccess?: () => void;
}

export default function QueueRateModal({ visible, onClose, eventId, onSuccess }: QueueRateModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  // Niveles de "Vibe" de la fila
  const VIBE_OPTIONS = [
    { 
      level: 1, 
      label: 'Pasé volando', 
      emoji: '👻', 
      desc: 'Vacío / Sin espera',
      color: ['#10b981', '#059669'] 
    },
    { 
      level: 2, 
      label: 'Normal', 
      emoji: '😎', 
      desc: 'Espera razonable',
      color: ['#f59e0b', '#d97706'] 
    },
    { 
      level: 3, 
      label: 'Colapsado', 
      emoji: '💀', 
      desc: 'Llenísimo / Lento',
      color: ['#ef4444', '#b91c1c'] 
    }
  ];

  const handleRate = async (level: number) => {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('queue_reports').insert({
        event_id: eventId,
        user_id: user?.id,
        vibe_level: level
      });

      if (error) throw error;

      setSent(true);
      if (onSuccess) onSuccess();

      // Cierre automático
      setTimeout(() => {
        setSent(false);
        setSubmitting(false);
        onClose();
      }, 1500);

    } catch (error) {
      console.error("Error enviando reporte:", error);
      setSubmitting(false);
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <LinearGradient colors={['#1e1e24', '#121214']} style={styles.card}>
            
            {!sent ? (
              <>
                <View style={styles.header}>
                  <View>
                    <Text style={styles.title}>¿Cómo estaba la fila?</Text>
                    <Text style={styles.subtitle}>Ayuda a otros a llegar en el mejor momento.</Text>
                  </View>
                  <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <X size={20} color="#666" />
                  </TouchableOpacity>
                </View>

                <View style={styles.optionsGrid}>
                  {VIBE_OPTIONS.map((opt) => (
                    <TouchableOpacity 
                      key={opt.level} 
                      style={styles.optionCard}
                      onPress={() => handleRate(opt.level)}
                      disabled={submitting}
                    >
                      <LinearGradient 
                        colors={opt.color} 
                        style={styles.emojiContainer}
                        start={{ x: 0, y: 0 }} 
                        end={{ x: 1, y: 1 }}
                      >
                        <Text style={styles.emoji}>{opt.emoji}</Text>
                      </LinearGradient>
                      <Text style={styles.optionLabel}>{opt.label}</Text>
                      <Text style={styles.optionDesc}>{opt.desc}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {submitting && (
                  <View style={styles.loadingOverlay}>
                    <ActivityIndicator color="white" />
                  </View>
                )}
              </>
            ) : (
              <View style={styles.successView}>
                <CheckCircle size={48} color="#10b981" />
                <Text style={styles.successTitle}>¡Gracias crack! 🔥</Text>
                <Text style={styles.successSub}>Tu reporte ayuda a la comunidad.</Text>
              </View>
            )}

          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  container: {
    width: '100%',
    maxWidth: 400,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  optionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10
  },
  optionCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  emojiContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  emoji: {
    fontSize: 24
  },
  optionLabel: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 2,
    textAlign: 'center'
  },
  optionDesc: {
    color: '#666',
    fontSize: 9,
    textAlign: 'center'
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 24
  },
  successView: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: 'white',
    marginTop: 10
  },
  successSub: {
    color: '#888',
    fontSize: 13
  }
});