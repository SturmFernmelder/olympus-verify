"""Exact website byte gate: official assets and closed owner exceptions, not a release signature."""
from pathlib import Path
import hashlib
import json
import os
import re
from publication_audit import private_path, validate_path

REFERENCE_SHA256='2018466bda5a45eeb8cc3a9280e50f5c7b4178fce4b7e147684aefe3f9b2a2ba'
HASH=re.compile(r'[0-9a-f]{64}')
COMMIT=re.compile(r'[0-9a-f]{40}')
BRAND_EXCEPTION={'path': 'worker/public/static/olympus-icon.png', 'mode': '100644', 'bytes': 53204, 'sha256': '6363b15aff31a623aef0a6d7e52104fc44066f64852a328da788c84c325874eb'}
LOGIN_ART_EXCEPTION={'path': 'worker/public/static/wow/login/olympus-dark-portal.png', 'mode': '100644', 'bytes': 2761774, 'sha256': '7c344640d2dd628a6b235323cb27a2a8962ac4026a920d2c1809b652b1494342'}
LOGIN_ART_VARIANTS=[{'path': 'worker/public/static/wow/login/olympus-dark-portal-wide.png', 'mode': '100644', 'bytes': 2972596, 'sha256': '17661fd0184e3a20fd6ed366673e64fc66baef41ed378bfdf5ab9f3ed0a16dc6'}, {'path': 'worker/public/static/wow/login/olympus-dark-portal-portrait.png', 'mode': '100644', 'bytes': 2803728, 'sha256': '218063b8ba4e5496c659a310cb46cd26d5c14d4784a7e66f9497d968e1679659'}]
sha=lambda b:hashlib.sha256(b).hexdigest()

def pinned_json(path: Path, expected: str, failure: str) -> tuple[dict,bytes]:
    if not isinstance(expected,str) or not HASH.fullmatch(expected):raise ValueError(failure)
    if path.is_symlink() or path.is_junction():raise ValueError(failure)
    data=path.read_bytes()
    if len(data)>4*1024*1024 or sha(data)!=expected:raise ValueError(failure)
    def unique(pairs):
        out={}
        for key,value in pairs:
            if key in out:raise ValueError(failure)
            out[key]=value
        return out
    try:value=json.loads(data.decode('utf-8'),object_pairs_hook=unique)
    except (ValueError,UnicodeDecodeError,RecursionError):raise ValueError(failure) from None
    if not isinstance(value,dict):raise ValueError(failure)
    return value,data

def pin_rows(value, paths: set[str] | None, failure: str, *, maximum=512) -> dict[str,dict]:
    if not isinstance(value,list) or len(value)>maximum or (paths is not None and len(value)!=len(paths)):
        raise ValueError(failure)
    result={}
    for row in value:
        if not isinstance(row,dict) or set(row)!={'path','mode','bytes','sha256'}:raise ValueError(failure)
        validate_path(row['path'])
        if row['path'] in result or row['path'].casefold() in {p.casefold() for p in result} \
          or (paths is not None and row['path'] not in paths) or row['mode']!='100644' \
          or not isinstance(row['bytes'],int) or isinstance(row['bytes'],bool) or row['bytes']<=0 \
          or row['bytes']>5*1024*1024 or not isinstance(row['sha256'],str) or not HASH.fullmatch(row['sha256']):
            raise ValueError(failure)
        result[row['path']]=row
    if paths is not None and set(result)!=paths:raise ValueError(failure)
    return result

def runtime_path(path: str) -> bool:
    folded=path.casefold()
    return folded.startswith('worker/src/') \
      or (folded.startswith('worker/public/') and folded.endswith(('.css','.js','.mjs','.html')))

def resource_rows(value, failure: str) -> dict[str,dict]:
    # Reviewed documents, data and protocol code are required bytes, never an image/font exception.
    result=pin_rows(value,None,failure,maximum=55)
    if not result or any(not p.startswith('worker/public/static/') or (private_path(p) and not p.endswith('.zip'))
        or not (p.endswith(('.pdf','.zip','.json','.md','.txt','.html','.js','.mjs')) or p in {'worker/public/static/army-live/army.css','worker/public/static/treasury-plan207.css'}) for p in result):
        raise ValueError(failure)
    return result

