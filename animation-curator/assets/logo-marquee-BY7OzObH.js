const e=`import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Logo Marquee',
  description: 'A row of names drifts sideways forever, dissolving into both edges',
  category: 'Motion',
  tags: ['marquee', 'seamless-loop', 'mask', 'css-only'],
  status: 'ready',
}

// The horizontal counterpart to Check Marquee, and the smallest possible version of the
// trick: render the list twice, translate the track by exactly -50%, loop.
//
// Why -50% and not the measured width of one copy: the track holds two identical groups,
// so half of it is one group. When the animation restarts, the second group is sitting
// precisely where the first was and the reset is invisible — no measuring, no rAF, no
// modulo bookkeeping, and it stays correct when the font loads late or the container
// resizes, because the percentage is resolved against whatever the track currently is.
//
// The two things that give it away if you skip them are both here. The second group is
// \`aria-hidden\`, or a screen reader reads the list twice. And the edges are masked rather
// than covered with a gradient overlay, so the effect drops onto any background instead of
// only onto the one the gradient was mixed against.
const NAMES = [
  { name: 'Northshore', role: 'Client' },
  { name: 'Halvorsen', role: 'Partner' },
  { name: 'Bright Meadow', role: 'Investor' },
  { name: 'Castellan', role: 'Client' },
  { name: 'Ravel & Co', role: 'Partner' },
]

const DURATION = '22s'

export default function LogoMarquee() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <style>{\`
        .ac-lm-vp {
          width: 100%; overflow: hidden;
          -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%);
        }
        .ac-lm-track {
          display: flex; width: max-content;
          will-change: transform;
          animation: ac-lm-scroll \${DURATION} linear infinite;
        }
        @keyframes ac-lm-scroll { to { transform: translateX(-50%) } }

        .ac-lm-group { display: flex; flex: none; }
        /* Spacing is padding on the item, not a gap on the group: with a gap the two
           groups would be separated by one more gap than they contain, so -50% would not
           be one group wide and the seam would show up as a small jump each loop. */
        .ac-lm-item {
          display: flex; flex-direction: column; gap: 3px;
          padding: 0 20px; white-space: nowrap;
        }

        @media (prefers-reduced-motion: reduce) {
          .ac-lm-track { animation: none }
        }
      \`}</style>

      <div className="ac-lm-vp">
        <div className="ac-lm-track">
          {[0, 1].map((copy) => (
            <div className="ac-lm-group" key={copy} aria-hidden={copy === 1}>
              {NAMES.map((item, i) => (
                <span className="ac-lm-item" key={\`\${copy}-\${i}\`}>
                  <span className="text-[15px] tracking-tight text-ink">{item.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-faint">
                    {item.role}
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
`;export{e as default};
