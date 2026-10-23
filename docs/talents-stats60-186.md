# Level-60 character sheet (.193)

Ships with Worker .193. The work was first prepared as .186 on the .185 PR head (a314ad12) and then as .189 on the
local .188 candidate (0d0f9723); it was never released under either number, because .187 and .191 shipped in between
and .192 took the next number. This file, the data files (`naked60-186.json`, `stat-effects186.json`) and the test file
keep their .186 names; the data bytes are unchanged, and `stats60.js` changes only in one chart comparison fixed in
.193 review.

The owner asked for "a level 60 character of that class with no gear and basic stats and how these talents would
impact all their stats", with tables, charts and comparisons for every class and spec. The talent calculator now has
an optional, collapsed **Level-60 character sheet** section. It is an original Olympus module
(`worker/public/static/talents/stats60.js`) that reads two reviewed data files. It changes no account, guild, role,
privacy, launch or production setting.

## What is exact and what is not

WoW Forever does not publish level-60 base attributes, base health or base mana. They live on the server; the client
DB2 tables carry none of them, and no public Forever table exists (research F1, confirmed by an independent
verification). The sheet therefore never presents a Forever total as verified. Every number carries a grade:

| Grade | Meaning | Display |
|---|---|---|
| A | Exact from current-build client data (DB2) | normal |
| B | DB2 value with a semantic reading (for example aura type) | normal |
| C | Rule confirmed by a WoW Forever guide (Warcraft Tavern Forever stats guide) | normal |
| D | Estimate derived from Classic-reference data | greyed, "Derived estimate from Classic reference — not Forever-verified" |
| E | Classic-era reference (CMaNGOS), not Forever-verified | greyed, "Classic reference — not Forever-verified" |
| U | Unknown | the word "Unavailable", never 0 |

A computed value takes the weakest grade of its inputs (A > B > C > E > D > U). A delta that is a pure addition of one
exact talent or racial modifier keeps that modifier's grade (for example Precision +3 hit is A, Ruthless +2 crit is B);
a delta that passes through a Classic base (for example +7 Intellect from Divine Intellect) is E. WoW Forever stacking
is unverified, so a value that combines two or more talents or racial traits assumes the Classic rule (percentages
multiply, percentage points and flat bonuses add), is graded E at best and says so (`naked60-186.json`
`evaluation.stacking`). A row that a talent turns Unavailable shows "Unavailable" in the talent column and the chart; a
row that no talent changes while its totals are Unavailable shows "no talent change" without a grade, never an exact 0.
When both totals are Unavailable, the chart compares the talent modifiers by key, kind and value, and the touched keys
both rows share by talent rank (.193): a rank change on the same modifier shows in modifier terms (Heart of the Wild
4/5 against 3/5 on a Skyborne Druid: Intellect +1.9% (modifier)), and a row it reaches only through another total
(Mana, Spell crit) shows Unavailable.

