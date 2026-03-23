import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";

let protocolRegistered = false;

export function registerMapProtocol() {
  if (protocolRegistered) return;
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}
