// Native stub — MapView is used directly on native, this component is never rendered
import { forwardRef } from 'react';

interface WebLeafletMapProps {
  style?: any;
  initialRegion?: { latitude: number; longitude: number };
  markers?: any[];
  [key: string]: any;
}

const WebLeafletMap = forwardRef<unknown, WebLeafletMapProps>(() => null);
export default WebLeafletMap;