- Talent modifiers: 141 components in 130 talents (tiers A 63, B 34, C 10, M 34), each equal to its Talents Forever rank
  text for client 1.60.1.70425. 135 also equal the client's TraitDefinitionEffectPoints and CurvePoint curves in
  1.60.1.70425 and 1.60.1.70450 (grade A). Six carry a semantic reading of client data (grade B): Anger Management,
  Lone Wolf, Leader of the Pack, the fixed Spirit Tap Spirit bonus and the added Spirit Tap casting regen are read from
  SpellEffect, and Careful Aim's ranged attack power is an exact curve whose stat is read from its aura (aura 580 occurs
  only on Careful Aim; aura 598, the melee attack power aura of Mental Dexterity and Cat Form, is its melee component).
  Each component pins the SHA-256 of every rank text; the browser re-hashes the shipped `data.json` texts and withholds
  any component whose text changed. Per-component caveats (for example Thick Hide's unmodelled defense-point armor and
  Surefooted's uncurved aura-55 spell hit effect) are shown with each contribution.
- Racial traits: SpellEffect 1.60.1.70450 (grade B). Dwarf Earth Fury has a SpellEquippedItems 1.60.1.70450 mace row
  (row 255482, mask 48), so a naked Dwarf gets none of it; server enforcement is unverified. Human Ruthless has no row.
- Base attributes: 40 race/class pairs use CMaNGOS `sql/base/mangos.sql` at commit 7f98ba0f (grade E). Six pairs that
  Classic did not have use a class-base plus race-offset fit to those rows (grade D, largest fit error Str 0, Agi 0,
  Sta 1, Int 2, Spi 2). The ten Skyborne pairs have no values at all (grade U).
- Classic stored attributes already include racial bonuses (CMaNGOS Player.cpp:2832), so percentage racial attribute
  traits such as The Human Spirit are listed but not applied again. For Gnomes the sheet also shows that Classic
  Intellect may be about 5% high for Forever, because Forever's Expansive Mind is +5% maximum mana, rage or energy;
  the all-classes table repeats that note in its caption whenever Gnome is its chosen race (.196).

HolyMinMax data from client 1.60.1.70009 (Champion of the Light 33/66/100 with healing, sword/mace racial crit) is
superseded in 70425/70450 and is not used.

## Formulas

`naked60-186.json` declares 21 formulas as data (`kind`, parameters, coefficients); nothing is evaluated from a string.

- Attributes: base × product of (1 + percent/100) of the applicable total-percent effects, left unrounded.
- Health: base health + min(Stamina, 20) + 10 per Stamina above 20, then health percentages, rounded (10 per Stamina is a
  Forever guide rule, C; base health and the rounding are E). Mana: base mana + min(Intellect, 20) + 15 per Intellect
  above 20, then mana percentages, rounded. Rage and energy: Classic maximum 100, flat talent bonuses first, then
  percentages, rounded (CMaNGOS order, assumed). A flat talent bonus is shown as its own exact value; when percentages
  and rounding change the sheet total differently (Gnome Vigor: +10 energy, sheet +11), that is a separate E line.
- Armor: 2 per Agility (C); item armor is 0 when naked, so Toughness adds 0.
- Melee attack power: DB2 stat slopes (B) with Classic level term and constant (E). Druid is disputed and each
  candidate keeps its own form rule: CMaNGOS uses 3 × level + 2 × Str − 20 in every form and adds no Predatory Strikes
  term (its SpellAuras.cpp only refreshes attack power); vmangos uses 2 × Str − 20 in caster form and level × the
  Predatory Strikes multiplier + 2 × Str − 20 in Cat and Bear Form. Cat Form adds 100% of Agility in both, read from
  Cat Form (Passive) client data (aura 598, grade B). A Tauren with Predatory Strikes 3/3 shows Bear 300 / 210 and Cat
  355 / 265, and the talent itself adds 0 (CMaNGOS) or +90 (vmangos).
- Ranged attack power: disputed for every class except Hunter (DB2 2 per Agility for Warrior/Rogue against 1 in the
  Forever guide and both emulators; DB2 0 against Classic Agility − 10 for the others). Hunter uses DB2 2 per Agility,
  plus Careful Aim's ranged component. Druid ranged attack power is 0 in Cat, Bear and Dire Bear Form (both emulators).
- Melee crit: Agility ÷ the class rate (C where the Forever guide states it, otherwise E) plus modifiers. The class base
  crit chance is unavailable and is not included; the row says so.
- Spell crit: disputed Classic candidates (CMaNGOS and warcraft.wiki.gg) are both shown; the Forever guide gives only a
  54–60 Intellect per 1% range. Warrior, Rogue and Hunter: Unavailable.
- Dodge: class base (E) + Agility ÷ rate (C) + 0.04% per defense point above 300 (E). Parry: 5% for classes that can parry
  (E). Block: needs a shield; classes without shield use show n/a. Hit: bonus over the 5%/3% base miss (C).
- Spirit mana regeneration and regeneration while casting: one Classic rule each, approximate.

## Talent tiers and conditions

- A (unconditional sheet stat) is added to the totals.
- B (form, weapon, shield, pet or self-buff) is listed as "applies only when …" and added only when the matching
  assumption is switched on. Assumptions are offered per class only where they change a sheet row: Druid form, Warrior
  and Rogue weapon type (only the weapon types their talents read), Warrior shield, Hunter Aspect of the Monkey,
  Warlock demon pet. Any gear assumption is labelled hypothetical; the gear's own stats are never included.
- School-, spell- or situation-scoped effects are listed and never summed into the general rows.
- C (procs) and M (damage, healing and critical-damage modifiers) are listed separately and never added.
- Shaman Spirit Weapons grants parry without a published value, so Shaman parry becomes Unavailable with that talent and
  the talent is listed with grade U.

## Interface

Race (only valid races for the class), assumptions, the sheet (Base, Racial, Talents, Total with grade badges), the
talent contributions list, an SVG diverging bar chart of the current build against no talents or a checked guide build
(two panels: percent change for attributes and resources, percentage points for chances) with an equivalent data table,
a spec comparison table (no talents, current build and each checked guide build of the class) and an "About these
numbers" disclosure. Charts use `createElementNS` and presentation attributes only; chart rows are not tab stops,
because the data table carries the same values. Tables restack below 560px so a 320px screen has no horizontal scroll
(the two .196 sortable tables scroll inside their own labelled region instead, so the page itself never scrolls
sideways).
The site CSP (`script-src 'self'`, `style-src 'self'`) is unchanged.

Loading is optional and independent: `app.js` passes a lazy `loadStats60` loader that is called only when the section
is opened, never on route entry, outside the optional analysis/guide pair. The loader follows the same settled rule as
that pair (Promise.allSettled, from the .188 work in .192): a script load error, or a script that loads without
defining its global, resolves to no module and loses its cache entry, so the next opening requests the script again. If
the script or either data file fails, the section names the sheet unavailable in an alert and the calculator keeps
working; closing and reopening the section retries. A collapsed sheet is not repainted on point edits and catches up
when it is opened again.

## Comparison views (.196, owner item 9b)

Three views follow the spec comparison inside the same section. They read only the talent snapshot and the two pinned
data files (no new request, asset or data), use the sheet's own evaluator and grades, and depend on the selected race
and assumptions only, so point edits never repaint them.

- **Compare specs** puts the three trees of the class side by side. A reachability table lists, per tree, its stat
  talents (every talent with a component in `stat-effects186.json`, plus Spirit Weapons, whose parry grant has no
  published value), their points at maximum rank, prerequisites outside that set, the extra points the tier rule needs
  and the minimum legal total under the calculator's rules (5 points per earlier row, prerequisites at maximum rank,
  51 points at level 60). Extra points go to the lowest open row first, which gives the minimum; every tree's
  allocation passes the calculator's own `validateBuild`, and all 27 trees are reachable in this snapshot. A second
  table shows each tree's **upper bound**: the selected race's level-60 sheet plus every stat talent of that tree at
  maximum rank. It is labelled as a bound on that tree's stat talents, not a recommended, checked or complete build (in
  the caption and the paragraph above it; each column keeps a short "Not a build" note so narrow columns stay
  readable); points in other trees are not counted. Checked guide builds stand beside the tree that holds most of their
  points (beside each tied tree on a tie), and a tree without one says so (Priest and Shaman have none); a guide build
  whose ranks cannot be evaluated reads Unavailable (U), never 0. Brackets show the change against no talents with the
  existing spec comparison rule; where a total is Unavailable the change stays in modifier terms and its own grade is
  named in the cell note. That is the rule of the sheet's Talents column and the existing spec comparison; the chart is
  narrower: for Health with both totals Unavailable it says Unavailable even when one percentage modifier changes Health
  directly (for example the Hunter Survival bound on a Skyborne race). A table per tree lists each stat talent's row and
  required points, prerequisite, stat, kind, per-rank values, maximum-rank value and data grade.
