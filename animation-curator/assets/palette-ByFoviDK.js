const n=`/**
 * The theme, as values a canvas can use.
 *
 * DOM effects theme themselves: they write \`var(--color-ink)\` and the browser does the
 * rest. Canvas effects cannot — \`ctx.fillStyle\` takes a colour, not a variable — so they
 * have to resolve the tokens once at setup and hold the strings. This is that read.
 *
 * Resolve against the effect's own element, not \`document.documentElement\`, so an effect
 * dropped into a differently-themed subtree still picks up the palette around it.
 *
 * Canvas effects are remounted when the theme changes (see \`PreviewFrame\`), which is
 * what re-runs this — a live theme swap would otherwise leave a canvas painted in the
 * colours it happened to start with.
 */
export interface Palette {
  canvas: string
  surface: string
  raised: string
  line: string
  lineStrong: string
  ink: string
  muted: string
  faint: string
  accent: string
  accentGreen: string
  accentOrange: string
  /** True when the page is dark, for the choices a colour alone cannot express — additive
   *  vs subtractive compositing, whether a glow reads as light or as shadow. */
  dark: boolean
}

const TOKENS = {
  canvas: '--color-canvas',
  surface: '--color-surface',
  raised: '--color-raised',
  line: '--color-line',
  lineStrong: '--color-line-strong',
  ink: '--color-ink',
  muted: '--color-muted',
  faint: '--color-faint',
  accent: '--color-accent',
  accentGreen: '--color-accent-green',
  accentOrange: '--color-accent-orange',
} as const

const FALLBACK: Palette = {
  canvas: '#08080a',
  surface: '#0e0e11',
  raised: '#16161a',
  line: '#232329',
  lineStrong: '#34343d',
  ink: '#ededf0',
  muted: '#8a8a94',
  faint: '#5a5a63',
  accent: '#4d8dff',
  accentGreen: '#38d39f',
  accentOrange: '#ff8f4d',
  dark: true,
}

export function readPalette(el: Element | null): Palette {
  if (!el || typeof window === 'undefined') return FALLBACK

  const style = getComputedStyle(el)
  const read = (token: string, fallback: string) =>
    style.getPropertyValue(token).trim() || fallback

  return {
    canvas: read(TOKENS.canvas, FALLBACK.canvas),
    surface: read(TOKENS.surface, FALLBACK.surface),
    raised: read(TOKENS.raised, FALLBACK.raised),
    line: read(TOKENS.line, FALLBACK.line),
    lineStrong: read(TOKENS.lineStrong, FALLBACK.lineStrong),
    ink: read(TOKENS.ink, FALLBACK.ink),
    muted: read(TOKENS.muted, FALLBACK.muted),
    faint: read(TOKENS.faint, FALLBACK.faint),
    accent: read(TOKENS.accent, FALLBACK.accent),
    accentGreen: read(TOKENS.accentGreen, FALLBACK.accentGreen),
    accentOrange: read(TOKENS.accentOrange, FALLBACK.accentOrange),
    dark: (document.documentElement.dataset.theme ?? 'dark') !== 'light',
  }
}

/** \`#rrggbb\` (or \`#rgb\`) to \`[r, g, b]\`, for effects that need to interpolate a token. */
export function toRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** A token at partial opacity, ready for \`fillStyle\`. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex)
  return \`rgba(\${r},\${g},\${b},\${alpha.toFixed(3)})\`
}
`;export{n as default};
