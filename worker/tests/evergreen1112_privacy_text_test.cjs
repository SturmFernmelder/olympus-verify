'use strict';
// Evergreen 12 Nov 2026, round 5, area "privacy": the consolidated gold-receipt text in policies/privacy.html.
// Each check pairs a sentence of the policy with the code that makes it true, and runs that code where it can
// (the export SQL, the erasure marker SQL and the receipt shape validators, against node:sqlite and Python).
// Owner rulings it follows (STAGE2-RULES.md): "Blank it, keep the rows" and "Yes, blank it too" (local text),
// "Delete the text now" (server notes), "Officer looks them up" (mail receipts), quiz scores in the browser.
// Plain Node, no new dependency: esbuild and node:sqlite are already present. The addon checks run the addon's own Lua
// through lupa (LuaJIT 2.1, the runtime of addon/tests/run_lua_suites.py): set OLYMPUS_LUA_PYTHON to a Python that has
// lupa installed; without it those checks fail, never skip.
// Usage: node tests/evergreen1112_privacy_text_test.cjs [--root <repository root>]   (default: this checkout)
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const args = process.argv.slice(2), at = args.indexOf('--root');
const repo = path.resolve(at >= 0 ? args[at + 1] : path.join(__dirname, '..', '..')), worker = path.join(repo, 'worker');
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');
const results = [];
// A check may be synchronous or async; results are reported in declaration order at the end.
function check(name, fn) {
  results.push((async () => {
    let pass = false, detail = '';
    try { const r = await fn(); pass = r === true; if (!pass) detail = typeof r === 'string' ? r : JSON.stringify(r); }
    catch (error) { detail = String(error && error.stack || error).split('\n').slice(0, 3).join(' | '); }
    return { name, pass, detail };
  })());
}

const html = read('policies/privacy.html');
const text = html.replace(/<[^>]+>/g, '').replace(/&rsquo;|’/g, "'").replace(/\s+/g, ' ');
const sectionMatch = /<h2>Gold receipts and captured game text<\/h2>([\s\S]*?)<h2>/.exec(html);
const section = sectionMatch ? sectionMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ') : '';
const says = (re, where = section) => re.test(where) || 'policy does not say ' + re;
// One paragraph of the section, found by its opening words (tags removed, whitespace collapsed).
const paragraphs = sectionMatch ? sectionMatch[1].split(/<p>/).map(p => p.replace(/<[^>]+>/g, '').replace(/&rsquo;|’/g, "'").replace(/\s+/g, ' ').trim()).filter(Boolean) : [];
const paragraph = start => paragraphs.find(p => p.startsWith(start)) || '';

// Run Lua chunks in LuaJIT through lupa; the last chunk's return table comes back as JSON.
function lua(load, run) {
  const python = process.env.OLYMPUS_LUA_PYTHON || 'python';
  const code = [
    'import sys, json', 'import lupa.luajit21 as runtime',
    'lua = runtime.LuaRuntime(unpack_returned_tuples=True)', 'src = json.loads(sys.stdin.read())',
    'for chunk in src["load"]: lua.execute(chunk)',
    'def conv(v):', '    return {str(k): conv(x) for k, x in v.items()} if runtime.lua_type(v) == "table" else v',
    'print(json.dumps(conv(lua.execute(src["run"]))))',
  ].join('\n');
  const r = cp.spawnSync(python, ['-I', '-B', '-X', 'utf8', '-c', code], { input: JSON.stringify({ load, run }), encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 24 });
  if (r.status !== 0) throw Error('Lua runtime (lupa) unavailable or failed; set OLYMPUS_LUA_PYTHON: ' + (r.stderr || String(r.error)).slice(-300));
  return JSON.parse(r.stdout.trim());
}
// Run a Python snippet against this tree's watcher/ (argv[1]); it prints one JSON value.
function py(lines) {
  const r = cp.spawnSync('python', ['-I', '-B', '-X', 'utf8', '-c', ['import sys, json, copy, os, tempfile, pathlib', 'sys.path.insert(0, sys.argv[1])', ...lines].join('\n'), path.join(repo, 'watcher')], { encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 24 });
  if (r.status !== 0) throw Error((r.stderr || String(r.error)).slice(-400));
  return JSON.parse(r.stdout.trim());
}
const helperLua = () => read('addon/OlympusVerify/OlympusVerifyLocalPrivacy280.lua');

