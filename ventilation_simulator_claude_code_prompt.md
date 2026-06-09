# Claude Code Prompt — Mine Ventilation Network Simulator
### (informed by the Ventsim DESIGN 5.4 User Guide, Howden)

> Paste the block below into Claude Code from the root of a new project directory.
> It is written for Claude Code's agentic workflow: scaffold the repo, implement
> the solver, TEST it against a hand-checkable case, then build the UI. Terminology
> and conventions marked "(Ventsim)" are taken from the official Ventsim DESIGN 5.4
> manual and are used here for familiarity — this is an independent simulator, not
> a clone of Howden's software.

---

```
You are a senior software engineer with mine-ventilation domain knowledge,
working in this repository via Claude Code. Build an interactive mine
ventilation network simulator (web app). It should feel familiar to users of
Ventsim DESIGN but is an independent tool — do NOT reproduce Howden's exact UI,
icon artwork, or proprietary algorithms. Prioritise correct physics and a clear,
fast UI over feature breadth. Work incrementally and TEST the solver before
building any UI on top of it.

WORKING METHOD (Claude Code specifics)
- Before writing code, propose the file/folder structure and chosen stack, then
  proceed.
- Build in this order; do not advance until the current stage runs:
  (1) data model + resistance maths, (2) network solver + unit tests,
  (3) minimal UI wired to the solver, (4) display layers + units,
  (5) staging + export, (6) thermodynamic/psychrometric simulation
  (depends on a working airflow solve), (7) optional contaminant layer.
- Run the test suite yourself after each stage and report pass/fail. Never claim
  something works without executing it.
- Commit logically between stages if a git repo is present.
- If you hit a genuine decision point or missing requirement, ask rather than
  guess.

OBJECTIVE
A user can build a ventilation network (nodes + airways), assign airway and fan
properties, run a steady-state airflow solve, and visualise airflow, velocity,
pressure and (optionally) contaminant distribution on a 2D (and optional 3D,
depth-aware) layout, with airways coloured/labelled by selectable display layers.

CORE DATA MODEL
- Node (junction): id, 3D coordinates (x, y, z; z = depth), optional fixed
  pressure (surface/atmosphere connection).
- Airway (branch): id, from-node, to-node, length L (m), cross-sectional area
  A (m^2), perimeter O (m), Atkinson friction factor k, optional fan, optional
  added resistance / regulator, optional fixed airflow, optional fixed pressure,
  airway type label, primary-layer value, secondary-layer value.
- Airway heat properties (for thermodynamic simulation): rock thermal
  conductivity / diffusivity, wetness/moisture factor, optional user sensible
  heat input, optional user latent heat input, optional diesel heat input,
  optional refrigeration/heat-exchange input. Per-airway-end computed heat state:
  dry-bulb temp, wet-bulb temp, sigma heat, relative humidity, moisture content,
  virgin rock temperature (VRT), condensate. See THERMODYNAMIC SIMULATION.
- Fan: characteristic curve as pressure (Pa) vs flow (m^3/s) data points,
  attached to an airway; operating point = intersection of fan curve and system
  curve. Track fan state for display: normal / off / reverse / stalled.
- Air type (Ventsim): an airway tag (e.g. Fresh / Exhaust / Intake) that also
  carries the Atkinson pressure-loss exponent for that airway — default 2 for
  turbulent flow (P = R*Q^2); allow override to ~1 to model laminar low-velocity
  airways. See PHYSICS.

PHYSICS ENGINE (steady-state airflow)
Implement these standard relationships. Treat the equation FORMS as correct, but
do NOT hard-code friction-factor values from memory — keep k as a user-editable
input with placeholder presets clearly marked "verify against a primary source"
(e.g. McPherson, 'Subsurface Ventilation and Environmental Engineering', which
is the reference Ventsim itself cites for its methodology).
- Airway resistance (Atkinson): R = (k * O * L) / A^3
- Pressure law: P = R * Q^n, where n defaults to 2 (turbulent) and is taken from
  the airway's air type so individual airways can use n ~ 1 (laminar). This
  matches the editable Atkinson flow coefficient described in the Ventsim manual.
- Density adjustment (Ventsim convention): friction factors and resistances are
  standardised to a reference air density (default 1.2 kg/m^3) and adjusted to
  local density during simulation. Provide a per-airway "already density-
  adjusted" flag that, when set, skips further adjustment. Keep the reference
  density user-editable; do not assert a density value you cannot justify.
- Network solution: enforce flow continuity at every node and pressure balance
  around every closed mesh. Use the Hardy Cross iterative method as a STANDARD,
  defensible baseline solver. (NOTE: the Ventsim manual does not publish its
  internal solver, so do NOT claim this matches Ventsim — it is our own choice.)
  A Newton/global-linearised method is acceptable if it converges more reliably;
  if you switch, say why.
- Fans: include fan pressure in the loop balance; solve for the operating point
  where the system curve meets the fan curve. Derive fan display state (normal/
  off/reverse/stalled) from the solved operating point.
- Convergence: expose an allowable-flow-error tolerance and a max-iterations
  setting (mirroring Ventsim's "simulation accuracy" idea). Report convergence
  status, iteration count, and residual.
- (Optional, toggle, default OFF) Natural ventilation pressure from air-density
  differences across depth.

MANDATORY SOLVER TEST (do this before any UI)
Create a unit test for a network you can verify by hand: two airways in parallel
between the same two nodes, with one fan driving the circuit. Confirm flow splits
inversely with sqrt(resistance ratio) and that flow is conserved at both nodes
within tolerance. Print the hand-derived expected values in the test so the check
is transparent. Fix the solver before continuing if it fails.

DISPLAY LAYERS (Ventsim primary/secondary model — matches the two dropdown pairs)
- A PRIMARY and a SECONDARY display layer selector. Each chooses what airways are
  coloured/labelled by: Airflow (m^3/s), Velocity (m/s), Pressure (Pa),
  Resistance, plus heat fields (dry-bulb temp, wet-bulb temp, sigma heat,
  relative humidity) once thermodynamic simulation is built, plus contaminant
  fields if implemented.
- A units selector per layer (SI minimum; allow switching, e.g. m/s).
- Colour airways on a gradient by the selected layer, with a visible legend.
- "Select same primary / same secondary" helper to select airways sharing a
  layer value.

AIRWAY ICONS (Ventsim-style indicators — draw your own simple glyphs, not Howden art)
Show small status glyphs on airways for: fan (colour-coded normal=green,
off=blue, reverse=yellow, stalled=red), blocked airway, added resistance, fixed
airflow, fixed pressure, contaminant report, fresh-air report, contaminant
present. Make them toggleable.

STAGING (Ventsim staging model)
- Support up to 24 named stages in a single model file, representing mine
  timeline phases OR alternative design options.
- Each airway belongs to one or more stages; airways shared across stages reflect
  edits everywhere they appear, while stage-unique airways do not.
- A stage selector in the header (matches the screenshot's "Stage" combo).
- Per the manual's behaviour: do NOT auto-re-simulate on stage switch by default;
  require an explicit solve for the active stage, and make that explicit in the
  UI so shared airways are not misread as carrying another stage's results.

UI / LAYOUT (familiar but original)
- Top menu bar: File, Edit, View, Run, Tools, Settings, Help.
- Toolbar: new/open/save, undo/redo, add node, add airway, add fan, add
  resistance/regulator, run solve, select/pan/zoom.
- Stage selector in the header.
- Main canvas: 2D network editor minimum; depth-aware 3D optional.
- Properties panel for the selected node/airway/fan.
- Results table per airway: R, Q, velocity, pressure drop, fan state, and (after
  heat sim) inlet/outlet dry-bulb, wet-bulb, RH, sigma heat, and total heat
  addition.

THERMODYNAMIC / PSYCHROMETRIC SIMULATION (heat + moisture; depends on airflow)
This is a coupled heat-and-mass-balance subsystem, NOT a chart lookup. Build it
ONLY after the airflow solve works, because heat is transported along the solved
airflow directions and mixed at junctions.

CRITICAL — DO NOT INVENT THE PSYCHROMETRICS. Do not generate saturation-vapour-
pressure, sigma-heat, enthalpy, or wet-bulb/dry-bulb conversion formulas or
constants from memory. Either (a) use a vetted, currently-maintained
psychrometric library and cite it in the README, or (b) implement equations
transcribed from a named primary source — McPherson, 'Subsurface Ventilation and
Environmental Engineering' (the text Ventsim cites), or the ASHRAE psychrometric
formulations — and cite chapter/equation. If you cannot verify a formula against
a named source, STOP and ask rather than approximating. Wrong climate numbers are
worse than no climate numbers for occupational-hygiene use.

Per-airway air state to track at each end: dry-bulb temperature, wet-bulb
temperature, barometric pressure, moisture content, sigma heat, relative humidity.

Heat sources to model (from the Ventsim manual's heat chapter):
- Rock strata: heat flow from exposed rock, driven by Virgin Rock Temperature
  (VRT). Compute VRT from a user-set geothermal gradient, airway elevation, and
  surface rock temperature. Expose all three as settings; do not hard-code a
  gradient.
- Autocompression: air warms as it descends. The manual cites ~10 deg C dry-bulb
  per 1000 m as a theoretical figure, reduced when moisture is present —
  implement this from the thermodynamic relations of the cited source, not as a
  fixed 10/1000 m rule; treat that figure only as a sanity-check magnitude.
- Evaporative cooling / moisture pickup: water on surfaces and sprays lower
  dry-bulb while raising moisture content and wet-bulb; model the sensible vs
  latent heat split.
- Condensation: when air cools or barometric pressure falls below saturation
  (e.g. rising a shaft, or downstream of refrigeration), report condensate.
- User inputs per airway: sensible heat, latent heat, diesel heat, refrigeration/
  heat-exchange.

Solve approach:
- Run the airflow solve first. Then march air state along each airway in flow
  direction, applying sensible + latent heat per unit length, and mix flows by
  mass-weighted sigma heat (and moisture) at junctions.
- Because heat affects air density and density affects airflow, support an
  optional coupled airflow<->heat iteration (mirroring the manual's "Sim Air /
  Sim Heat" behaviour and compressible-flow option). Expose a convergence
  tolerance and report status. Default to a single airflow-then-heat pass unless
  coupling is enabled.

Outputs per airway end (match the manual's heat data set): dry-bulb, wet-bulb,
sigma heat, relative humidity, moisture content, VRT, sensible heat addition,
latent heat addition, heat addition per length, total heat addition, contained
energy (sigma heat x mass flow), condensate.

MANDATORY PSYCHROMETRIC TEST
Before wiring heat into the network, unit-test the psychrometric core against
known reference points from the cited source/library (e.g. a known dry-bulb +
wet-bulb -> relative humidity and sigma heat at a stated barometric pressure).
Print expected vs computed in the test. Do not proceed if it fails.

CONTAMINANT LAYER (optional — build only after core solve works)
Steady-state contaminant transport along airways using flow-weighted mixing at
junctions, with concentration display and contaminant/fresh-air "report" points
that trace upstream sources and downstream pathways. Keep assumptions explicit
and labelled approximate. Do NOT present this as a validated occupational-
exposure tool.

OUTPUTS
- Export network + results to JSON and CSV.
- Solver status panel: converged / not converged, iterations, residual.

TECH NOTES
- Suggested stack: a modern web framework for UI, SVG/canvas for 2D, a WebGL
  library (e.g. Three.js) for optional 3D. You may choose alternatives; justify
  briefly. Keep the solver in its own framework-independent, unit-tested module.
- Provide a README with run/build/test instructions.

ACCEPTANCE CRITERIA (verify each by running, not by assertion)
1. I can build a network of >=5 airways with one fan and one mesh.
2. The solver converges and conserves flow at every node within tolerance.
3. The two-parallel-airway sanity test matches the hand calculation.
4. I can switch primary/secondary layers and units and see the network recolour.
5. I can create at least two stages with one shared airway, edit the shared
   airway, and confirm the edit appears in both stages.
6. The psychrometric core matches the cited reference points in its unit test,
   and after a heat sim I can see wet-bulb and dry-bulb rise with depth along a
   declining airway and can colour the network by wet-bulb temperature.
7. I can save, reload, and export the model and results.
```

