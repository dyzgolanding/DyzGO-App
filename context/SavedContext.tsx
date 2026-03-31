import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { EventRow, ClubRow, SavedBrand } from '../types/db';

// Item guardado: evento o club con discriminador de tipo
export type SavedItem =
  | (EventRow & { type: 'event' })
  | (ClubRow  & { type: 'club' })

interface SavedContextType {
  savedItems: SavedItem[];
  activeAlertIds: string[];
  globalNotifications: boolean;
  setGlobalNotifications: (val: boolean) => Promise<void>;
  toggleSave: (id: string, itemData?: Partial<EventRow> | Partial<ClubRow>, forcedType?: 'club' | 'event') => Promise<void>;
  toggleAlert: (id: string, item: { name?: string; title?: string }) => Promise<void>;
  loading: boolean;
  refreshSaved: () => Promise<void>;
  // Brands
  savedBrands: SavedBrand[];
  toggleSaveBrand: (experienceId: string, brandData: Pick<SavedBrand, 'name' | 'logo_url' | 'banner_url' | 'primary_color'>) => Promise<void>;
  toggleBrandPush: (experienceId: string) => Promise<void>;
  isBrandSaved: (experienceId: string) => boolean;
}

const SavedContext = createContext<SavedContextType | undefined>(undefined);

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [activeAlertIds, setActiveAlertIds] = useState<string[]>([]);
  const [globalNotifications, _setGlobalNotifications] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savedBrands, setSavedBrands] = useState<SavedBrand[]>([]);

  useEffect(() => {
    loadInitialState();
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && session)) fetchSavedItems();
      if (event === 'SIGNED_OUT') {
        setSavedItems([]);
        setActiveAlertIds([]);
        setSavedBrands([]);
      }
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  async function loadInitialState() {
    try {
      const savedSwitch = await AsyncStorage.getItem('@global_notifs');
      if (savedSwitch !== null) {
        _setGlobalNotifications(JSON.parse(savedSwitch));
      }
      await fetchSavedItems();
    } catch (e) {
      console.error(e);
    }
  }

  const setGlobalNotifications = async (val: boolean) => {
    _setGlobalNotifications(val);
    await AsyncStorage.setItem('@global_notifs', JSON.stringify(val));
  };

  async function fetchSavedItems() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const userId = session.user.id;

      const [clubsRes, eventsRes, alertsRes, brandsRes] = await Promise.all([
        supabase.from('saved_clubs').select('club_id, clubs(*)').eq('user_id', userId),
        supabase.from('saved_events').select('event_id, events(*)').eq('user_id', userId),
        supabase.from('notifications').select('related_id').eq('user_id', userId).eq('type', 'reminder'),
        supabase.from('saved_brands').select('experience_id, push_enabled').eq('user_id', userId),
      ]);

      const clubs = (clubsRes.data ?? [])
        .filter((i): i is typeof i & { clubs: ClubRow } => i.clubs !== null)
        .map((i): SavedItem => ({ ...(i.clubs as ClubRow), type: 'club', id: i.club_id }));

      const events = (eventsRes.data ?? [])
        .filter((i): i is typeof i & { events: EventRow } => i.events !== null)
        .map((i): SavedItem => ({ ...(i.events as EventRow), type: 'event', id: i.event_id }));

      setSavedItems([...clubs, ...events]);

      const rawAlerts = (alertsRes.data ?? [])
        .map(a => a.related_id?.toString())
        .filter((id): id is string => Boolean(id));
      setActiveAlertIds([...new Set(rawAlerts)]);

      // Fetch experience data separately para evitar problemas de RLS en el join
      const savedBrandRows = brandsRes.data ?? [];
      let brands: SavedBrand[] = [];

      if (savedBrandRows.length > 0) {
        const expIds = savedBrandRows.map(b => b.experience_id);
        const { data: exps } = await supabase
          .from('experiences')
          .select('id, name, logo_url, banner_url, primary_color')
          .in('id', expIds);

        brands = savedBrandRows.map(b => {
          const exp = (exps ?? []).find(e => e.id === b.experience_id);
          return {
            experience_id: b.experience_id,
            push_enabled: b.push_enabled,
            name: exp?.name ?? '',
            logo_url: exp?.logo_url ?? null,
            banner_url: exp?.banner_url ?? null,
            primary_color: exp?.primary_color ?? null,
          };
        });
      }

      setSavedBrands(brands);

    } catch (error) {
      console.error('[SavedContext] fetchSavedItems failed:', error);
    } finally {
      setLoading(false);
    }
  }

  const toggleSave = async (
    id: string,
    itemData?: Partial<EventRow> | Partial<ClubRow>,
    forcedType?: 'club' | 'event'
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const stringId = id.toString();
    const type = forcedType ?? ((itemData as Partial<EventRow>)?.date ? 'event' : 'club');
    const table = type === 'club' ? 'saved_clubs' : 'saved_events';
    const idColumn = type === 'club' ? 'club_id' : 'event_id';

    const isAlreadySaved = savedItems.some(item => item.id.toString() === stringId);

    if (isAlreadySaved) {
      setSavedItems(prev => prev.filter(item => item.id.toString() !== stringId));
      setActiveAlertIds(prev => prev.filter(aid => aid !== stringId));
      await Promise.all([
        supabase.from(table).delete().eq(idColumn, id).eq('user_id', user.id),
        supabase.from('notifications').delete().eq('related_id', stringId).eq('user_id', user.id).eq('type', 'reminder'),
      ]);
    } else {
      if (itemData) {
        setSavedItems(prev => [...prev, { ...itemData, id, type } as SavedItem]);
      }
      await supabase.from(table).upsert({ [idColumn]: id, user_id: user.id });
    }
  };

  const toggleAlert = async (id: string, item: { name?: string; title?: string }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const stringId = id.toString();
    const isActive = activeAlertIds.includes(stringId);

    if (isActive) {
      setActiveAlertIds(prev => prev.filter(aid => aid !== stringId));
      await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id)
        .eq('related_id', stringId)
        .eq('type', 'reminder');
    } else {
      setActiveAlertIds(prev => [...new Set([...prev, stringId])]);
      await supabase.from('notifications').insert({
        user_id: user.id,
        title: 'Recordatorio',
        message: `Agendado: ${item.name ?? item.title ?? ''}`,
        type: 'reminder',
        related_id: stringId,
        is_read: false,
      });
    }
  };

  const toggleSaveBrand = async (
    experienceId: string,
    brandData: Pick<SavedBrand, 'name' | 'logo_url' | 'banner_url' | 'primary_color'>
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const isSaved = savedBrands.some(b => b.experience_id === experienceId);

    if (isSaved) {
      setSavedBrands(prev => prev.filter(b => b.experience_id !== experienceId));
      await supabase.from('saved_brands').delete()
        .eq('experience_id', experienceId)
        .eq('user_id', user.id);
    } else {
      setSavedBrands(prev => [...prev, { experience_id: experienceId, push_enabled: true, ...brandData }]);
      const { error } = await supabase.from('saved_brands').upsert({
        experience_id: experienceId,
        user_id: user.id,
        push_enabled: true,
      });
      if (error) {
        console.error('[SavedContext] toggleSaveBrand upsert failed:', error);
        setSavedBrands(prev => prev.filter(b => b.experience_id !== experienceId));
      }
    }
  };

  const toggleBrandPush = async (experienceId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const brand = savedBrands.find(b => b.experience_id === experienceId);
    if (!brand) return;

    const newPush = !brand.push_enabled;
    setSavedBrands(prev =>
      prev.map(b => b.experience_id === experienceId ? { ...b, push_enabled: newPush } : b)
    );
    await supabase.from('saved_brands')
      .update({ push_enabled: newPush })
      .eq('experience_id', experienceId)
      .eq('user_id', user.id);
  };

  const isBrandSaved = (experienceId: string) =>
    savedBrands.some(b => b.experience_id === experienceId);

  return (
    <SavedContext.Provider value={{
      savedItems, activeAlertIds, globalNotifications, setGlobalNotifications,
      toggleSave, toggleAlert, loading, refreshSaved: fetchSavedItems,
      savedBrands, toggleSaveBrand, toggleBrandPush, isBrandSaved,
    }}>
      {children}
    </SavedContext.Provider>
  );
}

export const useSaved = () => {
  const context = useContext(SavedContext);
  if (!context) throw new Error('useSaved must be used within SavedProvider');
  return context;
};
