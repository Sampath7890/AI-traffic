import { CONFIG } from "./config.js";
import { initializeMap, setPointMarkers, setIncident, renderRoutes, animateVehicle, clearMapRoutes, focusMap, setMapSize, coordinatesWithinRadius } from "./liveMap.js";
import { renderLegend } from "./ui/legend.js";
import { renderSummary } from "./ui/summary.js";

const $ = selector => document.querySelector(selector);
const state = {
  origin: null,
  destination: null,
  incident: null,
  incidentMode: false,
  routes: [],
  rawRoutes: [],
  selectedRouteId: null,
  manualSelection: false,
  hour: 8,
  loading: false,
  fallback: false,
  routeRequestId: 0
};
let lastGeocodeRequest = 0;
let geocodeQueue = Promise.resolve();
const searchTimers = new Map();
const searchVersions = new Map();

initializeTheme();
const mapElement = $("#map");
if (window.L && mapElement) {
  initializeMap(mapElement, onMapClick);
} else {
  showToast("The map library could not load. Check your connection and reload the demo.", "error");
}
renderLegend($("#map-legend"));
renderSummary($("#trip-summary"), null);
$("#radius-select").value = String(CONFIG.congestion.incidentRadiusMeters);
updateRadiusLabel();
bindInterface();
renderRouteCards();
updateMapState();

function bindInterface() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => activateTab(tab.dataset.tab));
  });
  $("#calculate-button").addEventListener("click", () => runRouting(false));
  $("#demo-button").addEventListener("click", () => runRouting(true));
  $("#clear-button").addEventListener("click", clearTrip);
  $("#swap-button").addEventListener("click", swapPoints);

  $("#hour-slider").addEventListener("input", event => {
    state.hour = Number(event.target.value);
    $("#hour-label").textContent = formatHour(state.hour);
    if (state.rawRoutes.length) rebuildScenario();
  });
  $("#incident-toggle").addEventListener("click", toggleIncidentMode);
  $("#radius-select").addEventListener("input", () => {
    updateRadiusLabel();
    setIncident(state.incident, currentRadius());
    if (state.rawRoutes.length) rebuildScenario();
  });
  $("#theme-toggle").addEventListener("click", toggleTheme);

  setupSearch("origin");
  setupSearch("destination");
  window.addEventListener("resize", setMapSize);
}

