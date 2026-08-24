#!/usr/bin/env node
/**
 * extract-case.mjs — lift a page's <style> and <main> into one standalone
 * fragment that `encrypt-case.mjs` can seal, and that `locked.html` can inject
 * with innerHTML.
 *
 * Why a script and not a hand-copied file: the source page keeps changing, and
 * a plaintext pasted by hand goes stale silently. This is re-runnable, and
 * every transform below asserts that it actually matched — a source edit that
 * moves one of these blocks fails the build instead of shipping a page with an
 * invisible chapter in it.
 *
 * The transforms exist because innerHTML runs no <script>: inline <style> in
 * the injected content applies, script tags in it are inert. So every
 * behaviour the source page drives from JS has to be replaced by its resting
 * state here, not merely left alone.
 *
 * There is a second option and transform 4 takes it: the page the fragment is
 * injected INTO runs its own scripts, so a behaviour worth keeping can have its
 * driver moved to tools/locked.template.html instead of being flattened here.
 * That is strictly more work than a resting state and it is not the default --
 * it splits one interaction across two files. Reach for it when the resting
 * state loses something the reader notices, which for the Before/After
 * switcher it did.
 *
 *   node tools/extract-case.mjs --in private/finsynth.source.html \
 *     --out private/finsynth.plain.html
 *
 * The default --in is private/finsynth.source.html and NOT finsynth.html, because
 * finsynth.html is now the vault build (generated output). The plaintext source
 * lives only in gitignored private/ -- see "Password-protected case page" in
 * CLAUDE.md. Pointing this at the vault page fails loudly on the first assert
 * rather than producing a fragment, which is the intended failure.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: o } = parseArgs({
  options: {
    in:  { type: 'string', default: 'private/finsynth.source.html' },
    out: { type: 'string', default: 'private/finsynth.plain.html' },
  },
});

const src = readFileSync(o.in, 'utf8');

/* ---------- slice the two blocks out ---------- */

function between(open, close, label) {
  const a = src.indexOf(open);
  const b = src.indexOf(close, a);
  if (a < 0 || b < 0) fail(`could not find ${label} in ${o.in}`);
  return src.slice(a + open.length, b);
}
function fail(why) { console.error(`extract-case: ${why}`); process.exit(1); }

const css  = between('<style>', '</style>', 'the <style> block');
let   main = between('<main>',  '</main>',  'the <main> element');

