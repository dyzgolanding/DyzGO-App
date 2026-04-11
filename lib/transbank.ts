// La lógica de Transbank/Webpay se ejecuta únicamente en el servidor
// (supabase/functions/webpay/index.ts). El cliente solo invoca la función
// Edge via supabase.functions.invoke('webpay', { ... }).
//
// Este archivo se mantiene vacío para evitar que el SDK de Transbank
// (dependencia de Node.js) se incluya en el bundle de React Native.
export {};
