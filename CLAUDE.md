# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

No build step — this is a static site of three self-contained pages. Serve locally with:

```bash
python3 -m http.server 8766
```

Then open `http://localhost:8766/`.

The only builds in the repo are the **two dev-only React islands**, and neither touches the site — `npm run islands` builds both, or one at a time:

```bash
npm run dial        # tuning panel      → assets/dial/dial.js              (index.html only)
npm run agentation  # annotation toolbar → assets/agentation/agentation.js  (all four pages)
```

Each is a self-contained ES module that its pages fetch **only** on localhost or behind a query flag (`?dial`, `?agent`) — see `docs/dev-islands.md`. The three pages stay hand-written, and a real visitor still downloads no framework, bundler, or runtime: measured from a non-localhost host with no flag: zero island bytes on every page. The toolbar's gate is in four files, because the vault pages carry it from `tools/locked.template.html` rather than by hand.

## Architecture

Three pages, each with its HTML, CSS, and JS inline — no framework, bundler, or runtime dependency; the only external request is the Inter webfont from Google Fonts (`finsynth.html` also loads Caveat for the problem wall).

- `index.html` — the portfolio itself: hero, work rows, about, education, toolkit, contact. Home of the interactive cat and paw prints.
- `finsynth.html` — the long-form FinSynth case study, with its own section rail, figures, and ask-me chat. **Since 2026-08-24 the file at this path is the vault build, not the case study** — the study itself is AES-GCM ciphertext inside it and the page opens on the password gate (see `docs/vault.md`). It is therefore **generated output**: the hand-written source lives in gitignored `private/finsynth.source.html`, and every description of the page in `docs/finsynth-case-study.md` is a description of that source.
- `case.html` — one template that renders a short case study from `?c=<key>`, in finsynth's shell. It **holds exactly one key today, `eventbeep`**; it is a template with one entry, not a five-page section (see `docs/case-shell.md`).
- `locked.html` — the same vault, at a second URL, from the same fragment and behind the same code. It was the only vault until `finsynth.html` became one; it is kept as the **hand-off link** — a URL that is the case study and nothing else, with no portfolio around it. Wherever these docs say *the three files* about a shared shell block, `locked.html` is a fourth copy of it. Like `finsynth.html` it is **generated, never hand-written** (see `docs/vault.md`).

`finsynth.html` is the reference implementation of the shared shell (nav, masthead, chapters, close, reveal, theme, ask-me chat) and `case.html` carries a copy of it — when the shell changes, change both. **Read that as `private/finsynth.source.html` now**: the shell edit goes into the source, and the published `finsynth.html` is a rebuild away (`node tools/extract-case.mjs` then `npm run lock`). Editing the built page by hand is the mistake this file already warns about for `locked.html`, and it now applies to two files.

**Design direction:** Deliberately minimal, in the spirit of salleedesign.com — single 660px column, left-aligned, hairline rules between rows, near-monochrome palette, type doing all the work. No shadows, gradients, or decorative graphics. Keep it that way: new sections should be a `.rows` list or a `.pairs` definition list, not a new visual pattern. There are exactly **three** exceptions, all deliberate and all named here: the `.shelf` card rails in `#work` / `#side` — tinted plates and photography, added because the work itself deserved tiles — the **section-label folder** (`.sec-icon`), a shaded Finder glyph beside each `.sec-label`, and the **photo blocks** in `#community` / `#life`, added 2026-08-22. Everything else stays rows, and none of the three is a licence for a fourth: a new decorative graphic still needs to be argued for. Note what the third one is *not*, which is decoration — in all three photo places the picture **is** the content, which is the same argument that earned `.card-art.shot` its screenshots: the mentoring sessions and the life outside the work are the only thing either section has to show.

