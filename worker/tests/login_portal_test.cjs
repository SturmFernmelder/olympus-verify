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
  const access = load('./site-access'), policies = load('./policies');
  const css = fs.readFileSync(path.join(root, 'public/static/policies.css'), 'utf8');
  const cssStart = css.indexOf("/* Owner's 19 October 2026 entry:");
  const portalCss = css.slice(cssStart);
  const request = new Request('https://guild.example/');
  const response = access.siteSignIn(request), html = await response.text();
  const main = /<main\b[^>]*>([^]*?)<\/main>/.exec(html)?.[1] || '';
  const words = main.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  check('default entry contains exactly the owner-requested main copy', words === 'Enter Olympus The gates of Olympus Sign in with Discord to enter the guild hall. Membership of the Asmongold Discord server is required. Sign in with Discord');
  check('the removed entry-only sentence is absent', !html.includes('Only the sign-in and privacy pages are available before entry.'));
  check('the real sign-in remains a normal Discord-login link', response.status === 200 && /<a class="policy-button" href="\/auth\/login">Sign in with Discord<\/a>/.test(html));
  check('decorative portal is hidden from accessibility and cannot capture interaction', html.includes('<div class="login-portal" aria-hidden="true">') && !/<(?:button|input|canvas|video|iframe)\b/.test(main) && portalCss.includes('pointer-events:none'));
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
  check('the centered card and portal use viewport-bounded mobile dimensions', cssStart >= 0 && portalCss.includes('align-content:center;min-height:100svh') && portalCss.includes('width:min(100%,36rem)') && portalCss.includes('@media(max-width:35rem)') && portalCss.includes('width:94vw;height:90svh'));
  check('a separate dark card shields text from the moving decorative background', portalCss.includes('main:has(.portal-login)::before') && portalCss.includes('z-index:-1;border-radius:inherit;background:linear-gradient') && portalCss.includes('login-portal{position:fixed;z-index:-2;pointer-events:none'));
  check('reduced-motion mode makes both decorative layers static', /@media\(prefers-reduced-motion:reduce\)\{[^]*?login-portal::before[^]*?login-portal::after\{animation:none;transform:none\}/.test(portalCss));
  check('forced-colors mode removes the decoration and restores system contrast', portalCss.includes('@media(forced-colors:active)') && portalCss.includes('login-portal{display:none}') && portalCss.includes('background:Canvas') && portalCss.includes('color:CanvasText;text-shadow:none'));
  check('the original CSS-only portal introduces no external media or new image path', !/https?:|url\(|<script|@import/i.test(portalCss) && portalCss.includes('repeating-conic-gradient') && portalCss.includes('@keyframes olympus-portal-turn'));
  check('no provider calls or source mutations occurred', network === 0 && [...originals].every(([file, bytes]) => fs.readFileSync(file).equals(bytes)));
  console.log(`\n${passed}/${total} login portal checks passed`);
  if (passed !== total) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
