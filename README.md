# Mine Ventilation Network Simulator

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

Built incrementally. Current progress:

- [x] **Stage 1 — data model + resistance maths** (`src/model`, `src/solver/resistance.ts`)
- [x] **Stage 2 — Hardy Cross network solver + unit tests** (`src/solver/hardyCross.ts`)
- [x] **Mandatory solver sanity test passing** (two parallel airways + one fan,
      hand-checked — see below)
- [x] **Fixed-pressure / atmosphere boundary nodes** in the solver (+ test)
- [x] **Stage 3 — 2D SVG network editor wired to the solver** (`src/ui`)
- [x] **Stage 4 — display variables / units / colour legend** (`src/display`)
- [x] **Stage 5 — JSON / CSV save, open, export** (`src/io`) + localStorage autosave
- [x] **Stage 6 — depth-aware 3D view (Three.js) + contaminant transport layer**

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
- **Stage / Scenario** dropdown manages independent named network snapshots.
- **File menu:** New, Open (JSON), Save (JSON), Export network/results (CSV).
  The model also autosaves to `localStorage`.
- A starter demo network (5 airways, 1 fan, 1 mesh) loads on first run.
- **2D / 3D toggle** (header): the 3D view (Three.js) places nodes by depth (z),
  orbit/zoom with the mouse, and colours airways by the primary variable.
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
- 2D editor will use SVG; optional 3D will use Three.js (later stage).

## Physics

- **Atkinson resistance:** `R = (k · O · L) / A³`  (Pa·s²/m⁶)
- **Square law (signed):** `p = R · Q · |Q|`
- **Solver:** Hardy Cross *mesh* method. Independent loops are found from a
  spanning forest (each non-tree branch = one fundamental loop). Each loop gets a
  circulating flow correction (a Newton step on Kirchhoff's pressure law),
  applied Gauss-Seidel fashion. Initial flows are built by superposing loop
  circulations on the all-zero state, so **flow continuity at every node holds
  exactly at every iteration**. Fan pressure is included in the loop balance, so
  the solve lands on the fan operating point.
- Boundary (fixed-pressure / atmosphere) nodes: modelled at the network/UI stage;
  the baseline solver treats the network as closed loops.

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
npm install
npm test          # run the solver unit tests (Vitest)
npm run test:watch
npm run dev        # dev server (UI — appears from Stage 3 onward)
npm run build      # type-check + production build
```

Requires Node >= 20.17.
