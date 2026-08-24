const e=`import { useCallback, useEffect, useRef } from 'react'

/**
 * Cyclic card deck on an automatic timer.
 *
 * Attach \`stackRef\` to the container whose direct children are the cards. After HOLD_MS
 * the front card lifts out of the deck along a sine arc, flips to the back z-index at the
 * apex, and settles into the last slot while the cards behind each slide one place
 * forward. At rest, each card sits PEEK px lower and SCALE_STEP smaller per unit of
 * depth, so the deck peeks out below the front.
 *
 * Hovering pauses the deck so the front card can be read — but only at rest. A card
 * already in the air always completes its arc, because freezing a card mid-flight looks
 * like a bug rather than a pause.
 *
 * \`next\`/\`prev\` drive the same step by hand. Going back is the forward flight of the card
 * behind the deck played in reverse, so there is exactly one motion in this file and both
 * directions land in precisely the arrangement the timer would have produced. A call
 * during a flight is ignored rather than queued.
 *
 * No-op under reduced motion: the cards keep whatever layout the CSS gives them and
 * \`next\`/\`prev\` do nothing.
 */
const PEEK = 24 // px each deeper card peeks out below the one in front
const SCALE_STEP = 0.05 // scale lost per unit of depth
const HOLD_MS = 2800 // rest time with a card at the front
const FLIGHT_MS = 950 // duration of the up-and-over flight

export default function useCardStack(count: number) {
  const stackRef = useRef<HTMLDivElement>(null)
  // installed by the effect; a no-op before mount and under reduced motion
  const stepRef = useRef<((d: 1 | -1) => void) | null>(null)

  useEffect(() => {
    const stack = stackRef.current
    if (!stack) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const cards = Array.from(stack.children) as HTMLElement[]
    if (!cards.length) return

    let raf = 0
    let base = 0 // index of the card currently at the front
    let phase: 'hold' | 'flight' = 'hold'
    let dir: 1 | -1 = 1
    let phaseStart = 0
    let visible = false
    let hovered = false

    const ease = (t: number) => t * t * (3 - 2 * t)

    // t: 0 at rest → 1 when the front card has landed at the back
    const render = (t: number) => {
      const cardH = cards[0]?.offsetHeight || 320
      const lift = cardH * 0.6 + 40 // apex clears the top edge of the deck
      cards.forEach((el, i) => {
        const raw = (i - base + count * 2) % count // 0 = front slot
        let y: number, s: number, z: number
        if (raw === 0 && t > 0) {
          const landDepth = count - 1
          y = landDepth * PEEK * t - lift * Math.sin(Math.PI * t)
          s = 1 - landDepth * SCALE_STEP * t
          z = t < 0.5 ? count * 2 + 1 : 1 // flip at the apex, behind everything after
        } else {
          const d = Math.max(0, raw - t)
          y = d * PEEK
          s = 1 - d * SCALE_STEP
          z = count * 2 - Math.round(d)
        }
        el.style.transform = \`translate3d(0, \${y.toFixed(2)}px, 0) scale(\${s.toFixed(4)})\`
        el.style.zIndex = String(z)
      })
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (!visible) {
        phaseStart = now // hold the timer while off-screen
        return
      }
      const elapsed = now - phaseStart
      if (phase === 'hold') {
        // A hover pauses here, at the resting card. A flight in progress never reaches
        // this branch, so it always completes.
        if (hovered) { phaseStart = now; return }
        if (elapsed >= HOLD_MS) {
          phase = 'flight'
          dir = 1
          phaseStart = now
        }
        return
      }
      const t = Math.min(1, elapsed / FLIGHT_MS)
      render(dir === 1 ? ease(t) : 1 - ease(t))
      if (t >= 1) {
        // Forward: the front card landed at the back, so the deck advances. Reverse:
        // \`base\` already moved back when the step was kicked off, and render(0) is
        // exactly where that flight began — nothing left to shift.
        if (dir === 1) base = (base + 1) % count
        phase = 'hold'
        dir = 1
        phaseStart = now
        render(0)
      }
    }

    stepRef.current = (d) => {
      if (phase === 'flight') return
      dir = d
      if (d === -1) base = (base - 1 + count) % count
      phase = 'flight'
      phaseStart = performance.now()
    }

    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
    io.observe(stack)

    const onEnter = () => { hovered = true }
    const onLeave = () => { hovered = false }
    stack.addEventListener('pointerenter', onEnter)
    stack.addEventListener('pointerleave', onLeave)

    cards.forEach((el) => { el.style.willChange = 'transform' })
    render(0)
    raf = requestAnimationFrame(tick)

    return () => {
      stepRef.current = null
      io.disconnect()
      cancelAnimationFrame(raf)
      stack.removeEventListener('pointerenter', onEnter)
      stack.removeEventListener('pointerleave', onLeave)
      cards.forEach((el) => {
        el.style.transform = ''
        el.style.zIndex = ''
        el.style.willChange = ''
      })
    }
  }, [count])

  const next = useCallback(() => stepRef.current?.(1), [])
  const prev = useCallback(() => stepRef.current?.(-1), [])

  return { stackRef, next, prev }
}
`;export{e as default};
