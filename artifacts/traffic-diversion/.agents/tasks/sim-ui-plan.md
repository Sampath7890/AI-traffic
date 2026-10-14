# Implementation Plan — Simulation UI Rebuild

## Codebase findings

- **App type**: Vite + vanilla JS (ES modules, no framework). `index.html` is the single page.
  Build: `pnpm run build` inside `artifacts/traffic-diversion`. Dev server: `pnpm run dev`.
- **No automated tests** in the traffic-diversion package. Verification is visual + `pnpm run typecheck`.
- **Engine files that must NOT change**: `js/sim/engine.js`, `js/sim/metrics.js`, `js/sim/network.js`,
  `js/sim/router.js`, `js/sim/predictor.js`.
- The simulation already runs **both** `baseline` and `ai` at the same time from the same scenario.
  `simulation.getState()` returns `{ baseline: RunSnapshot, ai: RunSnapshot, summary, ... }`.
  A `RunSnapshot` contains `{ edges, vehicles, metrics }`.
- `metrics` shape (from `calculateRunMetrics`):
  `averageTripSeconds`, `averageDelaySeconds`, `averageSpeedKph`, `redRoadCount`,
  `completedTrips`, `totalTrips`, `diversions`, `totalDistanceKm`, `averageDistanceKm`,
  `totalEstimatedFuelCost`, `averageEstimatedFuelCost`.
  → **`metrics.js` does NOT need a `totalEdges` field**; `redRoadCount` plus `totalTrips`
  cover the required dashboard metrics. No engine change needed.
- `mapRecords` is a module-level object in `simulation.js`. Currently keyed `"baseline"` and `"ai"`,
  corresponding to `#sim-map-baseline` and `#sim-map-ai` in the HTML.
  After the rebuild there will be only **one** shared map element (`#sim-map`).
  The `mapRecords` object will shrink to a single key (`"active"`) that is re-pointed when the
  tab switches, **or** — simpler and requiring fewer function changes — keep both Leaflet map
  instances alive (already initialised) but render only the active one's container visible.
  **Decision**: keep both Leaflet instances, hide/show their wrapper `<div>` with CSS, and
  re-invalidate the visible map's size on tab switch. This avoids touching any renderRoads /
  drawVehicles logic.
- `renderMetrics(container, metrics)` fills a `<div>` by id. With a single map and two-column
  metrics panel the function is called twice per frame (once per run) — that stays unchanged.
- The `about-card` to remove is `article.panel.about-card` with inner `<span class="about-number">04 / SIMULATION</span>`.
  It is the fourth `<article>` inside `.about-grid` in `#about-view`. It is in `index.html`,
  **not** in `#simulation-view`.
- The two existing `<section class="panel simulation-map-card">` blocks sit inside
  `<div class="simulation-maps">` which uses `grid-template-columns: repeat(2, …)`.
  These are replaced with a single tab-switcher + single visible map region.
- CSS classes used by the current two-map layout that will be retired:
  `.simulation-maps`, `.simulation-map-card`, `.simulation-card-head`, `.map-index`, `.map-tag`,
  `.ai-tag`, `.ai-card`. All are defined in `styles.css` simulation block and are safe to repurpose
  (they are not shared with other views).
- Leaflet map `invalidateSize()` must be called ~70 ms after a tab becomes visible (already done
  in `activateSimulation`). The same call must happen when the Baseline/RouteWise tab is switched.
- The `simulation-vehicles-canvas` is appended directly to the Leaflet map `<div>` container by
  `ensureMaps()`. This still works after the HTML change as long as the `<div id="sim-map-*">`
  elements exist in the DOM (they can be hidden, Leaflet does not care).

---

## Plan

- [ ] 1. **Remove the 04 / SIMULATION about-card from `index.html`.**

  Locate the `<article>` element with `<span class="about-number">04 / SIMULATION</span>` inside
  `#about-view > .about-grid`. Delete the entire `<article>` block (from `<article` to its closing
  `</article>`). There are 5 about-cards total; after removal there will be 4.

  The exact block in the current file is (lines ~179–183):
  ```html
  <article class="panel about-card"><span class="about-number">04 / SIMULATION</span><h3>How should I explain the comparison?</h3><p>The baseline keeps to a static shortest route. RouteWise uses predicted congestion to decide whether to divert. Both views use the same scenario settings, letting us compare the outcome under controlled conditions.</p></article>
  ```
  Delete that entire `<article>` element.

  Files: `index.html`
  Verify: `pnpm run typecheck` passes; open the About tab in the browser — the "04 / SIMULATION"
  card is gone; the remaining 4 cards are still visible.

