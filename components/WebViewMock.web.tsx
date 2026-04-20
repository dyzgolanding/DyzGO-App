import React, { forwardRef, useImperativeHandle } from 'react';
import { View, Text } from 'react-native';

const WebView = forwardRef((props: any, ref) => {
  useImperativeHandle(ref, () => ({
    goBack: () => {},
    goForward: () => {},
    reload: () => {},
    stopLoading: () => {},
    injectJavaScript: () => {},
  }));

  if (props.source && props.source.uri) {
    return (
      <iframe 
        src={props.source.uri} 
        style={{ width: '100%', height: '100%', border: 'none' }} 
        onLoad={props.onLoad}
      />
    );
  }

  return (
    <View style={[{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' }, props.style]}>
      <Text style={{ color: '#fff' }}>[WebView Placeholder - Web]</Text>
    </View>
  );
});

export default WebView;
