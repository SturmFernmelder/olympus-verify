"""Read-only officer view of the Watcher's two generated Initiate projections."""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime
import hashlib
from pathlib import Path
import re
import time
import unicodedata

import launch_operations229 as launch
import savedvars_source280


DISPLAY = "OlympusVerifyLists"
CHECKS = "OlympusInitiateChecks"
REVIEW, CHECKING, WAITING, HELD, STALE = "Review in WoW", "Checking", "Awaiting eligibility", "Held", "Stale"
VERIFIED_MEMBERS = "Verified members"
GUID = re.compile(r"Player-[0-9]{1,6}-[0-9a-fA-F]{4,16}")
CONTROL = re.compile(r"([0-9]{9,11}):[0-9]{1,10}")


def items(value, limit):
    if value == {}:  # Lua serializes an empty array and an empty table identically.
        return []
    if type(value) is not list or len(value) > limit:
        raise ValueError
    return value


def string(value, limit):
    if (type(value) is not str or not 0 < len(value) <= limit
            or any(unicodedata.category(c) in {"Cc", "Cf", "Cs"} for c in value)):
        raise ValueError
    return value


def timestamp(value):
    if type(value) is not int or not 0 < value <= 2147483647:
        raise ValueError
    return value


@dataclass(frozen=True)
class Row:
    name: str
    discord: str
    state: str
    target: str = ""
    checked: int = 0


@dataclass(frozen=True)
class View:
    message: str
    rows: tuple[Row, ...] = ()
    snapshot: int = 0
    targets: int = 0
    completed: int = 0
    groups: int = 0
    realm: str = ""


def read_display(display):
    guild, realm = string(display["guild"], 128), string(display["realm"], 128)
    if display["version"] != 2 or launch.canonical_guild(guild) != "OLYMPUS PRIME":
        raise ValueError
    scope = hashlib.sha256(f"native-scope|1|{guild}|{realm}".encode()).hexdigest()[:16]
    verified, seen = {}, set()
    snapshot = timestamp(display["verified"]["snapshotAt"])
    fetched = timestamp(display["verified"]["fetchedAt"])
    if fetched < snapshot:
        raise ValueError
    for key in ("verified", "unverified", "unknown"):
        section = display[key]
        if section["snapshotAt"] != snapshot or section["fetchedAt"] != fetched:
            raise ValueError
        for person in items(section["members"], 1000):
            guid = string(person["guid"], 40)
            if not GUID.fullmatch(guid) or guid in seen or len(seen) >= 1000:
                raise ValueError
            seen.add(guid)
            if key == "verified":
                if person["status"] != "member":
                    raise ValueError
                name = string(person["name"], 100)
                handle = person.get("username")
                verified[guid] = (name, "@" + string(handle, 100) if handle else "")
    return guild, realm, scope, snapshot, fetched, verified


def completed_group(record, targets, guild, realm, snapshot, now):
    page = record["page"]
    scheme = launch.rank_scheme(page["rankProfile"], page["rankSchemeDigest"])
    fetched = timestamp(page["fetchedAt"])
    expiry = timestamp(page["expiresAt"])
    if (record["running"] is not False or record.get("stoppedReason") or record["coveredGuids"] != targets
            or page["guild"] != guild or page["realm"] != realm or page["canonicalGuild"] != "OLYMPUS PRIME"
            or page["scopeHash"] != record["scopeHash"] or page["snapshotId"] != record["snapshotId"]
            or page["snapshotAt"] != record["snapshotAt"] or page["protocol"] != launch.PROTOCOL
            or not scheme or page["rankNames"] != list(scheme["names"])
            or page["status"] not in ("ready", "partial") or page["entitlements"]["scanned"] != len(targets)
            or page["entitlements"].get("retryAfterSeconds") is not None
            or page["scan"]["expiresAt"] != record["expiresAt"] or page["scan"]["startedAt"] != record["observedAt"]
            or not record["snapshotAt"] <= fetched <= now or not fetched < expiry <= record["expiresAt"]
            or page["actions"] != {"automatic": False, "roleGrants": False, "removals": False, "requiresNativeRecheck": True}
            or any(type(flag) is not bool for flag in page["actions"].values())):
        raise ValueError
    recommendations, holds, identified = {}, {}, set()
    for key in ("held", "promotions"):
        for item in items(page[key], len(targets)):
            guid = item["guid"]
            if guid not in targets or guid in identified:
                raise ValueError
            identified.add(guid)
            if key == "held":
                holds[guid] = item["reason"]
            if key == "promotions":
                intent = item["intent"]
                if (item["currentSlot"] != scheme["initiate"] or intent["startSlot"] != scheme["initiate"]
                        or intent["acknowledgedSteps"] != 0
                        or intent["actorGuid"] != record["actorGuid"]
                        or (item["targetName"], item["reason"]) not in (("Member", "verified-initiate"), ("Veteran", "knight-veteran"))
                        or not launch._directive_intent(item, page, now, stale=True)):
                    raise ValueError
                recommendations[guid] = (item["name"], item["targetName"])
    fresh = snapshot == record["snapshotAt"] and now < expiry
    return recommendations, holds, fetched, fresh