---

- [ ] 2. **Rebuild the `#simulation-view` map area in `index.html` — replace two-map grid with
  tab-switcher + single-frame design.**

  Inside `#simulation-view > .simulation-layout > .simulation-main`, replace the entire
  `<div class="simulation-maps">` block (which currently contains the two
  `<section class="panel simulation-map-card">` elements) with the following structure:

  ```html
  <div class="sim-map-frame panel">
    <!-- Tab switcher -->
    <div class="sim-tab-bar" role="tablist" aria-label="Simulation mode">
      <button type="button" class="sim-tab sim-tab--active" id="sim-tab-baseline"
              role="tab" aria-selected="true" aria-controls="sim-map-pane-baseline"
              data-simtab="baseline">
        Baseline
      </button>
      <button type="button" class="sim-tab" id="sim-tab-ai"
              role="tab" aria-selected="false" aria-controls="sim-map-pane-ai"
              data-simtab="ai">
        RouteWise AI
      </button>
    </div>

    <!-- Map panes — both exist in DOM; only one is visible at a time -->
    <div class="sim-map-pane sim-map-pane--active" id="sim-map-pane-baseline"
         role="tabpanel" aria-labelledby="sim-tab-baseline">
      <div class="simulation-map" id="sim-map-baseline"
           aria-label="Baseline traffic simulation map"></div>
      <div class="sim-legend" aria-label="Congestion legend">
        <span><i class="legend-swatch green"></i>Free</span>
        <span><i class="legend-swatch amber"></i>Moderate</span>
        <span><i class="legend-swatch red"></i>Heavy</span>
      </div>
    </div>

    <div class="sim-map-pane" id="sim-map-pane-ai"
         role="tabpanel" aria-labelledby="sim-tab-ai" hidden>
      <div class="simulation-map" id="sim-map-ai"
           aria-label="RouteWise AI traffic simulation map"></div>
      <div class="sim-legend" aria-label="Congestion legend">
        <span><i class="legend-swatch green"></i>Free</span>
        <span><i class="legend-swatch amber"></i>Moderate</span>
        <span><i class="legend-swatch red"></i>Heavy</span>
      </div>
    </div>

    <!-- Two-column metrics comparison (always both visible) -->
    <div class="sim-metrics-compare">
      <div class="sim-metrics-col sim-metrics-col--active" id="sim-metrics-col-baseline"
           aria-label="Baseline metrics">
        <div class="sim-metrics-col-head">Baseline</div>
        <div class="sim-metrics" id="sim-metrics-baseline"
             aria-label="Baseline metrics">
          <span class="metric-placeholder">Metrics appear when the run starts.</span>
        </div>
      </div>
      <div class="sim-metrics-col" id="sim-metrics-col-ai"
           aria-label="RouteWise AI metrics">
        <div class="sim-metrics-col-head">RouteWise AI</div>
        <div class="sim-metrics" id="sim-metrics-ai"
             aria-label="RouteWise AI metrics">
          <span class="metric-placeholder">Metrics appear when the run starts.</span>
        </div>
      </div>
    </div>
  </div>
  ```

  **Important IDs that must be preserved** (referenced by `simulation.js`):
  - `#sim-map-baseline` — Leaflet container (unchanged)
  - `#sim-map-ai` — Leaflet container (unchanged)
  - `#sim-metrics-baseline` — metrics render target (unchanged)
  - `#sim-metrics-ai` — metrics render target (unchanged)

  Files: `index.html`
  Verify: `pnpm run typecheck` passes; the Simulation tab renders with a single map frame,
  two tab buttons at the top, and a two-column metrics row below.

---

