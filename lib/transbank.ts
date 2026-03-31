// lib/transbank.ts
import { Environment, IntegrationApiKeys, IntegrationCommerceCodes, Options, WebpayPlus } from 'transbank-sdk';

// Usamos las credenciales de INTEGRACIÓN (Pruebas) por defecto.
// Cuando pases a producción, aquí pondremos tus llaves reales.
const tx = new WebpayPlus.Transaction(
  new Options(
    IntegrationCommerceCodes.WEBPAY_PLUS, 
    IntegrationApiKeys.WEBPAY, 
    Environment.Integration
  )
);

export default tx;