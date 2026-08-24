const e=`import { useEffect, useRef } from 'react'

/**
 * Scroll-scrubbed dolly zoom. The element scales from ZOOM_MIN up to 1 as it rises into
 * the viewport and back down as it leaves the top, so it reads as the camera pushing in
 * on arrival and pulling out on exit. Nothing is timed — the scale is a pure function of
 * scroll position, which means it tracks a flick, a drag and a trackpad glide equally
 * well, and it costs nothing when the page is still.
 *
 * \`root\` is the scrolling element. It defaults to the viewport. The version this came
 * from hard-wired \`window\` and shared one listener across every registered element,
 * which is cheaper — but a gallery tile scrolls inside its own box, and a single global
 * listener has no way to measure against more than one scroll frame. Each instance
 * therefore owns its listener here; the rAF coalescing below keeps that to one layout
 * read per frame per element regardless of how fast events arrive.
 *
 * Attach the ref to an inner wrapper, never to an ancestor of a \`position: sticky\`
 * child — a transform on the ancestor silently makes sticky stop working.
 */
const ZOOM_MIN = 0.9 // scale when the element is fully outside the settle band

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const smooth = (t: number) => t * t * (3 - 2 * t)

export default function useScrollZoom<T extends HTMLElement>(
  root?: React.RefObject<HTMLElement | null>,
) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const scroller: HTMLElement | Window = root?.current ?? window
    let raf = 0
    let scheduled = false

    const apply = () => {
      scheduled = false
      const viewTop = scroller === window ? 0 : (scroller as HTMLElement).getBoundingClientRect().top
      const viewH = scroller === window ? window.innerHeight : (scroller as HTMLElement).clientHeight
      const rect = el.getBoundingClientRect()
      const top = rect.top - viewTop
      const bottom = rect.bottom - viewTop

      // The ramp adapts to the element's own height: short elements reach full scale
      // once centred, tall ones hold at full scale through their middle instead of
      // spending the whole pass easing.
      const span = Math.min(viewH * 0.5, rect.height * 0.6 + 1)
      if (span <= 0) return
      const pIn = clamp((viewH - top) / span, 0, 1) // 0 entering the bottom → 1 arrived
      const pOut = clamp(bottom / span, 0, 1) // 1 in view → 0 gone off the top
      const z = smooth(Math.min(pIn, pOut))
      el.style.transform = \`scale(\${(ZOOM_MIN + (1 - ZOOM_MIN) * z).toFixed(4)})\`
    }

    const onScroll = () => {
      if (scheduled) return
      scheduled = true
      raf = requestAnimationFrame(apply)
    }

    el.style.transformOrigin = 'center center'
    el.style.willChange = 'transform'
    scroller.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    apply()

    return () => {
      cancelAnimationFrame(raf)
      scroller.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      el.style.transform = ''
      el.style.willChange = ''
    }
  }, [root])

  return ref
}
`;export{e as default};
