import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import { supabase } from './supabase';

// 1. CONFIGURACIÓN: Cómo se comportan las notificaciones cuando la app está ABIERTA
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// 2. FUNCIÓN PARA OBTENER EL TOKEN Y GUARDARLO EN SUPABASE
export async function registerForPushNotificationsAsync(userId: string) {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      // Mostrar contexto antes del diálogo nativo del sistema
      await new Promise<void>(resolve =>
        Alert.alert(
          '¡No te pierdas nada!',
          'Activa las notificaciones para recibir avisos cuando tus productoras y clubes favoritos publiquen nuevos eventos.',
          [{ text: 'Continuar', onPress: resolve }]
        )
      );
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return;
    }

    token = (await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    })).data;

    if (token && userId) {
      await supabase
        .from('profiles')
        .update({ expo_push_token: token })
        .eq('id', userId);
    }
  }

  return token;
}

// 3. FUNCIÓN PARA ENVIAR NOTIFICACIÓN
export async function sendPushNotification(expoPushToken: string, title: string, body: string, data = {}) {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
  };

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
}
