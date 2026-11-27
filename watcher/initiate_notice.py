"""Private Windows notification after publication of fresh PRIME eligibility results."""
from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes as wt
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import time
import uuid
import codes
from custody_recovery import private_create, regular_identity, reviewed_path


TITLE = "Olympus Verify"
MESSAGE = "New Initiate recommendations are ready. When safely idle in WoW, use /olv ready sync once to review them."
VERIFIED_MESSAGE = "A confirmed Discord handle is available. Open the Olympus officer viewer and choose Verified members."
TEST_MESSAGE = "This is a notification test. No guild data was used. No action is needed."
OS_ERRORS = (AttributeError, OSError, TypeError, ValueError, ctypes.ArgumentError)


class NoticeHistoryUnavailable(ValueError):
    pass


class NoticeHistory:
    """Private, bounded notice deduplication; never write to the ingest custody journal."""
    def __init__(self, custody_path):
        self.path = custody_path.with_name(custody_path.name + ".initiate-notices.json")

    def load(self):
        try:
            path = reviewed_path(self.path)
            try:
                identity = regular_identity(path)
            except FileNotFoundError:
                return None, None
            with path.open('rb') as stream:
                info = os.fstat(stream.fileno())
                if (info.st_dev, info.st_ino) != identity or info.st_size > 70000:
                    raise ValueError()
                raw = stream.read(70001)
            if len(raw) != info.st_size or len(raw) > 70000 or regular_identity(path) != identity:
                raise ValueError()
            keys = json.loads(raw)
            if (type(keys) is not list or len(keys) > 1000
                    or any(type(k) is not str or not re.fullmatch('[0-9a-f]{64}', k) for k in keys)
                    or keys != sorted(set(keys))):
                raise ValueError()
            return set(keys), (identity, hashlib.sha256(raw).digest())
        except (OSError, ValueError, RecursionError) as error:
            raise NoticeHistoryUnavailable() from error

    def save(self, keys, expected):
        temp = None
        created = None
        try:
            path = reviewed_path(self.path)
            temp = path.with_name("." + path.name + "." + uuid.uuid4().hex + ".tmp")
            with private_create(temp) as stream:
                created = regular_identity(temp)
                stream.write(json.dumps(sorted(keys), separators=(',', ':')).encode('ascii'))
                stream.flush()
                os.fsync(stream.fileno())
            if self.load()[1] != expected or reviewed_path(path) != path or regular_identity(temp) != created:
                raise ValueError()
            os.replace(temp, path)
            saved, witness = self.load()
            if saved != keys:
                raise ValueError()
            return witness
        except (OSError, ValueError, RecursionError) as error:
            raise NoticeHistoryUnavailable() from error
        finally:
            if created is not None:
                try:
                    if regular_identity(temp) == created:
                        temp.unlink()
                except (OSError, ValueError):
                    pass


class IconData(ctypes.Structure):
    _fields_ = [
        ("cbSize", wt.DWORD), ("hWnd", wt.HWND), ("uID", wt.UINT), ("uFlags", wt.UINT),
        ("uCallbackMessage", wt.UINT), ("hIcon", wt.HICON), ("szTip", wt.WCHAR * 128),
        ("dwState", wt.DWORD), ("dwStateMask", wt.DWORD), ("szInfo", wt.WCHAR * 256),
        ("uTimeout", wt.UINT), ("szInfoTitle", wt.WCHAR * 64), ("dwInfoFlags", wt.DWORD),
        ("guidItem", ctypes.c_byte * 16), ("hBalloonIcon", wt.HICON),
    ]


