/** Attended, note-only cleanup authorized by the owner on12 November2026.
 * Ordinary Native writer/session admission remains mandatory. No raw binding,
 * control toggle, generic SQL, local-file purge or unknown-outcome retry. */
import type {Env} from './env';
import {apiJson,PAGE_VERSION,readSession,sameOrigin,sign,verify} from './site-core';
import {assertOriginalSiteSessionRead} from './privacy-site-session-incarnation';

const OWNER='472099715253796864';
const KEY='maintenance:treasury-note-redaction280';
const ACTION='treasury.receipt_note_redaction280';
const PURPOSE='treasury-note-redaction280-v1';
const MAX_ROWS=1000;
const OPERATION_ID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SAFE="CASE WHEN typeof(details)='text' AND length(CAST(details AS BLOB))<=65536 THEN CASE WHEN json_valid(details) THEN details ELSE '{}' END ELSE '{}' END";
const SOURCE=`json_extract(${SAFE},'$.source')`;
const COVERED=`(${SOURCE} IN('mail','whisper-declaration'))`;
const NONEMPTY=`(json_type(${SAFE},'$.note')='text' AND json_extract(${SAFE},'$.note')<>'')`;
// SQLite decodes an unpaired JSON surrogate to an invalid UTF-8 sequence.
// Classify it in SQL before the preservation manifest; never return its text.
// Balance the fixed32 leaves: the Native statement wrapper shares SQLite's
// depth100 limit, so a left-associated OR chain cannot be appended safely.
const balancedOr=(parts:readonly string[]):string=>{
 let level=[...parts];
 while(level.length>1){
  const next:string[]=[];
  for(let i=0;i<level.length;i+=2)next.push(i+1<level.length?`(${level[i]} OR ${level[i+1]})`:level[i]!);
  level=next;
 }
 return level[0]!;
};
const INVALID_NOTE_UNICODE=`(json_type(${SAFE},'$.note')='text' AND (${balancedOr(Array.from({length:32},(_v,n)=>
 `instr(CAST(json_extract(${SAFE},'$.note') AS BLOB),X'ED${(160+n).toString(16).toUpperCase()}')>0`))}))`;
const FAMILY="action='treasury.receipt242' AND id<=?1";
// The non-note projection never returns the note text to application code.
// Length plus non-note JSON equality detects value changes as well as length drift.
const PROJECTION=`json_array(id,ts,actor,action,subject,
 json_remove(${SAFE},'$.note'),
 CASE WHEN json_type(${SAFE},'$.note')='text'
 THEN length(details)-length(json_quote(json_extract(${SAFE},'$.note'))) ELSE length(details) END)`;
const BOUNDED_ROWS=`SELECT ${PROJECTION} AS row FROM audit WHERE ${FAMILY} ORDER BY id LIMIT ${MAX_ROWS+1}`;
const MANIFEST=`SELECT CASE WHEN (SELECT COALESCE(SUM(length(CAST(row AS BLOB))+1),0)+2 FROM(${BOUNDED_ROWS}))<=131072
 THEN (SELECT COALESCE(json_group_array(json(row)),'[]') FROM(${BOUNDED_ROWS})) ELSE NULL END AS manifest`;
const INVALID=`typeof(details) IS NOT 'text' OR length(CAST(details AS BLOB))>65536 OR NOT json_valid(details) OR CASE WHEN json_valid(details) THEN
 json_type(${SAFE})<>'object' OR json_type(${SAFE},'$.source') IS NOT 'text'
 OR EXISTS(SELECT 1 FROM json_each(${SAFE}) GROUP BY key HAVING COUNT(*)>1)
 OR (json_type(details,'$.note') IS NOT NULL AND json_type(details,'$.note')<>'text')
 OR ${INVALID_NOTE_UNICODE}
 OR (${NONEMPTY} AND NOT ${COVERED}) ELSE 0 END`;
type Census={ceiling:number;rows:number;covered:number;nonempty:number;invalid:number;manifest:string};
type Review={actor:string;version:number;generation:string|null;birth:string;epoch:string;id:string;created:number;expires:number;ceiling:number};
const refused=(invalidRows?:number)=>apiJson({error:'receipt_note_cleanup_held',message:'The cleanup is held or its outcome is unconfirmed. Check cleanup status before any further action.',nextAction:'status',
 ...(invalidRows===undefined?{}:{unclassifiedReceiptRows:invalidRows})},409);
const unconfirmed=()=>apiJson({error:'receipt_note_cleanup_unconfirmed',message:'The cleanup outcome is not confirmed. Check cleanup status before any further action.',nextAction:'status'},503);
const clock=()=>Math.floor(Date.now()/1000);
const whole=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;

