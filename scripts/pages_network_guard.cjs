'use strict';
const deny=()=>{throw new Error('unmapped network refused by Pages reconciliation harness');};
for(const name of ['node:http','node:https','node:net','node:tls']){
 const module=require(name);
 for(const key of ['request','get','connect','createConnection'])if(typeof module[key]==='function')module[key]=deny;
}
globalThis.fetch=deny;
