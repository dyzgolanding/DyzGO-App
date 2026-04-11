// Prevents _layout.tsx from auto-routing while login.tsx is handling a complex auth flow (e.g. 2FA)
let _locked = false;

export const authFlowLock = {
  lock: () => { _locked = true; },
  unlock: () => { _locked = false; },
  isLocked: () => _locked,
};
