"""Read-only CI qualification of the real publication gate and current tracked source.

Contracts below are synthetic byte fixtures, not external release approval. Only temporary
contract files and public-tree copies are written; no staging, reconciliation or provider runs.
"""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import official_assets as gate

passed = 0


def check(condition, label):
    global passed
    if not condition:
        raise AssertionError(label)
    passed += 1
    print('PASS ' + label)


def refused(action, reason, label):
    try:
        action()
    except ValueError as error:
        check(str(error) == reason, label + ' (' + str(error) + ')')
    else:
        raise AssertionError(label + ': accepted')


def pin(path, mode='100644'):
    raw = payloads[path]
    return {'path': path, 'mode': mode, 'bytes': len(raw), 'sha256': gate.sha(raw)}


# Read current tracked source, never ignored configuration, credentials or recovery files.
index = subprocess.check_output(['git', 'ls-files', '--stage', '-z'], cwd=ROOT).split(b'\0')
rows = []
for entry in index:
    if not entry:
        continue
    metadata, name = entry.split(b'\t')
    mode, oid, stage = metadata.decode('ascii').split()
    assert stage == '0'
    rows.append({'path': name.decode('utf-8'), 'mode': mode, 'blob': oid})
payloads = {row['path']: (ROOT / row['path']).read_bytes() for row in rows}
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
ref = gate.reference()
assets = ref['_assets']
resources = ref['_resources']
public = {**assets, **resources}
runtime = sorted(p for p in payloads if gate.runtime_path(p))
prefixes = set(ref['runtime_prefixes'])
check(len(assets) == 103 and len(ref['official_paths']) == 94, 'original 103 assets and 94 official image/font paths')
check(len(resources) == 15 and len(public) == 118, 'fifteen separate required non-art resources')
check({p for p in payloads if p.startswith('worker/public/')} == set(public), 'actual tracked public tree is the exact closed 118-path union')
check(len(ref['_fixed_art_sources']) == 5 and assets[gate.BRAND_EXCEPTION['path']] == gate.BRAND_EXCEPTION, 'five art-sensitive producer pins and original crest contract')
check(all(pin(p) == row for p, row in public.items()), 'all 118 current public byte pins match the reviewed reference')
check(gate.runtime_path('worker/public/static/qr-phase1.mjs'), 'ES modules are runtime sources')
check(not gate.runtime_path('worker/public/static/governance/olympus-governance-r6.pdf'), 'documents are not executable runtime sources')

app = 'worker/public/static/app.js'
refused(lambda: gate.references(payloads[app], app, assets, prefixes), 'unlisted_website_runtime_reference', 'old art-only URL classification reproduces the current app refusal')
coverage = [{'path': p, 'references': gate.references(payloads[p], p, assets, prefixes, resources)} for p in runtime]
covered = {r['path']: r['references'] for r in coverage}
expected_app = {
    '/static/governance/olympus-adoption-checklist-r6.pdf', '/static/governance/olympus-governance-r6.pdf',
    '/static/governance/olympus-governance-r6.zip', '/static/governance/olympus-guide-r6.pdf',
    '/static/governance/olympus-release-preparation.pdf', '/static/governance/olympus-templates-r6.pdf',
    '/static/governance/organization.json', '/static/governance/reconciled-book.md', '/static/qr-phase1.html'
}
check(expected_app.issubset(covered[app]), 'all nine actual governance/QR app URLs have finite coverage')
qr_edges = {
    'worker/public/static/qr-phase1.html': ['/static/app.css', '/static/qr-phase1.mjs'],
    'worker/public/static/qr-phase1.mjs': ['/static/qr-phase1-decoder.js'],
    'worker/public/static/qr-phase1-decoder.js': ['/static/qr-vendor/jsqr-1.4.0.js']
}
for p, urls in qr_edges.items():
    check(covered[p] == urls, 'actual QR dependency references: ' + p)