- **Stat impact by talent** (HolyMinMax style) lists every stat component of the class in all three trees, at maximum
  rank and on its own, with the change it makes on the selected race's sheet (the same isolated-effect rule and grades
  as the contributions list; modifier terms on Skyborne). Conditional talents show what they would add when their
  assumption holds; scoped, proc, throughput and gear effects are listed and never added. The table sorts by talent,
  tree, stat, kind, maximum-rank value, change (the talent's own row) or data grade; text sorts alphabetically in
  English, ignoring case. A data grade badge names the stat file's own grade legend (A: a DB2 trait curve equals the
  rank text; B: a semantic reading of client data), and Classic-reference parts of a change are greyed.
- **All classes** shows one naked level-60 character per class for a race chosen in its own control: no talents, no
  gear, no assumptions, with the race's applied racial traits (the sheet's Total column with no talents), 18 columns
  with grades, labelled like the sheet's rows (so melee crit is the Agility part and modifiers: Human Ruthless and Orc
  Savage are in it). A class the race cannot be reads "Not available for this race"; Skyborne values stay Unavailable
  with grade U. The caption repeats the data file's own race and base notes for the chosen race (Gnome: Classic
  Intellect may be about 5% high for Forever while Expansive Mind is applied to mana). Every column sorts; disputed
  values sort by their lowest candidate and missing values always sort last.

