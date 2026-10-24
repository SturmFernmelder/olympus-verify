// Real source, original Native admission and real SQLite. All Discord HTTP is
// explicitly mocked; this suite cannot contact Discord or any other provider.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const entry = require('./helpers/privacy129_fixture.cjs');
const base = path.join(__dirname, '..'), cache = new Map();
let T = 1792750000;
const RealDate = Date;
globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [T * 1000])); } static now() { return T * 1000; } };
const GUILD = '300000000000000001', ADMIN = '300000000000000071', VIEWER = '300000000000000072', TARGET = '300000000000000073';
const MEMBER_ROLE = '300000000000000081', SECRET_ROLE = '300000000000000082';
let provider = async () => { throw Error('unconfigured mock'); }, calls = [], unexpectedNetwork = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.origin !== 'https://discord.com' || !url.pathname.startsWith('/api/v10/guilds/')) { unexpectedNetwork++; throw Error('outbound request refused'); }
  if (init.method && init.method !== 'GET') throw Error('directory must never mutate Discord');
  calls.push(url.pathname + url.search);
  return provider(url, init);
};
function load(name) {
  if (name === 'node:async_hooks') return require(name);
  const file = path.join(base, 'src', name.replace(/^\.\//, '') + '.ts');
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', code)(mod, mod.exports, p => load(p)); return mod.exports;
}
const directory = load('./community-discord-directory'), context = load('./community-context'), core = load('./site-core');
const admission = load('./privacy-write-admission');
const identities = load('./site-appointed-identities'), offices = load('./governance-offices');
let n = 0, pass = 0;
function check(name, value, detail) { n++; if (value) pass++; console.log((value ? 'PASS ' : 'FAIL ') + name); if (!value && detail) console.log(detail); }
const member = (id = TARGET, extra = {}) => ({ user: { id, username: 'same-name', global_name: 'Same-Name', avatar: 'a'.repeat(32) }, nick: null, roles: [MEMBER_ROLE, SECRET_ROLE], pending: false, ...extra });
const answer = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
async function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  db.function('strftime', (format, input) => { if (format !== '%s' || input !== 'now') throw Error('unexpected Native clock'); return String(T); });
  entry.installCurrentEntryEpoch(db, { now: T });
  let beforeHydrate = null, afterHydrate = null, beforeAttendedWrite = null;
  const plans = [];
  const raw = entry.originalNativePort(db, { beforeBatch: async plan => {
    plans.push(plan.map(p => p.statement));
    if (beforeAttendedWrite && plan.some(p => p.statement.includes('INSERT INTO site_settings'))) { const fn=beforeAttendedWrite; beforeAttendedWrite=null; await fn(); }
    if (beforeHydrate && plan.some(p => p.statement.includes('JOIN json_each(?2) original'))) { const fn = beforeHydrate; beforeHydrate = null; await fn(); }
  }, afterBatch: async plan => {
    if (afterHydrate && plan.some(p => p.statement.includes('JOIN json_each(?2) original'))) { const fn = afterHydrate; afterHydrate = null; await fn(); }
  } }), DB = admission.createPrivacyWriteAdmissionDatabase(raw, 'writer', 'canonical', entry.ENTRY_EPOCH);
  const env = entry.currentEntryEnvironment({ DB, COOKIE_SECRET: 'directory-tests-only-cookie-secret-0123456789', DISCORD_BOT_TOKEN: 'fixture-only', DISCORD_APP_ID: '1550176895671341076', SITE_HOST: 'guild.example', PUBLIC_BASE_URL: 'https://verify.example', SITE_GUILD_ID: GUILD, GUILD_ID: GUILD, SITE_ADMINS: ADMIN, ROLE_GUILD_MEMBER: MEMBER_ROLE, ROLE_MODERATOR: SECRET_ROLE, COMMUNITY_FEATURES: 'directory' });
  const write = (sql, ...params) => DB.prepare(sql).bind(...params).run();
  const cookies = new Map();
  for (const id of [ADMIN, VIEWER, TARGET]) {
    await write('INSERT INTO site_users(discord_id,username,in_server,denied,first_login,last_login,checked_at,account_incarnation)VALUES(?,?,1,0,?,?,?,?)', id, 'fixture-' + id.slice(-2), T, T, T, id.padStart(32, 'a'));
    const issued = await entry.issueOriginalEntryCookie(n => load('./' + n), db, { ...env, DB: raw }, id); cookies.set(id, issued.cookie);
    await write('INSERT INTO members(discord_id,banned)VALUES(?,0)', id);
    await write("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at,member_since)VALUES(?,?,?,'member',?,?,?)", 'proof-' + id, 'Proven ' + id.slice(-2), id, T - 100, T - 90, T - 80);
  }
  await write("INSERT INTO characters(name_key,name,discord_id,status,bound_at,verified_at)VALUES('unproved','Not Proven',?,'pending',?,NULL)", TARGET, T - 100);
  const call = async (id = ADMIN, cursor = '', overrides = {}) => {
    const request = new Request('https://guild.example/api/community/discord-directory' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), { headers: id ? { Cookie: cookies.get(id) } : {} });
    const e = { ...env, ...overrides }, ctx = await context.communityContext(e, request, { guildRoleRead: true });
    const r = await directory.discordDirectoryList(request, e, ctx);
    return { status: r.status, body: await r.json(), ctx, request, env: e };
  };
  const visibility = async (id, listed, headers = {}) => {
    const request = new Request('https://guild.example/api/community/discord-directory/visibility', { method: listed === undefined ? 'GET' : 'PUT', headers: { Cookie: cookies.get(id), Origin: 'https://guild.example', 'X-Olympus': core.PAGE_VERSION, ...headers } });
    const ctx = await context.communityContext(env, request), response = await directory.discordDirectoryVisibility(request, env, ctx, listed === undefined ? {} : { listed });
    return { status: response.status, body: await response.json() };
  };
  return { db, env, DB, raw, cookies, write, call, visibility, plans, beforeHydrate(fn) { beforeHydrate = fn; }, afterHydrate(fn) { afterHydrate = fn; }, beforeAttendedWrite(fn) { beforeAttendedWrite=fn; }, close() { db.close(); } };
}
(async () => {
  const f = await fixture();
  const schemaBefore = JSON.stringify(f.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all());
  const siteUsersBefore = f.db.prepare('SELECT COUNT(*) AS n FROM site_users').get().n;
  provider = async () => answer([member()]);
  let r = await f.call();
  const m = r.body.members?.[0];
  check('one authenticated bounded REST page returns a proven member', r.status === 200 && r.body.complete === true && r.body.source === 'discord_members' && r.body.scanned === 1 && m.verifiedCharacters.length === 1 && m.verifiedCharacters[0].name === 'Proven 73', r.body);
  check('public member reference hides explicit member and role IDs', /^dm_[A-Za-z0-9_-]{43}$/.test(m.ref) && !Object.hasOwn(m, 'id') && !Object.hasOwn(m, 'discordId') && !Object.hasOwn(m, 'roleIds') && m.roles.join(',') === 'Guild Member' && !JSON.stringify(m).includes(SECRET_ROLE));
  check('case-insensitive matching names are not duplicated and avatar is bounded', m.label === 'Same-Name' && m.avatarUrl === `https://cdn.discordapp.com/avatars/${TARGET}/${'a'.repeat(32)}.png?size=64`);
  check('pending/unverified character labels never become proof', !JSON.stringify(r.body).includes('Not Proven'));
  const cosmetic='300000000000000101',cosmeticConfig=JSON.stringify({version:1,guildId:GUILD,applicationId:f.env.DISCORD_APP_ID,seasonStartsAt:T-3600,roles:{tithePayer:cosmetic,patron:'300000000000000102',benefactor:'300000000000000103'}});
  provider=async()=>answer([member(TARGET,{roles:[MEMBER_ROLE,cosmetic]})]);r=await f.call(ADMIN,'',{TREASURY_COSMETIC_ROLES:cosmeticConfig});
  check('current configured cosmetic role appears as a title without exposing ledger amounts',r.status===200&&r.body.members[0].roles.includes('Tithe Payer')&&!JSON.stringify(r.body).includes('qualifyingGold')&&!JSON.stringify(r.body).includes(cosmetic));
  provider=async()=>answer([member(TARGET,{roles:[cosmetic]})]);r=await f.call(ADMIN,'',{TREASURY_COSMETIC_ROLES:cosmeticConfig});
  check('a cosmetic title alone does not create Olympus directory eligibility',r.status===200&&r.body.members.length===0);
  const expiredSeason=JSON.stringify({...JSON.parse(cosmeticConfig),seasonStartsAt:T-90*86400});provider=async()=>answer([member(TARGET,{roles:[MEMBER_ROLE,cosmetic]})]);r=await f.call(ADMIN,'',{TREASURY_COSMETIC_ROLES:expiredSeason});
  check('website cosmetic title expires by season clock even when Discord cleanup is deferred',r.status===200&&!r.body.members[0].roles.includes('Tithe Payer'));
  provider = async () => answer([member(TARGET, { roles: [SECRET_ROLE] })]);
  r = await f.call();
  check('the whole Asmongold server and a private safety role are not Olympus directory eligibility', r.status === 200 && r.body.members.length === 0 && r.body.scope === 'configured_olympus_members');
  const beforeVisibility = calls.length;
  let visible = await f.visibility(TARGET, false);
  check('own opt-out needs no provider call and suppresses the entire directory row', visible.status === 200 && visible.body.listed === false && calls.length === beforeVisibility);
  provider = async () => answer([member()]); r = await f.call();
  check('opt-out withholds display identity, avatar, public roles and proven characters together', r.status === 200 && r.body.members.length === 0 && !JSON.stringify(r.body).includes('Proven 73'));
  const plan = context.communityExportPlan(f.env, TARGET), copied = plan.shape(await f.DB.batch(plan.statements));
  check('own account copy includes just own directory visibility without the private suppression map', copied.discord_directory_visibility.optedOut === true && !JSON.stringify(copied.discord_directory_visibility).includes(TARGET));
  visible = await f.visibility(TARGET, true); r = await f.call();
  check('explicit listing restores default eligible member row without opting into extra profile details', visible.status === 200 && visible.body.listed === true && r.body.members.length === 1 && f.db.prepare('SELECT COUNT(*) AS n FROM community_profiles').get().n === 0);
  check('cross-origin own-visibility changes are refused', (await f.visibility(TARGET, false, { Origin: 'https://evil.example' })).status === 403);
  await f.visibility(TARGET, false);
  await f.DB.batch(context.communityEraseStatements(f.env, TARGET));
  check('registered erasure removes the exact own opt-out entry', (await f.visibility(TARGET)).body.listed === true && !f.db.prepare("SELECT value FROM site_settings WHERE key='discordDirectoryHidden'").get().value.includes(TARGET));
  provider = async () => answer([member(TARGET, { user: { id: TARGET, username: 'same-name', global_name: 'Same Name', avatar: 'a'.repeat(32) } })]);
  r = await f.call();
  check('a punctuation difference preserves both display name and username', r.status === 200 && r.body.members[0].label === 'Same Name (same-name)');
  provider = async () => answer([member(TARGET, { user: { id: TARGET, username: 'same-name', avatar: 'https://untrusted.example/image.png' } })]);
  r = await f.call();
  check('unrecognised provider avatar values use the bounded Discord default', r.status === 200 && /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/.test(r.body.members[0].avatarUrl));
  check('unsigned strangers receive no directory and cause no enumeration', (await f.call(null)).status === 401);
  check('feature flag still refuses the new reader', (await f.call(ADMIN, '', { COMMUNITY_FEATURES: '' })).status === 503);
  provider = async () => answer([member('300000000000000090', { user: { id: '300000000000000090', username: 'new-person' } })]);
  r = await f.call();
  check('Discord-only member is shown without inventing a website account or character proof', r.status === 200 && r.body.members[0].username === 'new-person' && r.body.members[0].verifiedCharacters.length === 0 && f.db.prepare('SELECT COUNT(*) AS n FROM site_users').get().n === siteUsersBefore);
  provider = async () => answer([member('300000000000000091', { user: { id: '300000000000000091', username: 'bot', bot: true } }), member('300000000000000092', { pending: true })]);
  r = await f.call();
  check('bots and membership-screening accounts are omitted without pretending no page was scanned', r.status === 200 && r.body.scanned === 2 && r.body.members.length === 0);
  for (const bad of [null, {}, [member(), member()], [member(TARGET, { roles: [MEMBER_ROLE, MEMBER_ROLE] })], [member(TARGET, { roles: ['garbage'] })], [member(TARGET, { user: { id: TARGET, username: '' } })]]) {
    provider = async () => answer(bad); r = await f.call();
    check('malformed or duplicate provider page is unavailable without an empty-member success', r.status === 503 && r.body.error === 'discord_directory_unavailable' && !Object.hasOwn(r.body, 'members'));
  }
  for (const status of [403, 429, 500]) {
    provider = async () => answer({ message: 'fixture denial' }, status); r = await f.call();
    check('provider ' + status + ' does not become an empty directory', r.status === (status === 429 ? 429 : 503) && !Object.hasOwn(r.body, 'members'));
  }
  // Traverse 1,001 ordinary members. Each request is one bounded provider page;
  // the encrypted continuation carries the provider high-watermark privately.
  const start = 400000000000000000n, all = Array.from({ length: 1001 }, (_, i) => member(String(start + BigInt(i)), { user: { id: String(start + BigInt(i)), username: 'member-' + i }, roles: [MEMBER_ROLE] }));
  provider = async url => {
    if (url.pathname !== `/api/v10/guilds/${GUILD}/members` || url.searchParams.get('limit') !== '1000') throw Error('unexpected directory request');
    const after = BigInt(url.searchParams.get('after'));
    return answer(all.filter(m => BigInt(m.user.id) > after).slice(0, 1000));
  };
  let cursor = '', firstCursor, total = 0, pages = 0, refs = new Set();
  do {
    r = await f.call(ADMIN, cursor); if (r.status !== 200) throw Error('traversal failed ' + JSON.stringify(r.body));
    pages++; total += r.body.members.length; for (const m of r.body.members) refs.add(m.ref);
    cursor = r.body.nextCursor; firstCursor ||= cursor;
  } while (cursor);
  check('more than 1,000 members traverse in eleven pages without duplication', pages === 11 && total === 1001 && refs.size === 1001 && r.body.complete === true);
  check('cursor contains no cleartext provider high-watermark or actor ID', !firstCursor.includes(String(start)) && !firstCursor.includes(ADMIN) && /^1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/.test(firstCursor));
  const beforeBadCursor = calls.length;
  r = await f.call(VIEWER, firstCursor);
  check('continuation cannot move to another reader and performs no page request', r.status === 400 && calls.length === beforeBadCursor);
  r = await f.call(ADMIN, firstCursor.slice(0, -1) + (firstCursor.endsWith('A') ? 'B' : 'A'));
  check('tampered encrypted continuation refuses', r.status === 400);
  r = await f.call(ADMIN, firstCursor, { GUILD_ID: '300000000000000099', SITE_GUILD_ID: '300000000000000099' });
  check('continuation cannot move to another guild', r.status === 400);
  const old = T; T += directory.DISCORD_DIRECTORY_CURSOR_SECONDS;
  r = await f.call(ADMIN, firstCursor); T = old;
  check('original fifteen-minute deadline expires without renewal', r.status === 409 && r.body.error === 'cursor_expired');
  provider = async () => { await f.write('UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?', VIEWER); return answer([member()]); };
  r = await f.call(VIEWER);
  check('sign-out during provider wait releases no earlier member payload', r.status !== 200 && !Object.hasOwn(r.body, 'members'));
  provider = async () => { await f.write('UPDATE site_users SET denied=1 WHERE discord_id=?', TARGET); return answer([member()]); };
  r = await f.call();
  check('target standing change during provider wait removes that target', r.status === 200 && r.body.members.length === 0);
  await f.write('UPDATE site_users SET denied=0 WHERE discord_id=?', TARGET);
  provider = async () => answer([member()]);
  f.beforeHydrate(async () => {
    await f.write('DELETE FROM site_users WHERE discord_id=?', TARGET);
    await f.write('INSERT INTO site_users(discord_id,username,in_server,denied,first_login,last_login,account_incarnation)VALUES(?,?,1,0,?,?,?)', TARGET, 'new incarnation', T, T, 'b'.repeat(32));
  });
  r = await f.call();
  check('a target recreated after capture cannot inherit the old reference or character payload', r.status === 200 && r.body.members.length === 0);
  provider = async () => { await f.write("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?", TARGET); return answer([member()]); };
  r = await f.call();
  check('target erasure admission during provider wait removes that target', r.status === 200 && r.body.members.length === 0);
  // Exact-ID search needs a fresh member GET, not prefix search or a stale cache.
  provider = async url => {
    if (url.pathname === `/api/v10/guilds/${GUILD}/members/${TARGET}`) return answer(member());
    throw Error('exact-ID search must not use search or enumerate');
  };
  let a = await core.searchMembers(f.env, TARGET), b = await core.searchMembers(f.env, `<@!${TARGET}>`);
  check('generic search accepts exact ID and mention through fresh targeted GETs', a.found[0]?.id === TARGET && b.found[0]?.id === TARGET && calls.slice(-2).every(p => p.endsWith('/' + TARGET)));
  provider = async () => answer({ code: 10007 }, 404); a = await core.searchMembers(f.env, TARGET);
  check('confirmed exact-ID absence produces no fabricated result', a.found.length === 0);
  check('directory and searches preserve the entire schema catalogue', JSON.stringify(f.db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all()) === schemaBefore);
  check('directory makes no new website accounts, persistent roster mirror or provider writes', f.db.prepare('SELECT COUNT(*) AS n FROM site_users').get().n === siteUsersBefore && unexpectedNetwork === 0 && calls.every(p => !p.includes('/gateway')));
  f.close();
  // Exercise the role-only reader's final internal role GET, after its first
  // target hydration. Returning those earlier rows would leak an erased target.
  const h = await fixture();
  await h.write('DELETE FROM characters WHERE discord_id=?', VIEWER);
  let hydratedBeforeFinalRoleGet = false, targetRetiredDuringRoleGet = false, viewerGets = 0, pageGets = 0;
  h.afterHydrate(() => { hydratedBeforeFinalRoleGet = true; });
  provider = async url => {
    if (url.pathname === `/api/v10/guilds/${GUILD}/members/${VIEWER}`) {
      viewerGets++;
      if (hydratedBeforeFinalRoleGet && !targetRetiredDuringRoleGet) {
        targetRetiredDuringRoleGet = true;
        await h.write("UPDATE privacy_subjects SET state='retiring' WHERE subject_id=?", TARGET);
      }
      return answer(member(VIEWER));
    }
    if (url.pathname === `/api/v10/guilds/${GUILD}/members`) { pageGets++; return answer([member()]); }
    throw Error('unexpected role-only directory request');
  };
  h.plans.length = 0;
  r = await h.call(VIEWER);
  const readPlans = h.plans.filter(plan => !plan.some(sql => sql.startsWith('UPDATE privacy_subjects SET state=')));
  const hydrateCount = readPlans.flat().filter(sql => sql.includes('JOIN json_each(?2) original')).length;
  check('target erasure during the final role-only reader GET releases no earlier target or character', targetRetiredDuringRoleGet && r.status === 200 && r.body.members.length === 0);
  // Original Native admission also emits WITH…SELECT catalogue probes. All
  // original caller payloads begin SELECT; no mutation plan is repeated here.
  const readOnly = readPlans.flat().every(sql => /^\s*(?:SELECT|WITH)\b/i.test(sql));
  check('role-only directory repeats only bounded read payloads without another provider page or role retry', hydrateCount === 2 && viewerGets === 7 && pageGets === 1 && readOnly, { hydrateCount, viewerGets, pageGets, statementCount: readPlans.flat().length });
  console.log('ROLE_ONLY_READ_BOUND ' + JSON.stringify({ batches: readPlans.length, statements: readPlans.flat().length, hydrateCount, viewerGets, pageGets, readOnly }));
  h.close();
  const g = await fixture();
  provider = async url => url.pathname === `/api/v10/guilds/${GUILD}/members/${TARGET}` ? answer(member()) : Promise.reject(Error('unexpected appointment provider route'));
  const appointed = Object.fromEntries(offices.OFFICE_APPOINTMENTS.map(o => [o.key, `<@${TARGET}>`]));
  const readsBefore = calls.length, prepared = await identities.prepareAppointmentPublication(g.env, appointed);
  check('every source catalogue office has canonical account publication with one GET per unique holder', prepared.ok && prepared.targets.length === offices.OFFICE_APPOINTMENTS.length && calls.length === readsBefore + 1 && prepared.stored.co_gm === `<@${TARGET}>` && prepared.stored.treasurer === `<@${TARGET}>`);
  check('every extended and native office requires explicit publication consent', ['office_01', 'office_95', 'rank_treasurer', 'officer'].every(key => !identities.appointmentPublicationConfirmation({ [key]: `<@${TARGET}>` }, {}) && identities.appointmentPublicationConfirmation({ [key]: `<@${TARGET}>` }, { appointedCharactersConfirmed: true })));
  await g.write("INSERT INTO site_settings(key,value,updated_at,updated_by)VALUES('appointed',?,?,?)", JSON.stringify(prepared.stored), T, ADMIN);
  const request = new Request('https://guild.example/api/appointed-identities', { headers: { Cookie: g.cookies.get(ADMIN) } });
  let rr = await identities.appointedIdentitiesPage(request, g.env), body = await rr.json();
  const allIdentities196=[...body.identities];let appointmentPages196=1;
  while(!body.complete && appointmentPages196<5){
    const continuation196=new Request('https://guild.example/api/appointed-identities?'+new URLSearchParams({after:body.nextCursor,revision:body.revision}),{headers:{Cookie:g.cookies.get(ADMIN)}});
    rr=await identities.appointedIdentitiesPage(continuation196,g.env);body=await rr.json();allIdentities196.push(...body.identities);appointmentPages196++;
  }
  check('extended office publication is no longer silently truncated at two rows', rr.status === 200 && body.complete && allIdentities196.length === offices.OFFICE_APPOINTMENTS.length && new Set(allIdentities196.map(o=>o.role)).size===offices.OFFICE_APPOINTMENTS.length && allIdentities196.some(o => o.role === 'office_95') && allIdentities196.some(o => o.role === 'rank_treasurer'));
  const own = await identities.ownAppointmentPublicationsStatement(g.env, TARGET).all();
  const copy = await identities.projectOwnAppointmentPublications(g.env, own.results);
  check('own account-copy projection covers all currently published office aliases without private proof bytes', copy.length === offices.OFFICE_APPOINTMENTS.length && !JSON.stringify(copy).includes('appointed_value') && !JSON.stringify(copy).includes(':publication:'));
  check('own-copy database payload does not duplicate the entire private appointment map per office', own.results.every(r => !Object.hasOwn(r, 'appointed_value') && !Object.hasOwn(r, 'generation')));
  check('Stream Shield and Town Crier derive from real published offices or admin, never a name heuristic', await identities.canUseStreamShield(g.env, TARGET) && await identities.canEditTownCrier(g.env, TARGET) && await identities.canUseStreamShield(g.env, ADMIN) && !await identities.canUseStreamShield(g.env, VIEWER));
  const authority = await identities.capturePublishedOfficeAuthority(g.env, TARGET, ['office_50']);
  const condition = identities.publishedOfficeAuthorityCondition(authority, 1);
  const permittedBefore = await g.DB.prepare(`SELECT (${condition.sql}) AS ok`).bind(...condition.values).first();
  await g.write("UPDATE site_settings SET value='{}' WHERE key='appointed'");
  const permittedAfter = await g.DB.prepare(`SELECT (${condition.sql}) AS ok`).bind(...condition.values).first();
  check('CMS office condition must still match the original entire map at commit', permittedBefore.ok === 1 && permittedAfter.ok === 0);
  let forged = false; try { identities.publishedOfficeAuthorityCondition({ officeKeys: ['office_50'] }, 1); } catch { forged = true; }
  check('a client-shaped office capability cannot mint a committing predicate', forged);
  const vip = await identities.prepareAppointmentPublication(g.env, { office_93: `<@${TARGET}>` });
  await g.write("UPDATE site_settings SET value=? WHERE key='appointed'", JSON.stringify(vip.stored));
  check('VIP alone does not acquire Broadcaster or Lead Correspondent controls', !await identities.canUseStreamShield(g.env, TARGET) && !await identities.canEditTownCrier(g.env, TARGET));
  await g.write('DELETE FROM site_users WHERE discord_id=?', TARGET);
  const discordOnly = await identities.prepareAppointmentPublication(g.env, appointed);
  await g.write("UPDATE site_settings SET value=? WHERE key='appointed'", JSON.stringify(discordOnly.stored));
  const beforeDiscordOnlyRead = calls.length;
  rr = await identities.appointedIdentitiesPage(request, g.env); body = await rr.json();
  const discordOnlyIdentities196=Array.isArray(body.identities)?[...body.identities]:[];
  const discordOnlyPages196=[{status:rr.status,count:discordOnlyIdentities196.length,memberGets:calls.length-beforeDiscordOnlyRead}];
  while(rr.status===200 && body.complete===false && discordOnlyPages196.length<5){
    const beforePage196=calls.length;
    const continuation196=new Request('https://guild.example/api/appointed-identities?'+new URLSearchParams({after:body.nextCursor,revision:body.revision}),{headers:{Cookie:g.cookies.get(ADMIN)}});
    rr=await identities.appointedIdentitiesPage(continuation196,g.env);body=await rr.json();
    const pageIdentities196=Array.isArray(body.identities)?body.identities:[];
    discordOnlyIdentities196.push(...pageIdentities196);
    discordOnlyPages196.push({status:rr.status,count:pageIdentities196.length,memberGets:calls.length-beforePage196});
  }
  check('Discord-only office aliases need one current lookup per holder per bounded page and never inherit private characters', rr.status === 200 && body.complete===true && discordOnlyIdentities196.length === offices.OFFICE_APPOINTMENTS.length && new Set(discordOnlyIdentities196.map(o=>o.role)).size===offices.OFFICE_APPOINTMENTS.length && JSON.stringify(discordOnlyPages196.map(p=>p.count))==='[32,32,32,32,3]' && discordOnlyPages196.every(p=>p.status===200&&p.memberGets===1) && calls.length === beforeDiscordOnlyRead + discordOnlyPages196.length && calls.slice(beforeDiscordOnlyRead).every(p=>p===`/api/v10/guilds/${GUILD}/members/${TARGET}`) && discordOnlyIdentities196.every(o => o.characters.length === 0) && !g.db.prepare('SELECT 1 FROM site_users WHERE discord_id=?').get(TARGET),discordOnlyPages196);
  console.log('DISCORD_ONLY_APPOINTMENT_PAGES196 '+JSON.stringify({pages:discordOnlyPages196,aliases:discordOnlyIdentities196.length,uniqueAliases:new Set(discordOnlyIdentities196.map(o=>o.role)).size,noPrivateCharacters:discordOnlyIdentities196.every(o=>o.characters.length===0)}));
  g.close();
  // New regression fixtures preserve the original Native writer and every prior check.
  T += 61; const labels = await fixture();
  const profiles = [
    ['beta-five',['Guild Master','Officer','Veteran','Member','Initiate']],
    ['ten-rank',['Guild Master','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate']],
    ['ten-rank-treasurer-v1',['Guild Master','Treasurer','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate']],
    ['ten-rank-council-treasurer-v1',['Guild Master','High Council','Treasurer','Officer','Raid Leader','Veteran','Raider','Member','Alt','Initiate']],
  ];
  for (const [profile,names] of profiles) {
    const ids=names.map((_,i)=>String(700000000000000100n+BigInt(i)));
    provider=async()=>answer(names.map((_,i)=>member(String(710000000000000100n+BigInt(i)),{user:{id:String(710000000000000100n+BigInt(i)),username:'native-'+i},roles:[ids[i]]})));
    const out=await labels.call(ADMIN,'',{QR_NATIVE_ROLE_MAP:JSON.stringify({profile,roles:ids})});
    check('every public directory ordinal is bound to exact '+profile+' names',out.status===200&&out.body.members.length===names.length&&out.body.members.every((m,i)=>m.roles.length===1&&m.roles[0]==='Olympus '+names[i]));
  }
  const legacyNames=['Guild Master','High Council','Officer','Officer Alt','Raid Leader','Veteran','Raider','Member','Alt','Initiate'],legacyIds=legacyNames.map((_,i)=>String(740000000000000100n+BigInt(i)));
  provider=async()=>answer(legacyNames.map((_,i)=>member(String(750000000000000100n+BigInt(i)),{user:{id:String(750000000000000100n+BigInt(i)),username:'historical-'+i},roles:[legacyIds[i]]})));
  const historical=await labels.call(ADMIN,'',{FULL_RELEASE_ROLES:JSON.stringify({version:1,epoch:'a'.repeat(32),epochStart:T-100,grants:false,membership:'740000000000000099',native:legacyIds})});
  check('legacy full-release native labels explicitly identify the historical ten-rank profile',historical.status===200&&historical.body.members.length===10&&historical.body.members.every((m,i)=>m.roles.length===1&&m.roles[0]==='Historical ten-rank profile — '+legacyNames[i]));
  const beforeUnknown=calls.length; const bad=await labels.call(ADMIN,'',{QR_NATIVE_ROLE_MAP:JSON.stringify({profile:'unknown-profile',roles:Array.from({length:10},(_,i)=>String(720000000000000100n+BigInt(i)))})});
  check('an unknown native profile fails closed before provider enumeration',bad.status===503&&calls.length===beforeUnknown&&!Object.hasOwn(bad.body,'members'));
  const attended=async(action,body,who=ADMIN,origin='https://guild.example')=>{const request=new Request('https://guild.example/api/admin/discord-directory/'+action,{method:'POST',headers:{Cookie:labels.cookies.get(who),Origin:origin,'X-Olympus':core.PAGE_VERSION}}),ctx=await context.communityContext(labels.env,request),response=await directory.discordDirectoryAttendedVisibility(request,labels.env,ctx,action,body);return{status:response.status,body:await response.json()};};
  const noAccount='730000000000000101',accountsBefore=labels.db.prepare('SELECT COUNT(*)AS n FROM site_users').get().n,networkBefore=calls.length;
  let hidden=await attended('visibility',{discordId:noAccount,listed:false,requestConfirmed:true});
  check('attended opt-out covers a Discord-only member without account or provider mutation',hidden.status===200&&hidden.body.listed===false&&calls.length===networkBefore&&labels.db.prepare('SELECT COUNT(*)AS n FROM site_users').get().n===accountsBefore&&!labels.db.prepare('SELECT 1 FROM site_users WHERE discord_id=?').get(noAccount));
  provider=async()=>answer([member(noAccount,{user:{id:noAccount,username:'never-registered'}})]);let out=await labels.call();
  check('attended marker suppresses the whole Discord-only row',out.status===200&&out.body.members.length===0);
  const noAccountPlan=context.communityExportPlan(labels.env,noAccount),noAccountCopy=noAccountPlan.shape(await labels.DB.batch(noAccountPlan.statements));check('Discord-only suppression exports independently of a site account row',noAccountCopy.discord_directory_visibility.optedOut===true);
  check('unconfirmed, non-admin and cross-origin attended changes are refused',(await attended('visibility',{discordId:noAccount,listed:true,requestConfirmed:false})).status===400&&(await attended('visibility',{discordId:noAccount,listed:true,requestConfirmed:true},VIEWER)).status===403&&(await attended('status',{discordId:noAccount},ADMIN,'https://other.example')).status===403);
  await attended('visibility',{discordId:TARGET,listed:false,requestConfirmed:true});const ownPlan=context.communityExportPlan(labels.env,TARGET),ownCopy=ownPlan.shape(await labels.DB.batch(ownPlan.statements));
  check('registered own copy recognizes the exact attended marker',ownCopy.discord_directory_visibility.optedOut===true);
  check('authenticated self listing can clear an earlier attended suppression',(await labels.visibility(TARGET,true)).body.listed===true);
  await attended('visibility',{discordId:TARGET,listed:false,requestConfirmed:true});await labels.DB.batch(context.communityEraseStatements(labels.env,TARGET));
  check('registered eraser removes only the current account marker while retaining another objector',!JSON.parse(labels.db.prepare("SELECT value FROM site_settings WHERE key='discordDirectoryHidden'").get().value)[TARGET]&&JSON.parse(labels.db.prepare("SELECT value FROM site_settings WHERE key='discordDirectoryHidden'").get().value)[noAccount]==='discord-only-optout-v1');
  labels.close();
  // A fresh world/window keeps these new preference controls independent of the
  // original attended rate-limit and lifecycle cases; no bucket is reset.
  T+=61;const preference=await fixture();
  const attendedPreference=async(action,body)=>{const request=new Request('https://guild.example/api/admin/discord-directory/'+action,{method:'POST',headers:{Cookie:preference.cookies.get(ADMIN),Origin:'https://guild.example','X-Olympus':core.PAGE_VERSION}}),ctx=await context.communityContext(preference.env,request),response=await directory.discordDirectoryAttendedVisibility(request,preference.env,ctx,action,body);return{status:response.status,body:await response.json()};};
  const auditRows=()=>preference.db.prepare("SELECT actor,subject,details FROM audit WHERE action='community.discord_directory_visibility' ORDER BY id").all();
  const targetBirth=preference.db.prepare('SELECT account_incarnation FROM site_users WHERE discord_id=?').get(TARGET).account_incarnation;
  let pref=await attendedPreference('status',{discordId:TARGET});
  check('default visibility explains preference erasure without exposing private lifecycle facts',pref.status===200&&pref.body.listed===true&&pref.body.visibilityOrigin==='default'&&pref.body.restoreAllowed===true&&pref.body.erasureNotice.includes('erasure deletes this preference')&&!JSON.stringify(pref.body).includes(targetBirth));
  await preference.visibility(TARGET,false);pref=await attendedPreference('status',{discordId:TARGET});
  check('admin status distinguishes a member-owned self-service hide',pref.status===200&&pref.body.listed===false&&pref.body.visibilityOrigin==='self_service'&&pref.body.restoreAllowed===false);
  const beforeRefusalAudit=auditRows().length;
  for(const listed of [false,true]){const refused=await attendedPreference('visibility',{discordId:TARGET,listed,requestConfirmed:true});check('attended '+(listed?'restore':'hide')+' cannot overwrite the current member-owned preference',refused.status===409&&refused.body.error==='visibility_owned_by_member'&&refused.body.visibilityOrigin==='self_service'&&refused.body.restoreAllowed===false);}
  check('refused attended changes preserve exact self marker and produce no success audit',JSON.parse(preference.db.prepare("SELECT value FROM site_settings WHERE key='discordDirectoryHidden'").get().value)[TARGET]===targetBirth&&auditRows().length===beforeRefusalAudit);
  check('the original member can still explicitly restore their own listing',(await preference.visibility(TARGET,true)).body.listed===true);
  pref=await attendedPreference('visibility',{discordId:TARGET,listed:false,requestConfirmed:true});
  const attendedAudit=auditRows().at(-1);
  check('explicit attended hide reports its origin and creates one atomic counts-only audit',pref.status===200&&pref.body.listed===false&&pref.body.visibilityOrigin==='attended_request'&&pref.body.restoreAllowed===true&&auditRows().length===beforeRefusalAudit+1&&attendedAudit.actor===ADMIN&&attendedAudit.subject===null&&attendedAudit.details===JSON.stringify({rows:1,listed:false,origin:'attended_request'})&&!attendedAudit.details.includes(TARGET));
  pref=await attendedPreference('visibility',{discordId:TARGET,listed:true,requestConfirmed:true});
  check('a confirmed attended restore removes only an attended marker and records the choice',pref.status===200&&pref.body.listed===true&&pref.body.visibilityOrigin==='default'&&auditRows().length===beforeRefusalAudit+2&&JSON.parse(auditRows().at(-1).details).listed===true);
  // The self write lands after the admin's admitted original-facts read but
  // before its mutation batch. The final marker CAS must refuse either action.
  for(const listed of [false,true]){
    await preference.visibility(TARGET,true);const count=auditRows().length;
    preference.beforeAttendedWrite(()=>preference.visibility(TARGET,false));
    const raced=await attendedPreference('visibility',{discordId:TARGET,listed,requestConfirmed:true});
    check('late self opt-out wins the attended '+(listed?'restore':'hide')+' marker CAS without a false audit',raced.status===409&&raced.body.error==='visibility_not_saved'&&JSON.parse(preference.db.prepare("SELECT value FROM site_settings WHERE key='discordDirectoryHidden'").get().value)[TARGET]===targetBirth&&auditRows().length===count);
  }
  await preference.DB.batch(context.communityEraseStatements(preference.env,TARGET));pref=await attendedPreference('status',{discordId:TARGET});
  check('erasure removes raw-ID preference rather than silently retaining a persistent suppression',pref.status===200&&pref.body.listed===true&&pref.body.visibilityOrigin==='default'&&!preference.db.prepare("SELECT value FROM site_settings WHERE key='discordDirectoryHidden'").get().value.includes(TARGET));
  preference.close();
  for(const scenario of ['already-retiring','already-retired','birth-replaced','absence-became-account','generation-replaced','revision-changed','job-started']) {
    T+=61;const race=await fixture(),target=scenario==='absence-became-account'?'730000000000000102':TARGET;
    const subject=()=>race.db.prepare('SELECT * FROM privacy_subjects WHERE subject_id=?').get(target);
    if(scenario==='already-retired'){
      // Coherent synthetic terminal state through the unchanged admitted writer;
      // the original CHECK and every trigger remain installed. Not an erasure receipt.
      await race.write("UPDATE privacy_subjects SET state='retired',erased_at=?1,retain_until=?2,updated_at=?1 WHERE subject_id=?3",T,T+31622400,target);
      const retired196=subject();
      check('retired-target fixture preserves original fixed366-day CHECK without bypass',retired196.state==='retired'&&retired196.erased_at===T&&retired196.retain_until===retired196.erased_at+31622400);
    }else if(scenario==='already-retiring')await race.write('UPDATE privacy_subjects SET state=? WHERE subject_id=?','retiring',target);
    else race.beforeAttendedWrite(async()=>{
      if(scenario==='birth-replaced'){await race.write('DELETE FROM site_users WHERE discord_id=?',target);await race.write('INSERT INTO site_users(discord_id,username,first_login,last_login,in_server,denied,account_incarnation)VALUES(?,?,?,?,1,0,?)',target,'recreated during request',T,T,'c'.repeat(32));}
      if(scenario==='absence-became-account')await race.write('INSERT INTO site_users(discord_id,username,first_login,last_login,in_server,denied,account_incarnation)VALUES(?,?,?,?,1,0,?)',target,'new during request',T,T,'c'.repeat(32));
      if(scenario==='generation-replaced')await race.write('UPDATE privacy_subjects SET generation=? WHERE subject_id=?','d'.repeat(32),target);
      if(scenario==='revision-changed')await race.write('UPDATE privacy_subjects SET revision=revision+1 WHERE subject_id=?',target);
      if(scenario==='job-started'){const p=subject(),u=race.db.prepare('SELECT * FROM site_users WHERE discord_id=?').get(target);await race.write("INSERT INTO privacy_serving_jobs(operation_id,subject_id,subject_generation,request_digest,original_session_version,original_session_expires,original_account_incarnation,state,created_at,retain_until)VALUES(?,?,?,?,?,?,?,'waiting_role',?,?)",'f'.repeat(32),target,p.generation,'e'.repeat(64),u.session_version,T+1000,u.account_incarnation,T,T+31622400);}
    });
    const request=new Request('https://guild.example/api/admin/discord-directory/visibility',{method:'POST',headers:{Cookie:race.cookies.get(ADMIN),Origin:'https://guild.example','X-Olympus':core.PAGE_VERSION}}),ctx=await context.communityContext(race.env,request),r=await directory.discordDirectoryAttendedVisibility(request,race.env,ctx,'visibility',{discordId:target,listed:false,requestConfirmed:true});
    const stored=race.db.prepare("SELECT value FROM site_settings WHERE key='discordDirectoryHidden'").get();
    check('attended target '+scenario+' cannot create or acknowledge a stale suppression',r.status===409&&(!stored||!Object.hasOwn(JSON.parse(stored.value),target)));
    race.close();
  }
  T += 61;
  // The unchanged expiry case above temporarily probed old+900 then restored T.
  // Its original per-reader rate bucket may therefore reset at old+960; start
  // this independent world after that real window without clearing counters or changing limits.
  const beforeScaleClock196=T;T=Math.max(T,old+directory.DISCORD_DIRECTORY_CURSOR_SECONDS+61);
  console.log('SYNTHETIC directory scale clock boundary '+JSON.stringify({before:beforeScaleClock196,after:T,originalExpiryProbe:old+directory.DISCORD_DIRECTORY_CURSOR_SECONDS,rateWindowSeconds:60,countersReset:false}));
  const scale = await fixture(), scaleStart=800000000000000000n;
  const allServer=Array.from({length:81000},(_,i)=>member(String(scaleStart+BigInt(i)),{user:{id:String(scaleStart+BigInt(i)),username:'server-'+i},roles:i%135===0?[MEMBER_ROLE]:[SECRET_ROLE]}));
  const scaleCalls=calls.length;provider=async url=>{if(url.searchParams.get('limit')!=='1000')throw Error('bounded1000 source page required');const after=BigInt(url.searchParams.get('after'));return answer(allServer.filter(m=>BigInt(m.user.id)>after).slice(0,1000));};
  let next='',pagesRead=0,seen=new Set();do{T+=2;const out=await scale.call(ADMIN,next);if(out.status!==200)throw Error('large traversal refused '+JSON.stringify(out.body));check('source1000 never expands captured/public output above100',out.body.members.length<=100);for(const m of out.body.members)seen.add(m.ref);pagesRead++;next=out.body.nextCursor;}while(next&&pagesRead<100);
  check('all600 Olympus holders across81000 server members fit original900second traversal',next===null&&seen.size===600&&pagesRead===82&&calls.length-scaleCalls===82);
  scale.close();
  console.log(`\n${pass}/${n} passed; unexpected outbound=${unexpectedNetwork}`);
  if (pass !== n || unexpectedNetwork) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
