// Isolated original REST-response/persistence boundary, actual local Workerd/D1.
// Synthetic dispatching rows are test data, not a Native issuer or ownership witness.
import {rest,DiscordError,takeOriginalDiscordPutReply285,originalDiscordPutReplyFacts285,takeOriginalDiscordRoleReply280,originalDiscordRoleReplyFacts280} from '../src/discord.ts';
import {captureCanonicalPutRefusal285,canonicalPutRefusalFacts285,planCanonicalPutRefusal285,canonicalPutRefusalSql285,readCanonicalPutRefusal285,CANONICAL_PUT_REFUSAL_FIELDS285} from '../src/role-put-refusal285.ts';
import {CANONICAL_GUILD233,CANONICAL_PROFILE233,CANONICAL_RANKS233} from '../src/canonical-ranks233.ts';
const G=CANONICAL_GUILD233,S='111111111111111111',R=CANONICAL_RANKS233[9].roleId,active=new Map(),spent=new Set();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join(''),H=async s=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
export const KINDS285=['403','404','429','429-later','forged','lost','aborted','short-body','status-only','extra-body','bad429-header','bad429-body','bad429-scope','server500','source-race403','generation-race403','source-race429','generation-race429','cooldown-malformed','tuple-race','wrong-env','wrong-path','wrong-callback','copy-error','copy-cap','delete-isolated','legacy-attempt0','async-callback','bad-code403'];
export default {async fetch(request,bindings){
 const name=new URL(request.url).pathname.slice(1);
 if(name.startsWith('mutate/')){const k=name.slice(7),a=active.get(k);if(!a)return new Response(null,{status:404});if(k.startsWith('source-race'))await a.db.prepare('UPDATE fixture_source285 SET marker=0').run();else await a.db.prepare("INSERT INTO privacy_subjects(subject_id,generation,state)VALUES(?1,?2,'active')").bind(S,'9'.repeat(32)).run();a.mutated=true;return Response.json({ok:true});}
 if(request.method!=='POST'||spent.has(name)||!KINDS285.includes(name))return new Response(null,{status:404});spent.add(name);
 const db=bindings['DB_'+name.replaceAll('-','_')],now=Math.floor(Date.now()/1000),fields=CANONICAL_PUT_REFUSAL_FIELDS285,numeric=new Set(['desired','attempts','expires_at','roster_id','native_rank','created_at','checked_at']);
 await db.batch([db.prepare('CREATE TABLE role_settlements('+fields.map(k=>k+' '+(numeric.has(k)?'INTEGER':'TEXT')+(k==='id'?' PRIMARY KEY':'')).join(',')+')'),db.prepare('CREATE TABLE privacy_subjects(subject_id TEXT PRIMARY KEY,generation TEXT,state TEXT)'),db.prepare('CREATE TABLE site_settings(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER,updated_by TEXT)'),db.prepare('CREATE TABLE fixture_source285(marker INTEGER)')]);
 const original={id:'a'.repeat(32),subject:S,purpose:'canonical_routine233',proof_id:null,guild_id:G,role_id:R,desired:1,state:'dispatching',attempts:1,expires_at:now+120,roster_id:1,native_guid:'Player-4613-ABCDEF12',native_profile:CANONICAL_PROFILE233,native_rank:8,native_rank_name:'Member',subject_generation:null,claim_nonce:'c'.repeat(32),created_at:now-1,request_digest:'d'.repeat(64),reason:'synthetic_current_dispatch',checked_at:now};
 const old={...original,id:'b'.repeat(32),subject:'222222222222222222',state:'unknown',claim_nonce:'e'.repeat(32),reason:'synthetic_old_unknown'};
 for(const row of [original,old])await db.prepare('INSERT INTO role_settlements('+fields.join(',')+')VALUES('+fields.map((_,i)=>'?'+(i+1)).join(',')+')').bind(...fields.map(k=>row[k])).run();await db.prepare('INSERT INTO fixture_source285 VALUES(1)').run();
 if(name==='429-later')await db.prepare("INSERT INTO site_settings VALUES('role.managed.cooldown280',?1,?2,NULL)").bind(JSON.stringify({version:1,due:now+1000}),now).run();
 if(name==='cooldown-malformed')await db.prepare("INSERT INTO site_settings VALUES('role.managed.cooldown280','bad',?1,NULL)").bind(now).run();
 const sql=[],env={GUILD_ID:G,DISCORD_BOT_TOKEN:'synthetic-put285-'+name,DB:{prepare(statement){sql.push(statement);return db.prepare(statement);},batch(statements){return db.batch(statements);}}},path='/guilds/'+G+'/members/'+S+'/roles/'+R;
 const state={db,mutated:false};active.set(name,state);let callbacks=0,error=null,cap=null,refusal=null,bodyCap=false,batch=null,facts=null,plan=null,consumedAgain=null,deleteUntouched=null;
 const before=await db.prepare('SELECT * FROM role_settlements ORDER BY id').all();
 const callback=name==='async-callback'?async()=>{callbacks++;}:()=>{callbacks++;};
 if(name==='forged')error=new DiscordError(403,JSON.stringify({message:'Missing Permissions',code:50013}));
 else try{await rest(env,name==='delete-isolated'?'DELETE':'PUT',path,undefined,name==='legacy-attempt0'?0:1,undefined,undefined,false,callback);}catch(e){error=e;}
 if(name==='copy-error'&&error)error=new DiscordError(error.status,error.body);
 const envArg=name==='wrong-env'?{...env}:env,pathArg=name==='wrong-path'?path+'-foreign':path,callbackArg=name==='wrong-callback'?()=>{}:callback;
 cap=takeOriginalDiscordPutReply285(error,envArg,'PUT',pathArg,callbackArg);
 if(cap){bodyCap=true;originalDiscordPutReplyFacts285(cap,env,path);consumedAgain=takeOriginalDiscordPutReply285(error,env,'PUT',path,callback);refusal=captureCanonicalPutRefusal285(env,name==='copy-cap'?{...cap}:cap,path);}
 if(name==='delete-isolated'){const oldCap=takeOriginalDiscordRoleReply280(error,env,'DELETE',path,callback);deleteUntouched=!!oldCap&&originalDiscordRoleReplyFacts280(oldCap).method==='DELETE';}
 if(refusal){facts=canonicalPutRefusalFacts285(refusal);if(name==='tuple-race')await db.prepare("UPDATE role_settlements SET claim_nonce=?1 WHERE id=?2").bind('8'.repeat(32),original.id).run();
  plan=planCanonicalPutRefusal285(env,original,refusal,{sql:'EXISTS(SELECT 1 FROM fixture_source285 WHERE marker=?25)',values:[1]},()=>{});plan.check();batch=await env.DB.batch([...plan.statements]);plan.check();
 }
 const negativeSql285=[];
 if(name==='403'&&batch?.[0]?.meta?.changes===1){
  const data=JSON.parse(facts.reason),variants=[
   ['order',JSON.stringify({type:data.type,version:data.version,status:data.status,code:data.code,retryAfterSeconds:data.retryAfterSeconds}),true],
   ['whitespace',' '+facts.reason,true],['duplicate',facts.reason.replace('{"version":1,','{"version":1,"version":1,'),false],
   ['extra',facts.reason.slice(0,-1)+',"extra":0}',false],['boolean-status',facts.reason.replace('"status":403','"status":true'),false],
   ['boolean-code',facts.reason.replace('"code":50013','"code":true'),false],
   ['range',JSON.stringify({...data,status:429,code:null,retryAfterSeconds:86402}),false],
   ['escaped-key',facts.reason.replace('"version"','"\\u0076ersion"'),true],
   ['real-number',facts.reason.replace('"retryAfterSeconds":0','"retryAfterSeconds":0.0'),true]];
  for(const [kind,reason,readerExpected] of variants){await db.prepare('UPDATE role_settlements SET reason=?1 WHERE id=?2').bind(reason,original.id).run();const matched=await db.prepare('SELECT COUNT(*) AS n FROM role_settlements r WHERE '+canonicalPutRefusalSql285('r')).first();negativeSql285.push({kind,matched:matched.n,reader:readCanonicalPutRefusal285(reason)!==null,readerExpected});}
  await db.prepare('UPDATE role_settlements SET reason=?1 WHERE id=?2').bind(facts.reason,original.id).run();
 }
 const rows=(await db.prepare('SELECT * FROM role_settlements ORDER BY id').all()).results,cooldown=await db.prepare("SELECT * FROM site_settings WHERE key='role.managed.cooldown280'").first(),known=(await db.prepare('SELECT r.id FROM role_settlements r WHERE '+canonicalPutRefusalSql285('r')).all()).results;
 let changedSourceReplay=null;
 if(refusal){const repeat=captureCanonicalPutRefusal285(env,cap,path);changedSourceReplay=repeat===null;}
 const result={kind:name,negativeSql285,actualLocalWorkerdD1:true,nativeIssuer:false,callbacks,bodyCap,refusalKnown:!!refusal,consumedAgain:consumedAgain===null,changedSourceReplay,deleteUntouched,mutated:state.mutated,before:before.results,rows,cooldown,known,batch:batch&&batch.map(r=>({success:r.success,changes:r.meta.changes,rows:r.results})),expected:plan?.expected??null,facts:facts&&{status:facts.status,reason:facts.reason,checkedAt:facts.checkedAt,due:facts.due},prepared:await Promise.all(sql.map(async s=>({bytes:new TextEncoder().encode(s).length,sha256:await H(s)}))),errorClass:error?.constructor?.name??null};active.delete(name);return Response.json(result);
}};
