export const PURPOSES = ['account_write','role_grant','role_remove','erasure','beta_reset','restore','bot_post'] as const;
export type Purpose = typeof PURPOSES[number];
export type AccountState = 'active'|'retiring'|'retired';
export interface Result {meta:{changes?:number};results?:unknown[]}
export interface Statement {bind(...values:unknown[]):Statement;run():Promise<Result>;first<T>():Promise<T|null>;all<T>():Promise<{results:T[]}>}
export interface Database {prepare(sql:string):Statement;batch(statements:Statement[]):Promise<Result[]>}
export interface Capture {accountId:string;accountGeneration:string;purpose:Purpose;purposeGeneration:string;epoch:string}
export interface AccountRow {account_id:string;generation:string;state:AccountState;revision:number}
export const DB_NOW="CAST(strftime('%s','now') AS INTEGER)";
export function id(value:string):void {if(typeof value!=='string'||!/^\d{17,20}$/.test(value))throw Error('invalid_account');}
export function token(value:string):void {if(typeof value!=='string'||!/^[0-9a-f]{32}$/.test(value))throw Error('invalid_generation');}
export function digest(value:string):void {if(typeof value!=='string'||!/^[0-9a-f]{64}$/.test(value))throw Error('invalid_digest');}
export function purpose(value:string):asserts value is Purpose {if(!(PURPOSES as readonly string[]).includes(value))throw Error('invalid_purpose');}
export function randomGeneration():string {return [...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function sha256(value:string):Promise<string> {const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('');}
/** Read only the finite own data fields. Accessors, symbol keys and omitted fields are refused without invocation. */
export function snapshotDataFields(input:unknown,fields:readonly string[],error:string):Readonly<Record<string,unknown>> {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error(error);
 const keys=Reflect.ownKeys(input);
 if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))throw Error(error);
 const out:Record<string,unknown>={};
 for(const key of fields){const d=Object.getOwnPropertyDescriptor(input,key);if(!d||!Object.hasOwn(d,'value'))throw Error(error);out[key]=d.value;}
 return Object.freeze(out);
}
/** A scanner never calls an input array's map/iterator or reads an indexed getter. */
export function snapshotDataArray(input:unknown,maximum:number,error:string):readonly unknown[] {
 if(!Array.isArray(input))throw Error(error);
 const length=Object.getOwnPropertyDescriptor(input,'length');
 if(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value<0||length.value>maximum)throw Error(error);
 const size=length.value as number,keys=Reflect.ownKeys(input);
 if(keys.length!==size+1||keys.some(k=>typeof k!=='string'||(k!=='length'&&(!/^(0|[1-9]\d*)$/.test(k)||Number(k)>=size))))throw Error(error);
 const out:unknown[]=[];for(let i=0;i<size;i++){const d=Object.getOwnPropertyDescriptor(input,String(i));if(!d||!Object.hasOwn(d,'value'))throw Error(error);out.push(d.value);}
 return Object.freeze(out);
}
export function validate(c:Capture):void {snapshotCapture(c);}
/** Copy each primitive once before any asynchronous work. Shape validation must
 * inspect the original input so extra fields cannot disappear during copying.
 */
export function snapshotCapture(c:Capture):Capture {
 const d=snapshotDataFields(c,['accountId','accountGeneration','purpose','purposeGeneration','epoch'],'invalid_capture');
 const captured={accountId:d.accountId,accountGeneration:d.accountGeneration,purpose:d.purpose,purposeGeneration:d.purposeGeneration,epoch:d.epoch} as Capture;
 id(captured.accountId);token(captured.accountGeneration);token(captured.purposeGeneration);token(captured.epoch);purpose(captured.purpose);
 return Object.freeze(captured);
}
export const values=(c:Capture):unknown[]=>[c.accountId,c.accountGeneration,c.purpose,c.purposeGeneration,c.epoch];
/** Parameter positions1..5: account, account generation, purpose, purpose generation, global epoch.
 * Only trusted authored SQL may embed this constant. A prior read never substitutes for this write-time predicate.
 * Retirement permits a current role_remove/erasure purpose; it permits no ordinary profile or role_grant effect.
 */
export const ACCOUNT_FENCE=`EXISTS(SELECT 1 FROM account_generations a
 JOIN account_purpose_generations p ON p.account_id=a.account_id AND p.account_generation=a.generation
 JOIN generation_control g ON g.singleton=1
 WHERE a.account_id=?1 AND a.generation=?2 AND p.purpose=?3 AND p.generation=?4
 AND g.epoch=?5 AND g.restore_hold=0 AND
 (a.state='active' OR (a.state='retiring' AND p.purpose IN ('role_remove','erasure'))))`;
