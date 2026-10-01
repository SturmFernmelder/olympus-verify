"""Runs the REAL SQL from src/unverified.ts, src/roster.ts and migrations/2026-09-25-first-seen.sql against
schema.sql in SQLite (D1's engine). Usage: python tests/unverified_sql_test.py   (from the worker folder)"""
import re, sqlite3, pathlib, datetime, sys
root = pathlib.Path(__file__).resolve().parent.parent
ts_src = (root / "src/unverified.ts").read_text(encoding="utf-8")
COUNTS = re.search(r'const COUNTS_AS_VERIFIED = "([^"]+)"', ts_src).group(1)
tpls = [t for t in re.findall(r"`([^`]*)`", ts_src) if "SELECT" in t]
ranks_tpl, members_tpl = tpls[0], tpls[1]
def render(tpl, with_fs):
    tpl = tpl.replace("${COUNTS_AS_VERIFIED}", COUNTS)
    out = re.sub(r'\$\{withFirstSeen \? "([^"]*)" : "([^"]*)"\}', lambda m: m.group(1) if with_fs else m.group(2), tpl)
    assert "${" not in out, "unrendered interpolation left in: " + out
    return out

D = lambda *a: int(datetime.datetime(*a, tzinfo=datetime.timezone.utc).timestamp())
db = sqlite3.connect(":memory:"); db.execute("PRAGMA foreign_keys = ON")
schema = (root / "schema.sql").read_text(encoding="utf-8")
db.executescript(schema.replace("CREATE TABLE IF NOT EXISTS roster_first_seen", "CREATE TABLE IF NOT EXISTS _unused_fs"))
for sid, t in ((1, D(2026,9,20)), (2, D(2026,9,23)), (3, D(2026,9,25,13))):
    db.execute("INSERT INTO roster_snapshots (id, exported_at, received_at, source, member_count) VALUES (?,?,?,?,?)", (sid, t, t, "addon", 0))
R = {"a": ("A", "Officer", 1), "b": ("B", "Initiate", 4), "c": ("C", "Member", 3), "d": ("D", "Initiate", 4), "e": ("E", "Veteran", 2)}
for sid, names in ((1, "abc"), (2, "abcd"), (3, "abcde")):
    for k in names:
        n, rank, ri = R[k]
        db.execute("INSERT INTO roster_members (snapshot_id, name_key, name, rank, rank_index, level) VALUES (?,?,?,?,?,?)", (sid, k, n, rank, ri, 10))
for did in ("u1", "u2", "u3"): db.execute("INSERT INTO members (discord_id) VALUES (?)", (did,))
db.execute("INSERT INTO characters (name_key,name,discord_id,status,bound_at) VALUES ('a','A','u1','member',1)")
db.execute("INSERT INTO characters (name_key,name,discord_id,status,bound_at) VALUES ('b','B','u2','unbound',1)")
db.execute("INSERT INTO characters (name_key,name,discord_id,status,bound_at) VALUES ('c','C','u3','left',1)")
NOW = D(2026,9,26,12)
db.execute("INSERT INTO pending (discord_id,name_key,name,created_at,expires_at) VALUES ('x','d','D',?,?)", (NOW-100, NOW+3600))
db.execute("INSERT INTO pending (discord_id,name_key,name,created_at,expires_at) VALUES ('y','e','E',?,?)", (NOW-99999, NOW-10))
results = []
def check(name, cond):
    results.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name)

try:
    db.execute(render(members_tpl, True), (3, NOW)).fetchall(); check("pre-migration query fails", False)
except sqlite3.OperationalError as e:
    check(f"before the migration: fails with 'no such table', which the fallback matches [{e}]", re.search("no such table", str(e), re.I))
rows = db.execute(render(members_tpl, False), (3, NOW)).fetchall()
check("fallback still lists the unverified, with no first-seen (so nobody is offered)", [r[0] for r in rows] == ["B", "D", "E"] and all(r[5] is None for r in rows))

mig = (root / "migrations/2026-09-25-first-seen.sql").read_text(encoding="utf-8")
db.executescript(mig)
fs = dict(db.execute("SELECT name_key, first_seen FROM roster_first_seen").fetchall())
check("backfill: first_seen = earliest snapshot per name", fs == {"a": D(2026,9,20), "b": D(2026,9,20), "c": D(2026,9,20), "d": D(2026,9,23), "e": D(2026,9,25,13)})
db.executescript(mig)
check("migration is idempotent (safe to run twice)", dict(db.execute("SELECT name_key, first_seen FROM roster_first_seen").fetchall()) == fs)

rows = db.execute(render(members_tpl, True), (3, NOW)).fetchall()
check("unverified = B (unbound), D, E; A (member) and C ('left' still verified) excluded", [r[0] for r in rows] == ["B", "D", "E"])
check("order: lowest rank first, then name", [r[2] for r in rows] == [4, 4, 2])
check("pending: D holds a live code; E's code expired", {r[0]: r[6] for r in rows} == {"B": 0, "D": 1, "E": 0})
rk = {r[0]: (r[2], r[3]) for r in db.execute(render(ranks_tpl, True), (3,)).fetchall()}
check(f"rank counts (total, unverified) {rk}", rk == {"Officer": (1, 0), "Veteran": (1, 1), "Member": (1, 0), "Initiate": (2, 2)})

OPEN, GRACE = D(2026,9,25), 3
elig = {r[0]: max(r[5], OPEN) + GRACE * 86400 for r in rows}
check("launch-day member B: grace runs from the fix (25 Sep), not from joining (20 Sep) -> 28 Sep", elig["B"] == D(2026,9,28))
check("E, first seen after the fix: grace runs from first seen -> 28 Sep 13:00", elig["E"] == D(2026,9,28,13))
check("on 26 Sep nobody is removable yet", all(e > NOW for e in elig.values()))

up = re.search(r'"(INSERT OR IGNORE INTO roster_first_seen[^"]+)"', (root / "src/roster.ts").read_text(encoding="utf-8")).group(1)
db.execute("INSERT INTO roster_snapshots (id, exported_at, received_at, source, member_count) VALUES (4, ?, ?, 'addon', 0)", (NOW, NOW))
for k, n in (("a", "A"), ("f", "F")):
    db.execute("INSERT INTO roster_members (snapshot_id, name_key, name, rank, rank_index) VALUES (4,?,?,'Initiate',4)", (k, n))
db.execute(up, (4, NOW))
fs2 = dict(db.execute("SELECT name_key, first_seen FROM roster_first_seen").fetchall())
check("ingest upkeep: new name F gets this export's time; A keeps its original", fs2["f"] == NOW and fs2["a"] == D(2026,9,20))
print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
