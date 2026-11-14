import argparse,json,sqlite3,hashlib,re
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('--receipt',action='append',required=True);ap.add_argument('--out',required=True);a=ap.parse_args();report={'scope':'Offline SQLite EXPLAIN only of original actual Native statements/schema, not Native acceptance; no SQL text rewrite or business execution. Limits above100 only measure a diagnostic minimum, never a shipping limit increase. The original statements/allMeasuredAtLeastTwoMargin cover only claims, final guards and NoEffect CAS; allSettlementStatements separately reports every actual role_settlements reference in the supplied captured paths.','sqlite':sqlite3.sqlite_version,'inputs':[],'statements':[],'allSettlementStatements':[]};seen={}
def outer(sql):
 depth=0;quote=None;i=0
 while i<len(sql):
  c=sql[i]
  if quote:
   if c==quote:
    if i+1<len(sql) and sql[i+1]==quote:i+=2;continue
    quote=None
   i+=1;continue
  if c in ["'",'"','`']:quote=c;i+=1;continue
  if sql.startswith('--',i):
   j=sql.find('\n',i);i=len(sql) if j<0 else j+1;continue
  if sql.startswith('/*',i):
   j=sql.find('*/',i+2);i=len(sql) if j<0 else j+2;continue
  if c=='(':depth+=1
  elif c==')':depth-=1
  elif depth==0 and (c.isalpha() or c=='_'):
   j=i+1
   while j<len(sql) and (sql[j].isalnum() or sql[j]=='_'):j+=1
   word=sql[i:j].upper()
   if word in ['SELECT','UPDATE','INSERT','DELETE']:return word,sql[i:]
   i=j;continue
  i+=1
 return None,''

def settlement_reference(sql):
 # Catalogue SQL may contain a table name inside quoted DDL data. It is not
 # an executed table reference; keep quoted identifiers, omit string/comments.
 executable=re.sub(r"'(?:''|[^'])*'|--[^\n]*|/\*[\s\S]*?\*/",' ',sql)
 return re.search(r'\brole_settlements\b',executable,re.I) is not None

def statement_name(op,body,params):
 reason=re.search(r"\breason=(?:'([a-z0-9_]+)'|\?(\d+))",body)
 value=reason.group(1) if reason else None
 if reason and reason.group(2):
  at=int(reason.group(2))-1
  candidate=params[at] if at<len(params) else None
  if isinstance(candidate,str) and re.fullmatch(r'(?:launch230|native232|canonical233|canonical239|ban_rank1112)_[a-z0-9_]+',candidate):value=candidate
 return str(op).lower()+'-role_settlements'+(':'+value if value else '')

for source in a.receipt:
 path=Path(source);receipt=json.loads(path.read_text(encoding='utf8'));seedpath=path.parent/'seed.json';seed=json.loads(seedpath.read_text(encoding='utf8'));db=sqlite3.connect(':memory:',cached_statements=0)
 for kind in ['table','index','trigger']:
  for obj in seed['objects']:
   if obj['type']==kind and obj.get('sql') and not obj['name'].startswith('sqlite_'):db.execute(obj['sql'])
 report['inputs'].append({'receipt':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'seedSHA256':hashlib.sha256(seedpath.read_bytes()).hexdigest()})
 cases=receipt.get('cases',[])
 if not cases or not isinstance(cases[0],dict) or 'wires' not in cases[0]:cases=[x['result'] for x in receipt.get('results',[])]
 for case in cases:
  for wi,wire in enumerate(case.get('wires',[])):
   packets=json.loads(wire['requestBody']);packets=packets if isinstance(packets,list) else [packets]
   for pi,packet in enumerate(packets):
    sql=packet['sql'];params=packet.get('params',[]);kind=None
    op,body=outer(sql)
    if op=='UPDATE' and "reason='launch230_dispatching'" in body:kind='consumed-first-claim'
    elif op=='UPDATE' and "reason='native232_dispatching'" in body:kind='routine-first-claim'
    elif op=='UPDATE' and "reason='canonical233_migration_dispatching'" in body:kind='migration-first-claim'
    elif op=='UPDATE' and "UPDATE role_settlements SET state='held',reason=?" in body and 'original_refusal_source280' in sql:kind='NoEffect-primary-CAS'
    elif op=='SELECT' and 'SELECT 1 AS admitted FROM role_settlements WHERE' in body:kind='consumed-final-guard'
    elif op=='SELECT' and body.startswith('SELECT 1 FROM role_settlements WHERE'):
     if "purpose='canonical_migration" in body or 'c239_migration_effect_tuple280' in sql:kind='migration-final-guard'
     elif 'canonical_routine233' in params:kind='routine-final-guard'
    settlement=settlement_reference(sql)
    if kind is None and not settlement:continue
    digest=hashlib.sha256(sql.encode()).hexdigest()
    occurrence={'case':case.get('kind'),'wire':wi,'packet':pi,'sourceReceipt':str(path)}
    if digest in seen:
     seen[digest]['occurrences'].append(occurrence);continue
    def probe(limit):
     db.setlimit(sqlite3.SQLITE_LIMIT_EXPR_DEPTH,limit)
     try:db.execute('EXPLAIN '+sql,params).fetchall();return {'ok':True}
     except sqlite3.Error as exc:return {'ok':False,'error':str(exc)}
    p100=probe(100);p98=probe(98);lo,hi=1,160
    if not probe(hi)['ok']:minimum=None
    else:
     while lo<hi:
      mid=(lo+hi)//2
      if probe(mid)['ok']:hi=mid
      else:lo=mid+1
     minimum=lo
    measured={'kind':kind or statement_name(op,body,params),'case':case.get('kind'),'wire':wi,'packet':pi,'sourceReceipt':str(path),'sha256':digest,'bytes':len(sql.encode()),'binds':len(params),'at98':p98,'at100':p100,'minimum':minimum,'marginUnder100':None if minimum is None else 100-minimum,'occurrences':[occurrence]};seen[digest]=measured
    if kind is not None:report['statements'].append(measured)
    if settlement:report['allSettlementStatements'].append(measured)
 db.close()
report['allMeasuredAtLeastTwoMargin']=bool(report['statements']) and all(s['minimum'] is not None and s['minimum']<=98 for s in report['statements'])
report['allSettlementStatementsCompileAt100']=bool(report['allSettlementStatements']) and all(s['at100']['ok'] for s in report['allSettlementStatements'])
report['zeroMargin']=[s for s in report['allSettlementStatements'] if s['minimum']==100]
Path(a.out).write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps({'statements':len(report['statements']),'allMargin2':report['allMeasuredAtLeastTwoMargin'],'ranges':[(s['kind'],s['minimum'],s['bytes'],s['binds'])for s in report['statements']],'allSettlementStatements':len(report['allSettlementStatements']),'allSettlementStatementsCompileAt100':report['allSettlementStatementsCompileAt100'],'zeroMargin':[(s['kind'],s['sha256'],s['minimum'])for s in report['zeroMargin']]}))
