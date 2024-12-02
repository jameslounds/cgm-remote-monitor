# Nightscout Frontend

I've moved most of `cgm-remote-monitor/lib` into this directory, along with `bundle`, and put `views` in bundle with modification to remove the
templating and import the bundle etc. with `type=module`. I've also moved a lot of `static` too.

## To run

In 3 terminals (in the root of `nightscout/cgm-remote-monitor`), run:

- `npm run start` With the same env you usuaull ysue
- `cd frontend && npm run dev` Runs `vite` in dev mode
- `caddy run` Runs `caddy` to reverse proxy frontend/backend onto same port (`3000`)

## To run tests

- `npm run test` will run the tests and exit.
- `npm run test:watch` will rerun the tests as they change.

Dont forget to set your env!

## Aims

- Reduce build time for both hmr in development and building for production.
- Allow for incremental migration from `function init()`s to `class`es
- Get "go to definition" working as much as possible
- Use typescript wherever possible

In general, my aim is to migrate to a more modern tech stack to make it easier and more enjoyable to work on.