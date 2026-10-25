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
check(len(assets) == 512 and len(ref['official_paths']) == 494, '512 exact assets: all510 prior assets plus two independently approved custom variants;493 official image/font paths and1 historical video unchanged')
check(len(resources) == 48 and len(public) == 560, '48 exact non-art resources: accepted198 inventory plus two199 canonical catalogue projections')
check({p for p in payloads if p.startswith('worker/public/')} == set(public), 'actual tracked public tree is the exact closed560-path union')
check(len(ref['_fixed_art_sources']) == 7 and assets[gate.BRAND_EXCEPTION['path']] == gate.BRAND_EXCEPTION, 'six original art-sensitive producer pins plus the finite login verifier and original crest contract')
check(all(pin(p) == row for p, row in public.items()), 'all560 current public byte pins match the reviewed reference')
master196_resources = {'worker/public/static/legal-view196.js', 'worker/public/static/approved-guild-helper196.js', 'worker/public/static/army-live/sanitized-export.js', 'worker/public/static/army-live/savedvariables-import.js'}
retired_army_zip = 'worker/public/static/army-live/olympus-army-addon-0.2.0.zip'
check(master196_resources.issubset(resources) and not master196_resources.intersection(assets) and all(gate.runtime_path(p) and resources[p]['mode'] == '100644' for p in master196_resources), 'four exact master196 runtime helpers add no official/native art exception')
check(retired_army_zip not in payloads and retired_army_zip not in resources and retired_army_zip not in ref['runtime_paths'], 'standalone Army ZIP remains retired from source, resource and runtime sets')
talent_resources = {'worker/public/static/talents/analysis.js', 'worker/public/static/talents/guide-builds179.js'}
check(talent_resources.issubset(resources) and not talent_resources.intersection(assets) and all(gate.runtime_path(p) and resources[p]['mode'] == '100644' for p in talent_resources), 'both new talent scripts are exact ordinary non-art runtime resources without an official/native art exception')
sheet_script, sheet_data = 'worker/public/static/talents/stats60.js', {'worker/public/static/talents/naked60-186.json', 'worker/public/static/talents/stat-effects186.json'}
check(sheet_script in resources and sheet_data.issubset(resources) and not ({sheet_script} | sheet_data).intersection(assets) and gate.runtime_path(sheet_script) and sheet_script in ref['runtime_paths'] and not any(gate.runtime_path(p) for p in sheet_data) and all(resources[p]['mode'] == '100644' for p in {sheet_script} | sheet_data), '.186 level-60 sheet: one exact runtime script and two exact data files, none an official/native art exception')
army_root = 'worker/public/static/army-qr-review/'
check({p for p in resources if p.startswith(army_root)} == {army_root + name for name in ('protocol.js', 'decoder.js', 'pilot.js', 'manifest.json')}, 'Army adds exactly four closed resources without an artwork exception')
army_manifest = json.loads(payloads[army_root + 'manifest.json'])
check(army_manifest['activation'] is False and army_manifest['uploads'] is False and army_manifest['runtimeOverride'] is False and army_manifest['shippingHtml'] is False, 'published Army package retains fixed disabled gates and no HTML entry')
check(gate.runtime_path('worker/public/static/qr-phase1.mjs'), 'ES modules are runtime sources')
check(not gate.runtime_path('worker/public/static/governance/olympus-governance-r6.pdf'), 'documents are not executable runtime sources')

