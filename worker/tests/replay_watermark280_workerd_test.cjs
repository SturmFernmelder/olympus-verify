'use strict';
// Execute both actual product initial-watermark queries in genuine local D1.
// AST extraction adapts SQL inputs; source text is never an acceptance assertion.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ts = require('typescript'), { buildSync } = require('esbuild');
const { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = require('miniflare');
const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const root = path.resolve(opt('--root') || path.join(__dirname, '..'));
if (!opt('--out')) throw Error('--out required');
const out = path.resolve(opt('--out')); fs.mkdirSync(out, { recursive: true });
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const files = ['src/full-release-pass.ts', 'src/restore.ts'];
const pins = files.map(file => ({ file, sha256: sha(fs.readFileSync(path.join(root, file))) }));
function literals(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true), values = [];
  function walk(n) { if (ts.isStringLiteral(n)) values.push(n.text); ts.forEachChild(n, walk); }
  walk(source); return values;
}
const departure = literals(files[0]).filter(s => s.startsWith('SELECT COALESCE((SELECT MIN(id) FROM audit WHERE ts'));
const promotion = literals(files[1]).filter(s => s.startsWith('SELECT MIN(id) AS id FROM audit WHERE ts'));
if (departure.length !== 1 || promotion.length !== 1) throw Error('Ambiguous actual watermark SQL adapter');
const source = `export default {async fetch(_r,env){
 const now=2000000000,rows=[
 [1,now-20*86400,'system','roster.left','old',null],
 [2,now+20*86400,'system','treasury.erased_replay280','a'.repeat(24),null],
 [3,now-2*86400,'system','roster.member','middle',null],
 [4,now-7200,'system','roster.member','recent',null],
 [5,now-1800,'system','roster.left','fresh',null]];
 await env.DB.exec('CREATE TABLE audit(id INTEGER PRIMARY KEY,ts INTEGER,actor TEXT,action TEXT,subject TEXT,details TEXT)');
 await env.DB.batch(rows.map(x=>env.DB.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').bind(...x)));
 const run=async(sql,t)=>await env.DB.prepare(sql).bind(t).first();
 const queries=${JSON.stringify([departure[0], promotion[0]])};
 const withMarker=await Promise.all(queries.map((s,i)=>run(s,now-(i?86400:3600))));
 await env.DB.prepare("DELETE FROM audit WHERE action='treasury.erased_replay280'").run();
 const withoutMarker=await Promise.all(queries.map((s,i)=>run(s,now-(i?86400:3600))));
 await env.DB.prepare('DELETE FROM audit').run();
 const empty=await Promise.all(queries.map((s,i)=>run(s,now-(i?86400:3600))));
 return Response.json({withMarker,withoutMarker,empty});}};`;
const bundle = buildSync({ stdin: { contents: source, resolveDir: root, sourcefile: 'actual-watermark.mjs' }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' }).outputFiles[0].text;
(async () => {
  let mf;
  try {
    mf = new Miniflare(convertV4MiniflareOptions({ script: bundle, modules: true, compatibilityDate: '2026-09-01', host: '127.0.0.1', port: 0, cf: false, log: new Log(LogLevel.NONE), d1Databases: { DB: 'watermark-test' }, resourceTmpPath: path.join(out, 'tmp'), resourcePersistencePath: path.join(out, 'persist'), isolatedResourcePersistencePath: path.join(out, 'isolated'), outboundService: () => { throw Error('No outbound requests allowed'); } }));
    await mf.ready;
    const data = await (await mf.dispatchFetch('http://fixture.invalid/')).json();
    const cases = [
      ['departure excludes future replay expiry', data.withMarker[0].id === 4],
      ['promotion excludes future replay expiry', data.withMarker[1].id === 4],
      ['departure same without marker', data.withMarker[0].id === data.withoutMarker[0].id],
      ['promotion same without marker', data.withMarker[1].id === data.withoutMarker[1].id],
      ['empty departure original sentinel', data.empty[0].id === 0],
      ['empty promotion original null sentinel', data.empty[1].id === null],
    ];
    const stable = pins.every(p => sha(fs.readFileSync(path.join(root, p.file))) === p.sha256);
    const result = { at: new Date().toISOString(), cases: cases.map(([name, pass]) => ({ name, pass })), data, stable, pins, sql: { departure: departure[0], promotion: promotion[0] }, bundleSHA256: sha(bundle) };
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    for (const c of result.cases) console.log((c.pass ? 'PASS ' : 'FAIL ') + c.name);
    console.log(cases.filter(x => x[1]).length + '/' + cases.length + ' passed');
    if (!stable || cases.some(x => !x[1])) process.exitCode = 1;
  } finally { if (mf) await mf.dispose(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
