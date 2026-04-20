const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (moduleName === 'react-native-maps') {
      return context.resolveRequest(context, '@teovilla/react-native-web-maps', platform);
    }
    if (moduleName === 'react-native-pager-view') {
      return {
        type: 'sourceFile',
        filePath: path.resolve(__dirname, 'components/PagerViewMock.web.tsx'),
      };
    }
    if (moduleName === '@hcaptcha/react-native-hcaptcha') {
      return {
        type: 'sourceFile',
        filePath: path.resolve(__dirname, 'components/HCaptchaMock.web.tsx'),
      };
    }
    if (moduleName === 'react-native-webview') {
      return {
        type: 'sourceFile',
        filePath: path.resolve(__dirname, 'components/WebViewMock.web.tsx'),
      };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
