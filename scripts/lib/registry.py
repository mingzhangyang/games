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


REGISTRY = _Registry

if __name__ == '__main__':
    cap = sys.argv[1] if len(sys.argv) > 1 else None
    games = REGISTRY.with_cap(cap) if cap else REGISTRY.all()
    print('\n'.join(g['id'] for g in games))
