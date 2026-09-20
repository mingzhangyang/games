#!/usr/bin/env python3
"""把「结果 / 动作按钮」里硬编码的 emoji 图标换成 js/icons.js 的 inline SVG。

背景：CLAUDE.md 的图标政策要求 Play/Again/Copy/Close/Home/Share/Stats/Next 这类
含文字的动作按钮使用 inline SVG（同一按钮全站同一外观）。此前只有 index /
minesweeper / tetris / word-daily 部分落实，其余 8 页仍写 emoji。

两个必须同时改的地方：
  1. 静态 HTML 里的按钮初始内容（首屏、applyLanguage 之前可见）
  2. JS 里 i18n 用 textContent 回写的赋值点 —— 只改 HTML 会被立刻覆盖

脚本是表驱动的：每条替换都必须**恰好命中一次**，否则中止并不写盘；
已经替换过的条目会被识别为「已完成」而不是报错（可安全重跑）。

用法：
    python scripts/apply-button-icons.py --dry     # 只报告
    python scripts/apply-button-icons.py           # 写盘
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.registry import REGISTRY  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DRY = "--dry" in sys.argv


def load_icons() -> dict[str, str]:
    """从 js/icons.js 抽出 ICONS 映射，并按同样的包装生成 HTML 片段。"""
    src = (ROOT / "js" / "icons.js").read_text(encoding="utf-8")

    def wrap(inner: str) -> str:
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" '
            f'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
            f'stroke-linejoin="round" aria-hidden="true">{inner}</svg>'
        )

    def wrap_filled(inner: str) -> str:
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" '
            f'fill="currentColor" stroke="none" aria-hidden="true">{inner}</svg>'
        )

    icons: dict[str, str] = {}
    for m in re.finditer(r"^\s{4}(\w+): (svg|filled)\('(.+?)'\),?$", src, re.M):
        name, kind, inner = m.group(1), m.group(2), m.group(3)
        icons[name] = (wrap if kind == "svg" else wrap_filled)(inner)
    return icons


ICONS = load_icons()

# (文件, 旧片段, 新片段)；新片段里用 @@icon@@ 引用 ICONS
EDITS: list[tuple[str, str, str]] = []


def add(path: str, old: str, new: str) -> None:
    EDITS.append((path, old, new))


# ─────────────────────────── planet-merge ───────────────────────────
add(
    "planet-merge.html",
    '<button class="pm-btn pm-btn-ghost" id="pm-btn-menu">Home</button>',
    '<button class="pm-btn pm-btn-ghost game-btn" id="pm-btn-menu">@@home@@<span>Home</span></button>',
)
add(
    "planet-merge.html",
    '<button class="pm-btn pm-btn-primary" id="pm-btn-again">🔄 Again</button>',
    '<button class="pm-btn pm-btn-primary game-btn" id="pm-btn-again">@@retry@@<span>Again</span></button>',
)
add(
    "planet-merge.html",
    '<button class="pm-btn" id="pm-btn-share">📤 Share</button>',
    '<button class="pm-btn game-btn" id="pm-btn-share">@@share@@<span>Share</span></button>',
)
add(
    "planet-merge.html",
    '<button class="pm-btn" id="pm-btn-copy">📋 Copy</button>',
    '<button class="pm-btn game-btn" id="pm-btn-copy">@@copy@@<span>Copy</span></button>',
)
add(
    "planet-merge.html",
    '<button class="pm-btn pm-btn-ghost" id="pm-btn-home2">🏠 Home</button>',
    '<button class="pm-btn pm-btn-ghost game-btn" id="pm-btn-home2">@@home@@<span>Home</span></button>',
)
add(
    "js/planet-merge.js",
    "if (this.el['btn-menu']) this.el['btn-menu'].textContent = t.home;",
    "if (this.el['btn-menu']) this.el['btn-menu'].innerHTML = `${ICONS.home}<span>${t.home}</span>`;",
)
add(
    "js/planet-merge.js",
    "if (this.el['btn-share']) this.el['btn-share'].textContent = `📤 ${t.share}`;",
    "if (this.el['btn-share']) this.el['btn-share'].innerHTML = `${ICONS.share}<span>${t.share}</span>`;",
)
add(
    "js/planet-merge.js",
    "if (this.el['btn-copy']) this.el['btn-copy'].textContent = `📋 ${t.copyResult}`;",
    "if (this.el['btn-copy']) this.el['btn-copy'].innerHTML = `${ICONS.copy}<span>${t.copyResult}</span>`;",
)
add(
    "js/planet-merge.js",
    "if (this.el['btn-again']) this.el['btn-again'].textContent = `🔄 ${t.again}`;",
    "if (this.el['btn-again']) this.el['btn-again'].innerHTML = `${ICONS.retry}<span>${t.again}</span>`;",
)
add(
    "js/planet-merge.js",
    "if (this.el['btn-home']) this.el['btn-home'].textContent = `🏠 ${t.home}`;",
    "if (this.el['btn-home']) this.el['btn-home'].innerHTML = `${ICONS.home}<span>${t.home}</span>`;",
)
add(
    "js/planet-merge.js",
    "if (btnHome2) btnHome2.textContent = `🏠 ${t.home}`;",
    "if (btnHome2) btnHome2.innerHTML = `${ICONS.home}<span>${t.home}</span>`;",
)

# ─────────────────────────── hoop-shot ───────────────────────────
add(
    "hoop-shot.html",
    '<button class="hs-btn hs-btn-ghost" id="hs-btn-menu">Home</button>',
    '<button class="hs-btn hs-btn-ghost game-btn" id="hs-btn-menu">@@home@@<span>Home</span></button>',
)
add(
    "hoop-shot.html",
    '<button class="hs-btn hs-btn-primary" id="hs-btn-again">🔄 Again</button>',
    '<button class="hs-btn hs-btn-primary game-btn" id="hs-btn-again">@@retry@@<span>Again</span></button>',
)
add(
    "hoop-shot.html",
    '<button class="hs-btn" id="hs-btn-share">📤 Share</button>',
    '<button class="hs-btn game-btn" id="hs-btn-share">@@share@@<span>Share</span></button>',
)
add(
    "hoop-shot.html",
    '<button class="hs-btn" id="hs-btn-copy">📋 Copy</button>',
    '<button class="hs-btn game-btn" id="hs-btn-copy">@@copy@@<span>Copy</span></button>',
)
add(
    "hoop-shot.html",
    '<button class="hs-btn hs-btn-ghost" id="hs-btn-home">🏠 Home</button>',
    '<button class="hs-btn hs-btn-ghost game-btn" id="hs-btn-home">@@home@@<span>Home</span></button>',
)
add(
    "js/hoop-shot.js",
    "if (this.el['btn-menu']) this.el['btn-menu'].textContent = t.home;",
    "if (this.el['btn-menu']) this.el['btn-menu'].innerHTML = `${ICONS.home}<span>${t.home}</span>`;",
)
add(
    "js/hoop-shot.js",
    "if (this.el['btn-share']) this.el['btn-share'].textContent = `📤 ${t.share}`;",
    "if (this.el['btn-share']) this.el['btn-share'].innerHTML = `${ICONS.share}<span>${t.share}</span>`;",
)
add(
    "js/hoop-shot.js",
    "if (this.el['btn-copy']) this.el['btn-copy'].textContent = `📋 ${t.copyResult}`;",
    "if (this.el['btn-copy']) this.el['btn-copy'].innerHTML = `${ICONS.copy}<span>${t.copyResult}</span>`;",
)
add(
    "js/hoop-shot.js",
    "if (this.el['btn-again']) this.el['btn-again'].textContent = `🔄 ${t.again}`;",
    "if (this.el['btn-again']) this.el['btn-again'].innerHTML = `${ICONS.retry}<span>${t.again}</span>`;",
)
add(
    "js/hoop-shot.js",
    "if (this.el['btn-home']) this.el['btn-home'].textContent = `🏠 ${t.home}`;",
    "if (this.el['btn-home']) this.el['btn-home'].innerHTML = `${ICONS.home}<span>${t.home}</span>`;",
)

# ─────────────────────── gravity-slingshot ───────────────────────
add(
    "gravity-slingshot.html",
    '<button class="gd-btn" id="gd-btn-replay">⟲ Retry</button>',
    '<button class="gd-btn game-btn" id="gd-btn-replay">@@retry@@<span>Retry</span></button>',
)
add(
    "gravity-slingshot.html",
    '<button class="gd-btn gd-btn-ghost" id="gd-btn-menu1">🏠 Home</button>',
    '<button class="gd-btn gd-btn-ghost game-btn" id="gd-btn-menu1">@@home@@<span>Home</span></button>',
)
add(
    "gravity-slingshot.html",
    '<button class="gd-btn" id="gd-btn-copy">📋 Copy</button>',
    '<button class="gd-btn game-btn" id="gd-btn-copy">@@copy@@<span>Copy</span></button>',
)
add(
    "gravity-slingshot.html",
    '<button class="gd-btn gd-btn-ghost" id="gd-btn-menu2">🏠 Home</button>',
    '<button class="gd-btn gd-btn-ghost game-btn" id="gd-btn-menu2">@@home@@<span>Home</span></button>',
)
add(
    "gravity-slingshot.html",
    '<button class="gd-btn gd-btn-primary" id="gd-btn-again">🔄 Again</button>',
    '<button class="gd-btn gd-btn-primary game-btn" id="gd-btn-again">@@retry@@<span>Again</span></button>',
)
add(
    "js/gravity-slingshot.js",
    "if (this.el['btn-replay']) this.el['btn-replay'].textContent = `⟲ ${t.retry}`;",
    "if (this.el['btn-replay']) this.el['btn-replay'].innerHTML = `${ICONS.retry}<span>${t.retry}</span>`;",
)
add(
    "js/gravity-slingshot.js",
    "if (this.el['btn-menu1']) this.el['btn-menu1'].textContent = `🏠 ${t.menu}`;",
    "if (this.el['btn-menu1']) this.el['btn-menu1'].innerHTML = `${ICONS.home}<span>${t.menu}</span>`;",
)
add(
    "js/gravity-slingshot.js",
    "if (this.el['btn-menu2']) this.el['btn-menu2'].textContent = `🏠 ${t.menu}`;",
    "if (this.el['btn-menu2']) this.el['btn-menu2'].innerHTML = `${ICONS.home}<span>${t.menu}</span>`;",
)
add(
    "js/gravity-slingshot.js",
    "if (this.el['btn-again']) this.el['btn-again'].textContent = `🔄 ${t.again}`;",
    "if (this.el['btn-again']) this.el['btn-again'].innerHTML = `${ICONS.retry}<span>${t.again}</span>`;",
)
add(
    "js/gravity-slingshot.js",
    "if (this.el['btn-copy']) this.el['btn-copy'].textContent = `📋 ${t.copyResult}`;",
    "if (this.el['btn-copy']) this.el['btn-copy'].innerHTML = `${ICONS.copy}<span>${t.copyResult}</span>`;",
)

# ─────────────────────────── tower-defense ───────────────────────────
add(
    "tower-defense.html",
    '<button class="td-btn td-btn-ghost" id="td-btn-menu">Home</button>',
    '<button class="td-btn td-btn-ghost game-btn" id="td-btn-menu">@@home@@<span>Home</span></button>',
)
add(
    "tower-defense.html",
    '<button class="td-btn td-btn-primary" id="td-btn-again">🔄 Again</button>',
    '<button class="td-btn td-btn-primary game-btn" id="td-btn-again">@@retry@@<span>Again</span></button>',
)
add(
    "tower-defense.html",
    '<button class="td-btn" id="td-btn-copy">📋 Copy</button>',
    '<button class="td-btn game-btn" id="td-btn-copy">@@copy@@<span>Copy</span></button>',
)
add(
    "tower-defense.html",
    '<button class="td-btn td-btn-ghost" id="td-btn-menu2">🏠 Home</button>',
    '<button class="td-btn td-btn-ghost game-btn" id="td-btn-menu2">@@home@@<span>Home</span></button>',
)
add(
    "js/tower-defense.js",
    "if (this.el['btn-menu']) this.el['btn-menu'].textContent = `🏠 ${t.home}`;",
    "if (this.el['btn-menu']) this.el['btn-menu'].innerHTML = `${ICONS.home}<span>${t.home}</span>`;",
)
add(
    "js/tower-defense.js",
    "if (this.el['btn-menu2']) this.el['btn-menu2'].textContent = `🏠 ${t.home}`;",
    "if (this.el['btn-menu2']) this.el['btn-menu2'].innerHTML = `${ICONS.home}<span>${t.home}</span>`;",
)
add(
    "js/tower-defense.js",
    "if (this.el['btn-again']) this.el['btn-again'].textContent = `🔄 ${t.again}`;",
    "if (this.el['btn-again']) this.el['btn-again'].innerHTML = `${ICONS.retry}<span>${t.again}</span>`;",
)
add(
    "js/tower-defense.js",
    "if (this.el['btn-copy']) this.el['btn-copy'].textContent = `📋 ${t.copyResult}`;",
    "if (this.el['btn-copy']) this.el['btn-copy'].innerHTML = `${ICONS.copy}<span>${t.copyResult}</span>`;",
)

# ─────────────────────────── reversi ───────────────────────────
add(
    "reversi.html",
    '<button class="rv-btn rv-btn-primary" id="rv-btn-again">🔄 Again</button>',
    '<button class="rv-btn rv-btn-primary game-btn" id="rv-btn-again">@@retry@@<span>Again</span></button>',
)
add(
    "reversi.html",
    '<button class="rv-btn" id="rv-btn-copy">📋 Copy</button>',
    '<button class="rv-btn game-btn" id="rv-btn-copy">@@copy@@<span>Copy</span></button>',
)
add(
    "reversi.html",
    '<button class="rv-btn rv-btn-ghost" id="rv-btn-menu">🏠 Home</button>',
    '<button class="rv-btn rv-btn-ghost game-btn" id="rv-btn-menu">@@home@@<span>Home</span></button>',
)
add(
    "js/reversi.js",
    "if (this.el['btn-again']) this.el['btn-again'].textContent = `🔄 ${t.again}`;",
    "if (this.el['btn-again']) this.el['btn-again'].innerHTML = `${ICONS.retry}<span>${t.again}</span>`;",
)
add(
    "js/reversi.js",
    "if (this.el['btn-copy']) this.el['btn-copy'].textContent = `📋 ${t.copyResult}`;",
    "if (this.el['btn-copy']) this.el['btn-copy'].innerHTML = `${ICONS.copy}<span>${t.copyResult}</span>`;",
)
add(
    "js/reversi.js",
    "if (this.el['btn-menu']) this.el['btn-menu'].textContent = `🏠 ${t.home}`;",
    "if (this.el['btn-menu']) this.el['btn-menu'].innerHTML = `${ICONS.home}<span>${t.home}</span>`;",
)

# ─────────────────────────── needle-awn ───────────────────────────
add(
    "needle-awn.html",
    '<button class="na-btn na-btn--ghost" id="na-btn-pause-home">返回主页 🏠</button>',
    '<button class="na-btn na-btn--ghost game-btn" id="na-btn-pause-home">@@home@@<span>返回主页</span></button>',
)
add(
    "needle-awn.html",
    '<button class="na-btn na-btn--ghost" id="na-btn-result-home">返回菜单 🏠</button>',
    '<button class="na-btn na-btn--ghost game-btn" id="na-btn-result-home">@@home@@<span>返回菜单</span></button>',
)
add(
    "js/needle-awn.js",
    "document.getElementById('na-btn-pause-home').textContent = t.home;",
    "document.getElementById('na-btn-pause-home').innerHTML = `${ICONS.home}<span>${t.home}</span>`;",
)
add(
    "js/needle-awn.js",
    "document.getElementById('na-btn-result-home').textContent = t.home;",
    "document.getElementById('na-btn-result-home').innerHTML = `${ICONS.home}<span>${t.home}</span>`;",
)

# ─────────────────────────── sword-flight ───────────────────────────
for _id, _label in (("sf-btn-menu", "返回仙门"), ("sf-btn-victory-menu", "返回仙境"), ("sf-btn-go-menu", "返回仙门")):
    add(
        "sword-flight.html",
        f'<button class="sf-action-btn" id="{_id}">{_label} 🏠</button>',
        f'<button class="sf-action-btn game-btn" id="{_id}">@@home@@<span>{_label}</span></button>',
    )
    add(
        "js/sword-flight.js",
        f"document.getElementById('{_id}').textContent = t.home;",
        f"document.getElementById('{_id}').innerHTML = `${{ICONS.home}}<span>${{t.home}}</span>`;",
    )

# 排行榜入口：原本是 <span>🏆</span> + 文字，按钮自己已是 inline-flex
add(
    "sword-flight.html",
    '<button class="sf-leaderboard-entry-btn" id="sf-btn-open-rank">',
    '<button class="sf-leaderboard-entry-btn game-btn" id="sf-btn-open-rank">',
)
add(
    "sword-flight.html",
    '<span>🏆</span> <span id="sf-lbl-open-rank">查看九天仙榜</span>',
    '@@trophy@@\n                        <span id="sf-lbl-open-rank">查看九天仙榜</span>',
)

# ─────────────────────────── word-daily ───────────────────────────
add(
    "word-daily.html",
    '<button type="button" class="wd-btn wd-btn-success wd-btn-lg wd-btn-block" id="wd-btn-next">\n'
    '                        <span class="btn-icon">➡️</span>\n'
    '                        <span id="wd-next-label">Next (Practice)</span>\n'
    '                    </button>',
    '<button type="button" class="wd-btn wd-btn-success wd-btn-lg wd-btn-block game-btn" id="wd-btn-next">\n'
    '                        @@arrowRight@@\n'
    '                        <span id="wd-next-label">Next (Practice)</span>\n'
    '                    </button>',
)
add(
    "word-daily.html",
    '<button type="button" class="wd-btn wd-btn-secondary" id="wd-btn-stats-inline">\n'
    '                            <span class="btn-icon">📊</span>\n'
    '                            <span id="wd-stats-inline-label">Stats</span>\n'
    '                        </button>',
    '<button type="button" class="wd-btn wd-btn-secondary game-btn" id="wd-btn-stats-inline">\n'
    '                            @@stats@@\n'
    '                            <span id="wd-stats-inline-label">Stats</span>\n'
    '                        </button>',
)
add(
    "word-daily.html",
    '<button type="button" class="wd-btn wd-btn-secondary" id="wd-btn-share-inline">\n'
    '                            <span class="btn-icon">📤</span>\n'
    '                            <span id="wd-share-inline-label">Share</span>\n'
    '                        </button>',
    '<button type="button" class="wd-btn wd-btn-secondary game-btn" id="wd-btn-share-inline">\n'
    '                            @@share@@\n'
    '                            <span id="wd-share-inline-label">Share</span>\n'
    '                        </button>',
)
add(
    "word-daily.html",
    '<button class="wd-btn wd-btn-success wd-btn-block" id="wd-modal-next">\n'
    '                <span class="btn-icon">➡️</span>\n'
    '                <span id="wd-modal-next-label">Next (Practice)</span>\n'
    '            </button>',
    '<button class="wd-btn wd-btn-success wd-btn-block game-btn" id="wd-modal-next">\n'
    '                @@arrowRight@@\n'
    '                <span id="wd-modal-next-label">Next (Practice)</span>\n'
    '            </button>',
)
add(
    "word-daily.html",
    '<button class="wd-btn wd-btn-primary wd-btn-block" id="wd-share">📤 Share</button>',
    '<button class="wd-btn wd-btn-primary wd-btn-block game-btn" id="wd-share">@@share@@<span>Share</span></button>',
)
add(
    "js/word-daily.js",
    "if (this.el.share) this.el.share.textContent = `📤 ${t.share}`;",
    "if (this.el.share) this.el.share.innerHTML = `${ICONS.share}<span>${t.share}</span>`;",
)

# ───────── 藏在 i18n 字符串里的按钮 emoji（比 HTML 更深一层）─────────
# needle-awn / sword-flight 把 🏠 直接写进了 home 文案的中英两版，
# 于是即使改了 HTML，applyLanguage 也会把 emoji 重新写回来。图标改由 ICONS 提供后需去掉。
add("js/needle-awn.js", "home: '返回菜单 🏠',", "home: '返回菜单',")
add("js/needle-awn.js", "home: 'Menu 🏠',", "home: 'Menu',")
add("js/sword-flight.js", "home: '返回仙门 🏠',", "home: '返回仙门',")
add("js/sword-flight.js", "home: 'Immortal Gate 🏠',", "home: 'Immortal Gate',")


def render(template: str) -> str:
    def sub(m: re.Match[str]) -> str:
        name = m.group(1)
        if name not in ICONS:
            raise KeyError(f"icons.js 里没有图标 {name!r}")
        return ICONS[name]

    return re.sub(r"@@(\w+)@@", sub, template)


def main() -> int:
    cache: dict[str, str] = {}
    applied = skipped = 0
    errors: list[str] = []

    for path, old, new_tpl in EDITS:
        text = cache.get(path)
        if text is None:
            text = (ROOT / path).read_text(encoding="utf-8")
        new = render(new_tpl)
        hits = text.count(old)
        if hits == 1:
            cache[path] = text.replace(old, new, 1)
            applied += 1
        elif hits == 0 and new in text:
            cache[path] = text
            skipped += 1
        else:
            errors.append(f"{path}: 命中 {hits} 次（应为 1）\n    片段: {old[:110]}")

    if errors:
        print("替换表校验失败，未写入任何文件：\n")
        for e in errors:
            print("  " + e)
        return 1

    print(f"待替换 {applied} 条，已完成（跳过）{skipped} 条\n")
    if DRY:
        print("--dry：未写盘")
        return 0

    for path, text in cache.items():
        # 必须用 write_bytes：Path.write_text 在 Windows 上会做换行转换，
        # 把原本纯 LF 的文件全量写成 CRLF，git diff 会变成整文件改写。
        (ROOT / path).write_bytes(text.encode("utf-8"))
        print(f"  写入 {path}")
    print(f"\n完成，共 {len(cache)} 个文件")
    return 0


if __name__ == "__main__":
    # EDITS 是字面替换片段，派生不出来；这里只体检「条目指向的页还在不在」。
    REGISTRY.report_coverage(
        "topbar",
        sorted({p.replace(".html", "") for p, _, _ in EDITS if p.endswith(".html")}),
        label="EDITS", checker="node scripts/verify-button-icons.mjs")
    sys.exit(main())
