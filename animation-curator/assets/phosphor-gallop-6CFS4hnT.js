const e=`import { useEffect, useRef } from 'react'
import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Phosphor Gallop',
  description: 'A horse gallops in ASCII on a glowing phosphor board, each pose fading behind the next',
  category: 'Background',
  tags: ['canvas', 'ascii', 'text', 'loop', 'skeleton', 'phosphor', 'deterministic'],
  status: 'ready',
}

// A Muybridge gallop drawn in type. There is no sprite sheet and no video: the horse is a
// small articulated rig — barrel, neck, head, tail, mane and four legs — posed from a
// single \`phase\` value, rasterised into a character grid, and lit like a glow-in-the-dark
// board that keeps the last few poses as afterglow.
//
// Three decisions carry the whole effect:
//
// 1. The pose comes from inverse kinematics, not from authored joint angles. Each hoof
//    follows a plant-and-swing path around its own root and the knee or hock is solved
//    from it, so legs stay on the ground while planted and fold correctly while reaching.
//    That is the part the eye actually checks.
// 2. It redraws at FRAME_MS, not at rAF rate. The source footage is 12fps and the stepping
//    is most of its character — a smooth version reads like a screensaver. Between steps
//    the loop does nothing but keep the canvas up.
// 3. Brightness is a buffer, not a value. Each cell decays toward black and is re-lit by
//    the current pose, so limbs leave a trail behind them. That trail is what makes twelve
//    discrete poses a second read as one continuous run.
const GRID_COLS = 102
const GRID_ROWS = 46

const FRAME_MS = 1000 / 12 // stepped like the source footage
const STRIDE_MS = 900 // one full gallop cycle
// Per stepped frame. This wants to be smaller than it looks like it should be: the legs
// cross the whole lower half of the frame in about a third of a stride, so a trail of five
// frames is not five ghost legs, it is a grey haze under the horse with the horse lost in
// it. Two or three frames reads as motion; more reads as fog.
const DECAY = 0.34

// The board is the effect's own surface rather than the page's, in either theme — see
// \`paint\` for why.
const BOARD = '#07090b'

// The rig has its own coordinate space, and it is not the grid.
//
// A monospace glyph is about 0.6 as wide as it is tall, so the grid is proportioned to
// match — cells then tile with no gaps at a 4:3 frame. But that makes a cell a poor unit
// to model in: a circle authored in cells would draw as a tall ellipse, and the horse
// would come out narrow-chested and stilt-legged. So the rig is authored in isotropic
// units and the cell grid samples it, stretching x on the way in.
//
// Sizing the rig from the grid rather than from pixels is the other half of it. This was
// first drawn against a full-bleed section; a 320x240 tile is a fifth of that width, so
// any baked cell size put the head off-canvas. Fixing the grid and dividing the stage into
// it keeps one composition at every frame size.
const CELL_ASPECT = 0.6
// The horse is about 71 rig units nose to tail and 39 tall; the window is set a little
// wider than that so it sits in the frame with air around it, the way the board it is
// drawn on has an unlit margin.
const RIG_W = 66
const RIG_X0 = 3 // rig x at the left edge of the grid
const RIG_Y0 = -6.8 // rig y at the top edge — the mane flies above the withers
const RIG_H = (RIG_W * GRID_ROWS) / (GRID_COLS * CELL_ASPECT)

const GROUND = 34 // rig y the hooves plant on

// Dim to bright. Doubled up at the bottom, so the long tail of the decay and the shadow side
// both land on periods and colons and only genuinely lit cells reach a solid character.
const RAMP = ['.', '.', ':', ':', '-', '=', '+', '*', '#', '@']

// The light. This is the single most important number in the file: the horse is lit from
// above and a little behind, so the crest, back and croup glow and the belly, throat and
// legs fall away into the board. Filling the silhouette evenly instead — which is the
// obvious thing to do with a signed distance field — produces a green horse-shaped slab.
// The topline is the whole read.
const LX = -0.31
const LY = -0.95
const AMBIENT = 0.05 // how much of the trunk's shadow side survives
// A leg is two cells across. Lit by the same overhead lamp as the barrel it has no upward
// surface to speak of and simply vanishes, which is not what the board does — light wraps
// round something that thin. So limbs get most of their brightness as fill and only a little
// from the lamp, which keeps them dim, even, and present.
const LIMB_AMBIENT = 0.62
const EDGE = 0.9 // silhouette falloff in rig units, deliberately under one cell

type Seg = { x1: number; y1: number; x2: number; y2: number; r1: number; r2: number }
/** Three layers, because they are lit differently, not because they are drawn in order:
 *  the trunk takes the overhead lamp, the limbs need light wrapped around them or they
 *  disappear, and the off side sits back in the dark. */
type Pose = { body: Seg[]; legs: Seg[]; far: Seg[] }

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) ^ 0x5bf03635
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) >>> 0) / 4294967295
}

function seg(x1: number, y1: number, x2: number, y2: number, r1: number, r2 = r1): Seg {
  return { x1, y1, x2, y2, r1, r2 }
}

/** Distance to a tapered capsule. Not exact at the taper, but the grid is coarser than the
 *  error and it costs a fraction of the real one. */
function segDist(px: number, py: number, s: Seg): number {
  const dx = s.x2 - s.x1
  const dy = s.y2 - s.y1
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((px - s.x1) * dx + (py - s.y1) * dy) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = s.x1 + dx * t
  const cy = s.y1 + dy * t
  return Math.hypot(px - cx, py - cy) - (s.r1 + (s.r2 - s.r1) * t)
}

function fieldAt(px: number, py: number, segs: Seg[]): number {
  let d = Infinity
  for (let i = 0; i < segs.length; i++) {
    const v = segDist(px, py, segs[i])
    if (v < d) d = v
  }
  return d
}

/**
 * Two-bone IK: the joint between a root and an end effector.
 * \`bend\` is +1 for a joint that buckles backwards, which is how both the carpus and the
 * hock fold on a horse. Get the sign wrong and the legs bend like a person's.
 */
function ik(
  rx: number,
  ry: number,
  fx: number,
  fy: number,
  l1: number,
  l2: number,
  bend: number,
): [number, number] {
  const dx = fx - rx
  const dy = fy - ry
  const len = Math.hypot(dx, dy) || 1e-4
  const nx = dx / len
  const ny = dy / len
  // Clamped, so an over-reaching hoof straightens the leg instead of returning NaN.
  const d = Math.min(Math.max(len, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  return [rx + nx * a - ny * h * bend, ry + ny * a + nx * h * bend]
}

type LegSpec = {
  rootX: number
  rootY: number
  /** Fraction of the stride at which this hoof plants. */
  plant: number
  /** Bones: root -> mid -> fetlock, then a short pastern to the hoof. */
  l1: number
  l2: number
  pastern: number
  reachFwd: number
  reachBack: number
  lift: number
  /** Upper and lower thickness. */
  wide: number
  thin: number
  /** Hind legs get a stifle pushed forward of the femur line for the characteristic Z. */
  stifle: number
}

// A transverse gallop on the right lead: both hinds, then both fores, then suspension.
// The uneven offsets are what make it a gallop rather than a canter or a trot — space them
// evenly and it reads as a rocking horse.
const DUTY = 0.3 // fraction of the stride a hoof spends planted

const LEGS: LegSpec[] = [
  // off-side pair first, so it draws behind
  { rootX: 24, rootY: 17, plant: 0.0, l1: 11, l2: 9, pastern: 2.5, reachFwd: 9, reachBack: 10, lift: 9, wide: 1.9, thin: 0.55, stifle: 2.4 },
  { rootX: 47, rootY: 19, plant: 0.4, l1: 10, l2: 8.5, pastern: 2, reachFwd: 9, reachBack: 8, lift: 8, wide: 1.6, thin: 0.5, stifle: 0 },
  { rootX: 21, rootY: 18, plant: 0.12, l1: 11, l2: 9, pastern: 2.5, reachFwd: 9, reachBack: 10, lift: 9, wide: 2.2, thin: 0.7, stifle: 2.4 },
  { rootX: 45, rootY: 20, plant: 0.52, l1: 10, l2: 8.5, pastern: 2, reachFwd: 9, reachBack: 8, lift: 8, wide: 1.9, thin: 0.62, stifle: 0 },
]

const FAR_LEGS = 2

function fract(v: number): number {
  return v - Math.floor(v)
}

/** Where a hoof is at this point in the stride. */
function hoof(spec: LegSpec, phase: number): [number, number] {
  const u = fract(phase - spec.plant)
  if (u < DUTY) {
    // Planted. The horse runs in place, so the ground slides backwards under the hoof.
    const s = u / DUTY
    return [spec.rootX + spec.reachFwd - s * (spec.reachFwd + spec.reachBack), GROUND]
  }
  // Swinging: folds up fast off the ground and reaches out slowly, so the leg spends its
  // time extended in front rather than dangling underneath.
  const v = (u - DUTY) / (1 - DUTY)
  const ease = v * v * (3 - 2 * v)
  const arc = Math.sin(Math.PI * Math.pow(v, 0.72))
  return [
    spec.rootX - spec.reachBack + ease * (spec.reachFwd + spec.reachBack),
    GROUND - spec.lift * arc,
  ]
}

function buildPose(phase: number): Pose {
  const body: Seg[] = []
  const legs: Seg[] = []
  const far: Seg[] = []

  // Body attitude: the barrel rises into suspension and pitches nose-up as the hinds
  // drive, nose-down as the fores catch. One bob per stride, not one per beat.
  const lift = -1.7 * Math.cos(2 * Math.PI * (phase - 0.06))
  const pitch = 0.1 * Math.sin(2 * Math.PI * (phase - 0.34))
  const cos = Math.cos(pitch)
  const sin = Math.sin(pitch)
  const PX = 34
  const PY = 17

  // Everything above the hooves rides this transform; hooves are solved in world space
  // afterwards, so a planted foot stays planted while the barrel travels over it.
  const bx = (x: number, y: number) => PX + (x - PX) * cos - (y - PY) * sin
  const by = (x: number, y: number) => PY + (x - PX) * sin + (y - PY) * cos + lift

  const put = (x1: number, y1: number, x2: number, y2: number, r1: number, r2 = r1) => {
    body.push(seg(bx(x1, y1), by(x1, y1), bx(x2, y2), by(x2, y2), r1, r2))
  }

  // The trunk is a chain of four capsules, and the only thing being modelled is the topline:
  // croup high, a dip at the loin, up again to the withers. With the lamp overhead that
  // curve is the brightest thing on the board and it is what the eye names the animal by —
  // an even sausage of a barrel, which is what this was first, reads as a lit log no matter
  // how good the legs underneath it are.
  put(21, 16.5, 27, 16.5, 6.0, 5.8) // croup
  put(27, 16.5, 35, 17.8, 5.8, 5.4) // loin — the dip
  put(35, 17.8, 43, 16.0, 5.4, 6.2) // barrel, rising
  put(43, 16.0, 48.5, 19.5, 6.2, 4.6) // shoulder, falling away to the chest

  // Neck and head. The head reaches out and drops as the horse extends, then gathers back
  // in — a horse that gallops with a fixed neck looks embalmed.
  const reach = 1.7 * Math.sin(2 * Math.PI * (phase - 0.52))
  // A galloping horse carries its neck at roughly 40 degrees. Laid flatter than that — which
  // is what happens if you reach for length — the neck stops being a separate limb and the
  // whole animal becomes one horizontal bar from dock to muzzle.
  const pollX = 57 + reach
  const pollY = 4 + reach * 0.6
  // The neck tapers hard. An even-width neck welds the head to the shoulder and the horse
  // loses its head — literally: at this grid the throat notch is only two cells deep, and
  // it is the only thing telling the eye where the neck stops.
  put(46.5, 14, pollX, pollY, 5.4, 1.9)
  put(pollX, pollY, pollX + 6.2, pollY + 4.8, 1.9, 1.1) // face
  put(pollX + 0.2, pollY + 1.4, pollX + 3.4, pollY + 3.8, 1.5, 1.0) // jaw
  put(pollX - 0.4, pollY - 0.4, pollX - 1.5, pollY - 2.6, 0.65, 0.22) // ears
  put(pollX + 0.9, pollY - 0.4, pollX + 0.3, pollY - 2.6, 0.65, 0.22)

  // Mane: short strands standing off the crest, flicked up hardest through suspension.
  // Lengths come from a hash rather than a random, so the crest is the same shape on every
  // mount — two tiles of this are on screen at once and a differing silhouette reads as a
  // bug. They are kept short on purpose: at twice this length twelve of them merge into one
  // wedge and the horse grows a sail.
  const flick = Math.sin(2 * Math.PI * (phase - 0.2))
  for (let i = 0; i < 12; i++) {
    // Stops short of the poll: strands that reach the top of the head read as a crown.
    const t = (i / 11) * 0.82
    const cx = 47.5 + (pollX - 47.5) * t
    const cy = 12.6 + (pollY - 12.6) * t - 3.4
    const len = 1.6 + hash(11, i) * 2.2
    const sway = flick * (0.5 + t * 0.7) + (hash(13, i) - 0.5) * 0.8
    put(cx, cy, cx - len * 0.55 + sway * 0.5, cy - len * 0.8 - sway * 0.9, 0.55, 0.16)
  }

  // Tail: a trailing chain, each link lagging the one before it, so it whips a beat behind
  // the body rather than swinging rigidly with it.
  // It leaves below the croup and streams back and down, not straight back. Level with the
  // croup the tail and the back form one unbroken bright line from nose to dock and the
  // horse loses its hindquarters — the fall away behind the dock is what makes a rump.
  let tx = 20.5
  let ty = 14.5
  let ang = Math.PI + 0.3 + 0.2 * Math.sin(2 * Math.PI * (phase - 0.3))
  for (let i = 0; i < 6; i++) {
    const t = i / 5
    const len = 2.5 - t * 0.5
    const nx = tx + Math.cos(ang) * len
    const ny = ty + Math.sin(ang) * len
    put(tx, ty, nx, ny, 1.9 - t * 1.1, 1.7 - t * 1.1)
    tx = nx
    ty = ny
    ang -= 0.1 + 0.22 * Math.sin(2 * Math.PI * (phase - 0.3) - t * 1.9)
  }

  // A dim scuff of ground, so the hooves land on something instead of stopping in mid-air.
  far.push(seg(16, GROUND + 1.6, 54, GROUND + 1.6, 0.28))

  for (let i = 0; i < LEGS.length; i++) {
    const spec = LEGS[i]
    const list = i < FAR_LEGS ? far : legs
    const rx = bx(spec.rootX, spec.rootY)
    const ry = by(spec.rootX, spec.rootY)
    const [fx, fy] = hoof(spec, phase)

    const [mx, my] = ik(rx, ry, fx, fy, spec.l1, spec.l2, 1)
    // The pastern continues the cannon's line rather than dropping vertically, so the hoof
    // stays in line with the leg through the swing.
    const cdx = fx - mx
    const cdy = fy - my
    const clen = Math.hypot(cdx, cdy) || 1
    const hx = fx + (cdx / clen) * spec.pastern
    const hy = Math.min(fy + (cdy / clen) * spec.pastern, GROUND + 0.7)

    if (spec.stifle > 0) {
      // Hind: femur forward to the stifle, gaskin back to the hock.
      const sx = (rx + mx) / 2 + spec.stifle
      const sy = (ry + my) / 2
      list.push(seg(rx, ry, sx, sy, spec.wide + 1.2, spec.wide * 0.7))
      list.push(seg(sx, sy, mx, my, spec.wide * 0.7, spec.thin + 0.35))
    } else {
      list.push(seg(rx, ry, mx, my, spec.wide + 0.7, spec.thin + 0.4))
    }
    list.push(seg(mx, my, fx, fy, spec.thin + 0.35, spec.thin))
    list.push(seg(fx, fy, hx, hy, spec.thin, spec.thin * 1.5))
  }

  return { body, legs, far }
}

const DX = RIG_W / GRID_COLS // rig units per column
const DY = RIG_H / GRID_ROWS // rig units per row

/** Signed distance to the rig at every cell centre, into \`out\`. */
function rasterize(segs: Seg[], out: Float32Array): void {
  for (let r = 0; r < GRID_ROWS; r++) {
    const py = RIG_Y0 + ((r + 0.5) / GRID_ROWS) * RIG_H
    for (let c = 0; c < GRID_COLS; c++) {
      const px = RIG_X0 + ((c + 0.5) / GRID_COLS) * RIG_W
      out[r * GRID_COLS + c] = fieldAt(px, py, segs)
    }
  }
}

/**
 * Lit coverage for one cell of a rasterised distance field.
 *
 * The surface normal is the gradient of the field, and it is read from the neighbouring
 * cells rather than from four fresh distance queries — the field is already on the grid, so
 * this is the difference between one query per cell and five, on every one of twelve frames
 * a second.
 *
 * The edge itself is hard, fading over less than a cell. An earlier version let the
 * silhouette fall away softly, which is the obvious way to draw a glow and wrong here: soft
 * edges plus grain plus afterglow left no continuous outline anywhere and the horse read as
 * a cloud. A phosphor board is charged or it isn't.
 */
function shade(d: Float32Array, c: number, r: number, amb: number): number {
  const i = r * GRID_COLS + c
  const dv = d[i]
  if (dv > EDGE) return 0
  const m = dv > 0 ? 1 - dv / EDGE : 1

  const gx = ((c < GRID_COLS - 1 ? d[i + 1] : dv) - (c > 0 ? d[i - 1] : dv)) / (2 * DX)
  const gy = ((r < GRID_ROWS - 1 ? d[i + GRID_COLS] : dv) - (r > 0 ? d[i - GRID_COLS] : dv)) / (2 * DY)
  const len = Math.hypot(gx, gy)
  const raw = len > 1e-4 ? (gx * LX + gy * LY) / len : 0
  // Half-Lambert rather than a clamped dot. Clamping lights only the cells whose normal
  // points within 90 degrees of the lamp, which on a barrel is the top third and reads as a
  // stripe along the spine. Wrapping the term carries light most of the way down the flank
  // and leaves just the belly dark, which is what the board actually does.
  // The exponent is the contrast knob and it wants to be low. Anything steep lights the
  // spine and nothing else, and a horse whose only lit part is its topline is a glowing
  // stick. Just above linear carries light down the whole flank and still lets the belly go
  // black, which is the shape the board actually shows.
  const h = 0.5 + 0.5 * raw
  const n = h * Math.pow(h, 0.15)

  let v = amb + (1 - amb) * n
  // Hottest just inside the lit edge — the crest and the topline, where a real board would
  // have taken the most charge.
  if (dv > -1.8 && n > 0.35) v *= 1.3
  return m * v
}

/** How hard the board took the charge here. Two drifting octaves, so the fill is blotchy at
 *  two scales and never settles into a pattern the eye can name. */
function charge(px: number, py: number, t: number): number {
  const a = Math.sin(px * 0.135 - py * 0.09 + t * 0.8)
  const b = Math.sin(px * 0.052 + py * 0.21 - t * 0.5)
  return 0.5 + 0.29 * a + 0.21 * b
}

export default function PhosphorGallop() {
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
    let raf = 0
    let running = false

    // Persistent brightness, one entry per cell. This is the phosphor: the pose writes into
    // it and it is never cleared, only decayed.
    const lum = new Float32Array(GRID_COLS * GRID_ROWS)
    // Scratch distance fields for the two depth layers, reused every step.
    const dn = new Float32Array(GRID_COLS * GRID_ROWS)
    const dl = new Float32Array(GRID_COLS * GRID_ROWS)
    const df = new Float32Array(GRID_COLS * GRID_ROWS)

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

    const step = (bucket: number) => {
      const phase = fract((bucket * FRAME_MS) / STRIDE_MS)
      const { body, legs, far } = buildPose(phase)
      const t = (bucket * FRAME_MS) / 1000
      rasterize(body, dn)
      rasterize(legs, dl)
      rasterize(far, df)

      for (let r = 0; r < GRID_ROWS; r++) {
        const py = RIG_Y0 + ((r + 0.5) / GRID_ROWS) * RIG_H
        for (let c = 0; c < GRID_COLS; c++) {
          const px = RIG_X0 + ((c + 0.5) / GRID_COLS) * RIG_W

          let v = shade(dn, c, r, AMBIENT)
          const nl = shade(dl, c, r, LIMB_AMBIENT) * 0.85
          if (nl > v) v = nl
          const f = shade(df, c, r, LIMB_AMBIENT) * 0.28 // the off side sits back in the dark
          if (f > v) v = f

          if (v > 0) {
            // Uneven charge at two scales, then per-cell grain, then a sparse re-excite.
            // Together they are what make the fill read as thousands of characters catching
            // the light rather than as a lit polygon.
            v *= 0.62 + 0.45 * charge(px, py, t)
            v *= 0.76 + 0.28 * hash(c, r)
            if (hash(c * 7 + r * 13, bucket) > 0.93) v *= 1.5
            // The shadow side is thinned out rather than dimmed. Left uniformly faint it
            // renders as a solid field of periods — a grey horse-shaped smudge under the lit
            // one, which is worse than no shadow side at all. Dropping most of those cells
            // leaves scattered specks, and the silhouette stays the lamp's to describe.
            if (v < 0.2 && hash(c * 31 + r, bucket >> 2) > 0.34) v = 0
          }

          const i = r * GRID_COLS + c
          const decayed = lum[i] * DECAY
          lum[i] = v > decayed ? v : decayed
        }
      }
    }

    const paint = () => {
      const cw = W / GRID_COLS
      const chh = H / GRID_ROWS

      ctx.clearRect(0, 0, W, H)

      // A phosphor board is a dark object — that is what phosphor is for — so this effect
      // paints its own instead of borrowing the page's. Under the dark theme that is very
      // nearly a no-op; under the light one it is the whole point, because green glow on
      // white is not a paler version of this effect, it is a different and worse one.
      ctx.fillStyle = BOARD
      ctx.fillRect(0, 0, W, H)

      // On top of the board: a faint charged wash behind the type, so the dark reads as a
      // surface rather than a hole. Sized to the frame, like everything else here.
      const wash = ctx.createRadialGradient(W * 0.5, H * 0.48, 0, W * 0.5, H * 0.48, W * 0.6)
      wash.addColorStop(0, 'rgba(44,116,72,0.15)')
      wash.addColorStop(0.6, 'rgba(28,76,50,0.06)')
      wash.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = wash
      ctx.fillRect(0, 0, W, H)

      ctx.font = \`400 \${(chh * 1.05).toFixed(1)}px ui-monospace, SFMono-Regular, Menlo, monospace\`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const v = lum[r * GRID_COLS + c]
          if (v < 0.11) continue
          const k = v < 1 ? v : 1
          const ch = RAMP[Math.min(RAMP.length - 1, Math.floor(k * RAMP.length))]
          // Hot cells run toward white the way a real phosphor clips; the tail of the decay
          // stays saturated green.
          const g = 195 + Math.round(60 * k)
          const rr = Math.round(56 + 165 * k * k)
          const b = Math.round(104 + 96 * k * k)
          ctx.fillStyle = \`rgba(\${rr},\${g},\${b},\${(0.14 + 0.86 * k).toFixed(3)})\`
          ctx.fillText(ch, (c + 0.5) * cw, (r + 0.5) * chh)
        }
      }
    }

    // Time origin, shifted forward by however long the tile spent off screen, so the gallop
    // resumes mid-stride instead of teleporting.
    let t0 = 0
    let started = false
    let lastBucket = -1

    const frame = (now: number) => {
      if (!running) return
      if (!started) {
        t0 = now
        started = true
      }
      const bucket = Math.floor((now - t0) / FRAME_MS)
      if (bucket !== lastBucket) {
        // Catch up at most a couple of steps; a dropped frame should not replay the gap.
        for (let b = Math.max(lastBucket + 1, bucket - 2); b <= bucket; b++) step(b)
        lastBucket = bucket
        paint()
      }
      raf = requestAnimationFrame(frame)
    }

    let visible = true
    let pausedAt = 0

    const stopLoop = () => {
      if (!running) return
      running = false
      pausedAt = performance.now()
      cancelAnimationFrame(raf)
    }
    const startLoop = () => {
      if (reduce || !visible || running) return
      if (started && pausedAt) t0 += performance.now() - pausedAt
      pausedAt = 0
      running = true
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(frame)
    }

    const settle = () => {
      // Reduced motion gets a single pose, built over a few steps so it keeps the afterglow
      // and reads as a considered image rather than an outline.
      lum.fill(0)
      for (let b = 0; b < 4; b++) step(b)
      paint()
    }

    resize()
    if (reduce) settle()
    else startLoop()

    const ro = new ResizeObserver(() => {
      resize()
      if (reduce) settle()
      else paint() // cells are stage-relative, so a resize only needs a repaint
    })
    ro.observe(stage)

    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting
        if (visible) startLoop()
        else stopLoop()
      },
      { rootMargin: '160px' },
    )
    io.observe(stage)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [])

  return (
    <div ref={stageRef} className="absolute inset-0 bg-black">
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}
`;export{e as default};
