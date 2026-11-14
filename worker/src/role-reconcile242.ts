/** Durable scheduling only. Every visit still enters the original Native issuer,
 * reservation, ownership and unknown-effect fences; a queued ID proves nothing. */
import type {Env} from './env';
import {audit,now} from './db';
import {readPrivacySubject,admittedPrivacySubjectWrite,privacyBoundSubjectEnv,privacyGenerationExpressionFenceSql} from './privacy-serving-authority';
import {countStatements} from './roster-effects';
import {callBudget} from './roles';
import {errorRef} from './log';
import {credentialFetch} from './discord';
import {CANONICAL_RANKS233} from './canonical-ranks233';
import type {NativeSweep249} from './full-release-pass';

export type RoleWorkDefer242=(label:string,work:()=>Promise<unknown>)=>void;
const ID=/^[1-9][0-9]{16,19}$/;
const REQUEST='role.request242',FINISHED='role.request242_finished';
const PATH='/internal/roles242/continue';
const encoder=new TextEncoder();
const sweep249=(v:unknown):v is NativeSweep249=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')==='id,n'&&typeof (v as NativeSweep249).id==='string'&&/^[a-f0-9]{32}$/.test((v as NativeSweep249).id)&&Number.isSafeInteger((v as NativeSweep249).n)&&(v as NativeSweep249).n>0;

const REQUEST_SCHEMA280='role-request280-v1',REQUEST_LIFETIME280=30*86400,DB_NOW280="CAST(strftime('%s','now') AS INTEGER)";
const details280=(a:string)=>`CASE WHEN json_valid(${a}.details) THEN ${a}.details ELSE '{}' END`;
const generation280=(a:string,g:string)=>`(((${g}) IS NULL AND json_type(${details280(a)},'$.generation')='null') OR (json_type(${details280(a)},'$.generation')='text' AND json_extract(${details280(a)},'$.generation') IS (${g})))`;
const requestScope280=(a:string,s:string,g:string)=>`(${a}.actor='system' AND ${a}.action='${REQUEST}' AND ${a}.subject=${s}
 AND typeof(${a}.ts)='integer' AND ${a}.ts>0 AND ${a}.ts<=${DB_NOW280} AND ${a}.ts>${DB_NOW280}-${REQUEST_LIFETIME280}
 AND json_extract(${details280(a)},'$.schema')='${REQUEST_SCHEMA280}' AND ${generation280(a,g)}
 AND json_type(${details280(a)},'$._privacySubjectIds')='array' AND json_array_length(${details280(a)},'$._privacySubjectIds')=1
 AND json_extract(${details280(a)},'$._privacySubjectIds[0]')=${s})`;
const finished280=(a:string,g:string)=>`EXISTS(SELECT 1 FROM audit f WHERE f.actor='system' AND f.action='${FINISHED}' AND f.subject=${a}.subject
 AND typeof(f.ts)='integer' AND f.ts>=${a}.ts AND f.ts<=${DB_NOW280} AND json_extract(${details280('f')},'$.schema')='${REQUEST_SCHEMA280}'
 AND ${generation280('f',g)} AND json_type(${details280('f')},'$.requestId')='integer' AND json_extract(${details280('f')},'$.requestId')=${a}.id)`;
export type RoleRequestReceipt280=Readonly<{kind:'created';requestId:number}|{kind:'already_pending'|'held'|'unknown'}>;
/** Only a known creation wakes the user-enqueue lane. A lost original reply is
 * unknown, never retried or described as no effect. This is scheduling, not an
 * identity/role capability; every visit retains the original Native issuer. */
export async function requestRoleReconciliation242(env:Env,subject:string,reason:string):Promise<RoleRequestReceipt280>{
 if(!ID.test(subject))throw Error('role242_subject_invalid');
 try{
  const capture=await readPrivacySubject(env,subject);if(capture&&capture.state!=='active')return Object.freeze({kind:'held'});
  const generation=capture?.subjectGeneration??null,details=JSON.stringify({schema:REQUEST_SCHEMA280,reason:reason.slice(0,64),generation,_privacySubjectIds:[subject]});
  const out=await admittedPrivacySubjectWrite(env,subject,capture,[env.DB.prepare(`INSERT INTO audit(ts,actor,action,subject,details)
   SELECT ${DB_NOW280},'system','${REQUEST}',?1,?3 WHERE NOT EXISTS(SELECT 1 FROM audit q WHERE ${requestScope280('q','?1','?2')} AND NOT(${finished280('q','?2')})) RETURNING id`).bind(subject,generation,details)]);
  const row=out[0];if(out.length!==1||row?.success!==true||!Array.isArray(row.results)||row.results.length>1||!row.meta||row.meta.changes!==row.results.length)return Object.freeze({kind:'unknown'});
  if(row.results.length===0)return Object.freeze({kind:'already_pending'});
  const id=(row.results[0] as {id?:unknown}).id;if(typeof id!=='number'||!Number.isSafeInteger(id)||id<1)return Object.freeze({kind:'unknown'});
  return Object.freeze({kind:'created',requestId:id});
 }catch{return Object.freeze({kind:'unknown'});}
}

