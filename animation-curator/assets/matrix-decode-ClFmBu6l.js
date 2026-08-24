const e=`import { useEffect, useState } from 'react'
import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Matrix Decode',
  description: 'Every character churns through symbols, then locks into the real word left to right',
  category: 'Text',
  tags: ['scramble', 'decode', 'loop', 'raf'],
  status: 'ready',
}

// A word-rotator dressed as decryption. Where a typewriter builds a word from nothing,
// this shows the whole word immediately — as noise — and resolves it one character at a
// time, so the reveal reads as *finding* the text rather than writing it. Locked
// characters render in ink; the still-churning tail stays in the accent so the moving
// part of the line is also the coloured part.
//
// The churn is re-rolled on a fixed 45ms beat rather than every frame: per-frame noise
// reads as flicker, per-beat noise reads as cycling. And the glyph each slot shows is a
// hash of (word, slot, beat), not Math.random — two tiles of this effect are mounted at
// once, and identical tiles disagreeing only in their static feels intentional, while
// lockstep flicker reads as a bug.
const WORDS = ['Revenue Growth', 'Gross Margin', 'Free Cash Flow']
const CHARSET = '!@#$%^&*()_+-=<>?/\\\\|'

const LOCK_MS = 70 // per character, decode pace
const HOLD_MS = 1600 // decoded word at rest before the next one arrives
const CHURN_MS = 45 // one glyph re-roll — the visible "tick" of the scramble

// deterministic per-(word, slot, beat) hash → which glyph a churning slot shows
const glyph = (w: number, i: number, beat: number) => {
  const s = Math.sin(w * 91.7 + i * 127.1 + beat * 311.7) * 43758.5453
  return CHARSET[Math.floor((s - Math.floor(s)) * CHARSET.length)]
}

export default function MatrixDecode() {
  const [word, setWord] = useState(0)
  const [locked, setLocked] = useState(WORDS[0].length)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    let w = 0
    // the timeline is one number: ms since this word started decoding
    let t0 = performance.now() + HOLD_MS // first word starts at rest

    const step = (now: number) => {
      const t = now - t0
      const n = WORDS[w].length
      if (t < 0) {
        // still holding the previous word — nothing to redraw
      } else if (t < n * LOCK_MS) {
        setLocked(Math.floor(t / LOCK_MS))
      } else if (t < n * LOCK_MS + HOLD_MS) {
        setLocked(n)
      } else {
        w = (w + 1) % WORDS.length
        t0 = now
        setWord(w)
        setLocked(0)
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  const target = WORDS[word]
  // beat only matters while churning; deriving it from locked progress keeps renders pure
  const beat = Math.floor((locked * LOCK_MS) / CHURN_MS)

  return (
    <div className="absolute inset-0 grid place-items-center px-6">
      <p className="whitespace-nowrap text-center font-mono text-[clamp(18px,2.6vw,26px)]">
        <span className="text-muted">&gt; </span>
        <span className="text-ink">{target.slice(0, locked)}</span>
        <span className="text-accent">
          {Array.from(target.slice(locked), (ch, i) =>
            ch === ' ' ? ' ' : glyph(word, locked + i, beat + i),
          )}
        </span>
      </p>
    </div>
  )
}
`;export{e as default};
