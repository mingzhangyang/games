#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
为 11 个页面补 / 归一「顶栏-页脚外壳」所需的 i18n 键 —— 幂等迁移脚本。

补的键（两种语言各一条）
  home         Home 钮的 title / aria-label（页眉 + 页脚两处共用同一文案）
  sound        Sound 钮的 title / aria-label（未静音时）
  moreGames    页脚「更多游戏」展开钮
  hint         页脚操作提示

键名归一（保留旧键做别名一个版本，避免漏改赋值点）
  hoop-shot:   footerHint  → hint   （js 里的赋值点同时改，见下方 RENAME_SITES）
  reversi:     muteHint    → hint

⚠️ 三条必须遵守的安全纪律（CLAUDE.md 明确记录过 add-drawer-i18n.py 的教训）
  ① **绝不在遍历 finditer 结果时原地切片字符串**。匹配偏移是相对**原始**串的，
     删掉第一段后后面全部失准，会切出随机片段（当时把 '开始新的每日挑战？…' 拦腰截断，
     六个 JS 文件全部语法错误，且 `git checkout` 会连本轮的正当改动一起丢掉）。
     正确做法：先收集所有命中的**绝对** (start, end)，再**倒序在整份 src 上删**，只返回一次。
  ② 判重窗口取 `src[pos:]` 时 pos 指向键自身缩进、前面没有 `\n`，
     取预览要从 `pos-1` 起，否则 `r'\\n[ \\t]*key:'` 永远匹配不到。
  ③ 必须支持 `--dry`；先 `cp` 到 scratch 目录跑 `node --check`；用 `md5sum` 跑两遍
     证明幂等 —— 不要相信脚本自己打印的"已跳过"报告。

用法
----
    python scripts/add-chrome-i18n.py --dry
    python scripts/add-chrome-i18n.py
