import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The site itself has no build step and must keep it that way (see CLAUDE.md).
// This config builds only the dev-only React islands — self-contained ES modules
// that the pages dynamically import *behind a gate*, so a real visitor never
// downloads a byte of React. There are two:
//
//   dial        dialkit tuning panel  → assets/dial/dial.js              (index only)
//   agentation  annotation toolbar    → assets/agentation/agentation.js  (all 3 pages)
//
// One island per build, picked by the ISLAND env var. Not two entries in one
// pass: each output has to stay a *single* self-contained file, and two entries
// make Rollup hoist the React they share into a third chunk — but the pages
// hardcode one import path each and there is no second request to coordinate.
// An env var rather than `--mode` because a non-standard mode would stop Vite
// resolving these builds as production, and the dial's bundle has to come out
// byte-for-byte what it was before this file learned about a second island.
//
// lib mode + a fixed fileName, because the page hardcodes the import() path and
// a content hash would break it on every rebuild. dialkit's stylesheet is
// pulled in with `?inline` and injected from JS; Agentation compiles its own CSS
// into its bundle. Either way the output is exactly one file.
//
//   npm run dial          npm run agentation          build one
//   npm run dial:watch    npm run agentation:watch    rebuild on save
const ISLANDS = {
  dial: { entry: 'src/dial.tsx', outDir: 'assets/dial', file: 'dial.js' },
  agentation: {
    entry: 'src/agentation.tsx',
    outDir: 'assets/agentation',
    file: 'agentation.js',
  },
} as const;

const name = (process.env.ISLAND ?? 'dial') as keyof typeof ISLANDS;
const island = ISLANDS[name];
if (!island) {
  throw new Error(`ISLAND must be one of: ${Object.keys(ISLANDS).join(', ')} (got "${name}")`);
}

export default defineConfig({
  plugins: [react()],
  // Vite's lib mode does NOT substitute process.env.NODE_ENV the way an app
  // build does, so React's `if (process.env.NODE_ENV !== 'production')` guards
  // survive into the bundle and throw `process is not defined` in the browser.
  // Defining it here both fixes that and drops the React dev build (1.26MB of
  // output became 340KB). DialRoot's own dev check goes false as a result, which
  // is why dial.tsx passes productionEnabled — the URL gate is the real guard.
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: island.outDir,
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: island.entry,
      formats: ['es'],
      fileName: () => island.file,
    },
  },
});
