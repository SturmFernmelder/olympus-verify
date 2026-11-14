// Real original nickname ACK/CAS, signed index release and fresh guild actor checks; synthetic local D1/Discord only.
import app from '../src/index.ts';
import {handleNicknameInteraction233,NICKNAME_USE233,NICKNAME_RESET233,formatNickname233} from '../src/member-nickname233.ts';
import {nicknameKey233} from '../src/member-nickname-data233.ts';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {CANONICAL_RANKS233,CANONICAL_PROFILE233} from '../src/canonical-ranks233.ts';
import {NATIVE_RANK_NAMES232,NATIVE_RANK_PROFILE232,NATIVE_STEWART_ROLE232,MIRROR_BY_NAME232,NATIVE_SCOPE232} from '../src/native-rank-reconciliation232.ts';
import {GUILD_COMMANDS_224} from '../src/guild-command-definitions224.ts';
const G='236932545793490944',ROLE='1552077551839617104',STAFF='800000000000000401',MEMBER='800000000000000402';
const names={short:'One',long:'ABCDEFGHIJKLMNOPQRSTUV',boundary:'ABCDEFGHIJKLMNOP',combining:'A'.repeat(16)+'e\u0301X',emoji:'A'.repeat(14)+'\u{1f642}X',markup:'A`_*<>@[]\\B',unknown:'Unknown',ack:'Ack Long Character Name',higher:'Higher'};
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
export function privateActions280(seed){let serial=0;return {async fetch(request,bindings){try{
 const kind=new URL(request.url).pathname.slice(1),db=bindings.DB,subject=seed.tables.find(t=>t.name==='pending').rows[0].discord_id,now=Math.floor(Date.now()/1000),name=names[kind]??'One',key=name.toLowerCase();
 const batch=async rows=>{while(rows.length)await db.batch(rows.splice(0,40));};
 await batch(seed.objects.filter(x=>x.type!=='trigger'&&!x.name.startsWith('sqlite_')).map(x=>db.prepare(x.sql)));
 const order=['privacy_write_admission','privacy_rejection_expiry_control','site_settings','pending','roster_snapshots','roster_members','roster_first_seen','roster_effect_runs','audit'];
 for(const table of [...seed.tables].sort((a,b)=>order.indexOf(a.name)-order.indexOf(b.name)))for(const original of table.rows){const row={...original};if(table.name==='roster_snapshots'){row.member_count=1;row.source='addon-native-v1:'+JSON.stringify({version:1,...NATIVE_SCOPE232});}if(table.name==='roster_members'){row.name=name;row.name_key=key;row.rank='Member';row.rank_index=8;}const keys=Object.keys(row);await db.prepare('INSERT INTO "'+table.name+'"('+keys.map(k=>'"'+k+'"').join(',')+')VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>row[k])).run();}
 const guid='Player-4613-12345678';await db.prepare('INSERT INTO members(discord_id)VALUES(?1)').bind(subject).run();
 await db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,source,guid)VALUES(?1,?2,?3,'member',?4,?4,'whisper',?5)").bind(key,name,subject,now-100,guid).run();
 await db.prepare("INSERT INTO role_settlements(id,subject,purpose,guild_id,role_id,desired,state,reason,attempts,claim_nonce,request_digest,roster_id,native_guid,native_profile,created_at,expires_at,checked_at)VALUES(?1,?2,'launch_membership230',?3,?4,1,'settled','launch230_put_acknowledged_and_confirmed',1,?5,?6,1,?7,'prime-native-230',?8,?9,?10)").bind('b'.repeat(32),subject,G,ROLE,'c'.repeat(32),'d'.repeat(64),guid,now-90,now-40,now-89).run();
 for(const [id,label]of [[STAFF,'Fixture Staff'],[MEMBER,'Fixture Member']]){await db.prepare('INSERT INTO members(discord_id)VALUES(?1)').bind(id).run();await db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at)VALUES(?1,?2,?3,'member',?4)").bind(label.toLowerCase(),label,id,now).run();await db.prepare('INSERT INTO site_users(discord_id,username,first_login,last_login,in_server)VALUES(?1,?2,?3,?3,1)').bind(id,label,now).run();}
 const canonical=JSON.stringify({version:1,enabled:true,profile:CANONICAL_PROFILE233,guildId:G,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))});
 const native=JSON.stringify({version:1,enabled:true,profile:NATIVE_RANK_PROFILE232,guildId:G,nativeGuild:NATIVE_SCOPE232.guild,nativeRealm:NATIVE_SCOPE232.realm,membershipRole:ROLE,ranks:NATIVE_RANK_NAMES232.map((name,index)=>({index,name,roleId:name==='Stewart'?NATIVE_STEWART_ROLE232:MIRROR_BY_NAME232[name]})),privileged:true});
 const base={...seed.config,GUILD_ID:G,SITE_GUILD_ID:G,INTROS_GUILD_ID:G,INTROS_CHANNELS:'raid-signups=800000000000000012',CANONICAL_RANKS233:canonical,NATIVE_RANK_SYNC232:native,VERIFY_NATIVE_SCOPE:JSON.stringify({version:1,...NATIVE_SCOPE232}),DISCORD_BOT_TOKEN:seed.config.DISCORD_BOT_TOKEN+'-'+kind,ROSTER_MIN_MEMBERS:'1',SITE_HOST:'nickname233.example',ROLE_OFFICER:'800000000000000010',ROLE_RAID_LEADER:'800000000000000011',SITE_ADMINS:'',DISCORD_CLIENT_SECRET:'synthetic-client',COOKIE_SECRET:'synthetic-cookie-secret-0123456789'};
 const cases=[],check=(name,pass,observed)=>cases.push({name,pass:!!pass,...(observed?{observed}:{})});
 const writer=createPrivacyWriteAdmissionDatabase(db,'writer','recorded-live-pre-seal-20261017',seed.config.PRIVACY_WRITE_ADMISSION_EPOCH);
 if(kind==='release'){
  for(const [label,status]of [['No Held','unbound'],['Expired Held','unbound'],['Bound','member'],['Open Held','unbound'],['Explicit','unbound']])await db.prepare("INSERT INTO characters(name_key,name,discord_id,status,bound_at,guid)VALUES(?1,?2,?3,?4,?5,?6)").bind(label.toLowerCase(),label,subject,status,now-10,'Player-4613-'+label.replaceAll(' ','')).run();
  const template=seed.tables.find(t=>t.name==='pending').rows[0];
  for(const [label,expired]of [['Open Held',false],['Expired Held',true]]){const r={...template,id:template.id+100+(expired?1:0),name:label,name_key:label.toLowerCase(),expires_at:expired?now-1:now+100,consumed_at:null};const ks=Object.keys(r);await db.prepare('INSERT INTO pending('+ks.join(',')+')VALUES('+ks.map(()=>'?').join(',')+')').bind(...ks.map(k=>r[k])).run();}
 }
 await batch(seed.objects.filter(x=>x.type==='trigger').map(x=>db.prepare(x.sql)));
 const control=()=>db.prepare('SELECT epoch,mode,active,nonce,purpose FROM privacy_write_admission').first(),originalControl=JSON.stringify(await control());
 if(names[kind]){
  const env={...base,DB:writer},invoke=async action=>{let work;const response=handleNicknameInteraction233(env,{type:3,id:String(1550000000000000000n+BigInt(++serial)),token:'private_actions_synthetic_'+kind,guild_id:G,member:{user:{id:subject},roles:[]},data:{custom_id:action==='reset'?NICKNAME_RESET233:NICKNAME_USE233}},(_label,callback)=>{work=callback;});check('nickname original admission is private deferred',response.status===200&&(await response.json()).data.flags===64);if(work)await work();};
  await invoke('use');const firstStored=await db.prepare('SELECT value FROM site_settings WHERE key=?1').bind(nicknameKey233(subject)).first();if(['unknown','ack'].includes(kind))await invoke('use');if(kind==='short')await invoke('reset');
  const stored=await db.prepare('SELECT value FROM site_settings WHERE key=?1').bind(nicknameKey233(subject)).first();
  if(kind==='unknown')check('preexisting unknown original remains byte-identical on new click',stored?.value===firstStored?.value);
  check('Native admission returned to original neutral epoch',JSON.stringify(await control())===originalControl);
  const formatCases=[['One','One <OLYMPUS PRIME>'],['ABCDEFGHIJKLMNOP','ABCDEFGHIJKLMNOP <OLYMPUS PRIME>'],['ABCDEFGHIJKLMNOPQRST','ABCDEFGHIJKLMNOP <OLYMPUS PRIME>'],['A'.repeat(16)+'e\u0301X','A'.repeat(16)+' <OLYMPUS PRIME>'],['A'.repeat(14)+'\u{1f642}X','A'.repeat(14)+'\u{1f642} <OLYMPUS PRIME>']];
  for(const [input,wanted]of formatCases)check('actual grapheme formatter '+JSON.stringify(input),formatNickname233(input)===wanted&&wanted.length<=32);
  for(const invalid of ['Bad\nName','Bad\ud800Name']){let held=false;try{formatNickname233(invalid);}catch{held=true;}check('invalid nickname text stays refused',held);}
  return Response.json({kind,cases,checks:cases.length,ok:cases.every(x=>x.pass),stored:stored?.value??null,sourceName:name,expectedNickname:kind==='higher'?null:formatNickname233(name)});
 }
 const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']),pub=hex(await crypto.subtle.exportKey('raw',pair.publicKey));base.DISCORD_PUBLIC_KEY=pub;
 const send=async(actor,data,roles=[base.ROLE_OFFICER],extra={})=>{const payload={type:2,id:String(1560000000000000000n+BigInt(++serial)),application_id:base.DISCORD_APP_ID,guild_id:G,token:'private_actions_synthetic_'+kind,member:{user:{id:actor},roles},data,...extra},body=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000)),signature=hex(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(timestamp+body))),pending=[];
  const response=await app.fetch(new Request('https://verify.example/interactions',{method:'POST',headers:{'Content-Type':'application/json','X-Signature-Ed25519':signature,'X-Signature-Timestamp':timestamp},body}),{...base,DB:db},{waitUntil(p){pending.push(p);}});await Promise.allSettled(pending);return {response,body:await response.json()};};
 const image=async()=>{const out={};for(const t of ['characters','pending','invite_queue','audit','site_settings'])out[t]=(await db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()).results;return JSON.stringify(out);};
 if(kind==='release'){
  const invoke=(sub,name,roles)=>send(STAFF,{name:'olympus-admin',options:[{type:1,name:sub,options:[{type:3,name:'character',value:name}]}]},roles);
  for(const name of ['No Held','Expired Held','Missing','']){const before=await image(),r=await invoke('release',name);check('release '+JSON.stringify(name)+' without current request is a no-op',before===await image()&&/no open verification request/i.test(r.body.data?.content??''),{content:r.body.data?.content});}
  let before=await image(),r=await invoke('release','Bound');check('bound release still refuses unlink',before===await image()&&/cannot unlink/.test(r.body.data?.content??''));
  before=await image();r=await invoke('release','Open Held',[]);check('nonofficer cannot release original request',before===await image()&&r.body.type===4&&r.body.data?.flags===64&&typeof r.body.data?.content==='string'&&r.body.data.content.length>0);
  r=await invoke('release','Open Held');const original=await db.prepare("SELECT consumed_source FROM pending WHERE name_key='open held'").first();check('real held request still releases under original authority',original?.consumed_source==='release'&&/is closed/.test(r.body.data?.content??''),{content:r.body.data?.content});
  r=await invoke('unbind','Explicit');const explicit=await db.prepare("SELECT guid,left_at FROM characters WHERE name_key='explicit'").first();check('explicit unbind retains deliberate write',explicit?.guid===null&&Number.isInteger(explicit.left_at)&&/unbound from/.test(r.body.data?.content??''),{content:r.body.data?.content});
 }else if(kind==='access'){
  const data={name:'olympus',options:[{type:1,name:'check',options:[{type:6,name:'member',value:subject}]}]};
  let r=await send(MEMBER,data,[]);check('nonstaff other-account refusal describes current guild staff',r.body.data?.flags===64&&/current authorized guild staff/.test(r.body.data?.content??''),{content:r.body.data?.content});
  r=await send(MEMBER,{name:'olympus',options:[{type:1,name:'check'}]},[]);check('ordinary eligible member retains private own-account check',r.body.type===5&&r.body.data?.flags===64);
  const untouched=await image();r=await send(MEMBER,{custom_id:'access242:'+MEMBER+':'+subject+':'+(now+120)},[],{type:3});check('nonstaff cannot forge a current own-actor Fix for another account',r.body.type===4&&/current authorized guild staff/.test(r.body.data?.content??'')&&untouched===await image());
  r=await send(STAFF,data,[]);check('current raid-leader staff can use unchanged access-check admission',r.body.type===5&&r.body.data?.flags===64);
  const expires=now+120;for(const custom of ['access242:'+MEMBER+':'+subject+':'+expires,'access242:'+STAFF+':'+subject+':'+(now-1)]){r=await send(STAFF,{custom_id:custom},[],{type:3});check('cross-actor or expired Fix stays refused',r.body.type===4&&/expired/.test(r.body.data?.content??''));}
  r=await send(STAFF,{custom_id:'access242:'+STAFF+':'+subject+':'+expires},[],{type:3});check('valid own-actor Fix retains private deferral before fresh staff recheck',r.body.type===5&&r.body.data?.flags===64);
  const definition=GUILD_COMMANDS_224.find(c=>c.name==='olympus').options.find(x=>x.name==='check').options[0];check('command definition describes current staff permission',/authorized guild staff/i.test(definition.description));
 }
 check('Native admission remains neutral original epoch',JSON.stringify(await control())===originalControl);
 return Response.json({kind,cases,checks:cases.length,ok:cases.every(x=>x.pass)});
 }catch(error){return Response.json({fixtureError:String(error.stack),cause:String(error.cause?.message??'')},{status:500});}}};}
