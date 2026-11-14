// Behavior mutants for the actual Native cleanup fixture. No product files are edited.
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const replace=(source,from,to)=>{if(!source.includes(from))throw Error('mutation_site_not_found');return source.split(from).join(to);};
const definitions={
 'manifest-filter-before-bound':{cases:['manifest-input-bound'],change:s=>replace(s,'FROM(SELECT * FROM audit WHERE ${FAMILY} ORDER BY id LIMIT ${MAX_ROWS+1})\n WHERE NOT (${INVALID}) ORDER BY id','FROM audit WHERE ${FAMILY} AND NOT (${INVALID}) ORDER BY id LIMIT ${MAX_ROWS+1}')},
 'invalid-row-manifest-unfiltered':{cases:['duplicate-note-ffi'],change:s=>replace(s,' WHERE NOT (${INVALID}) ORDER BY id',' ORDER BY id')},
 'status-not-awaited':{cases:['status-existing-failure','status-aftercommit-failure','status-read-failure'],change:s=>replace(s,'return await status(env);','return status(env);')},
 'representation-not-classified':{cases:['representation'],change:s=>replace(s,'OR ${INVALID_NOTE_REPRESENTATION}','OR 0')},
 'malformed-marker-refused':{cases:['malformed-marker'],change:s=>{const a=s.indexOf('async function status('),b=s.indexOf('export async function receiptNoteMaintenance280',a);if(a<0||b<a)throw Error('mutation_status_boundary');return s.slice(0,a)+replace(s.slice(a,b),'return unconfirmed();','return refused();')+s.slice(b);}},
 'loose-operation-id':{cases:['malformed-marker'],change:s=>replace(s,'/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/','/^[a-f0-9-]{36}$/')},
 'unclassified-count-omitted':{cases:['unsupported-count'],change:s=>replace(s,'if(scope.invalid)return refused(scope.invalid);','if(scope.invalid)return refused();')},
 'handler-page-guard-removed':{cases:['page-version'],change:s=>replace(s," if(request.headers.get('X-Olympus')!==PAGE_VERSION)return apiJson({error:'page_outdated'},409);",'')},
 'capacity-false-zero':{cases:['capacity'],change:s=>replace(s,'if(!scope||scope.rows>MAX_ROWS)return refused();','if(!scope||scope.rows>MAX_ROWS)return refused(scope?.invalid);')},
 'flat-unicode-expression':{cases:['supported-apply'],change:s=>{const a=s.indexOf('const balancedOr='),b=s.indexOf('const INVALID_NOTE_UNICODE=',a);if(a<0||b<a)throw Error('mutation_balance_boundary');return s.slice(0,a)+"const balancedOr=(parts:readonly string[]):string=>parts.join(' OR ');\n"+s.slice(b);}},
};
module.exports={definitions};
if(require.main===module){
 const args=process.argv.slice(2),outArg=args.indexOf('--out');if(outArg<0||!args[outArg+1])throw Error('Pass --out <evidence-directory>');const out=path.resolve(args[outArg+1]);fs.mkdirSync(out,{recursive:true});const results=[];
 for(const [name,d] of Object.entries(definitions)){
  const dir=path.join(out,name),r=cp.spawnSync(process.execPath,[path.join(__dirname,'receipt_notes280_workerd_test.cjs'),'--out',dir,'--phase','canonical','--case',d.cases.join(','),'--mutation',name],{encoding:'utf8',maxBuffer:4*1024*1024});fs.writeFileSync(path.join(out,name+'.log'),(r.stdout||'')+(r.stderr||''));
  const receiptPath=path.join(dir,'receipt-notes280-canonical.json');let receipt=null;if(fs.existsSync(receiptPath))receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
  const failed=receipt?.results.flatMap(x=>(x.result.cases||[]).filter(c=>!c.pass).map(c=>c.name))||[],killed=r.status===1&&receipt?.ok===false&&failed.length>0&&receipt.ownedInputsStable&&receipt.compiledStable;
  results.push({name,cases:d.cases,exitCode:r.status,killed,failedChecks:failed,receipt:receiptPath,bundleSHA256:receipt?.bundleSHA256,effectiveModuleSHA256:receipt?.mutation?.effectiveModuleSHA256,error:r.error?String(r.error):null});
  console.log((killed?'KILLED ':'NOT-QUALIFIED ')+name+' '+failed.length+' failed behavioral checks');
 }
 const report={schema:'receipt-note-cleanup280-native-mutation-v1',at:new Date().toISOString(),ok:results.every(x=>x.killed),results,scope:'Each negative modifies only the in-memory cleanup module at esbuild load; fixture/index/Native/session checks unchanged. A setup failure does not kill a mutant.'};fs.writeFileSync(path.join(out,'MUTATIONS.json'),JSON.stringify(report,null,2)+'\n');if(!report.ok)process.exitCode=1;
}
