// Presentation-only: actual entry/policy renderers and stylesheet, with no account/provider operation.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), ts = require('typescript');
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
  const cssStart = css.indexOf("/* Owner's .173 entry:");
  const portalCss = css.slice(cssStart);
  const request = new Request('https://guild.example/');
  // Preserve every original video/security assertion on the explicitly selected animation.
  const response = access.siteSignIn(request, 200, undefined, [], true), html = await response.text();
  const stillResponse = access.siteSignIn(request), stillHtml = await stillResponse.text();
  const stillMain = /<main\b[^>]*>([^]*?)<\/main>/.exec(stillHtml)?.[1] || '';
  const main = /<main\b[^>]*>([^]*?)<\/main>/.exec(html)?.[1] || '';
  const signInWords = value => value.replace(/<details\b[^]*?<\/details>/g, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const words = main.replace(/<details\b[^]*?<\/details>/g, "").replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  check('shared title retains the original Unicode separator', html.includes('<title>Olympus '+String.fromCharCode(0x2014)+' Enter Olympus</title>'));
  check('default entry contains exactly the owner-requested sign-in copy and no Army link', words === 'Enter Olympus The gates of Olympus Sign in with Discord to enter the guild hall. Membership of the Asmongold Discord server is required. Sign in with Discord' && !main.includes('href="/army"'));
  check('login card uses the owner tabard crest', main.includes('class="login-card-crest" src="/static/olympus-icon.png" alt="Olympus guild tabard"'));
  check('the removed entry-only sentence is absent', !html.includes('Only the sign-in and privacy pages are available before entry.'));
  check('the real sign-in remains a normal Discord-login link', response.status === 200 && /<a class="policy-button" href="\/auth\/login">Sign in with Discord<\/a>/.test(html));
  check("client portal is decorative, muted, inline and cannot capture interaction", html.includes('class="login-portal" aria-hidden="true"') && /<video[^>]+autoplay loop muted playsinline/.test(main) && !/<(?:button|input|canvas|iframe)\b/.test(main) && portalCss.includes("object-position:center;pointer-events:none"));
  check('entry retains a keyboard skip destination and visible focus styling', html.includes('class="skip-link" href="#policy-content"') && html.includes('<main id="policy-content" tabindex="-1">') && portalCss.includes(':focus-visible{outline:3px solid #e1ffbd'));
  check('the portal entry remains script-free without private boot or application source', !/<script\b|\son[a-z]+\s*=|id="boot"|\/static\/app\.(?:js|css)/i.test(html) && /script-src 'none'/.test(response.headers.get('Content-Security-Policy') || ''));
  check('privacy navigation remains hidden only on the entry', !html.includes('<nav aria-label="Policies">') && portalCss.includes('.olympus-policy:has(.portal-login)>.policy-header{display:none}'));
  check('original no-store, frame denial and no-index protections remain', response.headers.get('Cache-Control') === 'no-store, no-transform' && response.headers.get('X-Frame-Options') === 'DENY' && /noindex/.test(response.headers.get('X-Robots-Tag') || ''));
  const head = access.siteSignIn(new Request('https://guild.example/', { method: 'HEAD' }), 200, undefined, [], true);
  check('HEAD preserves status/security and has no body', head.status === 200 && (await head.text()) === '' && head.headers.get('Content-Security-Policy') === response.headers.get('Content-Security-Policy'));
  const denied = access.siteSignIn(request, 403, 'denied'), deniedText = await denied.text();
  check('an actual entry refusal preserves its status and account-control explanation', denied.status === 403 && deniedText.includes('This account cannot enter the guild site. Your privacy account connection remains available.') && deniedText.includes('href="/auth/login"'));
  const privacy = policies.policyResponse(new Request('https://guild.example/legal/privacy'), '/legal/privacy');
  const terms = policies.policyResponse(new Request('https://guild.example/legal/terms'), '/legal/terms');
  check('direct privacy and terms remain public and do not acquire portal markup', privacy.status === 200 && terms.status === 200 && !(await privacy.text()).includes('portal-login') && !(await terms.text()).includes('portal-login'));
  for (const retired of ['/privacy', '/terms']) {
    for (const method of ['GET', 'HEAD']) {
      const gone = policies.policyResponse(new Request('https://guild.example' + retired + '?state=do-not-echo', { method }), retired);
      check(retired + ' ' + method + ' is explicitly retired without redirect, cookie, login or policy content', gone.status === 410 && !gone.headers.has('Location') && !gone.headers.has('Set-Cookie') && await gone.text() === '' && gone.headers.get('Cache-Control') === 'no-store, no-transform' && gone.headers.get('Content-Security-Policy') === privacy.headers.get('Content-Security-Policy'));
    }
    const wrongMethod = policies.policyResponse(new Request('https://guild.example' + retired, { method: 'POST', body: 'ignored' }), retired);
    check(retired + ' retains the GET/HEAD-only method boundary', wrongMethod.status === 405 && wrongMethod.headers.get('Allow') === 'GET, HEAD' && !wrongMethod.headers.has('Location') && !wrongMethod.headers.has('Set-Cookie'));
  }
  const privacyActions = ['/privacy/access', '/privacy/signin', '/privacy/callback', '/privacy/access/export', '/privacy/access/erasure', '/privacy/contact', '/privacy/case', '/privacy/case/reply', '/privacy/account', '/privacy/account/export', '/privacy/account/site-erase', '/privacy/account/full-erase', '/privacy/account/erasure-status', '/privacy/account/bnet-unlink'];
  check('finite retirement leaves every existing privacy account/access/erasure handler outside the policy router', privacyActions.every(route => policies.policyResponse(new Request('https://guild.example' + route), route) === null));
  check('retirement does not introduce a prefix match over neighboring routes', ['/privacy/other', '/terms/other', '/legal/privacy/other'].every(route => policies.policyResponse(new Request('https://guild.example' + route), route) === null));
  const { validateHtml } = await import(require('node:url').pathToFileURL(path.join(root, 'scripts/policy-slots.mjs')).href);
  let retiredLinksRejected = true;
  for (const retired of ['/privacy', '/terms']) {
    try { validateHtml('<html><main><a href="' + retired + '">Old policy</a></main></html>', { mirror: true }); retiredLinksRejected = false; }
    catch (error) { retiredLinksRejected &&= error.message === 'undeclared_url'; }
  }
  check('policy generation rejects newly authored links to the retired root addresses', retiredLinksRejected && validateHtml('<html><main><a href="/legal/privacy">Privacy</a><a href="/legal/terms">Terms</a></main></html>', { mirror: true }));
  check('full-screen portal and centered card retain scrolling, safe areas and cover fit', cssStart >= 0 && portalCss.includes('min-height:100svh') && portalCss.includes('width:100%;max-width:none') && portalCss.includes('position:fixed;inset:0') && portalCss.includes('width:min(100%,36rem)') && portalCss.includes('align-content:center') && portalCss.includes('object-fit:cover;object-position:center') && portalCss.includes('env(safe-area-inset-bottom)') && !/overflow(?:-y)?:hidden|height:100vh/.test(portalCss));
  check('card stays independent and is never replaced by extreme-ratio art flow', portalCss.includes('background:linear-gradient(135deg,#121712f5,#0a100af5)') && !portalCss.includes('padding-top:calc(60svh') && !portalCss.includes('@media(min-aspect-ratio:4/1)') && html.indexOf('class="login-portal"') < html.indexOf('class="login-card"'));
  check('reduced motion retains the approved stills and hides optional motion without a poster download or script', portalCss.includes('@media(prefers-reduced-motion:reduce)') && !portalCss.includes('dark-portal-poster.jpg') && portalCss.includes('.login-motion{display:none}') && portalCss.includes('.login-portal-video{visibility:hidden}') && !/@keyframes|animation:|transition:/.test(portalCss));
  check('forced-colors restores system card and focus contrast', portalCss.includes('@media(forced-colors:active)') && portalCss.includes('border:2px solid CanvasText;background:Canvas;box-shadow:none') && portalCss.includes('color:CanvasText;text-shadow:none') && portalCss.includes('outline-color:Highlight'));
  check('portal media uses no remote source or CSS animation imitation', !/https?:|<script|@import|@keyframes|repeating-conic-gradient/i.test(portalCss) && !html.includes('login-portal-stone'));
  check('optional motion has a keyboard-operable native hide control while the decorative stills remain available', [...main.matchAll(/<video\b/g)].length === 1 && !/<(?:audio|iframe)\b/i.test(main) && /<details class="login-motion" open><summary>/.test(main) && main.includes('Hide animated background') && main.includes('Show animated background') && main.includes('<picture class="login-portal-art">') && portalCss.includes('.login-motion[open] .motion-hide{display:inline}'));
  check('optional motion and fallback use only the exact approved client-derived resources', !main.includes('dark-portal-poster.jpg') && main.includes('src="/static/wow/login/dark-portal.webm" type="video/webm" media="(prefers-reduced-motion: no-preference)"') && main.includes('olympus-dark-portal-wide.png') && main.includes('olympus-dark-portal-portrait.png'));
  const art = [['dark-portal.webm',3405603,'930ca8937c601245c7893cdc46750de3eca729c5fa9b91ef11dc08d87687521c'],['dark-portal-poster.jpg',132023,'c2c0820f50c6cf1944e88e5fd54f2b421df1955ebe7842cb976ac5599f191050']];
  const actualArt = art.every(([name,size,hash]) => { const b=fs.readFileSync(path.join(root,'public/static/wow/login',name)); return b.length===size && crypto.createHash('sha256').update(b).digest('hex')===hash; });
  const provenance = JSON.parse(fs.readFileSync(path.join(root,'public/static/wow/login/dark-portal-provenance.json')));
  check('actual media bytes and truthful original-client derivative provenance are retained', actualArt && provenance.kind==='local-render-from-blizzard-client-assets' && provenance.publisherOriginalMovie===false && provenance.sourceBuild==='1.15.9.70003');
  const approvedStills = [['olympus-dark-portal-wide.png',2972596,'17661fd0184e3a20fd6ed366673e64fc66baef41ed378bfdf5ab9f3ed0a16dc6',1916,821],['olympus-dark-portal-portrait.png',2803728,'218063b8ba4e5496c659a310cb46cd26d5c14d4784a7e66f9497d968e1679659',852,1847]];
  check('both approved .173 still files retain their exact PNG bytes and original dimensions', approvedStills.every(([name,size,hash,width,height])=>{const bytes=fs.readFileSync(path.join(root,'public/static/wow/login',name));return bytes.length===size&&crypto.createHash('sha256').update(bytes).digest('hex')===hash&&bytes.readUInt32BE(16)===width&&bytes.readUInt32BE(20)===height;}));
  // Fault-injected D1 return shapes exercise the actual one-bit public renderer;
  // the separate admitted API leaf covers real SQLite storage and setting authority.
  const publicBitSQL = "SELECT value FROM site_settings WHERE key='loginAnimation' AND value='1'";
  function publicBit(value, failure) {
    const queries=[];
    return {queries,env:{DB:{prepare(sql){queries.push(sql);if(failure==='prepare')throw Error('synthetic public bit prepare failure');return {async first(){if(failure==='first')throw Error('synthetic public bit read failure');return value;}};}}}};
  }
  for(const [label,value,failure] of [['missing',null],['wrong string',{value:'true'}],['numeric',{value:1}],['boolean',{value:true}],['malformed row',{}],['prepare error',null,'prepare'],['read error',null,'first']]){
    const fixture=publicBit(value,failure),out=await access.siteSignInWithMedia(request,fixture.env),body=await out.text();
    check('public '+label+' falls back to stills with only the exact nonpersonal one-bit lookup',body===stillHtml&&fixture.queries.length===1&&fixture.queries[0]===publicBitSQL&&!body.includes('synthetic public bit'));
  }
  {const fixture=publicBit({value:'1'}),out=await access.siteSignInWithMedia(request,fixture.env);check('the only accepted public bit selects the unchanged explicit animation document',await out.text()===html&&fixture.queries.length===1&&fixture.queries[0]===publicBitSQL);}
  {const fixture=publicBit(null,'prepare'),out=await access.siteSignInWithMedia(new Request('https://guild.example/',{headers:{'Save-Data':'on'}}),fixture.env);check('Save-Data bypasses even a broken D1 binding and renders the protected stills with zero lookups',await out.text()===stillHtml&&fixture.queries.length===0);}
  {const fixture=publicBit(null,'first'),out=await access.siteSignInWithMedia(request,fixture.env,403,'denied',['entry-still=; Secure; Path=/']);const body=await out.text();check('public bit failure preserves refusal status, fixed flash, original cookies and protected still markup',out.status===403&&body.includes('This account cannot enter the guild site.')&&!/<video\b/.test(body)&&out.headers.getSetCookie().join('|')==='entry-still=; Secure; Path=/'&&fixture.queries.length===1);}
  const staticCsp = "default-src 'none'; script-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";
  check("only login adds same-origin media while preserving every static denial", response.headers.get("Content-Security-Policy") === staticCsp + "; media-src 'self'" && render.LOGIN_POLICY_CSP === staticCsp + "; media-src 'self'");
  check('policy and form CSPs retain all their original exact directives', render.STATIC_POLICY_CSP === staticCsp && render.FORM_POLICY_CSP === staticCsp.replace("form-action 'none'", "form-action 'self'") && render.policyHeaders().get('Content-Security-Policy') === staticCsp && render.policyHeaders(true).get('Content-Security-Policy') === render.FORM_POLICY_CSP && privacy.headers.get('Content-Security-Policy') === staticCsp && terms.headers.get('Content-Security-Policy') === staticCsp);
  check('direct owner choice keeps the approved .173 still pair as the default, without a video', stillResponse.status === 200 && !/<video\b/.test(stillMain) && stillMain.includes('class="login-portal-art"') && stillMain.includes('srcset="/static/wow/login/olympus-dark-portal-portrait.png" width="852" height="1847"') && stillMain.includes('src="/static/wow/login/olympus-dark-portal-wide.png" alt="" aria-hidden="true" width="1916" height="821"'));
  check('still and explicit animation retain identical sign-in copy, no script, no private boot and original protected headers', signInWords(stillMain) === words && !/<script\b|\son[a-z]+\s*=|id="boot"|\/static\/app\.(?:js|css)/i.test(stillHtml) && stillResponse.headers.get('Content-Security-Policy') === render.LOGIN_POLICY_CSP && stillResponse.headers.get('Cache-Control') === response.headers.get('Cache-Control') && stillResponse.headers.get('Vary') === 'Cookie, Save-Data');
  for (const value of ['on', 'ON', ' On ']) {
    const saved = access.siteSignIn(new Request('https://guild.example/', { headers: { 'Save-Data': value } }), 200, undefined, [], true);
    const savedHtml = await saved.text();
    check("Save-Data " + JSON.stringify(value) + " retains the approved still document even when animation was selected", savedHtml === stillHtml && !/<video\b/.test(savedHtml) && savedHtml.includes('href="/auth/login"') && saved.headers.get("Content-Security-Policy") === render.LOGIN_POLICY_CSP);
  }
  for (const value of ['off']) {
    const notSaved = await access.siteSignIn(new Request('https://guild.example/', { headers: { 'Save-Data': value } }), 200, undefined, [], true).text();
    check("other Save-Data " + JSON.stringify(value) + " cannot introduce a different media source", notSaved === html && [...notSaved.matchAll(/<source\b/g)].length === 2);
  }
  const savedHead = access.siteSignIn(new Request('https://guild.example/', { method: 'HEAD', headers: { 'Save-Data': 'on' } }), 200, undefined, [], true);
  check('data-saver HEAD remains bodyless with unchanged status and security', savedHead.status === 200 && await savedHead.text() === '' && savedHead.headers.get('Content-Security-Policy') === render.LOGIN_POLICY_CSP && savedHead.headers.get('Cache-Control') === 'no-store, no-transform');
  const flashed = access.siteSignIn(request, 401, 'cancelled', ['entry-one=; Secure; Path=/', 'entry-two=; Secure; Path=/']);
  check('flash, status and both original cookie values survive presentation changes', flashed.status === 401 && (await flashed.text()).includes('Discord sign-in was cancelled. You can try again when ready.') && flashed.headers.getSetCookie().join('|') === 'entry-one=; Secure; Path=/|entry-two=; Secure; Path=/');
  const unknown = await access.siteSignIn(request, 200, '<script>bad</script>').text();
  check('unknown flash input cannot introduce markup or displace original entry copy', !unknown.includes('<script>') && unknown.includes('Membership of the Asmongold Discord server is required.'));
  check("exact login allowlist includes only the approved still pair and optional client video/poster", JSON.stringify(render.LOGIN_ASSETS) === '["/static/wow/login/dark-portal.webm","/static/wow/login/dark-portal-poster.jpg","/static/wow/login/olympus-dark-portal-wide.png","/static/wow/login/olympus-dark-portal-portrait.png"]' && render.POLICY_ASSETS.length === 13 && render.POLICY_ASSETS.includes("/static/olympus-icon.png") && !render.POLICY_ASSETS.some(value => value.includes("/login/")));
  const social = load('./site-brand').olympusSocialMetadata();
  check('generic Discord preview identifies only the Olympus sign-in destination', social.includes('property="og:type" content="website"') && social.includes('property="og:site_name" content="Olympus"') && social.includes('property="og:title" content="Olympus — World of Warcraft: Forever"') && social.includes('property="og:url" content="https://olympus.roachcouncil.com/"'));
  check('preview uses the existing crisp Olympus crest with exact dimensions and alt text', social.includes('property="og:image" content="https://olympus.roachcouncil.com/static/olympus-icon.png"') && social.includes('property="og:image:width" content="250"') && social.includes('property="og:image:height" content="250"') && social.includes('property="og:image:type" content="image/png"') && social.includes('property="og:image:alt"'));
  const crest = fs.readFileSync(path.join(root, 'public/static/olympus-icon.png'));
  check('actual shared preview PNG is the finite public branding asset, not a widened Army exception', crest.readUInt32BE(16) === 250 && crest.readUInt32BE(20) === 250 && render.POLICY_ASSETS.filter(p => p === '/static/olympus-icon.png').length === 1 && !render.POLICY_ASSETS.some(p => p.includes('/army-live/') || p.endsWith('/app.js')));
  check('generic summary cards are server-rendered without relaxing the script-free gate', html.includes(social) && social.includes('name="twitter:card" content="summary"') && !/<script\b|onload=|iframe|\/api\/army|reportedCharacters|session_version/.test(social));
  const privateURL = new Request('https://guild.example/army/report?private=never-preview-this', {headers:{Cookie:'private-cookie-placeholder', 'User-Agent':'Discordbot/2.0'}});
  const privateEntry = await access.siteSignIn(privateURL,401).text();
  check('preview canonical URL never reflects a private route, query or cookie', privateEntry.includes(social) && !privateEntry.includes('never-preview-this') && !privateEntry.includes('private-cookie-placeholder') && !privateEntry.includes('https://guild.example/army'));
  const ordinary = await access.siteSignIn(new Request('https://guild.example/',{headers:{'User-Agent':'Mozilla/5.0'}})).text();
  const bot = await access.siteSignIn(new Request('https://guild.example/',{headers:{'User-Agent':'Discordbot/2.0'}})).text();
  check('Discord receives the same protected sign-in document as ordinary anonymous visitors', bot === ordinary && !bot.includes('id="boot"') && !bot.includes('href="/army"'));
  check('no provider calls or source mutations occurred', network === 0 && [...originals].every(([file, bytes]) => fs.readFileSync(file).equals(bytes)));
  console.log(`\n${passed}/${total} login portal checks passed`);
  if (passed !== total) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
