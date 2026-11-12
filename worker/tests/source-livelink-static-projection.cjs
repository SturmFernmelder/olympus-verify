"use strict";
// Live Link membership: one exact, counted prepend over the reviewed .240 role-settlements.ts, then the unchanged
// source239-migration-static-projection.cjs chain (which stays byte-pinned by its callers). Static only: the
// reconstructed source is text, never executed, and never passed to the runtime TypeScript loader.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const H=x=>crypto.createHash('sha256').update(x).digest('hex'),need=(v,c)=>{if(!v)throw Error(c);};
const base=require('./source239-migration-static-projection.cjs');
const bytes=fs.readFileSync(path.join(__dirname,'fixtures/reviewed-livelink-role-prepend.json'));
const live=JSON.parse(bytes.toString('utf8'));
need(live.schema==='source-livelink-exact-role-prepend-v1'&&live.file==='role-settlements.ts'&&live.predecessorSHA256===base.metadata.current&&live.predecessorBytes===321728&&live.edits.length>0,'LIVELINK_PREPEND_SCOPE_CHANGED');
for(const e of live.edits)need(e.count===1&&typeof e.from==='string'&&e.from.length>0&&typeof e.to==='string'&&e.from!==e.to&&H(e.from)===e.fromSHA256&&H(e.to)===e.toSHA256,'LIVELINK_COUNTED_CONTEXT_CHANGED');
/** The exact .240 source, or null when `raw` is not exactly the reviewed Live Link source. */
function toV240(raw){
  if(typeof raw!=='string'||Buffer.byteLength(raw)!==live.currentBytes||H(raw)!==live.currentSHA256)return null;
  let prior=raw;for(const e of live.edits){if(prior.split(e.from).length!==2)return null;prior=prior.replace(e.from,()=>e.to);}
  return Buffer.byteLength(prior)===live.predecessorBytes&&H(prior)===live.predecessorSHA256?prior:null;
}
function inverse(raw){const prior=toV240(raw);return prior===null?null:base.inverse(prior);}
/** A disposable directory whose role-settlements.ts is the reconstructed .240 text (all other files copied as they are). */
function withV240Root(sourceRoot,inspect){
  const real=fs.realpathSync(os.tmpdir()),tmp=fs.mkdtempSync(path.join(real,'olympus-staticlive-'));
  try{
    for(const name of fs.readdirSync(sourceRoot)){
      const file=path.join(sourceRoot,name),st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink())continue;
      if(name==='role-settlements.ts'){const prior=toV240(fs.readFileSync(file,'utf8'));need(prior!==null,'LIVELINK_POSITIVE_STATIC_SOURCE_REQUIRED');fs.writeFileSync(path.join(tmp,name),prior);}
      else fs.copyFileSync(file,path.join(tmp,name));
    }
    return inspect(tmp);
  }finally{fs.rmSync(tmp,{recursive:true});}
}
function checks(sourceRoot){
  const current=fs.readFileSync(path.join(sourceRoot,'role-settlements.ts'),'utf8'),prior=toV240(current);
  const own={'exact-livelink-current-whole-source':Buffer.byteLength(current)===live.currentBytes&&H(current)===live.currentSHA256,'finite-counted-livelink-prepend':prior!==null};
  return Object.freeze({...own,...(prior===null?{'accepted-240-restoration-held':false}:withV240Root(sourceRoot,root=>base.checks(root)))});
}
function controls(sourceRoot){
  const current=fs.readFileSync(path.join(sourceRoot,'role-settlements.ts'),'utf8');need(toV240(current)!==null,'LIVELINK_POSITIVE_STATIC_SOURCE_REQUIRED');
  const probes=[['livelink unrelated prefix','// unreviewed-livelink\n'+current],['livelink unrelated suffix',current+'\n// unreviewed-livelink\n'],['livelink raw CRLF drift',current.replace(/\n/g,'\r\n')],['the .240 source cannot masquerade as Live Link',toV240(current)]];
  for(const[i,e]of live.edits.entries())probes.push(['livelink missing context '+i,current.replace(e.from,'')],['livelink duplicated context '+i,current.replace(e.from,e.from+e.from)],['livelink changed context '+i,current.replace(e.from,e.from+'/* unreviewed-livelink */')]);
  const own=probes.map(([name,candidate])=>Object.freeze({name,refused:candidate!==current&&inverse(candidate)===null,source:'role-settlements.ts',scope:'Exact Live Link membership counted prepend over .240; every prior static refusal control and historical whole-source seal is retained below it'}));
  return [...withV240Root(sourceRoot,root=>base.controls(root)),...own];
}
function withStaticView(sourceRoot,inspect){return withV240Root(sourceRoot,root=>base.withStaticView(root,inspect));}
/** Fern's .247 historical adapter reads role-settlements.ts as the reviewed .240 text: hand it the reconstructed one and keep every other member as it is. */
function over247(adapter){return Object.freeze({...adapter,withStaticView(sourceRoot,inspect){return withV240Root(sourceRoot,root=>adapter.withStaticView(root,inspect));}});}
module.exports=Object.freeze({inverse,checks,controls,withStaticView,over247,metadata:Object.freeze({current:live.currentSHA256,v240:base.metadata.current,staticOnly:true,runtimeSubstitutionAuthorized:false})});
