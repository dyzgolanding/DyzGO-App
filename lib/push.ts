import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// 1. CONFIGURACIÓN: Cómo se comportan las notificaciones cuando la app está ABIERTA
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, // Mostrar alerta visual
    shouldPlaySound: true, // Reproducir sonido
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
    
    // Si no tiene permiso, lo pedimos
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Fallo al obtener permisos de push!');
      return;
    }

    // Obtenemos el token (Identificador único del celular)
    // Usamos el ID del proyecto para asegurar compatibilidad
    token = (await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    })).data;

    // GUARDAMOS EL TOKEN EN SUPABASE
    if (token && userId) {
        const { error } = await supabase
            .from('profiles')
            .update({ expo_push_token: token })
            .eq('id', userId);
            
        if (error) console.error("Error guardando token push:", error);
    }
  } else {
    console.log('Debes usar un dispositivo físico para Push Notifications');
  }

  return token;
}

// 3. FUNCIÓN PARA ENVIAR NOTIFICACIÓN (La usarás en tus botones)
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