app = 'worker/public/static/app.js'
refused(lambda: gate.references(payloads[app], app, assets, prefixes), 'unlisted_website_runtime_reference', 'old art-only URL classification reproduces the current app refusal')
coverage = [{'path': p, 'references': gate.references(payloads[p], p, assets, prefixes, resources)} for p in runtime]
retired_url = '/static/army-live/olympus-army-addon-0.2.0.zip'
retired_source = 'worker/src/site-army.ts'
check(retired_url in gate.references(payloads[retired_source], retired_source, assets, prefixes, resources), 'exact authenticated retired route remains visible in source coverage without becoming a public asset')
refused(lambda: gate.references(payloads[retired_source].replace(b'}, 410)', b'}, 200)'), retired_source, assets, prefixes, resources), 'unlisted_website_runtime_reference', 'retired route exception refuses changed non-retirement response')
refused(lambda: gate.references(payloads[retired_source], app, assets, prefixes, resources), 'unlisted_website_runtime_reference', 'retired route exception cannot authorize a consumer in another file')
refused(lambda: gate.references(payloads[retired_source] + ('\nfetch("' + retired_url + '")').encode(), retired_source, assets, prefixes, resources), 'unlisted_website_runtime_reference', 'retired route exception refuses a second fetchable reference even in its source file')
covered = {r['path']: r['references'] for r in coverage}
expected_app = {
    '/static/governance/olympus-adoption-checklist-r6.pdf', '/static/governance/olympus-governance-r6.pdf',
    '/static/governance/olympus-governance-r6.zip', '/static/governance/olympus-guide-r6.pdf',
    '/static/governance/olympus-release-preparation.pdf', '/static/governance/olympus-templates-r6.pdf',
    '/static/governance/organization.json', '/static/governance/reconciled-book.md', '/static/qr-phase1.html',
    '/static/organization-view.js', '/static/talents/calculator.js', '/static/talents/calculator.css',
    '/static/resources169.js', '/static/resources169.css'
}
check(expected_app.issubset(covered[app]), 'all ten actual governance/organization/QR app URLs have finite coverage')
check(covered['worker/public/static/organization-view.js'] == ['/static/organization-view.css'], 'actual organization module dependency is its exact native stylesheet')
qr_edges = {
    'worker/public/static/qr-phase1.html': ['/static/app.css', '/static/qr-phase1.mjs'],
    'worker/public/static/qr-phase1.mjs': ['/static/qr-phase1-decoder.js'],
    'worker/public/static/qr-phase1-decoder.js': ['/static/qr-vendor/jsqr-1.4.0.js'],
    'worker/public/static/qr-beta-window-data.html': ['/static/olympus-icon.png', '/static/policies.css', '/static/qr-beta-window.mjs'],
    'worker/public/static/qr-beta-window.mjs': []
}
for p, urls in qr_edges.items():
    check(covered[p] == urls, 'actual QR dependency references: ' + p)
check('worker/public/static/qr-vendor/jsqr-1.4.0.js' in covered, 'vendored QR decoder is separately runtime-pinned and scanned')
notice = json.loads(payloads['worker/public/static/qr-vendor/jsqr-1.4.0.source.json'])
for row in notice['files']:
    path = 'worker/public/static/qr-vendor/' + row['path']
    check(resources[path]['bytes'] == row['bytes'] and resources[path]['sha256'] == row['sha256'], 'actual QR source notice agrees with required vendor bytes: ' + row['path'])

art_map_path = 'worker/public/static/talents/art.json'
art_provenance_path = 'worker/public/static/talents/art-provenance.json'
art_map = json.loads(payloads[art_map_path])
art_provenance = json.loads(payloads[art_provenance_path])
talent_data = json.loads(payloads['worker/public/static/talents/data.json'])
class_ids = {row['id'] for row in talent_data['classes']}
tree_ids = {row['id'] + '-' + tree['id'] for row in talent_data['classes'] for tree in row['trees']}
talent_ids = {talent['id'] for row in talent_data['classes'] for tree in row['trees'] for talent in tree['talents']}
art_rows = art_provenance['assets']
art_paths = {row['path'] for row in art_rows}
icon_paths = {p for p in art_paths if '/icon-' in p}
background_paths = {p for p in art_paths if '/bg-' in p}
check(art_map_path in resources and art_provenance_path in resources and art_map['schema'] == 'olympus-talents-art-v1' and art_provenance['schema'] == 'olympus-talents-art-provenance-v1', 'art map and source provenance are required byte-bound non-executable resources')
check(art_map['revision'] == talent_data['revision'] == art_provenance['mappingRevision'] == '260cf99b52db' and art_provenance['sourceDataSHA256'] == '260cf99b52db5fd0085043d4d3c2d5dde1b47dffe88b9696c94caccc9fb03588', 'art mapping remains bound to the exact9-class talent snapshot revision')
check(len(class_ids) == 9 and len(tree_ids) == 27 and len(talent_ids) == 466 and set(art_map['classIcons']) == class_ids and set(art_map['treeIcons']) == set(art_map['treeBackgrounds']) == tree_ids and set(art_map['talentIcons']) == talent_ids, 'art map covers every exact class, tree and talent without omitted or distant IDs')
check(art_map['classIcons'] == {key: '/static/wow/class-' + key + '.png' for key in class_ids}, 'class icons remain the existing local official client files')
check(len(art_rows) == len(art_paths) == 396 and len(icon_paths) == 369 and len(background_paths) == 27 and all(p.startswith('worker/public/static/wow/talents/') and p.endswith('.jpg') for p in art_paths), 'finite art provenance contains exactly369 icons and27 backgrounds at the reviewed local paths')
check({'worker/public' + url for url in set(art_map['talentIcons'].values()) | set(art_map['treeIcons'].values())} == icon_paths and {'worker/public' + url for url in art_map['treeBackgrounds'].values()} == background_paths, 'talent and tree maps reference exactly the396 local JPEG inventory and no remote image')
check(all(row['path'] in assets and assets[row['path']]['bytes'] == row['bytes'] and assets[row['path']]['sha256'] == row['sha256'] for row in art_rows), 'every art provenance byte/hash agrees with its official publication pin')
check(any(row['path'] == 'tools/build-talent-art.py' and pin(row['path']) == row for row in ref['fixed_art_source_pins']), 'finite no-network-default talent art producer is separately source-pinned')
check('/static/talents/art.json' in covered['worker/public/static/talents/calculator.js'], 'actual calculator art-map dependency has finite required-resource coverage')
check(covered['worker/public/static/talents/stats60.js'] == ['/static/talents/naked60-186.json', '/static/talents/stat-effects186.json'], '.186 level-60 sheet script covers exactly its two graded data files')
check('/static/talents/stats60.js' in covered['worker/public/static/app.js'], '.186 app loader edge to the optional level-60 sheet script has finite required-resource coverage')

