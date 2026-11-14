// Actual response factories, synthetic text. No OAuth activation or external I/O.
export async function exercise280(json,page){
 const cases=[],check=(name,pass)=>cases.push({name,pass:!!pass});
 const response=json({synthetic:true},429);
 check('bot JSON keeps its status and body',response.status===429&&(await response.json()).synthetic===true);
 check('bot JSON explicitly disables storage/transformation',response.headers.get('Cache-Control')==='no-store, no-transform');
 check('bot JSON prevents content sniffing',response.headers.get('X-Content-Type-Options')==='nosniff');
 check('bot JSON does not send a referrer',response.headers.get('Referrer-Policy')==='no-referrer');
 const title='Synthetic <title> "quoted"',body='A <img src=x onerror=alert(1)> & a /verify <character> prompt';
 const result=page(title,body,409,{'Set-Cookie':'synthetic=gone; Max-Age=0; HttpOnly; Secure; SameSite=Lax'}),html=await result.text();
 check('OAuth result treats its title as text',html.includes('Synthetic &lt;title&gt; &quot;quoted&quot;')&&!html.includes('<h1>Synthetic <title>'));
 check('OAuth result treats provider text as text',html.includes('&lt;img src=x onerror=alert(1)&gt; &amp;')&&!html.includes('<img src=x'));
 check('literal command placeholder is escaped once',html.includes('/verify &lt;character&gt;')&&!html.includes('&amp;lt;character'));
 check('result keeps its status/content type/cookie',result.status===409&&result.headers.get('Content-Type')==='text/html; charset=utf-8'&&result.headers.get('Set-Cookie').startsWith('synthetic=gone;'));
 check('OAuth result has inert-content CSP and authored inline-style policy',result.headers.get('Content-Security-Policy')==="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
 check('OAuth result cannot be framed or cached',result.headers.get('X-Frame-Options')==='DENY'&&result.headers.get('Cache-Control')==='no-store, no-transform');
 return Response.json({scope:'Actual bot JSON and pure OAuth result factories under Workerd, synthetic text only; no full OAuth/provider/native/production acceptance.',checks:cases.length,ok:cases.every(x=>x.pass),cases});
}
