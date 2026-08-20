const e=`import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Prompt Console',
  description: 'A prompt types itself, a bar loads, and the result pops in — one CSS clock, no JavaScript',
  category: 'Text',
  tags: ['typewriter', 'steps', 'loop', 'css-only'],
  status: 'ready',
}

// Zero JavaScript. Every part of this runs on the same 3.6s infinite keyframe clock, and
// the choreography is nothing but different percentage stops inside that shared duration:
// the prompt finishes typing at 60%, the bar fills to 94%, the result fades in at 68%.
// Line them up on one period and they stay in step forever with no scheduler to drift.
//
// Two details worth stealing:
//
// - \`steps(N)\` on a width animation, with \`width\` in \`ch\`, is what makes the typing land
//   one whole character at a time. A linear width tween slides a half-cut glyph across the
//   edge instead, which reads as a wipe rather than as typing.
// - The caret uses \`steps(1)\` rather than \`ease\`, so it snaps on and off. A fading caret
//   looks like a pulsing decoration; a hard-switching one looks like a cursor.
//
// The character count is interpolated into the stylesheet from PROMPT.length, which keeps
// the two in sync — but it does mean the styles are per-instance rather than static.
const PROMPT = 'summarise Q3 variance'

export default function PromptConsole() {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <style>{\`
        .ac-pc { --ac-pc-dur: 3.6s; }

        .ac-pc-field {
          display: flex; align-items: center; overflow: hidden;
          border: 1px solid var(--color-line-strong); border-radius: 8px;
          background: var(--color-canvas); padding: 9px 12px;
        }
        .ac-pc-typing {
          display: block; overflow: hidden; white-space: nowrap;
          width: \${PROMPT.length}ch;
          animation: ac-pc-type var(--ac-pc-dur) steps(\${PROMPT.length}) infinite;
        }
        @keyframes ac-pc-type { 0% { width: 0 } 60%, 100% { width: \${PROMPT.length}ch } }

        .ac-pc-caret {
          flex: none; width: 1.5px; height: 13px; margin-left: 3px;
          background: var(--color-accent-green);
          animation: ac-pc-blink 1s steps(1) infinite;
        }
        @keyframes ac-pc-blink { 50% { opacity: 0 } }

        .ac-pc-bar { height: 4px; border-radius: 2px; background: var(--color-line); overflow: hidden }
        .ac-pc-bar i {
          display: block; height: 100%; border-radius: 2px;
          background: var(--color-accent-green); transform-origin: left;
          animation: ac-pc-load var(--ac-pc-dur) ease-in-out infinite;
        }
        @keyframes ac-pc-load { 0% { transform: scaleX(0) } 60%, 94% { transform: scaleX(1) } 100% { transform: scaleX(0) } }

        /* the answer row waits for the bar, holds, then clears for the next pass */
        .ac-pc-result { opacity: 0; animation: ac-pc-fade var(--ac-pc-dur) ease-in-out infinite }
        @keyframes ac-pc-fade { 0%, 62% { opacity: 0 } 74%, 94% { opacity: 1 } 100% { opacity: 0 } }

        /* overshoot on the chip so the result lands rather than appears */
        .ac-pc-chip { animation: ac-pc-pop var(--ac-pc-dur) cubic-bezier(.2,.7,.3,1.3) infinite }
        @keyframes ac-pc-pop {
          0%, 62% { transform: scale(0); opacity: 0 }
          76%, 94% { transform: scale(1); opacity: 1 }
          100% { transform: scale(1); opacity: 0 }
        }

        @media (prefers-reduced-motion: reduce) {
          .ac-pc * { animation: none !important }
          .ac-pc-result, .ac-pc-chip { opacity: 1; transform: none }
          .ac-pc-bar i { transform: scaleX(1) }
        }
      \`}</style>

      <div className="ac-pc w-full max-w-[280px] rounded-xl border border-line bg-surface p-4 font-mono text-[11px] text-muted">
        <div className="mb-3 flex items-center gap-2 border-b border-line pb-2 text-[9px] uppercase tracking-[0.12em] text-faint">
          <span className="size-1.5 rounded-full bg-accent-green" />
          console
        </div>

        <div className="ac-pc-field">
          <span className="ac-pc-typing text-ink">{PROMPT}</span>
          <i className="ac-pc-caret" />
        </div>

        <div className="ac-pc-bar mt-3">
          <i />
        </div>

        <div className="ac-pc-result mt-3 flex items-center gap-2">
          <span className="ac-pc-chip rounded border border-accent-green/35 bg-accent-green/10 px-2 py-0.5 text-[9.5px] text-accent-green">
            done
          </span>
          <span className="text-ink">3 drivers isolated</span>
        </div>
      </div>
    </div>
  )
}
`;export{e as default};
