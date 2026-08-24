/**
 * dialkit bridge — the one React island on this site.
 *
 * The site is three static pages with no build step, and this does not change
 * that. Nothing here renders a pixel of the portfolio: there is no JSX for the
 * hero, the rows or the cards, and no component owns any of the page. All this
 * island does is turn dialkit's panel into a *writer* for the two places the
 * site already keeps its tunable values:
 *
 *   1. CSS custom properties  — every colour, measure and easing
 *   2. window.__tune          — the named JS constants in index.html
 *
 * Because those are the same values the page's own drivers already read, tuning
 * is live with no re-render: CSS reflows on its own, and the cat / paw /
 * spotlight loops re-read `__tune` every frame or every event. The pixel loader
 * is the one exception — it runs once at load and removes itself from the DOM —
 * so it gets a Replay button rather than a live dial.
 *
 * Two rules hold this together, and both matter:
 *
 * • A dial sitting at its default writes *nothing*. It calls removeProperty, so
 *   the stylesheet stays in charge and the light/dark toggle keeps working. Move
 *   a dial and that one token gets pinned inline across both themes, which is
 *   what "Clear overrides" is for. Pinning every token at mount would have
 *   silently broken the theme flip.
 *
 * • The dial names are the token names. `--brand` is called brand, `--shelf-card`
 *   shelfCard, ASSEMBLE_MS assembleMs — camelCase throughout, because dialkit's
 *   label formatter splits runs of capitals. The panel's Copy button emits JSON,
 *   and the point of matching the names is that the JSON tells you exactly which
 *   line of index.html to edit to make a tuned value permanent.
 *
 * Loaded only behind the gate in index.html (localhost, or ?dial) — a real
 * visitor never downloads it.
 */
import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import { DialRoot, useDialKit } from 'dialkit';
import dialCss from 'dialkit/styles.css?inline';

const root = document.documentElement;

/** dialkit hands hex back in its own casing; compare case-insensitively. */
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Write `value` onto `el` as a custom property, or clear it when the dial is
 * still at `fallback`. Clearing rather than writing the identical value is what
 * leaves the theme rules in control (see the header note).
 */
function put(el: HTMLElement, prop: string, value: string, fallback: string) {
  if (same(value, fallback)) el.style.removeProperty(prop);
  else el.style.setProperty(prop, value);
}

/** Same, applied to every match — for tokens declared on a class, not :root. */
function putAll(sel: string, prop: string, value: string, fallback: string) {
  document.querySelectorAll<HTMLElement>(sel).forEach((el) => put(el, prop, value, fallback));
}

// The light-theme values, verbatim from index.html's :root. Alpha channels are
// the rgba() lines expressed as #RRGGBBAA so dialkit renders a colour picker.
const D = {
  brand: '#752afc',
  brandHover: '#6109de',
  bg: '#fcfcfc',
  bgSecondary: '#ececee',
  bgHover: '#ffffff',
  text: '#2c2c35',
  muted: '#5d5d6f',
  faint: '#acacb9',
  line: '#00000014',       /* rgba(0, 0, 0, 0.08) */
  lineSoft: '#0000000f',   /* rgba(0, 0, 0, 0.06) — row divider */
  lineStrong: '#0000001a', /* rgba(0, 0, 0, 0.10) — hovered row edge */
  lineHover: '#00000029',  /* rgba(0, 0, 0, 0.16) */
  ok: '#3ea96b',
};

