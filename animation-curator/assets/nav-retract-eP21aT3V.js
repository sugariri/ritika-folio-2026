const e=`import { useEffect, useRef, useState } from 'react'
import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Nav Retract',
  description: 'A header hides as you read down and comes straight back the moment you scroll up',
  category: 'Scroll',
  tags: ['scroll', 'direction', 'header', 'raf', 'intersection-observer'],
  status: 'ready',
}

// Hide-on-scroll, with the two rules that separate a usable one from an annoying one.
//
// First, direction beats position. The header retracts only while you are moving down and
// returns on the very first upward pixel, so getting it back never requires scrolling to
// the top — it is one flick away wherever you are.
//
// Second, it never hides where it would be missed. Near the top there is nothing to gain
// by hiding, and an anchor element being on screen — here the hero and the footer, the
// two places a reader is most likely to want to navigate from — pins it open regardless of
// direction. That is an IntersectionObserver rather than a coordinate comparison, so it
// keeps working when the sections change height.
//
// Scroll events fire faster than frames, and the handler writes a class that the compositor
// reads. Coalescing into a rAF means at most one state change per painted frame instead of
// several per frame that the reader can never see.
const TOP_ZONE = 60 // px from the top where hiding is pointless
const SCROLL_SPEED = 1.15
const END_PAUSE = 650

const SECTIONS = [
  'Assumptions', 'Revenue build', 'Cost lines', 'Working capital',
  'Debt schedule', 'Valuation', 'Sensitivities',
]

export default function NavRetract() {
  const boxRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return

    let lastY = box.scrollTop
    let anchorVisible = true
    let queued = false

    const update = () => {
      queued = false
      const y = box.scrollTop
      const goingDown = y > lastY
      setHidden(!(anchorVisible || y < TOP_ZONE || !goingDown))
      lastY = y
    }

    // One state change per frame at most, however many scroll events arrive.
    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(update)
    }
    box.addEventListener('scroll', onScroll, { passive: true })

    const targets = [heroRef.current, footerRef.current].filter(Boolean) as HTMLElement[]
    const seen = new Set<Element>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) seen.add(e.target)
          else seen.delete(e.target)
        }
        anchorVisible = seen.size > 0
        update()
      },
      // Measured against the scroller, not the viewport: inside a gallery tile the whole
      // page is on screen at once, so a viewport-rooted observer would report everything
      // visible forever and the header would never hide.
      { root: box, threshold: 0 }
    )
    targets.forEach((t) => io.observe(t))

    let raf = 0
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let dir = 1
      let hovered = false
      let waitUntil = 0
      const step = (now: number) => {
        raf = requestAnimationFrame(step)
        if (hovered || now < waitUntil) return
        const max = box.scrollHeight - box.clientHeight
        const next = box.scrollTop + SCROLL_SPEED * dir
        if (next >= max) {
          box.scrollTop = max
          dir = -1
          waitUntil = now + END_PAUSE
        } else if (next <= 0) {
          box.scrollTop = 0
          dir = 1
          waitUntil = now + END_PAUSE
        } else {
          box.scrollTop = next
        }
      }
      raf = requestAnimationFrame(step)

      const onEnter = () => { hovered = true }
      const onLeave = () => { hovered = false }
      box.addEventListener('pointerenter', onEnter)
      box.addEventListener('pointerleave', onLeave)

      return () => {
        cancelAnimationFrame(raf)
        io.disconnect()
        box.removeEventListener('scroll', onScroll)
        box.removeEventListener('pointerenter', onEnter)
        box.removeEventListener('pointerleave', onLeave)
      }
    }

    return () => {
      io.disconnect()
      box.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        ref={boxRef}
        className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div ref={heroRef} className="flex h-28 items-end px-5 pb-4">
          <p className="text-[20px] leading-tight tracking-tight text-ink">
            The quarterly<br />model, annotated
          </p>
        </div>

        <div className="space-y-2 px-5 pb-4">
          {SECTIONS.map((s, i) => (
            <div key={s} className="rounded-md border border-line bg-raised p-3">
              <p className="text-[12px] text-ink">{s}</p>
              <div className="mt-2 space-y-1.5">
                {[92, 74, 61].map((w, j) => (
                  <span
                    key={j}
                    className="block h-1 rounded-full bg-line-strong"
                    style={{ width: \`\${w - i * 3 - j * 4}%\` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div ref={footerRef} className="flex h-20 items-center border-t border-line px-5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            End of section
          </span>
        </div>
      </div>

      <header
        className="absolute inset-x-0 top-0 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur-sm transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
        style={{ transform: hidden ? 'translateY(-100%)' : 'none' }}
      >
        <span className="font-mono text-[11px] tracking-[0.12em] text-ink">◈ LEDGER</span>
        <nav className="flex gap-3" aria-hidden="true">
          {['Docs', 'Pricing', 'Log in'].map((l) => (
            <span key={l} className="text-[11px] text-muted">{l}</span>
          ))}
        </nav>
      </header>
    </div>
  )
}
`;export{e as default};
