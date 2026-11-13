'use strict';
// Evergreen Stage 2 governance lane (12 Nov 2026): the reconciled R7 book and member-facing governance copy.
// Plain Node, no dependency. Usage: node tests/evergreen1112_governance_test.cjs [repository root] [--base <harness> --cdp <port>]
// The optional root lets the same checks run read-only against the base tree (fail-before evidence). With --base and
// --cdp the follow-up browser checks (INT-GOV-1, REV-GOV-5, REV-GOV-6) also run against a local QA harness.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process');
const argv = process.argv.slice(2), flag = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const root = path.resolve(argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--'))) || path.join(__dirname, '..', '..'));
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
  && count(chapter('The Guild Statute of Olympus') + chapter('Book of Ordinances'), '[Charter section 1.8](#/governance/1-guild-charter-of-olympus/section-1-8-continuity-amendment-and-adoption)') === 2);
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
// REV-GOV-4 (CL2-038): O15 is labelled as the dated 13 October 2026 record; its holder text is byte-identical to 1e51050.
const o15 = sections.find(s => /^O15 /.test(s.heading)) || { heading: '', text: '' };
check('REV-GOV-4', 'O15 is headed as a Historical record dated 13 October 2026 and points to Section II.8.1', /^O15 Historical: .*13 October 2026$/.test(o15.heading)
  && /dated record: the current High Council seats and their duties are set out in Title II, Section II\.8\.1\./.test(o15.text), o15.heading);
