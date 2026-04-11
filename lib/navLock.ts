/**
 * navLock — prevents duplicate screen pushes from rapid taps.
 * Single module-level flag; resets after the nav transition completes.
 */

let _locked = false;
let _timer: ReturnType<typeof setTimeout> | null = null;

const LOCK_MS = 200; // just past pushTransitionSpec open (180ms) + minimal buffer

export const navLock = {
  tryLock(): boolean {
    if (_locked) return false;
    _locked = true;
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(() => { _locked = false; }, LOCK_MS);
    return true;
  },
  release() {
    _locked = false;
    if (_timer) { clearTimeout(_timer); _timer = null; }
  },
};
