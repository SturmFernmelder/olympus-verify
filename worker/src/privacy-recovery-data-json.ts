/** Canonical data bytes only. These helpers issue no receipt, proof, MAC, or Native write authority. */
import {RecoveryFloorHeld} from './privacy-recovery-held';
const held=():never=>{throw new RecoveryFloorHeld();};
type Chain=Readonly<{ref:object;prototype:object|null;descriptor:PropertyDescriptor|undefined}>;
type Slot=Readonly<{receiver:object;key:PropertyKey;value:unknown;chain:readonly Chain[];check:()=>void}>;
const same=(a:PropertyDescriptor|undefined,b:PropertyDescriptor|undefined):boolean=>a===undefined?b===undefined:!!b&&['value','get','set','writable','enumerable','configurable'].every(k=>Object.is(a[k as keyof PropertyDescriptor],b[k as keyof PropertyDescriptor]));
function originalSlot(receiver:object,key:PropertyKey,dataOnly=false):Slot{
 const chain:Chain[]=[];let p:object|null=receiver;
 for(let depth=0;p&&depth<32;depth++){const d=Object.getOwnPropertyDescriptor(p,key),next=Object.getPrototypeOf(p);chain.push(Object.freeze({ref:p,prototype:next,descriptor:d?Object.freeze({...d}):undefined}));
  if(d){if(dataOnly&&!Object.hasOwn(d,'value')||!Object.hasOwn(d,'value')&&(typeof d.get!=='function'||d.set!==undefined))return held();const check=()=>{let current:object|null=receiver;for(const s of chain){if(current!==s.ref||Object.getPrototypeOf(s.ref)!==s.prototype||!same(Object.getOwnPropertyDescriptor(s.ref,key),s.descriptor))return held();current=s.prototype;}};check();const value=Object.hasOwn(d,'value')?d.value:Reflect.apply(d.get!,receiver,[]);check();return Object.freeze({receiver,key,value,chain:Object.freeze(chain),check});}p=next;
 }return held();
}
type Getter=Readonly<{get:Function;check:()=>void}>;
function originalGetter(receiver:object,key:PropertyKey):Getter{const chain:Chain[]=[];let p:object|null=receiver;for(let depth=0;p&&depth<32;depth++){const d=Object.getOwnPropertyDescriptor(p,key),next=Object.getPrototypeOf(p);chain.push(Object.freeze({ref:p,prototype:next,descriptor:d?Object.freeze({...d}):undefined}));if(d){if(Object.hasOwn(d,'value')||typeof d.get!=='function'||d.set!==undefined)return held();const check=()=>{let current:object|null=receiver;for(const s of chain){if(current!==s.ref||Object.getPrototypeOf(s.ref)!==s.prototype||!same(Object.getOwnPropertyDescriptor(s.ref,key),s.descriptor))return held();current=s.prototype;}};check();return Object.freeze({get:d.get,check});}p=next;}return held();}
const cryptoSlot=originalSlot(globalThis,'crypto');if(!cryptoSlot.value||typeof cryptoSlot.value!=='object')held();
const subtleSlot=originalSlot(cryptoSlot.value as object,'subtle');if(!subtleSlot.value||typeof subtleSlot.value!=='object')held();
const digestSlot=originalSlot(subtleSlot.value as object,'digest',true);if(typeof digestSlot.value!=='function')held();
const jsonSlot=originalSlot(globalThis,'JSON',true);if(!jsonSlot.value||typeof jsonSlot.value!=='object')held();
const primitiveJSONSlot=originalSlot(jsonSlot.value as object,'stringify',true),parseSlot=originalSlot(jsonSlot.value as object,'parse',true);if(typeof primitiveJSONSlot.value!=='function'||typeof parseSlot.value!=='function')held();
const arraySlot=originalSlot(globalThis,'Array',true);if(typeof arraySlot.value!=='function')held();const arrayBrandSlot=originalSlot(arraySlot.value as Function,'isArray',true);if(typeof arrayBrandSlot.value!=='function')held();
const bufferClassSlot=originalSlot(globalThis,'ArrayBuffer',true),byteClassSlot=originalSlot(globalThis,'Uint8Array',true),encoderClassSlot=originalSlot(globalThis,'TextEncoder',true);if(typeof bufferClassSlot.value!=='function'||typeof byteClassSlot.value!=='function'||typeof encoderClassSlot.value!=='function')held();
const BufferClass=bufferClassSlot.value as ArrayBufferConstructor,ByteClass=byteClassSlot.value as Uint8ArrayConstructor;
const bufferPrototypeSlot=originalSlot(BufferClass,'prototype',true),bytePrototypeSlot=originalSlot(ByteClass,'prototype',true),encoderPrototypeSlot=originalSlot(encoderClassSlot.value as Function,'prototype',true);
if(!bufferPrototypeSlot.value||typeof bufferPrototypeSlot.value!=='object'||!bytePrototypeSlot.value||typeof bytePrototypeSlot.value!=='object'||!encoderPrototypeSlot.value||typeof encoderPrototypeSlot.value!=='object')held();
const bufferLength=originalGetter(bufferPrototypeSlot.value as object,'byteLength'),byteLength=originalGetter(bytePrototypeSlot.value as object,'byteLength');
const encoder=Reflect.construct(encoderClassSlot.value as Function,[]) as object,encoderEncode=originalSlot(encoder,'encode',true);if(typeof encoderEncode.value!=='function'||Object.getPrototypeOf(encoder)!==encoderPrototypeSlot.value)held();
/** Only retained descriptors/chains are consulted; live global constructor or JSON accessors never execute. */
export function assertOriginalRecoveryDataIntrinsics():void{cryptoSlot.check();subtleSlot.check();digestSlot.check();jsonSlot.check();primitiveJSONSlot.check();parseSlot.check();arraySlot.check();arrayBrandSlot.check();bufferClassSlot.check();byteClassSlot.check();encoderClassSlot.check();bufferPrototypeSlot.check();bytePrototypeSlot.check();encoderPrototypeSlot.check();bufferLength.check();byteLength.check();encoderEncode.check();}
/** Native captured Array brand is data only; no live global Array lookup or shaped authority. */
export function recoveryIsDataArray(value:unknown):value is unknown[]{assertOriginalRecoveryDataIntrinsics();const result=Reflect.apply(arrayBrandSlot.value as Function,arrayBrandSlot.receiver,[value]);assertOriginalRecoveryDataIntrinsics();if(typeof result!=='boolean')return held();return result;}
function encoded(text:string):Uint8Array{if(typeof text!=='string'||text.length>2000000)return held();assertOriginalRecoveryDataIntrinsics();const bytes=Reflect.apply(encoderEncode.value as Function,encoder,[text]);assertOriginalRecoveryDataIntrinsics();if(!bytes||typeof bytes!=='object'||Object.getPrototypeOf(bytes)!==bytePrototypeSlot.value)return held();const length=Reflect.apply(byteLength.get,bytes,[]);if(typeof length!=='number'||!Number.isSafeInteger(length)||length<0||length>2000000)return held();return bytes as Uint8Array;}
/** Native captured parser only. Parsed data carries no receipt or capability authority. */
export function recoveryParseDataJSON(raw:string):unknown{if(typeof raw!=='string'||raw.length>2000000)return held();assertOriginalRecoveryDataIntrinsics();encoded(raw);const value=Reflect.apply(parseSlot.value as Function,parseSlot.receiver,[raw]);assertOriginalRecoveryDataIntrinsics();return value;}
type ArraySnapshot=Readonly<{ref:object;prototype:object|null;keys:readonly (string|symbol)[];descriptors:readonly PropertyDescriptor[]}>;
function encode(value:unknown,originals:ArraySnapshot[],depth=0):string{
 assertOriginalRecoveryDataIntrinsics();if(depth>16)return held();if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)){const text=Reflect.apply(primitiveJSONSlot.value as Function,primitiveJSONSlot.receiver,[value]);if(typeof text!=='string')return held();return text;}
 if(!recoveryIsDataArray(value))return held();const keys=Reflect.ownKeys(value),lengthDescriptor=Object.getOwnPropertyDescriptor(value,'length');if(!lengthDescriptor||!Object.hasOwn(lengthDescriptor,'value'))return held();const length=lengthDescriptor.value;if(typeof length!=='number'||!Number.isSafeInteger(length)||length<0||length>10000||keys.length!==length+1)return held();
 if(originals.some(s=>s.ref===value))return held();const descriptors=keys.map(k=>Object.getOwnPropertyDescriptor(value,k));if(descriptors.some(d=>!d||!Object.hasOwn(d,'value')))return held();originals.push(Object.freeze({ref:value,prototype:Object.getPrototypeOf(value),keys:Object.freeze(keys),descriptors:Object.freeze(descriptors.map(d=>Object.freeze({...d!})))}));
 let text='[';for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!Object.hasOwn(d,'value'))return held();if(i)text+=',';text+=encode(d.value,originals,depth+1);}return text+']';
}
function snapshot(value:unknown):Readonly<{text:string;check:()=>void}>{const originals:ArraySnapshot[]=[],text=encode(value,originals);encoded(text);const check=()=>{assertOriginalRecoveryDataIntrinsics();for(const s of originals){const keys=Reflect.ownKeys(s.ref);if(Object.getPrototypeOf(s.ref)!==s.prototype||keys.length!==s.keys.length||s.keys.some(k=>!keys.includes(k)))return held();for(let i=0;i<s.keys.length;i++)if(!same(Object.getOwnPropertyDescriptor(s.ref,s.keys[i]!),s.descriptors[i]!))return held();}};check();return Object.freeze({text,check});}
/** Scalars/nested arrays with exact dense own data slots; inherited toJSON/getters/iterators are never consulted. */
export function recoveryScalarArrayJSON(value:unknown):string{return snapshot(value).text;}
/** SHA is data only; it cannot certify a profile or mint a branded observation. */
export async function recoveryScalarArraySha256(value:unknown):Promise<string>{const original=snapshot(value);original.check();const out=await Reflect.apply(digestSlot.value as Function,subtleSlot.value,['SHA-256',encoded(original.text)]);original.check();if(!out||typeof out!=='object'||Object.getPrototypeOf(out)!==bufferPrototypeSlot.value||Reflect.ownKeys(out).length||Reflect.apply(bufferLength.get,out,[])!==32)return held();let h='';const b=new ByteClass(out as ArrayBuffer);for(let i=0;i<32;i++)h+=b[i]!.toString(16).padStart(2,'0');original.check();return h;}

