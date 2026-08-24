const e=`import { useEffect, useState } from 'react'
import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Ask Expand',
  description: 'A search bar lifts off the page, unfolds a prompt palette, then morphs into the answer panel',
  category: 'Motion',
  tags: ['morph', 'command-palette', 'sequence', 'scrim', 'loop'],
  status: 'ready',
}

// The whole interaction runs on **one box**. It starts as a compact search bar, lifts and
// zooms off a dimmed page, unfolds a palette beneath itself, and then widens into a panel
// holding the answer — and at no point is it replaced. Everything that changes is a class
// on the same element, so the browser interpolates \`max-width\`, \`border-radius\` and
// \`transform\` between states and the morph comes free.
//
// That is the whole idea, and it is worth being deliberate about, because the obvious
// implementation — a bar that hides and a dialog that appears — throws away the one thing
// that makes this read as a single object responding rather than as two components
// swapping. Once the box is shared, the sequence has to be too: the lift is held across
// the palette *and* the typing, so the bar never drops back into the page mid-flow.
//
// The three properties transition on the same curve but not the same duration. Width and
// transform take the long ease so the growth is legible; radius and border take a short
// one, because a corner easing open over 480ms looks like a rendering fault rather than a
// deliberate motion.
//
// One adaptation from the page this came from: the scrim there was \`position: fixed\` and
// covered the viewport. Here it is \`absolute inset-0\` inside the tile, so the effect dims
// its own frame instead of the gallery around it.
const PROMPTS = [
  { icon: 'table', text: 'Gross margin, last nine quarters' },
  { icon: 'refresh', text: 'Rebuild the debt schedule' },
  { icon: 'check', text: 'Compare against consensus' },
]

const ANSWER = 'Gross margin held between 43.2% and 46.6%, widening 180bps over the period.'
const TABLE = {
  cols: ['Quarter', 'Revenue', 'GM%'],
  rows: [
    ['Q1', '90.8B', '43.2%'],
    ['Q2', '81.8B', '44.5%'],
    ['Q3', '94.9B', '46.6%'],
  ],
}

const IDLE_MS = 700 // bar at rest before the pointer "arrives"
const MENU_MS = 1000 // palette open, before a row is chosen
const TYPE_MS = 34 // per character of the chosen prompt
const SEND_MS = 380 // beat between the last character and submit
const LOAD_MS = 900 // loader under the query
const HOLD_MS = 2800 // answer on screen
const CLOSE_MS = 420 // collapse back to the bar

type Phase = 'idle' | 'menu' | 'typing' | 'loading' | 'done' | 'closing'

const QUERY = PROMPTS[0].text

function Icon({ name }: { name: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' as const }
  if (name === 'table') {
    return (
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
        <rect x="2" y="2.5" width="12" height="11" rx="1.6" {...p} />
        <path d="M2 6h12M6 6v7.5" {...p} />
      </svg>
    )
  }
  if (name === 'refresh') {
    return (
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
        <path d="M13 8a5 5 0 1 1-1.46-3.54" {...p} />
        <path d="M13 2.5V5h-2.5" {...p} strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
      <path d="M2.5 10.5l3.5-3.5 2.5 2.5 5-5" {...p} strokeLinejoin="round" />
    </svg>
  )
}

export default function AskExpand() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // The end of the sequence is the only frame that shows what the box became, so the
      // static fallback is the answer panel rather than the bar it started as.
      setTyped(QUERY)
      setPhase('done')
      return
    }

    let alive = true
    let timer = 0
    // Each step schedules only the next, so teardown is one cleared timer and a guard —
    // the same shape as Chat Brief, and correct for the same reason.
    const at = (ms: number, fn: () => void) => {
      timer = window.setTimeout(() => {
        if (alive) fn()
      }, ms)
    }

    const start = () => {
      setTyped('')
      setPhase('idle')
      at(IDLE_MS, () => {
        setPhase('menu')
        at(MENU_MS, () => {
          setPhase('typing')
          let i = 0
          const next = () => {
            i += 1
            setTyped(QUERY.slice(0, i))
            if (i < QUERY.length) at(TYPE_MS, next)
            else {
              at(SEND_MS, () => {
                setPhase('loading')
                at(LOAD_MS, () => {
                  setPhase('done')
                  at(HOLD_MS, () => {
                    setPhase('closing')
                    at(CLOSE_MS, start)
                  })
                })
              })
            }
          }
          at(TYPE_MS, next)
        })
      })
    }

    start()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])

  const open = phase === 'loading' || phase === 'done'
  const lifted = phase === 'menu' || phase === 'typing'
  const dimmed = lifted || open
  const wide = phase === 'done' // only once there is a table to justify the width

  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden px-4">
      <style>{\`
        .ac-ax-scrim {
          position: absolute; inset: 0; z-index: 1;
          background: var(--color-scrim);
          backdrop-filter: blur(3px);
          animation: ac-ax-scrim .28s ease both;
        }
        @keyframes ac-ax-scrim { from { opacity: 0 } to { opacity: 1 } }

        .ac-ax-shell {
          position: relative; z-index: 2;
          width: 100%; max-width: 244px;
          margin: 0 auto;
          border: 1px solid var(--color-line);
          border-radius: 10px;
          background: var(--color-surface);
          transition:
            border-color .2s ease,
            border-radius .2s ease,
            max-width .48s cubic-bezier(.22,.9,.26,1),
            transform .48s cubic-bezier(.22,.9,.26,1);
        }
        .ac-ax-shell.is-lifted {
          border-color: var(--color-accent);
          /* Held through typing as well as the palette — see the note at the top. */
          transform: translateY(-38px) scale(1.04);
          box-shadow: 0 24px 60px -20px var(--color-shadow);
        }
        .ac-ax-shell.is-open {
          border-color: var(--color-accent);
          border-radius: 13px;
          transform: translateY(-6px);
          box-shadow: 0 24px 60px -20px var(--color-shadow);
        }
        .ac-ax-shell.is-wide { max-width: 288px }

        /* Palette hangs off the shell rather than sitting in the tile, so it inherits the
           lift for free and needs no position of its own. */
        .ac-ax-menu {
          position: absolute; left: 0; right: 0; top: calc(100% + 8px); z-index: 3;
          padding: 5px;
          border: 1px solid var(--color-line-strong);
          border-radius: 11px;
          background: var(--color-raised);
          box-shadow: 0 28px 60px -26px var(--color-shadow);
          transform-origin: top center;
          animation: ac-ax-pop .34s cubic-bezier(.2,.82,.24,1) both;
        }
        @keyframes ac-ax-pop {
          from { opacity: 0; transform: perspective(1500px) rotateX(-11deg) scale(.9) translateY(-14px) }
          to   { opacity: 1; transform: perspective(1500px) rotateX(0) scale(1) translateY(0) }
        }
        .ac-ax-row {
          display: flex; align-items: center; gap: 8px;
          width: 100%; padding: 6px 7px;
          border-radius: 7px;
          text-align: left;
        }
        .ac-ax-row.is-active { background: color-mix(in oklab, var(--color-accent) 22%, transparent) }

        .ac-ax-panel { animation: ac-ax-up .34s cubic-bezier(.22,1,.36,1) both }
        @keyframes ac-ax-up {
          from { opacity: 0; transform: translateY(-8px) }
          to   { opacity: 1; transform: none }
        }

        .ac-ax-caret {
          display: inline-block; width: 1px; height: .95em;
          margin-left: 1px; vertical-align: -.12em;
          background: var(--color-accent);
          animation: ac-ax-blink .95s step-end infinite;
        }
        @keyframes ac-ax-blink { 50% { opacity: 0 } }

        .ac-ax-dots i {
          display: inline-block; width: 4px; height: 4px; border-radius: 50%;
          background: var(--color-accent); opacity: .35;
          animation: ac-ax-dot 1.1s ease-in-out infinite;
        }
        .ac-ax-dots i:nth-child(2) { animation-delay: .18s }
        .ac-ax-dots i:nth-child(3) { animation-delay: .36s }
        @keyframes ac-ax-dot {
          0%, 100% { opacity: .3; transform: none }
          40% { opacity: 1; transform: translateY(-3px) }
        }

        @media (prefers-reduced-motion: reduce) {
          .ac-ax-scrim, .ac-ax-menu, .ac-ax-panel { animation: none }
          .ac-ax-shell { transition: none }
          .ac-ax-shell.is-lifted, .ac-ax-shell.is-open { transform: none }
          .ac-ax-caret, .ac-ax-dots i { animation: none }
        }
      \`}</style>

      {dimmed && <div className="ac-ax-scrim" aria-hidden="true" />}

      <div className="relative w-full">
        <div
          className={[
            'ac-ax-shell',
            lifted ? 'is-lifted' : '',
            open ? 'is-open' : '',
            wide ? 'is-wide' : '',
          ].join(' ')}
          aria-hidden="true"
        >
          {open && (
            <div className="ac-ax-panel p-3">
              <p className="border-b border-line pb-2 text-[11.5px] font-medium leading-snug text-ink">
                {QUERY}
              </p>

              {phase === 'loading' ? (
                <div className="flex items-center gap-2 pt-2.5">
                  <span className="font-mono text-[9px] uppercase tracking-[0.09em] text-accent">
                    Working
                  </span>
                  <span className="ac-ax-dots inline-flex gap-[4px]">
                    <i /><i /><i />
                  </span>
                </div>
              ) : (
                <>
                  <p className="pt-2.5 text-[11px] leading-relaxed text-muted">{ANSWER}</p>
                  <table className="mt-2.5 w-full border-separate border-spacing-0 font-mono text-[9px]">
                    <thead>
                      <tr>
                        {TABLE.cols.map((c) => (
                          <th
                            key={c}
                            className="border-b border-line pb-1 text-left font-normal uppercase tracking-[0.08em] text-faint"
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {TABLE.rows.map((r) => (
                        <tr key={r[0]}>
                          {r.map((cell, ci) => (
                            <td
                              key={ci}
                              className={\`pt-1 \${ci === 0 ? 'text-faint' : 'text-ink'}\`}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {phase === 'menu' && (
            <div className="ac-ax-menu">
              <p className="px-2 pb-1.5 pt-1 font-mono text-[8.5px] uppercase tracking-[0.12em] text-faint">
                Try asking
              </p>
              {PROMPTS.map((p, i) => (
                <span key={p.text} className={\`ac-ax-row \${i === 0 ? 'is-active' : ''}\`}>
                  <span className="shrink-0 text-faint">
                    <Icon name={p.icon} />
                  </span>
                  <span className="flex-1 truncate text-[10.5px] text-ink">{p.text}</span>
                </span>
              ))}
            </div>
          )}

          {!open && (
            <div className="flex items-center gap-2 py-1.5 pl-2.5 pr-1.5">
              <span className="shrink-0 text-faint">
                <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  <path
                    d="M2.2 8h11.6M8 2C5.8 4 5.8 12 8 14M8 2c2.2 2 2.2 10 0 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.1"
                  />
                </svg>
              </span>
              <p className="min-w-0 flex-1 truncate text-[11px] text-ink">
                {typed ? (
                  <>
                    {typed}
                    {phase === 'typing' && <span className="ac-ax-caret" />}
                  </>
                ) : (
                  <span className="text-faint">Ask anything about the filings…</span>
                )}
              </p>
              <span
                className="shrink-0 rounded-md px-1.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.08em] transition-colors duration-[--duration-fast]"
                style={{
                  background: typed ? 'var(--color-accent)' : 'var(--color-raised)',
                  color: typed ? 'var(--color-ink)' : 'var(--color-faint)',
                }}
              >
                Enter
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
`;export{e as default};