class WindowsNotice:
    """A Shell notification with a private invisible owner, no focus changes or input."""
    def __init__(self):
        self.window = None
        self.icon = None
        self.remove_at = None

    def available(self, wow_dir):
        if os.name != "nt":
            return False
        user, kernel = ctypes.windll.user32, ctypes.windll.kernel32
        state = ctypes.c_int()
        if ctypes.windll.shell32.SHQueryUserNotificationState(ctypes.byref(state)) != 0 or state.value != 5:
            return False
        user.FindWindowExW.argtypes = [wt.HWND, wt.HWND, wt.LPCWSTR, wt.LPCWSTR]
        user.FindWindowExW.restype = wt.HWND
        user.GetWindowThreadProcessId.argtypes = [wt.HWND, ctypes.POINTER(wt.DWORD)]
        kernel.OpenProcess.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
        kernel.OpenProcess.restype = wt.HANDLE
        kernel.QueryFullProcessImageNameW.argtypes = [wt.HANDLE, wt.DWORD, wt.LPWSTR, ctypes.POINTER(wt.DWORD)]
        kernel.CloseHandle.argtypes = [wt.HANDLE]
        wanted = {os.path.normcase(os.path.abspath(Path(wow_dir) / name)) for name in ("Wow.exe", "WowClassic.exe")}
        for window_class in ("waApplication Window", "GxWindowClass"):
            after = None
            for _ in range(32):
                after = user.FindWindowExW(None, after, window_class, None)
                if not after:
                    break
                pid = wt.DWORD()
                user.GetWindowThreadProcessId(after, ctypes.byref(pid))
                handle = kernel.OpenProcess(0x1000, False, pid.value)  # PROCESS_QUERY_LIMITED_INFORMATION
                if handle:
                    try:
                        path = ctypes.create_unicode_buffer(32768)
                        size = wt.DWORD(len(path))
                        if kernel.QueryFullProcessImageNameW(handle, 0, path, ctypes.byref(size)) and os.path.normcase(path.value) in wanted:
                            return True
                    finally:
                        kernel.CloseHandle(handle)
        return False

    def show(self, *, test=False, verified=False):
        if os.name != "nt":
            return False
        user, shell = ctypes.windll.user32, ctypes.windll.shell32
        if self.window is None:
            create = user.CreateWindowExW
            create.argtypes = [wt.DWORD, wt.LPCWSTR, wt.LPCWSTR, wt.DWORD, ctypes.c_int, ctypes.c_int,
                               ctypes.c_int, ctypes.c_int, wt.HWND, wt.HMENU, wt.HINSTANCE, wt.LPVOID]
            create.restype = wt.HWND
            self.window = create(0, "STATIC", TITLE, 0, 0, 0, 0, 0, None, None, None, None)
            if not self.window:
                return False
        shell.Shell_NotifyIconW.argtypes = [wt.DWORD, ctypes.POINTER(IconData)]
        if self.icon is None:
            icon = IconData()
            icon.cbSize, icon.hWnd, icon.uID = ctypes.sizeof(icon), self.window, 1
            user.LoadIconW.argtypes = [wt.HINSTANCE, ctypes.c_void_p]
            user.LoadIconW.restype = wt.HICON
            icon.hIcon = user.LoadIconW(None, 32516)  # IDI_INFORMATION
            icon.uFlags, icon.szTip = 2 | 4, TITLE
            if not shell.Shell_NotifyIconW(0, ctypes.byref(icon)):  # NIM_ADD
                return False
            self.icon = icon
        icon = self.icon
        icon.uFlags = 0x10 | 0x40  # NIF_INFO | NIF_REALTIME; never queue a stale prompt.
        icon.dwInfoFlags = 1 | 0x10 | 0x80  # NIIF_INFO | NIIF_NOSOUND | NIIF_RESPECT_QUIET_TIME
        icon.szInfoTitle, icon.szInfo = TITLE, TEST_MESSAGE if test else VERIFIED_MESSAGE if verified else MESSAGE
        self.remove_at = time.monotonic() + 20
        return bool(shell.Shell_NotifyIconW(1, ctypes.byref(icon)))  # NIM_MODIFY

    def tidy(self):
        if self.icon is not None and time.monotonic() >= self.remove_at:
            ctypes.windll.shell32.Shell_NotifyIconW(2, ctypes.byref(self.icon))
            self.icon = None


def token(secret, scope, actor, guid):
    message = f"initiate-notice|1|{scope}|{actor}|{guid}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def ready_sets(reads, accepted, secret, now):
    """Only use current per-page receipts. Holds retain existing notice history."""
    eligible, unverified = set(), set()
    for read in reads:
        r = read.record
        if (not read.automatic_initiates or r["running"] or not r["completed"] or r["scopeHash"] != accepted["scopeHash"]
                or (r["snapshotId"], r["snapshotAt"]) != (accepted["snapshot"], accepted["exportedAt"])
                or r["actorGuid"] != accepted["fileSource280"]["officerGuid"] or r["confirmations"] != "[]"
                or r["coveredGuids"] != r["targetGuids"] or read.native_digest != accepted["digest"]):
            continue
        page = r["page"]
        if not (page and page["fetchedAt"] <= now < min(page["expiresAt"], r["expiresAt"])):
            continue
        def native_subject(row):
            guid = row["guid"]
            return (guid in r["coveredGuids"] and guid in read.native_guids and accepted["guidCounts"].get(guid) == 1
                    and accepted["members"].get(codes.normalize_character(row["name"])) == guid)
        for row in page["promotions"]:
            intent = row["intent"]
            if (row["currentSlot"] == intent["startSlot"] == 9 and intent["acknowledgedSteps"] == 0
                    and native_subject(row)
                    and intent["issuedAt"] <= now < intent["expiresAt"]):
                eligible.add(token(secret, r["scopeHash"], r["actorGuid"], row["guid"]))
        for row in page["held"]:
            if row["reason"] == "unverified-initiate" and native_subject(row):
                unverified.add(token(secret, r["scopeHash"], r["actorGuid"], row["guid"]))
    return eligible, unverified


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Show one explicitly labelled Olympus notification test; no guild data or configuration is read.")
    parser.add_argument("--test", required=True, action="store_true")
    parser.add_argument("--wow-dir", type=Path, required=True)
    args = parser.parse_args()
    notice = WindowsNotice()
    if not notice.available(args.wow_dir) or not notice.show(test=True):
        parser.exit(1, "Windows notification unavailable for this WoW session.\n")
    print("Windows accepted the test notification.", flush=True)
    time.sleep(20)
    notice.tidy()
