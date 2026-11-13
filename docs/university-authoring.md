# Olympus University: authoring guide

Olympus University is the course hub at `#/guides`. Every class, spec, race and profession has a 101, 201 and 301 track. Every chapter pairs **Theory** (graded, sourced facts) with **Praxis** (concrete steps, plus common mistakes and their fixes). Chapters end in quizzes, and each track ends in a mastery exam. This guide is for the people who write the remaining courses. It covers the file formats, the rules the validator enforces, a worked example, the commands, and the sources you may use.

The owner's directive is Pillar 3 item 3 (the course structure) and Pillar 2 item 1 (the section template) of the 12 November 2026 directive. The exemplars are `courses/warrior.json` (class), `races/human.json` (race) and `professions/alchemy.json` (profession). Read one of them before you start.

## 1. The honesty rule

Nothing is invented. A course says only what the site already holds with a grade and a source:

- the facts in `facts/*.json`, which were migrated from the .218 guides (`guides218.json`) with their grades and sources;
- the talent calculator's data (`talents/data.json`, the 10 November 2026 export), as generated grade-A facts in `facts/talents-<class>.json`;
- the Blizzard notes the site already cites (sources `g218-0`, `g218-1`, `g218-49`, `g218-50`, `g218-150` and the other `official` entries in `sources.json`);
- Classic 1.12 reference facts already present and marked as Classic (grades D and E).

Where the directive asks for something no reviewed fact supports yet, the chapter exists, says plainly what is missing and why, and carries no quiz question. Typical examples are exact Forever coefficients, measured hit, crit or defense caps, boss-by-boss execution before the raids open on 9 December 2026, per-spec gear tables and leveling routes. A 301 track that is honest and short is correct. A padded one is a defect.

You may restate an existing claim as one statement per fact, which is how `facts/common.json` was made. You may not add a number, a name or a mechanic that no cited fact holds, and you may not add a new external source. A new source needs a review of its own: raise it with the lane owner.

## 2. Files

Everything lives in `worker/public/static/university/`. The folder is member-gated like every `/static/` file: anonymous visitors get 401.

| Path | What it holds | Who edits it |
|---|---|---|
| `index.json` | The hub: one entry per guide, the grade texts and the one-line scope note | You change your guide's `status` (and `file` for a race) |
| `sources.json` | Every source a fact may cite. `g218-<n>` is source *n* of `guides218.json`; `talents-data` is the calculator's data | Nobody, without a source review |
| `facts/common.json` | Facts that more than one guide cites, such as the racials | Add a fact only when two guides need it |
| `facts/class-<class>.json`, `facts/profession-<key>.json` | Facts migrated from the .218 guides, plus your own restatements | The author of that guide |
| `facts/race-<race>.json` | Race-specific facts, if a race needs any beyond `common.json` | The author of that race |
| `facts/talents-<class>.json` | Generated talent facts (grade A). **Do not edit** | `scripts/university/generate-talent-facts.cjs` |
| `courses/<class>.json`, `races/<race>.json`, `professions/<key>.json` | The guide: overview, tracks, chapters | The author of that guide |
| `quizzes/class-<class>.json`, `quizzes/race-<race>.json`, `quizzes/profession-<key>.json` | Hand-written questions | The author of that guide |
| `quizzes/talents-<class>.json` | Generated talent questions. **Do not edit** | `scripts/university/generate-talent-facts.cjs` |
| `presets/<class>.json` | Copies of the talent presets in `guides218.json`. **Do not edit** | `scripts/university/migrate-guides218.cjs --presets` |
| `validate.js` | The rules the page and the build share | Lane owner |
| `university.js`, `university.css` | The renderer | Lane owner |

The build check, the generator, the one-shot migration and its map are not in this folder: they live in `scripts/university/` at the repository root, so the site never serves them (12 November 2026). Only the lane owner edits them.

`scripts/university/migration-map.json` records where each `guides218.json` entry went. Use it to find the facts that came from your guide's old page.

## 3. Formats

All files are UTF-8 JSON. Text fields have no leading or trailing spaces. Ids are lower case.

### 3.1 Fact (`facts/<file>.json`)

```json
{ "schema": "olympus-university-facts-v1", "file": "class-warrior", "facts": [
  { "id": "class-warrior.slam", "scope": { "class": "warrior", "spec": "arms" }, "topic": "arms-priority",
    "kind": "theory", "grade": "B", "label": "Slam",
    "value": "The base cooldown is 15 seconds. Improved Slam cuts it by 2.5 or 5 seconds, ...",
    "sources": ["g218-0", "g218-1", "g218-150"], "reviewedAt": "2026-11-04", "gameBuild": "WoW: Forever (launch 4 Nov 2026)" }
] }
```