def project(display, checks, now):
    """Join by GUID, exact native scope and source clock. Return only display fields."""
    try:
        return project_checks(read_display(display), checks, now)
    except (AttributeError, KeyError, IndexError, TypeError, ValueError, OverflowError):
        return View("The verification list is incomplete. Waiting for an update.")


def project_checks(source, checks, now):
    try:
        guild, realm, scope, snapshot, fetched, verified = source
        if fetched > now:
            raise ValueError
        if now >= snapshot + 600:
            return View("Roster expired. Waiting for a current verification list.", snapshot=snapshot, realm=realm)
        if not checks:
            return View("Waiting for the Watcher’s first Initiate check.", snapshot=snapshot, realm=realm)
        records = items(checks["records"], 50)
        if not records and checks.get("version") == 1 and not checks.get("id"):
            if checks.get("kind") == "no-native-initiates":
                if (set(checks) != {"version", "kind", "scopeHash", "snapshotId", "snapshotAt", "records"}
                        or type(checks["version"]) is not int or type(checks["snapshotId"]) is not int or checks["snapshotId"] < 1
                        or timestamp(checks["snapshotAt"]) != snapshot or checks["scopeHash"] != scope):
                    return View("Empty check is stale. Waiting for a matching roster.", snapshot=snapshot, realm=realm)
                return View("No native Initiates on the latest complete roster.", snapshot=snapshot, realm=realm)
            return View("Waiting for a complete Initiate check.", snapshot=snapshot, realm=realm)
        if checks["version"] != 1 or not records or checks["id"] != records[0]["controlId"]:
            raise ValueError
        rows, controls, covered = [], set(), set()
        actors, observed = set(), set()
        completed = 0
        for record in records:
            control = record["controlId"]
            match = CONTROL.fullmatch(control)
            issued = timestamp(record["observedAt"])
            targets = items(record["targetGuids"], 20)
            actor = record["actorGuid"]
            if (not match or int(match[1]) != issued or issued > now or control in controls or not GUID.fullmatch(actor)
                    or record["version"] != 2 or record["protocol"] != launch.DIRECTIVE_PROTOCOL
                    or record["scopeHash"] != scope or record["confirmations"] != "[]" or record["coverageKind"] != "selected-guids"
                    or not targets or any(not GUID.fullmatch(guid) for guid in targets) or actor in targets
                    or sorted(set(targets)) != targets or covered.intersection(targets)
                    or record["targetsDigest"] != launch.targets_digest276(targets)):
                raise ValueError
            covered.update(targets)
            controls.add(control)
            observed.add(issued)
            actors.add(actor)
            source = record.get("snapshotAt")
            if source is not None:
                source = timestamp(source)
                timestamp(record["snapshotId"])
                if record["expiresAt"] != min(issued, source) + 600 or source > now:
                    raise ValueError
            if len(actors) != 1 or len(observed) != 1:
                raise ValueError
            state, recommendations, holds, checked = HELD, {}, {}, 0
            if record["completed"] is True:
                recommendations, holds, checked, fresh = completed_group(record, targets, guild, realm, snapshot, now)
                state = HELD if fresh else STALE
                completed += 1
            elif record["completed"] is False and record["running"] is True and source is not None and not record.get("stoppedReason"):
                state = CHECKING
            elif record["completed"] is not False or record["running"] is not False or not record.get("stoppedReason"):
                raise ValueError
            if now >= issued + 600 or source is not None and (source != snapshot or now >= source + 600):
                state = STALE
            for guid in targets:
                member = verified.get(guid)
                if member is None or holds.get(guid) == "selected-rank-changed":
                    continue
                name, discord = member
                ready = recommendations.get(guid)
                if state == HELD and ready and ready[0] == name:
                    rows.append(Row(name, discord, REVIEW, ready[1], checked))
                elif state == HELD and checked and not ready and (guid not in holds or (
                        fetched > checked and holds[guid] in {"verification-unknown", "pending-verification", "unverified-initiate"})):
                    rows.append(Row(name, discord, WAITING, checked=checked))
                else:
                    rows.append(Row(name, discord, state, checked=checked))
        rows.sort(key=lambda r: r.name.casefold())
        return View("Each promotion requires a separate officer click in WoW.",
                    tuple(rows), snapshot, len(covered), completed, len(records), realm)
    except (AttributeError, KeyError, IndexError, TypeError, ValueError, OverflowError):
        return View("The Watcher files have different scopes or contain incomplete data. Waiting for an update.")


