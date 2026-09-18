"""Print exact raw text (with line numbers) of selected CSS rules, so they can be
edited or deleted precisely.

Usage: python scripts/css-rule-dump.py <file> <selector-regex>
"""
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
sel_re = re.compile(sys.argv[2], re.I)
text = path.read_text(encoding="utf-8")
lines = text.split("\n")

i = 0
while i < len(lines):
    line = lines[i]
    stripped = line.strip()
    if not stripped or stripped.startswith("/*") or stripped.startswith("*"):
        i += 1
        continue
    if stripped.startswith("@"):
        i += 1
        continue
    if "{" in stripped and sel_re.search(stripped):
        start = i
        while i < len(lines) and "}" not in lines[i]:
            i += 1
        print(f"--- line {start + 1}..{i + 1} ---")
        print("\n".join(lines[start:i + 1]))
        print()
    i += 1
