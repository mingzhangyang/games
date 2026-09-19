#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把「移动端侧栏」升级为「顶栏 Stats 图标钮 + 底部抽屉」——幂等迁移脚本。

背景
----
2026-09-19 在 tetris 上做了原型：手机端隐藏侧栏，把侧栏里的面板搬进一个
底部抽屉（`css/layout.css` 的 `.game-drawer` 系列），顶栏右侧加一个 Stats 图标钮。
现推广到其余 6 个带侧栏的页面：planet-merge / hoop-shot / needle-awn /
tower-defense / gravity-slingshot / sword-flight。

本脚本做三件事（都可重复运行，不会叠加）：
  1. 在每个 `<aside class="xx-sidebar game-sidebar">` 内部，把所有
     `.xx-side-card` 包进一个 `<div id="xxStatsPanels">` 搬迁节点
     （与 tetris 的 `#statsPanels` 同构，供 JS 在侧栏/抽屉间搬移）。
  2. 在顶栏右侧的 `.game-topbar-group`（若无则最后一个 icon-btn 之后）
     插入 Stats 图标钮 `<button id="xxStatsToggle">`。
     注意：**不动现有的静音/暂停/语言钮**，只新增一个。
  3. 在 `</body>` 之前的合适位置插入抽屉骨架
     `<div class="game-drawer" id="xxStatsDrawer" hidden>…`。

⚠️ 三个必须遵守的约束（踩过的坑）
  - 抽屉是 `position: fixed`，**必须留在 `.game-shell` 之外**（放里面会被 shell 的
    层叠/内距影响）。tetris 原型就是放在 shell 之后。
  - 搬迁节点只能包 `.xx-side-card`，**不要**把 `.more-games`（如果它在 aside 里）
    或页面自有的按钮盒一起搬——那些在 tetris 里是留在侧栏外的。
  - 本脚本只改 HTML 结构，**不写 JS**：抽屉的开关/暂停/焦点陷阱由各页 JS 用
    共享 helper 实现（见 `js/game-drawer.js`）。

用法
----
    python scripts/apply-stats-drawer.py --dry     # 只报告，不写盘
    python scripts/apply-stats-drawer.py           # 真写