const o15Holders = (() => { const i = book.indexOf('\n## O15 '), j = book.indexOf('\n# ', i); const s = i < 0 ? '' : book.slice(i, j); return s.slice(s.indexOf('\n### ')); })();
check('REV-GOV-4', 'the O15 holder text (four portfolios and shared rules) is unchanged', sha256(o15Holders) === 'bafe40b3e088047f639364d04901488046a65c69047927087e5f368be3dc6b13', sha256(o15Holders).slice(0, 12));
const charterO15 = read('worker/public/static/governance/operational-charter.md').split('\n').find(l => /^## O15 /.test(l)) || '';
check('REV-GOV-4', 'the standalone operational charter carries the same O15 heading', charterO15 === '## ' + o15.heading, charterO15);

// ---------------------------------------------------------------- REV-GOV-2 a dated record of the 12 November reconciliation
const readingGuide = chapter('Reading and Adopting This Book');
const reconciled = (/On 12 November 2026 the text was editorially reconciled[^\n]*?restored exactly\./.exec(readingGuide) || [''])[0];
// Round 3 item 6c shortened the record to plain sentences inside the 18 October paragraph; round 4 item 5 makes it its own
// paragraph through a manifest pair that spans the 18 October paragraph and the next one whole.
const reconciledWords = reconciled.split(/\s+/).filter(Boolean).length, reconciledSentences = reconciled.split(/(?<=\.)\s+(?=[A-Z])/).length;
check('REV-GOV-2', 'the reading guide records the 12 November 2026 reconciliation in two or three dated sentences of at most 70 words', !!reconciled && reconciledSentences >= 2 && reconciledSentences <= 3 && reconciledWords <= 70,
  reconciledWords + ' words, ' + reconciledSentences + ' sentence(s)');
check('REV-GOV-2', 'the record names every kind of change and what did not change',
  ['cross-references', 'Council compositions', 'build numbers', 'headings', 'duel-escrow clauses', 'suspended proposal', 'tithe tiers',
    'No rule, amount, eligibility condition, decision or named holder changed', 'editorial manifest'].every(x => reconciled.includes(x)), reconciled.slice(0, 80));
// R4-GOV-5: the 18 October paragraph carries only its own clarification; the 12 November record is the next paragraph,
// and it is the whole of that paragraph.
{
  const paras = readingGuide.split('\n\n').map(p => p.trim());
  const at = paras.findIndex(p => p.startsWith('**Operative clarification · 18 October 2026.**'));
  const own = paras[at] || '', following = paras[at + 1] || '';
  check('R4-GOV-5', 'the 12 November 2026 record is its own paragraph right after the 18 October clarification, which no longer contains it',
    at >= 0 && !own.includes('12 November') && following === reconciled && following.startsWith('On 12 November 2026 '),
    JSON.stringify({ octoberHas12Nov: own.includes('12 November'), next: following.slice(0, 60) }));
}

// ---------------------------------------------------------------- REV-GOV-3 every in-book section link lands on a generated id
// The ids exactly as app.js parseGovernanceBook and governanceBlocks generate them.
const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const anchors = new Map();
{ const usedChapters = new Set(); let keys = null;
  for (const line of book.split('\n')) {
    const top = /^# (.+)$/.exec(line);
    if (top) { const stem = slug(top[1]); let id = stem, n = 2; while (usedChapters.has(id)) id = stem + '-' + n++; usedChapters.add(id); anchors.set(id, keys = new Set()); continue; }
    const hd = keys && /^(#{2,6}) (.+)$/.exec(line);
    if (!hd) continue;
    const article = /^Article ([IVXS0-9.a-z]+)(?= )/.exec(hd[2]);
    let key = article ? 'article-' + article[1].toLowerCase().replaceAll('.', '-') : (hd[1].length < 4 ? 'section-' + slug(hd[2]).slice(0, 60) : '');
    if (key && keys.has(key)) { let n = 2; while (keys.has(key + '-' + n)) n++; key += '-' + n; }
    if (key) keys.add(key);
  } }
const bookLinks = [...book.matchAll(/\]\(#\/governance\/([^)\s/]+)(?:\/([^)\s]+))?\)/g)].map(m => ({ chapter: m[1], key: m[2] || '' }));
const dangling = bookLinks.filter(l => !anchors.has(l.chapter) || (l.key && !anchors.get(l.chapter).has(l.key)));
check('REV-GOV-3', 'every governance link in the book names an existing chapter and, when it names one, an existing section id', bookLinks.length > 0 && dangling.length === 0, JSON.stringify(dangling.slice(0, 3)));
const charter18 = bookLinks.filter(l => l.chapter === '1-guild-charter-of-olympus' && book.includes('[Charter section 1.8](#/governance/' + l.chapter + (l.key ? '/' + l.key : '') + ')'));
check('REV-GOV-3', 'both "Charter section 1.8" links (S13, ORD 18) name the generated 1.8 section id, not the chapter top',
  charter18.length === 2 && charter18.every(l => l.key === 'section-1-8-continuity-amendment-and-adoption') && anchors.get('1-guild-charter-of-olympus').has('section-1-8-continuity-amendment-and-adoption'), JSON.stringify(charter18));

// ---------------------------------------------------------------- CONTENT-07 three colour roles and two ceremonial titles
// The tiers as worker/src/treasury-cosmetic.ts defines them: the book must group them the same way.
const tierSource = read('worker/src/treasury-cosmetic.ts');
const tiers = [...tierSource.matchAll(/\{ key: '([a-zA-Z]+)', label: '([^']+)', copper: (\d+), ceremonial: (true|false) \}/g)].map(m => ({ key: m[1], label: m[2], gold: Number(m[3]) / 10000, ceremonial: m[4] === 'true' }));
const capKey = (/tierInfo\?\.ceremonial \? '([a-zA-Z]+)'/.exec(tierSource) || [])[1];
const capTier = tiers.find(t => t.key === capKey);
const sectionText = (from, to) => { const i = book.indexOf(from), j = book.indexOf(to, i); return i < 0 || j < 0 ? '' : book.slice(i, j); };
const s41 = sectionText('### Section III.4.1 ', '### Section III.4.2 '), s42 = sectionText('### Section III.4.2 ', '## Article III.5 ');
const tierList = list => list.map(t => `**${t.label} — ${t.gold.toLocaleString('en-GB')} gold**`);
const colour = tiers.filter(t => !t.ceremonial), ceremonial = tiers.filter(t => t.ceremonial);
const colourSentence = (/Three tiers are Discord colour roles: ([^.]+)\./.exec(s41) || [])[1] || '';
const ceremonialSentence = (/Two tiers are attended ceremonial titles with no Discord role of their own: ([^.]+?)(?:, the capped Patron tier)?\./.exec(s41) || [])[1] || '';
check('CONTENT-07', 'the code still defines three colour-role tiers and two ceremonial tiers capped at one colour', colour.length === 3 && ceremonial.length === 2 && !!capTier && !capTier.ceremonial, JSON.stringify(tiers.map(t => t.key + ':' + t.ceremonial)));
check('CONTENT-07', 'III.4.1 lists exactly the colour-role tiers as Discord colour roles, with their thresholds', tierList(colour).every(x => colourSentence.includes(x)) && !tierList(ceremonial).some(x => colourSentence.includes(x)), colourSentence.slice(0, 120));
check('CONTENT-07', 'III.4.1 lists exactly the ceremonial tiers as attended ceremonial titles, with their thresholds', tierList(ceremonial).every(x => ceremonialSentence.includes(x)) && !tierList(colour).some(x => ceremonialSentence.includes(x)), ceremonialSentence.slice(0, 120));
check('CONTENT-07', 'III.4.1 caps a ceremonial title at the colour the code caps it at', !!capTier && s41.includes('A member who qualifies for a ceremonial title is shown at most the ' + capTier.label + ' colour.'));
check('CONTENT-07', 'III.4 no longer calls every tier a Cosmetic Tithe Role or all recognition colour only', !s41.includes('Cosmetic Tithe Roles recognise') && !/colour only/.test(s41 + s42));
check('CONTENT-07', 'expiry, consent, zero authority and the dispatch-off gate are still stated', s41.includes("An award expires at that season's end") && s42.includes('A member may decline public recognition without losing credit or standing.')
  && s42.includes('it gives no channels, native rank, Council seat or vote, bank right') && s42.includes('All cosmetic-dispatch controls remain absent or off until separately authorized and configured.'));

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

// ---------------------------------------------------------------- RC-038 (owner ruling of 13 Nov 2026, "Keep 13 seats")
// Section II.1.1(b) must list the twelve portfolios exactly as the role directory and organization.json define them
// (the Council order without the Co-Guild Master), with the Co-Guild Master as the seat beside them, not a portfolio.
const s111b = book.split('\n').find(l => l.startsWith('(b) High Council Roles concern the competent Leader')) || '';
const remitNames = ((/with their distinct ([^.;]+?) remits as individually warranted/.exec(s111b) || [])[1] || '').split(', ').flatMap(x => x.split(' and '));
const portfolioKeys = offices.COUNCIL_FAMILY_ORDER.filter(k => k !== 'co_gm');
const modelPortfolios = JSON.parse(read('worker/public/static/governance/organization.json')).councilComposition.currentSeats.filter(s => s.id !== 'gm-chair' && s.id !== 'co-gm').map(s => s.familyKey);
const remitFamily = name => { const hits = portfolioKeys.filter(k => fam(k).label.includes(name === 'Treasury' ? 'Treasurer' : name)); return hits.length === 1 ? hits[0] : '?' + name; };
check('RC-038', 'Section II.1.1(b) names the twelve Council portfolios of the directory and organization.json, in their order, with the Co-Guild Master beside them',
  portfolioKeys.length === 12 && JSON.stringify(modelPortfolios) === JSON.stringify(portfolioKeys) && JSON.stringify(remitNames.map(remitFamily)) === JSON.stringify(portfolioKeys)
  && /the twelve current portfolios enumerated in Article II\.8/.test(s111b) && /the Co-Guild Master sits beside them with the executive coordination remit\./.test(s111b), remitNames.join(' | '));

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
// REV-GOV-1: every branch Guild Master holds Rank 1, so the in-game Rank 1 guide stays the branch Guild Master's guide.
const rankOneGuide = publicMeta.roleGuides201.rank_guild_master || { definition: '' };
check('REV-GOV-1', 'the Rank 1 (Leader) guide describes a Guild Master leading a branch, not the Sovereign',
  /^A Guild Master leads an individual Olympus branch/.test(rankOneGuide.definition) && !/Sovereign/.test(rankOneGuide.definition)
  && rankOneGuide.nativeRankOrdinal === 1 && JSON.stringify(rankOneGuide.responsibilities) === JSON.stringify(publicMeta.roleGuides201.office_43.responsibilities), rankOneGuide.definition.slice(0, 60));
check('REV-GOV-1', 'every native-rank guide carries the text of its rank\'s own source office', ['office_43', 'office_45', 'office_62', 'office_63', 'office_74', 'office_90', 'office_75', 'office_55', 'office_04', 'office_48']
  .every((key, slot) => { const r = publicMeta.roleGuides201['rank_' + ['guild_master', 'high_council', 'officer', 'officer_alt', 'raid_leader', 'veteran', 'raider', 'member', 'alt', 'initiate'][slot]]; return r && r.definition === publicMeta.roleGuides201[key].definition; }));

// REV-GOV-1 at the source (round 3 item 6a): the editorial pass is the last rule. A spy on the pass shows roleGuides201
// returns exactly what the pass produced (no later override replaces editorial text for the ten ranks), and the pass
// itself gives Rank 1 the branch Guild Master's guide.
{
  const editorial = load('site-role-editorial219'), guideModule = load('site-role-guides201'), real = editorial.editorialRoleGuides219;
  let produced = null;
  editorial.editorialRoleGuides219 = (...args) => (produced = real(...args));
  let served = null;
  try { served = guideModule.roleGuides201(siteData.POSITIONS); } finally { editorial.editorialRoleGuides219 = real; }
  check('REV-GOV-1', 'the editorial pass is the only rule: roleGuides201 returns its output unchanged, and that output gives Rank 1 the office_43 guide',
    !!produced && served === produced && produced.rank_guild_master.definition === produced.office_43.definition && produced.rank_guild_master.definition !== produced.office_81.definition);
}

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

// ---------------------------------------------------------------- INT-GOV-1 (CL2-100) per-chapter and per-card link rows are groups
// The browser count is CL2-100 in evergreen1112_siteui-b_test.cjs; this pins the source shape the count depends on.
check('INT-GOV-1', 'each governance chapter\'s "On this page" list is a labelled group, not a nav landmark',
  /jumpList1112\(sectionHeadings\.map\([^\n]*\), "Sections of " \+ chapter\.title\)/.test(app) && /h\(groupLabel \? "div" : "nav", \{[^\n]*role: "group"/.test(app));
check('INT-GOV-1', '/#/organization keeps one resources nav; its card link rows are labelled groups', count(orgView, 'h("nav"') === 1 && count(overview, 'h("nav"') === 0
  && orgView.includes('role: "group", "aria-label": "Ordinary applications"') && overview.includes('role: "group", "aria-label": "Continue exploring the Alliance"'));

// ---------------------------------------------------------------- REV-GOV-5 ordering (source shape; the browser order is in the receipt)
// Behaviour precondition from the served directory: the class leads and Class Head share the Class Leadership family,
// and the Vice Guild Master is a Co-GM family source whose family primary is a Council seat.
check('REV-GOV-5', 'the nine class leads and the Class Head share the Class Leadership family', dir.keyToFamily['office_17'] === 'class_leadership'
  && Object.keys(dir.keyToFamily).filter(k => k.startsWith('class_lead:')).length === 9 && Object.keys(dir.keyToFamily).filter(k => k.startsWith('class_lead:')).every(k => dir.keyToFamily[k] === 'class_leadership'));
check('REV-GOV-5', 'the vote board inserts the class leads right after their family\'s last general ballot', /ballots\.map\(\(b\) => familyFor\(b\)\?\.key\)\.lastIndexOf\(home\)/.test(app) && /ballots\.splice\(after < 0 \? ballots\.length : after \+ 1, 0, \.\.\.mine\)/.test(app));
check('REV-GOV-5', 'the register sorts a Council alias right after its family\'s seat (Vice Guild Master after Co-GM)', dir.keyToFamily['office_92'] === 'co_gm' && fam('co_gm').primaryKey === 'office_19'
  && /const familySeat = family\?\.group === "council" \? seatKeys1112\.indexOf\(family\.primaryKey\) : -1;/.test(orgView) && /return 1e4 \+ familySeat \+ 0\.1 \+ t\.ordinal \/ 1e4;/.test(orgView));

// ================================================================ round 5 (owner rulings of 13 Nov 2026, about 12:15 UTC)
// ---------------------------------------------------------------- CL2-039 organization chart: placement and reporting only
{
  const nodeOf = id => model.nodes.find(n => n.id === id) || {};
  const exec = nodeOf('executive'), founder = nodeOf('founder'), justiciar = nodeOf('justiciar'), justice = nodeOf('justice');
  const seatOf = id => (model.councilComposition.currentSeats.find(s => s.id === id) || {});
  check('CL2-039', 'the Co-Guild Master node sits in the top tier beside the Guild Master (both chart roots, joined by a coordination line)',
    founder.parent === null && exec.parent === null && (exec.coordinates || []).includes('founder') && seatOf('gm-chair').nodeId === 'founder' && seatOf('co-gm').nodeId === 'executive',
    JSON.stringify({ executiveParent: exec.parent, coordinates: exec.coordinates }));
  check('CL2-039', 'the Lord High Justiciar has its own node that reports directly to both top-tier offices',
    justiciar.parent === 'founder' && JSON.stringify(justiciar.alsoReportsTo) === '["executive"]' && justiciar.relation === 'accountability'
    && seatOf('head-justice').nodeId === 'justiciar' && (model.terms.find(t => t.officeKey === 'office_101') || {}).nodeId === 'justiciar'
    && model.officeMandates.filter(o => o.nodeId === 'justiciar').map(o => o.title).join('|') === 'Lord High Justiciar · Minister of Justice & The Privy Court',
    JSON.stringify({ justiciar: justiciar.id || null, seat: seatOf('head-justice').nodeId }));
  check('CL2-039', 'the Court branch (Council of Justice) hangs under the Justiciar and keeps its independent-review relation',
    justice.parent === 'justiciar' && justice.relation === 'independence' && (model.terms.find(t => t.officeKey === 'office_26') || {}).nodeId === 'justice'
    && /Council of Justice/.test(justiciar.remit || '') && /Stockades & Court of Appeals/.test(justiciar.remit || ''), JSON.stringify({ justiceParent: justice.parent }));
  // Not covered by the ruling, so identical to b631136: seats (labels, families, office keys, order), the 13-seat count,
  // every term except its node, appointments, application tracks and the native ranks. No person's name in the model.
  const digest = v => sha256(JSON.stringify(v));
  check('CL2-039', 'seats, seat numbers, office keys, terms, appointments and application tracks are unchanged; the model names no person',
    digest(model.councilComposition.currentSeats.map(({ nodeId, ...s }) => s)) === 'eb27436254d4efeeae741b062683a6103fe1ef28e243006ceb766c267272ebdb'
    && digest(model.terms.map(({ nodeId, ...t }) => t)) === 'd80b5f7e7763858a2614fc77a9dbd821442167d0a2629896f6b836cdc634da68'
    && digest([model.appointments, model.applicationTracks, model.roleRank199, model.nativeRanks]) === '6d20757dc440a3292dc462594c00a927b2f99056670ad1d05accf13e64533c34'
    && model.councilComposition.cabinetSeatCount === 13 && model.cabinet218.seatCount === 13 && !/richwcampbell/i.test(JSON.stringify(model)));
  // Every current seat except the Council chair sits on the node of its own office (the chair's office_43 placement is the
  // separate open question on the branch Guild Master term, not covered by this ruling).
  const misplaced = model.councilComposition.currentSeats.filter(s => s.id !== 'gm-chair' && (model.terms.find(t => t.officeKey === s.officeKeys[0]) || {}).nodeId !== s.nodeId).map(s => s.id);
  check('CL2-039', 'every Council seat but the chair is placed on the node of its own office', misplaced.length === 0, misplaced.join(','));
  check('CL2-039', 'the model has a dated record of every placement change, so the earlier edition is recoverable', (() => {
    const r = model.reportingLines1113; if (!r || r.recordedAt !== '2026-11-13' || !Array.isArray(r.changes)) return false;
    const has = (k, v, f, a) => r.changes.some(c => c[k] === v && c.field === f && JSON.stringify(c.after) === JSON.stringify(a));
    return has('nodeId', 'executive', 'parent', null) && has('nodeId', 'executive', 'coordinates', ['founder']) && has('nodeId', 'justice', 'parent', 'justiciar')
      && has('term', 'office_101', 'nodeId', 'justiciar') && has('councilSeat', 'head-justice', 'nodeId', 'justiciar') && r.changes.some(c => c.nodeId === 'justiciar' && c.before === null);
  })());
  const chartText = chapter('Revised Organisation Chart');
  check('CL2-039', 'the book\'s chart chapter states the same lines: top tier, the Justiciar reporting to both, the Court under it',
    chartText.includes('The Guild Master, as Sovereign, and the Co-Guild Master form the top tier.')
    && chartText.includes('The Lord High Justiciar sits in the High Council Cabinet, reports directly to the Guild Master and the Co-Guild Master, and oversees the Court branch: the Council of Justice and the Stockades & Court of Appeals.')
    && !chartText.includes('Justice handles cases independently.'), chartText.slice(0, 80));
  check('CL2-039', 'the overview states the same line and lists the Justiciar seat under Justice & independent review',
    overview.includes('The Lord High Justiciar holds the individual High Council portfolio, reports directly to the Guild Master and the Co-Guild Master, and oversees the Court branch')
    && overview.includes('councilReferences("justiciar")') && !overview.includes('councilReferences("justice")'));
  check('CL2-039', 'the page refuses a model whose second reporting authority is unknown, itself or its own parent',
    /n\.alsoReportsTo !== undefined && \(!Array\.isArray\(n\.alsoReportsTo\) \|\| n\.alsoReportsTo\.some\(\(id\) => !ids\.has\(id\) \|\| id === n\.id \|\| id === n\.parent\)\)/.test(app));
  // Review of f443043 (13 Nov 2026), LOW 1: the shared executive node took the Vice Guild Master and the Deputy into the
  // top tier with it. Only the Co-Guild Master moves; the other two keep their place below the Guild Master.
  const vice = nodeOf('vice-guild-master'), termsOn = id => model.terms.filter(t => t.nodeId === id).map(t => t.officeKey).join(',');
  check('CL2-039', 'only the Co-Guild Master is in the top tier: the Vice Guild Master and the Deputy stay below the Guild Master, the Chief of Staff keeps its line to the Co-GM',
    termsOn('executive') === 'office_19' && model.officeMandates.filter(o => o.nodeId === 'executive').map(o => o.title).join('|') === 'Co-Guild Master'
    && vice.parent === 'founder' && vice.relation === 'coordination' && termsOn('vice-guild-master') === 'office_29,office_92'
    && model.officeMandates.filter(o => o.nodeId === 'vice-guild-master').map(o => o.title).join('|') === 'Vice Guild Master'
    && exec.title === 'Co-Guild Master and Vice Guild Master' && nodeOf('staff').parent === 'executive' && model.nodes.filter(n => n.parent === null && n.relation !== 'classification').map(n => n.id).join(',') === 'founder,executive',
    JSON.stringify({ executive: termsOn('executive'), vice: vice.parent || null, viceTerms: termsOn('vice-guild-master') }));
  // Review HIGH: the dated record is an exact finite delta. Undoing it gives back the b631136 model byte for byte (the book
  // pin aside, which follows the book), so the historical graph, term and mandate inverses of governance_test.cjs can run
  // on the earlier edition. Every way of breaking the record or the model must refuse or change the result.
  const BASE_MODEL1113 = 'af1f62cd8ca391277abbbad1f8c92f925a851077068c65653c36ab729e48ad9e';
  const restore = (() => { try { return require(path.join(root, 'scripts/build-governance-titles.cjs')).restoreReportingLines1113; } catch { return undefined; } })();
  const restoredDigest = m => { try { return sha256(JSON.stringify({ ...restore(m), book: null })); } catch (error) { return 'refused: ' + error.message; } };
  check('CL2-039', 'undoing reportingLines1113 restores the b631136 organization model exactly (book pin aside)', typeof restore === 'function' && restoredDigest(model) === BASE_MODEL1113,
    typeof restore === 'function' ? restoredDigest(model) : 'no restoreReportingLines1113 export');
  if (typeof restore === 'function') {
    const mutate = fn => { const m = structuredClone(model); fn(m); return restoredDigest(m); };
    const find = (m, id) => m.nodes.find(n => n.id === id);
    const cases = {
      'changed after (an added node differs)': m => { find(m, 'justiciar').alsoReportsTo = ['council']; },
      'current value differs from the recorded after': m => { m.terms.find(t => t.officeKey === 'office_101').nodeId = 'justice'; },
      'a declaration removed': m => { m.reportingLines1113.changes = m.reportingLines1113.changes.filter(c => c.term !== 'office_92'); },
      'a declaration duplicated': m => { m.reportingLines1113.changes.push(structuredClone(m.reportingLines1113.changes[0])); },
      'an undeclared change to another node': m => { find(m, 'staff').parent = 'founder'; },
      'an unknown kind of change': m => { m.reportingLines1113.changes.push({ guide: 'x', field: 'nodeId', before: 'a', after: 'b' }); },
      'a leftover reference to a removed node': m => { find(m, 'tactical').coordinates.push('vice-guild-master'); },
      'the record missing': m => { delete m.reportingLines1113; },
    };
    const outcomes = Object.fromEntries(Object.entries(cases).map(([name, fn]) => [name, mutate(fn)]));
    check('CL2-039', 'the inverse refuses or changes its result for every broken record or undeclared model change', Object.values(outcomes).every(d => d !== BASE_MODEL1113),
      JSON.stringify(Object.entries(outcomes).filter(([, d]) => d === BASE_MODEL1113).map(([k]) => k)));
  }
  // Review LOW 3: one name for the top tier. The Council node and Section II.8.1(a) name the Co-GM's top-tier place too.
  check('CL2-039', 'the High Council node and Section II.8.1(a) place the Co-Guild Master in the top tier beside the Guild Master',
    nodeOf('council').limits.includes('The Co-Guild Master sits beside the Guild Master in the top tier and serves on the Council alongside twelve portfolios.')
    && count(book, '(a) The Guild Master chairs the High Council. The Co-Guild Master sits beside the Guild Master in the top tier and serves alongside twelve numbered portfolios') === 1
    && read('docs/master199-governance-titles.md').includes('The Co-Guild Master sits beside the Guild Master in the top tier and serves alongside twelve numbered portfolios'));
}
// Review LOW 6 (13 Nov 2026): the page's own model loader, run on mutated models, refuses a bad second reporting authority.
async function loaderChecks1113() {
  const from = app.indexOf('  async function publicGovernanceBytes('), to = app.indexOf('  const governanceSlug = ');
  const constants = ['GOVERNANCE_BOOK', 'GOVERNANCE_MODEL', 'GOVERNANCE_SHA256', 'GOVERNANCE_BYTES'].map(name => (new RegExp('  const ' + name + ' = [^;]+;').exec(app) || [''])[0]).join('\n');
  const run = async m => {
    const bytes = Buffer.from(JSON.stringify(m));
    const fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) });
    const make = new Function('fetch', 'TextDecoder', constants + '\nconst own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);\nlet governanceBookPromise = null, governanceModelPromise = null;\n' + app.slice(from, to) + '\nreturn governanceModel;');
    try { await make(fetch, TextDecoder)(); return 'accepted'; } catch (error) { return error.message; }
  };
  const variant = fn => { const m = structuredClone(model); fn(m.nodes.find(n => n.id === 'justiciar') || m.nodes[1]); return m; };
  const got = {
    current: await run(model),
    unknown: await run(variant(n => { n.alsoReportsTo = ['no-such-office']; })),
    self: await run(variant(n => { n.alsoReportsTo = [n.id]; })),
    parent: await run(variant(n => { n.alsoReportsTo = [n.parent]; })),
    notList: await run(variant(n => { n.alsoReportsTo = 'executive'; })),
  };
  const refused = 'The organization model has an invalid relation.';
  check('CL2-039', 'the page loader accepts the served model and refuses an alsoReportsTo that is unknown, itself, its own parent or not a list',
    from > 0 && to > from && got.current === 'accepted' && ['unknown', 'self', 'parent', 'notList'].every(k => got[k] === refused), JSON.stringify(got));
}

// ---------------------------------------------------------------- CL2-291 three paused services carry one exact status
const PAUSED1113 = 'Paused / Inactive Statutory Proposal (Not Active in Current Build)';
const PAUSED_KEYS1113 = ['bifrost_writ', 'attunement_charter', 'trial_memorial_writ'];
// A mention of one of the three by any of the names the surfaces use.
const PAUSED_NAMES1113 = [/Bifrost|summoning pass/i, /attunement (?:&|or|and) dungeon|dungeon[- ]service charter/i, /Hall of Fame|trial\/memorial|Priority (?:trial )?reviews?\b/i];
const PAUSED_NAME1113 = new RegExp(PAUSED_NAMES1113.map(r => r.source).join('|'), 'i');
// One unit of text (a paragraph, a table row, a card) that names k of the three carries the label exactly k times; a unit
// that names none of them carries no label.
function pausedUnits1113(units) {
  const bad = [];
  for (const u of units) { const named = PAUSED_NAMES1113.filter(r => r.test(u)).length; if (count(u, PAUSED1113) !== named) bad.push(named + '/' + count(u, PAUSED1113) + ' ' + u.slice(0, 70)); }
  return { bad, labelled: units.filter(u => u.includes(PAUSED1113)).length, mentioned: units.filter(u => PAUSED_NAME1113.test(u)).length };
}
{
  const writs = load('royal-writs199');
  const rows = writs.ROYAL_WRITS || [];
  const withStatus = rows.filter(r => r.status !== undefined).map(r => r.key);
  check('CL2-291', 'exactly the Bifrost pass, the attunement charter and the trial memorial writ carry the status, character for character',
    JSON.stringify(withStatus) === JSON.stringify(PAUSED_KEYS1113) && PAUSED_KEYS1113.every(k => rows.find(r => r.key === k).status === PAUSED1113), withStatus.join(','));
  check('CL2-291', 'the label appears on no other writ, the policy, the categories or the checklist',
    rows.filter(r => !PAUSED_KEYS1113.includes(r.key)).every(r => !JSON.stringify(r).includes(PAUSED1113))
    && ![writs.ROYAL_WRIT_POLICY, writs.ROYAL_WRIT_CATEGORIES, writs.STOCKADES_CHECKLIST].some(v => JSON.stringify(v).includes(PAUSED1113)));
  const three = PAUSED_KEYS1113.map(k => rows.find(r => r.key === k) || {});
  check('CL2-291', 'none of the three reads as something to buy, request or that is running',
    three.every(r => !/— proposal$/.test(r.label || '') && /^Nothing can be bought or requested/.test(r.limits || '') && !/quote required|published refund terms|need separate approval/i.test(JSON.stringify(r))
      && r.enabled === false && r.forecastGold === 0 && r.activation === 'unqualified-proposal'), JSON.stringify(three.map(r => r.limits && r.limits.slice(0, 40))));
  // Review LOW 5 (13 Nov 2026): the card line is "<price> · <term>" with the page's own price function; it says
  // "Proposed" once ("Proposed price: 25–75g · Proposed 25g/week ..." said it twice).
  const priceSource = (/\n    const price = row => [^\n]+;\n/.exec(app) || [''])[0];
  const priceOf = priceSource ? new Function(priceSource + 'return price;')() : null;
  const lines = three.map(r => priceOf ? priceOf(r) + ' · ' + r.term : '');
  check('CL2-291', 'each of the three cards says "Proposed" once in its price line', !!priceOf && lines.every(l => count(l, 'Proposed') === 1), JSON.stringify(lines));
  // Not covered (wagering, lottery and "subject to Blizzard policy" services): byte-identical to b631136.
  check('CL2-291', 'the wagering, lottery and other service entries and the policy texts are unchanged',
    sha256(JSON.stringify(rows.filter(r => !PAUSED_KEYS1113.includes(r.key)))) === '58fe3baace7f921e11234fb9d7a8b95402a95809c57ba4b3eba977f1c8c447e8'
    && sha256(JSON.stringify([writs.ROYAL_WRIT_POLICY, writs.ROYAL_WRIT_CATEGORIES, writs.STOCKADES_CHECKLIST])) === 'b229559dca0701625fef2c5c6b02e9c9e1eb7ec8542c3e47b6fd90e8edd7ceb4');
  // The book and the titles document: every paragraph that mentions one of the three carries the label before it.
  const bookUnits = book.split('\n\n').filter(p => !p.startsWith('#'));
  const titlesUnits = read('docs/master199-governance-titles.md').split('\n\n').filter(p => !p.startsWith('#'));
  const b = pausedUnits1113(bookUnits), t = pausedUnits1113(titlesUnits);
  check('CL2-291', 'governance book: each paragraph naming one of the three carries the label once per service named, and no other paragraph carries it', b.bad.length === 0 && b.labelled === 2 && b.mentioned === 2, JSON.stringify(b));
  check('CL2-291', 'titles document: the same', t.bad.length === 0 && t.labelled === 2 && t.mentioned === 2, JSON.stringify(t));
  check('CL2-291', 'the book and the titles document carry the label three times each (Bifrost, attunement, trial memorial)', count(book, PAUSED1113) === 3 && count(read('docs/master199-governance-titles.md'), PAUSED1113) === 3);
}
async function treasuryPlanChecks1113() {
  const os = require('node:os'), { pathToFileURL } = require('node:url');
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'plan1113-')), 'plan.mjs');
  fs.writeFileSync(tmp, read('worker/public/static/treasury-plan-content207.js'));
  const { TREASURY_PLAN207 } = await import(pathToFileURL(tmp).href);
  // Every string the renderer shows: chapter intros, headings, paragraphs, list items and each table row joined.
  const units = [];
  const walk = v => { if (typeof v === 'string') units.push(v); else if (Array.isArray(v)) { if (v.every(x => typeof x === 'string') && v.length > 1 && v.length <= 4 && v.some(x => PAUSED_NAME1113.test(x) || x.includes(PAUSED1113))) units.push(v.join(' | ')); else v.forEach(walk); } else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(TREASURY_PLAN207.chapters);
  const r = pausedUnits1113(units);
  check('CL2-291', 'treasury plan content: every row or paragraph that mentions the three carries the label, and the label marks nothing else', r.bad.length === 0 && r.labelled === 4 && r.mentioned === 4, JSON.stringify(r));
}

// ================================================================ browser checks (only with --base and --cdp)
// The follow-up items of 12 Nov 2026, measured in headless Edge through the audit CDP helper against a harness serving
// the tree under test. Numbers are printed with every check.
async function browserChecks(BASE, CDP_PORT) {
  const os = require('node:os');
  const H = await import('file:///C:/Users/vikto/olympus-claude-candidates/audit279/tools/cdp.mjs');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-edge-'));
  const cdp = await H.launch({ port: CDP_PORT, profile });
  const st = await H.instrument(cdp);
  let persona = '';
  const open = async (who, width, route, height = 800) => {
    await H.viewport(cdp, width, height);
    if (who !== persona) { await cdp.send('Page.navigate', { url: `${BASE}/__qa/${who}` }); await H.idle(st); persona = who; }
    await cdp.send('Page.navigate', { url: `${BASE}/#/${route}` }); await H.idle(st);
    await cdp.send('Page.reload', {}); await H.idle(st); await H.sleep(900);
  };
  const ev = expr => cdp.eval(`(async()=>{${expr}})()`);
  const show = value => JSON.stringify(value);
  // Browser checks print their measurement on PASS too, so the receipts carry numbers.
  const bcheck = (id, name, ok, detail) => { check(id, name, ok, detail); if (ok) console.log('     ' + detail); };
  try {
    // Round 5 (13 Nov 2026): --round5 runs only the CL2-039 and CL2-291 browser checks.
    await round5Checks({ open, ev, show, bcheck });
    if (argv.includes('--round5')) { if (st.exceptions.length) bcheck('PAGE', 'no page exceptions during the browser checks', false, show(st.exceptions.slice(0, 3))); return; }
    await round4Checks({ open, ev, show, bcheck, cdp, H });
    if (argv.includes('--round4')) { if (st.exceptions.length) bcheck('PAGE', 'no page exceptions during the browser checks', false, show(st.exceptions.slice(0, 3))); return; }
    // INT-GOV-1 (CL2-100): navigation landmarks are the site menu and one page-contents list; per-chapter rows are groups.
    const navs = {};
    for (const width of [1280, 375]) for (const route of ['governance', 'roles', 'organization']) {
      await open('member', width, route);
      navs[route + '@' + width] = await ev(`const g=[...document.querySelectorAll('main [role=group].page-jump-list1112')];return {nav:document.querySelectorAll('nav').length,groups:g.length,unnamed:g.filter(x=>!x.getAttribute('aria-label')).length}`);
    }
    bcheck('INT-GOV-1', 'at 1280 and 375 px: Governance at most 8 nav landmarks, Roles at most 6, Organization at most 4',
      [1280, 375].every(w => navs['governance@' + w].nav <= 8 && navs['roles@' + w].nav <= 6 && navs['organization@' + w].nav <= 4), show(navs));
    bcheck('INT-GOV-1', 'the chapter "On this page" lists are named groups (each chapter keeps its list)', [1280, 375].every(w => navs['governance@' + w].groups >= 10 && navs['governance@' + w].unnamed === 0), show(navs['governance@1280']));
    const jump = await (async () => { await open('member', 1280, 'governance/1-guild-charter-of-olympus');
      return ev(`const g=document.querySelector('#chapter-1-guild-charter-of-olympus [role=group].page-jump-list1112');if(!g)return null;const b=g.querySelector('button');b.focus();b.click();await new Promise(r=>setTimeout(r,400));return {label:g.getAttribute('aria-label'),focused:document.activeElement.textContent===b.textContent&&document.activeElement!==b}`); })();
    bcheck('INT-GOV-1', 'a chapter group button still moves focus to its section', !!jump && jump.focused && /^Sections of /.test(jump.label), show(jump));

    // REV-GOV-3: following "Charter section 1.8" from S13 and from ORD 18 lands on the 1.8 heading itself, at 1280 and 375 px.
    const landings = {};
    for (const width of [1280, 375]) for (const [from, route] of [['S13', 'governance/the-guild-statute-of-olympus/article-s13'], ['ORD18', 'governance/book-of-ordinances']]) {
      await open('member', width, route);
      landings[from + '@' + width] = await ev(`const a=[...document.querySelectorAll('main a')].find(x=>x.textContent==='Charter section 1.8'&&x.closest('${from === 'S13' ? '#chapter-the-guild-statute-of-olympus' : '#chapter-book-of-ordinances'}'));if(!a)return null;a.click();await new Promise(r=>setTimeout(r,2500));const f=document.activeElement,r=f.getBoundingClientRect();return {hash:location.hash,focused:f.id||f.tagName,text:(f.textContent||'').slice(0,48),top:Math.round(r.top),inView:r.top>=0&&r.bottom<=innerHeight}`);
    }
    bcheck('REV-GOV-3', 'from S13 and ORD 18 the "Charter section 1.8" link focuses the 1.8 heading in view (1280 and 375 px)',
      Object.values(landings).every(l => l && l.focused === 'governance-1-guild-charter-of-olympus-section-1-8-continuity-amendment-and-adoption' && l.inView), show(landings));

    // REV-GOV-5: class leads follow Class Head on the vote board; Vice Guild Master sits after Co-GM in the register.
    await open('member', 1280, 'vote');
    const ballots = await ev(`return [...document.querySelectorAll('nav.role-list a.role-item')].map(a=>decodeURIComponent(a.getAttribute('href').slice(7)))`);
    const head = ballots.indexOf('office_17');
    bcheck('REV-GOV-5', 'the nine class-lead ballots come right after the Class Head ballot', head >= 0 && ballots.slice(head + 1, head + 10).every(k => k.startsWith('class_lead:')) && ballots.filter(k => k.startsWith('class_lead:')).length === 9,
      show(ballots.slice(Math.max(0, head - 1), head + 12)));
    await open('member', 1280, 'organization');
    const register = await ev(`const s=document.querySelector('.org-office-tier-group[data-catalog-group=council]');return s?[...s.querySelectorAll(':scope > ul > li')].map(li=>li.getAttribute('data-office-key')||li.dataset.officeKey||''):[]`);
    bcheck('REV-GOV-5', 'in the register\'s Council group the Vice Guild Master (office_92) follows the Co-GM (office_19)', register.indexOf('office_92') === register.indexOf('office_19') + 1 && register.indexOf('office_19') >= 0, show(register.slice(0, 8)));

    // REV-GOV-6 (a): no layout shift above 0.1 on first paint at 1440 px.
    const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__ls1112=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__ls1112.push(e.value)}).observe({type:"layout-shift",buffered:true})}catch(e){}' });
    await open('member', 1440, 'organization', 900); await H.sleep(1500);
    const cls = await ev(`return Math.round(window.__ls1112.reduce((a,v)=>a+v,0)*10000)/10000`);
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    bcheck('REV-GOV-6', '/#/organization at 1440 px: cumulative layout shift on first paint below 0.1', cls < 0.1, show({ cls }));
    // (b) the long disclosures start closed below 1024 px, so the page is short at 768 px; open at 1280.
    const heights = {};
    for (const width of [1280, 768]) { await open('member', width, 'organization', 1024);
      heights[width] = await ev(`const g=[...document.querySelectorAll('.org-alliance-group1112')];return {height:document.documentElement.scrollHeight,groups:g.length,open:g.filter(d=>d.open).length,over:document.documentElement.scrollWidth-document.documentElement.clientWidth}`); }
    bcheck('REV-GOV-6', 'at 768 px the alliance groups start closed and the page is under 8,000 px; at 1280 px they start open',
      heights[768].open === 0 && heights[768].groups > 0 && heights[768].height < 8000 && heights[768].over <= 0 && heights[1280].open === heights[1280].groups, show(heights));
    // (c) on phones the opened chart shows the selected office and its first children.
    const charts = {};
    for (const width of [390, 320]) { await open('member', width, 'organization', 800);
      charts[width] = await ev(`const m=document.querySelector('.org-relationship-map205');m.open=true;await new Promise(r=>setTimeout(r,800));const vp=document.querySelector('.org-viewport').getBoundingClientRect();const cards=[...document.querySelectorAll('.org-stage .org-node')].filter(b=>!b.hidden);const inside=b=>{const r=b.getBoundingClientRect();return r.left>=vp.left-1&&r.right<=vp.right+1&&r.top>=vp.top-1&&r.bottom<=vp.bottom+1};const sel=cards.find(b=>b.getAttribute('aria-pressed')==='true');const vis=cards.filter(inside);return {shown:cards.length,visible:vis.length,selectedVisible:!!sel&&inside(sel),below:!!sel&&vis.some(b=>b.getBoundingClientRect().top>sel.getBoundingClientRect().bottom),over:document.documentElement.scrollWidth-document.documentElement.clientWidth}`); }
    bcheck('REV-GOV-6', 'at 390 and 320 px the opened chart shows the selected office and at least two more offices, children below it, with no page overflow',
      [390, 320].every(w => charts[w].selectedVisible && charts[w].below && charts[w].visible >= 3 && charts[w].over <= 0), show(charts));
    // ================= round 3 (12 Nov 2026)
    // RC-037: the Raid Leader and Raid Assist cards keep every family-guide line the regional sheet lacks verbatim, once,
    // and every line of the shared regional sheet, once.
    const guides = publicMeta.roleGuides201;
    for (const [familyKey, primaryKey, regionKey] of [['raid_assist', 'office_73', 'raid_assist_na'], ['raid_leader', 'office_74', 'raid_leader_na']]) {
      const sheet = [...guides[regionKey].responsibilities, ...guides[regionKey].expectations];
      const own = [...guides[primaryKey].responsibilities, ...guides[primaryKey].expectations].filter(text => !sheet.includes(text));
      const seenCounts = {};
      for (const width of [1280, 375]) {
        await open('member', width, 'roles/' + familyKey);
        seenCounts[width] = await ev(`const card=document.querySelector('[data-role-family203=${familyKey}]');if(!card)return null;card.open=true;const items=[...card.querySelectorAll('li')].map(li=>li.textContent.trim());const n=t=>items.filter(x=>x===t).length;return {own:${JSON.stringify(own)}.map(n),sheet:${JSON.stringify(sheet)}.map(n),over:document.documentElement.scrollWidth-document.documentElement.clientWidth}`);
      }
      bcheck('RC-037', `/#/roles/${familyKey} shows each of the ${own.length} ${primaryKey} lines missing from the regional sheet once, and each regional line once (1280 and 375 px)`,
        own.length > 0 && Object.values(seenCounts).every(c => c && c.own.every(x => x === 1) && c.sheet.every(x => x === 1) && c.over <= 0), show(seenCounts));
    }
    // RC-199: every stored key appears in its rank's Rosetta row as its own labelled register link with its department.
    const expectedByRank = {};
    for (const row of offices.OFFICE_APPOINTMENTS) (expectedByRank[row.nativeRankOrdinal] ||= []).push(row.key);
    const rosetta = {};
    for (const width of [1280, 375]) {
      await open('member', width, 'roles/rosetta-stone');
      rosetta[width] = await ev(`const panel=document.getElementById('role-rosetta-stone');if(!panel)return null;panel.open=true;for(const d of panel.querySelectorAll('details'))d.open=true;const out={};for(const tr of panel.querySelectorAll('tr[data-rank-crosswalk]')){out[tr.dataset.rankCrosswalk]=[...tr.querySelectorAll('li[data-rosetta-key1112]')].map(li=>{const a=li.querySelector(':scope > a');return {key:li.dataset.rosettaKey1112,href:a&&a.getAttribute('href'),label:a&&a.textContent.trim(),scope:li.textContent.slice(a?a.textContent.length:0).replace(/^\\s*·\\s*/,'').trim()}})};return {rows:out,over:document.documentElement.scrollWidth-document.documentElement.clientWidth}`);
    }
    const rosettaOk = w => { const r = rosetta[w]; return !!r && r.over <= 0 && Object.entries(expectedByRank).every(([rank, keys]) => { const got = r.rows[rank] || [];
      return keys.every(k => got.filter(x => x.key === k && x.href === '#/organization/' + encodeURIComponent(k) && x.label && x.scope.length > 3).length === 1); }); };
    bcheck('RC-199', 'each of the 139 stored keys has its own labelled #/organization link with its department under its rank (1280 and 375 px)', [1280, 375].every(rosettaOk),
      show({ office_28: (rosetta[1280]?.rows['2'] || []).find(x => x.key === 'office_28'), office_57: (rosetta[1280]?.rows['2'] || []).find(x => x.key === 'office_57'), keys1280: Object.values(rosetta[1280]?.rows || {}).flat().length, over: [rosetta[1280]?.over, rosetta[375]?.over] }));
    // RC-034: the overview lists branch roles under their department lane and under independent review, as links.
    await open('member', 1280, 'organization', 900);
    const contextLinks = await ev(`const out={};for(const box of document.querySelectorAll('[data-alliance-context1112]'))out[box.dataset.allianceContext1112]=[...box.querySelectorAll('a')].map(a=>a.getAttribute('href').slice(8));return out`);
    bcheck('RC-034', '/#/organization shows the war, artisanry, propaganda and systems lanes and independent review with links to their role families',
      ['war', 'artisanry', 'propaganda', 'systems', 'independent'].every(k => (contextLinks[k] || []).length > 0) && contextLinks.independent.includes('bank_auditor') && contextLinks.war.includes('chief_strategist'), show(contextLinks));
    // Review item 6b: the "Ordinary applications" links and the chart summary are at least 44 px tall at every width.
    const targets = {};
    for (const width of [1440, 1280, 768, 390, 375, 320]) {
      await open('member', width, 'organization', 900);
      targets[width] = await ev(`const links=[...document.querySelectorAll('[role=group][aria-label="Ordinary applications"] a')];const s=document.querySelector('.org-relationship-map205 > summary');return {links:links.length,minLink:links.length?Math.min(...links.map(a=>Math.round(a.getBoundingClientRect().height))):0,summary:s?Math.round(s.getBoundingClientRect().height):0,over:document.documentElement.scrollWidth-document.documentElement.clientWidth}`);
    }
    bcheck('REV-6b', '"Ordinary applications" links and the "Organization chart" summary are at least 44 px tall at 1440, 1280, 768, 390, 375 and 320 px, with no page overflow',
      Object.values(targets).every(t => t.links > 0 && t.minLink >= 44 && t.summary >= 44 && t.over <= 0), show(targets));
    if (st.exceptions.length) bcheck('PAGE', 'no page exceptions during the browser checks', false, show(st.exceptions.slice(0, 3)));
  } finally { await Promise.race([cdp.close(), H.sleep(2000)]); try { if (cdp.proc.exitCode === null) cdp.proc.kill(); } catch { /* already gone */ } try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Edge may still hold the profile. */ } }
}

