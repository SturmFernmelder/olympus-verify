(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const ui = Object.fromEntries(['local-status','local-use','local-draft','local-source','local-consent','local-intent','local-submit','local-recover','local-results','local-refresh'].map(id=>[id,byId(id)]));
  const handoffNotes = ['Local census handoff time remaining', 'Original local handoff time remaining'].map(label=>{
    const note=document.createElement('p');note.className='help';note.hidden=true;note.setAttribute('role','timer');note.setAttribute('aria-live','off');note.setAttribute('aria-label',label);return note;
  });
  ui['local-use'].insertAdjacentElement('afterend',handoffNotes[0]);byId('review').append(handoffNotes[1]);
  const refusals=Object.freeze({
    local_clock_refused:'This computer’s local clock moved backwards or became unavailable. The operation was refused; no clock tolerance was applied.',
    original_local_session_required:'The original local session expired or changed. No replacement session or operation was adopted.',
    own_scan_required:'The original owned QR scan is no longer available. No handoff was accepted.',
    scan_expired:'The original 30-second QR scan expired. No handoff was accepted.',
    qr_payload_refused:'The complete QR payload failed its original canonical-format, checksum, masking or source-time checks. No handoff was accepted.',
    complete_unique_frames_required:'A complete set of the original unique QR parts is required. No handoff was accepted.',
    complete_frames_required:'The original QR frame set did not complete. No handoff was accepted.',
    one_guild_scope_required:'This local process already belongs to a different guild, realm or faction. It cannot adopt this observation.',
    source_expired:'The observation’s original source time expired. Re-reading it cannot make it fresh.',
    reporter_required:'The current local identity is a reader and cannot submit observations.',
    csrf_required:'The original local page token did not pass. No replacement operation was attempted.'
  });
  let csrf = null, sessionPromise = null, cancelPromise = Promise.resolve(true), unknownCancellation = null, unknownCleanup = null, cancelInFlight = false, workVersion = 0, cancelAttemptedVersion = -1, generation = 0, refreshSequence = 0, scan = null, decoded = null, preview = null, intent = null, pending = false, unknown = false, request = null, timer = null, handoffExpired = false;
  const message = text => {ui['local-status'].textContent = text;};
  function handoffCountdown() {
    const text=scan?'Local census handoff: '+Math.max(0,Math.ceil((scan.expiresAt-Date.now())/1000))+'s remaining in the original 30-second scan. A longer browser-review expiry does not extend this handoff.':handoffExpired?'Local census handoff expired. Any separate browser review may remain until its own expiry, but it can no longer be handed off.':'';
    for(const note of handoffNotes){note.textContent=text;note.hidden=!text;}
  }
  async function refusal(response,fallback) {
    const suffix=Number.isInteger(response.status)&&response.status>=400&&response.status<=599?' (HTTP '+response.status+').':'';
    try{const value=await response.json();if(value?.localOnly===true&&typeof value.error?.code==='string'&&Object.hasOwn(refusals,value.error.code))return Error(refusals[value.error.code]+suffix);}catch(_){}
    return Error(fallback+suffix);
  }
  function controls() {
    const disabled = pending || unknown || document.hidden;
    ui['local-use'].disabled = disabled || !decoded || !scan || Date.now() >= scan.expiresAt;
    ui['local-draft'].hidden = !preview;
    ui['local-intent'].disabled = disabled || !preview || !ui['local-consent'].checked || !!intent;
    ui['local-submit'].disabled = disabled || !preview || !intent || !ui['local-consent'].checked;
    ui['local-consent'].disabled = disabled || !!intent;
    ui['local-recover'].hidden = !unknown;
    ui['local-refresh'].disabled = pending || unknown || document.hidden;
    byId('start').disabled = pending || unknown;
    document.querySelectorAll('[data-source]').forEach(button=>{button.disabled=unknown||pending;});
    ui['local-results'].querySelectorAll('button[data-accepted]').forEach(button=>{button.disabled=button.dataset.accepted!=='true'||pending||unknown;});
    handoffCountdown();
  }
  async function session() {
    if (csrf) return;
    if (sessionPromise) return sessionPromise;
    sessionPromise = (async()=>{
    const response = await fetch('/local/session',{cache:'no-store',credentials:'same-origin'});
    if (!response.ok) throw await refusal(response,'The local session is unavailable.');
    const value = await response.json();
    if (value.localOnly !== true || value.syntheticOnly !== false || typeof value.csrf !== 'string') throw Error('The local session contract was refused.');
    csrf = value.csrf;
    })();
    try { await sessionPromise; } finally { sessionPromise=null; }
  }
  async function api(path, body, signal) {
    if (!csrf) await session();
    if(['start','preview','intent'].includes(path))workVersion++;
    const response = await fetch('/local/'+path,{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Census-CSRF':csrf},body:JSON.stringify(body),signal,...(path==='cancel'?{keepalive:true}:{})});
    if (!response.ok) throw await refusal(response,'The local census refused this operation. No replacement operation was attempted.');
    const value = await response.json();
    if (value.localOnly !== true || value.syntheticOnly !== false) throw Error('The local-only response contract was refused.');
    return value;
  }
  function cancelPendingWork() {
    if(cancelInFlight)return cancelPromise;
    if(!csrf){cancelPromise=Promise.resolve(false);return cancelPromise;}
    if(cancelAttemptedVersion===workVersion)return cancelPromise;
    const version=workVersion;cancelAttemptedVersion=version;cancelInFlight=true;
    // Start the normal CSRF-protected request in this turn, before an iframe can
    // be removed. No queued follow-up cancellation may erase a later new scan.
    cancelPromise=api('cancel',{}).then(value=>value.state==='cancelled',()=>false).then(acknowledged=>{
      cancelInFlight=false;
      if(acknowledged&&version===workVersion)return true;
      return false;
    });
    return cancelPromise;
  }
  function clear() {
    generation++;
    refreshSequence++;
    if(request){request.abort();request=null;}
    if(timer){clearInterval(timer);timer=null;}
    scan=null;decoded=null;preview=null;handoffExpired=false;
    if(!unknown)intent=null;
    ui['local-consent'].checked=false;ui['local-source'].textContent='';
    ui['local-results'].replaceChildren();
    pending=false;
    const cancelled=cancelPendingWork();
    if(!unknown)message('Scan and local draft cleared. Existing submitted receipts are separate; no new report was accepted.');
    controls();
    if(unknown){
      // Pending-work cancellation cannot settle the original submitted intent.
      // A parent leaving this view must keep its replacement barrier closed.
      if(unknownCancellation!==cancelled){unknownCancellation=cancelled;unknownCleanup=cancelled.then(()=>false);}
      return unknownCleanup;
    }
    return cancelled;
  }
  async function start() {
    if(unknown)throw Error('Check the original unknown outcome before starting another scan.');
    const token=generation,owned=new AbortController();pending=true;request=owned;controls();
    try{
      if(!csrf){await session();if(token!==generation||document.hidden)throw Error('The local scan ended before it started.');cancelPendingWork();}
      const cancelled=await cancelPromise;
      if(token!==generation||document.hidden)throw Error('The local scan ended before it started.');
      if(cancelled!==true)throw Error('The original local cancellation was not acknowledged. No replacement scan was started.');
      const value=await api('start',{},owned.signal);if(token!==generation||document.hidden)throw Error('The local scan ended before it started.');if(!/^[a-f0-9]{32}$/.test(value.scanId)||!/^[a-f0-9]{32}$/.test(value.nonce)||!Number.isSafeInteger(value.expiresAt)||value.expiresAt>Date.now()+30000)throw Error('The original scan deadline was refused.');scan=value;handoffExpired=false;if(timer){clearInterval(timer);timer=null;}timer=setInterval(()=>{if(scan&&Date.now()>=scan.expiresAt){decoded=null;scan=null;handoffExpired=true;clearInterval(timer);timer=null;message('The original handoff deadline ended. No new observation was accepted.');}controls();},250);message('Real addon scan active. Decode and hand off within this original 30-second session.');return value;
    }
    finally{if(request===owned)request=null;if(token===generation){pending=false;controls();}}
  }
  function decodedObservation(payload, frames, originalScan) {
    if(!scan||scan.scanId!==originalScan.scanId||Date.now()>=scan.expiresAt||frames.length<1||frames.length>14)throw Error('This owned scan is no longer available for handoff.');
    decoded={frames:frames.slice(),payload};
    message('Complete real addon observation decoded. Review it above, then deliberately hand it to this computer’s census. No consent or report exists yet.');
    controls();
  }
  async function action(operation) {
    if(pending||unknown||document.hidden)return;
    const token=generation;pending=true;request=new AbortController();controls();
    try{await operation(token,request.signal);}catch(error){if(token===generation)message(error.message||'The local operation was refused.');}
    finally{if(token===generation){pending=false;request=null;controls();}}
  }
  ui['local-use'].addEventListener('click',()=>action(async(token,signal)=>{
    if(!decoded||!scan||Date.now()>=scan.expiresAt)throw Error('The original scan expired.');
    const value=await api('preview',{scanId:scan.scanId,frames:decoded.frames},signal);
    if(token!==generation)return;
    preview=value;decoded=null;scan=null;handoffExpired=false;if(timer){clearInterval(timer);timer=null;}
    ui['local-consent'].checked=false;
    ui['local-source'].textContent='Original addon times and masking are retained. Consent below applies only to this in-memory local process. The review expires without renewing the source.';
    message('Observation handed to local review. Consent, intent and submission remain separate.');
    timer=setInterval(()=>{if(preview&&Math.floor(Date.now()/1000)>=preview.expiresAt){clear();message('The original local preview expired. No new submission was made.');}},250);
  }));
  ui['local-consent'].addEventListener('change',controls);
  ui['local-intent'].addEventListener('click',()=>action(async(token,signal)=>{
    if(!preview||!ui['local-consent'].checked)throw Error('Review and explicit local consent are required.');
    const value=await api('intent',{previewId:preview.previewId,consentVersion:preview.contract.consentVersion},signal);
    if(token!==generation)return;intent=value;message('Original local intent prepared. Submission is still a separate deliberate action.');
  }));
  ui['local-submit'].addEventListener('click',()=>action(async(token,signal)=>{
    if(!preview||!intent||!ui['local-consent'].checked)throw Error('The original reviewed intent is required.');
    const original=intent;unknown=true;controls();
    try{await api('submit',{previewId:preview.previewId,intent:original.intent},signal);if(token!==generation)return;unknown=false;intent=null;preview=null;ui['local-consent'].checked=false;message('One observation submitted to local process memory. Nothing was uploaded to production or saved to disk.');await refresh();}
    catch(error){if(token===generation){message('The original submission outcome is unknown. Check that exact intent; do not submit again or start another scan.');}throw error;}
  }));
  ui['local-recover'].addEventListener('click',async()=>{
    if(pending||!unknown||!intent||document.hidden)return;const token=generation,original=intent;pending=true;request=new AbortController();controls();
    try{const result=await api('outcome',{intent:original.intent},request.signal);if(token!==generation||intent!==original||document.hidden)return;if(result.state==='pending'){message('The original intent is still pending. No replacement submission was made.');}else{unknown=false;intent=null;preview=null;message('Original outcome recovered: '+result.state+'. No retry or adoption.');await refresh();}}
    catch(_){if(token===generation&&!document.hidden)message('The original outcome is still unavailable. Keep this session open; no retry was made.');}
    finally{if(token===generation){pending=false;request=null;controls();}}
  });
  function text(parent,tag,value){const item=document.createElement(tag);item.textContent=value;parent.append(item);return item;}
  async function refresh() {
    if(document.hidden)return;const token=generation,sequence=++refreshSequence;if(!csrf)await session();
    const response=await fetch('/local/state',{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw await refusal(response,'The local census view is unavailable.');
    const state=await response.json();if(token!==generation||sequence!==refreshSequence||document.hidden)return;if(state.localOnly!==true||state.syntheticOnly!==false)throw Error('Local scope refused.');
    ui['local-results'].replaceChildren();
    if(state.summary)for(const row of state.summary.rows){const article=document.createElement('article');text(article,'h3',row.label);text(article,'p',row.state==='reported'?'Reported characters: '+(row.reportedCharacters==='few'?'Fewer than 5':row.reportedCharacters)+' · Online: '+(row.reportedOnline===null?'Unavailable':row.reportedOnline==='few'?'Fewer than 5':row.reportedOnline):'Current data: '+row.state);text(article,'small','Unverified volunteer observation · Characters, not unique people.');ui['local-results'].append(article);}
    else text(ui['local-results'],'p','No guild observation registered in this local process.');
    for(const receipt of state.receipts){const article=document.createElement('article');text(article,'p','Your local receipt · '+receipt.state);text(article,'code',receipt.receiptId);const button=text(article,'button','Withdraw own local observation');button.type='button';button.dataset.accepted=String(receipt.state==='accepted');button.disabled=receipt.state!=='accepted'||pending||unknown;button.addEventListener('click',()=>action(async()=>{await api('withdraw',{receiptId:receipt.receiptId});message('Own local observation withdrawn. No production data was touched.');await refresh();}));ui['local-results'].append(article);}
    controls();
  }
  ui['local-refresh'].addEventListener('click',()=>{refresh().catch(error=>message(error.message));});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clear();message(unknown?'Page hidden. Check the original outcome when you return; no retry was made.':'Page hidden. The local view was cleared. Refresh it deliberately when you return.');}else controls();});
  window.addEventListener('pagehide',clear);
  window.AttendedCensusBridge=Object.freeze({start,decoded:decodedObservation,clear,busy:()=>pending||unknown});
  controls();refresh().catch(error=>message(error.message));
}());
