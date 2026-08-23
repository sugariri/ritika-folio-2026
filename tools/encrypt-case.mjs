#!/usr/bin/env node
/**
 * encrypt-case.mjs — turn a plaintext HTML fragment into locked.html
 *
 * The threat model, stated plainly, because it decides how this is used:
 * the ciphertext ships inside the page, so anyone who can load the page can
 * take the ciphertext away and attack it offline, forever, at whatever speed
 * their hardware allows. There is no server to rate-limit them and no way to
 * revoke a password once a copy of the file is out. What the page buys is
 * that "View Source" shows base64 and nothing else — a real cryptographic
 * gate rather than an if/else a reader can step past. What it cannot buy is
 * protection from a weak password, which is why this script refuses one.
 *
 * Crypto: PBKDF2-HMAC-SHA256 (600,000 iterations by default, the OWASP
 * floor) over a fresh 16-byte salt, into a 256-bit AES-GCM key with a fresh
 * 12-byte IV and a 128-bit tag. GCM is what makes a wrong password a thrown
 * error rather than garbage HTML: the tag fails to verify and decrypt()
 * rejects, so the page never has to compare anything itself.
 *
 * Usage:
 *   node tools/encrypt-case.mjs --in private/my-case.plain.html
 *   node tools/encrypt-case.mjs --in <file> --out locked.html --gzip
 *   CASE_PASSWORD='...' node tools/encrypt-case.mjs --in <file>   # for CI
 *
 * Flags:
 *   --in <path>          plaintext HTML fragment (required)
 *   --out <path>         page to write            (default locked.html)
 *   --template <path>    template to fill         (default tools/locked.template.html)
 *   --title <text>       browser tab title before unlock
 *   --heading <text>     the h1 on the lock screen
 *   --standfirst <text>  the line under the h1
 *   --hint <text>        where a reader should go to ask for the password
 *   --iterations <n>     PBKDF2 iterations        (default 600000)
 *   --gzip               compress before encrypting (needs DecompressionStream
 *                        in the browser: Chrome 80+, Safari 16.4+, Firefox 113+)
 *   --allow-weak         skip the password strength floor. Don't.
 */

import { webcrypto as wc } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import readline from 'node:readline';

const MIN_PASSWORD = 12;

const { values: o } = parseArgs({
  options: {
    in:         { type: 'string' },
    out:        { type: 'string', default: 'locked.html' },
    template:   { type: 'string', default: 'tools/locked.template.html' },
    title:      { type: 'string' },
    heading:    { type: 'string' },
    standfirst: { type: 'string' },
    hint:       { type: 'string' },
    iterations: { type: 'string', default: '600000' },
    gzip:       { type: 'boolean', default: false },
    'allow-weak': { type: 'boolean', default: false },
    help:       { type: 'boolean', default: false },
  },
});

if (o.help || !o.in) {
  console.log(String.raw`
  node tools/encrypt-case.mjs --in private/my-case.plain.html [--out locked.html]

  --in <path>          plaintext HTML fragment (required)
  --out <path>         page to write                    (default locked.html)
  --template <path>    template to fill                 (default tools/locked.template.html)
  --title <text>       tab title before unlock
  --heading <text>     h1 on the lock screen
  --standfirst <text>  line under the h1
  --hint <text>        how to ask for the password
  --iterations <n>     PBKDF2 iterations                (default 600000)
  --gzip               compress before encrypting
  --allow-weak         skip the ${MIN_PASSWORD}-character floor
`);
  process.exit(o.in ? 0 : 1);
}

/* ---------- password ---------- */

