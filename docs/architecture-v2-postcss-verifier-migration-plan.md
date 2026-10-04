# CSS verifier architecture and PostCSS migration

Status: parser/model/source-boundary implementation completed in the PR #75 follow-up;
production cascade-layer migration (P2+) remains blocked pending its own rule mapping.

## Why the verifier needed a redesign

The old verifier mixed CSS tokenization, HTML extraction, JavaScript source inference,
historical identities and migration policy in one file. Repeated fixes to escapes,
comments, at-rules and aliases could not make that model a complete browser emulator.
In particular:

- whitespace normalization merged different quoted selectors/values;
- multisets of selectors omitted source order and per-rule layer placement;
- JavaScript variable-name matching missed aliases and computed element names;
- a passing debt count was being used as evidence of cascade equivalence.

The revised contract separates syntax, observations, allowed changes and browser behavior.

## Modules and responsibilities

| Module | Responsibility |
| --- | --- |
| `tests/lib/css/model.mjs` | PostCSS tree parsing and CSS Syntax tokens; ordered canonical model |
| `tests/lib/css/baseline-adapter.mjs` | Project syntax policy and compatibility projection into historical P0 tuples |
| `tests/lib/css/html-inputs.mjs` | parse5 document traversal, active stylesheet inputs and historical HTML projection |
| `tests/lib/css/semantic-contract.mjs` | Independently pinned ordered-model addendum |
| `tests/lib/css/runtime-sources.mjs` | Fixed registry validation and architectural JavaScript ingress rules |
| `tests/verify-css-debt.mjs` | Inventory, immutable history, migration gates and built stylesheet ordering |
| `tests/verify-css-model.mjs` | Fast parser/model/ingress regression fixtures |
| `tests/verify-math-rain-styles.mjs` | Actual browser activation, insertion order, repeat calls and CSSOM comparison |

PostCSS `8.5.28` and `@csstools/css-tokenizer` `4.0.1` are direct, exact development
dependencies. parse5 remains the HTML parser. No CSS transformation plugin is used.
The tokenizer handles escapes and priority identifiers, including forms PostCSS does
not mark as `Declaration.important`. We do not implement another declaration scanner.

PostCSS does not accept all browser-valid syntax. Escaped at-keywords are explicitly
rejected at present; unsupported project constructs such as nested rules are rejected
by the compatibility policy. Rejection must never silently become omission. Extending
this supported subset requires parser fixtures and a policy review.

## Canonical model versus historical compatibility

The canonical model is an ordered tree of rules, at-rules and declarations. It preserves:

- full ancestor structure, layer statements/blocks and their relative positions;
- repeated selectors and repeated declarations in source order;
- keyframe bodies and declaration-bearing at-rule bodies;
- custom-property case;
- quoted string, URL and escaped-token spelling;
- declaration priority as token semantics.

Fragment normalization returns token arrays. It does not flatten them to text: even
`a/**/b` and `ab` must remain distinguishable. Whitespace tokens may be normalized;
whitespace inside a string is never collapsed. Source offsets are diagnostic information,
not persistent identity. PostCSS serialization/private AST JSON is not the contract.

The legacy adapter intentionally retains P0's old tuple formatting. It must not be used
as the new semantic identity. The independent `tests/css-semantic-p0-baseline.json`
addendum closes that gap with per-input digests of ordered canonical trees and HTML
activation inputs. Its digest is pinned in code, separately from mutable migration state.

The original static and runtime P0 files remain byte-for-byte unchanged. The new addendum
is derived from the unchanged CSS/HTML sources at `4b2257894dcc24b488a24de01037f50811805a26`
and the immutable runtime CSS strings. It extends the evidence; it does not rewrite history.
Until P2 adds explicit mappings, canonical content/order/layer changes are rejected.

## Runtime stylesheet boundary

The five existing Math Rain stylesheet strings now live in the frozen data-only
`src/games/math-rain/style-sources.js` registry. `install-style.js` is the only live
stylesheet factory. It accepts a registry key, returns no element, and installs synchronously
at the original call site. The three existing DOM ids and caller-side deduplication remain.
Low-end and mobile sources keep their original conditional activation and insertion order.
They are not prematurely loaded by a new global CSS link.

The audit reads the registry as AST data without executing it. Extra statements, computed
keys, executable values, missing/unknown/duplicate entries fail. CSS strings must still
match the immutable runtime P0 addendum exactly. Historical source ids remain historical
provenance, rather than being renamed to their new physical registry location.

