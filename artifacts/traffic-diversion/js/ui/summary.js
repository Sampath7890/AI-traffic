function formatClock(hour, minutes) {
  const total = (hour * 60 + minutes) % (24 * 60);
  const h24 = Math.floor(total / 60);
  const minute = String(total % 60).padStart(2, "0");
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${minute} ${suffix}`;
}

function fuelLitres(distanceKm, efficiencyKmPerLitre) {
  return distanceKm / efficiencyKmPerLitre;
}

function fuelCostINR(litres, pricePerLitre) {
  return litres * pricePerLitre;
}

function formatINR(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.max(0, value));
}

export function renderSummary(container, data) {
  if (!data?.routes?.length || !data.recommended) {
    container.innerHTML = `
      <div class="summary-head"><div><h2 id="summary-title">Trip summary</h2><p>Your diversion impact, at a glance</p></div><span class="summary-tag">AWAITING ROUTE</span></div>
      <div class="summary-empty">Set a starting point and destination, then find a route to compare the original journey with an AI-selected diversion.</div>`;
    return;
  }

  const { original, recommended, hour } = data;
  const saved = original.adjustedMinutes - recommended.adjustedMinutes;
  const savedPercent = original.adjustedMinutes > 0 ? Math.round(Math.abs(saved) / original.adjustedMinutes * 100) : 0;
  const positive = saved > 0.2;
  const slower = saved < -0.2;
  const isManualAlternative = data.manualSelection && recommended.id !== data.bestRoute?.id;
  const reason = isManualAlternative
    ? `Your selection is compared with the AI's fastest estimate (${formatMinutes(data.bestRoute.adjustedMinutes)}).`
    : recommended.incidentAffected
      ? "Recommended route avoids the marked incident zone."
      : recommended.score < original.score
        ? `Lower simulated congestion at ${formatClock(hour, 0)} makes this route faster.`
        : "Best estimated arrival time across the available alternatives.";

  // Fuel calculations
  const EFFICIENCY = 15;   // km per litre (from CONFIG)
  const PRICE     = 108;   // INR per litre (from CONFIG)
  const origLitres = fuelLitres(original.distanceKm, EFFICIENCY);
  const recLitres  = fuelLitres(recommended.distanceKm, EFFICIENCY);
  const origCost   = fuelCostINR(origLitres, PRICE);
  const recCost    = fuelCostINR(recLitres, PRICE);
  const fuelSaved  = origCost - recCost;
  const litresSaved = origLitres - recLitres;

  container.innerHTML = `
    <div class="summary-head">
      <div><h2 id="summary-title">Trip summary</h2><p>Original route compared with the recommended diversion</p></div>
      <span class="summary-tag">${isManualAlternative ? "YOUR SELECTION" : "AI RECOMMENDATION"}</span>
    </div>
    <div class="summary-comparison">
      <div class="summary-metric">
        <div class="metric-label">Original · ${escapeHtml(original.name)}</div>
        <div class="metric-value">${formatMinutes(original.adjustedMinutes)}</div>
        <div class="metric-detail">Arrive ${formatClock(hour, original.adjustedMinutes)}</div>
      </div>
      <div class="summary-metric recommended">
        <div class="metric-label">Recommended · ${escapeHtml(recommended.name)}</div>
        <div class="metric-value">${formatMinutes(recommended.adjustedMinutes)}</div>
        <div class="metric-detail">Arrive ${formatClock(hour, recommended.adjustedMinutes)}</div>
      </div>
      <div class="summary-metric">
        <div class="metric-label">Trip distance</div>
        <div class="metric-value">${formatDistance(recommended.distanceKm)}</div>
        <div class="metric-detail">${recommended.incidentAffected ? "Incident impact included" : "Estimated road distance"}</div>
      </div>
    </div>
    <div class="saving-box ${positive ? "" : "neutral"}">
      <div><div class="saving-title">${positive ? "Estimated time saved" : slower ? "Compared with original" : "No time saved"}</div><div class="saving-reason">${escapeHtml(reason)}</div></div>
      <div class="saving-value">${positive ? `${formatMinutes(saved)} · ${savedPercent}%` : slower ? `−${formatMinutes(-saved)} · ${savedPercent}%` : "0 min · 0%"}</div>
    </div>
    <div class="fuel-section">
      <div class="fuel-section-head">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15"><path d="M6 2v20M6 6h8a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H6M18 6l2 2v8a1 1 0 0 1-1 1h-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Fuel Consumption
      </div>
      <div class="fuel-grid">
        <div class="fuel-col">
          <div class="fuel-col-label">Original route</div>
          <div class="fuel-row"><span>Distance</span><strong>${formatDistance(original.distanceKm)}</strong></div>
          <div class="fuel-row"><span>Fuel used</span><strong>${origLitres.toFixed(2)} L</strong></div>
          <div class="fuel-row"><span>Fuel cost</span><strong>${formatINR(origCost)}</strong></div>
        </div>
        <div class="fuel-divider" aria-hidden="true"></div>
        <div class="fuel-col">
          <div class="fuel-col-label">Recommended route</div>
          <div class="fuel-row"><span>Distance</span><strong>${formatDistance(recommended.distanceKm)}</strong></div>
          <div class="fuel-row"><span>Fuel used</span><strong>${recLitres.toFixed(2)} L</strong></div>
          <div class="fuel-row"><span>Fuel cost</span><strong>${formatINR(recCost)}</strong></div>
        </div>
      </div>
      <div class="fuel-saving ${fuelSaved >= 0 ? "positive" : "negative"}">
        <span>${fuelSaved >= 0 ? "Estimated fuel saving" : "Extra fuel on this route"}</span>
        <strong>${fuelSaved >= 0 ? "" : "−"}${Math.abs(litresSaved).toFixed(2)} L · ${formatINR(Math.abs(fuelSaved))}</strong>
      </div>
      <p class="fuel-note">Based on ₹${PRICE}/L petrol · ${EFFICIENCY} km/L efficiency</p>
    </div>`;
}

function formatMinutes(minutes) {
  const n = Math.max(0, Math.round(minutes));
  return n >= 60 ? `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, "0")}m` : `${n} min`;
}

function formatDistance(km) {
  return km >= 10 ? `${km.toFixed(1)} km` : `${km.toFixed(2)} km`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
