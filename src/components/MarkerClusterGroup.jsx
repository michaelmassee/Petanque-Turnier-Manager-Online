import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { createElementObject, createPathComponent, extendContext } from '@react-leaflet/core';
import i18next from '../lib/i18next-config.js';

// Anzahl der Plätze in einem Cluster: Ein Marker kann mehrere Plätze bündeln (options.placeCount, siehe groupMapPlaces).
export function clusterPlaceCount(markers) {
  return markers.reduce((sum, marker) => sum + (Number(marker.options?.placeCount) || 1), 0);
}

function clusterSize(count) {
  if (count < 10) return 'small';
  if (count < 100) return 'medium';
  return 'large';
}

const ICON_SIZES = { small: 34, medium: 40, large: 48 };

function createClusterIcon(cluster, labelKey) {
  const count = clusterPlaceCount(cluster.getAllChildMarkers());
  const size = clusterSize(count);
  const label = i18next.t(labelKey).replace('{count}', count);
  return L.divIcon({
    className: `place-cluster-icon place-cluster-icon--${size}`,
    html: `<span title="${label}" aria-label="${label}">${count}</span>`,
    iconSize: [ICON_SIZES[size], ICON_SIZES[size]],
  });
}

// Fasst nahe Marker zu einem Kreis mit Anzahl zusammen (leaflet.markercluster). Die Kinder (<Marker>, <Popup>)
// hängen sich über den Kontext in die Cluster-Gruppe statt direkt in die Karte ein.
// labelKey: i18n-Key mit {count} für Tooltip/Screenreader, z. B. '{count} Mitspielgesuche'.
export const MarkerClusterGroup = createPathComponent(({ children: _children, labelKey = '{count} Bouleplätze', ...options }, context) => {
  const group = L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    maxClusterRadius: 50,
    iconCreateFunction: (cluster) => createClusterIcon(cluster, labelKey),
    ...options,
  });
  return createElementObject(group, extendContext(context, { layerContainer: group }));
});
