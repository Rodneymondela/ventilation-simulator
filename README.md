# Mine Ventilation Network Simulator

[![CI](https://github.com/Rodneymondela/ventilation-simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/Rodneymondela/ventilation-simulator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

An interactive mine ventilation network simulator (web app), inspired by desktop
tools like Ventsim DESIGN. Build a network of nodes and airways, assign airway
and fan properties, run a steady-state solve, and visualise airflow, velocity and
pressure.

> **Honesty / accuracy note.** The equation *forms* used here (Atkinson
> `R = kOL/A³`, square law `p = RQ²`, Hardy Cross) are standard mine-ventilation
> fundamentals. The empirical constants — Atkinson friction factor `k` and air
> density — are **user-editable inputs with placeholder defaults that must be
> verified against a primary source** (e.g. McPherson, *Subsurface Ventilation
> Engineering*) before any result is trusted for real engineering. Any future
> contaminant/heat layer is approximate and **not** a validated occupational-
> exposure tool.

## Status

Feature-complete against the build spec. All stages and the follow-up
spec-gap audit are done:

- [x] **Data model + Atkinson resistance maths** (`src/model`, `src/solver/resistance.ts`)
- [x] **Hardy Cross network solver + unit tests** (`src/solver/hardyCross.ts`)
- [x] **Mandatory solver sanity test** (two parallel airways + one fan, hand-checked — see below)
- [x] **Fixed-pressure / atmosphere boundary nodes** (virtual reference node + constant-pressure branches)
- [x] **2D SVG network editor** wired to the solver (`src/ui`)
- [x] **Display variables / units / colour legend** (`src/display`)
- [x] **JSON / CSV save, open, export** (`src/io`) + `localStorage` autosave
- [x] **Depth-aware 3D view (Three.js)** + **contaminant transport layer**
- [x] **Staging** — one shared network pool with per-element stage membership (up to 24 stages)
- [x] **Air-density adjustment** + **natural ventilation pressure (NVP)** + editable convergence settings
- [x] **Fixed-airflow controllers** (booster/regulator) and **blocked/sealed airways**
- [x] **Per-airway Atkinson flow exponent** *n* (`p = R·|Q|ⁿ⁻¹·Q`, laminar↔turbulent)
- [x] **Fan operating states** (normal / off / reverse / stalled)
- [x] **Toggleable status-glyph layers** + **"select same layer"** helper (both 2D and 3D)

The whole suite (38 tests) passes; `npm run build` is clean.

## Using the app

`npm run dev`, then:

- **Toolbar tools:** Select/move, Pan, Add node (click canvas), Add airway (click
  two nodes), Add fan (click an airway), Add regulator (click an airway).
- **Run solve** colours every airway by the *primary* display variable; a legend
  shows the scale. Change the **Primary/Secondary** variable and units in the
  header to recolour/relabel.
- Drag nodes to reposition; mouse-wheel to zoom, drag the background to pan.
- The **Properties** panel (right) edits the selected node/airway/fan; the
  **Results** table (bottom) lists R, Q, velocity and Δp per airway with solver
  status (converged / iterations / residual / mesh count).
- **Stage** dropdown manages up to 24 stages. Stages are filtered views of one
  shared network pool: editing an airway shared across stages propagates
  everywhere it appears; a stage-unique airway stays local. Stages round-trip
  through JSON and CSV.
- **⚙ Settings** popover: reference/operating air density, natural ventilation
  pressure (on/off + gravity), and solver convergence tolerance / max iterations.
- **▦ Glyphs** popover: toggle each status-glyph layer — fan (coloured by
  operating state), regulator, blocked, fixed airflow, fixed pressure, and
  contaminant/report — independently. Glyphs render in both the 2D and 3D views.
- **Properties panel** also exposes: per-airway air-density override, flow
  exponent *n*, fixed-airflow controller, blocked/sealed flag, and **Select same
  layer** buttons that highlight every airway sharing the selected one's
  displayed primary/secondary value.
- **File menu:** New, Open (JSON), Save (JSON), Export network/results (CSV).
  The model also autosaves to `localStorage`.
- A starter demo network (5 airways, 1 fan, 1 mesh) loads on first run.
- **2D / 3D toggle** (header): the 3D view (Three.js) places nodes by depth (z),
  orbit/zoom with the mouse, colours airways by the primary variable, and mirrors
  the status glyphs and select-same highlight. It is lazy-loaded, so Three.js is
  only fetched when you first open 3D.
- **Contaminant layer:** mark a node as a fixed concentration (e.g. fresh-air
  intake = 0) and/or give it an injection rate (a source) in the Properties
  panel, then Run solve and choose **Contaminant** as the display variable. The
  demo seeds a source at C and fresh air at A. This is an APPROXIMATE,
  conservative-tracer / perfect-mixing model — **not** a validated exposure tool.
  A bounded steady state needs a fixed-concentration node or through-flow to
  atmosphere; a closed loop with net injection reports "no steady state".

## Tech stack

- **Vite 6 + React 19 + TypeScript** for the UI (pinned to Vite 6 for Node 20.17
  compatibility).
- **Zustand** state, **Tailwind v4** styling, **SVG** 2D editor, **Three.js**
  (lazy-loaded) for the optional 3D view.
- **Vitest** for unit tests.
- The **solver is a framework-independent module** under `src/solver/` with no
  React imports, so the physics is tested in isolation and the UI can change
  without touching it.
- Three.js is split into its own async vendor chunk and dynamically imported by
  the 3D view, so it stays out of the initial bundle.

## Physics

- **Atkinson resistance:** `R = (k · O · L) / A³`  (Pa·s²/m⁶)
- **Pressure law (signed, with exponent):** `p = R · |Q|ⁿ⁻¹ · Q`. The exponent
  *n* defaults to 2 (fully turbulent square law) and is clamped to `[1, 2]`
  per airway; *n* → 1 models a laminar, low-velocity airway (`p ∝ Q`).
- **Solver:** Hardy Cross *mesh* method. Independent loops are found from a
  spanning forest (each non-tree branch = one fundamental loop). Each loop gets a
  circulating flow correction (a Newton step on Kirchhoff's pressure law),
  applied Gauss-Seidel fashion. Initial flows are built by superposing loop
  circulations on the all-zero state, so **flow continuity at every node holds
  exactly at every iteration**. Fan pressure is included in the loop balance, so
  the solve lands on the fan operating point. Tolerance and max-iteration count
  are configurable.
- **Boundary nodes:** fixed-pressure / atmosphere nodes are handled via a virtual
  reference node and constant-pressure virtual branches (the bare loop solver
  otherwise treats the network as closed).
- **Air density:** resistances are scaled `R · (ρ / ρ_ref)` from a reference to
  an operating density (per-model, with a per-airway override and a
  skip-if-already-adjusted flag).
- **Natural ventilation pressure (NVP, default off):** a buoyancy source
  `ρ · g · Δdepth` per branch in the loop balance; it nets to zero under uniform
  density and drives a draft only when intake/return densities differ.
- **Fixed airflow & blocking:** a blocked airway is excluded from the graph
  (`Q = 0`); a fixed-airflow branch is held at its set quantity and the solver
  reports the controller pressure (positive = booster, negative = regulator)
  required to sustain it.
- **Contaminant transport:** steady-state, flow-weighted junction mixing
  (conservative tracer, perfect mixing) with fixed-concentration and injection
  sources, solved Gauss-Seidel with a divergence guard.

> All empirical inputs (friction factor `k`, air density, flow exponent) are
> editable, and density/NVP defaults follow common conventions but are flagged to
> verify against a primary source — see the honesty note above.

## Mandatory solver sanity test (hand-checkable)

`src/solver/hardyCross.test.ts` builds two airways in parallel between the same
two nodes with one fan driving the circuit, and checks the solver against a hand
derivation:

```
A1: N1->N2,  R1 = kOL/A³ = 0.25·4·1/1³ = 1.0
A2: N1->N2,  R2 = kOL/A³ = 1.00·4·1/1³ = 4.0
F : N2->N1,  R=0, fan curve = line p = 7 - Q

Parallel R:  1/√Rp = 1/√1 + 1/√4 = 1.5  =>  Rp = 0.4444
Operating point:  0.4444·Q² = 7 - Q  =>  Q = 3 m³/s, p = 4 Pa
Split:  Q1/Q2 = √(R2/R1) = 2,  Q1+Q2 = 3  =>  Q1 = 2, Q2 = 1
```

The solver reproduces `Q1 = 2`, `Q2 = 1`, `Qfan = 3`, operating pressure `4 Pa`,
and zero node imbalance — see the printed expected-vs-actual table in the test
output.

## Run / build / test

```bash
git clone https://github.com/Rodneymondela/ventilation-simulator.git
cd ventilation-simulator
npm install
npm run dev        # dev server
npm test           # run the unit tests (Vitest)
npm run test:watch
npm run build      # type-check + production build
npm run preview    # serve the production build
```

Requires Node >= 20.17. Vite/Vitest/TypeScript are pinned (Vite 6 / Vitest 2 /
TS 5.6) for compatibility with Node 20.17 — newer Vite (rolldown) needs Node
≥ 20.19, so don't bump those without upgrading Node first.

## License

[MIT](./LICENSE) © 2026 Rodney Mondela.
