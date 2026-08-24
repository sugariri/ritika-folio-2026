const e=`import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Cell Flow',
  description: 'A value lifts out of one grid, arcs across the gap, and lands filling a cell in another',
  category: 'Motion',
  tags: ['spreadsheet', 'arc', 'loop', 'css-only'],
  status: 'ready',
}

// A value being carried from one place to another, told entirely in keyframe percentages.
// Three tracks share a 4s period and hand off to each other:
//
//   6–52%   the chip lifts out of the source cell and flies across
//   54–88%  the destination cell fills in behind it
//   4–16%   the source cell flashes as the value is pulled
//
// The arc is the part worth looking at. There is no path and no easing curve doing the
// bending — the chip animates \`left\` and \`top\` independently, and the vertical track peaks
// (top: 16%) at a keyframe that is *not* the horizontal midpoint. Two straight tweens with
// staggered extremes describe a curve between them. It costs one extra keyframe stop.
//
// Animating \`left\`/\`top\` rather than \`transform\` means layout work every frame. That is
// deliberate here: percentage offsets stay correct at any tile size, and there are exactly
// two moving elements. Do this to fifty and use transforms instead.
const DURATION = '4s'

const SOURCE_ROWS = [
  ['Revenue', '4,281'],
  ['COGS', '1,904'],
  ['Gross', '2,377'],
]

export default function CellFlow() {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <style>{\`
        .ac-cf { --ac-cf-dur: \${DURATION}; position: relative; width: 100%; max-width: 300px }

        /* the value in flight */
        .ac-cf-chip {
          position: absolute; z-index: 2; pointer-events: none;
          padding: 3px 8px; border-radius: 7px;
          font-family: var(--font-mono); font-size: 11px; font-weight: 600; font-style: normal;
          color: var(--color-accent-green);
          background: var(--color-raised); border: 1px solid color-mix(in srgb, var(--color-accent-green) 45%, transparent);
          box-shadow: 0 8px 18px -8px var(--color-shadow);
          opacity: 0;
          animation: ac-cf-pull var(--ac-cf-dur) ease-in-out infinite;
        }
        @keyframes ac-cf-pull {
          0%, 6%    { left: 14%; top: 25%; opacity: 0; transform: scale(.85) }
          12%       { opacity: 1; transform: scale(1) }
          32%       { top: 4% }
          52%       { left: 62%; top: 68%; opacity: 1; transform: scale(1) }
          58%, 100% { left: 64%; top: 72%; opacity: 0; transform: scale(.7) }
        }

        /* the source cell flashes at the moment the value is taken */
        .ac-cf-src {
          animation: ac-cf-flash var(--ac-cf-dur) ease-out infinite;
        }
        @keyframes ac-cf-flash {
          0%, 4%, 16%, 100% { background: transparent }
          8% { background: color-mix(in srgb, var(--color-accent-green) 16%, transparent) }
        }

        /* the destination fills in once the chip has landed */
        .ac-cf-fill {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          font-family: var(--font-mono); font-size: 11px; font-weight: 600;
          color: var(--color-accent-green); background: color-mix(in srgb, var(--color-accent-green) 10%, transparent);
          box-shadow: inset 0 0 0 1.5px var(--color-accent-green); border-radius: 4px;
          opacity: 0;
          animation: ac-cf-cellfill var(--ac-cf-dur) ease-in-out infinite;
        }
        @keyframes ac-cf-cellfill {
          0%, 54%   { opacity: 0 }
          60%, 88%  { opacity: 1 }
          97%, 100% { opacity: 0 }
        }

        /* the live dot — a ring that expands and dies rather than a fade in and out */
        .ac-cf-live {
          width: 7px; height: 7px; border-radius: 50%; background: var(--color-accent-green);
          animation: ac-cf-live 2s ease-out infinite;
        }
        @keyframes ac-cf-live {
          0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent-green) 50%, transparent) }
          70%  { box-shadow: 0 0 0 8px transparent }
          100% { box-shadow: 0 0 0 0 transparent }
        }

        @media (prefers-reduced-motion: reduce) {
          .ac-cf-chip { display: none }
          .ac-cf-src, .ac-cf-live { animation: none }
          .ac-cf-fill { animation: none; opacity: 1 }
        }
      \`}</style>

      <div className="ac-cf">
        {/* source grid */}
        <div className="rounded-lg border border-line bg-surface font-mono text-[10px] text-muted">
          {SOURCE_ROWS.map(([label, value], i) => (
            <div
              key={label}
              className={\`flex items-center justify-between border-line px-3 py-1.5\${i < SOURCE_ROWS.length - 1 ? ' border-b' : ''}\${i === 0 ? ' ac-cf-src' : ''}\`}
            >
              <span>{label}</span>
              <span className="text-ink">{value}</span>
            </div>
          ))}
        </div>

        {/* destination */}
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
          <span className="ac-cf-live shrink-0" />
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">B12</span>
          <span className="relative ml-auto h-6 w-[74px] rounded border border-line-strong bg-canvas">
            <span className="ac-cf-fill">4,281</span>
          </span>
        </div>

        <i className="ac-cf-chip">4,281</i>
      </div>
    </div>
  )
}
`;export{e as default};
