/** Owner .164: automatic cleanup of explicit account pointers, never guessed aliases.
 * A typed display name is not an account association. Historical free-text names and
 * malformed/ambiguous documents remain outside this exact-reference projection.
 */
import type {Env} from './env';
import {nativeErasureMode} from './privacy-native-mode';
import {captureAccountErasureProof,originalErasureJobBirthSql,PRIVACY_DB_NOW,type AccountErasureProof} from './privacy-serving-authority';
import {leadershipEnvelopeSql} from './site-leadership-data';

const WITHHELD="'Name withheld'";
const exactAccount=(value:string)=>`${value} IN(?2,'<@'||?2||'>','<@!'||?2||'>')`;
const enabled=(env:Env)=>{
 const flag=Object.getOwnPropertyDescriptor(env,'PRIVACY_ERASURE_ENABLED');
 return nativeErasureMode(env)&&!!flag&&Object.hasOwn(flag,'value')&&flag.value==='true';
};

/** The original admission must still own the account birth and retiring generation.
 * The terminal caller may already have consumed waiting/held into erasing; no complete
 * job, replacement account, expired request or unrelated operation authorizes a write.
 */
function currentSql(proof:AccountErasureProof):string{
 return `EXISTS(SELECT 1 FROM privacy_serving_jobs j JOIN privacy_subjects s ON s.subject_id=j.subject_id
 WHERE j.operation_id=?1 AND j.subject_id=?2 AND j.subject_generation=?3 AND j.request_digest=?4
 AND ${originalErasureJobBirthSql(proof)} AND j.state IN('waiting_role','held','erasing')
 AND s.state='retiring' AND s.generation=?3 AND j.retain_until>${PRIVACY_DB_NOW}
 AND ((j.original_account_incarnation IS NULL AND j.original_session_version=0 AND NOT EXISTS(SELECT 1 FROM site_users WHERE discord_id=j.subject_id))
 OR(j.original_account_incarnation IS NOT NULL AND EXISTS(SELECT 1 FROM site_users WHERE discord_id=j.subject_id AND account_incarnation=j.original_account_incarnation))))`;
}

/** JSON functions below run only after this CASE proves a well-formed object.
 * Duplicate keys anywhere in a document are not silently interpreted last-wins.
 */
const objectSql=(doc:string)=>`CASE WHEN NOT json_valid(${doc}) THEN 0 WHEN json_type(${doc})<>'object' THEN 0
 ELSE NOT EXISTS(SELECT 1 FROM json_tree(${doc}) d WHERE d.type='object'
 AND (SELECT COUNT(*) FROM json_each(d.value))<>(SELECT COUNT(DISTINCT key) FROM json_each(d.value))) END`;

function redactPaths(doc:string,paths:string):string{
 return `(WITH RECURSIVE matches(path,ordinal) AS(SELECT path,ROW_NUMBER() OVER(ORDER BY path) FROM(${paths})),
 scrubbed(ordinal,text) AS(SELECT 0,${doc} UNION ALL SELECT s.ordinal+1,json_set(s.text,m.path,${WITHHELD})
 FROM scrubbed s JOIN matches m ON m.ordinal=s.ordinal+1)
 SELECT text FROM scrubbed ORDER BY ordinal DESC LIMIT 1)`;
}

/** Only the concrete directory fields accepted by cleanLeadership can be rewritten.
 * Guild labels, other fields and non-account names are never inferred as identities.
 */
const directorySql=(doc:string)=>`CASE WHEN NOT json_valid(${doc}) THEN 0 WHEN json_type(${doc})='object' THEN ${leadershipEnvelopeSql(doc)} WHEN json_type(${doc})<>'array' THEN 0
 WHEN json_array_length(${doc})<>10 THEN 0 ELSE NOT EXISTS(SELECT 1 FROM json_each(${doc}) g WHERE CASE
 WHEN g.type<>'object' THEN 1
 WHEN(SELECT COUNT(*) FROM json_each(g.value))<>3 OR(SELECT COUNT(DISTINCT key) FROM json_each(g.value))<>3 THEN 1
 WHEN COALESCE(json_type(g.value,'$.name'),'')<>'text' OR COALESCE(json_type(g.value,'$.gm'),'')<>'text' OR COALESCE(json_type(g.value,'$.officers'),'')<>'array' THEN 1
 WHEN json_array_length(g.value,'$.officers')>12 THEN 1
 ELSE EXISTS(SELECT 1 FROM json_each(g.value,'$.officers') o WHERE o.type<>'text') END) END`;

