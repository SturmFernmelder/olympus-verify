"""Rank observations are preserved in original roster custody, never inferred."""
from __future__ import annotations
from typing import Any
from native_rank_schemes import NAMES

def observation(value: Any) -> dict[str, Any] | bool:
    try:
        if (type(value) is not dict or set(value) != {'version', 'names'}
                or type(value.get('version')) is not int or value['version'] != 1
                or type(value.get('names')) is not list or len(value['names']) != 10
                or any(type(n) is not str or not n or len(n.encode('utf-8')) > 96
                       or any(ord(c) < 32 or ord(c) == 127 for c in n) for n in value['names'])
                or len(set(value['names'])) != 10):
            return False
        return {'version': 1, 'names': value['names'][:]}
    except (ValueError, TypeError, UnicodeError):
        return False

def qualified(value: Any) -> bool:
    table = observation(value)
    return bool(table and tuple(table['names']) == NAMES)
