"""Exact precommit three-root policy reconciliation. Never commits, publishes or approves rollout."""
from pathlib import Path
from html.parser import HTMLParser
import argparse,hashlib,json,os,re,subprocess,sys
ROOT=Path(__file__).resolve().parent
V4_PINS={'stage_publication.py':'d06f6d56c9884f5cb9e7c07acde75ad5f812f0a77fe68589d49115ab68b358e9','validate_publication.py':'7dde5b31395831e9f243d9b0e88de3c097bbc4c018b1e4004c12e958db7bd851','publication_audit.py':'d4a059cb4d57b94ff540e626f1f5ab09d100bbb5208e139c9a4d293ed1df55ae','public_history.py':'77adf892a6366d0c8e3c20bd44ce516e8de5ad57f270c04bf07245452122e908','official_assets.py':'e71651112fb4e49676c58f21bc9ea01fe87d629fafaddffe943b401238ef5c79','official_asset_reference.json':'c09848e52e444683479c0fbe49d0b5c0dba48f6c865fa2f913251c113de8c325'}
for name,pin in V4_PINS.items():
 p=ROOT/name
 if p.is_symlink() or p.is_junction() or hashlib.sha256(p.read_bytes()).hexdigest()!=pin:raise ValueError('unchanged_v4_helper_pin_mismatch')
GUARD=ROOT/'pages_network_guard.cjs'
GUARD_SHA256='58d40e687a62d1a43bf8eabb90a9431ce84994db1e810651a919dc9b58ab4f13'
if GUARD.is_symlink() or GUARD.is_junction() or hashlib.sha256(GUARD.read_bytes()).hexdigest()!=GUARD_SHA256:raise ValueError('shipped_network_guard_pin_mismatch')
sys.path.insert(0,str(ROOT))
from publication_audit import git,git_run,tree,blobs,exact_head,validate_path,git_environment
from public_history import public_parent,all_objects,reachable_objects,tree_objects,refs
from validate_publication import validate as validate_v4
from official_assets import pinned_json
PUBLIC='e0c1fcee23f69bf61ad4054cd86a95c73d3413d9'
URL='https://github.com/SturmFernmelder/olympus-verify.git'
DISABLED='https://invalid.invalid/publication-disabled'
MAPPING={'policies/index.html':'index.html','policies/privacy.html':'privacy.html','policies/terms.html':'terms.html'}
POLICY_FILES=set(MAPPING)|{'worker/scripts/build-policy-content.mjs','worker/src/policy-content.ts','worker/src/policies.ts','worker/public/static/policies.css'}
GENERATOR='a17d609b3b30987ade103934dbf3b0d385a2398d5c57178192e542133e9cd2ba'
OLD_HASH={'index.html':'4589c64493c1a578a2f1683aa15ee24ac6b65cf05be0d3695e1ab9cd45f1fcd5','privacy.html':'e87a851d30d539edf3a58127bb9e33e3b03b149781c48b1ea94a807a36f33b62','terms.html':'3ee19ad76c8f8b8ecc7c044adc1859bf1dff65b2bb4d055c56013fc6fe180f72'}
sha=lambda b:hashlib.sha256(b).hexdigest()
def need(ok,code):
 if not ok:raise ValueError(code)
def pin_json(path,expected):return pinned_json(Path(path),expected,'reconciliation_input_pin_invalid')[0]
def pin_rows(rows,expected):
 need(isinstance(rows,list) and len(rows)==len(expected),'reconciliation_source_pin_coverage')
 result={}
 for r in rows:
  need(isinstance(r,dict) and set(r)=={'path','mode','blob','bytes','sha256'},'reconciliation_source_pin_shape')
  validate_path(r['path']);need(r['path'] in expected and r['path'].casefold() not in {p.casefold() for p in result},'reconciliation_source_pin_paths')
  need(r['mode']=='100644' and isinstance(r['bytes'],int) and not isinstance(r['bytes'],bool) and 0<r['bytes']<5*1024*1024 and re.fullmatch('[0-9a-f]{40}',r['blob']) and re.fullmatch('[0-9a-f]{64}',r['sha256']),'reconciliation_source_pin_shape')
  result[r['path']]=r
 return result