// ================================================================ round 5 browser checks (13 Nov 2026)
async function round5Checks({ open, ev, show, bcheck }) {
  // CL2-039: the inspector and the List (the chart's text alternative) say the same placement at all six widths.
  const SEATS = { justiciar: 'Lord High Justiciar · Minister of Justice & The Privy Court', executive: 'Hand of the Sovereign · Co-Guild Master', justice: 'Council of Justice', founder: 'Founder and Patron', 'vice-guild-master': 'Vice Guild Master', staff: 'Chief of Staff' };
  // Review of f443043, LOW 3: the top tier is named as the overview and the book name it; LOW 1: the Vice Guild Master
  // stays below the Guild Master and the Chief of Staff keeps its line to the Co-GM card, both as on b631136.
  const GM = 'the Guild Master (Founder and Patron)', CO = 'the Co-Guild Master';
  const EXPECT = {
    justiciar: { inspector: `Accountable to the top tier: ${GM} and ${CO}.`, list: `accountability: ${GM} and ${CO}` },
    executive: { inspector: `Top tier, beside ${GM}; no reporting parent in this model.`, list: `Top tier, beside ${GM}` },
    founder: { inspector: `Top tier, beside ${CO}; no reporting parent in this model.`, list: `Top tier, beside ${CO}` },
    justice: { inspector: `Independent review remit connected to: ${SEATS.justiciar}.`, list: `independence: ${SEATS.justiciar}` },
    'vice-guild-master': { inspector: `Coordinates through: ${SEATS.founder}.`, list: `coordination: ${SEATS.founder}` },
    staff: { inspector: `Coordinates through: ${SEATS.executive}.`, list: `coordination: ${SEATS.executive}` },
  };
  const READ = `const m=document.querySelector('.org-relationship-map205');if(m)m.open=true;await new Promise(r=>setTimeout(r,700));
    const rel=document.querySelector('.org-inspector .org-relation');const list={};
    for(const row of document.querySelectorAll('.org-list-row')){const t=row.querySelector('.org-list-title strong')?.textContent;const p=row.querySelector(':scope > p.small');if(t)list[t]=p&&p.textContent}
    return {inspector:rel&&rel.textContent,list,over:document.documentElement.scrollWidth-document.documentElement.clientWidth}`;
  const seen = {}, wrong = [];
  for (const width of [1440, 1280, 768, 390, 375, 320]) for (const id of Object.keys(EXPECT)) {
    if (width !== 1280 && id !== 'justiciar') continue;
    await open('member', width, 'organization/' + id, 900);
    const got = seen[id + '@' + width] = await ev(READ);
    if (!got || got.inspector !== EXPECT[id].inspector || got.over > 0) wrong.push(id + '@' + width + ' ' + show(got && { inspector: got.inspector, over: got.over }));
    for (const [key, want] of Object.entries(EXPECT)) if (got && got.list[SEATS[key]] !== want.list) wrong.push(id + '@' + width + ' list ' + key + ' ' + show(got.list[SEATS[key]]));
  }
  bcheck('CL2-039', 'inspector and List give the same placement: Justiciar accountable to both top-tier offices, Co-GM and Guild Master side by side, Court under the Justiciar (1440 to 320 px, no overflow)',
    wrong.length === 0, wrong.length ? wrong.slice(0, 4).join(' | ') : show({ justiciar1280: seen['justiciar@1280'].inspector, over: Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.over])) }));
  // The full map: the top tier shares a column, the Justiciar is in the Cabinet column with the portfolios, the Court is
  // one column further, and the lines run from the Justiciar to both top-tier offices.
  await open('member', 1440, 'organization', 900);
  const map = await ev(`const m=document.querySelector('.org-relationship-map205');m.open=true;await new Promise(r=>setTimeout(r,500));
    [...document.querySelectorAll('.org-chart-tools button')].find(b=>b.textContent==='Full map').click();await new Promise(r=>setTimeout(r,500));
    const left=id=>{const b=document.querySelector('[data-organization-node="'+id+'"]');return b&&!b.hidden?parseFloat(b.style.left):null};
    const top=id=>{const b=document.querySelector('[data-organization-node="'+id+'"]');return b?parseFloat(b.style.top):null};
    const edges=[...document.querySelectorAll('path.org-edge')].filter(p=>p.style.display!=='none').map(p=>p.getAttribute('data-from')+'>'+p.getAttribute('data-to')+':'+[...p.classList].find(c=>c.startsWith('org-edge-')&&c!=='org-edge-active'));
    return {left:Object.fromEntries(['founder','executive','vice-guild-master','council','treasury','justiciar','justice'].map(id=>[id,left(id)])),top:{founder:top('founder'),executive:top('executive')},edges:edges.filter(e=>/justic|executive>|>executive/.test(e))}`);
  const L = map.left;
  bcheck('CL2-039', 'full map: Guild Master and Co-GM in the top column, the Justiciar in the Cabinet column, the Court beyond it, lines to both top-tier offices',
    L.founder !== null && L.founder === L.executive && L['vice-guild-master'] > L.founder && map.top.executive > map.top.founder && L.justiciar === L.treasury && L.council < L.justiciar && L.justice > L.justiciar
    && ['justiciar>founder:org-edge-accountability', 'justiciar>executive:org-edge-accountability', 'justice>justiciar:org-edge-independence', 'executive>founder:org-edge-coordination'].every(e => map.edges.includes(e)), show(map));
  // The Justiciar's branch shows both authorities it reports to (wide: one column; phone: stacked above it) and the Court.
  const branches = {};
  for (const width of [1280, 390]) {
    await open('member', width, 'organization/justiciar', 900);
    branches[width] = await ev(`const m=document.querySelector('.org-relationship-map205');m.open=true;await new Promise(r=>setTimeout(r,800));
      const cards=[...document.querySelectorAll('.org-stage .org-node')].filter(b=>!b.hidden).map(b=>({id:b.dataset.organizationNode,x:parseFloat(b.style.left),y:parseFloat(b.style.top)}));return cards`);
  }
  const at = (w, id) => branches[w].find(c => c.id === id) || {};
  bcheck('CL2-039', 'the Justiciar branch shows the Guild Master and the Co-GM it reports to and the Court under it (1280 px columns, 390 px stacked)',
    at(1280, 'founder').x === at(1280, 'executive').x && at(1280, 'founder').x < at(1280, 'justiciar').x && at(1280, 'justiciar').x < at(1280, 'justice').x
    && JSON.stringify(branches[390].slice().sort((a, b) => a.y - b.y).map(c => c.id).slice(0, 4)) === '["founder","executive","justiciar","justice"]', show(branches));
  await open('member', 1280, 'organization', 900);
  const independent = await ev(`const s=document.querySelector('.org-alliance-independent');return s?{text:s.querySelector('p').textContent,seat:!!s.querySelector('a[data-council-reference206="head-justice"]'),chair:[...document.querySelectorAll('[data-council-seat206]')].slice(0,2).map(li=>li.querySelector('small').textContent)}:null`);
  bcheck('CL2-039', 'the alliance overview says the same: the Justiciar reports to the Guild Master and the Co-GM, its seat is listed under Justice, and the chair and Co-GM are the top tier',
    !!independent && independent.text.includes('reports directly to the Guild Master and the Co-Guild Master, and oversees the Court branch') && independent.seat
    && JSON.stringify(independent.chair) === JSON.stringify(['Council chair · top tier · Rank 1 Leader', 'Co-Guild Master · top tier · Rank 2 High Council']), show(independent));

  // CL2-291: with the schedule switched on, every rendered card, table row or paragraph that names one of the three carries
  // the status exactly once per service named, and nothing else carries it.
  const setWrits = on => ev(`const r=await fetch('/api/admin/settings',{method:'PUT',credentials:'same-origin',headers:{'X-Olympus':'2','Content-Type':'application/json'},body:JSON.stringify({royalWritsOn:${on}})});return r.status`);
  await open('owner', 1280, 'admin');
  const switched = await setWrits(true);
  const UNITS = `${JSON.stringify(PAUSED_NAMES1113.map(r => r.source))}`;
  const pages = {};
  try {
    for (const width of [1440, 1280, 768, 390, 375, 320]) for (const route of ['roles', 'governance', 'vote', 'news', 'admin/treasury', 'treasury-plan', 'governance/title-iii-the-imperial-treasury-guild-bank-tithe-ledger']) {
      // Every width for the three surfaces that carry the most text; the other writs panels at 1280 and 375 px.
      if (![1280, 375].includes(width) && !['roles', 'treasury-plan', 'governance/title-iii-the-imperial-treasury-guild-bank-tithe-ledger'].includes(route)) continue;
      await open('owner', width, route, 900);
      pages[route + '@' + width] = await ev(`for(const d of document.querySelectorAll('main details'))d.open=true;await new Promise(r=>setTimeout(r,600));
        const L=${JSON.stringify(PAUSED1113)},names=${UNITS}.map(s=>new RegExp(s,'i')),n=(t,s)=>t.split(s).length-1;
        const units=[...document.querySelectorAll('main article.writ199, main tr, main p, main li, main h2, main h3, main h4, main summary')].filter(e=>e.matches('article.writ199, tr')||!e.parentElement.closest('article.writ199, tr')&&!e.querySelector('article.writ199, tr, p, li'));
        const bad=[];let labelled=0,named=0;for(const u of units){const t=u.textContent,k=names.filter(r=>r.test(t)).length,c=n(t,L);if(k)named++;if(c)labelled++;if(k!==c)bad.push(k+'/'+c+' '+t.slice(0,60))}
        const cards=[...document.querySelectorAll('main [data-writ-key]')].map(a=>[a.dataset.writKey,a.querySelector('[data-writ-status]')?.textContent||a.querySelector('.badge')?.textContent||null,[...a.querySelectorAll(':scope > p')].find(p=>/ · /.test(p.textContent)&&p.querySelector(':scope > strong'))?.textContent||'']);
        const all=n(document.querySelector('main').textContent,L);
        return {named,labelled,bad,all,cards:cards.filter(([k])=>${JSON.stringify(PAUSED_KEYS1113)}.includes(k)),otherBadges:[...new Set(cards.filter(([k])=>!${JSON.stringify(PAUSED_KEYS1113)}.includes(k)).map(c=>c[1]))],over:document.documentElement.scrollWidth-document.documentElement.clientWidth}`);
    }
  } finally { await open('owner', 1280, 'admin'); await setWrits(false); }
  const wrongPages = Object.entries(pages).filter(([, v]) => !v || v.bad.length || v.over > 0 || v.cards.some(([, b, line]) => b !== PAUSED1113 || line.split('Proposed').length !== 2) || v.otherBadges.includes(PAUSED1113)).map(([k, v]) => k + ' ' + show(v && { bad: v.bad.slice(0, 2), cards: v.cards, over: v.over }));
  const surfaces = ['roles@1280', 'governance@1280', 'admin/treasury@1280', 'treasury-plan@1280', 'governance/title-iii-the-imperial-treasury-guild-bank-tithe-ledger@1280'];
  bcheck('CL2-291', 'writs panels (Roles, Governance, Vote, News, Admin Treasury), the Treasury plan and Title III: each of the three shows the exact status, nothing else does (Roles, the plan and Title III at 1440 to 320 px, the others at 1280 and 375 px; no overflow)',
    switched === 200 && wrongPages.length === 0 && surfaces.every(k => pages[k] && pages[k].named > 0) && ['roles@1280', 'admin/treasury@1280'].every(k => pages[k].cards.length === 3),
    wrongPages.length ? wrongPages.slice(0, 3).join(' | ') : show({ switched, counts: Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, [v.named, v.labelled, v.all]])) }));
}

