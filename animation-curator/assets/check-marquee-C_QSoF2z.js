const e=`import { useEffect, useRef, useState } from 'react'
import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Check Marquee',
  description: 'A list scrolls forever and each row ticks itself off as it crosses an invisible line',
  category: 'Motion',
  tags: ['marquee', 'seamless-loop', 'mask', 'raf'],
  status: 'ready',
}

// Two ideas stacked on one another.
//
// The loop is a seamless vertical marquee: the list is rendered twice and translated by
// exactly -50%, so the moment the animation restarts, the second copy is sitting where the
// first one was and there is no seam to see. This is the whole trick — no measuring, no
// modulo bookkeeping, no rAF for the scroll itself. The mask on the viewport fades both
// edges so rows dissolve rather than clip.
//
// The ticking is separate. CSS is moving the list, so nothing in React knows where a row
// is; a rAF loop polls each row's box and flips \`is-checked\` once its middle crosses
// ACTIVE_LINE. The flip only toggles a class — the checkbox fill, the tick scale-in and
// the text colour are all CSS transitions, so rows animate through the line rather than
// snapping at it. The result reads as a list continuously completing itself.
//
// Only the boolean array is state, and it is only reassigned when a row actually changes,
// so a steady-state frame does its measuring and then bails without re-rendering.
const ITEMS = [
  'Ingest statements', 'Normalise line items', 'Match counterparties',
  'Flag anomalies', 'Roll up by entity', 'Reconcile balances',
  'Draft commentary', 'Publish the pack',
]

const ACTIVE_LINE = 0.42 // fraction of the viewport height dividing done from upcoming
const DURATION = '18s'

export default function CheckMarquee() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])

  const loop = [...ITEMS, ...ITEMS] // duplicated once so translateY(-50%) is seamless
  const [active, setActive] = useState<boolean[]>(() => loop.map(() => false))

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    const measure = () => {
      raf = requestAnimationFrame(measure)
      const box = vp.getBoundingClientRect()
      const line = box.top + box.height * ACTIVE_LINE
      setActive((prev) => {
        let changed = false
        const next = itemRefs.current.map((el, i) => {
          if (!el) return prev[i]
          const r = el.getBoundingClientRect()
          const mid = r.top + r.height / 2
          // ticked once past the line, and untracked again after leaving the top
          const on = mid < line && mid > box.top
          if (on !== prev[i]) changed = true
          return on
        })
        return changed ? next : prev // identity return skips the re-render
      })
    }
    raf = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="absolute inset-0 grid place-items-center px-6">
      <style>{\`
        .ac-cm-vp {
          position: relative; height: 82%; overflow: hidden; width: 100%;
          -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 16%, #000 84%, transparent 100%);
          mask-image: linear-gradient(180deg, transparent 0%, #000 16%, #000 84%, transparent 100%);
        }
        .ac-cm-list {
          display: flex; flex-direction: column;
          will-change: transform;
          animation: ac-cm-scroll \${DURATION} linear infinite;
        }
        @keyframes ac-cm-scroll { to { transform: translateY(-50%) } }

        /* Row spacing is padding, not a flex gap. With a gap, N items have N-1 gaps, so
           half the list's height is not half its items and translateY(-50%) lands slightly
           off — a small jump once per loop. Folding the spacing into each row makes the
           height exactly divisible and the seam genuinely invisible. */
        .ac-cm-item {
          display: flex; align-items: center; gap: 12px; white-space: nowrap;
          padding: 7px 0;
          color: var(--color-faint);
          transition: color .4s ease;
        }
        .ac-cm-item.on { color: var(--color-ink) }

        .ac-cm-box {
          flex: none; width: .95em; height: .95em;
          display: inline-flex; align-items: center; justify-content: center;
          border: 2px solid var(--color-line-strong); border-radius: .24em;
          /* The tick is the canvas colour, not the ink, because the box it sits in is the
             one thing here that inverts across themes: the green is bright on dark and
             deep on light, so a fixed white tick would vanish in one of them. */
          background: transparent; color: var(--color-canvas);
          transition: background .4s cubic-bezier(.32,.72,0,1), border-color .4s ease;
        }
        .ac-cm-item.on .ac-cm-box { background: var(--color-accent-green); border-color: transparent }

        .ac-cm-tick {
          width: 66%; height: 66%; opacity: 0; transform: scale(.4);
          transition: opacity .28s ease .05s, transform .38s cubic-bezier(.32,.72,0,1) .05s;
        }
        .ac-cm-item.on .ac-cm-tick { opacity: 1; transform: none }

        @media (prefers-reduced-motion: reduce) {
          .ac-cm-list { animation: none }
          .ac-cm-item { color: var(--color-ink) }
          .ac-cm-box { background: var(--color-accent-green); border-color: transparent }
          .ac-cm-tick { opacity: 1; transform: none }
        }
      \`}</style>

      <div ref={viewportRef} className="ac-cm-vp">
        <ul className="ac-cm-list">
          {loop.map((label, i) => (
            <li
              key={i}
              ref={(el) => { itemRefs.current[i] = el }}
              className={\`ac-cm-item text-[15px]\${active[i] ? ' on' : ''}\`}
              aria-hidden={i >= ITEMS.length}
            >
              <span className="ac-cm-box">
                <svg className="ac-cm-tick" viewBox="0 0 14 14" aria-hidden="true">
                  <path
                    d="M3 7.4l2.7 2.7L11 4.1"
                    fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round"
                  />
                </svg>
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
`;export{e as default};
