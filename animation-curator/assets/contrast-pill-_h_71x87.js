const e=`import { useEffect, useRef, useState } from 'react'
import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Contrast Pill',
  description: 'An outline-only control samples whatever is painted behind it and inverts itself to stay legible',
  category: 'Scroll',
  tags: ['scroll', 'contrast', 'luminance', 'elementsfrompoint', 'accessibility'],
  status: 'ready',
}

// The usual way to keep a floating control readable over changing sections is to give it a
// solid fill, or to hand-tag each section \`data-theme="dark"\` and read that. This does
// neither. The pill has no fill at all — it asks the browser what is actually painted
// under its own centre and works out the answer from that.
//
// \`document.elementsFromPoint\` returns the whole hit-stack at a coordinate, front to back.
// Walking down it and taking the first element with a non-transparent background colour
// finds the topmost thing that is genuinely painting there, skipping the transparent
// wrappers in between. The pill excludes its own subtree, or it would sample itself.
//
// Luminance uses the ITU-R BT.601 weights — green counts for more than half because the
// eye is most sensitive to it. Below the threshold the backdrop reads as dark and the
// outline goes white; above it, the outline goes near-black.
//
// Sampling happens on scroll rather than every frame. Nothing here needs sub-frame
// accuracy, and a scroll listener that only runs when the page moves costs nothing while
// it is still.
const DARK_THRESHOLD = 140 // 0-255 luminance below which the backdrop counts as dark

const BANDS = [
  { bg: '#0b0b0f', label: 'Overview' },
  { bg: '#f1f1f4', label: 'Pricing' },
  { bg: '#1d1b3a', label: 'Security' },
  { bg: '#e8e4dc', label: 'Customers' },
  { bg: '#101418', label: 'Contact' },
]

const SCROLL_SPEED = 0.9 // px per frame

export default function ContrastPill() {
  const boxRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const [onDark, setOnDark] = useState(true)

  useEffect(() => {
    const box = boxRef.current
    const pill = pillRef.current
    if (!box || !pill) return

    const sample = () => {
      const r = pill.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      for (const el of document.elementsFromPoint(x, y)) {
        if (pill.contains(el)) continue // never sample ourselves
        const m = getComputedStyle(el).backgroundColor.match(/rgba?\\(([^)]+)\\)/)
        if (!m) continue
        const parts = m[1].split(',').map((s) => parseFloat(s))
        const [cr, cg, cb] = parts
        const a = parts[3] ?? 1
        if (a <= 0) continue // fully transparent: keep looking further down the stack
        setOnDark(0.299 * cr + 0.587 * cg + 0.114 * cb < DARK_THRESHOLD)
        return
      }
      setOnDark(true)
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    sample()

    // Auto-scroll is demo scaffolding: on the page this came from, the reader supplied the
    // scrolling. The sampling below is the actual effect and is driven by the scroll
    // event, whoever caused it.
    let raf = 0
    let hovered = false
    if (!reduce) {
      const step = () => {
        raf = requestAnimationFrame(step)
        if (hovered) return
        const max = box.scrollHeight - box.clientHeight
        box.scrollTop = box.scrollTop >= max - 0.5 ? 0 : box.scrollTop + SCROLL_SPEED
      }
      raf = requestAnimationFrame(step)
    }

    const onEnter = () => { hovered = true }
    const onLeave = () => { hovered = false }
    box.addEventListener('scroll', sample, { passive: true })
    box.addEventListener('pointerenter', onEnter)
    box.addEventListener('pointerleave', onLeave)

    return () => {
      cancelAnimationFrame(raf)
      box.removeEventListener('scroll', sample)
      box.removeEventListener('pointerenter', onEnter)
      box.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div className="absolute inset-0">
      <div
        ref={boxRef}
        className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {[...BANDS, ...BANDS].map((band, i) => (
          <section
            key={i}
            style={{ background: band.bg }}
            className="flex h-32 items-center px-6"
          >
            <span
              className="font-mono text-[11px] uppercase tracking-[0.14em]"
              style={{ color: i % 2 === 0 ? 'rgba(255,255,255,.42)' : 'rgba(0,0,0,.42)' }}
            >
              {band.label}
            </span>
          </section>
        ))}
      </div>

      {/* Outside the scroller so it stays put while the bands move under it. */}
      <span
        ref={pillRef}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-4 right-4 grid size-9 place-items-center rounded-full border transition-colors duration-300"
        style={{
          borderColor: onDark ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.55)',
          color: onDark ? '#ffffff' : '#111111',
        }}
      >
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
          <path
            d="M8 3v10M3.5 8.5L8 13l4.5-4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  )
}
`;export{e as default};
