const e=`import { useEffect, useRef } from 'react'
import type { EffectMeta } from '../lib/types.ts'
import { readPalette, toRgb } from '../lib/palette.ts'

export const meta: EffectMeta = {
  name: 'Pixel Assemble',
  description: 'Chunky tiles drop into place like bricks, then the mosaic dissolves into the sharp photo',
  category: 'Background',
  tags: ['canvas', 'photo', 'mosaic', 'reveal', 'loop'],
  status: 'ready',
}

// The photo is downsampled to a coarse grid and each cell becomes one flat-tone brick.
// Bricks land bottom-to-top on deterministic scattered beats — a \`sin\` hash, never
// \`Math.random\`, so the order is identical on every mount — each falling in from just
// above its slot and popping home with an ease-out-back overshoot. Once the last brick
// settles, the mosaic crossfades into a full-resolution greyscale plate baked at layout
// time, so the pixels read as the way in rather than the destination.
//
// Unlike the source, which fires once on scroll and stops, this loops: a beat of
// stillness on the resolved photo, then back to bare ground. A gallery tile has to
// demonstrate itself to anyone who arrives late.
const SRC = '/assets/img/wall-street.avif'

const TILE = 10 // approximate brick size (css px)
const FOCUS_X = 0.5 // crop anchor, 0 = left edge of the photo … 1 = right
const FOCUS_Y = 0.55 // 0 = top … 1 = bottom
const ASSEMBLE_MS = 2200 // last brick lands here
const START_MS = 150 // hold on bare ground before the first brick
const HOLD_MS = 260 // stillness between the last brick and the crossfade
const RESOLVE_MS = 900 // mosaic → photo
const LINGER_MS = 1600 // dwell on the resolved photo before looping

// fraction of the assemble timeline a single brick takes to drop and settle
const REVEAL_WINDOW = 0.16
const BACK_C1 = 1.70158
const BACK_C3 = BACK_C1 + 1

const CYCLE_MS = START_MS + ASSEMBLE_MS + HOLD_MS + RESOLVE_MS + LINGER_MS

// deterministic per-cell hash → scattered landing order
const seed = (i: number, j: number) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return s - Math.floor(s)
}

const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0

export default function PixelAssemble() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    const stage = stageRef.current
    if (!cv || !stage) return

    const ctx = cv.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Ground the bricks sit on. Read from the surface token rather than baked, because
    // the whole point of it is to match whatever is behind the canvas: get it right and
    // the unassembled frame reads as empty, get it wrong and it reads as a rectangle.
    const [BG_R, BG_G, BG_B] = toRgb(readPalette(stage).surface)

    const img = new Image()
    let imgReady = false
    let disposed = false

    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let vw = 0, vh = 0
    let cols = 0, rows = 0, cell = 0, oy = 0
    let grays: Uint8Array | null = null // one 0–255 tone per cell
    let thresh: Float32Array | null = null // per-cell start point on the timeline
    let sharp: HTMLCanvasElement | null = null // full-res plate the mosaic resolves into
    let raf = 0
    let t0: number | null = null

    const build = () => {
      vw = Math.max(stage.clientWidth, 1)
      vh = Math.max(stage.clientHeight, 1)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.style.width = vw + 'px'
      cv.style.height = vh + 'px'
      cv.width = Math.floor(vw * dpr)
      cv.height = Math.floor(vh * dpr)

      cols = Math.max(1, Math.round(vw / TILE))
      rows = Math.max(1, Math.round(vh / TILE))
      cell = vw / cols // exact fit across the width
      oy = Math.min(0, vh - rows * cell) // anchor the grid to the bottom

      if (!imgReady) { grays = null; sharp = null; return }

      // Lay the source out as object-fit: cover on the coarse grid and read one tone
      // per cell. Anything short of cover would leave edge cells sampling bare ground.
      const iw = img.naturalWidth, ih = img.naturalHeight
      const scale = Math.max(cols / iw, rows / ih)
      const dw = iw * scale, dh = ih * scale
      const dx = (cols - dw) * FOCUS_X
      const dy = (rows - dh) * FOCUS_Y

      const small = document.createElement('canvas')
      small.width = cols
      small.height = rows
      const sc = small.getContext('2d', { willReadFrequently: true })
      if (!sc) return
      sc.fillStyle = \`rgb(\${BG_R},\${BG_G},\${BG_B})\`
      sc.fillRect(0, 0, cols, rows)
      sc.drawImage(img, dx, dy, dw, dh)
      const data = sc.getImageData(0, 0, cols, rows).data

      grays = new Uint8Array(cols * rows)
      thresh = new Float32Array(cols * rows)
      const span = 1 - REVEAL_WINDOW // keep the last brick's window in range
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i
          grays[k] = lum(data[k * 4], data[k * 4 + 1], data[k * 4 + 2])
          // mostly row-driven (bottom rows first) with a little jitter, so bricks
          // within a band still land one-by-one rather than in a rigid line
          const rowBias = 1 - j / (rows - 1 || 1)
          thresh[k] = Math.min(span, Math.max(0, (0.85 * rowBias + 0.15 * seed(i, j)) * span))
        }
      }

      // The plate the mosaic resolves into: the same crop at full canvas resolution,
      // drained of colour. Baked once per layout so the crossfade stays a cheap blit.
      sharp = document.createElement('canvas')
      sharp.width = cv.width
      sharp.height = cv.height
      const pc = sharp.getContext('2d', { willReadFrequently: true })
      if (!pc) return
      pc.scale(dpr, dpr)
      pc.fillStyle = \`rgb(\${BG_R},\${BG_G},\${BG_B})\`
      pc.fillRect(0, 0, vw, vh)
      pc.filter = 'grayscale(1)'
      pc.drawImage(img, dx * cell, oy + dy * cell, dw * cell, dh * cell)
      pc.filter = 'none'
    }

    // pA: assembly 0→1. pR: de-pixelate crossfade 0→1.
    const draw = (pA: number, pR: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = \`rgb(\${BG_R},\${BG_G},\${BG_B})\`
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!grays || !thresh) return

      // A hair of bleed on each settled brick kills the hairline seams that
      // sub-pixel cell widths would otherwise leave between neighbours.
      const bleed = 0.75
      if (pR < 1) {
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            const k = j * cols + i
            const t = Math.min(1, Math.max(0, (pA - thresh[k]) / REVEAL_WINDOW))
            if (t <= 0) continue

            const a = 1 - (1 - t) * (1 - t) // ease-out alpha
            const u = t - 1
            const back = 1 + BACK_C3 * u * u * u + BACK_C1 * u * u
            const sc = 0.24 + 0.76 * back // grow small → settle at 1 with a pop
            const drop = (1 - t) * cell * 0.9 // fall in from just above the slot

            const w = cell * sc + bleed, h = cell * sc + bleed
            const x = i * cell + (cell - w) / 2
            const y = oy + j * cell + (cell - h) / 2 - drop

            const g = grays[k]
            ctx.globalAlpha = a
            ctx.fillStyle = \`rgb(\${g},\${g},\${g})\`
            ctx.fillRect(x, y, w, h)
          }
        }
      }

      // Every brick already carries the average tone of the patch it covers, so the
      // fade reads as the image pulling into focus, not as one picture swapping for
      // another.
      if (pR > 0 && sharp) {
        ctx.globalAlpha = pR < 1 ? pR * pR * (3 - 2 * pR) : 1 // smoothstep
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.drawImage(sharp, 0, 0)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      ctx.globalAlpha = 1
    }

    const frame = (now: number) => {
      if (disposed) return
      if (t0 == null) t0 = now
      const e = ((now - t0) % CYCLE_MS) - START_MS
      const pA = Math.min(1, Math.max(0, e / ASSEMBLE_MS))
      const pR = Math.min(1, Math.max(0, (e - ASSEMBLE_MS - HOLD_MS) / RESOLVE_MS))
      draw(pA, pR)
      if (visible) raf = requestAnimationFrame(frame)
    }

    let visible = true // gated so off-screen tiles don't burn a rAF loop
    let pausedAt: number | null = null

    const stopLoop = () => {
      pausedAt = performance.now()
      cancelAnimationFrame(raf)
    }
    const startLoop = () => {
      if (reduce || disposed || !visible || !imgReady) return
      // Shift the origin past the parked interval. Without this the cycle would be
      // wherever the wall clock left it, so a tile scrolled back into view would pop
      // mid-dissolve instead of resuming.
      if (t0 != null && pausedAt != null) t0 += performance.now() - pausedAt
      pausedAt = null
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(frame)
    }

    img.onload = () => {
      if (disposed) return
      imgReady = true
      build()
      if (reduce) draw(1, 1) // the resolved photo, once
      else startLoop()
    }
    img.src = SRC

    const ro = new ResizeObserver(() => {
      if (!imgReady) return
      build()
      if (reduce) draw(1, 1)
    })
    ro.observe(stage)

    // The gallery mounts every canvas at once, so a tile scrolled out of the grid must not
    // keep a rAF loop alive. The margin restarts it just before it comes back into view.
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) startLoop()
      else stopLoop()
    }, { rootMargin: '160px' })
    io.observe(stage)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      img.onload = null
    }
  }, [])

  return (
    <div ref={stageRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}
`;export{e as default};
