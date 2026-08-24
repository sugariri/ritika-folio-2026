const e=`import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Press Ripple',
  description: 'A ghost cursor drifts onto a button, presses it, and a ring radiates out from the hit',
  category: 'Hover',
  tags: ['cursor', 'ripple', 'press', 'css-only'],
  status: 'ready',
}

// A demonstration of an interaction nobody is performing — a ghost cursor arrives, the
// button dents under it, a ring radiates out. It is the standard way to show an affordance
// in a product shot, and it is pure CSS.
//
// The whole thing is three keyframe tracks sharing one 3.2s period, and the timing between
// them is the entire effect:
//
//   cursor  travels 0 → 45%, then parks
//   press   dents at 62–70%
//   ripple  starts expanding at 60%
//
// The cursor lands a beat *before* the press, not with it. Simultaneous arrival reads as a
// teleport; the pause is what makes it read as a hand coming to rest and then clicking.
// The ripple starts fractionally before the dent for the same reason a drum hit lands
// slightly ahead of the beat — it makes the press feel like the cause.
//
// The ripple is an expanding \`box-shadow\` spread rather than a scaling element, so it
// tracks the button's border radius for free and never needs sizing.
const DURATION = '3.2s'

export default function PressRipple() {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <style>{\`
        .ac-pr { --ac-pr-dur: \${DURATION}; position: relative; }

        .ac-pr-btn {
          position: relative; display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 20px; border-radius: 8px;
          border: 1px solid color-mix(in srgb, var(--color-accent-orange) 40%, transparent); background: color-mix(in srgb, var(--color-accent-orange) 9%, transparent);
          color: var(--color-ink); font-size: 13px; font-weight: 500; cursor: default;
          animation: ac-pr-press var(--ac-pr-dur) ease-in-out infinite;
        }
        @keyframes ac-pr-press {
          0%, 55%, 100% { transform: none; box-shadow: none }
          62%, 70% { transform: scale(.96); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent-orange) 18%, transparent) }
        }

        .ac-pr-ripple {
          position: absolute; inset: 0; border-radius: 8px; pointer-events: none;
          animation: ac-pr-ripple var(--ac-pr-dur) ease-out infinite;
        }
        @keyframes ac-pr-ripple {
          0%, 60% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent-orange) 45%, transparent); opacity: 1 }
          90%, 100% { box-shadow: 0 0 0 18px transparent; opacity: 0 }
        }

        .ac-pr-cursor {
          position: absolute; left: calc(50% + 24px); top: calc(50% + 6px);
          width: 20px; height: 20px; pointer-events: none;
          animation: ac-pr-cursor var(--ac-pr-dur) ease-in-out infinite;
        }
        @keyframes ac-pr-cursor {
          0% { transform: translate(30px, 26px) }
          45%, 75% { transform: translate(0, 0) }
          100% { transform: translate(30px, 26px) }
        }

        @media (prefers-reduced-motion: reduce) {
          .ac-pr-btn, .ac-pr-ripple, .ac-pr-cursor { animation: none }
          .ac-pr-ripple { opacity: 0 }
        }
      \`}</style>

      <div className="ac-pr">
        {/* A span, not a <button>. The whole gallery tile is already a button, and a
            nested one is invalid HTML — the visual is decorative and takes no input. */}
        <span aria-hidden="true" className="ac-pr-btn">
          <span className="text-accent-orange">+</span>
          Run reconciliation
          <i className="ac-pr-ripple" />
        </span>

        <svg className="ac-pr-cursor" viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M4 2.5 L4 15.2 L7.4 12 L9.9 17.4 L12.4 16.2 L9.9 11 L14.6 11 Z"
            fill="var(--color-ink)"
            stroke="var(--color-canvas)"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  )
}
`;export{e as default};
