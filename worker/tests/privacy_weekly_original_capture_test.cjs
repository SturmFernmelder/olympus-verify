// The actual weekly producer and native schema; no provider or real-account effects.
const reviewFs = require("node:fs"), reviewPath = require("node:path"), reviewModule = require("node:module"), reviewCrypto = require("node:crypto");
const reviewWorker = process.env.PRIVACY_REVIEW_WORKER || reviewPath.join(__dirname, "..");
const originalFixture = reviewPath.join(reviewWorker, "tests", "community_contributions_test.cjs");
const fixtureText = reviewFs.readFileSync(originalFixture, "utf8"), prefixMarker = "(async () => {";
if (fixtureText.split(prefixMarker).length !== 2) throw Error("original contribution native setup marker changed");
const suite = `
(async () => {
  const G = "a".repeat(32), H = "b".repeat(32);
  let providerCalls = 0;
  globalThis.fetch = async () => { providerCalls++; throw Error("synthetic provider must not run"); };
  for (const [key, names] of [["./discord", ["logLine", "postMessage", "staffNotice", "addRole", "removeRole", "guildMember", "setNickname", "rest"]], ["./dm", ["notify", "flushNotices"]], ["./review", ["onVerified"]]])
    for (const name of names) stubs[key][name] = async () => { providerCalls++; throw Error("synthetic effect must not run"); };

  const sqlAll = (sql, ...params) => db.prepare(sql).all(...params);
  // Synthetic subject rows and transitions are admitted fixture writes, as siteUser/character already are: the same SQL and binds through fixtureRun.
  const subject = (generation = G, state = "active", id = MEMBER) => fixtureRun(
    "INSERT INTO privacy_subjects(subject_id,generation,state,revision,created_at,updated_at,erased_at,retain_until) VALUES(?,?,?,0,?,?,?,?)",
    id, generation, state, T, T, state === "retired" ? T : null, state === "retired" ? T + 31622400 : null);
  const stateChange = async (mode, id = MEMBER) => {
    if (mode === "retiring") await fixtureRun("UPDATE privacy_subjects SET state='retiring',revision=revision+1,updated_at=? WHERE subject_id=?", T, id);
    else if (mode === "new-generation") await fixtureRun("UPDATE privacy_subjects SET generation=?,revision=revision+1,updated_at=? WHERE subject_id=?", H, T, id);
    else if (mode === "absence-to-active") await subject(H, "active", id);
    else if (mode === "generation-to-absence") await fixtureRun("DELETE FROM privacy_subjects WHERE subject_id=?", id);
    else throw Error("unknown synthetic transition");
  };
  async function reset(original = "active", other = false) {
    db.close(); db = freshDb(); T = Math.floor(RealDate.now() / 1000);
    BEFORE = null; AFTER = null; SQLS = null; statements = 0;
    await siteUser(MEMBER, { first_login: T, last_login: T, session_version: 1 });
    await character(MEMBER, "Mia One", T - 30 * DAY, "Player-1-0001");
    if (original !== "absent") await subject(G, original);
    if (other) { await siteUser(OTHER, { first_login: T, last_login: T }); await character(OTHER, "Oz Two", T - 30 * DAY, "Player-1-0002"); await subject(H, "active", OTHER); }
  }
  function instrument({ duringPolicy = null, beforeMutation = null, loseReply = false } = {}) {
    // The opener is called directly, so it gets the environment the original suite's direct calls use (what directEnv builds:
    // the family's Native port under the write-admission writer, 'canonical', the entry epoch). The admitted database's statements
    // are frozen, its prepare/batch are witnessed, and every call runs as one Native batch, so the opener is observed at the fixture
    // port's own awaited hooks - as d1() does for the original suite's races - at its logical payload: the admission bracket and the
    // materialized header are physical, not payload. (Today's policy insert is itself a two-statement batch; it is counted there.)
    const observed = { attempts: 0, policies: 0, batches: 0, beforeMutations: 0, mutationSQL: [] };
    const logical = plan => /^UPDATE privacy_write_admission SET entry_changes=/.test(plan[0]?.statement ?? "") ? plan.slice(2, -2) : /^WITH business AS MATERIALIZED/.test(plan[0]?.statement ?? "") ? plan.slice(1) : plan;
    const port = entry.originalNativePort(db, {
      readStatement: (statement, params) => lossy(big => { statement.setReadBigInts(big); return statement.all(...params).map(asNumbers); }),
      beforeBatch: async (plan) => {
        const source = logical(plan); observed.attempts += source.length;
        if (source.some(s => s.statement.includes("INSERT INTO community_contribution_obligations"))) {
          observed.batches++; observed.mutationSQL.push(...source.map(s => s.statement)); if (beforeMutation && observed.beforeMutations++ === 0) await beforeMutation();
        }
      },
      afterBatch: async (plan) => {
        const source = logical(plan);
        if (source.some(s => s.statement.includes("INSERT INTO community_contribution_policies"))) { observed.policies++; if (duringPolicy && observed.policies === 1) await duringPolicy(); }
        if (loseReply && source.some(s => s.statement.includes("INSERT INTO community_contribution_obligations"))) throw Error("synthetic lost committed weekly reply");
      },
    });
    const base = env({ ...ON, PRIVACY_ERASURE_ENABLED: "false", PRIVACY_RETENTION_ENABLED: "false" });
    const e = { ...base, DB: load('./privacy-write-admission').createPrivacyWriteAdmissionDatabase(port, 'writer', 'canonical', entry.ENTRY_EPOCH) };
    return { e, observed };
  }
  const protectedSnapshot = () => JSON.stringify(["site_users", "members", "characters", "audit", "pending", "rename_holds", "role_settlements"].map(table => [table, sqlAll("SELECT * FROM " + table + " ORDER BY rowid")]));
  const obligations = () => one("SELECT COUNT(*) n FROM community_contribution_obligations").n;
  const ledgerMembers = () => one("SELECT COUNT(*) n FROM community_contribution_members").n;

  for (const original of ["active", "absent"]) {
    await reset(original); const snapshot = protectedSnapshot(), { e, observed } = instrument();
    check(original + ": genuine unchanged selection opens one obligation", await led.openWeeklyObligations(e, T) === 1);
    check(original + ": native obligation and matching member commit", obligations() === 1 && ledgerMembers() === 1);
    check(original + ": no ordinary identity, role, audit or roster side effect", protectedSnapshot() === snapshot && providerCalls === 0);
    check(original + ": same native attempt envelope unchanged", observed.attempts === 7 && observed.batches === 1 && observed.policies === 1, observed);
    check(original + ": generation guard is in first consuming statement", observed.mutationSQL[0].includes("privacy_subjects") && observed.mutationSQL[0].includes("generation"));
    const before = JSON.stringify(sqlAll("SELECT * FROM community_contribution_obligations"));
    check(original + ": next run does not reopen this week", await led.openWeeklyObligations(e, T) === 0 && before === JSON.stringify(sqlAll("SELECT * FROM community_contribution_obligations")));
  }

  for (const [original, mode] of [["active", "retiring"], ["active", "new-generation"], ["absent", "absence-to-active"], ["active", "generation-to-absence"]]) {
    for (const phase of ["policy await", "consuming batch"]) {
      await reset(original); const snapshot = protectedSnapshot(); let changed = 0;
      const change = async () => { changed++; await stateChange(mode); };
      const { e, observed } = instrument(phase === "policy await" ? { duringPolicy: change } : { beforeMutation: change });
      let result, error; try { result = await led.openWeeklyObligations(e, T); } catch (caught) { error = caught; }
      check(mode + " during " + phase + ": exact original proof is held", changed === 1 && result === 0 && !error, error);
      check(mode + " during " + phase + ": native obligation and member writes absent", obligations() === 0 && ledgerMembers() === 0);
      check(mode + " during " + phase + ": no recapture or automatic retry", observed.batches === 1 && observed.policies === 1);
      check(mode + " during " + phase + ": all unrelated source facts remain", protectedSnapshot() === snapshot && providerCalls === 0);
      if (mode === "retiring") check("retiring remains closed on next run", await led.openWeeklyObligations(e, T) === 0 && obligations() === 0);
      else check(mode + ": independent next invocation may capture current authority", await led.openWeeklyObligations(e, T) === 1 && obligations() === 1);
    }
  }

  for (const state of ["retiring", "retired"]) {
    await reset(state); const { e, observed } = instrument();
    check("already " + state + ": excluded by original scan", await led.openWeeklyObligations(e, T) === 0);
    check("already " + state + ": no policy or mutation admission", observed.attempts === 1 && observed.policies === 0 && observed.batches === 0 && obligations() === 0);
  }

  for (const mode of ["first-login", "session-version", "roster", "eligibility"]) {
    await reset(); const { e } = instrument({ duringPolicy: async () => {
      if (mode === "first-login") await fixtureRun("UPDATE site_users SET first_login=first_login+1 WHERE discord_id=?", MEMBER);
      if (mode === "session-version") await fixtureRun("UPDATE site_users SET session_version=session_version+1 WHERE discord_id=?", MEMBER);
      if (mode === "roster") await fixtureRun("UPDATE characters SET status='left' WHERE discord_id=?", MEMBER);
      if (mode === "eligibility") await fixtureRun("UPDATE characters SET member_since=? WHERE discord_id=?", T, MEMBER);
    } });
    check("existing " + mode + " guard remains effective", await led.openWeeklyObligations(e, T) === 0 && obligations() === 0 && ledgerMembers() === 0);
  }

  await reset("active", true); const { e: unrelated } = instrument({ duringPolicy: () => stateChange("retiring", OTHER) });
  check("another subject's retirement preserves own selected authority", await led.openWeeklyObligations(unrelated, T) === 1);
  check("other held row is skipped while own row progresses", obligations() === 1 && one("SELECT discord_id FROM community_contribution_obligations").discord_id === MEMBER);

  await reset(); const { e: explicit } = instrument({ duringPolicy: () => stateChange("new-generation") });
  let proofError;
  try { await led.createObligation(explicit, { guildScope: "olympus", discordId: MEMBER, periodStart: pol.periodStart(T, P), eligible: true, proof: { firstLogin: T, sessionVersion: 1, privacyGeneration: G } }, T); }
  catch (caught) { proofError = caught; }
  check("native original proof mismatch has genuine proof_changed classification", proofError instanceof led.ContributionError && proofError.code === "proof_changed");
  check("held proof is not confused with rollback or completion", obligations() === 0 && ledgerMembers() === 0);

  await reset(); db.exec("CREATE TEMP TRIGGER weekly_fixture_fault BEFORE INSERT ON community_contribution_members BEGIN SELECT RAISE(ABORT,'weekly native rollback'); END");
  let rollbackError; try { await led.openWeeklyObligations(instrument().e, T); } catch (caught) { rollbackError = caught; }
  check("native member fault propagates a real transaction failure", Boolean(rollbackError) && String(rollbackError).includes("weekly native rollback"));
  check("failed native batch rolls back the preceding obligation", obligations() === 0 && ledgerMembers() === 0);

  await reset(); const { e: lost, observed: lostObserved } = instrument({ loseReply: true });
  let lostError; try { await led.openWeeklyObligations(lost, T); } catch (caught) { lostError = caught; }
  check("lost committed primary reply remains uncertain to caller", Boolean(lostError) && String(lostError).includes("synthetic lost committed weekly reply"));
  check("known native committed rows remain exactly once", obligations() === 1 && ledgerMembers() === 1 && lostObserved.batches === 1);
  check("new invocation observes existing week without repeating effect", await led.openWeeklyObligations(instrument().e, T) === 0 && obligations() === 1);
  check("all cases make no provider calls", providerCalls === 0);
  console.log(ok + "/" + n + " weekly original subject capture checks passed");
  if (ok !== n) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(() => { globalThis.Date = RealDate; db.close(); });
`;
const native = new reviewModule(originalFixture, module);
native.filename = originalFixture;
native.paths = reviewModule._nodeModulePaths(reviewPath.dirname(originalFixture));
native._compile(fixtureText.slice(0, fixtureText.indexOf(prefixMarker)) + suite, originalFixture);
