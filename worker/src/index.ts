/**
 * olympus-verify Worker — routes
 *   POST /interactions          Discord HTTP interactions (slash commands, buttons)
 *   GET  /linked-role           start the Discord Linked Role flow
 *   GET  /oauth/callback        Discord OAuth2 callback
 *   GET  /bnet/link             Battle.net login callback (fallback when Discord hides the connection; needs BNET_CLIENT_ID/SECRET)
 *   POST /ingest/verify         watcher: a code arrived in game (whisper/mail)
 *   POST /ingest/roster         watcher: full roster export from SavedVariables
 *   POST /ingest/events         watcher: addon events (invite fired, note set)
 *   GET  /queue                 watcher: invites to write into OlympusQueue.lua; also carries its relay presence (relays.ts)
 *   POST /queue/written         watcher: ids it wrote to the queue file
 *   GET  /health
 *
 * On SITE_HOST (guild.roachcouncil.com, build .41) the guild site answers instead: site.ts. Its stylesheet, script and
 * images are static assets (public/static, [assets] in wrangler.toml); since .51 every request runs this code first
 * (run_worker_first), which hands /static/* on the site host to the assets binding and lets no other host have them.
 *
 * This module's named exports are functions only: workerd refuses an entry that exports a scalar (.51).
 */
import type { Env } from "./env";
import {nativeErasureMode,nativeServingEnvironment} from './privacy-native-mode';
import { unverifiedReport } from "./unverified";
import { handleInteraction, USER_MENU_LOOKUP } from "./interactions";
import { INTERACTION_FAILED, json, readInteractionBody, reply, verifyInteraction, type Interaction } from "./discord";
import { errorRef, idNamespace, logPath } from "./log";
import { audit, now } from "./db";
import { getQueue, postEvents, postQueueWritten, postRoster, postVerify, sweepInviteQueue, watcherAuthorized } from "./ingest";
import { PrivacySiteRequestHeld, readPrivacySubject, privacyBoundSubjectEnv } from './privacy-serving-authority';
import { guildMap } from "./guildmap";
import { backfillOptions, backfillRoles } from "./backfill";
import { sweepMemberRoles } from "./restore";
import { continueRosterEffects } from "./roster";
import {runServingErasureJob} from './privacy-serving-jobs';
import {captureServingRetentionSchedule,sweepServingRetention} from './privacy-retention';
import {captureMembershipDecisionOrigin,captureRejectionExpiryInvocation,sweepRejectionExpiry} from './privacy-rejection-decision';
import { bnetLinkCallback, linkedRoleCallback, startLinkedRole } from "./oauth";
import { bnetLoginState } from "./bnet-switch";
import { sweepRenameHolds } from "./rename-review";
import { policyResponse } from "./policies";
import { CAMERA_PAGE_PATH, memberSiteGate, privateCameraPageAsset, privateSiteAsset } from './site-access';
import { forwardPrivateProductionControl } from './privacy-private-control-adapter';
import { LOGIN_ASSETS, POLICY_ASSETS, policyHeaders } from "./policy-render";
import { ensureSchema } from "./schema";
import { recordRelay, relayReportFromQuery, relayStatus, ticketsReady } from "./relays";
import { handleIntros, INTROS, INTROS_COMMAND, parseChannels } from "./intros";
import { handleSite } from "./site";
import { rateLimited, siteAdmins, siteHost, siteLegacyHosts, securityHeaders } from "./site-core";
import { handleLookup, isAsmongoldLookup, LOOKUP_COMMAND } from "./lookup";
import { recordNames, refreshNames, verifiedOnRoster } from "./names";
import {captureSiteOAuthOrigin,type SiteOAuthOrigin} from './privacy-serving-site-oauth';
import {captureServingSiteMeOrigin,dispatchServingSiteMe,siteMeServingMode,type SiteMeOrigin} from './privacy-serving-site-me';
import { autoQueueReserved } from "./site-queue";
import { bnetRetentionStatus, legacyApiCounts, purgeBattleNetData } from "./bnet-retention";
import { callBudget, rolesStatus, type CallBudget } from "./roles";
import { sweepCommunityProfiles } from "./community-directory";
import { sweepCommunityEvents } from "./community-events";
import { runEventReminders } from "./community-event-reminders";
import { sweepCommunityTrials } from "./community-trials";
import { sweepCommunityRestrictions } from "./community-restrictions";
import { departureIntake, sweepCommunityDepartures } from "./community-departures";
import { openWeeklyObligations, sweepCommunityContributions } from "./community-contributions";
import { sweepCommunityPrivacy } from "./community-privacy-intake";
import { runOfficerDigest } from "./community-digest";
import { communityFeatures } from "./community-context";
import { guildSeats } from "./guild-seats";
import { newsCron } from "./site-news";
import {BETA_RESET_CRON,BETA_RESET_SCHEDULE_QUALIFIED,runBetaResetSlice} from './beta-reset';
import {resetGuardEnabled,captureBetaRoleDispatch,type BetaRoleDispatch} from './beta-reset-policy';
import {createPrivacyWriteAdmissionDatabase,isPrivacyWriteAdmissionDatabase,PrivacyWriteAdmissionHeld} from './privacy-write-admission';
import {captureHandlerServingOrigin,registerHandlerInteractionNames,type HandlerServingOrigin} from './privacy-serving-production-origin';
import {EPOCH2_SCHEDULE_QUALIFIED,captureOriginalRosterSchedule,originalRosterScheduleFacts,type OriginalRosterSchedule} from './scheduled-budget';
import {RecoveryFloorHeld} from './privacy-recovery-floor';
import {originalRecoveryClockMilliseconds} from './privacy-recovery-original-clock';
import {recoveryScalarArrayJSON} from './privacy-recovery-data-json';
import {captureGlobalServingEntry,dispatchGlobalServingEntry,deferOriginalServing,assertGlobalServingDispatch,globalServingMode,preflightOriginalServingRequest,originalGlobalScheduledPhysicalCostObservation} from './privacy-global-serving-origin';
import { captureLaneConfig, FRESH_AUDIT, type LaneCapture } from './full-release-roles';
import { countStatements, type Admission } from './roster-effects';

/** No installer runs here. An enabled but absent/unknown current-source installation refuses at ensureSchema. */
function writeAdmissionEnv(env:Env):Env{
  if(env.PRIVACY_WRITE_ADMISSION_LAYOUT==='recorded-live-pre-seal-20261017'&&globalServingMode(env)!=='off')throw new PrivacyWriteAdmissionHeld('pre_seal_compatibility_requires_off');
  return env.PRIVACY_WRITE_ADMISSION_ENABLED==='true'&&!isPrivacyWriteAdmissionDatabase(env.DB)
    ?{...env,DB:createPrivacyWriteAdmissionDatabase(env.DB,'writer',env.PRIVACY_WRITE_ADMISSION_LAYOUT??'canonical',env.PRIVACY_WRITE_ADMISSION_EPOCH??'')}:env;
}

