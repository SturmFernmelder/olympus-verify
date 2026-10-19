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
  const cssStart = css.indexOf("/* Owner's .171 entry:");
  const portalCss = css.slice(cssStart);
  const request = new Request('https://guild.example/');
  const response = access.siteSignIn(request), html = await response.text();
  const main = /<main\b[^>]*>([^]*?)<\/main>/.exec(html)?.[1] || '';
  const words = main.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  check('default entry contains exactly the owner-requested main copy', words === 'Enter Olympus The gates of Olympus Sign in with Discord to enter the guild hall. Membership of the Asmongold Discord server is required. Sign in with Discord');
  check('the removed entry-only sentence is absent', !html.includes('Only the sign-in and privacy pages are available before entry.'));
  check('the real sign-in remains a normal Discord-login link', response.status === 200 && /<a class="policy-button" href="\/auth\/login">Sign in with Discord<\/a>/.test(html));
  check('decorative poster is accessibility-hidden while native video controls remain reachable', html.includes('class="login-portal-poster" src="/static/wow/login/dark-portal-poster.jpg" alt="" aria-hidden="true"') && /<video[^>]*controls[^>]*aria-label="Original Dark Portal animation; use the video controls to pause"/.test(main) && !/<(?:button|input|canvas|iframe)\b/.test(main) && portalCss.includes('object-fit:cover;pointer-events:auto') && !html.includes('<div class="login-portal" aria-hidden="true">'));
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
  check('the centered card and media use viewport-bounded mobile dimensions and reserve native controls space', cssStart >= 0 && portalCss.includes('align-content:center;min-height:100svh') && portalCss.includes('width:min(100%,36rem)') && portalCss.includes('@media(max-width:35rem)') && portalCss.includes('width:100%;height:100%;object-fit:cover') && portalCss.includes('padding-bottom:max(5.5rem,env(safe-area-inset-bottom))'));
  check('a separate dark card shields text from the moving decorative background', portalCss.includes('main:has(.portal-login)::before') && portalCss.includes('z-index:-1;border-radius:inherit;background:linear-gradient') && portalCss.includes('login-portal{position:fixed;inset:0;z-index:-2') && portalCss.includes('login-portal-video:focus-visible{outline:3px solid #e1ffbd'));
  check('reduced-motion mode hides video and preserves the independent static poster', /@media\(prefers-reduced-motion:reduce\)\{[^]*?login-portal-video\{display:none\}[^]*?login-portal-poster\{display:block\}/.test(portalCss));
  check('forced-colors mode keeps a static poster and restores system contrast', /@media\(forced-colors:active\)\{[^]*?login-portal-video\{display:none\}[^]*?login-portal-poster\{display:block;opacity:/.test(portalCss) && portalCss.includes('background:Canvas') && portalCss.includes('color:CanvasText;text-shadow:none'));
  check('the original-media successor introduces no external loads or CSS portal imitation', !/https?:|url\(|<script|@import|@keyframes|repeating-conic-gradient/i.test(portalCss) && !portalCss.includes('olympus-portal-turn') && !html.includes('login-portal-stone'));
  const video = /<video\b([^>]*)>([^]*?)<\/video>/.exec(html);
  check('native playback is muted inline looping with explicit pause controls and no eager preload', !!video && ['muted', 'autoplay', 'loop', 'playsinline', 'controls'].every(key => new RegExp('(?:^|\\s)' + key + '(?:\\s|$)').test(video[1])) && video[1].includes('preload="none"') && !/aria-hidden|tabindex="-1"/.test(video[1]));
  const sources = [...html.matchAll(/<source\b([^>]*)>/g)];
  check('one exact self-hosted WebM source is selected only without reduced motion', sources.length === 1 && sources[0][1].includes('src="/static/wow/login/dark-portal.webm"') && sources[0][1].includes('type="video/webm"') && sources[0][1].includes('media="(prefers-reduced-motion: no-preference)"') && !/\ssrc=/.test(video?.[1] || ''));
  check('the separate static poster and video poster use the same exact local image', html.includes('<img class="login-portal-poster" src="/static/wow/login/dark-portal-poster.jpg"') && video?.[1].includes('poster="/static/wow/login/dark-portal-poster.jpg"'));
  const staticCsp = "default-src 'none'; script-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";
  check('login alone adds self media without scripts, connections or form authority', response.headers.get('Content-Security-Policy') === staticCsp + "; media-src 'self'" && render.LOGIN_POLICY_CSP === staticCsp + "; media-src 'self'");
  check('policy and form CSPs retain all their original exact directives', render.STATIC_POLICY_CSP === staticCsp && render.FORM_POLICY_CSP === staticCsp.replace("form-action 'none'", "form-action 'self'") && render.policyHeaders().get('Content-Security-Policy') === staticCsp && render.policyHeaders(true).get('Content-Security-Policy') === render.FORM_POLICY_CSP && privacy.headers.get('Content-Security-Policy') === staticCsp && terms.headers.get('Content-Security-Policy') === staticCsp);
  for (const value of ['on', ' ON ']) {
    const saved = access.siteSignIn(new Request('https://guild.example/', { headers: { 'Save-Data': value } }));
    const savedHtml = await saved.text();
    check('Save-Data ' + JSON.stringify(value) + ' omits all video/source/autoplay markup and leaves the static poster and sign-in', !/<video\b|<source\b|\sautoplay(?:\s|>)/i.test(savedHtml) && savedHtml.includes('class="login-portal-poster"') && savedHtml.includes('href="/auth/login"') && saved.headers.get('Content-Security-Policy') === render.LOGIN_POLICY_CSP);
  }
  const notSaved = await access.siteSignIn(new Request('https://guild.example/', { headers: { 'Save-Data': 'off' } })).text();
  check('other Save-Data values do not silently invent a data-saver signal', /<video\b/.test(notSaved));
  const savedHead = access.siteSignIn(new Request('https://guild.example/', { method: 'HEAD', headers: { 'Save-Data': 'on' } }));
  check('data-saver HEAD remains bodyless with unchanged status and security', savedHead.status === 200 && await savedHead.text() === '' && savedHead.headers.get('Content-Security-Policy') === render.LOGIN_POLICY_CSP && savedHead.headers.get('Cache-Control') === 'no-store, no-transform');
  const flashed = access.siteSignIn(request, 401, 'cancelled', ['entry-one=; Secure; Path=/', 'entry-two=; Secure; Path=/']);
  check('flash, status and both original cookie values survive presentation changes', flashed.status === 401 && (await flashed.text()).includes('Discord sign-in was cancelled. You can try again when ready.') && flashed.headers.getSetCookie().join('|') === 'entry-one=; Secure; Path=/|entry-two=; Secure; Path=/');
  const unknown = await access.siteSignIn(request, 200, '<script>bad</script>').text();
  check('unknown flash input cannot introduce markup or displace original entry copy', !unknown.includes('<script>') && unknown.includes('Membership of the Asmongold Discord server is required.'));
  check('the exact login allowlist excludes policy, private and neighboring paths', JSON.stringify(render.LOGIN_ASSETS) === '["/static/wow/login/dark-portal.webm","/static/wow/login/dark-portal-poster.jpg"]' && render.POLICY_ASSETS.length === 12 && !render.POLICY_ASSETS.some(value => value.includes('/login/')));
  check('no provider calls or source mutations occurred', network === 0 && [...originals].every(([file, bytes]) => fs.readFileSync(file).equals(bytes)));
  console.log(`\n${passed}/${total} login portal checks passed`);
  if (passed !== total) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
