/**
 * Web stub for @hcaptcha/react-native-hcaptcha.
 * On web, use hCaptcha's native web script instead.
 */
import React from 'react';
import { View } from 'react-native';

export default function ConfirmHcaptcha({ onMessage, siteKey, baseUrl, languageCode, ...rest }) {
  return React.createElement(View, { style: { width: 0, height: 0 } });
}
