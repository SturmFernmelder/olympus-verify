"""Runs the REAL SQL from src/backfill.ts against schema.sql in SQLite (D1's engine).
Usage: python tests/backfill_sql_test.py   (from the worker folder)"""
import json, re, sqlite3, pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / "src/backfill.ts").read_text(encoding="utf-8")
calls = re.findall(r'env\.DB\.prepare\(\s*((?:"[^"]*"\s*\+?\s*)+),?\s*\)', src)
sqls = ["".join(re.findall(r'"([^"]*)"', c)) for c in calls]
count_sql = next(s for s in sqls if "COUNT(DISTINCT" in s)
# Extract both literal branches of the actual source-selected prefix and its shared tail.
# This closed extractor never evaluates TypeScript or supplies an invented SQL statement.
def page_queries(source):
    literal = r'"(?:[^"\\]|\\.)*"'
    pattern = (r'env\.DB\.prepare\(\s*\(membershipTransitionEnabled\(env\)\?\s*('
               + literal + r')\s*:\s*(' + literal + r')\)\s*\+\s*('
               + r'(?:' + literal + r'\s*(?:\+\s*)?)+)\s*,?\s*\)')
    matches = list(re.finditer(pattern, source))
    if len(matches) != 1:
        raise ValueError("expected exactly one source-selected backfill page query")
    match = matches[0]
    tail = "".join(json.loads(v) for v in re.findall(literal, match.group(3)))
    return json.loads(match.group(1)) + tail, json.loads(match.group(2)) + tail

page_sql_on, page_sql = page_queries(src)

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
# The original five controls above continue to exercise the exact OFF query unchanged.
# Run the same ownership/paging controls against the real ON branch before adding subjects.
check("ON page from the start: u1 and u4, in id order", [r[0] for r in db.execute(page_sql_on, ("", 25))] == ["u1", "u4"])
check("ON page after u1: u4 only", [r[0] for r in db.execute(page_sql_on, ("u1", 25))] == ["u4"])
check("ON limit is honoured", [r[0] for r in db.execute(page_sql_on, ("", 1))] == ["u1"])
check("ON banned member is never offered", "u2" not in [r[0] for r in db.execute(page_sql_on, ("", 25))])
check("ON absent original generation is captured as NULL", list(db.execute(page_sql_on, ("", 25))) == [("u1", None, None, None), ("u4", None, None, None)])

# Use the actual canonical privacy_subjects DDL, with valid synthetic IDs/generations.
# A retiring row is captured, not hidden by this query: the actual caller refuses it.
active, retiring, absent = "11111111111111111", "22222222222222222", "33333333333333333"
for did in (active, retiring, absent):
    db.execute("INSERT INTO members(discord_id,banned) VALUES (?,0)", (did,))
    db.execute("INSERT INTO characters(name_key,name,discord_id,status,bound_at) VALUES (?,?,?,'member',1)", (did, did, did))
for did, gen, state, rev in ((active, "a"*32, "active", 7), (retiring, "b"*32, "retiring", 8)):
    db.execute("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at) VALUES (?,?,?,?,1,1)", (did, gen, state, rev))
captured = {r[0]: r for r in db.execute(page_sql_on, ("", 25))}
check("ON active captures the selected subject generation/state/revision", captured[active] == (active, "a"*32, "active", 7))
check("ON retiring captures held state for caller refusal", captured[retiring] == (retiring, "b"*32, "retiring", 8))
check("ON accountless capture stays absence despite other subject rows", captured[absent] == (absent, None, None, None))
check("OFF projection remains Discord ID only", all(len(r) == 1 for r in db.execute(page_sql, ("", 25))))
db.execute("UPDATE privacy_subjects SET generation=?,revision=revision+1 WHERE subject_id=?", ("c"*32, active))
check("selected original capture does not turn into a later generation", captured[active] == (active, "a"*32, "active", 7) and {r[0]:r for r in db.execute(page_sql_on, ("",25))}[active] == (active, "c"*32, "active", 8))
for label, damaged in (("missing selector", src.replace("membershipTransitionEnabled(env)", "unsupportedSelector(env)")), ("duplicate page query", src+"\n"+src)):
    try:
        page_queries(damaged)
    except ValueError:
        check("closed source extraction refuses " + label, True)
    else:
        check("closed source extraction refuses " + label, False)

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
