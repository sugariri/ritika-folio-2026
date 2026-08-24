const e=`import { useEffect, useRef } from 'react'

/**
 * Entrance reveal. Adds a class to the returned ref's element the first time it
 * intersects, then disconnects — reveals are entrances, not repeatable transitions, and
 * an observer that keeps firing invites re-animation on every scroll pass.
 *
 * \`root\` is what the element scrolls inside. It defaults to the viewport, which is what
 * a page section wants; a gallery tile scrolls its own box and must pass that element in,
 * otherwise everything intersects the viewport at once and reveals immediately.
 */
export default function useReveal<T extends HTMLElement>(opts: {
  threshold?: number
  className?: string
  root?: React.RefObject<Element | null>
} = {}) {
  const { threshold = 0.15, className = 'is-in', root } = opts
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          el.classList.add(className)
          io.disconnect()
        }
      },
      { threshold, root: root?.current ?? null },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold, className, root])

  return ref
}
`;export{e as default};
