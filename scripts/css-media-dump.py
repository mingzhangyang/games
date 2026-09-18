"""Print full @media blocks whose body matches a selector regex.

Usage: python scripts/css-media-dump.py <file> <selector-regex>
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
    if re.match(r"\s*@media", line):
        start = i
        depth = 0
        j = i
        while j < len(lines):
            depth += lines[j].count("{") - lines[j].count("}")
            if depth == 0 and "{" in "".join(lines[i:j + 1]):
                break
            j += 1
        body = "\n".join(lines[start:j + 1])
        if sel_re.search(body):
            print(f"--- lines {start + 1}..{j + 1} ---")
            print(body)
            print()
        i = j + 1
        continue
    i += 1
