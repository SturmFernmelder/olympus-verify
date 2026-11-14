// Synthetic publication/state fixtures; actual index, OAuth, publisher and Native D1.
import app from '../src/index.ts';
import {ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON,ADMISSION_EXPECTED_JSON} from '../src/privacy-write-admission-catalogue.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {prepareAppointmentPublication} from '../src/site-appointed-identities.ts';
import {CANONICAL_RANKS233,CANONICAL_PROFILE233} from '../src/canonical-ranks233.ts';
import {DIRECTIVE_CANONICAL_PROFILE} from '../src/native-rank-constants.ts';
import {qualifiedNativeSnapshotSource,nativeSnapshotSource} from '../src/native-rank-schemes.ts';
import {parseLaunchNativeScope} from '../src/launch-verification227.ts';
const BASE='https://guild.example',GUILD='236932545793490944',BOT='300000000000000099',OTHER='300000000000000004',EPOCH='a'.repeat(32),LAYOUT=TEST_LAYOUT280,ASSET='SYNTHETIC_PRIVATE_TREASURY_ASSET';
const names=['legacy-treasurer','canonical-treasurer','legacy-cogm','canonical-cogm','historical-treasurer','unsigned-legacy','display-only','mismatched-proof','unrelated-office','revoked','conflict','session-revoked','birth-changed','generation-changed','banned','legacy-revoked','directive-officer','wrong-index','stale-roster','old-policy','old-native','guid-duplicate','legacy-held-policy','original-v1-officer','original-observed-officer','original-observed-2h','original-observed-malformed','original-observed-wrong-scope','original-observed-own-mismatch','original-observed-steward','original-observed-alt','original-observed-source-drift','original-observed-row-drift','original-observed-mixed-officers','original-observed-mixed-reverse','original-observed-mixed-lost-valid'];
const originalKinds=new Set(['original-v1-officer','original-observed-officer','original-observed-2h','original-observed-malformed','original-observed-wrong-scope','original-observed-own-mismatch','original-observed-steward','original-observed-alt','original-observed-source-drift','original-observed-row-drift','original-observed-mixed-officers','original-observed-mixed-reverse','original-observed-mixed-lost-valid']),rankKinds=new Set(['directive-officer','wrong-index','stale-roster','old-policy','old-native','guid-duplicate',...originalKinds]);
const mixedKinds=new Set(['original-observed-mixed-officers','original-observed-mixed-reverse','original-observed-mixed-lost-valid']);
const nativeScope={guild:'OLYMPUS PRIME',realm:'Native Realm'},observedNames=['Guild Master','Steward','High Council','Officer','Officer Alt','Raid Leader','Veteran','Alt','Member','Initiate'];
const cases=new Map(),method=(object,key)=>{for(let p=object;p;p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,key);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw Error('original_method');return d.value;}}throw Error('original_method_missing');};
const packets=body=>{const p=JSON.parse(body);return Array.isArray(p)?p:[p];};
async function setup(db,kind){
 const ID=String(300000000000100000n+BigInt(names.indexOf(kind))),profile=LAYOUT==='canonical'?JSON.parse(ADMISSION_EXPECTED_JSON):JSON.parse(ADMISSION_COOKIE_PRE_SEAL_SOURCES_JSON).recordedLive.profile;
 const objects=[...profile.tables,...profile.indexes,{sql:profile.slotSQL}].map(row=>db.prepare(row.sql));while(objects.length)await db.batch(objects.splice(0,40));
 const now=(await db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) at").first()).at;
 let source=kind==='old-native'?'addon-native-v1:'+JSON.stringify({version:1,...nativeScope}):qualifiedNativeSnapshotSource(nativeScope.guild,nativeScope.realm);
 if(originalKinds.has(kind)){
  const names=observedNames.slice();if(kind==='original-observed-own-mismatch'||mixedKinds.has(kind))names[3]='Unconfirmed Officer';
  source=kind==='original-v1-officer'?parseLaunchNativeScope(JSON.stringify({version:1,...nativeScope})).provenance:nativeSnapshotSource(nativeScope.guild,kind==='original-observed-wrong-scope'?'Different Realm':nativeScope.realm,{version:1,names},[]);
  if(kind==='original-observed-malformed')source='addon-native-v2:'+JSON.stringify({...JSON.parse(source.slice(16)),rankProfile:'unqualified-caller-label'});
 }
 await db.batch([
  db.prepare("INSERT INTO privacy_write_admission(singleton,protocol,epoch,mode,active,nonce,purpose,entry_changes,logical_changes)VALUES(1,'olympus-write-admission-epoch-2',?1,'serving',0,'','',0,0)").bind(EPOCH),
  db.prepare("INSERT INTO privacy_rejection_expiry_control VALUES(1,'original-guild-rejection-expiry-v1',0,0)"),
  db.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('auditTypedNames','115',?1)").bind(now),
  db.prepare("INSERT INTO roster_snapshots(id,exported_at,received_at,first_received_at,source,member_count,trusted,complete)VALUES(1,?1,?2,?2,?3,1000,1,1)").bind(kind==='stale-roster'?now-259200:kind==='original-observed-2h'?now-7200:now,now,source),
 ]);
 const rows=Array.from({length:1000},(_,i)=>({id:i===0?ID:String(400000000001000000n+BigInt(i)),name:'Synthetic '+i,guid:'Player-1234-'+(0x10000000+i).toString(16).toUpperCase(),rank:i===0&&rankKinds.has(kind)?'Officer':'Member',index:i===0&&rankKinds.has(kind)?originalKinds.has(kind)?3:kind==='wrong-index'?3:2:originalKinds.has(kind)?8:7}));
 if(kind==='original-observed-steward'){rows[0].rank='Steward';rows[0].index=1;}
 if(kind==='original-observed-alt'){rows[0].rank='Alt';rows[0].index=7;}
 const mixedValidGuid=rows[1].guid;
 if(mixedKinds.has(kind)){rows[1].rank='Guild Master';rows[1].index=0;if(kind==='original-observed-mixed-reverse')rows.reverse();}
 if(kind==='guid-duplicate')rows[1].guid=rows[0].guid;
 const raw=JSON.stringify(rows);await db.batch([
  db.prepare("INSERT INTO members(discord_id,username,banned,activity_at)SELECT json_extract(value,'$.id'),'synthetic_'||key,0,?2 FROM json_each(?1)").bind(raw,now),
  db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)SELECT lower(json_extract(value,'$.name')),json_extract(value,'$.name'),json_extract(value,'$.id'),'member',?2,?2,'synthetic',json_extract(value,'$.guid') FROM json_each(?1)").bind(raw,now),
  db.prepare("INSERT INTO roster_members(snapshot_id,name_key,name,guid,rank,rank_index,level)SELECT 1,lower(json_extract(value,'$.name')),json_extract(value,'$.name'),json_extract(value,'$.guid'),json_extract(value,'$.rank'),json_extract(value,'$.index'),60 FROM json_each(?1)").bind(raw),
 ]);
 if(mixedKinds.has(kind))await db.prepare('UPDATE characters SET discord_id=?1 WHERE guid=?2').bind(ID,mixedValidGuid).run();
 const triggers=profile.triggers.map(row=>db.prepare(row.sql));while(triggers.length)await db.batch(triggers.splice(0,40));
 const s={ID,kind,now,db,wires:[],requests:[],assetFetches:0,published:null};
 const fetcher=Object.getOwnPropertyDescriptor(db,'fetcher').value,send=method(fetcher,'fetch');Object.defineProperty(fetcher,'fetch',{configurable:true,writable:false,value:async function(input,init){const wire={body:init.body,at:Date.now(),status:null};s.wires.push(wire);const response=await Reflect.apply(send,fetcher,[input,init]);wire.status=response.status;wire.response=await response.clone().text();wire.finishedAt=Date.now();return response;}});
 const old=kind==='old-policy'||kind==='legacy-held-policy'||originalKinds.has(kind),policy={version:old?1:2,enabled:true,profile:old?CANONICAL_PROFILE233:DIRECTIVE_CANONICAL_PROFILE,guildId:GUILD,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))};
 const env={DB:db,PRIVACY_NATIVE_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ENABLED:'true',PRIVACY_ERASURE_ATTEMPT_DISCIPLINE:'true',PRIVACY_ACCESS_ENABLED:'true',PRIVACY_RETENTION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_ENABLED:'true',PRIVACY_WRITE_ADMISSION_LAYOUT:LAYOUT,PRIVACY_WRITE_ADMISSION_EPOCH:EPOCH,
 COOKIE_SECRET:'synthetic-appointment-cookie-secret-0123456789',DISCORD_APP_ID:BOT,DISCORD_CLIENT_SECRET:'synthetic-appointment-client',DISCORD_BOT_TOKEN:'synthetic-appointment-bot',VERIFY_SECRET:'synthetic-appointment-verify',SITE_HOST:'guild.example',PUBLIC_BASE_URL:'https://verify.example',SITE_GUILD_ID:GUILD,GUILD_ID:GUILD,SITE_ADMINS:OTHER,ROLE_GUILD_MEMBER:CANONICAL_RANKS233[9].roleId,ROLE_OFFICER:CANONICAL_RANKS233[2].roleId,ROLE_RAID_LEADER:CANONICAL_RANKS233[4].roleId,CANONICAL_RANKS233:JSON.stringify(policy),VERIFY_MEMBERSHIP_ONLY:'true',VERIFY_NATIVE_SCOPE:JSON.stringify({version:1,guild:'OLYMPUS PRIME',realm:'Native Realm'}),LINKS_NOT_BEFORE:String(now-604800),LINKS_NOT_BEFORE_CLOCK_GATED:'false',QR_NATIVE_ROLE_MAP:'off',COMMUNITY_FEATURES:'',BETA_RESET_REMOVALS_ENABLED:'false',CF_VERSION_METADATA:{id:'11111111-2222-3333-4444-555555555555',tag:'synthetic-appointment280',timestamp:'2026-11-13T00:00:00Z'},ASSETS:{async fetch(){s.assetFetches++;
  if(!s.mutated){s.mutated=true;
   if(kind==='revoked'||kind==='legacy-revoked')await s.writer.prepare("UPDATE site_settings SET value='{}' WHERE key='appointed'").run();
   if(kind==='conflict'){const changed={...s.published,office_86:'<@'+OTHER+'>'};await s.writer.prepare("UPDATE site_settings SET value=?1 WHERE key='appointed'").bind(JSON.stringify(changed)).run();}
   if(kind==='session-revoked')await s.writer.prepare('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?1').bind(ID).run();
   if(kind==='birth-changed')await s.writer.prepare('UPDATE site_users SET account_incarnation=?1 WHERE discord_id=?2').bind('b'.repeat(32),ID).run();
   if(kind==='generation-changed')await s.writer.prepare("INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at)VALUES(?1,?2,'active',1,?3,?3)").bind(ID,'c'.repeat(32),now).run();
   if(kind==='banned')await s.writer.prepare('UPDATE members SET banned=1 WHERE discord_id=?1').bind(ID).run();
   if(kind==='original-observed-source-drift')await s.writer.prepare('UPDATE roster_snapshots SET source=?1 WHERE id=1').bind(nativeSnapshotSource(nativeScope.guild,'Different Realm',{version:1,names:observedNames},[])).run();
   if(kind==='original-observed-mixed-lost-valid')await s.writer.prepare("UPDATE roster_members SET rank='Member',rank_index=8 WHERE snapshot_id=1 AND guid=?1").bind(mixedValidGuid).run();
   if(kind==='original-observed-row-drift')await s.writer.prepare("UPDATE roster_members SET rank='Member',rank_index=8 WHERE snapshot_id=1 AND guid=?1").bind(rows[0].guid).run();
  }
  return new Response(ASSET,{headers:{'Content-Type':'text/javascript'}});
 }}};
 s.env=env;s.writer=createPrivacyWriteAdmissionDatabase(db,'writer',LAYOUT,EPOCH);return s;
}
export default{async fetch(request,bindings){try{
 const u=new URL(request.url),kind=u.searchParams.get('case');if(!names.includes(kind))return new Response(null,{status:400});
 if(u.pathname==='/setup'){if(cases.has(kind))return new Response(null,{status:409});const s=await setup(bindings['DB_'+kind.replaceAll('-','_')],kind);cases.set(kind,s);return Response.json({ID:s.ID,actualNativeD1:true,clockOverride:false,nativeNow:s.now,rosterRows:(await s.db.prepare('SELECT COUNT(*) n FROM roster_members').first()).n});}
 const s=cases.get(kind);if(!s)return new Response(null,{status:409});
 if(u.pathname==='/publish'){
  const keys={'legacy-treasurer':'treasurer','canonical-treasurer':'office_86','legacy-cogm':'co_gm','canonical-cogm':'office_19','historical-treasurer':'rank_treasurer','unrelated-office':'office_85','legacy-held-policy':'treasurer','legacy-revoked':'treasurer'};let appointed={},publisher=false;
  if(!rankKinds.has(kind)){
   const key=keys[kind]||'office_86';
   if(kind==='unsigned-legacy')appointed={treasurer:'<@'+s.ID+'>'};else if(kind==='display-only')appointed={treasurer:'Synthetic owner'};
   else{const result=await prepareAppointmentPublication({...s.env,DB:s.writer},{[kind==='mismatched-proof'?'treasurer':key]:'<@'+s.ID+'>'});if(!result.ok)throw Error('original_publication_refused:'+JSON.stringify(result));appointed=result.stored;publisher=true;
    if(kind==='mismatched-proof')appointed=Object.fromEntries(Object.entries(appointed).map(([key,value])=>[key.replace(/^treasurer(?=:publication:|$)/,'office_86'),value]));
   }
  }
  await s.writer.prepare("INSERT INTO site_settings(key,value,updated_at)VALUES('appointed',?1,?2)").bind(JSON.stringify(appointed),s.now).run();s.published=appointed;return Response.json({sourcePublisher:publisher,keys:Object.keys(appointed),stored:appointed});
 }
 if(u.pathname==='/inspect')return Response.json({ID:s.ID,kind,actualNativeD1:true,clockOverride:false,handlerOverride:false,issuerOverride:false,assetFetches:s.assetFetches,requests:s.requests,appointed:await s.db.prepare("SELECT value,updated_at FROM site_settings WHERE key='appointed'").first(),control:await s.db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').first(),siteUser:await s.db.prepare('SELECT session_version,account_incarnation FROM site_users WHERE discord_id=?1').bind(s.ID).first(),nativeSnapshot:await s.db.prepare('SELECT id,exported_at,source,member_count,trusted,complete FROM roster_snapshots WHERE id=1').first(),nativeOwner:await s.db.prepare('SELECT guid,rank,rank_index FROM roster_members WHERE snapshot_id=1 AND name_key=?1').bind('synthetic 0').first(),nativeCandidates:(await s.db.prepare('SELECT r.name_key,r.guid,r.rank,r.rank_index,c.discord_id AS discordId,c.rowid AS characterRowid FROM roster_members r JOIN characters c ON c.guid=r.guid WHERE r.snapshot_id=1 AND c.discord_id=?1 ORDER BY r.name_key LIMIT 3').bind(s.ID).all()).results});
 if(u.pathname.startsWith('/front/')){
  const params=new URLSearchParams(u.search);params.delete('case');const target=BASE+u.pathname.slice('/front'.length)+(params.size?'?'+params:''),headers=new Headers(request.headers);if(request.method==='POST')headers.set('Origin',BASE);
  const original=new Request(target,{method:request.method,headers,...(!['GET','HEAD'].includes(request.method)?{body:request.body}:{})}),start=s.wires.length,jobs=[],at=Date.now();const response=await app.fetch(original,s.env,{waitUntil(p){jobs.push(Promise.resolve(p));}});for(const p of jobs)await p;s.requests.push({target,method:request.method,status:response.status,elapsedMS:Date.now()-at,physicalSQL:s.wires.slice(start).reduce((n,w)=>n+packets(w.body).length,0),maxNativeBatch:Math.max(0,...s.wires.slice(start).map(w=>packets(w.body).length))});return response;
 }
 return new Response(null,{status:404});
}catch(error){return Response.json({error:String(error.stack)},{status:500});}}};
