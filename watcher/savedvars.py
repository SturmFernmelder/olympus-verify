"""Parser for WoW SavedVariables files (the Lua subset the client writes).

    OlympusVerifyDB = {
        ["events"] = { { ["ts"] = 1789650000, ["type"] = "whisper", ["name"] = "Thrall", ["ok"] = true, }, -- [1]
        },
        ["roster"] = { ["exportedAt"] = 1789650000, ["members"] = { ... } },
    }

Tables with only positional entries become lists; everything else becomes dicts. Strings keep WoW's escapes
decoded (\\n, \\", \\\\, \\ddd). Only literals are accepted — no expressions, no function calls — so a tampered file
cannot execute anything here.
"""
from __future__ import annotations

import re
from typing import Any

_TOKEN = re.compile(
    r"""
    (?P<ws>\s+)
  | (?P<comment>--[^\n]*)
  | (?P<longstr>\[(?P<eq>=*)\[.*?\](?P=eq)\])
  | (?P<str>"(?:\\.|[^"\\])*")
  | (?P<num>-?(?:0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?))
  | (?P<name>[A-Za-z_][A-Za-z0-9_]*)
  | (?P<punct>[{}\[\]=,;])
    """,
    re.VERBOSE | re.DOTALL,
)

_ESC = {"n": "\n", "t": "\t", "r": "\r", "\\": "\\", '"': '"', "'": "'", "a": "\a", "b": "\b", "f": "\f", "v": "\v"}


def _unescape(s: str) -> str:
    out = []
    i = 0
    while i < len(s):
        c = s[i]
        if c == "\\" and i + 1 < len(s):
            n = s[i + 1]
            if n.isdigit():
                j = i + 1
                while j < len(s) and j < i + 4 and s[j].isdigit():
                    j += 1
                out.append(chr(int(s[i + 1 : j])))
                i = j
                continue
            out.append(_ESC.get(n, n))
            i += 2
            continue
        out.append(c)
        i += 1
    return "".join(out)


class _Parser:
    def __init__(self, text: str):
        self.toks: list[tuple[str, str]] = []
        pos = 0
        while pos < len(text):
            m = _TOKEN.match(text, pos)
            if not m:
                raise ValueError(f"unexpected character at {pos}: {text[pos:pos+20]!r}")
            pos = m.end()
            kind = m.lastgroup
            if kind in ("ws", "comment"):
                continue
            if kind == "longstr":
                inner = m.group("longstr")
                eq = m.group("eq")
                self.toks.append(("str", inner[len(eq) + 2 : -(len(eq) + 2)]))
            elif kind == "str":
                self.toks.append(("str", _unescape(m.group("str")[1:-1])))
            elif kind == "eq":
                continue
            else:
                self.toks.append((kind, m.group(kind)))
        self.i = 0

    def peek(self) -> tuple[str, str]:
        return self.toks[self.i] if self.i < len(self.toks) else ("eof", "")

    def take(self, kind: str | None = None, val: str | None = None) -> tuple[str, str]:
        t = self.peek()
        if (kind and t[0] != kind) or (val is not None and t[1] != val):
            raise ValueError(f"expected {kind or ''} {val or ''} got {t}")
        self.i += 1
        return t

    def file(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        while self.peek()[0] != "eof":
            name = self.take("name")[1]
            self.take("punct", "=")
            out[name] = self.value()
        return out

    def value(self) -> Any:
        kind, val = self.peek()
        if kind == "punct" and val == "{":
            return self.table()
        self.i += 1
        if kind == "str":
            return val
        if kind == "num":
            v = int(val, 16) if val.lower().startswith(("0x", "-0x")) else float(val)
            return int(v) if isinstance(v, float) and v.is_integer() and "e" not in val.lower() else v
        if kind == "name":
            if val == "true":
                return True
            if val == "false":
                return False
            if val == "nil":
                return None
        raise ValueError(f"unexpected token {kind} {val!r}")

    def table(self) -> Any:
        self.take("punct", "{")
        items: dict[Any, Any] = {}
        positional: list[Any] = []
        n = 0
        while True:
            kind, val = self.peek()
            if kind == "punct" and val == "}":
                self.i += 1
                break
            if kind == "punct" and val == "[":
                self.i += 1
                key = self.value()
                self.take("punct", "]")
                self.take("punct", "=")
                items[key] = self.value()
            elif kind == "name" and self.i + 1 < len(self.toks) and self.toks[self.i + 1] == ("punct", "="):
                self.i += 1
                self.take("punct", "=")
                items[val] = self.value()
            else:
                n += 1
                positional.append(self.value())
                items[n] = positional[-1]
            kind, val = self.peek()
            if kind == "punct" and val in (",", ";"):
                self.i += 1
        if items and all(isinstance(k, int) for k in items) and sorted(items) == list(range(1, len(items) + 1)):
            return [items[k] for k in range(1, len(items) + 1)]
        return items


def parse(text: str) -> dict[str, Any]:
    """Parse a SavedVariables file body into {globalName: value}."""
    return _Parser(text).file()


def parse_file(path: str) -> dict[str, Any]:
    with open(path, encoding="utf-8", errors="replace") as f:
        return parse(f.read())
