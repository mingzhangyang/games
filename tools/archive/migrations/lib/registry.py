# -*- coding: utf-8 -*-
"""games.config.json 读取器（Python 侧唯一入口）。

迁移脚本（apply-*.py）从这里拿页面清单，禁止再各自维护字符串数组。
用法：
    from lib.registry import REGISTRY
    REGISTRY.all()                     # 全部游戏（按配置顺序）
    REGISTRY.with_cap('drawer')        # 具备某能力的游戏
    REGISTRY.by_id('sword-flight')     # 单个，找不到抛 KeyError
"""
import json
import os
import sys

_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
_CONFIG = os.path.join(_ROOT, 'games.config.json')
_cache = None


def _load():
    global _cache
    if _cache is None:
        with open(_CONFIG, 'r', encoding='utf-8') as f:
            _cache = json.load(f)
    return _cache


class _Registry:
    @staticmethod
    def all():
        return _load()['games']

    @staticmethod
    def with_cap(cap):
        return [g for g in _load()['games'] if cap in (g.get('caps') or [])]

    @staticmethod
    def by_id(game_id):
        for g in _load()['games']:
            if g['id'] == game_id:
                return g
        raise KeyError('games.config.json 里没有 id="%s"' % game_id)

    @staticmethod
    def site():
        return _load()['site']

    @staticmethod
    def hrefs():
        return [g['href'] for g in _load()['games']]

    @staticmethod
    def i18n_var(game):
        """i18n 表变量名：注册表里写了就用写的，没写默认 LANGUAGES。"""
        return game.get('i18nVar', 'LANGUAGES')

    @staticmethod
    def report_coverage(cap, covered, label='手工表', checker=''):
        """一次性迁移器专用：陈旧条目硬失败，未覆盖的新页只提示。

        与 assert_covered 的分工：
          - 校验器的表 = 真·覆盖面，漏页必须红 → assert_covered
          - 迁移器的表 = 历史迁移的参数，新页是直接照契约写的（不需要被迁移），
            硬拦会逼人往一次性脚本里补永远不会执行的条目 → 本函数只打印提示。
        但表里出现注册表已经没有的页（改名/下架/拼错），任何时候都是错。
        """
        want = [g['id'] for g in _Registry.with_cap(cap)]
        stale = [i for i in covered if i not in want]
        if stale:
            sys.exit('%s 里有注册表中不存在的条目（或已摘掉 caps:%s）: %s'
                     % (label, cap, ', '.join(stale)))
        uncovered = [i for i in want if i not in covered]
        if uncovered:
            print('  提示：%s 未覆盖 %s —— 这些页是按契约直接写的，无需迁移；'
                  '它们的守卫是 %s' % (label, ', '.join(uncovered), checker or '对应校验器'))
        return uncovered

    @staticmethod
    def assert_covered(cap, covered, exempt=(), label='手工表'):
        """断言挂着某 cap 的页面都被调用方的手工表覆盖，漏了直接退出。

        迁移参数（顶栏选择器顺序、--frame-* 值、字面替换片段）不该进注册表，
        但手工表漏页时脚本只会「什么都不做」而不报错 —— 新游戏于是悄悄
        没被迁移。漏了必须红。
        """
        want = [g['id'] for g in _Registry.with_cap(cap)]
        missing = [i for i in want if i not in covered and i not in exempt]
        stale = [i for i in covered if i not in want]
        ghost = [i for i in exempt if i not in want]
        problems = []
        if missing:
            problems.append('缺条目: %s —— 这些页挂了 caps:%s，%s 里却没有，会被静默跳过'
                            % (', '.join(missing), cap, label))
        if stale:
            problems.append('多余条目: %s —— 不在 caps:%s 名单里（页面被删/cap 被摘/拼错）'
                            % (', '.join(stale), cap))
        if ghost:
            problems.append('豁免已失效: %s —— 不在 caps:%s 名单里，豁免可以删了'
                            % (', '.join(ghost), cap))
        if problems:
            sys.exit('%s 与注册表 caps:%s 不一致：\n  - %s'
                     % (label, cap, '\n  - '.join(problems)))
        return [i for i in want if i not in exempt]


REGISTRY = _Registry

if __name__ == '__main__':
    cap = sys.argv[1] if len(sys.argv) > 1 else None
    games = REGISTRY.with_cap(cap) if cap else REGISTRY.all()
    print('\n'.join(g['id'] for g in games))
