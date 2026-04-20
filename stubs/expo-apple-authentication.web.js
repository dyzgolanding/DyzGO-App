/**
 * Web stub for expo-apple-authentication.
 * Apple Sign-In is not available on web via this module.
 */
export const AppleAuthenticationScope = { FULL_NAME: 0, EMAIL: 1 };
export const AppleAuthenticationButtonType = { SIGN_IN: 0, CONTINUE: 2 };
export const AppleAuthenticationButtonStyle = { BLACK: 0, WHITE: 1, WHITE_OUTLINE: 2 };

export function AppleAuthenticationButton() {
  return null;
}

export async function signInAsync() {
  throw new Error('Apple Sign-In is not available on web.');
}

export async function getCredentialStateAsync() {
  return 'notFound';
}

export default { AppleAuthenticationScope, AppleAuthenticationButtonType, AppleAuthenticationButtonStyle, AppleAuthenticationButton, signInAsync, getCredentialStateAsync };
