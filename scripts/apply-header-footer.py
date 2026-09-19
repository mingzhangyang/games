#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
统一全站游戏页的 Header 槽位与 Footer 骨架 —— 幂等迁移脚本。

契约
----
见 `docs/header-footer-contract-2026-09-19.md`。要点：

  <header class="xx-topbar game-topbar">
    <div class="xx-topbar-lead game-topbar-group">   左簇：Home 永远第一个
    <div class="xx-topbar-center game-topbar-center"> 中槽：标题 / HUD，各页自由
    <div class="xx-topbar-actions game-topbar-group"> 右簇：固定顺序
        ① 页面专属（Retry / Range / Speed / Theme / Help …）
        ② data-chrome="stats"   ③ data-chrome="pause"
        ④ data-chrome="sound"   ⑤ data-chrome="lang"
      —— Sound 与 Lang 永远是最右两颗 ⇒ 全站通用开关的屏幕位置一致。
  </header>

  <footer class="xx-footer game-footer">        （.game-shell 内最后，随流）
    <p class="xx-footer-hint game-footer-hint">操作提示</p>
    <div class="xx-footer-actions game-footer-actions game-topbar-group">
      <a data-chrome="home">, <button data-chrome="more" aria-controls="xxMoreNav">
    <nav class="more-games game-footer-nav" id="xxMoreNav" hidden>
  </footer>

⚠️ 为什么用「逐页声明式 spec」而不是通用 DOM 重排
   11 个页面的 header 结构各不相同：Home 有的 <a> 有的 <button>，rv/ms/gm 右簇
   根本没有 `.game-topbar-group` 容器，td 还是双行（app 行 / game 行）且中槽内容
   是一整行。通用重排会猜错"哪些节点属于中槽"——rv 的 `.rv-vs` 是裸 <span>、
   ms 的 `#ms-face` 是 <button>，都极易被误判成动作钮。
   逐页声明「哪几个选择器进中槽、右簇顺序如何」是唯一可靠的做法，
   而且 spec 本身就是契约的可读文档。

⚠️ 本脚本只改 HTML 结构，不碰 JS / i18n
   - 行为（Home/Sound/Lang/More 的点击与文案）在 `js/game-chrome.js`；
   - 页脚与更多游戏等 i18n 键由 `scripts/add-chrome-i18n.py` 补；
   - 开始浮层里已有的静态 `<nav class="more-games">` 原样保留（首屏推荐位）。

用法
----
    python scripts/apply-header-footer.py --dry   # 只报告，不写盘
    python scripts/apply-header-footer.py         # 真写