The installer is small and independently fingerprinted. Outside it, direct stylesheet/link
creation, factory aliases, nonliteral element tags, stylesheet handles, constructed sheets,
known CSSOM injection APIs and literal stylesheet markup fail architectural checks. The
one variable SVG factory in Carrot Pull is replaced with a bounded table of literal tag
factories, so it cannot manufacture a stylesheet by accepting an arbitrary tag.

The existing HTML scaffold renderer is a documented exception: it emits a complete document
for `new-game.mjs`, rather than installing a stylesheet. Its entire source is independently
pinned. Changing that template requires an explicit review. This exception does not permit
new runtime style factories.

**Boundary of the guarantee:** these are architectural syntax checks, not a proof about
arbitrary JavaScript data flow or every possible HTML-string construction. Do not extend
them into another partial interpreter. Runtime inline element styles used for positions,
colors and animation are also outside the stylesheet-source P0 totals. Browser tests are
the independent check for exercised activation paths; they are not exhaustive execution
coverage of arbitrary future code. New dynamic rendering mechanisms require an explicit
source-contract review and relevant behavioral tests.

## Migration evidence and acceptance

Before switching authority, the new adapter was compared against the old parser from
`4b22578` over every static CSS file and the runtime P0 strings. Comparison included every
ordered rule, declaration, context, layer, at-rule and legacy observation field, not just totals:

| Inputs | Ordinary rules | Result |
| --- | ---: | --- |
| 31 static CSS files | 2,912 | exact legacy observation equivalence |
| 5 runtime sources | 15 | exact legacy observation equivalence |
| 27 HTML pages | 6 inline rules | exact historical HTML observation equivalence |
| Original static/runtime P0 files | — | unchanged |

The authoritative path is now PostCSS plus the canonical model. The handwritten parser has
been removed; its adversarial cases remain in the model tests. HTML fixtures cover comments,
templates, character references, quoted attributes, duplicate attributes and style media.
New fixtures cover source order, layer swaps, token-boundary collisions, quoted whitespace,
keyframe content, custom-property case, dynamic tag names and alias mutations.

Validation commands:

```sh
node tests/verify-css-model.mjs
node tests/verify-css-debt.mjs
npm run gen -- --check
node tools/checks/run-lint.mjs
npm run build
npm run verify -- --jobs=2
node tests/lib/run-smoke-dist.mjs tests/verify-math-rain-styles.mjs
```

The browser check exercises desktop/high-end and mobile/low-end startup, score/error/shop
popups, repeated calls and actual CSSOM parsed by the browser from immutable P0 strings.
Use the same test against source and production output. Complete local checks before one
combined push; do not trigger a full CI run for each fixture correction.

## Remaining P2 work and stop conditions

This replaces the earlier proposal to keep repairing the handwritten parser before four
separate parser-only PRs. Local shadow comparison preceded cutover; PR #75 now carries the
coherent parser/model/source-boundary correction. It does **not** claim P2 migration is done.

P2 still requires:

1. Stable rule-occurrence mapping, separate from ordered content fingerprints.
2. Explicit one-to-many mapping when a mixed-responsibility rule must split.
3. Verified source → destination layer mapping and irreversible debt reduction.
4. Separate normal/important cascade conflict analysis.
5. Source/production geometry and interaction evidence for each migration batch.
6. Plugin-on/plugin-off equivalence before removing `shared-css-first`.

Do not turn the new semantic addendum into a mutable expected-output file. Genuine historical
defects require a separately reviewed correction. Parser compatibility changes require
full-corpus and adversarial verification. A debt pass, a mapping pass and a browser behavior
pass are distinct results, and the release decision must retain that distinction.

## Local validation record (2026-10-04)

Browser installation recovery and execution-network lessons are recorded in
[browser-testing-environment.md](browser-testing-environment.md) for future sessions.

- Generator check, ESLint/Stylelint/token checks and production build passed.
- Exact old-parser observation parity passed for all 31 CSS files, five runtime sources
  and 27 HTML pages (2,927 ordinary CSS rules total, no unexplained delta).
- Original CSS/HTML and both original P0 snapshots remain unchanged.
- Parser/model/ingress fixtures and source/production Math Rain stylesheet tests passed.
- Full suite: 94 of 95 steps passed. The only failure was the existing Tetris drawer test's
  live analytics request returning `ERR_EMPTY_RESPONSE`; its layout/interaction assertions passed.
- A local diagnostic copy of that same test, fulfilling only the external telemetry endpoint
  with HTTP 204, passed all 158 assertions against production output. The diagnostic copy was
  removed and the committed Tetris test was not changed. This is not a claim that the unmodified
  full-suite run was green.
- Worker dry-run was blocked by automatic approval review and is not counted as validated.
