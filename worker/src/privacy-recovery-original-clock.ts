/** Original local clock data only. This module issues no lease, receipt or time authority. */
import {RecoveryFloorHeld} from './privacy-recovery-held';
type Slot=Readonly<{receiver:object;key:string;value:unknown;chain:readonly Readonly<{ref:object;prototype:object|null;descriptor:PropertyDescriptor|undefined}>[]}>;
const held=():never=>{throw new RecoveryFloorHeld();};
const same=(a:PropertyDescriptor|undefined,b:PropertyDescriptor|undefined):boolean=>a===undefined?b===undefined:!!b&&['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(a[k as keyof PropertyDescriptor],b[k as keyof PropertyDescriptor]));
function captureDataSlot(receiver:object,key:string):Slot{
 const chain:{ref:object;prototype:object|null;descriptor:PropertyDescriptor|undefined}[]=[];let owner:object|null=receiver;
 for(let depth=0;owner&&depth<32;depth++){
  const descriptor=Object.getOwnPropertyDescriptor(owner,key),prototype=Object.getPrototypeOf(owner);
  chain.push(Object.freeze({ref:owner,prototype,descriptor:descriptor?Object.freeze({...descriptor}):undefined}));
  if(descriptor){if(!Object.hasOwn(descriptor,'value'))return held();return Object.freeze({receiver,key,value:descriptor.value,chain:Object.freeze(chain)});}
  owner=prototype;
 }
 return held();
}
function checkSlot(slot:Slot):void{
 let owner:object|null=slot.receiver;
 for(const captured of slot.chain){if(owner!==captured.ref||Object.getPrototypeOf(captured.ref)!==captured.prototype||!same(Object.getOwnPropertyDescriptor(captured.ref,slot.key),captured.descriptor))return held();owner=captured.prototype;}
}
// Capture synchronously at source import. Late accessors are inspected as descriptors, never invoked.
const dateSlot=captureDataSlot(globalThis,'Date');if(typeof dateSlot.value!=='function')held();
const OriginalDate=dateSlot.value as Function,nowSlot=captureDataSlot(OriginalDate,'now');if(typeof nowSlot.value!=='function')held();
const OriginalNow=nowSlot.value as Function,datePrototypeDescriptor=Object.getOwnPropertyDescriptor(OriginalDate,'prototype');
if(!datePrototypeDescriptor||!Object.hasOwn(datePrototypeDescriptor,'value')||!datePrototypeDescriptor.value||typeof datePrototypeDescriptor.value!=='object')held();
const originalDatePrototype=datePrototypeDescriptor!.value as object,datePrototypeParent=Object.getPrototypeOf(originalDatePrototype),nowFunctionPrototype=Object.getPrototypeOf(OriginalNow);
const originalDatePrototypeDescriptor=Object.freeze({...datePrototypeDescriptor!});
export function assertOriginalRecoveryClock():void{
 checkSlot(dateSlot);checkSlot(nowSlot);
 if(!same(Object.getOwnPropertyDescriptor(OriginalDate,'prototype'),originalDatePrototypeDescriptor)||Object.getPrototypeOf(originalDatePrototype)!==datePrototypeParent||Object.getPrototypeOf(OriginalNow)!==nowFunctionPrototype)return held();
}
/** Caller retains its original created/expires/last values; a fresh reading does not renew them. */
export function originalRecoveryClockMilliseconds():number{
 assertOriginalRecoveryClock();const milliseconds=Reflect.apply(OriginalNow,OriginalDate,[]);assertOriginalRecoveryClock();
 if(typeof milliseconds!=='number'||milliseconds%1!==0||milliseconds<0||milliseconds>253402300799999)return held();
 return milliseconds;
}
