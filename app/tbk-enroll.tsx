/**
 * Ruta de deep link para el retorno de OneClick cuando el banco abre Safari externo.
 * Deep link: dyzgo://tbk-enroll?TBK_TOKEN=XXX
 * Web:       https://dyzgo.com/tbk-enroll?TBK_TOKEN=XXX
 *
 * Llama a oneclick_enroll_finish con el token y vuelve a la pantalla anterior.
 */
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native'
import { supabase } from '../lib/supabase'
import { COLORS } from '../constants/colors'

export default function TbkEnrollCallback() {
  const params = useLocalSearchParams<{ TBK_TOKEN?: string; tbk_token?: string }>()
  const token = params.TBK_TOKEN || params.tbk_token || ''
  const router = useRouter()
  const attempted = useRef(false)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true
    finish()
  }, [token])

  const finish = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sin sesión')

      const { data, error } = await supabase.functions.invoke('webpay', {
        body: { action: 'oneclick_enroll_finish', token, user_id: user.id }
      })

      if (error) throw error

      if (data?.status === 'SUCCESS') {
        setStatus('success')
        Alert.alert('¡Tarjeta guardada!', `Terminada en: ${data.card}`, [
          { text: 'OK', onPress: () => { router.dismissAll(); router.replace('/(tabs)/profile') } }
        ])
      } else {
        throw new Error(data?.error || 'El banco rechazó la inscripción.')
      }
    } catch (e: any) {
      setStatus('error')
      Alert.alert('Error', e.message || 'No se pudo guardar la tarjeta.', [
        { text: 'OK', onPress: () => { router.dismissAll(); router.replace('/(tabs)/profile') } }
      ])
    }
  }

  return (
    <View style={styles.container}>
      {status === 'loading' && (
        <>
          <ActivityIndicator size="large" color={COLORS.neonPink} />
          <Text style={styles.text}>Guardando tarjeta...</Text>
        </>
      )}
      {status === 'success' && (
        <Text style={styles.text}>¡Tarjeta guardada!</Text>
      )}
      {status === 'error' && (
        <Text style={[styles.text, { color: '#ef4444' }]}>Error al guardar tarjeta</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: COLORS.background,
    justifyContent: 'center', alignItems: 'center', gap: 16
  },
  text: {
    color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 24
  }
})
