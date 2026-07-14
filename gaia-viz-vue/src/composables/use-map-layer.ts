import { addLayers, addSources } from "@/utils/geo/map-utils";
import type { LayerSpecification, Map, SourceSpecification } from "maplibre-gl";
import { toValue, watch, type MaybeRefOrGetter } from "vue";

export const useMapLayers = (
  layersSpec: MaybeRefOrGetter<LayerSpecification[]>,
  sourcesSpec: MaybeRefOrGetter<{ id: string; spec: SourceSpecification }[]>,
  map: MaybeRefOrGetter<Map | null>,
) => {
  const addSourcesAndLayers = () => {
    const mapInstance = toValue(map);
    if (!mapInstance || !mapInstance.isStyleLoaded()) return;
    addSources(mapInstance, toValue(sourcesSpec));
    addLayers(mapInstance, toValue(layersSpec));
  };

  watch(
    () => [toValue(map), toValue(sourcesSpec), toValue(layersSpec)],
    (_, __, onCleanup) => {
      const mapInstance = toValue(map);
      if (!mapInstance) return;

      if (!mapInstance.isStyleLoaded()) {
        mapInstance.once("styledata", addSourcesAndLayers);
      } else {
        addSourcesAndLayers();
      }

      onCleanup(() => {
        mapInstance.off("styledata", addSourcesAndLayers);
      });
    },
    { immediate: true },
  );
};

//  Manages a single dynamic map layer.
export const useDynamicMapLayer = (
  map: MaybeRefOrGetter<Map | null>,
  sourceId: MaybeRefOrGetter<string>,
  layerId: MaybeRefOrGetter<string>,
  sourceSpec: MaybeRefOrGetter<SourceSpecification | null>,
  layerSpec: MaybeRefOrGetter<LayerSpecification | null>,
  dependencies: MaybeRefOrGetter<unknown[]> = [],
  enabled: MaybeRefOrGetter<boolean> = true,
  belowLayerIds: MaybeRefOrGetter<string[]> = [],
) => {
  watch(
    () => [
      toValue(map),
      toValue(sourceId),
      toValue(layerId),
      toValue(sourceSpec),
      toValue(layerSpec),
      toValue(enabled),
      ...toValue(dependencies),
      ...toValue(belowLayerIds),
    ],
    (_, __, onCleanup) => {
      const mapInstance = toValue(map);
      const source = toValue(sourceSpec);
      const layer = toValue(layerSpec);
      const sId = toValue(sourceId);
      const lId = toValue(layerId);

      if (!mapInstance || !source || !layer || !toValue(enabled)) return;

      const addLayer = () => {
        if (!mapInstance.isStyleLoaded()) return;

        const existingLayer = mapInstance.getLayer(lId);
        if (!existingLayer && !mapInstance.getSource(sId)) {
          mapInstance.addSource(sId, source);
        }

        if (!existingLayer) {
          const beforeId = toValue(belowLayerIds).find((id) =>
            mapInstance.getLayer(id),
          );

          mapInstance.addLayer(layer, beforeId);
        }
      };

      if (mapInstance.isStyleLoaded()) {
        addLayer();
      } else {
        mapInstance.once("load", addLayer);
      }

      onCleanup(() => {
        mapInstance.off("load", addLayer);

        if (!mapInstance.isStyleLoaded()) return;

        if (mapInstance.getLayer(lId)) {
          mapInstance.removeLayer(lId);
        }

        if (mapInstance.getSource(sId)) {
          mapInstance.removeSource(sId);
        }
      });
    },
    { immediate: true },
  );
};