def references(data: bytes, path: str, expected: dict[str,dict], prefixes: set[str],
               resources: dict[str,dict] | None = None) -> list[str]:
    try:text=data.decode('utf-8')
    except UnicodeDecodeError:raise ValueError('website_runtime_source_not_utf8') from None
    # Fixed source pins and reviewed finite dynamic maps remain necessary; this scanner is intentionally not a JS parser.
    if re.search(r'(?i)data\s*:\s*(?:image|font|application/font)|<\s*svg\b',text):
        raise ValueError('embedded_or_custom_website_art_reference')
    urls=set(re.findall(r'/static/[A-Za-z0-9_./-]*',text))
    for url in urls:
        if url in prefixes:continue
        # This one URL names a retired endpoint, not a fetchable public resource.
        # Admit it only in its exact authenticated 410 branch, never in consumers,
        # CSS, another source path, another status, or repeated URL references.
        retired='/static/army-live/olympus-army-addon-0.2.0.zip'
        retired_branch='''  if (path === RETIRED_ARMY_ZIP) {
    if (!["GET", "HEAD"].includes(request.method)) return method(request);
    const reader = await armyReader(request, env); if (reader instanceof Response) return reader;
    reader.check(); return privateArmyResponse(request, apiJson({ error: "standalone_army_addon_retired" }, 410));
  }'''
        if path=='worker/src/site-army.ts' and url==retired and text.count(retired)==1 \
          and ('const RETIRED_ARMY_ZIP = "'+retired+'";') in text and retired_branch in text:
            continue
        relative='worker/public'+url
        validate_path(relative)
        if relative not in expected and relative not in (resources or {}):
            raise ValueError('unlisted_website_runtime_reference')
    if path.endswith('.css'):
        for match in re.finditer(r'(?i)url\(\s*([\s\S]*?)\s*\)',text):
            value=match.group(1).strip().strip('"\'')
            if not value.startswith('/static/') or '\\' in value or '%' in value or '?' in value or '#' in value \
              or 'worker/public'+value not in expected or value=='/static/wow/login/dark-portal.webm':
                raise ValueError('unmanifested_css_asset_reference')
    return sorted(urls)

def login_art_variant_rows(value, restricted: set[str]) -> list[dict]:
    # The owner's .173 expansion is exactly two images, independently pinned, never a directory allowance.
    if not isinstance(value,dict) or set(value)!={'assets','usage','owner_instruction','instruction_date','classification'} \
      or value.get('assets')!=LOGIN_ART_VARIANTS or value.get('usage')!='login_background_only' \
      or value.get('owner_instruction')!='Build .173 owner-approved fullscreen wide and portrait login backgrounds' \
      or value.get('instruction_date')!='2026-10-19' \
      or value.get('classification')!='imagegen_derived_custom_art_not_official_blizzard' \
      or any(row['path'] in restricted for row in LOGIN_ART_VARIANTS):
        raise ValueError('owner_login_art_variants_shape_invalid')
    return value['assets']