// Muted stdin. Node has no built-in hidden prompt, so readline's own output
// hook is replaced: it is allowed to draw the question and nothing else, which
// is the one place every echoed keystroke passes through.
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('stdin is not a TTY. Pass the password in CASE_PASSWORD instead.'));
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (chunk) => { if (chunk.includes(question)) write(question); };
    rl.question(question, (answer) => {
      rl._writeToOutput = write;
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

// Not an entropy estimator, just a floor with teeth. Length is what actually
// costs an offline attacker, so length is what is checked.
function tooWeak(pw) {
  if (pw.length < MIN_PASSWORD) return `shorter than ${MIN_PASSWORD} characters`;
  if (/^\d+$/.test(pw)) return 'digits only';
  if (/^(.)\1*$/.test(pw)) return 'one repeated character';
  const common = ['password', 'passphrase', 'letmein', 'casestudy', 'portfolio', 'changeme', 'secret', 'qwerty'];
  const flat = pw.toLowerCase().replace(/[^a-z]/g, '');
  if (common.some((c) => flat === c || flat === c + c)) return 'a common word';
  return null;
}

async function getPassword() {
  const fromEnv = process.env.CASE_PASSWORD;
  let pw;
  if (fromEnv) {
    pw = fromEnv;
  } else {
    pw = await promptHidden('Password for this case study: ');
    const again = await promptHidden('Confirm: ');
    if (pw !== again) {
      console.error('\nThe two entries do not match. Nothing was written.');
      process.exit(1);
    }
  }
  // NFKC on both sides of the wire, or a password typed with a composed
  // accent on one machine fails to derive the same key on another.
  pw = pw.normalize('NFKC');
  if (!pw) { console.error('Empty password. Nothing was written.'); process.exit(1); }
  const weak = tooWeak(pw);
  if (weak && !o['allow-weak']) {
    console.error(
      `\nRefusing to encrypt: that password is ${weak}.\n` +
      'The ciphertext ships inside the page, so the only thing standing between\n' +
      'a reader and the content is how expensive the password is to guess offline.\n' +
      `Use ${MIN_PASSWORD}+ characters, or pass --allow-weak if you have a reason.\n`
    );
    process.exit(1);
  }
  return pw;
}

/* ---------- encrypt ---------- */

const b64 = (u8) => Buffer.from(u8).toString('base64');

const iterations = Number.parseInt(o.iterations, 10);
if (!Number.isFinite(iterations) || iterations < 100000) {
  console.error('--iterations must be a number and at least 100000.');
  process.exit(1);
}

const plainHtml = await readFile(o.in, 'utf8');
const template = await readFile(o.template, 'utf8');
const password = await getPassword();

const salt = wc.getRandomValues(new Uint8Array(16));
const iv   = wc.getRandomValues(new Uint8Array(12));

const baseKey = await wc.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await wc.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
  baseKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt']
);

const raw = Buffer.from(plainHtml, 'utf8');
const body = o.gzip ? gzipSync(raw, { level: 9 }) : raw;
const ct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, body));

const payload = {
  v: 1,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: b64(salt) },
  cipher: { name: 'AES-GCM', iv: b64(iv), tagBits: 128 },
  compress: o.gzip ? 'gzip' : 'none',
  ct: b64(ct),
};

/* ---------- fill the template ---------- */

// Only ever substituted into text nodes and attribute values, so the copy a
// caller passes on the command line cannot close a tag.
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const DEFAULT_HINT =
  'Need the password? Email <a class="inline" href="mailto:ritika@finsynth.ai">ritika@finsynth.ai</a>.';

const subs = {
  __PAYLOAD__:    JSON.stringify(payload),
  __TITLE__:      escapeHtml(o.title      ?? 'Protected case study · Ritika Shakkerwal'),
  __HEADING__:    escapeHtml(o.heading    ?? 'This case study is password protected'),
  __STANDFIRST__: escapeHtml(o.standfirst ?? 'The work behind it is under NDA, so the page is encrypted rather than merely hidden. Enter the password and it decrypts in your browser.'),
  // --hint is the one substitution that takes raw HTML, so a link can be
  // written into it. It comes from the command line, not from a reader.
  __HINT__:       o.hint ?? DEFAULT_HINT,
};

let out = template;
for (const [k, v] of Object.entries(subs)) {
  if (!out.includes(k)) { console.error(`Template is missing the ${k} placeholder.`); process.exit(1); }
  out = out.split(k).join(v);
}

await writeFile(o.out, out, 'utf8');

const kb = (n) => (n / 1024).toFixed(1) + ' kB';
console.log(
  `\nWrote ${o.out}\n` +
  `  plaintext   ${kb(raw.length)}${o.gzip ? `  ->  gzip ${kb(body.length)}` : ''}\n` +
  `  ciphertext  ${kb(ct.length)}  (${kb(Buffer.byteLength(payload.ct))} as base64)\n` +
  `  page        ${kb(Buffer.byteLength(out))}\n` +
  `  PBKDF2      ${iterations.toLocaleString()} iterations, SHA-256\n\n` +
  `Keep ${o.in} out of git. Only ${o.out} is safe to publish.\n`
);
