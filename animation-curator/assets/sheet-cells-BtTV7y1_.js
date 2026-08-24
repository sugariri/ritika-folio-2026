const n=`import { useEffect, useRef } from 'react'
import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Sheet Cells',
  description: 'A spreadsheet draws itself in column by column, then values flicker through the cells',
  category: 'Background',
  tags: ['canvas', 'grid', 'spreadsheet', 'cursor', 'ambient'],
  status: 'ready',
}

// A spreadsheet that is entirely painted — no DOM, no table, one canvas.
//
// Three things are happening. The rules and headers sweep in left-to-right and top-to-
// bottom on a delay that mixes a linear position term with a hashed scatter, so the grid
// assembles rather than appearing. The cursor lights its row and column header, draws a
// selection box with the Excel fill handle, and tags the cell reference above it. And the
// sheet is never quite still: once the pointer has been idle a moment, short horizontal
// runs of values fade up and out somewhere in the grid, as if a formula elsewhere just
// recalculated.
//
// Cell contents are derived, not stored. \`cellValue\` hashes the coordinate into one of
// five shapes — a thousands-separated number, a signed percentage, a multiple, a dollar
// figure or a label — so an unbounded grid costs nothing and cell C7 always holds the
// same value however often you scroll past it.

// Narrower and shorter than the page hero this came from: a gallery tile is about a fifth
// of the width, and at the original 80×32 you get four columns, which reads as a table
// rather than as a sheet.
const CELL_W = 58
const CELL_H = 24
const HEADER_H = 20
const ROWNUM_W = 28

const ACCENT = '#4265CC'
const HEADER_BG = '#F6F8FA'
const HEADER_BORDER = '#D0D7DE'
const HEADER_TEXT = '#57606A'
const LINE = '#EAEEF6'
const LINE_STRONG = '#DEE5F0'
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace"

const REVEAL_S = 0.55 // per-element fade duration
const IDLE_MS = 900 // pointer quiet before the sheet starts recalculating on its own
const AMBIENT_EVERY_MS = 620
const SPARK_LIFE = [1400, 2300] as const

type Spark = { c: number; r: number; born: number; life: number }
type Cell = { c: number; r: number }

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) ^ 0x5bf03635
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) >>> 0) / 4294967295
}

const LABELS = ['Q1', 'Q2', 'Q3', 'Q4', 'FY24', 'FY25', 'EBITDA', 'GM%', 'WACC', 'IRR']

function cellValue(c: number, r: number): { t: string; k: 'pos' | 'neg' | 'num' | 'lbl' } {
  const h = hash(c, r)
  if (h < 0.3) {
    return { t: (h * 9000 + 120).toFixed(0).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ','), k: 'num' }
  }
  if (h < 0.55) {
    const v = (h - 0.42) * 38
    return { t: (v >= 0 ? '+' : '') + v.toFixed(1) + '%', k: v >= 0 ? 'pos' : 'neg' }
  }
  if (h < 0.72) return { t: (h * 4 + 0.2).toFixed(2) + 'x', k: 'num' }
  if (h < 0.86) return { t: '$' + (h * 90).toFixed(1) + 'M', k: 'num' }
  return { t: LABELS[Math.floor(h * 1000) % 10], k: 'lbl' }
}

function colRef(c: number): string {
  let s = ''
  let n = c + 1
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

const ref = (c: number, r: number) => colRef(c) + (r + 1)
const key = (c: number, r: number) => \`\${c}_\${r}\`

export default function SheetCells() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    const stage = stageRef.current
    if (!cv || !stage) return

    const ctx = cv.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let W = 0
    let H = 0
    let cols = 0
    let rows = 0
    let raf = 0
    let running = false
    let t0: number | null = null
    let pausedAt: number | null = null

    let hover: Cell | null = null
    const sparks = new Map<string, Spark>()
    let lastSparkCell: string | null = null
    let lastActivity = -Infinity
    let ambientAt = 0
    // The source seeded sparks from Math.random. A gallery mounts the same effect several
    // times at once, and identical tiles flickering in lockstep looks like a bug, so the
    // scatter comes from a per-instance counter fed through the same hash instead —
    // varied between instances, and reproducible within one.
    let tick = 0
    const rnd = () => hash(tick++, 7919)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = Math.max(stage.clientWidth, 1)
      H = Math.max(stage.clientHeight, 1)
      cv.style.width = W + 'px'
      cv.style.height = H + 'px'
      cv.width = Math.floor(W * dpr)
      cv.height = Math.floor(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil((W - ROWNUM_W) / CELL_W) + 1
      rows = Math.ceil((H - HEADER_H) / CELL_H) + 1
    }

    const cellX = (c: number) => ROWNUM_W + c * CELL_W
    const cellY = (r: number) => HEADER_H + r * CELL_H

    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + w, y, x + w, y + h, r)
      ctx.arcTo(x + w, y + h, x, y + h, r)
      ctx.arcTo(x, y + h, x, y, r)
      ctx.arcTo(x, y, x + w, y, r)
      ctx.closePath()
    }

    const drawTag = (label: string, x: number, y: number) => {
      ctx.font = '500 9px ' + MONO
      const tw = ctx.measureText(label).width + 12
      const ty = Math.max(HEADER_H + 2, y - 17)
      ctx.fillStyle = ACCENT
      roundRect(x, ty, tw, 15, 4)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'left'
      ctx.fillText(label, x + 6, ty + 8)
      ctx.textAlign = 'center'
    }

    // Sweep + scatter: the position term makes the reveal directional, the hashed term
    // stops it from looking like a wipe.
    const rev = (delay: number, elapsed: number) => {
      if (reduce) return 1
      const q = (elapsed - delay) / REVEAL_S
      return q <= 0 ? 0 : Math.min(q * 1.6, 1)
    }
    const colDelay = (c: number) => (c / Math.max(cols, 1)) * 0.9 + hash(c, 977) * 0.8
    const rowDelay = (r: number) => (r / Math.max(rows, 1)) * 0.9 + hash(977, r) * 0.8

    const spawnSparksAround = (c: number, r: number) => {
      if (reduce) return
      const n = 2 + Math.floor(rnd() * 2)
      for (let i = 0; i < n; i++) {
        const dc = Math.floor(rnd() * 5) - 2
        const dr = Math.floor(rnd() * 5) - 2
        if (dc === 0 && dr === 0) continue
        const k = key(c + dc, r + dr)
        if (sparks.has(k)) continue
        sparks.set(k, {
          c: c + dc,
          r: r + dr,
          born: performance.now(),
          life: SPARK_LIFE[0] + rnd() * (SPARK_LIFE[1] - SPARK_LIFE[0]),
        })
      }
    }

    // Idle life: a short horizontal run of cells lights up in sequence, reading as a
    // formula recalculating across a row.
    const ambient = (now: number) => {
      if (reduce) return
      if (now - lastActivity < IDLE_MS) return
      if (now - ambientAt < AMBIENT_EVERY_MS) return
      ambientAt = now
      const c = 1 + Math.floor(rnd() * Math.max(cols - 3, 1))
      const r = 1 + Math.floor(rnd() * Math.max(rows - 3, 1))
      const len = 2 + Math.floor(rnd() * 3)
      for (let i = 0; i <= len; i++) {
        sparks.set(key(c + i, r), { c: c + i, r, born: now + i * 120, life: 2600 })
      }
    }

    const draw = (now: number, elapsed: number) => {
      ctx.clearRect(0, 0, W, H)
      ctx.lineWidth = 1

      for (let c = 0; c <= cols; c++) {
        const a = rev(colDelay(c), elapsed)
        if (a <= 0) continue
        ctx.globalAlpha = a
        ctx.strokeStyle = c % 4 === 0 ? LINE_STRONG : LINE
        const x = ROWNUM_W + c * CELL_W + 0.5
        ctx.beginPath()
        ctx.moveTo(x, HEADER_H)
        ctx.lineTo(x, H)
        ctx.stroke()
      }
      for (let r = 0; r <= rows; r++) {
        // rules fade toward the bottom so the sheet dissolves into the tile
        const rowFade = Math.max(0.22, 1 - (r / rows) * 0.7)
        ctx.globalAlpha = rowFade * rev(rowDelay(r), elapsed)
        ctx.strokeStyle = r % 5 === 0 ? LINE_STRONG : LINE
        const y = HEADER_H + r * CELL_H + 0.5
        ctx.beginPath()
        ctx.moveTo(ROWNUM_W, y)
        ctx.lineTo(W, y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // column headers
      ctx.fillStyle = HEADER_BG
      ctx.fillRect(ROWNUM_W, 0, W, HEADER_H)
      ctx.fillStyle = HEADER_BORDER
      ctx.fillRect(0, HEADER_H - 1, W, 1)
      ctx.font = '500 10px ' + MONO
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let c = 0; c < cols; c++) {
        const a = rev(colDelay(c), elapsed)
        if (a <= 0) continue
        ctx.globalAlpha = a
        if (hover && c === hover.c) {
          ctx.fillStyle = ACCENT
          ctx.fillRect(cellX(c), 0, CELL_W, HEADER_H - 1)
          ctx.fillStyle = '#fff'
        } else {
          ctx.fillStyle = HEADER_TEXT
        }
        ctx.fillText(colRef(c), cellX(c) + CELL_W / 2, HEADER_H / 2)
      }
      ctx.globalAlpha = 1

      // row numbers
      ctx.fillStyle = HEADER_BG
      ctx.fillRect(0, HEADER_H, ROWNUM_W, H)
      ctx.fillStyle = HEADER_BORDER
      ctx.fillRect(ROWNUM_W - 1, HEADER_H, 1, H)
      for (let r = 0; r < rows; r++) {
        const a = rev(rowDelay(r), elapsed)
        if (a <= 0) continue
        ctx.globalAlpha = a
        if (hover && r === hover.r) {
          ctx.fillStyle = ACCENT
          ctx.fillRect(0, cellY(r), ROWNUM_W - 1, CELL_H)
          ctx.fillStyle = '#fff'
        } else {
          ctx.fillStyle = HEADER_TEXT
        }
        ctx.fillText(String(r + 1), ROWNUM_W / 2, cellY(r) + CELL_H / 2)
      }
      ctx.globalAlpha = 1

      // corner box, painted last so neither header band overlaps it
      ctx.fillStyle = HEADER_BG
      ctx.fillRect(0, 0, ROWNUM_W, HEADER_H)
      ctx.fillStyle = HEADER_BORDER
      ctx.fillRect(ROWNUM_W - 1, 0, 1, HEADER_H)
      ctx.fillRect(0, HEADER_H - 1, ROWNUM_W, 1)

      // soft glow bleeding out of the hovered cell
      if (hover && !reduce) {
        const R = 3.2
        for (let dc = -3; dc <= 3; dc++) {
          for (let dr = -3; dr <= 3; dr++) {
            const d = Math.hypot(dc, dr)
            if (d === 0 || d > R) continue
            const a = 0.028 * (1 - d / (R + 0.2))
            ctx.fillStyle = \`rgba(66,101,204,\${a.toFixed(3)})\`
            ctx.fillRect(cellX(hover.c + dc) + 1, cellY(hover.r + dr) + 1, CELL_W - 1, CELL_H - 1)
          }
        }
      }

      // values: fade up over the first quarter of their life, then out over the rest
      ctx.font = '400 10px ' + MONO
      for (const [k, s] of sparks) {
        const t = (now - s.born) / s.life
        if (t >= 1) {
          sparks.delete(k)
          continue
        }
        if (t < 0) continue
        const fade = t < 0.25 ? t / 0.25 : (1 - t) / 0.75
        const a = fade * Math.max(0.3, 1 - (s.r / rows) * 0.6)
        const v = cellValue(s.c, s.r)
        ctx.fillStyle =
          v.k === 'pos'
            ? \`rgba(14,159,110,\${a * 0.5})\`
            : v.k === 'neg'
              ? \`rgba(224,45,60,\${a * 0.44})\`
              : \`rgba(71,84,103,\${a * 0.36})\`
        ctx.fillText(v.t, cellX(s.c) + CELL_W / 2, cellY(s.r) + CELL_H / 2)
      }

      // selection box with the fill handle in the corner
      if (hover) {
        const x = cellX(hover.c)
        const y = cellY(hover.r)
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 1.8
        ctx.strokeRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2)
        ctx.fillStyle = ACCENT
        ctx.fillRect(x + CELL_W - 4.5, y + CELL_H - 4.5, 5, 5)
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.strokeRect(x + CELL_W - 5, y + CELL_H - 5, 6, 6)
        drawTag(ref(hover.c, hover.r), x, y)
      }
    }

    const frame = (now: number) => {
      if (!running) return
      if (t0 == null) t0 = now
      ambient(now)
      draw(now, (now - t0) / 1000)
      raf = requestAnimationFrame(frame)
    }

    let visible = true

    const stopLoop = () => {
      running = false
      pausedAt = performance.now()
      cancelAnimationFrame(raf)
    }
    const startLoop = () => {
      if (reduce || !visible || running) return
      // Shift the origin past the parked interval so the assemble picks up mid-sweep
      // instead of snapping to a finished grid.
      if (t0 != null && pausedAt != null) t0 += performance.now() - pausedAt
      pausedAt = null
      running = true
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(frame)
    }

    // Scoped to the stage, not the document: the source tracked the whole page because it
    // was one full-bleed hero, but a gallery has fifteen of these and only the one under
    // the cursor should react.
    const onMove = (ev: PointerEvent) => {
      const r = stage.getBoundingClientRect()
      const x = ev.clientX - r.left
      const y = ev.clientY - r.top
      lastActivity = performance.now()
      const cell = { c: Math.floor((x - ROWNUM_W) / CELL_W), r: Math.floor((y - HEADER_H) / CELL_H) }
      if (cell.c < 0 || cell.r < 0) {
        hover = null
        return
      }
      if (!hover || cell.c !== hover.c || cell.r !== hover.r) {
        hover = cell
        const k = key(cell.c, cell.r)
        if (k !== lastSparkCell) {
          spawnSparksAround(cell.c, cell.r)
          lastSparkCell = k
        }
      }
    }
    const onLeave = () => {
      hover = null
    }

    // A sheet with no numbers in it is not a sheet, so the reduced-motion frame is not
    // simply "the animation, stopped" — the values only exist as sparks, and sparks are
    // suppressed. Seed a fixed scatter parked at the peak of its fade instead, re-seeded
    // per draw because the fade is measured against whatever \`now\` that draw was given.
    const seedStatic = (now: number) => {
      sparks.clear()
      tick = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rnd() > 0.34) continue
          const life = SPARK_LIFE[1]
          sparks.set(key(c, r), { c, r, born: now - life * 0.25, life })
        }
      }
    }

    const drawStatic = () => {
      const now = performance.now()
      seedStatic(now)
      draw(now, REVEAL_S + 4) // settled grid, nothing mid-assemble
    }

    resize()
    if (reduce) drawStatic()
    else startLoop()

    stage.addEventListener('pointermove', onMove, { passive: true })
    stage.addEventListener('pointerleave', onLeave)

    const ro = new ResizeObserver(() => {
      resize()
      if (reduce) drawStatic()
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
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div ref={stageRef} className="absolute inset-0 bg-white">
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}
`;export{n as default};
