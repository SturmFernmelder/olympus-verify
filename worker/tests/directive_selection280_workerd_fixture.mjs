// Additional read-only actual D1/provider-read route checks; no native execution.
import {fixture280 as writerFixture} from './directive_rank280_workerd_fixture.mjs';
import {readDirectivePromotions,readDiscoveryOperations235,readLaunchOperations229} from '../src/site-launch229.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {NATIVE_SCOPE232} from '../src/native-rank-reconciliation232.ts';
import {CANONICAL_RANKS233,CANONICAL_PROFILE233} from '../src/canonical-ranks233.ts';
import {NATIVE_RANK_SCHEMES} from '../src/native-rank-schemes.ts';
import worker from '../src/index.ts';
import {sealPromotionIntent} from '../src/promotion-intent-directive.ts';
const H=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))),b=>b.toString(16).padStart(2,'0')).join('');
export function fixture280(seed){const scheme=NATIVE_RANK_SCHEMES[seed.steward?1:0];const wireViews=new Map(),original=writerFixture(seed,(db,wires)=>wireViews.set(db,wires));return {async fetch(request,bindings){
 const response=await original.fetch(request,bindings),r=await response.json();if(r.kind!=='new9')return Response.json(r);
 const db=bindings.DB_new9,scope={version:1,...NATIVE_SCOPE232},closure={...JSON.parse(seed.config.SHARED_MEMBERSHIP230_CLOSURE_JSON),debtPredicateSHA256:'2bc8a653168cd702a7804fc1631abc6a68ee8200c500fb1345b3087387b89f86',createdAt:seed.now-3600,expiresAt:seed.now-3300},closureJSON=JSON.stringify(closure);
 const env={...seed.config,DB:createPrivacyWriteAdmissionDatabase(db,'writer','recorded-live-pre-seal-20261017',seed.config.PRIVACY_WRITE_ADMISSION_EPOCH),VERIFY_NATIVE_SCOPE:JSON.stringify(scope),NATIVE_RANK_SYNC232:'off',QR_NATIVE_ROLE_MAP:'off',FULL_RELEASE_ROLES:'off',SITE_GUILD_ID:seed.config.GUILD_ID,CANONICAL_RANKS233:JSON.stringify({version:seed.activeV1?1:seed.steward?3:2,enabled:true,profile:seed.activeV1?CANONICAL_PROFILE233:scheme.canonicalProfile,guildId:seed.config.GUILD_ID,ranks:CANONICAL_RANKS233.map(x=>({...x,permissions:'0'}))}),SHARED_MEMBERSHIP230_CLOSURE_JSON:closureJSON,SHARED_MEMBERSHIP230_CLOSURE_SHA256:await H(closureJSON),DISCORD_BOT_TOKEN:seed.config.DISCORD_BOT_TOKEN+'-new9'};
 const target='Player-4613-12345678',actor='Player-4613-10000000',at=()=>Math.floor(Date.now()/1000),input=(n,snapshotId,snapshotAt,confirmations=[],actorGuid=actor)=>({selectionId:at()+':'+n,targetGuids:[target],snapshotId,snapshotAt,actorGuid,confirmations});
 const wireView=wireViews.get(db);if(!wireView)throw Error('actual_native_wire_view_missing');
 const invocations285=[],packets=raw=>{const p=JSON.parse(raw);return Array.isArray(p)?p:[p];};
 const measured=async(name,work)=>{const start=wireView.length,result=await work(),end=wireView.length,queries=wireView.slice(start,end).flatMap(w=>packets(w.requestBody)),failed=wireView.slice(start,end).some(w=>w.status!==200||packets(w.responseBody).some(x=>x.success===false));invocations285.push({name,start,end,physicalStatements:queries.length,maxSQLBytes:Math.max(0,...queries.map(x=>new TextEncoder().encode(x.sql).length)),maxBinds:Math.max(0,...queries.map(x=>x.params?.length??0)),failed});return result;};
 const artifactReads=[];
 const readSelected=(name,sourceEnv,requestInput)=>measured(name,async()=>{
  if(!seed.releaseArtifact)return readDirectivePromotions(sourceEnv,requestInput);
  const token='synthetic-selected-release-watcher-token',q=new URLSearchParams({keyVersion:'officer-operations-v234',selectionId:String(requestInput.selectionId),targetGuids:JSON.stringify(requestInput.targetGuids),snapshotId:String(requestInput.snapshotId),snapshotAt:String(requestInput.snapshotAt),actorGuid:requestInput.actorGuid,confirmations:JSON.stringify(requestInput.confirmations)});
  const response=await worker.fetch(new Request(new URL('/queue/launch-operations?'+q,sourceEnv.PUBLIC_BASE_URL),{headers:{Authorization:'Bearer '+token}}),{...sourceEnv,DB:db,WATCHER_TOKEN:token},{waitUntil(){},passThroughOnException(){}});
  artifactReads.push({name,status:response.status});if(response.status!==200)throw Error('Exact selected release route refused '+name+' '+response.status);
  return response.json();
 });
 const discovery=seed.activeV1?await measured('discovery',()=>readDiscoveryOperations235(env)):null;
 const genericHeld=seed.activeV1?await measured('generic-held',()=>readLaunchOperations229(env)):null;
 const initial=await readSelected('initial',env,input(seed.activeV1?2:1,1,seed.now));
 const knight=seed.activeV1?await readSelected('knight-initiate', {...env,DISCORD_BOT_TOKEN:env.DISCORD_BOT_TOKEN+'-knight'},input(30,1,seed.now)):null;
 const subsetHeld=[];
 if(seed.activeV1){
  for(const slot of [1,7])subsetHeld.push({slot,page:(await readSelected('target-slot-'+slot,env,{...input(10+slot,1,seed.now),targetGuids:['Player-4613-'+(0x10000000+slot).toString(16).toUpperCase()]})).page});
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
 let knightChain=null;
 if(seed.activeV1){
  // The native changes below are explicit synthetic observations, not commands.
  // Provider state controls change only the host's mocked Discord response.
  await env.DB.prepare('UPDATE roster_snapshots SET source=(SELECT source FROM roster_snapshots WHERE id=1) WHERE id=2').run();
  const knightEnv={...env,DISCORD_BOT_TOKEN:env.DISCORD_BOT_TOKEN+'-knight'},originalIntent=knight?.page?.promotions?.[0];
  if(originalIntent?.intentToken){
   const advance=async(id,slot)=>{const stamp=at();await env.DB.batch([
    env.DB.prepare('INSERT INTO roster_snapshots(id,exported_at,received_at,source,member_count,complete,trusted,content_hash)SELECT ?1,?2,?2,source,member_count,1,1,content_hash FROM roster_snapshots WHERE id=1').bind(id,stamp),
    env.DB.prepare('INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level)SELECT ?1,name_key,name,guid,CASE WHEN guid=?2 THEN ?3 ELSE rank END,CASE WHEN guid=?2 THEN ?4 ELSE rank_index END,level FROM roster_members WHERE snapshot_id=1').bind(id,target,scheme.names[slot],slot)
   ]);return stamp;};
   const roleState=async state=>{const response=await fetch('https://discord.com/__fixture/knight-state/'+state,{headers:{Authorization:'Bot '+knightEnv.DISCORD_BOT_TOKEN}});if(!response.ok)throw Error('Synthetic role-state control failed');};
   const stamp3=await advance(3,8),confirm1={guid:target,token:originalIntent.intentToken,from:9,to:8,observedAt:stamp3};
   const memberStart=await readSelected('knight-member-start',knightEnv,input(40,3,stamp3));
   const memberContinue=await readSelected('knight-member-continuation',knightEnv,input(41,3,stamp3,[confirm1]));
   const first=memberContinue.page.promotions[0];
   const reusedSnapshot=await readSelected('knight-same-snapshot',knightEnv,input(42,3,stamp3,[{...confirm1,token:first?.intentToken??confirm1.token,from:8,to:7}]));
   const wrongKnightActor=await readSelected('knight-wrong-qualified-actor',knightEnv,input(43,3,stamp3,[confirm1],'Player-4613-10000003'));
   const forgedKnight=await readSelected('knight-forged-token',knightEnv,input(44,3,stamp3,[{...confirm1,token:confirm1.token.slice(0,-1)+(confirm1.token.at(-1)==='a'?'b':'a')}]));
   const stamp4=await advance(4,7),confirm2={guid:target,token:first?.intentToken??confirm1.token,from:8,to:7,observedAt:stamp4};
   const altWithoutReceipt=await readSelected('knight-alt-without-receipt',knightEnv,input(45,4,stamp4));
   await roleState('non-knight');const lostKnight=await readSelected('knight-role-lost',knightEnv,input(46,4,stamp4,[confirm2]));
   await roleState('unknown');const unknownKnight=await readSelected('knight-role-unknown',knightEnv,input(47,4,stamp4,[confirm2]));
   await roleState('knight');const altContinue=await readSelected('knight-alt-owned-continuation',knightEnv,input(48,4,stamp4,[confirm2]));
   const second=altContinue.page.promotions[0];
   const wrongStep=await readSelected('knight-wrong-step',knightEnv,input(49,4,stamp4,[{...confirm2,from:9,to:8}]));
   const omittedStep=await readSelected('knight-skipped-step',knightEnv,input(50,4,stamp4,[{...confirm2,token:originalIntent.intentToken,from:9,to:8}]));
   // Shorten only the synthetic acknowledged intent's expiry, sign while it
   // is valid, and let real time expire it. The unchanged token must still
   // succeed for the identical current Alt7 source and observed8-to7 step.
   let expiryControl=null,expired=null;
   if(first?.intentToken){
    const shortExpiry=at()+1,expiredIntent={...first.intent,expiresAt:shortExpiry};
    const expiredToken=await sealPromotionIntent(expiredIntent,JSON.stringify(['promotion-directive',1,env.VERIFY_SECRET,env.SITE_GUILD_ID,knightEnv.DISCORD_BOT_TOKEN]),at());
    await new Promise(resolve=>setTimeout(resolve,Math.max(1,(shortExpiry+1)*1000-Date.now())));
    expiryControl=await readSelected('knight-unexpired-control',knightEnv,input(55,4,stamp4,[confirm2]));
    expired=await readSelected('knight-expired-original',knightEnv,input(54,4,stamp4,[{...confirm2,token:expiredToken}]));
   }
   const originalVerified=await env.DB.prepare('SELECT verified_at FROM characters WHERE guid=?1').bind(target).first();
   await env.DB.prepare('UPDATE characters SET verified_at=verified_at+1 WHERE guid=?1').bind(target).run();
   const changedIdentity=await readSelected('knight-changed-identity',knightEnv,input(51,4,stamp4,[confirm2]));
   await env.DB.prepare('UPDATE characters SET verified_at=?1 WHERE guid=?2').bind(originalVerified.verified_at,target).run();
   const stamp5=await advance(5,6),confirm3={guid:target,token:second?.intentToken??confirm2.token,from:7,to:6,observedAt:stamp5};
   const completed=await readSelected('knight-completed',knightEnv,input(52,5,stamp5,[confirm3]));
   const completedFresh=await readSelected('knight-completed-fresh',knightEnv,input(53,5,stamp5));
   knightChain={memberStart,memberContinue,reusedSnapshot,wrongKnightActor,forgedKnight,altWithoutReceipt,lostKnight,unknownKnight,altContinue,wrongStep,omittedStep,expiryControl,expired,changedIdentity,completed,completedFresh};
  }else knightChain={missingInitial:true};
 }
 r.selection={invocations285,artifactReads,activePolicyVersion:JSON.parse(env.CANONICAL_RANKS233).version,discovery,genericHeld,subsetHeld,initial,knight,knightChain,ordinaryAlt,confirmed,forged,wrongActor,oldScheme};return Response.json(r);
}};}
