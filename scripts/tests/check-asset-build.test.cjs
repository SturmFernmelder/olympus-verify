'use strict';
// Cases for scripts/check-asset-build.cjs (review of CL2-076, 13 Nov 2026): app.js or app.css changed under an
// unchanged BUILD fails; changed together with BUILD passes; nothing changed passes; no resolvable base is "not
// checked", never a pass; anything but exactly one BUILD line in the tree or at the base fails; every result names the
// base commit and its BUILD. Each case runs the script's own command line against a throwaway git repository.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { spawnSync } = require('node:child_process');
const SCRIPT = path.resolve(__dirname, '..', 'check-asset-build.cjs');
let passed = 0, total = 0;
const check = (label, ok, detail) => { total++; if (ok) passed++; console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok || detail === undefined ? '' : '  ' + JSON.stringify(detail))); };

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'check-asset-build-'));
const git = (repo, ...args) => {
  const r = spawnSync('git', ['-C', repo, '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw Error('git ' + args.join(' ') + ': ' + r.stderr);
  return r.stdout.trim();
};
const write = (repo, file, text) => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), text); };
const build = name => `// fixture\nconst BUILD = "${name}";\nexport default {};\n`;
let count = 0;
// A repository whose first commit is the base (also recorded as origin/main unless told not to).
function repo({ origin = true, seed = 'fixture' } = {}) {
  const dir = path.join(scratch, 'r' + ++count);
  fs.mkdirSync(dir);
  git(dir, 'init', '-q');
  write(dir, 'worker/src/index.ts', build('2026-11-12.279 Base'));
  write(dir, 'worker/public/static/app.js', 'console.log("base");\n');
  write(dir, 'worker/public/static/app.css', 'body{color:#000}\n');
  write(dir, 'README.md', seed + '\n');
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'base');
  if (origin) git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return dir;
}
const commit = (dir, message) => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', message); };
const run = (dir, ...args) => { const r = spawnSync(process.execPath, [SCRIPT, '--repo', dir, ...args], { encoding: 'utf8', windowsHide: true }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };

try {
  let dir = repo();
  write(dir, 'worker/public/static/app.js', 'console.log("changed");\n'); commit(dir, 'script only');
  let r = run(dir);
  check('app.js changed with BUILD unchanged fails (exit 1)', r.code === 1 && /^FAIL: worker\/public\/static\/app\.js changed/m.test(r.out), r);

  dir = repo();
  write(dir, 'worker/public/static/app.css', 'body{color:#fff}\n'); commit(dir, 'style only');
  r = run(dir);
  check('app.css changed with BUILD unchanged fails (exit 1)', r.code === 1 && /app\.css changed/.test(r.out), r);

  dir = repo();
  write(dir, 'worker/public/static/app.js', 'console.log("changed");\n'); write(dir, 'worker/public/static/app.css', 'body{color:#fff}\n');
  write(dir, 'worker/src/index.ts', build('2026-11-13.280 Next')); commit(dir, 'script, style and build');
  r = run(dir);
  check('app.js and app.css changed with BUILD changed passes (exit 0)', r.code === 0 && /^PASS: .*BUILD changed/m.test(r.out), r);

  dir = repo();
  write(dir, 'README.md', 'other change\n'); commit(dir, 'unrelated');
  r = run(dir);
  check('nothing relevant changed passes (exit 0)', r.code === 0 && /^PASS: app\.js and app\.css are unchanged/m.test(r.out), r);

  dir = repo();
  write(dir, 'worker/public/static/app.js', 'console.log("uncommitted");\n');
  r = run(dir);
  check('an uncommitted app.js edit under the same BUILD fails too (local use)', r.code === 1, r);

  dir = repo();
  write(dir, 'worker/public/static/app.js', 'console.log("changed");\n'); commit(dir, 'script only');
  const before = git(dir, 'rev-parse', 'HEAD');
  write(dir, 'README.md', 'later\n'); commit(dir, 'later');
  r = run(dir, '--base', before);
  check('an explicit base that is an ancestor is used as the base itself (later commits only: passes)', r.code === 0 && r.out.includes(before.slice(0, 12)), r);

  dir = repo({ origin: false });
  write(dir, 'worker/public/static/app.js', 'console.log("changed");\n'); commit(dir, 'script only');
  r = run(dir);
  check('no origin/main gives NOT CHECKED (exit 3), not a pass', r.code === 3 && /^NOT CHECKED: /m.test(r.out) && !/^PASS/m.test(r.out), r);
  r = run(dir, '--base', 'refs/heads/no-such-branch');
  check('an unknown base ref gives NOT CHECKED (exit 3)', r.code === 3 && /^NOT CHECKED: /m.test(r.out), r);
  r = run(dir, '--base', '');
  check('an empty base (an unset CI variable) gives NOT CHECKED (exit 3)', r.code === 3 && /^NOT CHECKED: /m.test(r.out), r);
  r = run(dir, '--base', '0000000000000000000000000000000000000000');
  check('the all-zero commit of a new branch push gives NOT CHECKED (exit 3)', r.code === 3 && /^NOT CHECKED: /m.test(r.out), r);

  const other = repo({ origin: false, seed: 'another project' }); // different content, so never the same root commit
  dir = repo({ origin: false });
  git(dir, 'fetch', '-q', other, 'HEAD:refs/remotes/origin/main');
  r = run(dir);
  check('an unrelated history with no merge base gives NOT CHECKED (exit 3)', r.code === 3 && /no merge base/.test(r.out), r);

  dir = repo();
  write(dir, 'worker/public/static/app.js', 'console.log("changed");\n'); write(dir, 'worker/src/index.ts', '// BUILD removed\n'); commit(dir, 'no build');
  r = run(dir);
  check('a changed file with no readable current BUILD fails (exit 1)', r.code === 1 && /working tree has 0 lines/.test(r.out), r);

  // Second review (13 Nov 2026): exactly one BUILD line on each side. Each decoy sits before the real constant and
  // carries a new value, so reading the first match would have passed a release that left BUILD unchanged.
  const real = 'const BUILD = "2026-11-12.279 Base";\n';
  for (const [label, decoy] of [['in a block comment', '/*\nconst BUILD = "2026-11-13.280 Decoy";\n*/\n'], ['in a template string', 'const NOTE = `\nconst BUILD = "2026-11-13.280 Decoy";\n`;\n']]) {
    dir = repo();
    write(dir, 'worker/public/static/app.js', 'console.log("changed");\n'); write(dir, 'worker/src/index.ts', '// fixture\n' + decoy + real + 'export default {};\n'); commit(dir, 'decoy ' + label);
    r = run(dir);
    check(`a decoy BUILD line ${label} with the real BUILD unchanged fails (exit 1), not a pass`, r.code === 1 && /^FAIL: worker\/src\/index\.ts in the working tree has 2 lines/m.test(r.out) && !/^PASS/m.test(r.out), r);
  }
  dir = repo();
  write(dir, 'worker/src/index.ts', '// fixture\n' + real + real + 'export default {};\n'); commit(dir, 'two builds');
  r = run(dir);
  check('two BUILD lines fail even when app.js and app.css are unchanged (exit 1)', r.code === 1 && /has 2 lines/.test(r.out), r);

  dir = repo({ origin: false });
  write(dir, 'worker/src/index.ts', '// fixture\n/*\nconst BUILD = "old decoy";\n*/\n' + real + 'export default {};\n'); commit(dir, 'base with a decoy');
  const decoyBase = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  write(dir, 'worker/public/static/app.js', 'console.log("changed");\n'); write(dir, 'worker/src/index.ts', build('2026-11-13.280 Next')); commit(dir, 'script and build');
  r = run(dir);
  check('a base with two BUILD lines fails (exit 1) with a message naming the base', r.code === 1 && /^FAIL: worker\/src\/index\.ts at the base has 2 lines/m.test(r.out) && r.out.includes(decoyBase.slice(0, 12)), r);

  // Second review, finding 3: the base commit and its BUILD are printed beside the result, so a stale origin/main shows.
  dir = repo();
  const shown = git(dir, 'rev-parse', 'HEAD');
  write(dir, 'worker/public/static/app.js', 'console.log("changed");\n'); write(dir, 'worker/src/index.ts', build('2026-11-13.280 Next')); commit(dir, 'script and build');
  r = run(dir);
  const result = r.out.split(/\r?\n/).find(l => /^(PASS|FAIL|NOT CHECKED)/.test(l)) || '';
  check('the result line names the base commit and the BUILD at the base', r.code === 0 && result.includes(`[base ${shown.slice(0, 12)},`) && result.includes('BUILD at the base: "2026-11-12.279 Base"'), r);
  dir = repo();
  write(dir, 'worker/public/static/app.js', 'console.log("changed");\n'); commit(dir, 'script only');
  r = run(dir);
  check('a failing result names the base commit and the BUILD at the base too', r.code === 1 && /^FAIL: .*\[base [0-9a-f]{12}, .*BUILD at the base: "2026-11-12\.279 Base"\]$/m.test(r.out), r);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log(`${passed}/${total} checks passed`);
process.exit(passed === total ? 0 : 1);
