'use strict';
// A release that changes the page's script or style must also change BUILD (review of CL2-076, 13 Nov 2026).
// Signed-in members keep /static/app.js?v=<BUILD> and /static/app.css?v=<BUILD> in their browser for a year
// (worker/src/member-transport.ts). The URL changes only when BUILD changes, so a release that edits app.js or
// app.css under the same BUILD would leave members on the old files until the year runs out.
//
// node scripts/check-asset-build.cjs [--base <git ref>] [--repo <checkout>]
//   The base is the merge base of HEAD and --base (default origin/main); for a ref that is already an ancestor of
//   HEAD, such as the previous commit of a push, that is the ref itself. The files are compared as they are in the
//   working tree, so uncommitted edits count.
// Exit 0: passed (neither file changed, or BUILD changed too). Exit 1: failed (a file changed and BUILD did not, or
// worker/src/index.ts does not have exactly one BUILD line in the working tree or at the base). Exit 3: NOT CHECKED
// (no base could be resolved); never reported as a pass. Every result names the base commit and its BUILD.
// Exit 2: a usage error.
const path = require('node:path'), fs = require('node:fs'), { spawnSync } = require('node:child_process');

const FILES = ['worker/public/static/app.js', 'worker/public/static/app.css'];
const INDEX = 'worker/src/index.ts';
const BUILD_LINES = /^const BUILD = "([^"\r\n]*)";/gm;
const PASSED = 0, FAILED = 1, USAGE = 2, NOT_CHECKED = 3;

function git(repo, args) {
  const r = spawnSync('git', ['-C', repo, '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', ...args], { encoding: 'utf8', windowsHide: true });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() || (r.error ? String(r.error.message) : '') };
}

function check({ repo, base = 'origin/main' }) {
  const lines = [];
  const done = (code, line) => { lines.push(line); return { code, lines }; };
  // An empty --base (for example a CI variable that was not set) is no base, never a quiet fallback.
  if (typeof base !== 'string' || !base.trim() || base.startsWith('-')) return done(NOT_CHECKED, `NOT CHECKED: no base ref was given ("${base}").`);
  const head = git(repo, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
  if (!head.ok) return done(NOT_CHECKED, `NOT CHECKED: ${repo} has no HEAD commit to compare.`);
  const ref = git(repo, ['rev-parse', '--verify', '--quiet', base + '^{commit}']);
  if (!ref.ok) return done(NOT_CHECKED, `NOT CHECKED: the base ref "${base}" does not resolve to a commit here (fetch it, or pass --base).`);
  const mb = git(repo, ['merge-base', head.out, ref.out]);
  if (!mb.ok || !/^[0-9a-f]{40,64}$/.test(mb.out)) return done(NOT_CHECKED, `NOT CHECKED: HEAD and "${base}" have no merge base (a shallow or unrelated history).`);
  const from = mb.out;
  const diff = git(repo, ['diff', '--name-only', from, '--', ...FILES]);
  if (!diff.ok) return done(NOT_CHECKED, `NOT CHECKED: git diff against ${from.slice(0, 12)} failed: ${diff.err}`);
  const changed = diff.out ? diff.out.split(/\r?\n/).filter(Boolean) : [];
  // Exactly one BUILD line on each side. A second line that looks like it (in a comment or a template string) could
  // otherwise be read instead of the real constant and turn a failure into a pass (second review, 13 Nov 2026).
  let text = null;
  try { text = fs.readFileSync(path.join(repo, INDEX), 'utf8'); } catch { text = null; }
  const old = git(repo, ['show', `${from}:${INDEX}`]);
  const current = buildOf(text), before = buildOf(old.ok ? old.out : null);
  // The base is printed with every result: a stale local origin/main is used as it is (fetch it first).
  const at = `[base ${from.slice(0, 12)}, the merge base of HEAD and ${base}; BUILD at the base: ${before.value === null ? 'unreadable' : `"${before.value}"`}]`;
  lines.push(`base: ${from.slice(0, 12)} (merge base of HEAD and ${base}), BUILD at the base: ${before.value === null ? `unreadable (${before.count} matching lines)` : `"${before.value}"`}`);
  if (current.value === null) return done(FAILED, `FAIL: ${INDEX} in the working tree has ${current.count} lines of the form const BUILD = "..."; exactly one is required, so BUILD cannot be read. ${at}`);
  if (before.value === null) return done(FAILED, `FAIL: ${INDEX} at the base has ${before.count} lines of the form const BUILD = "..."; exactly one is required, so the base BUILD cannot be read. ${at}`);
  if (!changed.length) return done(PASSED, `PASS: app.js and app.css are unchanged since the base. ${at}`);
  if (before.value === current.value) return done(FAILED, `FAIL: ${changed.join(', ')} changed since the base, but BUILD is still "${current.value}". Members keep these files for a year under the BUILD in their URL; change BUILD in ${INDEX} in the same release. ${at}`);
  return done(PASSED, `PASS: ${changed.join(', ')} changed and BUILD changed with them ("${before.value}" -> "${current.value}"). ${at}`);
}

// The BUILD value when exactly one line matches; otherwise value is null and count says how many matched.
function buildOf(text) {
  if (typeof text !== 'string') return { value: null, count: 0 };
  const found = [...text.matchAll(BUILD_LINES)];
  return { value: found.length === 1 ? found[0][1] : null, count: found.length };
}

module.exports = { check, FILES, PASSED, FAILED, USAGE, NOT_CHECKED };

if (require.main === module) {
  const args = process.argv.slice(2), opts = { repo: path.resolve(__dirname, '..') };
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--base' || args[i] === '--repo') && args[i + 1] !== undefined) opts[args[i].slice(2)] = args[++i];
    else { console.error('usage: node scripts/check-asset-build.cjs [--base <git ref>] [--repo <checkout>]'); process.exit(USAGE); }
  }
  const result = check(opts);
  for (const line of result.lines) console.log(line);
  process.exit(result.code);
}