- [ ] 3. **Add new CSS classes to `styles.css`.**

  Append the following block at the end of `styles.css`, before or after the final `@media`
  blocks (after the dark-theme section is fine):

  ```css
  /* ── Single-map simulation tab switcher ── */
  .sim-map-frame {
    overflow: hidden;
    padding: 0;
  }

  .sim-tab-bar {
    display: flex;
    gap: 4px;
    padding: 10px 12px 0;
    border-bottom: 1px solid var(--line);
  }

  .sim-tab {
    appearance: none;
    border: 0;
    height: 38px;
    padding: 0 16px;
    border-radius: 8px 8px 0 0;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: color .15s, background .15s;
  }

  .sim-tab:hover {
    color: var(--blue-dark);
    background: var(--blue-soft);
  }

  .sim-tab--active,
  .sim-tab[aria-selected="true"] {
    color: var(--blue-dark);
    background: var(--surface);
    box-shadow: inset 0 -2px 0 var(--blue);
  }

  .sim-map-pane {
    /* hidden pane: keep in DOM for Leaflet but take no space */
    display: none;
  }

  .sim-map-pane--active,
  .sim-map-pane:not([hidden]) {
    display: block;
  }

  /* Two-column metrics bar below the map */
  .sim-metrics-compare {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    border-top: 1px solid var(--line);
  }

  .sim-metrics-col {
    padding: 10px 12px 12px;
    border-right: 1px solid var(--line);
    opacity: 0.55;
    transition: opacity .2s;
  }

  .sim-metrics-col:last-child {
    border-right: 0;
  }

  .sim-metrics-col--active {
    opacity: 1;
  }

  .sim-metrics-col-head {
    color: var(--muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    margin-bottom: 7px;
  }

  .sim-metrics-col--active .sim-metrics-col-head {
    color: var(--blue-dark);
  }

  /* Remove the old two-map grid rule (override to single column) */
  .simulation-maps {
    grid-template-columns: 1fr;
  }

  /* Dark theme additions for new classes */
  html[data-theme="dark"] .sim-tab-bar {
    border-color: var(--line);
  }

  html[data-theme="dark"] .sim-tab--active,
  html[data-theme="dark"] .sim-tab[aria-selected="true"] {
    background: var(--surface);
    color: var(--blue-dark);
  }

  html[data-theme="dark"] .sim-metrics-col {
    border-color: var(--line);
  }

  html[data-theme="dark"] .sim-metrics-compare {
    border-color: var(--line);
  }
  ```

  Files: `css/styles.css`
  Verify: `pnpm run build` succeeds (CSS is processed by Vite/LightningCSS with no parse errors).

---

- [ ] 4. **Wire the Baseline / RouteWise AI tab switcher in `simulation.js`.**

  Add a new module-level variable:
  ```js
  let activeSimTab = "baseline"; // "baseline" | "ai"
  ```

  Add a new private function `switchSimTab(key)`:
  ```js
  function switchSimTab(key) {
    activeSimTab = key;

    // Tab button aria states
    for (const btn of document.querySelectorAll(".sim-tab")) {
      const active = btn.dataset.simtab === key;
      btn.setAttribute("aria-selected", String(active));
      btn.classList.toggle("sim-tab--active", active);
    }

    // Map pane visibility (use [hidden] so Leaflet containers stay in DOM)
    const paneBaseline = $("#sim-map-pane-baseline");
    const paneAi       = $("#sim-map-pane-ai");
    if (paneBaseline && paneAi) {
      paneBaseline.hidden = key !== "baseline";
      paneAi.hidden       = key !== "ai";
    }

    // Metrics column highlight
    const colBaseline = $("#sim-metrics-col-baseline");
    const colAi       = $("#sim-metrics-col-ai");
    if (colBaseline && colAi) {
      colBaseline.classList.toggle("sim-metrics-col--active", key === "baseline");
      colAi.classList.toggle("sim-metrics-col--active",       key === "ai");
    }

    // Leaflet needs invalidateSize after becoming visible
    const record = mapRecords[key];
    if (record) {
      window.setTimeout(() => {
        record.map.invalidateSize();
        if (latestState) drawVehicles(record, latestState[key]);
      }, 30);
    }
  }
  ```

  In `initSimulation()`, **after** the existing event-listener block, add:
  ```js
  document.querySelectorAll(".sim-tab").forEach(btn => {
    btn.addEventListener("click", () => switchSimTab(btn.dataset.simtab));
  });
  ```

  Also call `switchSimTab("baseline")` inside `resetSimulation()` to restore the tab to
  baseline whenever the simulation is reset, so the user always starts from baseline view:
  ```js
  // At the end of resetSimulation(), just before renderAll(latestState):
  switchSimTab("baseline");
  ```

  Files: `js/simulation.js`
  Verify: Clicking "Baseline" / "RouteWise AI" buttons switches the visible map and highlights
  the active metrics column. `pnpm run typecheck` passes.

---

