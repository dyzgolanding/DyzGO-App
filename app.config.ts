import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'DyzGO',
  slug: 'dyzgot',
  version: '1.0.1',
  updates: { enabled: false },
  scheme: 'dyzgo',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'dark',
  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#000000',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.dyzgo.app',
    buildNumber: '62',
    associatedDomains: ['applinks:dyzgo.com'],
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'DyzGO necesita tu ubicación para mostrarte los mejores eventos cerca de ti.',
      NSIdentityDocumentUsageDescription:
        'DyzGO solicita tu RUT para verificar tu identidad, facilitar la compra de entradas y cumplir las regulaciones chilenas de venta de tickets.',
      NSPhotoLibraryUsageDescription:
        'DyzGO necesita acceso a tu galería para que puedas personalizar tu foto de perfil.',
      NSPhotoLibraryAddUsageDescription:
        'DyzGO necesita permiso para guardar fotos en tu galería.',
      NSCameraUsageDescription:
        'DyzGO necesita acceso a tu cámara para que puedas tomar una foto de perfil.',
      NSMicrophoneUsageDescription:
        'DyzGO necesita acceso al micrófono cuando uses la cámara para grabar contenido.',
      NSFaceIDUsageDescription:
        'DyzGO usa Face ID para proteger el acceso a tu cuenta de forma segura.',
      NSContactsUsageDescription:
        'DyzGO puede acceder a tus contactos para ayudarte a encontrar amigos en la plataforma.',
      ITSAppUsesNonExemptEncryption: false,
      UIRequiresFullScreen: true,
      LSApplicationQueriesSchemes: ['uber', 'comgooglemaps', 'googlemaps'],
    },
    config: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/icon.png',
      backgroundColor: '#000000',
    },
    package: 'com.dyzgo.app',
    versionCode: 5,
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'CAMERA',
      'READ_EXTERNAL_STORAGE',
      'USE_BIOMETRIC',
      'USE_FINGERPRINT',
    ],
    blockedPermissions: ['android.permission.ACTIVITY_RECOGNITION'],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'dyzgo' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
      },
    },
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-apple-authentication',
    'expo-secure-store',
    'expo-web-browser',
    ['expo-image-picker', { photosPermission: 'DyzGO necesita acceso a tus fotos para personalizar tu perfil.' }],
    ['expo-notifications', { icon: './assets/images/icon.png', color: '#FF00FF', sounds: [] }],
    ['expo-local-authentication', { faceIDPermission: 'DyzGO usa Face ID para proteger el acceso a tu cuenta.' }],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: '0a423597-b7cd-4ef4-9219-9a27ec056001',
    },
  },
  owner: 'topincito',
});
