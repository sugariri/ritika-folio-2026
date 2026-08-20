const e=`import type { EffectMeta } from '../lib/types.ts'
import useCardStack from '../lib/useCardStack.ts'

export const meta: EffectMeta = {
  name: 'Card Deck',
  description: 'A deck that cycles itself — the front card arcs up and over to the back, and hovering holds it',
  category: 'Motion',
  tags: ['stack', 'loop', 'hover', 'hook'],
  status: 'ready',
}

// A demo of the \`useCardStack\` hook in src/lib. The hook owns all of the motion: it
// writes transform and z-index straight onto the container's direct children on a rAF
// loop, so the markup here is just four divs in a stacking context — no per-card state,
// no transition classes, nothing to keep in sync.
//
// Worth watching for: the z-index flip happens at the apex of the arc, not at the start
// or the end. Flip early and the card dives behind the deck while still rising; flip late
// and it slides over the top of cards it should already be behind.
// Four hues walking one arc of the wheel — blue, teal, orange, green — so a card is
// identifiable mid-flight without any two of them reading as the same card. Literals
// rather than tokens: these are washes at 25%, sitting on top of a themed surface, and
// they want to be the same four cards in either theme.
const CARDS = [
  { label: 'Revenue', value: '$4.28M', tone: 'from-[#3aa0ff]/25' },
  { label: 'Runway', value: '19 mo', tone: 'from-[#2fb7c9]/25' },
  { label: 'Burn', value: '$212K', tone: 'from-[#ff7a59]/25' },
  { label: 'Headcount', value: '48', tone: 'from-[#39d98a]/25' },
]

export default function CardDeck() {
  const { stackRef } = useCardStack(CARDS.length)

  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      {/* The hook no-ops under reduced motion, which would leave all four cards stacked
          exactly on top of each other. This is the resting arrangement it would otherwise
          have written, expressed in CSS, so the fallback still reads as a deck. */}
      <style>{\`
        @media (prefers-reduced-motion: reduce) {
          .ac-cd > :nth-child(1) { transform: none; z-index: 4 }
          .ac-cd > :nth-child(2) { transform: translateY(24px) scale(.95); z-index: 3 }
          .ac-cd > :nth-child(3) { transform: translateY(48px) scale(.90); z-index: 2 }
          .ac-cd > :nth-child(4) { transform: translateY(72px) scale(.85); z-index: 1 }
        }
      \`}</style>
      <div ref={stackRef} className="ac-cd relative h-[112px] w-full max-w-[240px]">
        {CARDS.map((c) => (
          <div
            key={c.label}
            // Every card occupies the same box — depth is entirely the hook's transform.
            // The opaque \`bg-raised\` under the tint matters: the deck overlaps itself, and
            // a translucent card lets the one behind read straight through it.
            className={\`absolute inset-x-0 top-0 h-[112px] rounded-xl border border-line-strong bg-raised bg-gradient-to-br \${c.tone} to-raised p-4 shadow-[0_12px_32px_-12px_var(--color-shadow)]\`}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{c.label}</div>
            <div className="mt-3 text-2xl text-ink">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
`;export{e as default};
