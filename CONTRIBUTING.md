# Contributing

Thanks for your interest in the Mine Ventilation Network Simulator. This is a
small project; the notes below keep changes consistent and the physics honest.

## Getting set up

Requires **Node >= 20.17** (Vite/Vitest/TypeScript are pinned for this — see the
README; don't bump Vite past 6 without upgrading Node first).

```bash
git clone https://github.com/Rodneymondela/ventilation-simulator.git
cd ventilation-simulator
npm install
npm run dev          # dev server
npm test             # Vitest suite (run this before every PR)
npm run test:watch   # tests in watch mode
npm run lint         # ESLint
npm run build        # tsc -b + vite build (type-check + production build)
```

## Workflow

1. Branch off `master` (`git switch -c your-change`).
2. Make the change, with tests (see below).
3. Make sure **`npm run build`** and **`npm test`** both pass locally.
4. Open a pull request against `master`.
5. CI (`.github/workflows/ci.yml`) runs the type-check, build, and the full test
   suite. The **`test` check is required** and the branch must be up to date with
   `master` before it can merge. Force-pushes and deletions of `master` are
   blocked.

Keep PRs focused — one logical change per PR. Write a clear description of *what*
and *why*.

## Project layout

- `src/solver/` — **framework-independent** physics (Atkinson resistance, Hardy
  Cross solver, density/NVP, contaminant transport). **No React imports here.**
  This separation is deliberate: the physics is unit-tested in isolation and the
  UI can change without touching it. Please keep it that way.
- `src/model/` — data model (`types.ts`) and the demo network.
- `src/store/` — Zustand store (network pool, stages, undo/redo, autosave).
- `src/display/` — display variables, units, colour mapping, glyph/fan styling.
- `src/io/` — JSON/CSV import & export.
- `src/ui/` — React components (2D SVG `Canvas`, `View3D`, panels, toolbar).

## Testing

- Tests use **Vitest** and live next to the code as `*.test.ts`.
- Any change to solver behaviour needs a test. Prefer **hand-checkable** tests:
  set up a small network whose answer you can derive by hand and assert against
  it (see `src/solver/hardyCross.test.ts` and the parallel-airway + fan example
  in the README). A test that just locks in whatever the code currently prints is
  much weaker.
- The whole suite must stay green.
- The 2D/3D UI has no automated browser tests here; if you change rendering,
  verify it by eye in `npm run dev` and describe what you checked in the PR.

## The honesty rule (important)

This tool models real engineering, so accuracy is a hard requirement, not a nicety:

- The equation **forms** (Atkinson `R = kOL/A³`, square law `p = RQ|Q|`, Hardy
  Cross) are standard. Keep them correct.
- The empirical **constants** — Atkinson friction factor `k`, air density, flow
  exponent — are uncertain and must remain **editable inputs with placeholder
  defaults that are clearly flagged to verify against a primary source** (e.g.
  McPherson, *Subsurface Ventilation Engineering*). Do not hardcode an unverified
  number and present it as fact.
- Approximate layers (contaminant transport, etc.) must say so and must not be
  described as validated occupational-exposure / safety tools.
- If you're unsure whether something is physically right, say so in the PR rather
  than letting it read as settled.

## Code style

- TypeScript throughout; match the surrounding code's naming, structure, and
  comment density. ESLint (`npm run lint`) should pass.
- Comment the *why* for non-obvious physics or numerics, not the obvious *what*.

## License

By contributing, you agree your contributions are licensed under the project's
[MIT License](./LICENSE).
