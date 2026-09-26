#!/usr/bin/env python3
"""One-off brand rename (Apollo Health -> Magno), kept for the next one.

The trap: an earlier version protected whole LINES containing an infrastructure
token like `apollo-hq`, which silently left the brand name unrenamed on those
same lines - including both legal pages and the landing page's JSON-LD, the
copy Google actually reads. Protect the TOKEN, never the line.

Deliberately NOT renamed, because renaming them breaks something for no gain:
  apollo-*             CSS classes and animation names
  apollo.onboarded     localStorage keys - renaming signs everyone out
  apollo-health-local  the Dexie database - renaming orphans local data
  apollo-hq            the Pages project still serving the site
  apollo-health-db     the D1 database
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP = {'node_modules', 'dist', '.git', '.wrangler', 'graphify-out', 'public/guides', 'public/local-seed'}
EXTS = {'.html', '.ts', '.tsx', '.mjs', '.css', '.md', '.json'}

OLD, NEW = sys.argv[1] if len(sys.argv) > 1 else 'Apollo Health', sys.argv[2] if len(sys.argv) > 2 else 'Magno'
# Infrastructure tokens are masked out, renamed around, then restored.
KEEP = re.compile(r'apollo-hq|apollo-health-db|apollo-health-local|apollo\.[a-z]|apollo-dev|apollo-stats')

changed = []
for p in ROOT.rglob('*'):
    if not p.is_file() or p.suffix not in EXTS: continue
    rel = str(p.relative_to(ROOT))
    if any(rel == d or rel.startswith(d + '/') for d in SKIP) or rel == 'package-lock.json': continue
    src = p.read_text(encoding='utf-8', errors='ignore')
    held = []
    def mask(m):
        held.append(m.group(0))
        return f'\x00{len(held)-1}\x00'
    masked = KEEP.sub(mask, src)
    out = masked.replace(OLD, NEW)
    out = re.sub(r'\x00(\d+)\x00', lambda m: held[int(m.group(1))], out)
    if out != src:
        p.write_text(out, encoding='utf-8'); changed.append(rel)

print(f'{len(changed)} files changed')
for c in sorted(changed): print('  ', c)
