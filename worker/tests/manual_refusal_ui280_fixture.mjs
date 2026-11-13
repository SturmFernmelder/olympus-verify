// Actual command/access handlers and Native D1. Stored rows and Discord are synthetic.
import {handleInteraction} from '../src/interactions.ts';
import {handleAccessCheck242} from '../src/access-check242.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {CANONICAL_GUILD233,CANONICAL_RANKS233,CANONICAL_MANAGED_ROLE_IDS233} from '../src/canonical-ranks233.ts';
import {DIRECTIVE_CANONICAL_PROFILE} from '../src/native-rank-constants.ts';
import {NATIVE_SCOPE232} from '../src/native-rank-reconciliation232.ts';
import {CANONICAL_DELETE_REFUSAL280,BAN_DELETE_REFUSAL280} from '../src/role-delete-refusal280.ts';
const ACTOR='333333333333333333',OTHER='222222222222222222',OFFICER=CANONICAL_RANKS233[1].roleId;
export function manualRefusalUi280(seed){return {async fetch(request,bindings){try{
 const kind=new URL(request.url).pathname.slice(1),db=bindings.DB,subject=seed.tables.find(t=>t.name==='pending').rows[0].discord_id,t=Math.floor(Date.now()/1000),capacity=kind.startsWith('capacity');
 const batch=async rows=>{while(rows.length)await db.batch(rows.splice(0,40));};
 await batch(seed.objects.filter(x=>x.type!=='trigger'&&!x.name.startsWith('sqlite_')).map(x=>db.prepare(x.sql)));
 const order=['privacy_write_admission','privacy_rejection_expiry_control','site_settings','pending','roster_snapshots','roster_members','roster_first_seen','roster_effect_runs','audit'];
 for(const table of [...seed.tables].sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name)))for(const row of table.rows){const keys=Object.keys(row);await db.prepare('INSERT INTO "'+table.name+'"('+keys.map(k=>'"'+k+'"').join(',')+')VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>row[k])).run();}
 await db.prepare('INSERT INTO members(discord_id,banned)VALUES(?1,1)').bind(subject).run();
 await db.prepare('INSERT INTO members(discord_id)VALUES(?1)').bind(ACTOR).run();
 await db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at)VALUES('fixture staff','Fixture Staff',?1,'member',?2,?2)").bind(ACTOR,t-10).run();
 await db.prepare('INSERT INTO site_users(discord_id,username,in_server,first_login,last_login)VALUES(?1,?2,1,?3,?3)').bind(ACTOR,'Synthetic staff',t).run();
 const config={...seed.config,GUILD_ID:CANONICAL_GUILD233,SITE_GUILD_ID:CANONICAL_GUILD233,INTROS_GUILD_ID:CANONICAL_GUILD233,INTROS_CHANNELS:'raid-signups=800000000000000012',SITE_HOST:'refusal.example',VERIFY_NATIVE_SCOPE:JSON.stringify({version:1,...NATIVE_SCOPE232}),NATIVE_RANK_SYNC232:'off',QR_NATIVE_ROLE_MAP:'off',FULL_RELEASE_ROLES:'off',CANONICAL_RANKS233:JSON.stringify({version:2,enabled:true,profile:DIRECTIVE_CANONICAL_PROFILE,guildId:CANONICAL_GUILD233,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))}),DISCORD_BOT_TOKEN:seed.config.DISCORD_BOT_TOKEN+'-'+kind,ROLE_OFFICER:OFFICER,SITE_ADMINS:'',COOKIE_SECRET:'synthetic-refusal-ui-cookie-secret-0123456789'};
 let serial=0;const known=[];
 const insert=async(row)=>{const keys=Object.keys(row);await db.prepare('INSERT INTO role_settlements('+keys.join(',')+')VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>row[k])).run();};
 const refusal=(role,status,code,ban=false)=>({id:(++serial).toString(16).padStart(32,'0'),subject,purpose:ban?'canonical_ban_remove_v1':'canonical_routine233',proof_id:ban?'b'.repeat(32):null,guild_id:CANONICAL_GUILD233,role_id:role,desired:0,state:'held',reason:JSON.stringify({version:1,type:ban?BAN_DELETE_REFUSAL280:CANONICAL_DELETE_REFUSAL280,status,code,retryAfterSeconds:0}),attempts:1,claim_nonce:'c'.repeat(32),subject_generation:'d'.repeat(32),request_digest:(ban?'e'.repeat(64):'e'.repeat(32)),roster_id:ban?null:1,native_guid:ban?null:'Player-4613-12345678',native_profile:ban?'olympus-ban-rank-removal-20261112-v1':DIRECTIVE_CANONICAL_PROFILE,native_rank:ban?null:7,native_rank_name:ban?null:'Member',created_at:t-1000,expires_at:t-700,checked_at:t-900});
 if(capacity){for(const role of CANONICAL_MANAGED_ROLE_IDS233)for(const [status,code]of [[403,50001],[403,50013],[404,10007],[404,10011]])await insert(refusal(role,status,code));known.push(...CANONICAL_MANAGED_ROLE_IDS233);}
 else{
  known.push(CANONICAL_RANKS233[7].roleId,CANONICAL_RANKS233[9].roleId);
  await insert(refusal(known[0],403,50013));await insert(refusal(known[1],404,10011,true));
  if(kind==='access'||kind==='unban'){
   const unknown=refusal(CANONICAL_RANKS233[5].roleId,403,50013);unknown.state='unknown';unknown.reason='native232_provider_outcome_unknown';await insert(unknown);
   const foreign=refusal(CANONICAL_RANKS233[2].roleId,403,50001);foreign.subject=OTHER;await insert(foreign);
   const wrongGuild=refusal(CANONICAL_RANKS233[3].roleId,403,50001);wrongGuild.guild_id='999999999999999999';await insert(wrongGuild);
   const malformed=refusal(CANONICAL_RANKS233[4].roleId,403,50001);malformed.reason=JSON.stringify({version:1,type:CANONICAL_DELETE_REFUSAL280,status:403,code:50001,retryAfterSeconds:0,private:'DO_NOT_SHOW_RAW_REASON'});await insert(malformed);
  }
 }
 if(kind==='capacity-mixed-unban')for(const role of CANONICAL_MANAGED_ROLE_IDS233){const row=refusal(role,403,50013);row.state='unknown';row.reason='native232_provider_outcome_unknown';await insert(row);}
 if(kind==='cooldown')await db.prepare("INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES('role.managed.cooldown280',?1,?2,NULL)").bind(JSON.stringify({version:1,due:t+300}),t).run();
 if(kind==='malformed-pacing')await db.prepare("INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES('role.managed.cooldown280',?1,?2,NULL)").bind('{"version":1,"due":false}',t).run();
 await batch(seed.objects.filter(x=>x.type==='trigger').map(x=>db.prepare(x.sql)));
 const env={...config,DB:createPrivacyWriteAdmissionDatabase(db,'writer','recorded-live-pre-seal-20261017',config.PRIVACY_WRITE_ADMISSION_EPOCH)},rolesBefore=JSON.stringify((await db.prepare('SELECT * FROM role_settlements ORDER BY id').all()).results),pending=[];
 const i={type:2,id:'9'.repeat(18),token:'manual_refusal_ui_synthetic_'+kind,application_id:env.DISCORD_APP_ID,guild_id:CANONICAL_GUILD233,member:{user:{id:ACTOR},roles:[OFFICER]},data:{name:'olympus-admin',options:[{name:kind.includes('access')?'check':['ban','cooldown','malformed-pacing'].includes(kind)?'ban':'unban',type:1,options:[{name:'user',type:6,value:subject},{name:'reason',type:3,value:'Synthetic refusal visibility'}]}]}};
 const defer=(_label,work)=>pending.push(Promise.resolve().then(work));
 let response;
 if(kind.includes('access')){i.data={name:'olympus',options:[{name:'check',type:1,options:[{name:'member',type:6,value:subject}]}]};response=await handleAccessCheck242(env,i,t,defer);}
 else response=await handleInteraction(env,i,defer);
 if(kind==='access-revoked')await env.DB.prepare('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?1').bind(ACTOR).run();
 while(pending.length)await pending.shift();
 return Response.json({kind,initial:await response.json(),known,rolesBefore,rolesAfter:JSON.stringify((await db.prepare('SELECT * FROM role_settlements ORDER BY id').all()).results),member:await db.prepare('SELECT banned FROM members WHERE discord_id=?1').bind(subject).first(),control:await db.prepare('SELECT active,nonce,purpose FROM privacy_write_admission').first(),actualWorkerdD1:true});
 }catch(error){return Response.json({fixtureError:String(error.stack),cause:String(error.cause?.message??'')},{status:500});}}};}