// ---------- the real server modules, bundled in memory ----------
let mod = null;
try {
  const { buildSync } = require(require.resolve('esbuild', { paths: [worker] }));
  const entry = [
    "export {financialShape280,TITHE_COLLECTOR280} from './src/tithe-receipt280.ts';",
    "export * from './src/tithe-erased-replay280.ts';",
    "export {TREASURY_RECEIPT_OWN_SQL242} from './src/treasury-data242.ts';",
    "export {communityScopedExportPlan} from './src/community-data-registry.ts';",
  ].join('\n');
  const out = buildSync({ stdin: { contents: entry, resolveDir: worker, loader: 'ts' }, bundle: true, write: false, format: 'cjs', platform: 'node', target: 'es2022', logLevel: 'silent' });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require);
  mod = m.exports;
} catch (error) { console.log('bundle failed: ' + String(error).slice(0, 300)); }
const { DatabaseSync } = require('node:sqlite');
// A D1-shaped env whose prepared statements are run by node:sqlite (numbered ?N parameters bind positionally).
const fakeEnv = () => ({ DB: { prepare(sql) { return { sql, args: [], bind(...a) { this.args = a; return this; } }; } } });
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE characters(name_key TEXT PRIMARY KEY,name TEXT NOT NULL,discord_id TEXT NOT NULL,status TEXT NOT NULL,bound_at INTEGER NOT NULL,verified_at INTEGER,guid TEXT);
           CREATE TABLE audit(id INTEGER PRIMARY KEY AUTOINCREMENT,ts INTEGER NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,subject TEXT,details TEXT);`);
  return db;
}
const now = () => Math.floor(Date.now() / 1000);
const ME = '300000000000000003', OTHER = '300000000000000004', MY_GUID = 'Player-1234-0ABCDEF1', SHARED_GUID = 'Player-1234-0ABCDEF2';
const v2 = (id, kind, guid, t) => ({ version: 2, sourceId: id, source: 'tithe-gold-v2', character: 'Synthetic Payer', characterKey: 'synthetic payer', guid, copper: 900, kind, recipient: 'Fern Melder', collectorGuid: 'Player-1-9999ABCD', guild: 'OLYMPUS PRIME', realm: 'Native Realm', reference: 'TITHE-ABCD-EFGH', clientVersion: 'synthetic', evidence: { kind: kind === 'trade' ? 'trade_complete_and_money_delta' : 'take_money_inbox_depletion_and_money_delta', confirmedLocal: true, automaticCredit: false, mac: 'a'.repeat(32) }, observedAt: t, classification: 'unclassified_receipt', retainUntil: t + 2592000, payloadHash: 'f'.repeat(64) });
function seed(db) {
  const t = now();
  const ins = db.prepare('INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,guid)VALUES(?,?,?,?,?,?,?)');
  ins.run('synthetic payer', 'Synthetic Payer', ME, 'member', t - 100, t - 100, MY_GUID);
  ins.run('synthetic alt', 'Synthetic Alt', ME, 'member', t - 100, t - 100, SHARED_GUID);
  ins.run('other payer', 'Other Payer', OTHER, 'member', t - 100, t - 100, SHARED_GUID);
  const rec = db.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?,'watcher','treasury.receipt242',?,?)");
  const rows = {
    trade: v2('a'.repeat(24), 'trade', MY_GUID, t),
    mail: v2('b'.repeat(24), 'mail', '', t),
    shared: v2('c'.repeat(24), 'trade', SHARED_GUID, t),
    legacyMail: { version: 242, sourceId: 'legacy-mail', source: 'mail', character: 'Synthetic Payer', characterKey: 'synthetic payer', guid: '', copper: 700, items: [{ name: 'Synthetic item', count: 1 }], note: 'SYNTHETIC_PRIVATE_MAIL_TEXT', observedAt: t, retainUntil: t + 2592000, classification: 'unclassified_receipt', payloadHash: 'e'.repeat(64) },
  };
  for (const r of Object.values(rows)) rec.run(t, 'intake242:' + r.sourceId, JSON.stringify(r));
  return { t, rows };
}
const run = (db, st, method = 'all') => db.prepare(st.sql)[method](...st.args);

// ---------- 1. the policy pipeline ----------
check('the canonical policy, its root mirror and the generated module agree (check:policies)', () => {
  const r = cp.spawnSync(process.execPath, [path.join(worker, 'scripts/build-policy-content.mjs'), '--check'], { cwd: worker, encoding: 'utf8', timeout: 60000 });
  return r.status === 0 || (r.stdout + r.stderr).slice(-300);
});
check('the policy has one consolidated section on gold receipts and captured game text, also in the served module', () => {
  const generated = read('worker/src/policy-content.ts');
  return !!section && (html.match(/<h2>Gold receipts and captured game text<\/h2>/g) || []).length === 1
    && generated.includes('Gold receipts and captured game text') || 'section missing';
});
check('the old scattered receipt paragraphs are gone, so the text says each fact once', () =>
  !/Native gold receipt observations|payload commitment|SavedVariables exchange|narrowed importer/.test(html) || 'old wording still present');

// ---------- 2. what is captured now ----------
check('policy: only gold to Fern Melder with one TITHE reference; addon and server pin that collector', () => {
  const addon = read('addon/OlympusVerify/OlympusVerifyTreasury.lua');
  return says(/records gold only when the in-game character Fern Melder receives it with one TITHE-XXXX-XXXX reference/) === true
    && /local COLLECTOR = "Fern Melder"/.test(addon) && mod && mod.TITHE_COLLECTOR280 === 'Fern Melder' || 'collector or sentence missing';
});
check('policy: a receipt holds no mail text, subject, whisper text, note or item list; the addon row and upload body have no such field', () => {
  const addon = read('addon/OlympusVerify/OlympusVerifyTreasury.lua');
  const rowLiteral = /local row = \{([\s\S]*?)\}\s*\n\s*row\.mac/.exec(addon), allowed = /local allowed = \{([\s\S]*?)\}/.exec(addon);
  if (!rowLiteral || !allowed) return 'addon receipt literal not found';
  const rowKeys = [...rowLiteral[1].matchAll(/([A-Za-z]+)\s*=/g)].map(m => m[1]), allowedKeys = [...allowed[1].matchAll(/([A-Za-z]+)=true/g)].map(m => m[1]);
  const bad = /^(note|body|subject|items|text|message|msg)$/i;
  return says(/It holds no mail text, subject line, whisper text, note or item list\./) === true
    && rowKeys.length > 10 && !rowKeys.some(k => bad.test(k)) && allowedKeys.length > 10 && !allowedKeys.some(k => bad.test(k))
    || { rowKeys, allowedKeys };
});
check('policy: mail does not show a character ID; the addon records mail receipts without a sender GUID and trades with one', () => {
  const addon = read('addon/OlympusVerify/OlympusVerifyTreasury.lua');
  const mail = /record\("mail",([^\n]*?)\)\s*end/.exec(addon), trade = /record\("trade",([^\n]*?)\)\s*end/.exec(addon);
  const arity = m => m ? m[1].split(',').length + 1 : -1;
  return says(/the sender's in-game character ID for a trade \(mail does not show one\)/) === true
    && arity(mail) === 7 && arity(trade) === 8 && /done\.senderGuid\s*$/.test(trade[1]) || { mail: mail && mail[1], trade: trade && trade[1] };
});
check('policy: the old format is refused; the server receipt validator refuses a note, an item list and the legacy shape (behaviour)', () => {
  if (!mod) return 'bundle unavailable';
  const t = now(), ok = { id: 'd'.repeat(24), type: 'donation', source: 'tithe-gold-v2', character: 'Synthetic Payer', guid: '', requestedAt: t, requestedBy: 'Fern Melder', guild: 'OLYMPUS PRIME', realm: 'Native Realm', clientVersion: '1.0.0', donation: { version: 2, kind: 'mail', copper: 100, recipient: 'Fern Melder', collectorGuid: 'Player-1-ABCD1234', reference: 'TITHE-ABCD-EFGH' }, evidence: { kind: 'take_money_inbox_depletion_and_money_delta', confirmedLocal: true, automaticCredit: false, mac: 'a'.repeat(32) } };
  const withNote = { ...ok, donation: { ...ok.donation, note: 'SYNTHETIC' } }, withItems = { ...ok, donation: { ...ok.donation, items: [] } };
  const legacy = { id: 'legacy-1', type: 'donation', source: 'mail', character: 'Synthetic Payer', guid: '', donation: { copper: 100, items: [], note: 'SYNTHETIC' }, evidence: { kind: 'mail-loot-inbox-empty-and-wallet-bag-delta', confirmedLocal: true, automaticCredit: false } };
  const tooOld = { ...ok, requestedAt: t - 2592000 };
  const got = [ok, withNote, withItems, legacy, tooOld].map(v => mod.financialShape280(v, t));
  return says(/That text is no longer uploaded: the Watcher and the server refuse receipts in the old format\./) === true
    && says(/The server accepts a receipt only within 30 days of when the gold was received\./) === true
    && JSON.stringify(got) === JSON.stringify([true, false, false, false, false]) || got;
});
check('the Watcher refuses the old format and a note on a new receipt, and accepts a clean signed receipt (behaviour, Python)', () => {
  const code = [
    'import sys, json', 'sys.path.insert(0, sys.argv[1])', 'import intake_schema280 as s',
    'at = 1794000000',
    "body = {'id': 'd'*24, 'type': 'donation', 'source': 'tithe-gold-v2', 'character': 'Synthetic Payer', 'guid': '', 'requestedAt': at, 'requestedBy': 'Fern Melder', 'guild': 'OLYMPUS PRIME', 'realm': 'Native Realm', 'clientVersion': '1.0.0', 'donation': {'version': 2, 'kind': 'mail', 'copper': 100, 'recipient': 'Fern Melder', 'collectorGuid': 'Player-1-ABCD1234', 'reference': 'TITHE-ABCD-EFGH'}, 'evidence': {'kind': 'take_money_inbox_depletion_and_money_delta', 'confirmedLocal': True, 'automaticCredit': False, 'mac': ''}}",
    "body['evidence']['mac'] = s.tithe_mac('synthetic-secret', body)",
    "noted = json.loads(json.dumps(body)); noted['donation']['note'] = 'SYNTHETIC'",
    "legacy = {'id': 'legacy-1', 'type': 'donation', 'source': 'mail', 'character': 'Synthetic Payer', 'guid': '', 'donation': {'copper': 100, 'items': [], 'note': 'SYNTHETIC'}, 'evidence': {'kind': 'x', 'confirmedLocal': True, 'automaticCredit': False}}",
    "print(json.dumps([s.financial_error(b, 'synthetic-secret', 'Fern Melder', at) for b in (body, noted, legacy)]))",
  ].join('\n');
  const r = cp.spawnSync('python', ['-I', '-B', '-X', 'utf8', '-c', code, path.join(repo, 'watcher')], { encoding: 'utf8', timeout: 60000 });
  const got = r.status === 0 ? JSON.parse(r.stdout.trim()) : (r.stderr || String(r.error)).slice(-300);
  return JSON.stringify(got) === JSON.stringify([null, 'receipt_shape_held', 'legacy_or_unqualified_receipt']) || got;
});
// Round 5 privacy, second pass (13 Nov 2026): with the local cleanup integrated, the addon's prune also asks the
// cleanup (PruneBlocked) and keeps a blocked receipt, and every receipt while the file holds a transfer record the
// cleanup cannot read. This runs the addon's own prune function, cut from OlympusVerifyTreasury.lua, with the helper.
check('policy: the addon prunes a confirmed receipt after 30 days, keeps an unconfirmed one, and keeps past 30 days a blocked receipt and every receipt beside an old-form transfer record (behaviour, Lua)', () => {
  const treasury = read('addon/OlympusVerify/OlympusVerifyTreasury.lua');
  const prune = /\nlocal function prune\(d\)\n[\s\S]*?\nend\n(?=local function db\(\))/.exec(treasury);
  if (!prune || !/retentionSeconds = 30 \* 86400/.test(treasury)) return 'prune function or 30-day constant not found';
  const got = lua([helperLua()], `local T={retentionSeconds=30*86400}
