const e=`import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Suggest Pop',
  description: 'A suggestion list tips forward out of the page, one row at a time',
  category: 'Motion',
  tags: ['3d', 'perspective', 'stagger', 'entrance', 'css-only'],
  status: 'ready',
}

// The entrance an autocomplete panel wants: not a fade, not a slide, but the list tipping
// up out of the page toward the reader.
//
// It is one \`rotateX\` on a long perspective. At 1500px the vanishing point is far enough
// away that an 11-degree tilt shears the rows only slightly — the top edge recedes, the
// text stays readable throughout, and the whole thing reads as a physical panel rather
// than as a 3D effect. Shorten the perspective and the same rotation distorts the type
// badly; the number is doing more work here than the angle is.
//
// Note the order the transform is written in. Transforms apply right to left, so
// \`perspective() rotateX() scale() translateY()\` moves the row, sizes it, tilts it, then
// projects the result. Swapping \`rotateX\` and \`translateY\` tilts the row about an axis it
// has already moved away from, and the arc it swings through changes completely.
//
// Every row runs the identical keyframe track; only \`animation-delay\` differs. The
// staggered arrival is the entire choreography, and it costs one custom property.
const ROWS = [
  { label: 'Summarise the Q3 variance', hint: '⏎' },
  { label: 'Compare against consensus', hint: '' },
  { label: 'Rebuild the debt schedule', hint: '' },
  { label: 'Draft the committee memo', hint: '' },
]

const DURATION = '5.2s'
const STAGGER = 0.09 // s between rows

export default function SuggestPop() {
  return (
    <div className="absolute inset-0 grid place-items-center px-6">
      <style>{\`
        .ac-sp-row {
          transform-origin: 50% 0;
          opacity: 0;
          animation: ac-sp-pop \${DURATION} infinite both;
        }
        @keyframes ac-sp-pop {
          0%, 4% {
            opacity: 0;
            transform: perspective(1500px) rotateX(-11deg) scale(.9) translateY(-14px);
            animation-timing-function: var(--ease-out-quart);
          }
          16%, 82% {
            opacity: 1;
            transform: perspective(1500px) rotateX(0deg) scale(1) translateY(0);
            animation-timing-function: ease-in;
          }
          92%, 100% {
            opacity: 0;
            transform: perspective(1500px) rotateX(-7deg) scale(.95) translateY(-8px);
          }
        }

        .ac-sp-label {
          /* The caret sweeping the top edge is the panel's own header rule, not a border:
             a border would sit outside the rounded corner and break the silhouette. */
          background-image: linear-gradient(90deg, transparent, var(--color-accent), transparent);
          background-size: 42% 1px;
          background-repeat: no-repeat;
          animation: ac-sp-sweep \${DURATION} ease-in-out infinite;
        }
        @keyframes ac-sp-sweep {
          0%, 12%   { background-position: -50% 0 }
          52%       { background-position: 130% 0 }
          80%, 100% { background-position: 130% 0 }
        }

        @media (prefers-reduced-motion: reduce) {
          .ac-sp-row { animation: none; opacity: 1; transform: none }
          .ac-sp-label { animation: none; background-image: none }
        }
      \`}</style>

      <div className="w-full max-w-[330px] overflow-hidden rounded-lg border border-line bg-surface">
        <p className="ac-sp-label border-b border-line px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
          Suggested
        </p>
        <ul>
          {ROWS.map((row, i) => (
            <li
              key={row.label}
              className="ac-sp-row flex items-center gap-2.5 px-3 py-2.5"
              style={{ animationDelay: \`\${i * STAGGER}s\` }}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded border border-line font-mono text-[9px] text-faint">
                {i + 1}
              </span>
              <span className="flex-1 truncate text-[12.5px] text-ink">{row.label}</span>
              {row.hint && (
                <span className="font-mono text-[10px] text-faint">{row.hint}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
`;export{e as default};
