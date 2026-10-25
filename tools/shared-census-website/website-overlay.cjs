'use strict';

// Served only by the separate synthetic local server. Production app.js stays byte-identical.
const { createHash } = require('node:crypto');
const EXPECTED_SOURCE_SHA256='e699d60d09c38e0265ecf8e65bbd6036955067a6db49d3886b0d7a3eab534147';
const LOCAL_LABEL = 'Shared census · local preview';

function transformApp(source) {
  if (typeof source !== 'string' || createHash('sha256').update(source, 'utf8').digest('hex') !== EXPECTED_SOURCE_SHA256) throw new Error('The local census overlay requires the exact reviewed app source.');
  function once(before, after) {
    if (source.split(before).length !== 2) throw new Error('The local census overlay source anchor is not unique.');
    source = source.replace(before, after);
  }
  once('  let disposeTool = null;\n', String.raw`  let disposeTool = null;
  let disposeSharedCensusLocal = null; // Synthetic local overlay only.
  const sharedCensusLocalScripts = new Map();
  async function loadSharedCensusLocalScript(namespace, file) {
    if (!window[namespace]) {
      if (!sharedCensusLocalScripts.has(namespace)) sharedCensusLocalScripts.set(namespace, new Promise((resolve, reject) => {
        const script = h("script", { src: file });
        script.addEventListener("load", resolve);
        script.addEventListener("error", () => { sharedCensusLocalScripts.delete(namespace); reject(new Error("The local census dependency could not be loaded.")); });
        document.head.appendChild(script);
      }));
      await sharedCensusLocalScripts.get(namespace);
    }
  }
`);
  once('  async function signOut() {\n', '  async function signOut() {\n    if (disposeSharedCensusLocal) disposeSharedCensusLocal();\n');
  once('news: "Guild news", army: "Army", leadership: "Leadership"', 'news: "Guild news", army: "Army", "shared-census": "Shared census · local preview", leadership: "Leadership"');
  once('    if (anyCommunity()) tabs.push(["leadership", "Leadership"]); // .114:', '    if (anyCommunity() && can("applicantWrite") && communityReader()) tabs.push(["shared-census", "Shared census · local preview"]);\n    if (anyCommunity()) tabs.push(["leadership", "Leadership"]); // .114:');
  once('    if (sub === "news" && newsOn()) return communityNews(body);', '    if (sub === "shared-census") return communitySharedCensusLocal(body);\n    if (sub === "news" && newsOn()) return communityNews(body);');
  once('  async function communityOverview(body) {\n    const cards = [];', '  async function communityOverview(body) {\n    const cards = [];\n    if (anyCommunity() && can("applicantWrite") && communityReader()) cards.push(h("a", { class: "card", href: "#/community/shared-census" }, h("div", { class: "card-head" }, icon("icon-friends"), h("h3", { text: "Shared census · local preview" })), h("p", { class: "muted small", text: "Synthetic reports in this local process only. No production connection or real guild data." })));');
  once('  function communityCensus(body) {', String.raw`  async function communitySharedCensusLocal(body) {
    const context = COM(), subject = context.subject, user = S.user, route = currentRoute();
    let disposed = false, instance = null, resumeAllowed = false;
    const box = h("section", { class: "shared-census-local-host", "data-shared-census-local": "true" }, h("p", { role: "status", class: "muted", text: "Opening synthetic local census…" }));
    const attached = () => app.contains(body) && S.signedIn && !S.denied && S.user === user && COM() === context && COM().subject === subject && currentRoute() === route && anyCommunity() && can("applicantWrite") && communityReader();
    const present = () => !disposed && !document.hidden && attached();
    const dispose = () => {
      resumeAllowed = false;
      if (disposed) {
        clear(box);
        if (disposeTool === dispose) disposeTool = null;
        if (disposeSharedCensusLocal === dispose) disposeSharedCensusLocal = null;
        return;
      }
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", pause);
      if (instance && typeof instance.destroy === "function") instance.destroy();
      instance = null;
      clear(box);
      if (disposeTool === dispose) disposeTool = null;
      if (disposeSharedCensusLocal === dispose) disposeSharedCensusLocal = null;
    };
    const pause = () => {
      const owned = attached();
      dispose();
      if (!owned || !attached()) return;
      resumeAllowed = true;
      disposeTool = dispose;
      disposeSharedCensusLocal = dispose;
      add(box, frame("Local census paused", null,
        h("p", { text: "The displayed census and draft were cleared. Synthetic receipts remain only in this local process. Reopen it when this page is visible to make a new read." }),
        h("button", { type: "button", class: "btn", text: "Reopen local census", onclick: () => { if (resumeAllowed && attached() && !document.hidden) render(); } })));
    };
    const onVisibility = () => { if (document.hidden) pause(); };
    const onRefused = status => {
      if (!present() || ![401, 403].includes(status)) return;
      if (instance && typeof instance.destroy === "function") instance.destroy();
      instance = null;
      clear(box);
      if (status === 401) {
        dispose(); S.signedIn = false; dirtyKeys.clear(); render();
      } else {
        add(box, noticeBox("warn", "icon-warning", h("p", { text: "Current Community access is required. The local census was cleared." })));
        refreshCommunity({ live: present });
      }
    };
    if (!present()) return;
    add(body, box);
    disposeTool = dispose;
    disposeSharedCensusLocal = dispose;
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", pause);
    try {
      if (!document.querySelector('link[data-olympus-tool="OlympusSharedCensusLocal"]')) document.head.appendChild(h("link", { rel: "stylesheet", href: "/__census-local/census-view.css", "data-olympus-tool": "OlympusSharedCensusLocal" }));
      await Promise.all([
        loadSharedCensusLocalScript("OlympusGuildQRProtocol", "/__census-local/qr-protocol.js"),
        loadSharedCensusLocalScript("OlympusSharedCensusLocal", "/__census-local/census-view.js")
      ]);
      if (!present()) return;
      if (!window.OlympusSharedCensusLocal || typeof window.OlympusSharedCensusLocal.mount !== "function") throw new Error("The local census module is unavailable.");
      clear(box);
      const mounted = await window.OlympusSharedCensusLocal.mount(box, { syntheticOnly: true, live: present, onRefused });
      if (!present()) { if (mounted && typeof mounted.destroy === "function") mounted.destroy(); return; }
      if (!mounted || typeof mounted.destroy !== "function") throw new Error("The local census module could not establish cleanup.");
      instance = mounted;
    } catch (error) {
      if (!present()) return;
      dispose();
      if (attached() && !document.hidden) add(box, noticeBox("warn", "icon-warning", h("p", { text: "The local census tool could not be loaded. No current figures are claimed." })));
    }
  }

  function communityCensus(body) {`);
  return source;
}

module.exports = { transformApp, EXPECTED_SOURCE_SHA256, LOCAL_LABEL };
