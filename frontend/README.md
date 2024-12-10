# Nightscout Frontend

I've moved most of `cgm-remote-monitor/lib` into this directory, along with `bundle`, and put `views` in bundle with modification to remove the
templating and import the bundle etc. with `type=module`. I've also moved a lot of `static` too.

## To run

In 3 terminals (in the root of `nightscout/cgm-remote-monitor`), run:

- `npm run start` With the same env you usuaull ysue
- `cd frontend && npm run dev` Runs `vite` in dev mode
- `caddy run` Runs `caddy` to reverse proxy frontend/backend onto same port (`3000`)

## To run tests
- `npm test`

## Aims
- [x] Reduce build time for both hmr in development and building for production (builds in 6s down from 15s).
- [x] Allow for incremental migration from `function init()`s to `class`es (First migration: [`lib/language.js`](https://github.com/jameslounds/cgm-remote-monitor/blob/feat/typescript-migration/frontend/lib/language.js))
- [ ] Get "go to definition" working as much as possible
- [ ] Use typescript wherever possible
- [ ] [Eventually] Use `vitest` instead of `mocha` - rewriting the tests is scary though

In general, my aim is to migrate to a more modern tech stack to make it easier and more enjoyable to work on.

## Fun bugs
In `jquery@3.6.0`, we can't use `:first` to get the first child of an selector. We have to use `$("<selector>:first-child")` or `$("<selector>").first()` instead.