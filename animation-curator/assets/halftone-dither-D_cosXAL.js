const e=`import { useEffect, useRef } from 'react'
import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Halftone Dither',
  description: 'A photo reduced to one ink by ordered dithering, sweeping in left to right and erasing under the cursor',
  category: 'Background',
  tags: ['canvas', 'photo', 'dither', 'halftone', 'cursor'],
  status: 'ready',
}

// A photo is sampled into a grid of wide cells and each cell's darkness is compared
// against a Bayer 8×8 ordered-dither matrix — the same trick early printers used to fake
// greys from a single ink. Cells that clear their threshold get a dot; the rest stay
// empty. There is no colour ramp and no opacity ramp: the image reads entirely through
// which dots are on, which is what gives it the printed look.
//
// Dots sweep on left to right with a small ease-out-back pop, then settle. The cursor
// acts as a lens — cells near it fade out, but only the ones whose fixed per-cell
// threshold falls under the falloff, so the hole has a ragged, eaten edge rather than a
// clean circle.
const IMG_SRC = '/assets/img/sf-mosaic.avif'
// See Bar Mosaic: same photo and same ordered dither, so the two are told apart by ink —
// blue here, burnt orange there. Mid-tone, to hold on both a near-black and a near-white
// canvas without becoming the brightest thing in the grid.
const INK = '#3f7ae0'

// A gallery tile is a fraction of the hero this came from, so the cells have to be
// correspondingly finer — at the source's 9px there are barely twenty columns across a
// tile and the skyline stops being a skyline.
const TILE = 5 // cell height (css px); cells are 1.8× as wide as they are tall
// Gamma above 1 pushes midtones toward "off". The source photo is a dusk shot whose sky
// sits at mid-luminance: with the source's brightening gamma every sky cell cleared its
// threshold and the whole frame filled in solid. Crushing the midtones is what lets the
// bridge separate from the sky at all.
const GAMMA = 1.5
const BOOST = 1.35
const DOT_SCALE = 1 // >1 paints bigger dots
const REVEAL_DUR = 0.55 // per-cell pop duration (s)

// Bayer 8×8 ordered-dither threshold matrix
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
]

// deterministic per-cell hash — the same cells always scatter and erase the same way
const hash = (c: number, r: number) => {
  const s = Math.sin(c * 127.1 + r * 311.7) * 43758.5453
  return s - Math.floor(s)
}

type Cell = { on: boolean; delay: number; rnd: number; a: number }

export default function HalftoneDither() {
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
    let visible = true // gated so off-screen tiles don't burn a rAF loop
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

      // cover-crop the source to the stage, skyline anchored to the bottom
      let sx = 0, sy = 0, sW = img.width, sH = img.height
      const targetA = w / h
      if (img.width / img.height > targetA) {
        sW = img.height * targetA
        sx = (img.width - sW) / 2
      } else {
        sH = img.width / targetA
        sy = img.height - sH
      }

      tw = TILE * 1.8 // wide cells — the printed-strip look comes from the aspect
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
            on: d > thr,
            delay: (c / cols) * 0.9 + hash(c, r) * 0.8, // left-to-right sweep + scatter
            rnd: hash(r, c), // fixed erase threshold — a different hash to the delay
            a: 1,
          }
        }
      }

      startT = performance.now()
      cancelAnimationFrame(raf)
      if (reduce) drawStatic()
      else startLoop()
    }

    const paint = (cx: number, cy: number, sw: number, sh: number) => {
      ctx.beginPath()
      ctx.roundRect(cx - sw / 2, cy - sh / 2, sw, sh, Math.min(sh * 0.28, 5))
      ctx.fill()
    }

    const drawStatic = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = INK
      ctx.globalAlpha = 1
      const sw = tw * 0.52 * DOT_SCALE, sh = th * 0.46 * DOT_SCALE
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!cells[r * cols + c].on) continue
          paint(c * tw + tw / 2, r * th + th / 2, sw, sh)
        }
      }
    }

    const draw = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = INK

      const elapsed = (now - startT) / 1000
      const mx = mouse.x, my = mouse.y
      const R = TILE * 7 // cursor lens radius
      const baseW = tw * 0.52 * DOT_SCALE, baseH = th * 0.46 * DOT_SCALE

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = cells[r * cols + c]
          if (!cell.on) continue
          let p = (elapsed - cell.delay) / REVEAL_DUR
          if (p <= 0) continue
          if (p > 1) p = 1

          const u = p - 1
          const scale = p === 1 ? 1 : 1 + 2.2 * u * u * u + 1.2 * u * u // ease-out-back
          const cx = c * tw + tw / 2, cy = r * th + th / 2
          let alpha = Math.min(p * 1.6, 1)

          if (p === 1) {
            // measure to the nearest point on the cell's horizontal extent, not its
            // centre — wide cells would otherwise pop out a lens that looks squashed
            const x0 = c * tw
            const nx = Math.max(x0, Math.min(mx, x0 + tw))
            const dx = nx - mx, dy = cy - my
            const d = Math.hypot(dx, dy)
            let target = 1
            if (d < R) {
              const f = 1 - d / R
              const ease = f * f * (3 - 2 * f)
              if (cell.rnd < ease * 0.9) target = 0
            }
            cell.a += (target - cell.a) * 0.14 // smooth fade in/out
            alpha = cell.a
            if (alpha < 0.02) continue
          }

          const sw = baseW * scale, sh = baseH * scale
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
`;export{e as default};
