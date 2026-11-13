/* Olympus University rules (Evergreen Stage 2, 12 Nov 2026; CL2-052, CL2-057, CL2-059, CL2-060).
 * One closed validator shared by the page and the build: university.js refuses a guide that fails it, and
 * scripts/university/validate.cjs runs it over every file before a commit. It never fetches and never touches the DOM.
 * The honesty rule it enforces: every quiz answer and distractor must be found in the facts a question cites,
 * an unavailable (grade U) or re-check fact can never be quizzed, and Classic 1.12 reference facts (grades D and E)
 * may only be asked about in a question that says "In Classic 1.12". */
(function (root) {
  "use strict";
  // The directive's section order (Pillar 2 item 1). "overview" opens every track; the mastery exam closes it.
  const SECTIONS = Object.freeze([
    ["overview", "Overview"], ["talents", "Talents"], ["rotation", "Rotation"], ["stat-caps", "Stat caps"],
    ["gear", "Pre-BiS and BiS"], ["consumables", "Consumables"], ["macros", "Macros"], ["praxis", "PvP and raid praxis"],
  ]);
  const SECTION_INDEX = new Map(SECTIONS.map(([k], i) => [k, i]));
  const TRACKS = Object.freeze([["101", "101 Foundations"], ["201", "201 Intermediate"], ["301", "301 Advanced"]]);
  const GRADES = ["A", "B", "C", "D", "E", "U"];
  const SOURCE_KINDS = ["official", "licensed-data", "forever-guide", "community", "classic-baseline"];
  const FACT_KINDS = ["theory", "praxis", "reference"];
  const STATUSES = ["complete", "migrated"];
  const HOSTS = new Set(["worldofwarcraft.blizzard.com", "news.blizzard.com", "us.forums.blizzard.com", "eu.forums.blizzard.com", "warcraft.wiki.gg",
    "www.wowhead.com", "wowhead.com", "www.icy-veins.com", "icy-veins.com", "www.method.gg", "method.gg", "www.warcrafttavern.com", "warcrafttavern.com",
    "talentsforever.com", "www.talentsforever.com", "www.curseforge.com", "curseforge.com", "github.com", "wowpedia.fandom.com", "wago.tools"]);
  const ID = /^[a-z0-9][a-z0-9.-]{0,119}$/;
  const SLUG = /^[a-z][a-z0-9-]{0,39}$/;
  const DAY = /^20\d\d-\d\d-\d\d$/;
  const CODE = /^ot1\.([a-f0-9]{12})\.([a-z]+)\.(30|60)\.([0-9]+)$/;
  // The 5 Nov owner ruling keeps custom scripts disabled in the game client, so a macro may never run Lua.
  const MACRO_FORBIDDEN = /(^|\n)\s*\/(run|script|console|dump|framestack|eventtrace)\b/i;
  const CLASSIC_STEM = /^In Classic 1\.12\b/;

  const isText = (v, max = 400) => typeof v === "string" && v.length > 0 && v.length <= max && v.trim() === v;
  const isList = (v, max, min = 0) => Array.isArray(v) && v.length <= max && v.length >= min;
  function safeUrl(url) {
    if (typeof url !== "string" || url.length > 400) return null;
    const m = /^https:\/\/([a-z0-9.-]+)(\/[^\s"'<>]*)?$/.exec(url);
    return m && HOSTS.has(m[1]) ? url : null;
  }

  // Text matching for the honesty rule. A choice is "supported" by a fact when the choice, as written, appears in the
  // fact's label or value as a whole phrase: "3%" matches "by 3%." but not "by 13%", and "row 7" matches "row 7, column 2".
  // Case, curly quotes, dashes and thousands separators ("1,200" reads as 1200) are ignored; nothing else is.
  function normalize(text) {
    return String(text).toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[‐-―]/g, "-")
      .replace(/(\d),(\d{3})\b/g, "$1$2").replace(/\s+/g, " ").trim();
  }
  const numbersIn = text => (normalize(text).match(/\d+(?:\.\d+)?/g) || []).map(n => String(Number(n)));
  function factText(fact) { return normalize([fact.label, fact.value || "", fact.note || ""].join(" ")); }
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function phrase(choice) {
    const want = normalize(choice).replace(/[.;:,]+$/, "");
    if (want.length < 1) return null;
    return new RegExp((/^[a-z0-9]/.test(want) ? "(^|[^a-z0-9])" : "") + escape(want) + (/[a-z0-9]$/.test(want) ? "($|[^a-z0-9])" : ""));
  }
  function supports(choice, facts) {
    const re = phrase(choice);
    return !!re && facts.some(f => re.test(factText(f)));
  }
  // Numbers stated in praxis text must come from the facts the step cites.
  // "Classic 1.12" names the reference version, not a game value, so it is not a number a fact must hold.
  const numbersSupported = (text, facts) => { const have = new Set(facts.flatMap(f => numbersIn(factText(f)))); return numbersIn(String(text).replace(/\bClassic 1\.12\b/g, "Classic")).every(n => have.has(n)); };
  // A fact the 2 Nov notes overtook (supersededBy, review of 12 Nov 2026) is never shown or asked about alone: wherever
  // it is cited, the fact that supersedes it is cited beside it. Returns the ids of the missing successors.
  const missingSuccessors = (ids, facts) => ids.map(id => facts.get(id)).filter(f => f && f.supersededBy && !ids.includes(f.supersededBy)).map(f => f.supersededBy).filter((id, i, all) => all.indexOf(id) === i);

  // Deterministic ordering (no Math.random): FNV-1a over the attempt number and the question id, then a 32-bit avalanche
  // finaliser (MurmurHash3 fmix32). With the attempt hashed last and no finaliser, a new attempt moved each hash by only a
  // small multiple of the FNV prime, so a retake drew the same questions in a new order (review, 12 Nov 2026).
  function fnv1a(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function fmix32(h) {
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
    return h >>> 0;
  }
  function order(items, key, attempt) {
    return items.map(item => [fmix32(fnv1a(attempt + ":" + key(item))), item]).sort((a, b) => a[0] - b[0] || (key(a[1]) < key(b[1]) ? -1 : 1)).map(x => x[1]);
  }

  function collector() {
    const errors = [];
    return { errors, check(ok, where, message) { if (!ok) errors.push(where + ": " + message); return !!ok; } };
  }

  function validateSources(doc, c) {
    const byId = new Map();
    if (!c.check(doc && doc.schema === "olympus-university-sources-v1" && isList(doc.sources, 400, 1), "sources.json", "schema")) return byId;
    for (const s of doc.sources) {
      const where = "source " + (s && s.id);
      if (!c.check(s && ID.test(s.id) && !byId.has(s.id), where, "id must be unique and match " + ID)) continue;
      c.check(isText(s.label, 200) && isText(s.publisher, 80) && SOURCE_KINDS.includes(s.kind), where, "label, publisher and kind are required");
      c.check(safeUrl(s.url), where, "url must be an allow-listed https address");
      c.check(s.checkedAt === undefined || DAY.test(s.checkedAt), where, "checkedAt must be YYYY-MM-DD");
      byId.set(s.id, s);
    }
    return byId;
  }

  const SCOPE_KEYS = ["class", "spec", "race", "profession"];
  function validateFactFile(doc, c, sources, facts, talents) {
    const file = doc && doc.file;
    if (!c.check(doc && doc.schema === "olympus-university-facts-v1" && SLUG.test(file || "") && isList(doc.facts, 3000), "facts/" + file, "schema")) return;
    // A file may state shared fields once in "defaults" (the generated talent files do); a fact's own fields win.
    const defaults = doc.defaults === undefined ? {} : doc.defaults;
    c.check(defaults && typeof defaults === "object" && Object.keys(defaults).every(k => ["kind", "grade", "sources", "reviewedAt", "gameBuild"].includes(k)),
      "facts/" + file, "defaults may hold kind, grade, sources, reviewedAt and gameBuild");
    for (const raw of doc.facts) {
      const f = raw && typeof raw === "object" ? { ...defaults, ...raw } : raw;
      const where = "fact " + (f && f.id);
      if (!c.check(f && ID.test(f.id) && f.id.startsWith(file + "."), where, "id must start with '" + file + ".'")) continue;
      if (!c.check(!facts.has(f.id), where, "duplicate fact id")) continue;
      c.check(f.scope && typeof f.scope === "object" && Object.keys(f.scope).every(k => SCOPE_KEYS.includes(k) && SLUG.test(f.scope[k])), where, "scope keys are class, spec, race or profession");
      c.check(/^[a-z0-9][a-z0-9:.-]{0,79}$/.test(f.topic || ""), where, "topic is a lower-case key");
      c.check(FACT_KINDS.includes(f.kind) && GRADES.includes(f.grade) && isText(f.label, 160), where, "kind, grade and label are required");
      c.check(f.grade === "U" ? f.value === null : isText(f.value, 700), where, f.grade === "U" ? "a grade-U fact has value null" : "value is required");
      c.check(f.note === undefined || isText(f.note, 400), where, "note must be short text");
      c.check(isList(f.sources, 12, f.grade === "U" ? 0 : 1) && f.sources.every(id => sources.has(id)), where, "cites unknown or no sources");
      c.check(DAY.test(f.reviewedAt || "") && isText(f.gameBuild, 80), where, "reviewedAt and gameBuild are required");
      c.check(f.recheck === undefined || isText(f.recheck, 300), where, "recheck is a reason");
      c.check(f.supersededBy === undefined || (ID.test(f.supersededBy) && f.supersededBy !== f.id && isText(f.note, 400)), where, "supersededBy names another fact, and the note says what changed");
      if (f.grade === "A" && f.recheck === undefined) {
        c.check(f.sources.includes("talents-data") && (typeof f.talent === "string" || typeof f.tree === "string"), where, "a current grade-A fact names its talent or tree and cites talents-data");
      }
      if (f.talent !== undefined && talents) {
        const t = talents.get(f.talent);
        if (c.check(t, where, "talent " + f.talent + " is not in talents/data.json") && f.recheck === undefined) {
          const have = new Set([t.row, t.column, t.maxRank].map(String).concat(t.descriptions.flatMap(numbersIn), numbersIn(t.cost || "")));
          c.check(numbersIn(f.value || "").every(n => have.has(n)), where, "a number in the value is not in " + t.name + "'s current rank text");
          c.check(normalize(f.value || "").includes(normalize(t.name)) || normalize(f.label).includes(normalize(t.name)), where, "label or value must name " + t.name);
        }
      }
      if (f.grade === "D" || f.grade === "E") c.check(/Classic/.test(f.label + " " + (f.note || "") + " " + f.value) || /Classic/.test(f.gameBuild), where, "a D/E fact must say it is a Classic reference");
      facts.set(f.id, f);
    }
  }

  function validatePraxis(p, c, where, facts, strict) {
    if (!c.check(p && isList(p.steps, 12, strict ? 1 : 0) && isList(p.mistakes, 8), where, "praxis needs steps and mistakes")) return;
    for (const s of p.steps) {
      if (!c.check(s && isText(s.text, 500) && (s.facts === undefined || isList(s.facts, 6)), where, "a step is {text, facts?}")) continue;
      const cited = (s.facts || []).map(id => facts.get(id));
      c.check(cited.every(Boolean), where, "a step cites an unknown fact");
      c.check(!missingSuccessors(s.facts || [], facts).length, where, "step '" + s.text.slice(0, 50) + "' cites a superseded fact without " + missingSuccessors(s.facts || [], facts).join(", "));
      if (strict && cited.every(Boolean)) {
        c.check(numbersSupported(s.text, cited), where, "step '" + s.text.slice(0, 50) + "' states a number its facts do not hold");
        c.check(cited.every(f => f.grade !== "U" && !f.recheck), where, "a step cites an unavailable or re-check fact");
      }
    }
    for (const m of p.mistakes) {
      if (!c.check(m && isText(m.mistake, 300) && isText(m.fix, 500) && isList(m.facts, 6, 1), where, "a mistake is {mistake, fix, facts[1..6]}")) continue;
      const cited = m.facts.map(id => facts.get(id));
      c.check(!missingSuccessors(m.facts, facts).length, where, "mistake '" + m.mistake.slice(0, 50) + "' cites a superseded fact without " + missingSuccessors(m.facts, facts).join(", "));
      if (c.check(cited.every(Boolean), where, "a mistake cites an unknown fact")) {
        c.check(numbersSupported(m.mistake + " " + m.fix, cited), where, "mistake '" + m.mistake.slice(0, 50) + "' states a number its facts do not hold");
        c.check(cited.every(f => f.grade !== "U" && !f.recheck), where, "a mistake cites an unavailable or re-check fact");
      }
    }
  }

  function validateMacros(list, c, where, facts) {
    if (list === undefined) return;
    if (!c.check(isList(list, 8, 1), where, "macros is a list")) return;
    for (const m of list) {
      if (!c.check(m && isText(m.name, 60) && typeof m.body === "string" && m.body.length <= 255 && ["B", "C"].includes(m.grade) && isList(m.facts, 4, 1), where, "a macro is {name, body<=255, grade B|C, facts}")) continue;
      c.check(!MACRO_FORBIDDEN.test(m.body), where, "macro " + m.name + " uses a script command; custom scripts stay disabled (5 Nov ruling)");
      c.check(m.body.split("\n").every(line => line === "" || /^(#showtooltip|\/(cast|use|target|targetenemy|focus|stopattack|startattack|stopcasting|castsequence|assist|equip|petattack|petfollow)\b)/i.test(line)), where, "macro " + m.name + " uses a command outside /cast, /use, /target, /stopattack and their kin");
      c.check(m.facts.every(id => facts.has(id)), where, "a macro cites an unknown fact");
    }
  }

  function validateTrack(track, tier, c, where, facts, ctx) {
    if (!c.check(track && isText(track.summary, 500) && isList(track.chapters, 24) && isList(track.omitted, SECTIONS.length), where, "a track is {summary, chapters, omitted}")) return;
    const strict = ctx.status === "complete";
    let last = -1;
    const covered = new Set();
    for (const ch of track.chapters) {
      const w = where + " chapter " + (ch && ch.id);
      if (!c.check(ch && ID.test(ch.id) && !ctx.chapters.has(ch.id) && SECTION_INDEX.has(ch.section) && isText(ch.title, 100), w, "a chapter has a unique id, a section and a title")) continue;
      ctx.chapters.set(ch.id, { tier, section: ch.section, scope: ctx.scope, unavailable: ch.unavailable !== undefined, quizFree: ch.noQuiz !== undefined });
      const at = SECTION_INDEX.get(ch.section);
      c.check(at >= last, w, "chapters must follow the section order " + SECTIONS.map(s => s[0]).join(" > "));
      last = Math.max(last, at); covered.add(ch.section);
      c.check(isList(ch.theory, 16) && ch.theory.every(id => facts.has(id)), w, "theory lists known fact ids");
      c.check(!isList(ch.theory, 16) || !missingSuccessors(ch.theory, facts).length, w, "theory lists a superseded fact without " + (isList(ch.theory, 16) ? missingSuccessors(ch.theory, facts).join(", ") : ""));
      c.check(ch.presets === undefined || (isList(ch.presets, 4, 1) && ch.presets.every(id => ctx.presets.has(id) && ctx.presets.get(id).classId === ctx.classId)), w, "presets must be this class's presets");
      if (ch.unavailable !== undefined) {
        c.check(isText(ch.unavailable, 400), w, "unavailable is the reason");
        c.check(ch.praxis === undefined && ch.macros === undefined && ch.presets === undefined && ch.noQuiz === undefined, w, "an unavailable chapter carries no praxis, macros, presets or quiz");
        continue;
      }
      if (strict) {
        c.check(ch.theory.length >= 1, w, "a complete chapter needs at least one theory fact");
        c.check(ch.theory.every(id => !facts.get(id) || !facts.get(id).recheck), w, "a complete chapter cites a re-check fact");
        c.check(ch.praxis && ch.praxis.steps && ch.praxis.steps.length >= (tier === "101" ? 3 : 1) && ch.praxis.mistakes && ch.praxis.mistakes.length >= 1,
          w, "a complete chapter needs praxis steps (three in 101) and at least one mistake with its fix");
        c.check(ch.noQuiz === undefined || isText(ch.noQuiz, 300), w, "noQuiz is the reason");
      } else c.check(ch.theory.length || (ch.praxis && ch.praxis.steps.length) || ch.presets, w, "a chapter needs theory, praxis or presets");
      if (ch.praxis !== undefined) validatePraxis(ch.praxis, c, w, facts, strict);
      validateMacros(ch.macros, c, w, facts);
    }
    for (const o of track.omitted) {
      if (!c.check(o && SECTION_INDEX.has(o.section) && isText(o.reason, 300), where, "an omission is {section, reason}")) continue;
      c.check(!covered.has(o.section), where, "section " + o.section + " is both covered and omitted");
      covered.add(o.section);
    }
    c.check(SECTIONS.every(([k]) => covered.has(k)), where, "every section is covered by a chapter or omitted with a reason: missing " + SECTIONS.filter(([k]) => !covered.has(k)).map(s => s[0]).join(", "));
  }

  function validateTracks(tracks, c, where, facts, ctx) {
    if (!c.check(tracks && TRACKS.every(([t]) => tracks[t]) && Object.keys(tracks).length === 3, where, "tracks 101, 201 and 301 are required")) return;
    for (const [t] of TRACKS) validateTrack(tracks[t], t, c, where + " " + t, facts, ctx);
  }
  function validateOverview(o, c, where, facts, strict) {
    if (!c.check(o && isText(o.lead, 500) && isList(o.points, 8) && isList(o.facts, 12), where, "overview is {lead, points, facts}")) return;
    c.check(o.points.every(p => p && isText(p.text, 500) && (p.facts === undefined || p.facts.every(id => facts.has(id)))), where, "overview points are {text, facts?}");
    c.check(o.facts.every(id => facts.has(id)), where, "overview cites unknown facts");
    c.check(!missingSuccessors(o.facts, facts).length && o.points.every(p => !p || !p.facts || !missingSuccessors(p.facts, facts).length), where, "overview cites a superseded fact without the fact that supersedes it");
    // In a complete guide every overview point is a claim like any praxis step: it cites a fact and states only its numbers
    // (review, 12 Nov 2026, after uncited partner and scope lines on the profession pages).
    if (strict) for (const p of o.points) if (p && isText(p.text, 500)) {
      const cited = (p.facts || []).map(id => facts.get(id));
      if (c.check(cited.length >= 1 && cited.every(Boolean), where, "point '" + p.text.slice(0, 50) + "' cites no fact")) c.check(numbersSupported(p.text, cited), where, "point '" + p.text.slice(0, 50) + "' states a number its facts do not hold");
    }
  }

  function validateGuide(guide, c, facts, ctx) {
    const kind = guide && guide.kind, id = guide && guide.id;
    const where = kind + " " + id;
    if (!c.check(guide && guide.schema === "olympus-university-guide-v1" && ["class", "race", "profession"].includes(kind) && SLUG.test(id || "") && isText(guide.name, 40)
      && STATUSES.includes(guide.status) && DAY.test(guide.reviewedAt || "") && isList(guide.factFiles, 12, 1) && isList(guide.quizFiles, 8), where, "guide header")) return;
    c.check(guide.factFiles.every(f => SLUG.test(f)) && guide.quizFiles.every(f => SLUG.test(f)), where, "factFiles and quizFiles are file names");
    c.check(guide.migratedFrom === undefined || isText(guide.migratedFrom, 200), where, "migratedFrom is text");
    // Lines from the .218 guides that a rewrite could not carry (no reviewed fact holds them) are kept here, never shown.
    c.check(guide.heldBack === undefined || (isList(guide.heldBack, 60) && guide.heldBack.every(x => x && isText(x.from, 200) && isText(x.text, 500) && isText(x.reason, 300))), where, "heldBack is [{from, text, reason}]");
    c.check(guide.pairsWith === undefined || (kind === "profession" && isList(guide.pairsWith, 3) && guide.pairsWith.every(k => SLUG.test(k))), where, "pairsWith lists profession keys");
    const base = { status: guide.status, chapters: ctx.chapters, presets: ctx.presets, classId: kind === "class" ? id : null };
    validateOverview(guide.overview, c, where + " overview", facts, guide.status === "complete");
    validateTracks(guide.tracks, c, where, facts, { ...base, scope: kind + ":" + id });
    if (kind === "class") {
      if (!c.check(isList(guide.specs, 3, 3), where, "a class has three specs")) return;
      for (const s of guide.specs) {
        if (!c.check(s && SLUG.test(s.id) && isText(s.name, 40) && isList(s.roles, 2, 1), where + " spec", "spec header")) continue;
        validateOverview(s.overview, c, where + " " + s.id + " overview", facts, guide.status === "complete");
        validateTracks(s.tracks, c, where + " " + s.id, facts, { ...base, scope: "spec:" + id + "-" + s.id });
      }
    }
    if (kind === "profession") c.check(["primary", "gathering", "secondary"].includes(guide.type), where, "profession type");
  }

  const SCOPE = /^(class|spec|race|profession):[a-z][a-z0-9-]{0,60}$/;
  function validateQuizFile(doc, c, facts, ctx, seen) {
    const file = doc && doc.file;
    if (!c.check(doc && doc.schema === "olympus-university-quiz-v1" && SLUG.test(file || "") && isList(doc.questions, 2000), "quizzes/" + file, "schema")) return [];
    const ok = [];
    for (const q of doc.questions) {
      const where = "question " + (q && q.id);
      if (!c.check(q && ID.test(q.id) && q.id.startsWith(file + ".") && !seen.has(q.id), where, "id must be unique and start with '" + file + ".'")) continue;
      seen.add(q.id);
      const before = c.errors.length;
      c.check(SCOPE.test(q.scope || "") && TRACKS.some(([t]) => t === String(q.tier)) && ["mcq", "scenario"].includes(q.type), where, "scope, tier and type");
      const chapter = ctx.chapters && ctx.chapters.get(q.chapter);
      if (ctx.chapters) {
        c.check(chapter && chapter.tier === String(q.tier) && chapter.scope === q.scope, where, "chapter " + q.chapter + " must exist in this scope and tier");
        c.check(!chapter || !chapter.unavailable, where, "a question cannot sit in an unavailable chapter");
      }
      c.check(isText(q.stem, 400) && isList(q.choices, 5, 2) && q.choices.every(x => isText(x, 160)) && new Set(q.choices.map(normalize)).size === q.choices.length, where, "a stem and 2-5 distinct choices");
      c.check(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < (q.choices || []).length && isText(q.explanation, 700), where, "answer index and explanation");
      c.check(isList(q.facts, 6, 1) && isList(q.distractorFacts || [], 12), where, "a question cites 1-6 facts");
      if (c.errors.length > before) continue;
      const cited = q.facts.map(id => facts.get(id));
      if (!c.check(cited.every(Boolean), where, "cites an unknown fact")) continue;
      c.check(cited.every(f => f.grade !== "U" && f.value !== null), where, "cites an unavailable (grade U) fact");
      c.check(cited.every(f => !f.recheck), where, "cites a fact marked for re-check");
      c.check(!missingSuccessors(q.facts, facts).length, where, "cites a superseded fact without " + missingSuccessors(q.facts, facts).join(", "));
      if (cited.some(f => f.grade === "D" || f.grade === "E")) c.check(CLASSIC_STEM.test(q.stem), where, "a question on a Classic reference fact must start 'In Classic 1.12'");
      c.check(supports(q.choices[q.answer], cited), where, "answer '" + q.choices[q.answer] + "' is not found in its cited facts");
      const siblings = (q.distractorFacts || []).map(id => facts.get(id));
      if (!c.check(siblings.every(Boolean), where, "distractorFacts cites an unknown fact")) continue;
      const topics = new Set(cited.map(f => f.topic));
      c.check(siblings.every(f => topics.has(f.topic) && !q.facts.includes(f.id) && f.grade !== "U"), where, "distractor facts must be siblings: same topic as a cited fact, not cited, not grade U");
      q.choices.forEach((choice, i) => {
        // A wrong choice is another value of the same kind: a different rank, threshold or option in a cited fact, or a
        // value a sibling fact holds. It is never written freehand, and it is never the answer itself.
        if (i !== q.answer) c.check(supports(choice, [...cited, ...siblings]) && normalize(choice) !== normalize(q.choices[q.answer]), where, "distractor '" + choice + "' is not drawn from a cited or sibling fact");
      });
      if (c.errors.length === before) ok.push(q);
    }
    return ok;
  }

  // Everything one page needs, validated as a unit. The Node build adds the talent table and the preset source.
  function validateBundle(bundle, extra = {}) {
    const c = collector();
    const sources = validateSources(bundle.sources, c);
    const facts = new Map();
    for (const doc of bundle.factFiles || []) validateFactFile(doc, c, sources, facts, extra.talents);
    for (const f of facts.values()) {
      if (f.supersededBy === undefined) continue;
      const by = facts.get(f.supersededBy);
      c.check(by && by.grade !== "U" && !by.supersededBy && !by.recheck, "fact " + f.id, "supersededBy " + f.supersededBy + " must be a loaded, current fact");
    }
    const presets = new Map();
    if (bundle.presets !== undefined) {
      if (c.check(bundle.presets && bundle.presets.schema === "olympus-university-presets-v1" && isList(bundle.presets.presets, 120), "presets.json", "schema")) {
        for (const p of bundle.presets.presets) {
          const m = p && CODE.exec(p.code);
          if (c.check(m && ID.test(p.id) && m[2] === p.classId && Number(m[3]) === p.level && isText(p.label, 120) && isList(p.why, 3) && isList(p.treePoints, 3, 3)
            && (!extra.revision || m[1] === extra.revision), "preset " + (p && p.id), "preset shape or talent revision")) presets.set(p.id, p);
        }
      }
    }
    const chapters = new Map();
    for (const guide of bundle.guides || []) validateGuide(guide, c, facts, { chapters, presets });
    const seen = new Set(), questions = [];
    for (const doc of bundle.quizFiles || []) questions.push(...validateQuizFile(doc, c, facts, { chapters: (bundle.guides || []).length ? chapters : null }, seen));
    for (const guide of bundle.guides || []) {
      if (guide.status !== "complete") continue;
      for (const [id, ch] of chapters) {
        if (!ch.scope.endsWith(":" + guide.id) && !ch.scope.startsWith("spec:" + guide.id + "-")) continue;
        if (ch.unavailable || ch.quizFree) continue;
        c.check(questions.some(q => q.chapter === id), "chapter " + id, "a complete guide's available chapter needs a quiz question or a noQuiz reason");
      }
    }
    return { errors: c.errors, facts, sources, chapters, questions, presets };
  }

  // Mastery exams (integrator, 12 Nov 2026). A guide has one exam scope per course: the class course and each spec, or
  // the race or profession course. A class exam draws on the class and all its specs; a spec exam on that spec and the
  // class course. The page and the build use this one definition, so the exam index in index.json matches the pages.
  const examScopes = guide => guide.kind === "class" ? ["class:" + guide.id, ...(guide.specs || []).map(s => "spec:" + guide.id + "-" + s.id)] : [guide.kind + ":" + guide.id];
  function examPool(questions, scopeKey, tier, classId) {
    return questions.filter(q => String(q.tier) === String(tier) && (q.scope === scopeKey
      || (scopeKey.startsWith("class:") && q.scope.startsWith("spec:" + scopeKey.slice(6) + "-"))
      || (scopeKey.startsWith("spec:") && classId && q.scope === "class:" + classId)));
  }
  // The index lists every exam with at least one question: [{scope, tier, questions}], in course and track order.
  function examCatalogue(guide, questions) {
    const out = [];
    for (const scope of examScopes(guide)) for (const [tier] of TRACKS) {
      const n = examPool(questions, scope, tier, guide.kind === "class" ? guide.id : null).length;
      if (n) out.push({ scope, tier, questions: n });
    }
    return out;
  }

  const api = Object.freeze({ SECTIONS, TRACKS, GRADES, normalize, supports, numbersIn, fnv1a, order, safeUrl, validateBundle, examScopes, examPool, examCatalogue });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OlympusUniversityRules = api;
})(typeof window !== "undefined" ? window : globalThis);
