-- Optional application performance index. Deploy compatible main/private code before applying live DDL.
-- Active admitted fetch/cron paths never install it; exact stored DDL is the no-IF-NOT-EXISTS form.
CREATE INDEX IF NOT EXISTS audit_reconcile266 ON audit(action, actor, subject, ts DESC, id DESC);