class Files:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.cached = {}

        self.display_receipts = {}  # Scope digest -> (snapshot, fetched, file digest). No member data.
        self.last_clock = 0

    def read(self, key):
        snap = savedvars_source280.read(self.directory / (key + ".lua"), self.cached.get(key))
        if set(snap.data) != {key}:
            raise ValueError
        self.cached[key] = snap
        return snap

    def get(self, now, *, verified_members=False):
        try:
            if now < self.last_clock:
                return View("The local clock moved backward. Waiting for the clock to catch up.")
            self.last_clock = now
            display = self.read(DISPLAY)
            source = read_display(display.data[DISPLAY])
            guild, realm, scope, snapshot, fetched, members = source
            if fetched > now:
                raise ValueError
            if verified_members and (guild != "OLYMPUS PRIME" or realm != launch.PRIME_REALM_LABEL):
                return View("Waiting for a current OLYMPUS PRIME verification list.")
            # Track observed redactions even when the separate promotion file is missing.
            # Neither a stale restore nor a same-second conflicting file may revive an identity.
            prior = self.display_receipts.get(scope)
            if prior and (snapshot < prior[0] or fetched < prior[1]):
                return View("An older verification list was restored. Waiting for a current Watcher update.")
            if prior and (snapshot, fetched) == prior[:2] and display.digest != prior[2]:
                self.display_receipts[scope] = (snapshot, fetched, None)
                return View("Conflicting verification lists have the same timestamps. Waiting for a newer Watcher update.")
            self.display_receipts[scope] = (snapshot, fetched, display.digest)
            if now >= snapshot + 600:
                return View("Roster expired. Waiting for a current verification list.", snapshot=snapshot, realm=realm)
            if verified_members:
                rows = tuple(sorted((Row(name, handle, "Verified", checked=fetched) for name, handle in members.values()),
                                    key=lambda row: row.name.casefold()))
                return View("A blank Discord handle is pending. Each promotion has its own eligibility check in WoW.",
                            rows, snapshot, realm=realm)
            return project_checks(source, self.read(CHECKS).data[CHECKS], now)
        except (AttributeError, KeyError, IndexError, OSError, TypeError, ValueError, OverflowError):
            self.cached.clear()
            return View("Waiting for the Watcher’s roster and Initiate check files.")


def filtered(rows, query, state):
    query = query.strip().casefold()
    return tuple(row for row in rows if (state == "All" or state == row.state)
                 and (query in row.name.casefold() or query in row.discord.casefold()))


