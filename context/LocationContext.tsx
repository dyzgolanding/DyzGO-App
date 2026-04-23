/**
 * LocationContext — wraps useUserLocation so that GPS is requested exactly once
 * and the result is shared across all screens via context.
 */
import React, { createContext, useContext } from 'react';
import { useUserLocation, LocationState } from '../lib/useUserLocation';

const LocationContext = createContext<LocationState>({
  location: null,
  errorMsg: null,
  loading: true,
  needsPermission: false,
  requestPermission: async () => {},
});

export const useLocation = () => useContext(LocationContext);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const locationState = useUserLocation();
  return (
    <LocationContext.Provider value={locationState}>
      {children}
    </LocationContext.Provider>
  );
}
