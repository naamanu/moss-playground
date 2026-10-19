# Moss playground

A browser playground for [Moss](https://github.com/naamanu/moss), written in
Moss with [Rhizoid](https://github.com/naamanu/rhizoid).

Live at **https://naamanu.github.io/moss-playground-site/**.

- **Live type checking.** The Moss compiler runs in the page and recompiles
  on every edit (about one frame for the examples). Errors and warnings are
  listed under the editor; click one to jump to it.
- **Run.** The program runs in a preview frame. Plain programs print to the
  console; Rhizoid apps (`let main = start page`) render in the preview.
- **Examples:** hello, counter, search (async) and todo.
- **Share** puts the program in the URL (`#code=…`) and copies the link.

## Running it

It uses the Moss compiler and Rhizoid from checkouts next to this one:

```sh
git clone git@github.com:naamanu/moss.git ../moss && (cd ../moss && npm install)
git clone git@github.com:naamanu/rhizoid.git ../rhizoid && (cd ../rhizoid && npm install)
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm test
npm run deploy     # build and publish to GitHub Pages
```

## How it works

```
src/playground.moss   the UI (a Rhizoid app)
src/api.moss          externals: compile, run, console_lines, examples, share, focus_at
runtime/index.ts      their implementation
scripts/build-runtimes.mjs
examples/             the example programs
```

- `Api.compile` calls the Moss compiler (`mosslang/compiler`) with an
  in-memory loader serving Rhizoid's modules, so `open Rhizoid` works without
  a filesystem. Externals are checked against Rhizoid's runtime as usual.
- `Api.run` loads the compiled program into a sandboxed iframe
  (`sandbox="allow-scripts"`). The frame has an opaque origin, so a program
  can't reach the playground or anything else on its domain. The program is
  inlined into the frame and imports two standalone runtime bundles built by
  `scripts/build-runtimes.mjs`:
  `runtime/core.js` (the Moss runtime) and `runtime/rhizoid.js`, which
  imports `core.js` so the program and Rhizoid share one runtime. The frame
  forwards `console.log` output and errors to the playground with
  `postMessage`.
  Loading them from the opaque-origin frame is a cross-origin request, so the
  host must send `Access-Control-Allow-Origin` (GitHub Pages and `moss dev`
  do).
- The console is an external `val`: the runtime updates it and schedules a
  frame, and the page re-renders like any other state change.

## Deploying

`npm run deploy` builds the site and pushes `dist/` to the public repo
[naamanu/moss-playground-site](https://github.com/naamanu/moss-playground-site),
which GitHub Pages serves. Only build output is published there; this
repository, Moss and Rhizoid stay private. (The published bundles do contain
the minified compiler and Rhizoid runtime.)