NOW=1800000000; time=function() return NOW end
${prune[0]}
local old,young=NOW-31*86400,NOW-86400
local function receipt(id,ts) return {id=id,ts=ts,kind="trade",sender="Synthetic Payer"} end
local function file(rows,acks,extra)
 local intake={version=1,nextId=0,entries={},dedup={},acknowledgements={}}
 for _,id in ipairs(acks) do intake.acknowledgements[id]={status="done"} end
 if extra then extra(intake) end
 return {intake242=intake,treasury={version=1,nextId=0,receipts=rows,observations={},overflows=0}}
end
local function run(f) OlympusVerifyDB=f; prune(f.treasury); local out={} for _,r in ipairs(f.treasury.receipts) do out[#out+1]=r.id:sub(1,1) end table.sort(out) return table.concat(out,",") end
local A,B,C,D,E=("a"):rep(24),("b"):rep(24),("c"):rep(24),("d"):rep(24),("e"):rep(24)
local out={}
out.clean=run(file({receipt(A,old),receipt(B,old),receipt(C,young)},{A,C}))
local blocked=file({receipt(D,old)},{D},function(i) i.entries[D]={id=D,type="donation",source="mail",character="Synthetic Payer",requestedAt=old,status="done",donation={copper=900,note="PRIV_D"}} end)
out.blocked=run(blocked); out.blanked=blocked.intake242.entries[D].donation.note
NOW=NOW+400*86400; out.blockedLater=run(blocked); NOW=1800000000
out.oldForm=run(file({receipt(E,old)},{E},function(i) i.heldTransfers627={["untyped-1"]={context={kind="mail",body="PRIV_C"},reason="held",heldAt=old}} end))
out.many=run(file({receipt(E,old)},{E},function(i) i.heldTransfers627={} for n=1,1001 do local id=string.format("%024x",n) i.heldTransfers627[id]={context={contextVersion=1,kind="trade",transferId=id},reason="held",heldAt=old} end end))
out.damaged=run(file({receipt(E,old)},{E},function(i) i.localCorrespondence280={version=1,purpose="financial-correspondence-local-only-v1",damaged=true} end))
out.control=run(file({receipt(E,old)},{E}))
return out`);
  const want = { clean: 'b,c', blocked: 'd', blanked: '', blockedLater: 'd', oldForm: 'e', many: 'e', damaged: 'e', control: '' };
  const p = paragraph('How long receipts are kept.');
  return /keeps a receipt in its saved file until the server confirms it, and removes a confirmed receipt once it is 30 days old\./.test(p)
    && /It keeps a receipt past 30 days if the receipt's ID belongs to a record that the cleanup of older text, described below, blanked or held\./.test(p)
    && /While the saved file still holds a held transfer record of an old or unknown form, the addon keeps every receipt in that file past 30 days\./.test(p)
    && /The same applies while the file holds more than 1,000 held transfer records, or while the cleanup's own record in it is damaged\./.test(p)
    && /The addon does not remove these kept receipts automatically\./.test(p)
    && JSON.stringify(got, Object.keys(want).sort()) === JSON.stringify(want, Object.keys(want).sort()) && Object.keys(got).length === Object.keys(want).length
    || { got, paragraph: p.slice(0, 200) };
});
check('the kept receipts are never removed later: no addon code deletes a blocked ID or a held transfer record', () => {
  const sources = fs.readdirSync(path.join(repo, 'addon/OlympusVerify')).filter(f => f.endsWith('.lua')).map(f => read('addon/OlympusVerify/' + f)).join('\n');
  // (The helper's constructor of a fresh, empty marker is not a removal: it only runs when no marker exists.)
  const removal = /blockedIds\[[^\]]*\]\s*=\s*nil|\.blockedIds\s*=|rawset\([^)]*"blockedIds"|heldTransfers627\[[^\]]*\]\s*=\s*nil|\.heldTransfers627\s*=\s*(?:nil|\{\})|rawset\([^)]*"heldTransfers627"/.exec(sources);
  return says(/The addon does not remove these kept receipts automatically\./) === true && !removal || (removal ? 'a removal path exists: ' + removal[0] : 'sentence missing');
});

// ---------- 3. the data download ----------
check('policy: the download lists only receipts with a uniquely linked character ID; mail receipts are left out even when they carry your own character ID, in both stored formats (behaviour, node:sqlite)', () => {
  if (!mod) return 'bundle unavailable';
  const db = database(), { rows, t } = seed(db), env = fakeEnv();
  // Round 5 privacy, second pass: mail receipts that DO carry the member's own, uniquely linked character ID, in both
  // stored formats, beside a legacy trade receipt as the positive control. Only the trade receipts may come out.
  const ownMail = {
    v2: v2('9'.repeat(24), 'mail', MY_GUID, t),
    legacy: { ...rows.legacyMail, sourceId: 'legacy-mail-own', guid: MY_GUID },
  };
  const legacyTrade = { ...rows.legacyMail, sourceId: 'legacy-trade-own', source: 'trade', guid: MY_GUID, note: '' };
  const rec = db.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?,'watcher','treasury.receipt242',?,?)");
  for (const r of [ownMail.v2, ownMail.legacy, legacyTrade]) rec.run(t, 'intake242:' + r.sourceId, JSON.stringify(r));
  const plan = mod.communityScopedExportPlan(env, ME, ['treasury242']);
  if (plan.statements.length !== 1) return 'unexpected statement count';
  const got = run(db, plan.statements[0]), ids = got.map(r => r.sourceId);
  const keys = [...new Set(got.flatMap(r => Object.keys(r)))].sort().join(',');
  const raw = JSON.stringify(got);
  const noMail = got.every(r => r.source !== 'mail' && r.kind !== 'mail') && !raw.includes(ownMail.v2.sourceId) && !raw.includes(ownMail.legacy.sourceId);
  return says(/lists a gold receipt only when it carries the in-game character ID of one of your linked characters and no other account is linked to that ID/) === true
    && says(/so mail receipts are left out/) === true && says(/It leaves out names, the reference, any text, item lists and the checksum\./) === true
    && JSON.stringify(ids) === JSON.stringify([rows.trade.sourceId, legacyTrade.sourceId]) && noMail
    && keys === 'classification,copper,guid,kind,observedAt,retainUntil,source,sourceId,ts,version'
    && !/Synthetic Payer|TITHE-|SYNTHETIC|payloadHash|"f{64}"/.test(raw) || { ids, keys, noMail };
});
check('policy: the separate privacy-connection copy contains no gold receipts; its selected families leave the receipt family out', () => {
  const src = read('worker/src/privacy-access-export.ts');
  const selected = /communityPackedExportPlan\(env,id,\[([^\]]*)\]\)/.exec(src);
  return says(/The copy from the separate privacy connection contains no gold receipts\./) === true
    && !!selected && !selected[1].includes('treasury242') && !/communityExportPlan\(env,id\)\.statements(?!\.length)/.test(src) || (selected && selected[1]);
});
check('policy: how to ask for mail receipts names a role and a channel, never a person', () => {
  const para = /Gold receipts in your data download\.([^]*?)(?:After an account erasure\.)/.exec(section);
  return !!para && /ask an Olympus officer in Asmongold's Discord server and name your character\./.test(para[1])
    && !/Rich Campbell|richwcampbell|Fernmelder/.test(section) || 'ask route missing or names a person';
});
// Round 5 review (13 Nov 2026), findings 1 and 2. A mail receipt carries only a name, and a name can later belong
// to another player, so the ruling "Officer looks them up" ("an officer checks the character by hand and shares
// them") needs the ownership check written into the procedure. The staff receipt ledger is a site-admin page, so
// the text may not say that any officer looks the receipts up. Not covered by the ruling, so not written: a time
// limit (only receipts from while the character was yours) and which officer answers.
let lookupMod = null;
try {
  const { buildSync } = require(require.resolve('esbuild', { paths: [worker] }));
  const entry = "export {ownerOfCharacter} from './src/lookup.ts';\nexport {communityFacts,capabilitiesOf} from './src/community-context.ts';";
  const out = buildSync({ stdin: { contents: entry, resolveDir: worker, loader: 'ts' }, bundle: true, write: false, format: 'cjs', platform: 'node', target: 'es2022', logLevel: 'silent' });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require);
  lookupMod = m.exports;
} catch (error) { console.log('lookup bundle failed: ' + String(error).slice(0, 300)); }
check('policy: the officer first checks that the named character is linked to the asker\'s Discord account; the officer lookup tells linked, someone else\'s and only-reserved apart (behaviour, node:sqlite)', async () => {
  if (!lookupMod) return 'bundle unavailable';
  const db = database();
  db.exec("CREATE TABLE site_reserved(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_id TEXT NOT NULL,name TEXT NOT NULL,name_key TEXT NOT NULL,status TEXT NOT NULL)");
  const t = now(), ins = db.prepare('INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,guid)VALUES(?,?,?,?,?,?,?)');
  ins.run('syntheticmine', 'Syntheticmine', ME, 'member', t, t, MY_GUID);
  ins.run('syntheticother', 'Syntheticother', OTHER, 'member', t, t, SHARED_GUID);
  db.prepare("INSERT INTO site_reserved(owner_id,name,name_key,status)VALUES(?,?,?,'reserved')").run(ME, 'Syntheticwish', 'syntheticwish');
  // A D1-shaped env whose .first() is answered by node:sqlite.
  const env = { DB: { prepare(sql) { return { bind(...a) { return { first: async () => db.prepare(sql.replace(/\?\d+/g, '?')).get(...a) ?? null }; } }; } } };
  const got = await Promise.all(['Syntheticmine', 'Syntheticother', 'Syntheticwish', 'Syntheticnobody'].map(n => lookupMod.ownerOfCharacter(env, n)));
  const para = /Gold receipts in your data download\.([^]*?)(?:After an account erasure\.)/.exec(section);
  const [mine, other, wish, nobody] = got;
  return !!para && /The officer first checks that the character is linked to your Discord account, and shares nothing if it is not\./.test(para[1])
    && /and the officer shares only those with you\./.test(para[1]) && !/The officer looks up that character's receipts/.test(para[1])
    && mine && mine.id === ME && /is linked to this account/.test(mine.how)
    && other && other.id === OTHER && /is linked to this account/.test(other.how)
    && wish && wish.id === ME && /is not linked to anyone yet/.test(wish.how) && nobody === null
    || { para: para && para[1].slice(-400), got };
});
check('policy: a site administrator looks the mail receipts up; the receipt ledger is a site-admin page and a Discord officer who is not a site admin cannot open it (behaviour)', async () => {
  if (!lookupMod) return 'bundle unavailable';
  const para = /Gold receipts in your data download\.([^]*?)(?:After an account erasure\.)/.exec(section);
  const api = read('worker/src/site-api.ts'), admin = read('worker/src/site-admin.ts'), ledger = read('worker/src/intake242.ts');
  const gate = /if \(path\.startsWith\("\/api\/admin\/"\)\) \{\s*if \(!admin\) return apiJson\(\{ error: "forbidden" \}, 403\);/.test(api) && /const admin = isSiteAdmin\(env, user\.discord_id\);/.test(api);
  const route = /parts\[0\] === 'treasury' && parts\[1\] === 'ledger' && m === 'GET'\) return treasuryLedger242\(/.test(admin);
  const staffOnly = /export async function treasuryLedger242[\s\S]{0,400}if\(!ctx\.capabilities\.communityStaff\)return apiJson\(\{error:'forbidden'\},403\);/.test(ledger);
  // The staff capability comes from SITE_ADMINS alone: a roster-confirmed member who is not listed does not get it.
  const env = () => ({ SITE_ADMINS: '300000000000000009', DB: { prepare() { return { bind() { return { first: async () => ({ n: 1, banned: 0 }) }; } }; } } });
  const user = id => ({ discord_id: id, denied: 0, in_server: 1 });
  const officer = lookupMod.capabilitiesOf(await lookupMod.communityFacts(env(), user(ME))).communityStaff;
  const siteAdmin = lookupMod.capabilitiesOf(await lookupMod.communityFacts(env(), user('300000000000000009'))).communityStaff;
  return !!para && /A site administrator then looks up that character's mail receipts by hand/.test(para[1])
    && gate && route && staffOnly && officer === false && siteAdmin === true || { gate, route, staffOnly, officer, siteAdmin };
});

// ---------- 4. erasure ----------
check('policy: after erasure only the receipt ID and its original 30-day expiry stay, unlinked; the marker SQL does exactly that (behaviour, node:sqlite)', () => {
  if (!mod) return 'bundle unavailable';
  const db = database(), { rows } = seed(db), env = fakeEnv();
  const [insert, complete] = mod.erasedReceiptMarkerStatements280(env, ME, mod.TREASURY_RECEIPT_OWN_SQL242);
  run(db, insert, 'run');
  const markers = db.prepare("SELECT ts,actor,subject,details FROM audit WHERE action=? ORDER BY subject").all(mod.TITHE_ERASED_REPLAY_ACTION280);
  const ok = run(db, complete)[0];
  // Every current receipt tied to the account (by character ID or name) gets one marker; the legacy row gets none.
  const expected = [rows.trade, rows.mail, rows.shared].map(r => ({ ts: r.retainUntil, actor: 'system', subject: r.sourceId, details: null }));
  const exact = JSON.stringify(markers.map(m => ({ ...m }))) === JSON.stringify(expected);
  // Before its original expiry the marker blocks a re-upload of that receipt; past it, it blocks nothing.
  const blockSql = `SELECT COUNT(*) AS n FROM audit m WHERE ${mod.erasedReceiptBlocksSql280('m', '?1')}`;
  const blocksLive = db.prepare(blockSql).get(rows.trade.sourceId).n;
  db.prepare('UPDATE audit SET ts=? WHERE action=?').run(now() - 1, mod.TITHE_ERASED_REPLAY_ACTION280);
  const blocks = db.prepare(blockSql).get(rows.trade.sourceId).n;
  return says(/the server may keep only the receipt's ID and its original expiry, so the same receipt cannot be uploaded again/) === true
    && says(/That marker holds no account, name, character ID, amount, text, item or checksum, and the server keeps no link from it to your account\./) === true
    && says(/stops counting at the receipt's original 30-day deadline/) === true
    && exact && ok && ok.retained === 1 && blocksLive === 1 && blocks === 0 && /thirty-day/.test(mod.TITHE_ERASED_REPLAY_COVERAGE280) || { markers, ok, blocksLive, blocks };
});

// ---------- 5. older text on the server, the checksum and backups ----------
check('policy: the server cleanup blanks only the note of mail and whisper rows and keeps the rest, checksum included (behaviour, node:sqlite)', () => {
  const src = read('worker/src/treasury-note-maintenance280.ts');
  // The module's one UPDATE, run as written (its ${FAMILY} fence substituted from the same file).
  const family = /const FAMILY="([^"]+)";/.exec(src), update = /env\.DB\.prepare\(`(UPDATE audit [\s\S]*?)`\)\.bind\(scope\.ceiling\)/.exec(src);
  if (!family || !update || (src.match(/UPDATE audit/g) || []).length !== 1) return 'cleanup statement not found';
  const db = database(), { rows, t } = seed(db);
  const whisper = { version: 242, sourceId: 'legacy-whisper', source: 'whisper-declaration', character: 'Synthetic Payer', characterKey: 'synthetic payer', guid: MY_GUID, copper: 0, items: [], note: 'SYNTHETIC_PRIVATE_WHISPER_TEXT', observedAt: t, retainUntil: t + 2592000, classification: 'unclassified_receipt', payloadHash: 'd'.repeat(64) };
  db.prepare("INSERT INTO audit(ts,actor,action,subject,details)VALUES(?,'watcher','treasury.receipt242',?,?)").run(t, 'intake242:legacy-whisper', JSON.stringify(whisper));
  const before = db.prepare('SELECT id,ts,actor,action,subject,details FROM audit ORDER BY id').all();
  db.prepare(update[1].replace('${FAMILY}', family[1])).run(1e9);
  const after = db.prepare('SELECT id,ts,actor,action,subject,details FROM audit ORDER BY id').all();
  const same = after.every((row, i) => {
    const a = JSON.parse(before[i].details), b = JSON.parse(row.details), blanked = ['mail', 'whisper-declaration'].includes(a.source) && a.note;
    const { note: na, ...ra } = a, { note: nb, ...rb } = b;
    return row.ts === before[i].ts && row.subject === before[i].subject && JSON.stringify(ra) === JSON.stringify(rb) && (blanked ? nb === '' : nb === na);
  });
  const left = after.some(row => /SYNTHETIC_PRIVATE/.test(row.details)), items = JSON.parse(after.find(r => r.subject === 'intake242:legacy-mail').details).items;
  return says(/a one-time cleanup blanks that text in the stored receipts and keeps the rows\. The sender's name and any character ID, the amount, the time, the source, the item names and counts, and the record IDs stay\./) === true
    && after.length === before.length && same && !left && items.length === 1 && rows.trade.payloadHash === JSON.parse(after[0].details).payloadHash || { same, left, items };
});
check('policy: the kept checksum is described without overclaiming, and the server stores it with the row', () => {
  const src = read('worker/src/tithe-receipt280.ts');
  return says(/A checksum cannot be turned back into the text\. Once the text is blanked, the checksum no longer matches the record, so it proves nothing about what the text said\. Someone who can read the rest of a record could still test a guessed short text against it\./) === true
    && /details=JSON\.stringify\(\{\.\.\.value,payloadHash\}\)/.test(src) || 'checksum statement or storage missing';
});
check('policy: backups made before the cleanup, the game chat log and other addons are outside it; nothing promises "all text" is gone', () =>
  says(/The cleanup does not reach copies made before it ran, such as the database backups and Cloudflare recovery history described under Recovery copies, or a backup of an officer's computer\. It does not touch the game's own chat log or other addons' saved files\./) === true
  && !/\ball (?:the )?text\b|every copy|permanently (?:erased|deleted)/i.test(section) || 'overclaim or backup sentence missing');

// ---------- 6. quiz scores ----------
check('policy: quiz scores stay in one browser entry; the University script stores them there and sends nothing', () => {
  const js = read('worker/public/static/university/university.js');
  const fetches = js.match(/\bfetch\s*\(/g) || [], call = /fetch\(BASE \+ rel, \{([^}]*)\}\)/.exec(js);
  return says(/Your answers and best scores on the guide quizzes and exams are kept only in your own browser, in one storage entry \(olympus\.university\.v1\), and are never sent to Olympus\./, text) === true
    && /const KEY = "olympus\.university\.v1";/.test(js) && fetches.length === 1 && !!call && !/method|body/.test(call[1])
    && !/sendBeacon|XMLHttpRequest|WebSocket|EventSource/.test(js) || { fetches: fetches.length, call: call && call[1] };
});

// ---------- 7. local blanking: claimed only when the component is in the tree ----------
// The second commit of this area says the addon and the Watcher blank the old text locally. That sentence may
// only ship together with Codex's component (addon helper loaded by the TOC, Watcher module used by the Watcher).
const claimsLocal = () => /blanks the old text in memory/.test(section) || /The Watcher blanks the old text in its own local copy/.test(section);
check('policy claims local blanking only when the addon helper and the Watcher module that do it are present', () => {
  const claims = claimsLocal();
  const helper = 'addon/OlympusVerify/OlympusVerifyLocalPrivacy280.lua', module = 'watcher/local_correspondence280.py';
  const present = fs.existsSync(path.join(repo, helper)) && fs.existsSync(path.join(repo, module))
    && /^OlympusVerifyLocalPrivacy280\.lua\s*$/m.test(read('addon/OlympusVerify/OlympusVerify.toc'))
    && /local_correspondence280/.test(read('watcher/watcher.py'));
  if (claims) return present || 'the policy claims local blanking, but ' + helper + ' / ' + module + ' are not integrated in this tree';
  return /Copies of the older text can still be in the collecting officer's addon file and in the Watcher's local file on that computer\. They are held there and are not uploaded\./.test(section)
    || 'without the component the policy must say the local copies can still hold the text';
});
check('when local blanking is claimed it keeps the stated facts and covers both places', () => {
  if (!claimsLocal()) return true;
  return /^Records the cleanup recognises\. In the addon and in the Watcher, the old text of such a record is blanked\. The sender, amount, time, status, item names and counts, and the record IDs stay\. A blanked record is never uploaded\.$/.test(paragraph('Records the cleanup recognises.'))
    && says(/the local copies keep theirs as long as they keep the record/) === true || 'local blanking facts incomplete';
});
// Round 5 review (13 Nov 2026), finding 4, and the second pass on the committed components: the cleanup does not
// blank without exception. A claim of local blanking must state the three cases separately and must not promise that
// every record is blanked.
check('when local blanking is claimed it states the three cases: recognised, held on its own, nothing changed', () => {
  if (!claimsLocal()) return true;
  const held = paragraph('Records it does not recognise.'), none = paragraph('When nothing can be changed.'), every = paragraph('In every case');
  return /A record the cleanup does not recognise, or cannot process within its limits, is left exactly as it is, text included\. It is held on its own and never uploaded, and the recognised records in the same file are still blanked\. The cleanup then reports itself as incomplete\./.test(held)
    && /In the addon, three kinds are always held this way: its copies of another addon's records, records of an unknown shape, and held transfer records of an old form\./.test(held)
    && /If the saved data is damaged in its structure, or the cleanup's own bookkeeping would pass its limits, the cleanup changes nothing and the old data stays exactly as it was\. In the addon, the same happens when the saved data is larger than the addon's size limits\./.test(none)
    && /In the Watcher, a large amount of unrelated history does not stop the cleanup: the recognised receipt records are still blanked and the rest stays unchanged\./.test(none)
    && /The Watcher also leaves its copy unchanged when it finds an unfinished save from an earlier run, and tries again at a later start\./.test(none)
    && /^In every case, nothing held is uploaded\. When its own cleanup is incomplete, the Watcher says so in one line when it starts, with counts and no names or text\.$/.test(every)
    // The superseded single-exception sentence is gone, and no sentence says every Watcher file beyond its limits is left whole.
    && !/too large to process safely/.test(section) && !/Watcher[^.]*(?:larger|too large|size limits)[^.]*(?:changes nothing|as it is|stays exactly)/.test(section)
    && !/(?:always|every record|without exception)[^.]*blank|blank[^.]*(?:always|every record|without exception)/i.test(section)
    || { held: held.slice(0, 160), none: none.slice(0, 160), every };
});
check('the addon cleanup, as committed: recognised text blanked with the rest kept, mirrored, unknown and old-form records held unchanged and blocked, incomplete reported; damage or size limits change nothing (behaviour, Lua)', () => {
  const got = lua([helperLua()], `local P=OlympusVerifyLocalPrivacy280
local R1,M1,U1,R2,R3=("1"):rep(24),("2"):rep(24),("3"):rep(24),("4"):rep(24),("5"):rep(24)
local function entry(id,note) return {id=id,type="donation",source="mail",character="Synthetic Payer",requestedAt=1700000000,status="done",donation={copper=900,items={{name="Synthetic item",count=2}},note=note}} end
local function file()
 local d={version=1,nextId=0,entries={},dedup={},acknowledgements={},bridgeMetadata={}}
 d.entries[R1]=entry(R1,"PRIV_R1"); d.entries[M1]=entry(M1,"PRIV_M1"); d.bridgeMetadata[M1]={source="OlympusDB"}
 d.entries[U1]={id=U1,type="donation",source="mystery-source",donation={copper=1,note="PRIV_U1"}}
 d.heldTransfers627={["untyped-1"]={context={kind="mail",body="PRIV_C1"},reason="held",heldAt=1}}
 d.mailCollection242={contextVersion=1,kind="mail",transferId=R2,header={sender="Synthetic Payer",subject="PRIV_SUBJ"},body="PRIV_BODY",mailFingerprint=("f"):rep(64),key=("e"):rep(64)}
 d.tradeCollection242={contextVersion=1,kind="trade",transferId=R3,note="PRIV_TRADE"}
 return {intake242=d}
end
local root=file(); local before=root.intake242
local origM,origU,origH=before.entries[M1],before.entries[U1],before.heldTransfers627["untyped-1"]
local ok,reason=P.Ensure(root); local d=root.intake242; local s=P.Status(root); local r=d.entries[R1]
local out={ok=ok,reason=reason,swapped=d~=before,r1note=r.donation.note,
 r1kept=r.id==R1 and r.character=="Synthetic Payer" and r.requestedAt==1700000000 and r.status=="done" and r.donation.copper==900 and r.donation.items[1].name=="Synthetic item" and r.donation.items[1].count==2,
 mirroredSame=d.entries[M1]==origM and origM.donation.note=="PRIV_M1",unknownSame=d.entries[U1]==origU and origU.donation.note=="PRIV_U1",
 oldFormSame=d.heldTransfers627["untyped-1"]==origH and origH.context.body=="PRIV_C1",
 mailBody=d.mailCollection242.body,mailSubject=d.mailCollection242.header.subject,mailSender=d.mailCollection242.header.sender,
 checksumKept=d.mailCollection242.mailFingerprint==("f"):rep(64) and d.mailCollection242.key==("e"):rep(64),
 tradeNote=d.tradeCollection242.note,noChecksumMade=d.tradeCollection242.key==nil and d.tradeCollection242.mailFingerprint==nil and r.key==nil,
 heldItems=s.heldItems,complete=s.complete,heldStatus=s.held,
 blocked=P.Blocked(root,M1,d.entries[M1]) and P.Blocked(root,U1,d.entries[U1]) and P.Blocked(root,R1,r)}
local function whole(mutate)
 local f=file(); mutate(f.intake242); local b=f.intake242; local k,why=P.Ensure(f); local st=P.Status(f)
 return {ok=k,reason=why,same=f.intake242==b,note=f.intake242.entries[R1].donation.note,body=f.intake242.mailCollection242.body,held=st.held}
end
out.cycle=whole(function(x) local t={} t.self=t x.extra=t end)
out.size=whole(function(x) local t={} for i=1,65537 do t[i]={} end x.extra=t end)
out.bookkeeping=whole(function(x) x.localCorrespondence280={version=1,purpose="financial-correspondence-local-only-v1",damaged=true} end)
return out`);
  const want = {
    ok: false, reason: 'scoped-minimization-incomplete', swapped: true, r1note: '', r1kept: true, mirroredSame: true, unknownSame: true, oldFormSame: true,
    mailBody: '', mailSubject: '', mailSender: 'Synthetic Payer', checksumKept: true, tradeNote: '', noChecksumMade: true, heldItems: 3, complete: false, heldStatus: true, blocked: true,
    cycle: { ok: false, reason: 'cycle', same: true, note: 'PRIV_R1', body: 'PRIV_BODY', held: true },
    size: { ok: false, reason: 'table-capacity', same: true, note: 'PRIV_R1', body: 'PRIV_BODY', held: true },
    bookkeeping: { ok: false, reason: 'privacy-metadata-format', same: true, note: 'PRIV_R1', body: 'PRIV_BODY', held: true },
  };
  const order = o => JSON.stringify(o, Object.keys(o).sort().concat(['ok', 'reason', 'same', 'note', 'body', 'held']));
  const held = paragraph('Records it does not recognise.'), none = paragraph('When nothing can be changed.');
  return /is left exactly as it is, text included\. It is held on its own and never uploaded, and the recognised records in the same file are still blanked\. The cleanup then reports itself as incomplete\./.test(held)
    && /In the addon, three kinds are always held this way: its copies of another addon's records, records of an unknown shape, and held transfer records of an old form\./.test(held)
    && /If the saved data is damaged in its structure, or the cleanup's own bookkeeping would pass its limits, the cleanup changes nothing and the old data stays exactly as it was\. In the addon, the same happens when the saved data is larger than the addon's size limits\./.test(none)
    && order(got) === order(want) || got;
});
check('the Watcher cleanup, as committed: recognised text blanked, an unrecognised row held unchanged, unrelated oversized history does not stop it, damage or an unfinished save changes nothing (behaviour, Python)', () => {
  const got = py([
    'import local_correspondence280 as lc',
    'class S:',
    '    def __init__(self, d, path=None): self.d = d; self.path = path; self.saved = 0',
    '    def save(self): self.saved += 1',
    "def row(eid, note, sha=True):",
    "    r = {'body': {'id': eid, 'type': 'donation', 'source': 'mail', 'character': 'Synthetic Payer', 'requestedAt': 1700000000, 'donation': {'copper': 900, 'items': [{'name': 'Synthetic item', 'count': 2}], 'note': note}}, 'state': 'done'}",
    "    if sha: r['sha256'] = 'a' * 64",
    '    return r',
    "def restored(r):",
    "    r = copy.deepcopy(r); r.pop(lc.FIELD, None); return r",
    'out = {}',
    "led = {'r1': row('r1', 'PRIV_R1'), 'r2': row('r2', 'PRIV_R2', sha=False), 'bad': row('bad', 'PRIV_BAD')}",
    "led['bad']['body']['surprise'] = 1",
    "cand, st = lc.prepare(S({'intake242': copy.deepcopy(led)}), 1800000000)",
    "L = cand['intake242']",
    "r1 = restored(L['r1']); r1['body']['donation']['note'] = 'PRIV_R1'",
    "out['mixed'] = dict(complete=st['complete'], blanked=st['blankedNotes'], held=st['heldRows'], note=L['r1']['body']['donation']['note'], rest=r1 == led['r1'], sha=L['r1'].get('sha256') == 'a' * 64, noShaMade='sha256' not in L['r2'], bad=L['bad'] == led['bad'], localOnly=lc.local_only(L['r1']) and lc.local_only(L['bad']))",
    "big = {'r1': row('r1', 'PRIV_R1'), 'history': {'body': {'type': 'verify', 'list': [0] * 270000}}}",
    "cand, st = lc.prepare(S({'intake242': copy.deepcopy(big)}), 1800000000)",
    "out['oversized'] = dict(complete=st['complete'], blanked=st['blankedNotes'], note=cand['intake242']['r1']['body']['donation']['note'], history=cand['intake242']['history'] == big['history'])",
    "cand, st = lc.prepare(S({'intake242': [row('r1', 'PRIV_R1')]}), 1800000000)",
    "out['damaged'] = dict(candidate=cand is None, complete=st['complete'], blanked=st['blankedNotes'])",
    'with tempfile.TemporaryDirectory() as tmp:',
    "    p = pathlib.Path(tmp) / 'watcher-state.json'; p.with_suffix('.tmp').write_text('{}', encoding='utf-8')",
    "    s = S({'intake242': {'r1': row('r1', 'PRIV_R1')}}, p); st = lc.initialize(s)",
    "    out['staging'] = dict(reason=st['reason'], complete=st['complete'], note=s.d['intake242']['r1']['body']['donation']['note'], saved=s.saved)",
    'print(json.dumps(out, sort_keys=True))',
  ]);
  const want = {
    damaged: { blanked: 0, candidate: true, complete: false },
    mixed: { bad: true, blanked: 2, complete: false, held: 1, localOnly: true, noShaMade: true, note: '', rest: true, sha: true },
    oversized: { blanked: 1, complete: false, history: true, note: '' },
    staging: { complete: false, note: 'PRIV_R1', reason: 'local-privacy-staging-present', saved: 0 },
  };
  const none = paragraph('When nothing can be changed.');
  return /In the Watcher, a large amount of unrelated history does not stop the cleanup: the recognised receipt records are still blanked and the rest stays unchanged\./.test(none)
    && /The Watcher also leaves its copy unchanged when it finds an unfinished save from an earlier run, and tries again at a later start\./.test(none)
    && /A record the cleanup does not recognise, or cannot process within its limits, is left exactly as it is, text included\./.test(paragraph('Records it does not recognise.'))
    && JSON.stringify(got) === JSON.stringify(want) || got;
});
check('policy timing: the addon cleanup runs when the addon loads, on account-wide saved data; the Watcher cleans its copy at start, before anything else reads it', () => {
  const core = read('addon/OlympusVerify/OlympusVerify.lua'), toc = read('addon/OlympusVerify/OlympusVerify.toc'), watcher = read('watcher/watcher.py');
  const p = paragraph('The older text is also removed');
  const init = /local function InitDB\(\)\n\s*OlympusVerifyDB = OlympusVerifyDB or \{\}\n\s*local db = OlympusVerifyDB\n\s*if OlympusVerifyLocalPrivacy280 then OlympusVerifyLocalPrivacy280\.Ensure\(db\) end/.test(core)
    && /if event == "ADDON_LOADED" then\n\s*if \.\.\. == ADDON then InitDB\(\) end/.test(core);
  const accountWide = /^## SavedVariables: OlympusVerifyDB\s*$/m.test(toc) && !/SavedVariablesPerCharacter:[^\n]*OlympusVerifyDB/.test(toc);
  const start = watcher.indexOf('local_correspondence280.initialize(self.state)'), journal = watcher.indexOf('self.treasury = TreasuryJournal(');
  return /^The older text is also removed on the collecting officer's computer\. The addon's saved data belongs to the officer's whole game account, not to one character\. The first time the addon loads with this version, on whichever character logs in first, it blanks the old text in memory, including where the text was part of an internal lookup key\. The game writes the change to the saved file at the next normal save: logout, \/reload or quitting the game\. A crash before then writes nothing\. The game keeps the previous file as a backup copy until the save after that\. The Watcher blanks the old text in its own local copy the next time it starts\.$/.test(p)
    && init && accountWide && start > 0 && journal > start || { init, accountWide, start, journal, p: p.slice(0, 120) };
});
check('policy: the Watcher reports an incomplete cleanup in one fixed line with counts only, no names or text', () => {
  const watcher = read('watcher/watcher.py');
  const line = /if not self\._local_correspondence_status280\["complete"\]:\n\s*cleanup = self\._local_correspondence_status280\n\s*log\(f"Local correspondence cleanup incomplete: blanked \{cleanup\['blankedNotes'\]\}, held \{cleanup\.get\('heldRows', 0\)\}, reason \{cleanup\['reason'\]\}\. Unsupported originals stay unchanged and local only\. Verification keeps its normal checks\."\)/.test(watcher);
  return /When its own cleanup is incomplete, the Watcher says so in one line when it starts, with counts and no names or text\./.test(paragraph('In every case'))
    && line || 'sentence missing, or the incomplete line not found or no longer counts-only';
});
check('policy: the cleanup keeps a checksum a record already had and never creates one; none of the three cleanups computes a hash', () => {
  const p = paragraph('The kept checksum.'), helper = helperLua(), module = read('watcher/local_correspondence280.py'), server = read('worker/src/treasury-note-maintenance280.ts');
  const code = helper.replace(/^--.*$/gm, '');
  const noHash = !/sha256|hmac|hashlib/i.test(code) && !/\bH\.|OlympusHmac/.test(code) && !/hashlib|sha256\(|_canonical_body/.test(module)
    && (server.match(/UPDATE audit SET details=json_set\(details,'\$\.note',''\)/g) || []).length === 1 && (server.match(/UPDATE audit/g) || []).length === 1;
  return /^The kept checksum\. Where a record already has a checksum made from the original record, including the old text, the cleanup keeps it\. The cleanup never creates a checksum for a record that had none\. This holds on the server, in the addon's file and in the Watcher's copy\./.test(p)
    && /A checksum cannot be turned back into the text\./.test(p) && /proves nothing about what the text said/.test(p) && /could still test a guessed short text against it/.test(p)
    && !/each keep a checksum/.test(section) && noHash || { noHash, p: p.slice(0, 200) };
});

// ---------- 8. role removals Discord refused, and the guild-wide pause ----------
// fdf2158 (role-delete-refusal280.ts, role-settlements.ts persistDeleteRefusal280): a closed Discord refusal of a role
// DELETE turns the original row into state 'held' with a closed reason; a 429 also writes one service setting.
let roleMod = null;
try {
  const { buildSync } = require(require.resolve('esbuild', { paths: [worker] }));
  const entry = [
    "export {betaResetReceiptRetentionStatements} from './src/beta-reset-retention.ts';",
    "export {betaProvenanceRetentionStatements} from './src/qr-beta-fern-data.ts';",
    "export {qrErasureStatements} from './src/qr-phase1-data.ts';",
    "export * from './src/role-delete-refusal280.ts';",
    "export {CANONICAL_RANKS233,CANONICAL_GUILD233} from './src/canonical-ranks233.ts';",
    "export {DIRECTIVE_CANONICAL_PROFILE,DIRECTIVE_RANK_NAMES,DIRECTIVE_CANONICAL_INDEX} from './src/native-rank-constants.ts';",
  ].join('\n');
  const out = buildSync({ stdin: { contents: entry, resolveDir: worker, loader: 'ts' }, bundle: true, write: false, format: 'cjs', platform: 'node', target: 'es2022', logLevel: 'silent' });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require);
  roleMod = m.exports;
} catch (error) { console.log('role bundle failed: ' + String(error).slice(0, 300)); }
check('policy: a refused role removal stays held; the yearly cleanup leaves it and an account erasure removes it (behaviour, node:sqlite on schema.sql)', () => {
  if (!roleMod) return 'bundle unavailable';
  const m = roleMod, db = new DatabaseSync(':memory:');
  db.exec(read('worker/schema.sql'));
  const policy = JSON.stringify({ version: 2, enabled: true, profile: m.DIRECTIVE_CANONICAL_PROFILE, guildId: m.CANONICAL_GUILD233, ranks: m.CANONICAL_RANKS233.map(r => ({ ...r, permissions: '0' })) });
  const env = { GUILD_ID: m.CANONICAL_GUILD233, CANONICAL_RANKS233: policy, NATIVE_RANK_SYNC232: 'off', DB: fakeEnv().DB };
  const created = now() - 2 * 366 * 86400, rank = 5, role = m.CANONICAL_RANKS233[m.DIRECTIVE_CANONICAL_INDEX[rank]].roleId;
  const ins = db.prepare(`INSERT INTO role_settlements(id,subject,purpose,proof_id,guild_id,role_id,desired,state,reason,claim_nonce,subject_generation,request_digest,roster_id,native_guid,native_profile,native_rank,native_rank_name,attempts,created_at,expires_at,checked_at)
    VALUES(?,?,?,?,?,?,?,'held',?,?,NULL,?,?,?,?,?,?,1,?,?,?)`);
  const hex = (c, n) => c.repeat(n);
  const reason = (type, status, code, wait) => JSON.stringify({ version: 1, type, status, code, retryAfterSeconds: wait });
  const native = [1, 'Player-4613-0ABCDEF1', m.DIRECTIVE_CANONICAL_PROFILE, rank, m.DIRECTIVE_RANK_NAMES[rank]];
  // The yearly cleanup's own eligible shape (a held removal that was never sent) proves the cleanup ran and matched.
  ins.run(hex('a', 32), '300000000000000021', 'canonical_routine233', null, m.CANONICAL_GUILD233, role, 1, 'canonical233_never_dispatched', hex('b', 32), hex('c', 64), ...native, created, created + 300, created + 1);
  ins.run(hex('d', 32), '300000000000000022', 'canonical_routine233', null, m.CANONICAL_GUILD233, role, 0, reason(m.CANONICAL_DELETE_REFUSAL280, 403, 50013, 0), hex('e', 32), hex('f', 32), ...native, created, created + 300, created + 1);
  ins.run(hex('1', 32), '300000000000000023', 'canonical_routine233', null, m.CANONICAL_GUILD233, role, 0, reason(m.CANONICAL_DELETE_REFUSAL280, 429, null, 30), hex('2', 32), hex('3', 32), ...native, created, created + 300, created + 1);
  ins.run(hex('4', 32), '300000000000000024', 'canonical_ban_remove_v1', hex('5', 32), m.CANONICAL_GUILD233, role, 0, reason(m.BAN_DELETE_REFUSAL280, 404, 10007, 0), hex('6', 32), hex('7', 64), null, null, 'olympus-ban-rank-removal-20261112-v1', null, null, created, created + 300, created + 1);
  const refusals = [hex('d', 32), hex('1', 32), hex('4', 32)];
  // Each refusal row is exactly what Codex's reader recognises as a recorded refusal.
  const recognised = db.prepare(`SELECT id FROM role_settlements r WHERE (${m.canonicalDeleteRefusalSql280('r')}) OR (${m.banDeleteRefusalSql280('r')}) ORDER BY id`).all().map(r => r.id);
  for (const st of [...m.betaResetReceiptRetentionStatements(env), ...m.betaProvenanceRetentionStatements(env)]) db.prepare(st.sql).run(...st.args);
  const afterYearly = db.prepare('SELECT id FROM role_settlements ORDER BY id').all().map(r => r.id);
  const erased = {};
  for (const id of refusals) {
    const subject = db.prepare('SELECT subject FROM role_settlements WHERE id=?').get(id).subject, [admit, del] = m.qrErasureStatements(env, subject);
    erased[id] = db.prepare(admit.sql).get(...admit.args).admitted === 1 && db.prepare(del.sql).run(...del.args).changes === 1;
  }
  const p = paragraph('Guild role synchronization') || /Guild role synchronization\.([^<]*)/.exec(html.replace(/<\/?strong>/g, ''))?.[1] || '';
  return /A role removal that Discord refused with a complete answer stays as a held record with Discord's status and error code, and no message text; the yearly cleanup does not remove it, so it stays until the account is erased\./.test(p)
    && JSON.stringify(recognised) === JSON.stringify([...refusals].sort()) && JSON.stringify(afterYearly) === JSON.stringify([...refusals].sort())
    && Object.values(erased).every(Boolean) && db.prepare('SELECT COUNT(*) AS n FROM role_settlements').get().n === 0
    && (read('worker/src/role-settlements.ts').match(/UPDATE role_settlements SET state='held',reason=\?\$\{reasonAt\},checked_at=\?\$\{checkedAt\}/g) || []).length === 1
    || { recognised, afterYearly, erased };
});
check('only the yearly cleanup and the erasure delete role records: the source has exactly those four role-record DELETE statements', () => {
  const dir = path.join(worker, 'src'), hits = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.ts'))) for (const _ of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/DELETE FROM role_settlements/g)) hits.push(f);
  return /the yearly cleanup does not remove it, so it stays until the account is erased\./.test(html)
    && JSON.stringify(hits.sort()) === JSON.stringify(['beta-reset-retention.ts', 'beta-reset-retention.ts', 'qr-beta-fern-data.ts', 'qr-phase1-data.ts']) || hits;
});
check('policy: after a recorded rate-limit reply, normal rank-role synchronization waits up to a day, in one setting that names no one; erasure does not use the wait (behaviour, node:sqlite)', () => {
  if (!roleMod) return 'bundle unavailable';
  const m = roleMod, db = new DatabaseSync(':memory:');
  db.exec(read('worker/schema.sql'));
  const allowed = () => db.prepare(`SELECT CASE WHEN ${m.managedRankCooldownAllowedSql280()} THEN 1 ELSE 0 END AS ok`).get().ok;
  const before = allowed();
  db.prepare("INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES(?,?,?,NULL)").run(m.MANAGED_RANK_COOLDOWN280, JSON.stringify({ version: 1, due: now() + 600 }), now());
  const during = allowed();
  db.prepare('UPDATE site_settings SET value=? WHERE key=?').run(JSON.stringify({ version: 1, due: now() - 1 }), m.MANAGED_RANK_COOLDOWN280);
  const after = allowed();
  const withName = m.readManagedRankCooldown280(JSON.stringify({ version: 1, due: 5, subject: '300000000000000021' }));
  const pacing = [m.roleDeletePacing280(1000.5, 86400, null), m.roleDeletePacing280(1000, 86401, null)];
  const src = read('worker/src/role-settlements.ts'), deletes = fs.readdirSync(path.join(worker, 'src')).filter(f => f.endsWith('.ts')).some(f => /DELETE FROM site_settings[^`]*cooldown280|DELETE FROM site_settings[^`]*MANAGED_RANK_COOLDOWN280/.test(fs.readFileSync(path.join(worker, 'src', f), 'utf8')));
  const p = /Guild role synchronization\.([^<]*)/.exec(html.replace(/<\/?strong>/g, ''))?.[1] || '';
  return /When Discord answers a role removal with a complete rate-limit reply and the bot has recorded that reply, the bot's normal automatic rank-role synchronization for the guild waits until the end time Discord asked for, at most one day away; it keeps that end time and when it was set in one setting that names no one\. Account erasure and its role cleanup do not use this wait\. An incomplete rate-limit reply cannot set a wait\. If the bot could not confirm that it recorded the reply, the change stays held for review, and a wait that was already recorded still applies\./.test(p) && !/pauses its automatic rank-role changes for the whole guild/.test(p) && !/no wait is set/.test(p)
    && before === 1 && during === 0 && after === 1 && withName === null && !/\?\d/.test(m.managedRankCooldownAllowedSql280())
    && pacing[0] && pacing[0].retryAfterSeconds <= 86401 && pacing[1] === null
    && /json_object\('version',1,'due',CAST\(\?\$\{dueAt\} AS INTEGER\)\),\$\{DB_NOW\},NULL/.test(src) && !deletes
    // Not written, because the source does not do it: that the setting itself is deleted after a day.
    && !/(?:setting|pause)[^.]*(?:deleted|removed|kept at most)[^.]*day/.test(p)
    || { before, during, after, withName, pacing, deletes };
});

Promise.all(results).then(done => {
  for (const { name, pass, detail } of done) console.log((pass ? 'PASS ' : 'FAIL ') + name + (pass ? '' : '\n     ' + detail.slice(0, 600)));
  const passed = done.filter(r => r.pass).length;
  console.log(passed + '/' + done.length + ' privacy text checks (root ' + repo + ')');
  if (passed !== done.length) process.exitCode = 1;
});
