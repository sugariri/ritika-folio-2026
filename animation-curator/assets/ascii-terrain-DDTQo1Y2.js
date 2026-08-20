const e=`import { useEffect, useRef } from 'react'
import type { EffectMeta } from '../lib/types.ts'
import { readPalette, rgba } from '../lib/palette.ts'

export const meta: EffectMeta = {
  name: 'ASCII Terrain',
  description: 'Diagonal streaks of monospace glyphs shimmer and dissolve across the field',
  category: 'Background',
  tags: ['canvas', 'ascii', 'text', 'dissolve', 'deterministic'],
  status: 'ready',
}

// Airy terrain drawn entirely in text. Two clusters sit at fixed anchors; each is built
// from six short streaks that climb left-to-right, plus a halo of stray specks so the
// cluster has no hard edge.
//
// Nothing here is random. Every glyph's character, opacity, twinkle phase and speed come
// from a hash of (seed, index), so the terrain is identical on every mount and every
// reload — important in a grid where the same effect is on screen twice at once.
//
// The dissolve is the same hash read through a slow clock. \`bucket\` advances once per
// CYCLE_MS, and a glyph's gate is hashed against it: most cycles it draws, some cycles it
// vanishes, occasionally it morphs into a different character. Because the gate is a pure
// function of the bucket, the field re-forms into exactly the shape it left — it reads as
// terrain breathing rather than noise.
// Glyph positions are laid out on an abstract cell grid and scaled to the frame at draw
// time. The source was a full-bleed page section where a fixed 8×10px cell put the cluster
// at about a quarter of the width; a gallery tile is a fifth of that, so a fixed cell
// would push most of the terrain off-canvas. Sizing the cell from the stage instead keeps
// the same composition at any frame size.
const GRID_COLS = 54 // cluster width in cells, including its halo
const GRID_ROWS = 40
const CYCLE_MS = 1400
const MORPH = ['A', 'V', '/', '\\\\', '#', '-', '·', '.']

type Glyph = {
  col: number
  row: number
  char: string
  baseA: number
  phase: number
  speed: number
  blink: number
}

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) ^ 0x5bf03635
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) >>> 0) / 4294967295
}

// Mostly tiny dots; the structural characters are the exception, which is what keeps the
// field reading as terrain rather than as a wall of type.
function pickChar(r: number): string {
  if (r < 0.22) return '·'
  if (r < 0.38) return '.'
  if (r < 0.56) return 'A'
  if (r < 0.7) return 'V'
  if (r < 0.8) return '/'
  if (r < 0.86) return '\\\\'
  if (r < 0.94) return '-'
  return '#'
}

function makeGlyph(seed: number, i: number, col: number, row: number, faint: boolean): Glyph {
  return {
    col,
    row,
    char: faint ? (hash(seed, i * 7) > 0.5 ? '·' : '.') : pickChar(hash(seed, i * 11 + 3)),
    baseA: faint ? 0.16 + hash(seed, i * 13 + 5) * 0.3 : 0.34 + hash(seed, i * 17 + 7) * 0.55,
    phase: hash(seed, i * 19 + 11) * Math.PI * 2,
    speed: 0.25 + hash(seed, i * 23 + 13) * 0.6,
    blink: hash(seed, i * 29 + 17),
  }
}

function buildCluster(seed: number): Glyph[] {
  const glyphs: Glyph[] = []
  let gi = 0

  for (let s = 0; s < 6; s++) {
    const startCol = Math.floor(hash(seed, s * 41) * 26)
    const startRow = 26 - startCol * 0.5 + (hash(seed, s * 43 + 1) - 0.5) * 12
    const len = 8 + Math.floor(hash(seed, s * 47 + 2) * 16)
    let row = startRow
    for (let c = 0; c < len; c++) {
      // the climb is uneven per step, so streaks aren't parallel rules
      row -= 0.35 + hash(seed, s * 53 + c * 3) * 0.45
      const stack = 1 + Math.floor(hash(seed, s * 59 + c * 5) * 4)
      for (let d = 0; d < stack; d++) {
        if (hash(seed, s * 61 + c * 7 + d * 101) > 0.74) continue // punch gaps
        glyphs.push(makeGlyph(seed, gi++, startCol + c, row + d, false))
      }
    }
  }

  for (let i = 0; i < 90; i++) {
    const col = hash(seed, i * 67 + 900) * 46 - 4
    const row = hash(seed, i * 71 + 901) * 34 - 6
    glyphs.push(makeGlyph(seed, gi++, col, row, true))
  }
  return glyphs
}

// Built once at module scope: the geometry is in abstract cells and never depends on stage
// size, so every mounted instance shares one set of arrays.
const CLUSTERS = [
  { seed: 7, glyphs: buildCluster(7) },
  { seed: 23, glyphs: buildCluster(23) },
]

// The cluster builder emits negative coordinates (the halo scatters outside the streaks),
// so the grid origin sits a few cells before zero.
const COL_ORIGIN = -5
const ROW_ORIGIN = -7

export default function AsciiTerrain() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    const stage = stageRef.current
    if (!cv || !stage) return

    const ctx = cv.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // The terrain is monochrome type, so the theme costs it nothing: the same glyphs at
    // the same opacities, drawn in the page's ink instead of a baked white. Read once —
    // the effect is remounted when the theme changes.
    const { ink } = readPalette(stage)

    let W = 0
    let H = 0
    let raf = 0
    let running = false

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = Math.max(stage.clientWidth, 1)
      H = Math.max(stage.clientHeight, 1)
      cv.style.width = W + 'px'
      cv.style.height = H + 'px'
      cv.width = Math.floor(W * dpr)
      cv.height = Math.floor(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = (now: number) => {
      ctx.clearRect(0, 0, W, H)

      // One cell per grid slot, so a cluster always fills the frame it is given. The glyph
      // is sized from the cell rather than fixed, or the type would crowd or float.
      const cw = W / GRID_COLS
      const chh = H / GRID_ROWS
      ctx.font = \`400 \${(chh * 1.15).toFixed(1)}px ui-monospace, SFMono-Regular, Menlo, monospace\`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const t = now / 1000
      const bucket = Math.floor(now / CYCLE_MS)
      // Both clusters only fit side by side in something page-width. In a tile they would
      // overlap into mush, so pick one — the seeds differ, so which one matters.
      const clusters = W > 900 ? CLUSTERS : [CLUSTERS[1]]
      const spread = clusters.length > 1 ? 0.5 : 1

      clusters.forEach((cl, ci) => {
        const ox = ci * spread * W
        for (let i = 0; i < cl.glyphs.length; i++) {
          const g = cl.glyphs[i]
          const gate = hash(cl.seed, i * 131 + bucket * 977)
          if (!reduce && gate < 0.14 + g.blink * 0.1) continue // dissolved this cycle

          let ch = g.char
          if (!reduce && gate > 0.93) {
            ch = MORPH[Math.floor(hash(cl.seed, i * 139 + bucket) * MORPH.length)]
          }

          const tw = reduce ? 1 : 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * g.speed + g.phase))
          ctx.fillStyle = rgba(ink, g.baseA * tw)
          ctx.fillText(
            ch,
            ox + (g.col - COL_ORIGIN) * cw * spread,
            (g.row - ROW_ORIGIN) * chh,
          )
        }
      })
    }

    const frame = (now: number) => {
      if (!running) return
      draw(now)
      raf = requestAnimationFrame(frame)
    }

    let visible = true // gated so an off-screen tile doesn't burn a rAF loop

    const stopLoop = () => {
      running = false
      cancelAnimationFrame(raf)
    }
    const startLoop = () => {
      if (reduce || !visible || running) return
      running = true
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(frame)
    }

    resize()
    if (reduce) draw(0) // one settled frame, no dissolve and no twinkle
    else startLoop()

    const ro = new ResizeObserver(() => {
      resize()
      if (reduce) draw(0)
    })
    ro.observe(stage)

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) startLoop()
      else stopLoop()
    }, { rootMargin: '160px' })
    io.observe(stage)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [])

  return (
    <div ref={stageRef} className="absolute inset-0 bg-canvas">
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}
`;export{e as default};
