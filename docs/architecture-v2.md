# Architecture v2

The repository is now split into four explicit domains:

- `src/platform/`: shared runtime capabilities (settings, chrome, frame, drawer, audio, storage, i18n).
- `src/games/`: game-specific modules extracted from large entrypoints and the home for all new games.
- `src/generated/`: generated runtime caches; never edit by hand.
- `worker/`: Cloudflare Worker entrypoint, separate from browser source.
- `tests/`: auto-discovered contract and end-to-end tests.
- `tools/`: scaffolding, asset tooling, and archived one-off migrations.

Legacy `js/*.js` shared-module paths are compatibility shims only. New code imports from
`src/platform` or stays inside its `src/games/<id>` package.

## New games

1. Add the game to `games.config.json`. New entries should point `entry` to
   `src/games/<id>/index.js`.
2. Run `npm run new:game -- <id>`.
3. Implement rules/rendering inside that game package.
4. Run `npm run gen` and `npm run verify:changed`.

The scaffold uses the standard shell, GameRuntime, versioned platform services, and declarative
i18n bindings. It deliberately keeps game rules out of platform code.