/** Sole mint is the real exported scheduled callback below; no tuple/capability registrar is exported. */
declare const originalScheduledCallbackBrand:unique symbol;
type OriginalScheduledCallback=Readonly<{[originalScheduledCallbackBrand]:true}>;
type ScheduledCapture=Readonly<{controller:object;ctx:ExecutionContext;cron:string;scheduledTime:number;createdAt:number;expiresAt:number;serial:number;binding:string;check:()=>void}>;
type ScheduledNode=Readonly<{ref:object;prototype:object|null;keys:readonly PropertyKey[];descriptors:readonly PropertyDescriptor[]}>;
const scheduledCaptures=new WeakMap<OriginalScheduledCallback,ScheduledCapture>(),scheduledControllers=new WeakMap<object,OriginalScheduledCallback>(),scheduledContexts=new WeakMap<object,OriginalScheduledCallback>();
let scheduledSerial=0;
const scheduledCostConstraints=new WeakMap<OriginalScheduledCallback,Readonly<{binding:string;check:()=>void}>>();
const scheduledDescriptor=Object.getOwnPropertyDescriptor,scheduledPrototype=Object.getPrototypeOf,scheduledKeys=Reflect.ownKeys,scheduledApply=Reflect.apply,scheduledFreeze=Object.freeze,scheduledSafeInteger=Number.isSafeInteger,scheduledHasOwn=Object.hasOwn,scheduledFloor=Math.floor,scheduledPromise=Promise,scheduledResolve=Promise.resolve;
const scheduledPins=[{owner:Object,key:'getOwnPropertyDescriptor',fn:scheduledDescriptor},{owner:Object,key:'getPrototypeOf',fn:scheduledPrototype},{owner:Reflect,key:'ownKeys',fn:scheduledKeys},{owner:Reflect,key:'apply',fn:scheduledApply},{owner:Object,key:'freeze',fn:scheduledFreeze},{owner:Number,key:'isSafeInteger',fn:scheduledSafeInteger},{owner:Object,key:'hasOwn',fn:scheduledHasOwn},{owner:Math,key:'floor',fn:scheduledFloor},{owner:scheduledPromise,key:'resolve',fn:scheduledResolve}].map(p=>({...p,descriptor:scheduledDescriptor(p.owner,p.key)!}));
function scheduledHeld():never{throw new RecoveryFloorHeld();}
function scheduledSame(a:PropertyDescriptor|undefined,b:PropertyDescriptor):boolean{return !!a&&a.value===b.value&&a.get===b.get&&a.set===b.set&&a.writable===b.writable&&a.enumerable===b.enumerable&&a.configurable===b.configurable;}
function scheduledIntrinsics():void{for(let n=0;n<scheduledPins.length;n++){const p=scheduledPins[n]!;if(!scheduledSame(scheduledDescriptor(p.owner,p.key),p.descriptor)||p.descriptor.value!==p.fn)return scheduledHeld();}}
function scheduledGraph(receiver:object):()=>void{
 scheduledIntrinsics();const nodes:ScheduledNode[]=[];let ref:object|null=receiver;
 for(let depth=0;ref!==null;depth++){if(depth>=8)return scheduledHeld();const keys=scheduledKeys(ref),descriptors:PropertyDescriptor[]=[];if(keys.length>64)return scheduledHeld();for(let n=0;n<keys.length;n++){const d=scheduledDescriptor(ref,keys[n]!);if(!d)return scheduledHeld();descriptors[descriptors.length]=scheduledFreeze({...d});}const prototype=scheduledPrototype(ref);nodes[nodes.length]=scheduledFreeze({ref,prototype,keys:scheduledFreeze(keys),descriptors:scheduledFreeze(descriptors)});ref=prototype;}
 return()=>{scheduledIntrinsics();let current:object|null=receiver;for(let n=0;n<nodes.length;n++){const node=nodes[n]!,keys=scheduledKeys(node.ref);if(current!==node.ref||scheduledPrototype(node.ref)!==node.prototype||keys.length!==node.keys.length)return scheduledHeld();for(let k=0;k<keys.length;k++)if(keys[k]!==node.keys[k]||!scheduledSame(scheduledDescriptor(node.ref,keys[k]!),node.descriptors[k]!))return scheduledHeld();current=node.prototype;}if(current!==null)return scheduledHeld();scheduledIntrinsics();};
}
function captureOriginalScheduledCallback(controller:unknown,ctx:ExecutionContext):OriginalScheduledCallback{
 scheduledIntrinsics();if(!controller||typeof controller!=='object'||!ctx||typeof ctx!=='object'||scheduledControllers.has(controller)||scheduledContexts.has(ctx))return scheduledHeld();
 const keys=scheduledKeys(controller),time=scheduledDescriptor(controller,'scheduledTime'),cron=scheduledDescriptor(controller,'cron'),prototype=scheduledPrototype(controller),contextPrototype=scheduledPrototype(ctx);
 if(keys.length!==2||!(keys[0]==='scheduledTime'&&keys[1]==='cron'||keys[0]==='cron'&&keys[1]==='scheduledTime')||!time||!cron||!scheduledHasOwn(time,'value')||!scheduledHasOwn(cron,'value')||time.writable!==false||cron.writable!==false||time.enumerable!==true||cron.enumerable!==true||time.configurable!==true||cron.configurable!==true||typeof time.value!=='number'||!scheduledSafeInteger(time.value)||time.value<0||time.value>253402300799999||(cron.value!=='*/15 * * * *'&&cron.value!==BETA_RESET_CRON)||!prototype||!contextPrototype)return scheduledHeld();
 if(scheduledDescriptor(ctx,'waitUntil'))return scheduledHeld();const retry=scheduledDescriptor(prototype,'noRetry'),wait=scheduledDescriptor(contextPrototype,'waitUntil'),ctor=scheduledDescriptor(prototype,'constructor');
 if(!retry||!wait||!ctor||!scheduledHasOwn(retry,'value')||!scheduledHasOwn(wait,'value')||!scheduledHasOwn(ctor,'value')||typeof retry.value!=='function'||typeof wait.value!=='function'||typeof ctor.value!=='function')return scheduledHeld();
 const ctorPrototype=scheduledDescriptor(ctor.value,'prototype');if(!ctorPrototype||!scheduledHasOwn(ctorPrototype,'value')||ctorPrototype.value!==prototype)return scheduledHeld();
 const controllerCheck=scheduledGraph(controller),contextCheck=scheduledGraph(ctx),retryCheck=scheduledGraph(retry.value),waitCheck=scheduledGraph(wait.value),createdMs=originalRecoveryClockMilliseconds(),createdAt=(createdMs-createdMs%1000)/1000;
 if(!scheduledSafeInteger(createdAt)||createdAt<1||createdAt>253402300499||!scheduledSafeInteger(scheduledSerial+1))return scheduledHeld();
 let valid=true,last=createdMs;const expiresAt=createdAt+300;
 const check=()=>{if(!valid)return scheduledHeld();try{scheduledIntrinsics();controllerCheck();contextCheck();retryCheck();waitCheck();if(!scheduledSame(scheduledDescriptor(ctor.value,'prototype'),ctorPrototype))return scheduledHeld();const now=originalRecoveryClockMilliseconds();if(now<last||now<createdMs||now>=expiresAt*1000)return scheduledHeld();last=now;}catch(error){valid=false;throw error;}};
 check();if(scheduledApply(retry.value,controller,[])!==undefined)return scheduledHeld();check();const resolved=scheduledApply(scheduledResolve,scheduledPromise,[]);if(scheduledApply(wait.value,ctx,[resolved])!==undefined)return scheduledHeld();check();
 const serial=++scheduledSerial,binding=recoveryScalarArrayJSON(['original-scheduled-callback-v1',cron.value,time.value,createdAt,expiresAt,serial]),cap=scheduledFreeze({}) as OriginalScheduledCallback;
 const state=scheduledFreeze({controller,ctx,cron:cron.value as string,scheduledTime:time.value as number,createdAt,expiresAt,serial,binding,check});scheduledCaptures.set(cap,state);scheduledControllers.set(controller,cap);scheduledContexts.set(ctx,cap);return cap;
}
function originalScheduledCallback(cap:OriginalScheduledCallback,controller:unknown,ctx:ExecutionContext):ScheduledCapture{const s=scheduledCaptures.get(cap);if(!s||s.controller!==controller||s.ctx!==ctx||scheduledControllers.get(s.controller)!==cap||scheduledContexts.get(ctx)!==cap)return scheduledHeld();s.check();return s;}
/** Read-only same-object lookup for original local callback custody; copied facts cannot mint an entry. */
export function originalScheduledCallbackObservation(controller:object,ctx:ExecutionContext):Readonly<{scope:'original_scheduled_callback';cron:string;scheduledTime:number;createdAt:number;expiresAt:number;serial:number;normalScheduledEntryQualified:false;providerOrDeploymentQualified:false}>{const cap=scheduledControllers.get(controller);if(!cap)return scheduledHeld();const s=originalScheduledCallback(cap,controller,ctx);return scheduledFreeze({scope:'original_scheduled_callback' as const,cron:s.cron,scheduledTime:s.scheduledTime,createdAt:s.createdAt,expiresAt:s.expiresAt,serial:s.serial,normalScheduledEntryQualified:false as const,providerOrDeploymentQualified:false as const});}
/** Readonly costs require this exact callback's private cap and exact retained entry restriction. */
export function originalScheduledCallbackPhysicalCostObservation(controller:object,ctx:ExecutionContext){const cap=scheduledControllers.get(controller);if(!cap)return scheduledHeld();const s=originalScheduledCallback(cap,controller,ctx),constraint=scheduledCostConstraints.get(cap);if(!constraint)return scheduledHeld();const facts=originalGlobalScheduledPhysicalCostObservation(ctx,constraint);if(facts.binding!==s.binding)return scheduledHeld();return scheduledFreeze({...facts,scope:'original_scheduled_callback_physical_cost' as const,createdAt:s.createdAt,expiresAt:s.expiresAt,serial:s.serial});}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    env=nativeServingEnvironment(env);
    const roleDispatch=captureBetaRoleDispatch(env);
    let originalRequest:ReturnType<typeof preflightOriginalServingRequest>|undefined;
    try{if(globalServingMode(env)==='configured')originalRequest=preflightOriginalServingRequest(request);}catch{return json({error:'original_serving_held'},503); }
    const url = new URL(originalRequest?.url??request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    // Build .49: which host this request came in on is decided first, before the database is touched, so a request on
    // an unknown host (the Worker is reachable on every hostname Cloudflare routes to it) costs nothing and gets nothing.
    const host = classifyHost(env, url.hostname);
    if (host === "misconfigured") return json({ error: "misconfigured" }, 503);
    if (host === "unknown") return new Response("unknown host", { status: 404 });
    if (host === "legacy") {
      // .51: a sign-in or OAuth path is never forwarded (Codex's review of .49, 1 Oct 00:04 UTC): the state cookie it
      // depends on belongs to the old host, and its query carries ?code= and ?state=. The browser is sent to start
      // again at the site's front page, with nothing from the old request and nothing a cache may keep.
      if (AUTH_PATHS.test(path)) return new Response(null, { status: 302, headers: { Location: `https://${siteHost(env)}/`, "Cache-Control": "no-store, no-transform", "Referrer-Policy": "no-referrer" } });
      // A former site host: a browser GET is sent to the same page on the current host (path and query kept; the
      // fragment never leaves the browser, so #/roles/<key> links survive); anything else is refused. Cacheable a day.
      if (request.method === "GET" || request.method === "HEAD") {
        return new Response(null, { status: 301, headers: { Location: `https://${siteHost(env)}${url.pathname}${url.search}`, "Cache-Control": "public, max-age=86400" } });
      }
      return new Response("not found", { status: 404 });
    }
    if (host === 'site' && url.protocol === 'http:' && url.hostname !== 'localhost') {
      url.protocol = 'https:';
      return new Response(null, { status: 301, headers: securityHeaders(new Headers({ Location: url.toString() })) });
    }
    // Fixed private control transport remains reachable during a CLOSED business floor. The separate operator
    // authenticates the original command before DO/D1 effects; its secret never belongs to this public Worker.
    if (host === 'bot' && path.startsWith('/private-production-control/')) return forwardPrivateProductionControl(request, env, path);
    // Public policies and their exact finite official-art closure are the login-wall exceptions.
    const policy = policyResponse(request, path);
    if (policy) {
      // the site's HTTP-to-HTTPS upgrade (site.ts), kept for these paths too
      if (host === "site" && url.protocol === "http:" && url.hostname !== "localhost") {
        url.protocol = "https:";
        const headers = policyHeaders(); headers.set("Location", url.toString()); return new Response(null, { status: 301, headers });
      }
      return policy;
    }
    if ((POLICY_ASSETS as readonly string[]).includes(path)) {
      if (request.method === "GET" || request.method === "HEAD") return privateSiteAsset(await env.ASSETS.fetch(request));
      const headers = policyHeaders(); headers.set("Allow", "GET, HEAD"); return new Response("method not allowed", { status: 405, headers });
    }
    // .171: a finite SITE_HOST-only login decoration, never a public /static/ directory exception.
    if (host === 'site' && (LOGIN_ASSETS as readonly string[]).includes(path)) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const headers = policyHeaders(); headers.set('Allow', 'GET, HEAD');
        return new Response('method not allowed', { status: 405, headers });
      }
      const asset = privateSiteAsset(await env.ASSETS.fetch(request));
      return new Response(request.method === 'HEAD' ? null : asset.body, { status: asset.status, statusText: asset.statusText, headers: asset.headers });
    }
    // Existing browser-only privacy controls remain available after the site account is gone.
    // This exact page/module pair has no server-data fetch, form submission or serving authority.
    if (host === 'site' && (path === '/static/qr-beta-window-data.html' || path === '/static/qr-beta-window.mjs')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('method not allowed', { status: 405, headers: securityHeaders(new Headers({ Allow: 'GET, HEAD' })) });
      const asset = privateSiteAsset(await env.ASSETS.fetch(request));
      const headers = new Headers(asset.headers);
      headers.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
      return new Response(request.method === 'HEAD' ? null : asset.body, { status: asset.status, statusText: asset.statusText, headers });
    }
    // Private files are delivered below inside the same original serving root and admitted membership read.
    // Capture the global original transport before narrow OAuth/Names/Me factories and before any await.
    if(globalServingMode(env)==='configured'&&request.method==='GET'&&path==='/health')return json({ok:true,build:BUILD,d1:'not_checked'});
    let globalEntry:ReturnType<typeof captureGlobalServingEntry>;try{globalEntry=captureGlobalServingEntry(env,ctx,'fetch',request);}catch{return json({error:'original_serving_held'},503); }env=globalEntry.env;request=globalEntry.request!;
    // Capture native/host/version/method custody before any facade substitution or await.
    // Only this Names boundary is managed; missing bindings hold Names without a legacy fallback.
    try{captureMembershipDecisionOrigin(request,env);}catch{return new Response(JSON.stringify({error:'original_membership_decision_held'}),{status:409,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
    let namesOrigin:HandlerServingOrigin|undefined;
    if(host==="bot"&&request.method==="POST"&&path==="/interactions"){try{namesOrigin=captureHandlerServingOrigin(request,env,ctx);}catch{}}
    let siteOAuthOrigin:SiteOAuthOrigin|undefined;
    if(host==="site"&&request.method==="GET"&&path==="/auth/callback"){try{siteOAuthOrigin=captureSiteOAuthOrigin(request,env);}catch{}}
    const siteMe=host==="site"&&request.method==="GET"&&path==="/api/me"&&url.protocol==="https:";
    const siteMeMode=siteMe?siteMeServingMode(env):'off';
    let siteMeOrigin:SiteMeOrigin|undefined;
    if(siteMeMode==='configured'){try{siteMeOrigin=captureServingSiteMeOrigin(request,env);}catch{}}
    try{return await dispatchGlobalServingEntry(globalEntry,async()=>{
    try {
      if(siteMe&&siteMeMode!=='off')return await dispatchServingSiteMe(siteMeOrigin);
      env=writeAdmissionEnv(env);
      // Private delivery consumes the same original serving root and admitted Native read as application work.
      // A CLOSED floor must not release guild source through an earlier raw-binding session lookup.
      if (host === 'site') {
        const gate = await memberSiteGate(request, env, path);
        if (gate) return gate;
        if ((request.method === 'GET' || request.method === 'HEAD') && path.startsWith('/static/')) return path === CAMERA_PAGE_PATH ? privateCameraPageAsset(await env.ASSETS.fetch(request)) : privateSiteAsset(await env.ASSETS.fetch(request));
      }
      // This build's columns and tables (schema.ts); a no-op once done in this isolate, retried on the next request
      // after a failure. Until it has succeeded, the watcher's endpoints answer 503 (the watcher keeps its work and
      // retries) and commands say to try again: the code below reads columns the check adds, so running it without them
      // would fail halfway through a verification or a roster sync. The policy pages and /health work regardless.
      const schemaReady = await ensureSchema(env).then(
        () => true,
        (e) => {
          console.error("schema check failed", errorRef(e));
          if(isPrivacyWriteAdmissionDatabase(env.DB))throw new PrivacyWriteAdmissionHeld('current_schema_unconfirmed');
          return false;
        },
      );
      // The guild site has its own host. Anything it does not answer there is a 404, unless that host is also the bot's
      // public one (a site run on the workers.dev address), in which case the bot's routes below still apply.
      if (host === "site") {
        const r = await handleSite(request, env, path, schemaReady, BUILD, (work) => deferOriginalServing(ctx,'site_callback',work),siteOAuthOrigin,roleDispatch);
        if (r) return r;
        if (siteHost(env) !== hostOf(env.PUBLIC_BASE_URL)) return new Response("not found", { status: 404 });
      }
      const res = await route(request, env, path, schemaReady, ctx, namesOrigin,roleDispatch);
      // The watcher polls /queue every 30 seconds while an officer is online, which is exactly when promotions happen.
      // The Guild Member sweep rides on those polls (throttled to one per five minutes inside), after the response.
      if (request.method === "GET" && path === "/queue" && res.ok) {
        // Revision 4 (A1, A4 entry 1): the lane configuration is captured here, synchronously. Unconfigured keeps the
        // original statement exactly; configured shares one Discord-call allowance between the sweep and the fresh pass.
        const lane = captureLaneConfig(env);
        if (!lane.configured) deferOriginalServing(ctx,'queue_member_roles',()=>sweepMemberRoles(env, "watcher",undefined,roleDispatch));
        // A refused registration is audited, then propagates exactly as .160's did: the legacy sweep rides on this deferral.
        else { const parent = callBudget(env); try { deferOriginalServing(ctx,'queue_member_roles',()=>queueFreshRoles(env,lane,parent,roleDispatch)); } catch (e) { await freshRegistrationRefused(env,'watcher'); throw e; } }
      }
      return res;
    } catch (e) {
      if(e instanceof PrivacyWriteAdmissionHeld)return json({error:'write_admission_held',message:'The current source installation or transaction outcome is not confirmed.'},503);
      if(e instanceof PrivacySiteRequestHeld)return json({error:'erasure_held',message:'The original request is no longer admitted or its database outcome was not confirmed. Refresh the account state before proceeding.'},503);
      // .49: the message goes to the log with a short id; the caller gets the id and nothing else (a D1 or upstream
      // error text can name tables, hosts or codes).
      const requestId = crypto.randomUUID().slice(0, 8);
      console.error("unhandled", requestId, logPath(path), errorRef(e)); // .51: class and digest, never the message
      return json({ error: "internal", requestId }, 500);
    }
    });}catch(e){if(e instanceof RecoveryFloorHeld)return json({error:'original_serving_held'},503);throw e;}
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    env=nativeServingEnvironment(env);
    const roleDispatch=captureBetaRoleDispatch(env);
    try {
      scheduledIntrinsics();const admission=scheduledDescriptor(env,'PRIVACY_WRITE_ADMISSION_ENABLED');
      if(!admission&&'PRIVACY_WRITE_ADMISSION_ENABLED'in env||admission&&!scheduledHasOwn(admission,'value'))return scheduledHeld();
      const original=captureOriginalScheduledCallback(event,ctx),scheduled=originalScheduledCallback(original,event,ctx);
      const resetMinute=scheduled.cron===BETA_RESET_CRON;
      // An inactive minute callback captures only its original controller/context; it starts no database or provider work.
      if(resetMinute&&!resetGuardEnabled(env))return;
      if(admission?.value==='true'&&!EPOCH2_SCHEDULE_QUALIFIED)throw new PrivacyWriteAdmissionHeld('epoch2_schedule_700_requires_current_native_qualification');
      if(resetMinute&&!BETA_RESET_SCHEDULE_QUALIFIED)throw new PrivacyWriteAdmissionHeld('beta_reset_minute_requires_current_native_qualification');
      const check=()=>{originalScheduledCallback(original,event,ctx);};
      const constraint=resetMinute?scheduledFreeze({binding:scheduled.binding,check,costMode:'beta_reset' as const}):scheduledFreeze({binding:scheduled.binding,check});
      originalScheduledCallback(original,event,ctx);
      const globalEntry=captureGlobalServingEntry(env,ctx,'scheduled',undefined,constraint);scheduledCostConstraints.set(original,constraint);
      await dispatchGlobalServingEntry(globalEntry,()=>{originalScheduledCallback(original,event,ctx);return resetMinute?runSourceBetaResetScheduledBody(globalEntry.env,ctx,roleDispatch):runSourceEpoch2ScheduledBody(globalEntry.env,ctx,undefined,roleDispatch);});
    } catch(e) {
      console.error("schema check failed; skipping this run",errorRef(e));
    }
  },
};

/** Original minute body only; the exported callback retains both false qualification guards.
 * No extra scheduler or trigger is installed. Global dispatch and the same Native admission remain mandatory. */
async function runSourceBetaResetScheduledBody(env:Env,ctx:ExecutionContext,originalDispatch?:BetaRoleDispatch):Promise<void>{
  const roleDispatch=originalDispatch??captureBetaRoleDispatch(env);
  assertGlobalServingDispatch(env);
  if(!resetGuardEnabled(env))return;
  try{env=writeAdmissionEnv(env);await ensureSchema(env);}
  catch(e){console.error('beta reset schema check held',errorRef(e));return;}
  deferOriginalServing(ctx,'runBetaResetSlice',()=>runBetaResetSlice(env,roleDispatch).catch(e=>console.error('beta reset continuation held',errorRef(e))));
}

/** Unpublished source-owned whole-schedule measurement seam. The real scheduled handler keeps its false qualifier guard.
 * Native fixture calls this same schema and complete dispatch body; no source loader replacement or activation proof. */
export async function runSourceEpoch2ScheduledBody(env: Env, ctx: ExecutionContext,originalSchedule?:OriginalRosterSchedule,originalDispatch?:BetaRoleDispatch): Promise<void> {
    const roleDispatch=originalDispatch??captureBetaRoleDispatch(env);
    const originalRetentionSchedule=captureServingRetentionSchedule(),rosterSchedule=originalSchedule??captureOriginalRosterSchedule();
    const rosterCadence=originalRosterScheduleFacts(rosterSchedule);
    assertGlobalServingDispatch(env);
    try {
      env=writeAdmissionEnv(env);
      await ensureSchema(env);
    } catch (e) {
      console.error("schema check failed; skipping this run", errorRef(e)); // the sweeps read the new columns too
      return;
    }
    deferOriginalServing(ctx,'sweepInviteQueue',()=>sweepInviteQueue(env)); // re-queues invites nobody accepted, retires the hopeless ones
    deferOriginalServing(ctx,'sweepMemberRoles',()=>sweepMemberRoles(env, "cron",undefined,roleDispatch)); // gives Guild Member back to members who lost it (restore.ts)
    // .115, third review round (Codex, 3 Oct 2026 16:48 UTC, finding A): a slice of the roster's pending member effects, so a
    // backlog an export could not finish in its own invocation is worked off between exports too (roster.ts, roster-effects.ts)
    deferOriginalServing(ctx,'continueRosterEffects',()=>continueRosterEffects(env,rosterSchedule,roleDispatch));
    deferOriginalServing(ctx,'refreshNames',()=>refreshNames(env)); // a few linked members' Discord names for the officers' roster window (names.ts)
    deferOriginalServing(ctx,'autoQueueReserved',()=>autoQueueReserved(env)); // from launch: approved reserved names to the top of the invite queue
    deferOriginalServing(ctx,'purgeSeenInteractions',()=>purgeSeenInteractions(env)); // .47: the replay ledger keeps an hour
    // .48: Battle.net-derived data not refreshed within 29 days goes (Blizzard's 30-day limit); counts only in the log.
    deferOriginalServing(ctx,'purgeBattleNetData',()=>purgeBattleNetData(env).catch((e) => console.error("bnet retention failed", errorRef(e))));
    deferOriginalServing(ctx,'sweepRenameHolds',()=>sweepRenameHolds(env).catch((e) => console.error("rename holds sweep failed", errorRef(e)))); // .114: closed reapply holds thirty days after closing
    // .57: community profiles whose owner stopped qualifying start a 30-day clock and go when it runs out; runs with the feature off too.
    deferOriginalServing(ctx,'sweepCommunityProfiles',()=>sweepCommunityProfiles(env).catch((e) => console.error("community sweep failed", errorRef(e))));
    deferOriginalServing(ctx,'sweepCommunityEvents',()=>sweepCommunityEvents(env).catch((e) => console.error("community events sweep failed", errorRef(e)))); // .59: events 30 days past their end
    deferOriginalServing(ctx,'runEventReminders',()=>runEventReminders(env).catch((e) => console.error("event reminder failed", errorRef(e)))); // at most one due opted event; unknown delivery holds
    deferOriginalServing(ctx,'sweepCommunityTrials',()=>sweepCommunityTrials(env).catch((e) => console.error("community trials sweep failed", errorRef(e)))); // .61: trials past their deadline
    deferOriginalServing(ctx,'sweepCommunityRestrictions',()=>sweepCommunityRestrictions(env).catch((e) => console.error("community restrictions sweep failed", errorRef(e)))); // .69: expired watch-list rows, resolved cases, orphan periods
    // .70: departure review items: the intake only while the flag is on, the purge always
    if (communityFeatures(env).has("departures")) deferOriginalServing(ctx,'departureIntake',()=>departureIntake(env).catch((e) => console.error("community departures intake failed", errorRef(e))));
    deferOriginalServing(ctx,'sweepCommunityDepartures',()=>sweepCommunityDepartures(env).catch((e) => console.error("community departures sweep failed", errorRef(e))));
    // .75: the contribution ledger: this week's obligations only while the flag is on and the ledger writable, the retention purge always
    if (communityFeatures(env).has("contributions")) deferOriginalServing(ctx,'openWeeklyObligations',()=>openWeeklyObligations(env).catch((e) => console.error("community contributions opener failed", errorRef(e))));
    deferOriginalServing(ctx,'sweepCommunityContributions',()=>sweepCommunityContributions(env).catch((e) => console.error("community contributions sweep failed", errorRef(e))));
    deferOriginalServing(ctx,'sweepCommunityPrivacy',()=>sweepCommunityPrivacy(env).catch((e) => console.error("community privacy intake sweep failed", errorRef(e)))); // .82: expired private cases, always
    // .115: notices and their operation records past their time, always, whatever the switch says; then the News counts, at
    // most every 3 h, only while News is switched on, from the switch and cache the cleanup's batch read (site-news.ts newsCron)
    deferOriginalServing(ctx,'newsCron',()=>rosterCadence.newsEnabled?newsCron(env):Promise.resolve());
    deferOriginalServing(ctx,'runOfficerDigest',()=>runOfficerDigest(env).catch((e) => console.error("officer digest failed", errorRef(e)))); // .85: the daily officer digest (counts only) behind its own switch; off, it only removes what it posted
    deferOriginalServing(ctx,'runServingErasureJob',()=>runServingErasureJob(env).then(out=>{if(nativeErasureMode(env))console.log('native erasure tick',{attempted:out.attempted,completed:out.completed,held:out.held});}).catch(e=>console.error('serving erasure continuation failed',errorRef(e))));
    deferOriginalServing(ctx,'sweepServingRetention',()=>sweepServingRetention(env,originalRetentionSchedule).catch(e=>console.error('serving retention failed',errorRef(e))));
  const rejectionExpiry=captureRejectionExpiryInvocation(env);
  deferOriginalServing(ctx,'sweepRejectionExpiry',()=>sweepRejectionExpiry(env,rejectionExpiry).catch(e=>console.error('rejection expiry held',errorRef(e))));
}

/** A stored answer is replayed only when it is JSON and no larger than this; a bigger one makes a repeat answer 409. */
const STORED_RESPONSE_MAX = 32 * 1024;

/** Commands with nothing to protect from a repeat: they read and answer. `/olympus-admin lookup` is the one read-only subcommand. */
const READ_ONLY_COMMANDS: ReadonlySet<string> = new Set(["verify-status", LOOKUP_COMMAND, USER_MENU_LOOKUP]);
const READ_ONLY_ADMIN: ReadonlySet<string> = new Set(["lookup"]);
export function isReadOnly(i: Interaction): boolean {
  if (i.type !== 2) return false;
  const name = i.data?.name ?? "";
  if (READ_ONLY_COMMANDS.has(name)) return true;
  const sub = i.data?.options?.[0];
  return name === "olympus-admin" && sub?.type === 1 && READ_ONLY_ADMIN.has(sub.name);
}

type Claim = { state: "new" } | { state: "inflight" } | { state: "done"; response: Response };

/** Claim an interaction id: new, still running elsewhere, or already answered (with the stored answer to replay). */
async function claimInteraction(env: Env, id: string): Promise<Claim> {
  const ins = await env.DB.prepare("INSERT INTO seen_interactions (id, seen_at) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING").bind(id, now()).run();
  if ((ins.meta?.changes ?? 0) > 0) return { state: "new" };
  const row = await env.DB.prepare("SELECT response FROM seen_interactions WHERE id = ?1").bind(id).first<{ response: string | null }>();
  if (!row) return { state: "new" }; // released between the insert and the read: treat as fresh (the retry inserts it again)
  if (row.response === null) return { state: "inflight" };
  try {
    const stored = JSON.parse(row.response) as { status: number; body: string | null };
    if (typeof stored.body !== "string") return { state: "inflight" }; // answered, but too large to replay: 409
    return { state: "done", response: new Response(stored.body, { status: stored.status, headers: { "Content-Type": "application/json" } }) };
  } catch {
    return { state: "inflight" };
  }
}

/** Keep the handler's answer with the claim, so a repeat of the id can be answered without running anything. */
async function storeInteractionResponse(env: Env, id: string, res: Response): Promise<void> {
  let body: string | null = null;
  const type = res.headers.get("Content-Type") ?? "";
  if (type.startsWith("application/json")) {
    const text = await res.clone().text();
    if (text.length <= STORED_RESPONSE_MAX) body = text;
  }
  await env.DB.prepare("UPDATE seen_interactions SET response = ?2 WHERE id = ?1").bind(id, JSON.stringify({ status: res.status, body })).run();
}

/**
 * Build .47: forget interaction ids older than an hour. Discord's own signature window is five minutes (verifyInteraction),
 * so an id this old could not pass the timestamp check anyway; the hour is margin between cron runs.
 */
export async function purgeSeenInteractions(env: Env, at = now()): Promise<void> {
  try {
    await env.DB.prepare("DELETE FROM seen_interactions WHERE seen_at <= ?1").bind(at - 3600).run();
  } catch (e) {
    console.error("seen_interactions purge failed", errorRef(e));
  }
}

/** .51: paths a legacy host answers with a restart on the site rather than a forward (see fetch). */
const AUTH_PATHS = /^\/(auth|oauth|bnet|linked-role|privacy)(\/|$)/;

const hostOf = (u: string | undefined) => {
  try {
    return new URL(u ?? "").hostname.toLowerCase();
  } catch {
    return "";
  }
};

type HostClass = "site" | "legacy" | "bot" | "unknown" | "misconfigured";

/**
 * Build .49. The bot's own host is PUBLIC_BASE_URL (the workers.dev address: Discord's interactions endpoint, the
 * OAuth callbacks and the watcher all use it); SITE_HOST is the site; SITE_LEGACY_HOSTS are former site hosts kept as
 * redirects; localhost is wrangler dev. Anything else is a hostname Cloudflare happens to route here and is refused.
 * PUBLIC_BASE_URL must be a bare https origin, or nothing is served: a wrong value would put callbacks on the wrong host.
 */
export function classifyHost(env: Env, hostname: string): HostClass {
  let base: URL | null = null;
  try {
    base = new URL(env.PUBLIC_BASE_URL ?? "");
  } catch {
    base = null;
  }
  if (!base || base.protocol !== "https:" || base.pathname !== "/" || base.search || base.hash || base.username || base.password) return "misconfigured";
  const h = hostname.toLowerCase();
  const site = siteHost(env);
  if (site && h === site) return "site";
  if (h === base.hostname.toLowerCase() || h === "localhost" || h === "127.0.0.1") return "bot";
  if (site && siteLegacyHosts(env).has(h)) return "legacy";
  return "unknown";
}

/** Every handler is awaited here so a rejected promise lands in the catch above instead of surfacing as a 1101. */
async function route(request: Request, env: Env, path: string, schemaReady = true, ctx?: ExecutionContext,namesOrigin?:HandlerServingOrigin,originalDispatch?:BetaRoleDispatch): Promise<Response> {
  const roleDispatch=originalDispatch??captureBetaRoleDispatch(env);
  const query = new URL(request.url).searchParams;
  if (request.method === "POST" && path === "/interactions") {
    // Build .47: the body is capped before anything decodes it, the signature's timestamp must be recent, the payload
    // must name this application, and an id already seen in the last hour is refused (seen_interactions): a captured
    // request cannot be replayed. Ping and autocomplete are not ledgered: no side effects, and autocomplete fires per key.
    const body = await readInteractionBody(request);
    if (body === null) return new Response("payload too large", { status: 413 });
    if (!(await verifyInteraction(env, request, body))) return new Response("bad signature", { status: 401 });
    const i = JSON.parse(body) as Interaction;
    if (env.DISCORD_APP_ID && i.application_id !== env.DISCORD_APP_ID) return new Response("wrong application", { status: 400 });
    if (!schemaReady && i.type !== 1) return reply("The bot is updating its database \u2014 please try again in a minute.");
    const privacyActor=i.member?.user??i.user;
    const privacyCapture=privacyActor&&/^\d{17,20}$/.test(privacyActor.id)?await readPrivacySubject(env,privacyActor.id):undefined;
    if(privacyCapture!==undefined)env=privacyBoundSubjectEnv(env,privacyActor!.id,privacyCapture);
    const run = async (): Promise<Response> => {
      // Build .41: every command, button and form carries the member's current Discord names; keep a linked member's
      // copy fresh for the roster window (one read, and a write at most daily). Not on autocomplete: that fires per key.
      if(ctx&&namesOrigin&&privacyActor&&privacyCapture!==undefined&&(i.type===2||i.type===3||i.type===5)){
        try{deferOriginalServing(ctx,'interaction_names',()=>registerHandlerInteractionNames(namesOrigin,privacyActor,privacyCapture,body).catch(()=>{}));}catch{}
      }
      // Lookups in Asmongold's server, routed ahead of the "only serves Olympus" guard like the intros (lookup.ts).
      if (isAsmongoldLookup(env, i)) return await handleLookup(env, i);
      // Build .39: the channel intros live in INTROS_GUILD_ID (Asmongold's server) while verification still serves
      // GUILD_ID, so this is routed ahead of handleInteraction's "only serves Olympus" guard; intros.ts checks the guild.
      if (i.type === 2 && i.data?.name === INTROS_COMMAND) {
        return await handleIntros(env, i, (work) => {
          if (ctx) deferOriginalServing(ctx,'interaction_intros',work);
        });
      }
      if(i.type===2&&i.data?.name==='olympus-qr'){
        const {createInteractionRequest,QrHeld}=await import('./qr-phase1');
        try{const r=await createInteractionRequest(env,request,body);return reply(`Whisper !olympus ${r.code} to an online qualified High Councillor. This code expires in ten minutes. You need no AddOn or website account.`);}
        catch(e){return reply(e instanceof QrHeld?`Councillor verification is held: ${e.code}.`:'Councillor verification is currently held.');}
      }
      return await handleInteraction(env, i, ctx ? (label, work) => deferOriginalServing(ctx, label, work) : undefined,roleDispatch);
    };
    // .50 (Codex's second review, 1 Oct 00:05 UTC): a command that only reads is answered afresh every time instead of
    // from the ledger. It has no effect for the ledger to protect, and a stored answer could hand a Battle.net line
    // back after the record behind it expired (a repeat three seconds past the 29-day mark replayed the tag).
    if ((i.type !== 2 && i.type !== 3 && i.type !== 5) || isReadOnly(i)) return await run();
    // The replay ledger (Codex review of d326709, 23:28 and 23:33 UTC): the id is claimed before the handler runs and
    // the handler's answer is stored with the claim afterwards, so a repeat of the id gets that answer back and never
    // runs the handler again; a duplicate that arrives while the first run is still in flight gets 409. A handler that
    // throws is answered, and its claim filled, with one fixed ephemeral reply asking the person to run the command
    // again: a fresh command is a new id, while a captured copy of the failed one can only ever get that reply. The
    // claim is never released, so a command that half-completed before failing cannot be made to run twice.
    if (typeof i.id !== "string" || !/^\d{17,20}$/.test(i.id)) return new Response("bad interaction", { status: 400 });
    const claim = await claimInteraction(env, i.id);
    if (claim.state === "done") return claim.response;
    if (claim.state === "inflight") return new Response("duplicate interaction", { status: 409 });
    let res: Response;
    try {
      res = await run();
    } catch (e) {
      console.error("interaction failed", i.type, i.data?.name ?? idNamespace(i.data?.custom_id), errorRef(e));
      res = reply(INTERACTION_FAILED);
    }
    await storeInteractionResponse(env, i.id, res).catch((e) => console.error("seen_interactions store failed", errorRef(e)));
    return res;
  }
  // .90 (P-17): the OAuth entry points on the bot host, limited per client address, in memory (a first filter)
  if ((path === "/linked-role" || path === "/oauth/callback" || path === "/bnet/link") && rateLimited(`oauth:${path}:${request.headers.get("CF-Connecting-IP") ?? ""}`, 20, 60)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "Content-Type": "application/json; charset=utf-8", "Retry-After": "60", "Cache-Control": "no-store" } });
  }
  if (request.method === "GET" && path === "/linked-role") return await startLinkedRole(env);
  if (request.method === "GET" && path === "/oauth/callback") return await linkedRoleCallback(env, request);
  if (request.method === "GET" && path === "/bnet/link") return await bnetLinkCallback(env, request);
  // .50: /bnet/start, /bnet/callback and /verify-bnet (the dormant Phase 3 profile-API path) are gone; see design.md.
  // .49: the public answer says only whether the Worker is up and which build it is; the inventory (secrets present,
  // config, who is online) needs the watcher's bearer, which the watcher's --check already sends.
  if (request.method === "GET" && path === "/health") return json(await health(env, await watcherAuthorized(env, request)));
  if (path.startsWith("/ingest/") || path.startsWith("/queue")) {
    if (!(await watcherAuthorized(env, request))) return new Response("unauthorized", { status: 401 });
    if (!schemaReady) return json({ error: "database schema not ready; retry shortly" }, 503);
    // .66 (Codex, 1 Oct 02:41 UTC): this Worker speaks the unversioned 0.6.x protocol only. A client that names a key
    // version asks for a protocol this Worker does not implement (the generation-3 proposal stays an unshipped
    // candidate); it is told so, never served the legacy answer as if it were that protocol. Unversioned clients see
    // no difference.
    const body: any = request.method === "POST" ? await request.json() : null; // each handler validates its own body, exactly as before .66
    if (query.has("keyVersion") || (body !== null && typeof body === "object" && "keyVersion" in body)) {
      return json({ error: "unsupported_protocol", message: "This Worker serves the unversioned protocol only; a keyVersion is not supported." }, 400);
    }
    if (request.method === "POST" && path === "/ingest/verify") return await postVerify(env, body,roleDispatch);
    if (request.method === "POST" && path === "/ingest/roster") return await postRoster(env, body, ctx ? (label, work) => deferOriginalServing(ctx, label, work) : undefined,roleDispatch);
    if (request.method === "POST" && path === "/ingest/events") return await postEvents(env, body,roleDispatch);
    if (request.method === "GET" && path === "/queue") {
      // Presence rides on the poll the watcher makes anyway: whether its game client is in the world. Never allowed
      // to cost the queue itself.
      const report = relayReportFromQuery(query);
      if (report) {
        try {
          await recordRelay(env, report);
        } catch (e) {
          console.error("relay presence not recorded", errorRef(e));
        }
      }
      return await getQueue(env, query.get("officer") ?? "");
    }
    // Who is in the guild but not verified, and when each may be offered for removal. Pulled by the watcher on a slow
    // cadence and carried into the addon's queue file; the addon only reads that file at login or /reload anyway.
    if (request.method === "GET" && path === "/queue/unverified") {
      const rep = await unverifiedReport(env);
      // Build .41: the linked members on the same roster, with their Discord names, for the addon's roster window.
      const verified = rep.snapshot ? await verifiedOnRoster(env, rep.snapshot.id) : [];
      return json({ build: BUILD, ...rep, verified });
    }
    if (request.method === "POST" && path === "/queue/written") return await postQueueWritten(env, body);
  }
  // Read-only server inspection. Same bearer token as the watcher: it is already a trusted-operator credential,
  // and what this exposes -- role and channel structure -- is visible to any member of the server anyway.
  if (path.startsWith("/admin/")) {
    if (!(await watcherAuthorized(env, request))) return new Response("unauthorized", { status: 401 });
    // The build is stamped into the map itself. A deploy is live at Cloudflare before every edge is serving it, so
    // a map pulled seconds after `npm run deploy` can be generated by the PREVIOUS version and look like a bug in
    // the current one. An artifact used to rebuild a server elsewhere must say which code produced it.
    if (request.method === "GET" && path === "/admin/guild-map") return json({ build: BUILD, ...(await guildMap(env, query.get("guild") ?? "")) });
    if (request.method === "GET" && path === "/admin/backfill-roles") return json(await backfillRoles(env, backfillOptions(query),roleDispatch));
  }

  return new Response("not found", { status: 404 });
}