async function census(env:Env,ceiling:number):Promise<Census|null>{
 const out=await env.DB.batch<Record<string,unknown>>([
  env.DB.prepare(`SELECT COUNT(*) AS rows,COALESCE(SUM(CASE WHEN ${COVERED} THEN 1 ELSE 0 END),0) AS covered,
   COALESCE(SUM(CASE WHEN ${COVERED} AND ${NONEMPTY} THEN 1 ELSE 0 END),0) AS nonempty,
   COALESCE(SUM(CASE WHEN ${INVALID} THEN 1 ELSE 0 END),0) AS invalid
   FROM(SELECT * FROM audit WHERE ${FAMILY} ORDER BY id LIMIT ${MAX_ROWS+1})`).bind(ceiling),
  env.DB.prepare(MANIFEST).bind(ceiling),
 ]);
 const row=out[0]?.results?.[0],manifest=out[1]?.results?.[0]?.manifest;
 if(!row||typeof manifest!=='string'||new TextEncoder().encode(manifest).byteLength>131072
   ||!['rows','covered','nonempty','invalid'].every(k=>whole(row[k])))return null;
 return {ceiling,rows:Number(row.rows),covered:Number(row.covered),nonempty:Number(row.nonempty),invalid:Number(row.invalid),manifest};
}
async function status(env:Env):Promise<Response>{
 const result=await env.DB.batch<Record<string,unknown>>([
  env.DB.prepare('SELECT value FROM site_settings WHERE key=?1').bind(KEY),
  env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN ${COVERED} AND ${NONEMPTY} THEN 1 ELSE 0 END),0) AS remaining,
   COALESCE(SUM(CASE WHEN ${INVALID} THEN 1 ELSE 0 END),0) AS unclassified FROM audit WHERE action='treasury.receipt242'`),
 ]);
 const raw=result[0]?.results?.[0]?.value;
 let completion:Record<string,unknown>|null=null;
 if(typeof raw==='string')try{
  const parsed=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)
   ||Object.keys(parsed).sort().join(',')!=='blanked,ceiling,completedAt,operationId,version'||parsed.version!==1
   ||!['blanked','ceiling','completedAt'].every(k=>whole(parsed[k]))
   ||typeof parsed.operationId!=='string'||!OPERATION_ID.test(parsed.operationId))return unconfirmed();
  completion=parsed;
 }catch{return unconfirmed();}
 return apiJson({state:completion?'recorded':'not_recorded',completion,remainingCoveredNotes:result[1]?.results?.[0]?.remaining??null,
  unclassifiedReceiptRows:result[1]?.results?.[0]?.unclassified??null,
  scope:'Serving D1 notes only. Local originals, recovery copies and original payload commitments are unchanged.'});
}
export async function receiptNoteMaintenance280(request:Request,env:Env,actor:string,body:Record<string,unknown>):Promise<Response>{
 if(actor!==OWNER)return apiJson({error:'forbidden'},403);
 if(request.method!=='POST')return apiJson({error:'method_not_allowed'},405);
 if(request.headers.get('X-Olympus')!==PAGE_VERSION)return apiJson({error:'page_outdated'},409);
 if(!sameOrigin(request))return apiJson({error:'origin'},403);
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['action','review','confirm'].includes(k)))return apiJson({error:'bad_body'},400);
 const session=await readSession(env,request);
 if(!session||session.u!==actor)return apiJson({error:'signed_out'},401);
 assertOriginalSiteSessionRead(session);
 if(body.action==='status')return status(env);
 if(body.action==='preview'){
  const completed=await env.DB.prepare('SELECT 1 AS yes FROM site_settings WHERE key=?1').bind(KEY).first();
  if(completed)return status(env);
  const max=await env.DB.prepare("SELECT COALESCE(MAX(id),0) AS ceiling FROM audit WHERE action='treasury.receipt242'").first<{ceiling:number}>();
  if(!max||!whole(max.ceiling))return refused();
  const scope=await census(env,max.ceiling);
  if(!scope||scope.rows>MAX_ROWS||scope.invalid)return refused(scope?.invalid);
  const at=clock(),review:Review={actor,version:session.v,generation:session.g,birth:session.n,epoch:env.PRIVACY_WRITE_ADMISSION_EPOCH??'',
   id:crypto.randomUUID(),created:at,expires:Math.min(session.e,at+600),ceiling:scope.ceiling};
  if(!/^[a-f0-9]{32}$/.test(review.epoch))return refused();
  const raw=JSON.stringify(review),signature=await sign(env.COOKIE_SECRET,PURPOSE,raw);
  assertOriginalSiteSessionRead(session);
  return apiJson({state:'preview',ceiling:scope.ceiling,receiptRows:scope.rows,coveredRows:scope.covered,notesToBlank:scope.nonempty,
   review:raw+'.'+signature,expiresAt:review.expires,confirmation:'BLANK RECEIPT NOTES',
   scope:'Only note text on mail and whisper-declaration receipt242 rows. Every row, other field, original payloadHash and deadline is retained.'});
 }
 if(body.action!=='apply'||body.confirm!=='BLANK RECEIPT NOTES'||typeof body.review!=='string'||body.review.length>2048)return apiJson({error:'confirmation_required'},400);
 // This is a read of the owner's already recorded result, not a renewed apply.
 // An expired old review must not deny that the one-time operation completed.
 const existing=await env.DB.prepare('SELECT value FROM site_settings WHERE key=?1').bind(KEY).first<{value:string}>();
 if(existing)return status(env);
 const dot=body.review.lastIndexOf('.');if(dot<1)return refused();
 const raw=body.review.slice(0,dot),signature=body.review.slice(dot+1);
 if(!await verify(env.COOKIE_SECRET,PURPOSE,raw,signature))return refused();
 let review:Review;try{review=JSON.parse(raw);}catch{return refused();}
 if(!review||Object.keys(review).sort().join(',')!=='actor,birth,ceiling,created,epoch,expires,generation,id,version'
  ||review.actor!==actor||review.version!==session.v||review.generation!==session.g||review.birth!==session.n
  ||review.epoch!==env.PRIVACY_WRITE_ADMISSION_EPOCH||!whole(review.created)||!whole(review.expires)||!whole(review.ceiling)
  ||review.created>clock()+5||review.expires<=clock()||review.expires>review.created+600||review.expires>session.e
  ||typeof review.id!=='string'||!OPERATION_ID.test(review.id))return refused();
 assertOriginalSiteSessionRead(session);
 // Fresh current ceiling: the authorized source/family scope is fixed, not the
 // historical43/58 count. A ceiling cannot be supplied or expanded by the client.
 const max=await env.DB.prepare("SELECT COALESCE(MAX(id),0) AS ceiling FROM audit WHERE action='treasury.receipt242'").first<{ceiling:number}>();
 if(!max||!whole(max.ceiling)||max.ceiling<review.ceiling)return refused();
 const scope=await census(env,max.ceiling);if(!scope||scope.rows>MAX_ROWS||scope.invalid)return refused(scope?.invalid);
 const completedAt=clock(),marker=JSON.stringify({version:1,operationId:review.id,ceiling:scope.ceiling,blanked:scope.nonempty,completedAt});
 const equalManifest=`(${MANIFEST})=?2 COLLATE BINARY`;
 const assertions=`${equalManifest} AND NOT EXISTS(SELECT 1 FROM audit WHERE ${FAMILY} AND (${INVALID}))`;
 const sqlHold="json_extract('receipt_note_redaction_scope_held','$')";
 try{await env.DB.batch([
  env.DB.prepare(`SELECT CASE WHEN ${assertions} AND NOT EXISTS(SELECT 1 FROM site_settings WHERE key=?3)
   AND CAST(strftime('%s','now') AS INTEGER)<?4 AND (SELECT COUNT(*) FROM audit WHERE ${FAMILY} AND ${COVERED} AND ${NONEMPTY})=?5
   THEN 1 ELSE ${sqlHold} END AS admitted`).bind(scope.ceiling,scope.manifest,KEY,review.expires,scope.nonempty),
  env.DB.prepare(`UPDATE audit SET details=json_set(details,'$.note','') WHERE ${FAMILY} AND CASE WHEN json_valid(details)
   THEN json_type(details,'$.source')='text' AND json_extract(details,'$.source') IN('mail','whisper-declaration')
   AND json_type(details,'$.note')='text' AND json_extract(details,'$.note')<>'' ELSE 0 END`).bind(scope.ceiling),
  env.DB.prepare(`SELECT CASE WHEN changes()=?3 AND ${assertions}
   AND NOT EXISTS(SELECT 1 FROM audit WHERE ${FAMILY} AND ${COVERED} AND ${NONEMPTY}) THEN 1 ELSE ${sqlHold} END AS preserved`).bind(scope.ceiling,scope.manifest,scope.nonempty),
  env.DB.prepare('INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES(?1,?2,?3,NULL)').bind(KEY,marker,completedAt),
  env.DB.prepare('INSERT INTO audit(ts,actor,action,subject,details)VALUES(?1,?2,?3,NULL,?4)').bind(completedAt,actor,ACTION,JSON.stringify({ceiling:scope.ceiling,blanked:scope.nonempty})),
  env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM site_settings WHERE key=?1 AND value=?2) THEN 1 ELSE ${sqlHold} END AS recorded`).bind(KEY,marker),
 ]);}catch{
  // The transaction may have committed before its answer was lost. A fresh
  // status request must resolve that; this response never repeats the write.
  return unconfirmed();
 }
 return status(env);
}