// ================================================================ round 4 browser checks (13 Nov 2026)
// Composite contrast: the text colour against the element's own background stack, layer by layer up to the first opaque
// layer (a parchment layer counts as its tinted base colour, rgb(236,218,176); the page base is black). The body's dark
// gradient is ignored, which only makes the backdrop lighter, so gold text is measured on the less favourable side.
const CONTRAST_JS = `const L=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4};const lum=([r,g,b])=>0.2126*L(r)+0.7152*L(g)+0.0722*L(b);
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return Math.round((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)*100)/100};
const parse=s=>{const m=(s.match(/[\\d.]+/g)||[]).map(Number);return [m[0]||0,m[1]||0,m[2]||0,m.length>3?m[3]:1]};
const backdrop=e=>{const layers=[];for(let n=e;n&&n.nodeType===1;n=n.parentElement){const c=getComputedStyle(n);if(/parchment\\.jpg/.test(c.backgroundImage)){layers.push([236,218,176,1]);break}const l=parse(c.backgroundColor);if(l[3]>0)layers.push(l);if(l[3]>=1)break}
let col=[0,0,0];for(let i=layers.length-1;i>=0;i--){const [r,g,b,a]=layers[i];col=[r*a+col[0]*(1-a),g*a+col[1]*(1-a),b*a+col[2]*(1-a)]}return col.map(Math.round)};
const contrastOf=e=>ratio(parse(getComputedStyle(e).color),backdrop(e));`;
// A word is broken when its own text range covers more than one line box.
const WORDS_JS = `const lines=r=>new Set([...r.getClientRects()].filter(x=>x.width>0).map(x=>Math.round(x.top))).size;
const brokenWords=root=>{const out=[];const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);for(let t;(t=w.nextNode());){const re=/\\S+/g;for(let m;(m=re.exec(t.data));){const r=document.createRange();r.setStart(t,m.index);r.setEnd(t,m.index+m[0].length);if(lines(r)>1)out.push(m[0])}}
// A label of two words ("Slot 0") must stay on one line too.
for(const s of root.querySelectorAll('.role-rank-slot1112')){const r=document.createRange();r.selectNodeContents(s);if(lines(r)>1)out.push(s.textContent)}return out};`;
async function round4Checks({ open, ev, show, bcheck }) {
  // R4-GOV-1: every role-guide subhead is readable (at least 4.5:1) wherever a guide renders: family cards and their
  // drawers (/#/roles, /#/roles/<key>, /#/roles/rosetta-stone), the vote board and the role dialog on the application form.
  const subheads = {};
  for (const [who, width] of [['member', 1280], ['member', 375], ['officer', 320], ['admin', 1440]]) {
    for (const route of ['roles', 'roles/raider', 'roles/rosetta-stone', 'vote']) {
      await open(who, width, route);
      subheads[`${who}/${route}@${width}`] = await ev(`${CONTRAST_JS}for(const d of document.querySelectorAll('main details'))d.open=true;await new Promise(r=>setTimeout(r,300));
        const hs=[...document.querySelectorAll('main h3.role-subhead, main .role-info > h4')].filter(e=>e.getClientRects().length);const rs=hs.map(contrastOf);
        return {n:hs.length,min:rs.length?Math.min(...rs):null,colours:[...new Set(hs.map(e=>getComputedStyle(e).color))]}`);
    }
  }
  await open('member', 375, 'apply');
  subheads['member/apply dialog@375'] = await ev(`${CONTRAST_JS}const b=document.querySelector('button.more');if(!b)return {n:0,min:null,missing:'no Details button'};b.click();await new Promise(r=>setTimeout(r,400));
    const d=document.querySelector('dialog[open]');const hs=d?[...d.querySelectorAll('h3.role-subhead, .role-info > h4')].filter(e=>e.getClientRects().length):[];const rs=hs.map(contrastOf);
    const out={n:hs.length,min:rs.length?Math.min(...rs):null,colours:[...new Set(hs.map(e=>getComputedStyle(e).color))]};d?.close();return out`);
  const low = Object.entries(subheads).filter(([, v]) => !v || !v.n || v.min < 4.5).map(([k, v]) => k + ' ' + show(v));
  bcheck('R4-GOV-1', 'role-guide subheads ("Responsibilities", "Expectations") reach at least 4.5:1 on /#/roles, /#/roles/raider, the Rosetta Stone, /#/vote and the role dialog (member, officer, admin; 320 to 1440 px)',
    low.length === 0, low.length ? low.slice(0, 4).join(' | ') : show(subheads));

  // R4-GOV-2: the rank ladder keeps every word and the "Slot N" label whole, with no page overflow, at 320 to 1440 px.
  const ladders = {};
  for (const width of [1440, 1280, 1024, 768, 390, 375, 360, 320]) for (const route of ['roles', 'roles/raider', 'roles/rosetta-stone']) {
    if (width > 400 && width !== 1280 && route !== 'roles') continue;
    await open('member', width, route);
    ladders[`${route}@${width}`] = await ev(`${WORDS_JS}const ol=document.querySelector('main ol.role-ranks203');if(!ol)return null;const links=[...ol.querySelectorAll(':scope > li > a')];
      const cell=links.filter(a=>a.scrollWidth>a.parentElement.clientWidth+1).map(a=>a.textContent);
      return {links:links.length,broken:brokenWords(ol),cellOverflow:cell,over:document.documentElement.scrollWidth-document.documentElement.clientWidth}`);
  }
  const bad = Object.entries(ladders).filter(([, v]) => !v || v.links !== 10 || v.broken.length || v.cellOverflow.length || v.over > 0).map(([k, v]) => k + ' ' + show(v));
  bcheck('R4-GOV-2', 'the Roles rank ladder breaks no rank name or "Slot N" label inside a word and does not overflow (320, 360, 375, 390, 768, 1024, 1280, 1440 px)',
    bad.length === 0, bad.length ? bad.slice(0, 4).join(' | ') : show({ checked: Object.keys(ladders).length, sample: ladders['roles@320'] }));

  // R4-GOV-3: the cross-links this work put on /#/organization and /#/roles are 44 px touch targets on phones. Every group
  // must be present (a missing group fails), and the page must not overflow.
  const GROUPS3 = {
    organization: { composition: '.org-composition-links > a', lanes: '[data-alliance-context1112] a', inspectorTitles: '.org-inspector h3 + ul > li > a' },
    roles: { chooserRosetta: '.application-directory201 > .plaque > a:not(.btn)', rosettaFamily: 'li[data-rosetta-family1112] > a', rosettaKey: 'li[data-rosetta-key1112] > a', rosettaApply: 'tr[data-rank-crosswalk] > td:last-child a' },
  };
  const touch = {};
  for (const width of [390, 375, 320]) for (const [route, groups] of Object.entries(GROUPS3)) {
    await open('member', width, route);
    touch[`${route}@${width}`] = await ev(`for(const d of document.querySelectorAll('main details'))d.open=true;await new Promise(r=>setTimeout(r,500));const out={};
      for(const [k,sel] of Object.entries(${JSON.stringify(groups)})){const hs=[...document.querySelectorAll(sel)].filter(a=>a.getClientRects().length).map(a=>Math.round(a.getBoundingClientRect().height*10)/10);out[k]=hs.length?{n:hs.length,min:Math.min(...hs)}:{n:0,min:0}}
      out.over=document.documentElement.scrollWidth-document.documentElement.clientWidth;return out`);
  }
  const small = Object.entries(touch).flatMap(([page, groups]) => Object.entries(groups).filter(([k, v]) => k === 'over' ? v > 0 : !v.n || v.min < 44).map(([k, v]) => page + ' ' + k + ' ' + show(v)));
  bcheck('R4-GOV-3', 'Council reference, lane and independent-review family, inspector title, Rosetta and chooser links are at least 44 px tall at 390, 375 and 320 px, with no page overflow',
    small.length === 0, small.length ? small.slice(0, 8).join(' | ') : show(touch));

  // R4-GOV-4: /#/admin/appointments has no heading that skips a level (the catalogue group labels were h4 under the h2).
  const outline = {};
  for (const width of [1280, 375]) {
    await open('admin', width, 'admin/appointments');
    outline[width] = await ev(`const hs=[...document.querySelectorAll('main :is(h1,h2,h3,h4,h5,h6)')].filter(e=>e.getClientRects().length);const lv=hs.map(e=>Number(e.tagName[1]));
      const jumps=hs.filter((e,i)=>i>0&&lv[i]>lv[i-1]+1).map(e=>e.tagName+' '+e.textContent.trim().slice(0,40)+' after '+hs[hs.indexOf(e)-1].tagName);
      return {headings:hs.length,groups:document.querySelectorAll('main [data-catalog-group] > .group-label').length,groupTags:[...new Set([...document.querySelectorAll('main [data-catalog-group] > .group-label')].map(e=>e.tagName))],jumps}`);
  }
  bcheck('R4-GOV-4', '/#/admin/appointments: the six catalogue group labels are headings one level under the page section, and no heading skips a level (1280 and 375 px)',
    Object.values(outline).every(o => o.groups === 6 && o.jumps.length === 0), show(outline));
}