**Type scale:** Six roles, and six is the point (Ritika, 2026-08-22: "define h1, h2, h3 and body1 and body2, pill. currently the text type the page still feels broken."). Across the three pages there were **seventeen** distinct font-sizes in play — 10, 12, 12.5, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 26, 30, 32 — which is not a scale, it is a pile, and it is why the type read as broken. Two of those were structural rather than just noise: `h2` was declared at both **26px and 32px**, and `.decision-head h3` at **26px** — the same size as the smaller `h2` — so wherever the two met the heading hierarchy was inverted and 07's three decisions read as peers of the chapters instead of children of one.

The tokens live in `:root` and the block is **identical in all three files**, so a heading is the same size on every page:

```css
--h1: clamp(32px, 7vw, 44px);   --h1-lh: 1.16;    /* page title */
--h2: 30px;                     --h2-lh: 1.28;    /* section / chapter title */
--h3: 22px;                     --h3-lh: 1.4;     /* sub-head, pull, card title */
--body1: 17px;                  --body1-lh: 1.7;  /* reading prose, standfirst */
--body2: 15px;                  --body2-lh: 1.55; /* UI, meta, captions */
--pill: 12px;                   --pill-lh: 1;     /* mono micro-caps tags and keys */
```

Three rules come with it. **Each role ships its line-height alongside** — a size without its leading is half a decision, and that is how 22px leading ended up on 13px, 15px and 17px text alike. **Anything needing a distinction the six can't make reaches for ink or weight, never a seventh size** — that is the chapter-head rule ("the head carries four levels on two type sizes, because colour and the rule do the rest") generalised to the whole site; it is also why the old 13px and 15px tiers collapsed into one `--body2`. And **the scale steps down as one thing, not rule by rule** — one media query, the same in all three files, replacing the per-rule mobile sizes that `.standfirst`, `.decision-head h3` and `.evo-hinge p` (a class since deleted — see `docs/finsynth-case-study.md`) each carried:

```css
@media (max-width: 720px) { :root { --h2: 26px; --h3: 20px; } }
```

`--h1` needs no entry there because its own `clamp()` already steps it, and `--body1`/`--body2` hold at any measure.


**Animation:** No animation library. Sections tagged `.reveal` fade up once via an `IntersectionObserver`. Everything else is CSS transitions. `prefers-reduced-motion` disables the reveal and smooth scrolling.


**CSS custom properties** (in `:root`): colors and the font stack. Every color is a variable — that is what makes the dark theme (`docs/design-system.md`) a single token block instead of a second stylesheet. Never hardcode a color in a rule; add a token.


## Hard rules

These bind every change. Everything else is reasoning, and lives in `docs/`.

**Never hand-edit generated output.** `finsynth.html` and `locked.html` are vault builds (edit `private/finsynth.source.html` or `tools/locked.template.html`, then rebuild — see `docs/vault.md`); `assets/dial/dial.js` and `assets/agentation/agentation.js` are island builds; `animation-curator/` is build output from the sibling repo. Hand-editing any of them is silently reverted by the next build.

**The plaintext never gets committed.** `private/` is gitignored and named in `.vercelignore` — a CLI `vercel deploy` uploads the working tree, which would publish the case study. The vault password is passed as `CASE_PASSWORD` and never written to a file.

**A vault content driver is two files.** The injected fragment runs no `<script>`, so `tools/extract-case.mjs` flattens JS-driven markup to a resting state — except where the behaviour is worth keeping, in which case the driver moves to `tools/locked.template.html` and arms from `armContentDrivers()` in `inject()`. The Before/After switcher is the only one today. A driver there needs a matching `keep()` assertion in the extractor, because the driver binds by class and id and fails silently: without it a rename in the source ships a dead control instead of breaking the build. Same for anything the driver leaves `hidden` at rest, which goes in the extractor's stray-`hidden` allowlist.

**Shell parity.** `finsynth.html` is the reference implementation of the case-study shell and `case.html` carries a copy; `locked.html` and `tools/locked.template.html` carry the header and footer blocks. Change the shell and it is four files, not one — and a rule finsynth *deletes* has to be deleted in the others too, not only added when finsynth adds one. `index.html` shares the theme script, the theme driver, the switch markup and the riri wordmark with both.

