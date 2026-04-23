/**
 * AppDataContext — preloads events & clubs as soon as the session is detected.
 * Any screen that calls useAppData() gets the data instantly on first navigation.
 */
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

interface AppDataState {
  events: any[];
  clubs: any[];
  isLoaded: boolean;
  preload: () => void;
  refresh: () => Promise<void>;
}

const AppDataContext = createContext<AppDataState>({
  events: [],
  clubs: [],
  isLoaded: false,
  preload: () => {},
  refresh: async () => {},
});

export const useAppData = () => useContext(AppDataContext);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const fetching = useRef(false);

  const fetchAll = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const [evResult, clResult] = await Promise.all([
        supabase
          .from('events')
          .select('*, clubs(name, location, latitude, longitude), ticket_tiers(price)')
          .eq('is_active', true)
          .in('status', ['active', 'info'])
          .order('date', { ascending: true })
          .limit(40),
        supabase.from('clubs').select('*').limit(30),
      ]);

      if (evResult.data) setEvents(evResult.data);
      if (clResult.data) setClubs(clResult.data);
    } catch (e) {
      console.error('[AppCache] fetch failed:', e);
    } finally {
      fetching.current = false;
      setIsLoaded(true);
    }
  }, []);

  const preload = useCallback(() => {
    if (!fetching.current && !isLoaded) fetchAll();
  }, [isLoaded, fetchAll]);

  const refresh = useCallback(async () => {
    fetching.current = false;
    await fetchAll();
  }, [fetchAll]);

  return (
    <AppDataContext.Provider value={{ events, clubs, isLoaded, preload, refresh }}>
      {children}
    </AppDataContext.Provider>
  );
}
