// Actual app.js/Worker fixture; substituted DTOs qualify presentation only.
// This proposed source was not executed by its author.
'use strict';
const fs196=require('node:fs'),path196=require('node:path'),{Module}=require('node:module');
const origin196=path196.join(__dirname,'frontend_check.cjs'),source196=fs196.readFileSync(origin196,'utf8');
const boundaries196=[...source196.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if(boundaries196.length!==1)throw Error('one actual original frontend fixture boundary required');
const body196=String.raw`
(async()=>{
  await siteUser(MEMBER);await character(MEMBER,'Bounded Reader','Player-1-01960001');
  const transform196=boot=>{boot.settings.appointed=Object.fromEntries(boot.meta.appointments.map(office=>[office.key,'Appointed member']));};
  const revision196='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  function pages196(page,mode='valid'){
    const keys=[...page.boot.meta.appointments.map(office=>office.key)].sort(),requests=[],responses=[];
    page.before(path=>{if(path.startsWith('/api/appointed-identities'))requests.push(path);return false;});
    page.answer(path=>{
      if(!path.startsWith('/api/appointed-identities'))return null;
      responses.push(path);
      const q=new URL(path,'https://guild.example').searchParams,after=q.get('after')||'',remaining=keys.filter(key=>key>after),selected=remaining.slice(0,32);
      if(mode==='changed'&&after)return new Response('{"error":"appointed_identities_changed"}',{status:409,headers:{'Content-Type':'application/json'}});
      const people=selected.map((role,index)=>({role,appointment:'<@300000000000000097>',displayName:'Bounded '+role,username:'bounded.'+role,characters:[],charactersTruncated:false}));
      const out={scope:'qualified_community_readers',identities:people,revision:mode==='revision'&&after?'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB':revision196,nextCursor:remaining.length>32?selected[selected.length-1]:null,complete:remaining.length<=32};
      if(mode==='stuck'&&after)out.nextCursor=after;
      if(mode==='unregistered')out.identities[0]={...out.identities[0],role:'not_in_the_catalogue'};
      return out;
    });
    return {keys,requests,responses};
  }
  const full=await openPage(MEMBER,{}, {bootTransform:transform196}),fullPages=pages196(full);
  full.hold(path=>path.startsWith('/api/appointed-identities?')&&new URL(path,'https://guild.example').searchParams.get('after')===fullPages.keys[127]?180:0);
  const pending=full.go('#/roles');
  await waitFor(()=>fullPages.requests.length===5,'five original bounded page requests');
  check('no partial page publishes a holder before the final page is qualified',!full.app.textContent.includes('Bounded co_gm')&&!full.app.textContent.includes('Bounded treasurer'));
  await pending;await waitFor(()=>full.app.textContent.includes('Bounded co_gm')&&full.app.textContent.includes('Bounded treasurer'),'complete catalogue identity collection');
  check('the actual app traverses exactly five source-key pages and hydrates supported visible roles',fullPages.requests.length===5&&fullPages.requests[0]==='/api/appointed-identities'&&fullPages.requests.slice(1).every(path=>new URL(path,'https://guild.example').searchParams.get('revision')===revision196)&&full.app.querySelector('[data-role-key201="officer"]').textContent.includes('Bounded officer'));
  for(const mode of ['changed','revision','stuck','unregistered']){
    const page=await openPage(MEMBER,{}, {bootTransform:transform196}),trace=pages196(page,mode);
    const baselineVisibility=new Set(page.document.listeners.visibilitychange||[]),baselinePagehide=new Set(page.window.listeners.pagehide||[]);
    const failedReaderDisposed=()=> (page.document.listeners.visibilitychange||[]).every(fn=>baselineVisibility.has(fn))&&(page.window.listeners.pagehide||[]).every(fn=>baselinePagehide.has(fn));
    const expectedPages=mode==='unregistered'?1:2;
    await page.go('#/roles');await settle();
    const terminal=await waitFor(()=>trace.requests.length===expectedPages&&trace.responses.length===expectedPages&&failedReaderDisposed(),'terminal failed '+mode+' collection and listener disposal');
    if(!terminal)throw Error('failed '+mode+' collection never reached its terminal response and disposed listeners');
    check('failed '+mode+' collection retains no partial private names and stops its finite traversal',terminal&&trace.requests.length===expectedPages&&trace.responses.length===expectedPages&&failedReaderDisposed()&&!page.app.textContent.includes('Bounded co_gm')&&!page.app.textContent.includes('Bounded treasurer')&&trace.requests.length<5);
    const before=trace.requests.length;page.document.hidden=true;page.document.dispatchEvent(new Event('visibilitychange'));page.document.hidden=false;page.document.dispatchEvent(new Event('visibilitychange'));await settle();
    check('visibility does not automatically retry failed '+mode+' admission',terminal&&failedReaderDisposed()&&trace.requests.length===before&&trace.responses.length===before&&!page.app.textContent.includes('Bounded co_gm')&&!page.app.textContent.includes('Bounded treasurer'));await page.go('#/');
  }
  const disposed=await openPage(MEMBER,{}, {bootTransform:transform196}),disposedPages=pages196(disposed);
  let held=false;
  disposed.hold(path=>{if(path.startsWith('/api/appointed-identities?')&&!held){held=true;return 180;}return 0;});
  const old=disposed.go('#/roles');await waitFor(()=>held,'held original continuation');await disposed.go('#/settings');await old;await new Promise(resolve=>setTimeout(resolve,220));
  check('late continuation cannot paint names into a replacement view or alter the original route',disposed.location.hash==='#/settings'&&!disposed.app.textContent.includes('Bounded co_gm')&&!disposed.app.textContent.includes('Bounded treasurer')&&disposedPages.requests.length<=2);
  console.log(ok+'/'+n+' appointed paging browser checks passed');process.exit(ok===n?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
`;
const execution196=new Module(origin196,module);execution196.filename=origin196;execution196.paths=Module._nodeModulePaths(path196.dirname(origin196));
execution196._compile(source196.slice(0,boundaries196[0].index)+'\n'+body196,origin196);
