'use strict';
// Server-only fictional QR material. No game input, external service or stored report.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const protocol=require('../guild-qr-pilot/protocol.js');
const PYTHON=process.env.OLYMPUS_LUA_PYTHON||(process.platform==='win32'?'python':'python3');
const RENDERER=path.join(__dirname,'render-qr.py');
const ROOT=path.resolve(__dirname,'../..');
const SOURCE_PINS=Object.freeze({
  'tools/guild-qr-pilot/protocol.js':'7bec896812384fb53a0fa2c7754cd2abbb0393e285a857538c3ecdcca3d6be02',
  'addon/OlympusStatsPilot/Libs/StatsPilotQr.lua':'d46985b002fef7923c03259d7de9df9c6e70af3c750f94c330aaa091ba6bb017'
});
const GUILDS=Object.freeze({'guild-oak':'Synthetic Oak','guild-pine':'Synthetic Pine'});
const KEYS=['guildKey','scenario','nowSeconds','nonce'];
const MAX_OUTPUT=262144,MAX_ERROR=8192,TIMEOUT_MS=8000;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=code=>Object.assign(new Error(code),{code,status:400});
function checkInput(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join('|')!==KEYS.slice().sort().join('|'))throw fail('synthetic_qr_options_required');
  if(typeof input.guildKey!=='string'||!Object.hasOwn(GUILDS,input.guildKey))throw fail('synthetic_qr_guild_required');
  if(!['fresh','masked','older','conflict'].includes(input.scenario))throw fail('synthetic_qr_scenario_required');
  if(!Number.isSafeInteger(input.nowSeconds)||input.nowSeconds<1800||input.nowSeconds>253402300799)throw fail('synthetic_qr_clock_required');
  if(typeof input.nonce!=='string'||!/^[a-f0-9]{32}$/.test(input.nonce))throw fail('synthetic_qr_nonce_required');
  for(const[file,expected]of Object.entries(SOURCE_PINS))if(hash(fs.readFileSync(path.join(ROOT,file)))!==expected)throw fail('synthetic_qr_source_changed');
}
function render(frames){
  const input=Buffer.from(JSON.stringify({frames}));
  if(input.length>4096)throw fail('synthetic_qr_render_input_limit');
  return new Promise((resolve,reject)=>{
    let child,done=false,total=0,errorBytes=0;const output=[];
    const stop=(error)=>{if(done)return;done=true;clearTimeout(timer);if(child&&!child.killed)child.kill();for(const b of output)b.fill(0);reject(error);};
    const timer=setTimeout(()=>stop(fail('synthetic_qr_render_timeout')),TIMEOUT_MS);
    try{child=spawn(PYTHON,['-E','-P','-B',RENDERER],{cwd:__dirname,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});}
    catch(_){stop(fail('synthetic_qr_runtime_unavailable'));return;}
    child.once('error',()=>stop(fail('synthetic_qr_runtime_unavailable')));
    child.stdout.on('data',chunk=>{if(done)return;total+=chunk.length;if(total>MAX_OUTPUT){stop(fail('synthetic_qr_render_output_limit'));return;}output.push(chunk);});
    child.stderr.on('data',chunk=>{if(done)return;errorBytes+=chunk.length;if(errorBytes>MAX_ERROR)stop(fail('synthetic_qr_render_error_limit'));});
    child.stdin.on('error',()=>{if(!done)stop(fail('synthetic_qr_render_failed'));});
    child.once('close',code=>{
      if(done)return;
      clearTimeout(timer);
      if(code!==0){stop(fail('synthetic_qr_render_failed'));return;}
      let all;
      try{
        all=Buffer.concat(output);const encoded=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
        if(!Array.isArray(encoded)||encoded.length!==frames.length)throw fail('synthetic_qr_image_count');
        const images=encoded.map(value=>{
          if(typeof value!=='string'||!value||value.length>49152||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw fail('synthetic_qr_image_format');
          const png=Buffer.from(value,'base64');
          if(png.length>32768||png.toString('base64')!==value)throw fail('synthetic_qr_image_limit');
          const size=protocol.inspectImageHeader(png,'image/png',{fileBytes:png.length});
          if(size.width!==342||size.height!==342)throw fail('synthetic_qr_image_dimensions');
          return png;
        });
        done=true;resolve(Object.freeze(images));
      }catch(_){stop(fail('synthetic_qr_render_invalid'));}
      finally{if(all)all.fill(0);for(const b of output)b.fill(0);}
    });
    child.stdin.end(input,()=>input.fill(0));
  });
}
async function createFixture(input){
  checkInput(input);
  const{guildKey,scenario,nowSeconds,nonce}=input;
  const source=scenario==='older'?nowSeconds-1800:Math.floor(nowSeconds/60)*60;
  const members=scenario==='masked'?'few':scenario==='conflict'?143:240;
  const online=scenario==='masked'||scenario==='older'?null:scenario==='conflict'?67:60;
  const candidate={format:'olympus-stat-observation-v1',scope:'own-guild',source:'volunteer-client',sourceVerified:false,membershipProof:false,addonVersion:'0.1.0',realmGroup:'Synthetic Realm',faction:'Alliance',observedAt:source,guilds:[{name:GUILDS[guildKey],receivedAt:source,reportedCharacters:members,online}]};
  const canonical=JSON.stringify(candidate),payloadBytes=Buffer.from(canonical);
  const payload=protocol.validatePayload(payloadBytes,{nowSeconds});
  const frames=await protocol.encodeFrames(payload,nonce,{nowSeconds});
  const payloadSHA256=hash(payloadBytes);payloadBytes.fill(0);
  const images=await render(frames);
  const observation=Object.freeze({format:'olympus-shared-census-observation-v1',source:'unverified-volunteer-client',sourceVerified:false,membershipProof:false,guildKey,addonVersion:'0.1.0',observedAt:source,sourceReceivedAt:source,capturedAt:nowSeconds,completeRosterClaimed:true,reportedCharacters:members,reportedOnline:online});
  return Object.freeze({payload,canonical,frames,images,payloadSHA256,observation});
}
module.exports=Object.freeze({createFixture,SOURCE_PINS});
