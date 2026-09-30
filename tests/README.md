# Test layout

Tests are auto-discovered by `tests/verify-all.mjs`.

- `verify-*.mjs`: contracts, static checks, and focused runtime checks.
- `smoke-*.mjs`: end-to-end playable paths.
- `tests/lib/`: shared browser, registry, filtering, and game-test helpers.

A test is considered browser/server-backed when it imports `puppeteer-core` or
`./lib/browser.mjs`. Cross-page tests import `./lib/page-filter.mjs`.
Game ownership is inferred from the filename using `games.config.json`, so adding
a new test no longer requires editing a central suite array.
