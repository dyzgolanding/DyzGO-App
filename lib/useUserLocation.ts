import * as Location from 'expo-location';
import { useEffect, useState, useCallback } from 'react';

export type LocationState = {
  location: Location.LocationObject | null;
  errorMsg: string | null;
  loading: boolean;
  /** true cuando el permiso aún no ha sido decidido — muestra tu propia pantalla de explicación */
  needsPermission: boolean;
  /** Llama esta función cuando el usuario acepte en tu modal explicativo */
  requestPermission: () => Promise<void>;
};

export const useUserLocation = (): LocationState => {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPermission, setNeedsPermission] = useState(false);

  const fetchLocation = async () => {
    try {
      const current = await Location.getCurrentPositionAsync({});
      setLocation(current);
    } catch {
      setErrorMsg('Error al obtener la ubicación');
    } finally {
      setLoading(false);
    }
  };

  // Función que el componente llama cuando el usuario acepta en el modal
  const requestPermission = useCallback(async () => {
    setNeedsPermission(false);
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        await fetchLocation();
      } else {
        setErrorMsg('Permiso de ubicación denegado');
        setLoading(false);
      }
    } catch {
      setErrorMsg('Error al obtener la ubicación');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();

        if (status === 'granted') {
          // Ya tenemos permiso — obtenemos ubicación directamente
          await fetchLocation();
        } else if (status === 'undetermined') {
          // Aún no decidido — avisamos al componente para que muestre su modal
          setNeedsPermission(true);
          setLoading(false);
        } else {
          // Denegado — no pedimos de nuevo
          setErrorMsg('Permiso de ubicación denegado');
          setLoading(false);
        }
      } catch {
        setErrorMsg('Error al verificar permisos de ubicación');
        setLoading(false);
      }
    })();
  }, []);

  return { location, errorMsg, loading, needsPermission, requestPermission };
};