- [ ] 5. **Update `activateSimulation()` to invalidate both maps on tab-show.**

  The existing `activateSimulation()` already calls `record.map.invalidateSize()` in a loop.
  That loop now covers both map records (baseline and ai) which are both initialised by
  `ensureMaps()`. No change needed to the loop itself.

  However, after the HTML change the `sim-map-pane-ai` div has `hidden` by default. Leaflet
  can still initialise on a hidden element, but `invalidateSize` on a hidden element is a no-op.
  The fix: call `switchSimTab(activeSimTab)` at the end of `activateSimulation()` (after the
  `ensureMaps()` call) to guarantee the active pane is visible and its map is correctly sized:

  ```js
  export function activateSimulation() {
    if (!initialized) initSimulation();
    ensureMaps();
    window.setTimeout(() => {
      // switchSimTab makes the correct pane visible, then invalidates
      switchSimTab(activeSimTab);
      if (latestState) renderAll(latestState);
    }, 70);
  }
  ```

  Replace the existing `activateSimulation` body with the above.

  Files: `js/simulation.js`
  Verify: Switching to the Simulation tab then back and forth does not produce a grey/blank map.
  `pnpm run typecheck` passes.

---

- [ ] 6. **Final build & visual check.**

  Run `pnpm run build` inside `artifacts/traffic-diversion`. Then open the app with
  `pnpm run dev` and manually verify:

  1. **About tab** — the "04 / SIMULATION" card is absent; 4 cards remain.
  2. **Simulation tab** — a single map frame is visible with "Baseline" and "RouteWise AI"
     tab buttons at the top.
  3. Clicking "RouteWise AI" swaps to the AI map; clicking "Baseline" swaps back.
  4. The metrics area always shows two columns; the active tab's column is fully opaque and
     its header label is highlighted in blue.
  5. Pressing Play runs the simulation; both maps update in the background; the visible map
     shows live road colours and vehicle dots correctly.
  6. Dark-mode toggle correctly styles the new tab bar and metrics columns.
  7. The existing controls, chart, diversion log, and summary panel are unaffected.

  Files: (no new changes — build artefacts only)
  Verify: `pnpm run build` exits 0; all manual checks above pass.

---

## Gotchas and dependencies

| Issue | Detail |
|---|---|
| Leaflet on hidden element | Leaflet initialises fine on a `[hidden]` div, but `invalidateSize()` is a no-op until the element is visible. `switchSimTab` solves this by showing the pane before calling `invalidateSize`. |
| `[hidden]` vs `display:none` CSS | `styles.css` has `[hidden] { display: none !important; }`. The `.sim-map-pane` CSS sets `display: none` for non-active panes. Using the `hidden` HTML attribute for the inactive pane is correct and works with both rules. The `sim-map-pane--active` class or the absence of `[hidden]` makes it block. |
| `ensureMaps()` guard | `ensureMaps()` returns early if `Object.keys(mapRecords).length` is truthy. Both Leaflet instances are created on first call; subsequent calls are no-ops. This is safe. |
| `renderAll` still iterates `["baseline", "ai"]` | `renderAll` calls `renderRoads` and `drawVehicles` for **both** runs on every frame — including the hidden map. `renderRoads` only sets polyline styles (no DOM visibility issue). `drawVehicles` reads `getBoundingClientRect()` on the hidden canvas; a zero-size rect is returned, so the early `if (!rect.width || !rect.height) return` guard in `drawVehicles` already skips drawing on the hidden canvas. No change needed. |
| CSS specificity | `.sim-map-pane:not([hidden])` and `.sim-map-pane--active` both set `display: block`. The `[hidden] { display: none !important }` rule takes precedence when the attribute is present, so toggling the `hidden` attribute is the correct mechanism. |
| `metrics.js` `totalEdges` | Not needed. The required dashboard metrics (avg trip time, avg speed, completed/total trips, red road count, diversions, fuel cost) are all already present in the `calculateRunMetrics` return object. |
| Old `.simulation-maps` grid rule | The existing rule `grid-template-columns: repeat(2, …)` in `styles.css` is overridden by the new `.simulation-maps { grid-template-columns: 1fr; }` rule added at the end of the file. Since the HTML element `.simulation-maps` is being replaced with `.sim-map-frame`, this override is just safety; the old class becomes unused. |
| Responsive breakpoints | The existing `@media (max-width: 767px)` block sets `.simulation-maps { grid-template-columns: 1fr; }` — this is now irrelevant but harmless. The new `.sim-map-frame` inherits the full column width from `.simulation-main`. |
| `sim-map-pane` height | The existing `.simulation-map { height: clamp(215px, 23vw, 290px); }` rule still applies inside each pane — map height is unchanged. |