/** The queue is ordinary privacy-referenced audit data, not new identity state.
 * An unsuccessful visit is reported as held; it is never an ACK or an automatic
 * retry of a spent effect. A new request can re-evaluate current source facts. */
async function requested242(env:Env):Promise<boolean>{
 const began=Date.now();
 const {runNativeSubject232}=await import('./full-release-pass');
 const count={used:0},bounded=countStatements(env,count),calls=callBudget(bounded);
 const currentGeneration="(SELECT generation FROM privacy_subjects WHERE subject_id=a.subject)";
 const rows=await bounded.DB.prepare(`SELECT a.id,a.subject,json_extract(${details280('a')},'$.generation') AS generation FROM audit a
 WHERE ${requestScope280('a','a.subject',currentGeneration)} AND ${privacyGenerationExpressionFenceSql('a.subject',currentGeneration)}
 AND a.id=(SELECT MAX(q.id) FROM audit q WHERE ${requestScope280('q','a.subject',currentGeneration)}) AND NOT(${finished280('a',currentGeneration)})
 ORDER BY a.id LIMIT 11`).all<{id:number;subject:string;generation:string|null}>();
 let visited=0;
 for(const row of rows.results){
  if(visited>0&&Date.now()-began>=12000)break;
  if(count.used+200>850||calls.limit-calls.attempts<12||visited>=4)break;
  if(!ID.test(row.subject))continue;
  const capture=await readPrivacySubject(bounded,row.subject);
  if(capture&&capture.state!=='active'||(capture?.subjectGeneration??null)!==row.generation)continue;
  const writer=privacyBoundSubjectEnv(bounded,row.subject,capture);
  const stillPending=await writer.DB.prepare(`SELECT 1 AS current FROM audit a WHERE a.id=?1 AND ${requestScope280('a','?2','?3')} AND NOT(${finished280('a','?3')})`).bind(row.id,row.subject,row.generation).first();
  if(!stillPending)continue;
  const result=await runNativeSubject232(writer,row.subject,calls);
  await audit(writer,'system',FINISHED,row.subject,{schema:REQUEST_SCHEMA280,generation:row.generation,requestId:row.id,state:result.state,reason:result.reason},{subject:row.subject,capture});
  visited++;
 }
 return visited>0&&rows.results.length>visited;
}

/** The officer-known addon secret cannot authorize server scheduling. V2 has
 * one server-only key and domain; missing/rotated configuration holds. */