login_video = 'worker/public/static/wow/login/dark-portal.webm'
login_poster = 'worker/public/static/wow/login/dark-portal-poster.jpg'
login_provenance = 'worker/public/static/wow/login/dark-portal-provenance.json'
login_verifier = 'tools/check-login-portal.py'
login_still = 'worker/public/static/wow/login/olympus-dark-portal.png'
login_wide = 'worker/public/static/wow/login/olympus-dark-portal-wide.png'
login_portrait = 'worker/public/static/wow/login/olympus-dark-portal-portrait.png'
login_record = json.loads(payloads[login_provenance])
check({p for p in assets if '/static/wow/login/' in p} == {login_video, login_poster, login_still, login_wide, login_portrait} and {p for p in resources if '/static/wow/login/' in p} == {login_provenance}, 'login closure is exactly two historical media assets, the preserved historical custom still, two exact approved custom variants and one historical provenance record, never a directory exception')
check(ref['login_art_exception']['asset'] == gate.LOGIN_ART_EXCEPTION == assets[login_still] and ref['login_art_exception']['usage'] == 'login_background_only' and ref['login_art_exception']['classification'] == 'ai_custom_art_not_official_blizzard' and ref['login_art_exception']['instruction_date'] == '2026-10-19' and login_still not in ref['official_paths'] and login_still not in ref['native_paths'], 'exact owner custom-art exception is identified separately and never counted as official Blizzard art')
check(payloads[login_still][:8] == b'\x89PNG\r\n\x1a\n' and int.from_bytes(payloads[login_still][16:20], 'big') == 1672 and int.from_bytes(payloads[login_still][20:24], 'big') == 941, 'the exact approved custom PNG retains its1672x941 dimensions')
check(ref['login_art_variants']['assets'] == gate.LOGIN_ART_VARIANTS == [assets[login_wide], assets[login_portrait]] and ref['login_art_variants']['classification'] == 'imagegen_derived_custom_art_not_official_blizzard' and ref['login_art_variants']['usage'] == 'login_background_only', 'exact two .173 imagegen variants retain separate nonofficial tuples and login-only scope')
for path, dimensions in ((login_wide, (1916, 821)), (login_portrait, (852, 1847))):
    raw = payloads[path]
    check(raw[:8] == b'\x89PNG\r\n\x1a\n' and (int.from_bytes(raw[16:20], 'big'), int.from_bytes(raw[20:24], 'big')) == dimensions and max(dimensions) < 3840 and path not in ref['official_paths'] and path not in ref['native_paths'], 'approved variant preserves native PNG dimensions, not4K or official art: ' + path)
for label, edit in (
    ('wrong path', lambda value: value['assets'][0].update(path='worker/public/static/wow/login/alias.png')),
    ('wrong digest', lambda value: value['assets'][1].update(sha256='0' * 64)),
    ('missing variant', lambda value: value['assets'].pop()),
    ('additional image', lambda value: value['assets'].append(copy.deepcopy(value['assets'][0]))),
    ('official relabel', lambda value: value.update(classification='official_blizzard')),
    ('unknown approval field', lambda value: value.update(directory_exception=True))):
    value = copy.deepcopy(ref['login_art_variants'])
    edit(value)
    refused(lambda value=value: gate.login_art_variant_rows(value, set(ref['official_paths']) | set(ref['native_paths'])), 'owner_login_art_variants_shape_invalid', 'closed variant reference refuses ' + label)
