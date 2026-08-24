const e=`import { useEffect, useState } from 'react'
import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Type & Select',
  description: 'A word types itself out, gets selected like a cell in a spreadsheet, then is deleted and replaced',
  category: 'Text',
  tags: ['typewriter', 'caret', 'loop', 'css'],
  status: 'ready',
}

// A rotator that borrows the vocabulary of a design tool instead of a terminal. Most
// word-swappers just fade or slide; this one types the word in with a caret, then draws a
// selection frame with corner handles around it and fills it with a selection tint — so
// the delete that follows reads as *someone highlighting the word and typing over it*
// rather than as a transition.
//
// The four phases are a plain timer chain, not a keyframe timeline, because the typing
// duration depends on the length of the word. Everything visual is CSS: the phase only
// sets a class, and the frame, the tint and the caret each transition on their own curve.
const WORDS = ['Portfolio Managers', 'Research Analysts', 'Risk Managers']

const TYPE_MS = 28 // per character
const HOLD_MS = 1500 // full word on screen before it gets selected
const SELECT_MS = 380 // selection frame held before the word is deleted

type Phase = 'typing' | 'hold' | 'selected'

export default function TypeSelect() {
  const [text, setText] = useState(WORDS[0])
  const [phase, setPhase] = useState<Phase>('hold')

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let word = 0
    let alive = true
    const timers: number[] = []
    // Guarded so nothing fires after unmount — this chain schedules one timeout per
    // character, and the gallery remounts the effect every time the drawer opens.
    const at = (fn: () => void, ms: number) => {
      if (alive) timers.push(window.setTimeout(fn, ms))
    }

    const select = () => {
      setPhase('selected')
      at(() => { setText(''); typeNext() }, SELECT_MS)
    }

    const typeNext = () => {
      word = (word + 1) % WORDS.length
      const target = WORDS[word]
      setPhase('typing')
      for (let i = 1; i <= target.length; i++) {
        at(() => setText(target.slice(0, i)), i * TYPE_MS)
      }
      at(() => setPhase('hold'), target.length * TYPE_MS + 250)
      at(select, target.length * TYPE_MS + HOLD_MS)
    }

    at(() => { setPhase('hold'); at(select, HOLD_MS) }, 500)

    return () => { alive = false; timers.forEach(clearTimeout) }
  }, [])

  return (
    <div className="absolute inset-0 grid place-items-center px-8">
      <style>{\`
        .ac-ts { position: relative; display: inline-block; white-space: nowrap; padding: 0 4px; margin: 0 -4px; }
        .ac-ts em {
          position: relative; z-index: 1; font-style: normal; border-radius: 2px;
          transition: background-color .18s ease;
        }
        /* the selection fill lands with the frame and stays through the delete */
        .ac-ts.hold em, .ac-ts.selected em { background: color-mix(in srgb, var(--color-accent) 22%, transparent); }

        .ac-ts-frame {
          position: absolute; inset: .06em -2px 0 -2px;
          border: 1.5px solid var(--color-accent); border-radius: 3px;
          background: color-mix(in srgb, var(--color-accent) 6%, transparent); pointer-events: none;
          opacity: 0; transform: scale(.96);
          transition: opacity .22s ease, transform .22s ease;
        }
        .ac-ts.hold .ac-ts-frame, .ac-ts.selected .ac-ts-frame { opacity: 1; transform: scale(1); }

        .ac-ts-handle {
          position: absolute; width: 7px; height: 7px;
          background: var(--color-canvas); border: 1.5px solid var(--color-accent); border-radius: 1.5px;
        }
        .ac-ts-handle.tl { left: -4px; top: -4px } .ac-ts-handle.tr { right: -4px; top: -4px }
        .ac-ts-handle.bl { left: -4px; bottom: -4px } .ac-ts-handle.br { right: -4px; bottom: -4px }

        .ac-ts-caret {
          display: inline-block; width: 2px; height: .82em; margin-left: 2px;
          vertical-align: -.08em; background: var(--color-accent); opacity: 0;
        }
        /* only blinks while typing — a caret next to a selected word is a mixed signal */
        .ac-ts.typing .ac-ts-caret { opacity: 1; animation: ac-ts-blink .9s step-end infinite; }
        @keyframes ac-ts-blink { 50% { opacity: 0 } }

        @media (prefers-reduced-motion: reduce) {
          .ac-ts-frame, .ac-ts-caret { display: none }
          .ac-ts em { background: none }
        }
      \`}</style>

      <p className="text-center text-[clamp(20px,3.2vw,30px)] leading-tight text-muted">
        Built for{' '}
        <span className={\`ac-ts \${phase}\`}>
          <em className="text-ink">{text}</em>
          <i className="ac-ts-caret" />
          <span className="ac-ts-frame">
            <b className="ac-ts-handle tl" />
            <b className="ac-ts-handle tr" />
            <b className="ac-ts-handle bl" />
            <b className="ac-ts-handle br" />
          </span>
        </span>
      </p>
    </div>
  )
}
`;export{e as default};
