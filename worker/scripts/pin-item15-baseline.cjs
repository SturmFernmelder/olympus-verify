#!/usr/bin/env node
// Item 15 absent-mode receipt baseline (17 Oct 2026). Pins the exact Codex 76e7e3c worker sources (tree a6d520e1) that
// differ from the current tree, as reverse edits applied to the current files, so the receipt command
// tests/beta_item15_absent_differential_receipt.cjs can rebuild them in memory without git history.
//
// Usage, from worker:
//   node scripts/pin-item15-baseline.cjs           regenerate tests/fixtures/beta_item15_baseline_76e7e3c.json
//   node scripts/pin-item15-baseline.cjs --check   exit 1 unless the committed fixture equals a fresh regeneration
//   --base <tree-ish>                              where the pinned files come from (default: tree a6d520e1, which is
//                                                  the tree of 76e7e3c; any commit or tree with that tree id is accepted)
// Re-pin after every reviewed change to a worker/src file: the receipt refuses to run on any other source state.
// A change to worker/schema.sql, or a checkout without git tree a6d520e1, RETIRES this receipt rather than re-pinning it:
// build() refuses with exit 2 in both cases (both module graphs share one schema, and the base files come only from that
// tree), so the fixture cannot be regenerated and the receipt keeps refusing on it. The regression suite
// (tests/beta_item15_central_fence_test.cjs, part of test:all) does not use this fixture and is unaffected.
//
// Deterministic: a line-level LCS diff (forward walk, deletions before insertions on ties), hunks applied bottom-up, and
// each anchor widened one context line before and one after at a time until it occurs exactly once in the working text.
// The output is verified by applying it with the receipt's own algorithm and comparing SHA-256 with the base file.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');

const BASE_COMMIT='76e7e3c4bee698e23f162ca0640d81a5b5298110',BASE_TREE='a6d520e14df5fc338aabaffe66859dad70daabae';
const worker=path.join(__dirname,'..'),repo=path.join(worker,'..');
const FIXTURE=path.join(worker,'tests','fixtures','beta_item15_baseline_76e7e3c.json');
const sha=text=>crypto.createHash('sha256').update(text,'utf8').digest('hex');
const lf=text=>text.replace(/\r\n/g,'\n');
const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',maxBuffer:64*1024*1024});