def reference() -> dict:
    ref,_=pinned_json(Path(__file__).with_name('official_asset_reference.json'),REFERENCE_SHA256,
                      'official_asset_reference_pin_mismatch')
    keys={'schema','official_candidate_manifest_sha256','official_map_sha256','coverage_evidence_sha256',
          'reference_source_head','assets','required_public_resources','official_paths','native_paths','runtime_paths','runtime_prefixes',
          'required_documents','required_profile_paths','optional_profile_paths','provenance_path','banned_website_art_sha256',
          'approved_extractor','fixed_art_source_pins','limitations','brand_exception','login_art_exception','login_art_variants'}
    if set(ref)!=keys or ref.get('schema')!='olympus-official-website-reference-v2' \
      or not isinstance(ref['reference_source_head'],str) or not COMMIT.fullmatch(ref['reference_source_head']):
        raise ValueError('official_asset_reference_shape_invalid')
    for key in ('official_candidate_manifest_sha256','official_map_sha256','coverage_evidence_sha256'):
        if not isinstance(ref[key],str) or not HASH.fullmatch(ref[key]):raise ValueError('official_asset_reference_shape_invalid')
    for key in ('official_paths','native_paths','runtime_paths','required_documents','required_profile_paths'):
        value=ref[key]
        if not isinstance(value,list) or len(value)>512 or not value or any(not isinstance(p,str) for p in value) \
          or len(value)!=len(set(value)):raise ValueError('official_asset_reference_shape_invalid')
        for path in value:validate_path(path)
    brand=ref['brand_exception']
    if not isinstance(brand,dict) or set(brand)!={'asset','usage','owner_instruction','instruction_date'} \
      or brand.get('asset')!=BRAND_EXCEPTION or brand.get('usage')!='guild_brand_favicon_and_social_preview_only' \
      or brand.get('owner_instruction')!='Build .197 owner-supplied official tabard guild icon across every website shell' or brand.get('instruction_date')!='2026-10-24':
        raise ValueError('official_brand_exception_shape_invalid')
    login=ref['login_art_exception']
    if not isinstance(login,dict) or set(login)!={'asset','usage','owner_instruction','instruction_date','classification'} \
      or login.get('asset')!=LOGIN_ART_EXCEPTION or login.get('usage')!='login_background_only' \
      or login.get('owner_instruction')!='Build .172 owner-approved custom login background' \
      or login.get('instruction_date')!='2026-10-19' \
      or login.get('classification')!='ai_custom_art_not_official_blizzard' \
      or LOGIN_ART_EXCEPTION['path'] in set(ref['official_paths'])|set(ref['native_paths']):
        raise ValueError('owner_login_art_exception_shape_invalid')
    variants=login_art_variant_rows(ref['login_art_variants'],set(ref['official_paths'])|set(ref['native_paths']))
    assets=pin_rows(ref['assets'],set(ref['official_paths'])|set(ref['native_paths'])|{ref['provenance_path'],BRAND_EXCEPTION['path'],LOGIN_ART_EXCEPTION['path']}|{row['path'] for row in variants},
                    'official_asset_reference_shape_invalid')
    resources=resource_rows(ref['required_public_resources'],'official_public_resource_reference_shape_invalid')
    if {p.casefold() for p in resources}&{p.casefold() for p in assets} \
      or not {p for p in resources if runtime_path(p)}.issubset(ref['runtime_paths']):
        raise ValueError('official_public_resource_reference_shape_invalid')
    if set(ref['official_paths']) & set(ref['native_paths']) or len(ref['official_paths'])!=494 \
      or any(not p.startswith('worker/public/static/wow/') for p in ref['official_paths']) \
      or any(not p.endswith(('.css','.js')) for p in ref['native_paths']) \
      or any(not runtime_path(p) for p in ref['runtime_paths']) \
      or set(ref['required_documents'])!={'LICENSE','README.md','CLAUDE.md','THIRD_PARTY_NOTICES.md',
            'docs/source-provenance.md','docs/design.md','docs/deploy-checklist.md','docs/treasury-plan207.md'}:
        raise ValueError('official_asset_reference_shape_invalid')
    if {p for p in ref['official_paths'] if p.endswith('.webm')}!={'worker/public/static/wow/login/dark-portal.webm'} \
      or 'worker/public/static/wow/login/dark-portal-poster.jpg' not in ref['official_paths'] \
      or 'worker/public/static/wow/login/dark-portal-provenance.json' not in resources \
      or 'worker/src/site-access.ts' not in ref['runtime_paths']:
        raise ValueError('official_asset_reference_shape_invalid')
    if not isinstance(ref['runtime_prefixes'],list) or any(not isinstance(p,str)
        or not re.fullmatch(r'/static/(?:wow|rank-planner|army-live)?/?',p) for p in ref['runtime_prefixes']) \
        or len(set(ref['runtime_prefixes']))!=len(ref['runtime_prefixes']):
        raise ValueError('official_asset_reference_shape_invalid')
    if not isinstance(ref['banned_website_art_sha256'],list) or any(not isinstance(h,str) or not HASH.fullmatch(h)
      for h in ref['banned_website_art_sha256']):raise ValueError('official_asset_reference_shape_invalid')
    extractor=pin_rows([ref['approved_extractor']],{'tools/build-site-assets.py'},'official_asset_reference_shape_invalid')
    fixed=pin_rows(ref['fixed_art_source_pins'],None,'official_asset_reference_shape_invalid')
    if set(fixed)!={'worker/src/site-data.ts','worker/src/site-ranks.ts','worker/public/static/app.js',
                    'worker/public/static/rank-planner/app.js','worker/src/site-core.ts','tools/build-talent-art.py','tools/check-login-portal.py'} \
      or not (set(fixed)-{'tools/build-talent-art.py','tools/check-login-portal.py'}).issubset(ref['runtime_paths']):
        raise ValueError('official_asset_reference_shape_invalid')
    if set(ref['required_profile_paths'])!={'worker/wrangler.toml','worker/wrangler.cutover.toml',
          'scripts/cutover-config.sh','scripts/tests/cutover-config.test.sh',
          'worker/tests/account_copy_test.cjs','.github/workflows/ci.yml'}:
        raise ValueError('official_asset_reference_shape_invalid')
    if ref['optional_profile_paths']!=['worker/wrangler.cutover.applied']:
        raise ValueError('official_asset_reference_shape_invalid')
    ref['_assets']=assets
    ref['_resources']=resources
    ref['_extractor']=extractor
    ref['_fixed_art_sources']=fixed
    return ref

