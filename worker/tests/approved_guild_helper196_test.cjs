'use strict';
// Public verification vector only. No signing/key generation, private key, provider or SQLite.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { webcrypto, createHash } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../public/static/approved-guild-helper196.js'), 'utf8');
const VECTOR = {
  "provenance": {
    "url": "https://raw.githubusercontent.com/pyca/cryptography/46.0.3/vectors/cryptography_vectors/asymmetric/RSA/FIPS_186-2/SigVer15_186-3.rsp",
    "sourceSHA256": "dd8de3c0920e3b75059491e9c5d84f2e399b2a652869977eeb863489eb7dd151",
    "source": "NIST public SigVer vector distributed by pyca cryptography 46.0.3; public n/e/message/signature only; not HT1 or Olympus author"
  },
  "publicModulus": "93397894e668653afab24bf55c15071960a81157e680444891c42ac0cebf9ff99e3739e12d0223d62ea048e77ee284582a707050fd11258f27fb6a4e2b583ab37ed0799708e3379e41b191092b2f4631c974dfe81993c740f21bbd0d828ad398893aa33101f445e5ff02ca498b8a851100e8d50aa2fe4c88ee38be966222657f943f9bed73f018a4fd371d208c362cb2aa4d1cec9c68f8416ef00ded34f4a1ee4d59a8ff4c5b3deb33c504542dfbd772ac649c8313644a32205a602cb5581819e4f4a2b8150e63e20669690429a4b5cc77577295183ff6b760a1b5fb989f158107860751c7808c54c1c511d3057b5e9537e009576b723dc9073c0b03f28955e7",
  "exponent": 3,
  "messageHex": "58718b3ba6a4ddcaa7d3f7bd46cbca5591f95d87741fb852c74b004f8c0ae38a71d937909ddcddc9a8d3ec08eb490b61fb0e1f3b70e827a5eb8663ee57b5bc6f6ed760ac7f90ad9c6fc25044ffbcae8b4cae83499c60c8a15724db91540adac756524fb6d72713ea048a6c98088c797a8dc0d0d980f065ec150fae600c6f0438",
  "signatureHex": "29c5a0ab72d0219034ce32ed330a4b388573eb804713d98029fbc1da87a474eca1f1814dd61e26c7bed630f3a4f980734321d56fb3309c751953a4dd9110c293730829bfdc83cabf619b220818e30151c38e6bb9d304eb7204029f8af86209275b1b5fb84bdb12aeaf3013db78d6dc1bcbc23fbe3dd7eb3c3bec332c8453de3ddd2e39cadf7e062f00a682bf18ab68ed3c6bddaa9dada51c99117eceaf6f8179eb9a59e6143a56d5f26d4138a5c31e49104c5982cb1b202253a292786cdb94a2b383c9d96afaf83d52160eccbc42cf2568744999a662097b315ded7fb417a823e3e9b6c5f7a822bd58a4e5542fbdfba63f60266c0b86a363153ae0444e0ee1a5"
};
let checks = 0, copies = [], unexpected = 0;
async function check(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
class Target {
  constructor() { this.listeners = {}; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(item => item !== fn); }
  async fire(type) { await Promise.all((this.listeners[type] || []).slice().map(fn => fn({ target: this }))); }
  count() { return Object.values(this.listeners).reduce((sum, rows) => sum + rows.length, 0); }
}
class Element extends Target {
  constructor(tag, document) { super(); this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.children = []; this.attributes = {}; this.value = ''; this.data = ''; this.disabled = false; }
  set textContent(value) { this.data = String(value); this.children = []; }
  get textContent() { return this.data + this.children.map(child => child.textContent).join(''); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.data = ''; this.children = children; }
  all(predicate) { return this.children.flatMap(child => [...(predicate(child) ? [child] : []), ...child.all(predicate)]); }
  async click() { if (!this.disabled) await this.fire('click'); }
}
function browser(subtle = webcrypto.subtle, instrument = true, clipboard = async text => { copies.push(text); }) {
  const document = new Target(); document.hidden = false; document.createElement = tag => new Element(tag, document);
  const global = new Target(); Object.assign(global, { document, TextEncoder, TextDecoder, Uint8Array, Date, btoa, crypto: { subtle }, navigator: { clipboard: { writeText: clipboard } },
    fetch() { unexpected++; throw Error('Unexpected network'); }, localStorage: { setItem() { unexpected++; throw Error('Unexpected storage'); } }, sessionStorage: { setItem() { unexpected++; throw Error('Unexpected storage'); } } });
  global.window = global;
  const marker = '  global.OlympusApprovedGuildHelper = Object.freeze({ mount });';
  assert.equal(source.split(marker).length, 2);
  const evaluated = instrument ? source.replace(marker, '  global.__fixture = { parse, verifyBytes, AUTHOR_MODULUS };\n' + marker) : source;
  vm.runInNewContext(evaluated, global, { timeout: 1000 });
  const root = document.createElement('main');
  let admitted = true;
  const mount = () => global.OlympusApprovedGuildHelper.mount(root, { isCurrent: () => admitted });
  const button = text => root.all(node => node.tagName === 'BUTTON' && node.textContent === text)[0];
  const input = () => root.all(node => node.tagName === 'TEXTAREA')[0];
  const status = () => root.all(node => node.getAttribute('role') === 'status')[0];
  const set = async text => { input().value = text; await input().fire('input'); };
  return { global, document, root, mount, button, input, status, set, fixture: global.__fixture, revoke: () => { admitted = false; } };
}
const signature = '01'.repeat(256), text = 'HT1~1792757000~Realm+RealmTwo~1~Council^INV_Book_01^Councillor-Realm=Speaker;^guilds^Alliance^Olympus,Olympus II;^guilds^Horde^Olympus Horde', blob = text + '~' + signature;
const allowUIOnly = { importKey: (...args) => webcrypto.subtle.importKey(...args), verify: async () => true };
const mutateLast = value => value.slice(0, -1) + (value.endsWith('0') ? '1' : '0');
(async () => {
  const plain = browser(undefined, false);
  await check('production exports only mount and has no key/signing override, dynamic evaluation, markup sink, persistence or transport', () => {
    assert.deepEqual(Object.keys(plain.global.OlympusApprovedGuildHelper), ['mount']); assert.equal(plain.global.__fixture, undefined);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|fetch\(|localStorage|sessionStorage|generateKey|subtle\.sign|privateKey/.test(source));
    assert.ok(!/setAttribute\(['"]style|<style|<script/.test(source));
  });
  const real = browser(), f = real.fixture;
  await check('upstream immutable source and public modulus provenance pins remain exact', () => {
    assert.ok(source.includes('d03ea8a9ce8d6d933dde9ce0f0ec7faa866a2df2'));
    assert.ok(source.includes('a38082ae3ccb7ac96bc62c49f56a0403e905baec6fb85ca460ca2f7d731d2635'));
    assert.equal(createHash('sha256').update(Buffer.from(f.AUTHOR_MODULUS, 'hex')).digest('hex'), 'bd28c005a1107d8347e752ea41b6a4ad444685e7a08949d9146d8291c96293c9');
  });
  await check('real WebCrypto verifies the existing public NIST RSA2048/e3/SHA256 vector through the private test-only seam', async () => {
    assert.equal(await f.verifyBytes(Buffer.from(VECTOR.messageHex, 'hex'), VECTOR.signatureHex, VECTOR.publicModulus), true);
  });
  await check('real RSA refuses changed message, changed signature, wrong author key and wrong signature lengths', async () => {
    assert.equal(await f.verifyBytes(Buffer.from(mutateLast(VECTOR.messageHex), 'hex'), VECTOR.signatureHex, VECTOR.publicModulus), false);
    assert.equal(await f.verifyBytes(Buffer.from(VECTOR.messageHex, 'hex'), mutateLast(VECTOR.signatureHex), VECTOR.publicModulus), false);
    assert.equal(await f.verifyBytes(Buffer.from(VECTOR.messageHex, 'hex'), VECTOR.signatureHex), false);
    assert.equal(await f.verifyBytes(Buffer.from(VECTOR.messageHex, 'hex'), VECTOR.signatureHex.slice(2), VECTOR.publicModulus), false);
    assert.equal(await f.verifyBytes(Buffer.from(VECTOR.messageHex, 'hex'), '00' + VECTOR.signatureHex, VECTOR.publicModulus), false);
  });
  await check('upstream-shaped HT1 parse retains exact signed bytes and displays realm/time/public/departments/faction guilds', () => {
    const parsed = f.parse(blob); assert.equal(parsed.blob, blob); assert.equal(parsed.signed, text); assert.equal(parsed.timestamp, 1792757000); assert.equal(parsed.realm, 'Realm+RealmTwo'); assert.equal(parsed.public, true);
    assert.equal(parsed.departments[0].name, 'Council'); assert.equal(parsed.departments[0].members[0].title, 'Speaker'); assert.equal(parsed.guilds.Alliance.join(), 'Olympus,Olympus II'); assert.equal(parsed.guilds.Horde.join(), 'Olympus Horde');
  });
  await check('strict grammar refuses prefixes/suffixes, newline extraction, wrong version/public/signature, unsafe timestamp and malformed UTF8', () => {
    for (const invalid of [' '+blob, blob+' ', blob+'\n', 'prefix '+blob, blob.replace('HT1~', 'HS1~'), blob.replace('~1~', '~2~'), blob.slice(0,-1)+'z', blob.replace('1792757000', '9007199254740993'), blob.replace('Realm+RealmTwo', '\ud800')]) assert.throws(() => f.parse(invalid));
  });
  await check('UTF8 byte cap counts multibyte text and never accepts 3000 characters as 3000 bytes', () => {
    const multibyte = 'HT1~1~~0~'+'é'.repeat(1300)+'~'+signature;
    assert.ok(multibyte.length < 3000); assert.ok(Buffer.byteLength(multibyte) > 3000); assert.throws(() => f.parse(multibyte));
    assert.throws(() => f.parse('x'.repeat(3001)));
  });
  await check('department and guild preview honors upstream bounded lists, keeps opaque extensions and leaves signed raw entries unchanged', () => {
    const entries = '^guilds^Alliance^Olympus,olympus,Bad1, Élysée ,élysée;Dept^^One=First,one=Duplicate;^steward^Alliance^Keeper-Realm';
    const parsed = f.parse('HT1~1~~0~'+entries+'~'+signature);
    assert.equal(parsed.guilds.Alliance.join(), 'Olympus,Élysée'); assert.equal(parsed.departments[0].members.length, 1); assert.equal(parsed.other[0], '^steward^Alliance^Keeper-Realm'); assert.equal(parsed.entries, entries); assert.equal(parsed.omitted, 4);
  });
  const rc = real.mount(); await real.set(blob); await real.button('Verify author signature').click();
  await check('production author key rejects the unsigned HT1 fixture and enables no copy controls', async () => {
    assert.match(real.status().textContent, /did not verify/); assert.ok(real.button('Copy verified HT1 blob').disabled); assert.ok(real.button('Copy /oly approved paste').disabled); assert.equal(copies.length, 0); rc.destroy();
  });
  const ui = browser(allowUIOnly), controller = ui.mount();
  await check('UI-only mocked verifier branch is explicitly separate from real RSA/protocol acceptance and starts with no copy', () => {
    assert.ok(ui.button('Copy verified HT1 blob').disabled); assert.ok(ui.root.textContent.includes('held list')); assert.ok(ui.root.textContent.includes('not known here'));
    assert.equal(ui.input().getAttribute('maxlength'), '3000'); assert.equal(ui.input().getAttribute('wrap'), 'soft');
  });
  await ui.set(blob); await ui.button('Verify author signature').click();
  await check('successful UI branch safely previews signed fields as text and does not auto-copy or claim game acceptance', () => {
    assert.equal(copies.length, 0); assert.ok(!ui.button('Copy verified HT1 blob').disabled); assert.ok(ui.root.textContent.includes('Olympus II')); assert.ok(ui.root.textContent.includes('Member: Councillor-Realm · title: Speaker')); assert.ok(ui.status().textContent.includes('remain unchecked'));
  });
  await check('separate explicit clipboard actions copy the exact original blob and command only', async () => {
    await ui.button('Copy verified HT1 blob').click(); await ui.button('Copy /oly approved paste').click(); assert.deepEqual(copies, [blob, '/oly approved paste']); assert.ok(ui.status().textContent.includes('separately copied'));
  });
  await check('every edit invalidates verified copy eligibility immediately', async () => {
    await ui.set(blob+' '); assert.ok(ui.button('Copy verified HT1 blob').disabled); await ui.button('Copy verified HT1 blob').fire('click'); assert.equal(copies.length, 2);
  });
  await ui.set(blob); await ui.button('Verify author signature').click(); ui.document.hidden = true; await ui.document.fire('visibilitychange');
  await check('hiding the view clears material and verified state', () => { assert.equal(ui.input().value, ''); assert.ok(ui.button('Copy verified HT1 blob').disabled); assert.ok(!ui.root.textContent.includes('Member: Councillor-Realm')); });
  ui.document.hidden = false; await ui.set(blob); await ui.button('Verify author signature').click(); ui.revoke();
  await check('revoked current Admin context refuses a previously verified clipboard action', async () => { await ui.button('Copy verified HT1 blob').fire('click'); assert.equal(copies.length, 2); assert.ok(ui.button('Copy verified HT1 blob').disabled); });
  const oldNodes = ui.root.all(() => true); controller.destroy(); controller.destroy();
  await check('destroy clears private material, removes every owned listener and DOM node and disables detached actions', async () => {
    assert.equal(ui.root.children.length, 0); assert.equal(ui.document.count(), 0); assert.equal(ui.global.count(), 0); assert.ok(oldNodes.every(n => n.count() === 0));
    for (const n of oldNodes) if (n.tagName === 'BUTTON') await n.fire('click'); assert.equal(copies.length, 2);
  });
  let release; const delayed = browser({importKey: (...args) => webcrypto.subtle.importKey(...args), verify: () => new Promise(resolve => { release = resolve; })});
  const delayedController = delayed.mount(); await delayed.set(blob); const work = delayed.button('Verify author signature').click();
  for (let i = 0; i < 20 && !release; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof release, 'function'); delayedController.destroy(); release(true); await work;
  await check('an in-flight verifier completing after destroy cannot restore material or copy controls', () => { assert.equal(delayed.root.children.length, 0); assert.equal(delayed.global.count(), 0); assert.equal(delayed.document.count(), 0); });
  const safe = browser(allowUIOnly); const sc = safe.mount(); const markup = blob.replace('Council^', '<img src=x onerror=evil>^'); await safe.set(markup); await safe.button('Verify author signature').click();
  await check('signed markup remains plain text and creates no script/image/link/style element', () => { assert.ok(safe.root.textContent.includes('<img src=x onerror=evil>')); assert.equal(safe.root.all(n => ['SCRIPT','IMG','STYLE','LINK'].includes(n.tagName)).length, 0); sc.destroy(); });
  const unavailable = browser({}); const uc = unavailable.mount(); await unavailable.set(blob); await unavailable.button('Verify author signature').click();
  await check('unavailable crypto refuses safely, and no test path fetches, stores, signs or applies anything', () => { assert.ok(unavailable.button('Copy verified HT1 blob').disabled); assert.equal(unexpected, 0); uc.destroy(); });
  await check('the exact 3000-byte UTF8 boundary is accepted for inspection and 3001 bytes is refused', () => {
    const header = 'HT1~1~~0~', tail = '~'+signature, exact = header+'x'.repeat(3000-header.length-tail.length)+tail;
    assert.equal(Buffer.byteLength(exact), 3000); assert.equal(f.parse(exact).blob, exact); assert.throws(() => f.parse(exact.replace('HT1~1~~0~', 'HT1~1~~0~x')));
  });
  let finishEdit; const editing = browser({ importKey: (...args) => webcrypto.subtle.importKey(...args), verify: () => new Promise(resolve => { finishEdit = resolve; }) });
  const editingController = editing.mount(); await editing.set(blob); const editingWork = editing.button('Verify author signature').click();
  for (let i = 0; i < 20 && !finishEdit; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof finishEdit, 'function'); await editing.set(blob.replace('Council^', 'Changed^')); finishEdit(true); await editingWork;
  await check('an edit during asynchronous verification prevents the old result from validating the replacement text', () => {
    assert.ok(editing.button('Copy verified HT1 blob').disabled); assert.equal(editing.root.all(node => node.getAttribute('aria-label') === 'Verified signed list preview')[0].children.length, 0); editingController.destroy();
  });
  const blocked = browser(allowUIOnly, true, async () => { throw Error('Clipboard blocked'); }); const bc = blocked.mount(); await blocked.set(blob); await blocked.button('Verify author signature').click(); await blocked.button('Copy verified HT1 blob').click();
  await check('clipboard refusal stays an unconfirmed copy and never claims in-game effect', () => { assert.match(blocked.status().textContent, /not confirmed/); assert.equal(copies.length, 2); bc.destroy(); });
  const remount = browser(allowUIOnly); const firstMount = remount.mount(), staleNodes = remount.root.all(() => true); const secondMount = remount.mount();
  await check('remount disposes the prior controller and every old listener before admitting the replacement', () => {
    assert.ok(staleNodes.every(node => node.count() === 0)); firstMount.destroy(); assert.ok(remount.root.children.length > 0); secondMount.destroy(); assert.equal(remount.global.count(), 0); assert.equal(remount.document.count(), 0);
  });
  await check('a caller without a current Admin scope cannot mount the helper', () => {
    const denied = browser(); denied.revoke(); assert.throws(() => denied.mount()); assert.equal(denied.root.children.length, 0); assert.equal(unexpected, 0);
  });
  console.log('\n'+checks+'/'+checks+' passed; genuine author-signed HT1 positive acceptance remains pending.');
})().catch(error => { console.error(error); process.exitCode = 1; });
