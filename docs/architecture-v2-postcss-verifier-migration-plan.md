# CSS verifier architecture and PostCSS migration

Status: parser/model/source-boundary implementation completed in PR #75. P2 rule-mapping/ratchet,
P3 behavior baselines, P4 plugin-independence canary, and P5 compatibility freeze are complete.
P6 (#112, merged; final candidate #341 passed) has retired the former stylesheet-link reordering plugin; the verifier now preserves
immutable history, the append-only migration ledger, frozen compatibility counts, and source/production
browser evidence without treating physical production link order as an oracle.

Final acceptance and ongoing maintenance: [Architecture v2 handoff](architecture-v2-final-handoff.md).

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
| `tests/lib/css/html-inputs.mjs` | Shared HTML scope policy, execution-input classification and historical stylesheet projection |
| `tests/lib/css/semantic-contract.mjs` | Independently pinned ordered-model addendum |
| `tests/lib/css/runtime-sources.mjs` | Fixed registry validation and architectural JavaScript ingress rules |
| `tests/lib/css/activation.mjs` | Page → script → import-graph activation model and its independently pinned addendum |
| `tests/lib/css/migration-contract.mjs` | Stable rule occurrences, append-only source→destination mappings, declaration partitioning and layer-conflict review |
| `tests/verify-css-debt.mjs` | Inventory, immutable history, PR-base migration ratchet, source stylesheet membership/order, P5 freeze and P6 retirement contract |
| `tests/verify-css-model.mjs` | Fast parser/model/ingress regression fixtures |
| `tests/verify-css-migration-contract.mjs` | 1→N split, relayer, duplicate occurrence, conflict and ratchet adversarial fixtures |
| `tests/verify-css-html-browser.mjs` | Independent browser check of script-type execution, handler grammar and declarative-root activation |
| `tests/verify-math-rain-styles.mjs` | Actual browser activation, insertion order, repeat calls and CSSOM comparison |
| `tests/verify-css-live-activation.mjs` | Site-wide behavioral oracle: live activation of every page vs. its served HTML |

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
known CSSOM/HTML-parsing injection APIs and literal stylesheet markup fail architectural checks.

These checks are name-based, so they hold one invariant: **every name that can reach a
stylesheet, HTML-parsing or code-evaluation capability is statically visible where it is
used.** Earlier fixes rejected one hiding shape at a time (a computed key directly on bare
`document`); `globalThis.document['create' + 'Element']` then passed. The audit now rejects
each syntactic hiding *category*:

| Category | Rejected forms |
| --- | --- |
| Computed key on a host object | Any unresolved key on an expression that statically names a Window/Document/root element (`window`, `globalThis.document`, `document.body`, `x.ownerDocument`, `x.getRootNode()`, optional chains). Plain `window[name] = value` stays allowed. |
| Dynamic dispatch | An unresolved computed member used as callee, `new` target, template tag, or `call`/`apply`/`bind` receiver, on any object |
| Computed destructuring | `{ [key]: x } = …`; destructuring any capability name |
| Scope objects | `with`; bare capability names in event-handler attributes, whose scope chain includes the element, form and document (browser-confirmed) |
| Strings as code / names | `eval`, `Function`, `.constructor`, `Reflect`, string timers, `javascript:` URL strings, non-literal `import()` |
| Activating elements | Runtime `style`, `link`, `script`, `iframe`, `frame`, `object`, `embed`, `base`, `meta` |

All of these use one capability table, checked the same way at every position a name can
occupy. A property name (`window.eval`, `{ eval: run } = window`) may be on the window or a
document, so it is checked against every capability. A bare identifier is checked against the
global bindings, and inside event handlers against every document member. Timers are checked
by call-site name, so renaming them by destructuring is rejected. Earlier, member access,
identifiers and destructuring each had their own partial list, and `window.eval(...)` passed.

Timers are the one string-to-code capability that stays allowed, so they get exactly one
reviewed shape, like element factories: a direct call whose first argument is syntactically
a function value (function/arrow expression, identifier, member, or the reviewed `f.bind(…)`
call; any other call such as `String('…')` may return the code string). Any
other use of the name fails: `call`/`apply`/`bind` on the timer, passing it (`list.forEach(setTimeout)`),
storing it, renaming it, or a spread or non-function argument. The audit does not try to
recognize the indirect call shapes one by one.

Value-preserving wrappers are defined once (`passesValue`/`valueSources`): sequence (last
operand), conditional branches, logical operands, `=`/logical assignment, `await`, optional
chains. Host detection, invocation and timer checks all see through them, so `(0, document)[k]`,
`(c ? document : window)[k]`, `(0, registry[k])(…)` and `(0, setTimeout)('…')` are the same as
their unwrapped forms. Binding a value to a variable is still aliasing and out of scope.

A runtime `<script>` is accepted only as a locally proven inert data block (the existing
JSON-LD sites): `const x = createElement('script')`, immediately `x.type = '<non-JS type>'`,
then only `x.textContent = …` and `parent.append(x)` statements in the same statement list.
Any other reference to the binding fails. This is a check of one binding's uses, not inference.

Production code now follows the invariant: Carrot Pull's SVG fallback uses a `switch` of
literal `createElementNS` calls, and Math Rain's unused `SoundManager.play(name)` alias
dispatches its seven dedicated sounds explicitly instead of calling `this[methodName]`.
Ordinary data lookups such as `window.LANGUAGES[lang]` or `grid[y][x]` are unaffected.

The existing HTML scaffold renderer is a documented exception: it emits a complete document
for `new-game.mjs`, rather than installing a stylesheet. Its entire source is independently
pinned. Changing that template requires an explicit review. This exception does not permit
new runtime style factories.

## HTML activation and execution boundary

The next review found three omissions with one cause: HTML parsing was shared, but
activation/execution classification still relied on incomplete assumptions in its consumers.
Skipping every template missed declarative Shadow DOM; auditing only script elements missed
event attributes; an exact three-value script-type list missed browser-valid JavaScript types.

`html-inputs.mjs` now owns the supported HTML boundary for every consumer:

| Input | Contract |
| --- | --- |
| Ordinary template contents and scripting-enabled noscript contents | Inert; not inventoried as live DOM |
| Any active template carrying `shadowrootmode` | Rejected until scoped CSS identities and cascade rules are modeled; includes invalid/empty modes conservatively |
| Embedded documents (`iframe`, `frame`, `object`, `embed`) | Rejected until nested-document inputs are modeled, including `srcdoc`/data documents |
| Foreign-namespace script/style/link elements | Rejected until their distinct source semantics are modeled |
| Classic inline scripts | All 16 JavaScript MIME essence strings, ASCII case/whitespace rules, and legacy language fallback; Script grammar |
| Module inline scripts | Module grammar; type classification follows the standard conservatively |
| Unnamespaced `on*` attributes | Parser-decoded values, FunctionBody grammar; audit every event name conservatively |
| Executable script `src` | Resolve against the document URL (`<base href>` is rejected); must belong to the audited local JS inventory |
| `javascript:` URL attributes | Rejected explicitly after URL parsing (including control-character/case variants) |
| Import maps and speculation rules | Rejected until script resolution/loading effects have a reviewed contract |
| `<meta http-equiv>` pragmas (CSP, `default-style`, `content-type`, `refresh`, …) | Rejected until modeled: they decide whether/which stylesheets and scripts activate or how they decode, without changing any stylesheet input (browser-confirmed for CSP) |
| `<meta charset>`, `viewport`, `color-scheme` | Recorded per page in the activation addendum: linked-CSS decoding fallback, media-query viewport, used color scheme. A charset declaration counts only if it ends within the first 1024 bytes, so that prescan validity is recorded too |
| `<base href>` | Rejected: a base applies only from the moment the parser inserts it, so earlier script/link URLs resolve against the document URL. A finished DOM cannot reproduce that order. Without it every URL resolves exactly against the document URL |
| Event handlers on `link`/`style`/`script`/`meta` | Rejected: `this` is the element itself, so a handler can rewrite its `rel`/`media`/`disabled`/`src`/`content` with no capability name (e.g. the `preload` + `onload="this.rel='stylesheet'"` idiom, browser-confirmed) |
| Every `<link>`, any `rel` | Recorded per page in the activation addendum: any link can become a stylesheet by changing `rel`, so adding or changing a non-stylesheet link is a reviewed delta |
| Non-executable script data blocks | Remain data; e.g. JSON-LD is not parsed as JavaScript |

The runtime audit consumes this inventory rather than rediscovering HTML execution rules.
Traversal includes implied DOM elements: HTML recovery can merge a late body token's event
or style attributes into an implied body without a source location. Offsets are diagnostics,
not a filter for active inputs; both the static model and execution inventory see these nodes.
The event-handler parser supplies function context and checks that input cannot escape its
wrapper. Classic scripts retain their non-module grammar (legacy HTML comments parse; `with`
parses and is then rejected by policy); module-only syntax in a classic script fails. Parse
errors fail the audit.

Type classification follows the [HTML preparation algorithm](https://html.spec.whatwg.org/multipage/scripting.html#prepare-the-script-element)
and [JavaScript MIME essence list](https://mimesniff.spec.whatwg.org/#javascript-mime-type).
An HTML type value with MIME parameters is not an essence-string match. Event attributes use
the [FunctionBody contract](https://html.spec.whatwg.org/multipage/webappapis.html#event-handler-content-attributes).
Browser versions may lag standard changes; the audit conservatively includes case variants
of module types even where an engine does not yet execute them.

Fast fixtures exercise all of these boundaries through the same production audit functions,
including each of the three reported bypasses. The browser fixture independently confirms
execution of the MIME aliases/case variants, classic/module behavior, `return`/`with` in a
handler, actual handler-created stylesheet activation, and style/link activation in both
open and closed declarative roots. The supported project pages still match every immutable
P0 observation. New HTML mechanisms must extend this shared contract; omission is not support.

## Page activation

A runtime stylesheet source affects a page's cascade only on pages that execute its
installer. The previous model recorded *where* sources are defined but not *which pages run
them*, so adding `<script type="module" src="src/games/math-rain/mobile-adapter.js">` to
another page changed that page's cascade while every snapshot still matched.

`activation.mjs` makes activation part of the model. For each page it records the document
directives above, then builds the executed
graph from the shared HTML execution inventory: external scripts (resolved repository file,
grammar, normalized activation attributes such as `type`/`defer`/`async`), inline scripts
(grammar, attributes, import edges), and handler import edges, followed through static
imports, re-exports and literal `import()`. The graph is closed over the audited local
inventory: bare, remote, `data:` or non-JS specifiers and non-literal `import()` fail. The
build-time HTML scaffold (exempt from the ingress audit) must not be reachable from a page.

A page that reaches `install-style.js` can activate every registered source, because the
installer accepts any key; no caller-key inference is attempted. The per-page result is
`tests/css-activation-p0-baseline.json`, pinned by SHA-256 in code like the ordered-model
addendum. Page HTML is byte-identical to the base commit; only `math-rain.html` activates
the five sources, as before the registry. Adding, moving or reordering an executable script,
or an import edge that reaches the installer, or changing a recorded directive needs an
explicit P2 mapping. HTML-derived values use HTML's own ASCII whitespace definition (`htmlTokens`,
`isStylesheetLink`, attribute/directive normalization in `html-inputs.mjs`). JavaScript `\s`
would also fold NBSP, which HTML keeps as data: a viewport or inline style differing only by
NBSP would then fingerprint identically. The four separate `rel` checks are now one shared
classifier. It follows the spec, splitting on all ASCII whitespace. Chromium splits only on
space/newline, so the classifier is a fail-closed superset: the browser oracle checks that it
never misses a browser-active link. Selector-matched DOM state (`class`, `lang`, `dir` attributes) is not a
stylesheet input and stays outside this model.

## Behavioral oracle for existing-element mutation

The syntax boundary rejects every way to *create* a stylesheet, document or script. It cannot
decide which element a generic write targets: `el.rel = …`, `el.media = …` and
`meta.setAttribute('content', …)` use names that production code legitimately writes on other
elements (it updates the canonical `href` and og/theme-color `content`). Rejecting those names
would be wrong, and resolving the target is data flow. `verify-css-live-activation.mjs`
therefore checks the behavior directly on every page, at a desktop and a mobile/low-end
profile:

- From before the first byte is parsed, a `MutationObserver` records every insertion, removal
  and attribute write on `link`/`style`/`script`/`meta`/`base` (subtrees included, deduplicated
  by element). `attachShadow` calls are counted.
- After load, the live elements are compared with the page's own served HTML (parsed in the
  page, so the same check runs on source and on `dist`). Each element has an activation
  identity: link rel/media/disabled, style key/media/content hash, script type/src, meta
  name/pragma/charset.
- Violations are any undeclared insertion or live input, any removal, any attribute write that
  can change activation, a runtime-disabled sheet, adopted sheets, shadow roots, or a document
  encoding that differs from the declared one. Allowed writes are `data-*`, `href` on links
  that fetch nothing (canonical/icon/manifest) and `content` on non-directive metas. Allowed
  insertions are registered sources on pages that reach the installer, inert JSON-LD and the
  build's `modulepreload` links.

Injected probes (canonical link switched to a stylesheet, viewport rewritten, sheet disabled,
link removed, `innerHTML` stylesheet assembled from string pieces, icon media changed) each
fail it. It covers load-time behavior, not every interaction path; `verify-math-rain-styles`
covers the installer's interaction paths.

**Boundary of the guarantee:** these are architectural syntax checks, not a proof about
arbitrary JavaScript data flow (a capability aliased through a variable) or every possible
HTML-string construction. Do not extend
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
CHROME_BIN=/absolute/path/to/chrome node tests/verify-css-html-browser.mjs
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

## P2 rule mapping foundation and remaining stop conditions

The verifier no longer treats a P0 fingerprint change as migration authority. Rule migrations
are append-only records compared against the pull request base (the Architecture workflow
checks out full history and provides `ARCHITECTURE_BASE_SHA`). A normal mapping contains a stable
source occurrence, one or more destinations in the same stylesheet, the source declaration
snapshot, and explicit normal/important conflict reviews. W3 adds a narrowly scoped `dedupe`
mapping for exact cross-file duplicate families: it lists every source occurrence and one
explicitly new or reused shared destination.

The contract now provides:

1. Stable occurrence identity from canonical context-token digest + selector-token digest +
   source layer + canonical declaration digest + duplicate occurrence number. Human-readable
   legacy context/selector strings and source offsets are diagnostic only; they are not identity.
2. Lossless 1→1 or 1→N declaration partitioning is reconstructed from the current AST;
   destination arrays are an unordered declaration of ownership, never source-order authority.
   Each historical source occurrence and each current destination occurrence has exactly one
   migration owner. Declarations whose CSS write sets overlap cannot be split across layers,
   and same-layer physical order must preserve their cascade. This includes shorthand/longhand
   pairs, `all`, logical/physical aliases and duplicate properties. The write-set model is
   backed by pinned `mdn-data` shorthand metadata and explicit logical/physical equivalence
   rules; unknown non-custom properties fail closed. Selector/context rewrites and arbitrary
   cross-stylesheet moves are outside P2 and fail. The reviewed `dedupe` form is the only
   cross-file exception, and it requires identical context/declarations plus an explicit
   destination mode.
3. Relayering of existing layered rules as well as unlayered-debt reduction, so
   `science-showcase.css` can move from `components` to `showcase` without pretending it
   was unlayered P0 debt.
4. A one-way state ratchet with explicit lineage: mappings already present in the PR base
   cannot be deleted or edited, but they are historical ledger entries rather than permanent
   head-state assertions. Later work appends a new id whose source may be a terminal destination
   present in the comparison base; that new transaction consumes the old destination while the
   historical mapping remains unchanged.
5. Exact-selector conflicts use the same property write-set overlap model, rather than literal
   property-name equality. The verifier reconstructs each peer's current physical occurrence
   and requires the pre/post cascade precedence relation to remain unchanged; this covers new
   mappings against co-migrated, previously migrated and still-unlayered peers. Normal and
   important reviews remain separate because layer precedence reverses under `!important`.
   Different-selector overlap still belongs to browser/geometry evidence. A dedupe mapping that
   changes selectors must additionally carry per-source adoption evidence checked against every
   stylesheet consumer and its HTML anchor.
6. The lowest `reset` layer is policy-constrained, not merely an allowed layer name. A mapping
   targeting `reset` must be a top-level reviewed universal selector (`*` or
   `*, *::before, *::after`) and contain only normal declarations; the whole mapped rule stays
   in `reset`. A dedupe target may also be the explicit scoped selector `.game-reset, .game-reset *`,
   but then every source stylesheet consumer must provide root-class adoption evidence. This
   applies to every source and the destination of a `dedupe` mapping as well. Negative fixtures
   reject non-universal, conditional/nested and `!important` reset mappings so reduced-motion/
   accessibility rules cannot accidentally gain reversed important-layer precedence.
7. Residual base→head comparison for every mapped stylesheet. Registering one rule does not
   exempt unrelated rules in that file from semantic verification. In addition to ordinary
   rules, canonical keyframe bodies and every non-`@layer` at-rule retain parent context,
   effective layer, tokenized params and (for declaration-style at-rules such as
   `@font-face`, `@property`, `@page` and `@view-transition`) descriptor declarations.
8. Immutable P0 and semantic addenda remain unchanged. Only files proven by the migration
   contract may bypass their old whole-file semantic digest for that PR.

Production P2 still requires:

1. Continue with dependency-closed production slices after the initial `.game-stage--fill`
   `layout` canary and canonical eight-layer order (`reset, tokens, showcase, components, accessibility, layout, pages, contracts`) declaration. Low-risk `layout` defaults may
   move independently after evidence; a `contracts` rule must
   move together with any still-unlayered page peers that could compete with it, because normal
   unlayered declarations outrank every named layer.
2. Source and production geometry/interaction evidence for every migration batch.
3. Continued independent debt/mapping/browser acceptance; one passing gate never substitutes
   for the others.
4. P4 required plugin-on/plugin-off equivalence before removing `shared-css-first`; P6 now locks the plugin and temporary canary plumbing out of the active build.
5. Separate contracts before keyframe or runtime-style migrations; both remain rejected by the
   current migration state.

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

Follow-up HTML boundary verification (2026-10-04): the expanded fast regression fixtures,
full source/runtime/HTML P0 guard, standalone browser oracle and repository lint passed.
This follow-up changes verifier/test/documentation code only; P0 artifacts and production
sources remain unchanged. It does not require a new cascade baseline.

Follow-up ingress/activation verification (2026-10-04): two review findings (a computed key
reached through `globalThis.document`, and a page newly loading a style-installing module)
shared the same causes. The ingress audit could hide a name in syntax, and the model omitted
page activation. Both are now handled by category, as described above. New fast fixtures
cover every listed form. Re-running them against the previous audit confirmed that it missed
each one. The browser oracle confirms that bare document members resolve in event-handler
scope. The P0 static/runtime/semantic artifacts are unchanged; the activation addendum is
new and separately pinned.

Document-directive follow-up (2026-10-04): a review found that a static CSP pragma could
disable every stylesheet without changing any inventory. The same gap covered all document-level
directives. Pragmas are now rejected in the shared HTML boundary, so every consumer (static
scan, ordered model, execution audit, activation) fails on them. The encoding, viewport and
color-scheme directives in use are pinned per page. The browser oracle confirms that the CSP
pragma decides stylesheet activation.
