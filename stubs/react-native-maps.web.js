/**
 * Web stub for react-native-maps.
 * On web, map sections are replaced with a Google Maps iframe via the EventMap.web component.
 */
import React from 'react';
import { View } from 'react-native';

export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = null;

export const Marker = () => null;
export const Callout = () => null;
export const Polyline = () => null;
export const Polygon = () => null;
export const Circle = () => null;
export const Overlay = () => null;
export const Heatmap = () => null;

function MapView({ style, children }) {
  return React.createElement(View, { style });
}

export default MapView;
