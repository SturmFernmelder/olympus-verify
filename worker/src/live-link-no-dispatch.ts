/** A successful original queue receipt can be closed only while the complete
 * tuple is still unattempted. This is never a retry or an inferred HTTP ACK. */
import type { Env } from './env';
import { privacyProviderCustodyDatabase } from './privacy-serving-authority';
import { assertPrivacyAdmissionWitness } from './privacy-write-admission';

export const LIVE_LINK_NO_DISPATCH_SQL = `UPDATE role_settlements SET state='held',reason='live_link_never_dispatched',
 checked_at=CAST(strftime('%s','now') AS INTEGER)
 WHERE id=?1 AND subject=?2 AND guild_id=?3 AND role_id=?4 AND purpose='live_link_membership' AND desired=1
 AND subject_generation IS ?5 AND request_digest=?6 AND created_at=?7 AND expires_at=?8
 AND roster_id IS ?9 AND native_guid=?10 AND native_profile='live-link-v1'
 AND state='pending' AND reason='launch230_awaiting_dispatch' AND attempts=0 AND claim_nonce IS NULL AND checked_at IS NULL
 RETURNING id`;

type Method = Readonly<{ receiver: object; owner: object; fn: Function; name: string }>;
const held = (): never => { throw Error('live_link_cleanup_custody_held'); };
function method(receiver: object, name: string): Method {
  for (let owner: object | null = receiver, depth = 0; owner && depth < 4; owner = Object.getPrototypeOf(owner), depth++) {
    const d = Object.getOwnPropertyDescriptor(owner, name);
    if (d) {
      if (!Object.hasOwn(d, 'value') || typeof d.value !== 'function') return held();
      return Object.freeze({ receiver, owner, fn: d.value, name });
    }
  }
  return held();
}
function unchanged(original: Method): void {
  const current = method(original.receiver, original.name);
  if (current.owner !== original.owner || current.fn !== original.fn) held();
}

/** Capture immediately after the original acknowledged queue receipt, before any
 * provider await. The caller retains its source-owned receipt witness; this
 * closure only closes a known unattempted tuple and cannot dispatch a role.
 * No late lookup of env.DB can redirect cleanup to another physical ledger. */
export function captureLiveLinkNoDispatch(env: Env, tuple: readonly (string | number | null)[], originalCheck: () => void): () => Promise<{ id: string } | null> {
  originalCheck();
  if (tuple.length !== 10 || tuple.some(v => v !== null && typeof v !== 'string' && typeof v !== 'number')) return held();
  const proto = Object.getPrototypeOf(env), slot = Object.getOwnPropertyDescriptor(env, 'DB');
  if (!slot || !Object.hasOwn(slot, 'value')) return held();
  const database = privacyProviderCustodyDatabase(env);
  const source = () => {
    originalCheck();
    const current = Object.getOwnPropertyDescriptor(env, 'DB');
    if (Object.getPrototypeOf(env) !== proto || !current || !['value', 'writable', 'enumerable', 'configurable', 'get', 'set'].every(k => Object.is(current[k as keyof PropertyDescriptor], slot[k as keyof PropertyDescriptor]))) held();
    assertPrivacyAdmissionWitness(database);
  };
  source();
  const prepare = method(database, 'prepare');
  const unbound = Reflect.apply(prepare.fn, prepare.receiver, [LIVE_LINK_NO_DISPATCH_SQL]) as D1PreparedStatement;
  source(); unchanged(prepare);
  const bind = method(unbound, 'bind');
  const statement = Reflect.apply(bind.fn, bind.receiver, [...tuple]) as D1PreparedStatement;
  source(); unchanged(prepare); unchanged(bind);
  const first = method(statement, 'first');
  const check = () => { source(); unchanged(prepare); unchanged(bind); unchanged(first); };
  check();
  return async () => {
    check();
    const result = await Reflect.apply(first.fn, first.receiver, []) as { id: string } | null;
    check();
    return result;
  };
}
