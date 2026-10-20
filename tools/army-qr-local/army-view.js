/* Local served-copy Army card. No production data, upload route or activation. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OlympusArmyQrLocal=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const KIND='olympus-army-qr-height-v1',MIN_HEIGHT=64,MAX_HEIGHT=12000;
  const cleanupListeners=new Set();let cleanupPending=0,cleanupBlocked=false;
  function notifyCleanup(){for(const refresh of cleanupListeners)refresh();}
  function trackCleanup(clear,finish){
    cleanupPending++;notifyCleanup();let completion;
    try{completion=clear();}catch(_){completion=null;}
    // Only the normal bridge's acknowledged cancellation may release another transfer.
    if(!completion||typeof completion.then!=='function')completion=Promise.resolve(false);
    return Promise.resolve(completion).then(ack=>ack===true,()=>false).then(ack=>{finish();if(!ack)cleanupBlocked=true;cleanupPending--;notifyCleanup();return ack;});
  }
  function mount(host,options={}){
    const doc=host?.ownerDocument,win=doc?.defaultView;
    if(!doc||!win||typeof host.appendChild!=='function'||options.localOnly!==true||options.syntheticOnly!==false||typeof options.live!=='function')throw Error('The explicit local Army contract is required.');
    const origin=win.location?.origin,match=typeof origin==='string'&&origin.match(/^http:\/\/127\.0\.0\.1:(\d{1,5})$/);
    if(!match||+match[1]<1||+match[1]>65535)throw Error('IPv4 loopback is required.');
    let dead=false,sequence=0,frame=null,request=null,cleanup=null,destroyCompletion=null,message='Open the local transfer when ready. No QR capture or census read has started.';
    const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const card=el('section',undefined,'army-qr-local-card');card.setAttribute('aria-label','Local guild QR census');
    const status=el('p',message,'army-qr-local-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const open=el('button','Open local QR transfer','btn'),close=el('button','Close local QR transfer','btn small'),slot=el('div',undefined,'army-qr-local-frame');open.type=close.type='button';close.hidden=true;
    card.append(el('h3','Local guild QR census'),el('p','Use the real Olympus Stats Pilot addon on this computer. This is a separate unsigned own-guild observation, not a checked Army figure.','army-qr-local-intro'),el('p','Reporter A is a fictional temporary identity for local ownership and withdrawal. No game origin, membership, website account association or unique-person count is proved. Reports stay in this local process memory; no production upload or activation.','small muted'),open,close,status,slot);host.appendChild(card);
    function live(){try{return!dead&&!doc.hidden&&options.live()===true;}catch(_){return false;}}
    function refresh(){
      if(dead)return;open.disabled=!live()||!!frame||!!request||cleanupPending>0||cleanupBlocked;
      status.textContent=cleanupBlocked?'The previous local transfer could not confirm cancellation. This local page cannot start another transfer. No retry has been made.':cleanupPending>0?'Waiting for confirmation that the previous local transfer was cleared. Another transfer cannot start yet.':message;
    }
    function say(text){message=text;refresh();}
    function clearChild(owned){
      try{const stop=owned.contentDocument?.getElementById('stop');if(stop&&!stop.disabled&&typeof stop.click==='function')stop.click();}catch(_){}
      return owned.contentWindow?.AttendedCensusBridge?.clear();
    }
    function stop(text){
      sequence++;if(request){request.abort();request=null;}const owned=frame;frame=null;
      if(owned){owned.onload=null;owned.onerror=null;owned.hidden=true;cleanup=trackCleanup(()=>clearChild(owned),()=>owned.remove());}
      close.hidden=true;if(text)message=text;refresh();return cleanup||Promise.resolve(true);
    }
    function refused(code){
      stop(code===401||code===403?'Current Community access is required. The local transfer was cleared.':'The local QR transfer is unavailable. No current observation is claimed.');
      if((code===401||code===403)&&live()&&typeof options.onRefused==='function')options.onRefused(code);
    }
    async function begin(){
      if(!live()||frame||request||cleanupPending>0||cleanupBlocked)return;
      const token=++sequence,controller=new win.AbortController();request=controller;close.hidden=false;say('Checking current local Army access…');
      try{
        const response=await win.fetch('/__army-qr/',{method:'GET',cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal});
        try{await response.body?.cancel();}catch(_){}
        if(token!==sequence||!live())return;
        if(!response.ok){refused(response.status);return;}
        const owned=el('iframe');owned.setAttribute('title','Local Army QR transfer');owned.setAttribute('src','/__army-qr/');owned.setAttribute('allow',"display-capture 'self'; camera 'self'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'");owned.setAttribute('referrerpolicy','no-referrer');owned.height='900';frame=owned;
        owned.onload=()=>{
          if(token!==sequence||frame!==owned||!live())return;
          try{if(!owned.contentDocument?.querySelector('script[src="/__army-view/frame-host.js"]')){refused(0);return;}}catch(_){refused(0);return;}
          say('Local QR transfer open. Capture, complete review, consent and submission remain separate deliberate steps.');
        };
        owned.onerror=()=>{if(token===sequence&&frame===owned)refused(0);};slot.appendChild(owned);
      }catch(_){if(token===sequence&&live())refused(0);}
      finally{if(request===controller)request=null;if(token===sequence)refresh();}
    }
    function resize(event){
      if(!frame||!live()||event.origin!==origin||event.source!==frame.contentWindow)return;
      const d=event.data;if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).sort().join('|')!=='height|kind'||d.kind!==KIND||!Number.isSafeInteger(d.height)||d.height<MIN_HEIGHT||d.height>MAX_HEIGHT)return;
      frame.height=String(d.height);
    }
    function visibility(){if(doc.hidden)stop('Local transfer paused and cleared. Open it deliberately when this page is visible.');else refresh();}
    const pagehide=()=>stop('Local transfer cleared after leaving the page. It will not reopen automatically.');
    function closeTransfer(){
      try{if(frame?.contentWindow?.AttendedCensusBridge?.busy?.()===true){say('Finish the original local operation or check its original outcome before closing. The transfer remains open; no replacement operation was started.');return;}}
      catch(_){say('The original local operation could not be checked. The transfer remains open; no replacement operation was started.');return;}
      stop('Local transfer closed. Capture and unsubmitted review were cleared. Local submitted receipts remain separate.');
    }
    open.addEventListener('click',begin);close.addEventListener('click',closeTransfer);
    win.addEventListener('message',resize);win.addEventListener('pagehide',pagehide);doc.addEventListener('visibilitychange',visibility);cleanupListeners.add(refresh);refresh();
    return Object.freeze({destroy(){if(destroyCompletion)return destroyCompletion;cleanupListeners.delete(refresh);card.hidden=true;destroyCompletion=stop();dead=true;win.removeEventListener('message',resize);win.removeEventListener('pagehide',pagehide);doc.removeEventListener('visibilitychange',visibility);destroyCompletion.then(()=>card.remove());return destroyCompletion;}});
  }
  return Object.freeze({mount,HEIGHT_MESSAGE_KIND:KIND,MIN_HEIGHT,MAX_HEIGHT});
});
