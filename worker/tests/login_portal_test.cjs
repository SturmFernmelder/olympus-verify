// Presentation-only: actual entry/policy renderers and stylesheet, with no account/provider operation.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.join(__dirname, '..'), modules = new Map(), originals = new Map();
let network = 0, passed = 0, total = 0;
globalThis.fetch = async () => { network++; throw Error('No provider call is permitted by this presentation test'); };
function load(name) {
  if (name.startsWith('node:')) return require(name);
  const file = path.join(root, 'src', name.replace(/^\.\//, '') + '.ts');
  if (modules.has(file)) return modules.get(file).exports;
  const bytes = fs.readFileSync(file), mod = { exports: {} }; originals.set(file, bytes); modules.set(file, mod);
  const code = ts.transpileModule(bytes.toString('utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', code)(mod, mod.exports, load);
  return mod.exports;
}
function check(label, value) { total++; if (value) passed++; console.log((value ? 'PASS ' : 'FAIL ') + label); }
(async () => {
  const access = load('./site-access'), policies = load('./policies'), render = load('./policy-render');
  const css = fs.readFileSync(path.join(root, 'public/static/policies.css'), 'utf8');
  const cssStart = css.indexOf("/* Owner's .172 entry:");
  const portalCss = css.slice(cssStart);
  const request = new Request('https://guild.example/');
  const response = access.siteSignIn(request), html = await response.text();
  const main = /<main\b[^>]*>([^]*?)<\/main>/.exec(html)?.[1] || '';
  const words = main.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  check('default entry contains exactly the owner-requested main copy', words === 'Enter Olympus The gates of Olympus Sign in with Discord to enter the guild hall. Membership of the Asmongold Discord server is required. Sign in with Discord');
  check('the removed entry-only sentence is absent', !html.includes('Only the sign-in and privacy pages are available before entry.'));
  check('the real sign-in remains a normal Discord-login link', response.status === 200 && /<a class="policy-button" href="\/auth\/login">Sign in with Discord<\/a>/.test(html));
  check('the approved decorative still is accessibility-hidden and cannot capture interaction', html.includes('class="login-portal-poster" src="/static/wow/login/olympus-dark-portal.png" alt="" aria-hidden="true" width="1672" height="941"') && !/<(?:button|input|canvas|video|iframe)\b/.test(main) && portalCss.includes('object-fit:contain;pointer-events:none'));
  check('entry retains a keyboard skip destination and visible focus styling', html.includes('class="skip-link" href="#policy-content"') && html.includes('<main id="policy-content" tabindex="-1">') && portalCss.includes(':focus-visible{outline:3px solid #e1ffbd'));
  check('the portal entry remains script-free without private boot or application source', !/<script\b|\son[a-z]+\s*=|id="boot"|\/static\/app\.(?:js|css)/i.test(html) && /script-src 'none'/.test(response.headers.get('Content-Security-Policy') || ''));
  check('privacy navigation remains hidden only on the entry', !html.includes('<nav aria-label="Policies">') && portalCss.includes('.olympus-policy:has(.portal-login)>.policy-header{display:none}'));
  check('original no-store, frame denial and no-index protections remain', response.headers.get('Cache-Control') === 'no-store, no-transform' && response.headers.get('X-Frame-Options') === 'DENY' && /noindex/.test(response.headers.get('X-Robots-Tag') || ''));
  const head = access.siteSignIn(new Request('https://guild.example/', { method: 'HEAD' }));
  check('HEAD preserves status/security and has no body', head.status === 200 && (await head.text()) === '' && head.headers.get('Content-Security-Policy') === response.headers.get('Content-Security-Policy'));
  const denied = access.siteSignIn(request, 403, 'denied'), deniedText = await denied.text();
  check('an actual entry refusal preserves its status and account-control explanation', denied.status === 403 && deniedText.includes('This account cannot enter the guild site. Your privacy account connection remains available.') && deniedText.includes('href="/auth/login"'));
  const privacy = policies.policyResponse(new Request('https://guild.example/privacy'), '/privacy');
  const terms = policies.policyResponse(new Request('https://guild.example/terms'), '/terms');
  check('direct privacy and terms remain public and do not acquire portal markup', privacy.status === 200 && terms.status === 200 && !(await privacy.text()).includes('portal-login') && !(await terms.text()).includes('portal-login'));
  check('narrow and tall layouts keep the entire still in flow before the separate sign-in card', cssStart >= 0 && portalCss.includes('align-content:center;min-height:100svh') && portalCss.includes('display:grid;gap:clamp(1rem,2vw,2rem)') && portalCss.includes('width:min(100%,36rem)') && portalCss.includes('width:100%;height:auto;object-fit:contain') && portalCss.includes('@media(max-width:35rem)') && html.indexOf('class="login-portal-poster"') < html.indexOf('class="login-card"') && !/object-fit:cover|position:fixed/.test(portalCss));
  check('a readable dark card overlays only the wide central opening without cropping either shield', portalCss.includes('background:linear-gradient(135deg,#121712f5,#0a100af5)') && portalCss.includes('@media(min-width:76rem) and (min-aspect-ratio:3/2)') && portalCss.includes('grid-area:1/1') && portalCss.includes('align-self:center;width:min(32%,30rem)') && !portalCss.includes('overflow:hidden'));
  check('the same still has no motion or preference-dependent hidden replacement', !/<video\b|<source\b|\sautoplay(?:\s|>)/i.test(html) && !/@keyframes|animation:|transition:|prefers-reduced-motion/.test(portalCss) && !/login-portal-poster\{[^}]*display:none/.test(portalCss));
  check('forced-colors mode retains the full illustration and restores system card/focus contrast', portalCss.includes('@media(forced-colors:active)') && portalCss.includes('border:2px solid CanvasText;background:Canvas;box-shadow:none') && portalCss.includes('color:CanvasText;text-shadow:none') && portalCss.includes('outline-color:Highlight') && !/login-portal(?:-poster)?\{[^}]*display:none/.test(portalCss));
  check('the approved custom still introduces no external loads or CSS portal imitation', !/https?:|url\(|<script|@import|@keyframes|repeating-conic-gradient/i.test(portalCss) && !portalCss.includes('olympus-portal-turn') && !html.includes('login-portal-stone'));
  const images = [...main.matchAll(/<img\b([^>]*)>/g)];
  check('still-only entry removes all video, source, autoplay and native control markup', !/<(?:video|source|audio|iframe)\b|\s(?:autoplay|controls|playsinline)(?:\s|>)/i.test(html) && !html.includes('.webm') && !html.includes('dark-portal-poster.jpg'));
  check('one exact approved PNG is used without responsive alternate images or crop sources', images.length === 1 && images[0][1].includes('src="/static/wow/login/olympus-dark-portal.png"') && !/\bsrcset=|<picture\b|<source\b/.test(html));
  const imageBytes = fs.readFileSync(path.join(root, 'public/static/wow/login/olympus-dark-portal.png'));
  check('the actual PNG dimensions and HTML/CSS intrinsic ratio agree without a generated crop', imageBytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && imageBytes.readUInt32BE(16) === 1672 && imageBytes.readUInt32BE(20) === 941 && portalCss.includes('aspect-ratio:1672/941') && images[0][1].includes('width="1672" height="941"'));
  const staticCsp = "default-src 'none'; script-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";
  check('still-only login removes media permission while preserving script, connection and form denial', response.headers.get('Content-Security-Policy') === staticCsp && render.LOGIN_POLICY_CSP === staticCsp && !response.headers.get('Content-Security-Policy').includes('media-src'));
  check('policy and form CSPs retain all their original exact directives', render.STATIC_POLICY_CSP === staticCsp && render.FORM_POLICY_CSP === staticCsp.replace("form-action 'none'", "form-action 'self'") && render.policyHeaders().get('Content-Security-Policy') === staticCsp && render.policyHeaders(true).get('Content-Security-Policy') === render.FORM_POLICY_CSP && privacy.headers.get('Content-Security-Policy') === staticCsp && terms.headers.get('Content-Security-Policy') === staticCsp);
  for (const value of ['on', ' ON ']) {
    const saved = access.siteSignIn(new Request('https://guild.example/', { headers: { 'Save-Data': value } }));
    const savedHtml = await saved.text();
    check('Save-Data ' + JSON.stringify(value) + ' receives the identical approved still and protected sign-in', savedHtml === html && !/<video\b|<source\b|\sautoplay(?:\s|>)/i.test(savedHtml) && savedHtml.includes('/static/wow/login/olympus-dark-portal.png') && savedHtml.includes('href="/auth/login"') && saved.headers.get('Content-Security-Policy') === render.LOGIN_POLICY_CSP);
  }
  const notSaved = await access.siteSignIn(new Request('https://guild.example/', { headers: { 'Save-Data': 'off' } })).text();
  check('other Save-Data values cannot restore historical video or introduce an alternate image', notSaved === html && !/<video\b|<source\b/.test(notSaved));
  const savedHead = access.siteSignIn(new Request('https://guild.example/', { method: 'HEAD', headers: { 'Save-Data': 'on' } }));
  check('data-saver HEAD remains bodyless with unchanged status and security', savedHead.status === 200 && await savedHead.text() === '' && savedHead.headers.get('Content-Security-Policy') === render.LOGIN_POLICY_CSP && savedHead.headers.get('Cache-Control') === 'no-store, no-transform');
  const flashed = access.siteSignIn(request, 401, 'cancelled', ['entry-one=; Secure; Path=/', 'entry-two=; Secure; Path=/']);
  check('flash, status and both original cookie values survive presentation changes', flashed.status === 401 && (await flashed.text()).includes('Discord sign-in was cancelled. You can try again when ready.') && flashed.headers.getSetCookie().join('|') === 'entry-one=; Secure; Path=/|entry-two=; Secure; Path=/');
  const unknown = await access.siteSignIn(request, 200, '<script>bad</script>').text();
  check('unknown flash input cannot introduce markup or displace original entry copy', !unknown.includes('<script>') && unknown.includes('Membership of the Asmongold Discord server is required.'));
  check('the exact single-PNG login allowlist excludes policies, historical media and private neighboring paths', JSON.stringify(render.LOGIN_ASSETS) === '["/static/wow/login/olympus-dark-portal.png"]' && render.POLICY_ASSETS.length === 12 && !render.POLICY_ASSETS.some(value => value.includes('/login/')));
  check('no provider calls or source mutations occurred', network === 0 && [...originals].every(([file, bytes]) => fs.readFileSync(file).equals(bytes)));
  console.log(`\n${passed}/${total} login portal checks passed`);
  if (passed !== total) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
