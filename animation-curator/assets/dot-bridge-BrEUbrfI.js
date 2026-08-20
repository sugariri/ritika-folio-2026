const e=`import { useEffect, useRef } from 'react'
import type { EffectMeta } from '../lib/types.ts'
import { readPalette } from '../lib/palette.ts'

export const meta: EffectMeta = {
  name: 'Dot Bridge',
  description: 'A photo re-drawn as a field of coloured tiles that assemble left to right, and erase under the cursor',
  category: 'Background',
  tags: ['canvas', 'photo', 'mosaic', 'cursor', 'intro'],
  status: 'ready',
}

// The photo is sampled on a coarse grid and re-drawn as a field of tiles: each keeps its
// sampled colour, and its size follows the pixel's luminance, so bright structure comes
// out large while shadow fades to a faint haze. Cover-crops the source to the stage,
// bottom-anchored so the skyline stays put. Intro: a left-to-right staggered reveal —
// each cell pops in with an ease-out-back overshoot on a column-swept, scattered delay.
// Moving the cursor erases dots near it, and a gentle twinkle keeps the field alive.
// No WebGL, no dependencies. Static frame for reduced-motion visitors.
const IMG_SRC = '/assets/img/bay-bridge.avif'

const STEP = 10 // px between dot centres (before density clamp)
const INTRO = 1.7 // intro assemble duration (s)

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0)

type Dot = {
  x: number
  y: number
  r: number
  g: number
  b: number
  sw: number
  sh: number
  seed: number
  delay: number
  rnd: number
  a: number
}

export default function DotBridge() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    const stage = stageRef.current
    if (!cv || !stage) return

    const ctx = cv.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const { dark } = readPalette(stage)
    const mouse = { x: -9999, y: -9999 }

    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let cw = 0, ch = 0
    let dots: Dot[] = []
    let raf = 0
    let t0: number | null = null
    let running = false
    let img: HTMLImageElement | null = null
    let imgLoaded = false
    // low-res sampled photo, drawn under the dots so the gaps between cells carry the
    // scene's own colours rather than blank ground
    let base: HTMLCanvasElement | null = null

    const build = () => {
      if (!imgLoaded || !img) return
      cw = Math.max(stage.clientWidth, 1)
      ch = Math.max(stage.clientHeight, 1)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.style.width = cw + 'px'
      cv.style.height = ch + 'px'
      cv.width = Math.floor(cw * dpr)
      cv.height = Math.floor(ch * dpr)

      // keep the dot count bounded on very wide screens
      const cols = Math.min(190, Math.max(40, Math.floor(cw / STEP)))
      const rows = Math.max(20, Math.floor(cols * (ch / cw)))

      // cover-crop the source to the stage's aspect, skyline anchored bottom
      let sx = 0, sy = 0, sW = img.width, sH = img.height
      const targetA = cw / ch
      const srcA = img.width / img.height
      if (srcA > targetA) {
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
      // Soften the sampled frame a touch so the dot grid still reads as texture on top —
      // toward the page on a dark theme, away from it on a light one, since an underlay
      // washed white on white would leave the tiles floating on nothing.
      sc.fillStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(10,12,20,0.14)'
      sc.fillRect(0, 0, cols, rows)
      base = s

      const stepX = cw / cols, stepY = ch / rows
      dots = []
      // Paint each cell in its TRUE sampled colour, nudged away from the page so the
      // tiles keep their edge against it: lifted toward light on a dark theme, pulled
      // down on a light one, where an unmodified daylight photo would otherwise dissolve
      // into the white behind it. Kept small either way so the photo's saturation holds.
      const LIFT = dark ? 10 : -26
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = (j * cols + i) * 4
          const lum = (0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2]) / 255
          const x = i * stepX + stepX / 2
          const y = j * stepY + stepY / 2
          // deterministic per-dot phase for stagger + twinkle
          const seed = Math.abs((Math.sin(i * 127.1 + j * 311.7) * 43758.5453) % 1)
          dots.push({
            x,
            y,
            r: clamp8(data[k] + LIFT),
            g: clamp8(data[k + 1] + LIFT),
            b: clamp8(data[k + 2] + LIFT),
            // near-touching tiles so the photo's colour reads solid
            sw: stepX * (0.78 + 0.2 * lum),
            sh: stepY * (0.74 + 0.22 * lum),
            seed,
            // left-to-right sweep + per-cell scatter
            delay: (x / cw) * 0.9 + seed * 0.8,
            rnd: seed, // fixed erase threshold — the same dots always vanish
            a: 1, // smoothed hover alpha
          })
        }
      }
    }

    const draw = (elapsed: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cw, ch)

      // underlay: the blurred sampled photo fills the gaps between cells with each
      // region's own colour — no grid lines. Fades in with the intro.
      if (base) {
        ctx.imageSmoothingEnabled = true
        ctx.globalAlpha = reduce ? 1 : Math.min(elapsed / (INTRO * 0.7), 1)
        ctx.drawImage(base, 0, 0, cw, ch)
        ctx.globalAlpha = 1
      }

      const R = STEP * 12 // hover influence radius
      const mx = mouse.x, my = mouse.y
      const revealDur = 0.55

      for (let k = 0; k < dots.length; k++) {
        const dt = dots[k]
        // fully solid tiles — any translucency lets the wash bleed through
        let alpha = 1
        let scale = 1

        // intro: left-to-right staggered reveal with a slight ease-out-back overshoot
        if (!reduce) {
          const q = (elapsed - dt.delay) / revealDur
          if (q <= 0) continue
          if (q < 1) {
            const u = q - 1
            scale = 1 + 2.2 * u * u * u + 1.2 * u * u
            alpha *= Math.min(q * 1.6, 1)
          }
        }

        // hover: dots near the cursor fade out — odds rise toward the centre. rnd is
        // fixed per dot, so the same dots always vanish at a given cursor spot, reading
        // as erased pixels rather than a uniform dome.
        if (!reduce) {
          let target = 1
          const dm = Math.hypot(dt.x - mx, dt.y - my)
          if (dm < R) {
            const f = 1 - dm / R
            const ease = f * f * (3 - 2 * f)
            if (dt.rnd < ease * 1.25) target = 0
          }
          dt.a += (target - dt.a) * 0.2
          if (dt.a < 0.02) continue
          alpha *= dt.a
        }

        // gentle twinkle for life — subtle, so tiles stay solid-colour
        if (!reduce) alpha *= 0.94 + 0.06 * Math.sin(elapsed * 1.9 + dt.seed * 47)

        if (alpha < 0.015) continue
        const sw = dt.sw * scale, sh = dt.sh * scale
        ctx.fillStyle = \`rgba(\${dt.r},\${dt.g},\${dt.b},\${alpha.toFixed(3)})\`
        ctx.beginPath()
        ctx.roundRect(dt.x - sw / 2, dt.y - sh / 2, sw, sh, Math.min(sh * 0.4, 3))
        ctx.fill()
      }
    }

    const frame = (now: number) => {
      if (!running) return
      if (t0 == null) t0 = now
      draw((now - t0) / 1000)
      raf = requestAnimationFrame(frame)
    }

    let visible = true // gated so off-screen tiles don't burn a rAF loop
    let pausedAt: number | null = null

    const stopLoop = () => {
      running = false
      pausedAt = performance.now()
      cancelAnimationFrame(raf)
    }
    const startLoop = () => {
      if (reduce || !imgLoaded || !visible || running) return
      // Advance the origin past the parked interval, so the staggered intro carries on
      // from where it stopped rather than snapping to the end.
      if (t0 != null && pausedAt != null) t0 += performance.now() - pausedAt
      pausedAt = null
      running = true
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(frame)
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
    const onLeave = () => {
      mouse.x = -9999
      mouse.y = -9999
    }

    img = new Image()
    img.onload = () => {
      imgLoaded = true
      build()
      if (reduce) draw(INTRO + 6) // one settled static frame
      else startLoop()
    }
    img.src = IMG_SRC

    cv.addEventListener('pointermove', onMove, { passive: true })
    cv.addEventListener('pointerleave', onLeave)
    const ro = new ResizeObserver(() => build())
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
      // drop the load callback so a disposed instance (StrictMode double-mount) can't
      // start a ghost draw loop after cleanup
      if (img) img.onload = null
      running = false
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