/** Revision 4 (fresh roles): the /queue route's own statement attempts before its deferral, in the counted units of the pass's
 * Admission (write admission included: 5 per write, 2 per read): getQueue's three claim updates and two reads (19),
 * recordRelay's read and upsert (7). A cold schema check and the legacy sweep's 120 are already outside FRESH_SWEEP_STATEMENTS. */
const QUEUE_ROUTE_STATEMENTS = 26;
/** Configured mode only, inside the /queue deferral: the legacy sweep (it never throws, and the pass runs whether it was
 * throttled, had no ROLE_GUILD_MEMBER or failed), then one fresh-role pass on the same Discord-call allowance. Its statements
 * are admitted against what this invocation counts when the env can count them; otherwise the pass reserves its own bounds,
 * less this route's QUEUE_ROUTE_STATEMENTS. */
async function queueFreshRoles(env: Env, lane: LaneCapture, parent: CallBudget,roleDispatch:BetaRoleDispatch): Promise<void> {
  try { await sweepMemberRoles(env, "watcher", parent,roleDispatch); } catch { /* never thrown; the pass still runs */ }
  const pass = await import('./full-release-pass');
  let counted = env, adm: Admission | undefined;
  try { const count = { used: 0 }; counted = countStatements(env, count); adm = pass.freshAdmission(count, pass.FRESH_SWEEP_STATEMENTS - QUEUE_ROUTE_STATEMENTS); }
  catch { counted = env; adm = undefined; }
  await pass.runFreshPass(counted, { calls: parent, adm, reserve: QUEUE_ROUTE_STATEMENTS }, 'watcher', lane);
}
/** A refused fresh-role registration is audited when D1 still answers. Only the /queue caller rethrows (.160's response);
 * the new ingest and ban deferrals never change a response. */
