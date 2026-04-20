import React, { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';

const ConfirmHcaptcha = forwardRef((props: any, ref) => {
  useImperativeHandle(ref, () => ({
    show: () => {
      if (props.onMessage) {
        // En web, por simplicidad para la estética y funcionamiento base pasamos un string bypaseado.
        // Ojo: Si Supabase rechaza este token por captcha estricto, habrá que deshabilitar hcaptcha temporalmente
        // en la página de supabase para la web o integrar `@hcaptcha/react-hcaptcha` en un componente web-only.
        props.onMessage({ nativeEvent: { data: 'bypass-web-token' } });
      }
    },
    hide: () => {}
  }));

  return <View />;
});

export default ConfirmHcaptcha;
