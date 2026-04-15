import maplibregl from "maplibre-gl";
import { prettifyIndicator } from '../utils/helpers';

declare const pmtiles: any;

const maps: Record<string, maplibregl.Map> = {};
const popups: Record<string, maplibregl.Popup> = {};

export function refreshMapSource(
  map: maplibregl.Map,
  sourceName: string,
  _layerName: string,
  bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null,
  pmtilesUrl: string
) {
  const layers = map.getStyle().layers || [];
  layers.forEach((l: any) => {
    if (l.source === sourceName) {
      if (map.getLayer(l.id)) map.removeLayer(l.id);
    }
  });

  if (map.getSource(sourceName)) {
    map.removeSource(sourceName);
  }

  map.addSource(sourceName, {
    type: "vector",
    url: `pmtiles://${pmtilesUrl}`,
    promoteId: "id"
  });

  map.resize();

  if (bounds) {
    map.once("idle", () => {
      map.fitBounds(
        [[bounds.minLon, bounds.minLat], [bounds.maxLon, bounds.maxLat]],
        { padding: 10, duration: 2500 }
      );
    });
  }
}

export function addLayer(
  map: maplibregl.Map,
  sourceName: string,
  layerName: string,
  indicatorName: string,
  lookup: Record<string, number>
) {
  const layerId = `${sourceName}-${indicatorName}`;

  if (map.getLayer(layerId)) {
    map.removeLayer(layerId);
  }

  map.addLayer({
    id: layerId,
    type: "fill",
    source: sourceName,
    "source-layer": layerName,
    paint: {
      "fill-color": [
        "step",
        ["coalesce", ["feature-state", "value"], -1],
        "#888888",
        0, "#F44336",
        0.25, "#FFEB3B",
        0.75, "#4CAF50"
      ],
      "fill-opacity": 0.6,
      "fill-outline-color": "#555"
    }
  });

  for (const [id, val] of Object.entries(lookup)) {
    map.setFeatureState(
      { source: sourceName, sourceLayer: layerName, id },
      { value: val }
    );
  }
}

export function setupHoverHandlers(
  map: maplibregl.Map,
  popup: maplibregl.Popup,
  sourceName: string,
  layerName: string,
  indicatorName: string
) {
  const layerId = `${sourceName}-${indicatorName}`;

  (map as any).off('mousemove', layerId);
  (map as any).off('mouseleave', layerId);

  (map as any).on('mousemove', layerId, (e: any) => {
    if (!e.features || e.features.length === 0) return;

    const feature = e.features[0];
    const state = map.getFeatureState({
      source: sourceName,
      sourceLayer: layerName,
      id: feature.id
    });

    const val = state.value;
    if (val !== undefined) {
      map.getCanvas().style.cursor = 'pointer';
      const displayValue = (val * 100).toFixed(2) + '%';
      popup.setLngLat(e.lngLat)
        .setHTML(`<strong>${prettifyIndicator(indicatorName)}:</strong> ${displayValue}`)
        .addTo(map);
    } else {
      map.getCanvas().style.cursor = '';
      popup.remove();
    }
  });

  (map as any).on('mouseleave', layerId, () => {
    map.getCanvas().style.cursor = '';
    popup.remove();
  });
}

export function getMap(containerId: string): maplibregl.Map | undefined {
  return maps[containerId];
}

export function initMap(
  containerId: string,
  mapInstance: maplibregl.Map,
  popupInstance: maplibregl.Popup
) {
  maps[containerId] = mapInstance;
  popups[containerId] = popupInstance;
}

export function removeMap(containerId: string) {
  const map = maps[containerId];
  if (map) {
    map.remove();
    delete maps[containerId];
    delete popups[containerId];
  }
}
