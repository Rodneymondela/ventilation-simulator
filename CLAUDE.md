# CLAUDE.md — Mine Ventilation Network Simulator

Project-wide instructions for Claude Code. These rules persist across sessions and
override convenience. When in doubt, choose correctness over speed.

## What this project is
An independent, interactive mine ventilation network simulator (web app), familiar
to users of Ventsim DESIGN but NOT a clone. It does steady-state airflow, optional
coupled thermodynamic/psychrometric simulation, and optional contaminant transport.
The full build spec lives in `ventilation_simulator_claude_code_prompt.md` — read it
before starting work.

## Non-negotiable rules

### 1. Never invent physics constants or formulas
- Do NOT generate friction factors (k), air-density values, saturation-vapour-
  pressure, sigma-heat, enthalpy, or wet/dry-bulb conversion formulas from memory.
- Either use a vetted, currently-maintained library (and cite it in the README) or
  transcribe equations from a NAMED source: McPherson, *Subsurface Ventilation and
  Environmental Engineering* (the text Ventsim cites), or the ASHRAE psychrometric
  formulations. Cite chapter/equation in code comments.
- If you cannot verify a formula or constant against a named source, STOP and ask.
  Do not approximate. Wrong climate/exposure numbers are worse than no numbers.

### 2. Test before you trust — never claim something works without running it
- Airflow: before any UI, unit-test the two-parallel-airways-with-one-fan case
  against a hand calculation (flow splits inversely with sqrt of resistance ratio;
  flow conserved at every node). Print expected vs computed.
- Psychrometrics: before wiring heat into the network, unit-test the psychrometric
  core against known reference points (dry-bulb + wet-bulb -> RH and sigma heat at a
  stated barometric pressure). Print expected vs computed.
- Run the suite after every stage and report pass/fail honestly.

### 3. Build order (do not advance until the current stage runs)
1. Data model + resistance maths
2. Network solver + unit tests  ← gate: parallel-airway test passes
3. Minimal UI wired to the solver
4. Display layers (primary/secondary) + units
5. Staging + export
6. DXF import (centrelines -> airways + reference graphics)  ← gate: connectivity/snapping test passes
7. Thermodynamic/psychrometric simulation  ← gate: psychrometric test passes
8. Optional contaminant layer

### 4. Keep concerns separated
- The solver(s) live in their own framework-independent, unit-tested module(s).
  The UI must be swappable without touching physics.

### 5. Independence from Ventsim
- Use familiar terminology, but draw our own simple icons and UI. Do NOT reproduce
  Howden's artwork, exact UI, or any proprietary algorithm. The Ventsim internal
  solver is not published — our solver (Hardy Cross baseline) is our own choice and
  must not be described as "what Ventsim does."

### 6. DXF import must not silently corrupt the network
- Use a maintained DXF-parsing library (cite it); do not hand-roll a parser.
- Default centreline import to REFERENCE-ONLY; converting to airways is an
  explicit user action. Snap coincident endpoints within a user-set tolerance,
  and never auto-join lines that merely cross in 2D. Always report counts of
  nodes/airways created and endpoints snapped so connectivity can be checked.
- Only claim DWG/DGN/Surpac/Datamine support if the chosen library truly provides
  it. DXF is the committed format.

## Core physics reference (forms only — source the constants)
- Atkinson resistance:  R = (k * O * L) / A^3
- Pressure law:         P = R * Q^n   (n defaults to 2 turbulent; ~1 laminar, per air type)
- Density convention:   standardise k/R to a reference density (default 1.2 kg/m^3,
                        user-editable), adjust to local density during simulation.
- Network laws:         flow continuity at nodes + pressure balance around meshes.
- VRT:                  from user geothermal gradient + elevation + surface rock temp.
- Autocompression:      derive from the cited source's thermodynamic relations; the
                        ~10 deg C dry-bulb / 1000 m figure is a sanity check only.

## Honesty
If a requirement is ambiguous, ask rather than assume. If a chosen library's accuracy
or maintenance status is uncertain, say so. Flag anything you are not confident is
correct rather than presenting it as fact.
