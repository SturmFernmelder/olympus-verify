'use strict';
// Evergreen Stage 2 governance lane (12 Nov 2026): the reconciled R7 book and member-facing governance copy.
// Plain Node, no dependency. Usage: node tests/evergreen1112_governance_test.cjs [repository root]
// The optional root lets the same checks run read-only against the base tree (fail-before evidence).
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const bookBytes = fs.readFileSync(path.join(root, 'worker/public/static/governance/reconciled-book.md'));
const book = bookBytes.toString('utf8');
const app = read('worker/public/static/app.js');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const count = (hay, needle) => hay.split(needle).length - 1;
let failed = 0;
function check(id, name, ok, detail = '') {
  console.log((ok ? 'PASS ' : 'FAIL ') + id + ' ' + name + (ok || !detail ? '' : ' :: ' + detail));
  if (!ok) failed++;
}

// The reader's chapter model: "# " headings, exactly as app.js parseGovernanceBook slices them.
const chapters = [];
for (const line of book.split('\n')) {
  const m = /^# (.+)$/.exec(line);
  if (m) chapters.push({ title: m[1], lines: [] }); else if (chapters.length) chapters[chapters.length - 1].lines.push(line);
}
const chapter = title => { const c = chapters.find(x => x.title === title); return c ? c.lines.join('\n') : ''; };
const REGISTER = 'Source and Decision Register', NEWS = 'Daily Guild News';
// Member-facing articles: everything except the dated register and the archived first news issue.
const articles = chapters.filter(c => c.title !== REGISTER && c.title !== NEWS).map(c => c.lines.join('\n')).join('\n');
// Sections: "## " headings inside member-facing chapters, so a phrase can be located by its section heading.
const sections = [];
for (const c of chapters.filter(c => c.title !== REGISTER)) {
  let current = { heading: c.title, text: '' };
  sections.push(current);
  for (const line of c.lines) {
    if (/^## /.test(line)) { current = { heading: line.slice(3), text: '' }; sections.push(current); } else current.text += line + '\n';
  }
}

// ---------------------------------------------------------------- CL2-032 one full copy of each long block
const ERASURE = 'Live serving-account erasure is automatic in the Native operating mode.';
const ERASURE_TAIL = 'Unknown historical or mismatched recovery sources remain held, with no all-copy erasure claim.';
const RESET = 'The beta reset removes only the fixed beta membership and native-rank Discord roles.';
check('CL2-032', 'erasure paragraph appears once in the member-facing articles', count(articles, ERASURE) === 1 && count(articles, ERASURE_TAIL) === 1,
  `anchor ${count(articles, ERASURE)}, tail ${count(articles, ERASURE_TAIL)}`);
check('CL2-032', 'the Statute chapter carries the erasure paragraph once (Article S12)', count(chapter('The Guild Statute of Olympus'), ERASURE) === 1,
  'found ' + count(chapter('The Guild Statute of Olympus'), ERASURE));
check('CL2-032', 'beta-reset paragraph appears once in the member-facing articles (Charter 1.8)', count(articles, RESET) === 1 && count(chapter('1 Guild Charter of Olympus'), RESET) === 1,
  'found ' + count(articles, RESET));
check('CL2-032', 'S12a, ORD 15, S13 and ORD 18 point to the full text', /\| Erasure and safety marker \| Stated in full in \[Article S12\]\(#\/governance\/the-guild-statute-of-olympus\/article-s12\)/.test(book)
  && count(chapter('Book of Ordinances'), '](#/governance/the-guild-statute-of-olympus/article-s12)') >= 1
  && count(chapter('The Guild Statute of Olympus') + chapter('Book of Ordinances'), '[Charter section 1.8](#/governance/1-guild-charter-of-olympus)') === 2);
check('CL2-032', 'no long sentence (60+ characters) is repeated four or more times in the articles', (() => {
  const occ = new Map();
  for (const line of articles.split('\n')) for (const s of line.split(/(?<=[.;])\s+/)) if (s.trim().length >= 60) occ.set(s.trim(), (occ.get(s.trim()) || 0) + 1);
  return [...occ.values()].every(n => n < 4);
})());

// ---------------------------------------------------------------- CL2-038 one current Council composition
const superseded = ['four core portfolios', 'Maxran is the charted name', 'Akafoxslayer is the charted name', 'The core leadership Council consists of', 'Four core portfolios coordinate work'];
const outsideHistorical = superseded.flatMap(p => sections.filter(s => !/Historical/.test(s.heading) && (s.heading + '\n' + s.text).includes(p)).map(s => p + ' @ ' + s.heading));
check('CL2-038', 'superseded compositions occur only under a Historical heading', outsideHistorical.length === 0, outsideHistorical.join('; '));
check('CL2-038', 'Charter 1.5, Statute S5, O3 and RC2 state the current composition by reference to Section II.8.1',
  ['## 1.5 Departments and guild autonomy', '## Article S5 — Departments and shared services', '## O3 The High Council and its offices', '## RC2 The core Council and portfolio service']
    .every(h => { const s = sections.find(x => '## ' + x.heading === h); return s && /II\.8\.1|current Cabinet register/.test(s.text); }));
check('CL2-038', 'the thirteenth seat is named where the composition is stated', count(articles, 'with Systems & Heraldry as the thirteenth seat') >= 2);

// ---------------------------------------------------------------- CL2-033 no build numbers or environment flags as authority
const builds = (articles.match(/(?:Build )?(?<![\d.])\.(?:1\d\d|2\d\d)(?![\d])/g) || []);
const flags = (articles.match(/\b[A-Z]{3,}(?:_[A-Z]+)+(?:_\*|_ENABLED)?\b/g) || []);
check('CL2-033', 'member-facing articles cite no build number', builds.length === 0, builds.join(', '));
check('CL2-033', 'member-facing articles name no environment flag', flags.length === 0, flags.join(', '));

// ---------------------------------------------------------------- CL2-193 headings keep their numbering and commas
const badHeadings = book.split('\n').filter(l => /^#{2,3} /.test(l) && (/^## \d \d /.test(l) || / {2,}/.test(l)));
check('CL2-193', 'no heading lost its decimal point or commas', badHeadings.length === 0, badHeadings.slice(0, 4).join(' | '));

// ---------------------------------------------------------------- CL2-044 register and edition label
const register = chapter(REGISTER);
check('CL2-044', 'register records D19 (30 October 2026) and D20 (2 November 2026) from the owner instruction history',
  /^D19 [^\n]*— 30 October 2026\. [^\n]*owner instruction history\.$/m.test(register) && /^D20 [^\n]*— 2 November 2026\. [^\n]*owner instruction history\.$/m.test(register));
check('CL2-044', 'reader edition label points to the dated register', /Edition R7 • adopted 13 October 2026, with later owner decisions/.test(app) && app.includes('href: "#/governance/source-and-decision-register", text: "Source and Decision Register"'));

// ---------------------------------------------------------------- Invariants (pass on base and head)
// The decision register is the owner's record: every base paragraph stays verbatim.
const BASE_REGISTER = ['2182cf4a773f1ac3ab7613bfae8a632fd064e2ab677640c355f2de8091556da6', 'b25d026b011442c344937e97260bb6a141d6f27f0e870e6440fa6032357c49c7', '68071dfa14f60a1141827e857108b62cb7561ac7a6b6865f0b5b019b2e855fe4', 'be919dabc76978715b71c67198b07a48bfb71308fe369f81b9ecac5a216c8cb5', '16764f893fefc2dfbda76116b0b134416b962b1c76508cfca82438a179e3fd54', '2d5c1a5354e866fdca2fdd53765e52e730d4b16fe976981635f0d87c172ab6e1', '40440dea1b02876b313c157fb54b30f9b0e2279a77a5d4615c35167c4cb7ac89', '806051ed2f1afa5580eafb59ded461590a7591bcddf3716349ffd9339d79884f', 'd8841220198960a7a0503f3feefcf06fbba38ecab5b6d37275df18046c2c3970', '15e056ba251e014e71aacb5e4c15b4d0e5729ea9080ae11042fab3da1f5dfda2', '79dce62bb049de115277dcadb484a05bafbf199c0a6c952fa67c4806df90823d', '1a361b4a873888bb657dd47bbe6305c3cf91d5c7d284bab0d072dea72ebc8405', 'a4ad510f72f09f82c44020217a95a6c98091958ff6b40539b4a28d491253f5d5', '6df9c00ca99cd53632fa7a4a1e88ebe17b9954d908cd833eb9d1d96b0777037e', '279773d1865fc09655793d617d5440474a6111a8b2e06abbb0d4ba3ceec7dd41', '97bd08f3917d90933f857f3d0957a0269448e72ce57932e533aedbe69230b6b1', '46e42f4c963f2463a0eb7530ba75b289fbd8a58c4b2758d1beb132bc9bb196f5', '4f2cbe870f48750a73f57d7c047b39e8a5807053df59843b49e1c7a5d27bb666', '058771fad6a4a820a2175a5843f63530ac28d003c1c5ef7cec0c12ed1a57cffd'];
const headRegister = new Set(register.split('\n\n').map(p => p.trim()).filter(p => p && !p.startsWith('#')).map(p => sha256(p)));
check('invariant', 'every base decision-register paragraph is present verbatim', BASE_REGISTER.every(h => headRegister.has(h)), BASE_REGISTER.filter(h => !headRegister.has(h)).join(','));
// Named holders stay as they are.
for (const name of ['richwcampbell.', 'Fernmelder', 'Fern Melder', 'Maxran', 'Akafoxslayer', 'freejam / Nikola', 'Nomad', 'Kryptiiq', 'Asmon']) check('invariant', 'named holder still present: ' + name, book.includes(name));
// The reader's size and digest pins match the served bytes.
const model = JSON.parse(read('worker/public/static/governance/organization.json'));
const pinSha = (/const GOVERNANCE_SHA256 = "([a-f0-9]{64})"/.exec(app) || [])[1];
const pinBytes = Number((/const GOVERNANCE_BYTES = (\d+);/.exec(app) || /bytes\.length !== (\d+)\) throw new Error\("The R7 book/.exec(app) || [])[1]);
check('invariant', 'app.js and organization.json pin the served book', pinSha === sha256(bookBytes) && pinBytes === bookBytes.length && model.book.sha256 === pinSha && model.book.bytes === pinBytes,
  `book ${bookBytes.length}/${sha256(bookBytes).slice(0, 12)} app ${pinBytes}/${String(pinSha).slice(0, 12)} model ${model.book.bytes}/${model.book.sha256.slice(0, 12)}`);
check('invariant', 'the reader still finds 20 chapters opening with the reading guide', chapters.length === 20 && chapters[0].title === 'Reading and Adopting This Book');
// The editorial manifest (when present) removes no sentence that the book does not still state elsewhere.
const manifestPath = path.join(root, 'docs/governance-evergreen1112.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const lost = [];
  for (const c of manifest.changes.filter(c => c.issues.includes('CL2-032'))) {
    // Sentences only: headings are re-labelled and table cells are compared without their row label.
    const sentences = c.before.split('\n').filter(l => !l.startsWith('#'))
      .flatMap(l => l.replace(/^\|[^|]*\|\s*/, '').replace(/\s*\|\s*$/, '').split(/(?<=[.;])\s+/)).map(s => s.trim());
    for (const s of sentences.filter(s => s.length >= 40 && !c.after.includes(s))) if (!book.includes(s)) lost.push(c.key + ': ' + s.slice(0, 60));
  }
  check('invariant', 'every sentence the de-duplication removed is still in the book', lost.length === 0, lost.slice(0, 3).join(' | '));
  const gen = cp.spawnSync(process.execPath, [path.join(root, 'scripts/build-governance-titles.cjs'), '--check'], { encoding: 'utf8' });
  check('invariant', 'the governance Titles generator reproduces the committed book, charter and pins', gen.status === 0, (gen.stderr || '').split('\n').find(l => /Error/.test(l)) || '');
} else check('CL2-032', 'editorial manifest docs/governance-evergreen1112.json exists', false);

// ---------------------------------------------------------------- CL2-040 Member guide (source shape; the CDP check renders it)
const memberSteps = (() => { const i = app.indexOf('ROUTES.guide = '), j = app.indexOf('add(main, frame(officer ? "Officer Operational Guide"', i); const s = app.slice(i, j); return s.slice(s.indexOf('] : [')); })();
const stepTitles = [...memberSteps.matchAll(/^\s*\["([^"]+)", "/gm)].map(m => m[1]);
check('CL2-040', 'Member guide is a sequence of concrete steps with no stale launch step', stepTitles.length >= 7 && !stepTitles.includes('Prepare for Forever')
  && ['Sign in with Discord', 'Choose a role', 'Apply', 'Link your character', 'Manage your data'].every(t => stepTitles.includes(t)), stepTitles.join(' / '));
check('CL2-040', 'Member guide gives the real commands and routes', ['/verify', '/verify-status', 'one gold a week', '"#/apply"', '"#/verify"', '"/privacy/account"'].every(x => memberSteps.includes(x)));
check('CL2-040', 'Officer guide no longer opens a step with a bare negation', !app.includes('Only controls your account is actually allowed to use can perform an action.'));

// ---------------------------------------------------------------- CL2-045 Roles states its scope rule once, in one box
const chooser = (() => { const i = app.indexOf('const chooser = frame("Explore Olympus roles, ranks and titles"'); return app.slice(i, app.indexOf('chooser.id = "application-directory201"', i)); })();
check('CL2-045', 'the Roles chooser states the reserved-seat and no-access rule once, in one box',
  count(chooser, 'noticeBox(') === 1 && count(chooser, 'reservedNotice201') === 1 && count(chooser, 'role-scope218') === 1 && !chooser.includes('remain available. A rank, title or unfilled listing'));

const govHero = app.slice(app.indexOf('h("h1", { text: "The Governance of Olympus" })'), app.indexOf('h("nav", { class: "governance-quicklinks", "aria-label": "Start reading" }'));
check('CL2-045', 'the Governance page leaves the reserved-seat rule to the book (stated once)', govHero.length > 0 && !govHero.includes('reservedNotice201') && book.includes('Leader, High Council and Officer Corps seats are reserved appointments.'));

// ================================================================ part 2: structure, order, eligibility and access
// The real Worker sources, transpiled (the bounded qualification's own TypeScript), so these are behaviour checks on the
// served directory and the served public payload, not string matches. The browser checks are in the lane receipts.
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));
const loaded = {};
function load(name) {
  if (name.startsWith('node:')) return require(name);
  name = name.replace(/^\.\//, '');
  if (loaded[name]) return loaded[name].exports;
  const m = { exports: {} }; loaded[name] = m;
  const js = ts.transpileModule(read('worker/src/' + name + '.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', js)(m, m.exports, load);
  return m.exports;
}
const offices = load('governance-offices'), tracks = load('application-track199'), siteData = load('site-data');
const publicMeta = siteData.meta();
const dir = publicMeta.roleDirectory203, fam = key => dir.families.find(f => f.key === key);
const GROUPS = [['council', 'Sovereign & High Council'], ['officers', 'Officer Corps & Branch Command'], ['raid', 'Raid, PvP & Class Leadership'],
  ['workshop', 'Guild Workshop & Master Artisans'], ['members', 'Sworn Members, Raiders, Veterans, Alts & Initiates'], ['royal', 'Royal Patrons & Ceremonial Writs']];

// ---------------------------------------------------------------- CL2-034, CL2-214 one catalogue grouping and order
const groups = Array.isArray(dir.groups) ? dir.groups : [];
check('CL2-034', 'the served directory carries the directive\'s six catalogue groups in order', JSON.stringify(groups.map(g => [g.key, g.label])) === JSON.stringify(GROUPS), JSON.stringify(groups.map(g => g.key)));
const placed = groups.flatMap(g => g.familyKeys);
check('CL2-034', 'every role family is in exactly one group, and the family list is in group order', placed.length === dir.families.length && new Set(placed).size === placed.length
  && JSON.stringify(placed) === JSON.stringify(dir.families.map(f => f.key)) && dir.families.every(f => (groups.find(g => g.familyKeys.includes(f.key)) || {}).key === f.group));
check('CL2-034', 'Founder Recognition is in the same group on every surface (Royal Patrons)', (groups.find(g => g.key === 'royal') || { familyKeys: [] }).familyKeys.includes('founder'));
const rankFamilies = new Set(dir.ranks.map(r => r.familyKey));
const sortedBySlot = groups.length === 6 && groups.filter(g => g.key !== 'council').every(g => g.familyKeys.map(fam).every((f, i, all) => i === 0 || (all[i - 1].nativeSlot ?? 99) < (f.nativeSlot ?? 99)
  || (all[i - 1].nativeSlot ?? 99) === (f.nativeSlot ?? 99) && (rankFamilies.has(all[i - 1].key) || !rankFamilies.has(f.key))));
check('CL2-214', 'every non-Council group runs by native rank, the rank\'s own family first', sortedBySlot,
  groups.filter(g => g.key === 'members').map(g => g.familyKeys.map(k => k + ':' + fam(k)?.nativeSlot).join(' ')).join(''));

// ---------------------------------------------------------------- CL2-061, CL2-062 the High Council in protocol order
const councilFamilies = (groups.find(g => g.key === 'council') || { familyKeys: [] }).familyKeys;
check('CL2-061', 'the Council group opens with the Leader and the thirteen seats in protocol order', JSON.stringify(councilFamilies.slice(0, 14)) === JSON.stringify(['leader', ...offices.COUNCIL_FAMILY_ORDER]),
  councilFamilies.slice(0, 5).join(','));
const seedKeys = [...read('worker/src/site-role-directory203.ts').matchAll(/^\s+\{ key: '([a-z_]+)', label:/gm)].map(m => m[1]);
check('CL2-061', 'the directory\'s family seed order itself starts with the Leader and the seats in protocol order', JSON.stringify(seedKeys.slice(0, 14)) === JSON.stringify(['leader', ...offices.COUNCIL_FAMILY_ORDER]), seedKeys.slice(0, 4).join(','));

// ---------------------------------------------------------------- CL2-036 one eligibility rule: what the Worker accepts
const accepted = new Set();
for (const row of offices.OFFICE_APPOINTMENTS) for (const track of ['member', 'raider', 'artisan']) {
  const intent = tracks.validateApplicationIntent199(track, row.key, () => false);
  if (intent && !intent.error && !tracks.reservedApplication201({ applicationTrack: track, targetOffice: row.key })) accepted.add(track + '/' + row.key);
}
const offered = new Set(dir.families.flatMap(f => (f.applicationTargets || []).filter(t => t.targetOffice).map(t => t.applicationTrack + '/' + t.targetOffice)));
check('CL2-036', 'the directory offers exactly the office targets the Worker accepts', accepted.size > 0 && [...accepted].every(k => offered.has(k)) && [...offered].every(k => accepted.has(k)),
  'worker ' + [...accepted].join(',') + ' · directory ' + [...offered].join(','));
check('CL2-036', 'Core Raider (office_25) is an accepted Raider-track target and its family says so', accepted.has('raider/office_25') && fam('raid_standing')?.eligibility === 'open_application');
check('CL2-036', 'reserved leadership families have no target and the reserved eligibility', dir.families.filter(f => f.kind === 'role' && f.tier !== 'member_specialist').every(f => f.eligibility === 'reserved_seat' && f.applicationTargets.length === 0));
const orgView = read('worker/public/static/organization-view.js'), overview = read('worker/public/static/organization-overview205.js');
check('CL2-036', 'the register and the alliance overview read the directory rule, not term.applicationEligible or a second label set',
  !/t\.applicationEligible \?/.test(orgView) && /applicationTargets/.test(orgView) && !/"Role or voluntary activity"/.test(overview) && /eligibilityLabel/.test(overview) && /family\.applicationTargets/.test(app));

// ---------------------------------------------------------------- CL2-037 the Leader card opens with the Sovereign's guide
const leaderGuide = publicMeta.roleGuides201[fam('leader').primaryKey];
check('CL2-037', 'the Leader family\'s primary guide is the alliance Sovereign, not the branch Guild Master guide', !/leads an individual Olympus branch/.test(leaderGuide.definition) && /Sovereign/.test(leaderGuide.definition), leaderGuide.definition.slice(0, 60));

// ---------------------------------------------------------------- CL2-046 the Rosetta access column follows the .233 model
const canonical = load('canonical-ranks233').CANONICAL_RANKS233, treasury = load('site-treasury-access');
const ladder = offices.NATIVE_RANKS_199.map(r => r.nativeSlot === 0 ? 'Guild Master' : r.name);
const served = publicMeta.rankDiscordRoles1112;
check('CL2-046', 'the public payload names one canonical Discord role per rank, from CANONICAL_RANKS233', !!served && served.ranks.length === 10
  && served.ranks.every((r, slot) => r.nativeSlot === slot && canonical.some(c => c.name === r.roleName)) && new Set(served.ranks.map(r => r.roleName)).size === 10 && served.ranks[0].roleName === 'Olympus Guild Master');
check('CL2-046', 'the Treasury-plan flag per rank equals the Worker\'s officerRank gate', !!served && served.ranks.every((r, slot) => r.treasuryPlan === treasury.officerRank(ladder[slot], slot, ladder)));
check('CL2-046', 'the Rosetta no longer prints the pre-.233 access text', !app.includes('Olympus Guild Member after verification') && !app.includes('Olympus Guild Leader;') && app.includes('rankDiscordRoles1112'));

// ---------------------------------------------------------------- CL2-196 rank-planner links land on their rank
check('CL2-196', 'rank-planner links use the SPA route and the planner scrolls to the prefixed rank id', !app.includes('"/admin/ranks#current-rank-"') && app.includes('"#/admin/ranks/" + (slot + 1)') && app.includes('"#rank-planner-current-rank-" + rankAnchor'));

console.log(failed ? failed + ' check(s) failed' : 'all checks passed');
process.exit(failed ? 1 : 0);