/** Finite source-authored plan, consumed in one D1 transaction. No caller SQL, alias
 * list, display-name match or directory ownership claim is accepted by this builder.
 */
export function nativeErasurePersonalReferenceStatements(env:Env,input:AccountErasureProof):D1PreparedStatement[]{
 if(!enabled(env))throw Error('native_erasure_cleanup_disabled');
 const captured=captureAccountErasureProof(input),proof=captured.proof,current=currentSql(proof);
 const bind=(sql:string)=>env.DB.prepare(sql).bind(proof.operationId,proof.subject,proof.subjectGeneration,proof.requestDigest);
 const appointed='site_settings.value';
 const appointmentPaths=`SELECT e.fullkey AS path FROM json_each(${appointed}) e WHERE ${exactAccount('e.value')}`;
 const directoryGuilds=`CASE WHEN json_type(${appointed})='array' THEN ${appointed} ELSE json_extract(${appointed},'$.guilds') END`;
 const directoryPrefix=`CASE WHEN json_type(${appointed})='array' THEN '$' ELSE '$.guilds' END`;
 const directoryPaths=`SELECT ${directoryPrefix}||'['||g.key||'].gm' AS path,0 AS remove FROM json_each(${directoryGuilds}) g WHERE ${exactAccount("json_extract(g.value,'$.gm')")}
 UNION ALL SELECT ${directoryPrefix}||'['||g.key||'].officers['||o.key||']' AS path,0 AS remove FROM json_each(${directoryGuilds}) g,json_each(g.value,'$.officers') o WHERE ${exactAccount('o.value')}
 UNION ALL SELECT '$.publications.'||p.key AS path,1 AS remove FROM json_each(${appointed},'$.publications') p WHERE ${exactAccount("json_extract(p.value,'$.pointer')")}`;
 const directoryRedacted=`(WITH RECURSIVE matches(path,remove,ordinal) AS(SELECT path,remove,ROW_NUMBER() OVER(ORDER BY path) FROM(${directoryPaths})),
 scrubbed(ordinal,text) AS(SELECT 0,${appointed} UNION ALL SELECT s.ordinal+1,CASE WHEN m.remove=1 THEN json_remove(s.text,m.path) ELSE json_set(s.text,m.path,${WITHHELD}) END
 FROM scrubbed s JOIN matches m ON m.ordinal=s.ordinal+1) SELECT text FROM scrubbed ORDER BY ordinal DESC LIMIT 1)`;
 const answer='a.answers',answerObject=objectSql(answer);
 const discordReference=`CASE WHEN e.type<>'object' THEN 0 ELSE json_type(e.value,'$.kind')='text'
 AND json_extract(e.value,'$.kind')='discord' AND json_type(e.value,'$.key')='text' AND ${exactAccount("json_extract(e.value,'$.key')")} END`;
 const scalarPaths=`SELECT e.fullkey AS path FROM json_tree(${answer}) e WHERE e.type='text' AND ${exactAccount('e.value')}
 AND e.fullkey<>'$.references' AND e.fullkey NOT LIKE '$.references[%' AND e.fullkey NOT LIKE '$.references.%'`;
 const statements=[
 bind(`SELECT CASE WHEN ${current} THEN 1 ELSE json_extract('native_erasure_cleanup_not_current','$') END AS native_cleanup_current`),
 bind(`UPDATE site_settings SET value=${redactPaths(appointed,appointmentPaths)} WHERE key='appointed' AND ${current}
 AND CASE WHEN NOT(${objectSql(appointed)}) THEN 0 ELSE NOT EXISTS(SELECT 1 FROM json_each(${appointed}) e
 WHERE e.type<>'text' OR typeof(e.key)<>'text' OR length(e.key)=0 OR e.key GLOB '*[^a-z0-9_:]*')
 AND EXISTS(SELECT 1 FROM json_each(${appointed}) e WHERE ${exactAccount('e.value')}) END`),
 bind(`UPDATE site_settings SET value=${directoryRedacted} WHERE key='leadership' AND ${current}
 AND CASE WHEN NOT(${directorySql(appointed)}) THEN 0 ELSE EXISTS(SELECT 1 FROM(${directoryPaths})) END`),
 bind(`UPDATE site_applications AS a SET answers=(WITH RECURSIVE matches(idx,ordinal) AS(
 SELECT CAST(e.key AS INTEGER),ROW_NUMBER() OVER(ORDER BY CAST(e.key AS INTEGER) DESC)
 FROM json_each(${answer},'$.references') e WHERE ${discordReference}),
 scrubbed(ordinal,text) AS(SELECT 0,${answer} UNION ALL SELECT s.ordinal+1,json_remove(s.text,'$.references['||m.idx||']')
 FROM scrubbed s JOIN matches m ON m.ordinal=s.ordinal+1)
 SELECT text FROM scrubbed ORDER BY ordinal DESC LIMIT 1)
 WHERE a.discord_id<>?2 AND ${current} AND CASE WHEN NOT(${answerObject}) THEN 0
 WHEN COALESCE(json_type(${answer},'$.references'),'')<>'array' THEN 0
 ELSE EXISTS(SELECT 1 FROM json_each(${answer},'$.references') e WHERE ${discordReference}) END`),
 bind(`UPDATE site_applications AS a SET answers=${redactPaths(answer,scalarPaths)} WHERE a.discord_id<>?2 AND ${current}
 AND CASE WHEN NOT(${answerObject}) THEN 0 ELSE EXISTS(SELECT 1 FROM(${scalarPaths})) END`),
 bind(`SELECT CASE WHEN ${current} THEN 1 ELSE json_extract('native_erasure_cleanup_unconfirmed','$') END AS native_cleanup_recorded`),
 ];
 captured.check();return statements;
}

