/**
 * Agentation bridge — the second React island on this site, and like the first
 * one it renders none of the portfolio.
 *
 * Agentation is a visual feedback toolbar: you click an element, type what is
 * wrong with it, and it hands the coding agent a note that already knows which
 * element you meant (its path, its classes, the text near it). That is the whole
 * reason it earns a React dependency here — the alternative is describing "the
 * third card's subtitle, the one under the plate" in prose every time.
 *
 * It does not touch the page. There is no JSX for the hero, the rows or the
 * cards; the component mounts itself into a portal above everything (its own
 * layer sits at z-index 99994–100020, clear of the cat band at 9997 and the
 * pixel loader at 10000) and reads the DOM the page already rendered. Its own
 * stylesheet is compiled into this bundle, so like the dial there is exactly one
 * file and one request.
 *
 * Loaded only behind the gate in each page (localhost, or ?agent) — a real
 * visitor never downloads it. Unlike the dial, all three pages carry that gate:
 * the copy most worth annotating is on the two case studies, not the portfolio
 * index. That is also why this is its own bundle rather than another panel
 * inside dial.js, which is index-only by design.
 */
import { createRoot } from 'react-dom/client';
import { Agentation } from 'agentation';

/**
 * The agentation-mcp HTTP server — `npx agentation-mcp server`, port 4747, the
 * same server .mcp.json registers for Claude Code. With it up, an annotation is
 * in the agent's hands the moment you hit send. With it down the toolbar warns
 * once, keeps every annotation in localStorage and falls back to copying
 * markdown to the clipboard, so a forgotten server costs a paste, not the notes.
 */
const ENDPOINT = 'http://localhost:4747';

const host = document.createElement('div');
host.id = 'agentation-root';
document.body.appendChild(host);

createRoot(host).render(<Agentation endpoint={ENDPOINT} />);