"""
import re
import sys
import pathlib

DRY = '--dry' in sys.argv
ROOT = pathlib.Path(__file__).resolve().parent.parent

report = []


def log(page, msg):
    report.append(f'  [{page}] {msg}')


# 页面 → i18n 表名（pm/hs/td/gd/ms/rv/wd/gm/tt 叫 LANGUAGES；na/sf 叫 I18N）
PAGES = {
    'gravity-slingshot': 'LANGUAGES',
    'hoop-shot':         'LANGUAGES',
    'planet-merge':      'LANGUAGES',
    'sword-flight':      'I18N',
    'needle-awn':        'I18N',
    'tower-defense':     'LANGUAGES',
    'reversi':           'LANGUAGES',
    'minesweeper':       'LANGUAGES',
    'word-daily':        'LANGUAGES',
    'gomoku':            'LANGUAGES',
    'tetris':            'LANGUAGES',
}

# 每页要补的键 → {en, zh}。已存在的跳过。
NEW_KEYS = {
    'home':      {'en': 'Home', 'zh': '返回主页'},
    'sound':     {'en': 'Sound', 'zh': '声音'},
    'moreGames': {'en': 'More games', 'zh': '更多游戏'},
}

# 各页 hint 文案（只在缺 hint 时补；已有 hint 的页面保留其原文案）
HINTS = {
    'hoop-shot':  {'en': 'Swipe up to shoot · P pause · M mute',
                   'zh': '向上滑动投篮 · P 暂停 · M 静音'},
    'sword-flight': {'en': 'Drag to fly · Space dash · P pause · M mute',
                     'zh': '拖拽御剑 · 空格疾刺 · P 暂停 · M 静音'},
    'needle-awn': {'en': 'Move to thrust · Q switch stance · E ultimate · P pause',
                   'zh': '移动即突刺 · Q 转锋 · E 极意 · P 暂停'},
    'word-daily': {'en': 'Type your guess · Enter to submit · M mute',
                   'zh': '输入猜测 · 回车提交 · M 静音'},
    'gomoku':     {'en': 'Click a point to place your stone',
                   'zh': '点击交叉点落子'},
    'tetris':     {'en': 'Arrows move · Space hard drop · P pause · M mute',
                   'zh': '方向键移动 · 空格瞬降 · P 暂停 · M 静音'},
}

# 键名归一：旧键 → 新键（源文件里的**定义**改名）
RENAMES = {
    'hoop-shot': [('footerHint', 'hint')],
    'reversi':   [('muteHint', 'hint')],
}


def _match_brace(src, open_idx):
    """从 open_idx（指向 `{`）起配平，返回闭合 `}` 的下标。跳过字符串与注释。"""
    depth = 0
    i = open_idx
    n = len(src)
    while i < n:
        c = src[i]
        if c in ('"', "'", '`'):
            q = c
            i += 1
            while i < n:
                if src[i] == '\\':
                    i += 2
                    continue
                if src[i] == q:
                    break
                i += 1
        elif c == '/' and i + 1 < n and src[i + 1] == '/':
            i = src.find('\n', i)
            if i < 0:
                return None
        elif c == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2)
            if j < 0:
                return None
            i = j + 1
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return None


def find_lang_blocks(src, table):
    """返回 {'en': (body_start, close_idx), 'zh': (...)}，均为**整份 src 的绝对偏移**。

    ⚠️ 语言键必须取**表第一层**的 `en: {` / `zh: {`。
    起初用 `\\n[ \\t]+en: \\{` 在全表里搜，会命中**嵌套**对象里的同名键，
    于是"语言块"被截在嵌套对象内部 —— 补键就插进了 `helpText: { ... }` 的花括号里，
    11 个文件同时变成语法错误。必须按花括号深度定位第一层。
    """
    tm = re.search(r'^const ' + re.escape(table) + r' = \{', src, re.M)
    if not tm:
        return None
    table_open = src.index('{', tm.start())
    table_close = _match_brace(src, table_open)
    if table_close is None:
        return None

    out = {}
    # 只在 [table_open+1, table_close) 这一层里找，且该 `en:` 必须**直接**属于本层：
    # 即从 table_open 到该位置之间，花括号深度始终为 1。
    for lang in ('en', 'zh'):
        for lm in re.finditer(r'([ \t]*)' + lang + r'\s*:\s*\{', src[table_open:table_close]):
            abs_key = table_open + lm.start()
            if _depth_at(src, table_open, abs_key) != 1:
                continue
            brace = src.index('{', abs_key)
            close = _match_brace(src, brace)
            if close is None:
                continue
            out[lang] = (brace + 1, close)
            break
    return out or None


def _depth_at(src, open_idx, pos):
    """open_idx（`{`）到 pos 之间的花括号深度（含 open_idx 本身为 1）。"""
    return 1 + src.count('{', open_idx + 1, pos) - src.count('}', open_idx + 1, pos)


def has_key(src, block, key):
    """该语言块里是否已有顶层 `key:`。"""
    bs, be = block
    return re.search(r'(?m)^[ \t]+' + re.escape(key) + r'\s*:', src[bs:be]) is not None


def block_indent(src, block):
    """语言块内的键缩进（取块内第一个顶层键的缩进）。"""
    bs, be = block
    m = re.search(r'\n([ \t]+)\S', src[bs:be])
    return m.group(1) if m else '        '


def add_keys(src, block, entries):
    r"""在语言块**闭合花括号之前**插入若干 `key: 'value',`。返回 (新 src, 插入数)。

    ⚠️ 三个必踩的点：
    ① 用绝对偏移一次性拼接，绝不在循环里改字符串（偏移会整体失准）。
    ② 块内最后一条属性**可能没有尾逗号**（tetris 的 `comboDisplay: x => \`...\`` 就是），
       直接在它后面追加新键会拼成语法错误。插入前必须确认上一行以 `,` 收尾。
    ③ 补尾逗号时**不能用 rstrip() 吃掉那一行的换行符** —— 上一版就是这么干的，
       于是新键被粘在上一行行尾（`confirmReplace: '…',         sound: 'Sound',`），
       同时偏移错位让第一个键在块尾又插了一遍。补逗号只改行尾，换行原样保留。
    """
    bs, close = block
    ind = block_indent(src, block)

    # `}` 所在行的行首
    line_start = src.rindex('\n', 0, close) + 1

    # 往上找最后一条非空属性行（跳过空行）
    prev_start = prev_end = None
    probe = line_start
    while probe > 0:
        end = probe - 1                       # 指向上一行的 '\n'
        start = src.rindex('\n', 0, end) + 1 if end > 0 else 0
        if src[start:end].strip():
            prev_start, prev_end = start, end
            break
        probe = start

    insert_at = line_start
    if prev_start is not None:
        prev_line = src[prev_start:prev_end]
        stripped = prev_line.rstrip()
        if stripped and not stripped.endswith((',', '{', '(', '[')):
            # 只把逗号补在行尾，src[prev_end:] 从 '\n' 开始，换行完整保留
            src = src[:prev_start] + stripped + ',' + src[prev_end:]
            insert_at += (len(stripped) + 1) - len(prev_line)

    block_txt = ''.join(f'{ind}{k}: {js_str(v)},\n' for k, v in entries)
    return src[:insert_at] + block_txt + src[insert_at:], len(entries)


def js_str(v):
    """单引号 JS 字符串（内容里的单引号转义）。"""
    return "'" + str(v).replace('\\', '\\\\').replace("'", "\\'") + "'"


def main():
    print('=' * 74)
    print('补 / 归一 chrome i18n 键' + ('   [DRY RUN]' if DRY else ''))
    print('=' * 74)

    for page, table in PAGES.items():
        f = ROOT / 'js' / f'{page}.js'
        if not f.exists():
            log(page, f'!! 文件不存在 {f}')
            continue
        src0 = f.read_text(encoding='utf-8')
        src = src0

        # ── ① 键名归一 ──
        for old, new in RENAMES.get(page, []):
            n = len(re.findall(r'(?m)^([ \t]+)' + re.escape(old) + r'\s*:',
                               src))
            if n == 0:
                log(page, f'改名 {old}→{new}: 未找到（可能已改过）')
                continue
            # ⚠️ 只改**键定义**（行首缩进 + key + 冒号），不碰同名的读取点
            src = re.sub(r'(?m)^([ \t]+)' + re.escape(old) + r'(\s*:)',
                         lambda m: m.group(1) + new + m.group(2), src)
            log(page, f'改名 {old}→{new}: {n} 处')

        blocks = find_lang_blocks(src, table)
        if not blocks:
            log(page, f'!! 找不到 {table} 的 en/zh 块')
            continue

        # ── ② 补键 ──
        todo = {}
        for lang, blk in blocks.items():
            missing = []
            for k, vals in NEW_KEYS.items():
                if not has_key(src, blk, k):
                    missing.append((k, vals[lang]))
            # hint
            if page in HINTS and not has_key(src, blk, 'hint'):
                missing.append(('hint', HINTS[page][lang]))
            todo[lang] = missing

        # ⚠️ 倒序处理：先插 zh（偏移在后）再插 en，避免偏移失准。
        #    同块内一次性插入所有缺失键，不做多次切片。
        order = sorted(todo.keys(), key=lambda l: -blocks[l][0])
        for lang in order:
            missing = todo[lang]
            if not missing:
                continue
            src, n = add_keys(src, find_lang_blocks(src, table)[lang], missing)
            log(page, f'{lang}: 补 {n} 键 ({", ".join(k for k, _ in missing)})')

        # ── ③ 读不到新键的兜底：hint 的读取点不改（各页自己写 element）──
        if src != src0:
            if DRY:
                log(page, '→ 有改动（DRY，未写盘）')
            else:
                f.write_text(src, encoding='utf-8')
                log(page, '→ 已写盘')
        else:
            log(page, '→ 无改动')

    print('\n'.join(report))
    print('=' * 74)


if __name__ == '__main__':
    main()
