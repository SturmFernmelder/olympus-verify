/** Independent native identify-copy event-change projection regression; no production effects. */
'use strict';
const fs=require('fs'),path=require('path'),Module=require('module'),crypto=require('crypto');
const worker=process.env.PRIVACY_REVIEW_WORKER||path.join(__dirname,'..');
const original=path.join(worker,'tests/privacy_access_test.cjs'),source=fs.readFileSync(original,'utf8'),marker='async function main(){';
if(source.split(marker).length!==2)throw Error('Actual native setup boundary changed');
const sourceFiles=fs.readdirSync(path.join(worker,'src')).filter(x=>x.endsWith('.ts')).map(x=>'src/'+x).concat(['schema.sql','tests/privacy_access_test.cjs']);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),pins=sourceFiles.map(file=>({file,bytes:fs.readFileSync(path.join(worker,file)),hash:sha(fs.readFileSync(path.join(worker,file)))}));
async function review(){
 let total=0,passed=0;const check=(name,value)=>{total++;if(value)passed++;console.log((value?'PASS ':'FAIL ')+name);};
 const cases=[
 {name:'malformed JSON',fields:'{"',valid:false},
 {name:'object with counterpart ID',fields:JSON.stringify({privateCounterpart:B,privateText:'synthetic unsupported structured value'}),valid:false},
 {name:'unknown field',fields:JSON.stringify(['unsupportedField']),valid:false},
 {name:'duplicate field',fields:JSON.stringify(['title','title']),valid:false},
 {name:'counterpart ID as field',fields:JSON.stringify([B]),valid:false},
 {name:'nested field',fields:JSON.stringify([['title']]),valid:false},
 {name:'created nonempty fields',action:'created',fields:JSON.stringify(['title']),valid:false},
 {name:'updated empty fields',fields:'[]',valid:false},
 {name:'invalid stored time',fields:JSON.stringify(['title']),at:'not-an-epoch',valid:false},
 {name:'fractional stored time',fields:JSON.stringify(['title']),at:1.5,valid:false},
 {name:'valid update',fields:JSON.stringify(['title','startsAt','roleTargets']),valid:true},
 {name:'valid created',action:'created',fields:'[]',valid:true},
 {name:'valid cancelled',action:'cancelled',fields:'[]',valid:true}
 ];
 for(const item of cases){
  const f=fixture();subject(f);const t=f.time(),event='x'.repeat(22),op='y'.repeat(22),action=item.action||'updated',at=item.at??t;
  f.db.prepare("INSERT INTO community_events(id,op_id,title,starts_at,duration_min,ends_at,created_by,created_at,updated_at,retain_until)VALUES(?,?,?, ?,60,?,NULL,?,?,?)").run(event,op,'Synthetic event',t+100,t+3700,t,t,t+366*86400);
  // Only malformed JSON models legacy/restored data that predates canonical json_valid enforcement.
  if(item.name==='malformed JSON')f.db.exec('PRAGMA ignore_check_constraints=ON');
  f.db.prepare('INSERT INTO community_event_changes(event_id,action,actor,at,fields)VALUES(?,?,?,?,?)').run(event,action,A,at,item.fields);
  if(item.name==='malformed JSON')f.db.exec('PRAGMA ignore_check_constraints=OFF');
  calls=[];const c=await connect(f),frm=await form(f,c);let response,error,body;
  try{response=await copy.exportPrivacyAccess(frm.request(),f.env);body=await response.json();}catch(e){error=e;}
  const refused=!!error||!!response&&response.status>=400,wire=JSON.stringify(body||{});
  check(item.name+' actual export outcome matches finite projection contract',item.valid?response?.status===200&&!error:refused);
  if(item.valid){const row=body?.eventChanges?.rows?.[0];check(item.name+' returns only ordinary-safe field-name DTO',row&&Object.keys(row).sort().join(',')==='action,at,changedFieldNames,eventId'&&row.eventId===event&&row.action===action&&row.at===new Date(t*1000).toISOString()&&JSON.stringify(row.changedFieldNames)===item.fields&&!Object.hasOwn(row,'fields'));}
  else check(item.name+' returns no raw structured fields or counterpart identifier',!wire.includes(B)&&!wire.includes('privateCounterpart')&&!wire.includes('synthetic unsupported structured value')&&!body?.eventChanges?.rows?.length);
  check(item.name+' confirmed own read remains one-use even when projection is refused',f.db.prepare("SELECT consumed_at FROM privacy_access_grants WHERE purpose='own_export'").get()?.consumed_at!==null);
  const providerCalls=calls.length;let replayRefused=false;try{await copy.exportPrivacyAccess(frm.request(),f.env);}catch{replayRefused=true;}
  check(item.name+' replay never repeats native payload or OAuth',replayRefused&&calls.length===providerCalls);
  check(item.name+' no ordinary membership or role operations',count(f,'site_users')===0&&count(f,'members')===0&&count(f,'role_settlements')===0&&calls.length===2&&calls.every(x=>/\/oauth2\/token$|\/users\/@me$/.test(x.url)));
  f.db.close();
 }
 for(const pin of inputPins)check('exact source stable '+pin.file,fs.readFileSync(path.join(root,pin.file)).length===pin.bytes&&require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,pin.file))).digest('hex')===pin.sha256);
 console.log(passed+'/'+total+' independent identify-copy event projection checks passed; '+cases.length+' native cases; no production/provider effects');
 if(total!==passed)process.exitCode=1;
}
const m=new Module(original);m.filename=original;m.paths=Module._nodeModulePaths(path.dirname(original));
const injection='\nconst inputPins='+JSON.stringify(pins.map(p=>({file:p.file,bytes:p.bytes.length,sha256:p.hash})))+';\n';
m._compile(source.slice(0,source.indexOf(marker))+injection+'\n'+review.toString()+'\nreview().catch(e=>{console.error(e.stack);process.exitCode=1;});',original);

