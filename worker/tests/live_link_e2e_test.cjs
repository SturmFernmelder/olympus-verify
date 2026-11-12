// Live Link membership, end to end, in two phases that bracket the game and the page (olympus-network tests/e2e/run.sh runs all four legs):
//   node tests/live_link_e2e_test.cjs --issue   --dir <folder>   the real appendLinkBlock, issueCode and manageKeys make the codes and the
//                                                                councillors' certificates; writes codes.lua (for the Lua leg), linkdb.json
//   node tests/live_link_e2e_test.cjs --consume --dir <folder>   reloads those rows and submits every link the Lua leg made (bundles.tsv)
//                                                                through the real routeLink /proof and the real central writer, on the
//                                                                SQLite D1 fixture of live_link_membership_test.cjs; Discord is the only mock
// The fixture is that test's own prelude (everything before its "the gate" section), so the two cannot drift apart. Every key is made here
// from a public label for these tests alone: never real.
'use strict';
const fs = require('node:fs'), path = require('node:path'), { Module } = require('node:module');
const src = fs.readFileSync(path.join(__dirname, 'live_link_membership_test.cjs'), 'utf8');
const MARK = ' // ================= the gate\n', END = '})().catch(e=>{console.error(e);process.exitCode=1;});`;';
const cut = src.indexOf(MARK), tail = src.lastIndexOf(END);
if (cut < 1 || tail < cut) throw Error('live_link_membership_test.cjs changed shape: the e2e prelude was not found');
const body = String.raw`
 const arg=k=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:undefined;};
 const MODE=process.argv.includes('--issue')?'issue':process.argv.includes('--consume')?'consume':null,DIR=arg('--dir')||process.env.LINK_E2E_DIR;
 if(!MODE||!DIR)throw Error('usage: node tests/live_link_e2e_test.cjs --issue|--consume --dir <folder>');
 fs.mkdirSync(DIR,{recursive:true});
 const MAIN='OLYMPUS PRIME',SISTER='Olympus Zeus',REALM='CAMWOWUS2Realm1PvE',T0=1799900000;
 const seedOf=label=>crypto230.createHash('sha256').update('olympus-link-e2e:'+label).digest();
 const PKCS8=Buffer.from('302e020100300506032b657004220420','hex');
 const pubOf=seed=>Buffer.from(crypto230.createPublicKey(crypto230.createPrivateKey({key:Buffer.concat([PKCS8,seed]),format:'der',type:'pkcs8'})).export({format:'jwk'}).x,'base64url');
 const COUNCIL=[
  {id:'council01',name:'Test Councillor',guild:MAIN,guid:'Player-4613-00B00001',owner:'100000000000000001'},
  {id:'council02',name:'Second Councillor',guild:MAIN,guid:'Player-4613-00B00002',owner:'100000000000000002'},
  {id:'council03',name:'Sister Councillor',guild:SISTER,guid:'Player-4613-00B00003',owner:'100000000000000003'}];
 // Each account: its Discord id and name, its character and GUID, who confirms it, and what its addon is expected to do.
 const PLAYERS=[
  {name:'valid-one',who:'Valid One',guild:MAIN,councillors:['council01'],listed:true,obs:'o'},
  {name:'valid-two',who:'Valid Two',guild:MAIN,councillors:['council02'],listed:true,obs:'o'},
  {name:'sister',who:'Sister Guild',guild:SISTER,councillors:['council03'],listed:true,obs:'o'},
  {name:'unobserved',who:'Claimed Guild',guild:MAIN,councillors:['council03'],listed:false,obs:'c',waitClaimed:true},
  {name:'flag-off',who:'Flag Off',guild:MAIN,councillors:['council01'],listed:true,obs:'o'},
  {name:'wrong-account',who:'Wrong Account',guild:MAIN,councillors:['council01'],listed:true,obs:'o'},
  {name:'banned',who:'Banned One',guild:MAIN,councillors:['council01'],listed:true,obs:'o'},
  {name:'denied',who:'Denied One',guild:MAIN,councillors:['council01'],listed:true,obs:'o'},
  {name:'expired',who:'Expired One',guild:MAIN,councillors:['council01'],listed:true,obs:'o'},
  {name:'legacy',who:'Legacy One',guild:MAIN,councillors:[],noFlow:true},
  {name:'rogue',who:'Rogue One',guild:MAIN,councillors:[],noFlow:true}];
 PLAYERS.forEach((p,i)=>{p.n=i+1;p.id='3000000000000000'+String(p.n).padStart(2,'0');p.username=p.name.replace('-','.')+'.e2e';p.requester=p.who+'-'+REALM;p.guid='Player-4613-00A000'+p.n.toString(16).toUpperCase().padStart(2,'0');p.signin='signin-e2e-'+p.name;});
 const P=Object.fromEntries(PLAYERS.map(p=>[p.name,p]));
 const useBackend=()=>{const s=seedOf('backend');env.LINK_BACKEND_SEED=s.toString('base64url');env.LINK_BACKEND_PUBLIC=pubOf(s).toString('hex');lenv=L.linkEnv(env);};
 // Discord, per account: the shared Guild Member role (and the older Link role) belong to the account they are put on.
 let have={};
 const baseRest=stubs['./discord'].rest;
 stubs['./discord'].rest=async(e,method,p,body,retries,reason,budget,retry,beforeDispatch)=>{
  const m=p.match(/^\/guilds\/(\d+)\/members\/(\d+)(?:\/roles\/(\d+))?$/);
  if(method==='GET'&&p==='/guilds/'+G+'/roles'){beforeDispatch?.();http.push({method,path:p});return [{id:G,position:0,permissions:'0',managed:false},{id:R,position:1,permissions:'0',managed:false},{id:'1700000000000000001',position:2,permissions:'0',managed:false},{id:BOTROLE,position:10,permissions:'268435456',managed:false}];}
  if(!m||m[1]!==G||m[2]===BOT)return baseRest(e,method,p,body,retries,reason,budget,retry,beforeDispatch);
  beforeDispatch?.();http.push({method,path:p});
  const roles=have[m[2]]=have[m[2]]||[];
  if(method==='GET'&&!m[3])return {user:{id:m[2]},roles:roles.slice()};
  if(method==='PUT'&&m[3]){if(!roles.includes(m[3]))roles.push(m[3]);return undefined;}
  if(method==='DELETE'&&m[3]){have[m[2]]=roles.filter(x=>x!==m[3]);return undefined;}
  throw Error('unplanned synthetic HTTP '+method+' '+p);
 };
 for(const p of PLAYERS)OAUTH[p.signin]={id:p.id,username:p.username};
 const luaValue=v=>Array.isArray(v)?'{'+v.map(luaValue).join(',')+'}':v&&typeof v==='object'?'{'+Object.entries(v).map(([k,x])=>'['+JSON.stringify(k)+']='+luaValue(x)).join(',')+'}':typeof v==='string'?JSON.stringify(v):String(v);

 if(MODE==='issue'){
  // ================= issue: keys, codes, and the /verify text
  T=T0;await newWorld({policy:'verified'});have={};useBackend();
  const councillors=[];
  for(const c of COUNCIL){
   const seed=seedOf(c.id),character=c.name+'-'+REALM;
   const r=await core.manageKeys(lenv,{key_id:c.id,public_key:pubOf(seed).toString('hex'),owner_discord_id:c.owner,character,kind:'c',bootstrap:true});
   check('issue: the bot registers '+c.id+' and returns its certificate',r.status==='ok'&&typeof r.cert==='string'&&r.cert.startsWith('OLK2.'),r.message);
   councillors.push({id:c.id,character,guild:c.guild,seed:seed.toString('base64url'),cert:r.cert});
  }
  const certExp=Number(councillors[0].cert.split('.')[4]);
  const rogueSeed=seedOf('rogue-backend'),rogueKeySeed=seedOf('rogue01'),rogueChar='Rogue Councillor-'+REALM;
  const rogueSigned='OLK2.rogue01.'+pubOf(rogueKeySeed).toString('base64url')+'.c.'+certExp+'.'+rogueChar;
  const rogueSig=crypto230.sign(null,Buffer.from(rogueSigned),crypto230.createPrivateKey({key:Buffer.concat([PKCS8,rogueSeed]),format:'der',type:'pkcs8'})).toString('base64url');
  const SCOPE_ON=JSON.stringify({version:1,guild:MAIN,faction:'Alliance',servers:['4613']});
  const cases=[];let legacy=null,rogue=null;
  const whisper='WHISPER REPLY',fallback="Can't use Olympus Link right now? Whisper instead:";
  for(const p of PLAYERS){
   const user={id:p.id,username:p.username};
   const off=await L.appendLinkBlock({...env,LINK_MEMBERSHIP_ENABLED:'false'},user,whisper);
   const on=await L.appendLinkBlock({...env,LINK_MEMBERSHIP_ENABLED:'true',LINK_MEMBERSHIP_SCOPE:SCOPE_ON},user,whisper);
   const code=await core.issueCode(lenv,user,'discord');
   check('issue '+p.name+': a code is issued',code.ok===true&&/^OLC2\./.test(code.token),code);
   check('issue '+p.name+': /verify with membership off puts the whisper first and the Link block last, as today',off===whisper+'\n\n'+code.reply);
   check('issue '+p.name+': /verify with membership on shows the Link line first and the whisper as the fallback',on===code.reply+'\n\n'+fallback+'\n'+whisper&&on.indexOf(code.token)>=0&&on.indexOf(code.token)<on.indexOf(fallback));
   p.token=code.token;p.R=code.token.split('.')[1];p.tokenSig=code.token.slice(code.token.lastIndexOf('.')+1);
   if(p.name==='legacy')legacy={requester:p.requester,R:p.R,tokenSig:p.tokenSig,councillor:'council01'};
   else if(p.name==='rogue')rogue={requester:p.requester,R:p.R,tokenSig:p.tokenSig,guid:p.guid,key:{id:'rogue01',seed:rogueKeySeed.toString('base64url'),character:rogueChar,cert:rogueSigned+'.'+rogueSig}};
   else cases.push({name:p.name,token:p.token,requester:p.requester,guid:p.guid,guild:p.guild,councillors:p.councillors,listed:p.listed,expectObs:p.obs,waitClaimed:p.waitClaimed===true,flow:true});
  }
  const guids=Object.fromEntries(councillors.map(c=>[c.character,COUNCIL.find(x=>x.id===c.id).guid]));
  const lua='-- written by tests/live_link_e2e_test.cjs --issue: throwaway keys and codes for one local run. Never real.\nreturn '+luaValue({t0:T0,backend_pub:env.LINK_BACKEND_PUBLIC,councillors,guids,cases,legacy,rogue})+'\n';
  fs.writeFileSync(path.join(DIR,'codes.lua'),lua);
  const rows=name=>linkDb.sqlite.prepare('SELECT * FROM '+name).all().map(r=>({...r}));
  fs.writeFileSync(path.join(DIR,'linkdb.json'),JSON.stringify({t0:T0,codes:rows('codes'),keys:rows('keys')},null,1));
  check('issue: every code and every key is in the Link database',rows('codes').length===PLAYERS.length&&rows('keys').length===COUNCIL.length);
  check('issue: the codes file names no real key: every seed is made from a public label',councillors.every(c=>c.seed===seedOf(c.id).toString('base64url')));
  db.close();
 } else {
  // ================= consume: every link through the real /proof
  const linkdb=JSON.parse(fs.readFileSync(path.join(DIR,'linkdb.json'),'utf8'));
  const bundles=Object.fromEntries(fs.readFileSync(path.join(DIR,'bundles.tsv'),'utf8').split('\n').filter(Boolean).map(l=>{const i=l.indexOf('\t');return [l.slice(0,i),l.slice(i+1)];}));
  const decoded=JSON.parse(fs.readFileSync(path.join(DIR,'decoded.json'),'utf8'));
  const refusals=fs.readFileSync(path.join(DIR,'refusals.tsv'),'utf8').split('\n').filter(Boolean);
  T=T0;await newWorld({policy:'verified'});have={};useBackend();
  for(const r of linkdb.codes)await linkDb.prepare('INSERT INTO codes (r, discord_id, username, mode, draw_t, created, exp, token, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(r.r,r.discord_id,r.username,r.mode,r.draw_t,r.created,r.exp,r.token,r.source).run();
  for(const k of linkdb.keys)await linkDb.prepare('INSERT INTO keys (key_id, public_key, owner_discord_id, owner_username, character, kind, bootstrap, created, cert_exp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(k.key_id,k.public_key,k.owner_discord_id,k.owner_username,k.character,k.kind,k.bootstrap,k.created,k.cert_exp).run();
  T=T0+120;
  check('chain: the page decoded every link the addon made, and said so in decoded.json',decoded.ok===true&&Object.keys(bundles).every(n=>decoded.cases[n]),decoded.ok);
  check('chain: the requester addon refused a missing GUID and a spent code, sent nothing, and waits when no councillor is online',refusals.some(l=>/^no-guid\t.*sent=0$/.test(l))&&refusals.some(l=>/^expired-code\t.*sent=0$/.test(l))&&refusals.some(l=>/^no-councillor\tstate=waiting\tasked=0$/.test(l)),refusals);
  const report=[];
  const submit=async(label,name,text,{expect,as,writes=0})=>{
   const p=P[as||name],s0=snap(),h0=http.length,m0=markers().length,st0=settlements().length,pu0=puts();
   const res=await post(text,p.signin);
   const same=snap()===s0&&http.length===h0;
   report.push([label,res.body.reason,res.body.ok===true?'ok':'refused',writes===0?'0 writes':'granted']);
   if(writes===0)check(label+': refused with '+expect+' and nothing written, no Discord request',res.body.ok!==true&&res.body.reason===expect&&same,res.body);
   else check(label+': '+expect+', exactly one role PUT, one settled row, one marker',res.body.reason===expect&&res.body.ok===true&&puts()===pu0+1&&settlements().length===st0+1&&markers().length===m0+1&&settlements().slice(-1)[0].state==='settled'&&settlements().slice(-1)[0].subject===p.id,res.body);
   return res;
  };
  const text=n=>{if(!bundles[n])throw Error('the Lua leg made no link named '+n);return bundles[n];};
  // refusals first, each on a clean slate for its account
  await submit('tampered GUID','tampered-guid',text('tampered-guid'),{expect:'not-enough',as:'valid-one'});
  await submit('tampered name','tampered-name',text('tampered-name'),{expect:'tag',as:'valid-one'});
  await submit('tampered guild','tampered-guild',text('tampered-guild'),{expect:'not-enough',as:'valid-one'});
  await submit('sister guild','sister',text('sister'),{expect:'guild-scope'});
  const un=await submit('GUID not observed by a councillor','unobserved',text('unobserved'),{expect:'guild-unverified'});
  void un;
  await submit('wrong signer (key the bot never certified)','wrong-signer',text('wrong-signer'),{expect:'not-enough',as:'rogue'});
  // OLB5 (name only): with membership on it is refused as name-only; nothing is written and Discord is not asked
  await submit('name-only OLB5','olb5',text('olb5'),{expect:'name-only',as:'legacy'});
  // wrong Discord account: the link is valid, but not for the account that signed in
  {
   const s0=snap(),h0=http.length;
   const res=await post(text('wrong-account'),P['valid-two'].signin);
   report.push(['wrong Discord account',res.body.reason,'refused','0 writes']);
   check('wrong Discord account: refused with other-user and nothing written',res.body.ok!==true&&res.body.reason==='other-user'&&snap()===s0&&http.length===h0,res.body);
  }
  // banned and denied: valid links, blocked accounts
  await w('INSERT INTO members(discord_id,banned) VALUES(?,1)',P.banned.id);
  await w('INSERT INTO site_users(discord_id,first_login,last_login,denied) VALUES(?,1,1,1)',P.denied.id);
  await submit('banned member','banned',text('banned'),{expect:'blocked'});
  await submit('denied site user','denied',text('denied'),{expect:'blocked'});
  // an expired code: ten days after the code was made
  {
   const exp=Number(linkdb.codes.find(c=>c.discord_id===P.expired.id).exp);T=exp+10*86400;
   await submit('expired code','expired',text('expired'),{expect:'expired'});
   T=T0+120;
  }
  // the flag off: a valid link is refused untouched, and after the flag is on the same link grants
  {
   const flag=env.LINK_MEMBERSHIP_ENABLED;delete env.LINK_MEMBERSHIP_ENABLED;
   await submit('flag off','flag-off',text('flag-off'),{expect:'membership-off'});
   env.LINK_MEMBERSHIP_ENABLED=flag;
   const codeRow=linkDb.sqlite.prepare('SELECT used FROM codes WHERE discord_id=?').get(P['flag-off'].id);
   check('flag off: the refused link did not spend its code',codeRow.used===null,codeRow);
  }
  // the grants
  await submit('valid link (one councillor)','valid-one',text('valid-one'),{expect:'member',writes:1});
  await submit('valid link (a second councillor and player)','valid-two',text('valid-two'),{expect:'member',writes:1});
  await submit('the flag-off link, with the flag on','flag-off',text('flag-off'),{expect:'member',writes:1});
  // replay: the same link again reads the first outcome back, writes nothing
  {
   const s0=snap(),h0=http.length;
   const res=await post(text('valid-one'),P['valid-one'].signin);
   report.push(['replay of the valid link',res.body.reason,res.body.ok===true?'ok':'refused','0 writes']);
   check('replay: the same link reads back member-already, with zero writes and no Discord request',res.body.reason==='member-already'&&snap()===s0&&http.length===h0,res.body);
  }
  // totals
  check('totals: three accounts are Guild Member, each given the role once',puts()===3&&settlements().length===3&&settlements().every(s=>s.state==='settled'&&s.attempts===1)&&markers().length===3,settlements().length);
  check('totals: no rank or office role was ever requested, and the shared Link role was never added',http.filter(x=>x.method==='PUT').every(x=>x.path.endsWith('/roles/'+R))&&ROLE_ADDS.length===0);
  check('totals: every settled grant is for an account whose link a councillor observed',settlements().map(s=>s.subject).sort().join()===[P['valid-one'].id,P['valid-two'].id,P['flag-off'].id].sort().join());
  check('totals: no code, signature or token reached the log',!LOGS.some(x=>PLAYERS.some(p=>p.token&&(x.includes(p.R)||x.includes(p.tokenSig)))));
  fs.writeFileSync(path.join(DIR,'consume-report.tsv'),report.map(r=>r.join('\t')).join('\n')+'\n');
  console.log('\n'+report.map(r=>'  '+r[0].padEnd(52)+r[1].padEnd(18)+r[3]).join('\n'));
  db.close();
 }
 console.log(ok+'/'+n+' live link e2e checks passed ('+MODE+')');process.exitCode=ok===n?0:1;
`;
const composed = src.slice(0, cut) + body + src.slice(tail);
const runner = new Module(__filename, module); runner.filename = __filename; runner.paths = module.paths;
runner._compile(composed, __filename);
