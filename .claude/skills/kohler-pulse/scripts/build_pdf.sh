#!/usr/bin/env bash
# Render a Sales Pulse page to a PDF for attaching to an email.
#
#   bash build_pdf.sh <pulse.html> [out.pdf]
#
# The artifact page is a fragment (no <html>/<head>), and its @media print
# rules hide the toolbar and the email view so the PDF carries the report
# view only. This wraps the fragment into a real document, inlines the
# Google Fonts as data URIs -- a headless print has no guarantee of network,
# and a silent fallback to Arial changes the whole look -- then prints it.

set -euo pipefail

SRC="${1:?usage: build_pdf.sh <pulse.html> [out.pdf]}"
OUT="${2:-Kohler_Sales_Pulse.pdf}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

CHROME=""
for c in \
  /opt/pw-browsers/chromium-*/chrome-linux/chrome \
  "$(command -v chromium || true)" \
  "$(command -v chromium-browser || true)" \
  "$(command -v google-chrome || true)" \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
do
  [ -n "$c" ] && [ -x "$c" ] && CHROME="$c" && break
done
[ -n "$CHROME" ] || { echo "No Chromium/Chrome found." >&2; exit 1; }

# Fetch + base64 the latin subsets referenced by the page's font stylesheet.
python3 - "$SRC" "$WORK" <<'PY'
import base64, os, re, subprocess, sys, urllib.request
src, work = sys.argv[1], sys.argv[2]
html = open(src, encoding='utf-8').read()
m = re.search(r'<link rel="stylesheet" href="(https://fonts\.googleapis[^"]+)"', html)
inline = ''
# Google Fonts serves woff2 (and the /* latin */ subset comments this parser
# needs) only to a UA it recognises as a modern browser. A short UA string
# gets TTF back with a different CSS shape, the parse finds nothing, and the
# PDF silently falls back to Arial -- so send a full one.
UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/120.0.0.0 Safari/537.36')
if m:
    try:
        req = urllib.request.Request(m.group(1), headers={'User-Agent': UA})
        css = urllib.request.urlopen(req, timeout=30).read().decode()
        out = []
        parts = re.split(r'/\*\s*([\w-]+)\s*\*/', css)
        for i in range(1, len(parts), 2):
            if parts[i] != 'latin':
                continue
            block = parts[i + 1]
            u = re.search(r'src: url\((https://[^)]+)\)', block)
            if not u:
                continue
            data = urllib.request.urlopen(
                urllib.request.Request(u.group(1), headers={'User-Agent': UA}), timeout=30).read()
            b = base64.b64encode(data).decode()
            blk = block.replace(u.group(1), 'data:font/woff2;base64,' + b)
            blk = re.sub(r'unicode-range:[^;]+;', '', blk)
            out.append('@font-face {' + blk.split('{', 1)[1].rsplit('}', 1)[0] + '}')
        inline = '\n'.join(out)
        if not out:
            sys.stderr.write('no latin @font-face blocks parsed -- leaving the remote link in place\n')
    except Exception as e:
        sys.stderr.write('font inline skipped (%s) -- PDF will use fallbacks\n' % e)

head, _, rest = html.partition('<div class="bar">')
if not rest:                       # template without the view switcher
    head, _, rest = html.partition('<div class="sheet">')
    rest = '<div class="sheet">' + rest
else:
    rest = '<div class="bar">' + rest
head = re.sub(r'<link rel="preconnect"[^>]*>\n?', '', head)
if inline:
    head = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis[^>]*>',
                  '<style>' + inline + '</style>', head)
doc = ('<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8">'
       + head + '<style>@page{size:letter;margin:0.5in 0.55in}</style></head><body>'
       + rest + '</body></html>')
open(os.path.join(work, 'print.html'), 'w', encoding='utf-8').write(doc)
PY

"$CHROME" --headless --disable-gpu --no-sandbox \
  --virtual-time-budget=15000 --run-all-compositor-stages-before-draw \
  --no-pdf-header-footer --print-to-pdf="$OUT" "$WORK/print.html" 2>/dev/null

python3 - "$OUT" <<'PY'
import sys
d = open(sys.argv[1], 'rb').read()
print('%s  %d pages, %d KB' % (sys.argv[1], d.count(b'/Type /Page') - d.count(b'/Type /Pages'), len(d) // 1024))
PY
