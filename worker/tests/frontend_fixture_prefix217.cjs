'use strict';
// Evidence-only inverse edits. Every consumer still compiles its ACTUAL current prefix.
// The first two (14 Nov 2026) are the lines our frontend_check.cjs migration 390f337/d92d021 added for the candidate's
// pages: ParentNode.append and requestAnimationFrame/cancelAnimationFrame in the page sandbox. They are removed first,
// which gives the prefix pinned before that migration (29,319 bytes, a885f7f5...); the three older edits follow.
const {createHash}=require('node:crypto');
const CURRENT217='078e1b3ae5d4ba1e79cc04cbc0c213ac544c479d6ba8645ac85abd7214c8d5f8';
const HISTORICAL217='bd05ccad75ca07e71647d20b9169636ed1d73d33ee2bbb3a7c1e763a8121c1c5';
const EDITS217=Object.freeze([
  {
    "current": "  append(...nodes) { for (const c of nodes) this.appendChild(typeof c === \"string\" ? new Text(c) : c); } // ParentNode.append, as a browser has it (our 4c7b542 uses it)\n",
    "historical": ""
  },
  {
    "current": "  // RC-272 (our 925a505, 12 Nov 2026): the Community section row now schedules its sideways scroll with\n  // requestAnimationFrame, which every browser has; the minimal window gets it as one later frame.\n  sandbox.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);\n  sandbox.cancelAnimationFrame = (handle) => clearTimeout(handle);\n",
    "historical": ""
  },
  {
    "current": "  const re = /^([a-zA-Z][\\w-]*)|#([\\w-]+)|\\.([\\w-]+)|\\[([\\w-]+)(?:=(?:\"([^\"]*)\"|([^\\]\\s\"\\']+)))?\\]/g;\n",
    "historical": "  const re = /^([a-zA-Z][\\w-]*)|#([\\w-]+)|\\.([\\w-]+)|\\[([\\w-]+)(?:=\"([^\"]*)\")?\\]/g;\n"
  },
  {
    "current": "    if (m[1]) out.tag = m[1].toUpperCase(); else if (m[2]) out.id = m[2]; else if (m[3]) out.classes.push(m[3]); else out.attrs.push([m[4], m[5] === undefined && m[6] === undefined ? null : (m[5] ?? m[6]).replace(/\\\\(.)/g, \"$1\")]);\n",
    "historical": "    if (m[1]) out.tag = m[1].toUpperCase(); else if (m[2]) out.id = m[2]; else if (m[3]) out.classes.push(m[3]); else out.attrs.push([m[4], m[5] === undefined ? null : m[5].replace(/\\\\(.)/g, \"$1\")]);\n"
  },
  {
    "current": "    this.dataset = new Proxy({}, { set(t, k, v) { t[k] = String(v); el.attributes[\"data-\" + String(k).replace(/[A-Z]/g, (c) => \"-\" + c.toLowerCase())] = String(v); return true; }, get(t, k) { if (k in t) return t[k]; const a = el.attributes[\"data-\" + String(k).replace(/[A-Z]/g, (c) => \"-\" + c.toLowerCase())]; return a === undefined ? undefined : String(a); }, deleteProperty(t, k) { const deleted = Reflect.deleteProperty(t, k); if (deleted) delete el.attributes[\"data-\" + String(k).replace(/[A-Z]/g, (c) => \"-\" + c.toLowerCase())]; return deleted; } }); // data-* attributes, as a browser does (set through the proxy or as an attribute)\n",
    "historical": "    this.dataset = new Proxy({}, { set(t, k, v) { t[k] = String(v); el.attributes[\"data-\" + String(k).replace(/[A-Z]/g, (c) => \"-\" + c.toLowerCase())] = String(v); return true; }, get(t, k) { if (k in t) return t[k]; const a = el.attributes[\"data-\" + String(k).replace(/[A-Z]/g, (c) => \"-\" + c.toLowerCase())]; return a === undefined ? undefined : String(a); } }); // data-* attributes, as a browser does (set through the proxy or as an attribute)\n"
  }
].map(Object.freeze));
const hash217=value=>createHash('sha256').update(value).digest('hex');
function historicalFrontendPrefix217(current){
 if(typeof current!=='string')throw Error('frontend217_prefix_type');
 let historical=current;
 for(const edit of EDITS217){
  if(historical.split(edit.current).length!==2)throw Error('frontend217_prefix_context_not_unique');
  historical=historical.replace(edit.current,edit.historical);
 }
 if(Buffer.byteLength(current,'utf8')!==29851||hash217(current)!==CURRENT217)throw Error('frontend217_current_prefix_drift');
 if(Buffer.byteLength(historical,'utf8')!==29077||hash217(historical)!==HISTORICAL217)throw Error('frontend217_historical_prefix_drift');
 return historical;
}

