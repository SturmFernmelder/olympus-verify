/* Same-origin embedded preview sizing only. No observation or account data is sent. */
(function(){
  'use strict';
  if(window.parent===window)return;
  const origin=location.origin;if(!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(origin))return;
  let dead=false,queued=false,last=0,observer=null;
  function report(){
    queued=false;if(dead||document.hidden)return;
    const body=document.body,rect=body?.getBoundingClientRect?.();
    // Natural body bounds can shrink after a review closes; the documentElement
    // scrollHeight includes the current iframe viewport and would lock it tall.
    const height=Math.max(64,Math.min(12000,Math.ceil(Math.max(body?.scrollHeight||0,rect?rect.bottom+(window.scrollY||0):document.documentElement?.scrollHeight||0))));
    if(Number.isSafeInteger(height)&&height!==last){last=height;window.parent.postMessage({kind:'olympus-army-qr-height-v1',height},origin);}
  }
  function schedule(){if(dead||queued)return;queued=true;window.requestAnimationFrame(report);}
  function ready(){if(dead)return;if(typeof ResizeObserver==='function'){observer=new ResizeObserver(schedule);observer.observe(document.documentElement);if(document.body)observer.observe(document.body);}else if(typeof MutationObserver==='function'){observer=new MutationObserver(schedule);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});}schedule();}
  function cleanup(){dead=true;observer?.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('pagehide',cleanup);document.removeEventListener('DOMContentLoaded',ready);}
  window.addEventListener('resize',schedule);window.addEventListener('pagehide',cleanup);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
}());
