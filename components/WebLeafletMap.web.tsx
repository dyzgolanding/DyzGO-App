import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

export type WebLeafletMapHandle = {
  animateCamera: (opts: { center: { latitude: number; longitude: number }; zoom?: number }) => void;
};

type MarkerItem = {
  id: string | number;
  latitude: number;
  longitude: number;
  isSelected: boolean;
};

type Props = {
  initialRegion: { latitude: number; longitude: number };
  markers: MarkerItem[];
  style?: any;
};

function buildMapHtml(lat: number, lng: number): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body,#map{width:100%;height:100%;background:#030303}
  .leaflet-container{background:#030303}
  .leaflet-control-attribution{display:none}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map('map',{
  center:[${lat},${lng}],
  zoom:14,
  zoomControl:false,
  attributionControl:false
});

// Satellite base (ESRI, free, no API key)
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
  maxZoom:19
}).addTo(map);

// Dark labels on top (roads, names)
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',{
  maxZoom:19
}).addTo(map);

var markerObjs={};

function makeIcon(sel){
  var s=sel?22:12;
  var color=sel?'#FF31D8':'rgba(255,255,255,0.85)';
  var border=sel?'rgba(255,255,255,0.9)':'rgba(255,255,255,0.5)';
  var glow=sel?'0 0 0 4px rgba(255,49,216,0.3),0 0 16px #FF31D8':'none';
  return L.divIcon({
    html:'<div style="width:'+s+'px;height:'+s+'px;border-radius:50%;background:'+color+';border:2.5px solid '+border+';box-shadow:'+glow+';transform:translate(-50%,-50%)"></div>',
    iconSize:[0,0],iconAnchor:[0,0],className:''
  });
}

function setMarkers(items){
  Object.values(markerObjs).forEach(function(m){m.remove();});
  markerObjs={};
  (items||[]).forEach(function(item){
    markerObjs[item.id]=L.marker([item.latitude,item.longitude],{icon:makeIcon(item.isSelected)}).addTo(map);
  });
}

window.addEventListener('message',function(e){
  var msg=e.data;
  if(!msg||!msg.type)return;
  if(msg.type==='setMarkers')setMarkers(msg.markers);
  else if(msg.type==='flyTo')map.flyTo([msg.latitude,msg.longitude],msg.zoom||14,{duration:0.5});
  else if(msg.type==='invalidate')map.invalidateSize();
});

window.parent.postMessage({type:'ready'},'*');
</script>
</body>
</html>`;
}

const WebLeafletMap = forwardRef<WebLeafletMapHandle, Props>(
  ({ initialRegion, markers, style }, ref) => {
    const mapId = useRef('dyzgo-map-' + Math.random().toString(36).slice(2)).current;
    const iframeRef = useRef<any>(null);
    const readyRef = useRef(false);
    const markersRef = useRef(markers);
    markersRef.current = markers;

    useImperativeHandle(ref, () => ({
      animateCamera: ({ center, zoom = 14 }) => {
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'flyTo', latitude: center.latitude, longitude: center.longitude, zoom }, '*'
        );
      },
    }));

    useEffect(() => {
      const onMessage = (e: MessageEvent) => {
        if (e.data?.type !== 'ready') return;
        readyRef.current = true;
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'setMarkers', markers: markersRef.current }, '*'
        );
      };
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    }, []);

    useEffect(() => {
      // Wait for the View (nativeID) to be in the DOM, then inject an iframe into it
      const frame = requestAnimationFrame(() => {
        const container = document.getElementById(mapId);
        if (!container) return;

        container.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
        iframe.srcdoc = buildMapHtml(initialRegion.latitude, initialRegion.longitude);
        container.appendChild(iframe);
        iframeRef.current = iframe;
      });

      return () => {
        cancelAnimationFrame(frame);
        if (iframeRef.current) {
          iframeRef.current.remove();
          iframeRef.current = null;
        }
        readyRef.current = false;
      };
    }, []);

    useEffect(() => {
      markersRef.current = markers;
      if (!readyRef.current) return;
      iframeRef.current?.contentWindow?.postMessage({ type: 'setMarkers', markers }, '*');
    }, [markers]);

    return (
      <View
        // @ts-ignore — nativeID maps to id on web
        nativeID={mapId}
        style={[StyleSheet.absoluteFill, style]}
      />
    );
  }
);

export default WebLeafletMap;
