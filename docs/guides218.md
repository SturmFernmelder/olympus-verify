# Olympus guides and tools (.218)

The site's own class, spec and profession guides and three raid-preparation tools. They live at `#/resources` (the hub),
`#/guides/class/<class>[/<spec>]`, `#/guides/profession/<key>` and `#/guides/tools/<attunements|buffs|changes>`. `#/guides`
itself is unchanged: it is still the reviewed publisher library (`resources169`).

## Files
- `worker/public/static/guides218.js`: the renderer (`window.OlympusGuides.mount(box, options)`). It validates the whole catalogue
  before drawing anything and refuses it as a whole when any field is out of shape. It builds the page with `createElement`
  and `textContent` only: no HTML strings, inline styles, storage, eval or randomness.
- `worker/public/static/guides218.css`: scoped `.guides218-*` styles, no `url()`, reduced-motion and forced-colors rules,
  restacking at 560 px.
- `worker/public/static/guides218.json`: the catalogue, member-gated like every `/static` file. It is generated, never edited by
  hand (see Authoring).

## Honesty rules
Every fact carries a grade, and the page explains the grades once:

| Grade | Meaning |
|---|---|
| A | Exact client data from the pinned talent snapshot (1.60.1.70425) |
| B | Official Blizzard announcement, notes or developer Q&A for Forever |
| C | Published Forever guide or community source |
| D | Derived estimate from Classic reference — not Forever-verified |
| E | Classic reference — not Forever-verified |
| U | Unavailable (shown as "Unavailable", never 0 or a guess) |

- Classic numbers are never presented as Forever facts.
- Presets are "starting points", never "best", "optimal" or "BiS".
- There is no GDKP content. Every profession gold note ends with "subject to Blizzard policy".
- The prose is original Olympus writing. Sources are linked on an allow-listed set of hosts.

## Presets, "Load" and "Attach"
- Every preset is computed from authored talent ranks with the calculator's own rules: talent order, tier gating, requirements
  and the full point budget at level 30 or 60. `guides218_test.cjs` checks that each code parses in `calculator.js`, validates
  at its level and is accepted unchanged by `talentBuildAttachment`.
- "Load this build in the talent calculator" is a plain link to `#/talents/<class>/<code>`.
- "Attach to my application" only carries the build into the open application form. It fills the main character's level 30
  or 60 slot, sets the class only when none was chosen, marks the form unsaved and says nothing has been sent. It never saves,
  never ticks the confirmation and never changes board sharing. Applicants review and save as usual. A pending attachment
  lives in page memory for five minutes and is used once.

## Authoring
The catalogue is built from schema-checked authoring files in `perfection-2026-10-31/claude/l2/`:
`SCHEMA.md`, `validate_content.py` and `build_guides.py`. Each authoring file was written from the dated research record and
then adversarially checked for grounding, grades, policy and originality. The talent-change counts come from `talents/data.json`
itself.

## Tests
- `worker/tests/guides218_test.cjs`: source policy, closed validation and refusals, preset round trips, talent-count parity,
  every view, attach shape and disabled state, "Unavailable" rendering, failure and teardown.
- `worker/tests/frontend218_guides_test.cjs`: the real page script and Worker, covering the Resources entry, hub and sub-route
  mounts, titles, the unchanged publisher library, and the attach prefill with zero application writes.
