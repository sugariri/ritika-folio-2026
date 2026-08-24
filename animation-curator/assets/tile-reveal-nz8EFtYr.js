const n=`import { useEffect, useRef } from 'react'
import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Tile Reveal',
  description: 'A grey tile mosaic that shimmers on its own and bleeds back into colour wherever the cursor passes',
  category: 'Hover',
  tags: ['canvas', 'photo', 'mosaic', 'cursor', 'shimmer'],
  status: 'ready',
}

// The photo is downsampled to one colour per tile and painted as a grid of rounded
// rectangles. Two things then play at once.
//
// Ambient: two slow sine waves — one across x, one down y, drifting at different rates —
// multiply into travelling clusters, and each tile breathes on its own phase inside
// whichever cluster it happens to be in. A tile's intensity drives both its scale and a
// lift toward white, so the field reads as light moving through it rather than opacity
// being turned up and down.
//
// Cursor: at rest every tile sits at its own luminance, so the mosaic is grey. Near the
// pointer, tiles roll a fixed per-tile threshold against the falloff to decide whether to
// return to full, saturation-boosted colour. Because the threshold is per-tile and fixed,
// the lens has a noisy edge — strays light up outside it, hold-outs stay grey inside —
// and the blend smooths fast in and slow out, which drags a colour trail behind a moving
// cursor.
const IMG_SRC = '/assets/img/sf-mosaic.avif'

const TILE = 12 // target tile pitch (css px)
const GAP = 2 // gutter between tiles
const LIT_GROW = 0.42 // extra scale at full intensity
const LIT_LIFT = 30 // rgb added per channel at full intensity
const LIT_FLOOR = 0.35 // the field never dims below this
// The source is a bright dusk photo; its own luminance plus the shimmer lift blows the
// resting grid out to near-white against dark chrome, and there is no headroom left for
// the reveal to read against. Dimming the rest state buys that headroom back.
const REST_DIM = 0.6
const SAT = 1.45 // saturation boost applied to the revealed colour
const REVEAL_RADIUS = 190 // cursor lens radius (px)
const REVEAL_DUR = 550 // per-tile intro pop (ms)
const REVEAL_TOTAL = 2300 // sweep (900) + scatter (800) + pop (550)

type Tile = {
  x: number; y: number; cx: number; cy: number
  delay: number; ph: number
  gy: number // rest grey
  vr: number; vg: number; vb: number // revealed colour
  rnd: number // fixed reveal threshold
  m: number // smoothed reveal amount
}

export default function TileReveal() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    const stage = stageRef.current
    if (!cv || !stage) return

    const ctx = cv.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const mouse = { x: -1e5, y: -1e5 }

    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let cw = 0, ch = 0, cols = 0, rows = 0
    let tiles: Tile[] = []
    let img: HTMLImageElement | null = null
    let imgLoaded = false
    let raf = 0
    let running = false
    let visible = false
    let born = 0
    let killed = false

    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, r)
      ctx.fill()
    }

    // fully-lit grid at rest colour — the reduced-motion frame
    const paintStatic = () => {
      const stepX = cw / cols, stepY = ch / rows
      const tw = stepX - GAP, th = stepY - GAP
      const rad = Math.min(3, tw * 0.22)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cw, ch)
      const w2 = tw * (1 + LIT_GROW), h2 = th * (1 + LIT_GROW)
      for (const t of tiles) {
        const g = Math.min(255, t.gy + LIT_LIFT) | 0
        ctx.fillStyle = \`rgb(\${g},\${g},\${g})\`
        rr(t.x + GAP / 2 - (w2 - tw) / 2, t.y + GAP / 2 - (h2 - th) / 2, w2, h2, rad + 2)
      }
    }

    const frame = (now: number) => {
      if (!running) return
      const stepX = cw / cols, stepY = ch / rows
      const tw = stepX - GAP, th = stepY - GAP
      const rad = Math.min(3, tw * 0.22)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cw, ch)

      const el = now - born
      const intro = el < REVEAL_TOTAL

      for (const t of tiles) {
        // intro: left-to-right staggered pop with a slight ease-out-back overshoot
        let scaleE = 1, revealA = 1
        if (intro) {
          const q = (el - t.delay) / REVEAL_DUR
          if (q <= 0) continue
          if (q < 1) {
            const u = q - 1
            scaleE = 1 + 2.2 * u * u * u + 1.2 * u * u
            revealA = Math.min(q * 1.6, 1)
          }
        }

        // two drifting waves multiply into travelling clusters
        const w1 = Math.sin(t.cx * 0.010 + now * 0.00040 + t.ph * 3.1)
        const w2 = Math.sin(t.cy * 0.012 - now * 0.00031 + t.ph * 1.7)
        let a = Math.max(0, w1 * w2)
        a = a * a * (3 - 2 * a) // smoothstep — soft cluster edges
        a *= 0.62 + 0.38 * Math.sin(now * 0.0016 + t.ph * 43.7) // per-tile twinkle

        const lit = LIT_FLOOR + (1 - LIT_FLOOR) * a
        const grow = (1 + LIT_GROW * lit) * scaleE
        const w3 = tw * grow, h3 = th * grow

        // scattered colour lens: fast in, slow out, so a moving cursor leaves a trail
        const d = Math.hypot(t.cx - mouse.x, t.cy - mouse.y)
        let target = 0
        if (d < REVEAL_RADIUS) {
          const f = 1 - d / REVEAL_RADIUS
          const ease = f * f * (3 - 2 * f)
          if (t.rnd < ease * 1.25) target = 1
        }
        t.m += (target - t.m) * (target > t.m ? 0.28 : 0.05)
        const m = t.m

        const cr = t.gy + (t.vr - t.gy) * m
        const cg = t.gy + (t.vg - t.gy) * m
        const cb = t.gy + (t.vb - t.gy) * m
        // suppress the white shimmer lift on revealed tiles, or the colour washes out
        const lift = LIT_LIFT * lit * (1 - 0.8 * m)

        ctx.globalAlpha = revealA
        ctx.fillStyle = \`rgb(\${Math.min(255, cr + lift) | 0},\${Math.min(255, cg + lift) | 0},\${Math.min(255, cb + lift) | 0})\`
        rr(
          t.x + GAP / 2 - (w3 - tw) / 2,
          t.y + GAP / 2 - (h3 - th) / 2,
          w3, h3, rad + 2 * lit,
        )
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(frame)
    }

    const start = () => {
      if (running || reduce || killed || !imgLoaded || !visible) return
      running = true
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }

    const build = () => {
      if (!imgLoaded || !img) return
      cw = Math.max(stage.clientWidth, 1)
      ch = Math.max(stage.clientHeight, 1)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.style.width = cw + 'px'
      cv.style.height = ch + 'px'
      cv.width = Math.floor(cw * dpr)
      cv.height = Math.floor(ch * dpr)

      cols = Math.max(8, Math.floor(cw / TILE))
      rows = Math.max(6, Math.floor(ch / TILE))

      // cover-crop the source to the stage, skyline anchored bottom
      let sx = 0, sy = 0, sW = img.width, sH = img.height
      const targetA = cw / ch
      if (img.width / img.height > targetA) {
        sW = img.height * targetA
        sx = (img.width - sW) / 2
      } else {
        sH = img.width / targetA
        sy = img.height - sH
      }

      const s = document.createElement('canvas')
      s.width = cols
      s.height = rows
      const sc = s.getContext('2d', { willReadFrequently: true })
      if (!sc) return
      sc.drawImage(img, sx, sy, sW, sH, 0, 0, cols, rows)
      const data = sc.getImageData(0, 0, cols, rows).data

      const stepX = cw / cols, stepY = ch / rows
      tiles = new Array(cols * rows)
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = (j * cols + i) * 4
          const r = data[k], g = data[k + 1], b = data[k + 2]
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
          const x = i * stepX, y = j * stepY
          // two uncorrelated deterministic hashes: one for the twinkle phase and
          // intro scatter, one for the lens threshold. Sharing a single hash would
          // make the tiles that light up also the tiles that twinkle, and the lens
          // edge would visibly rhyme with the shimmer.
          const ph = Math.abs((Math.sin(i * 127.1 + j * 311.7) * 43758.5453) % 1)
          const rnd = Math.abs((Math.sin(i * 269.5 + j * 183.3) * 24634.6345) % 1)
          tiles[j * cols + i] = {
            x, y,
            cx: x + stepX / 2,
            cy: y + stepY / 2,
            delay: (i / cols) * 900 + ph * 800,
            ph,
            gy: (lum * REST_DIM) | 0,
            vr: Math.max(0, Math.min(255, lum + (r - lum) * SAT)) | 0,
            vg: Math.max(0, Math.min(255, lum + (g - lum) * SAT)) | 0,
            vb: Math.max(0, Math.min(255, lum + (b - lum) * SAT)) | 0,
            rnd,
            m: 0,
          }
        }
      }

      // Leave the canvas clear when animating so the intro starts from nothing —
      // painting the settled grid first would flash the whole mosaic for a frame.
      if (reduce) paintStatic()
      else {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, cw, ch)
      }
    }

    const onMove = (ev: PointerEvent) => {
      const rect = cv.getBoundingClientRect()
      mouse.x = ev.clientX - rect.left
      mouse.y = ev.clientY - rect.top
    }
    const onOut = () => { mouse.x = -1e5; mouse.y = -1e5 }

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
      else stop()
    }, { threshold: 0.05 })

    img = new Image()
    img.onload = () => {
      if (killed) return
      imgLoaded = true
      born = performance.now()
      build()
      io.observe(stage)
    }
    img.src = IMG_SRC

    cv.addEventListener('pointermove', onMove, { passive: true })
    cv.addEventListener('pointerleave', onOut)
    const ro = new ResizeObserver(() => build())
    ro.observe(stage)

    return () => {
      // drop the load callback so a disposed instance can't re-observe and start a
      // ghost loop after cleanup
      killed = true
      if (img) img.onload = null
      stop()
      io.disconnect()
      ro.disconnect()
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerleave', onOut)
    }
  }, [])

  return (
    <div ref={stageRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}
`;export{n as default};
