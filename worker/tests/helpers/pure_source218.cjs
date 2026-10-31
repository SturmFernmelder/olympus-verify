// Load the actual current pure TypeScript data graph; no copied parser expression or storage/provider fixture.
'use strict';
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function loadPureSource218(workerRoot,entry){
  const root=path.resolve(workerRoot,'src'),cache=new Map();
  function load(file){
    const absolute=path.resolve(root,file.endsWith('.ts')?file:file+'.ts');
    if(!absolute.startsWith(root+path.sep))throw Error('pure_source218_root_escape');
    if(cache.has(absolute))return cache.get(absolute).exports;
    const source=fs.readFileSync(absolute,'utf8'),module={exports:{}};cache.set(absolute,module);
    const result=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
    if((result.diagnostics||[]).some(row=>row.category===ts.DiagnosticCategory.Error))throw Error('pure_source218_typescript_parse');
    new Function('exports','require','module',result.outputText)(module.exports,key=>key.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(absolute),key))):require(key),module);
    return module.exports;
  }
  return load(entry);
}
module.exports={loadPureSource218};