Honesty limits: nothing in these views was measured in WoW Forever (the views quote the data file's measurement
protocol status, "not started"); base values stay Classic references (E) or estimates (D) and are greyed; an upper
bound is not a build, a recommendation or a tuning claim, and talents in different trees can add more than any one
tree's bound. Sorting by maximum value or change compares like with like only within one stat. The two sortable tables
scroll sideways inside a labelled, keyboard-focusable region (native sort buttons in the column headers, `aria-sort`
on the active one); the other new tables restack below 560px like the sheet. The views reuse the sheet's classes and the
site's existing `table-wrap` and `table.data` styles; one line of `calculator.css`, scoped to `.talents-stats60`, keeps
the two sortable tables' captions in view while they scroll (sticky, as wide as the scroll region), pins their row
headers (class or talent name, with the header cell above them) and lets their column headers wrap, and greys
Classic-reference parts of a change.

## Files and gates

- `worker/public/static/talents/stats60.js` (runtime), `naked60-186.json` and `stat-effects186.json` (data) are three
  exact non-art required public resources (43 in total, 555 public paths). `stats60.js` is a reviewed runtime path.
- The data files were produced by the stdlib-only generator `gen_stats60.py` (`--generated-at 2026-10-21T19:46:00Z`
  reproduces the pinned bytes from hash-listed copies of every input) and checked by the independent `check_stats60.py`
  (66/66). Both stay with the release evidence outside the repository; the public files carry every DB2 export hash
  they use.
- Tests: `worker/tests/talents_stats60_186_test.cjs` (data validation against an independent Classic fixture, worked
  examples, conditional exclusion, optional loading and retry, CSP rules, DOM rendering, chart comparisons with
  Unavailable totals, and the .196 views: tree reachability against the calculator's rules, upper bounds and grades,
  the all-classes table, per-talent impact, sorting, accessible table markup and unchanged loading);
  `worker/tests/frontend169_test.cjs` (lazy loading from the talent route and the settled retry of a failed or silent
  `stats60.js`).

## Measurement protocol

Only in-game measurement can replace the Classic references. Volunteers (owner or members, never agents) with a level-60
character remove every item including weapons and ammunition, cancel all buffs, leave all talent points unspent, stay in
caster form and out of combat, and read the character panel: base and effective attributes, maximum health and power,
armor, melee and ranged attack power, all crit values, dodge, parry, block, defense and mana regeneration. Useful extra
checks: a Druid in caster, Cat and Bear Form with and without Predatory Strikes; a Dwarf with and without a mace; two
Agility and two Intellect values per class; level-1 characters of every race including Skyborne; Warrior and Rogue
ranged attack power at two Agility values. Each volunteer consents first; screenshots are cropped to the stat panel (no
name, realm, guild or chat), stay private, and only the numbers are entered by hand. A measured value would replace the
lower grade for that pair and field with grade A, build and date.

## Limits

Not live tuning; not a simulator. No rotation DPS/HPS, survival, threat, proc uptime, pet stats or gear. The Forever
stacking order and rounding (the Classic rules are assumed and graded E), unified crit composition, combat-rating level
and Spirit regeneration remain open questions.