// ---------------------------------------------------------------- RC-034 the overview's lane and independent-review views
// Behaviour check on the served overview module (its one static import pointed at the file on disk): every branch role
// family is listed under the department lane it reports into, or under independent review when it reports through
// justice or audit, as the live build placed them; the lists are links to the family cards, not a second set of cards.
async function overviewChecks() {
  const os = require('node:os'), { pathToFileURL } = require('node:url');
  const ctxUrl = pathToFileURL(path.join(root, 'worker/public/static/organization-context205.js')).href;
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'overview1112-')), 'overview.mjs');
  fs.writeFileSync(tmp, overview.replace('"/static/organization-context205.js"', JSON.stringify(ctxUrl)));
  const mod = await import(pathToFileURL(tmp).href), { ORGANIZATION_LANES205 } = await import(ctxUrl);
  const built = mod.buildAllianceOverview205(model, dir);
  const nodes = new Map(model.nodes.map(n => [n.id, n])), terms = new Map(model.terms.map(t => [t.officeKey, t]));
  const expected = { independent: [], lanes: Object.fromEntries(ORGANIZATION_LANES205.map(l => [l.key, []])) };
  for (const f of dir.families.filter(f => f.kind !== 'institution' && f.tier === 'officer_corps')) {
    const anc = new Set(); for (let n = nodes.get((terms.get(f.primaryKey) || {}).nodeId); n; n = n.parent ? nodes.get(n.parent) : null) anc.add(n.id);
    const lane = ORGANIZATION_LANES205.find(l => anc.has(l.rootId));
    if (anc.has('justice') || anc.has('auditor')) expected.independent.push(f.key); else if (lane) expected.lanes[lane.key].push(f.key);
  }
  const got = built.contexts ? { independent: built.contexts.independent.map(f => f.key), lanes: Object.fromEntries(Object.entries(built.contexts.lanes).map(([k, v]) => [k, v.map(f => f.key)])) } : null;
  check('RC-034', 'each branch role family is placed under its department lane or under independent review, as on the live build', !!got && JSON.stringify(got) === JSON.stringify(expected)
    && ['war', 'artisanry', 'propaganda', 'systems'].every(k => got.lanes[k].length > 0) && got.independent.includes('bank_auditor'), JSON.stringify(got));
  check('RC-034', 'the lane and independent-review views are link lists to the family cards, not duplicate cards', /function familyContext\(list, title, key\)/.test(overview)
    && /familyContext\(model\.contexts\.lanes\[lane\.key\]/.test(overview) && /familyContext\(model\.contexts\.independent/.test(overview) && !/familyContext[^\n]*familyCard/.test(overview));
}

(async () => {
  await overviewChecks();
  await treasuryPlanChecks1113();
  await loaderChecks1113();
  const BASE = flag('--base'), CDP_PORT = Number(flag('--cdp'));
  if (BASE && CDP_PORT) await browserChecks(BASE, CDP_PORT);
  console.log(failed ? failed + ' check(s) failed' : 'all checks passed');
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 2; });
