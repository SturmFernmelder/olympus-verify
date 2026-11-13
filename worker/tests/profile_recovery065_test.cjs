// Focused real SPA and synthetic Worker fixture. Run from worker/.
const fs = require('node:fs'), path = require('node:path'), { Module } = require('node:module');
const source = fs.readFileSync(path.join(__dirname, 'frontend_check.cjs'), 'utf8');
const starts = [...source.matchAll(/\(async \(\) => \{\r?\n  await siteUser\(MEMBER/g)];
if (starts.length !== 1) throw Error('One real frontend fixture boundary required');
const body = String.raw`
(async () => {
  await siteUser(MEMBER, { global_name: "Mia" });
  await character(MEMBER, "Mia One", "Player-1-0001");
  const endpoint = "/api/community/profile";
  const response = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  const formFor = p => byText(p.app, "button", "Save")?.closest("form");
  const saveFor = form => byText(form, "button", "Save");
  const mainFor = form => form.querySelector('input[id="f-main"]');
  const edit = (input, value) => { input.value = value; fire(input, "input"); };
  const activeError = (form, input, word) => input.getAttribute("aria-invalid") === "true"
    && (input.getAttribute("aria-describedby") || "").split(" ").some(id => {
      const error = form.querySelector("#" + id);
      return error && !error.hidden && error.textContent.includes(word);
    });
  const profile = async () => {
    const p = await openPage(MEMBER);
    await p.go("#/community/profile");
    await waitFor(() => !!formFor(p), "member profile editor");
    return p;
  };
  const p = await profile(), form = formFor(p), main = mainFor(form);
  edit(main, "!");
  saveFor(form).click();
  await waitFor(() => form.textContent.includes("main character's name is not valid") || form.textContent.includes("main character's name is not a valid"), "actual main validation refusal");
  check("CC065 actual invalid main refusal names and focuses the linked field without losing its dirty value",
    p.document.activeElement === main && activeError(form, main, "First Last") && main.value === "!" && !byText(form, "span", "unsaved").hidden);
  edit(main, "Mia One");
  byText(form, "button", "Add an alt").click();
  const alt = form.querySelector('input[aria-label="Alt name"]');
  edit(alt, "!");
  saveFor(form).click();
  await waitFor(() => form.textContent.includes("An alt is listed twice"), "actual alt validation refusal");
  check("CC065 repeated-field validation focuses the linked alt and clears the prior main error",
    p.document.activeElement === alt && activeError(form, alt, "An alt is listed twice") && main.getAttribute("aria-invalid") === "false" && alt.value === "!");

  let written = 0;
  p.intercept((path, init) => {
    if (path === endpoint && init.method === "PUT") { written++; return response(400, { error: "invalid_request", field: "unknown", message: "The fixture refused this save." }); }
  });
  saveFor(form).click();
  await waitFor(() => form.textContent.includes("The fixture refused this save."), "general refusal");
  const general = byText(form, "p", "The fixture refused this save.");
  check("CC065 an unmatched refusal focuses a sticky alert and keeps the full draft",
    general?.getAttribute("role") === "alert" && !!general.closest(".savebar") && p.document.activeElement === general
    && main.value === "Mia One" && alt.value === "!" && alt.getAttribute("aria-invalid") !== "true" && written === 1);

  edit(main, "Éla Main"); edit(alt, "éla Main");
  p.intercept((path, init) => path === endpoint && init.method === "PUT"
    ? response(409, { error: "name_conflict", names: ["éla Main"], message: "The fixture character name was refused." }) : undefined);
  saveFor(form).click();
  await waitFor(() => form.textContent.includes("The fixture character name was refused."), "name conflict refusal");
  check("CC065 character conflict targeting preserves the server's distinction between non-ASCII case variants",
    p.document.activeElement === alt && activeError(form, alt, "character name was refused") && main.getAttribute("aria-invalid") === "false");

  const q = await profile(), conflict = formFor(q), draft = mainFor(conflict);
  edit(draft, "Retained Draft");
  const reads = [], writes = [];
  q.intercept((path, init) => {
    if (path !== endpoint) return;
    if (init.method === "GET") { reads.push(path); return response(200, { profile: { listed:false, main:null, raidRole:null, professions:[], alts:[], crafts:[], revision:9 } }); }
    writes.push(JSON.parse(init.body));
    return writes.length === 1
      ? response(409, { error: "conflict", message: "The officers' record of one of these character names changed while you were saving." })
      : response(400, { error: "invalid_request", message: "Explicit second request received." });
  });
  saveFor(conflict).click();
  await waitFor(() => reads.length === 1, "original conflict reread");
  await settle(); await settle();
  const recovery = byText(q.app, "button", "Reload and discard my draft");
  check("CC065 conflict rereads once and retains the same draft for a deliberate retry or discard",
    reads.length === 1 && writes.length === 1 && formFor(q) === conflict && draft.value === "Retained Draft"
    && !byText(conflict, "span", "unsaved").hidden && !!recovery?.closest(".savebar"));
  if (formFor(q) === conflict) { saveFor(conflict).click(); await settle(); }
  check("CC065 an explicit retry uses the reread revision and the original draft payload",
    writes.length === 2 && writes[1].revision === 9 && writes[1].main === "Retained Draft");

  const z = await profile(), stale = formFor(z);
  let release, requestStarted = false, resolved = false;
  const delayed = new Promise(resolve => { release = resolve; });
  z.intercept(async (path, init) => {
    if (path !== endpoint || init.method !== "PUT") return;
    requestStarted = true; await delayed; resolved = true;
    return response(401, { error: "signed_out" });
  });
  saveFor(stale).click();
  await waitFor(() => requestStarted, "held original request");
  await z.go("#/community/directory");
  await waitFor(() => !z.app.contains(stale), "departure from the profile");
  release();
  await waitFor(() => resolved, "late reply delivered");
  await settle(); await settle();
  check("CC065 a departed profile refusal does not sign out or replace the newer route",
    z.location.hash === "#/community/directory" && !z.app.textContent.includes("Sign in with Discord") && !z.document.body.textContent.includes("You were signed out. Sign in with Discord again."));

  console.log("\n" + ok + "/" + n + " member profile recovery checks passed");
  process.exit(ok === n ? 0 : 1);
})().catch(error => { console.error(error); process.exit(1); });
`;
const execution = new Module(__filename, module);
execution.filename = __filename;
execution.paths = Module._nodeModulePaths(__dirname);
// RC-272 (our 925a505, 12 Nov 2026): the Community section row schedules its sideways scroll with
// requestAnimationFrame, which every browser has. The page window gets it as one later frame, the same two
// lines frontend_check.cjs receives on the mig-a branch; once that copy carries them, they are taken from it.
let prefix = source.slice(0, starts[0].index);
if (!prefix.includes('sandbox.requestAnimationFrame')) {
  const windowLine = '  sandbox.globalThis = sandbox; sandbox.self = sandbox;\n';
  if (prefix.split(windowLine).length !== 2) throw Error('One real frontend sandbox window line required');
  prefix = prefix.replace(windowLine, windowLine + '  sandbox.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);\n  sandbox.cancelAnimationFrame = (handle) => clearTimeout(handle);\n');
}
execution._compile(prefix + '\n' + body, __filename);
