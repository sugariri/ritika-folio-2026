const e=`import { useEffect, useRef } from 'react'
import type { EffectMeta } from '../lib/types.ts'
import useScrollZoom from '../lib/useScrollZoom.ts'

export const meta: EffectMeta = {
  name: 'Dolly Zoom',
  description: 'Panels scale up as they arrive and back down as they leave, scrubbed off scroll position',
  category: 'Scroll',
  tags: ['scroll-scrub', 'transform', 'panels', 'hook'],
  status: 'ready',
}

// A demo of the \`useScrollZoom\` hook in src/lib. Each panel scales 0.9 → 1 on the way in
// and 1 → 0.9 on the way out, as a pure function of where it sits in the scroller. There
// is no timeline and no easing clock: stop scrolling mid-transition and the scale simply
// stops with you, which is what separates a scrubbed effect from a triggered one.
//
// The panels pass the scroll box in as \`root\`. The hook defaults to the viewport, but a
// tile scrolls its own element, and measuring against the wrong frame puts every panel
// permanently at full scale.
const PANELS = [
  { title: 'Collect', body: 'Statements, ledgers, and exports land in one place.' },
  { title: 'Reconcile', body: 'Every line is matched, or surfaced for review.' },
  { title: 'Explain', body: 'Movements come with the commentary already drafted.' },
]

const SCROLL_SPEED = 0.5 // px per frame
const TURN_PAUSE = 700 // ms held at each end before reversing

function Panel({ title, body, root }: {
  title: string
  body: string
  root: React.RefObject<HTMLDivElement | null>
}) {
  const ref = useScrollZoom<HTMLDivElement>(root)
  return (
    <div className="px-6 py-4">
      <div
        ref={ref}
        className="rounded-xl border border-line-strong bg-raised p-5"
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">{title}</div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  )
}

export default function DollyZoom() {
  const rootRef = useRef<HTMLDivElement>(null)

  // Ping-pong the scroller so the tile demonstrates itself; a pointer over the box
  // hands control back. Purely demo scaffolding — the hook does not scroll anything.
  useEffect(() => {
    const box = rootRef.current
    if (!box) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    let dir = 1
    let hovered = false
    let waitUntil = 0

    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      if (hovered || now < waitUntil) return
      const max = box.scrollHeight - box.clientHeight
      if (max <= 0) return
      const next = box.scrollTop + SCROLL_SPEED * dir
      if (next <= 0 || next >= max) {
        box.scrollTop = next <= 0 ? 0 : max
        dir = -dir as 1 | -1
        waitUntil = now + TURN_PAUSE
        return
      }
      box.scrollTop = next
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
      <div
        ref={rootRef}
        className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="py-[40%]">
          {PANELS.map((p) => (
            <Panel key={p.title} title={p.title} body={p.body} root={rootRef} />
          ))}
        </div>
      </div>
    </div>
  )
}
`;export{e as default};