def identity(repo,head):
 exact_head(repo,head);need(git(repo,'rev-parse','HEAD').decode().strip()==head,'source_head_drift')
def no_links(path,stop):
 for p in (path,*path.parents):
  if p==stop.parent:break
  need(not p.is_symlink() and not p.is_junction(),'reconciliation_path_link')
def owned_namespace(binding,repos,synthetic):
 need(isinstance(binding,dict) and set(binding)=={'path','marker_sha256'},'owned_output_root_binding_required')
 value=binding['path'];need(isinstance(value,str) and not re.search(r'(?:^|[\\/])\.{1,2}(?:[\\/]|$)',value),'unsafe_owned_output_root')
 allowed=Path(value);need(allowed.is_absolute(),'require_absolute_owned_output_root')
 no_links(allowed,Path(allowed.anchor));need(allowed.is_dir() and str(allowed.resolve())==value,'owned_output_root_not_prepared_or_canonical')
 for repo in repos:need(not allowed.is_relative_to(repo) and not repo.is_relative_to(allowed),'owned_output_root_source_overlap')
 marker=pin_json(allowed/'.pages-reconciliation-owner.json',binding['marker_sha256'])
 need(set(marker)=={'schema','path','namespace_id','prepared_by','scope','synthetic_control'} and marker['schema']=='olympus-pages-owned-output-root-v1' and marker['path']==value and isinstance(marker['namespace_id'],str) and re.fullmatch('[0-9a-f]{64}',marker['namespace_id']) and marker['scope']=='exact_three_root_precommit_only' and marker['synthetic_control'] is synthetic,'owned_output_root_marker_binding_mismatch')
 need(marker['prepared_by']==('SYNTHETIC_CONTROL_NOT_ACTUAL_APPROVAL' if synthetic else 'root_codex'),'owned_output_root_owner_attribution')
 return allowed

def output_target(value,allowed):
 need(isinstance(value,str) and not re.search(r'(?:^|[\\/])\.{1,2}(?:[\\/]|$)',value),'unsafe_reconciliation_output')
 out=Path(value);need(out.is_absolute(),'require_absolute_reconciliation_output')
 need(out.parent.resolve()==allowed.resolve() and not out.exists() and re.fullmatch('[a-z0-9][a-z0-9-]{0,60}',out.name),'require_owned_new_reconciliation_output')
 no_links(out,allowed)
 for p in (out,out.parent/(out.name+'-manifest.json'),out.parent/(out.name+'-parity')):need(not p.exists(),'refuse_existing_reconciliation_output')
 return out