function Dials() {
  // ——— 1. Design tokens ———————————————————————————————————————————————
  const t = useDialKit(
    'Tokens',
    {
      brand: { type: 'color' as const, default: D.brand },
      brandHover: { type: 'color' as const, default: D.brandHover },
      ink: {
        text: { type: 'color' as const, default: D.text },
        muted: { type: 'color' as const, default: D.muted },
        faint: { type: 'color' as const, default: D.faint },
      },
      ground: {
        bg: { type: 'color' as const, default: D.bg },
        bgSecondary: { type: 'color' as const, default: D.bgSecondary },
        bgHover: { type: 'color' as const, default: D.bgHover },
      },
      lines: {
        line: { type: 'color' as const, default: D.line },
        lineSoft: { type: 'color' as const, default: D.lineSoft },
        lineStrong: { type: 'color' as const, default: D.lineStrong },
        lineHover: { type: 'color' as const, default: D.lineHover },
      },
      ok: { type: 'color' as const, default: D.ok },
      clearOverrides: { type: 'action' as const, label: 'Clear overrides' },
    },
    {
      id: 'folio-tokens',
      persist: true,
      onAction: () => {
        // Hand every token back to the stylesheet — the escape hatch after a
        // pinned colour follows you across a theme flip.
        root.removeAttribute('style');
        document
          .querySelectorAll<HTMLElement>('.shelf, .spotlight-lens')
          .forEach((el) => el.removeAttribute('style'));
      },
    },
  );

  useEffect(() => {
    put(root, '--brand', t.brand, D.brand);
    put(root, '--brand-hover', t.brandHover, D.brandHover);
    put(root, '--text', t.ink.text, D.text);
    put(root, '--muted', t.ink.muted, D.muted);
    put(root, '--faint', t.ink.faint, D.faint);
    put(root, '--bg', t.ground.bg, D.bg);
    put(root, '--bg-secondary', t.ground.bgSecondary, D.bgSecondary);
    put(root, '--bg-hover', t.ground.bgHover, D.bgHover);
    put(root, '--line', t.lines.line, D.line);
    put(root, '--line-soft', t.lines.lineSoft, D.lineSoft);
    put(root, '--line-strong', t.lines.lineStrong, D.lineStrong);
    put(root, '--line-hover', t.lines.lineHover, D.lineHover);
    put(root, '--ok', t.ok, D.ok);
  }, [t]);

  // ——— 2. Layout ——————————————————————————————————————————————————————
  // --content and --gutter are the whole page geometry: the column, the dashed
  // guides, the shelf bleed and the loader's ink changeover all derive from
  // them, so moving one moves everything that was built off it. shelfCard and
  // lens are declared on .shelf / .spotlight-lens rather than :root, so they
  // are written per element.
  const l = useDialKit(
    'Layout',
    {
      content: [572, 420, 900, 1] as [number, number, number, number],
      gutter: [24, 0, 80, 1] as [number, number, number, number],
      shelfCard: [272, 160, 460, 1] as [number, number, number, number],
      spotlightLens: [760, 240, 1400, 10] as [number, number, number, number],
      // The row/card hover easing, hoisted out of 12 hardcoded declarations
      // into tokens so it can be tuned at all.
      durRow: [0.35, 0, 1.5, 0.01] as [number, number, number, number],
      durFill: [0.3, 0, 1.5, 0.01] as [number, number, number, number],
    },
    { id: 'folio-layout', persist: true },
  );

  useEffect(() => {
    put(root, '--content', `${l.content}px`, '572px');
    put(root, '--gutter', `${l.gutter}px`, '24px');
    put(root, '--dur-row', `${l.durRow}s`, '0.35s');
    put(root, '--dur-fill', `${l.durFill}s`, '0.3s');
    putAll('.shelf', '--shelf-card', `${l.shelfCard}px`, '272px');
    // The spotlight driver re-measures the lens on every mouseenter, so a size
    // change is picked up without touching its JS.
    putAll('.spotlight-lens', 'width', `${l.spotlightLens}px`, '760px');
    putAll('.spotlight-lens', 'height', `${l.spotlightLens}px`, '760px');
  }, [l]);

  // ——— 3. Animation timings ———————————————————————————————————————————
  const a = useDialKit(
    'Animation',
    {
      // camelCase, not the SCREAMING_SNAKE of the constants themselves:
      // dialkit's label formatter splits runs of capitals, so TILE rendered as
      // "T I L E" and ASSEMBLE_MS as "A S S E M B L E_ M S". The mapping back to
      // window.__tune.loader is spelled out in the effect below.
      loader: {
        tile: [8, 2, 40, 1] as [number, number, number, number],
        startMs: [40, 0, 600, 10] as [number, number, number, number],
        assembleMs: [780, 120, 4000, 10] as [number, number, number, number],
        holdMs: [130, 0, 1200, 10] as [number, number, number, number],
        revealWindow: [0.22, 0.02, 0.9, 0.01] as [number, number, number, number],
        waitCapMs: [900, 0, 4000, 50] as [number, number, number, number],
        jitter: [9, 0, 60, 1] as [number, number, number, number],
        minBand: [72, 0, 400, 4] as [number, number, number, number],
        replay: { type: 'action' as const, label: 'Replay loader' },
      },
      spotlightLerp: [0.09, 0.01, 0.6, 0.01] as [number, number, number, number],
      pawThrottleMs: [2500, 0, 8000, 50] as [number, number, number, number],
    },
    {
      id: 'folio-animation',
      persist: true,
      // The loader runs once at load and deletes itself, so it can't be nudged
      // in place — index.html keeps a snapshot and re-runs it on demand.
      onAction: () => window.__replayLoader?.(),
    },
  );

  useEffect(() => {
    const T = window.__tune;
    if (!T) return;
    Object.assign(T.loader, {
      TILE: a.loader.tile,
      START_MS: a.loader.startMs,
      ASSEMBLE_MS: a.loader.assembleMs,
      HOLD_MS: a.loader.holdMs,
      REVEAL_WINDOW: a.loader.revealWindow,
      WAIT_CAP_MS: a.loader.waitCapMs,
      JITTER: a.loader.jitter,
      MIN_BAND: a.loader.minBand,
    });
    T.spot.lerp = a.spotlightLerp;
    T.paws.hoverThrottle = a.pawThrottleMs;
  }, [a]);

  // ——— 4. The cat —————————————————————————————————————————————————————
  const c = useDialKit(
    'Cat',
    {
      flee: {
        radius: [250, 40, 900, 10] as [number, number, number, number],
        trigger: [3, 0.5, 30, 0.5] as [number, number, number, number],
        speed: [4, 0, 20, 0.5] as [number, number, number, number],
        ramp: [0.02, 0, 0.2, 0.005] as [number, number, number, number],
        friction: [0.88, 0.6, 0.99, 0.01] as [number, number, number, number],
      },
      chase: {
        radius: [60, 0, 400, 5] as [number, number, number, number],
        accel: [1.8, 0, 8, 0.1] as [number, number, number, number],
        friction: [0.92, 0.6, 0.99, 0.01] as [number, number, number, number],
      },
      caught: {
        purrMs: [3000, 300, 10000, 100] as [number, number, number, number],
        immuneMs: [1500, 0, 6000, 100] as [number, number, number, number],
        tapMs: [1800, 0, 6000, 100] as [number, number, number, number],
        escape: [7, 0, 24, 0.5] as [number, number, number, number],
      },
      edgePad: [40, 0, 200, 2] as [number, number, number, number],
    },
    { id: 'folio-cat', persist: true },
  );

  useEffect(() => {
    const T = window.__tune;
    if (!T) return;
    Object.assign(T.cat, {
      fleeRadius: c.flee.radius,
      fleeTrigger: c.flee.trigger,
      fleeSpeed: c.flee.speed,
      fleeRamp: c.flee.ramp,
      fleeFriction: c.flee.friction,
      chaseRadius: c.chase.radius,
      chaseAccel: c.chase.accel,
      chaseFriction: c.chase.friction,
      purrMs: c.caught.purrMs,
      immuneMs: c.caught.immuneMs,
      tapMs: c.caught.tapMs,
      escape: c.caught.escape,
      pad: c.edgePad,
    });
  }, [c]);

  // productionEnabled because the bundle is built in production mode; the gate
  // in index.html is what actually keeps this off the live site.
  return <DialRoot position="top-right" defaultOpen={false} productionEnabled />;
}

const style = document.createElement('style');
style.textContent = dialCss;
document.head.appendChild(style);

const host = document.createElement('div');
host.id = 'dial-root';
document.body.appendChild(host);
createRoot(host).render(<Dials />);
