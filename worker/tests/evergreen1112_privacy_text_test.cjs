'use strict';
// Evergreen 12 Nov 2026, round 5, area "privacy": the consolidated gold-receipt text in policies/privacy.html.
// Each check pairs a sentence of the policy with the code that makes it true, and runs that code where it can
// (the export SQL, the erasure marker SQL and the receipt shape validators, against node:sqlite and Python).
// Owner rulings it follows (STAGE2-RULES.md): "Blank it, keep the rows" and "Yes, blank it too" (local text),
// "Delete the text now" (server notes), "Officer looks them up" (mail receipts), quiz scores in the browser.
// Plain Node, no new dependency: esbuild and node:sqlite are already present.
// Usage: node tests/evergreen1112_privacy_text_test.cjs [--root <repository root>]   (default: this checkout)
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const args = process.argv.slice(2), at = args.indexOf('--root');
const repo = path.resolve(at >= 0 ? args[at + 1] : path.join(__dirname, '..', '..')), worker = path.join(repo, 'worker');
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');
const results = [];
function check(name, fn) {
  let pass = false, detail = '';
  try { const r = fn(); pass = r === true; if (!pass) detail = typeof r === 'string' ? r : JSON.stringify(r); }
  catch (error) { detail = String(error && error.stack || error).split('\n').slice(0, 3).join(' | '); }
  results.push({ name, pass });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (pass ? '' : '\n     ' + detail.slice(0, 600)));
}

const html = read('policies/privacy.html');
const text = html.replace(/<[^>]+>/g, '').replace(/&rsquo;|’/g, "'").replace(/\s+/g, ' ');
const sectionMatch = /<h2>Gold receipts and captured game text<\/h2>([\s\S]*?)<h2>/.exec(html);
const section = sectionMatch ? sectionMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ') : '';
const says = (re, where = section) => re.test(where) || 'policy does not say ' + re;

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
check('policy: the addon keeps an unconfirmed receipt and prunes a confirmed one after 30 days', () => {
  const addon = read('addon/OlympusVerify/OlympusVerifyTreasury.lua');
  return says(/keeps a receipt in its saved file until the server confirms it, and removes a confirmed receipt once it is 30 days old/) === true
    && /retentionSeconds = 30 \* 86400/.test(addon) && /row\.ts > cutoff or field=="receipts" and not \(ack and ack\.status=="done"\)/.test(addon) || 'prune rule not found';
});

// ---------- 3. the data download ----------
check('policy: the download lists only receipts with a uniquely linked character ID; mail receipts are left out (behaviour, node:sqlite)', () => {
  if (!mod) return 'bundle unavailable';
  const db = database(), { rows } = seed(db), env = fakeEnv();
  const plan = mod.communityScopedExportPlan(env, ME, ['treasury242']);
  if (plan.statements.length !== 1) return 'unexpected statement count';
  const got = run(db, plan.statements[0]), ids = got.map(r => r.sourceId);
  const keys = [...new Set(got.flatMap(r => Object.keys(r)))].sort().join(',');
  const raw = JSON.stringify(got);
  return says(/lists a gold receipt only when it carries the in-game character ID of one of your linked characters and no other account is linked to that ID/) === true
    && says(/so mail receipts are left out/) === true && says(/It leaves out names, the reference, any text, item lists and the checksum\./) === true
    && JSON.stringify(ids) === JSON.stringify([rows.trade.sourceId])
    && keys === 'classification,copper,guid,kind,observedAt,retainUntil,source,sourceId,ts,version'
    && !/Synthetic Payer|TITHE-|SYNTHETIC|payloadHash|"f{64}"/.test(raw) || { ids, keys };
});
check('policy: the separate privacy-connection copy contains no gold receipts; its selected families leave the receipt family out', () => {
  const src = read('worker/src/privacy-access-export.ts');
  const selected = /communityPackedExportPlan\(env,id,\[([^\]]*)\]\)/.exec(src);
  return says(/The copy from the separate privacy connection contains no gold receipts\./) === true
    && !!selected && !selected[1].includes('treasury242') && !/communityExportPlan\(env,id\)\.statements(?!\.length)/.test(src) || (selected && selected[1]);
});
check('policy: how to ask for mail receipts names a role and a channel, never a person', () => {
  const para = /Gold receipts in your data download\.([^]*?)(?:After an account erasure\.)/.exec(section);
  return !!para && /ask an Olympus officer in Asmongold's Discord server and name your character\. The officer looks up that character's receipts by hand and shares them with you\./.test(para[1])
    && !/Rich Campbell|richwcampbell|Fernmelder/.test(section) || 'ask route missing or names a person';
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
check('policy claims local blanking only when the addon helper and the Watcher module that do it are present', () => {
  const claims = /it blanks the old text in its saved file/.test(section) || /Watcher starts, it blanks the old text/.test(section);
  const helper = 'addon/OlympusVerify/OlympusVerifyLocalPrivacy280.lua', module = 'watcher/local_correspondence280.py';
  const present = fs.existsSync(path.join(repo, helper)) && fs.existsSync(path.join(repo, module))
    && /^OlympusVerifyLocalPrivacy280\.lua\s*$/m.test(read('addon/OlympusVerify/OlympusVerify.toc'))
    && /local_correspondence280/.test(read('watcher/watcher.py'));
  if (claims) return present || 'the policy claims local blanking, but ' + helper + ' / ' + module + ' are not integrated in this tree';
  return /Copies of the older text can still be in the collecting officer's addon file and in the Watcher's local file on that computer\. They are held there and are not uploaded\./.test(section)
    || 'without the component the policy must say the local copies can still hold the text';
});
check('when local blanking is claimed it keeps the stated facts and covers both places', () => {
  if (!/it blanks the old text in its saved file/.test(section)) return true;
  return says(/In both places the sender, amount, time, status, item names and counts, and the record IDs stay, and a blanked record is never uploaded\./) === true
    && says(/the local copies keep theirs as long as they keep the record/) === true || 'local blanking facts incomplete';
});

const passed = results.filter(r => r.pass).length;
console.log(passed + '/' + results.length + ' privacy text checks (root ' + repo + ')');
if (passed !== results.length) process.exitCode = 1;
