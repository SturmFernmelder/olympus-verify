# Build .242: owner-directed live-first rollout

> Current qualification policy: the owner permanently retired full-suite marathons, historical static-source projection pins and throwaway operator control loops on 10 November 2026. [Release qualification](release-qualification.md) supersedes all older testing instructions below. Dated evidence remains history; runtime/privacy/identity and deployment authority are preserved.


The owner's 10 November 2026 directive explicitly replaces the pre-deployment qualification sequence for this release. Before deployment, run TypeScript compilation / Worker bundling, Lua syntax loading, and a fresh production D1 backup. Deploy the exact committed source and install the public addon and Watcher files before running regression suites. Hosted CI and automated review are post-deployment evidence for this rollout, not pre-deployment approval claims. This is a release-specific exception; runtime identity, privacy, standing, unknown-effect and role-ownership checks remain in force.

The supplied brief contains fifteen numbered implementation items and a separate Olympus integration specification. The integration specification is implementation input; it does not authorize sending Daniel a message. The append-only release evidence is in `Olympus/launch242-2026-11-10`, with the original directive retained there verbatim. Prior .241 tests, stopped Computer Use, held accounts and operational attempts remain historical evidence and are not .242 passes.

## Identity and transport

A current roster can immediately establish the current rank of an already proven character link. A name entered by an arbitrary Discord or website account cannot establish ownership. Verification tickets, trusted native observations, server-approved guild authorities and current account checks remain necessary. Addon relay fields such as `roleId`, rank or guild are requests, not authority.

The Watcher reads persisted addon output; an in-memory SavedVariables table is not an external live transport. Existing links can refresh from a trusted D1 snapshot without another reload. New local evidence still needs a supported export path. The addon exposes a single hardware Sync action and preserves pending records until an explicit server outcome; ticket validity and replay checks remain server decisions.

Mail sender APIs do not supply a character GUID. Any GUID must come from a separately validated roster, native event or existing link. Mail is not deleted merely because a string looks like a code: recording, transfer evidence, and the corresponding durable receipt must complete first. Whisper donation text is an unconfirmed observation, distinct from a confirmed transfer and from tithe credit.

Blizzard documents [native Discord account linking and guild-chat mirroring for modern WoW and Forever](https://news.blizzard.com/en-us/article/24296228/stay-connected-in-world-of-warcraft-with-discord). Its display-name setting can show a Discord name or the last character. The implementation therefore uses stable native identity metadata rather than inferring ownership from chat display text.

## Installation and rollback

Install only the public files enumerated in the new official addon manifest. Preserve private Config.lua, generated exchange files, SavedVariables, Watcher configuration and state. Install Watcher Python modules together so their protocol versions agree. Stop only the freshly identified existing Watcher process; never delete its state or advisory lock. Relaunch one instance with the existing configuration and Forever client directory.

Retain the original .241 deployment identity and .242 pre-deployment D1 export. Roll back code through the exact-commit deployment entrypoint if live acceptance exposes a material regression. A database restore is a separate operation with its own writer-quiescence requirements; this release does not restore production.

## Post-deployment evidence

Record actual serving commit/tree/version, public addon bytes, installed public files, Watcher version and upload acknowledgments. Run the affected Worker, addon and Watcher regressions only after serving. Record failures and repairs honestly. Verify live rank changes, nickname Use/Reset continuity, intake persistence and real receipt acknowledgments separately from synthetic tests. Retire the exact seventeen old roles only after a fresh official zero-holder check and removal of their exact two reviewed channel references; preserve unrelated roles and the unresolved .241 effect.
