const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { check } = require('../check-deploy-toolchain.cjs');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'olympus-deploy-profile-'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
let passed = 0;
try {
  const archive = path.join(temporary, 'archive'), caller = path.join(temporary, 'caller');
  for (const dir of [path.join(archive, 'scripts'), path.join(archive, 'worker'), path.join(caller, 'worker/node_modules/wrangler/wrangler-dist')]) fs.mkdirSync(dir, { recursive:true });
  const lock = JSON.stringify({packages:{'node_modules/wrangler':{version:'4.155.0'}}});
  const cli = path.join(caller, 'worker/node_modules/wrangler/wrangler-dist/cli.js');
  const profile = {node:process.versions.node,lockSha256:hash(lock),wranglerCliSha256:hash('qualified executable')};
  const putProfile = () => fs.writeFileSync(path.join(archive, 'scripts/deploy-toolchain-profile.json'), JSON.stringify(profile));
  fs.writeFileSync(path.join(archive, 'worker/package-lock.json'), lock);
  fs.writeFileSync(path.join(caller, 'worker/package-lock.json'), lock);
  fs.writeFileSync(path.join(caller, 'worker/node_modules/wrangler/package.json'), JSON.stringify({version:'4.155.0'}));
  fs.writeFileSync(cli, 'qualified executable'); putProfile();
  assert.equal(check(archive, caller), cli); passed++;
  for (const [label, mutate, restore] of [
    ['caller lock', () => fs.appendFileSync(path.join(caller,'worker/package-lock.json'), ' '), () => fs.writeFileSync(path.join(caller,'worker/package-lock.json'),lock)],
    ['archived lock', () => fs.appendFileSync(path.join(archive,'worker/package-lock.json'), ' '), () => fs.writeFileSync(path.join(archive,'worker/package-lock.json'),lock)],
    ['retired CLI', () => fs.writeFileSync(cli,'intentional retired profile refusal'), () => fs.writeFileSync(cli,'qualified executable')],
    ['installed version', () => fs.writeFileSync(path.join(caller,'worker/node_modules/wrangler/package.json'),'{"version":"4.124.0"}'), () => fs.writeFileSync(path.join(caller,'worker/node_modules/wrangler/package.json'),'{"version":"4.155.0"}')],
    ['Node version', () => { profile.node='0.0.0'; putProfile(); }, () => { profile.node=process.versions.node; putProfile(); }],
  ]) { mutate(); assert.throws(() => check(archive,caller),undefined,label); passed++; restore(); assert.equal(check(archive,caller),cli); }
  fs.unlinkSync(path.join(archive,'scripts/deploy-toolchain-profile.json')); assert.throws(() => check(archive,caller)); passed++;
  console.log(`${passed}/${passed} deployment toolchain checks passed; no provider process invoked`);
} finally { fs.rmSync(temporary, {recursive:true,force:true}); }
