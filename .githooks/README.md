# Projection hook retired

The owner's permanent mandate of 10 November 2026 retires the static-source
projection pre-push gate. There is no repository-provided pre-push hook now.
An existing `core.hooksPath=.githooks` setting can remain; Git has no pre-push
file to execute. Other locally installed hooks are not changed.

Use the bounded [release qualification](../docs/release-qualification.md).
Do not reinstall `check-projections.cjs` as a push, CI, merge or deployment gate.
Historical projection code and receipts are retained for diagnosis only.
