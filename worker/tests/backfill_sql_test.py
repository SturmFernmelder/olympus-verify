"""Runs the REAL SQL from src/backfill.ts against schema.sql in SQLite (D1's engine).
Usage: python tests/backfill_sql_test.py   (from the worker folder)"""
import re, sqlite3, pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / "src/backfill.ts").read_text(encoding="utf-8")
calls = re.findall(r'env\.DB\.prepare\(\s*((?:"[^"]*"\s*\+?\s*)+),?\s*\)', src)
sqls = ["".join(re.findall(r'"([^"]*)"', c)) for c in calls]
count_sql = next(s for s in sqls if "COUNT(DISTINCT" in s)
page_sql = next(s for s in sqls if s.startswith("SELECT DISTINCT"))

db = sqlite3.connect(":memory:"); db.execute("PRAGMA foreign_keys = ON")
db.executescript((root / "schema.sql").read_text(encoding="utf-8"))
# u1 member; u2 member but banned; u3 left; u4 member with two characters; u5 unbound
for did, banned in (("u1", 0), ("u2", 1), ("u3", 0), ("u4", 0), ("u5", 0)):
    db.execute("INSERT INTO members (discord_id, banned) VALUES (?, ?)", (did, banned))
# SQLite lets a TEXT PRIMARY KEY hold NULL. With NOT IN, one such banned row would empty every result.
db.execute("INSERT INTO members (discord_id, banned) VALUES (NULL, 1)")
rows = [("a", "u1", "member"), ("b", "u2", "member"), ("c", "u3", "left"), ("d1", "u4", "member"), ("d2", "u4", "member"), ("e", "u5", "unbound")]
for key, did, st in rows:
    db.execute("INSERT INTO characters (name_key, name, discord_id, status, bound_at) VALUES (?,?,?,?,1)", (key, key.upper(), did, st))

results = []
def check(name, cond):
    results.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name)

check("count: members only, banned left out, one per account", db.execute(count_sql).fetchone()[0] == 2)
check("page from the start: u1 and u4, in id order", [r[0] for r in db.execute(page_sql, ("", 25))] == ["u1", "u4"])
check("page after u1: u4 only", [r[0] for r in db.execute(page_sql, ("u1", 25))] == ["u4"])
check("limit is honoured", [r[0] for r in db.execute(page_sql, ("", 1))] == ["u1"])
check("the banned member is never offered", "u2" not in [r[0] for r in db.execute(page_sql, ("", 25))])
print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
