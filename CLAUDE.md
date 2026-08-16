# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

No build step — this is a single-file static site. Serve locally with:

```bash
python3 -m http.server 8766
```

Then open `http://localhost:8766/`.

## Architecture

Everything lives in `index.html` — HTML, CSS, and JS are all inline in one file. There is no framework, bundler, or runtime dependency. The only external request is the Inter webfont from Google Fonts.

**Design direction:** Deliberately minimal, in the spirit of salleedesign.com — single 660px column, left-aligned, hairline rules between rows, near-monochrome palette, type doing all the work. No cards, shadows, gradients, or decorative graphics. Keep it that way: new sections should be a `.rows` list or a `.pairs` definition list, not a new visual pattern.

**Animation:** No animation library. Sections tagged `.reveal` fade up once via an `IntersectionObserver`. Everything else is CSS transitions. `prefers-reduced-motion` disables the reveal and smooth scrolling.

**Interactive cat:** A `position: fixed` SVG cat element tracks the cursor. It has three states (`sitting`, `chasing`, `fleeing`) each with a distinct inline SVG string. State changes swap `innerHTML` entirely. The cat chases when the user is scrolling, flees when the mouse moves fast within 250px, and sits otherwise. This is the one intentional bit of whimsy — keep it intact across redesigns.

**Paw prints:** A pooled set of 24 `div.paw` elements (plus 4 cat emoji elements) are recycled via index cycling. They spawn on click and on hover over interactive elements (throttled to 400ms), suppressed while scrolling. The hover selector lists the interactive classes — update it if row/link class names change.

**CSS custom properties** (in `:root`): colors and the font stack. A `prefers-color-scheme: dark` block overrides the same variables, so any new color must be a variable to stay theme-safe.

**Row hover:** `.row` replicates salleedesign.com's work-row interaction — the row fills into a white pill, `.row-role` slides open (`max-width` 0 → 100%), `.row-end` opens its `column-gap` 0 → 12px, and `.row-arrow` eases in (`width` 0 → 16px, `translateX(14px)` → 0), all on `.35s cubic-bezier(.22,.61,.36,1)`. Below 640px there is no hover: the role is always visible and the arrow/divider are hidden. `.row-static` rows (Education) never light up and always show their role.

**Case studies:** Work rows are `<button data-case="key">`. Content lives in the `CASES` object in the inline script — plain data, rendered into `#caseOverlay` (a `role="dialog"` sheet with backdrop, ESC/backdrop close, and focus return). To add a project: add a `CASES` entry and a row pointing at it. The copy in `CASES` is a first draft — it is not verbatim from Ritika.

**Sections:** Hero → Work & Experience (`#work`, merged) → About → Education (`#education`) → Toolkit → Footer/Contact. Nav anchors: `#work`, `#about`, `#contact`.