/** The receipt's exact reconstruction: each anchor must occur exactly once in the evolving text. */
function applyReverse(text,reverse,name){
 for(const [find,replace] of reverse){const at=text.indexOf(find);
  if(at<0||text.indexOf(find,at+1)!==-1)throw Error('pinned reconstruction anchor missing or not unique in '+name+'.ts');
  text=text.slice(0,at)+replace+text.slice(at+find.length);}
 return text;
}
/** Shared modules (identical to the base when pinned) are bound by one digest over their names and contents. */
function sharedDigest(names,read){return sha(names.slice().sort().map(n=>n+'\n'+sha(read(n))+'\n').join(''));}
const splitLines=text=>text.match(/[^\n]*\n|[^\n]+$/g)||[];
function hunks(a,b){
 let pre=0;while(pre<a.length&&pre<b.length&&a[pre]===b[pre])pre++;
 let suf=0;while(suf<a.length-pre&&suf<b.length-pre&&a[a.length-1-suf]===b[b.length-1-suf])suf++;
 const A=a.slice(pre,a.length-suf),B=b.slice(pre,b.length-suf),n=A.length,m=B.length;
 if((n+1)*(m+1)>60e6)throw Error('diff too large for the pinned-baseline generator');
 const w=m+1,dp=new Int32Array((n+1)*w);
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i*w+j]=A[i]===B[j]?dp[(i+1)*w+j+1]+1:Math.max(dp[(i+1)*w+j],dp[i*w+j+1]);
 const out=[];let i=0,j=0,open=null;
 const close=()=>{if(open){out.push(open);open=null;}};
 while(i<n||j<m){
  if(i<n&&j<m&&A[i]===B[j]){close();i++;j++;continue;}
  if(!open)open={a0:pre+i,a1:pre+i,b:[]};
  if(j>=m||i<n&&dp[(i+1)*w+j]>=dp[i*w+j+1]){i++;open.a1=pre+i;}else{open.b.push(B[j]);j++;}
 }
 close();return out;
}
function reverseEdits(current,base){
 const work=splitLines(current),target=splitLines(base),list=hunks(work,target).reverse(),edits=[];
 for(const h of list){
  let before=0,after=0;
  for(;;){
   const find=work.slice(h.a0-before,h.a1+after).join(''),text=work.join(''),at=find?text.indexOf(find):-1;
   if(find&&at>=0&&text.indexOf(find,at+1)===-1){
    const replace=work.slice(h.a0-before,h.a0).join('')+h.b.join('')+work.slice(h.a1,h.a1+after).join('');
    edits.push([find,replace]);work.splice(h.a0-before,h.a1+after-(h.a0-before),...splitLines(replace));break;}
   const canBefore=h.a0-before>0,canAfter=h.a1+after<work.length;
   if(!canBefore&&!canAfter)throw Error('no unique anchor');
   if(canBefore)before++;if(canAfter)after++;
  }
 }
 const rebuilt=applyReverse(current,edits,'generator');
 if(rebuilt!==base)throw Error('generator self-check failed: the reverse edits do not rebuild the base file');
 return edits;
}
function build(baseRef){
 const tree=git('rev-parse','--verify',baseRef+'^{tree}').trim();
 if(tree!==BASE_TREE)throw Error(baseRef+' has tree '+tree+', not the pinned 76e7e3c tree '+BASE_TREE);
 const baseNames=git('ls-tree','--name-only',BASE_TREE+':worker/src').split('\n').filter(n=>n.endsWith('.ts')).map(n=>n.slice(0,-3)).sort();
 const srcDir=path.join(worker,'src'),readCurrent=n=>lf(fs.readFileSync(path.join(srcDir,n+'.ts'),'utf8')),readBase=n=>lf(git('show',BASE_TREE+':worker/src/'+n+'.ts'));
 const files={},shared=[];
 for(const name of baseNames){
  if(!fs.existsSync(path.join(srcDir,name+'.ts')))throw Error('worker/src/'+name+'.ts exists in the base but not in the current tree');
  const base=readBase(name),current=readCurrent(name);
  if(base===current){shared.push(name);continue;}
  files[name]={sha256:sha(base),currentSha256:sha(current),reverse:reverseEdits(current,base)};
 }
 const schemaBase=lf(git('show',BASE_TREE+':worker/schema.sql')),schemaCurrent=lf(fs.readFileSync(path.join(worker,'schema.sql'),'utf8'));
 if(schemaBase!==schemaCurrent)throw Error('worker/schema.sql differs from the base: both module graphs share one schema, so the receipt would not compare like with like');
 const fixture={schema:'item15-pinned-baseline-v2',commit:BASE_COMMIT,tree:BASE_TREE,generator:'worker/scripts/pin-item15-baseline.cjs',
  note:'Reverse edits from the current source back to the exact 76e7e3c files; applied in order, each anchor must occur exactly once. currentSha256 and sharedDigest bind the source state this pin was made for; regenerate (do not hand-edit) after any reviewed source change.',
  schemaSha256:sha(schemaCurrent),sharedDigest:sharedDigest(shared,readCurrent),shared,files};
 return JSON.stringify(fixture,null,1)+'\n';
}
if(require.main===module){
 const args=process.argv.slice(2),check=args.includes('--check'),at=args.indexOf('--base'),base=at>=0?args[at+1]:BASE_TREE;
 if(at>=0&&!base){console.error('--base needs a tree-ish');process.exit(2);}
 let text;try{text=build(base);}catch(e){console.error('pin-item15-baseline: '+e.message);process.exit(2);}
 if(check){
  const committed=fs.existsSync(FIXTURE)?lf(fs.readFileSync(FIXTURE,'utf8')):null;
  if(committed===text){console.log('pin-item15-baseline --check: fixture is current ('+Object.keys(JSON.parse(text).files).join(', ')+')');process.exit(0);}
  console.error('pin-item15-baseline --check: tests/fixtures/beta_item15_baseline_76e7e3c.json is stale; run node scripts/pin-item15-baseline.cjs');process.exit(1);
 }
 fs.writeFileSync(FIXTURE,text);console.log('pinned '+Object.keys(JSON.parse(text).files).join(', ')+' -> '+path.relative(worker,FIXTURE).replace(/\\/g,'/'));
}
module.exports={applyReverse,sharedDigest,BASE_COMMIT,BASE_TREE};
