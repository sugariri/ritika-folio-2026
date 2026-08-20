const e=`import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Iso Assemble',
  description: 'Seven isometric pieces glide in on staggered beats, settle into a cube, and fade to begin again',
  category: 'Motion',
  tags: ['svg', 'isometric', 'keyframes', 'loop'],
  status: 'ready',
}

// A 3×3×3 cube assembled from seven interlocking pieces, drawn in plain isometric
// projection: P() flattens a lattice point, and each cell paints only the three faces a
// viewer can see (top, right, left). Cells are drawn back-to-front by i+j+k so the near
// ones overlap correctly — there is no z-buffer here, only paint order.
//
// The cycle is long and most of it is the hold. The stagger is packed into the first
// third, so the assembled form stands still for roughly half the loop before fading:
// this is a thing that settles and stays settled, glanced at rather than watched.
const CYCLE_SECONDS = 7
const U = 95 // cube edge, in projection units
const C = 1.5 * U // half the 3-cube, so the lattice centres on 0

const P = (x: number, y: number, z: number): [number, number] => [
  (x - y) * 0.866,
  (x + y) * 0.5 - z,
]
const pt = (p: [number, number]) => \`\${p[0].toFixed(1)} \${p[1].toFixed(1)}\`

// The three visible faces share one recipe: the canvas colour, with the two shaded
// faces tinted just enough that a cube's own edges stay legible against its neighbours.
const FACE = {
  t: 'var(--color-surface)',
  r: 'color-mix(in srgb, var(--color-accent) 5%, var(--color-surface))',
  l: 'color-mix(in srgb, var(--color-accent) 11%, var(--color-surface))',
}

/* Each piece names its cells and the offset it flies in from. The offsets are short — a
   little under one cube edge — so a piece reads as easing into place rather than flying
   across the panel; the direction says which way it came from, everything past that is
   only travel. */
const PIECES: { cells: [number, number, number][]; from: [number, number, number] }[] = [
  { cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0], [0, 2, 0]], from: [-85, 0, 0] },
  { cells: [[1, 1, 0], [2, 1, 0], [1, 2, 0], [2, 2, 0]], from: [0, 85, 0] },
  { cells: [[0, 0, 1], [1, 0, 1], [2, 0, 1]], from: [0, -85, 0] },
  { cells: [[0, 1, 1], [1, 1, 1], [0, 2, 1], [1, 2, 1]], from: [-85, 0, 0] },
  { cells: [[2, 1, 1], [2, 2, 1], [2, 1, 2], [2, 2, 2]], from: [90, 0, 0] },
  { cells: [[0, 0, 2], [1, 0, 2], [2, 0, 2], [0, 1, 2], [0, 2, 2]], from: [0, 0, 90] },
  { cells: [[1, 1, 2], [1, 2, 2]], from: [0, 0, 110] },
]

// flattened and sorted back-to-front — see the paint-order note above
const CELLS = PIECES.flatMap((piece, pi) =>
  piece.cells.map((c) => ({ c, pi, d: c[0] + c[1] + c[2] })),
).sort((a, b) => a.d - b.d)

/* One keyframe track per piece: hold off-screen, slide in on a staggered beat, hold
   assembled, then fade before the loop restarts. The reduced-motion rule parks every
   piece assembled instead of removing it. */
const KEYFRAMES =
  PIECES.map((p, pi) => {
    const [fx, fy, fz] = p.from
    const dx = ((fx - fy) * 0.866).toFixed(1)
    const dy = ((fx + fy) * 0.5 - fz).toFixed(1)
    const inA = 3 + pi * (31 / PIECES.length)
    const inB = inA + 7
    return (
      \`@keyframes ac-iso-\${pi}{\` +
      \`0%{opacity:0;transform:translate(\${dx}px,\${dy}px)}\` +
      \`\${inA.toFixed(1)}%{opacity:0;transform:translate(\${dx}px,\${dy}px)}\` +
      \`\${inB.toFixed(1)}%{opacity:1;transform:translate(0,0)}\` +
      \`88%{opacity:1;transform:translate(0,0)}\` +
      \`97%{opacity:0;transform:translate(0,0)}\` +
      \`100%{opacity:0;transform:translate(\${dx}px,\${dy}px)}}\`
    )
  }).join('') +
  '.ac-iso-face{stroke:var(--color-accent);stroke-width:2.5;stroke-linejoin:round}' +
  '.ac-iso-axis{stroke:var(--color-line-strong);stroke-width:2}' +
  '@media (prefers-reduced-motion: reduce){' +
  '.ac-iso-piece{animation:none!important;opacity:1!important;transform:none!important}}'

function Cell({ c, pi }: { c: [number, number, number]; pi: number }) {
  const [i, j, k] = c
  const x0 = i * U - C, x1 = x0 + U
  const y0 = j * U - C, y1 = y0 + U
  const z0 = k * U, z1 = z0 + U

  const face = (pts: [number, number][], fill: string) => (
    <path key={fill} className="ac-iso-face" d={\`M \${pts.map(pt).join(' L ')} Z\`} fill={fill} />
  )

  return (
    <g
      className="ac-iso-piece"
      style={{ animation: \`ac-iso-\${pi} \${CYCLE_SECONDS}s ease-in-out infinite\` }}
    >
      {face([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], FACE.t)}
      {face([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], FACE.r)}
      {face([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], FACE.l)}
    </g>
  )
}

export default function IsoAssemble() {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <style>{KEYFRAMES}</style>
      <svg className="h-full w-full" viewBox="-430 -572.5 860 860" aria-hidden="true" focusable="false">
        {/* ground axes, sunk to the lattice floor so the stack reads as seated */}
        <g style={{ transform: \`translateY(\${(1.5 * U + 0.5).toFixed(1)}px)\` }}>
          <path className="ac-iso-axis" d={\`M \${pt(P(-560, 0, 0))} L \${pt(P(560, 0, 0))}\`} />
          <path className="ac-iso-axis" d={\`M \${pt(P(0, -560, 0))} L \${pt(P(0, 560, 0))}\`} />
        </g>
        {CELLS.map((cell, idx) => (
          <Cell key={idx} {...cell} />
        ))}
      </svg>
    </div>
  )
}
`;export{e as default};
