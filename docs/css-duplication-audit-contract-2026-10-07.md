# CSS Duplication Audit & Contract — PR #115

## Purpose

PR #115 changes the unit of CSS cleanup from selector-by-selector migration to **component-family evidence**. It does not perform a broad CSS rewrite. The first deliverable is a complete, reproducible classification of the repository's 2,912 static ordinary CSS rules using the same PostCSS-based parser already used by the Architecture v2 CSS contract.

Every ordinary rule is assigned to exactly one class:

1. **Exact duplicate** — the rule has the same normalized semantic selector family, at-rule/layer context and ordered declaration list in at least one other CSS file. Game prefixes such as `bf-`, `cp-`, `td-` are normalized to a `game-` namespace only for cross-file comparison; the production selectors are not changed.
2. **Structural duplicate** — the selector family and context match, all non-theme declarations match, but theme payload differs. The audit treats palette/background/border/shadow/filter/radius/opacity and custom-property values as parameterizable evidence. This is a review candidate, not an automatic rewrite instruction.
3. **Intentional local** — stage/canvas/board/overlay rules, their responsive contracts, page theme surfaces, and every rule without a proven cross-file family remain page-owned.

The structural classifier is deliberately conservative. Literal layout geometry and typography differences such as `width`, `height`, `padding`, `gap`, positioning and font metrics are **not** erased to manufacture a match. Geometry-bearing `outline` and `stroke-width` values also remain significant. Decorative border/radius values may still be treated as theme evidence, but any extraction based on them requires browser/geometry review.

Structural evidence is built from the complete non-local family before the three classes are assigned. Exact matches have final classification precedence, but they still participate in the structural-family evidence. This matters for mixed families such as “two exact copies plus one themed variant”: the themed variant remains discoverable instead of falling through to intentional-local.

## Reviewed baseline

The first reviewed audit on the post-#114 tree is pinned in `tests/css-duplication-audit-contract.json`:

| Class | Rules | Families |
| --- | ---: | ---: |
| Exact duplicate | 638 | 115 |
| Structural duplicate | 94 | 28 |
| Intentional local | 2,180 | — |
| **Total** | **2,912** | — |

Classification membership digest:

`f25f5a147d2bb31547381bd47a2e0d6d4cee8ec04fa52fe983fe1adef564a5e3`

The strongest exact evidence is concentrated in reusable UI rather than game stages: leaderboard name/row/list/rank/status families, universal reset, side rows, button rows, username rows, level grids and start-menu typography. The strongest structural families include username input, buttons, leaderboard containers/rank/status, chips and mode buttons. This is the intended signal: component families are candidates; gameplay geometry remains predominantly local.

A structural family may contain members whose final exclusive class is exact duplicate. Family membership describes the full extraction boundary; the 638/94/2,180 rule counts remain mutually exclusive. Therefore exact and structural “potential removal” figures must not be summed as independent totals.

## Machine-reproducible contract

The implementation lives in `tests/lib/css/duplication-audit.mjs`; `tests/verify-css-duplication.mjs` is auto-discovered by the normal verification suite. It uses `parseCssText()`, which is backed by PostCSS and the existing CSS-token canonicalization layer.

Run:

```sh
node tests/verify-css-duplication.mjs
node tests/verify-css-duplication.mjs --markdown
node tests/verify-css-duplication.mjs --json
```

The default output prints the global classification summary and the highest-return exact/structural families. `--json` emits the full 2,912-rule inventory, including stable rule ids, source selector, semantic family, page impact, class and family id. The full inventory is generated rather than committed so this audit does not add another multi-thousand-line snapshot file.

The committed baseline is mandatory. Counts, family counts and the membership digest are all verified; setting `baseline` to `null` is itself a CI failure. Future family extraction must update the baseline only as part of an explicitly reviewed CSS transaction.

### W3 hidden-state scope review (PR #122, 2026-10-09)

The W3 dedupe changes the *one* shared `css/layout.css` selector from `.hidden` to
`html.game-hidden-contract .hidden`, while retaining `display: none !important` in
`@layer contracts`. The scoped selector affects only the 20 former source stylesheet
consumers that explicitly opt in on their document root; unrelated layout consumers such as
Math Rain keep their distinct opacity/visibility transition behavior. Current CSS differs
from the preceding PR head only in that reviewed rule and its explanatory comment.

The Architecture v2 run for `b07866f` computed the following audit result:

- **Static ordinary rules:** 2,651 (unchanged)
- **Classification counts:** exact 408, structural 65, intentional-local 2,178 (unchanged)
- **Families:** 97 exact and 19 structural (unchanged)
- **Classification digest:** `64a13b0c768bc16eeb3f6d2aef8989aaabf57d98434bf7741d7110185e193a9f` → `cdc787170a5f3afd633e56f532741fd0560899f66d1adcfdb32917cc6c97665e`

This is a single intentional selector-identity change, not a new extraction or a changed
classification policy. The pinned membership digest has been advanced to the observed value;
`verify-css-duplication` still checks all original metrics and the full digest. CSS migration,
Math Rain style/smoke, and the new computed-style hidden-contract browser regressions also
passed in that run. Do not edit immutable P0/P5 evidence or disable the membership assertion.

A follow-up review anchored the scoped reset to the document root:
`.game-reset, .game-reset *` → `html.game-reset, html.game-reset *` in `@layer reset`.
Every opted-in page already carries `game-reset` on `<html>` only, so matched elements are
unchanged; the change only stops a descendant `game-reset` class from activating the reset
for its subtree. Declarations and layer are unchanged.

- **Static ordinary rules / classification counts / families:** unchanged (2,651; 408/65/2,178; 97/19)
- **Classification digest:** `cdc787170a5f3afd633e56f532741fd0560899f66d1adcfdb32917cc6c97665e` → `e75532c2388ae2db7f5bd5a7c4382b4f3255e307d787ba46c884ee51b02a9b02`


## Hard boundaries

This PR must not use duplicate counts as a target metric and must not change production CSS merely to improve the numbers. In particular:

- stage, canvas, board, scene/world/playfield and page-owned overlay rules stay local by default;
- responsive shell/stage/canvas/overlay contracts stay local unless a later family review proves a shared invariant;
- unique visual materials, game-specific breakpoints and theme surfaces stay local;
- exact duplicate is a strong extraction candidate, but still needs DOM/activation and cascade review before moving;
- structural duplicate always requires an explicit component-family design, variables/modifiers for differences, and focused browser regression evidence.

## Next-step decision rule

After the audit is pinned, rank families by **cross-page impact and removable declaration copies**, not by raw selector count. A follow-up PR should select one complete family, state the affected pages and expected reduction, then extract it atomically. If the audit shows little benefit outside a few families, CSS cleanup stops there rather than trying to drive the remaining local-rule count toward zero.

The first family-sized follow-up should be the **leaderboard surface** rather than one selector: review `lb`, `lb-name`, `lb-row`, `lb-list`, `lb-rank`, `lb-status`, username row/label/input and their responsive states as one dependency-closed component family.
