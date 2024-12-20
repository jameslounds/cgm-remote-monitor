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
- `npm test -- -f "<pattern>"` - run all tests with filenames or test names matching `<pattern>`
If you're looking at older commits than this, I might not have put all the correct packages into `package.json`. 
This may cause the tests to fail due to missing modules.
If so, just `cd .. && npm i && cd frontend` - node will use the parent dir's node_modules if they exist.

## Aims

- [x] Reduce build time for both hmr in development and building for production (builds in 6s down from 15s).
- [x] Allow for incremental migration from `function init()`s to `class`es (First migration: [`lib/language.js`](https://github.com/jameslounds/cgm-remote-monitor/blob/vite-migration/frontend/lib/language.js))
- [ ] Get "go to definition" working as much as possible
- [ ] Use ~typescript~ jsdoc types wherever possible
- [ ] Reduce the number of dependencies (WIP - as I'm migrating files to classes, I remove their lodash dependency when possible)
- [x] Get useful information from types (e.g. type errors when invalid translation keys are used)
- [ ] [Eventually] Use `vitest` instead of `mocha` - rewriting the tests is scary though

In general, my aim is to migrate to a more modern tech stack to make it easier and more enjoyable to work on.

## Fun bugs

In `jquery@3.6.0`, we can't use `:first` to get the first child of an selector. We have to use `$("<selector>:first-child")` or `$("<selector>").first()` instead.

## Potentially ["clever"](https://www.simplethread.com/dont-be-clever/) things

It's best not to be "clever" when writing code. It's more important to be clear than it is to be concise or elegant or whatever.
Below are some patterns which I think are really helpful, but could be (reasonably) construed as "clever".
I've tried to give a litle information on why I think these patterns are sufficiently useful (and standard) to not be "clever"

- I'm using `NaN` in some places where `undefined` was previously a possible return value (and the other possible return values are numbers)
  `NaN` has almost the same behaviour, `n < NaN === false && n > NaN === false` for all numbers `n` (including `NaN` itself, which _is_ different: `(undefined === undefined) === true`).
  This greatly reduces the number of `undefined` checks we need to do in order to keep typescript happy
- `Set`s are sometimes used where previously `array`s were. This is only in cases where the variable is not available or used as an instance property (so we don't change the type signatures of anything public). This is a vanilla js feature available only in pretty modern versions of browsers and node (>22) - at least for somee methods (e.g. `Set.difference`). Since this is frontend only, that doesn't matter since Vite will transpile it to something less modern browsers can understand (depending on the `target`).
- Typescript Template Literals - Similar to js's backtick template literals:

  ```ts
  const myVal = `hello ${otherVar}`;
  ```

  Typescript allows something similar in types. 
  For instance, if

  ```ts
  type StartsWithLevel = `LEVEL_${string}`;
  ```

  Then any string that starts with `LEVEL_` would be of this type. 
  
  Similarly, if [^1]

  ```ts
  type Key = `LEVEL_${"URGENT" | ... | "NONE"}`;
  ```

  Then `"LEVEL_URGENT"`, ..., `"LEVEL_NONE"` are all of type `Key`

  This is quite common in Typescript, but is a bit weird if you haven't seen it before.
  It's useful in the example given since it's a lot more concise than listing each key out individually. It's useful in a bunch of other circumstances too though, for instance, a function which takes an argument that must start with a `/` (``type FirstArg = `/${string}`;``).

  This also works the other way around. If we have a sufficiently strict type, say `"d" | "h" | "m"`, then we can use Javascript's template strings and get specific typescript types back out. For instance, in `utils.js`, we narrow the type of `ago.shortLabel`, and then use that narrowed type to ensure the string resulting from the template string will be a valid `TranslationKey` (since `"%1d ago"`, `"%1h ago"`, `"%1m ago"` are all valid translation keys).

  [^1]: [`types.d.ts`](./frontend/lib/types.d.ts)