---

## Provenance and honesty flags

- Verified against the **official Ventsim DESIGN 5.4 User Guide (Howden)** you
  uploaded: staging (up to 24 stages, shared airways, no auto-resim on switch),
  the `P = R*Q^n` pressure law with an editable Atkinson coefficient (default 2,
  ~1 for laminar), the primary/secondary display-layer model, the 1.2 kg/m^3
  reference-density convention, and the airway-icon set (Appendix C).
- The manual **explicitly states** it is not an engineering text and contains
  simplifications, and it **does not publish Ventsim's internal solver** — so the
  prompt uses Hardy Cross as our own defensible choice and does not claim it is
  what Ventsim uses.
- Friction-factor `k` values are left as user-editable inputs on purpose; I did
  not embed empirical constants. Validate any value against McPherson's
  *Subsurface Ventilation and Environmental Engineering* (the text Ventsim itself
  cites) or another primary source.
- The prompt deliberately tells Claude to draw its own simple icons and avoid
  reproducing Howden's UI/artwork, to keep this an independent tool.
- Thermodynamic/psychrometric simulation is specified using the manual's verified
  heat data model (wet-bulb, dry-bulb, sigma heat, RH, VRT, sensible/latent heat,
  condensate, autocompression, evaporative cooling). I did NOT write any
  psychrometric formulas or constants into the prompt: it instructs Claude Code
  to source them from a named reference (McPherson / ASHRAE) or a vetted library
  and unit-test against known points, and to stop and ask if it cannot verify a
  formula. This is the highest-risk part to get subtly wrong, so treat its output
  as needing review against your own ventilation references before any
  occupational-hygiene use.
