#!/usr/bin/env python3
"""扫描各游戏页面的按钮，标出仍以 emoji 作前置图标的实例。

政策（CLAUDE.md）：无文字控件按钮 + 含文字的动作/结果按钮（Play/Again/Copy/
Close/Home/Share）使用 js/icons.js 的 inline SVG；emoji 仅保留在游戏内容字形
（扫雷格子与表情、星球合成链）、装饰性 hero 图、more-games 导航条。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

EMOJI = re.compile(
    r"[\U0001F300-\U0001FAFF]"
    r"|[\u2600-\u27BF]\uFE0F"
    r"|[\u2B00-\u2BFF]"
    r"|[\u2190-\u21FF\u2300-\u23FF]"
)

# 政策允许保留在按钮里的 emoji：仅游戏内容字形（扫雷的格子/表情）
ALLOWED_BUTTON_EMOJI = {"🙂", "😵", "😎", "🤔", "😐", "😮"}

BTN = re.compile(r"<button\b[^>]*>(.*?)</button>", re.S)


def strip_tags(html: str) -> str:
    html = re.sub(r"<svg\b.*?</svg>", "[SVG]", html, flags=re.S)
    html = re.sub(r"<[^>]+>", "", html)
    return re.sub(r"\s+", " ", html).strip()


def has_svg(html: str) -> bool:
    return "<svg" in html


def main() -> int:
    pages = sorted(p for p in ROOT.glob("*.html"))
    total_bad = 0
    for page in pages:
        raw = page.read_text(encoding="utf-8")
        # 去掉 more-games 导航块，避免噪声
        body = re.sub(r"<nav class=\"more-games\".*?</nav>", "", raw, flags=re.S)
        rows = []
        for m in BTN.finditer(body):
            whole = m.group(0)
            text = strip_tags(m.group(1))
            found = EMOJI.findall(text)
            if not found:
                continue
            if not text.replace(" ", "").strip():
                continue
            if set(found) <= ALLOWED_BUTTON_EMOJI:
                continue
            rows.append((text, "SVG+emoji" if has_svg(m.group(1)) else "emoji", whole.count("\n") + 1))
        if not rows:
            continue
        print(f"\n### {page.name}")
        for text, kind, _ in rows:
            print(f"  [{kind:>9}] {text}")
        total_bad += len(rows)
    print(f"\n合计 {total_bad} 个按钮仍带非白名单 emoji")
    return 1 if total_bad else 0


if __name__ == "__main__":
    sys.exit(main())