"""
import re
import sys
import pathlib

DRY = '--dry' in sys.argv
ROOT = pathlib.Path(__file__).resolve().parent.parent

report = []


def log(page, msg):
    report.append(f'  [{page}] {msg}')


# ─────────────────────────── DOM 工具 ───────────────────────────

def find_element(html, selector):
    """按 `#id` / `.class` 找到元素的最外层完整片段，返回 (start, end, tag)。

    ⚠️ 必须深度配平到闭合标签：只取开始标签的 `.end()` 会切出半个元素，
    写回去就是语法错误（apply-stats-drawer.py 的注释里记过这个坑）。
    """
    if selector.startswith('#'):
        pat = r'<([a-zA-Z][a-zA-Z0-9]*)[^>]*\bid="' + re.escape(selector[1:]) + r'"'
    else:
        pat = (r'<([a-zA-Z][a-zA-Z0-9]*)[^>]*\bclass="[^"]*(?<![\w-])'
               + re.escape(selector[1:]) + r'(?![\w-])')
    m = re.search(pat, html)
    if not m:
        return None
    tag = m.group(1)
    tag_re = re.compile(r'<(/?)' + re.escape(tag) + r'\b[^>]*?(/?)>')
    depth = 0
    i = m.start()
    while True:
        tm = tag_re.search(html, i)
        if not tm:
            return None
        if tm.group(2) == '/':
            i = tm.end()
            continue
        if tm.group(1) == '/':
            depth -= 1
            if depth == 0:
                return (m.start(), tm.end(), tag)
        else:
            depth += 1
        i = tm.end()


def cut(html, selector):
    """摘出元素，返回 (去掉它的 html, 片段)。未命中返回 (html, None)。"""
    span = find_element(html, selector)
    if not span:
        return html, None
    s, e, _ = span
    return html[:s] + html[e:], html[s:e]


def reindent(frag, n):
    """把片段整体缩进到 n 空格（先按最小公共缩进去缩进，再统一加）。

    ⚠️ 不能简单地给每行前面加空格：各页原缩进不一致（word-daily 6、tetris 8），
    直接加会让子节点的缩进比新父节点还浅，产物很难读。
    """
    lines = frag.split('\n')
    # strip 掉首尾空行
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    if not lines:
        return ''
    base = min((len(ln) - len(ln.lstrip()) for ln in lines if ln.strip()), default=0)
    pad = ' ' * n
    return '\n'.join(pad + ln[base:] if ln.strip() else '' for ln in lines)


def top_level_spans(body):
    """列出 body 的顶层元素片段 [(start, end, tag)]。"""
    out = []
    i = 0
    while i < len(body):
        m = re.search(r'<([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|\'[^\']*\'|[^>"\'])*)>', body[i:])
        if not m:
            break
        start = i + m.start()
        tag = m.group(1).lower()
        if tag in ('br', 'img', 'input', 'meta', 'link'):
            i = i + m.end()
            continue
        tag_re = re.compile(r'<(/?)' + re.escape(tag) + r'\b[^>]*?(/?)>')
        depth = 0
        j = start
        end = None
        while True:
            tm = tag_re.search(body, j)
            if not tm:
                break
            if tm.group(2) == '/':
                j = tm.end()
                continue
            if tm.group(1) == '/':
                depth -= 1
                if depth == 0:
                    end = tm.end()
                    break
            else:
                depth += 1
            j = tm.end()
        if end is None:
            break
        out.append((start, end, tag))
        i = end
    return out


def drop_emptied(body, ind):
    """删掉只剩空白/注释的顶层容器，返回 (新 body, 备注列表)。

    ⚠️ 判据只看**内容是否为空**，不看类名。按类名（如 `.game-topbar-group`）
    匹配会误伤其它同名容器 —— tetris 的旧右簇壳正好叫这个通用名。
    """
    notes = []
    changed = True
    while changed:
        changed = False
        for s, e, tag in reversed(top_level_spans(body)):
            if tag not in ('div', 'section', 'span'):
                continue
            inner = body[body.index('>', s) + 1:body.rindex('</' + tag + '>', s, e)]
            stripped = re.sub(r'<!--.*?-->', '', inner, flags=re.S).strip()
            if stripped:
                continue
            # 连带删掉前面的缩进与后面的换行，避免留下空行
            a = s
            while a > 0 and body[a - 1] in ' \t':
                a -= 1
            b = e
            while b < len(body) and body[b] in ' \t':
                b += 1
            if b < len(body) and body[b] == '\n':
                b += 1
            body = body[:a] + body[b:]
            notes.append(f'删空壳 <{tag}>（内容已重新分配）')
            changed = True
            break
    return body, notes


def indent_of(s):
    return re.match(r'[ \t]*', s).group(0)


# ─────────────────────────── 共享片段模板 ───────────────────────────

HOME_ICON = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" '
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
    'aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.3V21h13V9.3"/></svg>'
)

# 与 gravity-slingshot / minesweeper 现有静音钮的内联 SVG 一致（喇叭 + 声波）；
# 无 JS 时是兜底外观，js/game-chrome.js 的 init 会用 ICONS 覆盖它。
SOUND_ICON = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" '
    'fill="currentColor" stroke="none" aria-hidden="true"><path d="M4 9v6h4l5 4.5v-15L8 9H4z"/></svg>'
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" '
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">'
    '<path d="M16.5 8.7a4.6 4.6 0 0 1 0 6.6"/><path d="M19 6.2a8.2 8.2 0 0 1 0 11.6"/></svg>'
)

MORE_ICON = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" '
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
    'aria-hidden="true"><path d="M7.4 8.5h9.2a4.6 4.6 0 0 1 4.5 3.7l.7 4.2a2.6 2.6 0 0 1-4.7 2'
    'L15.6 16H8.4l-1.5 2.4a2.6 2.6 0 0 1-4.7-2l.7-4.2a4.6 4.6 0 0 1 4.5-3.7z"/>'
    '<path d="M7.5 11.6v3M6 13.1h3"/>'
    '<circle cx="16.2" cy="12" r="1.1" fill="currentColor" stroke="none"/>'
    '<circle cx="18.1" cy="14" r="1.1" fill="currentColor" stroke="none"/></svg>'
)


# ─────────────────────────── 逐页 spec ───────────────────────────
#
# center        进中槽的选择器（按显示顺序）
# left_extra    左簇里除 Home 之外要保留的节点（否则会随 drop_wrappers 一起消失）
# right         右簇期望顺序；元素为选择器字符串，或 'new:sound' / 'new:lang'
#               ⚠️ 只有**本页原本没有**该钮时才用 new: —— 否则原节点不会被纳入重排，
#                  会随旧容器一起删掉，页面 JS 的 getElementById 立刻对不上。
# footer_hint   页脚 hint 的现有选择器；None = 该页原本没有，需要新建元素
# hint_id       页脚 hint 的元素 id
# footer_inner  该页 shell 内、页脚之前是否已有 hint（用于复用文案来源）
# pre           id / class 前缀
# extra         额外动作标记

PAGES = {
    'gravity-slingshot': dict(
        pre='gd',
        center=['.gd-hole-label', '.gd-launch-box'],
        right=['#gd-reset-btn', '#gdStatsToggle', '#gd-mute-btn', 'new:lang'],
        drop_wrappers=['.gd-topbar-actions'],
        footer_hint='#gd-hint', hint_id='gd-hint',
    ),
    'hoop-shot': dict(
        pre='hs',
        center=['.hs-score-box'],
        right=['#hsStatsToggle', '#hs-pause-btn', '#hs-mute-btn', 'new:lang'],
        drop_wrappers=['.hs-topbar-actions'],
        footer_hint='#hs-hint', hint_id='hs-hint',
    ),
    'planet-merge': dict(
        pre='pm',
        center=['.pm-scores'],
        right=['#pmStatsToggle', '#pm-pause-btn', '#pm-mute-btn', 'new:lang'],
        drop_wrappers=['.pm-topbar-actions'],
        footer_hint='.pm-footer-hint', hint_id='pm-hint',
    ),
    'sword-flight': dict(
        pre='sf',
        center=['.sf-title-pill', '.sf-hud-box'],
        right=['#sfStatsToggle', '#sf-btn-pause', '#sf-btn-sound', 'new:lang'],
        drop_wrappers=['.sf-topbar-actions'],
        footer_hint=None, hint_id='sf-hint',
    ),
    'needle-awn': dict(
        pre='na',
        center=['.na-title-pill', '.na-hud-box'],
        right=['#naStatsToggle', '#na-btn-pause', '#na-btn-sound', 'new:lang'],
        drop_wrappers=['.na-topbar-actions'],
        footer_hint=None, hint_id='na-hint',
    ),
    'tower-defense': dict(
        pre='td',
        center=['.td-topbar-row--game'],
        right=['#td-range-btn', '#td-speed-btn', '#tdStatsToggle', '#td-pause-btn',
               '#td-mute-btn', 'new:lang'],
        drop_wrappers=['.td-topbar-row--app'],
        footer_hint='#td-hint', hint_id='td-hint',
    ),
    'reversi': dict(
        pre='rv',
        center=['#rv-box-black', '.rv-vs', '#rv-box-white'],
        right=['#rv-mute-btn', 'new:lang'],   # 原本无 group 容器，由组装时统一包一个
        footer_hint='#rv-hint', hint_id='rv-hint',
    ),
    'minesweeper': dict(
        pre='ms',
        center=['#ms-counter-mines', '#ms-face', '#ms-counter-timer'],
        right=['#ms-btn-pause', '#ms-mute-btn', 'new:lang'],
        footer_hint='#ms-hint', hint_id='ms-hint',
    ),
    'word-daily': dict(
        pre='wd',
        center=['.wd-title-box'],
        right=['#wd-btn-stats', '#wd-btn-mute', 'new:lang'],
        # 帮助钮原在左簇里，drop_wrappers 删 .wd-topbar-left 时会把它一起带走
        left_extra=['#wd-btn-help'],
        drop_wrappers=['.wd-topbar-left', '.wd-topbar-right'],
        footer_hint=None, hint_id='wd-hint',
        # 「词库模式」(#wd-btn-lang) 语义是题库切换、不是 UI 语言，
        # 与 #wd-btn-practice 一起移到 .wd-diff-row（那一行本来就是模式选择语义）。
        # 二者与新的 UI 语言钮正交，绝不可混为同一颗钮。
        move_to_diff_row=['#wd-btn-lang', '#wd-btn-practice'],
    ),
    'gomoku': dict(
        pre='gm',
        center=['#gameTitle'],
        right=['new:sound', '#langBtn'],
        footer_hint=None, hint_id='gm-hint',
    ),
    'tetris': dict(
        pre='tt',
        center=['.game-title-pill'],
        right=['#themeToggle', '#statsToggle', 'new:sound', 'new:lang'],
        footer_hint=None, hint_id='tt-hint',
    ),
}

# id → data-chrome 角色（按后缀匹配）
CHROME_OF = [
    ('StatsToggle', 'stats'),
    ('statsToggle', 'stats'),
    ('-btn-pause', 'pause'),
    ('-pause-btn', 'pause'),
    ('-mute-btn', 'sound'),
    ('-btn-sound', 'sound'),
    ('langBtn', 'lang'),
    ('-btn-lang-ui', 'lang'),
    ('-btn-home', 'home'),
    ('-home-btn', 'home'),
    ('homeBtn', 'home'),
    ('homeLink', 'home'),
    ('-btn-home-top', 'home'),
]


def chrome_role(eid):
    for suf, role in CHROME_OF:
        if eid == suf or eid.endswith(suf):
            return role
    return None


SOUND_TPL = ('<button type="button" class="{pre}-icon-btn game-icon-btn" '
             'id="{pre}-mute-btn" data-chrome="sound" '
             'title="Sound" aria-label="Sound">' + SOUND_ICON + '</button>')

LANG_TPL = ('<button type="button" class="{pre}-icon-btn {pre}-lang-btn game-icon-btn '
            'game-icon-btn--wide" id="{pre}-btn-lang-ui" data-chrome="lang" '
            'title="Language" aria-label="Language">{label}</button>')


def tag_chrome(frag):
    """给片段补 data-chrome（已带则原样返回）。"""
    if 'data-chrome=' in frag:
        return frag
    mid = re.search(r'\bid="([^"]+)"', frag)
    if not mid:
        return frag
    role = chrome_role(mid.group(1))
    if not role:
        return frag
    lm = re.match(r'([ \t]*)<([a-zA-Z]+)', frag)
    if not lm:
        return frag
    tag = lm.group(2)
    return frag.replace(f'<{tag} ', f'<{tag} data-chrome="{role}" ', 1)


# ─────────────────────────── 页内节点搬迁 ───────────────────────────

def move_into(page, spec, html):
    """把 spec['move_to_diff_row'] 里的节点搬进该页的模式行容器。

    这是 word-daily 专项：header 在 390px 下只剩 ~90px 给标题，
    把「词库模式」与「Practice」两颗移到 `.wd-diff-row`（本来就是模式选择语义）。
    """
    pre = spec['pre']
    movers = spec.get('move_to_diff_row') or []
    if not movers:
        return html, '无需搬迁', []

    anchor_sel = f'.{pre}-diff-row'
    if not find_element(html, anchor_sel):
        return html, f'!! 找不到 {anchor_sel}', []

    notes = []
    frags = []
    for sel in movers:
        span = find_element(html, sel)
        if span is None:
            notes.append(f'⚠ 搬迁源未命中 {sel}')
            continue
        # 幂等判据：搬过的节点带 data-chrome-moved。第二次运行时它已经不在原容器
        # 而在 .wd-diff-row 里，没有这个标记就会再被搬一次（首轮幂等检查抓到的 bug）。
        if 'data-chrome-moved' in html[span[0]:span[1]]:
            notes.append(f'{sel} 已搬过（跳过）')
            continue

        html, frag = cut(html, sel)
        if frag is None:
            notes.append(f'⚠ 搬迁源未命中 {sel}')
            continue
        lm = re.match(r'([ \t]*)<([a-zA-Z]+)', frag)
        if lm:
            frag = frag.replace(f'<{lm.group(2)} ',
                                f'<{lm.group(2)} data-chrome-moved="1" ', 1)
        frags.append((sel, frag.strip('\n')))

    if not frags:
        return html, '节点已搬过（跳过）', notes

    span = find_element(html, anchor_sel)
    s, e, tag = span
    # 插到容器**末尾**（模式行的最后，语义上与前面的难度选择并列）
    close = html.rindex(f'</{tag}>', s, e)
    line_start = html.rindex('\n', s, close) + 1
    ind = indent_of(html[line_start:close])
    block = '\n'.join(reindent(f, len(ind)) for _, f in frags)
    html = html[:line_start] + block + '\n' + html[line_start:]
    notes.append(f'搬入 {anchor_sel}: ' + ', '.join(sel for sel, _ in frags))
    return html, '页内搬迁完成', notes


# ─────────────────────────── Header 重建 ───────────────────────────

def rebuild_header(page, spec, html):
    pre = spec['pre']
    hdr = re.search(
        r'(?P<ind>[ \t]*)(?P<open><header class="[^"]*game-topbar[^"]*">)'
        r'(?P<body>.*?)(?P<close>^[ \t]*</header>)',
        html, re.S | re.M)
    if not hdr:
        return html, '!! 找不到 game-topbar header', []

    ind = hdr.group('ind')
    body = hdr.group('body')
    notes = []

    if 'game-topbar-center' in body and 'data-chrome="lang"' in body:
        return html, '已是契约形态（跳过）', notes

    # ① 摘 Home（各页 id 不同，统一按角色找）
    home_sel = None
    for sel in ('#gd-btn-home', '#hs-btn-home-top', '#pm-home-btn', '#sf-btn-home',
                '#na-btn-home', '#td-btn-home', '#rv-btn-home', '#ms-btn-home',
                '.wd-home-link', '#homeLink', '#homeBtn'):
        if find_element(body, sel):
            home_sel = sel
            break
    if not home_sel:
        return html, '!! 找不到 Home 钮', notes
    body, home_frag = cut(body, home_sel)
    home_frag = tag_chrome(home_frag)
    lead_frags = [home_frag]
    for sel in spec.get('left_extra', []):
        body, frag = cut(body, sel)
        if frag is None:
            return html, f'!! 左簇选择器未命中: {sel}', notes
        lead_frags.append(tag_chrome(frag))
    # gomoku 的 #homeLink 有「对局中离开需确认」的点击拦截，保留其 id 与事件

    # ② 摘中槽内容
    center_frags = []
    for sel in spec['center']:
        body, frag = cut(body, sel)
        if frag is None:
            return html, f'!! 中槽选择器未命中: {sel}', notes
        center_frags.append(frag)

    # ③ 摘右簇，按 spec 顺序重排；缺失的通用钮在此新建
    right_frags = []
    for item in spec['right']:
        if item == 'new:sound':
            right_frags.append(SOUND_TPL.format(pre=pre))
            notes.append('+Sound')
            continue
        if item == 'new:lang':
            right_frags.append(LANG_TPL.format(pre=pre, label='中文'))
            notes.append('+Lang')
            continue
        body, frag = cut(body, item)
        if frag is None:
            return html, f'!! 右簇选择器未命中: {item}', notes
        frag = frag
        tagged = tag_chrome(frag)
        if tagged != frag:
            notes.append(f'{item} 打标 data-chrome')
        right_frags.append(tagged)

    # ④ 删除已被抽空的旧容器（否则只剩空壳 div，还会在 flex 里占 gap）
    #    这些容器里的**内容**都已按 spec 重新分配，容器本身不再有意义。
    for sel in spec.get('drop_wrappers', []):
        probe = find_element(body, sel)
        if probe is not None:
            stray = re.findall(r'\bid="([^"]+)"', probe if isinstance(probe, str) else '')
            if stray:
                # 这正是 wd-btn-help 消失的原因：它在 .wd-topbar-left 里，
                # 没被任何槽位 spec 认领，于是随容器一起被删掉。
                return html, (f'!! 待删容器 {sel} 里还有带 id 的节点 {stray} —— '
                              f'请先把它们写进 center / right / left_extra'), notes
        body, frag = cut(body, sel)
        if frag is None:
            notes.append(f'⚠ 未找到待删容器 {sel}')
        else:
            notes.append(f'删空壳 {sel}')

    # ④b 通用兜底：任何**只剩空白/注释**的顶层容器都删掉。
    #     只按内容判空，不按类名 —— tetris 的旧 `.game-topbar-group` 没有专属前缀，
    #     按类名匹配会误伤同名的其它容器。
    body, dropped = drop_emptied(body, ind)
    notes.extend(dropped)

    # ⑤ 残留检查：没纳入契约的顶层节点必须报出来，绝不静默丢弃
    leftover = re.sub(r'<!--.*?-->', '', body, flags=re.S).strip()
    if leftover:
        notes.append(f'⚠ 残留节点(未纳入契约) {len(leftover)} 字符: '
                     f'{leftover[:70]!r}')

    # 缩进：header 缩进为 ind，三个槽位是 +4，槽位内容再 +4。
    # ⚠️ 用**绝对**缩进（ind + N），不要给片段加相对前缀 —— 片段来自各页原始 HTML，
    #    自带各自的缩进基准，reindent 会先按最小公共缩进去缩进再统一加，
    #    这里只需传入目标绝对值。
    L1 = len(ind) + 4        # 槽位容器
    L2 = len(ind) + 8        # 槽位内容

    center_html = ''
    if center_frags:
        center_html = ('\n' + '\n'.join(reindent(f, L2) for f in center_frags)
                       + '\n' + ' ' * L1)
    right_items = '\n'.join(reindent(f, L2) for f in right_frags)
    right_html = f'\n{right_items}\n{" " * L1}' if right_frags else ''

    new_body = (
        f'\n{" " * L1}<div class="{pre}-topbar-lead game-topbar-group">\n'
        f'{" " * L2}<!-- 左簇：Home 永远第一个（文案 / aria 由 js/game-chrome.js 统一写） -->\n'
        + '\n'.join(reindent(f, L2) for f in lead_frags) + '\n'
        f'{" " * L1}</div>\n'
        f'\n{" " * L1}<!-- 中槽：标题 / HUD，各页自由 -->\n'
        f'{" " * L1}<div class="{pre}-topbar-center game-topbar-center">'
        f'{center_html}{" " * L1}</div>\n'
        f'\n{" " * L1}<!-- 右簇固定顺序：专属 → stats → pause → sound → lang -->\n'
        f'{" " * L1}<div class="{pre}-topbar-actions game-topbar-group">{right_html}\n'
        f'{" " * L1}</div>\n'
        f'{ind}'
    )

    new_html = (html[:hdr.start('body')] + new_body
                + '\n' + html[hdr.end('body'):])
    return new_html, 'header → 三槽位', notes


# ─────────────────────────── Footer 注入 ───────────────────────────

def inject_footer(page, spec, html):
    pre = spec['pre']
    if f'id="{pre}MoreNav"' in html:
        return html, '页脚已存在（跳过）', []

    notes = []

    # 现有 hint：原地保留（文案来源不变，只包进 <footer>）
    hint_sel = spec['footer_hint']
    hint_frag = None
    if hint_sel:
        html, frag = cut(html, hint_sel)
        if frag is not None:
            hint_frag = frag.strip('\n')
        else:
            notes.append(f'⚠ hint 选择器未命中 {hint_sel}')

    if hint_frag is None:
        hint_frag = (f'<p class="{pre}-footer-hint game-footer-hint" '
                     f'id="{spec["hint_id"]}"></p>')
        notes.append('+新建 hint 元素')

    # ⚠️ minesweeper 的 .ms-hint 是自有类且没有 game-footer-hint，
    #    原地补上契约类（它的 flag-mode 动态文案由 js/minesweeper.js 继续写）
    if hint_sel == '#ms-hint' and 'game-footer-hint' not in hint_frag:
        hint_frag = hint_frag.replace('class="ms-hint"',
                                      'class="ms-hint game-footer-hint"', 1)
        notes.append('ms-hint 补 game-footer-hint')

    # 插入点：.game-shell 的闭合 </div> 之前（必须留在 shell 内、抽屉之外）
    shell = find_element(html, '.game-shell')
    if not shell:
        return html, '!! 找不到 .game-shell', notes
    s, e, _ = shell

    # shell 的缩进：从 shell 开始标签所在行的行首取
    open_line_start = html.rindex('\n', 0, s) + 1
    ind = indent_of(html[open_line_start:s])
    L1 = len(ind) + 4

    # ⚠️ 闭合标签必须用「与开始标签**完全相同**的缩进」来定位。
    #    只找 segment 里最后一个 `</div>` 会命中更深层的嵌套 div
    #    （gd 的 shell 缩进是 4，直接取最后一个就抓到了内容里的 div），
    #    结果页脚被插到页面中间、且缩进为 0。
    close_pat = re.compile(r'^' + re.escape(ind) + r'</div>[ \t]*$', re.M)
    matches = list(close_pat.finditer(html, s, e))
    if not matches:
        return html, '!! 无法定位 shell 闭合标签', notes
    abs_pos = matches[-1].start()

    footer = (
        f'\n{ind}<!-- 持久页脚：随流在底部（不用 sticky/fixed，避免与移动端底栏、\n'
        f'{ind}     统计抽屉、结算浮层抢层级，也不吃竖版画布高度）。\n'
        f'{ind}     ⚠️ 只放无状态导航；Sound / Lang 是状态开关，唯一真源在 header。 -->\n'
        f'{ind}<footer class="{pre}-footer game-footer">\n'
        f'{" " * L1}{reindent(hint_frag, 0)}\n'
        f'{" " * L1}<div class="{pre}-footer-actions game-footer-actions game-topbar-group">\n'
        f'{" " * L1}    <a class="{pre}-icon-btn game-icon-btn" data-chrome="home" '
        f'href="index.html">{HOME_ICON}</a>\n'
        f'{" " * L1}    <button type="button" class="{pre}-icon-btn game-icon-btn" '
        f'data-chrome="more" aria-expanded="false" aria-controls="{pre}MoreNav">'
        f'{MORE_ICON}</button>\n'
        f'{" " * L1}</div>\n'
        f'{" " * L1}<nav class="more-games game-footer-nav" id="{pre}MoreNav" hidden></nav>\n'
        f'{ind}</footer>\n'
    )

    new_html = html[:abs_pos] + footer + html[abs_pos:]
    return new_html, '页脚已注入（shell 内末尾）', notes


# ─────────────────────────── main ───────────────────────────

def main():
    print('=' * 76)
    print('统一 Header 槽位 + 注入 Footer' + ('   [DRY RUN]' if DRY else ''))
    print('=' * 76)

    for page, spec in PAGES.items():
        f = ROOT / f'{page}.html'
        if not f.exists():
            log(page, f'!! 文件不存在 {f}')
            continue
        html0 = f.read_text(encoding='utf-8')
        html = html0

        # ⚠️ 顺序硬性：move_into 必须早于 rebuild_header。
        #    rebuild_header 会删掉被抽空的旧容器（如 .wd-topbar-left/right），
        #    而搬迁源（#wd-btn-lang / #wd-btn-practice）此刻还在那些容器**里面** ——
        #    先重建就等于先把搬迁源删了，move_into 只能报"源未命中"。
        html, s1b, n1b = move_into(page, spec, html)
        html, s1, n1 = rebuild_header(page, spec, html)
        html, s2, n2 = inject_footer(page, spec, html)

        log(page, f'header: {s1}')
        for n in n1:
            log(page, f'         · {n}')
        if n1b or s1b not in ('无需搬迁',):
            log(page, f'搬迁: {s1b}')
            for n in n1b:
                log(page, f'         · {n}')
        log(page, f'footer: {s2}')
        for n in n2:
            log(page, f'         · {n}')

        # ⚠️ 兜底守卫：迁移**绝不允许**让任何 id 消失。
        #    上一版正是因为用 new: 模板替换了原节点，让 sf-btn-sound / na-btn-sound /
        #    wd-btn-mute / wd-btn-help 凭空蒸发，而页面 JS 还在 getElementById 它们
        #    —— sf / na 直接构造期空指针崩溃，整页打不开。
        lost = (set(re.findall(r'\bid="([^"]+)"', html0))
                - set(re.findall(r'\bid="([^"]+)"', html)))
        if lost:
            log(page, f'!! 拒绝写盘：以下 id 会消失 {sorted(lost)}')
            continue

        if html != html0:
            if DRY:
                log(page, '→ 有改动（DRY，未写盘）')
            else:
                f.write_text(html, encoding='utf-8')
                log(page, '→ 已写盘')
        else:
            log(page, '→ 无改动')

    print('\n'.join(report))
    print('=' * 76)


if __name__ == '__main__':
    main()