def show(root, directory, clock=time.time):
    from tkinter import StringVar, ttk

    root.title("Olympus officer roster")
    root.minsize(660, 330)
    root.geometry("840x510")
    body = ttk.Frame(root, padding=12)
    body.pack(fill="both", expand=True)
    body.columnconfigure(0, weight=1)
    body.rowconfigure(2, weight=1)
    summary, message = StringVar(root), StringVar(root)
    ttk.Label(body, textvariable=summary).grid(row=0, column=0, sticky="w", pady=(0, 10))
    bar = ttk.Frame(body)
    bar.grid(row=1, column=0, sticky="ew", pady=(0, 8))
    bar.columnconfigure(1, weight=1)
    query, state = StringVar(root), StringVar(root, "All")
    ttk.Label(bar, text="Character or Discord").grid(row=0, column=0, padx=(0, 6))
    ttk.Entry(bar, textvariable=query).grid(row=0, column=1, sticky="ew")
    ttk.Label(bar, text="Show").grid(row=0, column=2, padx=(12, 6))
    ttk.Combobox(bar, state="readonly", width=17, textvariable=state,
                 values=("All", REVIEW, CHECKING, WAITING, HELD, STALE, VERIFIED_MEMBERS)).grid(row=0, column=3)
    tree = ttk.Treeview(body, columns=("name", "discord", "state", "target", "checked"), show="headings")
    tree.grid(row=2, column=0, sticky="nsew")
    scroll = ttk.Scrollbar(body, orient="vertical", command=tree.yview)
    scroll.grid(row=2, column=1, sticky="ns")
    tree.configure(yscrollcommand=scroll.set)
    for key, label, width in (("name", "Character", 190), ("discord", "Discord", 160),
                              ("state", "Check", 130), ("target", "Recommended rank", 125), ("checked", "Checked at", 95)):
        tree.heading(key, text=label)
        tree.column(key, width=width, minwidth=70)
    ttk.Label(body, textvariable=message).grid(row=3, column=0, sticky="w", pady=(8, 0))
    files, current, shown = Files(directory), View(""), None

    def draw(*_):
        nonlocal shown
        members = state.get() == VERIFIED_MEMBERS
        visible = filtered(current.rows, query.get(), "All" if members else state.get())
        if not visible and current.rows:
            message.set("No verified members match this search." if members else "No verified Initiates match these filters. Change the search or select All.")
        elif not current.rows and current.groups:
            message.set("Waiting for a verified roster member to match the latest Initiate checks.")
        else:
            message.set(current.message)
        if visible == shown:
            return
        shown = visible
        tree.delete(*tree.get_children())
        for row in visible:
            checked = datetime.fromtimestamp(row.checked).strftime("%H:%M:%S") if row.checked else "—"
            tree.insert("", "end", values=(row.name, row.discord or "—", row.state, row.target or "—", checked))

    def refresh(*_):
        nonlocal current
        now = int(clock())
        members = state.get() == VERIFIED_MEMBERS
        current = files.get(now, verified_members=members)
        if current.snapshot:
            age = now - current.snapshot
            prefix = f"OLYMPUS PRIME · {current.realm} · roster {age // 60}m {age % 60}s ago"
            count = f"{len(current.rows)} verified members" if members else (
                f"{len(current.rows)} verified Initiates · {current.completed}/{current.groups} groups checked")
            summary.set(f"{prefix} · {count}")
        else:
            summary.set("OLYMPUS PRIME")
        draw()

    def poll():
        refresh()
        root.after(2000, poll)

    query.trace_add("write", draw)
    state.trace_add("write", refresh)
    poll()
    return tree, query, state


def main():
    from tkinter import Tk, filedialog

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--addon-dir", type=Path)
    directory = parser.parse_args().addon_dir
    root = Tk()
    if not directory:
        root.withdraw()
        directory = filedialog.askdirectory(title="Choose the installed OlympusVerify addon folder")
        if not directory:
            root.destroy()
            return
        root.deiconify()
    show(root, directory)
    root.mainloop()


if __name__ == "__main__":
    main()
