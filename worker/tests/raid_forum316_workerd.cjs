'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {buildSync} = require('esbuild');
const {Miniflare, Log, LogLevel, convertV4MiniflareOptions} = require('miniflare');

const worker = path.resolve(__dirname, '..');
const guild = '236932545793490944', forum = '1554265340286861352';
const bot = '123456789012345678', admin = '123456789012345679';
const oldTag = {id:'100000000000000001',name:'Guild PUG',moderated:true,emoji_id:null,emoji_name:'🌙'};
async function test() {
  let tags = [oldTag], posts = 0, edits = 0, loseReply = true;
  const threads = new Map();
  const bundle = buildSync({stdin:{contents:
    "import './src/index'; import {publishRaidForum316} from './src/raid-forum316'; export default {async fetch(r,e){try{return new Response(await publishRaidForum316(e,e.GUILD_ID,new URL(r.url).searchParams.get('actor')))}catch(err){return new Response(err.message,{status:409})}}}",
    resolveDir:worker},bundle:true,write:false,format:'esm',platform:'browser',external:['node:async_hooks']}).outputFiles[0].text;
  const mf=new Miniflare(convertV4MiniflareOptions({name:'raid-forum-test',script:bundle,modules:true,compatibilityDate:'2026-09-01',
    compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],cf:false,host:'127.0.0.1',port:0,log:new Log(LogLevel.NONE),
    bindings:{GUILD_ID:guild,INTROS_GUILD_ID:guild,SITE_ADMINS:admin,DISCORD_APP_ID:bot,DISCORD_BOT_TOKEN:'fixture'},
    outboundService:async req=>{
      const url=new URL(req.url); assert.equal(url.origin,'https://discord.com'); const p=url.pathname.replace('/api/v10','');
      if(req.method==='GET'&&p==='/channels/'+forum)return Response.json({id:forum,guild_id:guild,type:15,available_tags:tags});
      if(req.method==='PATCH'&&p==='/channels/'+forum) {
        const data=await req.json();assert.deepEqual(Object.keys(data),['available_tags']);edits++;
        tags=data.available_tags.map((t,i)=>t.id?t:{...t,id:String(100000000000000010n+BigInt(i)),emoji_name:null,emoji_id:null});
        return Response.json({});
      }
      if(req.method==='POST'&&p==='/channels/'+forum+'/threads') {
        const b=await req.json();assert.deepEqual(b.message.allowed_mentions,{parse:[]});posts++;
        const id=String(200000000000000000n+BigInt(posts));
        const t={id,parent_id:forum,owner_id:bot,name:b.name,applied_tags:b.applied_tags};
        threads.set(id,{t,m:{id,author:{id:bot},content:b.message.content}});
        if(loseReply){loseReply=false;return new Response('',{status:429});}
        return Response.json(t);
      }
      if(req.method==='GET'&&p==='/guilds/'+guild+'/threads/active')return Response.json({threads:[...threads.values()].map(v=>v.t)});
      if(req.method==='GET'&&p==='/channels/'+forum+'/threads/archived/public')return Response.json({threads:[]});
      const parts=p.split('/'), v=threads.get(parts[2]);
      if(req.method==='GET'&&v&&parts[1]==='channels'){
        if(parts.length===3)return Response.json(v.t);
        if(parts[3]==='messages'&&parts[4]===parts[2])return Response.json(v.m);
      }
      throw Error('Unexpected fixture request: '+req.method+' '+p);
    }}));
  try {
    const db=await mf.getD1Database('DB');
    const ddl=fs.readFileSync(path.join(worker,'schema.sql'),'utf8').match(/CREATE TABLE IF NOT EXISTS intro_posts \([\s\S]+?\n\);/)[0];
    await db.prepare(ddl).run();
    const call=actor=>mf.dispatchFetch('https://local.test/?actor='+actor);
    let r=await call('someone');assert.equal(r.status,409);assert.match(await r.text(),/administrator/);assert.equal(edits,0);
    tags=Array.from({length:20},(_,i)=>({...oldTag,id:String(100000000000000100n+BigInt(i)),name:'Existing '+i}));
    r=await call(admin);assert.equal(r.status,409);assert.match(await r.text(),/tag limit/);assert.equal(posts,0);
    tags=[oldTag];
    r=await call(admin);assert.equal(r.status,409);assert.equal(posts,1);assert.equal(edits,1);
    assert.deepEqual(tags.map(t=>t.name),['Guild PUG','Team recruiting','Looking for team']);assert.deepEqual(tags[0],oldTag);
    r=await call(admin);const links=await r.text();assert.equal(r.status,200,links);assert.equal(posts,2);assert.equal(edits,1);
    const again=await call(admin);assert.equal(await again.text(),links);assert.equal(again.status,200);assert.equal(posts,2);assert.equal(edits,1);
    assert.equal(await db.prepare("SELECT COUNT(*) n FROM intro_posts WHERE message_id<>'' AND hash='raid-template-v1'").first('n'),2);
    console.log('Forum publication passed in Workerd/D1 with simulated Discord. Both original messages and tags read back; uncertain delivery and repeat refresh produced zero duplicates.');
  } finally {await mf.dispose();}
}
test().catch(err=>{console.error(err);process.exitCode=1;});
