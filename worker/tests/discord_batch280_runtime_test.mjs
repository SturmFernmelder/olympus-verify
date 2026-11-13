import app from '../src/index.ts';
import {handleGuildCommand219} from '../src/guild-commands219.ts';
import {mayManageIntros} from '../src/intros.ts';
import * as utilities from '../src/guild-utilities219.ts';
import {CANONICAL_RANKS233} from '../src/canonical-ranks233.ts';
import {DIRECTIVE_CANONICAL_PROFILE} from '../src/native-rank-constants.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {capturePrivateComponent280} from '../src/private-component280.ts';
const G='236932545793490944',ACTOR='800000000000000402',STAFF='800000000000000401',CHANNEL='800000000000000012',HC='1567917738985398384';
const hex=b=>[...new Uint8Array(b)].map(n=>n.toString(16).padStart(2,'0')).join('');
export function discordBatch280(seed){return {async fetch(_request,bindings){try{
 const db=bindings.DB,at=Math.floor(Date.now()/1000),cases=[],check=(name,pass,observed)=>cases.push({name,pass:!!pass,observed});
 const batch=async a=>{while(a.length)await db.batch(a.splice(0,40));};
 await batch(seed.objects.filter(x=>x.type!=='trigger'&&!x.name.startsWith('sqlite_')).map(x=>db.prepare(x.sql)));
 const order=['privacy_write_admission','privacy_rejection_expiry_control','site_settings','pending','roster_snapshots','roster_members','roster_first_seen','roster_effect_runs','audit'];
 for(const table of [...seed.tables].sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name)))for(const row of table.rows){const keys=Object.keys(row);await db.prepare('INSERT INTO "'+table.name+'"('+keys.map(k=>'"'+k+'"').join(',')+')VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>row[k])).run();}
 for(const [id,name]of [[ACTOR,'Fixture Member'],[STAFF,'Fixture Staff']]){
  await db.prepare('INSERT INTO members(discord_id)VALUES(?1)').bind(id).run();
  await db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at)VALUES(?1,?2,?3,'member',?4)").bind(name.toLowerCase(),name,id,at).run();
  await db.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login,in_server)VALUES(?1,?2,?3,?3,1)').bind(id,name,at).run();
 }
 await batch(seed.objects.filter(x=>x.type==='trigger').map(x=>db.prepare(x.sql)));
 const canonical=JSON.stringify({version:2,enabled:true,profile:DIRECTIVE_CANONICAL_PROFILE,guildId:G,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))});
 const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']),publicKey=hex(await crypto.subtle.exportKey('raw',pair.publicKey));
 const env={...seed.config,DB:db,GUILD_ID:G,SITE_GUILD_ID:G,INTROS_GUILD_ID:G,INTROS_CHANNELS:'raid-signups='+CHANNEL,INTROS_ROLES:'800000000000000010',CANONICAL_RANKS233:canonical,DISCORD_PUBLIC_KEY:publicKey,ROLE_OFFICER:'800000000000000010',ROLE_RAID_LEADER:'800000000000000011',SITE_HOST:'discord280.example',COOKIE_SECRET:'synthetic-discord280-cookie',DISCORD_CLIENT_SECRET:'synthetic-client',SITE_ADMINS:'',COMMUNITY_FEATURES:'events,attendance,directory,crafting',EVENT_DISCORD_DELIVERY:'on'};
 const control=()=>db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').first(),originalControl=JSON.stringify(await control());
 const interaction=(type,data,extra={})=>({type,id:String(1560000000000000000n+BigInt(++serial)),application_id:env.DISCORD_APP_ID,token:'discord_batch280_synthetic',guild_id:G,channel_id:CHANNEL,member:{user:{id:ACTOR,username:'Synthetic'},roles:[]},data,...extra});
 let serial=0;const send=async(i,validSignature=true)=>{const body=JSON.stringify(i),timestamp=String(Math.floor(Date.now()/1000)),signature=validSignature?hex(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(timestamp+body))):'0'.repeat(128),pending=[];
  const response=await app.fetch(new Request('https://verify.example/interactions',{method:'POST',headers:{'Content-Type':'application/json','X-Signature-Timestamp':timestamp,'X-Signature-Ed25519':signature},body}),env,{waitUntil(p){pending.push(p);}});const text=await response.text();let initial;try{initial=JSON.parse(text);}catch{initial={nonJSON:text,status:response.status};}await Promise.allSettled(pending);return {status:response.status,initial};};
 const message=flags=>({id:'900000000000000001',channel_id:CHANNEL,...(flags===undefined?{}:{flags})});
 const statusId='o224:'+ACTOR+':'+(at+120)+':status';
 let r=await send(interaction(2,{name:'olympus'}));check('signed slash keeps new private defer',r.initial.type===5&&r.initial.data?.flags===64,r.initial);
 r=await send(interaction(3,{custom_id:statusId,component_type:2},{message:message(64)}),false);check('forged signature never reaches private update admission',r.status===401&&r.initial.type!==6,{status:r.status});
 r=await send(interaction(3,{custom_id:statusId,component_type:2},{message:message(64)}));check('known signed private Olympus component defers update',r.initial.type===6,r.initial);
 for(const flags of [0,undefined,64.5,'64']){r=await send(interaction(3,{custom_id:statusId,component_type:2},{message:message(flags)}));check('public absent or noninteger flags retain private new reply '+String(flags),r.initial.type===5&&r.initial.data?.flags===64,r.initial);}
 for(const custom of ['o224:'+STAFF+':'+(at+120)+':status','o224:'+ACTOR+':'+(at-1)+':status']){r=await send(interaction(3,{custom_id:custom,component_type:2},{message:message(64)}));check('wrong actor or expired control never gets update callback',r.initial.type!==6&&r.initial.data?.flags===64,r.initial);}
 r=await send(interaction(3,{custom_id:statusId,component_type:2},{guild_id:'800000000000000999',message:message(64)}));check('wrong guild never gets update callback',r.initial.type!==6,r.initial);
 r=await send(interaction(3,{custom_id:'o224:'+ACTOR+':'+(at+120)+':talent',component_type:2},{message:message(64)}));check('private modal opening remains immediate type9',r.initial.type===9,r.initial);
 r=await send(interaction(5,{custom_id:'o224:'+ACTOR+':'+(at+120)+':talents',components:[{type:1,components:[{type:4,custom_id:'build',value:'invalid'}]}]},{message:message(64)}));check('modal submission retains new private defer',r.initial.type===5&&r.initial.data?.flags===64,r.initial);
 r=await send(interaction(4,{name:'raid',options:[{type:3,name:'find',value:'none',focused:true}]}));check('autocomplete retains type8',r.initial.type===8,r.initial);
 r=await send(interaction(3,{custom_id:'access242:'+STAFF+':'+STAFF+':'+(at+120),component_type:2},{member:{user:{id:STAFF},roles:[]},message:message(64)}));check('known signed private authorized Fix defers update',r.initial.type===6,r.initial);
 r=await send(interaction(2,{name:'olympus',options:[{type:1,name:'check'}]},{member:{user:{id:STAFF},roles:[]}}));check('access check slash remains private type5',r.initial.type===5&&r.initial.data?.flags===64,r.initial);
 r=await send(interaction(3,{custom_id:'raid219:rsvp:'+'a'.repeat(22)+':1:tank',component_type:2},{message:message(64)}));check('non-hub private RSVP retains original callback behavior',r.initial.type===5&&r.initial.data?.flags===64,r.initial);
 r=await send(interaction(3,{custom_id:'raid:rsvp:'+'a'.repeat(22)+':1:yes',component_type:2},{message:message(0)}));check('public RSVP is never switched to update',r.initial.type!==6,r.initial);
 const role=(roles,extra={})=>({type:2,id:'900000000000000002',token:'synthetic',guild_id:G,member:{user:{id:ACTOR},roles,...extra}});
 check('canonical HC only is allowed by source intros gate',mayManageIntros(env,role([HC])));
 check('legacy configured staff remains allowed',mayManageIntros(env,role(['800000000000000010'])));
 check('owner approved Administrator exception remains',mayManageIntros(env,role([],{permissions:'8'})));
 check('ordinary member remains denied',!mayManageIntros(env,role([])));
 check('canonical HC has no cross guild admission',!mayManageIntros(env,{...role([HC]),guild_id:'800000000000000999'}));
 check('held or disabled canonical config does not grant HC',!mayManageIntros({...env,CANONICAL_RANKS233:'{}'},role([HC]))&&!mayManageIntros({...env,CANONICAL_RANKS233:canonical.replace('"enabled":true','"enabled":false')},role([HC])));
 const plain=Reflect.get(utilities,'plainDiscordLabel280')??utilities.safeDiscordText219;
 const punctuation='Raid _name_ *stars* @mention <text> \\ path';check('plain selection label preserves literal punctuation without Markdown escapes',plain(punctuation,90)===punctuation);
 check('plain label strips controls and stays bounded',plain('One\nTwo\tThree',9)==='One Two T');
 check('Markdown text still escapes reserved text',utilities.safeDiscordText219('_name_').includes('\\_'));
 check('plain label does not split a surrogate pair at its UTF16 bound',plain('A🙂B',2)==='A');
 for(const change of ['flags','control','actor']){
  const original=interaction(3,{custom_id:statusId,component_type:2},{message:message(64)}),mode=capturePrivateComponent280(env,original,at,'hub');
  const admitted=mode(ACTOR);if(change==='flags')original.message.flags=0;else if(change==='control')original.data.custom_id=statusId.replace(':status',':guides');else original.member.user.id=STAFF;
  check('captured private message cannot adopt changed '+change,admitted&&!mode(ACTOR));
 }
 const mutated=interaction(3,{custom_id:statusId,component_type:2},{message:message(64),token:'discord_batch280_changed_context'});let continuation;
 const admitted=await handleGuildCommand219(env,mutated,at,work=>{continuation=work;});check('direct original-context continuation admits only original private mode',(await admitted.json()).type===6);
 mutated.message.flags=0;if(continuation)await continuation();
 check('Native admission ends neutral in original epoch',JSON.stringify(await control())===originalControl);
 return Response.json({ok:cases.every(x=>x.pass),checks:cases.length,cases});
 }catch(e){return Response.json({fixtureError:String(e.stack)},{status:500});}}};}
