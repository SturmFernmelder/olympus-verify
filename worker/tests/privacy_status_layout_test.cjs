// Presentation-only regression: real private response renderer and real stylesheet, synthetic status data.
// No account erasure is requested, no provider is called, and no real status credential is read or printed.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..'), cache = new Map();
let checks = 0, providerCalls = 0;
function check(label, value) { assert.ok(value, label); checks++; console.log('PASS ' + label); }
const context = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
  ReadableStream, ReadableStreamDefaultReader, Request, Response, Headers, URL, URLSearchParams, atob, btoa,
  AbortController, AbortSignal, setTimeout, clearTimeout, console,
  fetch() { providerCalls++; throw Error('No provider access in a presentation fixture'); } });
function load(name) {
  if (name === 'node:async_hooks') return require(name);
  name = name.replace(/^\.\//, '');
  if (!/^[a-z0-9-]+$/.test(name)) throw Error('Unexpected module');
  if (cache.has(name)) return cache.get(name).exports;
  const module = { exports: {} }; cache.set(name, module);
  const source = fs.readFileSync(path.join(root, 'src', name + '.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  // Expose the existing private presentation function only inside this test VM, not in shipping exports.
  const seam = name === 'policy-forms' ? '\nexports.renderStatusForLayout = showErasureStatus;' : '';
  vm.runInContext('(function(require,module,exports){' + js + seam + '\n})', context, { filename: name })(load, module, module.exports);
  return module.exports;
}
const decode = text => text.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[entity]));
async function main() {
  const forms = load('policy-forms'), css = fs.readFileSync(path.join(root, 'public/static/policies.css'), 'utf8');
  const declaration = /\.olympus-policy \.privacy-status-code\s*\{([^}]+)\}/.exec(css)?.[1] || '';
  check('private status block permits wrapping instead of the browser pre nowrap default', /(?:^|;)white-space:pre-wrap(?:;|$)/.test(declaration));
  check('unbroken private code can wrap at any character on a narrow viewport', /(?:^|;)overflow-wrap:anywhere(?:;|$)/.test(declaration));
  check('private status block is bounded by its parent width', /(?:^|;)max-width:100%(?:;|$)/.test(declaration) && /(?:^|;)min-width:0(?:;|$)/.test(declaration));
  check('wrapping does not apply clipping or hidden overflow to the status block', !/(?:overflow(?:-x|-y)?|text-overflow):(?:hidden|clip|ellipsis)/.test(declaration));
  check('private status code keeps ordinary word breaking for text selection', /(?:^|;)word-break:normal(?:;|$)/.test(declaration));
  for (const module of ['policy-forms', 'privacy-access-erasure']) {
    const source = fs.readFileSync(path.join(root, 'src', module + '.ts'), 'utf8');
    check(module + ' uses the wrapping block for its exact escaped status credential', source.split('<pre class="privacy-status-code">${e(status.statusToken)}</pre>').length === 2);
    check(module + ' has no remaining unclassified status-token pre block', !source.includes('<pre>${e(status.statusToken)}</pre>'));
  }
  let databaseReads = 0;
  const env = { COOKIE_SECRET: 'synthetic-status-layout-secret-never-production', PRIVACY_NATIVE_ERASURE_ENABLED: 'true',
    get DB() { databaseReads++; throw Error('Renderer must not touch account data'); } };
  const request = new Request('https://guild.example/privacy/account/erasure-status');
  const fixture = token => ({ state: 'held', servingAccountErased: false, servingLocalErased: false, statusToken: token,
    externalCleanup: { known: 0, unknown: 1, expiredUnresolved: 0 },
    staffAccessDetails: { classification: 'unknown', historicalBotIssued: null, unresolvedBotCustody: 1 } });
  const token = 'S'.repeat(980) + '.' + 'T'.repeat(43);
  const response = await forms.renderStatusForLayout(request, env, 'n'.repeat(43), 'f'.repeat(32), fixture(token));
  const html = await response.text();
  check('real private status response preserves its existing HTTP success', response.status === 200);
  check('actual rendered block contains the complete synthetic maximum-length code unchanged', /<pre class="privacy-status-code">([^<]*)<\/pre>/.exec(html)?.[1] === token);
  check('actual read-only status form keeps the same complete code for copy and recheck', /<textarea name="statusToken"[^>]*>([^<]*)<\/textarea>/.exec(html)?.[1] === token);
  check('status code input keeps the original 1024-character bound', /<textarea name="statusToken" maxlength="1024"/.test(html));
  check('private response retains same-origin stylesheet and viewport metadata', html.includes('href="/static/policies.css"') && html.includes('width=device-width,initial-scale=1'));
  check('private status page stays script-free under the existing CSP', !/<script\b/i.test(html) && response.headers.get('Content-Security-Policy').includes("script-src 'none'"));
  check('private status remains uncached and outside URL query strings', /no-store/.test(response.headers.get('Cache-Control')) && !html.includes('?statusToken='));
  check('held response does not claim local or every-copy erasure completion', html.includes('The request is queued or held') && html.includes('does not mean every copy was erased'));
  const escaped = '<&>"\'';
  const escapeResponse = await forms.renderStatusForLayout(request, env, 'n'.repeat(43), 'f'.repeat(32), fixture(escaped));
  const escapeHtml = await escapeResponse.text();
  const escapedPre = /<pre class="privacy-status-code">([^<]*)<\/pre>/.exec(escapeHtml)?.[1];
  check('status rendering escapes markup without inserting code-breaking characters', escapedPre && decode(escapedPre) === escaped && !escapeHtml.includes('<pre class="privacy-status-code"><'));
  check('presentation runs read no database and call no provider', databaseReads === 0 && providerCalls === 0);
  console.log(`\n${checks}/${checks} passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
