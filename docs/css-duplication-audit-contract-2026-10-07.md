# CSS Duplication Audit & Contract — PR #115

## Purpose

PR #115 changes the unit of CSS cleanup from selector-by-selector migration to **component-family evidence**. It does not perform a broad CSS rewrite. The first deliverable is a complete, reproducible classification of the repository's 2,912 static ordinary CSS rules using the same PostCSS-based parser already used by the Architecture v2 CSS contract.

Every ordinary rule is assigned to exactly one class:

1. **Exact duplicate** — the rule has the same normalized semantic selector family, at-rule/layer context and ordered declaration list in at least one other CSS file. Game prefixes such as `bf-`, `cp-`, `td-` are normalized to a `game-` namespace only for cross-file comparison; the production selectors are not changed.
2. **Structural duplicate** — the selector family and context match, all non-theme declarations match, but theme payload differs. The audit treats palette/background/border/shadow/filter/radius/opacity and custom-property values as parameterizable evidence. This is a review candidate, not an automatic rewrite instruction.
3. **Intentional local** — stage/canvas/board/overlay rules, their responsive contracts, page theme surfaces, and every rule without a proven cross-file family remain page-owned.

The structural classifier is deliberately conservative. Literal geometry and typography differences such as `width`, `height`, `padding`, `gap`, positioning and font metrics are **not** erased to manufacture a match. If a later family review decides one of those values is genuinely a theme parameter, that decision belongs in the extraction PR together with its browser/geometry evidence.

## Machine-reproducible contract

The implementation lives in `tests/lib/css/duplication-audit.mjs`; `tests/verify-css-duplication.mjs` is auto-discovered by the normal verification suite. It uses `parseCssText()`, which is backed by PostCSS and the existing CSS-token canonicalization layer.

Run:

```sh
node tests/verify-css-duplication.mjs
node tests/verify-css-duplication.mjs --markdown
node tests/verify-css-duplication.mjs --json
```

The default output prints the global classification summary and the highest-return exact/structural families. `--json` emits the full 2,912-rule inventory, including stable rule ids, source selector, semantic family, page impact, class and family id. The full inventory is generated rather than committed so this audit does not add another multi-thousand-line snapshot file.

`tests/css-duplication-audit-contract.json` freezes the taxonomy, parser engine and the upstream 2,912-rule population. Once this PR's observed counts and membership digest are captured, they are pinned there so future CSS work cannot silently move rules between classes. The `baseline` field is intentionally temporary only while collecting the first audit; it must be non-null before #115 is mergeable.

## Hard boundaries

This PR must not use duplicate counts as a target metric and must not change production CSS merely to improve the numbers. In particular:

- stage, canvas, board, scene/world/playfield and page-owned overlay rules stay local by default;
- responsive shell/stage/canvas/overlay contracts stay local unless a later family review proves a shared invariant;
- unique visual materials, game-specific breakpoints and theme surfaces stay local;
- exact duplicate is a strong extraction candidate, but still needs DOM/activation and cascade review before moving;
- structural duplicate always requires an explicit component-family design, variables/modifiers for differences, and focused browser regression evidence.

## Next-step decision rule

After the audit is pinned, rank families by **cross-page impact and removable declaration copies**, not by raw selector count. A follow-up PR should select one complete family, state the affected pages and expected reduction, then extract it atomically. If the audit shows little benefit outside a few families, CSS cleanup stops there rather than trying to drive the remaining local-rule count toward zero.
