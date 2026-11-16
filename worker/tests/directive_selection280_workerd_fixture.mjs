// Additional read-only actual D1/provider-read route checks; no native execution.
import {fixture280 as writerFixture} from './directive_rank280_workerd_fixture.mjs';
import {readDirectivePromotions,readDiscoveryOperations235,readLaunchOperations229} from '../src/site-launch229.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {NATIVE_SCOPE232} from '../src/native-rank-reconciliation232.ts';
import {CANONICAL_RANKS233,CANONICAL_PROFILE233} from '../src/canonical-ranks233.ts';
import {NATIVE_RANK_SCHEMES} from '../src/native-rank-schemes.ts';
const H=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))),b=>b.toString(16).padStart(2,'0')).join('');
export function fixture280(seed){const scheme=NATIVE_RANK_SCHEMES[seed.steward?1:0];const wireViews=new Map(),original=writerFixture(seed,(db,wires)=>wireViews.set(db,wires));return {async fetch(request,bindings){
 const response=await original.fetch(request,bindings),r=await response.json();if(r.kind!=='new9')return Response.json(r);
 const db=bindings.DB_new9,scope={version:1,...NATIVE_SCOPE232},closure={...JSON.parse(seed.config.SHARED_MEMBERSHIP230_CLOSURE_JSON),debtPredicateSHA256:'2bc8a653168cd702a7804fc1631abc6a68ee8200c500fb1345b3087387b89f86',createdAt:seed.now-3600,expiresAt:seed.now-3300},closureJSON=JSON.stringify(closure);
 const env={...seed.config,DB:createPrivacyWriteAdmissionDatabase(db,'writer','recorded-live-pre-seal-20261017',seed.config.PRIVACY_WRITE_ADMISSION_EPOCH),VERIFY_NATIVE_SCOPE:JSON.stringify(scope),NATIVE_RANK_SYNC232:'off',QR_NATIVE_ROLE_MAP:'off',FULL_RELEASE_ROLES:'off',SITE_GUILD_ID:seed.config.GUILD_ID,CANONICAL_RANKS233:JSON.stringify({version:seed.activeV1?1:seed.steward?3:2,enabled:true,profile:seed.activeV1?CANONICAL_PROFILE233:scheme.canonicalProfile,guildId:seed.config.GUILD_ID,ranks:CANONICAL_RANKS233.map(x=>({...x,permissions:'0'}))}),SHARED_MEMBERSHIP230_CLOSURE_JSON:closureJSON,SHARED_MEMBERSHIP230_CLOSURE_SHA256:await H(closureJSON),DISCORD_BOT_TOKEN:seed.config.DISCORD_BOT_TOKEN+'-new9'};
 const target='Player-4613-12345678',actor='Player-4613-10000000',at=()=>Math.floor(Date.now()/1000),input=(n,snapshotId,snapshotAt,confirmations=[],actorGuid=actor)=>({selectionId:at()+':'+n,targetGuids:[target],snapshotId,snapshotAt,actorGuid,confirmations});
 const wireView=wireViews.get(db);if(!wireView)throw Error('actual_native_wire_view_missing');
 const invocations285=[],packets=raw=>{const p=JSON.parse(raw);return Array.isArray(p)?p:[p];};
 const measured=async(name,work)=>{const start=wireView.length,result=await work(),end=wireView.length,queries=wireView.slice(start,end).flatMap(w=>packets(w.requestBody)),failed=wireView.slice(start,end).some(w=>w.status!==200||packets(w.responseBody).some(x=>x.success===false));invocations285.push({name,start,end,physicalStatements:queries.length,maxSQLBytes:Math.max(0,...queries.map(x=>new TextEncoder().encode(x.sql).length)),maxBinds:Math.max(0,...queries.map(x=>x.params?.length??0)),failed});return result;};
 const readSelected=(name,sourceEnv,requestInput)=>measured(name,()=>readDirectivePromotions(sourceEnv,requestInput));
 const discovery=seed.activeV1?await measured('discovery',()=>readDiscoveryOperations235(env)):null;
 const genericHeld=seed.activeV1?await measured('generic-held',()=>readLaunchOperations229(env)):null;
 const initial=await readSelected('initial',env,input(seed.activeV1?2:1,1,seed.now));
 const subsetHeld=[];
 if(seed.activeV1){
  for(const slot of [1,7,8])subsetHeld.push({slot,page:(await readSelected('target-slot-'+slot,env,{...input(10+slot,1,seed.now),targetGuids:['Player-4613-'+(0x10000000+slot).toString(16).toUpperCase()]})).page});
  const stewardActor=await readSelected('actor-steward',env,input(20,1,seed.now,[],'Player-4613-10000001'));
  const altActor=await readSelected('actor-alt',env,input(21,1,seed.now,[],'Player-4613-10000007'));
  const off=await readSelected('policy-off',{...env,CANONICAL_RANKS233:env.CANONICAL_RANKS233.replace('"enabled":true','"enabled":false')},input(22,1,seed.now));
  const malformed=await readSelected('policy-malformed',{...env,CANONICAL_RANKS233:'{}'},input(23,1,seed.now));
  const wrongGuild=await readSelected('guild-mismatch',{...env,SITE_GUILD_ID:'999999999999999998'},input(24,1,seed.now));
  subsetHeld.push({actor:'steward',page:stewardActor.page},{actor:'alt',page:altActor.page},{policy:'off',page:off.page},{policy:'malformed',page:malformed.page},{siteGuild:'mismatch',page:wrongGuild.page});
 }
 const observedAt=at();await env.DB.batch([
  env.DB.prepare("INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,complete,trusted,content_hash)SELECT 2,?1,?1,source,member_count,1,1,content_hash FROM roster_snapshots WHERE id=1").bind(observedAt),
  env.DB.prepare("INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level)SELECT 2,name_key,name,guid,CASE WHEN guid=?1 THEN ?2 ELSE rank END,CASE WHEN guid=?1 THEN 8 ELSE rank_index END,level FROM roster_members WHERE snapshot_id=1").bind(target,scheme.names[8])
 ]);
 const ordinaryAlt=await readSelected('ordinary-completed-slot',env,input(2,2,observedAt)),token=initial.page.promotions[0]?.intentToken,confirmation={guid:target,token,from:9,to:8,observedAt};
 const confirmed=token?await readSelected('confirmation',env,input(3,2,observedAt,[confirmation])):null;
 const forged=token?await readSelected('forged',env,input(4,2,observedAt,[{...confirmation,token:token.slice(0,-1)+(token.at(-1)==='a'?'b':'a')}])):null;
 const wrongActor=token?await readSelected('wrong-actor',env,input(5,2,observedAt,[confirmation],'Player-4613-10000001')):null;
 await env.DB.prepare('UPDATE roster_snapshots SET source=?1 WHERE id=2').bind('addon-native-v1:'+JSON.stringify(scope)).run();
 // A failed initial proof/plan must remain a readable failing assertion. Do not
 // manufacture an invalid confirmation which hides it behind an uncaught500.
 const oldScheme=await readSelected('old-source',env,input(6,2,observedAt,token?[confirmation]:[]));
 r.selection={invocations285,activePolicyVersion:JSON.parse(env.CANONICAL_RANKS233).version,discovery,genericHeld,subsetHeld,initial,ordinaryAlt,confirmed,forged,wrongActor,oldScheme};return Response.json(r);
}};}
