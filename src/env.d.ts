// Vite returns `?inline` CSS as a string instead of emitting a second file —
// that's what keeps the dial bundle to exactly one request.
declare module '*.css?inline' {
  const css: string;
  export default css;
}

interface Window {
  __tune?: Record<string, Record<string, number>>;
  __replayLoader?: () => void;
}
