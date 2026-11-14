// Subsequent fresh issuer visit on the same actual D1 after the original result.
import {fixture280 as originalFixture280} from './routine_delete_custody280_fixture.mjs';
import {createPrivacyWriteAdmissionDatabase} from '../src/privacy-write-admission.ts';
import {runNativeSubject232} from '../src/full-release-pass.ts';
import {callBudget} from '../src/roles.ts';
import {NATIVE_SCOPE232} from '../src/native-rank-reconciliation232.ts';
import {CANONICAL_RANKS233} from '../src/canonical-ranks233.ts';
import {DIRECTIVE_CANONICAL_PROFILE} from '../src/native-rank-schemes.ts';
const H=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');
export function fixture280(seed){const original=originalFixture280(seed),spent=new Set();return{async fetch(request,bindings){
 const path=new URL(request.url).pathname;if(!path.startsWith('/followup/'))return original.fetch(request,bindings);
 const kind=path.slice('/followup/'.length),allowed=['transition-ban','transition-policy','transition-delete-lost','transition-confirm-lost','transition-receipt-lost','transition-404-ban'];if(request.method!=='POST'||!allowed.includes(kind)||spent.has(kind))return new Response(null,{status:404});spent.add(kind);
 const raw=bindings['DB_'+kind.replaceAll('-','_')],subject=seed.tables.find(t=>t.name==='pending').rows[0].discord_id,scope={version:1,...NATIVE_SCOPE232},closure={...JSON.parse(seed.config.SHARED_MEMBERSHIP230_CLOSURE_JSON),debtPredicateSHA256:'2bc8a653168cd702a7804fc1631abc6a68ee8200c500fb1345b3087387b89f86',createdAt:seed.now-3600,expiresAt:seed.now-3300},closureJSON=JSON.stringify(closure);
 const config={...seed.config,VERIFY_NATIVE_SCOPE:JSON.stringify(scope),NATIVE_RANK_SYNC232:'off',QR_NATIVE_ROLE_MAP:'off',FULL_RELEASE_ROLES:'off',CANONICAL_RANKS233:JSON.stringify({version:2,enabled:true,profile:DIRECTIVE_CANONICAL_PROFILE,guildId:seed.config.GUILD_ID,ranks:CANONICAL_RANKS233.map(r=>({...r,permissions:'0'}))}),SHARED_MEMBERSHIP230_CLOSURE_JSON:closureJSON,SHARED_MEMBERSHIP230_CLOSURE_SHA256:await H(closureJSON),DISCORD_BOT_TOKEN:seed.config.DISCORD_BOT_TOKEN+'-'+kind};
 const env={...config,DB:createPrivacyWriteAdmissionDatabase(raw,'writer','recorded-live-pre-seal-20261017',config.PRIVACY_WRITE_ADMISSION_EPOCH)},old=await raw.prepare("SELECT * FROM role_settlements WHERE desired=0 AND attempts=1 ORDER BY created_at,id LIMIT 1").first();if(!old)return Response.json({error:'original_delete_missing'},{status:500});
 // Deliberate synthetic unban / configuration re-enable. No proof/code replay.
 await env.DB.prepare('UPDATE members SET banned=0 WHERE discord_id=?1').bind(subject).run();
 const outcome=await runNativeSubject232(env,subject,callBudget(env)),after=await raw.prepare('SELECT * FROM role_settlements WHERE id=?1').bind(old.id).first(),control=await raw.prepare('SELECT active,nonce,purpose FROM privacy_write_admission').first();
 return Response.json({kind,actualLocalWorkerdD1:true,newOriginalRoutineCapture:true,proofReplay:false,old,after,originalDeleteByteIdentical:JSON.stringify(old)===JSON.stringify(after),outcome,control});
}};}
