// Fresh-role lanes (Revision 4, Q2): the shared Discord-request allowance. Runs the REAL src/lane-budget.ts and, for the
// equivalence checks, the REAL childBudget of src/role-rank-continuation.ts (transpiled in memory, file untouched).
// No D1, no provider access. From the worker folder:  node tests/lane_budget_test.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.join(__dirname,'..'),src=name=>fs.readFileSync(path.join(root,'src',name),'utf8');
const transpile=name=>ts.transpileModule(src(name),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
globalThis.fetch=async()=>{throw Error('provider access forbidden');};
const lane={exports:{}};new Function('module','exports','require',transpile('lane-budget.ts'))(lane,lane.exports,p=>{throw Error('lane-budget runtime import refused: '+p);});
const L=lane.exports;
// The original childBudget is private; expose it from an in-memory transpile only. Its runtime import is stubbed out.
let entryCaptureUses=0;
const cont={exports:{}};new Function('module','exports','require',transpile('role-rank-continuation.ts')+'\nmodule.exports.__childBudget=childBudget;')(cont,cont.exports,p=>{if(p==='./role-settlements')return {};if(p==='./beta-reset-policy')return {captureBetaRoleDispatch(){entryCaptureUses++;throw Error('entry capture must not run in a child budget');}};throw Error('unexpected import '+p);});
const childBudget=cont.exports.__childBudget;
let passed=0;
function check(name,value){assert.ok(value,name);passed++;console.log('PASS '+name);}
const parent=(limit=40,attempts=0)=>({limit,attempts,calls:0,retries:0,exhausted:false,audited:false,inventoryFailed:false});
const sha=text=>crypto.createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
const { source196HistoricalDigest } = require('./source196-historical-projection.cjs');
const state=(b,p)=>JSON.stringify({limit:b.limit,attempts:b.attempts,calls:b.calls,retries:b.retries,exhausted:b.exhausted,parent:p});
function apply(b,op){try{op(b);return 'ok';}catch(e){return 'throw:'+e.message;}}
(async()=>{
 // --- semantics identical to childBudget (role-rank-continuation.ts:21-30) at cap 20
 const programs=[
  [b=>{b.attempts=1;},b=>{b.attempts=2;},b=>{b.calls=2;},b=>{b.retries=1;},b=>{b.attempts=4;}],
  [b=>{b.attempts=21;}],
  [b=>{b.attempts=20;},b=>{b.attempts=21;}],
  [b=>{b.attempts=3;},b=>{b.attempts=2;}],
  [b=>{b.attempts=1.5;}],
  [b=>{b.attempts=NaN;}],
  [b=>{b.attempts=5;},b=>{b.calls=7;},b=>{b.calls=3;},b=>{b.retries=2;},b=>{b.retries=0;}],
 ];
 for(const [i,program] of programs.entries())for(const start of [[40,0],[40,25],[40,39],[40,40],[8,3],[50,31]]){
  const pa=parent(...start),pb=parent(...start),a=L.laneChildBudget(pa,20),b=childBudget(pb);
  const ra=program.map(op=>apply(a,op)),rb=program.map(op=>apply(b,op));
  assert.deepEqual(ra,rb,'program '+i+' outcomes at '+start);assert.equal(state(a,pa),state(b,pb),'program '+i+' state at '+start);
 }
 check('laneChildBudget(parent,20) matches the original childBudget outcome and state on every program and parent start',true);
 {const pa=parent(40,10),pb=parent(40,10),a=L.laneChildBudget(pa,20),b=childBudget(pb);pa.attempts=37;pb.attempts=37;
  check('child limit follows concurrent parent use exactly as childBudget does',a.limit===b.limit&&a.limit===3&&apply(a,x=>{x.attempts=4;})===apply(b,x=>{x.attempts=4;})&&pa.exhausted&&pb.exhausted);}
 // --- the cap parameter
 for(const bad of [0,21,-1,1.5,NaN,Infinity,'5',null,undefined])assert.throws(()=>L.laneChildBudget(parent(),bad),/lane_child_cap/);
 check('cap outside 1..20 or not an integer is refused before any debit',true);
 {const p=parent(),b=L.laneChildBudget(p,5);b.attempts=5;const over=apply(b,x=>{x.attempts=6;});
  check('cap 5 limits the child at 5 and overdraw throws shared_role_budget with parent.exhausted',b.limit===5&&over==='throw:shared_role_budget'&&p.attempts===5&&p.exhausted===true);}
 {const p=parent(40,0),b=L.laneChildBudget(p,1);check('cap 1 is a single request',b.limit===1&&apply(b,x=>{x.attempts=1;})==='ok'&&apply(b,x=>{x.attempts=2;})==='throw:shared_role_budget');}
 check('named per-lane caps',L.LANE_CHILD_CAP_MAX===20&&L.FRESH_GRANT_CHILD_CAP===20&&L.FRESH_REMOVAL_CHILD_CAP===19&&L.FRESH_CAUSE_CHILD_CAP===20&&L.STAFF_CHILD_CAP===20);
 // --- immediate parent debit under concurrent awaits (the central request() pattern: limit check, then attempts++)
 {const p=parent(40,0),kids=[L.laneChildBudget(p,20),L.laneChildBudget(p,20),L.laneChildBudget(p,19)],log=[];let invariant=true;
  const request=async b=>{if(b.attempts>=b.limit)throw Error('role_budget');b.attempts++;b.calls++;await new Promise(r=>setImmediate(r));};
  await Promise.all(kids.map(async(b,k)=>{for(let i=0;i<25;i++){try{await request(b);log.push(k);}catch(e){log.push('x'+k+':'+e.message);}
   if(p.attempts!==kids.reduce((s,c)=>s+c.attempts,0))invariant=false;}}));
  check('three concurrent children never overdraw one parent: every request debits it at once',invariant&&p.attempts===40&&p.calls===40&&kids.every(b=>b.attempts<=b.limit));
  check('requests beyond the shared allowance are refused, not queued',log.filter(x=>typeof x==='string').length===75-40&&log.filter(x=>typeof x==='string').every(x=>/role_budget|shared_role_budget/.test(x)));}
 // --- admission: laneRoom reads limit - attempts, never `exhausted`
 {const p=parent(40,23);p.exhausted=true;p.audited=true; // the legacy sweep stopped one account early (restore.ts:316-317)
  check('after the legacy sweep set exhausted, laneRoom still admits limit - attempts',L.laneRoom(p)===17&&L.laneRoom(p)>=7);
  const b=L.laneChildBudget(p,L.FRESH_CAUSE_CHILD_CAP);b.attempts=1;check('a child of an exhausted-flagged parent debits normally while requests remain',p.attempts===24&&b.limit===17);}
 check('laneRoom is 0 for a spent or unreadable parent',L.laneRoom(parent(40,40))===0&&L.laneRoom(parent(40,45))===0&&L.laneRoom({limit:'40',attempts:0})===0&&L.laneRoom(null)===0&&L.laneRoom({limit:40,attempts:1.5})===0);
 {const p={...parent(24,0)},a=L.laneChildBudget(p,19);for(let i=1;i<=19;i++)a.attempts=i;
  check('ban deferral: a child capped at 19 under limit ROLE_CALL_BUDGET-16=24 spends at most 19',a.limit===19&&apply(a,x=>{x.attempts=20;})==='throw:shared_role_budget'&&p.attempts===19);}
 // --- static isolation (no import cycle; protected files byte-identical to 5bea76e7)
 const imports=text=>Array.from(text.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm),m=>m[1]);
 check('lane-budget.ts imports only the CallBudget type from ./roles',/^import type \{ CallBudget \} from '\.\/roles';$/m.test(src('lane-budget.ts'))&&imports(src('lane-budget.ts')).join()==='./roles'&&!/require\(/.test(transpile('lane-budget.ts')));
 const settlements=src('role-settlements.ts');
 check('role-settlements.ts imports neither lane-budget nor full-release-pass',!imports(settlements).some(p=>p==='./lane-budget'||p==='./full-release-pass')&&!/lane-budget|full-release-pass/.test(settlements));
 // Reviewed .163 integration replaces the .160 append-only source baseline with the complete authorized modules.
 // Historical pins: role-rank-continuation 36e2a968c5f71554102ec2851a451c8e85c50dbaa0b16641c8443f534c2f9f5d;
 // roles bae0474c4c2ab9f3d8441b23cd6b89b3c4d41355d9850b860f1a7c745ff4fb15;
 // original796settlementlines bad16c4d3c773be54b76e85b8f3f8f871269e5cd9f3f1a0be6242be5e9caa37c.
 check('role-rank-continuation.ts is byte-identical to the reviewed .163 integrated source',sha(src('role-rank-continuation.ts'))==='bf4a2926770bf44af674e7a2ddc6f9b5c029960aaeca66a30947730d9d296561');
 check('roles.ts is byte-identical to the reviewed .163 integrated source',sha(src('roles.ts'))==='0fb851d804ddb97594a8b4109db3fad46a3f88df8c65475b63f2c79dbf89f6f8');
 check('role-settlements.ts reconstructs the entire reviewed .163 integrated source through exact current pinned contextual reversals',source196HistoricalDigest('role-settlements',settlements)==='04bf328c854d60033a604e1f8b0e8d26712d3ec40b521985732a723a6d1c5672');
 check('the pure child budget never calls the new entry capture dependency',entryCaptureUses===0);
 console.log(`\n${passed} checks passed`);
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
