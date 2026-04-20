/**
 * Web stub for react-native-webview.
 * On web, payment flows that use WebView redirect the browser to the URL directly.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function WebView({ source, style, onNavigationStateChange, onMessage, injectedJavaScript, ...rest }) {
  const uri = source?.uri;

  useEffect(() => {
    if (uri && typeof window !== 'undefined') {
      // Notify parent that navigation started (mirrors WebView behavior)
      onNavigationStateChange?.({ url: uri, loading: true });
    }
  }, [uri]);

  if (!uri) {
    return React.createElement(View, { style });
  }

  return React.createElement('iframe', {
    src: uri,
    style: StyleSheet.flatten([{ width: '100%', height: '100%', border: 'none' }, style]),
    onLoad: () => onNavigationStateChange?.({ url: uri, loading: false }),
    ...rest,
  });
}

export default WebView;