| Field | Rule |
|---|---|
| `id` | Starts with the file name and a dot (`class-warrior.`). Unique across every fact file |
| `scope` | Any of `class`, `spec`, `race`, `profession`, as ids |
| `topic` | A lower-case key. Facts with the same topic are **siblings**: the validator lets a question draw its wrong answers from them. Give comparable values the same topic (all racial bonuses are `racial-bonus`; Alchemy's skill thresholds are `profession-skill-threshold`) |
| `kind` | `theory`, `praxis` or `reference` |
| `grade` | `A` talent data (10 Nov export), `B` official Blizzard text, `C` published Forever guide or community source, `D` derived from a Classic reference, `E` Classic reference, `U` unavailable |
| `label` | Up to 160 characters |
| `value` | Up to 700 characters; `null` exactly when the grade is `U` |
| `note` | Optional, up to 400 characters. The note counts as part of the fact when the validator looks for a number or phrase |
| `sources` | 1 to 12 ids from `sources.json` (0 allowed for grade U) |
| `reviewedAt`, `gameBuild` | The day you checked it and the build or notes it describes |
| `recheck` | Set by the migration on every grade-A claim checked against the 16 October talent data. A re-check fact is shown with a "Needs re-check" note, **cannot be quizzed** and cannot appear in a complete guide. Re-check it against the 10 November data (`talents/data.json`), then either remove `recheck`, set `sources` to `["talents-data"]`, add `talent` or `tree`, and set `gameBuild` to `1.60.1.70755 (talent data 02e1e101d1a5, 2026-11-10)`, or rewrite the value to what the data now says |
| `supersededBy` | Optional: the id of a current fact (usually grade B) that a newer source gives instead, with a `note` saying what changed. `scripts/university/generate-talent-facts.cjs` sets it on talent facts whose 10 November text is older than Blizzard's 2 November notes (its `SUPERSEDED` list: Mental Dexterity and Stormstrike). Wherever such a fact is cited (theory, a step, a mistake, an overview point or a question), the fact that supersedes it must be cited beside it, and no value question is generated for it |
| `talent` / `tree` | For grade A: the talent id (or the `class-tree` id) in `talents/data.json`. The build checks that every number in the value occurs in that talent's current rank text or cost |

Grade D and E facts must say they are Classic references in the label, value, note or `gameBuild`.

### 3.2 Guide (`courses/<class>.json`, `races/<race>.json`, `professions/<key>.json`)

```json
{ "schema": "olympus-university-guide-v1", "kind": "class", "id": "warrior", "name": "Warrior", "status": "complete",
  "reviewedAt": "2026-11-12", "factFiles": ["common", "class-warrior", "talents-warrior"], "quizFiles": ["class-warrior", "talents-warrior"],
  "overview": { "lead": "...", "points": [{ "text": "...", "facts": ["common.racial-human-ruthless"] }], "facts": ["class-warrior.change-1"] },
  "heldBack": [{ "from": "classes[0].specs[1].beginner.leveling[1]", "text": "...", "reason": "No reviewed fact holds either level." }],
  "tracks": { "101": { ... }, "201": { ... }, "301": { ... } },
  "specs": [{ "id": "arms", "name": "Arms", "roles": ["melee"], "overview": { ... }, "tracks": { ... } }] }
```

- `kind` is `class`, `race` or `profession`. A profession adds `"type": "primary" | "gathering" | "secondary"` and may add `pairsWith` (up to 3 profession keys). A class has exactly three `specs`.
- `status` is `migrated` (carried over, still being written) or `complete`. Only a complete guide has to meet the chapter rules in 3.4.
- `factFiles` and `quizFiles` list every file the page may load. A fact or question in a file not listed here does not exist for this guide.
- `heldBack` keeps old lines a rewrite could not carry because no reviewed fact holds them. It is never shown. Use it instead of deleting.

A track is:

```json
{ "summary": "One sentence.", "chapters": [ ... ], "omitted": [{ "section": "macros", "reason": "No Warrior macro has been checked in Forever yet." }] }
```

The sections, in the directive's order, are `overview`, `talents`, `rotation`, `stat-caps`, `gear`, `consumables`, `macros` and `praxis` (PvP and raid praxis). The mastery exam closes every track by itself. Every section must be covered by at least one chapter or listed once in `omitted` with a short reason. Chapters must appear in section order.

- Use **`omitted`** when the section does not apply ("Professions have no talent tree.") or is covered elsewhere ("Covered in 201.").
- Use an **unavailable chapter** when the directive asks for the content and the facts do not exist yet (see 3.3).

### 3.3 Chapter

```json
{ "id": "warrior-arms-101-rotation", "section": "rotation", "title": "Core rotation",
  "theory": ["talents-warrior.arms-mortal-strike.r1", "class-warrior.bloodthrill", "class-warrior.slam"],
  "praxis": {
    "steps": [{ "text": "Fit Slam in while Mortal Strike cools down. Its base cooldown is 15 seconds, ...", "facts": ["class-warrior.slam"] }],
    "mistakes": [{ "mistake": "Letting Rend fall off the target.", "fix": "Bloodthrill only gives Overpower chances against your Rend target, so keep Rend up.", "facts": ["class-warrior.bloodthrill"] }] },
  "presets": ["warrior-arms-leveling-30"] }
```

An unavailable chapter has no praxis, presets, macros or quiz:

```json
{ "id": "warrior-arms-301-bosses", "section": "praxis", "title": "Boss-by-boss execution", "theory": ["class-warrior.launch-raids"],
  "unavailable": "Barrow Deeps, Hyjal Summit and Onyxia's Lair open on 9 December 2026. Boss-by-boss execution is written from the first reviewed logs after that." }
```

- Chapter ids are unique across all guides: use `<guide>-<spec>-<tier>-<topic>`.
- `presets` (classes only) name presets of that class from `presets/<class>.json`.
- `macros` (optional) is a list of `{ "name", "body", "grade": "B" | "C", "facts": [...] }`. The owner's 5 November ruling keeps custom scripts disabled in the game client, so a body may use only `#showtooltip`, `/cast`, `/castsequence`, `/use`, `/target`, `/targetenemy`, `/focus`, `/assist`, `/stopattack`, `/startattack`, `/stopcasting`, `/equip`, `/petattack` and `/petfollow`, with `[mod:]`, `[@focus]`-style conditionals. `/run`, `/script` and `/console` are refused. Only add a macro that a cited fact shows working in Forever; there is none yet.
- `noQuiz` (optional) is a reason, for an available chapter whose facts cannot carry a fair question.

### 3.4 What a complete guide needs

For every available chapter of a `complete` guide:

1. at least one theory fact, none of them marked `recheck`;
2. at least three praxis steps in 101, at least one in 201 and 301;
3. at least one mistake with its fix, each citing one to six facts;
4. at least one quiz question in the chapter, unless it has a `noQuiz` reason.

Every overview point of a `complete` guide cites at least one fact, like a step. Do not repeat a partner profession or a scope note as a point: the page shows `pairsWith` and the index's scope note itself.

Every number written in a step, a mistake, a fix or an overview point must occur in a fact that line cites (the version label "Classic 1.12" is not counted as a number). A step with no number may cite nothing, but cite the fact whenever the step states a game mechanic. Steps and mistakes may not cite grade-U or re-check facts.

### 3.5 Question (`quizzes/<file>.json`)

```json
{ "schema": "olympus-university-quiz-v1", "file": "race-human", "questions": [
  { "id": "race-human.ruthless", "scope": "race:human", "tier": 101, "chapter": "human-101-racials", "type": "mcq",
    "stem": "What does the Human racial Ruthless give in Forever?",
    "choices": ["+1% crit", "+1% hit", "+2% haste"], "answer": 0,
    "explanation": "Ruthless gives +1% crit since Blizzard cut it from 2% on 26 October. ...",
    "facts": ["common.racial-human-ruthless"],
    "distractorFacts": ["common.racial-dwarf-artisans-precision", "common.racial-skyborne-wind-blessed"] } ] }
```

| Field | Rule |
|---|---|
| `id` | Starts with the file name and a dot |
| `scope` | `class:<class>`, `spec:<class>-<spec>`, `race:<race>` or `profession:<key>` |
| `tier`, `chapter` | The chapter must exist in that scope and tier and must be available |
| `type` | `mcq` or `scenario` (a short situation, then the question) |
| `choices`, `answer` | 2 to 5 distinct choices; `answer` is the index of the right one. Write the right one first: the page orders them per attempt with a fixed hash (`validate.js` `order()`: FNV-1a over the attempt and the id, then a 32-bit finaliser), so each attempt is repeatable and a new attempt brings a new order and, in exams and chapter quizzes, a new set of questions |
| `facts` | 1 to 6 cited facts: no grade U, no re-check |
| `distractorFacts` | Optional sibling facts (same `topic` as a cited fact, not cited themselves) that hold the wrong answers |
| `explanation` | Says why the answer is right, and where useful what the wrong choices are |

The validator refuses a question when:

- **the answer is not a phrase of a cited fact.** The choice must appear, as written, in the label, value or note of a cited fact. Case, curly quotes, dashes and thousands separators are ignored, and whole words and numbers are matched: `3%` matches "by 3%." but not "by 13%";
- **a wrong choice is not a phrase of a cited fact or a sibling fact.** Wrong answers are other values of the same kind (another rank, another racial, another threshold), never freehand;
- it cites a grade-U fact or a fact marked for re-check;
- it cites a grade D or E fact and the stem does not start with `In Classic 1.12`;
- its chapter is unavailable, or does not exist in that scope and tier.

Talent questions (prerequisites, rank counts and rank values) are generated. Do not write them by hand: see 5.2.

## 4. Worked example

Goal: a 101 chapter on Human racials with one quiz question, from facts the site already held.

1. **Find the facts.** `guides218.json` held, as a grade-B claim from the 26 October notes on the Warrior Arms page, "Dwarf Artisan's Precision: +1% hit with spells and attacks. Human Ruthless: +1% crit (cut from 2% on 26 Oct)." (source 1), and on the Holy Priest page "Human Spirit racial: +10% Spirit in the 26 Oct notes" (source 50). Both are used by more than one guide, so each becomes one statement in `facts/common.json`, citing the same sources, with the shared topic `racial-bonus`:

   ```json
   { "id": "common.racial-human-ruthless", "scope": { "race": "human" }, "topic": "racial-bonus", "kind": "theory", "grade": "B",
     "label": "Human racial: Ruthless", "value": "Human Ruthless: +1% crit (cut from 2% on 26 Oct).", "sources": ["g218-1"],
     "reviewedAt": "2026-11-12", "gameBuild": "WoW: Forever (Blizzard notes of 26 Oct 2026)" }
   ```

2. **Write the chapter** in `races/human.json`, track 101, section `overview`:

   ```json
   { "id": "human-101-racials", "section": "overview", "title": "Human racials in Forever",
     "theory": ["common.racial-human-ruthless", "common.racial-human-spirit", "common.racial-weapon-skill"],
     "praxis": { "steps": [
       { "text": "Count +1% crit from Ruthless. The 2% in older guides is out of date since 26 October.", "facts": ["common.racial-human-ruthless"] },
       { "text": "Count +10% Spirit from the Human Spirit racial.", "facts": ["common.racial-human-spirit"] },
       { "text": "Leave weapon skill out of your plans: no racial grants it in Forever.", "facts": ["common.racial-weapon-skill"] } ],
       "mistakes": [{ "mistake": "Using a guide written before 26 October that gives Ruthless 2% crit.",
         "fix": "Ruthless is +1% crit since the 26 October notes.", "facts": ["common.racial-human-ruthless"] }] } }
   ```

   Every number in the steps (1, 2, 26, 10) is in a cited fact, so the step check passes.

3. **Write the question** in `quizzes/race-human.json` (shown in 3.5). `+1% crit` is a phrase of the Ruthless fact. `+1% hit` and `+2% haste` are phrases of the Dwarf and Skyborne facts, which share the topic `racial-bonus`, so they are fair wrong answers.

4. **Say what is missing.** The site has no reviewed fact on Human racials in PvP, so the 101 track carries an unavailable chapter ("The site holds no reviewed fact on what Human racials do in PvP ... This chapter waits for one.") and no question. The 201 and 301 tracks have no chapters; each section is omitted with the reason that no further reviewed Human fact exists.

5. **Run the build check** (section 5) and fix what it reports.

## 5. Commands

Run from the repository root with Node 24.

```bash
node scripts/university/validate.cjs          # everything; prints a size table
node scripts/university/validate.cjs --quiet  # errors only
node scripts/university/validate.cjs --write-exams  # rewrite index.json's exam lists and chapter counts
cd worker && node tests/evergreen1112_guides_test.cjs            # the lane test: rules, renderer, routes, privacy
```

`scripts/university/validate.cjs` runs the page's own rules over every file at once (ids, the honesty rules, the chapter rules), then once per guide with only the files that guide lists, as the page loads them. It also checks the talent facts against `talents/data.json`, the presets against `guides218.json`, the generated files against their generator, and that every file is listed in `index.json`. It fails when `index.json`'s exam lists or chapter counts (the hub's "N chapters are written" line) are stale: after adding or changing chapters or questions, run it with `--write-exams`. A guide the page cannot validate is not shown at all, so never commit with an error.

### 5.1 Promote a guide

When every chapter of your guide meets 3.4, set `"status": "complete"` in both the guide file and its `index.json` entry. For a new race, also set the entry's `file`, for example `"races/dwarf.json"`.

### 5.2 Talent facts and talent questions

```bash
node scripts/university/generate-talent-facts.cjs          # write facts/talents-*.json and quizzes/talents-*.json
node scripts/university/generate-talent-facts.cjs --check  # fails if they are out of date
```

The generator writes grade-A facts for every talent of all nine classes: a shape fact (`talents-<class>.<tree>-<talent>`, with rank count, row, column, prerequisite and cost) and one fact per rank (`... .r1`, `.r2`, ...), plus a tree summary (`talents-<class>.<tree>-summary`). Cite them directly as theory.

Questions are generated only for the classes in `QUIZ_CLASSES` at the top of the script. To add yours: give each spec a 101 chapter `<class>-<spec>-101-talents` and a 201 chapter `<class>-<spec>-201-talents` (section `talents`), add the class to `QUIZ_CLASSES`, run the script, add `talents-<class>` to your guide's `quizFiles`, and commit the script change with its output.

### 5.3 Presets

Presets belong to the talents lane and live in `guides218.json`. After any preset change there, run `node scripts/university/migrate-guides218.cjs --presets`. Never edit `presets/*.json` by hand. The migration itself was a one-shot and never overwrites a guide or fact file.

## 6. Sources you may use

Only ids in `sources.json`:

- **`talents-data`**: the calculator's `talents/data.json` (Talents Forever export of 10 Nov 2026, client 1.60.1.70755 with server hotfixes, CC BY 4.0). Grade A, through the generated talent facts.
- **Blizzard official** (`kind: "official"`), such as `g218-0` (Warrior deep dive), `g218-1` (Beta Development Notes, 24 Sep to 27 Oct), `g218-2` (raid overview), `g218-49` and `g218-50` (16 and 26 Oct notes) and `g218-150` (development notes updated 2 November). Grade B.
- **Published Forever guides and community sources** (`forever-guide`, `community`, and `licensed-data` other than `talents-data`): Warcraft Tavern, Icy Veins, Method, Wowhead, Talents Forever pages. Grade C.
- **Classic references** (`classic-baseline`), including the Classic Era 1.15.9.69722 client tables. Grade D or E, and only behind "In Classic 1.12" in a question.

Things you may **not** use: a source not in `sources.json`, your own memory of Classic or Forever, beta datamines not already cited, numbers from videos, logs or sims that the site has not reviewed, and anything that names a private person. External news links are retired (1 November policy); do not add one.

## 7. Style

Write as a careful human editor: plain, specific, one statement per fact, no repeated disclaimers, no filler, no build numbers or environment flags in member-facing text. Say "Forever" for the live game and "Classic 1.12" for the reference. Use the directive's rank ladder in any guild text. A gold note ends with "subject to Blizzard policy". Never write GDKP content.

## 8. Scopes still to write

| Scope | Edit | Create |
|---|---|---|
| Druid, Hunter, Mage, Paladin, Priest, Rogue, Shaman, Warlock (8 classes, 24 specs) | `courses/<class>.json`, `facts/class-<class>.json` (re-check every grade-A fact), `scripts/university/generate-talent-facts.cjs` (`QUIZ_CLASSES`), `index.json` status | `quizzes/class-<class>.json` (and the generated `quizzes/talents-<class>.json`) |
| Dwarf, Gnome, Night Elf, Skyborne (4 races) | `index.json` (file, status); `facts/common.json` if a racial is shared | `races/<race>.json`, `quizzes/race-<race>.json`, `facts/race-<race>.json` if needed |
| Blacksmithing, Enchanting, Engineering, Herbalism, Leatherworking, Mining, Skinning, Tailoring, Cooking, Fishing, First Aid (11 professions) | `professions/<key>.json`, `facts/profession-<key>.json`, `index.json` status | `quizzes/profession-<key>.json` |
