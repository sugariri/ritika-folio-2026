const e=`import type { EffectMeta } from '../lib/types.ts'

export const meta: EffectMeta = {
  name: 'Modal Pop',
  description: 'A scrim washes in and a dialog lifts into place behind it, then both leave together',
  category: 'Motion',
  tags: ['modal', 'scrim', 'keyframes', 'stagger', 'css-only'],
  status: 'ready',
}

// A dialog entrance, isolated. No state, no JavaScript — two keyframe tracks sharing one
// period, differing only in where their stops fall.
//
// What makes an entrance feel deliberate rather than abrupt is the offset between them.
// The scrim starts first and the card follows about 8% of the cycle later, so the page
// dims before anything arrives on top of it and the eye is already looking at the middle
// of the frame when the card gets there. Reverse the order and the card appears over a
// still-bright page and reads as a jump.
//
// The card's transform combines three things — up, scale, and a fraction of a degree of
// rotation — because a dialog that only translates looks like it is on rails. The
// rotation is small enough that you would not name it if asked, which is the point.
//
// The exit is faster than the entrance and both parts leave together. Dismissal should not
// be something you wait through, and staggering it makes the scrim look stuck behind.
const DURATION = '4.4s'

export default function ModalPop() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <style>{\`
        .ac-mp-page { position: absolute; inset: 0; padding: 20px; }

        .ac-mp-scrim {
          position: absolute; inset: 0;
          background: var(--color-scrim);
          backdrop-filter: blur(2px);
          opacity: 0;
          animation: ac-mp-scrim \${DURATION} ease-in-out infinite;
        }
        @keyframes ac-mp-scrim {
          0%, 6%    { opacity: 0 }
          18%, 78%  { opacity: 1 }
          88%, 100% { opacity: 0 }
        }

        .ac-mp-card {
          position: absolute; left: 50%; top: 50%;
          width: min(78%, 300px);
          opacity: 0;
          animation: ac-mp-card \${DURATION} infinite;
        }
        /* Percentages, not seconds — the two tracks stay in step if DURATION changes. */
        @keyframes ac-mp-card {
          0%, 14% {
            opacity: 0;
            transform: translate(-50%, -50%) translateY(16px) scale(.94) rotate(-.6deg);
            animation-timing-function: cubic-bezier(.2,.7,.3,1.25);
          }
          28%, 78% {
            opacity: 1;
            transform: translate(-50%, -50%) translateY(0) scale(1) rotate(0deg);
            animation-timing-function: ease-in;
          }
          88%, 100% {
            opacity: 0;
            transform: translate(-50%, -50%) translateY(8px) scale(.97) rotate(0deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ac-mp-scrim { animation: none; opacity: 1 }
          .ac-mp-card {
            animation: none; opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
      \`}</style>

      {/* Something for the scrim to dim — an entrance is only legible against a page. */}
      <div className="ac-mp-page" aria-hidden="true">
        <div className="h-3 w-24 rounded-full bg-line-strong" />
        <div className="mt-4 space-y-2">
          {[96, 82, 90, 64, 88, 71].map((w, i) => (
            <div key={i} className="h-2 rounded-full bg-line" style={{ width: \`\${w}%\` }} />
          ))}
        </div>
      </div>

      <div className="ac-mp-scrim" aria-hidden="true" />

      <div className="ac-mp-card" aria-hidden="true">
        <div className="rounded-xl border border-line-strong bg-raised p-4 shadow-[0_18px_50px_-12px_var(--color-shadow)]">
          <p className="text-[13px] font-medium text-ink">Publish this revision?</p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
            Three cells changed since the last approved version.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <span className="rounded-md border border-line px-2.5 py-1 font-mono text-[10px] text-muted">
              cancel
            </span>
            <span className="rounded-md bg-accent px-2.5 py-1 font-mono text-[10px] text-white">
              publish
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
`;export{e as default};
