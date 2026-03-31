import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'DyzGO',
  slug: 'dizgo-app',
  version: '1.0.0',
  scheme: 'dizgo',
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
    buildNumber: '1',
    associatedDomains: ['applinks:dizgo.com'],
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'DyzGO necesita tu ubicación para mostrarte los mejores eventos cerca de ti.',
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
      ITSAppUsesNonExemptEncryption: false,
      UIRequiresFullScreen: true,
    },
    config: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
    },
    package: 'com.dyzgo.app',
    versionCode: 1,
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'CAMERA',
      'READ_EXTERNAL_STORAGE',
      'USE_BIOMETRIC',
      'USE_FINGERPRINT',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'dizgo' }],
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
    favicon: './assets/favicon.png',
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
      projectId: '099cdb88-07f7-48be-a838-0d549afcd54c',
    },
  },
  owner: 'clemente65',
});