function signingSource280(env:Env){
 const descriptor=Object.getOwnPropertyDescriptor(env,'COOKIE_SECRET'),baseDescriptor=Object.getOwnPropertyDescriptor(env,'PUBLIC_BASE_URL'),prototype=Object.getPrototypeOf(env);
 if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='string'||!descriptor.value||!baseDescriptor||!Object.hasOwn(baseDescriptor,'value')||typeof baseDescriptor.value!=='string')throw Error('role280_server_signer_unconfigured');
 const secret=descriptor.value,base=new URL(baseDescriptor.value);
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('role242_origin_invalid');
 const current=()=>{const d=Object.getOwnPropertyDescriptor(env,'COOKIE_SECRET'),b=Object.getOwnPropertyDescriptor(env,'PUBLIC_BASE_URL');if(Object.getPrototypeOf(env)!==prototype||!d||!b||!Object.hasOwn(d,'value')||!Object.hasOwn(b,'value')||d.value!==secret||b.value!==baseDescriptor.value)throw Error('role280_server_signer_changed');};
 return Object.freeze({secret,origin:base.origin,current});
}
async function signature242(source:ReturnType<typeof signingSource280>,text:string):Promise<string>{
 source.current();const key=await crypto.subtle.importKey('raw',encoder.encode(source.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);source.current();
 const signed=await crypto.subtle.sign('HMAC',key,encoder.encode('role-continuation280-v2\n'+source.origin+'\n'+text));source.current();
 return [...new Uint8Array(signed)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function kickRoleWork242(env:Env,kind:'requests'|'sweep',sweep?:NativeSweep249):Promise<void>{
 const source=signingSource280(env);
 if(sweep!==undefined&&(kind!=='sweep'||!sweep249(sweep)))throw Error('role249_sweep_invalid');
 const text=JSON.stringify({version:2,kind,at:now(),nonce:crypto.randomUUID(),...(sweep?{sweep}:{})});
 const response=await credentialFetch(new URL(PATH,source.origin).href,{method:'POST',headers:{'Content-Type':'application/json','X-Olympus-Role-Continuation':await signature242(source,text)},body:text,redirect:'manual'},source.current);
 source.current();try{void response.body?.cancel().catch(()=>undefined);}catch{/* Cancellation cannot confirm or repeat delivery. */}
 if(!response.ok){const error=Object.assign(Error('role242_continuation_held'),{status:response.status});console.error('role242_continuation_held',errorRef(error));throw error;}
}

/** .266: these are independent scheduling signals. An unavailable request queue
 * must not discard a durably pending sweep. Both keep their original signature,
 * nonce and guarded issuer; neither failure retries an effect or clears a lease. */
export async function kickRoleWorkGroups266(env:Env,sweep?:NativeSweep249):Promise<void>{
 const failures:unknown[]=[];
 try{await kickRoleWork242(env,'requests');}
 catch(error){console.error('role266_requests_wake_held',errorRef(error));failures.push(error);}
 if(sweep)try{await kickRoleWork242(env,'sweep',sweep);}
 catch(error){console.error('role266_sweep_wake_held',errorRef(error));failures.push(error);}
 if(failures.length)throw new AggregateError(failures,'role266_scheduling_incomplete');
}

export async function runRoleWork242(env:Env,kind:'requests'|'sweep',defer?:RoleWorkDefer242,sweep?:NativeSweep249):Promise<void>{
 let more=false,nextSweep:NativeSweep249|undefined;
 try{
  if(kind==='requests')more=await requested242(env);
  else{
   const {nativeAdmission232,runFreshPass}=await import('./full-release-pass');
   const {captureLaneConfig}=await import('./full-release-roles');
   const count={used:0},bounded=countStatements(env,count),calls=callBudget(bounded);
   const result=await runFreshPass(bounded,{calls,adm:nativeAdmission232(count,850),sweep},'continuation',captureLaneConfig(bounded));
   more=result.continuation===true;nextSweep=result.nativeSweep;
  }
  if(more&&defer&&(kind==='requests'||nextSweep))defer('roles242_continue',()=>kickRoleWork242(env,kind,nextSweep));
 }catch(error){console.error('role242_work_held',errorRef(error));}
}

/** HMAC authenticated scheduling signal, no account/role/payload authority.
 * The once-only nonce is claimed before scheduling the original guarded writer. */
export async function handleRoleContinuation242(request:Request,env:Env,defer?:RoleWorkDefer242):Promise<Response>{
 if(request.method!=='POST'||!defer)return new Response(null,{status:404});
 let source:ReturnType<typeof signingSource280>;try{source=signingSource280(env);}catch{return new Response(null,{status:503});}
 const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400});
 const chunks:Uint8Array[]=[];let bytes=0;
 try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>256){void reader.cancel().catch(()=>undefined);return new Response(null,{status:413});}chunks.push(part.value);}}finally{reader.releaseLock();}
 const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(buffer);}catch{return new Response(null,{status:400});}
 const supplied=request.headers.get('X-Olympus-Role-Continuation')??'',expected=await signature242(source,text);
 let diff=supplied.length^expected.length;for(let n=0;n<expected.length;n++)diff|=(supplied.charCodeAt(n)||0)^expected.charCodeAt(n);
 if(diff)return new Response(null,{status:401});
 let body:{version?:unknown;kind?:unknown;at?:unknown;nonce?:unknown;sweep?:unknown;independent?:unknown};try{body=JSON.parse(text);}catch{return new Response(null,{status:400});}
 if(!body||typeof body!=='object'||body.version!==2||!['at,kind,nonce,version','at,kind,nonce,sweep,version','at,independent,kind,nonce,version'].includes(Object.keys(body).sort().join(','))||!['requests','sweep'].includes(String(body.kind))||!Number.isSafeInteger(body.at)||Math.abs(now()-Number(body.at))>60||typeof body.nonce!=='string'||! /^[0-9a-f-]{36}$/.test(body.nonce)||body.sweep!==undefined&&(body.kind!=='sweep'||!sweep249(body.sweep))||'independent'in body&&(body.independent!==true||body.kind!=='sweep'||'sweep'in body))return new Response(null,{status:400});
 const claim=await env.DB.prepare('INSERT OR IGNORE INTO seen_interactions(id,seen_at) VALUES(?1,?2)').bind('roles280v2:'+body.nonce,now()).run();
 source.current();if(!claim.meta.changes)return new Response(null,{status:409});
 // An externally originated, signed root is scheduling only. Its one original
 // pass resumes confirmed current state without recursively inheriting a chain.
 if(body.independent===true)defer('roles242_work',()=>runRoleWork242(env,'sweep'));
 else defer('roles242_work',()=>runRoleWork242(env,body.kind as 'requests'|'sweep',defer,body.sweep as NativeSweep249|undefined));
 return new Response(null,{status:202});
}

