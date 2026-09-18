"""统一骨架迁移脚本（一次性）— 把 9 个 shell 模板页接入 css/layout.css。

做三件事：
  1. HTML/JS：在原有类名后追加通用类（game-shell / game-topbar / …），
     给 <body> 加 game-body、给画布加 game-canvas；不改任何原有类名。
  2. CSS：删除与 layout.css 重复的几何声明（只删几何属性，保留配色/动效），
     并清理因此变空的 @media 块。
  3. CSS：在文件末尾追加该页的 --frame-* 参数覆盖。

用法： python scripts/apply-layout-unification.py [--dry]
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DRY = "--dry" in sys.argv

ALL = "*"

PAGES = [
    dict(html="gravity-slingshot.html", css="css/gravity.css", p="gd",
         js="js/gravity-slingshot.js", canvas=["gd-canvas"],
         frame=dict(wide="940px", stage="460px", side="300px", gap="14px")),
    dict(html="hoop-shot.html", css="css/hoop-shot.css", p="hs",
         js="js/hoop-shot.js", canvas=["hs-canvas"], fill=True,
         frame=dict(wide="940px", stage="440px", side="300px", gap="14px")),
    dict(html="planet-merge.html", css="css/planet-merge.css", p="pm",
         js="js/planet-merge.js", canvas=["pm-canvas"], fill=True,
         frame=dict(wide="940px", stage="440px", side="300px", gap="14px")),
    dict(html="sword-flight.html", css="css/sword-flight.css", p="sf",
         js="js/sword-flight.js", canvas=["sf-canvas"],
         frame=dict(wide="960px", stage="480px", side="320px", gap="10px"),
         extra_class={"sf-shortcut-item": "game-side-kbd-row", "sf-key": "game-side-kbd"}),
    dict(html="needle-awn.html", css="css/needle-awn.css", p="na",
         js="js/needle-awn.js", canvas=["na-canvas"],
         frame=dict(wide="960px", stage="480px", side="320px", gap="14px"),
         extra_class={"na-shortcut-item": "game-side-kbd-row", "na-key": "game-side-kbd"}),
    dict(html="tower-defense.html", css="css/tower-defense.css", p="td",
         js="js/tower-defense.js", canvas=["td-canvas"],
         frame=dict(wide="940px", stage="460px", side="300px"),
         extra_class={"td-side-shortcut-row": "game-side-kbd-row"}),
    dict(html="minesweeper.html", css="css/minesweeper.css", p="ms",
         js="js/minesweeper.js", canvas=[],
         frame=dict(max="640px", wide="780px")),
    dict(html="reversi.html", css="css/reversi.css", p="rv",
         js="js/reversi.js", canvas=[],
         frame=dict(max="560px", wide="820px")),
    dict(html="word-daily.html", css="css/word-daily.css", p="wd",
         js="js/word-daily.js", canvas=[],
         extra_class={"wd-lang-btn": "game-icon-btn--wide"},
         frame=dict(wide="600px")),
]

# 统一骨架的角色：后缀 → 通用类
BASE_ROLES = {
    "shell": "game-shell",
    "topbar": "game-topbar",
    "main": "game-main",
    "stage": "game-stage",
    "sidebar": "game-sidebar",
    "overlay": "game-overlay",
    "toast": "game-toast",
    "footer-hint": "game-footer-hint",
    "icon-btn": "game-icon-btn",
    "side-card": "game-side-card",
    "side-title": "game-side-title",
    "side-text": "game-side-text",
    "side-row": "game-side-row",
    "side-panel": "game-side-panel",
    "title-pill": "game-title-pill",
    "hud-box": "game-hud-box",
    "topbar-group": "game-topbar-group",
    "topbar-actions": "game-topbar-group",
    "topbar-left": "game-topbar-group",
    "topbar-right": "game-topbar-group",
    "canvas": "game-canvas",
}

# 内联 @media 内的 topbar：保留 flex-wrap（td）
TOPBAR_STRIP = ["width", "display", "align-items", "justify-content", "gap", "padding"]

ROLE_SPECS = {
    "shell": ["display", "flex-direction", "align-items", "justify-content",
              "width", "max-width", "margin", "min-height", "padding"],
    "topbar": TOPBAR_STRIP,
    "main": ALL,
    "sidebar": ALL,
    "stage": ["position", "display", "justify-content", "align-items", "flex",
              "min-height", "max-width", "width"],
    # backdrop-filter 不剪：共享 .game-overlay 不做毛玻璃，各页按自己的底色自选（gd/hs 用 blur）
    "overlay": ["position", "inset", "z-index", "display", "flex-direction", "align-items",
                "justify-content", "gap", "padding", "border-radius", "overflow-y",
                "scrollbar-width"],
    "toast": ["position", "left", "transform", "z-index", "border-radius",
              "pointer-events", "white-space"],
    "footer-hint": ALL,
    # color / font-family 不剪：页面可能给自己的图标钮定色调（如 wd 用 var(--text)），
    # 共享类的 color: inherit 不能替代它。
    "icon-btn": ["width", "height", "min-width", "flex-shrink", "position", "display",
                 "align-items", "justify-content", "padding", "font-size", "font-weight",
                 "background", "border", "border-radius",
                 "cursor", "transition", "backdrop-filter", "-webkit-backdrop-filter"],
    "side-card": ["background", "border", "border-radius", "padding", "text-align",
                  "backdrop-filter", "-webkit-backdrop-filter", "box-shadow"],
    "side-title": ["font-size", "font-weight", "letter-spacing", "margin-bottom"],
    "side-text": ["font-size", "line-height", "color"],
    "side-row": ["display", "justify-content", "align-items", "gap", "font-size",
                 "padding", "color"],
    "side-panel": ["display", "align-items", "gap", "font-size", "line-height",
                   "padding", "color", "white-space"],
    "title-pill": ["display", "flex-direction", "align-items", "text-align"],
    "hud-box": ["display", "align-items", "gap", "border-radius", "padding",
                "font-variant-numeric"],
    # 语言切换钮：文字型，宽度交给 .game-icon-btn--wide 统一（min-width 由 tokens 决定）
    "lang-btn": ["width", "min-width", "padding", "border-radius"],
}

# 整条删除的额外选择器（%s = 前缀）
EXTRA_DELETE = {
    "td": ["%s-side-shortcut-row", "%s-side-shortcut-row kbd"],
    "sf": ["%s-shortcut-item", "%s-key"],
    "na": ["%s-shortcut-item", "%s-key"],
}
ALWAYS_DELETE = ["%s-icon-btn::after", "%s-overlay::-webkit-scrollbar",
                 "%s-side-panel b"]

# 该页不做统一处理的角色（保留自身定位方式）
ROLE_SKIP = {
    "td": {"overlay"},          # 全屏弹层，与舞台内覆盖层不同形态
    "rv": {"overlay"},
    "ms": {"overlay"},
}

# 特定角色的裁剪例外
ROLE_OVERRIDE = {
    "wd": {"main": ["display", "flex-direction", "align-items", "justify-content"],
           "topbar": TOPBAR_STRIP + []},
    # td 舞台宽度跟随视口高度（保证棋盘完整可见），保留其自适应表达式
    "td": {"main": ["display", "align-items", "justify-content", "gap"],
           "stage": ["position", "display", "justify-content", "align-items", "flex",
                     "min-height", "max-width"]},
}

# 只剪「共享层已经提供」的几何声明。color / font-family 是页面自己的调色板与字体，
# 共享层不提供替代，剪掉会让继承链断掉（黑字黑图标 + 退回浏览器默认字体）——不可剪。
BODY_STRIP = ["display", "justify-content", "align-items", "min-height", "overflow-x",
              "overflow-y", "-webkit-tap-highlight-color",
              "user-select", "-webkit-user-select"]


def write_text_lf(path, text):
    """写回文件但保持 LF 换行（避免 Windows 下整文件 diff）。"""
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


# ────────────────────────── CSS 解析 ──────────────────────────

def scan_rules(lines):
    rules = []
    media = []
    i = 0
    n = len(lines)
    while i < n:
        s = lines[i].strip()
        if s.startswith("@media"):
            media.append(re.sub(r"\s+", " ", s[:s.index("{")].strip()) if "{" in s else s)
            i += 1
            continue
        if s.startswith("@") and s.endswith("{"):
            media.append(s[:s.index("{")].strip())
            i += 1
            continue
        if s.startswith("}"):
            if media:
                media.pop()
            i += 1
            continue
        if "{" in s:
            depth = s.count("{") - s.count("}")
            j = i
            if depth > 0:
                while j + 1 < n:
                    j += 1
                    depth += lines[j].count("{") - lines[j].count("}")
                    if depth <= 0:
                        break
            sel = s[:s.index("{")].strip()
            decs = []
            if j == i:
                inner = s[s.index("{") + 1:s.rindex("}")]
                for d in inner.split(";"):
                    d = d.strip()
                    if d:
                        decs.append(d)
            else:
                buf = []
                for k in range(i + 1, j + 1):
                    t = lines[k].strip()
                    if t == "}":
                        continue
                    t = t.rstrip("}").strip()
                    if not t:
                        continue
                    buf.append(t)
                    if t.endswith(";") or k == j:
                        raw = "\n".join(buf).rstrip(";").strip()
                        decs.append(raw)
                        buf = []
            rules.append(dict(media=tuple(media), sel=sel, decs=decs,
                              start=i, end=j, oneline=(j == i)))
            i = j + 1
            continue
        i += 1
    return rules


def prop_name(decl):
    return decl.split(":", 1)[0].strip().lower()


def is_property(raw, name):
    return prop_name(raw) == name


def match_exact(sel, pattern):
    rx = re.compile(pattern + r"$")
    norm = re.sub(r"\s+", " ", sel.strip())
    for part in norm.split(","):
        if not rx.match(part.strip()):
            return False
    return True


def render_rule(indent, sel, decs, oneline, sel_indent=""):
    if oneline:
        return sel_indent + sel + " { " + " ".join(
            d.replace("\n", " ") + ";" for d in decs) + " }"
    closing = indent[:-4] if indent.endswith("    ") else ""
    body = ""
    for d in decs:
        parts = d.split("\n")
        for idx, part in enumerate(parts):
            sep = ";" if idx == len(parts) - 1 else ""
            pad = indent if idx == 0 else indent + "    "
            body += pad + part + sep + "\n"
    return sel_indent + sel + " {\n" + body + closing + "}"


def collapse_blank_runs(lines):
    out = []
    blanks = 0
    for ln in lines:
        if not ln.strip():
            blanks += 1
            if blanks > 1:
                continue
        else:
            blanks = 0
        out.append(ln)
    return out


def cleanup_empty_media(lines):
    out = []
    i = 0
    n = len(lines)
    while i < n:
        if re.match(r"\s*@media", lines[i]):
            depth = lines[i].count("{") - lines[i].count("}")
            j = i
            while j + 1 < n and depth > 0:
                j += 1
                depth += lines[j].count("{") - lines[j].count("}")
            inner = "\n".join(lines[i + 1:j])
            inner_no_comment = re.sub(r"/\*.*?\*/", "", inner, flags=re.S)
            if not inner_no_comment.strip():
                i = j + 1
                continue
            out.extend(lines[i:j + 1])
            i = j + 1
            continue
        out.append(lines[i])
        i += 1
    return out


# ────────────────────────── CSS 文件处理 ──────────────────────────

def process_css(path, page, report):
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    p = page["p"]
    skip = ROLE_SKIP.get(p, set())
    ov = ROLE_OVERRIDE.get(p, {})

    patterns = []
    for role, props in ROLE_SPECS.items():
        if role in skip:
            continue
        if role == "icon-btn" and page.get("no_iconbtn"):
            continue
        if role == "canvas":
            continue
        patterns.append((r"\.%s-%s(?![\w-])" % (p, role), role, ov.get(role, props)))
    for role in ("topbar-group", "topbar-actions", "topbar-left", "topbar-right"):
        patterns.append((r"\.%s-%s(?![\w-])" % (p, role), "topbar-group", ALL))
    always = [x for x in ALWAYS_DELETE if not (x.startswith("%s-overlay")
              and "overlay" in skip)]
    for extra in EXTRA_DELETE.get(p, []) + always:
        patterns.append((r"\.%s(?![\w-])" % re.escape(extra % p), "__delete__", None))

    edits = []
    for r in scan_rules(lines):
        sel = r["sel"]
        for pat, role, props in patterns:
            if not match_exact(sel, pat):
                continue
            if role == "__delete__":
                report["deleted"] += 1
                edits.append((r["start"], r["end"], None))
                break
            use = props
            if role == "shell" and any("1024" in m for m in r["media"]):
                use = ["max-width", "padding"]      # 桌面块的内外边距统一由骨架决定
            if use == ALL:
                kept = []
            else:
                drop = set(x.lower() for x in use)
                kept = [d for d in r["decs"] if prop_name(d) not in drop]
            if not kept:
                report["deleted"] += 1
                edits.append((r["start"], r["end"], None))
            elif len(kept) != len(r["decs"]):
                indent = "    "
                if not r["oneline"] and r["start"] + 1 <= r["end"]:
                    src = lines[r["start"] + 1]
                    indent = src[:len(src) - len(src.lstrip())]
                report["pruned"] += 1
                src_sel = lines[r["start"]]
                sel_indent = src_sel[:len(src_sel) - len(src_sel.lstrip())]
                edits.append((r["start"], r["end"],
                              render_rule(indent, sel, kept, r["oneline"],
                                          sel_indent).split("\n")))
            break

    for r in scan_rules(lines):
        if not match_exact(r["sel"], r"body"):
            continue
        kept = [d for d in r["decs"] if prop_name(d) not in set(BODY_STRIP)]
        if not kept:
            report["deleted"] += 1
            edits.append((r["start"], r["end"], None))
        elif len(kept) != len(r["decs"]):
            indent = "    "
            if not r["oneline"] and r["start"] + 1 <= r["end"]:
                src = lines[r["start"] + 1]
                indent = src[:len(src) - len(src.lstrip())]
            report["pruned"] += 1
            src_sel = lines[r["start"]]
            sel_indent = src_sel[:len(src_sel) - len(src_sel.lstrip())]
            edits.append((r["start"], r["end"],
                          render_rule(indent, r["sel"], kept, r["oneline"],
                                      sel_indent).split("\n")))
        break

    out = list(lines)
    for start, end, new in sorted(edits, key=lambda e: -e[0]):
        if new is None:
            del out[start:end + 1]
        else:
            out[start:end + 1] = new
    out = cleanup_empty_media(out)
    out = collapse_blank_runs(out)

    frame = page["frame"]
    keys = [("max", "--frame-max"), ("wide", "--frame-max-wide"), ("stage", "--frame-stage"),
            ("side", "--frame-side"), ("gap", "--frame-side-gap")]
    vs = ["    %s: %s;" % (var, frame[k]) for k, var in keys if k in frame]
    block = ("\n/* ── 统一骨架参数（默认值与公共骨架见 css/layout.css） ── */\n"
             ".%s-shell {\n%s\n}\n" % (p, "\n".join(vs)))

    body = "\n".join(out).rstrip("\n")
    # 幂等：已存在参数块时替换，不重复追加
    marker = "/* ── 统一骨架参数（默认值与公共骨架见 css/layout.css） ── */"
    if marker in body:
        head, _, _ = body.partition(marker)
        body = head.rstrip("\n")
    text2 = body + "\n" + block
    if not DRY:
        write_text_lf(path, text2)
    return text2


# ────────────────────────── HTML / JS 类名注入 ──────────────────────────

def build_add_map(page):
    p = page["p"]
    add = {}
    for suffix, generic in BASE_ROLES.items():
        if suffix == "icon-btn" and page.get("no_iconbtn"):
            continue
        add["%s-%s" % (p, suffix)] = generic
    add.update(page.get("extra_class", {}))
    return add


def inject_classes(text, page, counter):
    add = build_add_map(page)

    def fix_list(class_str):
        names = class_str.split()
        extra = []
        for token, generic in add.items():
            if token in names and generic not in names and generic not in extra:
                extra.append(generic)
                counter[0] += 1
        if page.get("fill") and "game-stage" in names and "game-stage--fill" not in names:
            extra.append("game-stage--fill")
        return " ".join(names + extra)

    text = re.sub(r'(class=")([^"]*)(")',
                  lambda m: m.group(1) + fix_list(m.group(2)) + m.group(3), text)
    text = re.sub(r"(className\s*=\s*')([^']*)(')",
                  lambda m: m.group(1) + fix_list(m.group(2)) + m.group(3), text)
    text = re.sub(r'(className\s*=\s*")([^"]*)(")',
                  lambda m: m.group(1) + fix_list(m.group(2)) + m.group(3), text)

    # <body>：不再注入 game-body —— 全站没有任何 CSS 用到这个类，
    # 早先版本每次运行都无脑追加，HTML 里已累积出 5 个同名 token（见 git diff）。

    # 画布：必须判重，否则每次运行都会再追加一个 game-canvas
    for cid in page.get("canvas", []):
        def canvas_fix(m):
            tag = m.group(0)
            if "class=" in tag:
                return re.sub(r'class="([^"]*)"',
                              lambda mm: 'class="%s%s"' % (
                                  mm.group(1),
                                  "" if "game-canvas" in mm.group(1).split()
                                  else " game-canvas"), tag)
            return re.sub(r"<canvas", '<canvas class="game-canvas"', tag, count=1)
        text = re.sub(r'<canvas[^>]*id="%s"[^>]*>' % re.escape(cid), canvas_fix, text)

    return text


def inject_links(text):
    if "css/layout.css" in text:
        return text, False
    if 'href="css/tokens.css"' in text:
        text = text.replace(
            '<link rel="stylesheet" href="css/tokens.css">',
            '<link rel="stylesheet" href="css/tokens.css">\n'
            '    <link rel="stylesheet" href="css/layout.css">', 1)
        return text, True
    m = re.search(r'^(\s*)<link rel="stylesheet" href="css/[^"]+">', text, re.M)
    if not m:
        return text, False
    ins = ('%s<link rel="stylesheet" href="css/tokens.css">\n'
           '%s<link rel="stylesheet" href="css/layout.css">\n' % (m.group(1), m.group(1)))
    return text[:m.start()] + ins + text[m.start():], True


def main():
    report = dict(deleted=0, pruned=0, html_classes=0, js_classes=0, links=0)
    for page in PAGES:
        counter = [0]
        html_path = ROOT / page["html"]
        css_path = ROOT / page["css"]
        js_path = ROOT / page["js"]

        h = inject_classes(html_path.read_text(encoding="utf-8"), page, counter)
        h, linked = inject_links(h)
        report["html_classes"] += counter[0]
        report["links"] += 1 if linked else 0
        if not DRY:
            write_text_lf(html_path, h)

        jc = [0]
        j = js_path.read_text(encoding="utf-8")
        j2 = inject_classes(j, page, jc)
        report["js_classes"] += jc[0]
        if not DRY and j2 != j:
            write_text_lf(js_path, j2)

        process_css(css_path, page, report)
        print("%-24s html+%-3d js+%-3d link=%s" % (page["html"], counter[0], jc[0], linked))

    print("\n删除规则 %d 条 | 裁剪规则 %d 条 | HTML 类注入 %d | JS 类注入 %d | 补链 %d"
          % (report["deleted"], report["pruned"], report["html_classes"],
             report["js_classes"], report["links"]))


if __name__ == "__main__":
    main()
