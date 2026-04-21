/**
 * Ruta de deep link para el retorno de Webpay Plus cuando el banco abre Safari externo.
 * Deep link: dyzgo://tbk-plus?token_ws=XXX
 * Web:       https://dyzgo.com/tbk-plus?token_ws=XXX
 *
 * Llama a commit con el token recibido y redirige a ticket-confirmation.
 */
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, View } from 'react-native'
import { supabase } from '../lib/supabase'
import { COLORS } from '../constants/colors'

export default function TbkPlusCallback() {
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sin sesión')

      const { data: refreshData } = await supabase.auth.refreshSession()
      const session = refreshData?.session
      if (!session) throw new Error('Sesión expirada')

      const { data, error } = await supabase.functions.invoke('webpay', {
        body: { action: 'commit', token_ws, user_id: user.id },
        headers: { Authorization: `Bearer ${session.access_token}` }
      })

      if (error) throw error

      if (data?.status === 'AUTHORIZED' && data?.response_code === 0) {
        setStatus('success')
        setTimeout(() => {
          if (Platform.OS === 'web') {
            let returnData = { eventId: '', eventName: 'Tu evento', quantity: '1' }
            try {
              const stored = sessionStorage.getItem('dyzgo_event_return')
              if (stored) returnData = JSON.parse(stored)
            } catch {}
            sessionStorage.removeItem('dyzgo_event_return')
            sessionStorage.setItem('dyzgo_payment_done', '1')
            // Reemplazar la entrada de tbk-plus por select-tickets en el historial
            // del browser, para que back desde ticket-confirmation lleve ahí.
            const selectUrl = returnData.eventId
              ? `/select-tickets?eventId=${encodeURIComponent(returnData.eventId)}`
              : '/'
            window.history.replaceState(null, '', selectUrl)
            // router.push agrega ticket-confirmation ENCIMA (pushState),
            // sin full reload ni pérdida del historial manipulado.
            router.push({
              pathname: '/ticket-confirmation' as any,
              params: {
                eventId: returnData.eventId,
                eventName: returnData.eventName,
                quantity: returnData.quantity,
              },
            })
          } else {
            router.dismissAll()
            router.replace('/(tabs)/profile')
            router.push({
              pathname: '/ticket-confirmation',
              params: { eventId: '', eventName: 'Tu evento', quantity: '1' }
            })
          }
        }, 1500)
      } else {
        setStatus('error')
        Alert.alert('Pago rechazado', 'La transacción no fue autorizada.', [
          { text: 'OK', onPress: () => router.back() }
        ])
      }
    } catch (e: any) {
      setStatus('error')
      Alert.alert('Error', 'No se pudo confirmar tu compra. Revisa tus tickets.', [
        { text: 'OK', onPress: () => router.back() }
      ])
    }
  }

  return (
    <View style={styles.container}>
      {status === 'loading' && (
        <>
          <ActivityIndicator size="large" color={COLORS.neonPink} />
          <Text style={styles.text}>Confirmando tu compra...</Text>
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
