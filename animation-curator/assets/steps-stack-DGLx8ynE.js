const e=`import { useEffect, useRef } from 'react'
import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Steps Stack',
  description: 'Sticky panels ride up and cover each other while their tabs collect into a header row',
  category: 'Scroll',
  tags: ['scroll', 'sticky', 'stack', 'no-javascript', 'layered'],
  status: 'ready',
}

// There is no scroll listener in this effect. Every panel is \`position: sticky\` docked at
// the same \`top\`, so as the page scrolls each one pins in turn and the next slides up over
// it — the covering, the ordering and the timing all fall out of the layout.
//
// The tabs are the reason it reads as accumulating rather than merely stacking. Each panel
// carries a transparent band above its body, tall enough to clear every tab, with its own
// tab pushed further right by one slot. Because the band is transparent, the tabs of the
// panels underneath show through it, so a docked panel appears to click into a growing
// header row that it is not actually part of.
//
// Being pure layout makes it inherently reduced-motion-safe: with the auto-scroll below
// disabled there is nothing left to animate, only a page that responds to being scrolled.
// The three tabs are amber, blue and green — one per stage, so the accumulating header
// row reads as progress rather than as decoration. Each tone carries dark text (see
// BAND styling below), which is why all three stay light enough to do that in either theme.
const STEPS = [
  {
    key: 'research',
    tab: 'Research',
    color: '#ecb52c',
    lines: ['Filings.', 'Transcripts.', 'Comparables.'],
    note: 'All read. All organised.',
  },
  {
    key: 'ask',
    tab: 'Ask',
    color: '#4d8dff',
    lines: ['Ask questions.', 'Get real answers.'],
    note: 'Not generic — built for the work.',
  },
  {
    key: 'deliver',
    tab: 'Deliver',
    color: '#6ec987',
    lines: ['Models.', 'Memos.', 'Comps.'],
    note: 'Cited to the source. Ready to ship.',
  },
]

const BAND_H = 26 // tab band height; must clear a tab plus its gap
const TAB_STEP = 62 // horizontal offset added per step, so tabs sit side by side
const SCROLL_SPEED = 0.85 // px per frame
const END_PAUSE = 700 // ms held at each end before reversing

export default function StepsStack() {
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    let dir = 1
    let hovered = false
    let waitUntil = 0

    // Ping-pong rather than jumping back to the top: the stack un-stacking on the way up
    // is half of what the layout does, and a hard reset would skip it.
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
      box.removeEventListener('pointerenter', onEnter)
      box.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div className="absolute inset-0">
      <style>{\`
        .ac-ss-panel {
          position: sticky;
          top: 0;
          height: 100%;
        }
        /* Transparent, so the tabs of every panel already docked read through it. */
        .ac-ss-band { height: \${BAND_H}px; position: relative; }
        .ac-ss-tab {
          position: absolute; bottom: 0;
          height: \${BAND_H - 6}px;
          display: inline-flex; align-items: center;
          padding: 0 10px;
          border-radius: 5px 5px 0 0;
          font-family: var(--font-mono);
          font-size: 9px; letter-spacing: .08em; text-transform: uppercase;
          color: #16161a;
        }
        .ac-ss-body {
          height: calc(100% - \${BAND_H}px);
          border-top: 1px dashed var(--color-line-strong);
          background: var(--color-surface);
          padding: 18px 20px;
          display: flex; flex-direction: column; justify-content: center;
        }
      \`}</style>

      <div
        ref={boxRef}
        className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {STEPS.map((s, i) => (
          <div key={s.key} className="ac-ss-panel">
            <div className="ac-ss-band">
              <span className="ac-ss-tab" style={{ background: s.color, left: i * TAB_STEP }}>
                {s.tab}
              </span>
            </div>
            <div className="ac-ss-body">
              <span
                className="mb-2 font-mono text-[10px] tracking-[0.1em] uppercase"
                style={{ color: s.color }}
              >
                Step {i + 1}
              </span>
              {s.lines.map((line) => (
                <p key={line} className="text-[17px] leading-snug text-ink">
                  {line}
                </p>
              ))}
              <p className="mt-3 text-[12px] text-muted">{s.note}</p>
            </div>
          </div>
        ))}
        {/* Dwell distance so the last panel holds before the track runs out. */}
        <div className="h-1/2" aria-hidden="true" />
      </div>
    </div>
  )
}
`;export{e as default};
