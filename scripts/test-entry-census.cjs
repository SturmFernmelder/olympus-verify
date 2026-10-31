'use strict';
// Source inventory only. Reachability is not executed-case or branch coverage.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {expandScripts}=require('../worker/scripts/ci-shards.cjs');
function need(ok,message){if(!ok)throw Error(message);}
function normalized(value){need(typeof value==='string'&&value.length>0&&value===path.posix.normalize(value)&&!value.startsWith('../')&&!path.posix.isAbsolute(value)&&!/[\\:]/.test(value),'Invalid census path');return value;}
function classify(files,entries,reachable,exceptions){
 need(new Set(files).size===files.length,'Duplicate census file');files.forEach(normalized);
 const set=new Set(files),direct=new Set(entries),reached=new Set(reachable),allowed=new Map();
 for(const row of exceptions){
  normalized(row.path);need(set.has(row.path)&&!allowed.has(row.path),'Unknown or duplicate census exception');
  need(['helper','manual','native','stopped'].includes(row.kind)&&typeof row.owner==='string'&&row.owner.trim()&&typeof row.reason==='string'&&row.reason.trim()&&typeof row.evidence==='string'&&row.evidence.trim()&&/^[a-f0-9]{64}$/.test(row.sha256),'Incomplete census disposition');
  need(!direct.has(row.path)&&!reached.has(row.path),'Stale census exception');allowed.set(row.path,row);
 }
 return files.sort().map(file=>{
  const kind=direct.has(file)?'entry':reached.has(file)?'source-reachable':allowed.get(file)?.kind;
  need(kind,'Unclassified test file: '+file);return{path:file,kind,...(allowed.has(file)?{owner:allowed.get(file).owner,reason:allowed.get(file).reason,evidence:allowed.get(file).evidence}:{} )};
 });
}
function audit(root,pkg=JSON.parse(fs.readFileSync(path.join(root,'worker/package.json'),'utf8'))){
 const read=file=>fs.readFileSync(path.join(root,normalized(file)),'utf8');
 const manifest=JSON.parse(read('scripts/test-entry-census.json'));
 need(manifest.schema==='test-entry-census-v1'&&Array.isArray(manifest.exceptions)&&Array.isArray(manifest.externalEntries),'Census schema');
 const files=fs.readdirSync(path.join(root,'worker/tests')).filter(f=>f.endsWith('.cjs')).map(f=>'worker/tests/'+f);
 const commands=expandScripts(pkg.scripts),entries=new Set();
 for(const command of commands){const m=/^node ([^ ]+\.cjs)(?: |$)/.exec(command);if(m)entries.add(path.posix.normalize('worker/'+m[1]));}
 const workflow=read('.github/workflows/ci.yml');
 for(const row of manifest.externalEntries){
  normalized(row.path);normalized(row.consumer);
  need(files.includes(row.path)&&/^worker\/scripts\/[^/]+\.cjs$/.test(row.consumer),'External census scope');
  need(typeof row.workflowCommand==='string'&&workflow.includes(row.workflowCommand),'Missing external CI command');
  const consumer=read(row.consumer);need(typeof row.sourceNeedle==='string'&&row.sourceNeedle&&consumer.includes(row.sourceNeedle),'Missing external suite consumer');
  entries.add(row.path);
 }
 const queue=[...entries],reachable=new Set();
 while(queue.length){
  const current=normalized(queue.pop());if(reachable.has(current))continue;
  const file=path.join(root,current);if(!fs.existsSync(file)||!fs.statSync(file).isFile())continue;reachable.add(current);
  for(const match of read(current).matchAll(/\brequire\(\s*['"](\.[^'"]+\.cjs)['"]\s*\)/g)){
   queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(current),match[1])));
  }
 }
 for(const row of manifest.exceptions){
  normalized(row.path);need(files.includes(row.path),'Census exception outside public test inventory');
  const target=path.join(root,row.path),info=fs.lstatSync(target);need(info.isFile()&&!info.isSymbolicLink(),'Nonordinary census test file');
  need(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')===row.sha256,'Census disposition source drift: '+row.path);
 }
 const rows=classify(files,[...entries],[...reachable],manifest.exceptions);
 // SUITES is a literal Python data table. Refuse a new shape rather than importing/executing the runner.
 const runner=read('addon/tests/run_lua_suites.py'),parts=runner.split('SUITES = {');need(parts.length===2,'Lua suite table boundary');
 const table=parts[1].split('\n}')[0],luaEntries=new Set(),keys=new Set();
 for(const line of table.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'))){
  const m=/^"([a-z0-9_]+)": \((TESTS|ADDON), Path\("([^"]+)"\)\),$/.exec(line);need(m&&!keys.has(m[1]),'Unknown or duplicate Lua suite declaration');keys.add(m[1]);
  const target=normalized((m[2]==='TESTS'?'addon/tests/':'addon/')+m[3]);need(!luaEntries.has(target)&&fs.statSync(path.join(root,target)).isFile(),'Missing or duplicate Lua suite file');luaEntries.add(target);
 }
 const lua=fs.readdirSync(path.join(root,'addon/tests')).filter(f=>/^test_.*\.lua$/.test(f)).map(f=>'addon/tests/'+f);
 for(const file of lua)need(luaEntries.has(file),'Unclassified Lua suite: '+file);
 return{schema:'test-entry-census-result-v1',scope:'Source entry/helper/manual/native/stopped inventory; no execution or coverage percentage',commandOccurrences:commands.length,distinctCommands:new Set(commands).size,worker:rows,lua:[...luaEntries].sort(),qualification:'No source-only disposition qualifies a test run or grants a manual/native/stopped gate permission'};
}
module.exports={normalized,classify,audit};
if(require.main===module){try{console.log(JSON.stringify(audit(path.resolve(__dirname,'..')),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
