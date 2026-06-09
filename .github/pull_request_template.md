<!-- Keep PRs focused: one logical change. See CONTRIBUTING.md. -->

## What & why

<!-- What does this change do, and why? Link any related issue. -->

## How it was tested

<!-- Tests added/updated, and how you verified it. For solver changes, prefer a
hand-checkable test. For UI/rendering changes, say what you checked in `npm run dev`. -->

## Checklist

- [ ] `npm run build` passes (type-check + build)
- [ ] `npm test` passes (whole suite green)
- [ ] `npm run lint` passes
- [ ] Solver changes have a test (hand-checkable where possible); `src/solver/` stays free of React imports
- [ ] Any empirical constant (friction factor `k`, density, flow exponent) stays an editable input with a placeholder flagged to verify against a primary source — no unverified numbers presented as fact
- [ ] Approximate layers (e.g. contaminant transport) are not described as validated safety/exposure tools
- [ ] UI/rendering changes verified by eye (`npm run dev`), with a note above on what was checked
