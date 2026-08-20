const e=`import { useEffect, useRef, useState } from 'react'
import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Count Bars',
  description: 'Columns grow from the baseline while their figures count up and settle',
  category: 'Motion',
  tags: ['counter', 'chart', 'raf', 'easing', 'entrance'],
  status: 'ready',
}

// Two animations that have to agree with each other: the columns grow, and the numbers
// above them count to the same values. If they use different curves the number lands
// before or after its bar and the pair stops reading as one object.
//
// The columns are a CSS transition on \`height\`, so the browser owns that half. The numbers
// cannot be — there is no interpolating text — so a rAF loop drives them, and it applies
// \`1 - (1-p)³\`, the cubic ease-out that \`--ease-out-quart\` approximates. Same shape, same
// duration, so the two halves stay locked without sharing a clock.
//
// The counter writes through a ref rather than through state. A number changing sixty
// times a second is sixty React renders of a subtree that is otherwise static; assigning
// \`textContent\` skips reconciliation entirely and the output is identical.
//
// One detail that matters more than it looks: the digits are \`tabular-nums\`. Proportional
// figures have different widths, so a counter running through them jitters horizontally
// the whole way up.
const DURATION = 1200 // ms, matched by the bar transition below
const STAGGER = 90 // ms between columns, applied to bar and number alike
const HOLD = 2400 // ms settled before replaying
const MAX = 100 // the value a full-height column represents

const BARS = [
  { label: 'Baseline', value: 41, accent: false },
  { label: 'Assisted', value: 68, accent: false },
  { label: 'Automated', value: 94, accent: true },
]

export default function CountBars() {
  const stageRef = useRef<HTMLDivElement>(null)
  const numRefs = useRef<(HTMLSpanElement | null)[]>([])
  const [grown, setGrown] = useState(false)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const write = (i: number, v: number) => {
      const el = numRefs.current[i]
      if (el) el.textContent = String(Math.round(v))
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setGrown(true)
      BARS.forEach((b, i) => write(i, b.value))
      return
    }

    let raf = 0
    let timer = 0

    const stop = () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }

    const total = DURATION + STAGGER * (BARS.length - 1)

    const run = () => {
      setGrown(false)
      BARS.forEach((_, i) => write(i, 0))

      // A frame's grace before growing: React has to paint the zero-height state or the
      // transition has nothing to start from and the bars simply appear at full size.
      raf = requestAnimationFrame(() => {
        setGrown(true)
        const t0 = performance.now()
        const tick = (now: number) => {
          const elapsed = now - t0
          BARS.forEach((b, i) => {
            // The same stagger the bar gets from \`transition-delay\`, so a column and its
            // figure start and finish together instead of drifting apart by 180ms.
            const p = Math.min(Math.max(elapsed - i * STAGGER, 0) / DURATION, 1)
            write(i, b.value * (1 - Math.pow(1 - p, 3)))
          })
          if (elapsed < total) raf = requestAnimationFrame(tick)
          else timer = window.setTimeout(run, HOLD)
        }
        raf = requestAnimationFrame(tick)
      })
    }

    // Wait until the tile is actually looked at before the first run, and start over each
    // time it comes back — the whole point of a count-up is that you watch it happen.
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) run()
      else stop()
    }, { threshold: 0.4 })
    io.observe(stage)

    return () => {
      stop()
      io.disconnect()
    }
  }, [])

  return (
    <div ref={stageRef} className="absolute inset-0 grid place-items-center px-8">
      <style>{\`
        .ac-cb-col {
          transition: height \${DURATION}ms var(--ease-out-quart);
        }
        @media (prefers-reduced-motion: reduce) {
          .ac-cb-col { transition: none }
        }
      \`}</style>

      <div className="flex h-[62%] w-full items-end justify-center gap-6">
        {BARS.map((b, i) => (
          <div key={b.label} className="flex h-full w-16 flex-col items-center justify-end">
            <span className="mb-2 font-mono text-[19px] tabular-nums text-ink">
              <span ref={(el) => { numRefs.current[i] = el }}>0</span>
              <span className="text-[12px] text-faint">%</span>
            </span>
            <div
              className="ac-cb-col w-full rounded-t-[3px]"
              style={{
                height: grown ? \`\${(b.value / MAX) * 100}%\` : 0,
                background: b.accent ? 'var(--color-accent-orange)' : 'var(--color-line-strong)',
                // Stagger the columns so they arrive as a sequence, not a single block.
                transitionDelay: \`\${i * STAGGER}ms\`,
              }}
            />
            <span className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
`;export{e as default};
