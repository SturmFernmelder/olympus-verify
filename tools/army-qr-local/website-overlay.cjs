'use strict';
const {createHash}=require('node:crypto');
const EXPECTED_SOURCE_SHA256 = '7edc0dbe2ff9ea7590025d9c81ccfce0be5b424d305743f697d46ddf154ec083';
function transformApp(source){
  if(typeof source!=='string'||createHash('sha256').update(source).digest('hex')!==EXPECTED_SOURCE_SHA256)throw Error('Exact reviewed production app source is required.');
  const once=(before,after)=>{if(source.split(before).length!==2)throw Error('Local Army source seam is not unique.');source=source.replace(before,after);};
  once('  let disposeTool = null;\n',String.raw`  let disposeTool = null;
  let disposeArmyQrLocal = null, armyQrLocalCleanup = null, armyQrRenderQueued = false, armyQrLocalScript = null; // Separate loopback Army overlay only.
  function retainArmyQrCleanup(completion) {
    if (!completion || typeof completion.then !== "function") return completion;
    const settled = Promise.resolve(completion).then(() => undefined, () => undefined);
    const pending = armyQrLocalCleanup ? Promise.all([armyQrLocalCleanup, settled]).then(() => undefined) : settled;
    armyQrLocalCleanup = pending;
    pending.then(() => {
      if (armyQrLocalCleanup !== pending) return;
      armyQrLocalCleanup = null;
      if (armyQrRenderQueued) { armyQrRenderQueued = false; render(); }
    });
    return completion;
  }
`);
  once('    closeNavMenus();\n    if (disposeSeatsNotice) disposeSeatsNotice();\n','    closeNavMenus();\n    if (disposeArmyQrLocal) disposeArmyQrLocal();\n    if (armyQrLocalCleanup) { armyQrRenderQueued = true; return; }\n    if (disposeSeatsNotice) disposeSeatsNotice();\n');
  once('  async function signOut() {\n','  async function signOut() {\n    if (disposeArmyQrLocal) disposeArmyQrLocal();\n');
  once('news: "Guild news", army: "Army", leadership: "Leadership"','news: "Guild news", army: "Army", "army-qr-local": "Army · local QR preview", leadership: "Leadership"');
  once('    if (anyCommunity()) tabs.push(["leadership", "Leadership"]); // .114:','    if (anyCommunity() && can("applicantWrite") && communityReader()) tabs.push(["army-qr-local", "Army · local QR preview"]);\n    if (anyCommunity()) tabs.push(["leadership", "Leadership"]); // .114:');
  once('    if (sub === "news" && newsOn()) return communityNews(body);','    if (sub === "army-qr-local") return communityArmyQrLocal(body);\n    if (sub === "news" && newsOn()) return communityNews(body);');
  once('  async function communityOverview(body) {\n    const cards = [];','  async function communityOverview(body) {\n    const cards = [];\n    if (anyCommunity() && can("applicantWrite") && communityReader()) cards.push(h("a", { class: "card", href: "#/community/army-qr-local" }, h("div", { class: "card-head" }, icon("icon-friends"), h("h3", { text: "Army · local QR preview" })), h("p", { class: "muted small", text: "Real-addon QR transfer on this computer only. Unsigned own-guild observations stay separate from other site data. No production upload or activation." })));');
  const local = String.raw`  function loadArmyQrLocalScript() {
    if (window.OlympusArmyQrLocal) return Promise.resolve();
    if (!armyQrLocalScript) armyQrLocalScript = new Promise((resolve, reject) => {
      const script = h("script", { src: "/__army-view/army-view.js" });
      script.addEventListener("load", resolve);
      script.addEventListener("error", () => { armyQrLocalScript = null; script.remove(); reject(new Error("The local Army transfer module could not be loaded.")); });
      document.head.appendChild(script);
    });
    return armyQrLocalScript;
  }

  async function communityArmyQrLocal(body) {
    const context = COM(), subject = context.subject, user = S.user, route = currentRoute();
    let disposed = false, local = null, paused = null, resumeAllowed = false, cleanup = null;
    const attached = () => app.contains(body) && S.signedIn && !S.denied && S.user === user && COM() === context && COM().subject === subject && anyCommunity() && can("applicantWrite") && communityReader() && currentRoute() === route;
    const present = () => !disposed && !document.hidden && attached();
    const loading = h("p", { role: "status", class: "muted", text: "Opening local Army QR preview…" });
    const dispose = () => {
      resumeAllowed = false;
      if (paused) { paused.remove(); paused = null; }
      if (!disposed) {
        disposed = true; document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", pause);
        if (local && typeof local.destroy === "function") cleanup = retainArmyQrCleanup(local.destroy());
        local = null; loading.remove();
      }
      if (disposeTool === dispose) disposeTool = null;
      if (disposeArmyQrLocal === dispose) disposeArmyQrLocal = null;
      return cleanup;
    };
    const pause = () => {
      const owned = attached(), hadLocal = !!local, completion = dispose(); if (!owned || !attached()) return;
      const note = h("p", { role: "status", text: "Capture and unsubmitted review were cleared. Waiting for the original cancellation acknowledgement before another transfer can be opened." });
      const reopen = h("button", { type: "button", class: "btn", text: "Reopen local Army QR preview", disabled: true, onclick: () => { if (resumeAllowed && attached() && !document.hidden) render(); } });
      const panel = frame("Local Army QR preview paused", null, note, reopen);
      paused = panel; add(body, panel); disposeTool = dispose; disposeArmyQrLocal = dispose;
      const settled = ack => {
        if (paused !== panel || !attached()) return;
        resumeAllowed = ack === true; reopen.disabled = !resumeAllowed;
        note.textContent = resumeAllowed
          ? "The original cancellation was acknowledged. Reopen deliberately to read again. Submitted local receipts remain separate in the local process."
          : "The previous transfer could not confirm cancellation. Its original embedded recovery view was closed. Another transfer remains blocked; no retry was made. Finish or check an unresolved operation in its original view before leaving it.";
      };
      Promise.resolve(hadLocal ? completion : true).then(settled, () => settled(false));
    };
    const visibility = () => { if (document.hidden) pause(); };
    const onRefused = status => {
      if (!present() || ![401, 403].includes(status)) return;
      dispose(); add(body, noticeBox("warn", "icon-warning", h("p", { text: "Current Community access is required. The local Army QR preview was cleared." })));
      if (status === 401) { S.signedIn = false; dirtyKeys.clear(); render(); }
      else refreshCommunity({ live: () => attached() && !document.hidden });
    };
    if (!present()) return;
    disposeTool = dispose; disposeArmyQrLocal = dispose;
    document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", pause); add(body, loading);
    try {
      if (!document.querySelector('link[data-olympus-tool="OlympusArmyQrLocal"]')) document.head.appendChild(h("link", { rel: "stylesheet", href: "/__army-view/army-view.css", "data-olympus-tool": "OlympusArmyQrLocal" }));
      await loadArmyQrLocalScript();
      if (!present()) return;
      if (!window.OlympusArmyQrLocal || typeof window.OlympusArmyQrLocal.mount !== "function") throw Error("The local Army transfer module is unavailable.");
      loading.remove();
      const mounted = await window.OlympusArmyQrLocal.mount(body, { localOnly: true, syntheticOnly: false, live: present, onRefused });
      if (!present()) { if (mounted && typeof mounted.destroy === "function") mounted.destroy(); return; }
      if (!mounted || typeof mounted.destroy !== "function") throw Error("The local Army transfer cannot establish cleanup.");
      local = mounted;
    } catch (_) {
      if (present()) { loading.remove(); add(body, noticeBox("warn", "icon-warning", h("p", { text: "The local Army QR preview could not be loaded. No observation is claimed." }))); }
    }
  }`;
  once('  async function communityNews(body) {\n', local+'\n\n  async function communityNews(body) {\n');
  return source;
}
module.exports=Object.freeze({transformApp,EXPECTED_SOURCE_SHA256});
