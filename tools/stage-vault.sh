#!/usr/bin/env bash
# Stage a standalone, deployable copy of the vault in private/vault-deploy/.
#
# Everything it writes lands under private/, which .gitignore already ignores --
# so the ciphertext never enters git and the public repo stays clean. The vault
# ships as index.html so the share link is just the domain, and so the shell's
# two href="index.html" back-links resolve to the vault itself rather than 404.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=${VAULT_OUT:-private/vault-deploy}

echo "1/4  extracting the case study from finsynth.html"
node tools/extract-case.mjs

echo "2/4  encrypting into $OUT/index.html"
mkdir -p "$OUT"
node tools/encrypt-case.mjs \
  --in private/finsynth.plain.html --out "$OUT/index.html" --gzip "$@" \
  --title 'Vault · Ritika Shakkerwal' --heading 'Vault' \
  --standfirst 'This work is under NDA. Ask me for the key.' \
  --hint '{n} characters. it opens itself.' \
  --footnote 'this page keeps secrets. so do i.'

echo "3/4  copying the assets the page actually reaches"
# 13 files, 4.5 MB: the eleven <img> srcs plus the two CSS-only assets
# (hero-mat.webp, spotlight-wall-st.jpg) that an <img> audit would miss.
mkdir -p "$OUT/assets/finsynth" "$OUT/assets/logos"
for f in ai-assist.png evo-before-update.png fia-asks-first.png fia-home.png \
         fia-plan-mode.png fia-questions.png fia-timeline.png hero-agent.png \
         hero-mat.webp shipped-6-trend.png spotlight-wall-st.jpg update-model.png; do
  cp "assets/finsynth/$f" "$OUT/assets/finsynth/$f"
done
cp assets/logos/finsynth.png "$OUT/assets/logos/finsynth.png"

echo "4/4  writing $OUT/vercel.json"
# Belt and braces: the page already carries the robots meta and referrer policy,
# but a header cannot be stripped by a scraper that ignores meta tags.
cat > "$OUT/vercel.json" <<'JSON'
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Robots-Tag", "value": "noindex, nofollow, noarchive, nosnippet" },
        { "key": "Referrer-Policy", "value": "no-referrer" }
      ]
    }
  ]
}
JSON

echo
echo "staged: $(du -sh "$OUT" | cut -f1) in $OUT"
echo "deploy: cd $OUT && vercel deploy --prod"
