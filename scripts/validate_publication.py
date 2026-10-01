"""Validate exact local staged bytes/ancestry against the snapshot manifest. Never approves publication."""
from pathlib import Path
import argparse
import hashlib
import json
from publication_audit import blobs, exact_head, git, tree
from public_history import all_objects, assert_snapshot_objects, reachable_objects, object_ids
from official_assets import load_contract, validate_result_tree, validate_worktree_assets
from stage_publication import PUBLIC_HEAD

sha = lambda data: hashlib.sha256(data).hexdigest()

def validate(manifest_path: Path, keeper: Path, public: Path, *, asset_contract: Path,
             asset_contract_sha256: str, asset_manifest: Path, asset_manifest_sha256: str) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('kind') != 'local_additive_publication_snapshot_not_ready' or manifest.get('release_ready') is not False:
        raise ValueError('snapshot_kind_or_ready_claim_invalid')
    keeper_head, public_head = manifest['keeper_head'], manifest['public_head']
    if manifest.get('readyForPublication') is not False:
        raise ValueError('snapshot_kind_or_ready_claim_invalid')
    exact_head(keeper, keeper_head)
    exact_head(public, public_head)
    if public_head != PUBLIC_HEAD:
        raise ValueError('require_pinned_public_parent_head')
    snapshot = Path(manifest['snapshot_path'])
    if git(snapshot, 'rev-parse', 'HEAD').decode().strip() != public_head:
        raise ValueError('snapshot_head_changed')
    if git(snapshot, 'write-tree').decode().strip() != manifest['staged_tree']:
        raise ValueError('snapshot_index_changed')
    proof = manifest.get('public_parent_object_proof')
    if not isinstance(proof, dict) or proof.get('construction') != 'new_local_git_repository_with_exact_public_reachable_pack':
        raise ValueError('public_parent_object_proof_required')
    public_objects = reachable_objects(public, public_head)
    public_commits = object_ids(git(public, 'rev-list', public_head))
    keeper_commits = object_ids(git(keeper, 'rev-list', keeper_head))
    if public_commits & keeper_commits:
        raise ValueError('public_parent_contains_keeper_ancestry')
    if proof.get('public_parent_object_ids') != sorted(public_objects) or proof.get('public_parent_commit_ids') != sorted(public_commits) \
            or proof.get('expected_snapshot_refs') != [] or proof.get('public_parent_object_count') != len(public_objects) \
            or proof.get('known_keeper_commit_intersection') != 0 or proof.get('source_extra_refs_imported') is not False \
            or proof.get('source_unreachable_objects_imported') is not False:
        raise ValueError('public_parent_object_proof_mismatch')
    actual_proof = assert_snapshot_objects(snapshot, proof, manifest['staged_tree'])
    if actual_proof != proof:
        raise ValueError('snapshot_object_proof_mismatch')
    if git(snapshot, 'remote', 'get-url', '--push', 'origin').decode().strip() != 'https://invalid.invalid/publication-disabled':
        raise ValueError('snapshot_push_not_disabled')
    if keeper_head in all_objects(snapshot):
        raise ValueError('keeper_commit_object_imported')
    actual_commits = git(snapshot, 'rev-list', '--all').decode().splitlines()
    public_commits = git(public, 'rev-list', public_head).decode().splitlines()
    if set(actual_commits) != set(public_commits):
        raise ValueError('snapshot_extra_commit_ancestry')
    source_rows = {r['path']: r for r in tree(keeper, keeper_head)}
    index_rows = {r['path']: r for r in tree(snapshot, manifest['staged_tree'])}
    listed = manifest['copied_files'] + manifest['excluded_files']
    if len({r['path'] for r in listed}) != len(listed) or {r['path'] for r in listed} != set(source_rows):
        raise ValueError('source_manifest_coverage_mismatch')
    data = blobs(keeper, [r['blob'] for r in source_rows.values()])
    for row in listed:
        if row['blob'] != source_rows[row['path']]['blob'] or row['mode'] != source_rows[row['path']]['mode'] \
                or row['sha256'] != sha(data[row['blob']]):
            raise ValueError('source_provenance_mismatch')
    contract = load_contract(asset_contract, asset_contract_sha256, asset_manifest, asset_manifest_sha256, keeper_head)
    for row in manifest['excluded_files']:
        path = row['path'].casefold()
        pin = contract['excluded_public_files'].get(row['path'])
        valid = (pin is not None and row.get('reason') == 'explicit_source_bound_unselected_website_asset'
                 and row['mode']==pin['mode'] and row['sha256']==pin['sha256'] and row.get('bytes')==pin['bytes']) \
                or (path in ('docs/design.md', 'docs/asmongold-category-2026-09-28.md') \
                    and row.get('reason') == 'non_test_BattleTag_example_requires_review_or_synthetic_replacement')
        if not valid:
            raise ValueError('unsupported_source_exclusion_plan')
    if {r['path'] for r in manifest['excluded_files'] if r['reason']=='explicit_source_bound_unselected_website_asset'} != set(contract['excluded_public_files']):
        raise ValueError('unselected_public_source_coverage_mismatch')
    for row in manifest['copied_files']:
        index = index_rows.get(row['path'])
        if not index or index['blob'] != row['blob'] or index['mode'] != row['mode']:
            raise ValueError('staged_source_byte_or_mode_mismatch')
        if sha((snapshot/row['path']).read_bytes()) != row['sha256']:
            raise ValueError('snapshot_worktree_byte_mismatch')
    public_rows = tree(public, public_head)
    for row in public_rows:
        if index_rows.get(row['path']) != row or sha((snapshot/row['path']).read_bytes()) != sha(git(public,'cat-file','blob',row['blob'])):
            raise ValueError('existing_public_policy_changed')
    expected = {r['path'] for r in manifest['copied_files']} | {r['path'] for r in public_rows}
    if set(index_rows) != expected:
        raise ValueError('extra_or_missing_staged_paths')
    changes = git(snapshot,'diff','--cached','--name-status',public_head).decode().splitlines()
    if len(changes) != manifest['staged_added_files'] or any(not row.startswith('A\t') for row in changes):
        raise ValueError('non_additive_staged_diff')
    index_blobs = blobs(snapshot, [row['blob'] for row in index_rows.values()])
    asset_proof = validate_result_tree(list(index_rows.values()),
                                     {row['path']: index_blobs[row['blob']] for row in index_rows.values()}, contract)
    if manifest.get('official_assets') != asset_proof:
        raise ValueError('official_asset_proof_mismatch')
    validate_worktree_assets(snapshot, contract)
    return {'kind':'publication_snapshot_integrity_only','result':'PASS','release_ready':False,
            'readyForPublication':False,'official_assets':asset_proof,
            'keeper_head':keeper_head,'public_head':public_head,'manifest_sha256':sha(manifest_path.read_bytes()),
            'staged_tree':manifest['staged_tree'],'copied_file_hashes_verified':len(manifest['copied_files']),
            'excluded_source_hashes_verified':len(manifest['excluded_files']),
            'preserved_public_file_hashes_verified':len(public_rows),'reachable_public_commits':len(actual_commits),
            'keeper_commit_object_absent':True,'provider_mutations':0,
            'all_git_objects_match_allowlist':True,'snapshot_ref_count':0,
            'scope':'Exact staged/local source/ancestry integrity only; no license, policy, full secret scan, runtime or joint approval.'}

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--keeper-repo',type=Path,required=True)
    p.add_argument('--public-repo',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--asset-contract',type=Path,required=True)
    p.add_argument('--asset-contract-sha256',required=True)
    p.add_argument('--asset-manifest',type=Path,required=True)
    p.add_argument('--asset-manifest-sha256',required=True)
    a=p.parse_args()
    if a.out.exists():
        raise ValueError('refuse_existing_validation_receipt')
    result=validate(a.manifest,a.keeper_repo,a.public_repo,asset_contract=a.asset_contract,
                    asset_contract_sha256=a.asset_contract_sha256,asset_manifest=a.asset_manifest,
                    asset_manifest_sha256=a.asset_manifest_sha256)
    a.out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result))

if __name__=='__main__':
    main()
