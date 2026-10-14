import { CONFIG } from "./config.js";

let map;
let onMapPoint;
let routeLayers = [];
let originMarker;
let destinationMarker;
let incidentMarker;
let incidentCircle;
let vehicleMarker;
let vehicleFrame;
let currentRoutes = [];

const icon = (html, className, size = [30, 30], anchor = [15, 15]) => L.divIcon({
  html, className, iconSize: size, iconAnchor: anchor
});

export function initializeMap(element, pointHandler) {
  onMapPoint = pointHandler;
  map = L.map(element, {
    center: CONFIG.map.center,
    zoom: CONFIG.map.zoom,
    minZoom: CONFIG.map.minZoom,
    maxZoom: CONFIG.map.maxZoom,
    zoomControl: false,
    scrollWheelZoom: true
  });
  L.tileLayer(CONFIG.map.tileUrl, {
    attribution: CONFIG.map.tileAttribution,
    maxZoom: CONFIG.map.maxZoom
  }).addTo(map);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  map.on("click", event => onMapPoint?.({ lat: event.latlng.lat, lon: event.latlng.lng }));
  setTimeout(() => map.invalidateSize(), 0);
  return map;
}

export function setMapSize() {
  if (map) setTimeout(() => map.invalidateSize(), 80);
}

export function setPointMarkers(origin, destination) {
  if (!map) return;
  if (origin) {
    const position = [origin.lat, origin.lon];
    if (!originMarker) originMarker = L.marker(position, { icon: icon('<div class="pin start"></div>', "start-marker", [24, 24], [12, 20]) }).addTo(map);
    else originMarker.setLatLng(position);
  } else if (originMarker) {
    map.removeLayer(originMarker);
    originMarker = null;
  }
  if (destination) {
    const position = [destination.lat, destination.lon];
    if (!destinationMarker) destinationMarker = L.marker(position, { icon: icon('<div class="pin end"></div>', "end-marker", [24, 24], [12, 20]) }).addTo(map);
    else destinationMarker.setLatLng(position);
  } else if (destinationMarker) {
    map.removeLayer(destinationMarker);
    destinationMarker = null;
  }
  const points = [origin, destination].filter(Boolean).map(point => [point.lat, point.lon]);
  if (points.length === 2) map.fitBounds(points, { padding: [55, 55], maxZoom: 14 });
  else if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 14));
}

export function setIncident(point, radiusMeters) {
  if (!map) return;
  if (!point) {
    if (incidentMarker) map.removeLayer(incidentMarker);
    if (incidentCircle) map.removeLayer(incidentCircle);
    incidentMarker = null;
    incidentCircle = null;
    return;
  }
  const latLng = [point.lat, point.lon];
  if (!incidentMarker) {
    incidentMarker = L.marker(latLng, { icon: icon('<div class="incident-pin">!</div>', "incident-marker", [28, 28], [14, 14]), zIndexOffset: 1000 });
    incidentMarker.addTo(map);
  } else incidentMarker.setLatLng(latLng);
  if (!incidentCircle) incidentCircle = L.circle(latLng, { radius: radiusMeters, color: CONFIG.colors.incident, weight: 1, fillColor: CONFIG.colors.incident, fillOpacity: .08, dashArray: "4 5" }).addTo(map);
  else incidentCircle.setLatLng(latLng).setRadius(radiusMeters);
}

export function renderRoutes(routes, selectedId, incident, radiusMeters, onSelect) {
  if (!map) return;
  clearRouteLayers();
  currentRoutes = routes || [];

  // Role-to-color map; falls back to primary blue for unknown roles
  const roleColors = {
    baseline:  CONFIG.colors.baseline  || "#dc2626",
    diversion: CONFIG.colors.diversion || "#f97316",
    optimized: CONFIG.colors.optimized || "#16a34a"
  };

  // Render non-selected routes first so the selected route draws on top
  const sorted = [...currentRoutes].sort((a, b) =>
    (a.id === selectedId ? 1 : 0) - (b.id === selectedId ? 1 : 0)
  );

  sorted.forEach(route => {
    const selected = route.id === selectedId;
    const roleColor = roleColors[route.role] || CONFIG.colors.primary;
    const weight = selected ? 7 : 5;
    const opacity = selected ? 0.85 : 0.5;

    routeLayers.push(L.layerGroup().addTo(map));
    const group = routeLayers[routeLayers.length - 1];

    // Draw the role-colored base polyline for the whole route at once
    const latLngs = route.coordinates.map(toLatLng);
    const baseLine = L.polyline(latLngs, {
      color: roleColor,
      weight,
      opacity,
      lineCap: "round",
      lineJoin: "round"
    });
    baseLine.on("click", () => onSelect?.(route.id));
    group.addLayer(baseLine);

    // Overlay dashed incident segments on top of the base color
    if (incident && route.incidentAffected) {
      for (let index = 0; index < route.coordinates.length - 1; index++) {
        const start = route.coordinates[index];
        const end   = route.coordinates[index + 1];
        if (nearIncident(start, end, incident, radiusMeters)) {
          const dash = L.polyline([toLatLng(start), toLatLng(end)], {
            color: "#dc2626",
            weight: weight + 1,
            opacity: 0.98,
            dashArray: "7 7",
            lineCap: "round"
          });
          dash.on("click", () => onSelect?.(route.id));
          group.addLayer(dash);
        }
      }
    }
  });
}

