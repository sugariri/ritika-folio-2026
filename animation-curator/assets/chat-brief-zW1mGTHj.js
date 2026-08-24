const e=`import { useEffect, useRef, useState } from 'react'
import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Chat Brief',
  description: 'A composer types its own question, sends it, and an answer streams back with a citation',
  category: 'Text',
  tags: ['typewriter', 'chat', 'sequence', 'streaming', 'loop'],
  status: 'ready',
}

// A panel that briefs itself. The interesting part is not the typing — it is that the
// whole thing is one linear sequence with no branching, and every phase is a single piece
// of state, so at any instant exactly one thing is happening and the panel can be reasoned
// about by reading the list of phases top to bottom.
//
// Each phase schedules only the next one. That makes the teardown trivially correct: the
// chain can be cut at any point by clearing the pending timer and refusing to schedule
// past a disposed instance, which is what the \`alive\` guard is for. Without it, a timer
// that fires after unmount calls \`setState\` on a component that no longer exists.
//
// The two streams differ on purpose. The question types character by character on a fixed
// interval, because that is what someone typing looks like. The answer arrives word by
// word, because that is what a model generating looks like — same technique, and reading
// the difference is most of why the panel feels like a real exchange.
const QUESTION = 'What changed in Q3 guidance?'
const ANSWER = 'Management narrowed FY revenue to $4.1–4.3B and lifted the margin floor by 40bps, citing mix.'

const TYPE_MS = 42 // per character of the question
const WORD_MS = 68 // per word of the answer
const SEND_PAUSE = 520 // beat between finishing typing and hitting send
const THINK_MS = 700 // composed-and-sent, before the first word comes back
const HOLD_MS = 2600 // full exchange on screen before starting over

type Phase = 'typing' | 'sending' | 'thinking' | 'answering' | 'done'

const WORDS = ANSWER.split(' ')

export default function ChatBrief() {
  const [phase, setPhase] = useState<Phase>('typing')
  const [typed, setTyped] = useState('')
  const [words, setWords] = useState(0)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTyped(QUESTION)
      setWords(WORDS.length)
      setPhase('done')
      return
    }

    let alive = true
    let timer = 0
    const at = (ms: number, fn: () => void) => {
      timer = window.setTimeout(() => {
        if (alive) fn()
      }, ms)
    }

    const start = () => {
      setTyped('')
      setWords(0)
      setPhase('typing')

      let i = 0
      const typeNext = () => {
        i += 1
        setTyped(QUESTION.slice(0, i))
        if (i < QUESTION.length) at(TYPE_MS, typeNext)
        else at(SEND_PAUSE, send)
      }
      at(TYPE_MS, typeNext)
    }

    const send = () => {
      setPhase('sending')
      at(THINK_MS, () => {
        setPhase('answering')
        let w = 0
        const wordNext = () => {
          w += 1
          setWords(w)
          if (w < WORDS.length) at(WORD_MS, wordNext)
          else {
            setPhase('done')
            at(HOLD_MS, start)
          }
        }
        wordNext()
      })
    }

    start()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])

  // Keep the newest line in view as the answer grows past the panel's height.
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [words, phase])

  const sent = phase !== 'typing'

  return (
    <div className="absolute inset-0 flex items-center justify-center p-5">
      <style>{\`
        .ac-cbf-caret {
          display: inline-block; width: 1px; height: 1em;
          margin-left: 1px; vertical-align: -.14em;
          background: var(--color-accent);
          animation: ac-cbf-blink .95s step-end infinite;
        }
        @keyframes ac-cbf-blink { 50% { opacity: 0 } }

        /* Each bubble and each word animates itself on mount, so nothing needs to
           orchestrate the entrances — appearing in the tree is the trigger. */
        .ac-cbf-bubble { animation: ac-cbf-rise .34s var(--ease-out-quart) both }
        @keyframes ac-cbf-rise {
          from { opacity: 0; transform: translateY(8px) }
          to { opacity: 1; transform: none }
        }
        .ac-cbf-word { animation: ac-cbf-fade .22s ease both }
        @keyframes ac-cbf-fade { from { opacity: 0 } to { opacity: 1 } }

        .ac-cbf-dots span {
          display: inline-block; width: 3px; height: 3px; border-radius: 50%;
          background: var(--color-muted);
          animation: ac-cbf-bob 1s ease-in-out infinite;
        }
        .ac-cbf-dots span:nth-child(2) { animation-delay: .13s }
        .ac-cbf-dots span:nth-child(3) { animation-delay: .26s }
        @keyframes ac-cbf-bob {
          0%, 60%, 100% { opacity: .3; transform: none }
          30% { opacity: 1; transform: translateY(-3px) }
        }

        @media (prefers-reduced-motion: reduce) {
          .ac-cbf-caret, .ac-cbf-dots span { animation: none }
          .ac-cbf-bubble, .ac-cbf-word { animation: none; opacity: 1; transform: none }
        }
      \`}</style>

      <div className="flex h-full w-full max-w-[420px] flex-col overflow-hidden rounded-lg border border-line bg-surface">
        <div
          ref={threadRef}
          className="flex-1 space-y-2.5 overflow-y-auto p-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {sent && (
            <div className="ac-cbf-bubble ml-auto max-w-[86%] rounded-lg rounded-br-sm bg-accent/20 px-3 py-2">
              <p className="text-[12.5px] leading-snug text-ink">{QUESTION}</p>
            </div>
          )}

          {phase === 'sending' && (
            <div className="ac-cbf-dots flex items-center gap-1 pl-1 pt-1" aria-hidden="true">
              <span /><span /><span />
            </div>
          )}

          {(phase === 'answering' || phase === 'done') && (
            <div className="ac-cbf-bubble max-w-[92%] rounded-lg rounded-bl-sm border border-line bg-raised px-3 py-2">
              <p className="text-[12.5px] leading-relaxed text-ink">
                {WORDS.slice(0, words).map((w, i) => (
                  <span key={i} className="ac-cbf-word">{w} </span>
                ))}
              </p>
              {phase === 'done' && (
                <span className="mt-2 inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 font-mono text-[9px] text-faint">
                  10-Q · p.14
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
          <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
            {sent ? (
              <span className="text-faint">Ask a follow-up…</span>
            ) : (
              <>
                {typed}
                <span className="ac-cbf-caret" aria-hidden="true" />
              </>
            )}
          </p>
          <span
            aria-hidden="true"
            className="grid size-6 shrink-0 place-items-center rounded-md transition-colors duration-[--duration-fast]"
            style={{
              background: typed.length === QUESTION.length && !sent ? 'var(--color-accent)' : 'var(--color-raised)',
              color: typed.length === QUESTION.length && !sent ? 'var(--color-ink)' : 'var(--color-faint)',
            }}
          >
            <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
              <path
                d="M8 12.5v-9M4 7l4-4 4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </div>
    </div>
  )
}
`;export{e as default};