refused(lambda: gate.login_art_variant_rows(ref['login_art_variants'], {login_wide}), 'owner_login_art_variants_shape_invalid', 'a custom variant cannot be reclassified into official/native paths')
check(login_record['schema'] == 'olympus-login-dark-portal-render-v1' and login_record['kind'] == 'local-render-from-blizzard-client-assets' and login_record['publisherOriginalMovie'] is False and login_record['sourceBuild'] == '1.15.9.70003' and 'verifierSHA256' not in login_record, 'login provenance distinguishes the local render and original source build without a cyclic verifier pin')
inputs = login_record['sourceInputs']
check(len(inputs) == 28 and len({row['path'] for row in inputs}) == 28 and sum(row['path'].endswith('.m2') for row in inputs) == 1 and sum(row['path'].endswith('.skin') for row in inputs) == 2 and sum(row['path'].endswith('.blp') for row in inputs) == 25, 'separate source provenance records the exact1 model,2 skins and25 texture closure without publishing raw inputs')
check(any(row['path'] == login_verifier and pin(row['path']) == row for row in ref['fixed_art_source_pins']), 'the finite offline login verifier is a seventh separate source pin, not a renderer or extractor execution')
check('worker/src/site-access.ts' in ref['runtime_paths'] and set(covered['worker/src/site-access.ts']) == {'/static/', '/static/olympus-icon.png', '/static/qr-phase1.html', '/static/wow/login/dark-portal.webm', '/static/wow/login/olympus-dark-portal-portrait.png', '/static/wow/login/olympus-dark-portal-wide.png'} and '/static/wow/login/olympus-dark-portal.png' not in covered['worker/src/site-access.ts'], 'site-access coverage is exactly the existing static-prefix and private-camera references plus the owner tabard and three rendered login media; the original1672x941 custom still remains byte-pinned and unused')
check(not any(p.endswith(('.m2', '.skin', '.blp', '.wasm', '.data')) for p in public), 'no original client model, texture, renderer wasm or SDK data payload enters the public closure')

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
    check(proof['result'] == 'PASS' and proof['public_asset_count'] == 560 and proof['required_non_art_resource_pins_verified'] == 48, 'real load_contract then validate_result_tree accepts the complete current source')
    check(proof['official_image_font_count'] == 493 and proof['official_video_count'] == 1 and proof['official_art_file_count'] == 494, 'result evidence counts the video separately from the493 images/fonts')
    check(proof['login_art_exception_byte_pin_verified'] is True and proof['nonofficial_owner_approved_login_art_count'] == 3 and proof['login_art_exception'] == ref['login_art_exception'], 'result evidence reports the approved custom still separately from all494 official assets')
    check(proof['login_art_variants_byte_pins_verified'] is True and proof['login_art_variants'] == ref['login_art_variants'], 'result evidence separately verifies both current variants while preserving the historical singleton proof')
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
    refused(lambda: extra('docs/renamed-login.png', payloads[login_still]), 'login_art_exception_payload_at_unlisted_path', 'custom login art cannot be redistributed at an unapproved path')
    for path in (login_wide, login_portrait):
        refused(lambda path=path: extra('docs/renamed-' + Path(path).name, payloads[path]), 'login_art_variant_payload_at_unlisted_path', 'each custom variant refuses payload aliases even outside the public directory: ' + path)
        altered_variant = dict(payloads)
        altered_variant[path] += b'changed'
        refused(lambda altered_variant=altered_variant: gate.validate_result_tree(rows, altered_variant, admitted), 'public_asset_byte_or_mode_pin_mismatch', 'each variant independently refuses tamper: ' + path)
        refused(lambda path=path: gate.validate_result_tree([row for row in rows if row['path'] != path], payloads, admitted), 'missing_required_public_asset_in_result', 'both exact variants are required, not interchangeable: ' + path)
    refused(lambda: extra('worker/public/static/wow/login/extra-custom.png', b'additional unapproved custom artwork'), 'unlisted_public_asset_in_result', 'the three exact approved custom PNGs do not allow another image or directory exception')
    altered = dict(payloads)
    altered[login_still] += b'changed'
    refused(lambda: gate.validate_result_tree(rows, altered, admitted), 'public_asset_byte_or_mode_pin_mismatch', 'approved custom login artwork cannot be replaced at its approved path')
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
        ('missing beta-window HTML runtime pin', lambda m: m.update(runtime_files=[r for r in m['runtime_files'] if not r['path'].endswith('qr-beta-window-data.html')]), 'official_runtime_file_pin_invalid'),
        ('missing beta-window module runtime pin', lambda m: m.update(runtime_files=[r for r in m['runtime_files'] if not r['path'].endswith('qr-beta-window.mjs')]), 'official_runtime_file_pin_invalid'),
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
    m = copy.deepcopy(manifest)
    next(r for r in m['files'] if r['path'] == login_still)['sha256'] = '0'*64
    refused(lambda: load(m), 'fixed_official_asset_bytes_changed_requires_new_reference', 'approved custom login bytes cannot be repinned through a final manifest')
    for path in (login_wide, login_portrait):
        m = copy.deepcopy(manifest)
        next(row for row in m['files'] if row['path'] == path)['sha256'] = '0' * 64
        refused(lambda m=m: load(m), 'fixed_official_asset_bytes_changed_requires_new_reference', 'each approved variant refuses final-manifest repinning: ' + path)

    # A required document may be a link/fetch target, never decorative CSS artwork.
    for url in ('/static/governance/olympus-governance-r6.pdf', '/static/qr-phase1.mjs', '/static/wow/login/dark-portal.webm'):
        refused(lambda url=url: gate.references(('a{background:url(' + url + ')}').encode(), 'worker/public/static/app.css', assets, prefixes, resources), 'unmanifested_css_asset_reference', 'non-image resource/video is not a CSS image/font allowance: ' + url)
    for raw in (b'<svg viewBox="0 0 1 1"></svg>', b'const image="data:image/png;base64,AA"', b'const font="data:font/woff;base64,AA"'):
        refused(lambda raw=raw: gate.references(raw, 'worker/public/static/qr-phase1.mjs', assets, prefixes, resources), 'embedded_or_custom_website_art_reference', 'module classification retains embedded artwork refusal')
    refused(lambda: gate.references(b'fetch("/static/governance/extra.pdf")', app, assets, prefixes, resources), 'unlisted_website_runtime_reference', 'resource directory does not grant a prefix exception')

    snapshot = temp / 'public-copy'
    for p in public:
        target = snapshot / p
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payloads[p])
    gate.validate_worktree_assets(snapshot, admitted)
    check(True, 'independent temporary worktree copy validates all539 required files')
    # Execute only the exact trusted finite checker copied into this temporary source-shaped fixture.
    # Its ROOT remains fixed relative to itself; no override, renderer, network or game input is used.
    checker = snapshot / login_verifier
    checker.parent.mkdir(parents=True, exist_ok=True)
    checker.write_bytes(payloads[login_verifier])

    def login_check():
        return subprocess.run([sys.executable, '-B', str(checker), '--check'], capture_output=True, text=True)

    measured = login_check()
    measured_report = json.loads(measured.stdout) if measured.returncode == 0 else {}
    check(measured.returncode == 0 and measured_report.get('status') == 'EXACT_REVIEWED_DERIVATIVE_BYTES_MATCH' and measured_report.get('sourceInputCount') == 28 and all(measured_report.get(key) == 0 for key in ('writes', 'network', 'gameFileReads')) and {row['path'] for row in measured_report.get('files', [])} == {login_video, login_poster}, 'the actual hash-pinned finite verifier accepts only this copied exact derivative closure without source-game reads or writes')
    for target_path in (login_video, login_poster, login_provenance):
        target = snapshot / target_path
        original = target.read_bytes()
        target.write_bytes(original + b'changed')
        rejected = login_check()
        target.write_bytes(original)
        report = json.loads(rejected.stderr) if rejected.stderr.strip() else {}
        check(rejected.returncode != 0 and report.get('status') == 'REFUSED' and report.get('qualified') is False, 'the actual finite verifier refuses changed bytes/provenance: ' + target_path)
    target = snapshot / login_video
    target.unlink()
    rejected = login_check()
    target.write_bytes(payloads[login_video])
    report = json.loads(rejected.stderr) if rejected.stderr.strip() else {}
    check(rejected.returncode != 0 and report.get('status') == 'REFUSED' and report.get('qualified') is False, 'the actual finite verifier refuses missing video instead of treating poster or metadata as completion')
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