**Tokens, not values.** Every colour is a `var()` in `:root`; never hardcode one, add a token. Same for the motion tokens (`--ease-row`, `--dur-row`, `--dur-fill`). Page furniture flips with the theme, artwork never does, and shadows are per-theme — see `docs/design-system.md`.

**Six type roles and no seventh.** Anything needing a distinction the six can't make reaches for ink or weight, never a new size. Artwork is off the scale on purpose and is commented as such at each site.

**No new visual patterns.** A new section is a `.rows` list or a `.pairs` definition list. The three standing exceptions (card shelves, section-label folders, photo blocks) are listed under **Design direction** and none of them is a licence for a fourth.

**Section grammar on the case studies — Context → Image → Interpretation.** Before a figure, say only why the reader is about to see it; the figcaption says what they are looking at; everything interpretive lands after. Copy that explains a figure never sits above it.

**No em dashes in reader-facing copy**, on any page: prose, glosses, captions, `<title>`, `og:` meta, every `aria-label` and `title`, and the chat's `QA` strings. Code comments are exempt. Substitutions are punctuation-only — a dash is a joint, not a word, so never reword to remove one.

**The cut-copy rule.** A line that comes off `finsynth.html` for length becomes a `QA` entry rather than a deletion, re-punctuated but never reworded. Caveat: the published vault ships no chat, so a cut currently reads as a deletion to anyone but the source's editor — see `docs/ask-me-chat.md`.

**The evidence rule.** Every claim on the FinSynth page traces to a `[VERIFIED]` entry in `case-study-inputs/FINSYNTH-INTAKE.md`. No invented numbers, honest authorship split, collaborators credited as roles rather than names.

**Icon-only controls carry both `aria-label` and `title`.** Controls that ship `hidden` and are shown by measurement (`.shelf-nav`, `.wf-nav`, `.nav-lock`) need their own `[hidden] { display: none }` restated, because `display: flex` outranks the UA rule.

**Two things were removed on purpose and must not come back:** case-study modals ("no pop ups" — case studies are real pages), and the Work/Side tab toggle (both shelves are visible at once). Nor the case-study Next chain, nor a case page with no card pointing at it.

**The agentation gate is in four files.** `index.html`, `case.html` and `tools/locked.template.html` (which puts it on both vault builds) carry identical copies of the arming IIFE. Add a host or a flag to one and add it to all three sources.

**Dev islands stay gated and React never owns page markup.** Don't convert markup to JSX, don't ungate a panel, don't import the dial from the other two pages.

## Where the reasoning lives

Read the relevant file before working in that area — each one carries the dated annotations, the rejected alternatives and the measurements behind the rules above.

- `docs/design-system.md` — type scale moves, light/dark theme and the switch pill, row hover, the spotlight and its ink lens, the riri wordmark, section-label folders.
- `docs/index-page.md` — the cat and paw prints, the loading animation, work/side/life shelves, Experience and company marks, Community, Beyond work, hero-as-About, footer, Toolkit, section order.
- `docs/case-shell.md` — the section rail, the story-tab band, the tick rail, the back circle, case-study routing, the masthead facts grid, section separators, chapter heads.
- `docs/finsynth-case-study.md` — every chapter-level decision in the FinSynth study: both diagrams, the Before/After switcher, the workflow rails, the real product captures, chapter tags, section grammar, the em-dash sweep.
- `docs/ask-me-chat.md` — the pill and drawer, chips and composer, follow-up pills, the attract nudge, resize and pop-out, the cut-copy block.
- `docs/dev-islands.md` — the tuning panel and the annotation toolbar.
- `docs/vault.md` — the encryptor, the template, the extractor, the gate UI, the padlock, and the four limits worth knowing before sharing the page.