check('worker/public/static/qr-vendor/jsqr-1.4.0.js' in covered, 'vendored QR decoder is separately runtime-pinned and scanned')
notice = json.loads(payloads['worker/public/static/qr-vendor/jsqr-1.4.0.source.json'])
for row in notice['files']:
    path = 'worker/public/static/qr-vendor/' + row['path']
    check(resources[path]['bytes'] == row['bytes'] and resources[path]['sha256'] == row['sha256'], 'actual QR source notice agrees with required vendor bytes: ' + row['path'])

manifest = {
    'schema': 'olympus-selected-official-public-assets-v2', 'keeper_head': head,
    'official_candidate_manifest_sha256': ref['official_candidate_manifest_sha256'],
    'reference_sha256': gate.REFERENCE_SHA256, 'files': list(assets.values()),
    'required_public_resources': list(resources.values()), 'runtime_files': [pin(p) for p in runtime],
    'reference_coverage': coverage, 'excluded_public_files': []
}
contract = {
    'schema': 'olympus-publication-official-assets-contract-v1', 'keeper_head': head, 'finalHead': head,
    'stageable': True, 'scope': 'byte_gate_only_pending_final_publication_review',
    'asset_manifest_sha256': '', 'provenance_sha256': assets[ref['provenance_path']]['sha256'],
    'documents': [pin(p) for p in ref['required_documents']],
    'profile_files': [pin(p) for p in ref['required_profile_paths'] + ref['optional_profile_paths'] if p in payloads]
}

