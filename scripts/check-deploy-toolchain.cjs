// Pre-effect custody check for the caller's installed toolchain against the archived release profile.
// No package resolution, installation, provider request or private recovery tool is performed here.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function check(exportRoot, callerRoot) {
  const profile = JSON.parse(fs.readFileSync(path.join(exportRoot, 'scripts/deploy-toolchain-profile.json'), 'utf8'));
  const archivedLock = path.join(exportRoot, 'worker/package-lock.json');
  const callerLock = path.join(callerRoot, 'worker/package-lock.json');
  if (process.versions.node !== profile.node || digest(archivedLock) !== profile.lockSha256 || digest(callerLock) !== profile.lockSha256)
    throw Error('Node or package lock does not match the archived approved profile');
  const lock = JSON.parse(fs.readFileSync(archivedLock, 'utf8'));
  for (const [relative, entry] of Object.entries(lock.packages)) {
    if (!relative || entry.optional) continue; // Optional packages can be absent on other platforms.
    const file = path.join(callerRoot, 'worker', relative, 'package.json');
    if (JSON.parse(fs.readFileSync(file, 'utf8')).version !== entry.version) throw Error('Installed dependency version differs from the archived lock');
  }
  const cli = path.join(callerRoot, 'worker/node_modules/wrangler/wrangler-dist/cli.js');
  if (digest(cli) !== profile.wranglerCliSha256) throw Error('Wrangler executable does not match the archived approved profile');
  // Select the fixed local CLI only after this check. npx resolution is not deployment authority.
  return cli;
}
if (require.main === module) {
  try { process.stdout.write(check(path.resolve(process.argv[2]), path.resolve(process.argv[3])) + '\n'); }
  catch { console.error('refusing: installed deployment tools do not match the archived approved profile; qualify an ordinary physical install first'); process.exitCode = 1; }
}
module.exports = { check };
