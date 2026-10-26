/* Original Olympus level-60 character sheet (.186). Talent modifiers are exact pinned rank values; base stats are graded references and are never presented as Forever-verified. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OlympusTalentStats60 = api;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  const NAKED_URL = "/static/talents/naked60-186.json", EFFECTS_URL = "/static/talents/stat-effects186.json";
  const SVG_NS = "http://www.w3.org/2000/svg", LEVEL = 60;
  const CLASS_IDS = ["warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"];
  const STATS = ["str", "agi", "sta", "int", "spi"];
  const STAT_LABEL = { str: "Strength", agi: "Agility", sta: "Stamina", int: "Intellect", spi: "Spirit" };
  const GRADE_ORDER = { A: 5, B: 4, C: 3, E: 2, D: 1, U: 0 };
  const GRADE_FALLBACK = { A: "Exact from current-build client data", B: "Client data with a semantic reading", C: "Rule confirmed by a WoW Forever guide", D: "Derived estimate from Classic reference — not Forever-verified", E: "Classic reference — not Forever-verified", U: "Unavailable" };
  const SOURCE_SHORT = { "db2-wago": "Forever client DB2", "cmangos-7f98ba0f": "CMaNGOS", "vmangos-a9fa07aa": "vmangos", "tavern-forever-stats": "Warcraft Tavern Forever guide", "wiki-spell-crit": "warcraft.wiki.gg", foreverdb: "ForeverDB" };
  // Talents whose rank text grants parry without a published value.
  const PARRY_GRANTS = Object.freeze(["shaman-enhancement-spirit-weapons"]);
  const PP_TARGETS = Object.freeze({
    meleeCrit: ["crit.melee", "crit.melee_ranged", "crit.melee_spell", "crit.all"],
    spellCrit: ["crit.spell", "crit.melee_spell", "crit.all"],
    hitMelee: ["hit.all", "hit.melee", "hit.melee_ranged"],
    hitSpell: ["hit.all", "hit.spell"]
  });
  const SHEET_TARGETS = new Set(["str", "agi", "sta", "int", "spi", "health", "mana", "max_energy", "max_rage", "armor", "attack_power", "ranged_attack_power",
    "crit.melee", "crit.melee_ranged", "crit.melee_spell", "crit.all", "crit.spell", "dodge", "parry", "block",
    "hit.all", "hit.melee", "hit.melee_ranged", "hit.spell", "defense", "mana_regen_casting", "spell_damage", "healing_power", "spell_power"]);
  const POWER_TARGETS = { mana: "mana", max_rage: "rage", max_energy: "energy" };
  const THROUGHPUT_OPS = new Set(["damage_done_pct", "healing_done_pct", "crit_damage_bonus_pct"]);
  const TOGGLE_KINDS = new Set(["form", "shield", "weapon", "pet_active", "no_pet_active", "self_buff"]);
  const WEAPONS = Object.freeze([
    { id: "axe-1h", label: "One-handed axe", tags: ["axe", "one_hand", "any"] }, { id: "axe-2h", label: "Two-handed axe", tags: ["axe", "two_hand", "any"] },
    { id: "mace-1h", label: "One-handed mace", tags: ["mace", "one_hand", "any"] }, { id: "mace-2h", label: "Two-handed mace", tags: ["mace", "two_hand", "any"] },
    { id: "sword-1h", label: "One-handed sword", tags: ["sword", "one_hand", "any"] }, { id: "sword-2h", label: "Two-handed sword", tags: ["sword", "two_hand", "any"] },
    { id: "polearm", label: "Polearm", tags: ["polearm", "two_hand", "any"] }, { id: "staff", label: "Staff", tags: ["staff", "two_hand", "any"] },
    { id: "dagger", label: "Dagger", tags: ["dagger", "one_hand", "any"] }, { id: "fist", label: "Fist weapon", tags: ["fist", "one_hand", "any"] }
  ]);
  const FORM_LABEL = { bear: "Bear Form", dire_bear: "Dire Bear Form", cat: "Cat Form", moonkin: "Moonkin Form" };
  const TARGET_LABEL = { str: "Strength", agi: "Agility", sta: "Stamina", int: "Intellect", spi: "Spirit", health: "maximum health", mana: "maximum mana",
    max_energy: "maximum energy", max_rage: "maximum rage", armor: "armor", attack_power: "attack power", ranged_attack_power: "ranged attack power", "crit.melee": "melee crit chance",
    "crit.melee_ranged": "melee and ranged crit chance", "crit.melee_spell": "melee and spell crit chance", "crit.all": "crit chance (all attacks and spells)",
    "crit.spell": "spell crit chance", dodge: "dodge chance", parry: "parry chance", block: "block chance", "hit.all": "hit chance (attacks and spells)",
    "hit.melee": "melee hit chance", "hit.melee_ranged": "melee and ranged hit chance", "hit.spell": "spell hit chance", defense: "defense skill",
    mana_regen_casting: "mana regeneration while casting", spell_damage: "spell damage", healing_power: "healing", spell_power: "spell damage and healing",
    resistances: "all resistances", spell_penetration: "target resistances", armor_penetration: "target armor", expertise: "chance to be dodged or parried",
    hit_taken: "chance to be hit", damage_taken: "damage taken", damage_done: "damage done", healing_done: "healing done",
    damage_and_healing_done: "damage and healing done", crit_damage: "critical strike damage bonus", crit_healing: "critical healing bonus",
    rage_generation: "rage", buff_effect: "the buff's effect", "haste.melee": "melee attack speed", "haste.melee_ranged": "melee and ranged haste",
    "haste.spell": "spell haste", health_regen: "health regeneration", health_regen_combat: "health regeneration in combat", movement_speed: "movement speed" };
  const GROUPS = Object.freeze([
    ["applied", "Added to the sheet", "Unconditional talent stats, plus conditional ones whose assumption you switched on."],
    ["conditional", "Applies only when an assumption is switched on (not added)", "Switch the matching assumption above to include these in the totals."],
    ["scoped", "Applies only to some spells, attacks or situations (never added)", "The sheet shows general values, so a narrower effect is listed, not summed."],
    ["gear", "Needs gear — adds 0 to a naked character", "Item armor, weapon-type or shield effects. Gear stats themselves are never included."],
    ["other", "Other static modifiers (not a row on this sheet)", "Exact talent values that this sheet does not convert into a total."],
    ["proc", "Procs and temporary effects — never added", "They depend on uptime, so they are listed separately."],
    ["throughput", "Damage, healing and critical-damage modifiers — never added", "Throughput multipliers are not character-sheet stats."],
    ["withheld", "Withheld — rank text changed", "The rank text no longer matches its pinned hash, so the number is not used."]
  ]);
  const K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

  // Small synchronous UTF-8 SHA-256: a changed rank text must not keep an old number.
  function utf8(text) {
    const out = [];
    for (const ch of String(text)) {
      let c = ch.codePointAt(0);
      if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) out.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
      else out.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return out;
  }
  function sha256(text) {
    const bytes = utf8(text), length = bytes.length, total = ((length + 9 + 63) >> 6) << 6, block = new Uint8Array(total);
    block.set(bytes); block[length] = 0x80;
    const view = new DataView(block.buffer), bits = length * 8;
    view.setUint32(total - 8, Math.floor(bits / 0x100000000)); view.setUint32(total - 4, bits >>> 0);
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let offset = 0; offset < total; offset += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        w[i] = (w[i - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[i - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      [a, b, c, d, e, f, g, h].forEach((n, i) => { H[i] = (H[i] + n) >>> 0; });
    }
    return H.map(n => n.toString(16).padStart(8, "0")).join("");
  }

  const num = value => typeof value === "number" && Number.isFinite(value);
  const clean = value => Math.round(value * 1e6) / 1e6;
  // No grade in, no grade out: an empty list never turns into an exact "A".
  function weakest(...grades) {
    const list = grades.flat().filter(g => typeof g === "string");
    return list.length ? list.reduce((worst, g) => (GRADE_ORDER[g] ?? 0) < (GRADE_ORDER[worst] ?? 0) ? g : worst) : null;
  }
  // naked60 evaluation.stacking: combining effects of two or more talents or racial traits assumes the Classic rule, so it is graded E at best.
  // A form's own client-data term (Cat Form attack power from Agility) is part of the form formula, not a stacked modifier.
  const sourceOf = key => { const k = String(key); return k.startsWith("form:") ? null : k.startsWith("racial:") ? k.split(":").slice(0, 2).join(":") : k.split("#")[0]; };
  const stackGrade = list => new Set(list.map(e => sourceOf(e.key)).filter(Boolean)).size >= 2 ? "E" : null;
  const STACK_NOTE = "Combines two or more talents or racial traits: assumes Classic stacking (percentages multiply, points add); not Forever-verified.";
  const ADDITIVE_KINDS = new Set(["pp", "flat", "flat-level"]);
  // Messages written for members; anything else (network or parser text) is replaced by a fixed sentence.
  function userError(message) { const error = Error(message); error.s60 = true; return error; }
  const publicMessage = (error, fallback) => error && error.s60 && error.message ? error.message : fallback;
  function strongest(grades) { return grades.reduce((best, g) => (GRADE_ORDER[g] ?? 0) > (GRADE_ORDER[best] ?? 0) ? g : best, "U"); }
  function fmt(value, digits = 2) {
    if (!num(value)) return "Unavailable";
    let text = (Math.round(value * 10 ** digits) / 10 ** digits).toFixed(digits);
    if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
    if (text === "-0") text = "0";
    return text.replace("-", "−");
  }
  const signed = (value, digits) => (value > 0 ? "+" : "") + fmt(value, digits);
  const listWords = (words, joiner = "or") => words.length > 1 ? words.slice(0, -1).join(", ") + " " + joiner + " " + words[words.length - 1] : words[0] || "";
  const capital = text => String(text).charAt(0).toUpperCase() + String(text).slice(1);
  function parseCondition(text) { const at = String(text).indexOf(":"); return at < 0 ? { kind: String(text), values: [] } : { kind: text.slice(0, at), values: text.slice(at + 1).split("|") }; }

  function conditionText(text) {
    const { kind, values } = parseCondition(text);
    const attack = { melee: "melee attacks", offhand: "off-hand attacks", ability: "abilities", melee_ability: "melee abilities", ranged_ability: "ranged abilities", spell: "spells" };
    const weapon = { axe: "an axe", polearm: "a polearm", mace: "a mace", staff: "a staff", dagger: "a dagger", fist: "a fist weapon", sword: "a sword", two_hand: "a two-handed weapon", one_hand: "a one-handed weapon", ranged: "a ranged weapon", wand: "a wand", any: "a weapon" };
    const trigger = { melee_crit: "after a melee critical strike", damage_taken: "after taking damage", hit_taken: "after being hit", melee_hit: "after a melee hit", crit: "after a critical strike", kill: "after a killing blow that yields experience or honor", spell_crit: "after a spell critical strike" };
    switch (kind) {
      case "attack": return "for " + listWords(values.map(v => attack[v] || v.replace(/_/g, " ")));
      case "weapon": return "with " + listWords(values.map(v => weapon[v] || v)) + " equipped";
      case "shield": return "with a shield equipped";
      case "items": return "on armor from equipped items";
      case "school": return "for " + listWords(values.map(capital)) + " spells";
      case "spell": return "for " + listWords(values, "and") + " only";
      case "except_spell": return "for all spells except " + listWords(values, "and");
      case "spell_type": return "for " + listWords(values) + " spells";
      case "spell_group": return "for " + listWords(values.map(capital)) + " spells";
      case "form": return "in " + listWords(values.map(v => FORM_LABEL[v] || v));
      case "pet_active": return !values.length ? "while your pet is active" : values[0] === "demon" ? "while a Demon pet is summoned" : "while your " + capital(values[0]) + " is active";
      case "no_pet_active": return "while no pet is active";
      case "self_buff": return "while " + listWords(values) + " is active";
      case "target": return "against " + listWords(values.map(v => v + "s"), "and");
      case "incoming": return "against " + listWords(values.map(v => v === "spell" ? "spells" : v === "ranged" ? "ranged attacks" : v), "and");
      case "trigger": return values[0] && values[0].startsWith("spell:") ? "after " + listWords([values[0].slice(6), ...values.slice(1)]) : listWords(values.map(v => trigger[v] || "after " + v.replace(/_/g, " ")), "and");
      case "in_combat": return "in combat";
      case "party_aura": return "as an aura for the party or raid";
      default: return String(text).replace(/[_:|]/g, " ");
    }
  }
  function modifierText(op, target, value, unit, extra = {}) {
    // Sheet additions to "attack_power" are melee attack power; ranged additions have their own target.
    const label = target === "attack_power" && (op === "pct_of_stat" || op === "pct_of_level") ? "melee attack power" : TARGET_LABEL[target] || String(target).replace(/[._]/g, " "), reduce = extra.direction === "reduce";
    switch (op) {
      case "add_pp": return (reduce ? "−" : "+") + fmt(value) + " pp " + label;
      case "add_flat": return (reduce ? "−" : "+") + fmt(value) + " " + label + (unit === "rage_per_3s" ? " every 3 seconds" : "");
      case "mul_total_pct": return "+" + fmt(value) + "% " + label + (extra.statBasis === "items" ? " from items" : extra.statBasis === "total" ? " (total)" : "");
      case "pct_of_stat": return label + " +" + fmt(value) + "% of " + (STAT_LABEL[extra.sourceStat] || extra.sourceStat);
      case "pct_of_level": return unit === "per_level" ? "+" + fmt(value) + " " + label + " per character level" : label + " +" + fmt(value) + "% of character level";
      case "regen_while_casting_pct": return fmt(value) + "% of Spirit-based mana regeneration continues while casting";
      case "damage_taken_pct": return (reduce ? "−" : "+") + fmt(value) + "% " + label;
      case "armor_ignore_pct": return "ignores " + fmt(value) + "% of the target's armor";
      case "regen_in_combat_pct": return fmt(value) + "% of health regeneration continues in combat";
      case "proc":
        if (extra.procEffect === "periodic_heal") return "heals 1% of total health every " + fmt(value) + " seconds";
        if (extra.procEffect === "add_pp") return "+" + fmt(value) + " pp " + label + " while active";
        if (extra.procEffect === "regen_while_casting_pct") return fmt(value) + "% of mana regeneration continues while casting, while active";
        return "+" + fmt(value) + "% " + label + " while active";
      default: return "+" + fmt(value) + "% " + label;
    }
  }

  function walkUnavailable(value, path, problems) {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value) && value.grade === "U" && Object.hasOwn(value, "value") && value.value !== null) problems.push(path);
    for (const [key, child] of Object.entries(value)) walkUnavailable(child, path + "/" + key, problems);
  }
  function validateNaked(data, naked) {
    const fail = error => ({ ok: false, error });
    if (!data || typeof data.revision !== "string") return fail("A talent snapshot is required.");
    if (!naked || naked.schema !== "olympus-naked60-v1" || !naked.build || naked.build.talentRevision !== data.revision) return fail("The level-60 baseline file does not match this talent snapshot.");
    if (!naked.classes || !naked.races || !Array.isArray(naked.combos) || !Array.isArray(naked.formulas) || !naked.grades || !naked.counts) return fail("The level-60 baseline file is incomplete.");
    const counts = naked.counts;
    if (counts.classes !== 9 || counts.races !== 10 || counts.combos !== 56 || counts.formulas !== 21 || naked.combos.length !== 56 || naked.formulas.length !== 21
      || Object.keys(naked.classes).length !== 9 || Object.keys(naked.races).length !== 10 || CLASS_IDS.some(id => !naked.classes[id])) return fail("The level-60 baseline coverage differs from its reviewed inventory.");
    if (!naked.grades.E || naked.grades.E.label !== "Classic reference — not Forever-verified" || !naked.grades.U || naked.grades.U.render !== "Unavailable") return fail("The level-60 grade legend is incomplete.");
    const params = ["power", "apPerStrength", "apPerAgility", "apLevelCoefficient", "apConstant", "rapPerAgility", "rapLevelCoefficient", "rapConstant", "baseHealth", "baseMana",
      "maxPowerNonMana", "baseDodgePct", "dodgeAgiPer1Pct", "critAgiPer1Pct", "spellCritFromIntellect", "canParry", "baseParryPct", "canUseShield", "baseBlockPctWithShield",
      "defenseSkillBase", "manaRegenBasePer2s", "manaRegenSpiritDivisor"];
    for (const id of CLASS_IDS) {
      const cls = naked.classes[id];
      if (params.some(key => !cls[key] || typeof cls[key] !== "object") || !["mana", "rage", "energy"].includes(cls.power.type)) return fail("A class parameter is missing.");
      if (cls.formEffects !== undefined && (!Array.isArray(cls.formEffects) || cls.formEffects.some(f => !f || !Object.hasOwn(FORM_LABEL, f.form) || f.op !== "pct_of_stat"
        || !SHEET_TARGETS.has(f.target) || !STATS.includes(f.sourceStat) || !num(f.value) || !["A", "B"].includes(f.grade) || !num(f.spellId)))) return fail("A form effect is malformed.");
      const rf = cls.rangedApInForms;
      if (rf !== undefined && (!rf || !num(rf.value) || typeof rf.grade !== "string" || !Array.isArray(rf.forms) || rf.forms.some(f => !Object.hasOwn(FORM_LABEL, f)))) return fail("A form rule is malformed.");
      const lc = cls.apLevelCoefficient;
      if (!num(lc.value) && (!Array.isArray(lc.candidates) || lc.candidates.some(c => !num(c.value) || (c.predatoryStrikes !== undefined && !["not_applied", "level_term"].includes(c.predatoryStrikes)))))
        return fail("A disputed attack power candidate is malformed.");
    }
    const tally = { E: 0, D: 0, U: 0 }, seen = new Set();
    for (const combo of naked.combos) {
      const race = naked.races[combo && combo.race], cls = naked.classes[combo && combo.class], base = combo && combo.baseStats;
      if (!race || !cls || seen.has(combo.id) || combo.id !== combo.race + "-" + combo.class || !Array.isArray(race.classes) || !race.classes.includes(combo.class)
        || !base || !Object.hasOwn(tally, base.grade) || combo.measured !== null || !base.values) return fail("A race/class baseline is malformed.");
      seen.add(combo.id); tally[base.grade]++;
      const values = STATS.map(s => base.values[s]);
      if (base.grade === "U" ? values.some(v => v !== null) || combo.referenceSheet !== null : values.some(v => !num(v) || v <= 0)) return fail("Unavailable baselines must carry no numbers.");
      if (combo.race.startsWith("skyborne") && base.grade !== "U") return fail("Skyborne baselines must stay unavailable.");
      if (base.grade === "D" && (!base.tolerance || STATS.some(s => !num(base.tolerance[s]) || base.tolerance[s] < 0))) return fail("A derived baseline lacks its stated tolerance.");
    }
    if (tally.E !== 40 || tally.D !== 6 || tally.U !== 10) return fail("Baseline grades differ from the reviewed inventory.");
    for (const race of Object.values(naked.races)) for (const racial of race.racials || []) for (const comp of racial.components || [])
      if (!num(comp.value) || comp.grade !== "B" || typeof comp.op !== "string" || typeof comp.target !== "string" || !Array.isArray(comp.conditions)) return fail("A racial component is malformed.");
    const problems = []; walkUnavailable(naked, "", problems);
    if (problems.length) return fail("A value marked Unavailable carries a number.");
    return { ok: true, combos: naked.combos.length };
  }
  function validateEffects(data, effects) {
    const fail = error => ({ ok: false, error });
    if (!data || !Array.isArray(data.classes)) return fail("A talent snapshot is required.");
    if (!effects || effects.schema !== "olympus-talent-stat-effects-v1" || !effects.source || effects.source.talentRevision !== data.revision) return fail("Talent stat values are withheld: the talent snapshot revision changed.");
    const counts = effects.counts || {}, list = effects.components;
    if (!Array.isArray(list) || list.length !== counts.components || !effects.ops || !counts.byTier || !counts.byGrade) return fail("The talent stat file is incomplete.");
    const tiers = { A: 0, B: 0, C: 0, M: 0 }, grades = { A: 0, B: 0 }, ids = new Set();
    for (const c of list) {
      if (!c || typeof c.id !== "string" || !/^[a-z0-9-]+#[a-z0-9_]+$/.test(c.id) || ids.has(c.id) || c.id.split("#")[0] !== c.talentId || !CLASS_IDS.includes(c.cls)
        || !Array.isArray(c.values) || !c.values.length || c.values.some(v => !num(v)) || c.maxRank !== c.values.length || !Object.hasOwn(tiers, c.tier) || !Object.hasOwn(grades, c.grade)
        || !Object.hasOwn(effects.ops, c.op) || !Array.isArray(c.conditions) || c.conditions.some(t => typeof t !== "string") || typeof c.appliesNaked !== "boolean"
        || !Array.isArray(c.textSHA256) || c.textSHA256.length !== c.maxRank || c.textSHA256.some(h => !/^[a-f0-9]{64}$/.test(h))) return fail("A talent stat component is malformed.");
      ids.add(c.id); tiers[c.tier]++; grades[c.grade]++;
    }
    if (Object.keys(tiers).some(k => tiers[k] !== counts.byTier[k]) || Object.keys(grades).some(k => grades[k] !== counts.byGrade[k])) return fail("Talent stat tiers or grades differ from their counts.");
    return { ok: true, components: list.length };
  }
  const prepared = new WeakMap();
  function prepare(data, naked, effects) {
    const cached = prepared.get(data);
    if (cached && cached.naked === naked && cached.effects === effects) return cached;
    const n = validateNaked(data, naked); if (!n.ok) throw userError(n.error);
    const e = validateEffects(data, effects); if (!e.ok) throw userError(e.error);
    if (naked.dataJsonSHA256 !== effects.source.dataJsonSHA256) throw userError("The two level-60 files describe different talent snapshots.");
    const talents = new Map();
    for (const cls of data.classes) { let index = 0; for (const tree of cls.trees) for (const talent of tree.talents) talents.set(talent.id, { cls: cls.id, index: index++, talent, tree }); }
    const components = effects.components.map(c => {
      const entry = talents.get(c.talentId);
      const verified = !!entry && entry.cls === c.cls && entry.talent.maxRank === c.values.length && entry.talent.descriptions.every((text, i) => sha256(text) === c.textSHA256[i]);
      return Object.freeze({ comp: c, verified, index: entry ? entry.index : -1, tree: entry ? entry.tree.name : "" });
    });
    const model = Object.freeze({ data, naked, effects, talents, components });
    prepared.set(data, model);
    return model;
  }
  function combosFor(model, className) {
    return Object.entries(model.naked.races).filter(([, race]) => race.classes.includes(className)).map(([id, race]) => {
      const combo = model.naked.combos.find(c => c.race === id && c.class === className);
      return { race: id, label: race.name, grade: combo.baseStats.grade, combo };
    });
  }
  function emptyToggles() { return { form: "", shield: false, weapon: "", pet: "", buffs: [] }; }
  function normalizeToggles(value) {
    const t = Object.assign(emptyToggles(), value || {});
    return { form: Object.hasOwn(FORM_LABEL, t.form) ? t.form : "", shield: t.shield === true, weapon: WEAPONS.some(w => w.id === t.weapon) ? t.weapon : "",
      pet: ["pet", "demon", "imp"].includes(t.pet) ? t.pet : "", buffs: Array.isArray(t.buffs) ? t.buffs.filter(b => typeof b === "string") : [] };
  }
  function petMatches(pet, need) { if (!pet) return false; if (!need) return true; if (need === "demon") return pet === "demon" || pet === "imp"; return pet === need; }
  function conditionState(text, comp, toggles) {
    const { kind, values } = parseCondition(text);
    switch (kind) {
      case "attack": return values.length === 1 && values[0] === "melee" && (String(comp.target).startsWith("crit.melee") || comp.target === "attack_power") ? "ok" : "scope";
      case "except_spell": return "ok";
      case "form": return toggles.form && values.includes(toggles.form) ? "on" : "off";
      case "shield": return toggles.shield ? "on" : "off";
      case "weapon": { const w = WEAPONS.find(x => x.id === toggles.weapon); return w && values.some(v => w.tags.includes(v)) ? "on" : "off"; }
      case "pet_active": return petMatches(toggles.pet, values[0]) ? "on" : "off";
      case "no_pet_active": return toggles.pet ? "off" : "ok";
      case "self_buff": return values.some(name => toggles.buffs.includes(name)) ? "on" : "off";
      case "items": return "gear";
      default: return "scope";
    }
  }
  function classify(comp, toggles) {
    if (comp.tier === "C" || comp.op === "proc") return { group: "proc", states: [] };
    if (comp.tier === "M" || THROUGHPUT_OPS.has(comp.op)) return { group: "throughput", states: [] };
    const states = comp.conditions.map(text => conditionState(text, comp, toggles));
    if (comp.target === "buff_effect") return { group: "scoped", states, note: "The buff's own value is not part of this data, so no number is added." };
    if (!SHEET_TARGETS.has(comp.target)) return { group: "other", states };
    if (states.includes("gear")) return { group: "gear", states };
    if (states.includes("scope")) return { group: "scoped", states };
    if (states.includes("off")) return { group: comp.appliesNaked ? "conditional" : "gear", states, toggleable: true };
    return { group: "applied", states, assumed: states.includes("on") };
  }
  function effectOf(comp, rank, key) {
    const value = comp.values[rank - 1], coef = Array.isArray(comp.coefficientPerLevel) ? comp.coefficientPerLevel[rank - 1] : comp.unit === "per_level" ? value : value / 100;
    return { key: key || comp.id, op: comp.op, target: comp.target, value, coef, sourceStat: comp.sourceStat || null, grade: comp.grade };
  }
  function rankMap(model, className, ranks) {
    const cls = model.data.classes.find(c => c.id === className), talents = cls ? cls.trees.flatMap(t => t.talents) : [];
    if (!cls || !Array.isArray(ranks) || ranks.length !== talents.length || ranks.some((r, i) => !Number.isInteger(r) || r < 0 || r > talents[i].maxRank)) throw userError("Choose a legal rank vector for this class.");
    return new Map(talents.map((t, i) => [t.id, ranks[i]]));
  }
  function talentEffects(model, className, ranks, toggles) {
    const out = { applied: [], items: [] };
    for (const entry of model.components) {
      const comp = entry.comp; if (comp.cls !== className) continue;
      const rank = ranks.get(comp.talentId) || 0; if (!rank) continue;
      if (!entry.verified) { out.items.push({ group: "withheld", comp, rank, entry }); continue; }
      const verdict = classify(comp, toggles), effect = effectOf(comp, rank);
      out.items.push({ group: verdict.group, comp, rank, entry, effect, verdict });
      if (verdict.group === "applied") out.applied.push(effect);
    }
    return out;
  }
  function racialEffects(model, className, combo, toggles) {
    const race = model.naked.races[combo.race], power = model.naked.classes[className].power.type, out = { applied: [], items: [] };
    const included = typeof (combo.baseStats.includesRacials || {}).classicReference === "string" && combo.baseStats.includesRacials.classicReference.startsWith("yes");
    const weapon = WEAPONS.find(w => w.id === (toggles && toggles.weapon));
    for (const racial of race.racials || []) for (const comp of racial.components) {
      if (POWER_TARGETS[comp.target] && POWER_TARGETS[comp.target] !== power) continue;
      const effect = { key: "racial:" + racial.spellId + ":" + comp.metric, op: comp.op, target: comp.target, value: comp.value, coef: null, sourceStat: null, grade: comp.grade };
      const requirement = racial.equipRequirement, wanted = weapon ? (weapon.tags.includes("two_hand") ? "two-handed " : "one-handed ") + weapon.tags[0] : null;
      const assumedGear = !!(requirement && wanted && (requirement.subclasses || []).includes(wanted));
      let group;
      if (!racial.appliesNaked && !assumedGear) group = "gear";
      else if (THROUGHPUT_OPS.has(comp.op)) group = "throughput";
      else if (comp.conditions.length) group = "scoped";
      else if (comp.op === "mul_total_pct" && STATS.includes(comp.target) && included) group = "included";
      else if (SHEET_TARGETS.has(comp.target)) group = "applied";
      else group = "other";
      out.items.push({ group, racial, comp, effect });
      if (group === "applied") out.applied.push(effect);
    }
    return out;
  }
  // Client-data form bonuses (Cat Form attack power from Agility) apply only while that form is assumed.
  function formEffects(model, className, toggles) {
    const list = model.naked.classes[className].formEffects || [];
    return list.filter(f => toggles && f.form === toggles.form).map(f => ({ key: "form:" + f.spellId, op: f.op, target: f.target, value: f.value, coef: null, sourceStat: f.sourceStat, grade: f.grade, form: f.form }));
  }
  function availableToggles(model, className) {
    const result = { forms: [], shield: false, weapons: [], pets: [], buffs: [] };
    for (const { comp } of model.components) {
      if (comp.cls !== className || comp.tier === "C" || comp.tier === "M" || comp.op === "proc" || THROUGHPUT_OPS.has(comp.op) || !SHEET_TARGETS.has(comp.target)) continue;
      if (comp.tier !== "B" && comp.appliesNaked) continue;
      const parsed = comp.conditions.map(parseCondition);
      if (!parsed.length || parsed.some(p => !TOGGLE_KINDS.has(p.kind) && !(p.kind === "attack" && conditionState("attack:" + p.values.join("|"), comp, emptyToggles()) === "ok") && p.kind !== "except_spell")) continue;
      for (const p of parsed) {
        if (p.kind === "form") for (const v of p.values) if (!result.forms.includes(v)) result.forms.push(v);
        if (p.kind === "shield") result.shield = true;
        if (p.kind === "weapon") for (const v of p.values) if (!result.weapons.includes(v)) result.weapons.push(v);
        if (p.kind === "pet_active") { const need = p.values[0] || "pet"; if (!result.pets.includes(need)) result.pets.push(need); }
        if (p.kind === "self_buff") for (const v of p.values) if (!result.buffs.includes(v)) result.buffs.push(v);
      }
    }
    return result;
  }

  function product(list) { return list.reduce((factor, e) => factor * (1 + e.value / 100), 1); }
  function blank(value, grade) { return { value: num(value) ? value : null, grade: num(value) ? grade : "U", cands: null, touched: new Set(), direct: [], none: false, notes: [] }; }
  function fromCands(cands, extraGrade) {
    const usable = cands.filter(c => num(c.value));
    if (!usable.length) return blank(null, "U");
    if (usable.every(c => Math.abs(c.value - usable[0].value) < 1e-9)) {
      const single = blank(usable[0].value, weakest(usable.map(c => c.grade), extraGrade));
      if (usable.length > 1) single.notes.push("The candidate sources agree on this value.");
      return single;
    }
    const cell = blank(null, "U"); cell.cands = usable.map(c => ({ value: c.value, grade: weakest(c.grade, extraGrade), label: c.label }));
    cell.grade = weakest(cell.cands.map(c => c.grade)); cell.disputed = true;
    return cell;
  }
  function computeSheet(model, ctx, effects) {
    const cls = model.naked.classes[ctx.className], base = ctx.combo.baseStats, power = cls.power.type, rows = {};
    const by = (op, targets) => effects.filter(e => e.op === op && targets.includes(e.target));
    const touch = (cell, list) => { for (const e of list) cell.touched.add(e.key); return cell; };
    const inherit = (cell, ...sources) => { for (const s of sources) for (const k of s.touched) cell.touched.add(k); return cell; };
    const direct = (cell, list, kind) => { for (const e of list) cell.direct.push({ key: e.key, kind, value: kind === "flat-level" || kind === "level-disputed" ? e.coef * LEVEL : e.value, grade: e.grade }); return cell; };
    const stackNote = (cell, stack) => { if (stack) cell.notes.push(STACK_NOTE); return cell; };
    for (const s of STATS) {
      const pct = by("mul_total_pct", [s]), b = base.values[s], stack = stackGrade(pct);
      rows[s] = direct(touch(stackNote(blank(num(b) ? b * product(pct) : null, weakest(base.grade, pct.map(e => e.grade), stack)), stack), pct), pct, "factor");
    }
    const stat = s => rows[s].value;
    function additions(targets) {
      const ofStat = by("pct_of_stat", targets), ofLevel = by("pct_of_level", targets), grades = [], sources = [];
      let total = 0, levelTotal = 0, missing = false;
      for (const e of ofStat) { const v = stat(e.sourceStat); if (!num(v)) missing = true; else total += e.value / 100 * v; grades.push(e.grade, rows[e.sourceStat].grade); sources.push(rows[e.sourceStat]); }
      for (const e of ofLevel) { total += e.coef * LEVEL; levelTotal += e.coef * LEVEL; grades.push(e.grade); }
      return { total, levelTotal, missing, grades, ofStat, ofLevel, sources, stack: stackGrade([...ofStat, ...ofLevel]), any: ofStat.length + ofLevel.length > 0 };
    }
    const sumOf = list => list.reduce((s, e) => s + e.value, 0);
    const pp = targets => { const list = by("add_pp", targets); return { sum: sumOf(list), list, grades: list.map(e => e.grade), stack: stackGrade(list) }; };
    {
      const pct = by("mul_total_pct", ["health"]), bh = cls.baseHealth, sta = stat("sta");
      // Resources: flat first, then percentages, then rounded (CMaNGOS rule, naked60 evaluation.rounding; not Forever-verified).
      const value = num(sta) && num(bh.value) ? Math.round((bh.value + Math.min(sta, 20) + 10 * Math.max(sta - 20, 0)) * product(pct)) : null, stack = stackGrade(pct);
      rows.health = inherit(direct(touch(stackNote(blank(value, weakest(bh.grade, "C", rows.sta.grade, pct.map(e => e.grade), stack)), stack), pct), pct, "factor"), rows.sta);
    }
    if (power === "mana") {
      const pct = by("mul_total_pct", ["mana"]), bm = cls.baseMana, int = stat("int"), stack = stackGrade(pct);
      const value = num(int) && num(bm.value) ? Math.round((bm.value + Math.min(int, 20) + 15 * Math.max(int - 20, 0)) * product(pct)) : null;
      rows.mana = inherit(direct(touch(stackNote(blank(value, weakest(bm.grade, "C", rows.int.grade, pct.map(e => e.grade), stack)), stack), pct), pct, "factor"), rows.int);
    } else {
      const target = power === "rage" ? "max_rage" : "max_energy", pct = by("mul_total_pct", [target]), fl = by("add_flat", power === "energy" ? ["max_energy"] : []), mp = cls.maxPowerNonMana;
      const value = num(mp.value) ? Math.round((mp.value + sumOf(fl)) * product(pct)) : null, stack = stackGrade([...pct, ...fl]);
      rows.power = direct(direct(touch(touch(stackNote(blank(value, weakest(mp.grade, pct.map(e => e.grade), fl.map(e => e.grade), stack)), stack), pct), fl), pct, "factor"), fl, "flat");
    }
    {
      const add = additions(["armor"]), agi = stat("agi");
      const value = num(agi) && !add.missing ? 2 * agi + add.total : null;
      rows.armor = inherit(direct(touch(touch(stackNote(blank(value, weakest("C", rows.agi.grade, add.grades, add.stack)), add.stack), add.ofStat), add.ofLevel), add.ofLevel, "flat-level"), rows.agi, ...add.sources);
    }
    {
      const add = additions(["attack_power"]), str = stat("str"), agi = stat("agi"), lc = cls.apLevelCoefficient, k = cls.apConstant, aS = cls.apPerStrength, aA = cls.apPerAgility;
      // Disputed Druid candidates keep their own Predatory Strikes rule: CMaNGOS never adds it (3 x level in every form); vmangos uses it as the form level term.
      const levels = num(lc.value) ? [{ value: lc.value, grade: lc.grade, label: null, levelTalents: true }]
        : (lc.candidates || []).map(c => ({ value: c.value, grade: c.grade, label: SOURCE_SHORT[c.source] || c.source, levelTalents: c.predatoryStrikes !== "not_applied" }));
      const ok = num(str) && num(agi) && !add.missing && num(k.value) && num(aS.value) && num(aA.value) && levels.length;
      const levelDisputed = add.ofLevel.length > 0 && levels.some(l => !l.levelTalents);
      const cell = ok ? fromCands(levels.map(l => ({ value: Math.max(0, aS.value * str + aA.value * agi + l.value * LEVEL + k.value) + add.total - (l.levelTalents ? 0 : add.levelTotal),
        grade: weakest(l.grade, k.grade, aS.grade, aA.grade, rows.str.grade, rows.agi.grade, add.grades, add.stack), label: l.label }))) : blank(null, "U");
      if (levelDisputed) cell.notes.push("Predatory Strikes: CMaNGOS adds no term (its 3 × level applies in every form); vmangos uses it as the Cat and Bear Form level term.");
      rows.meleeAP = inherit(direct(touch(touch(stackNote(cell, add.stack), add.ofStat), add.ofLevel), add.ofLevel, levelDisputed ? "level-disputed" : "flat-level"), rows.str, rows.agi, ...add.sources);
    }
    {
      const add = additions(["ranged_attack_power"]), rap = cls.rapPerAgility, rl = cls.rapLevelCoefficient, rk = cls.rapConstant, agi = stat("agi"), groups = new Map(), rf = cls.rangedApInForms;
      for (const c of num(rap.value) ? [{ value: rap.value, grade: rap.grade, source: null }] : rap.candidates || []) {
        if (!num(c.value)) continue;
        const g = groups.get(c.value) || { value: c.value, grades: [], labels: [] };
        g.grades.push(c.grade); if (c.source) g.labels.push(SOURCE_SHORT[c.source] || c.source); groups.set(c.value, g);
      }
      let cell;
      if (rf && rf.forms.includes(ctx.toggles.form)) { cell = blank(rf.value, rf.grade); cell.notes.push(rf.note || "Both Classic emulators set ranged attack power to 0 in this form."); }
      else {
        const ok = num(agi) && num(rl.value) && num(rk.value) && groups.size && !add.missing;
        cell = ok ? fromCands([...groups.values()].map(g => ({ value: Math.max(0, g.value * agi + rl.value * LEVEL + rk.value) + add.total, grade: weakest(strongest(g.grades), rl.grade, rk.grade, rows.agi.grade, add.grades, add.stack),
          label: g.labels.length ? fmt(g.value) + " per Agility (" + g.labels.join(", ") + ")" : null }))) : blank(null, "U");
        stackNote(cell, add.stack);
      }
      rows.rangedAP = inherit(direct(touch(touch(cell, add.ofStat), add.ofLevel), add.ofLevel, "flat-level"), rows.agi, ...add.sources);
    }
    {
      const p = pp(PP_TARGETS.meleeCrit), rate = cls.critAgiPer1Pct, agi = stat("agi");
      const value = num(agi) && num(rate.value) ? agi / rate.value + p.sum : null;
      rows.meleeCrit = inherit(direct(touch(stackNote(blank(value, weakest(rate.grade, rows.agi.grade, p.grades, p.stack)), p.stack), p.list), p.list, "pp"), rows.agi);
    }
    {
      const p = pp(PP_TARGETS.spellCrit), sc = cls.spellCritFromIntellect, int = stat("int");
      const list = (sc.candidates || []).filter(c => num(c.basePct) && num(c.intPer1Pct));
      const cell = num(int) && list.length ? fromCands(list.map(c => ({ value: c.basePct + int / c.intPer1Pct + p.sum, grade: weakest(c.grade, rows.int.grade, p.grades, p.stack), label: SOURCE_SHORT[c.source] || c.source }))) : blank(null, "U");
      rows.spellCrit = inherit(direct(touch(stackNote(cell, p.stack), p.list), p.list, "pp"), rows.int);
    }
    const defenseBase = cls.defenseSkillBase;
    {
      const list = by("add_flat", ["defense"]), stack = stackGrade(list);
      rows.defense = direct(touch(stackNote(blank(defenseBase.value + sumOf(list), weakest(defenseBase.grade, list.map(e => e.grade), stack)), stack), list), list, "flat");
    }
    const defenseBonus = num(rows.defense.value) ? 0.04 * (rows.defense.value - defenseBase.value) : 0, defenseGrade = defenseBonus ? "E" : null;
    {
      const p = pp(["dodge"]), bd = cls.baseDodgePct, rate = cls.dodgeAgiPer1Pct, agi = stat("agi");
      const value = num(agi) && num(bd.value) && num(rate.value) ? bd.value + agi / rate.value + defenseBonus + p.sum : null;
      rows.dodge = inherit(direct(touch(stackNote(blank(value, weakest(bd.grade, rate.grade, rows.agi.grade, defenseGrade, p.grades, p.stack)), p.stack), p.list), p.list, "pp"), rows.agi, rows.defense);
    }
    {
      const p = pp(["parry"]), can = cls.canParry, bp = cls.baseParryPct;
      let cell;
      if (!can.value && ctx.parryGranted) { cell = blank(null, "U"); cell.notes.push("A talent grants parry, but its value is not published."); }
      else if (!can.value) { cell = blank(0, can.grade); cell.notes.push("This class cannot parry (Classic reference)."); }
      else cell = stackNote(blank(bp.value + defenseBonus + p.sum, weakest(bp.grade, can.grade, defenseGrade, p.grades, p.stack)), p.stack);
      rows.parry = inherit(direct(touch(cell, p.list), p.list, "pp"), rows.defense);
    }
    {
      const p = pp(["block"]), can = cls.canUseShield, bb = cls.baseBlockPctWithShield;
      let cell;
      // applicable false is rendered n/a, never 0 (naked60 display rule).
      if (bb.applicable === false || !can.value || !num(bb.value)) { cell = blank(null, "U"); cell.na = true; cell.notes.push("This class cannot use a shield (Classic reference)."); }
      else if (!ctx.toggles.shield) { cell = blank(0, bb.grade); cell.notes.push("No shield equipped."); }
      else cell = stackNote(blank(bb.value + defenseBonus + p.sum, weakest(bb.grade, can.grade, defenseGrade, p.grades, p.stack)), p.stack);
      rows.block = inherit(direct(touch(cell, p.list), p.list, "pp"), rows.defense);
    }
    for (const [id, targets] of [["hitMelee", PP_TARGETS.hitMelee], ["hitSpell", PP_TARGETS.hitSpell]]) {
      // No hit talent: the bonus is exactly 0 (shown as "none").
      const p = pp(targets), cell = stackNote(blank(p.sum, weakest(p.grades.length ? p.grades : ["A"], p.stack)), p.stack);
      cell.none = !p.list.length; rows[id] = direct(touch(cell, p.list), p.list, "pp");
    }
    if (power === "mana") {
      const list = by("regen_while_casting_pct", ["mana_regen_casting"]), sum = sumOf(list), stack = stackGrade(list);
      const cell = stackNote(blank(Math.min(100, sum), weakest(list.length ? list.map(e => e.grade) : ["A"], sum > 100 ? "E" : null, stack)), stack);
      if (sum > 100) cell.notes.push("Capped at 100% (Classic rule).");
      cell.none = !list.length; rows.regenCasting = direct(touch(cell, list), list, "pp");
      const b = cls.manaRegenBasePer2s, dv = cls.manaRegenSpiritDivisor, spi = stat("spi");
      rows.regenSpirit = inherit(blank(num(spi) && num(b.value) && num(dv.value) ? b.value + spi / dv.value : null, weakest(b.grade, dv.grade, rows.spi.grade)), rows.spi);
      rows.regenSpirit.approximate = true;
    }
    for (const [id, targets] of [["spellDamage", ["spell_damage", "spell_power"]], ["healing", ["healing_power", "spell_power"]]]) {
      const add = additions(targets), cell = stackNote(blank(add.missing ? null : add.total, weakest(add.grades.length ? add.grades : ["A"], add.stack)), add.stack);
      cell.none = !add.any; rows[id] = inherit(direct(touch(touch(cell, add.ofStat), add.ofLevel), add.ofLevel, "flat-level"), ...add.sources);
    }
    return rows;
  }
  const valuesOf = cell => cell.cands ? cell.cands.map(c => c.value) : num(cell.value) ? [cell.value] : null;
  function delta(after, before) {
    const out = { value: null, cands: null, grade: null, modifiers: [], changed: false, unavailable: false, stacked: false };
    const beforeKeys = new Set(before.direct.map(d => d.key)), added = after.direct.filter(d => !beforeKeys.has(d.key)), stack = stackGrade(added);
    out.modifiers = added; out.stacked = !!stack; out.changed = [...after.touched].some(k => !before.touched.has(k));
    const a = valuesOf(after), b = valuesOf(before);
    // A row that turns Unavailable (Spirit Weapons parry) has changed even when no keyed modifier explains it.
    if (!a !== !b) out.changed = true;
    if (!a || !b || (a.length !== b.length && a.length !== 1 && b.length !== 1)) {
      const shown = added.filter(d => d.kind === "factor" || ADDITIVE_KINDS.has(d.kind));
      out.unavailable = out.changed; out.grade = !out.changed ? null : shown.length ? weakest(shown.map(d => d.grade), stack) : "U"; return out;
    }
    const n = Math.max(a.length, b.length), diffs = Array.from({ length: n }, (_, i) => clean(a[a.length === 1 ? 0 : i] - b[b.length === 1 ? 0 : i]));
    const labels = (after.cands || before.cands || []).map(c => c.label);
    if (diffs.every(d => Math.abs(d - diffs[0]) < 1e-9)) out.value = diffs[0];
    else out.cands = diffs.map((value, i) => ({ value, label: labels[i] || null }));
    if (out.value !== null && Math.abs(out.value) < 1e-9 && !added.length && !out.changed) return out; // nothing changed: no grade
    const additive = added.filter(d => ADDITIVE_KINDS.has(d.kind)).reduce((s, d) => s + d.value, 0);
    const pureAdditive = out.value !== null && added.length > 0 && added.every(d => ADDITIVE_KINDS.has(d.kind)) && Math.abs(out.value - additive) < 1e-9 && [...after.touched].filter(k => !before.touched.has(k)).every(k => added.some(d => d.key === k));
    out.grade = pureAdditive ? weakest(added.map(d => d.grade), stack) : weakest(after.grade, before.grade, added.map(d => d.grade), stack);
    return out;
  }
  function rowSpecs(model, className) {
    const cls = model.naked.classes[className], power = cls.power.type, fm = Object.fromEntries(model.naked.formulas.map(f => [f.id, f]));
    const has = targets => model.components.some(({ comp }) => comp.cls === className && targets.includes(comp.target) && (comp.op === "pct_of_stat" || comp.op === "pct_of_level"));
    const sc = cls.spellCritFromIntellect, range = sc.foreverRange;
    const specs = [
      ...STATS.map(s => ({ id: s, label: STAT_LABEL[s], digits: 1, unit: "", chart: "rel", note: "Percentage bonuses multiply the total; Forever rounding is unverified, so attributes are left unrounded." })),
      { id: "health", label: "Health", digits: 0, unit: "", chart: "rel", note: "Base health (Classic reference) + 10 per Stamina above 20 (Forever guide rule); percentages apply afterwards and the total is rounded (Classic rule)." },
      power === "mana" ? { id: "mana", label: "Mana", digits: 0, unit: "", chart: "rel", note: "Base mana (Classic reference) + 15 per Intellect above 20 (Forever guide rule); percentages apply afterwards and the total is rounded (Classic rule)." }
        : { id: "power", label: "Maximum " + power, digits: 0, unit: "", chart: "rel", note: "Classic maximum of 100; flat talent bonuses first, then percentages, then rounded (Classic rule, assumed order)." },
      { id: "armor", label: "Armor", digits: 1, unit: "", chart: "rel", note: "2 per Agility (Forever guide rule); no item armor when naked." },
      { id: "meleeAP", label: "Melee attack power", digits: 1, unit: "", chart: "rel", note: (fm.melee_ap.displayByClass || {})[className] || "" },
      { id: "rangedAP", label: "Ranged attack power", digits: 1, unit: "", chart: "rel", note: ((fm.ranged_ap.displayByClass || {})[className] || "") + (className === "hunter" ? " Careful Aim's second client effect is read as ranged attack power (grade B); its first effect adds to melee attack power." : "") },
      { id: "meleeCrit", label: "Melee crit % (Agility part and modifiers)", digits: 2, unit: "%", chart: "pp", note: "Agility ÷ " + fmt(cls.critAgiPer1Pct.value) + " per 1% (grade " + cls.critAgiPer1Pct.grade + "). The class base crit chance is unavailable and not included." },
      { id: "spellCrit", label: "Spell crit %", digits: 2, unit: "%", chart: "pp", note: sc.candidates && sc.candidates.length ? "Disputed Classic rates: both candidates are shown." + (range ? " WoW Forever guide: " + range.intPer1PctMin + "–" + range.intPer1PctMax + " Intellect per 1% (grade " + range.grade + ")." : "") : "No source gives a spell crit rate for this class (Unavailable)." },
      { id: "dodge", label: "Dodge %", digits: 2, unit: "%", chart: "pp", note: "Class base " + fmt(cls.baseDodgePct.value) + "% (Classic) + Agility ÷ " + fmt(cls.dodgeAgiPer1Pct.value) + " (grade " + cls.dodgeAgiPer1Pct.grade + ") + 0.04% per defense point above 300 (Classic). Approximate." },
      { id: "parry", label: "Parry %", digits: 2, unit: "%", chart: "pp", note: "5% if the class can parry (Classic reference) + 0.04% per defense point above 300." },
      { id: "block", label: "Block %", digits: 2, unit: "%", chart: "pp", note: "Needs a shield; a naked character has none." },
      { id: "hitMelee", label: "Hit % bonus (melee and ranged)", digits: 2, unit: "%", chart: "pp", note: "Bonus over the base miss chance of 5% (9% against raid bosses), Forever guide rule." },
      { id: "hitSpell", label: "Hit % bonus (spells)", digits: 2, unit: "%", chart: "pp", note: "Bonus over the base spell miss chance of 3% (16% against raid bosses), Forever guide rule." },
      { id: "defense", label: "Defense skill", digits: 0, unit: "", chart: "rel", note: "5 × level (Classic reference); 440 makes raid bosses unable to crit you (Forever guide rule)." }
    ];
    if (power === "mana") specs.push(
      { id: "regenCasting", label: "Mana regen while casting %", digits: 0, unit: "%", chart: null, note: "Share of Spirit-based regeneration that continues while casting; capped at 100% (Classic rule)." },
      { id: "regenSpirit", label: "Spirit mana regen per 2 s (not casting)", digits: 1, unit: "", chart: null, note: "Classic formula; the Forever formula is unknown, so this is approximate." });
    if (has(["spell_damage", "spell_power"])) specs.push({ id: "spellDamage", label: "Spell damage bonus", digits: 1, unit: "", chart: null, note: "From talents that convert Intellect, Spirit or level; no gear." });
    if (has(["healing_power", "spell_power"])) specs.push({ id: "healing", label: "Healing bonus", digits: 1, unit: "", chart: null, note: "From talents that convert Intellect or Spirit; no gear." });
    return specs;
  }
  function modifierSummary(mods, unit) {
    // Disputed level terms are left out: they differ by candidate, so no single modifier value is shown for them.
    const parts = [], factor = mods.filter(m => m.kind === "factor").reduce((f, m) => f * (1 + m.value / 100), 1), add = mods.filter(m => ADDITIVE_KINDS.has(m.kind)).reduce((s, m) => s + m.value, 0);
    if (Math.abs(factor - 1) > 1e-9) parts.push(signed(clean((factor - 1) * 100), 2) + "%");
    if (Math.abs(add) > 1e-9) parts.push(signed(clean(add), 2) + (unit === "%" ? " pp" : ""));
    return parts.join(", ");
  }
  // Collapse candidates that read the same at display precision; keep the dispute visible otherwise.
  function candidateText(cands, render) {
    const texts = cands.map(render);
    return texts.every(t => t === texts[0]) ? texts[0] + " (both candidates)" : "disputed: " + cands.map((c, i) => texts[i] + (c.label ? " (" + c.label + ")" : "")).join(" · ");
  }
  function isolatedEffect(model, ctx, baseEffects, comp, effect, specs) {
    // A shield talent is shown as it would apply with a shield; the base sheet uses the same assumption.
    const local = comp.conditions.includes("shield") && !ctx.toggles.shield ? { ...ctx, toggles: { ...ctx.toggles, shield: true } } : ctx;
    const baseSheet = computeSheet(model, local, baseEffects), sheet = computeSheet(model, local, [...baseEffects, effect]), parts = [];
    let unavailable = 0;
    for (const spec of specs) {
      const d = delta(sheet[spec.id], baseSheet[spec.id]), unit = spec.unit === "%" ? " pp" : "";
      // A flat modifier is shown as its own exact value; the sheet change after percentages and Classic rounding is a separate, weaker line.
      const flat = d.modifiers.length === 1 && d.modifiers[0].kind === "flat" && d.modifiers[0].key === effect.key ? d.modifiers[0] : null;
      // .196: each part also carries its number (null when disputed or Unavailable) so the stat impact table can sort on it.
      if (flat && num(d.value) && Math.abs(d.value - flat.value) > 1e-9) {
        parts.push({ row: spec.id, label: spec.label, text: signed(flat.value, spec.digits) + unit + " (modifier)", grade: flat.grade, value: flat.value });
        parts.push({ row: spec.id, label: spec.label + " on the sheet", text: signed(d.value, spec.digits) + unit + " after percentage bonuses and Classic rounding", grade: d.grade === flat.grade ? "E" : d.grade, value: d.value });
      } else if (d.cands) parts.push({ row: spec.id, label: spec.label, text: candidateText(d.cands, c => signed(c.value, spec.digits) + unit), grade: d.grade, value: null });
      else if (num(d.value) && Math.abs(d.value) > 1e-9) parts.push({ row: spec.id, label: spec.label, text: signed(d.value, spec.digits) + unit, grade: d.grade, value: d.value });
      else if (d.unavailable && modifierSummary(d.modifiers, spec.unit)) parts.push({ row: spec.id, label: spec.label, text: modifierSummary(d.modifiers, spec.unit) + " (modifier; total unavailable)", grade: weakest(d.modifiers.map(m => m.grade), stackGrade(d.modifiers)), value: null });
      else if (d.unavailable) unavailable++;
    }
    if (unavailable) parts.push({ row: null, label: unavailable + " dependent " + (unavailable === 1 ? "total" : "totals"), text: "Unavailable (no base values)", grade: "U", value: null });
    return parts;
  }
  function evaluate(model, options) {
    const className = options && options.className, cls = model.naked.classes[className];
    if (!cls) throw userError("Unknown character class.");
    const options60 = combosFor(model, className), raceId = options.race && options60.some(o => o.race === options.race) ? options.race : options60[0].race;
    const combo = model.naked.combos.find(c => c.race === raceId && c.class === className), toggles = normalizeToggles(options.toggles);
    const ranks = rankMap(model, className, options.ranks), specs = rowSpecs(model, className);
    const ctx = { className, combo, toggles, parryGranted: false }, totalCtx = { ...ctx, parryGranted: PARRY_GRANTS.some(id => (ranks.get(id) || 0) > 0) };
    const racial = racialEffects(model, className, combo, toggles), talents = talentEffects(model, className, ranks, toggles), form = formEffects(model, className, toggles);
    // An assumed form's own client-data bonus belongs to every column, so the racial and talent columns stay pure differences.
    const baseEffects = [...form, ...racial.applied];
    const sheets = { base: computeSheet(model, ctx, form), racial: computeSheet(model, ctx, baseEffects), total: computeSheet(model, totalCtx, [...baseEffects, ...talents.applied]) };
    const rows = specs.map(spec => ({ ...spec, base: sheets.base[spec.id], racial: delta(sheets.racial[spec.id], sheets.base[spec.id]), talents: delta(sheets.total[spec.id], sheets.racial[spec.id]), total: sheets.total[spec.id] }));
    const emptyRanks = Array.from(ranks.values()).map(() => 0);
    const meta = { className, classLabel: cls.name, race: raceId, raceLabel: model.naked.races[raceId].name, combo, toggles, specs, rows, sheets, ranks, emptyRanks };
    if (options.totalsOnly) return meta;
    const contributions = talents.items.map(item => {
      const comp = item.comp, base = { id: comp.id, talentId: comp.talentId, name: comp.name, tree: item.entry.tree, rank: item.rank, maxRank: comp.maxRank, tier: comp.tier, grade: comp.grade, group: item.group };
      if (item.group === "withheld") return { ...base, modifier: "Rank text changed since review; number withheld.", conditions: [], effects: [] };
      const extra = { direction: comp.direction, statBasis: comp.statBasis, sourceStat: comp.sourceStat, procEffect: comp.procEffect };
      const effects = item.group === "applied" || item.group === "conditional" || (item.group === "gear" && item.verdict.toggleable) ? isolatedEffect(model, ctx, baseEffects, comp, item.effect, specs) : [];
      const notes = [comp.scopeAmbiguous ? "Scope unverified: Classic limited this effect; the Forever text does not." : null, item.verdict.note || null, comp.appliesNaked ? null : "Needs equipped gear; adds 0 when naked.",
        typeof comp.note === "string" && comp.note ? comp.note : null].filter(Boolean);
      return { ...base, modifier: modifierText(comp.op, comp.target, item.effect.value, comp.unit, extra), conditions: comp.conditions.map(conditionText), assumed: !!item.verdict.assumed, effects, notes,
        db2: comp.db2 ? { spellId: comp.db2.spellId, curveId: comp.db2.curveId, build: comp.db2.build } : null };
    });
    // A parry grant without a published value has no stat component, but it still changes the sheet (parry becomes Unavailable).
    for (const id of PARRY_GRANTS) {
      const entry = model.talents.get(id), rank = ranks.get(id) || 0;
      if (!entry || entry.cls !== className || !rank) continue;
      contributions.push({ id: id + "#parry_grant", talentId: id, name: entry.talent.name, tree: entry.tree.name, rank, maxRank: entry.talent.maxRank, tier: "A", grade: "U", group: "applied",
        modifier: "Grants the ability to parry; the parry chance it gives is not published", conditions: [], assumed: false,
        effects: [{ row: "parry", label: "Parry %", text: "Unavailable (value not published)", grade: "U" }], notes: ["The parry total becomes Unavailable instead of a guess."], db2: null });
    }
    const raceNote = model.naked.races[raceId].note;
    const racials = racial.items.map(item => ({ name: item.racial.name, spellId: item.racial.spellId, group: item.group, grade: item.comp.grade, target: item.comp.target,
      modifier: modifierText(item.comp.op, item.comp.target, item.comp.value, item.comp.unit, {}), conditions: item.comp.conditions.map(conditionText),
      note: [item.group === "included" ? "The Classic base value already includes racial bonuses, so this is not applied again (double-count risk)."
        : item.racial.equipRequirement ? "Client data ties it to " + listWords(item.racial.equipRequirement.subclasses || []) + " (" + item.racial.equipRequirement.source + "); server enforcement is unverified." + (item.group === "gear" ? " Adds 0 when naked." : "") : "",
        // Gnome: Classic Intellect may already carry the old Intellect racial while Forever's Expansive Mind is applied on resources.
        POWER_TARGETS[item.comp.target] && typeof raceNote === "string" ? raceNote : ""].filter(Boolean).join(" ") }));
    const assumptions = [];
    if (toggles.form) assumptions.push(FORM_LABEL[toggles.form] + " active (" + (form.length ? "its attack power from Agility is client data; other form bonuses are not modelled" : "form base bonuses are not modelled") + ")");
    if (toggles.shield) assumptions.push("a shield equipped (its armor and block value are not included)");
    if (toggles.weapon) assumptions.push(WEAPONS.find(w => w.id === toggles.weapon).label.toLowerCase() + " equipped (its own stats are not included)");
    if (toggles.pet) assumptions.push(toggles.pet === "demon" ? "a Demon pet summoned" : toggles.pet === "imp" ? "an Imp summoned" : "a pet active");
    for (const buff of toggles.buffs) assumptions.push(buff + " active (only talent changes to it are counted)");
    return { ...meta, contributions, racials, assumptions };
  }
  // Display text for one total and one change. Moved out of mount in .196 so every view uses exactly the same rules.
  function cellText(cell, spec) {
    if (cell.na) return { text: "n/a", grade: null };
    if (cell.none) return { text: "none", grade: null };
    if (cell.cands) return { text: candidateText(cell.cands, c => fmt(c.value, spec.digits) + spec.unit), grade: cell.grade, cls: "s60-disputed" };
    if (!num(cell.value)) return { text: "Unavailable", grade: "U" };
    return { text: fmt(cell.value, spec.digits) + spec.unit + (cell.approximate ? " (approximate)" : ""), grade: cell.grade };
  }
  function deltaText(d, spec) {
    const unit = spec.unit === "%" ? " pp" : "";
    if (d.cands) return { text: candidateText(d.cands, c => signed(c.value, spec.digits) + unit), grade: d.grade, cls: "s60-disputed" };
    if (num(d.value)) return Math.abs(d.value) < 1e-9 ? { text: "—", grade: null } : { text: signed(d.value, spec.digits) + unit, grade: d.grade };
    const mods = d.unavailable ? modifierSummary(d.modifiers, spec.unit) : "";
    if (mods) return { text: mods + " (modifier; total unavailable)", grade: weakest(d.modifiers.map(m => m.grade), stackGrade(d.modifiers)) };
    return d.unavailable ? { text: "Unavailable", grade: "U" } : { text: "—", grade: null };
  }
  // The spec comparison rule: a total keeps its own grade, and its change against no talents follows in brackets (in modifier terms
  // when the totals are Unavailable). change carries the bracket's own text and grade.
  function compareText(total, noTalents, spec) {
    const shown = cellText(total, spec), change = noTalents ? deltaText(delta(total, noTalents), spec) : { text: "—", grade: null };
    if (change.text !== "—") shown.text += " (" + (change.text === "Unavailable" ? "change Unavailable" : change.text.replace(/^disputed: /, "")) + ")";
    return { ...shown, change };
  }

  // .196 item 9b: spec, talent and class comparisons. They use only the talent snapshot and the two pinned files. Nothing below is a
  // recommendation, a checked build, a tuning claim or a value measured in WoW Forever.
  const POINTS_AT_60 = LEVEL - 9; // the calculator's standard level-60 point budget
  const count = (n, one, many) => n + " " + (n === 1 ? one : many);
  const noteOf = value => typeof value === "string" && value ? value : null;
  const KIND_LABEL = Object.freeze({ applied: "Added to the sheet", conditional: "Conditional: added only when its assumption is on", scoped: "Scoped: never added",
    gear: "Needs gear: adds 0 when naked", other: "Not a sheet row", proc: "Proc: never added", throughput: "Throughput: never added", withheld: "Withheld: rank text changed" });
  const UNIT_SUFFIX = Object.freeze({ pp: " pp", pct: "%", skill: " skill", rage_per_3s: " rage every 3 s", energy: " energy", resistance: " resistance", pct_of_level: "% of level", per_level: " per level", sec: " s" });
  // The sheet row that a component's own target lands on; the stat impact table sorts "change" by that row.
  const TARGET_ROW = Object.freeze({ str: "str", agi: "agi", sta: "sta", int: "int", spi: "spi", health: "health", mana: "mana", max_energy: "power", max_rage: "power", armor: "armor",
    attack_power: "meleeAP", ranged_attack_power: "rangedAP", "crit.melee": "meleeCrit", "crit.melee_ranged": "meleeCrit", "crit.melee_spell": "meleeCrit", "crit.all": "meleeCrit", "crit.spell": "spellCrit",
    dodge: "dodge", parry: "parry", block: "block", "hit.all": "hitMelee", "hit.melee": "hitMelee", "hit.melee_ranged": "hitMelee", "hit.spell": "hitSpell", defense: "defense",
    mana_regen_casting: "regenCasting", spell_damage: "spellDamage", healing_power: "healing", spell_power: "spellDamage" });
  // Columns of the all-classes table. Digits and units come from each class's own sheet rows; a row a class lacks reads n/a. Labels
  // are the sheet's own row labels (the melee crit total includes applied racial traits such as Ruthless), except the shared power column.
  const CLASS_COLUMNS = Object.freeze([["str", "Strength"], ["agi", "Agility"], ["sta", "Stamina"], ["int", "Intellect"], ["spi", "Spirit"], ["health", "Health"], ["mana", "Mana"],
    ["power", "Maximum rage or energy"], ["armor", "Armor"], ["meleeAP", "Melee attack power"], ["rangedAP", "Ranged attack power"], ["meleeCrit", "Melee crit % (Agility part and modifiers)"],
    ["spellCrit", "Spell crit %"], ["dodge", "Dodge %"], ["parry", "Parry %"], ["block", "Block %"], ["defense", "Defense skill"], ["regenSpirit", "Spirit mana regen per 2 s (not casting)"]].map(([id, label]) => Object.freeze({ id, label })));
  const talentIndex = new WeakMap();
  function componentsByTalent(model) {
    let map = talentIndex.get(model);
    if (!map) { map = new Map(); for (const entry of model.components) map.set(entry.comp.talentId, [...(map.get(entry.comp.talentId) || []), entry]); talentIndex.set(model, map); }
    return map;
  }
  function classData(model, className) {
    const cls = model.data.classes.find(c => c.id === className);
    if (!cls || !model.naked.classes[className]) throw userError("Unknown character class.");
    return cls;
  }
  const zeroRanks = cls => cls.trees.flatMap(t => t.talents).map(() => 0);
  const requiresName = (tree, talent) => talent.requires ? (tree.talents.find(p => p.id === talent.requires) || {}).name || null : null;
  // Talents of one tree with a stat component, plus a parry grant that changes a sheet row without a published value.
  function statTalents(model, cls, tree) {
    const index = componentsByTalent(model);
    return tree.talents.filter(t => (index.get(t.id) || []).some(e => e.comp.cls === cls.id) || PARRY_GRANTS.includes(t.id));
  }
  // The fewest points that hold every wanted talent at maximum rank under the calculator's rules: a talent in row r needs 5 x (r - 1)
  // points in earlier rows of its tree, and a prerequisite must be at maximum rank. Extra points go to the lowest open row first; for any
  // total that maximises every row's earlier-row count, so the first legal total is the minimum. A reachability fact, not a suggestion.
  function treeRequirement(tree, wanted) {
    const byId = new Map(tree.talents.map(t => [t.id, t])), role = new Map();
    for (const id of wanted) if (byId.has(id)) role.set(id, "stat");
    for (const id of [...role.keys()]) for (let t = byId.get(byId.get(id).requires); t && !role.has(t.id); t = byId.get(t.requires)) role.set(t.id, "prerequisite");
    const ranks = new Map(tree.talents.map(t => [t.id, role.has(t.id) ? t.maxRank : 0]));
    const earlier = row => tree.talents.reduce((sum, t) => sum + (t.row < row ? ranks.get(t.id) : 0), 0);
    const open = t => earlier(t.row) >= 5 * (t.row - 1);
    const unlocked = t => { if (!t.requires) return true; const prior = byId.get(t.requires); return !!prior && ranks.get(prior.id) === prior.maxRank; };
    const blocked = () => tree.talents.filter(t => ranks.get(t.id) > 0 && !open(t)).sort((a, b) => a.row - b.row)[0];
    let filler = 0, legal = true;
    for (let stuck = blocked(); stuck; stuck = blocked()) {
      const next = tree.talents.filter(t => !role.has(t.id) && ranks.get(t.id) < t.maxRank && open(t) && unlocked(t)).sort((a, b) => a.row - b.row || a.column - b.column)[0];
      if (!next || next.row >= stuck.row) { legal = false; break; }
      ranks.set(next.id, ranks.get(next.id) + 1); filler++;
    }
    const points = kind => tree.talents.reduce((sum, t) => sum + (role.get(t.id) === kind ? t.maxRank : 0), 0);
    const statPoints = points("stat"), prerequisitePoints = points("prerequisite"), minimum = legal ? statPoints + prerequisitePoints + filler : null;
    return { statPoints, prerequisitePoints, fillerPoints: legal ? filler : null, minimum, legal, reachable: legal && minimum <= POINTS_AT_60,
      prerequisites: tree.talents.filter(t => role.get(t.id) === "prerequisite").map(t => ({ id: t.id, name: t.name, maxRank: t.maxRank })), ranks };
  }
  // The trees holding most of a build's points (every tied tree; none for an empty build): checked guide builds stand beside them.
  function mainTrees(cls, ranks) {
    let offset = 0;
    const sums = cls.trees.map(tree => { const sum = ranks.slice(offset, offset + tree.talents.length).reduce((a, b) => a + b, 0); offset += tree.talents.length; return sum; });
    const best = Math.max(...sums);
    return best > 0 ? sums.flatMap((sum, index) => sum === best ? [index] : []) : [];
  }
  function specOverview(model, className, guides) {
    const cls = classData(model, className), all = cls.trees.flatMap(t => t.talents);
    const checked = (Array.isArray(guides) ? guides : []).filter(g => g && typeof g.id === "string" && typeof g.label === "string" && g.build && g.build.className === className && Array.isArray(g.build.ranks) && g.build.ranks.length === all.length);
    return cls.trees.map((tree, index) => {
      const talents = statTalents(model, cls, tree), need = treeRequirement(tree, talents.map(t => t.id)), chosen = new Set(talents);
      return { id: tree.id, name: tree.name, index, budget: POINTS_AT_60,
        talents: talents.map(t => ({ id: t.id, name: t.name, row: t.row, maxRank: t.maxRank, pointsNeeded: 5 * (t.row - 1), requires: requiresName(tree, t) })),
        statPoints: need.statPoints, prerequisitePoints: need.prerequisitePoints, fillerPoints: need.fillerPoints, minimum: need.minimum, legal: need.legal, reachable: need.reachable,
        prerequisites: need.prerequisites, upperRanks: all.map(t => chosen.has(t) ? t.maxRank : 0), witnessRanks: all.map(t => need.ranks.get(t.id) || 0),
        guides: checked.map(g => ({ g, main: mainTrees(cls, g.build.ranks) })).filter(x => x.main.includes(index)).map(x => ({ id: x.g.id, label: x.g.label, tied: x.main.length > 1 })) };
    });
  }
  // Each tree's upper bound: the race's level-60 sheet plus every stat talent of that tree at maximum rank, through the same evaluator
  // and grades as the sheet. It bounds that tree's stat talents only; it is not a build.
  function specComparison(model, options) {
    const className = options && options.className, cls = classData(model, className);
    const none = evaluate(model, { className, race: options.race, ranks: zeroRanks(cls), toggles: options.toggles, totalsOnly: true });
    const trees = specOverview(model, className, options.guides).map(tree => ({ ...tree, outcome: evaluate(model, { className, race: none.race, ranks: tree.upperRanks, toggles: none.toggles, totalsOnly: true }) }));
    return { className, race: none.race, raceLabel: none.raceLabel, classLabel: none.classLabel, toggles: none.toggles, specs: none.specs, none, trees };
  }
  function rankSeries(comp) {
    const unit = comp.unit === "pct_of_stat" ? "% of " + (STAT_LABEL[comp.sourceStat] || comp.sourceStat) : Object.hasOwn(UNIT_SUFFIX, comp.unit) ? UNIT_SUFFIX[comp.unit] : " " + String(comp.unit).replace(/_/g, " ");
    return comp.values.map(v => fmt(v)).join(" / ") + unit;
  }
  // HolyMinMax-style rows: every stat component of the class, at maximum rank and alone, on the selected race's sheet.
  function impactRows(model, options) {
    const className = options && options.className, cls = classData(model, className);
    const meta = evaluate(model, { className, race: options.race, ranks: zeroRanks(cls), toggles: options.toggles, totalsOnly: true });
    const ctx = { className, combo: meta.combo, toggles: meta.toggles, parryGranted: false };
    const baseEffects = [...formEffects(model, className, meta.toggles), ...racialEffects(model, className, meta.combo, meta.toggles).applied];
    const place = id => { const entry = model.talents.get(id); return { tree: entry.tree.name, treeIndex: cls.trees.indexOf(entry.tree), index: entry.index, row: entry.talent.row, pointsNeeded: 5 * (entry.talent.row - 1), requires: requiresName(entry.tree, entry.talent) }; };
    const rows = [];
    for (const entry of model.components) {
      const comp = entry.comp, at = model.talents.get(comp.talentId);
      if (comp.cls !== className || !at || at.cls !== className) continue;
      const base = { id: comp.id, talentId: comp.talentId, name: comp.name, ...place(comp.talentId), maxRank: comp.maxRank, tier: comp.tier, grade: comp.grade, target: comp.target,
        stat: capital(TARGET_LABEL[comp.target] || String(comp.target).replace(/[._]/g, " ")), perRank: rankSeries(comp), conditions: comp.conditions.map(conditionText) };
      if (!entry.verified) { rows.push({ ...base, group: "withheld", kind: KIND_LABEL.withheld, atMax: "Rank text changed since review; number withheld.", maxValue: null, effects: [], sortValue: null }); continue; }
      const verdict = classify(comp, meta.toggles), effect = effectOf(comp, comp.maxRank), extra = { direction: comp.direction, statBasis: comp.statBasis, sourceStat: comp.sourceStat, procEffect: comp.procEffect };
      const effects = verdict.group === "applied" || verdict.group === "conditional" || (verdict.group === "gear" && verdict.toggleable) ? isolatedEffect(model, ctx, baseEffects, comp, effect, meta.specs) : [];
      const own = effects.find(p => p.row === TARGET_ROW[comp.target] && num(p.value)) || effects.find(p => num(p.value));
      rows.push({ ...base, group: verdict.group, kind: KIND_LABEL[verdict.group] + (verdict.assumed ? " (your assumption is on)" : ""), atMax: modifierText(comp.op, comp.target, effect.value, comp.unit, extra),
        maxValue: effect.value, effects, sortValue: own ? own.value : null });
    }
    for (const id of PARRY_GRANTS) {
      const entry = model.talents.get(id);
      if (!entry || entry.cls !== className) continue;
      rows.push({ id: id + "#parry_grant", talentId: id, name: entry.talent.name, ...place(id), maxRank: entry.talent.maxRank, tier: "A", grade: "U", target: "parry", stat: capital(TARGET_LABEL.parry),
        perRank: "not published", conditions: [], group: "applied", kind: "Grants parry; its value is not published", atMax: "Grants the ability to parry; the parry chance it gives is not published",
        maxValue: null, effects: [{ row: "parry", label: "Parry %", text: "Unavailable (value not published)", grade: "U", value: null }], sortValue: null });
    }
    return { className, race: meta.race, raceLabel: meta.raceLabel, classLabel: meta.classLabel, toggles: meta.toggles, rows };
  }
  // One naked level-60 character per class for one race: no talents, no gear, no assumptions; applied racial traits included (the
  // sheet's Total column with no talents). Classes the race cannot be are marked, never filled in. The data's own race and base
  // notes travel with the table (Gnome: Classic Intellect may be about 5% high for Forever).
  function classTable(model, raceId) {
    const race = Object.hasOwn(model.naked.races, raceId) ? model.naked.races[raceId] : null;
    if (!race) throw userError("Unknown race.");
    return { race: raceId, raceLabel: race.name, note: noteOf(race.note), columns: CLASS_COLUMNS, rows: CLASS_IDS.map((className, order) => {
      const label = model.naked.classes[className].name;
      if (!race.classes.includes(className)) return { className, label, order, available: false, grade: null, note: null, cells: null };
      const result = evaluate(model, { className, race: raceId, ranks: zeroRanks(classData(model, className)), toggles: emptyToggles(), totalsOnly: true }), specs = new Map(result.specs.map(s => [s.id, s]));
      return { className, label, order, available: true, grade: result.combo.baseStats.grade, note: noteOf(result.combo.baseStats.note) || noteOf(race.note),
        cells: Object.fromEntries(CLASS_COLUMNS.map(col => [col.id, specs.has(col.id) ? { cell: result.sheets.total[col.id], spec: specs.get(col.id) } : null])) };
    }) };
  }
  // Sort keys. A disputed value sorts by its lowest candidate; Unavailable, n/a and "not available" have no key.
  function classSortValue(row, key) {
    if (key === "class") return row.label;
    const entry = row.available ? row.cells[key] : null, cell = entry && entry.cell;
    if (!cell || cell.na || cell.none) return null;
    return num(cell.value) ? cell.value : cell.cands ? Math.min(...cell.cands.map(c => c.value)) : null;
  }
  function impactSortValue(row, key) {
    switch (key) {
      case "talent": return row.name;
      case "tree": return row.treeIndex * 1000 + row.index;
      case "stat": return row.stat;
      case "kind": return row.kind;
      case "max": return row.maxValue;
      case "change": return row.sortValue;
      case "grade": return Object.hasOwn(GRADE_ORDER, row.grade) ? GRADE_ORDER[row.grade] : null;
      default: return null;
    }
  }
  // Stable sort; a missing key (Unavailable, n/a, not available) always sorts last, in either direction. Text compares
  // alphabetically in English, ignoring case, so the order does not depend on the viewer's locale.
  const COLLATOR = typeof Intl === "object" && typeof Intl.Collator === "function" ? new Intl.Collator("en", { sensitivity: "base" }) : null;
  function sortRows(items, valueOf, direction) {
    const sign = direction === "descending" ? -1 : 1, missing = v => v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
    return items.map((item, i) => ({ item, i, v: valueOf(item) })).sort((a, b) => {
      if (missing(a.v) || missing(b.v)) return missing(a.v) === missing(b.v) ? a.i - b.i : missing(a.v) ? 1 : -1;
      const order = COLLATOR && typeof a.v === "string" && typeof b.v === "string" ? COLLATOR.compare(a.v, b.v) : a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
      return order ? sign * order : a.i - b.i;
    }).map(x => x.item);
  }

  async function fetchJSON(fetcher, url) {
    const response = await fetcher(url, { credentials: "same-origin" });
    if (!response || !response.ok) throw userError("The level-60 data could not be loaded.");
    return response.json();
  }
  const loads = new WeakMap();
  function load(fetcher) {
    if (typeof fetcher !== "function") return Promise.reject(userError("The level-60 data cannot be requested here."));
    if (!loads.has(fetcher)) loads.set(fetcher, Promise.all([fetchJSON(fetcher, NAKED_URL), fetchJSON(fetcher, EFFECTS_URL)]).catch(error => { loads.delete(fetcher); throw error; }));
    return loads.get(fetcher);
  }

  function mount(container, ctx = {}) {
    if (!container || !container.ownerDocument || typeof container.appendChild !== "function") throw Error("A container is required for the level-60 sheet.");
    const doc = container.ownerDocument;
    let dead = false, build = ctx.build, model = null, ui = null, shownBuild = "", contribKey = "", outcomeCache = new Map();
    // .196: the all-classes race and both table sort orders survive a class change.
    const state = { race: "", toggles: emptyToggles(), reference: "none", allRace: "", sorts: { impact: { key: "tree", direction: "ascending" }, classes: { key: "class", direction: "ascending" } } };
    // Table roles keep row/cell semantics when narrow screens restack the cells with CSS.
    const TABLE_ROLE = { table: "table", thead: "rowgroup", tbody: "rowgroup", tr: "row", td: "cell" };
    const el = (tag, attrs, ...children) => {
      const node = doc.createElement(tag);
      if (TABLE_ROLE[tag]) node.setAttribute("role", TABLE_ROLE[tag]);
      if (tag === "th") node.setAttribute("role", attrs && attrs.scope === "row" ? "rowheader" : "columnheader");
      for (const [key, value] of Object.entries(attrs || {})) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "hidden" || key === "checked" || key === "disabled" || key === "selected") node[key] = value;
        else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, String(value));
      }
      for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.appendChild(typeof child === "string" ? doc.createTextNode(child) : child);
      return node;
    };
    const svg = (tag, attrs) => { const node = doc.createElementNS(SVG_NS, tag); for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, String(value)); return node; };
    const root = el("section", { class: "talents-stats60", "aria-label": "Level-60 character sheet" });
    const status = el("p", { class: "s60-status", role: "status", text: "Opening the level-60 data…" });
    root.appendChild(status); container.appendChild(root);
    function report(message) { status.hidden = false; status.textContent = message; status.setAttribute("role", "alert"); status.className = "s60-status s60-error"; }
    const fetcher = ctx.fetch || (typeof fetch === "function" ? fetch : null);
    const loading = ctx.naked && ctx.effects ? Promise.resolve([ctx.naked, ctx.effects]) : load(fetcher);
    const ready = loading.then(([naked, effects]) => {
      try { model = prepare(ctx.data, naked, effects); }
      catch (error) {
        // HTTP success can still carry invalid data. Retire only this load, never a newer concurrent retry.
        if (loads.get(fetcher) === loading) loads.delete(fetcher);
        throw error;
      }
      if (dead) return false;
      if (!build || typeof build.className !== "string") throw userError("A talent build is required.");
      construct();
      return true;
    }).catch(error => {
      if (!dead) report(publicMessage(error, "The level-60 data could not be loaded.") + " The level-60 sheet is unavailable; the talent calculator is not affected.");
      return false;
    });
    const gradeLabel = grade => (model && model.naked.grades[grade] && (model.naked.grades[grade].label || model.naked.grades[grade].meaning)) || GRADE_FALLBACK[grade] || grade;
    const isReference = grade => grade === "E" || grade === "D";
    // A talent component's data grade is named by the stat file's own legend (A: a DB2 trait curve equals the rank text), not by the
    // sheet legend, whose A also covers in-game measurements that have not been made.
    const componentLabel = grade => model && model.effects.grades && typeof model.effects.grades[grade] === "string" && model.effects.grades[grade] ? model.effects.grades[grade] : null;
    function badge(node, grade, legend) { node.textContent = grade; node.className = "s60-grade s60-grade-" + grade; node.setAttribute("title", "Grade " + grade + ": " + (legend || gradeLabel(grade))); node.hidden = false; }
    function valueCell(label, extra) {
      const value = el("span", { class: "s60-value" }), mark = el("abbr", { class: "s60-grade", hidden: true }), note = el("span", { class: "s60-cell-note", hidden: true });
      // Only a class name string is kept, so a stray argument (such as an Array.map index) never becomes a class.
      return { td: el("td", { "data-label": label }, value, " ", mark, note), value, badge: mark, note, extra: typeof extra === "string" ? extra : "" };
    }
    function setCell(ref, shown, note) {
      ref.value.textContent = shown.text;
      ref.td.className = "s60-cell" + (ref.extra ? " " + ref.extra : "") + (isReference(shown.grade) ? " s60-ref" : "") + (shown.grade === "U" ? " s60-unavailable" : "") + (shown.cls ? " " + shown.cls : "");
      if (shown.grade) badge(ref.badge, shown.grade); else { ref.badge.hidden = true; ref.badge.textContent = ""; }
      ref.note.hidden = !note; ref.note.textContent = note || "";
    }
    function construct() {
      root.replaceChildren(status); shownBuild = ""; contribKey = ""; outcomeCache = new Map();
      status.hidden = true; status.textContent = "";
      const className = build.className, combos = combosFor(model, className), toggles = availableToggles(model, className), specs = rowSpecs(model, className);
      if (!combos.some(c => c.race === state.race)) state.race = combos[0].race;
      const guides = Array.isArray(ctx.guides) ? ctx.guides.filter(g => g && g.build && g.build.className === className && Array.isArray(g.build.ranks) && typeof g.label === "string" && typeof g.id === "string") : [];
      if (state.reference !== "none" && !guides.some(g => g.id === state.reference)) state.reference = "none";
      const refs = { className, rows: new Map(), guides, chart: new Map(), compare: new Map() };
      root.append(el("h2", { text: "Level-60 character sheet" }),
        el("p", { class: "s60-intro", text: "A level-60 character with no gear, no buffs, no form and no talents, plus the effect of the talents you chose. Talent values are rank-text values checked against the pinned client snapshots named below, not a fresh live-tuning check. This dataset has no independently verified Forever level-60 base-attribute table, so the base column is a Classic reference or an estimate from it." }),
        el("p", { class: "s60-legend", text: "Grades: A exact client data · B client data with a semantic reading · C WoW Forever guide rule · D estimate derived from Classic data · E Classic reference — not Forever-verified · U Unavailable. Grey values are not Forever-verified." }));
      // (a) Race limited to valid combinations, then the optional assumptions.
      const raceSelect = el("select", { "aria-label": "Race", onchange() { state.race = raceSelect.value; render(); } },
        combos.map(c => el("option", { value: c.race, text: c.label + (c.grade === "U" ? " (no base values)" : c.grade === "D" ? " (estimate)" : "") })));
      raceSelect.value = state.race;
      const controls = el("div", { class: "s60-controls" }, el("label", { class: "s60-field" }, el("span", { text: "Race" }), raceSelect));
      const toggleBox = el("fieldset", { class: "s60-toggles" }, el("legend", { text: "Assumptions (default: naked, nothing active)" }));
      let toggleCount = 0;
      const field = (label, select) => { toggleBox.appendChild(el("label", { class: "s60-field" }, el("span", { text: label }), select)); toggleCount++; };
      if (toggles.forms.length) {
        const select = el("select", { "aria-label": "Form", onchange() { state.toggles.form = select.value; render(); } }, el("option", { value: "", text: "No form (caster)" }), toggles.forms.map(f => el("option", { value: f, text: FORM_LABEL[f] || f })));
        select.value = state.toggles.form; field("Form", select);
      }
      if (toggles.weapons.length) {
        // Only weapon types that a conditional talent of this class actually reads are offered.
        const offered = WEAPONS.filter(w => w.tags.some(tag => toggles.weapons.includes(tag)));
        if (state.toggles.weapon && !offered.some(w => w.id === state.toggles.weapon)) state.toggles.weapon = "";
        const select = el("select", { "aria-label": "Weapon (hypothetical)", onchange() { state.toggles.weapon = select.value; render(); } }, el("option", { value: "", text: "No weapon (naked)" }), offered.map(w => el("option", { value: w.id, text: w.label })));
        select.value = state.toggles.weapon; field("Weapon (hypothetical)", select);
      }
      if (toggles.pets.length) {
        const select = el("select", { "aria-label": "Pet", onchange() { state.toggles.pet = select.value; render(); } }, el("option", { value: "", text: "No pet" }),
          toggles.pets.map(p => el("option", { value: p, text: p === "demon" ? "Demon pet summoned" : p === "imp" ? "Imp summoned" : "Pet active" })));
        select.value = state.toggles.pet; field("Pet", select);
      }
      if (toggles.shield) {
        const box = el("input", { type: "checkbox", checked: state.toggles.shield, onchange() { state.toggles.shield = box.checked === true; render(); } });
        toggleBox.appendChild(el("label", { class: "s60-check" }, box, el("span", { text: "Shield equipped (hypothetical)" }))); toggleCount++;
      }
      for (const buff of toggles.buffs) {
        const box = el("input", { type: "checkbox", checked: state.toggles.buffs.includes(buff), onchange() { state.toggles.buffs = state.toggles.buffs.filter(b => b !== buff).concat(box.checked === true ? [buff] : []); render(); } });
        toggleBox.appendChild(el("label", { class: "s60-check" }, box, el("span", { text: buff + " active" }))); toggleCount++;
      }
      if (!toggleCount) toggleBox.appendChild(el("p", { class: "s60-small", text: "No conditional talent of this class changes a sheet row through a form, weapon, shield, pet or self-buff, so there is nothing to switch on." }));
      controls.appendChild(toggleBox);
      refs.provenance = el("p", { class: "s60-provenance" });
      // Kept in the accessibility tree while empty (CSS hides the empty box) so the first assumption is announced.
      refs.assumption = el("p", { class: "s60-assumption", role: "status", "aria-live": "polite" });
      root.append(controls, refs.provenance, refs.assumption);
      // (b) Sheet table: rows are fixed per class and repainted in place.
      const headers = ["Stat", "Base", "Racial", "Talents (current build)", "Total"];
      const table = el("table", { class: "s60-table s60-sheet" });
      refs.caption = el("caption");
      table.append(refs.caption, el("thead", null, el("tr", null, headers.map(text => el("th", { scope: "col", text })))));
      const body = el("tbody");
      for (const spec of specs) {
        const cells = headers.slice(1).map(label => valueCell(label));
        body.appendChild(el("tr", { "data-row": spec.id }, el("th", { scope: "row" }, el("span", { class: "s60-row-label", text: spec.label }), spec.note ? el("span", { class: "s60-row-note", text: spec.note }) : null), cells.map(c => c.td)));
        refs.rows.set(spec.id, { spec, cells });
      }
      table.appendChild(body);
      root.append(el("div", { class: "s60-table-wrap" }, table),
        el("p", { class: "s60-small", text: "Totals add only unconditional talents and the assumptions you switched on. WoW Forever stacking and rounding are unverified, so the Classic rules are assumed: percentage bonuses multiply, percentage points and flat bonuses add, and a value that combines two or more talents or racial traits is graded E at best. Attributes are left unrounded; health, mana, rage and energy add flat bonuses first, then percentages, and are rounded (Classic rule). Every grey value is a Classic reference — not Forever-verified — or an estimate derived from one." }));
      // (c) Talent contributions.
      refs.contrib = el("div", { class: "s60-contrib" });
      root.append(el("h3", { text: "Talent contributions" }), refs.contrib);
      // (d) Diverging SVG chart with an equivalent table.
      const refSelect = el("select", { "aria-label": "Compare the current build with", onchange() { state.reference = refSelect.value; render(); } }, el("option", { value: "none", text: "No talents" }), guides.map(g => el("option", { value: g.id, text: g.label })));
      refSelect.value = state.reference;
      refs.panels = {};
      const figure = el("figure", { class: "s60-chart" });
      for (const [panel, title] of [["rel", "Attributes and resources — change in percent"], ["pp", "Chances — change in percentage points"]]) {
        const scale = { min: el("span"), zero: el("span", { text: "0" }), max: el("span") }, list = el("div", { class: "s60-chart-list", role: "list", "aria-label": title });
        figure.appendChild(el("div", { class: "s60-chart-panel" }, el("p", { class: "s60-chart-title", text: title }), el("div", { class: "s60-chart-axis", "aria-hidden": "true" }, scale.min, scale.zero, scale.max), list));
        refs.panels[panel] = { list, scale };
      }
      figure.appendChild(el("figcaption", { class: "s60-small", text: "Bars show the current build minus the chosen comparison; each panel has one symmetric scale. Dashed bars rest on Classic-reference or estimated values, and a lighter span covers disputed candidates. Spell damage, healing and regeneration changes are in the sheet table." }));
      const chartTable = el("table", { class: "s60-table s60-chart-table" }), chartBody = el("tbody");
      chartTable.append(el("caption", { text: "Chart data" }), el("thead", null, el("tr", null, ["Stat", "Comparison", "Current", "Change", "Grade"].map(text => el("th", { scope: "col", text })))), chartBody);
      for (const spec of specs.filter(s => s.chart)) {
        const label = el("span", { class: "s60-chart-label", text: spec.label.replace(" (Agility part and modifiers)", "") }), value = el("span", { class: "s60-chart-value" });
        const bar = svg("svg", { viewBox: "0 0 200 14", preserveAspectRatio: "none", width: "100%", height: "14", class: "s60-chart-bar", "aria-hidden": "true", focusable: "false" });
        const range = svg("rect", { x: 100, y: 3, width: 0, height: 8, class: "s60-bar-range" }), rect = svg("rect", { x: 100, y: 3, width: 0, height: 8, class: "s60-bar-pos" });
        bar.append(svg("rect", { x: 0, y: 2, width: 200, height: 10, class: "s60-chart-track" }), range, rect, svg("line", { x1: 100, x2: 100, y1: 0, y2: 14, class: "s60-chart-zero", "vector-effect": "non-scaling-stroke" }));
        // Not a tab stop: the rows have no action, and the Chart data table below carries the same values.
        const row = el("div", { class: "s60-chart-row", role: "listitem" }, label, bar, value);
        refs.panels[spec.chart].list.appendChild(row);
        const cells = ["Comparison", "Current", "Change", "Grade"].map(text => el("td", { "data-label": text }));
        chartBody.appendChild(el("tr", null, el("th", { scope: "row", text: spec.label }), cells));
        refs.chart.set(spec.id, { spec, row, value, rect, range, cells });
      }
      root.append(el("h3", { text: "Talent changes by stat" }), el("label", { class: "s60-field s60-chart-ref" }, el("span", { text: "Compare the current build with" }), refSelect), figure, el("div", { class: "s60-table-wrap" }, chartTable));
      // (e) Spec comparison: current, no talents and each checked guide build.
      refs.columns = [{ id: "none", label: "No talents" }, { id: "current", label: "Current build" }, ...guides.map(g => ({ id: g.id, label: g.label, build: g.build }))];
      // Guide labels already carry their point split, so only the two computed columns get one.
      refs.heads = refs.columns.map(c => { const split = c.build ? null : el("span", { class: "s60-row-note" }); return { th: el("th", { scope: "col" }, el("span", { text: c.label }), split), split }; });
      const compare = el("table", { class: "s60-table s60-compare" }), compareBody = el("tbody");
      compare.append(el("caption", { text: "Totals per build with the selected race and assumptions; brackets show the change against no talents." }), el("thead", null, el("tr", null, el("th", { scope: "col", text: "Stat" }), refs.heads.map(h => h.th))), compareBody);
      for (const spec of specs) {
        const cells = refs.columns.map(c => valueCell(c.label));
        compareBody.appendChild(el("tr", null, el("th", { scope: "row", text: spec.label }), cells.map(c => c.td)));
        refs.compare.set(spec.id, { spec, cells });
      }
      root.append(...[el("h3", { text: "Spec comparison" }), guides.length ? null : el("p", { class: "s60-small", text: "No checked guide build is available for this class in this snapshot; the table compares the current build with no talents." }), el("div", { class: "s60-table-wrap" }, compare)].filter(Boolean));
      // (g)-(i) .196 item 9b: compare specs, stat impact by talent and all classes. They depend on race and assumptions, never on the build.
      constructViews(refs, className, guides, specs);
      // (f) About these numbers: provenance and the measurement call to action, text only.
      const sources = model.naked.sources.filter(s => s.title).map(s => el("li", { text: s.title + (s.url ? " — " + s.url : "") + (s.grade ? " (grade " + s.grade + ")" : "") }));
      root.appendChild(el("details", { class: "s60-about" }, el("summary", { text: "About these numbers" }),
        el("p", { text: "Exact: the talent values. Each of the " + model.effects.components.length + " talent stat components equals its Talents Forever rank text for client " + (model.effects.source.clientBuildOfTexts || []).join(", ") + "; " + model.effects.counts.byGrade.A + " also equal the client's own talent curves (grade A, DB2 " + model.effects.source.db2Build + ", cross-checked in " + model.effects.source.db2CrossCheckBuild + ") and " + model.effects.counts.byGrade.B + " carry a semantic reading of client data (grade B: values read from spell effects, or an exact curve whose stat is read from its aura). Racial traits come from DB2 SpellEffect " + model.naked.build.client + " (grade B)." }),
        el("p", { text: "Not exact: this dataset has no independently verified Forever level-60 base attributes, health or mana. It does not establish that no authoritative publication exists elsewhere. The base column uses CMaNGOS Classic values (grade E), estimates derived from them for six race and class pairs that Classic did not have (grade D), and nothing for Skyborne (Unavailable). Conversion rules come from the Warcraft Tavern WoW Forever stats guide where it states them (grade C), otherwise from Classic emulators (grade E)." }),
        el("p", { text: "Disputed, so both candidates are shown: the Druid melee attack power level term (each candidate with its own Predatory Strikes rule), ranged attack power per Agility for every class except Hunter, and spell crit per Intellect. Careful Aim's ranged attack power is a semantic reading of a second client effect (grade B). Spirit regeneration is a Classic formula and approximate. Stacking and rounding follow the Classic rules as an assumption (grade E when two or more effects combine). Gear is never included: Toughness and weapon or shield effects add 0 unless you switch on a hypothetical assumption." }),
        el("p", { text: "Data files naked60-186.json and stat-effects186.json were generated " + model.naked.generatedAt + " for talent snapshot " + model.naked.build.talentRevision + "; every DB2 export they use is pinned by SHA-256 inside the files. Older HolyMinMax data from client 1.60.1.70009 is not used." }),
        el("ul", null, sources),
        el("p", { class: "s60-cta", text: "Help replace the Classic references: if you have a level-60 character, remove all gear including weapons, cancel every buff, leave all talent points unspent, stay in caster form and out of combat, then read the character panel. With your consent, share a screenshot cropped to the stat panel only — no character name, realm, guild or chat — with the guild owner. Numbers are entered by hand; nothing is uploaded automatically and no addon is involved." })));
      ui = refs;
      render();
    }
    const buildKey = value => value ? [value.className, value.level, Array.isArray(value.ranks) ? value.ranks.join(",") : ""].join("|") : "";
    function render() {
      if (dead || !model || !build) return;
      if (!ui || ui.className !== build.className) { construct(); return; }
      // Any failure stays inside this section: the calculator's own paint must keep running.
      try { paintSheet(); }
      catch (error) { report(publicMessage(error, "The level-60 sheet could not be computed for this build.")); }
    }
    function paintSheet() {
      const result = evaluate(model, { className: build.className, race: state.race, ranks: build.ranks, toggles: state.toggles });
      if (!status.hidden) { status.hidden = true; status.textContent = ""; status.className = "s60-status"; status.setAttribute("role", "status"); }
      const b = result.combo.baseStats, comboNote = typeof b.note === "string" && b.note ? " " + b.note : "";
      ui.caption.textContent = "Level 60 " + result.raceLabel + " " + result.classLabel + ", no gear — " + (b.grade === "U" ? "base values Unavailable" : gradeLabel(b.grade));
      ui.provenance.className = "s60-provenance" + (isReference(b.grade) ? " s60-ref" : "");
      ui.provenance.textContent = b.grade === "E" ? "Base attributes: Classic reference — not Forever-verified (" + (SOURCE_SHORT[b.source] || b.source) + " " + b.ref + "). The Classic values already include racial bonuses, so percentage racial attribute traits are not applied again." + comboNote
        : b.grade === "D" ? "Base attributes: derived estimate from Classic reference — not Forever-verified (class base plus race offset; largest fit error Str " + b.tolerance.str + ", Agi " + b.tolerance.agi + ", Sta " + b.tolerance.sta + ", Int " + b.tolerance.int + ", Spi " + b.tolerance.spi + ")." + comboNote
          : "Base attributes: Unavailable. " + (b.reason || "") + " Talent modifiers are still shown in modifier terms.";
      const assumptionText = result.assumptions.length ? "Hypothetical, not naked: " + listWords(result.assumptions, "and") + "." : "";
      if (ui.assumption.textContent !== assumptionText) ui.assumption.textContent = assumptionText;
      const includedNotes = new Map(result.racials.filter(r => r.group === "included").map(r => [r.target, r.name + " " + r.modifier + " is already in the Classic base; not applied again."]));
      for (const row of result.rows) {
        const ref = ui.rows.get(row.id); if (!ref) continue;
        setCell(ref.cells[0], cellText(row.base, row), row.base.notes.join(" "));
        setCell(ref.cells[1], deltaText(row.racial, row), includedNotes.get(row.id) || "");
        setCell(ref.cells[2], deltaText(row.talents, row), row.talents.stacked && (num(row.talents.value) ? Math.abs(row.talents.value) > 1e-9 : !!row.talents.cands || row.talents.unavailable) ? STACK_NOTE : "");
        setCell(ref.cells[3], cellText(row.total, row), [...new Set(row.total.notes)].join(" "));
      }
      renderContributions(result);
      // The no-talent and guide outcomes depend only on race and assumptions, so they are reused across point edits.
      const cacheKey = result.race + "|" + JSON.stringify(result.toggles);
      if (!outcomeCache.has(cacheKey)) outcomeCache.set(cacheKey, new Map());
      const fixed = outcomeCache.get(cacheKey), outcomes = new Map([["current", result]]);
      for (const column of ui.columns) {
        if (column.id === "current") continue;
        if (!fixed.has(column.id)) {
          try { fixed.set(column.id, evaluate(model, { className: result.className, race: result.race, ranks: column.id === "none" ? result.emptyRanks : column.build && column.build.ranks, toggles: state.toggles, totalsOnly: true })); }
          catch { fixed.set(column.id, null); }
        }
        outcomes.set(column.id, fixed.get(column.id));
      }
      renderChart(result, outcomes.get(state.reference) || outcomes.get("none"));
      renderCompare(outcomes);
      paintViews(result, fixed);
      shownBuild = buildKey(build); // only a completed paint lets an identical update be skipped
    }
    function renderContributions(result) {
      // Rebuilt only when what it shows changes; a repaint with the same contributions keeps the existing nodes.
      const key = JSON.stringify([result.raceLabel, result.contributions, result.racials]);
      if (key === contribKey) return;
      contribKey = key;
      const parts = [];
      if (!result.contributions.length) parts.push(el("p", { class: "s60-small", text: "No allocated talent has a stat component. Racial traits are listed below." }));
      for (const [group, title, hint] of GROUPS) {
        const items = result.contributions.filter(c => c.group === group);
        if (!items.length) continue;
        parts.push(el("section", { class: "s60-group s60-group-" + group }, el("h4", { text: title + " (" + items.length + ")" }), el("p", { class: "s60-small", text: hint }),
          el("ul", null, items.map(item => {
            const mark = el("abbr"); badge(mark, item.grade);
            return el("li", null, el("strong", { text: item.name }), " " + item.rank + "/" + item.maxRank + " · " + item.tree + " · tier " + item.tier + " ", mark,
              el("span", { class: "s60-mod", text: item.modifier + (item.conditions.length ? " — applies only " + listWords(item.conditions, "and") : "") + (item.assumed ? " (included because of your assumption)" : "") }),
              item.effects.length ? el("span", { class: "s60-effects", text: (group === "applied" ? "On the sheet, alone: " : "Would add, alone: ") + item.effects.map(e => e.label + " " + e.text).join(" · ") }) : null,
              item.notes && item.notes.length ? el("span", { class: "s60-small", text: item.notes.join(" ") }) : null,
              item.db2 ? el("span", { class: "s60-source", text: "DB2 spell " + item.db2.spellId + (item.db2.curveId ? " · curve " + item.db2.curveId : "") + " · build " + item.db2.build }) : null);
          }))));
      }
      if (result.racials.length) {
        const groupText = { applied: "added to the sheet", included: "already in the Classic base", gear: "needs gear", scoped: "situational", throughput: "throughput, never added", other: "not a sheet row" };
        parts.push(el("section", { class: "s60-group s60-group-racial" }, el("h4", { text: result.raceLabel + " racial traits" }),
          el("ul", null, result.racials.map(r => {
            const mark = el("abbr"); badge(mark, r.grade);
            return el("li", null, el("strong", { text: r.name }), " · " + (groupText[r.group] || r.group) + " ", mark, el("span", { class: "s60-mod", text: r.modifier + (r.conditions.length ? " — applies only " + listWords(r.conditions, "and") : "") }), r.note ? el("span", { class: "s60-small", text: r.note }) : null);
          }))));
      }
      ui.contrib.replaceChildren(...parts);
    }
    function chartValue(spec, current, reference) {
      const cur = current.sheets.total[spec.id], ref = reference.sheets.total[spec.id], cv = valuesOf(cur), rv = valuesOf(ref);
      if (cur.na || ref.na) return { low: 0, high: 0, text: "n/a", grade: null, na: true };
      const factor = list => list.filter(m => m.kind === "factor").reduce((f, m) => f * (1 + m.value / 100), 1);
      const additive = list => list.filter(m => ADDITIVE_KINDS.has(m.kind)).reduce((s, m) => s + m.value, 0);
      // One side Unavailable: no change can be stated. Both Unavailable: only modifier-space differences can, and "no talent change" otherwise.
      if (!cv !== !rv) return null;
      if (!cv && !rv) {
        // .193: a rank change keeps its key, so modifiers match only by key, kind and value, and a shared touched key also by its talent's rank.
        const same = (a, b) => a.key === b.key && a.kind === b.kind && (a.value === b.value || Math.abs(a.value - b.value) < 1e-9);
        const unmatched = (list, other) => { const pool = [...other]; return list.filter(m => { const at = pool.findIndex(o => same(m, o)); if (at < 0) return true; pool.splice(at, 1); return false; }); };
        const differing = unmatched(cur.direct, ref.direct).concat(unmatched(ref.direct, cur.direct));
        const rankOf = (outcome, key) => outcome.ranks.get(sourceOf(key)) || 0;
        const touchedDiffer = [...cur.touched].some(k => !ref.touched.has(k) || rankOf(current, k) !== rankOf(reference, k)) || [...ref.touched].some(k => !cur.touched.has(k));
        if (!differing.length && !touchedDiffer) return { low: 0, high: 0, text: "no talent change", grade: null, unchanged: true };
        if (!differing.length || differing.some(m => m.kind !== "factor" && !ADDITIVE_KINDS.has(m.kind))) return null;
      }
      const pair = (a, b, i) => [a[a.length === 1 ? 0 : i], b[b.length === 1 ? 0 : i]];
      const range = (vals, unit, digits) => {
        const texts = vals.map(v => signed(v, digits) + unit), same = texts.every(t => t === texts[0]);
        return { low: Math.min(...vals), high: Math.max(...vals), text: same ? texts[0] + (vals.length > 1 && vals.some(v => Math.abs(v - vals[0]) > 1e-9) ? " (both candidates)" : "") : "disputed: " + texts.join(" / ") };
      };
      if (spec.chart === "rel") {
        if (cv && rv && (cv.length === rv.length || cv.length === 1 || rv.length === 1)) {
          const n = Math.max(cv.length, rv.length), pairs = Array.from({ length: n }, (_, i) => pair(cv, rv, i));
          if (pairs.every(([c, r]) => Math.abs(c - r) < 1e-9)) return { low: 0, high: 0, text: "0%", grade: weakest(cur.grade, ref.grade) };
          if (pairs.every(([, r]) => Math.abs(r) > 1e-9)) return { ...range(pairs.map(([c, r]) => clean((c - r) / Math.abs(r) * 100)), "%", 1), grade: weakest(cur.grade, ref.grade) };
          return null;
        }
        if (STATS.includes(spec.id) && !cv && !rv) {
          const v = clean((factor(cur.direct) / factor(ref.direct) - 1) * 100), mods = cur.direct.concat(ref.direct).filter(m => m.kind === "factor");
          if (!mods.length || cur.direct.concat(ref.direct).some(m => m.kind !== "factor")) return null;
          return { low: v, high: v, text: signed(v, 1) + "% (modifier)", grade: weakest(mods.map(m => m.grade), stackGrade(cur.direct), stackGrade(ref.direct)) };
        }
        return null;
      }
      if (cv && rv) {
        const d = delta(cur, ref);
        if (d.cands) return { ...range(d.cands.map(c => c.value), " pp", 2), grade: d.grade };
        if (num(d.value)) return { low: d.value, high: d.value, text: signed(d.value, 2) + " pp", grade: Math.abs(d.value) < 1e-9 && !d.grade ? weakest(cur.grade, ref.grade) : d.grade };
        return null;
      }
      const mods = cur.direct.concat(ref.direct).filter(m => ADDITIVE_KINDS.has(m.kind)), add = clean(additive(cur.direct) - additive(ref.direct));
      if (!mods.length || cur.direct.concat(ref.direct).some(m => !ADDITIVE_KINDS.has(m.kind))) return null;
      return { low: add, high: add, text: signed(add, 2) + " pp (modifiers only)", grade: weakest(mods.map(m => m.grade), stackGrade(cur.direct), stackGrade(ref.direct)) };
    }
    function niceMax(value) { if (!(value > 0)) return 1; const p = 10 ** Math.floor(Math.log10(value)), m = value / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
    function renderChart(result, reference) {
      const guide = ui.guides.find(g => g.id === state.reference), refName = guide ? guide.label : "no talents", values = new Map();
      for (const [id, ref] of ui.chart) values.set(id, reference ? chartValue(ref.spec, result, reference) : null);
      for (const panel of ["rel", "pp"]) {
        const members = [...ui.chart.values()].filter(r => r.spec.chart === panel);
        const extent = niceMax(Math.max(0, ...members.map(r => values.get(r.spec.id)).filter(Boolean).flatMap(v => [Math.abs(v.low), Math.abs(v.high)])));
        const unit = panel === "rel" ? "%" : " pp", scale = ui.panels[panel].scale, x = n => 100 + Math.max(-1, Math.min(1, n / extent)) * 100;
        scale.min.textContent = "−" + fmt(extent, 2) + unit; scale.max.textContent = "+" + fmt(extent, 2) + unit;
        for (const ref of members) {
          const v = values.get(ref.spec.id), before = reference ? cellText(reference.sheets.total[ref.spec.id], ref.spec).text : "Unavailable", now = cellText(result.sheets.total[ref.spec.id], ref.spec).text;
          if (!v || v.na) {
            ref.rect.setAttribute("width", "0"); ref.range.setAttribute("width", "0"); ref.value.textContent = v ? "n/a" : "Unavailable";
            ref.row.setAttribute("aria-label", ref.spec.label + (v ? ": not applicable to this class" : ": change unavailable")); ref.row.className = "s60-chart-row s60-unavailable";
          } else {
            const single = Math.abs(v.high - v.low) < 1e-9, end = single || v.low >= 0 ? v.low : v.high <= 0 ? v.high : 0;
            const a = x(Math.min(0, end)), b = x(Math.max(0, end)), dashed = isReference(v.grade);
            ref.rect.setAttribute("x", fmt(a, 3)); ref.rect.setAttribute("width", fmt(b - a, 3));
            ref.rect.setAttribute("class", (end < 0 ? "s60-bar-neg" : "s60-bar-pos") + (dashed ? " s60-bar-ref" : ""));
            ref.rect.setAttribute("stroke-dasharray", dashed ? "3 2" : "none");
            ref.range.setAttribute("x", fmt(x(v.low), 3)); ref.range.setAttribute("width", single ? "0" : fmt(x(v.high) - x(v.low), 3));
            ref.value.textContent = v.text;
            ref.row.setAttribute("aria-label", ref.spec.label + ": " + v.text + " versus " + refName + (v.grade ? ", grade " + v.grade + " (" + gradeLabel(v.grade) + ")" : ""));
            ref.row.className = "s60-chart-row" + (dashed ? " s60-ref" : "");
          }
          [before, now, v ? v.text : "Unavailable", !v ? "U — Unavailable" : v.grade ? v.grade + " — " + gradeLabel(v.grade) : "—"].forEach((text, i) => { ref.cells[i].textContent = text; });
        }
      }
    }
    function treeSplit(ranks) {
      const cls = model.data.classes.find(c => c.id === build.className);
      return cls ? cls.trees.map(tree => tree.talents.reduce((s, t) => s + (ranks.get(t.id) || 0), 0)).join(" / ") + " points" : "";
    }
    function renderCompare(outcomes) {
      const noTalents = outcomes.get("none");
      ui.columns.forEach((column, i) => { const o = outcomes.get(column.id), split = ui.heads[i].split; if (split) split.textContent = o ? treeSplit(o.ranks) : "Unavailable"; });
      for (const [id, ref] of ui.compare) ui.columns.forEach((column, i) => {
        const o = outcomes.get(column.id);
        if (!o) { setCell(ref.cells[i], { text: "Unavailable", grade: "U" }, ""); return; }
        const total = o.sheets.total[id], shown = cellText(total, ref.spec);
        if (column.id !== "none" && noTalents) {
          const d = deltaText(delta(total, noTalents.sheets.total[id]), ref.spec);
          if (d.text !== "—") shown.text += " (" + d.text.replace(/^disputed: /, "") + ")";
        }
        setCell(ref.cells[i], shown, "");
      });
    }
    // .196 item 9b views. Sort controls are native buttons inside the column headers, so Tab, Enter and Space work without extra
    // handlers; aria-sort on the header names the current order. Wide tables scroll inside a focusable, labelled region.
    const GRADE_NOTE = { E: "Base: Classic reference (E)", D: "Base: estimate from Classic data (D)", U: "Base: Unavailable (U)" };
    const scroller = (label, table) => el("div", { class: "table-wrap", role: "region", tabindex: "0", "aria-label": label }, table);
    function sorter(name, onChange) {
      const sort = state.sorts[name], heads = [];
      return {
        head(key, label) {
          const mark = el("span", { class: "s60-sort-mark", "aria-hidden": "true" });
          const button = el("button", { type: "button", class: "s60-sort", onclick() {
            sort.direction = sort.key === key && sort.direction === "ascending" ? "descending" : "ascending"; sort.key = key;
            try { onChange(); } catch (error) { report(publicMessage(error, "This table could not be sorted.")); }
          } }, el("span", { text: label }), " ", mark);
          const th = el("th", { scope: "col", "aria-sort": "none" }, button);
          heads.push({ key, th, mark });
          return th;
        },
        order(items, valueOf) {
          for (const h of heads) { const on = h.key === sort.key; h.th.setAttribute("aria-sort", on ? sort.direction : "none"); h.mark.textContent = on ? (sort.direction === "ascending" ? "▲" : "▼") : ""; }
          return sortRows(items, item => valueOf(item, sort.key), sort.direction);
        }
      };
    }
    function gradeCell(grade, label) { const mark = el("abbr"); badge(mark, grade, componentLabel(grade)); return el("td", { "data-label": label, class: "s60-cell" + (isReference(grade) ? " s60-ref" : "") }, mark); }
    const needsText = r => "Row " + r.row + (r.pointsNeeded ? ", " + r.pointsNeeded + " points in earlier rows" : ", no earlier points") + (r.requires ? "; requires " + r.requires + " at maximum rank" : "");
    const maxText = r => r.atMax + (r.conditions.length ? " — " + listWords(r.conditions, "and") : "");
    function changeCell(r) {
      const td = el("td", { class: "wrap", "data-label": "Change on the sheet, alone" });
      if (!r.effects.length) td.appendChild(el("span", { class: "s60-small", text: r.group === "withheld" ? "Number withheld" : r.group === "applied" ? "No change on this sheet" : "Not added to the sheet" }));
      else if (r.group !== "applied") td.appendChild(el("span", { class: "s60-small", text: "Would add when its assumption holds: " }));
      for (const part of r.effects) { const mark = el("abbr"); badge(mark, part.grade); td.appendChild(el("span", { class: "s60-effects" + (isReference(part.grade) ? " s60-ref" : "") }, part.label + " " + part.text + " ", mark)); }
      return td;
    }
    function constructViews(refs, className, guides, specs) {
      const overview = specOverview(model, className, guides), protocol = model.naked.measurementProtocol, measured = protocol && typeof protocol.status === "string" ? protocol.status : "";
      const honesty = "Nothing here was measured in WoW Forever" + (measured ? " (in-game measurement protocol: " + measured + ")" : "") + ": grey values are Classic references or estimates from them, not Forever-verified, and Unavailable is never shown as 0.";
      const views = refs.views = { key: "", classKey: "", specRows: new Map(), specColumns: [], trees: [], impact: [], classes: [] };
      // (g) Compare specs: a reachability check, each tree's upper bound beside its checked guide builds, and each tree's stat talents.
      const reach = tree => tree.reachable ? "Yes" : tree.legal ? "No: needs " + tree.minimum : "No: too few points below its top row";
      const checkTable = el("table", { class: "s60-table s60-tree-check" });
      checkTable.append(el("caption", { text: "What each tree's stat talents need at maximum rank under this snapshot's tier and prerequisite rules (" + POINTS_AT_60 + " points at level 60). A reachability check, not a recommendation." }),
        el("thead", null, el("tr", null, ["Tree", "Stat talents", "Points at maximum rank", "Prerequisites outside the set", "Extra points for tier requirements", "Minimum legal total", "Within " + POINTS_AT_60 + " points", "Checked guide builds"].map(text => el("th", { scope: "col", text })))),
        el("tbody", null, overview.map(tree => el("tr", { "data-tree": tree.id }, el("th", { scope: "row", text: tree.name }),
          [["Stat talents", String(tree.talents.length)], ["Points at maximum rank", String(tree.statPoints)],
            ["Prerequisites outside the set", tree.prerequisites.length ? tree.prerequisites.map(p => p.name + " " + p.maxRank + "/" + p.maxRank).join(", ") + " (" + tree.prerequisitePoints + (tree.prerequisitePoints === 1 ? " point)" : " points)") : "none"],
            ["Extra points for tier requirements", tree.legal ? String(tree.fillerPoints) : "Unavailable"], ["Minimum legal total", tree.legal ? String(tree.minimum) : "Unavailable"],
            ["Within " + POINTS_AT_60 + " points", reach(tree)], ["Checked guide builds", tree.guides.length ? tree.guides.map(g => g.label).join("; ") : "None in this snapshot"]]
            .map(([label, text]) => el("td", { "data-label": label, text }))))));
      const columns = [{ id: "none", kind: "none", label: "No talents", note: "The race's level-60 sheet without talent points" }];
      for (const tree of overview) {
        // Kept short so narrow columns stay readable; the caption and the paragraph above carry the full "not a recommended or checked build" wording.
        columns.push({ id: "tree:" + tree.id, kind: "tree", tree, label: tree.name + ": upper bound",
          note: (tree.talents.length === 1 ? "The only stat talent" : "All " + tree.talents.length + " stat talents") + " at maximum rank, " + count(tree.statPoints, "point", "points") + "; "
            + (tree.reachable ? "reachable, minimum legal total " + tree.minimum : "not reachable within " + POINTS_AT_60) + ". Not a build." + (tree.guides.length ? "" : " No checked guide build for this tree.") });
        for (const guide of tree.guides) columns.push({ id: guide.id, kind: "guide", tree, label: guide.label, note: "Checked guide build; most of its points are in " + tree.name + (guide.tied ? " (tied with another tree)" : "") });
      }
      views.specColumns = columns;
      const specTable = el("table", { class: "s60-table s60-specs" }), specBody = el("tbody");
      views.specCaption = el("caption");
      specTable.append(views.specCaption, el("thead", null, el("tr", null, el("th", { scope: "col", text: "Stat" }), columns.map(c => el("th", { scope: "col" }, el("span", { text: c.label }), el("span", { class: "s60-row-note", text: c.note }))))), specBody);
      for (const spec of specs) {
        const cells = columns.map(c => valueCell(c.label));
        specBody.appendChild(el("tr", { "data-spec-row": spec.id }, el("th", { scope: "row", text: spec.label }), cells.map(c => c.td)));
        views.specRows.set(spec.id, { spec, cells });
      }
      views.trees = overview.map(tree => {
        const body = el("tbody"), table = el("table", { class: "s60-table s60-tree-talents", "data-tree": tree.id });
        table.append(el("caption", { text: tree.name + ": " + count(tree.talents.length, "talent", "talents") + " with a stat component, " + count(tree.statPoints, "point", "points") + " at maximum rank" }),
          el("thead", null, el("tr", null, ["Talent", "Needs", "Stat", "Kind", "Per rank", "At maximum rank", "Data grade"].map(text => el("th", { scope: "col", text })))), body);
        return { tree, body, table };
      });
      root.append(el("h3", { text: "Compare specs" }),
        el("p", { class: "s60-small", text: "The three trees of this class side by side. Each tree lists every talent with a stat component in the pinned stat file. Its upper bound adds all of them at maximum rank to the selected race's level-60 sheet with the selected assumptions: it bounds what that tree's stat talents can add and is not a recommended, checked or complete build, and points in the other trees are not counted. Checked guide builds stand beside the tree that holds most of their points. " + honesty }),
        el("div", { class: "s60-table-wrap" }, checkTable), el("div", { class: "s60-table-wrap" }, specTable),
        el("h4", { text: "Stat talents in each tree" }), ...views.trees.map(t => el("div", { class: "s60-table-wrap" }, t.table)));
      // (h) Stat impact by talent (HolyMinMax style), sortable.
      views.impactSort = sorter("impact", orderImpact);
      const impactTable = el("table", { class: "data s60-impact" });
      views.impactCaption = el("caption"); views.impactBody = el("tbody");
      impactTable.append(views.impactCaption, el("thead", null, el("tr", null, views.impactSort.head("talent", "Talent"), views.impactSort.head("tree", "Tree"), views.impactSort.head("stat", "Stat"), views.impactSort.head("kind", "Kind"),
        el("th", { scope: "col", text: "Per rank" }), views.impactSort.head("max", "At maximum rank"), views.impactSort.head("change", "Change on the sheet, alone"), views.impactSort.head("grade", "Data grade"))), views.impactBody);
      root.append(el("h3", { text: "Stat impact by talent" }),
        el("p", { class: "s60-small", text: "Every talent of this class with a stat component, in all three trees, at maximum rank and on its own, against the selected race's level-60 sheet with the selected assumptions. A conditional talent shows what it would add when its assumption holds; scoped, proc, throughput and gear effects are listed and never added. Units differ between rows, so sorting by maximum or by change compares like with like only within one stat; values that are Unavailable or not added sort last." }),
        scroller("Stat impact by talent, scrollable table", impactTable));
      // (i) All classes for one race, sortable.
      if (!Object.hasOwn(model.naked.races, state.allRace)) state.allRace = state.race;
      const allRace = el("select", { "aria-label": "Race for the all-classes table", onchange() { state.allRace = allRace.value; paintClasses(); } },
        Object.entries(model.naked.races).map(([id, race]) => el("option", { value: id, text: race.name })));
      allRace.value = state.allRace;
      views.classSort = sorter("classes", orderClasses);
      const classTableNode = el("table", { class: "data s60-classes" });
      views.classCaption = el("caption"); views.classBody = el("tbody");
      classTableNode.append(views.classCaption, el("thead", null, el("tr", null, views.classSort.head("class", "Class"), CLASS_COLUMNS.map(col => views.classSort.head(col.id, col.label)))), views.classBody);
      root.append(el("h3", { text: "All classes" }),
        el("p", { class: "s60-small", text: "One naked level-60 character of every class for the chosen race: no talents, no gear and no assumptions; the race's applied racial traits are included, as in the sheet's Total column with no talents. Base attributes are Classic references (E) or estimates derived from them (D), and Skyborne has none (Unavailable). Parry 0% means the class cannot parry and block 0% means no shield is equipped (Classic references); n/a means the class has no such value. Disputed values sort by their lowest candidate. " + honesty }),
        el("div", { class: "s60-controls" }, el("label", { class: "s60-field" }, el("span", { text: "Race for the all-classes table" }), allRace)),
        scroller("All classes, scrollable table", classTableNode));
    }
    function paintViews(result, fixed) {
      const views = ui.views, key = result.race + "|" + JSON.stringify(result.toggles);
      if (views && views.key !== key) {
        try {
          const comparison = specComparison(model, { className: result.className, race: result.race, toggles: result.toggles, guides: ui.guides }), none = comparison.none;
          const impact = impactRows(model, { className: result.className, race: result.race, toggles: result.toggles });
          const where = "Level 60 " + result.raceLabel + " " + result.classLabel + (result.assumptions.length ? " with your hypothetical assumptions" : ", no gear, nothing active");
          views.specCaption.textContent = where + ": each tree's stat talents at maximum rank (an upper bound only, not a recommended or checked build) beside the checked guide builds; brackets show the change against no talents.";
          for (const [id, ref] of views.specRows) views.specColumns.forEach((column, i) => {
            const outcome = column.kind === "none" ? none : column.kind === "tree" ? comparison.trees[column.tree.index].outcome : fixed.get(column.id);
            if (!outcome) { setCell(ref.cells[i], { text: "Unavailable", grade: "U" }, ""); return; }
            if (column.kind === "none") { setCell(ref.cells[i], cellText(none.sheets.total[id], ref.spec), ""); return; }
            const shown = compareText(outcome.sheets.total[id], none.sheets.total[id], ref.spec);
            // A change in modifier terms under an Unavailable total keeps its own grade, named in the cell note.
            setCell(ref.cells[i], shown, shown.grade === "U" && shown.change.grade && shown.change.grade !== "U" ? "Change in modifier terms: grade " + shown.change.grade : "");
          });
          for (const t of views.trees) {
            const rows = impact.rows.filter(r => r.treeIndex === t.tree.index).sort((a, b) => a.index - b.index);
            t.body.replaceChildren(...rows.map(r => el("tr", { "data-component": r.id }, el("th", { scope: "row" }, el("span", { class: "s60-row-label", text: r.name }), el("span", { class: "s60-row-note", text: r.maxRank + (r.maxRank === 1 ? " rank" : " ranks") })),
              el("td", { "data-label": "Needs", text: needsText(r) }), el("td", { "data-label": "Stat", text: r.stat }), el("td", { "data-label": "Kind", text: r.kind }),
              el("td", { "data-label": "Per rank", text: r.perRank }), el("td", { "data-label": "At maximum rank", text: maxText(r) }), gradeCell(r.grade, "Data grade"))));
          }
          views.impactCaption.textContent = where + ": " + count(impact.rows.length, "stat component", "stat components") + " in " + count(new Set(impact.rows.map(r => r.talentId)).size, "talent", "talents") + ", each at maximum rank and alone.";
          views.impact = impact.rows.map(r => ({ row: r, tr: el("tr", { "data-component": r.id }, el("th", { scope: "row", text: r.name }), el("td", { "data-label": "Tree", text: r.tree }),
            el("td", { "data-label": "Stat", text: r.stat }), el("td", { class: "wrap", "data-label": "Kind", text: r.kind }), el("td", { "data-label": "Per rank", text: r.perRank }),
            el("td", { class: "wrap", "data-label": "At maximum rank", text: maxText(r) }), changeCell(r), gradeCell(r.grade, "Data grade")) }));
          orderImpact();
          views.key = key;
        } catch (error) { views.key = ""; report(publicMessage(error, "The spec, talent and class comparisons could not be computed.")); }
      }
      paintClasses();
    }
    function orderImpact() { const views = ui && ui.views; if (views) views.impactBody.replaceChildren(...views.impactSort.order(views.impact, (item, key) => impactSortValue(item.row, key)).map(item => item.tr)); }
    function paintClasses() {
      const views = ui && ui.views;
      if (!views || views.classKey === state.allRace) return;
      try {
        const table = classTable(model, state.allRace);
        // The data's race and base notes, each once, stay with the table whatever the sheet's own race and the sort order.
        const notes = [...new Set([table.note, ...table.rows.map(r => r.note)].filter(Boolean))];
        views.classCaption.textContent = "Level 60 " + table.raceLabel + ", every class: no talents, no gear, no assumptions." + notes.map(n => " " + n).join("");
        views.classes = table.rows.map(row => {
          if (!row.available) return { row, tr: el("tr", { "data-class": row.className }, el("th", { scope: "row", text: row.label }), el("td", { colspan: String(CLASS_COLUMNS.length), "data-label": "Availability", text: "Not available for this race" })) };
          const cells = CLASS_COLUMNS.map(col => {
            const entry = row.cells[col.id], ref = valueCell(col.label, entry && entry.cell.cands ? "wrap" : "");
            setCell(ref, entry ? cellText(entry.cell, entry.spec) : { text: "n/a", grade: null }, "");
            return ref.td;
          });
          return { row, tr: el("tr", { "data-class": row.className }, el("th", { scope: "row" }, el("span", { class: "s60-row-label", text: row.label }), el("span", { class: "s60-row-note", text: GRADE_NOTE[row.grade] || "" })), cells) };
        });
        views.classKey = state.allRace;
        orderClasses();
      } catch (error) { views.classKey = ""; report(publicMessage(error, "The all-classes table could not be computed.")); }
    }
    function orderClasses() { const views = ui && ui.views; if (views) views.classBody.replaceChildren(...views.classSort.order(views.classes, (item, key) => classSortValue(item.row, key)).map(item => item.tr)); }
    return {
      ready,
      update(next) { if (dead || !next) return; build = next; if (model && !(ui && ui.className === next.className && buildKey(next) === shownBuild)) render(); },
      destroy() { if (dead) return; dead = true; if (typeof root.remove === "function") root.remove(); else if (root.parentNode) root.parentNode.removeChild(root); }
    };
  }
  return Object.freeze({ urls: Object.freeze({ naked: NAKED_URL, effects: EFFECTS_URL }), sha256, validateNaked, validateEffects, prepare, combosFor, evaluate, conditionText, modifierText, format: fmt, weakest,
    pointsAt60: POINTS_AT_60, treeRequirement, specOverview, specComparison, impactRows, classTable, classColumns: CLASS_COLUMNS, classSortValue, impactSortValue, sortRows, cellText, deltaText, compareText, mount });
});
