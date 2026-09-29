#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给 6 个页面的 i18n 表补上 `stats` / `close` 两个键（幂等）。

两种表形态：
  A. 模块级 `const I18N = { zh: {...}, en: {...} }`   —— needle-awn, sword-flight
  B. 模块级 `const TEXT = { en: {...}, zh: {...} }`   —— planet-merge, hoop-shot,
                                                        tower-defense, gravity-slingshot
     后四者的表变量名需要探测（有的就叫 TEXT，有的挂在类上）。

策略：定位每个语言块的**第一个键**那行，紧接着插入两个新键（保持缩进一致）。
"""
import re
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lib.registry import REGISTRY  # noqa: E402
from lib.i18n_common import common_keys  # noqa: E402

DRY = '--dry' in sys.argv
ROOT = pathlib.Path(__file__).resolve().parent.parent

# 页面清单 + 表变量名来自注册表（drawer cap；表名取 i18nVar，缺省 LANGUAGES）。
#   注：LANGUAGES 页面（pm/hs/td/gd）里 `this.TEXT` 只是指向该表的类属性别名，
#   真正声明在模块级 `const LANGUAGES = {...}`。别照 "TEXT" 去找，找不到。
# 语言块顺序不进注册表 —— 它是源文件的事实，直接从源码探测（见 detect_order）。
# tetris 豁免，理由同 apply-stats-drawer.py。
PAGES = [(g['id'], REGISTRY.i18n_var(g))
         for g in REGISTRY.with_cap('drawer') if g['id'] != 'tetris']

ZH = ('stats', '数据统计')
EN = ('stats', 'Stats')
ZH_CLOSE = ('close', '关闭')
EN_CLOSE = ('close', 'Close')
# close 在 P2 归入 COMMON_TEXT，各页经原型链兜底；再往页面插一份副本会被
# verify-i18n 的「无公共键字面量副本」判红。判据从 js/i18n.js 现读，别写死。
INJECT_CLOSE = 'close' not in common_keys()


def find_table_start(src, name):
    """找 `const <name> = {` 的起始下标。

    ⚠️ P2 的 i18n 收敛把所有语言表包进了 `makeText({...})`，源码从
    `const LANGUAGES = {` 变成 `const LANGUAGES = makeText({`。本函数的正则
    当时没跟着改，于是**每一页都匹配不上**，inject() 一路返回「!! 找不到表」，
    脚本打完报告以 0 退出 —— 整个迁移器静默空转了一整轮。两种形态都要认。
    """
    m = re.search(r'\bconst\s+' + re.escape(name) + r'\s*=\s*(?:makeText\()?\{', src)
    return m


def find_lang_block(src, start, lang):
    """在表起始之后，找 `lang: {` 并返回块内第一行内容键的插入点。

    返回 (block_start, first_key_line_start, indent)。
    """
    m = re.search(r'\n([ \t]*)' + re.escape(lang) + r':\s*\{\n', src[start:])
    if not m:
        return None
    block_open_end = start + m.end()
    # 块内第一个非空行
    rest = src[block_open_end:]
    km = re.search(r'^([ \t]*)(\S)', rest, re.M)
    if not km:
        return None
    indent = km.group(1)
    return (block_open_end + km.start(), indent)


def dedupe(src, name, lang, key):
    """删掉同一语言块里重复的 `key:` 行，只保留第一条（幂等修复）。

    起因：早期版本的 `main()` 只 inject 了 stats、漏了 close，随后又补了一次，
    于是在块首叠出两行同名键（`close: '关闭',` ×2）。对象字面量里后写的覆盖先写的，
    不会报错，但一眼看去像"改了两次"，也让后续判重更难读。这里主动收口。

    ⚠️ 实现上有两个坑，前一版踩满并且**改坏了 6 个文件**，务必保持现在的写法：
      1. 绝不能在遍历 hits 时原地切片 `block` —— `finditer` 给出的偏移是相对
         **原始** block 的，删掉第一段之后后面所有偏移全部错位，于是切掉的不是
         那一行而是随机字符片段（当时把 `'开始新的每日挑战？…'` 从中间劈开）。
      2. 删除必须在**整份 src** 上按「从后往前」依次做，且每次重算 —— 这样前一段的
         删除不会影响尚未处理的、更靠前那段的偏移。
    实现方式：把所有命中行的绝对 (start, end) 收集起来，倒序删除，最后一次性写回。
    """
    ts = find_table_start(src, name)
    if not ts:
        return src, 0
    found = find_lang_block(src, ts.end(), lang)
    if not found:
        return src, 0
    pos, _ = found

    # 圈定该语言块的范围：从块首到「下一个语言键」或「表结束」为止。
    # 注意结尾 `\n}` 也可能属于内层结构，所以只认「缩进不超过语言键缩进」的 `}`。
    tail = src[pos:]
    endm = re.search(r'\n[ \t]*(?:en|zh)\s*:\s*\{|\n[ \t]*\}[;,][ \t]*\n', tail)
    block_end = pos + (endm.start() + 1 if endm else len(tail))
    block = src[pos:block_end]

    pat = re.compile(r'^[ \t]*' + re.escape(key) + r":.*\n", re.M)
    hits = [(pos + h.start(), pos + h.end()) for h in pat.finditer(block)]
    if len(hits) <= 1:
        return src, 0

    # 从后往前删，先删的那个不会影响更靠前的偏移
    out = src
    for s, e in reversed(hits[1:]):
        out = out[:s] + out[e:]
    return out, len(hits) - 1


def inject(src, name, lang, key, value):
    """在指定语言的块首插入一个键。"""
    ts = find_table_start(src, name)
    if not ts:
        return src, f'!! 找不到 {name} 表'
    found = find_lang_block(src, ts.end(), lang)
    if not found:
        return src, f'!! 找不到 {lang} 块'
    pos, indent = found
    # 判重：块内是否已有该键（只看块的前 40 行，够用且便宜）
    #
    # ⚠️ 前导 `\n` 不能省，但 `pos` 正好指向**第一个键自身的缩进**，
    # 所以 `src[pos:]` 是以 `close:` 开头的、前面没有换行 —— 用 `\n[ \t]*key:`
    # 去匹配这一段永远是 False，于是"已存在"判不出来，每跑一次就多插一行。
    # 正确做法：从 `pos - 1`（即该键前的那个 `\n`）开始取预览。
    block_preview = src[max(0, pos - 1):pos + 4000]
    if re.search(r'\n[ \t]*' + re.escape(key) + r':', block_preview):
        return src, f'{lang}.{key} 已存在（跳过）'
    line = f"{indent}{key}: '{value}',\n"
    return src[:pos] + line + src[pos:], f'{lang}.{key} 已插入'


def detect_order(src, name):
    """从源码判断语言块谁在前 —— 这是文件的事实，不该另存一份清单。

    找不到表（页面改了表名而注册表没跟上）直接报错，不要猜。
    """
    m = find_table_start(src, name)
    if not m:
        raise SystemExit(f'找不到 const {name} = {{ —— 注册表的 i18nVar 与源码不符？')
    rest = src[m.end():]
    ien = rest.find('\n    en: {')
    izh = rest.find('\n    zh: {')
    if ien < 0 or izh < 0:   # 缩进不是 4 空格时退回宽松匹配
        ien = re.search(r'\n\s*en:\s*\{', rest)
        izh = re.search(r'\n\s*zh:\s*\{', rest)
        if not ien or not izh:
            raise SystemExit(f'{name} 里找不到 en/zh 两个语言块')
        ien, izh = ien.start(), izh.start()
    return 'en-first' if ien < izh else 'zh-first'


def main():
    for page, name in PAGES:
        f = ROOT / f'js/{page}.js'
        src0 = f.read_text(encoding='utf-8')
        order = detect_order(src0, name)
        src = src0
        msgs = []
        for lang, (k, v), (ck, cv) in (
            ('en', EN, EN_CLOSE) if order == 'en-first' else ('zh', ZH, ZH_CLOSE),) + (
            ('zh', ZH, ZH_CLOSE) if order == 'en-first' else ('en', EN, EN_CLOSE),):
            # ⚠️ 两个键都要插！早期版本只 inject 了 (k, v)，(ck, cv) 解包后从未使用，
            # 于是 close 永远没写进表里，抽屉关闭钮只剩 fallback 的英文 'Close'。
            src, m1 = inject(src, name, lang, k, v)
            msgs.append(m1)
            if INJECT_CLOSE:
                src, m2 = inject(src, name, lang, ck, cv)
                msgs.append(m2)
            # 收口早期 bug 叠出的重复键
            src, n = dedupe(src, name, lang, k)
            if n:
                msgs.append(f'清理 {lang}.{k} 重复 {n} 行')
            if INJECT_CLOSE:
                src, n = dedupe(src, name, lang, ck)
                if n:
                    msgs.append(f'清理 {lang}.{ck} 重复 {n} 行')
        if src != src0:
            if DRY:
                msgs.append('→ 有改动（DRY）')
            else:
                f.write_text(src, encoding='utf-8')
                msgs.append('→ 已写盘')
        print(f'  [{page}] ' + '; '.join(msgs))


if __name__ == '__main__':
    print('=' * 72)
    print('补 stats/close i18n 键' + ('  [DRY]' if DRY else ''))
    print('=' * 72)
    if not INJECT_CLOSE:
        print('  close 已归 COMMON_TEXT（js/i18n.js），本轮只补 stats')
    main()
