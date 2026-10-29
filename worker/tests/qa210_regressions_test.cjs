// .210 QA regressions: the role guides' in-game rank facts and the narrow-screen button rule.
// Reads the real src/site-data.ts (transpiled) and the real public/static/app.css; no network or provider.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
let passed = 0, failed = 0;
function check(label, condition) { if (condition) { passed++; console.log('PASS ' + label); } else { failed++; console.error('FAIL ' + label); } }

const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  cache.set(file, module);
  const local = request => request.startsWith('.') ? load(path.join(path.dirname(file), request.endsWith('.ts') ? request : request + '.ts')) : require(request);
  new Function('module', 'exports', 'require', out)(module, module.exports, local);
  return module.exports;
}
const src = path.resolve(__dirname, '../src');
const { POSITIONS } = load(path.join(src, 'site-data.ts'));
const { OFFICE_APPOINTMENTS, NATIVE_RANKS_199 } = load(path.join(src, 'governance-offices.ts'));

// Every role guide states the native rank of its own office, its native rank row, or (with neither) Member.
const expected = position => {
  const office = OFFICE_APPOINTMENTS.find(row => row.key === position.key)
    ?? (position.key === 'class_lead' ? OFFICE_APPOINTMENTS.find(row => row.group === 'class') : undefined)
    ?? OFFICE_APPOINTMENTS.find(row => row.key === 'rank_' + position.key);
  return office ? NATIVE_RANKS_199.find(row => row.nativeSlot === office.nativeSlot) : NATIVE_RANKS_199[7];
};
const wrong = POSITIONS.filter(position => {
  const rank = expected(position);
  return !position.info.game.startsWith(`Rank ${rank.nativeRankOrdinal} ${rank.name} (zero-based slot ${rank.nativeSlot}).`);
}).map(position => position.key);
check('.210 every role guide states the native rank of its own office or native rank row', POSITIONS.length > 60 && wrong.length === 0);
const raider = POSITIONS.find(position => position.key === 'raider');
check('.210 the Raider guide says Rank 7 Raider (zero-based slot 6), as the ten-rank ladder does',
  !!raider && raider.info.game.startsWith('Rank 7 Raider (zero-based slot 6).') && NATIVE_RANKS_199[6].name === 'Raider' && NATIVE_RANKS_199[6].nativeSlot === 6);
const member = POSITIONS.find(position => position.key === 'member');
check('.210 the Member guide is unchanged at Rank 8 Member (zero-based slot 7)', !!member && member.info.game.startsWith('Rank 8 Member (zero-based slot 7).'));

// A long button label wraps on narrow screens instead of widening the page; wide screens keep one-line buttons.
const css = fs.readFileSync(path.resolve(__dirname, '../public/static/app.css'), 'utf8');
const narrow = [...css.matchAll(/@media \(max-width: 720px\) \{ \.btn \{([^}]+)\} \}/g)];
const rules = new Map((narrow[0]?.[1] || '').split(';').map(d => d.trim()).filter(Boolean).map(d => d.split(/:\s*/, 2)));
check('.210 one narrow-screen rule lets every button shrink and wrap its full label',
  narrow.length === 1 && rules.get('max-width') === '100%' && rules.get('min-width') === '0' && rules.get('white-space') === 'normal' && rules.get('overflow-wrap') === 'anywhere');
check('.210 the base button keeps its single-line layout above the narrow breakpoint', /\n\.btn \{[^}]*white-space: nowrap;/.test(css));

// On a phone the wrapped top bar (140-228px) scrolls away; offsets below it count it only while it is pinned.
const app = fs.readFileSync(path.resolve(__dirname, '../public/static/app.js'), 'utf8');
check('.210 the top bar is not pinned on narrow or short screens, and scroll offsets use it only while pinned',
  /@media \(max-width: 480px\), \(max-height: 500px\) \{ \.topbar \{ position: static; \} \}/.test(css)
  && /function pinnedBarHeight\(\) \{[\s\S]{0,400}position === "sticky" \|\| position === "fixed"/.test(app)
  && (app.match(/querySelector\("\.topbar"\)/g) || []).length === 2 && /window\.scrollY - pinnedBarHeight\(\) - 12/.test(app) && /let y = pinnedBarHeight\(\) \+ 8;/.test(app));

// Date-only values (trial due dates, dues weeks, case review/expiry) are stored as 00:00 UTC and must print as that UTC day.
const utcFormatters = /const fmtDayUtc = [^\n]*timeZone: "UTC"/.test(app) && /const fmtShortUtc = [^\n]*timeZone: "UTC"/.test(app);
const localDateOnly = ['t.reviewDueAt', 'o.periodStart', 'o.dueAt', 'c.reviewAt', 'c.expiresAt'].filter(field => new RegExp('fmt(Short|Day)\\(sec\\(' + field.replace('.', '\\.') + '\\)\\)').test(app));
const DTZ = timeZone => new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone });
check('.210 date-only values are formatted in UTC, never in the viewer\'s zone (26 Nov stays 26 Nov in New York)',
  utcFormatters && localDateOnly.length === 0 && DTZ('UTC').format(Date.parse('2026-11-26T00:00:00Z')) === 'Nov 26, 2026' && DTZ('America/New_York').format(Date.parse('2026-11-26T00:00:00Z')) === 'Nov 25, 2026');

// Discord refuses a message over 2,000 characters: every ephemeral reply is cut to fit, never lost.
const discord = load(path.join(src, 'discord.ts'));
const long = discord.fitContent('n'.repeat(4020)), surrogate = discord.fitContent('a'.repeat(1998) + '\u{1F600}' + 'b'.repeat(10));
check('.210 a reply over Discord\'s 2,000 characters is cut to 2,000 with an ellipsis; a short one is unchanged',
  long.length === 2000 && long.endsWith('…') && discord.fitContent('short') === 'short' && surrogate.length <= 2000 && !/[\uD800-\uDBFF]…$/.test(surrogate));

(async () => {
  const body = await discord.reply('x'.repeat(4426)).json();
  check('.210 the reply helper itself applies the limit', body.type === 4 && body.data.content.length === 2000 && body.data.flags === 64);
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
})();