/** Primitive UTF-8 size only; cannot issue any receipt or operation authority. */
export function recoveryDataUtf8Length(text:string):number{const bytes=encoded(text);assertOriginalRecoveryDataIntrinsics();return Reflect.apply(byteLength.get,bytes,[]) as number;}
/** Exact text SHA, distinct from hashing its JSON-quoted representation. */
export async function recoveryDataStringSha256(text:string):Promise<string>{if(typeof text!=='string'||text.length>2000000)return held();assertOriginalRecoveryDataIntrinsics();const out=await Reflect.apply(digestSlot.value as Function,subtleSlot.value,['SHA-256',encoded(text)]);assertOriginalRecoveryDataIntrinsics();if(!out||typeof out!=='object'||Object.getPrototypeOf(out)!==bufferPrototypeSlot.value||Reflect.ownKeys(out).length||Reflect.apply(bufferLength.get,out,[])!==32)return held();let h='';const b=new ByteClass(out as ArrayBuffer);for(let i=0;i<32;i++)h+=b[i]!.toString(16).padStart(2,'0');assertOriginalRecoveryDataIntrinsics();return h;}

/** Native encoder output only; no signing, receipt or operation authority. */
export function recoveryDataUtf8Bytes(text:string):Uint8Array{return encoded(text);}
