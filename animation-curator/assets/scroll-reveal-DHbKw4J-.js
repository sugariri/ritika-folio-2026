const e=`import { useEffect, useRef, useState } from 'react'
import type { EffectMeta } from '../lib/types.ts'
import useReveal from '../lib/useReveal.ts'

export const meta: EffectMeta = {
  name: 'Scroll Reveal',
  description: 'Rows rise and fade in the first time they cross into view, then stay put',
  category: 'Scroll',
  tags: ['intersection-observer', 'entrance', 'once', 'hook'],
  status: 'ready',
}

// A demo of the \`useReveal\` hook in src/lib. Each row observes itself and adds \`is-in\`
// the first time it intersects, then disconnects — the animation belongs to the CSS
// below, and the hook only decides when.
//
// Note the \`root\` passed to the hook. Left at the default the rows are measured against
// the viewport, which is right for a page section but wrong here: this list scrolls
// inside its own box, so without a root every row counts as visible from the first frame
// and the whole list reveals at once.
//
// The auto-scroll and the remount key are demo scaffolding, not part of the hook. Fire-
// once is the point of \`useReveal\`, so a looping preview has to genuinely start over.
const ROWS = [
  'Ingest statements', 'Normalise line items', 'Match counterparties',
  'Flag anomalies', 'Roll up by entity', 'Reconcile balances',
  'Draft the commentary', 'Publish the pack',
]

const SCROLL_SPEED = 0.42 // px per frame
const RESTART_PAUSE = 900 // ms held at the bottom before starting over

function Row({ label, index, root }: {
  label: string
  index: number
  root: React.RefObject<HTMLDivElement | null>
}) {
  const ref = useReveal<HTMLLIElement>({ threshold: 0.6, root })
  return (
    <li ref={ref} className="ac-sr-row flex items-center gap-3 py-2.5">
      <span className="grid size-5 shrink-0 place-items-center rounded-full border border-line-strong font-mono text-[9px] text-faint">
        {index + 1}
      </span>
      <span className="text-[13px] text-ink">{label}</span>
      <span className="ml-auto h-px flex-1 bg-line" />
    </li>
  )
}

export default function ScrollReveal() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [cycle, setCycle] = useState(0)

  useEffect(() => {
    const box = rootRef.current
    if (!box) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    let hovered = false
    let restartAt = 0

    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      if (hovered) return // hand the scroll over to the reader
      if (restartAt) {
        if (now < restartAt) return
        restartAt = 0
        box.scrollTop = 0
        setCycle((c) => c + 1) // remount the rows so the observers re-arm
        return
      }
      const max = box.scrollHeight - box.clientHeight
      if (box.scrollTop >= max - 0.5) {
        restartAt = now + RESTART_PAUSE
        return
      }
      box.scrollTop += SCROLL_SPEED
    }
    raf = requestAnimationFrame(step)

    const onEnter = () => { hovered = true }
    const onLeave = () => { hovered = false }
    box.addEventListener('pointerenter', onEnter)
    box.addEventListener('pointerleave', onLeave)

    return () => {
      cancelAnimationFrame(raf)
      box.removeEventListener('pointerenter', onEnter)
      box.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div className="absolute inset-0">
      <style>{\`
        .ac-sr-row {
          opacity: 0;
          transform: translateY(10px);
          transition:
            opacity var(--duration-slow) var(--ease-out-expo),
            transform var(--duration-slow) var(--ease-out-expo);
        }
        .ac-sr-row.is-in { opacity: 1; transform: none; }
        @media (prefers-reduced-motion: reduce) {
          .ac-sr-row { opacity: 1; transform: none; transition: none; }
        }
      \`}</style>
      <div
        ref={rootRef}
        className="h-full overflow-y-auto overscroll-contain px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Leading and trailing spacers, so the first row also has to travel in. The lead
            is the shorter of the two on purpose: a tall one leaves the tile blank for the
            first second of every cycle, which reads as a broken preview. */}
        <ul key={cycle} className="pt-[26%] pb-[62%]">
          {ROWS.map((label, i) => (
            <Row key={label} label={label} index={i} root={rootRef} />
          ))}
        </ul>
      </div>
    </div>
  )
}
`;export{e as default};
