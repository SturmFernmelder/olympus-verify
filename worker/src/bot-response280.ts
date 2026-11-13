/** Bot/OAuth responses only. The member site's existing delivery/cache policy is unchanged. */
export function botResponseHeaders280(extra:Record<string,string>={},html=false):Headers {
 const headers=new Headers(extra);
 headers.set('Cache-Control','no-store, no-transform');
 headers.set('X-Content-Type-Options','nosniff');
 headers.set('Referrer-Policy','no-referrer');
 headers.set('X-Frame-Options','DENY');
 headers.set('Strict-Transport-Security','max-age=31536000');
 headers.set('X-Robots-Tag','noindex, nofollow, noarchive, nosnippet, noimageindex');
 // These legacy OAuth documents use only authored inline CSS. No scripts,
 // frames, forms, images or external subresources are needed by their content.
 if(html)headers.set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
 return headers;
}
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Both inputs are text. Structured, already escaped interstitial HTML has its separate renderer. */
export function oauthResultPage280(title:string,body:string,status:number,extraHeaders:Record<string,string>={}):Response {
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Olympus — ${escape(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#1e1f22;color:#e3e5e8;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:32rem;padding:2rem}h1{color:#c9a227}</style>
<main><h1>${escape(title)}</h1><p>${escape(body)}</p></main></html>`;
 return new Response(html,{status,headers:botResponseHeaders280({'Content-Type':'text/html; charset=utf-8',...extraHeaders},true)});
}
