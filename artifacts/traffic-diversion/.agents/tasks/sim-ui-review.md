# Simulation UI rebuild: single-map mode-toggle design

The simulation tab has been rebuilt from a dual-map side-by-side layout into a single-map tab switcher with always-visible two-column comparison metrics. The `04 / SIMULATION` explanatory about-card has been removed. The underlying simulation engine, routing, network, and predictor modules were left unchanged, with one targeted engine.js fix to guard AI rerouting behind a `useAi` flag. Traffic overlays follow actual road polylines from the network data, and metrics are derived from the live simulation state rather than being hard-coded.

Watch for: **(confirmed)** the `renderMetrics` `<strong>` tags produce unstyled bold text — there is no `.sim-metric strong` or `.sim-metric-value` CSS rule, so metric values fall back to the browser default bold rather than the styled `sim-metric-value` class used elsewhere. **(confirmed)** `engine.js` was listed as an unchanged file in the task spec but received a two-line guard change; the change is semantically correct but contradicts the "untouched" constraint.

**Verdict**: APPROVED

---

## High-level view

The about-card removal is clean — no trace of `04 / SIMULATION` or "How should I explain the comparison?" remains at HEAD. The old `sim-map-baseline` / `sim-map-ai` pane split (from HEAD~1) has been correctly replaced with a single `#sim-map-main` div, and the mode toggle buttons carry the expected `data-mode` attributes and ARIA roles.

The comparison metrics panel lands both `#sim-metrics-col-baseline` and `#sim-metrics-col-ai` in the DOM at all times. The active column gets `active-col`, which CSS lifts to full opacity and applies a blue accent background. The inactive column stays at 0.55 opacity. The mode toggle updates both the map render and the active-column highlight consistently.

`calculateRunMetrics` now returns `totalEdges`, so `renderMetrics` can express congestion as a percentage rather than a raw road count. The `diversions` field is gated to the `"ai"` role, which correctly suppresses it for the baseline column.

The engine.js change is a single-concern guard: without `if (!ai.useAi) return` at the top of `rerouteAiVehicles`, the baseline run — which uses `useAi: false` and receives a `null` predictor — would throw on `ai.predictor.forecastAll(...)`. The change is a correctness fix, not a behavioral addition, but it touches a file the task spec listed as untouched.

---

<details>
<summary>Issues (2)</summary>

1. **Metric value styling gap** — `renderMetrics` emits `<strong>` tags with no class; the CSS has `.sim-metric-value` for styled metric numbers but no rule targeting `.sim-metric strong`. Values render as plain browser-bold rather than the intended styled display. Add `class="sim-metric-value"` to each `<strong>` in the `renderMetrics` template string.

2. **engine.js touched despite "untouched" constraint** — The task spec listed `engine.js` as a file that must not be changed. It received a two-line guard (`if (!ai.useAi) return`) in `rerouteAiVehicles`. The change is semantically correct (prevents a null-pointer throw on the baseline predictor), but violates the stated constraint. Decide whether to formally accept this as a scope exception or move the guard to the caller.

</details>

<details>
<summary>Details</summary>

### Metric value CSS gap

`.sim-metric-value` is defined in CSS and sets `font-size: 13px; font-weight: 700; color: #304560`. The `renderMetrics` template uses bare `<strong>` tags with no class. There is no `.sim-metric strong` selector. Metric numbers render at default bold weight and the parent element's inherited color rather than the intended styled chip. The fix is one attribute addition per `<strong>` in the `renderMetrics` template string:

```js
`<div class="sim-metric"><span class="sim-metric-label">Avg. trip time</span><strong class="sim-metric-value">${formatDuration(metrics.averageTripSeconds)}</strong></div>`
```

### engine.js guard change

`rerouteAiVehicles` now returns early when `ai.useAi` is false. `createRunState` sets `useAi` on the run state and conditionally constructs the `LoadPredictor` — `useAi: false` produces `predictor: null`. Without the guard, the baseline run's null predictor would throw on `.forecastAll(...)` on the first tick. The change is correct and necessary, but it touches a file the task spec listed as untouched. Decide whether to accept this as a scope exception or move the guard into the caller.

</details>

---

<details>
<summary>File map</summary>

- `index.html` — removed `04 / SIMULATION` about-card; replaced two-pane map structure with single `#sim-map-main` plus `.sim-mode-bar` toggle and `.sim-comparison-metrics` two-column panel; all other controls, chart, log, and summary sections retained
- `js/simulation.js` — added `activeMode` variable; wired `.sim-mode-btn` click listeners; rewrote `ensureMaps`/`renderMainMap` to drive a single map from `state[activeMode]`; updated `renderMetrics` to compute congestion% and gate diversions by role
- `js/sim/metrics.js` — added `totalEdges: run.network.edges.length` to `calculateRunMetrics` return value
- `css/styles.css` — added `.simulation-layout-new`, `.sim-mode-bar`, `.sim-mode-btn`, `.sim-main-map-panel`, `.sim-map-legend`, `.sim-comparison-metrics`, `.sim-metrics-col`, `.sim-metrics-col-head`, and dark-theme overrides for all new classes
- `js/sim/engine.js` — added `if (!ai.useAi) return` guard in `rerouteAiVehicles`; comment clarification on compliance check

Full diff: `git diff HEAD~1 HEAD -- artifacts/traffic-diversion/`

</details>
