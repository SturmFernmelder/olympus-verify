'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {buildSync} = require('esbuild');
const {Miniflare, Log, LogLevel, convertV4MiniflareOptions} = require('miniflare');

const worker = path.resolve(__dirname, '..');
const guild = '236932545793490944', forum = '1554265340286861352';
const bot = '123456789012345678', admin = '123456789012345679';
const oldTag = {id:'100000000000000001',name:'Other',moderated:true,emoji_id:null,emoji_name:'🌙'};
const teamTag = {...oldTag,id:'100000000000000002',name:'Team recruiting',moderated:false,emoji_name:null};
const playerTag = {...teamTag,id:'100000000000000003',name:'Looking for team'};
const legacy = 'Read first: how to post a group';

async function test() {
  let tags=[oldTag], forumReads=0, calls=0, driftAt=0, loseReply=false, retryLegacy=false;
  const posts=[], threads=new Map();
  const bundle=buildSync({stdin:{contents:
    "import './src/index'; import {refreshIntros} from './src/intros'; export default {async fetch(r,e){const p=new URL(r.url).searchParams;return Response.json(await refreshIntros(e,e.GUILD_ID,p.get('actor'),'1554265340286861352',Number(p.get('budget'))));}}",
    resolveDir:worker},bundle:true,write:false,format:'esm',platform:'browser',external:['node:async_hooks']}).outputFiles[0].text;
  const mf=new Miniflare(convertV4MiniflareOptions({name:'raid-forum-test',script:bundle,modules:true,compatibilityDate:'2026-09-01',
    compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],cf:false,host:'127.0.0.1',port:0,log:new Log(LogLevel.NONE),
    bindings:{GUILD_ID:guild,INTROS_GUILD_ID:guild,INTROS_CHANNELS:'looking-for-group='+forum,SITE_ADMINS:admin,DISCORD_APP_ID:bot,DISCORD_BOT_TOKEN:'fixture'},
    outboundService:async req=>{
      const url=new URL(req.url);assert.equal(url.origin,'https://discord.com');const p=url.pathname.replace('/api/v10','');
      calls++;
      if(req.method==='GET'&&p==='/channels/'+forum) {
        if(++forumReads===driftAt)tags=tags.map(t=>t.id===oldTag.id?{...t,emoji_name:'🎲'}:t);
        return Response.json({id:forum,guild_id:guild,type:15,available_tags:tags});
      }
      if(req.method==='POST'&&p==='/channels/'+forum+'/threads') {
        const b=await req.json();assert.deepEqual(b.message.allowed_mentions,{parse:[]});
        posts.push(b.name);
        const id=String(200000000000000000n+BigInt(posts.length));
        const t={id,parent_id:forum,owner_id:bot,name:b.name,applied_tags:b.applied_tags,flags:0};
        threads.set(id,{t,m:{id,author:{id:bot},content:b.message.content}});
        if(loseReply&&b.name!==legacy){loseReply=false;return new Response('',{status:429});}
        return Response.json(t);
      }
      if(req.method==='GET'&&p==='/guilds/'+guild+'/threads/active')return Response.json({threads:[...threads.values()].map(v=>v.t)});
      if(req.method==='GET'&&p==='/channels/'+forum+'/threads/archived/public')return Response.json({threads:[]});
      const parts=p.split('/'),v=threads.get(parts[2]);
      if(v&&parts[1]==='channels'){
        if(req.method==='PATCH'&&parts.length===3&&v.t.name===legacy){
          const patch=await req.json();assert.deepEqual(Object.keys(patch),['flags']);v.t.flags=patch.flags;return Response.json(v.t);
        }
        if(req.method==='GET'&&parts.length===3){
          if(retryLegacy&&v.t.name===legacy){retryLegacy=false;return Response.json({message:'Try again',retry_after:0},{status:429});}
          return Response.json(v.t);
        }
        if(req.method==='GET'&&parts[3]==='messages'&&parts[4]===parts[2])return Response.json(v.m);
      }
      throw Error('Unexpected Discord request: '+req.method+' '+p);
    }}));
  try {
    const db=await mf.getD1Database('DB'),schema=fs.readFileSync(path.join(worker,'schema.sql'),'utf8');
    for(const table of ['site_settings','intro_posts','intro_locks','audit']){
      const ddl=schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+table+' \\([\\s\\S]+?\\n\\);'))[0];
      await db.prepare(ddl).run();
    }
    async function call(actor=admin,budget=40) {
      const prior=calls, response=await mf.dispatchFetch('https://local.test/?actor='+actor+'&budget='+budget);
      assert.equal(response.status,200,await response.clone().text());
      const r=await response.json();assert.equal(r.callsUsed,calls-prior,'count every actual Discord attempt');assert.ok(r.callsUsed<=budget);
      return {result:r,legacy:r.outcomes.find(o=>o.key==='looking-for-group'),template:r.outcomes.find(o=>o.key==='raid-recruitment-templates')};
    }
    const zero=await call(admin,0);assert.equal(zero.result.callsUsed,0);assert.equal(zero.template.action,'not-reached');assert.equal(posts.length,0);
    const missing=await call();assert.equal(missing.legacy.action,'posted');assert.equal(missing.template.action,'failed');assert.match(missing.template.note,/Add the missing/);
    assert.deepEqual(posts,[legacy]);assert.deepEqual(tags,[oldTag]);
    tags=[oldTag,teamTag,playerTag];
    assert.equal((await call('ordinary')).template,undefined);
    const small=await call(admin,8);assert.equal(small.legacy.action,'current');assert.equal(small.template.action,'not-reached');
    assert.equal(small.result.callsUsed,1);assert.deepEqual(posts,[legacy]);
    const partialBefore=await db.prepare("SELECT COUNT(*) n FROM intro_posts WHERE intro_key LIKE 'raid-%'").first('n');assert.equal(partialBefore,0);
    driftAt=forumReads+2;
    const drift=await call();assert.equal(drift.legacy.action,'current');assert.equal(drift.template.action,'failed');
    assert.match(drift.template.note,/forum tags changed/i);assert.equal(tags[0].emoji_name,'🎲');assert.deepEqual(posts,[legacy]);
    loseReply=true;
    const uncertain=await call();assert.equal(uncertain.legacy.action,'current');assert.equal(uncertain.template.action,'failed');
    assert.match(uncertain.template.note,/1 published/);assert.equal(posts.length,3);
    assert.equal(await db.prepare("SELECT COUNT(*) n FROM intro_posts WHERE hash='pending'").first('n'),1);
    const recovered=await call();assert.equal(recovered.template.action,'current');assert.match(recovered.template.note,/1 earlier posts reconciled/);
    assert.equal(posts.length,3);assert.equal(await db.prepare("SELECT COUNT(*) n FROM intro_posts WHERE message_id<>'' AND hash='raid-template-v1'").first('n'),2);
    retryLegacy=true;const again=await call();assert.equal(again.legacy.action,'current');assert.equal(again.template.action,'current');assert.match(again.template.note,/0 published, 0 earlier posts reconciled/);
    assert.equal(posts.length,3);
    console.log('Real intro refresh passed in Workerd/D1 with simulated Discord: attended tags, ordinary intro independence, partial recovery, concurrent edit preservation, exact bounded request counts including a retry, zero duplicate templates.');
  } finally {await mf.dispose();}
}
test().catch(err=>{console.error(err);process.exitCode=1;});
