import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The site itself has no build step and must keep it that way (see CLAUDE.md).
// This config builds one thing only: the dev-only dialkit panel, as a single
// self-contained ES module that index.html dynamically imports *behind a gate*
// — so a real visitor never downloads a byte of React.
//
// lib mode + a fixed fileName, because the page hardcodes the import() path and
// a content hash would break it on every rebuild. dialkit's stylesheet is
// pulled in with `?inline` and injected from JS, so the output is exactly one
// file and there is no second request to coordinate.
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
    outDir: 'assets/dial',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: 'src/dial.tsx',
      formats: ['es'],
      fileName: () => 'dial.js',
    },
  },
});
