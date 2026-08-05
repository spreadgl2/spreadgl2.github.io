import { setWorkerUrl } from 'maplibre-gl';
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type React from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { Map as MapLibreMap } from 'react-map-gl/maplibre';

setWorkerUrl(mapLibreWorkerUrl);

interface MapLibreViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

interface MapLibreBasemapProps {
  mapRef: React.RefObject<MapRef | null>;
  mapStyle: string;
  canvasContextAttributes: WebGLContextAttributes;
  onLoad: () => void;
  viewState?: MapLibreViewState;
  style?: React.CSSProperties;
}

export function MapLibreBasemap({
  mapRef,
  mapStyle,
  canvasContextAttributes,
  onLoad,
  viewState,
  style,
}: MapLibreBasemapProps) {
  const cameraProps = viewState
    ? {
        longitude: viewState.longitude,
        latitude: viewState.latitude,
        zoom: viewState.zoom,
        pitch: viewState.pitch,
        bearing: viewState.bearing,
      }
    : {};
  const styleProps = style ? { style } : {};

  return (
    <MapLibreMap
      ref={mapRef as React.Ref<MapRef>}
      mapStyle={mapStyle}
      canvasContextAttributes={canvasContextAttributes}
      interactive={false}
      onLoad={onLoad}
      {...styleProps}
      {...cameraProps}
    />
  );
}
