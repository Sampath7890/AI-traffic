export function renderLegend(container) {
  container.innerHTML = `
    <span class="legend-title">ROUTE ROLES</span>
    <span class="legend-item"><i class="legend-swatch" style="background:#dc2626"></i>Baseline Route</span>
    <span class="legend-item"><i class="legend-swatch" style="background:#f97316"></i>AI Diversion Route</span>
    <span class="legend-item"><i class="legend-swatch" style="background:#16a34a"></i>AI Optimized Route</span>
  `;
}