def load_contract(contract_path: Path, contract_hash: str, asset_path: Path, asset_hash: str, keeper_head: str) -> dict:
    ref=reference()
    c,_=pinned_json(contract_path,contract_hash,'official_asset_contract_pin_mismatch')
    a,_=pinned_json(asset_path,asset_hash,'official_asset_manifest_pin_mismatch')
    if set(c)!={'schema','keeper_head','finalHead','stageable','scope','asset_manifest_sha256','provenance_sha256','documents','profile_files'} \
      or c.get('schema')!='olympus-publication-official-assets-contract-v1' \
      or c.get('scope')!='byte_gate_only_pending_final_publication_review':raise ValueError('official_asset_contract_shape_invalid')
    if c.get('stageable') is not True:raise ValueError('official_asset_contract_not_stageable')
    if not isinstance(keeper_head,str) or not COMMIT.fullmatch(keeper_head) or c.get('keeper_head')!=keeper_head \
      or c.get('finalHead')!=keeper_head or a.get('keeper_head')!=keeper_head:raise ValueError('official_asset_source_head_mismatch')
    if c.get('asset_manifest_sha256')!=asset_hash:raise ValueError('official_asset_contract_manifest_binding_mismatch')
    if set(a)!={'schema','keeper_head','official_candidate_manifest_sha256','reference_sha256','files','required_public_resources',
                   'runtime_files','reference_coverage','excluded_public_files'} \
      or a.get('schema')!='olympus-selected-official-public-assets-v2' \
      or a.get('official_candidate_manifest_sha256')!=ref['official_candidate_manifest_sha256'] \
      or a.get('reference_sha256')!=REFERENCE_SHA256:raise ValueError('official_asset_manifest_shape_invalid')
    assets=pin_rows(a['files'],set(ref['_assets']),'official_asset_manifest_file_pin_invalid')
    resources=resource_rows(a['required_public_resources'],'official_public_resource_pin_invalid')
    if resources!=ref['_resources']:raise ValueError('public_resource_change_requires_reviewed_reference_successor')
    # Art/fonts/provenance remain fixed; native UI and runtime code require explicit final source-bound re-pins.
    for path,row in ref['_assets'].items():
        if path not in ref['native_paths'] and assets[path]!=row:
            raise ValueError('fixed_official_asset_bytes_changed_requires_new_reference')
    runtime=pin_rows(a['runtime_files'],None,'official_runtime_file_pin_invalid')
    if not set(ref['runtime_paths']).issubset(runtime) or any(not runtime_path(path) for path in runtime):
        raise ValueError('official_runtime_file_pin_invalid')
    public={**assets,**resources}
    for path in set(runtime)&set(public):
        if runtime[path]!=public[path]:raise ValueError('official_runtime_public_pin_binding_mismatch')
    coverage=a['reference_coverage']
    if not isinstance(coverage,list) or len(coverage)!=len(runtime):raise ValueError('official_runtime_coverage_shape_invalid')
    covered={}
    for row in coverage:
        if not isinstance(row,dict) or set(row)!={'path','references'} or row['path'] not in runtime \
          or row['path'] in covered or not isinstance(row['references'],list) \
          or any(not isinstance(url,str) for url in row['references']) \
          or row['references']!=sorted(set(row['references'])):raise ValueError('official_runtime_coverage_shape_invalid')
        covered[row['path']]=row['references']
    excluded=pin_rows(a['excluded_public_files'],None,'official_unselected_public_pin_invalid',maximum=256)
    for path in excluded:
        if not path.startswith('worker/public/') or path in public or path in runtime or private_path(path):
            raise ValueError('official_unselected_public_pin_invalid')
    docs=pin_rows(c['documents'],set(ref['required_documents']),'official_asset_required_document_pin_invalid')
    profile=pin_rows(c['profile_files'],None,'official_asset_profile_pin_invalid')
    if not set(ref['required_profile_paths']).issubset(profile) or not set(profile).issubset(
       set(ref['required_profile_paths'])|set(ref['optional_profile_paths'])):
        raise ValueError('official_asset_profile_pin_invalid')
    if c.get('provenance_sha256')!=assets[ref['provenance_path']]['sha256']:
        raise ValueError('official_asset_provenance_binding_mismatch')
    return {'contract':c,'assets':assets,'required_public_resources':resources,'documents':docs,'profile_files':profile,'runtime_files':runtime,'reference_coverage':covered,
      'excluded_public_files':excluded,'reference':ref,'contract_sha256':contract_hash,'asset_manifest_sha256':asset_hash}

