'use strict';
// Evidence-only two-line inverse. Every consumer still compiles its ACTUAL current prefix.
const {createHash}=require('node:crypto');
const CURRENT217='05fafa7e0989e6ef29d432c9b53d99dcc22b00ac14a9d25526a7852798f75a04';
const HISTORICAL217='bd05ccad75ca07e71647d20b9169636ed1d73d33ee2bbb3a7c1e763a8121c1c5';
const EDITS217=Object.freeze([
  {
    "current": "  const re = /^([a-zA-Z][\\w-]*)|#([\\w-]+)|\\.([\\w-]+)|\\[([\\w-]+)(?:=(?:\"([^\"]*)\"|([^\\]\\s\"\\']+)))?\\]/g;\n",
    "historical": "  const re = /^([a-zA-Z][\\w-]*)|#([\\w-]+)|\\.([\\w-]+)|\\[([\\w-]+)(?:=\"([^\"]*)\")?\\]/g;\n"
  },
  {
    "current": "    if (m[1]) out.tag = m[1].toUpperCase(); else if (m[2]) out.id = m[2]; else if (m[3]) out.classes.push(m[3]); else out.attrs.push([m[4], m[5] === undefined && m[6] === undefined ? null : (m[5] ?? m[6]).replace(/\\\\(.)/g, \"$1\")]);\n",
    "historical": "    if (m[1]) out.tag = m[1].toUpperCase(); else if (m[2]) out.id = m[2]; else if (m[3]) out.classes.push(m[3]); else out.attrs.push([m[4], m[5] === undefined ? null : m[5].replace(/\\\\(.)/g, \"$1\")]);\n"
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
 if(Buffer.byteLength(current,'utf8')!==29127||hash217(current)!==CURRENT217)throw Error('frontend217_current_prefix_drift');
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
module.exports=Object.freeze({historicalFrontendPrefix217,historicalBoardNativePrefix217});
