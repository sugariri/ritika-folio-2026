const e=`import { useEffect, useRef } from 'react'
import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Hero Reveal',
  description: 'A masthead enters in reading order — eyebrow, headline, standfirst, then the page itself',
  category: 'Motion',
  tags: ['entrance', 'stagger', 'hero', 'transition', 'css-variables'],
  status: 'ready',
}

// A page-load entrance for a hero section. Every piece plays the same move — fade in
// while easing up 10px on \`--ease-out-expo\` — and the only choreography is a delay per
// item, so the masthead assembles in reading order: eyebrow, headline, standfirst, and
// last the product window the copy was building up to.
//
// The travel is deliberately short. 10px is under the threshold where you'd describe the
// text as "sliding"; the eye registers settling, not movement. Pair that with a long
// expo tail (fast start, very soft landing) and the entrance feels calm at 600ms where a
// linear 600ms would feel slow.
//
// The stagger rides \`transition-delay\` off a \`--i\` custom property set inline, so adding
// or reordering items is a markup edit, not a CSS one. One class on the wrapper starts
// the whole sequence — the items never get individual state.
//
// The timeout loop at the bottom is preview scaffolding. On a real page this runs once:
// add \`is-in\` to the hero after first paint (or from an IntersectionObserver) and delete
// everything about \`is-out\`.
const STAGGER = 90 // ms between items
const ENTRANCE = 600 + STAGGER * 3 // last item's delay + the shared duration
const HOLD = 2400 // ms the finished masthead stays before the loop restarts
const EXIT = 260 // ms of shared fade-out — restarts should be quick, not a show

export default function HeroReveal() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = ref.current
    if (!box) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      box.classList.add('is-in')
      return
    }

    let raf = 0
    let hold = 0
    let restart = 0

    const run = () => {
      box.classList.remove('is-in', 'is-out')
      // Two frames, not one: the first lets the browser commit the hidden base state,
      // so the second's class change actually transitions instead of appearing settled.
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => box.classList.add('is-in'))
      })
      hold = window.setTimeout(() => {
        box.classList.add('is-out')
        restart = window.setTimeout(run, EXIT)
      }, ENTRANCE + HOLD)
    }
    run()

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(hold)
      clearTimeout(restart)
    }
  }, [])

  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden px-7">
      <style>{\`
        .ac-hr-item {
          opacity: 0;
          transform: translateY(10px);
          transition:
            opacity var(--duration-slow) var(--ease-out-expo),
            transform var(--duration-slow) var(--ease-out-expo);
          transition-delay: calc(var(--i) * \${STAGGER}ms);
        }
        .ac-hr.is-in .ac-hr-item { opacity: 1; transform: none; }
        /* Everything leaves together and in place — the exit is a reset, not a reversal. */
        .ac-hr.is-out .ac-hr-item {
          opacity: 0;
          transform: none;
          transition: opacity \${EXIT}ms ease;
          transition-delay: 0ms;
        }
        @media (prefers-reduced-motion: reduce) {
          .ac-hr-item { opacity: 1; transform: none; transition: none; }
        }
      \`}</style>

      <div ref={ref} className="ac-hr w-full max-w-[300px]">
        <p
          className="ac-hr-item font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint"
          style={{ '--i': 0 } as React.CSSProperties}
        >
          Case study — FinSynth
        </p>
        <h3
          className="ac-hr-item mt-2 text-[19px] font-semibold leading-snug text-ink"
          style={{ '--i': 1 } as React.CSSProperties}
        >
          Ask your ledger anything
        </h3>
        <p
          className="ac-hr-item mt-1.5 text-[11.5px] leading-relaxed text-muted"
          style={{ '--i': 2 } as React.CSSProperties}
        >
          An analyst chat that reads the books directly, so numbers stop travelling by
          copy-paste.
        </p>

        {/* The payoff item: a product window arriving after its own introduction. */}
        <div
          className="ac-hr-item mt-4 overflow-hidden rounded-lg border border-line-strong bg-raised shadow-[0_14px_36px_-14px_var(--color-shadow)]"
          style={{ '--i': 3 } as React.CSSProperties}
          aria-hidden="true"
        >
          <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-2">
            <span className="size-1.5 rounded-full bg-line-strong" />
            <span className="size-1.5 rounded-full bg-line-strong" />
            <span className="size-1.5 rounded-full bg-line-strong" />
            <span className="ml-2 h-2.5 flex-1 rounded-full bg-line" />
          </div>
          <div className="space-y-1.5 bg-surface p-3">
            <div className="h-2 w-1/2 rounded-full bg-line-strong" />
            <div className="h-2 w-full rounded-full bg-line" />
            <div className="h-2 w-4/5 rounded-full bg-line" />
            <div className="mt-2.5 h-5 w-16 rounded-md bg-accent/80" />
          </div>
        </div>
      </div>
    </div>
  )
}
`;export{e as default};
