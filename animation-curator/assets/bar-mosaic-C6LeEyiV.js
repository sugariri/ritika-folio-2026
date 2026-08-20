const n=`import { useEffect, useRef } from 'react'
import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Bar Mosaic',
  description: 'The same dither, painted as vertical marks that merge into continuous strips through the shadows',
  category: 'Background',
  tags: ['canvas', 'photo', 'dither', 'bars', 'cursor'],
  status: 'ready',
}

// A sibling to Halftone Dither, differing only in how a lit cell is painted — and that
// one change remakes the image. Each mark's width tracks the cell's darkness (thin
// through cables and sky, wide through towers) while its height slightly overfills the
// row, so vertically adjacent marks fuse into unbroken strips. The picture then reads by
// bar length rather than by dot density, closer to an engraving than to newsprint.
//
// Bar width is a gentler channel than dot presence, so this variant wants slightly less
// midtone crushing than the halftone one — push the contrast as hard here and the
// picture collapses to a bare silhouette with no gradation left in the strips.
const IMG_SRC = '/assets/img/sf-mosaic.avif'
// A single ink, deliberately not the page accent: the mosaics sit next to each other in
// the grid, so this one is burnt orange and Halftone Dither is blue — same photo, same
// engine, instantly distinguishable. Mid-tone on purpose, since it has to hold against a
// near-black and a near-white canvas alike.
const INK = '#d2733a'

const TILE = 5 // row height (css px); columns are 1.8× as wide
// See Halftone Dither: gamma above 1 crushes the dusk sky's midtones so it drops out
// instead of filling the frame. Bars need a touch less than the dot variant, because
// width already carries tone and over-crushing leaves nothing but the silhouette.
const GAMMA = 1.35
const BOOST = 1.3
const REVEAL_DUR = 0.55

const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
]

const hash = (c: number, r: number) => {
  const s = Math.sin(c * 127.1 + r * 311.7) * 43758.5453
  return s - Math.floor(s)
}

type Cell = { on: boolean; d: number; delay: number; rnd: number; a: number }

export default function BarMosaic() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    const stage = stageRef.current
    if (!cv || !stage) return

    const ctx = cv.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const mouse = { x: -9999, y: -9999 }

    let cells: Cell[] = []
    let cols = 0, rows = 0
    let dpr = 1, w = 0, h = 0, tw = 0, th = 0
    let startT = 0
    let raf = 0
    let img: HTMLImageElement | null = null
    let imgLoaded = false
    let visible = true
    let killed = false

    const stopLoop = () => cancelAnimationFrame(raf)
    const startLoop = () => {
      if (reduce || killed || !visible || !imgLoaded) return
      cancelAnimationFrame(raf)
      const loop = (now: number) => {
        draw(now)
        if (visible && !killed) raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }

    const build = () => {
      if (!imgLoaded || !img) return
      w = Math.max(stage.clientWidth, 1)
      h = Math.max(stage.clientHeight, 1)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.style.width = w + 'px'
      cv.style.height = h + 'px'
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)

      let sx = 0, sy = 0, sW = img.width, sH = img.height
      const targetA = w / h
      if (img.width / img.height > targetA) {
        sW = img.height * targetA
        sx = (img.width - sW) / 2
      } else {
        sH = img.width / targetA
        sy = img.height - sH
      }

      tw = TILE * 1.8
      th = TILE
      cols = Math.max(1, Math.floor(w / tw))
      rows = Math.max(1, Math.floor(h / th))

      const off = document.createElement('canvas')
      off.width = cols
      off.height = rows
      const octx = off.getContext('2d', { willReadFrequently: true })
      if (!octx) return
      octx.drawImage(img, sx, sy, sW, sH, 0, 0, cols, rows)
      const data = octx.getImageData(0, 0, cols, rows).data

      cells = new Array(cols * rows)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = (r * cols + c) * 4
          const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
          const d = Math.min(1, Math.pow(1 - lum, GAMMA) * BOOST)
          const thr = (BAYER[(r % 8) * 8 + (c % 8)] + 0.5) / 64
          cells[r * cols + c] = {
            on: d > thr, // bright cells drop out entirely → short, broken strips
            d,
            delay: (c / cols) * 0.9 + hash(c, r) * 0.8,
            rnd: hash(r, c),
            a: 1,
          }
        }
      }

      startT = performance.now()
      cancelAnimationFrame(raf)
      if (reduce) drawStatic()
      else startLoop()
    }

    // Width carries the tone; the 1.06 height overfill is what makes neighbouring
    // rows fuse instead of leaving a visible ladder of gaps.
    const barW = (d: number) => tw * (0.18 + 0.32 * d)
    const paint = (cx: number, cy: number, sw: number, sh: number) => {
      ctx.beginPath()
      ctx.roundRect(cx - sw / 2, cy - sh / 2, sw, sh, Math.min(sw * 0.5, 2.5))
      ctx.fill()
    }

    const drawStatic = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = INK
      ctx.globalAlpha = 1
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = cells[r * cols + c]
          if (!cell.on) continue
          paint(c * tw + tw / 2, r * th + th / 2, barW(cell.d), th * 1.06)
        }
      }
    }

    const draw = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = INK

      const elapsed = (now - startT) / 1000
      const mx = mouse.x, my = mouse.y
      const R = TILE * 7

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = cells[r * cols + c]
          if (!cell.on) continue
          let p = (elapsed - cell.delay) / REVEAL_DUR
          if (p <= 0) continue
          if (p > 1) p = 1

          const u = p - 1
          const scale = p === 1 ? 1 : 1 + 2.2 * u * u * u + 1.2 * u * u
          const cx = c * tw + tw / 2, cy = r * th + th / 2
          let alpha = Math.min(p * 1.6, 1)

          if (p === 1) {
            const x0 = c * tw
            const nx = Math.max(x0, Math.min(mx, x0 + tw))
            const d = Math.hypot(nx - mx, cy - my)
            let target = 1
            if (d < R) {
              const f = 1 - d / R
              const ease = f * f * (3 - 2 * f)
              if (cell.rnd < ease * 0.9) target = 0
            }
            cell.a += (target - cell.a) * 0.14
            alpha = cell.a
            if (alpha < 0.02) continue
          }

          const sw = barW(cell.d) * scale, sh = th * 1.06 * scale
          if (sw <= 0.2) continue
          ctx.globalAlpha = alpha
          paint(cx, cy, sw, sh)
        }
      }
      ctx.globalAlpha = 1
    }

    // Pointer rather than mouse events: a mouse fires both, but a finger dragged across
    // the canvas fires only the pointer ones, so on a phone the mouse version left this
    // interaction entirely dead. Touch also gets \`pointerleave\` for free when the drag
    // turns into a page scroll, which is exactly the reset \`onLeave\` already does.
    const onMove = (ev: PointerEvent) => {
      const rect = cv.getBoundingClientRect()
      mouse.x = ev.clientX - rect.left
      mouse.y = ev.clientY - rect.top
    }
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999 }

    img = new Image()
    img.onload = () => { if (killed) return; imgLoaded = true; build() }
    img.src = IMG_SRC

    cv.addEventListener('pointermove', onMove, { passive: true })
    cv.addEventListener('pointerleave', onLeave)
    const ro = new ResizeObserver(() => build())
    ro.observe(stage)

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) startLoop()
      else stopLoop()
    }, { rootMargin: '160px' })
    io.observe(stage)

    return () => {
      killed = true
      if (img) img.onload = null
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div ref={stageRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}
`;export{n as default};
