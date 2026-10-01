"""Build a NEW local additive snapshot atop pinned public history. Never fetch, commit or push."""
from __future__ import annotations
import argparse
import datetime
import hashlib
import json
import re
from pathlib import Path
from publication_audit import ASSIGNMENT, blobs, exact_head, git, git_run, private_path, scan_text, tree
from public_history import assert_snapshot_objects, public_parent
from official_assets import load_contract, validate_result_tree, validate_worktree_assets

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_URL = 'https://github.com/SturmFernmelder/olympus-verify.git'
PUBLIC_HEAD = 'e0c1fcee23f69bf61ad4054cd86a95c73d3413d9'
sha = lambda data: hashlib.sha256(data).hexdigest()

def output_target(value: Path) -> Path:
    out = value.resolve()
    if not out.is_relative_to(ROOT.resolve()) or out == ROOT.resolve() or out.exists():
        raise ValueError('require_new_output_inside_publication_candidate')
    return out

def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--keeper-repo', type=Path, required=True)
    p.add_argument('--keeper-head', required=True)
    p.add_argument('--public-repo', type=Path, required=True)
    p.add_argument('--public-head', required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--require-official-assets', action='store_true', required=True)
    p.add_argument('--exclude-person-example-docs', action='store_true')
    p.add_argument('--literal-classifications', type=Path)
    p.add_argument('--asset-contract', type=Path, required=True)
    p.add_argument('--asset-contract-sha256', required=True)
    p.add_argument('--asset-manifest', type=Path, required=True)
    p.add_argument('--asset-manifest-sha256', required=True)
    args = p.parse_args()
    out = output_target(args.out)
    keeper = args.keeper_repo.resolve()
    public = args.public_repo.resolve()
    for repo in (keeper, public):
        if out == repo or out.is_relative_to(repo) or repo.is_relative_to(out):
            raise ValueError('source_output_overlap')
    exact_head(keeper, args.keeper_head)
    exact_head(public, args.public_head)
    if args.public_head != PUBLIC_HEAD:
        raise ValueError('require_pinned_public_parent_head')
    if git(public, 'config', '--get', 'remote.origin.url').decode().strip() != PUBLIC_URL:
        raise ValueError('unexpected_public_origin')
    if git(public, 'rev-parse', 'HEAD').decode().strip() != args.public_head:
        raise ValueError('public_clone_head_drift')
    public_rows = tree(public, args.public_head)
    keeper_rows = tree(keeper, args.keeper_head)
    keeper_blobs = blobs(keeper, [row['blob'] for row in keeper_rows])
    public_paths = {row['path']: row for row in public_rows}
    classifications = None
    reviewed = set()
    classification_basis = {}
    if args.literal_classifications:
        classifications = json.loads(args.literal_classifications.read_text(encoding='utf-8'))
        if classifications.get('keeper_head') != args.keeper_head or classifications.get('scope') != 'candidate_only_pending_Claude':
            raise ValueError('literal_classification_scope_mismatch')
        entries = classifications.get('entries')
        if not isinstance(entries, list) or len(entries) > 256:
            raise ValueError('invalid_literal_classification_entries')
        for entry in entries:
            if not isinstance(entry, dict) or not isinstance(entry.get('path'), str) or not isinstance(entry.get('blob'), str) \
                    or not isinstance(entry.get('line'), int) or isinstance(entry.get('line'), bool) or entry['line'] < 1:
                raise ValueError('invalid_literal_classification_entry')
            if entry.get('rule') != 'credential_literal_assignment' or entry.get('basis') not in ('offline_unit_fixture', 'explicit_documentation_placeholder'):
                raise ValueError('unsupported_literal_classification')
            if entry['basis'] == 'offline_unit_fixture' and not re.fullmatch(r'(?:worker/tests/.*\.cjs|watcher/tests/.*\.(?:py|json)|addon/(?:test|tests)/.*\.lua)', entry['path']):
                raise ValueError('unsupported_fixture_classification_path')
            if entry['basis'] == 'explicit_documentation_placeholder' and not (entry['path'].startswith('docs/') and entry['path'].endswith('.md')):
                raise ValueError('unsupported_documentation_classification_path')
            key = (entry['path'], entry['blob'], entry['line'], entry['rule'])
            reviewed.add(key)
            classification_basis[key] = entry['basis']
        if len(reviewed) != len(entries):
            raise ValueError('duplicate_literal_classification')
    asset_contract = load_contract(args.asset_contract, args.asset_contract_sha256,
                                   args.asset_manifest, args.asset_manifest_sha256, args.keeper_head)
    copied, excluded = [], []
    content = {}
    consumed = set()
    for row in keeper_rows:
        path = row['path']
        data = keeper_blobs[row['blob']]
        if private_path(path):
            raise ValueError('private_runtime_path_in_snapshot')
        if path in asset_contract['excluded_public_files']:
            pin = asset_contract['excluded_public_files'][path]
            if row['mode'] != pin['mode'] or len(data) != pin['bytes'] or sha(data) != pin['sha256']:
                raise ValueError('unselected_public_source_pin_mismatch')
            excluded.append({**row, 'sha256': sha(data), 'bytes': len(data),
                             'reason': 'explicit_source_bound_unselected_website_asset'})
            continue
        if args.exclude_person_example_docs and path in ('docs/design.md', 'docs/asmongold-category-2026-09-28.md'):
            excluded.append({**row, 'sha256': sha(data), 'reason': 'non_test_BattleTag_example_requires_review_or_synthetic_replacement'})
            continue
        if path in public_paths and public_paths[path]['blob'] != row['blob']:
            raise ValueError('public_file_collision_requires_explicit_policy_review')
        try:
            text = data.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = None
        if text is not None and '\0' not in text:
            for finding in scan_text(text, path):
                key = (path, row['blob'], finding['line'], finding['rule'])
                if finding['blocking'] and key not in reviewed:
                    raise ValueError('snapshot_literal_finding_requires_review')
                if finding['blocking']:
                    if classification_basis[key] == 'explicit_documentation_placeholder':
                        values = [m.group(2) for m in ASSIGNMENT.finditer(text.splitlines()[finding['line']-1])]
                        if not values or not all(re.fullmatch(r'(?i)(?:YOUR|PUT|PASTE|REPLACE|EXAMPLE)_[A-Z0-9_]+', v) for v in values):
                            raise ValueError('documentation_literal_is_not_explicit_placeholder')
                    consumed.add(key)
        content[path] = data
        copied.append({**row, 'sha256': sha(data), 'bytes': len(data)})
    if consumed != reviewed:
        raise ValueError('unused_or_stale_literal_classification')
    # Inspect the complete additive result, including preserved public-parent bytes, before creating output.
    parent_blobs = blobs(public, [row['blob'] for row in public_rows])
    result_paths = {row['path']: row for row in public_rows}
    result_paths.update({row['path']: row for row in copied})
    result_payloads = {row['path']: parent_blobs[row['blob']] for row in public_rows}
    result_payloads.update(content)
    asset_proof = validate_result_tree(list(result_paths.values()), result_payloads, asset_contract)
    if {r['path'] for r in excluded if r['reason']=='explicit_source_bound_unselected_website_asset'} != set(asset_contract['excluded_public_files']):
        raise ValueError('unused_or_missing_unselected_public_source_pin')
    # Copy only exact public reachable objects into a new repository, not the source clone's refs/object store.
    parent_proof = public_parent(public, args.public_head, keeper, args.keeper_head, out)
    git(out, 'remote', 'add', 'origin', PUBLIC_URL)
    # Make accidental publication fail without changing credential configuration or the source clone.
    git(out, 'remote', 'set-url', '--push', 'origin', 'https://invalid.invalid/publication-disabled')
    # A Windows checkout may apply autocrlf even though the public blobs must stay byte-for-byte unchanged.
    for row in public_rows:
        target = out / row['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(git(public, 'cat-file', 'blob', row['blob']))
    for path, data in content.items():
        target = out / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    # Stage only manifest-listed bytes. Plumbing avoids local clean filters, autocrlf and accidental untracked files.
    created = git_run(out, 'hash-object', '-w', '--stdin-paths', '--no-filters',
                      input=('\n'.join(row['path'] for row in copied)+'\n').encode('utf-8')).stdout.decode().splitlines()
    if len(created) != len(copied):
        raise ValueError('staged_blob_count_mismatch')
    for row, oid in zip(copied, created):
        if oid != row['blob']:
            raise ValueError('staged_blob_differs_from_pinned_keeper')
    index_info=''.join(row['mode']+' '+row['blob']+'\t'+row['path']+'\n' for row in copied)
    git_run(out, 'update-index', '--index-info', input=index_info.encode('utf-8'))
    for row in public_rows:
        if sha((out / row['path']).read_bytes()) != sha(git(public, 'cat-file', 'blob', row['blob'])):
            raise ValueError('existing_public_file_changed')
    staged = git(out, 'diff', '--cached', '--name-status', args.public_head).decode().splitlines()
    if any(not line.startswith('A\t') for line in staged):
        raise ValueError('non_additive_staged_change')
    staged_tree = git(out, 'write-tree').decode().strip()
    object_proof = assert_snapshot_objects(out, parent_proof, staged_tree)
    staged_rows = tree(out, staged_tree)
    staged_blobs = blobs(out, [row['blob'] for row in staged_rows])
    actual_asset_proof = validate_result_tree(staged_rows, {row['path']: staged_blobs[row['blob']] for row in staged_rows}, asset_contract)
    if actual_asset_proof != asset_proof:
        raise ValueError('staged_official_asset_proof_mismatch')
    validate_worktree_assets(out, asset_contract)
    manifest = {'kind': 'local_additive_publication_snapshot_not_ready',
                'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'keeper_head': args.keeper_head, 'public_head': args.public_head, 'public_origin': PUBLIC_URL,
                'snapshot_path': str(out), 'copied_files': copied, 'excluded_files': excluded,
                'preserved_public_files': public_rows, 'staged_added_files': len(staged),
                'staged_tree': staged_tree, 'public_parent_object_proof': object_proof,
                'private_keeper_ancestry_imported': False, 'new_commit_created': False, 'provider_mutations': 0,
                'push_url_disabled': True, 'release_ready': False,
                'readyForPublication': False, 'official_assets': asset_proof,
                'literal_classification_manifest_sha256': sha(args.literal_classifications.read_bytes()) if args.literal_classifications else None,
                'candidate_only_literal_classifications': len(reviewed),
                'remaining_gates': ['Final accepted keeper head must be resnapshotted and jointly reviewed.',
                                    'Exact official image/font/native UI/reference/document byte pins are enforced; final source, UI and content review remain required.',
                                    'Publisher archive/build attestation and applicable redistribution rights are not established by this byte gate.',
                                    'Website imagery must remain official WoW; generated artwork is reserved for Discord.',
                                    'Proprietary application/license wording and explicit third-party notices require owner review.',
                                    'Excluded personal-example documents need reviewed synthetic replacements and their linked documentation restored.',
                                    'Root public privacy/terms are preserved but disagree with current behavior; reviewed policy update required.',
                                    'Official Gitleaks over the exact eventual public commit/history plus all CI checks required.',
                                    'Candidate-only fixture/placeholder literal classifications require actual Claude review; no generic scanner bypass is authorized.',
                                    'GitHub Pages source and repository settings/rename/branch checks require root live inventory.']}
    report = out.parent / (out.name + '-manifest.json')
    if report.exists():
        raise ValueError('refuse_existing_snapshot_manifest')
    report.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'kind': manifest['kind'], 'keeper_head': args.keeper_head, 'public_head': args.public_head,
                      'copied': len(copied), 'excluded': len(excluded), 'preserved_public_files': len(public_rows),
                      'staged_tree': manifest['staged_tree'], 'release_ready': False, 'manifest_sha256': sha(report.read_bytes())}))

if __name__ == '__main__':
    main()
