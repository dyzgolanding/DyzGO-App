import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

interface WebStaticMapProps {
  latitude: number;
  longitude: number;
  accentColor?: string;
  style?: any;
}

function buildMapHtml(lat: number, lng: number, accent: string) {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body, #map { width:100%; height:100%; background:#000; }
  .leaflet-control-container { display:none !important; }
</style>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', {
    center: [${lat}, ${lng}],
    zoom: 16,
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    keyboard: false,
    attributionControl: false
  });

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19
  }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(map);

  var icon = L.divIcon({
    className: '',
    html: '<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.6))"><svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 24 24\\" width=\\"36\\" height=\\"36\\" fill=\\"${accent}\\" stroke=\\"#fff\\" stroke-width=\\"1.5\\"><path d=\\"M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z\\"/></svg></div>',
    iconSize: [36, 36],
    iconAnchor: [18, 36]
  });

  L.marker([${lat}, ${lng}], { icon: icon }).addTo(map);
</script>
</body>
</html>`;
}

export default function WebStaticMap({ latitude, longitude, accentColor = '#FF31D8', style }: WebStaticMapProps) {
  const mapId = useRef('wsm-' + Math.random().toString(36).slice(2)).current;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = document.getElementById(mapId);
      if (!container || iframeRef.current) return;
      container.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;overflow:hidden;';
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;border-radius:inherit;';
      iframe.srcdoc = buildMapHtml(latitude, longitude, accentColor);
      container.appendChild(iframe);
      iframeRef.current = iframe;
    });
    return () => cancelAnimationFrame(frame);
  }, [latitude, longitude, accentColor]);

  return (
    <View style={[StyleSheet.absoluteFill, style]} nativeID={mapId} />
  );
}
