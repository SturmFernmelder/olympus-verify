'use strict';
// Static historical reconstruction only. Callers execute their CURRENT source.
// Every whole-file hash, unique context and intermediate authority is checked;
// a future unreviewed edit cannot inherit these compatibility proofs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const file=path.join(__dirname,'fixtures/reviewed210-source-contexts.json'),bytes=fs.readFileSync(file);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
if(sha(bytes)!=='cb7414c9187bc856f81ee67daccd2922a86d639bd35c3155d625bf5131bf1d6d')throw Error('reviewed source context manifest differs');
const manifest=JSON.parse(bytes.toString('utf8'));
function reverse(raw,stage){
 if(typeof raw!=='string'&&!Buffer.isBuffer(raw))return null;
 if(sha(raw)!==stage.currentSHA256)return null;
 let source=raw.toString('utf8');
 for(const edit of stage.edits){
  if(edit.count!==1||!edit.from||source.split(edit.from).length!==2)return null;
  source=source.replace(edit.from,edit.to);
 }
 return sha(source)===stage.acceptedSHA256?source:null;
}
function originalScheduledFixture(raw){
 if(typeof raw!=='string'&&!Buffer.isBuffer(raw))return null;
 if(sha(raw)===manifest.scheduled.acceptedSHA256)return raw.toString('utf8');
 return reverse(raw,manifest.scheduled);
}
function originalLinkInteractions(raw){
 let source=reverse(raw,manifest.interactions[0]);
 if(source===null)return null;
 return reverse(source,manifest.interactions[1]);
}
function driftControls(raw,kind){
 const source=raw.toString('utf8'),qualify=kind==='scheduled'?originalScheduledFixture:kind==='link'?originalLinkInteractions:null;
 if(!qualify||qualify(raw)===null)throw Error('reviewed source positive control differs');
 const replace=(from,to)=>{if(!source.includes(from))throw Error('drift control context missing');return source.replace(from,to);};
 const probes=[['prefix','// unreviewed prefix\n'+source],['suffix',source+'\n// unreviewed suffix\n'],['line endings',source.replace(/\n/g,'\r\n')],['unrelated source whitespace',replace('const ','const  ')]];
 if(kind==='scheduled'){
  const edit=manifest.scheduled.edits[0],context=source.includes(edit.from)?edit.from:edit.to;
  probes.push(['changed no-work guard',replace('COUNT.statements===0','COUNT.statements===1')],['changed700 target',replace('budget.SCHEDULED_STATEMENT_TARGET===700','budget.SCHEDULED_STATEMENT_TARGET===701')],['duplicated reviewed context',replace(context,context+context)]);
 }else{
  probes.push(['raw ban error restored',replace('error: errorRef(e)','error: String(e)')],['ban reason cap changed',replace('const BAN_REASON_MAX = 400','const BAN_REASON_MAX = 401')],['Link import removed',replace('import { appendLinkBlock } from "./link";','')],['duplicated reviewed context',replace(manifest.interactions[0].edits[0].from,manifest.interactions[0].edits[0].from+manifest.interactions[0].edits[0].from)]);
 }
 return probes.map(([name,mutated])=>{if(mutated===source)throw Error('drift mutation is not real');const refused=qualify(mutated)===null;if(!refused)throw Error('unreviewed source mutation accepted: '+name);return{name,refused};});
}
module.exports=Object.freeze({originalScheduledFixture,originalLinkInteractions,driftControls});