// Board-only Native compatibility: actual form-aware source executes; inverse is hash data only.
const BOARD_NATIVE217=Object.freeze({
  "current": " f.call=async(method,p,{cookie,body,form,headers={},host='guild.example'}={})=>{if(body!==undefined&&form!==undefined)throw Error('ambiguous fixture request body');active=f;const h=new Headers(headers);h.set('CF-Connecting-IP','192.0.2.'+(++requestSerial));if(cookie)h.set('Cookie',cookie);if(method!=='GET'&&method!=='HEAD'){h.set('Origin',BASE);h.set('X-Olympus','2');}if(body!==undefined)h.set('Content-Type','application/json');if(form!==undefined)h.set('Content-Type','application/x-www-form-urlencoded');const pending=[];const response=await index.fetch(new Request('https://'+host+p,{method,headers:h,...(form!==undefined?{body:new URLSearchParams(form)}:body===undefined?{}:{body:JSON.stringify(body)})}),f.env,{waitUntil(promise){pending.push(Promise.resolve(promise));}});for(const promise of pending)await promise;return response;};\n",
  "historical": " f.call=async(method,p,{cookie,body,headers={},host='guild.example'}={})=>{active=f;const h=new Headers(headers);h.set('CF-Connecting-IP','192.0.2.'+(++requestSerial));if(cookie)h.set('Cookie',cookie);if(method!=='GET'&&method!=='HEAD'){h.set('Origin',BASE);h.set('X-Olympus','2');}if(body!==undefined)h.set('Content-Type','application/json');const pending=[];const response=await index.fetch(new Request('https://'+host+p,{method,headers:h,...(body===undefined?{}:{body:JSON.stringify(body)})}),f.env,{waitUntil(promise){pending.push(Promise.resolve(promise));}});for(const promise of pending)await promise;return response;};\n"
});
function historicalBoardNativePrefix217(current){
 if(typeof current!=='string')throw Error('board217_native_prefix_type');
 if(current.split(BOARD_NATIVE217.current).length!==2)throw Error('board217_native_context_not_unique');
 if(Buffer.byteLength(current,'utf8')!==13278||hash217(current)!=='572066b31422497e89314f47c972536517104de10521a45434b4f041f6ad02a3')throw Error('board217_native_current_prefix_drift');
 const historical=current.replace(BOARD_NATIVE217.current,BOARD_NATIVE217.historical);
 if(Buffer.byteLength(historical,'utf8')!==13061||hash217(historical)!=='83b4fe71835e987ede23c482568ab067ce84700b51cca4b4efac6119f262896a')throw Error('board217_native_historical_prefix_drift');
 return historical;
}
// Whole-fixture authority includes the Native main's reviewed form initiation.
// Both inverse contexts remain data; consumers compile only the current setup.
const TREASURY_NATIVE_ENTRY217=Object.freeze({
 "current": " {const f=fixture(),entryPage=await f.call('GET','/privacy/signin'),entryHtml=await entryPage.text(),entryToken=/name=\"csrf\" value=\"([^\"]+)\"/.exec(entryHtml)[1],entryCookie=Object.entries(cookies(entryPage)).map(([k,v])=>k+'='+v).join('; ');\n const start=await f.call('POST','/privacy/signin',{cookie:entryCookie,form:{csrf:entryToken}}),u=new URL(start.headers.get('Location')),flow=cookies(start),flowCookie=Object.entries(flow).map(([k,v])=>k+'='+v).join('; ');\n",
 "historical": " {const f=fixture(),start=await f.call('GET','/privacy/signin'),u=new URL(start.headers.get('Location')),flow=cookies(start),flowCookie=Object.entries(flow).map(([k,v])=>k+'='+v).join('; ');\n"
});
function historicalTreasuryNativeFixture217(current){
 if(typeof current!=='string')throw Error('treasury217_native_fixture_type');
 let historical=current;
 for(const edit of [BOARD_NATIVE217,TREASURY_NATIVE_ENTRY217]){
  if(historical.split(edit.current).length!==2)throw Error('treasury217_native_context_not_unique');
  historical=historical.replace(edit.current,edit.historical);
 }
 if(Buffer.byteLength(current,'utf8')!==38590||hash217(current)!=='e0242a0b2640c3c2770d2a0605b5ce267728624b7bdddf1b54e38bc646f6747c')throw Error('treasury217_native_current_fixture_drift');
 if(Buffer.byteLength(historical,'utf8')!==38099||hash217(historical)!=='0f2fec9685d3a22ceb3f8684ec72d913a749d5ad33cb9b07bc62d9c96d87e98e')throw Error('treasury217_native_historical_fixture_drift');
 return historical;
}
module.exports=Object.freeze({historicalFrontendPrefix217,historicalBoardNativePrefix217,historicalTreasuryNativeFixture217});