function activateTab(name) {
  if (!["live", "about"].includes(name)) name = "live";
  document.querySelectorAll(".tab").forEach(tab => {
    const active = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  const panel = $("#tab-panel");
  panel.setAttribute("aria-labelledby", `tab-${name}`);
  $("#live-view").hidden = name !== "live";
  $("#about-view").hidden = name !== "about";
  if (name === "live") {
    setTimeout(setMapSize, 50);
  }
}

function setupSearch(kind) {
  const input = $(`#${kind}-search`);
  const suggestions = $(`#${kind}-suggestions`);
  input.addEventListener("input", () => {
    clearTimeout(searchTimers.get(kind));
    const query = input.value.trim();
    const version = (searchVersions.get(kind) || 0) + 1;
    searchVersions.set(kind, version);
    if (query.length < 3) {
      closeSuggestions(suggestions);
      return;
    }
    searchTimers.set(kind, setTimeout(() => searchPlaces(query, kind, version), CONFIG.routing.geocodeDebounceMs));
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") closeSuggestions(suggestions);
    if (event.key === "Enter") {
      const first = suggestions.querySelector(".suggestion");
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  });
  document.addEventListener("click", event => {
    if (!input.parentElement.contains(event.target)) closeSuggestions(suggestions);
  });
}

async function searchPlaces(query, kind, version) {
  const suggestions = $(`#${kind}-suggestions`);
  try {
    // Nominatim's public service is limited to one request per second.
    await reserveGeocodeSlot();
    if (searchVersions.get(kind) !== version) return;
    lastGeocodeRequest = Date.now();
    const url = new URL(CONFIG.routing.nominatimUrl);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(CONFIG.routing.geocodeLimit));
    url.searchParams.set("countrycodes", CONFIG.routing.geocodeCountryCodes);
    url.searchParams.set("q", query);
    const response = await fetchWithTimeout(url, { headers: { "Accept-Language": "en" } }, CONFIG.routing.requestTimeoutMs);
    if (!response.ok) throw new Error("Place search is temporarily unavailable.");
    const places = await response.json();
    if (searchVersions.get(kind) !== version) return;
    if (!places.length) {
      suggestions.innerHTML = `<div class="suggestion" role="option" aria-disabled="true">No matching places found</div>`;
      suggestions.classList.add("open");
      return;
    }
    suggestions.innerHTML = places.map((place, index) => `
      <button class="suggestion" type="button" role="option" data-index="${index}">
        ${escapeHtml(place.name || place.display_name.split(",")[0])}
        <small>${escapeHtml(place.display_name)}</small>
      </button>`).join("");
    suggestions.querySelectorAll(".suggestion[data-index]").forEach(button => {
      button.addEventListener("click", () => {
        const place = places[Number(button.dataset.index)];
        const point = { lat: Number(place.lat), lon: Number(place.lon), name: place.name || place.display_name.split(",")[0] };
        setPoint(kind, point);
        closeSuggestions(suggestions);
        focusMap(point, 14);
      });
    });
    suggestions.classList.add("open");
  } catch (error) {
    if (searchVersions.get(kind) === version) {
      closeSuggestions(suggestions);
      showToast(error.message || "Place search failed. You can still set a point directly on the map.", "error");
    }
  }
}

function onMapClick(point) {
  if (state.incidentMode) {
    state.incident = { ...point, name: "Marked incident" };
    setIncident(state.incident, currentRadius());
    $("#incident-status").textContent = "Incident location marked on the map.";
    $("#incident-status").style.color = "#b54747";
    if (state.rawRoutes.length) rebuildScenario();
    else showToast("Incident marked. Add an origin and destination to compare routes.", "info");
    return;
  }
  if (!state.origin || state.destination) setPoint("origin", { ...point, name: coordinateLabel(point) });
  else setPoint("destination", { ...point, name: coordinateLabel(point) });
}

function setPoint(kind, point) {
  state.routeRequestId += 1;
  if (state.loading) setLoading(false);
  if (kind === "origin") state.origin = point;
  else state.destination = point;
  const input = $(`#${kind}-search`);
  input.value = point.name || coordinateLabel(point);
  setPointMarkers(state.origin, state.destination);
  state.rawRoutes = [];
  state.routes = [];
  state.selectedRouteId = null;
  state.manualSelection = false;
  clearMapRoutes();
  renderRouteCards();
  renderSummary($("#trip-summary"), null);
  updateMapState();
}

function toggleIncidentMode() {
  state.incidentMode = !state.incidentMode;
  const toggle = $("#incident-toggle");
  toggle.setAttribute("aria-checked", String(state.incidentMode));
  $("#incident-options").hidden = !state.incidentMode;
  $("#map-tool").innerHTML = state.incidentMode
    ? '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s7-5.4 7-12a7 7 0 0 0-14 0c0 6.6 7 12 7 12Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="9" r="2.2" stroke="currentColor" stroke-width="1.7"/></svg><span>Click map to place incident</span>'
    : '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s7-5.4 7-12a7 7 0 0 0-14 0c0 6.6 7 12 7 12Z" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="9" r="2.2" stroke="currentColor" stroke-width="1.7"/></svg><span>Hyderabad, Telangana</span>';
  if (!state.incidentMode) {
    state.incident = null;
    setIncident(null, currentRadius());
    $("#incident-status").textContent = "";
    if (state.rawRoutes.length) rebuildScenario();
  } else {
    $("#incident-status").textContent = "Click a road on the map to place an incident marker.";
    $("#incident-status").style.color = "";
  }
  updateMapState();
}

async function runRouting(demoMode) {
  if (state.loading) return;
  if (demoMode) {
    state.hour = 8;
    $("#hour-slider").value = "8";
    $("#hour-label").textContent = formatHour(8);
    state.origin = { ...CONFIG.demo.origin };
    state.destination = { ...CONFIG.demo.destination };
    $("#origin-search").value = state.origin.name;
    $("#destination-search").value = state.destination.name;
    state.incidentMode = true;
    $("#incident-toggle").setAttribute("aria-checked", "true");
    $("#incident-options").hidden = false;
    $("#radius-select").value = String(CONFIG.demo.incidentRadiusMeters);
    updateRadiusLabel();
    state.incident = null;
    $("#incident-status").textContent = "A sample incident will be placed on the original route.";
    $("#incident-status").style.color = "#b54747";
    setPointMarkers(state.origin, state.destination);
    setIncident(null, currentRadius());
    updateMapState();
  }
  if (!state.origin || !state.destination) {
    showToast("Choose a starting point and destination before finding a route.", "info");
    return;
  }
  if (distanceBetweenPoints(state.origin, state.destination) < CONFIG.limits.minimumRoutingDistanceKm) {
    showToast("Choose two locations at least 150 metres apart.", "info");
    return;
  }
  setLoading(true);
  const requestId = ++state.routeRequestId;
  try {
    const result = await loadRoutes(state.origin, state.destination);
    if (requestId !== state.routeRequestId) return;
    state.rawRoutes = result.routes;
    state.fallback = result.fallback;
    if (demoMode && state.rawRoutes.length) {
      const originalCoords = state.rawRoutes[0].coordinates;
      const fraction = CONFIG.demo.incidentRouteFraction;
      const incidentIndex = Math.min(originalCoords.length - 1, Math.floor((originalCoords.length - 1) * fraction));
      const [lon, lat] = originalCoords[incidentIndex];
      state.incident = { lat, lon, name: "Demonstration road incident" };
      setIncident(state.incident, currentRadius());
      $("#incident-status").textContent = "Sample incident placed on the original route.";
      $("#incident-status").style.color = "#b54747";
      showToast("Demo loaded: a sample incident is marked on the original route.", "success");
    } else if (!demoMode && state.incidentMode && !state.incident) {
      showToast("Incident mode is on. Click a road on the map to mark a disruption.", "info");
    }
    if (result.fallback) showToast("OSRM is unavailable. Showing the included sample Hyderabad routes.", "info");
    rebuildScenario();
  } catch (error) {
    if (requestId === state.routeRequestId) showToast(error.message || "Could not calculate routes. Please try again.", "error");
  } finally {
    if (requestId === state.routeRequestId) {
      setLoading(false);
      if (state.routes.length) renderRouteCards();
    }
  }
}

async function loadRoutes(origin, destination) {
  try {
    // Compute midpoint for waypoint offsets
    const midLat = (origin.lat + destination.lat) / 2;
    const midLon = (origin.lon + destination.lon) / 2;
    const OFFSET = 0.010; // ~1 km, enough to force different road paths

    // Three different waypoints to force three genuinely different road paths
    const waypointConfigs = [
      null,                                          // baseline: direct, no waypoint
      { lat: midLat + OFFSET, lon: midLon - OFFSET }, // diversion: north-west
      { lat: midLat - OFFSET, lon: midLon + OFFSET }  // optimized: south-east
    ];

    const roles = ["baseline", "diversion", "optimized"];
    const names = ["Baseline Route", "AI Diversion Route", "AI Optimized Route"];

    const fetchRoute = async (waypoint) => {
      let coordinates;
      if (waypoint) {
        coordinates = `${origin.lon},${origin.lat};${waypoint.lon},${waypoint.lat};${destination.lon},${destination.lat}`;
      } else {
        coordinates = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
      }
      const url = `${CONFIG.routing.osrmUrl}/${coordinates}?alternatives=false&overview=full&geometries=geojson`;
      const response = await fetchWithTimeout(url, {}, CONFIG.routing.requestTimeoutMs);
      if (!response.ok) throw new Error(`OSRM returned ${response.status}`);
      const result = await response.json();
      if (result.code !== "Ok" || !result.routes?.length) throw new Error("No route returned");
      return result.routes[0];
    };

    // Baseline is fetched first so we always have a fallback geometry
    const baselineRoute = await fetchRoute(null);

    // Diversion and optimized fetched in parallel; if they fail, fall back to baseline geometry
    const [diversionResult, optimizedResult] = await Promise.allSettled([
      fetchRoute(waypointConfigs[1]),
      fetchRoute(waypointConfigs[2])
    ]);

    const rawOsrm = [
      baselineRoute,
      diversionResult.status === "fulfilled" ? diversionResult.value : baselineRoute,
      optimizedResult.status === "fulfilled" ? optimizedResult.value : baselineRoute
    ];

    const routes = rawOsrm.map((route, index) => ({
      id: `osrm-${index}`,
      role: roles[index],
      name: names[index],
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      coordinates: route.geometry.coordinates
    }));

    return { routes, fallback: false };
  } catch {
    const response = await fetch(CONFIG.routing.fallbackFile);
    if (!response.ok) throw new Error("Routing is offline and the local sample routes could not be loaded.");
    const sample = await response.json();
    const adapted = adaptSampleRoutes(sample.routes, origin, destination).slice(0, CONFIG.limits.maxRoutes);
    const roles = ["baseline", "diversion", "optimized"];
    const names = ["Baseline Route", "AI Diversion Route", "AI Optimized Route"];
    const routes = adapted.map((r, i) => ({ ...r, role: roles[i] || "baseline", name: names[i] || r.name }));
    return { routes, fallback: true };
  }
}


function adaptSampleRoutes(samples, origin, destination) {
  const referenceStart = samples[0].coordinates[0];
  const referenceEnd = samples[0].coordinates[samples[0].coordinates.length - 1];
  const refDx = referenceEnd[0] - referenceStart[0];
  const refDy = referenceEnd[1] - referenceStart[1];
  const targetDx = destination.lon - origin.lon;
  const targetDy = destination.lat - origin.lat;
  const scale = Math.hypot(targetDx, targetDy) / (Math.hypot(refDx, refDy) || 1);
  const rotation = Math.atan2(targetDy, targetDx) - Math.atan2(refDy, refDx);
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  return samples.slice(0, CONFIG.limits.maxRoutes).map((sample, index) => ({
    id: `sample-${index}`,
    name: sample.name,
    distanceMeters: sample.distance,
    durationSeconds: sample.duration,
    coordinates: sample.coordinates.map(([lon, lat]) => {
      const x = (lon - referenceStart[0]) * scale;
      const y = (lat - referenceStart[1]) * scale;
      return [origin.lon + x * cos - y * sin, origin.lat + x * sin + y * cos];
    }).map((coordinate, pointIndex, all) => {
      if (pointIndex === 0) return [origin.lon, origin.lat];
      if (pointIndex === all.length - 1) return [destination.lon, destination.lat];
      return coordinate;
    })
  }));
}

function rebuildScenario() {
  if (!state.rawRoutes.length) return;
  const variation = CONFIG.congestion.perRouteVariation;
  state.routes = state.rawRoutes.map((raw, index) => {
    const roleMultipliers = { baseline: 1.0, diversion: 0.65, optimized: 0.45 };
    const multiplier = roleMultipliers[raw.role] ?? 1.0;
    const score = clamp(congestionScore(state.hour) * multiplier + (variation[index] || 0), 6, 96);
    const baseMinutes = raw.durationSeconds / 60;
    const adjustedMinutes = baseMinutes * (1 + score / 100 * CONFIG.congestion.maximumDelayFactor);
    const affected = state.incident ? routeIsAffected(raw.coordinates, state.incident, currentRadius()) : false;
    const incidentDelay = affected ? CONFIG.congestion.incidentDelayMinutes : 0;
    return {
      ...raw,
      score,
      distanceKm: raw.distanceMeters / 1000,
      baseMinutes,
      adjustedMinutes: adjustedMinutes + incidentDelay,
      incidentDelay,
      incidentAffected: affected
    };
  });
  const best = state.routes.reduce((winner, route) => route.adjustedMinutes < winner.adjustedMinutes ? route : winner, state.routes[0]);
  if (!state.manualSelection || !state.routes.some(route => route.id === state.selectedRouteId)) state.selectedRouteId = best.id;
  renderRouteCards();
  renderRoutes(state.routes, state.selectedRouteId, state.incident, currentRadius(), selectRoute);
  updateTripSummary();
  const chosen = state.routes.find(route => route.id === state.selectedRouteId) || best;
  animateVehicle(chosen);
  $("#map-empty").classList.add("hidden");
  $("#route-count").textContent = `${state.routes.length} options · ${state.fallback ? "sample routes" : "OSRM routes"}`;
  updateMapState();
}

function renderRouteCards() {
  const container = $("#route-cards");
  if (!state.routes.length) {
    container.innerHTML = `<div class="summary-empty" style="grid-column:1/-1;margin:0">Choose two locations and select <strong>Find best route</strong> to compare road options.</div>`;
    return;
  }
  const best = state.routes.reduce((winner, route) => route.adjustedMinutes < winner.adjustedMinutes ? route : winner, state.routes[0]);
  container.innerHTML = state.routes.map(route => {
    const selected = route.id === state.selectedRouteId;
    const status = route.incidentAffected ? "Incident impact" : congestionLabel(route.score);
    return `
      <button class="route-card ${selected ? "selected" : ""}" type="button" data-route-id="${escapeAttribute(route.id)}" aria-pressed="${selected}" aria-label="Select ${escapeAttribute(route.name)}" data-testid="card-route-${escapeAttribute(route.id)}">
        <div class="route-card-top"><span class="route-name">${escapeHtml(route.name)}</span>${route.id === best.id ? '<span class="route-badge">BEST ETA</span>' : ""}</div>
        <div class="route-meta"><span>Distance</span><strong>${route.distanceKm.toFixed(1)} km</strong></div>
        <div class="route-meta"><span>Base · adjusted</span><strong>${formatMinutes(route.baseMinutes)} · ${formatMinutes(route.adjustedMinutes)}</strong></div>
        <div class="route-delay">${status}${route.incidentAffected ? ` · +${formatMinutes(route.incidentDelay)}` : ""}</div>
      </button>`;
  }).join("");
  container.querySelectorAll(".route-card").forEach(card => {
    card.addEventListener("click", () => selectRoute(card.dataset.routeId));
  });
}

function selectRoute(routeId) {
  state.selectedRouteId = routeId;
  state.manualSelection = true;
  renderRouteCards();
  renderRoutes(state.routes, routeId, state.incident, currentRadius(), selectRoute);
  updateTripSummary();
  const route = state.routes.find(item => item.id === routeId);
  if (route) animateVehicle(route);
}

function updateTripSummary() {
  const selected = state.routes.find(route => route.id === state.selectedRouteId);
  const original = state.routes[0];
  renderSummary($("#trip-summary"), {
    routes: state.routes,
    original,
    recommended: selected,
    bestRoute: state.routes.reduce((winner, route) => route.adjustedMinutes < winner.adjustedMinutes ? route : winner, state.routes[0]),
    hour: state.hour,
    manualSelection: state.manualSelection
  });
  const title = $("#summary-title");
  if (title && state.manualSelection && selected?.id !== state.routes.reduce((winner, route) => route.adjustedMinutes < winner.adjustedMinutes ? route : winner, state.routes[0]).id) {
    title.textContent = "Trip summary · selected route";
    const tag = $("#trip-summary .summary-tag");
    if (tag) tag.textContent = "YOUR SELECTION";
  }
}

function updateMapState() {
  const box = $("#map-state");
  if (state.origin && state.destination && state.routes.length) {
    box.innerHTML = `<strong>Diversion calculated</strong>${state.routes.length} road options · simulated traffic`;
  } else if (state.incidentMode) {
    box.innerHTML = `<strong>Incident placement mode</strong>${state.incident ? "Marker set · click again to move" : "Click a road to place a disruption"}`;
  } else if (state.origin && !state.destination) {
    box.innerHTML = `<strong>Starting point set</strong>Click map to place destination B`;
  } else if (state.origin && state.destination) {
    box.innerHTML = `<strong>Both points set</strong>Select Find best route`;
  } else {
    box.innerHTML = `<strong>Choose two locations</strong>Map click sets A, then B`;
  }
  $("#map-empty").classList.toggle("hidden", Boolean(state.origin && state.destination) || Boolean(state.routes.length));
}

function clearTrip() {
  state.routeRequestId += 1;
  if (state.loading) setLoading(false);
  state.origin = null;
  state.destination = null;
  state.incident = null;
  state.routes = [];
  state.rawRoutes = [];
  state.selectedRouteId = null;
  state.manualSelection = false;
  state.fallback = false;
  $("#origin-search").value = "";
  $("#destination-search").value = "";
  $("#incident-status").textContent = "";
  setPointMarkers(null, null);
  setIncident(null, currentRadius());
  clearMapRoutes();
  renderRouteCards();
  renderSummary($("#trip-summary"), null);
  $("#route-count").textContent = "Waiting for locations";
  updateMapState();
  focusMap({ lat: CONFIG.map.center[0], lon: CONFIG.map.center[1] }, CONFIG.map.zoom);
}

function swapPoints() {
  if (!state.origin && !state.destination) {
    showToast("Set a starting point and destination before swapping.", "info");
    return;
  }
  [state.origin, state.destination] = [state.destination, state.origin];
  state.routeRequestId += 1;
  if (state.loading) setLoading(false);
  $("#origin-search").value = state.origin?.name || "";
  $("#destination-search").value = state.destination?.name || "";
  setPointMarkers(state.origin, state.destination);
  state.rawRoutes = [];
  state.routes = [];
  state.selectedRouteId = null;
  state.manualSelection = false;
  clearMapRoutes();
  renderRouteCards();
  renderSummary($("#trip-summary"), null);
  updateMapState();
}

function congestionScore(hour) {
  if (CONFIG.congestion.peakHours.includes(hour)) return CONFIG.congestion.peakScore;
  if (CONFIG.congestion.middayHours.includes(hour)) return CONFIG.congestion.middayScore;
  const adjacentPeak = CONFIG.congestion.peakHours.some(peak => Math.abs(peak - hour) === 1);
  return adjacentPeak ? 55 : CONFIG.congestion.quietScore;
}

function routeIsAffected(coordinates, incident, radius) {
  return coordinatesWithinRadius(coordinates, incident, radius);
}

function distanceMeters(a, b) {
  const meanLat = (a.lat + b.lat) / 2 * Math.PI / 180;
  return Math.hypot((a.lon - b.lon) * 111320 * Math.cos(meanLat), (a.lat - b.lat) * 110540);
}

function distanceBetweenPoints(a, b) {
  return distanceMeters(a, b) / 1000;
}

function currentRadius() {
  return Number($("#radius-select").value || CONFIG.congestion.incidentRadiusMeters);
}

function updateRadiusLabel() {
  const output = $("#radius-value");
  if (output) output.textContent = Number($("#radius-select").value) >= 1000
    ? `${(Number($("#radius-select").value) / 1000).toFixed(1)} km`
    : `${$("#radius-select").value} m`;
}

function initializeTheme() {
  let theme = "light";
  try {
    const saved = localStorage.getItem("routewise-theme");
    if (saved === "dark" || saved === "light") theme = saved;
  } catch {
    // The theme still works for the current page when storage is unavailable.
  }
  document.documentElement.dataset.theme = theme;
  updateThemeButton(theme);
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  try {
    localStorage.setItem("routewise-theme", nextTheme);
  } catch {
    // Keep the selected theme for this page even if persistence is blocked.
  }
  updateThemeButton(nextTheme);
}

function updateThemeButton(theme) {
  const button = $("#theme-toggle");
  if (!button) return;
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  const text = button.querySelector("[data-theme-label]");
  if (text) text.textContent = theme === "dark" ? "Light mode" : "Dark mode";
}

function setLoading(loading) {
  state.loading = loading;
  const button = $("#calculate-button");
  button.disabled = loading;
  button.querySelector("span").textContent = loading ? "Finding routes…" : "Find best route";
  $("#route-count").textContent = loading ? "Loading road alternatives…" : state.routes.length ? `${state.routes.length} options` : "Waiting for locations";
  if (loading) $("#route-cards").innerHTML = `
    <div class="route-card route-skeleton" aria-hidden="true"><div class="skeleton-bar skeleton-title"></div><div class="skeleton-bar"></div><div class="skeleton-bar skeleton-short"></div></div>
    <div class="route-card route-skeleton" aria-hidden="true"><div class="skeleton-bar skeleton-title"></div><div class="skeleton-bar"></div><div class="skeleton-bar skeleton-short"></div></div>`;
}

function showToast(message, kind = "info") {
  const region = $("#toast-region");
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  toast.setAttribute("role", kind === "error" ? "alert" : "status");
  const copy = document.createElement("div");
  copy.className = "toast-copy";
  copy.textContent = message;
  const close = document.createElement("button");
  close.className = "toast-close";
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss notification");
  close.textContent = "×";
  close.addEventListener("click", () => toast.remove());
  toast.append(copy, close);
  region.append(toast);
  setTimeout(() => toast.remove(), 7200);
}

function closeSuggestions(element) {
  element.classList.remove("open");
  element.innerHTML = "";
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

function reserveGeocodeSlot() {
  const reservation = geocodeQueue.then(async () => {
    const wait = Math.max(0, CONFIG.routing.geocodeMinimumIntervalMs - (Date.now() - lastGeocodeRequest));
    if (wait) await delay(wait);
    lastGeocodeRequest = Date.now();
  });
  geocodeQueue = reservation.catch(() => {});
  return reservation;
}

function formatHour(hour) {
  const h = hour % 12 || 12;
  return `${h}:00 ${hour >= 12 ? "PM" : "AM"}`;
}

function formatMinutes(value) {
  const minutes = Math.max(0, Math.round(value));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes} min`;
}

function congestionLabel(score) {
  if (score < CONFIG.congestion.lowThreshold) return "Light traffic";
  if (score < CONFIG.congestion.highThreshold) return "Moderate traffic";
  return "Heavy traffic";
}

function coordinateLabel(point) {
  return `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
