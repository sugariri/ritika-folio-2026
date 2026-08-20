const n=`import { useEffect, useRef } from 'react'
import type { EffectMeta } from '../lib/types.ts'
import { readPalette } from '../lib/palette.ts'

export const meta: EffectMeta = {
  name: 'Dot Globe',
  description: 'A point cloud spins on a tilted axis, continents picked out against faint ocean haze',
  category: 'Background',
  tags: ['canvas', 'globe', '3d', 'particles', 'intro'],
  status: 'ready',
}

// A point cloud is scattered evenly over a unit sphere (Fibonacci distribution); each
// point is tested against an equirectangular land mask so continents come out
// dense/bright and oceans stay a sparse faint haze. The whole thing spins slowly on a
// tilted axis, orthographically projected to 2D. Dots on the near hemisphere are
// larger/brighter than the far side, and 'lighter' compositing lets the dense centre
// bloom. Intro: every dot assembles inward from the sphere's rim on a staggered ease, so
// the ring collapses into the mapped globe. No WebGL, no dependencies.
const MASK_SRC = '/assets/img/earth-equirect.jpg'

const SAMPLES = 9000 // fibonacci points before land filtering
const OCEAN_KEEP = 0.09 // fraction of ocean points kept as faint filler
const TILT = -0.36 // fixed view tilt (radians) — northern hemisphere up
const SPIN_SPEED = 0.16 // rotation, radians / second
const INTRO = 1.7 // intro assemble duration (s)

type Point = { x: number; y: number; z: number; land: boolean; seed: number }

export default function DotGlobe() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    const stage = stageRef.current
    if (!cv || !stage) return

    const ctx = cv.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Compositing, not just colour, is what the theme changes here. On a dark page the
    // dots are light sources: 'lighter' sums them, so the dense centre blooms. On a light
    // page there is nothing to bloom into — additive on white is just white — so the dots
    // become ink instead, laid down normally in deep blues that darken where they crowd.
    // Same geometry, same alphas, opposite direction.
    const { dark } = readPalette(stage)
    const LAND = dark ? '196,224,255' : '20,44,110'
    const OCEAN = dark ? '120,168,240' : '92,124,196'

    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let cw = 0, ch = 0, cx = 0, cy = 0, R = 0
    let raf = 0
    let points: Point[] = []
    let mask: Uint8ClampedArray | null = null
    let mw = 0, mh = 0
    let landCut = 0 // luminance below this counts as land
    let t0: number | null = null
    let disposed = false
    let visible = true // gated so off-screen tiles don't burn a rAF loop
    let ready = false
    let pausedAt: number | null = null

    const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3)

    const isLand = (lon: number, lat: number) => {
      if (!mask) return false
      const u = (lon + Math.PI) / (2 * Math.PI)
      const v = (Math.PI / 2 - lat) / Math.PI
      let px = (u * mw) | 0
      let py = (v * mh) | 0
      if (px < 0) px = 0
      else if (px >= mw) px = mw - 1
      if (py < 0) py = 0
      else if (py >= mh) py = mh - 1
      return mask[(py * mw + px) * 4] < landCut
    }

    const buildPoints = () => {
      points = []
      const N = SAMPLES
      const golden = Math.PI * (3 - Math.sqrt(5))
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2
        const rad = Math.sqrt(Math.max(0, 1 - y * y))
        const theta = golden * i
        const x = Math.cos(theta) * rad
        const z = Math.sin(theta) * rad
        const lat = Math.asin(y)
        const lon = Math.atan2(z, x)
        const land = isLand(lon, lat)
        // keep every land point; thin the oceans down to a faint scatter
        if (!land && ((i * 2654435761) % 1000) / 1000 > OCEAN_KEEP) continue
        points.push({ x, y, z, land, seed: (i % 97) / 97 })
      }
    }

    const size = () => {
      cw = Math.max(stage.clientWidth, 1)
      ch = Math.max(stage.clientHeight, 1)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.style.width = cw + 'px'
      cv.style.height = ch + 'px'
      cv.width = Math.floor(cw * dpr)
      cv.height = Math.floor(ch * dpr)
      cx = cw / 2
      cy = ch * 0.52
      R = Math.min(cw * 0.4, ch * 0.44)
    }

    const draw = (elapsed: number) => {
      const angle = SPIN_SPEED * elapsed
      const cosA = Math.cos(angle), sinA = Math.sin(angle)
      const cosT = Math.cos(TILT), sinT = Math.sin(TILT)
      const p = reduce ? 1 : Math.min(1, elapsed / INTRO)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cw, ch)
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'

      for (let k = 0; k < points.length; k++) {
        const pt = points[k]
        // spin about Y, then tilt about X
        const rx = pt.x * cosA + pt.z * sinA
        const rz = -pt.x * sinA + pt.z * cosA
        const ty = pt.y * cosT - rz * sinT
        const tz = pt.y * sinT + rz * cosT
        const tx = rx

        const front = (tz + 1) / 2 // 0 far … 1 near
        let sx = cx + tx * R
        let sy = cy - ty * R
        let alpha = pt.land ? 0.32 + 0.68 * front : 0.1 + 0.28 * front
        const rr = pt.land ? 0.55 + front * 1.35 : 0.35 + front * 0.7

        // intro: assemble inward from the rim on a staggered ease
        if (p < 1) {
          const local = Math.max(0, Math.min(1, (p - pt.seed * 0.42) / 0.58))
          const e = easeOutCubic(local)
          const mag = Math.hypot(tx, ty) || 1e-4
          const rimx = cx + (tx / mag) * R * 1.05
          const rimy = cy - (ty / mag) * R * 1.05
          sx = rimx + (sx - rimx) * e
          sy = rimy + (sy - rimy) * e
          alpha *= e
        }

        if (alpha < 0.012) continue
        // gentle twinkle for life
        if (!reduce) alpha *= 0.86 + 0.14 * Math.sin(elapsed * 1.7 + pt.seed * 43)

        // land reads solid, ocean stays a dimmer haze — which way round that is in tone
        // depends on the theme, but the relationship between them does not
        ctx.fillStyle = \`rgba(\${pt.land ? LAND : OCEAN},\${alpha.toFixed(3)})\`
        ctx.beginPath()
        ctx.arc(sx, sy, rr, 0, 6.2832)
        ctx.fill()
      }

      ctx.globalCompositeOperation = 'source-over'
    }

    const frame = (now: number) => {
      if (t0 == null) t0 = now
      draw((now - t0) / 1000)
      if (visible && !disposed) raf = requestAnimationFrame(frame)
    }

    const stopLoop = () => cancelAnimationFrame(raf)
    const startLoop = (now: number) => {
      if (reduce || disposed || !visible || !ready) return
      // Push the origin forward by however long we were parked, so the intro resumes
      // where it stopped instead of jumping to wherever the clock has got to.
      if (t0 != null && pausedAt != null) t0 += now - pausedAt
      pausedAt = null
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(frame)
    }

    const img = new Image()
    img.onload = () => {
      if (disposed) return

      const c = document.createElement('canvas')
      mw = c.width = 512
      mh = c.height = 256
      const mctx = c.getContext('2d', { willReadFrequently: true })
      if (!mctx) return
      mctx.drawImage(img, 0, 0, mw, mh)
      mask = mctx.getImageData(0, 0, mw, mh).data

      // The source is a near-black relief map: land sits far darker than ocean, but both
      // are dark in absolute terms, so a fixed cutoff would classify the whole sphere as
      // land. Split on the mask's own mean instead — that adapts to whatever image is
      // supplied here, however it happens to be exposed.
      let total = 0
      for (let i = 0; i < mask.length; i += 4) total += mask[i]
      landCut = total / (mask.length / 4)

      buildPoints()
      size()
      ready = true
      if (reduce) draw(INTRO + 6) // one settled static frame
      else startLoop(performance.now())
    }
    img.src = MASK_SRC

    // The tile and the drawer are different sizes, and the grid reflows — track the
    // element rather than the window.
    const ro = new ResizeObserver(() => {
      if (mask) size()
    })
    ro.observe(stage)

    // The gallery mounts every canvas at once, so a tile scrolled out of the grid must not
    // keep a rAF loop alive. The margin restarts it just before it comes back into view.
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) startLoop(performance.now())
      else { pausedAt = performance.now(); stopLoop() }
    }, { rootMargin: '160px' })
    io.observe(stage)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [])

  return (
    <div ref={stageRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}
`;export{n as default};