export async function ownRoleStatus242(env:Env,subject:string):Promise<unknown>{
 if(!ID.test(subject))throw Error('role242_subject_invalid');
 const characters=await env.DB.prepare(`SELECT c.name,c.guid,c.status,c.verified_at,
 r.rank,r.rank_index FROM characters c LEFT JOIN roster_members r ON r.snapshot_id=(SELECT MAX(id) FROM roster_snapshots WHERE complete=1 AND trusted=1)
 AND r.guid=c.guid AND r.name_key=c.name_key WHERE c.discord_id=?1 AND c.status<>'unbound' ORDER BY c.bound_at LIMIT 40`).bind(subject).all();
 const latest=await env.DB.prepare(`SELECT ts,details FROM audit WHERE actor='system' AND action='${FINISHED}' AND subject=?1 ORDER BY id DESC LIMIT 1`).bind(subject).first();
 const nativeConnection=await env.DB.prepare("SELECT ts,details FROM audit WHERE action='guild.discord_observation242' AND subject=?1 ORDER BY id DESC LIMIT 1").bind(subject).first();
 return {characters:characters.results,reconciliation:latest,nativeConnection:nativeConnection?{...nativeConnection,scope:'existing-linked-native-platform-observation',identityCreated:false,roleGranted:false}:null,observedAt:now()};
}

/** Fixed bounded entry for an authenticated operator or an admitted work item.
 * Results retain held/unknown outcomes; this is not the migration ownership API. */
export async function reconcileRoleBatch242(env:Env,subjects:readonly string[]):Promise<{results:{subject:string;state:string;reason:string}[];remaining:string[];statements:number;requests:number}>{
 if(!Array.isArray(subjects)||subjects.length>100||subjects.some(s=>!ID.test(s))||new Set(subjects).size!==subjects.length)throw Error('role242_batch_invalid');
 const {runNativeSubject232}=await import('./full-release-pass');
 const count={used:0},bounded=countStatements(env,count),calls=callBudget(bounded),results:{subject:string;state:string;reason:string}[]=[],began=Date.now();
 for(const subject of subjects){
  if(count.used+200>850||calls.limit-calls.attempts<12||Date.now()-began>22000)break;
  const result=await runNativeSubject232(bounded,subject,calls);
  results.push({subject,state:result.state,reason:result.reason});
 }
 return {results,remaining:subjects.slice(results.length),statements:count.used,requests:calls.attempts};
}

/** Server-observed cache only. The addon cannot turn this receipt into identity
 * or a role grant; it can answer the same character without another whisper. */
export async function verificationResults242(env:Env):Promise<{guid:string;character:string;status:string;discordRole:string|null;observedAt:number;expiresAt:number}[]>{
 // Lazy, read-only reuse preserves module initialization order and existing receipt semantics.
 const known=(await import('./role-settlements')).roleObservationSql280('s');
 const t=now(),rows=await env.DB.prepare(`SELECT c.guid,c.name,c.verified_at,
 (SELECT s.role_id FROM role_settlements s WHERE s.subject=c.discord_id
 AND s.guild_id=?1 AND s.subject_generation IS (SELECT generation FROM privacy_subjects WHERE subject_id=c.discord_id)
 AND (${known})
 AND s.checked_at<=CAST(strftime('%s','now') AS INTEGER)
 AND s.checked_at>=CAST(strftime('%s','now') AS INTEGER)-300 AND NOT EXISTS(SELECT 1 FROM role_settlements newer WHERE newer.subject=s.subject AND newer.role_id=s.role_id AND newer.desired=0 AND newer.state='settled' AND newer.checked_at>=s.checked_at) AND NOT EXISTS(SELECT 1 FROM role_settlements u WHERE u.subject=s.subject AND u.state IN('dispatching','unknown') AND u.attempts=1) ORDER BY s.checked_at DESC LIMIT 1) AS role_id
 FROM characters c WHERE c.status='member' AND c.verified_at IS NOT NULL AND c.guid IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM members m WHERE m.discord_id=c.discord_id AND m.banned=1)
 AND NOT EXISTS(SELECT 1 FROM privacy_subjects p WHERE p.subject_id=c.discord_id AND p.state<>'active')
 ORDER BY c.verified_at DESC,c.name_key LIMIT 500`).bind(env.GUILD_ID??'').all<{guid:string;name:string;verified_at:number;role_id:string|null}>();
 return rows.results.map(r=>({guid:r.guid,character:r.name,status:r.role_id?'verified':'pending-role',discordRole:CANONICAL_RANKS233.find(x=>x.roleId===r.role_id)?.name??null,observedAt:t,expiresAt:t+300}));
}
