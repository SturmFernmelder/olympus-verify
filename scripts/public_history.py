"""Construct a local public parent from an explicit reachable-object allowlist, never a local clone."""
from pathlib import Path
import re
from publication_audit import MAX_BLOB_BYTES, MAX_TEXT_BYTES, git, git_run

MAX_PUBLIC_OBJECTS = 20000

def object_ids(output: bytes) -> set[str]:
    values = output.decode('ascii').splitlines()
    if len(values) > MAX_PUBLIC_OBJECTS or any(not re.fullmatch(r'[0-9a-f]{40}', value) for value in values):
        raise ValueError('public_object_allowlist_shape_or_bound')
    return set(values)

def reachable_objects(repo: Path, head: str) -> set[str]:
    return object_ids(git(repo, 'rev-list', '--objects', '--no-object-names', head))

def all_objects(repo: Path) -> set[str]:
    return object_ids(git(repo, 'cat-file', '--batch-all-objects', '--batch-check=%(objectname)'))

def refs(repo: Path) -> list[str]:
    return git(repo, 'for-each-ref', '--format=%(refname) %(objectname)').decode('utf-8').splitlines()

def tree_objects(repo: Path, root: str) -> set[str]:
    values = {root}
    for entry in git(repo, 'ls-tree', '-rtz', '--full-tree', root).split(b'\0'):
        if entry:
            metadata = entry.split(b'\t', 1)[0].decode('ascii').split()
            if len(metadata) != 3 or metadata[1] not in ('tree', 'blob'):
                raise ValueError('staged_tree_object_shape')
            values.add(metadata[2])
    object_ids(('\n'.join(sorted(values)) + '\n').encode('ascii'))
    return values

def public_parent(public: Path, public_head: str, keeper: Path, keeper_head: str, out: Path) -> dict:
    public_commits = object_ids(git(public, 'rev-list', public_head))
    keeper_commits = object_ids(git(keeper, 'rev-list', keeper_head))
    if public_commits & keeper_commits:
        raise ValueError('public_parent_contains_keeper_ancestry')
    allowed = reachable_objects(public, public_head)
    request = ('\n'.join(sorted(allowed)) + '\n').encode('ascii')
    metadata = git_run(public, 'cat-file', '--batch-check', input=request).stdout.decode('ascii').splitlines()
    if len(metadata) != len(allowed):
        raise ValueError('public_parent_object_metadata_shape')
    sizes = []
    for oid, row in zip(sorted(allowed), metadata):
        fields = row.split()
        if len(fields) != 3 or fields[0] != oid or fields[1] not in ('commit', 'tree', 'blob', 'tag') or not fields[2].isdigit():
            raise ValueError('public_parent_object_metadata_shape')
        sizes.append(int(fields[2]))
    if any(size > MAX_BLOB_BYTES for size in sizes) or sum(sizes) > MAX_TEXT_BYTES:
        raise ValueError('public_parent_object_byte_bound')
    # Ask Git to encode only this public commit's reachable history; disable reused deltas/objects.
    # The source's other refs and loose objects are never copied or made reachable.
    pack = git_run(public, 'pack-objects', '--stdout', '--revs', '--no-reuse-delta', '--no-reuse-object',
                   input=(public_head + '\n').encode('ascii')).stdout
    if len(pack) > MAX_TEXT_BYTES:
        raise ValueError('public_parent_pack_byte_bound')
    if out.exists():
        raise ValueError('public_parent_output_already_exists')
    git_run(out.parent, 'init', '--quiet', '--object-format=sha1', str(out))
    git_run(out, 'index-pack', '--stdin', '--max-input-size=' + str(MAX_TEXT_BYTES), input=pack)
    if all_objects(out) != allowed or refs(out):
        raise ValueError('public_parent_objects_or_refs_not_allowlisted')
    git(out, 'checkout', '--detach', public_head)
    if all_objects(out) != allowed or refs(out):
        raise ValueError('public_parent_checkout_objects_or_refs_changed')
    return {'construction': 'new_local_git_repository_with_exact_public_reachable_pack',
            'public_parent_object_ids': sorted(allowed), 'public_parent_commit_ids': sorted(public_commits),
            'expected_snapshot_refs': [], 'public_parent_object_count': len(allowed),
            'known_keeper_commit_intersection': 0, 'source_extra_refs_imported': False,
            'source_unreachable_objects_imported': False}

def assert_snapshot_objects(snapshot: Path, proof: dict, staged_tree: str) -> dict:
    parent = set(proof['public_parent_object_ids'])
    staged = tree_objects(snapshot, staged_tree)
    allowed = parent | staged
    if refs(snapshot) != proof['expected_snapshot_refs']:
        raise ValueError('snapshot_extra_refs')
    if all_objects(snapshot) != allowed:
        raise ValueError('snapshot_objects_outside_public_parent_and_staged_tree')
    return {**proof, 'staged_tree_object_ids': sorted(staged), 'snapshot_allowed_object_ids': sorted(allowed),
            'snapshot_all_objects_count': len(allowed), 'all_objects_match_allowlist': True}