async function freshRegistrationRefused(env: Env, trigger: string): Promise<void> {
  try { await audit(env, 'system', FRESH_AUDIT.failed, trigger, { error: 'registration_refused' }); } catch { /* nothing left to tell */ }
}

/** Bumped with every change that needs a redeploy, so GET /health shows which build is live. */
const BUILD = "2026-10-18.171 Original Dark Portal login";

/**
 * Presence of each secret (never the value) and a D1 round trip — enough to tell a missing `wrangler secret put` from a
 * bug. Since .49 the inventory is returned only to the watcher's bearer; anyone else gets ok, build and d1.
 */
async function health(env: Env, full: boolean) {
  const secrets = ["DISCORD_PUBLIC_KEY", "DISCORD_BOT_TOKEN", "DISCORD_CLIENT_SECRET", "VERIFY_SECRET", "WATCHER_TOKEN", "COOKIE_SECRET"] as const;
  const present: Record<string, boolean> = {};
  for (const s of secrets) present[s] = typeof env[s] === "string" && env[s].length > 0;
  let d1 = "ok";
  try {
    await env.DB.prepare("SELECT COUNT(*) AS n FROM members").first();
  } catch (e) {
    d1 = full ? `error: ${errorRef(e)}` : "error"; // .55: bounded for the watcher too (Codex's .51 report)
  }
  if (!full) return { ok: true, build: BUILD, d1 };
  // Who can take a whisper right now: names only, which /verify shows to everyone anyway.
  let relays: { online: string[]; reporting: boolean; requestCodes: boolean } | string = { online: [], reporting: false, requestCodes: false };
  try {
    const st = await relayStatus(env);
    // requestCodes: whether Get my code hands out request codes right now (REQUEST_CODES, and an upgraded officer PC)
    relays = { online: st.online.map((r) => r.character), reporting: st.known, requestCodes: await ticketsReady(env) };
  } catch (e) {
    relays = `error: ${errorRef(e)}`;
  }
  // .48: whether the Battle.net purge keeps up (counts only); .51: and whether the retired Phase 3 path ever wrote a row
  let bnetRetention: { overdue: number; oldestAgeDays: number | null } | string;
  let legacyApi: Awaited<ReturnType<typeof legacyApiCounts>> | string;
  try {
    bnetRetention = await bnetRetentionStatus(env);
  } catch (e) {
    bnetRetention = `error: ${errorRef(e)}`;
  }
  try {
    legacyApi = await legacyApiCounts(env);
  } catch (e) {
    legacyApi = `error: ${errorRef(e)}`;
  }
  // .114: the Battle.net sign-in switch (bnet-switch.ts): whether it is configured, whether the policy allows it, the admin's setting, the result
  let bnetSwitch: { policyReady: boolean; adminOn: boolean; effective: boolean } | string;
  try {
    const st = await bnetLoginState(env);
    bnetSwitch = { policyReady: st.policyReady, adminOn: st.adminOn, effective: st.effective };
  } catch (e) {
    bnetSwitch = `error: ${errorRef(e)}`;
  }
  // .115 (item B): whether Olympus I has room, as the staff commands see it (exact times: this view is the watcher's).
  let seats: { state: string; source: string | null; reason: string | null; members: number | null; cap: number; capConfigured: string; rosterAt: number | null; refusedAt: number | null } | string;
  try {
    const s = (await guildSeats(env)).seats;
    seats = { state: s.state, source: s.source, reason: s.reason, members: s.members, cap: s.cap, capConfigured: s.capConfigured, rosterAt: s.rosterAt, refusedAt: s.refusedAt };
  } catch (e) {
    seats = `error: ${errorRef(e)}`;
  }
  // .55: the configured roles against the guild (ids and booleans only); null when Discord could not be asked.
  let roles: Awaited<ReturnType<typeof rolesStatus>> | string;
  try {
    roles = await rolesStatus(env);
  } catch (e) {
    roles = `error: ${errorRef(e)}`;
  }
  return { ok: true, build: BUILD, mode: env.ADMISSION_MODE, bnetRetention, legacyApi, roles, rosterGuard: { minMembers: env.ROSTER_MIN_MEMBERS, maxShrinkPct: env.ROSTER_MAX_SHRINK_PCT }, linksNotBefore: env.LINKS_NOT_BEFORE || null, seats, relays, appId: env.DISCORD_APP_ID, baseUrl: env.PUBLIC_BASE_URL, secrets: present, d1, bnetLogin: !!(env.BNET_CLIENT_ID && env.BNET_CLIENT_SECRET), bnetSwitch, intros: { guild: env.INTROS_GUILD_ID || null, channels: Object.keys(parseChannels(env.INTROS_CHANNELS)).length, intros: INTROS.length }, site: { host: siteHost(env) || null, guild: env.SITE_GUILD_ID || null, admins: siteAdmins(env).size } };
}