// Ask Me is page furniture, not part of <main>, and its scripted answers live
// in the source page's trailing script. A vault that only lifts <main> silently
// loses both the control and the design evidence behind it. Carry the trusted
// markup and its two self-contained drivers with the encrypted fragment; the
// vault template executes them after injection, when the controls exist.
const askMarkup = between(
  '  <!-- ===== ASK-ME CHAT — opened from the floating pill ===== -->',
  '\n\n  <script>',
  'Ask Me markup'
);
const askStart = src.indexOf('  // ——— Ask-me chat (floating pill + drawer) ———');
const askEnd = src.indexOf('  // ——— Agentation annotation toolbar (dev only) ———', askStart);
if (askStart < 0 || askEnd < 0) fail('could not find the Ask Me drivers');
const askDriver = src.slice(askStart, askEnd).trim();
if (!/var QA = \[/.test(askDriver) || !/classList\.contains\('ask-pill-float'\)/.test(askDriver)) {
  fail('Ask Me driver lost its Q&A data or cat control');
}

// The section rail is a SIBLING of <main>, not a child, so slicing <main>
// alone dropped it -- and dropped it silently, which is the part that matters:
// every other omission in this file is asserted, and this one was invisible
// until Ritika read the unlocked page and said "my page index is missing"
// (2026-08-24). Slicing it explicitly is what puts it back under the same
// build-fails-loudly rule as everything else here.
const index = '<nav class="index"'
  + between('<nav class="index"', '</nav>', 'the section index')
  + '</nav>';
if (!/id="caseIndex"/.test(index)) fail('the section index lost id="caseIndex", which its driver binds to');
{
  // The rail's own hooks, asserted for the same reason the keep()s below are:
  // its driver lives in the template and binds by href, so a renamed anchor
  // would ship a rail that highlights nothing rather than failing the build.
  const hrefs = (index.match(/href="#[a-z-]+"/g) || []).length;
  if (hrefs !== 12) fail(`the section index: expected 12 links, found ${hrefs}`);
}

/* ---------- transforms, each one asserted ---------- */

let n = 0;
function cut(re, label, expect = 1) {
  const before = main;
  main = main.replace(re, '');
  const hits = countHits(before, re);
  if (hits !== expect) fail(`${label}: expected ${expect} match(es), found ${hits}`);
  n++;
}
function swap(re, to, label, expect = 1) {
  const hits = countHits(main, re);
  if (hits !== expect) fail(`${label}: expected ${expect} match(es), found ${hits}`);
  main = main.replace(re, to);
  n++;
}
function countHits(s, re) {
  if (!re.global) return re.test(s) ? 1 : 0;
  return (s.match(re) || []).length;
}
// The third kind of transform, which is the absence of one. Some markup has to
// survive UNCHANGED because a driver in tools/locked.template.html binds to it
// after injection, and that driver binds by class and id and returns silently
// when it finds nothing. Silence is the problem: a source edit that renames one
// of those hooks would ship a dead control rather than failing the build, which
// is the exact failure every cut() and swap() above exists to prevent. keep()
// asserts and changes nothing, so the hooks are checked the same way.
function keep(re, label, expect = 1) {
  const hits = countHits(main, re);
  if (hits !== expect) fail(`${label}: expected ${expect} match(es), found ${hits}`);
  n++;
}

// 1. The spotlight lens is a cursor-tracked layer with an empty DOM footprint
//    and no JS to move it. An unarmed lens is a blank div; drop it.
cut(/\s*<div class="spotlight" aria-hidden="true">\s*<div class="spotlight-lens"><div class="spotlight-img"><\/div><\/div>\s*<\/div>/,
    'spotlight layer');

// 2. The sticky story-tab navigator. Cut until 2026-08-24 on the argument
//    that nothing hides behind it, so the four chapters read as one sequence
//    without it. That argument was about the content and it held; what it
//    missed is that the band is also the reader's map of the opening, and
//    Ritika named all four labels as missing ("my navigation dov for the
//    analyst, the old product, the limitation"). So it takes the same route
//    the Before/After switcher took the same day: keep the markup, move the
//    driver into the template. The panels keep role="tabpanel" and their
//    aria-labelledby, because a tablist whose panels are not panels is worse
//    than no tablist.
keep(/<div class="story-tab-sticky">/, 'story-tab band');
keep(/<button class="story-tab" id="story-tab-[a-z]+"[^>]*\saria-controls="[a-z]+"/g,
     'story tabs, each pointing at its panel', 4);
keep(/ class="chapter reveal story-tab-panel" role="tabpanel" aria-labelledby="story-tab-[a-z]+"/g,
     'story-tab panels, each labelled by its tab', 4);

// 3. .reveal is opacity:0 until an IntersectionObserver adds .in. With no
//    observer every section would stay invisible, so the class comes off the
//    markup rather than being overridden in CSS.
// 13, not the 8 this was written at: the four story-tab panels used to have
//    their class attribute rewritten wholesale by transform 2 and lost ` reveal`
//    on the way. They keep it now, so they are counted here like every other
//    section instead of being stripped as a side effect of a different cut.
swap(/ reveal(?=["\s])/g, '', '.reveal classes', 13);

// 4. The Before/After switcher is a real tablist and it stays one.
//    This was four rewrites until 2026-08-24: the tablist band and the state
//    heading were cut and each .evo-label was reinserted inside the figure it
//    named, so both states showed at once, stacked. Ritika, annotating the
//    switcher on the unlocked page: "why did this change?" -- and the honest
//    answer was that innerHTML runs no <script>, so a tab pair with no driver
//    is a dead control and cutting it was the only safe resting state.
//
//    It is restored by moving the driver instead of deleting the markup. The
//    template's OWN scripts do run, so the switcher is armed from inject()
//    there -- see "Content drivers" in tools/locked.template.html. The four
//    rewrites are gone and only their assertion half is left: `hidden` on
//    #evo-after and #evo-after-label is now the tablist's correct start state
//    (allowed through the stray-hidden check below), and every hook the driver
//    binds to is asserted here so renaming one fails the build.
keep(/<div class="evo-bar">/g, 'before/after tablist bands', 2);
keep(/<button class="evo-tab"[^>]*\sid="(?:evo|citation)-tab-(?:before|after)"[^>]*\saria-controls="(?:evo|citation)-(?:before|after)"/g,
     'before/after tab buttons, each pointing at its panel', 4);
keep(/<p class="evo-label" id="(?:evo|citation)-(?:before|after)-label"/g, 'before/after state labels, one per panel', 4);
keep(/<figure class="evo-state" id="(?:evo|citation)-after"[^>]*\shidden>/g, 'after panels start hidden', 2);
keep(/<p class="evo-label" id="(?:evo|citation)-after-label" hidden>/g, 'after labels start hidden', 2);

// 5. Retired 2026-08-24. #anatomy cross-highlighted on a 2.8s cycle and this
//    pinned its reduced-motion resting state (the first region lit, a class on
//    two elements). Ritika deleted the figure from the source -- "not needed"
//    -- so both swaps went from finding one match each to finding none, and a
//    swap that finds nothing fails the build by design. Nothing replaces this:
//    the number is left in place so the ones after it keep their labels.

// Anything still carrying `hidden` would stay hidden forever unless something
// outside the fragment unhides it. Two cases are legitimate, and they are
// legitimate for opposite reasons. The .wf-nav arrows ship hidden and are only
// ever shown by measurement, so hidden is their correct resting state and the
// rail they page scrolls natively without them. #evo-after and its label are
// hidden because that is a tablist's start state, and the template's switcher
// driver moves them the moment a reader picks the other tab -- so this entry
// and that driver are one decision in two files: delete the driver and these
// two go back to being genuine strays.
{
  const left = main.match(/<[^>]*\shidden(?=[\s>])[^>]*>/g) || [];
  const allowed = /class="wf-nav|id="(?:evo|citation)-after(?:-label)?"/;
  const stray = left.filter((t) => !allowed.test(t));
  if (stray.length) fail(`still hidden with no JS to unhide it:\n  ${stray.join('\n  ')}`);
}

/* ---------- static overrides ---------- */
// Appended, so they win on source order against the rules they correct.
const overrides = `
    /* ——— Static-page overrides ——— */
    /* This copy of the case study is injected with innerHTML, so none of the
       page's JS runs. Everything below is a resting state that JS used to
       set. Nothing here restyles the page; it only stops the page waiting. */

    /* The reveal observer never runs. The class is stripped from the markup
       above too; this is the belt to that braces. */
    .reveal { opacity: 1; transform: none; }

    /* The Before/After switcher had two rules here, centring each .evo-label
       inside its figure and spacing the two stacked states apart. Both are
       gone with the stacking: the switcher is a live tablist again (transform
       4), so .evo-state-heading holds the label above the panel and only one
       panel is ever in flow. Nothing replaces them -- the page's own switcher
       CSS was always correct and was only being overridden. */
`;

/* ---------- emit ---------- */
// Caveat is the handwriting on the sticky notes and the diagrams; the shell
// this lands in loads Inter alone, and an injected fragment cannot add a
// <link>. @import has to be the first rule in the sheet.
const out = `<!-- Generated by tools/extract-case.mjs from ${o.in}. Do not edit by hand. -->
<style>
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500&family=Inter:ital,wght@0,400;0,500;1,400&display=swap');
${css}
${overrides}</style>
${index}
${main}
<!-- Ask Me lives outside the source <main>; the vault template runs this
     trusted driver after injection because scripts inserted with innerHTML are inert. -->
${askMarkup}
<script type="text/plain" id="caseAskDriver">${askDriver.replace(/<\/script/gi, '<\\/script')}</script>`;

writeFileSync(o.out, out);
console.log(`extract-case: ${n} transforms applied.`);
console.log(`  ${o.in} -> ${o.out}  (${(out.length / 1024).toFixed(1)} kB)`);