export type NativePersonalReferenceCleanup=Readonly<{state:'cleaned'|'unknown';changed:number|null;legacyNames:'not_inferred'}>;

/** This pre-terminal cleanup is authorized by the same consumed self-erasure proof.
 * Failure or a lost reply is unknown, never a rollback assertion or a new retry grant.
 */
export async function cleanupNativePersonalReferences(env:Env,input:AccountErasureProof):Promise<NativePersonalReferenceCleanup>{
 const captured=captureAccountErasureProof(input),database=env.DB,mode=Object.getOwnPropertyDescriptor(env,'PRIVACY_NATIVE_ERASURE_ENABLED'),flag=Object.getOwnPropertyDescriptor(env,'PRIVACY_ERASURE_ENABLED');
 const statements=nativeErasurePersonalReferenceStatements(env,input);
 const unchanged=()=>captured.check();
 unchanged();
 try{
  const result=await database.batch<{native_cleanup_current?:number;native_cleanup_recorded?:number}>(statements);unchanged();
  if(env.DB!==database||!enabled(env)||!Object.is(Object.getOwnPropertyDescriptor(env,'PRIVACY_NATIVE_ERASURE_ENABLED')?.value,mode?.value)
  ||!Object.is(Object.getOwnPropertyDescriptor(env,'PRIVACY_ERASURE_ENABLED')?.value,flag?.value)
  ||result.length!==statements.length||result[0]?.results[0]?.native_cleanup_current!==1
  ||result.at(-1)?.results[0]?.native_cleanup_recorded!==1)return Object.freeze({state:'unknown',changed:null,legacyNames:'not_inferred'});
  const changes=result.slice(1,-1).map(r=>r.meta.changes);
  if(changes.some(n=>!Number.isSafeInteger(n)||n<0))return Object.freeze({state:'unknown',changed:null,legacyNames:'not_inferred'});
  return Object.freeze({state:'cleaned',changed:changes.reduce((sum,n)=>sum+n,0),legacyNames:'not_inferred'});
 }catch{return Object.freeze({state:'unknown',changed:null,legacyNames:'not_inferred'});}
}
