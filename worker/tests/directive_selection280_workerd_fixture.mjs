// Additional read-only actual D1/provider-read route checks; no native execution.
import {fixture280 as writerFixture} from './directive_rank280_workerd_fixture.mjs';
import {readDirectivePromotions} from '../src/site-launch229.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {NATIVE_SCOPE232} from '../src/native-rank-reconciliation232.ts';
import {CANONICAL_RANKS233} from '../src/canonical-ranks233.ts';
import {DIRECTIVE_CANONICAL_PROFILE} from '../src/native-rank-schemes.ts';
const H=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))),b=>b.toString(16).padStart(2,'0')).join('');
export function fixture280(seed){const original=writerFixture(seed);return {async fetch(request,bindings){
 const response=await original.fetch(request,bindings),r=await response.json();if(r.kind!=='new9')return Response.json(r);
 const db=bindings.DB_new9,scope={version:1,...NATIVE_SCOPE232},closure={...JSON.parse(seed.config.SHARED_MEMBERSHIP230_CLOSURE_JSON),debtPredicateSHA256:'2bc8a653168cd702a7804fc1631abc6a68ee8200c500fb1345b3087387b89f86',createdAt:seed.now-3600,expiresAt:seed.now-3300},closureJSON=JSON.stringify(closure);
 const env={...seed.config,DB:createPrivacyWriteAdmissionDatabase(db,'writer','recorded-live-pre-seal-20261017',seed.config.PRIVACY_WRITE_ADMISSION_EPOCH),VERIFY_NATIVE_SCOPE:JSON.stringify(scope),NATIVE_RANK_SYNC232:'off',QR_NATIVE_ROLE_MAP:'off',FULL_RELEASE_ROLES:'off',SITE_GUILD_ID:seed.config.GUILD_ID,CANONICAL_RANKS233:JSON.stringify({version:2,enabled:true,profile:DIRECTIVE_CANONICAL_PROFILE,guildId:seed.config.GUILD_ID,ranks:CANONICAL_RANKS233.map(x=>({...x,permissions:'0'}))}),SHARED_MEMBERSHIP230_CLOSURE_JSON:closureJSON,SHARED_MEMBERSHIP230_CLOSURE_SHA256:await H(closureJSON),DISCORD_BOT_TOKEN:seed.config.DISCORD_BOT_TOKEN+'-new9'};
 const target='Player-4613-12345678',actor='Player-4613-10000000',at=()=>Math.floor(Date.now()/1000),input=(n,snapshotId,snapshotAt,confirmations=[],actorGuid=actor)=>({selectionId:at()+':'+n,targetGuids:[target],snapshotId,snapshotAt,actorGuid,confirmations});
 const initial=await readDirectivePromotions(env,input(1,1,seed.now));
 const observedAt=at();await env.DB.batch([
  env.DB.prepare("INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,complete,trusted,content_hash)SELECT 2,?1,?1,source,member_count,1,1,content_hash FROM roster_snapshots WHERE id=1").bind(observedAt),
  env.DB.prepare("INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level)SELECT 2,name_key,name,guid,CASE WHEN guid=?1 THEN 'Alt' ELSE rank END,CASE WHEN guid=?1 THEN 8 ELSE rank_index END,level FROM roster_members WHERE snapshot_id=1").bind(target)
 ]);
 const ordinaryAlt=await readDirectivePromotions(env,input(2,2,observedAt)),token=initial.page.promotions[0]?.intentToken,confirmation={guid:target,token,from:9,to:8,observedAt};
 const confirmed=token?await readDirectivePromotions(env,input(3,2,observedAt,[confirmation])):null;
 const forged=token?await readDirectivePromotions(env,input(4,2,observedAt,[{...confirmation,token:token.slice(0,-1)+(token.at(-1)==='a'?'b':'a')}])):null;
 const wrongActor=token?await readDirectivePromotions(env,input(5,2,observedAt,[confirmation],'Player-4613-10000001')):null;
 await env.DB.prepare('UPDATE roster_snapshots SET source=?1 WHERE id=2').bind('addon-native-v1:'+JSON.stringify(scope)).run();
 // A failed initial proof/plan must remain a readable failing assertion. Do not
 // manufacture an invalid confirmation which hides it behind an uncaught500.
 const oldScheme=await readDirectivePromotions(env,input(6,2,observedAt,token?[confirmation]:[]));
 r.selection={initial,ordinaryAlt,confirmed,forged,wrongActor,oldScheme};return Response.json(r);
}};}
