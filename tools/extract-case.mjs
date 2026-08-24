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
 *   node tools/extract-case.mjs --in finsynth.html --out private/finsynth.plain.html
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: o } = parseArgs({
  options: {
    in:  { type: 'string', default: 'finsynth.html' },
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

// 1. The spotlight lens is a cursor-tracked layer with an empty DOM footprint
//    and no JS to move it. An unarmed lens is a blank div; drop it.
cut(/\s*<div class="spotlight" aria-hidden="true">\s*<div class="spotlight-lens"><div class="spotlight-img"><\/div><\/div>\s*<\/div>/,
    'spotlight layer');

// 2. The sticky story-tab navigator only ever scrolled and set aria-selected.
//    Nothing is hidden behind it, so the four chapters below read as one
//    sequence without it — which is what the band was for in the first place.
cut(/\s*<div class="story-tab-sticky">[\s\S]*?<\/div>\s*<\/div>/, 'story-tab navigator');
swap(/ class="chapter reveal story-tab-panel" role="tabpanel" aria-labelledby="story-tab-[a-z]+"/g,
     ' class="chapter"', 'story-tab panels', 4);

// 3. .reveal is opacity:0 until an IntersectionObserver adds .in. With no
//    observer every section would stay invisible, so the class comes off the
//    markup rather than being overridden in CSS.
swap(/ reveal(?=["\s])/g, '', '.reveal classes', 8);

// 4. The Before/After switcher is a real tablist: one figure and one label
//    carry `hidden`, and the driver moves both. Static, both states show, so
//    each label goes inside the figure it names and the tablist goes away.
cut(/\s*<div class="evo-state-heading">[\s\S]*?<\/div>/, 'evo state heading');
cut(/\s*<div class="evo-bar">[\s\S]*?<\/div>\s*<\/div>/, 'evo tablist band');
swap(/<figure class="evo-state" id="evo-before" role="tabpanel" aria-labelledby="evo-tab-before evo-before-label">/,
     '<figure class="evo-state" id="evo-before">\n                <p class="evo-label">You chose the workflow.</p>',
     'evo before figure');
swap(/<figure class="evo-state" id="evo-after" role="tabpanel" aria-labelledby="evo-tab-after evo-after-label" hidden>/,
     '<figure class="evo-state" id="evo-after">\n                <p class="evo-label">The agent determines the work.</p>',
     'evo after figure');

// 5. #anatomy cross-highlights on a 2.8s cycle. Its documented reduced-motion
//    resting state is the first region lit, which is a class on two elements.
swap(/<div class="anat-region" data-region="edit-query">/,
     '<div class="anat-region on" data-region="edit-query">', 'anatomy first region');
swap(/(<ol class="anat-list">\s*<li)>/, '$1 class="on">', 'anatomy first list item');

// Anything still carrying `hidden` would stay hidden forever. The two
// .wf-nav arrows are the one legitimate case: they ship hidden and are only
// ever shown by measurement, and the rail they page scrolls natively.
{
  const left = main.match(/<[^>]*\shidden(?=[\s>])[^>]*>/g) || [];
  const stray = left.filter((t) => !/class="wf-nav/.test(t));
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

    /* Both switcher states are shown, so each carries its own label and the
       two figures need air between them. */
    .evo-state > .evo-label { text-align: center; margin-bottom: 13px; }
    .evo-state + .evo-state { margin-top: 30px; }
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
${main}`;

writeFileSync(o.out, out);
console.log(`extract-case: ${n} transforms applied.`);
console.log(`  ${o.in} -> ${o.out}  (${(out.length / 1024).toFixed(1)} kB)`);