export function selectRouteOnMap(routeId, incident, radiusMeters, onSelect) {
  renderRoutes(currentRoutes, routeId, incident, radiusMeters, onSelect);
}

export function animateVehicle(route) {
  stopVehicle();
  if (!map || !Array.isArray(route?.coordinates) || route.coordinates.length < 2) return;
  const coordinates = route.coordinates;
  const iconHtml = '<div class="vehicle"><svg viewBox="0 0 24 24" fill="none"><path d="m5 14 1.6-5.1A2 2 0 0 1 8.5 7.5h7a2 2 0 0 1 1.9 1.4L19 14v4h-2v-1.5H7V18H5v-4Z" fill="currentColor"/><path d="M7 13.5h10M8 17h.1m7.8 0h.1" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg></div>';
  const first = toLatLng(coordinates[0]);
  if (!vehicleMarker) vehicleMarker = L.marker(first, { icon: icon(iconHtml, "car-marker", [31, 31], [15, 15]), zIndexOffset: 1200 }).addTo(map);
  vehicleMarker.setLatLng(first);
  const start = performance.now();
  const duration = CONFIG.animation.vehicleLoopMs;
  const animate = now => {
    const progress = Math.min((now - start) / duration, 1);
    const segmentPosition = progress * (coordinates.length - 1);
    const index = Math.min(Math.floor(segmentPosition), coordinates.length - 2);
    const part = segmentPosition - index;
    const from = coordinates[index];
    const to = coordinates[index + 1];
    // Public routing services can return incomplete geometry; skip a bad frame instead of crashing the app.
    if (!Array.isArray(from) || !Array.isArray(to) || from.length < 2 || to.length < 2) {
      vehicleFrame = null;
      return;
    }
    vehicleMarker.setLatLng([
      from[1] + (to[1] - from[1]) * part,
      from[0] + (to[0] - from[0]) * part
    ]);
    if (progress < 1) vehicleFrame = requestAnimationFrame(animate);
  };
  vehicleFrame = requestAnimationFrame(animate);
}

export function clearMapRoutes() {
  clearRouteLayers();
  currentRoutes = [];
  stopVehicle();
  if (vehicleMarker && map) {
    map.removeLayer(vehicleMarker);
    vehicleMarker = null;
  }
}

export function focusMap(point, zoom = 15) {
  if (map && point) map.setView([point.lat, point.lon], zoom);
}

function clearRouteLayers() {
  if (map) routeLayers.forEach(layer => map.removeLayer(layer));
  routeLayers = [];
}

function stopVehicle() {
  if (vehicleFrame) cancelAnimationFrame(vehicleFrame);
  vehicleFrame = null;
}

function toLatLng(coordinate) {
  return [coordinate[1], coordinate[0]];
}

function congestionColor(score) {
  if (score < CONFIG.congestion.lowThreshold) return CONFIG.colors.low;
  if (score < CONFIG.congestion.highThreshold) return CONFIG.colors.medium;
  return CONFIG.colors.high;
}

function segmentVariation(index) {
  // A gentle, deterministic wave gives each road section a different traffic condition.
  return Math.sin(index * 1.31) * CONFIG.congestion.segmentWaveAmplitude
    + Math.cos(index * .63) * CONFIG.congestion.segmentWaveSecondaryAmplitude;
}

function nearIncident(a, b, incident, radiusMeters) {
  return coordinatesWithinRadius([a, b], incident, radiusMeters);
}

export function coordinatesWithinRadius(coordinates, incident, radiusMeters) {
  if (!Array.isArray(coordinates) || !coordinates.length || !incident) return false;
  for (let index = 0; index < coordinates.length; index += 1) {
    if (distanceMeters(coordinates[index], incident) <= radiusMeters) return true;
    if (
      index < coordinates.length - 1
      && distanceToSegment(coordinates[index], coordinates[index + 1], incident) <= radiusMeters
    ) return true;
  }
  return false;
}

function distanceMeters(a, b) {
  const meanLat = (a[1] + b.lat) / 2 * Math.PI / 180;
  const dx = (a[0] - b.lon) * 111320 * Math.cos(meanLat);
  const dy = (a[1] - b.lat) * 110540;
  return Math.hypot(dx, dy);
}

function distanceToSegment(a, b, point) {
  const midLat = point.lat * Math.PI / 180;
  const scaleX = 111320 * Math.cos(midLat);
  const scaleY = 110540;
  const ax = a[0] * scaleX, ay = a[1] * scaleY;
  const bx = b[0] * scaleX, by = b[1] * scaleY;
  const px = point.lon * scaleX, py = point.lat * scaleY;
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
