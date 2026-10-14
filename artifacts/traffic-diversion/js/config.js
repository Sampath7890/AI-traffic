// All values an examiner may want to tune for a demo live here.
export const CONFIG = {
  map: {
    center: [17.385, 78.4867],
    zoom: 12,
    minZoom: 10,
    maxZoom: 18,
    tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  routing: {
    osrmUrl: "https://router.project-osrm.org/route/v1/driving",
    nominatimUrl: "https://nominatim.openstreetmap.org/search",
    requestTimeoutMs: 14000,
    geocodeDebounceMs: 550,
    geocodeMinimumIntervalMs: 1050,
    geocodeLimit: 5,
    geocodeCountryCodes: "in",
    alternatives: 3,
    fallbackFile: "/data/sample-routes.json"
  },
  congestion: {
    lowThreshold: 34,
    highThreshold: 68,
    peakHours: [8, 9, 17, 18, 19],
    middayHours: [12, 13, 14],
    peakScore: 76,
    middayScore: 42,
    quietScore: 18,
    perRouteVariation: [0, 9, -7],
    maximumDelayFactor: 0.72,
    incidentRadiusMeters: 250,
    incidentDelayMinutes: 8.5,
    segmentWaveAmplitude: 12,
    segmentWaveSecondaryAmplitude: 5
  },
  cost: {
    currency: "INR",
    petrolPricePerLiter: 108,
    fuelEfficiencyKmPerLiter: 15
  },
  simulation: {
    gridSize: 8,
    spacingKm: 0.28,
    citySpeedKph: 32,
    arterialSpeedKph: 48,
    arterialEvery: 3,
    cityCapacityVehicles: 18,
    arterialCapacityVehicles: 38,
    tickSeconds: 1,
    renderIntervalMs: 250,
    maxSimSeconds: 1200,
    vehicleCount: 250,
    complianceRate: 0.7,
    seed: 42,
    predictionHistoryTicks: 20,
    predictionAlpha: 0.3,
    forecastHorizonTicks: 15,
    rerouteIntervalTicks: 10,
    minimumSavingFraction: 0.1,
    maxDiversionsPerEdgePerInterval: 3,
    rerouteCooldownTicks: 20,
    bprAlpha: 0.15,
    bprBeta: 4,
    freeFlowRatio: 0.6,
    congestedRatio: 0.8,
    accidentAtSeconds: 60,
    accidentCapacityFraction: 0.1,
    rushDestinationRadius: 1,
    chartHistoryPoints: 90
  },
  synthesizedAlternatives: [
    { name: "Alternative via nearby roads", side: 1, lengthFactor: 1.09, timeFactor: 1.12 },
    { name: "Alternative via parallel road", side: -1, lengthFactor: 1.15, timeFactor: 1.18 }
  ],
  synthesizedRouteShiftDegrees: 0.006,
  colors: {
    low: "#16a34a",
    medium: "#f59e0b",
    high: "#dc2626",
    primary: "#2563eb",
    original: "#8496ad",
    selected: "#2563eb",
    incident: "#dc2626",
    baseline: "#dc2626",   // red
    diversion: "#f97316",  // orange
    optimized: "#16a34a"   // green
  },
  demo: {
    origin: { lat: 17.385, lon: 78.4867, name: "Charminar, Hyderabad" },
    destination: { lat: 17.4435, lon: 78.3772, name: "HITEC City, Hyderabad" },
    incidentRouteFraction: 0.47,
    incidentRadiusMeters: 250
  },
  animation: { vehicleLoopMs: 13000 },
  limits: { maxRoutes: 3, minimumRoutingDistanceKm: 0.15 }
};