with tempfile.TemporaryDirectory(prefix='olympus-publication-resource-test-') as directory:
    temp = Path(directory)

    def load(candidate=None, candidate_contract=None):
        m = manifest if candidate is None else candidate
        raw = (json.dumps(m, indent=2) + '\n').encode('utf-8')
        mp = temp / 'manifest.json'
        mp.write_bytes(raw)
        c = copy.deepcopy(contract if candidate_contract is None else candidate_contract)
        c['asset_manifest_sha256'] = gate.sha(raw)
        raw_c = (json.dumps(c, indent=2) + '\n').encode('utf-8')
        cp = temp / 'contract.json'
        cp.write_bytes(raw_c)
        return gate.load_contract(cp, gate.sha(raw_c), mp, gate.sha(raw), head)

    admitted = load()
    proof = gate.validate_result_tree(rows, payloads, admitted)
    check(proof['result'] == 'PASS' and proof['public_asset_count'] == 118 and proof['required_non_art_resource_pins_verified'] == 15, 'real load_contract then validate_result_tree accepts the complete current source')
    check(proof['readyForPublication'] is False and proof['document_content_acceptance'] is False, 'synthetic byte checks confer no release or document-content approval')
    gate.validate_worktree_assets(ROOT, admitted)
    check(True, 'actual source public worktree passes exact closed-resource validation')

    for p in resources:
        missing_rows = [r for r in rows if r['path'] != p]
        refused(lambda: gate.validate_result_tree(missing_rows, payloads, admitted), 'missing_required_public_asset_in_result', 'required resource cannot be omitted: ' + p)
        changed = dict(payloads)
        changed[p] += b'\nchanged'
        reason = 'private_runtime_path_in_result' if gate.private_path(p) else 'public_asset_byte_or_mode_pin_mismatch'
        refused(lambda: gate.validate_result_tree(rows, changed, admitted), reason, 'required resource cannot be substituted: ' + p)
        changed_rows = [{**r, 'mode': '100755'} if r['path'] == p else r for r in rows]
        refused(lambda: gate.validate_result_tree(changed_rows, payloads, admitted), reason, 'required resource mode cannot change: ' + p)

    def extra(path, raw):
        return gate.validate_result_tree(rows + [{'path': path, 'mode': '100644'}], {**payloads, path: raw}, admitted)

    for p in ('worker/public/static/governance/unlisted.pdf', 'worker/public/static/qr-unlisted.mjs', 'worker/public/static/governance/unlisted.json'):
        refused(lambda p=p: extra(p, b'not-reviewed'), 'unlisted_public_asset_in_result', 'unlisted resource is refused: ' + p)
    zip_path = 'worker/public/static/governance/olympus-governance-r6.zip'
    check(gate.exact_public_resource(zip_path, '100644', payloads[zip_path], admitted), 'shared staging/result archive guard accepts only the source-bound resource tuple')
    check(not gate.exact_public_resource(zip_path, '100755', payloads[zip_path], admitted), 'shared archive guard rejects a changed mode')
    check(not gate.exact_public_resource(zip_path, '100644', payloads[zip_path] + b'changed', admitted), 'shared archive guard rejects changed bytes')
    check(not gate.exact_public_resource('private/export.zip', '100644', payloads[zip_path], admitted), 'shared archive guard rejects an unlisted path with exact document bytes')
    case_zip = zip_path.replace('olympus-governance-r6.zip', 'Olympus-governance-r6.zip')
    check(not gate.exact_public_resource(case_zip, '100644', payloads[zip_path], admitted), 'shared archive guard requires exact path case')
    case_rows = [{**r, 'path': case_zip} if r['path'] == zip_path else r for r in rows]
    refused(lambda: gate.validate_result_tree(case_rows, {**payloads, case_zip: payloads[zip_path]}, admitted), 'private_runtime_path_in_result', 'case-mismatched approved ZIP remains refused in the complete result')
    refused(lambda: extra('worker/public/static/governance/renamed.zip', payloads[zip_path]), 'private_runtime_path_in_result', 'renaming the exact approved ZIP does not confer an archive exception')
    refused(lambda: extra('worker/public/static/qr-vendor/copied.js', payloads['worker/public/static/qr-vendor/jsqr-1.4.0.js']), 'unlisted_public_asset_in_result', 'renaming vendor runtime does not confer approval')
    art_path = ref['official_paths'][0]
    refused(lambda: extra('docs/renamed-official.png', payloads[art_path]), 'official_asset_payload_at_unlisted_path', 'official artwork remains restricted to its reviewed paths')
    refused(lambda: extra('docs/renamed-crest.png', payloads[gate.BRAND_EXCEPTION['path']]), 'brand_exception_payload_at_unlisted_path', 'crest exception remains restricted to its sole reviewed path')
    refused(lambda: extra('private/export.zip', b'archive'), 'private_runtime_path_in_result', 'ordinary private/archive paths remain refused')

    for label, change, reason in [
        ('legacy manifest schema', lambda m: m.update(schema='olympus-selected-official-public-assets-v1'), 'official_asset_manifest_shape_invalid'),
        ('unknown manifest key', lambda m: m.update(unreviewed_resources=[]), 'official_asset_manifest_shape_invalid'),
        ('missing resource field', lambda m: m.pop('required_public_resources'), 'official_asset_manifest_shape_invalid'),
        ('missing required resource pin', lambda m: m['required_public_resources'].pop(), 'public_resource_change_requires_reviewed_reference_successor'),
        ('duplicate resource row', lambda m: m['required_public_resources'].append(copy.deepcopy(m['required_public_resources'][0])), 'official_public_resource_pin_invalid'),
        ('changed resource hash', lambda m: m['required_public_resources'][0].update(sha256='0'*64), 'public_resource_change_requires_reviewed_reference_successor'),
        ('changed resource size', lambda m: m['required_public_resources'][0].update(bytes=1), 'public_resource_change_requires_reviewed_reference_successor'),
        ('forged archive resource path', lambda m: next(r for r in m['required_public_resources'] if r['path'] == zip_path).update(path='worker/public/static/governance/unlisted.zip'), 'public_resource_change_requires_reviewed_reference_successor'),
        ('resource group cannot absorb art', lambda m: m['required_public_resources'].append(copy.deepcopy(assets[art_path])), 'official_public_resource_pin_invalid'),
        ('missing module runtime pin', lambda m: m.update(runtime_files=[r for r in m['runtime_files'] if not r['path'].endswith('qr-phase1.mjs')]), 'official_runtime_file_pin_invalid'),
        ('module runtime/resource mismatch', lambda m: next(r for r in m['runtime_files'] if r['path'].endswith('qr-phase1.mjs')).update(sha256='0'*64), 'official_runtime_public_pin_binding_mismatch'),
        ('missing reference coverage', lambda m: m['reference_coverage'].pop(), 'official_runtime_coverage_shape_invalid'),
        ('required resource cannot be excluded', lambda m: m['excluded_public_files'].append(copy.deepcopy(resources[zip_path])), 'official_unselected_public_pin_invalid')
    ]:
        m = copy.deepcopy(manifest)
        change(m)
        refused(lambda m=m: load(m), reason, label)
    m = copy.deepcopy(manifest)
    next(r for r in m['reference_coverage'] if r['path'].endswith('qr-phase1.mjs'))['references'] = []
    refused(lambda: gate.validate_result_tree(rows, payloads, load(m)), 'website_runtime_reference_coverage_mismatch', 'module references must equal the actual source scan')
    m = copy.deepcopy(manifest)
    next(r for r in m['files'] if r['path'] == gate.BRAND_EXCEPTION['path'])['sha256'] = '0'*64
    refused(lambda: load(m), 'fixed_official_asset_bytes_changed_requires_new_reference', 'unchanged crest bytes cannot be repinned through a final manifest')

    # A required document may be a link/fetch target, never decorative CSS artwork.
    for url in ('/static/governance/olympus-governance-r6.pdf', '/static/qr-phase1.mjs'):
        refused(lambda url=url: gate.references(('a{background:url(' + url + ')}').encode(), 'worker/public/static/app.css', assets, prefixes, resources), 'unmanifested_css_asset_reference', 'non-art resource is not a CSS image/font allowance: ' + url)
    for raw in (b'<svg viewBox="0 0 1 1"></svg>', b'const image="data:image/png;base64,AA"', b'const font="data:font/woff;base64,AA"'):
        refused(lambda raw=raw: gate.references(raw, 'worker/public/static/qr-phase1.mjs', assets, prefixes, resources), 'embedded_or_custom_website_art_reference', 'module classification retains embedded artwork refusal')
    refused(lambda: gate.references(b'fetch("/static/governance/extra.pdf")', app, assets, prefixes, resources), 'unlisted_website_runtime_reference', 'resource directory does not grant a prefix exception')

    snapshot = temp / 'public-copy'
    for p in public:
        target = snapshot / p
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payloads[p])
    gate.validate_worktree_assets(snapshot, admitted)
    check(True, 'independent temporary worktree copy validates all 118 required files')
    pdf = snapshot / 'worker/public/static/governance/olympus-governance-r6.pdf'
    pdf.write_bytes(b'changed')
    refused(lambda: gate.validate_worktree_assets(snapshot, admitted), 'public_asset_worktree_pin_mismatch', 'worktree resource substitution is refused')
    pdf.write_bytes(payloads[pdf.relative_to(snapshot).as_posix()])
    missing = snapshot / 'worker/public/static/qr-phase1.mjs'
    missing.unlink()
    refused(lambda: gate.validate_worktree_assets(snapshot, admitted), 'missing_public_asset_in_worktree', 'worktree required module omission is refused')
    missing.write_bytes(payloads[missing.relative_to(snapshot).as_posix()])
    added = snapshot / 'worker/public/static/governance/unlisted.pdf'
    added.write_bytes(b'extra')
    refused(lambda: gate.validate_worktree_assets(snapshot, admitted), 'unlisted_public_asset_in_worktree', 'worktree directory does not grant an extra resource exception')
    added.unlink()

print('PASS publication resource gate: ' + str(passed) + ' checks; ' + str(len(runtime)) + ' actual runtime sources; no staging or provider effects')