def exact_public_resource(path: str, mode: str, data: bytes, contract: dict) -> bool:
    pin=contract['required_public_resources'].get(path)
    return pin is not None and mode==pin['mode'] and len(data)==pin['bytes'] and sha(data)==pin['sha256']

def validate_result_tree(rows: list[dict], payloads: dict[str,bytes], contract: dict) -> dict:
    ref=contract['reference']
    expected={**contract['assets'],**contract['required_public_resources']}
    found={}
    by_path={}
    official_by_hash={}
    for path in ref['official_paths']:official_by_hash.setdefault(expected[path]['sha256'],set()).add(path)
    for row in rows:
        path=row['path']
        validate_path(path)
        if path in by_path or path.casefold() in {p.casefold() for p in by_path}:raise ValueError('duplicate_result_tree_path')
        by_path[path]=row
        data=payloads[path]
        # The general archive refusal still applies unless this exact required public resource was source-pinned.
        if private_path(path) and not exact_public_resource(path,row['mode'],data,contract):
            raise ValueError('private_runtime_path_in_result')
        if sha(data)==BRAND_EXCEPTION['sha256'] and path!=BRAND_EXCEPTION['path']:
            raise ValueError('brand_exception_payload_at_unlisted_path')
        if sha(data)==LOGIN_ART_EXCEPTION['sha256'] and path!=LOGIN_ART_EXCEPTION['path']:
            raise ValueError('login_art_exception_payload_at_unlisted_path')
        if any(sha(data)==pin['sha256'] and path!=pin['path'] for pin in LOGIN_ART_VARIANTS):
            raise ValueError('login_art_variant_payload_at_unlisted_path')
        if path.startswith('worker/public/'):
            exact_exception=any(path==pin['path'] and sha(data)==pin['sha256'] for pin in (BRAND_EXCEPTION,LOGIN_ART_EXCEPTION,*LOGIN_ART_VARIANTS))
            if sha(data) in ref['banned_website_art_sha256'] and not exact_exception:raise ValueError('nonofficial_website_art_payload_in_result')
            if path not in expected:raise ValueError('unlisted_public_asset_in_result')
            pin=expected[path]
            if row['mode']!=pin['mode'] or len(data)!=pin['bytes'] or sha(data)!=pin['sha256']:
                raise ValueError('public_asset_byte_or_mode_pin_mismatch')
            found[path]=data
        # Approved official bytes may only be redistributed at their manifest-listed paths.
        # This detects renamed images/fonts in the complete additive tree without banning their approved use.
        if sha(data) in official_by_hash and path not in official_by_hash[sha(data)]:
            raise ValueError('official_asset_payload_at_unlisted_path')
        if sha(data)==ref['approved_extractor']['sha256'] and path!=ref['approved_extractor']['path']:
            raise ValueError('approved_extractor_payload_at_unlisted_path')
        if runtime_path(path) and path not in contract['runtime_files']:
            raise ValueError('unreviewed_website_runtime_source_in_result')
        if path in ref['optional_profile_paths'] and path not in contract['profile_files']:
            raise ValueError('unreviewed_optional_profile_source_in_result')
    if set(found)!=set(expected):raise ValueError('missing_required_public_asset_in_result')
    for group,failure in ((contract['documents'],'required_provenance_document_pin_mismatch'),
                          (contract['runtime_files'],'website_runtime_file_pin_mismatch'),
                          (contract['profile_files'],'required_profile_source_pin_mismatch'),
                          (ref['_extractor'],'approved_asset_extractor_pin_mismatch'),
                          (ref['_fixed_art_sources'],'art_source_change_requires_reviewed_reference_successor')):
        for path,pin in group.items():
            data=payloads.get(path)
            row=by_path.get(path)
            if data is None or row is None:raise ValueError('missing_required_document_or_runtime_source')
            if row['mode']!=pin['mode'] or len(data)!=pin['bytes'] or sha(data)!=pin['sha256']:raise ValueError(failure)
            try:data.decode('utf-8')
            except UnicodeDecodeError:raise ValueError('required_document_or_runtime_source_not_utf8') from None
    prefix=set(ref['runtime_prefixes'])
    for path in contract['runtime_files']:
        if references(payloads[path],path,contract['assets'],prefix,contract['required_public_resources'])!=contract['reference_coverage'][path]:
            raise ValueError('website_runtime_reference_coverage_mismatch')
    return {'kind':'reviewed_website_assets_official_and_closed_owner_exceptions_runtime_references_and_document_bytes_only','result':'PASS',
      'contract_sha256':contract['contract_sha256'],'asset_manifest_sha256':contract['asset_manifest_sha256'],
      'reference_sha256':REFERENCE_SHA256,'official_candidate_manifest_sha256':ref['official_candidate_manifest_sha256'],
      'official_map_sha256':ref['official_map_sha256'],'coverage_evidence_sha256':ref['coverage_evidence_sha256'],
      'keeper_head':contract['contract']['keeper_head'],'public_asset_count':len(expected),
      'required_non_art_resource_pins_verified':len(contract['required_public_resources']),
      'official_image_font_count':sum(not p.endswith('.webm') for p in ref['official_paths']),
      'official_video_count':sum(p.endswith('.webm') for p in ref['official_paths']),
      'official_art_file_count':len(ref['official_paths']),'native_public_file_count':len(ref['native_paths']),
      'required_document_pins_verified':len(contract['documents']),'runtime_source_pins_verified':len(contract['runtime_files']),
      'profile_source_pins_verified':len(contract['profile_files']),
      'exact_reviewed_extractor_verified':True,'extractor_automatically_executed':False,
      'fixed_art_source_pins_verified':len(ref['_fixed_art_sources']),
      'brand_exception_byte_pin_verified':True,'brand_exception':ref['brand_exception'],
      'login_art_exception_byte_pin_verified':True,'login_art_exception':ref['login_art_exception'],
      'login_art_variants_byte_pins_verified':True,'login_art_variants':ref['login_art_variants'],
      'nonofficial_owner_approved_login_art_count':3,
      'owner_authorization_not_verified_by_helper':True,
      'runtime_reference_coverage_verified':True,'complete_result_tree_checked':True,
      'publisher_archive_build_attestation':False,'redistribution_license_acceptance':False,
      'document_content_acceptance':False,'joint_signature':False,'readyForPublication':False}

def validate_worktree_assets(snapshot: Path, contract: dict) -> None:
    expected={**contract['assets'],**contract['required_public_resources']}
    root=snapshot/'worker/public'
    if not root.is_dir() or root.is_symlink() or root.is_junction():raise ValueError('public_asset_worktree_invalid')
    found=set()
    for folder,dirs,files in os.walk(root,followlinks=False):
        for name in dirs+files:
            item=Path(folder)/name
            if item.is_symlink() or item.is_junction():raise ValueError('public_asset_worktree_link_refused')
        for name in files:
            item=Path(folder)/name
            path=item.relative_to(snapshot).as_posix()
            if path not in expected:raise ValueError('unlisted_public_asset_in_worktree')
            pin=expected[path]
            data=item.read_bytes()
            if len(data)!=pin['bytes'] or sha(data)!=pin['sha256']:raise ValueError('public_asset_worktree_pin_mismatch')
            found.add(path)
    if found!=set(expected):raise ValueError('missing_public_asset_in_worktree')