"""
import re
import sys
import pathlib

DRY = '--dry' in sys.argv
ROOT = pathlib.Path(__file__).resolve().parent.parent

# 页面 → (css/文件前缀, 侧栏类, 卡片类前缀)
PAGES = [
    ('planet-merge',      'pm'),
    ('hoop-shot',         'hs'),
    ('needle-awn',        'na'),
    ('tower-defense',     'td'),
    ('gravity-slingshot', 'gd'),
    ('sword-flight',      'sf'),
]

report = []


def log(page, msg):
    report.append(f'  [{page}] {msg}')


def indent_of(line):
    return re.match(r'[ \t]*', line).group(0)


def wrap_side_cards(page, pre, html):
    """把 aside 内的 .xx-side-card 全部包进 #xxStatsPanels。

    返回 (新 html, 状态)。已包过则原样返回。
    """
    node_id = f'{pre}StatsPanels'
    if f'id="{node_id}"' in html:
        return html, '已包过（跳过）'

    # 定位 aside 起止
    m = re.search(
        r'(?P<open>[ \t]*<aside class="[^"]*' + re.escape(pre) + r'-sidebar game-sidebar">)'
        r'(?P<body>.*?)'
        r'(?P<close>[ \t]*</aside>)',
        html, re.S)
    if not m:
        return html, '!! 找不到 aside'

    body = m.group('body')
    cards = list(re.finditer(
        r'[ \t]*<div class="' + re.escape(pre) + r'-side-card game-side-card">',
        body))
    if not cards:
        return html, '!! aside 内没有 side-card'

    # 求**每一张卡**的完整闭合位置（div 配平）。
    # ⚠️ 不能只对第一张卡配平就收工 —— 那样搬迁节点只会包住第一张卡，
    # 其余卡片漏在外面，手机上就只剩第一张卡进抽屉。
    tag_re = re.compile(r'<(/?)div\b[^>]*?(/?)>')

    def div_close_end(start):
        depth = 0
        i = start
        while True:
            tm = tag_re.search(body, i)
            if not tm:
                return None
            if tm.group(2) == '/':          # 自闭合
                i = tm.end()
                continue
            if tm.group(1) == '/':
                depth -= 1
                if depth == 0:
                    return tm.end()
            else:
                depth += 1
            i = tm.end()

    spans = []
    for c in cards:
        e = div_close_end(c.start())
        if e is None:
            return html, '!! side-card div 无法配平'
        spans.append((c.start(), e))

    # 取「从第一张卡到最后一个连续块」——卡之间只允许空白（含注释）分隔。
    # 遇到非空白内容（例如插在卡片之间的按钮盒）就截断，避免把不该搬的东西搬走。
    last_ok = 0
    for k in range(1, len(spans)):
        between = body[spans[k - 1][1]:spans[k][0]]
        stripped = re.sub(r'<!--.*?-->', '', between, flags=re.S)
        if stripped.strip() == '':
            last_ok = k
        else:
            break

    start = spans[0][0]
    end = spans[last_ok][1]
    moved = last_ok + 1
    skipped = len(spans) - moved

    inner = body[start:end]
    # 缩进：整体再进 4 空格
    inner_reindented = '\n'.join(
        ('    ' + ln if ln.strip() else ln) for ln in inner.split('\n'))
    base_indent = indent_of(body[cards[0].start():]) or '        '

    # inner 以 `\n` 收尾（最后一个 </div> 后还有换行），前面的换行要从 wrapper 收走，
    # 否则会出现 `<div id="...">                <div class="...">` 这种挤在一行的结果。
    inner_lead = inner_reindented.lstrip('\n')
    wrapped = (
        f'\n{base_indent}<!-- 由 apply-stats-drawer.py 生成的搬迁节点：'
        f'JS 在侧栏 / 底部抽屉之间搬移它 -->\n'
        f'{base_indent}<div id="{node_id}">\n'
        f'{inner_lead}'
        f'\n{base_indent}</div>\n'
    )

    new_body = body[:start] + wrapped + body[end:]
    new_html = html[:m.start('body')] + new_body + html[m.end('body'):]
    tail = f'（另有 {skipped} 张卡因不连续未搬）' if skipped else ''
    return new_html, f'已包入搬迁节点，含 {moved}/{len(spans)} 张卡{tail}'


def add_stats_button(page, pre, html):
    """在顶栏右侧加入 Stats 图标钮 + 确保右侧有 .game-topbar-group。

    右侧钮组是契约的一部分（`game-topbar-group` 让右侧钮共享 gap、靠右对齐）。
    needle-awn / gravity-slingshot / sword-flight 三页把右侧钮平铺在 header 里，
    没有 group 容器 —— 这里顺便把它们收进一个 group，顺带**在最后**追加 Stats 钮
    （追加在末尾 = 最靠右，符合 tetris 原型里 Stats 在最右的排布）。
    """
    btn_id = f'{pre}StatsToggle'
    if f'id="{btn_id}"' in html:
        return html, '已有 Stats 钮（跳过）'

    btn_label = f'aria-label="Stats" aria-haspopup="dialog" aria-expanded="false" aria-controls="{pre}StatsDrawer"'

    # 情况 1：已有 .game-topbar-group → 直接插到它开头（保持 group 内靠左，
    #         因为原 group 里已是静音/暂停钮，Stats 排在它们左边）
    m = re.search(r'([ \t]*)<div class="[^"]*game-topbar-group[^"]*">\n', html)
    if m:
        ind = m.group(1) + '    '
        btn = (f'{ind}<button type="button" class="{pre}-icon-btn game-icon-btn '
               f'{pre}-stats-btn game-stats-btn" id="{btn_id}"\n'
               f'{ind}        {btn_label}></button>\n')
        return html[:m.end()] + btn + html[m.end():], 'Stats 钮已插入既有 topbar-group'

    # 情况 2：无 group —— 找 header 内「最后一个 game-icon-btn 按钮」的起止，
    #         把它连同之前连续的 icon-btn 一起包进 group，并在 group 末尾加 Stats。
    hdr = re.search(
        r'(?P<open>[ \t]*<header class="[^"]*game-topbar[^"]*">\n)'
        r'(?P<body>.*?)'
        r'(?P<close>[ \t]*</header>)', html, re.S)
    if not hdr:
        return html, '!! 找不到 game-topbar header'

    body = hdr.group('body')
    # 收集 header 顶层的 icon-btn 按钮（粗粒度：从最后一个 </button> 往前找配对起点）
    btns = list(re.finditer(
        r'(?P<ind>[ \t]*)<button[^>]*class="[^"]*game-icon-btn[^"]*"[^>]*id="(?P<id>[^"]+)"[^>]*>',
        body))
    if not btns:
        return html, '!! 顶栏内没有 game-icon-btn'

    # ⚠️ 必须用「每个按钮的**完整闭合位置**」判断相邻性，不能用 `.end()`
    # （那只是开始标签的结束位置；后面还跟着 <svg>…</button>）。
    # 先把每个按钮的闭合终点算出来。
    btn_tag = re.compile(r'<(/?)button\b[^>]*>')

    def btn_close_end(start):
        """从 start（开始标签起点）向后配平，返回 </button> 的结束下标。"""
        depth = 0
        i = start
        while True:
            tm = btn_tag.search(body, i)
            if not tm:
                return None
            if tm.group(1) == '/':
                depth -= 1
                if depth == 0:
                    return tm.end()
            else:
                depth += 1
            i = tm.end()

    spans = []
    for b in btns:
        e = btn_close_end(b.start())
        if e is None:
            return html, '!! button 无法配平'
        spans.append((b.start(), e, b))

    # 取「连续的尾部按钮串」：从最后一个起往前，相邻按钮之间只有空白就继续
    first_idx = len(spans) - 1
    for k in range(len(spans) - 2, -1, -1):
        between = body[spans[k][1]:spans[first_idx][0]]
        if between.strip() == '':
            first_idx = k
        else:
            break

    seg_start = spans[first_idx][0]
    seg_end = spans[-1][1]
    first = spans[first_idx][2]

    inner = body[seg_start:seg_end]
    base = first.group('ind')
    inner_re = '\n'.join(('    ' + ln if ln.strip() else ln) for ln in inner.split('\n'))
    stats_ind = base + '    '
    stats_btn = (
        f'{stats_ind}<button type="button" class="{pre}-icon-btn game-icon-btn '
        f'{pre}-stats-btn game-stats-btn" id="{btn_id}"\n'
        f'{stats_ind}        {btn_label}></button>\n'
    )
    wrapped = (
        f'<div class="{pre}-topbar-actions game-topbar-group">\n'
        f'{inner_re}{stats_btn}'
        f'{base}</div>'
    )
    new_body = body[:seg_start] + wrapped + body[seg_end:]
    new_html = html[:hdr.start('body')] + new_body + html[hdr.end('body'):]
    return new_html, f'右侧 {len(spans) - first_idx} 个图标钮已收进新建 topbar-group，并追加 Stats 钮'


DRAWER_TPL = '''{ind}<!-- 底部统计抽屉（移动端）：面板由 JS 从侧栏搬进来 -->
{ind}<div class="game-drawer" id="{pre}StatsDrawer" hidden>
{ind}    <div class="game-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="{pre}StatsDrawerTitle">
{ind}        <div class="game-drawer-handle"></div>
{ind}        <div class="game-drawer-head">
{ind}            <span class="game-drawer-title" id="{pre}StatsDrawerTitle"></span>
{ind}            <button type="button" class="icon-btn game-icon-btn game-drawer-close" id="{pre}StatsClose" aria-label="Close"></button>
{ind}        </div>
{ind}        <div class="game-drawer-body" id="{pre}StatsDrawerBody"></div>
{ind}    </div>
{ind}</div>
'''


def add_drawer(page, pre, html):
    """插入抽屉骨架。必须放在 .game-shell 之外。"""
    if f'id="{pre}StatsDrawer"' in html:
        return html, '抽屉已存在（跳过）'

    # 找 .game-shell 的闭合位置：从 <div class="...game-shell..."> 起配平
    shell = re.search(r'[ \t]*<div class="[^"]*game-shell[^"]*">', html)
    if not shell:
        return html, '!! 找不到 .game-shell'

    depth = 0
    i = shell.start()
    tag_re = re.compile(r'<(/?)div\b[^>]*?(/?)>')
    shell_end = None
    while True:
        tm = tag_re.search(html, i)
        if not tm:
            break
        if tm.group(2) == '/':
            i = tm.end()
            continue
        if tm.group(1) == '/':
            depth -= 1
            if depth == 0:
                shell_end = tm.end()
                break
        else:
            depth += 1
        i = tm.end()

    if shell_end is None:
        return html, '!! .game-shell div 无法配平'

    ind = indent_of(html[shell.start():])
    drawer = '\n' + DRAWER_TPL.format(ind=ind, pre=pre)
    new_html = html[:shell_end] + drawer + html[shell_end:]
    return new_html, '抽屉已插入（shell 之后）'


def main():
    print('=' * 72)
    print('迁移「移动端侧栏 → 底部抽屉」' + ('  [DRY RUN]' if DRY else ''))
    print('=' * 72)

    for page, pre in PAGES:
        f = ROOT / f'{page}.html'
        if not f.exists():
            log(page, f'!! 文件不存在 {f}')
            continue
        html0 = f.read_text(encoding='utf-8')
        html = html0

        html, s1 = wrap_side_cards(page, pre, html)
        html, s2 = add_stats_button(page, pre, html)
        html, s3 = add_drawer(page, pre, html)

        log(page, f'搬迁节点: {s1}')
        log(page, f'Stats 钮: {s2}')
        log(page, f'抽屉: {s3}')

        if html != html0:
            if DRY:
                log(page, '→ 有改动（DRY，未写盘）')
            else:
                f.write_text(html, encoding='utf-8')
                log(page, '→ 已写盘')

    print('\n'.join(report))
    print('=' * 72)


if __name__ == '__main__':
    main()
