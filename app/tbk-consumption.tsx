/**
 * Ruta de deep link para el retorno de Webpay cuando el banco abre Safari externo en compra de consumos.
 * Deep link: dyzgo://tbk-consumption?token_ws=XXX
 * Web:       https://dyzgo.com/tbk-consumption?token_ws=XXX
 */
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native'
import { supabase } from '../lib/supabase'
import { COLORS } from '../constants/colors'

export default function TbkConsumptionCallback() {
  const { token_ws } = useLocalSearchParams<{ token_ws: string }>()
  const router = useRouter()
  const attempted = useRef(false)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    if (!token_ws || attempted.current) return
    attempted.current = true
    commit()
  }, [token_ws])

  const commit = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sin sesión')

      const { data, error } = await supabase.functions.invoke('webpay', {
        body: { action: 'commit_consumption', token_ws },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (error) throw error

      const approved = data?.status === 'AUTHORIZED' && data?.response_code === 0
      if (approved) {
        setStatus('success')
        setTimeout(() => {
          router.dismissAll()
          router.replace('/(tabs)/profile')
          router.push('/(consumption)/consumption-confirmation' as any)
        }, 1500)
      } else {
        setStatus('error')
        Alert.alert('Pago rechazado', 'El banco no autorizó la transacción.', [
          { text: 'OK', onPress: () => router.back() }
        ])
      }
    } catch (e: any) {
      setStatus('error')
      Alert.alert('Error', 'No se pudo confirmar tu consumo.', [
        { text: 'OK', onPress: () => router.back() }
      ])
    }
  }

  return (
    <View style={styles.container}>
      {status === 'loading' && (
        <>
          <ActivityIndicator size="large" color={COLORS.neonPink} />
          <Text style={styles.text}>Confirmando tu consumo...</Text>
        </>
      )}
      {status === 'success' && (
        <Text style={styles.text}>¡Pago exitoso! Redirigiendo...</Text>
      )}
      {status === 'error' && (
        <Text style={[styles.text, { color: '#ef4444' }]}>Error en el pago</Text>
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
