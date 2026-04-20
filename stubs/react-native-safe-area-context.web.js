/**
 * Web stub for react-native-safe-area-context v5.
 * The native implementation has a circular dependency on web that causes
 * "Cannot access 'loading' before initialization" (TDZ error) inside
 * SafeAreaProviderCompat → BottomTabView.
 *
 * On web there are no hardware safe areas, so insets are always 0.
 * By providing a non-null default context value, SafeAreaProviderCompat
 * detects an existing provider and skips creating a new one — no TDZ.
 */
import React from 'react';
import { View } from 'react-native';


const DEFAULT_INSETS  = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_FRAME   = { x: 0, y: 0, width: 0, height: 0 };

// Non-null default so SafeAreaProviderCompat never tries to mount a NativeProvider
export const SafeAreaInsetsContext = React.createContext(DEFAULT_INSETS);
export const SafeAreaFrameContext  = React.createContext(DEFAULT_FRAME);

export function SafeAreaProvider({ children, style, initialMetrics }) {
  const insets = (initialMetrics && initialMetrics.insets) || DEFAULT_INSETS;
  const frame  = (initialMetrics && initialMetrics.frame)  || DEFAULT_FRAME;
  return React.createElement(
    SafeAreaInsetsContext.Provider,
    { value: insets },
    React.createElement(
      SafeAreaFrameContext.Provider,
      { value: frame },
      style ? React.createElement(View, { style }, children) : children
    )
  );
}

export function SafeAreaView({ children, style, edges, ...rest }) {
  return React.createElement(View, { style, ...rest }, children);
}

export function useSafeAreaInsets() {
  return React.useContext(SafeAreaInsetsContext);
}

export function useSafeAreaFrame() {
  return React.useContext(SafeAreaFrameContext);
}

export function useSafeAreaProviderCompat() {
  return { insets: DEFAULT_INSETS, frame: DEFAULT_FRAME };
}

export function withSafeAreaInsets(WrappedComponent) {
  return function WithInsets(props) {
    const insets = useSafeAreaInsets();
    return React.createElement(WrappedComponent, { ...props, insets });
  };
}

export const SafeAreaConsumer = SafeAreaInsetsContext.Consumer;
export const NativeSafeAreaProvider = SafeAreaProvider;
export const NativeSafeAreaView = SafeAreaView;
export const initialWindowMetrics = null;
export const initialWindowSafeAreaInsets = null;
export const initialWindowSafeAreaFrame  = null;

export default { SafeAreaProvider, SafeAreaView, useSafeAreaInsets, useSafeAreaFrame };
