# -*- coding: utf-8 -*-
"""js/i18n.js 的 COMMON_TEXT 键集合 —— i18n 迁移脚本的唯一判据。

背景：P2 把 sound / language / moreGames / close / copied / usernameLabel 六个键
收进 COMMON_TEXT，各页经 makeText 的原型链兜底，页面里**不许**再留字面量副本
（`scripts/verify-i18n.mjs` 对此有硬断言）。而两个 i18n 迁移脚本仍按收敛前的
清单往每页插键 —— 一旦真跑，12 个页面会同时长回公共键副本，校验器立刻红。

所以「哪些键是公共的」必须从 js/i18n.js 现读，不能在脚本里再抄一份。
"""
import pathlib
import re

_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
_I18N = _ROOT / 'js' / 'i18n.js'


def common_keys():
    """返回 COMMON_TEXT 的键名集合（以 en 块为准，zh 块必须同构）。"""
    src = _I18N.read_text(encoding='utf-8')
    m = re.search(r'export const COMMON_TEXT = \{\s*\n\s*en:\s*\{(.*?)\n\s*\},', src, re.S)
    if not m:
        raise SystemExit('lib/i18n_common: 解析不了 js/i18n.js 的 COMMON_TEXT.en 块')
    keys = set(re.findall(r'^\s*(\w+)\s*:', m.group(1), re.M))
    if not keys:
        raise SystemExit('lib/i18n_common: COMMON_TEXT.en 里一个键都没解析到')
    return keys


def drop_common(mapping, label):
    """从待插入的键表里剔掉公共键，返回 (保留下来的表, 说明行)。"""
    common = common_keys()
    kept = {k: v for k, v in mapping.items() if k not in common}
    dropped = sorted(set(mapping) - set(kept))
    note = ('%s: 跳过公共键 %s（由 js/i18n.js 的 COMMON_TEXT 经原型链兜底，'
            '页面不得留副本）' % (label, ', '.join(dropped))) if dropped else ''
    return kept, note


if __name__ == '__main__':
    print(' '.join(sorted(common_keys())))
