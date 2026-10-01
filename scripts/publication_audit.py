"""Bounded, redacted Git-object audit. No checkout, credentials, installs or provider writes."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import subprocess
import os
from pathlib import Path

MAX_BLOBS = 10000
MAX_TEXT_BYTES = 128 * 1024 * 1024
MAX_BLOB_BYTES = 5 * 1024 * 1024
TOKEN_RULES = {
    'github_token_shape': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{30,255})\b'),
    'discord_token_shape': re.compile(r'\b[A-Za-z0-9_-]{20,30}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{25,110}\b'),
    'private_key_header': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'aws_access_key_shape': re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'credential_url': re.compile(r'https?://[^\s/:@"\']{1,100}:[^\s/@"\']{4,200}@'),
}
ASSIGNMENT = re.compile(r'''(?ix)(?:bot_?token|client_?secret|watcher_?token|verify_?secret|session_?secret|api_?key|access_?token|refresh_?token|authorization)["']?\s*[:=]\s*(["'])([^\r\n]{8,255}?)\1''')
PLACEHOLDER = re.compile(r'(?:(?:YOUR|PUT|PASTE|REPLACE|EXAMPLE)_[A-Z0-9_]+|<(?:YOUR|PUT|PASTE|REPLACE|EXAMPLE)_[A-Z0-9_]+>|(?i:replace-me-with-your-(?:secret|token|key)|change-me|not-a-real-(?:secret|token|key)|placeholder))')
PRIVATE_NAME = re.compile(r'(?i)(?:^|/)(?:\.dev\.vars(?:\..*)?|\.env(?:\..*)?|config\.json|Config\.lua|state\.json|watcher-state[^/]*\.json|WoWChatLog\.txt|SavedVariables(?:/|$))|(?:\.sqlite[0-9]*|\.db|\.bak[^/]*|\.log|\.dump|\.zip|\.7z)$')
RUNTIME_PAYLOAD = re.compile(r'(?i)(?:INSERT\s+INTO\s+(?:members|characters|pending|invite_queue|site_users)\b|Player-\d+-[0-9A-Fa-f]{6,16}|[A-Za-z][A-Za-z0-9]{2,11}#[0-9]{4,7})')

def git_environment() -> dict[str, str]:
    # Local Git operations need OS paths, never credential variables, replacement refs, grafts or user filters.
    env = {key: os.environ[key] for key in ('PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP',
           'USERPROFILE', 'LOCALAPPDATA', 'COMSPEC') if key in os.environ}
    env.update({'GIT_NO_REPLACE_OBJECTS': '1', 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': os.devnull,
                'GIT_GRAFT_FILE': os.devnull, 'GIT_TERMINAL_PROMPT': '0', 'GIT_NO_LAZY_FETCH': '1', 'GIT_ALLOW_PROTOCOL': 'file'})
    return env

def git_run(repo: Path, *args: str, input: bytes | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(['git', '--no-replace-objects', '-c', 'core.hooksPath=' + os.devnull, '-C', str(repo), *args],
                          input=input, check=True, capture_output=True, env=git_environment())

def git(repo: Path, *args: str) -> bytes:
    return git_run(repo, *args).stdout

def exact_head(repo: Path, head: str) -> str:
    if not re.fullmatch(r'[0-9a-f]{40}', head):
        raise ValueError('require_exact_40_character_commit')
    resolved = git(repo, 'rev-parse', head + '^{commit}').decode().strip()
    if resolved != head:
        raise ValueError('commit_mismatch')
    return resolved

def tree(repo: Path, head: str) -> list[dict]:
    rows = []
    seen = set()
    for entry in git(repo, 'ls-tree', '-rz', '--full-tree', head).split(b'\0'):
        if not entry:
            continue
        metadata, raw_path = entry.split(b'\t', 1)
        mode, kind, oid = metadata.decode('ascii').split()
        path = raw_path.decode('utf-8')
        validate_path(path)
        key = path.casefold()
        if key in seen:
            raise ValueError('case_insensitive_path_collision')
        seen.add(key)
        if kind != 'blob' or mode not in ('100644', '100755'):
            raise ValueError('unsupported_git_tree_entry')
        rows.append({'path': path, 'mode': mode, 'blob': oid})
    return rows

def validate_path(path: str) -> None:
    if not isinstance(path, str):
        raise ValueError('unsafe_tree_path')
    parts = path.split('/')
    if not path or path.startswith('/') or '\\' in path or ':' in path or '\x00' in path \
            or any(p in ('', '.', '..') or p.casefold() == '.git' for p in parts):
        raise ValueError('unsafe_tree_path')
    # Windows strips trailing spaces/dots and reserves these device names.
    if re.search(r'[\x00-\x1f<>"|?*]', path) or any(p.endswith((' ', '.')) or re.fullmatch(r'(?i)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', p) for p in parts):
        raise ValueError('unsafe_windows_tree_path')

def private_path(path: str) -> bool:
    if path.endswith(('.example', '.example.json', '.example.lua')):
        return False
    return bool(PRIVATE_NAME.search(path))

def blobs(repo: Path, ids: list[str]) -> dict[str, bytes]:
    if len(ids) > MAX_BLOBS or any(not re.fullmatch(r'[0-9a-f]{40}', oid) for oid in ids):
        raise ValueError('invalid_bounded_blob_requests')
    request = ('\n'.join(ids) + '\n').encode('ascii')
    headers = git_run(repo, 'cat-file', '--batch-check', input=request).stdout.splitlines()
    if len(headers) != len(ids):
        raise ValueError('blob_metadata_shape_mismatch')
    sizes = []
    for oid, header in zip(ids, headers):
        fields = header.decode('ascii').split()
        if len(fields) != 3 or fields[0] != oid or fields[1] != 'blob':
            raise ValueError('unexpected_blob_metadata')
        sizes.append(int(fields[2]))
    if any(size > MAX_BLOB_BYTES for size in sizes) or sum(sizes) > MAX_TEXT_BYTES:
        raise ValueError('batch_blob_byte_bound_exceeded')
    raw = git_run(repo, 'cat-file', '--batch', input=request).stdout
    offset, result = 0, {}
    for oid, size in zip(ids, sizes):
        end = raw.index(b'\n', offset)
        if raw[offset:end] != (oid + ' blob ' + str(size)).encode('ascii'):
            raise ValueError('blob_payload_header_mismatch')
        offset = end + 1
        data = raw[offset:offset+size]
        if len(data) != size or raw[offset+size:offset+size+1] != b'\n':
            raise ValueError('blob_payload_shape_mismatch')
        result[oid] = data
        offset += size + 1
    if offset != len(raw):
        raise ValueError('extra_blob_payload_bytes')
    return result

def scan_text(text: str, path: str) -> list[dict]:
    results = []
    for rule, pattern in TOKEN_RULES.items():
        for match in pattern.finditer(text):
            results.append({'rule': rule, 'line': text.count('\n', 0, match.start()) + 1,
                            'classification': 'credential_shape_requires_review', 'blocking': True})
    for match in ASSIGNMENT.finditer(text):
        value = match.group(2)
        if not value.strip():
            continue
        placeholder = bool(PLACEHOLDER.fullmatch(value))
        results.append({'rule': 'credential_literal_assignment', 'line': text.count('\n', 0, match.start()) + 1,
                        'classification': 'explicit_test_or_placeholder_text' if placeholder else 'literal_requires_review',
                        'blocking': not placeholder})
    for match in RUNTIME_PAYLOAD.finditer(text):
        is_test = bool(re.search(r'(?:^|/)(?:tests?|test-support)/', path))
        results.append({'rule': 'runtime_or_person_identifier_shape', 'line': text.count('\n', 0, match.start()) + 1,
                        'classification': 'test_source_requires_fixture_review' if is_test else 'data_shape_requires_review',
                        'blocking': False})
    # Deliberately return no excerpts, hashes of matched values, keys, or raw exception text.
    return results

def audit(repo: Path, head: str, history: bool = True) -> dict:
    exact_head(repo, head)
    current = tree(repo, head)
    path_by_blob = {}
    history_commits = git(repo, 'rev-list', head).decode().splitlines() if history else [head]
    for commit in history_commits:
        for row in tree(repo, commit):
            path_by_blob.setdefault(row['blob'], set()).add(row['path'])
    if len(path_by_blob) > MAX_BLOBS:
        raise ValueError('blob_bound_exceeded')
    findings, binary, oversize = [], [], []
    text_bytes = 0
    scanned = 0
    data_by_blob = blobs(repo, sorted(path_by_blob))
    for oid, paths in sorted(path_by_blob.items()):
        data = data_by_blob[oid]
        size = len(data)
        for path in sorted(paths):
            if private_path(path):
                findings.append({'blob': oid, 'path': path, 'rule': 'private_runtime_or_backup_path', 'blocking': True})
        if b'\0' in data:
            binary.append({'blob': oid, 'paths': sorted(paths), 'bytes': size})
            continue
        try:
            text = data.decode('utf-8-sig')
        except UnicodeDecodeError:
            binary.append({'blob': oid, 'paths': sorted(paths), 'bytes': size})
            continue
        text_bytes += size
        if text_bytes > MAX_TEXT_BYTES:
            raise ValueError('text_byte_bound_exceeded')
        scanned += 1
        for path in sorted(paths):
            for match in scan_text(text, path):
                findings.append({'blob': oid, 'path': path, **match})
    for commit in history_commits:
        message = git(repo, 'show', '-s', '--format=%B', commit).decode('utf-8')
        for match in scan_text(message, '[commit-message]'):
            findings.append({'commit': commit, 'path': '[commit-message]', **match})
    return {'kind': 'bounded_redacted_parser_not_full_secret_scan', 'head': head,
            'current_tracked_files': len(current), 'history_commits': len(history_commits),
            'unique_history_blobs': len(path_by_blob), 'text_blobs_scanned': scanned, 'text_bytes_scanned': text_bytes,
            'findings': findings, 'blocking_findings': sum(bool(f.get('blocking')) for f in findings),
            'binary_not_scanned': binary, 'oversize_not_scanned': oversize,
            'limits': {'max_blobs': MAX_BLOBS, 'max_text_bytes': MAX_TEXT_BYTES, 'max_blob_bytes': MAX_BLOB_BYTES},
            'limitations': ['Not Gitleaks or a complete detector; zero findings do not establish absence of secrets.',
                            'Binary/font/image payloads are not content-scanned; separate provenance review is required.',
                            'Only tracked Git objects and OS path variables were read; no ignored files, actual live config, credential environment values or runtime dumps were opened.'],
            'provider_mutations': 0}

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--head', required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--current-only', action='store_true')
    args = parser.parse_args()
    if args.out.exists():
        raise ValueError('refuse_existing_report')
    result = audit(args.repo, args.head, not args.current_only)
    args.out.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: result[key] for key in ['kind', 'head', 'current_tracked_files', 'history_commits',
                                                  'text_blobs_scanned', 'blocking_findings']}))

if __name__ == '__main__':
    main()
