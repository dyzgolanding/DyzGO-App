const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Map of native-only modules → web stubs
const WEB_STUBS = {
  'react-native-maps':                   'stubs/react-native-maps.web.js',
  'react-native-webview':                'stubs/react-native-webview.web.js',
  'react-native-pager-view':             'stubs/react-native-pager-view.web.js',
  'expo-apple-authentication':           'stubs/expo-apple-authentication.web.js',
  '@hcaptcha/react-native-hcaptcha':     'stubs/react-native-hcaptcha.web.js',
  'react-native-safe-area-context':      'stubs/react-native-safe-area-context.web.js',
};

// Preserve Expo's own resolveRequest (if any) and chain onto it
const expoResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    // Catch exact package name AND any sub-path imports (e.g. 'react-native-safe-area-context/src/...')
    const stubKey = Object.keys(WEB_STUBS).find(
      key => moduleName === key || moduleName.startsWith(key + '/')
    );
    if (stubKey) {
      console.log(`[metro-stubs] Redirecting ${moduleName} → ${WEB_STUBS[stubKey]}`);
      return {
        type: 'sourceFile',
        filePath: path.resolve(__dirname, WEB_STUBS[stubKey]),
      };
    }
  }

  if (expoResolveRequest) {
    return expoResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