class Standalone(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.links=[];self.styles=[];self.inside_style=False;self.title=0;self.main=0
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  need(len(a)==len(attrs),'duplicate_policy_attribute')
  need(tag in {'html','head','meta','title','style','body','main','h1','h2','h3','h4','p','a','span','strong','b','em','i','ul','li','ol','small','br','code','pre','section','footer','hr','article','nav','header','div','dl','dt','dd','table','thead','tbody','tr','th','td','caption','blockquote','details','summary'},'policy_asset_script_or_form_dependency')
  need(not any(k.lower().startswith('on') or k.lower() in {'src','srcset','action','formaction','background','ping','attributionsrc'} for k in a),'policy_active_attribute')
  need(not (tag=='meta' and a.get('http-equiv','').lower()=='refresh'),'policy_refresh_dependency')
  if 'style' in a:css_static(a['style'])
  if tag=='a':
   h=a.get('href');need(isinstance(h,str) and h in {'./privacy.html','./terms.html'},'policy_relative_navigation');self.links.append(h)
  if tag=='style':self.inside_style=True;self.styles.append('')
  if tag=='title':self.title+=1
  if tag=='main':self.main+=1
 def handle_startendtag(self,tag,attrs):self.handle_starttag(tag,attrs);self.handle_endtag(tag)
 def handle_endtag(self,tag):
  if tag=='style':self.inside_style=False
 def handle_data(self,data):
  if self.inside_style:self.styles[-1]+=data
def css_static(value):
 # Policies need no escaped identifiers, resource functions or imported styles. Refuse ambiguous CSS rather than parse it as an asset allowlist.
 value=re.sub(r'/\*[\s\S]*?\*/','',value)
 need('\\' not in value and not re.search(r'(?i)url\s*\(|@import|@font-face|(?:expression|image-set|image|paint|src)\s*\(|https?:|(?<!:)//',value),'policy_CSS_dependency')
def standalone(data,path):
 try:text=data.decode('utf-8')
 except UnicodeDecodeError:raise ValueError('policy_not_utf8') from None
 need(len(data)<1024*1024 and '<!doctype html>' in text.lower(),'policy_document_shape')
 parser=Standalone();parser.feed(text);parser.close()
 expected=['./privacy.html','./terms.html'] if path=='index.html' else ['./terms.html'] if path=='privacy.html' else ['./privacy.html']
 need(sorted(parser.links)==sorted(expected) and parser.title==1 and parser.main==1 and len(parser.styles)==1,'policy_standalone_navigation_or_shell')
 for style in parser.styles:css_static(style)
 return {'path':path,'relative_links':parser.links,'scripts':0,'forms':0,'external_asset_dependencies':0,'embedded_stylesheets':1}
def verify_worktree(repo,rows):
 expected={r['path']:r for r in rows};payload=blobs(repo,[r['blob'] for r in rows]);found=set()
 for folder,dirs,files in os.walk(repo,followlinks=False):
  current=Path(folder);dirs[:]=[x for x in dirs if not (current==repo and x=='.git')]
  for name in dirs+files:no_links(current/name,repo)
  for name in files:
   p=current/name;relative=p.relative_to(repo).as_posix();need(relative in expected,'reconciliation_unlisted_worktree_path');found.add(relative)
   need(p.read_bytes()==payload[expected[relative]['blob']],'reconciliation_worktree_drift')
 need(found==set(expected),'reconciliation_missing_worktree_path')
def object_proof(repo,public,keeper,keeper_head,before,after=None,*,namespace):
 need(repo.is_absolute() and repo.parent.resolve()==namespace.resolve(),'reconciliation_repository_namespace')
 no_links(repo,namespace);need((repo/'.git').is_dir() and not (repo/'.git').is_symlink() and not (repo/'.git').is_junction(),'reconciliation_Git_directory_invalid')
 gd=Path(git(repo,'rev-parse','--absolute-git-dir').decode().strip())
 need(gd.resolve()==(repo/'.git').resolve(),'reconciliation_Git_directory_invalid')
 need(not any((gd/p).exists() for p in ('objects/info/alternates','shallow','info/grafts')),'reconciliation_object_indirection')
 parent=reachable_objects(public,PUBLIC);allowed=parent|tree_objects(repo,before)
 if after:allowed|=tree_objects(repo,after)
 need(not refs(repo),'reconciliation_extra_refs')
 need(all_objects(repo)==allowed,'reconciliation_unexpected_objects')
 need(git(repo,'rev-parse','HEAD').decode().strip()==PUBLIC,'reconciliation_public_head_drift')
 need(git(repo,'remote').decode().splitlines()==['origin'] and git(repo,'remote','get-url','origin').decode().strip()==URL and git(repo,'remote','get-url','--push','origin').decode().strip()==DISABLED,'reconciliation_remote_or_push_changed')
 commits=set(git(repo,'rev-list','--all').decode().splitlines());public_commits=set(git(public,'rev-list',PUBLIC).decode().splitlines());keeper_commits=set(git(keeper,'rev-list',keeper_head).decode().splitlines())
 need(commits==public_commits and not allowed.intersection(keeper_commits),'reconciliation_private_ancestry')
 return {'public_head':PUBLIC,'before_tree':before,'after_tree':after,'allowed_object_ids':sorted(allowed),'allowed_object_count':len(allowed),'refs':[],'keeper_commit_objects_absent':True,'push_disabled':True,'arbitrary_unreachable_objects_absent':True}
def approvals(contract,contract_hash,root_review,root_hash,claude_review,claude_hash,synthetic):
 for role,path,pin in [('root_codex',root_review,root_hash),('actual_claude_code',claude_review,claude_hash)]:
  r=pin_json(path,pin)
  need(r.get('reviewer_role')==role and r.get('scope')=='exact_three_root_policy_source_and_precommit_reconciliation' and r.get('approved') is True and r.get('index_content_reviewed') is True,'policy_review_scope_required')
  need(r.get('contract_sha256')==contract_hash and r.get('finalHead')==contract['finalHead'] and r.get('final_source_tree')==contract['final_source_tree'] and r.get('source_pins_sha256')==sha(json.dumps(contract['source_files'],sort_keys=True,separators=(',',':')).encode()) and r.get('generator_parity_receipt_sha256')==contract.get('generator_parity_receipt_sha256'),'policy_review_binding_mismatch')
  need(r.get('owned_output_root')==contract.get('owned_output_root') and r.get('owned_output_root_sha256')==sha(json.dumps(contract.get('owned_output_root'),sort_keys=True,separators=(',',':')).encode()),'owned_output_root_review_binding_mismatch')
  need(r.get('synthetic_control') is synthetic,'synthetic_review_flag_mismatch')
  if synthetic:need(r.get('attribution')=='SYNTHETIC_CONTROL_NOT_ACTUAL_APPROVAL','synthetic_review_attribution')
  else:need(isinstance(r.get('canonical_log_receipt_sha256'),str) and re.fullmatch('[0-9a-f]{64}',r['canonical_log_receipt_sha256']),'actual_attributable_review_receipt_required')
def parity(keeper,head,pins,out):
 payload=blobs(keeper,[r['blob'] for r in pins.values()]);need(pins['worker/scripts/build-policy-content.mjs']['sha256']==GENERATOR,'generator_change_requires_helper_successor')
 out.mkdir()
 for path,r in pins.items():
  p=out/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(payload[r['blob']])
 env=git_environment();env.update(CI='true',NODE_OPTIONS='--require "'+GUARD.as_posix()+'"')
 process=subprocess.run(['node',str(out/'worker/scripts/build-policy-content.mjs'),'--check'],cwd=out,env=env,capture_output=True,timeout=30)
 need(process.returncode==0,'same_final_generator_parity_failed')
 generated=payload[pins['worker/src/policy-content.ts']['blob']].decode('utf-8');checks=[]
 for file,key,other in [('privacy.html','PRIVACY','terms'),('terms.html','TERMS','privacy')]:
  source=payload[pins['policies/'+file]['blob']].decode('utf-8')
  main=re.search(r'<main>\n([\s\S]*?)\n</main>',source);need(main is not None,'policy_main_shape')
  documented=main.group(1).replace('<p class="meta" style="margin-top:2.5rem">See also the <a href="./'+other+'.html">','<p class="meta related">See also the <a href="/'+other+'">')
  line=next((x for x in generated.splitlines() if x.startswith('const '+key+' = ')),None);need(line is not None,'generated_policy_const_missing')
  html=json.loads(line[len('const '+key+' = '):-1]);body=re.search(r'<main id="policy-content" tabindex="-1">\n([\s\S]*?)\n</main>',html)
  need(body is not None and body.group(1)==documented and '<link rel="stylesheet" href="/static/policies.css">' in html and '<script' not in html.lower() and '<form' not in html.lower(),'generated_policy_shell_or_main_mismatch')
  checks.append({'policy':file,'source_sha256':pins['policies/'+file]['sha256'],'generated_document_sha256':sha(html.encode()),'documented_shell_transform_only':True})
 return {'finalHead':head,'final_source_tree':git(keeper,'rev-parse',head+'^{tree}').decode().strip(),'generator_sha256':GENERATOR,'generator_exit':0,'generated_TS_sha256':pins['worker/src/policy-content.ts']['sha256'],'CSS_sha256':pins['worker/public/static/policies.css']['sha256'],'checks':checks,'stdout_sha256':sha(process.stdout),'stderr_sha256':sha(process.stderr),'truth_or_license_approval':False}
def prepare(*,request,request_sha256,keeper,public,additive_manifest,additive_manifest_sha256,v4_receipt,v4_receipt_sha256,asset_contract,asset_contract_sha256,asset_manifest,asset_manifest_sha256,root_review,root_review_sha256,claude_review,claude_review_sha256,out,synthetic=False):
 c=pin_json(request,request_sha256)
 need(c.get('schema')=='olympus-pages-exact-policy-reconciliation-v2' and c.get('stageable') is True and isinstance(c.get('finalHead'),str) and re.fullmatch('[0-9a-f]{40}',c['finalHead']),'final_policy_source_not_approved')
 need(type(synthetic) is bool and c.get('synthetic_control',False) is synthetic,'synthetic_request_flag_mismatch')
 need(c.get('readyForPublication') is False and c.get('public_parent')==PUBLIC,'reconciliation_scope_or_public_parent')
 approvals(c,request_sha256,root_review,root_review_sha256,claude_review,claude_review_sha256,synthetic)
 need(isinstance(c.get('generator_parity_receipt'),str) and Path(c['generator_parity_receipt']).is_absolute() and isinstance(c.get('generator_parity_receipt_sha256'),str) and re.fullmatch('[0-9a-f]{64}',c['generator_parity_receipt_sha256']),'reviewed_parity_input_required')
 reviewed_parity=pin_json(c['generator_parity_receipt'],c['generator_parity_receipt_sha256'])
 keeper=Path(keeper).resolve();public=Path(public).resolve();identity(keeper,c['finalHead']);identity(public,PUBLIC)
 need(not git(keeper,'status','--porcelain','--untracked-files=no'),'final_source_worktree_or_index_drift')
 need(git(keeper,'rev-parse',c['finalHead']+'^{tree}').decode().strip()==c.get('final_source_tree'),'final_source_tree_drift')
 source={r['path']:r for r in tree(keeper,c['finalHead'])};pins=pin_rows(c.get('source_files'),POLICY_FILES);payload=blobs(keeper,[r['blob'] for r in pins.values()])
 for path,r in pins.items():
  need(source.get(path)=={'path':path,'mode':r['mode'],'blob':r['blob']} and sha(payload[r['blob']])==r['sha256'] and len(payload[r['blob']])==r['bytes'],'final_policy_source_pin_mismatch')
  no_links(keeper/path,keeper);need((keeper/path).read_bytes()==payload[r['blob']],'final_source_worktree_drift')
 maps=c.get('mappings');need(isinstance(maps,list) and len(maps)==3 and {r.get('source_path') for r in maps}==set(MAPPING),'fixed_three_root_mapping_required')
 for r in maps:
  need(r.get('target_path')==MAPPING.get(r['source_path']) and r.get('mode')=='100644','fixed_three_root_mapping_required')
  s,t=r['source_path'],r['target_path'];need(r.get('before_sha256')==OLD_HASH[t] and r.get('final_source_blob')==pins[s]['blob'] and r.get('final_source_sha256')==pins[s]['sha256'] and r.get('final_source_bytes')==pins[s]['bytes'] and r.get('final_target_blob')==pins[s]['blob'],'mapping_policy_pin_mismatch')
 before_manifest=pin_json(additive_manifest,additive_manifest_sha256)
 need(c.get('additive_v4_manifest_sha256')==additive_manifest_sha256 and c.get('additive_v4_staged_tree')==before_manifest.get('staged_tree') and c.get('additive_v4_validator_receipt_sha256')==v4_receipt_sha256,'additive_input_binding_mismatch')
 need(c.get('asset_contract_sha256')==asset_contract_sha256 and c.get('asset_manifest_sha256')==asset_manifest_sha256,'additive_asset_tuple_mismatch')
 before_receipt=pin_json(v4_receipt,v4_receipt_sha256)
 proof=validate_v4(Path(additive_manifest),keeper,public,asset_contract=Path(asset_contract),asset_contract_sha256=asset_contract_sha256,asset_manifest=Path(asset_manifest),asset_manifest_sha256=asset_manifest_sha256)
 need(proof==before_receipt and proof['keeper_head']==c['finalHead'] and proof['staged_tree']==c['additive_v4_staged_tree'],'unchanged_v4_receipt_mismatch')
 additive=Path(before_manifest['snapshot_path']).resolve();before=c['additive_v4_staged_tree'];before_rows=tree(additive,before);verify_worktree(additive,before_rows)
 public_rows=tree(public,PUBLIC);need({r['path'] for r in public_rows}==set(MAPPING.values()) and all(r['mode']=='100644' for r in public_rows),'exact_three_public_roots_required')
 index={r['path']:r for r in before_rows};public_data=blobs(public,[r['blob'] for r in public_rows])
 for r in public_rows:need(index[r['path']]==r and sha(public_data[r['blob']])==OLD_HASH[r['path']],'old_public_policy_drift')
 inspections=[]
 for s,t in MAPPING.items():
  need(index[s]['blob']==pins[s]['blob'] and index[s]['mode']=='100644','additive_policy_source_copy_mismatch');need(pins[s]['blob']!=index[t]['blob'],'require_exact_three_changed_roots')
  inspections.append(standalone(payload[pins[s]['blob']],t))
 namespace=owned_namespace(c.get('owned_output_root'),(keeper,public,additive),synthetic)
 target=output_target(out,namespace)
 for source_repo in (keeper,public,additive):need(not target.is_relative_to(source_repo) and not source_repo.is_relative_to(target),'reconciliation_source_output_overlap')
 parity_proof=parity(keeper,c['finalHead'],pins,target.parent/(target.name+'-parity'))
 need(parity_proof==reviewed_parity,'reviewed_same_final_generator_parity_mismatch')
 parent_proof=public_parent(public,PUBLIC,keeper,c['finalHead'],target)
 git(target,'remote','add','origin',URL);git(target,'remote','set-url','--push','origin',DISABLED)
 # Import only the additive tree closure, never keeper commits or an existing repository object store.
 request_objects=('\n'.join(sorted(tree_objects(additive,before)))+'\n').encode()
 pack=git_run(additive,'pack-objects','--stdout','--no-reuse-delta','--no-reuse-object',input=request_objects).stdout
 git_run(target,'index-pack','--stdin','--max-input-size=134217728',input=pack)
 git(target,'read-tree',before)
 before_payloads=blobs(additive,[r['blob'] for r in before_rows])
 for r in before_rows:
  p=target/r['path'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(before_payloads[r['blob']])
 pre=object_proof(target,public,keeper,c['finalHead'],before,namespace=namespace);verify_worktree(target,before_rows)
 replacements=[]
 for s,t in MAPPING.items():
  data=payload[pins[s]['blob']];oid=git_run(target,'hash-object','-w','--stdin','--no-filters',input=data).stdout.decode().strip();need(oid==pins[s]['blob'],'replacement_blob_drift')
  (target/t).write_bytes(data);replacements.append({'source_path':s,'target_path':t,'before':{**index[t],'bytes':len(public_data[index[t]['blob']]),'sha256':OLD_HASH[t]},'after':{**pins[s],'path':t}})
 git_run(target,'update-index','--index-info',input=''.join('100644 '+pins[s]['blob']+'\t'+t+'\n' for s,t in MAPPING.items()).encode())
 after=git(target,'write-tree').decode().strip();after_rows=tree(target,after);after_index={r['path']:r for r in after_rows}
 need(set(after_index)==set(index),'reconciled_path_set_changed')
 changes={p for p in index if index[p]!=after_index[p]};need(changes==set(MAPPING.values()),'non_three_root_reconciled_delta')
 for s,t in MAPPING.items():need(after_index[t]=={'path':t,'mode':'100644','blob':pins[s]['blob']} and after_index[s]==index[s],'reconciled_policy_copy_mismatch')
 verify_worktree(target,after_rows);owned_namespace(c['owned_output_root'],(keeper,public,additive),synthetic);post=object_proof(target,public,keeper,c['finalHead'],before,after,namespace=namespace)
 result={'kind':'exact_three_root_precommit_policy_reconciliation_integrity_only','finalHead':c['finalHead'],'final_source_tree':c['final_source_tree'],'request_sha256':request_sha256,
 'additive_manifest_sha256':additive_manifest_sha256,'additive_validator_receipt_sha256':v4_receipt_sha256,'additive_v4_staged_tree':before,'reconciled_staged_tree':after,'repository':str(target),'owned_output_root':c['owned_output_root'],
 'inputs':{'request':str(Path(request).resolve()),'root_review':str(Path(root_review).resolve()),'claude_review':str(Path(claude_review).resolve()),'additive_manifest':str(Path(additive_manifest).resolve()),'v4_receipt':str(Path(v4_receipt).resolve()),'asset_contract':str(Path(asset_contract).resolve()),'asset_manifest':str(Path(asset_manifest).resolve()),'asset_contract_sha256':asset_contract_sha256,'asset_manifest_sha256':asset_manifest_sha256,'generator_parity_receipt':str(Path(c['generator_parity_receipt']).resolve()),'generator_parity_receipt_sha256':c['generator_parity_receipt_sha256']},
 'before_rows':before_rows,'after_rows':after_rows,'exact_changed_paths':sorted(changes),'replacements':replacements,'source_files':list(pins.values()),'standalone_HTML_checks':inspections,'generator_parity':parity_proof,
 'before_object_proof':pre,'after_object_proof':post,'root_review_sha256':root_review_sha256,'actual_Claude_review_sha256':claude_review_sha256,'synthetic_control':synthetic,
 'approval_attribution':'SYNTHETIC_CONTROL_NOT_ACTUAL_APPROVAL' if synthetic else 'Externally pinned source-review receipts; no publication approval inferred',
 'new_commit_created':False,'new_refs_created':False,'keeper_private_ancestry_imported':False,'push_disabled':True,'release_ready':False,'readyForPublication':False,'provider_mutations':0,
 'remaining_gates':['Normal publication commit on public ancestry, exact eventual commit/ref/object proof and secret scan','Actual root and Claude final publication-head signatures','Owner-authorized push/Pages configuration/rename/live canonical readbacks']}
 path=target.parent/(target.name+'-manifest.json');path.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
 return result
def validate_precommit(receipt,receipt_sha256,*,keeper,public):
 r=pin_json(receipt,receipt_sha256);need(r.get('kind')=='exact_three_root_precommit_policy_reconciliation_integrity_only' and r.get('release_ready') is False and r.get('readyForPublication') is False and r.get('new_commit_created') is False,'invalid_reconciliation_receipt_phase')
 repo=Path(r['repository']);identity(Path(keeper),r['finalHead']);identity(Path(public),PUBLIC)
 need(not git(Path(keeper),'status','--porcelain','--untracked-files=no'),'final_source_worktree_or_index_drift')
 inputs=r['inputs'];c=pin_json(inputs['request'],r['request_sha256'])
 need(c['finalHead']==r['finalHead'] and c['final_source_tree']==r['final_source_tree'] and c['additive_v4_staged_tree']==r['additive_v4_staged_tree'],'reconciliation_request_source_drift')
 approvals(c,r['request_sha256'],inputs['root_review'],r['root_review_sha256'],inputs['claude_review'],r['actual_Claude_review_sha256'],r['synthetic_control'])
 need(r['source_files']==c['source_files'] and r['generator_parity']==pin_json(inputs['generator_parity_receipt'],inputs['generator_parity_receipt_sha256']) and inputs['generator_parity_receipt_sha256']==c['generator_parity_receipt_sha256'],'reviewed_same_final_generator_parity_mismatch')
 v4_original=pin_json(inputs['v4_receipt'],r['additive_validator_receipt_sha256'])
 need(sha(Path(inputs['additive_manifest']).read_bytes())==r['additive_manifest_sha256'],'additive_manifest_pin_drift')
 v4_now=validate_v4(Path(inputs['additive_manifest']),Path(keeper),Path(public),asset_contract=Path(inputs['asset_contract']),asset_contract_sha256=inputs['asset_contract_sha256'],asset_manifest=Path(inputs['asset_manifest']),asset_manifest_sha256=inputs['asset_manifest_sha256'])
 need(v4_original==v4_now and v4_now['staged_tree']==r['additive_v4_staged_tree'],'unchanged_v4_receipt_mismatch')
 additive_manifest=pin_json(inputs['additive_manifest'],r['additive_manifest_sha256'])
 need(r.get('owned_output_root')==c.get('owned_output_root'),'owned_output_root_receipt_binding_mismatch')
 namespace=owned_namespace(c.get('owned_output_root'),(Path(keeper).resolve(),Path(public).resolve(),Path(additive_manifest['snapshot_path']).resolve()),r['synthetic_control'])
 need(git(repo,'write-tree').decode().strip()==r['reconciled_staged_tree'],'reconciled_index_drift')
 need(tree(repo,r['additive_v4_staged_tree'])==r['before_rows'] and tree(repo,r['reconciled_staged_tree'])==r['after_rows'],'reconciliation_tree_receipt_drift')
 before={x['path']:x for x in r['before_rows']};after={x['path']:x for x in r['after_rows']}
 need(set(before)==set(after) and {p for p in before if before[p]!=after[p]}==set(MAPPING.values()),'non_three_root_reconciled_delta')
 pins=pin_rows(r['source_files'],POLICY_FILES);source={x['path']:x for x in tree(Path(keeper),r['finalHead'])};data=blobs(Path(keeper),[x['blob'] for x in pins.values()])
 for p,x in pins.items():need(source[p]=={'path':p,'mode':x['mode'],'blob':x['blob']} and sha(data[x['blob']])==x['sha256'] and len(data[x['blob']])==x['bytes'],'reconciliation_source_receipt_drift')
 need(git(Path(keeper),'rev-parse',r['finalHead']+'^{tree}').decode().strip()==r['final_source_tree'],'final_source_tree_drift')
 public_rows={x['path']:x for x in tree(Path(public),PUBLIC)}
 need(set(public_rows)==set(MAPPING.values()) and all(before[p]==x for p,x in public_rows.items()),'old_public_policy_drift')
 for s,t in MAPPING.items():need(after[s]==before[s] and after[t]=={'path':t,'mode':'100644','blob':pins[s]['blob']} and before[t]['mode']=='100644','reconciled_policy_copy_mismatch');standalone(data[pins[s]['blob']],t)
 verify_worktree(repo,r['after_rows']);proof=object_proof(repo,Path(public),Path(keeper),r['finalHead'],r['additive_v4_staged_tree'],r['reconciled_staged_tree'],namespace=namespace)
 need(proof==r['after_object_proof'],'reconciliation_object_receipt_drift')
 return {'result':'PASS','kind':'precommit_three_root_integrity_only','receipt_sha256':receipt_sha256,'before_tree':r['additive_v4_staged_tree'],'after_tree':r['reconciled_staged_tree'],'exact_replaced_paths':3,'release_ready':False,'readyForPublication':False,'actual_joint_publication_signature':False}
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['prepare','validate']);parser.add_argument('--arguments',type=Path,required=True);parser.add_argument('--arguments-sha256',required=True)
 a=parser.parse_args();values=pin_json(a.arguments,a.arguments_sha256);print(json.dumps(prepare(**values) if a.mode=='prepare' else validate_precommit(**values)))
