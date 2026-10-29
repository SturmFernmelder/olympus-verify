/** TC-03, owner deferred repair (2026-10-29): current role classification is a restriction only.
 * No Treasury flag/config, I/O or effect. Capture before the first await and retain the marker footprint. */
import type { Env } from './env';
import { BETA_RESET_ROLE_IDS } from './beta-reset-policy';
import { parseNativeRoleMap } from './native-rank-adapter';

const SINGLE_KEYS = ['ROLE_GUILD_MEMBER', 'MEMBERSHIP_RETIRED_ROLE_ID', 'ROLE_OFFICER', 'ROLE_MODERATOR', 'ROLE_GUILD_LEADER', 'ROLE_GUILD_MASTER', 'ROLE_RAID_LEADER', 'LINK_ROLE_ID'] as const;
const MARKER_KEYS = [...SINGLE_KEYS, 'BLOCKING_ROLE_IDS', 'INTROS_ROLES', 'QR_NATIVE_ROLE_MAP', 'FULL_RELEASE_ROLES'] as const;
const ID = /^[1-9][0-9]{16,19}$/;
const id = (value: unknown): value is string => typeof value === 'string' && ID.test(value) && BigInt(value) <= 18446744073709551615n;
const held = (changed = false): never => { throw Error(changed ? 'treasury_reserved_roles_changed' : 'treasury_reserved_roles_configuration'); };

export function captureTreasuryReservedRoles(env: Env): Readonly<{ roles: readonly string[]; check: () => void }> {
  const prototype = Object.getPrototypeOf(env), slots = MARKER_KEYS.map(key => Object.getOwnPropertyDescriptor(env, key));
  if (slots.some((slot, i) => !slot && MARKER_KEYS[i]! in env || slot && !Object.hasOwn(slot, 'value'))) return held();
  const check = () => {
    if (Object.getPrototypeOf(env) !== prototype) return held(true);
    for (let i = 0; i < MARKER_KEYS.length; i++) {
      const old = slots[i], live = Object.getOwnPropertyDescriptor(env, MARKER_KEYS[i]!);
      if (!old ? !!live || MARKER_KEYS[i]! in env : !live || ['value', 'writable', 'enumerable', 'configurable', 'get', 'set'].some(key => !Object.is(old[key as keyof PropertyDescriptor], live[key as keyof PropertyDescriptor]))) return held(true);
    }
  };
  const text = (key: typeof MARKER_KEYS[number]): string | undefined => {
    const value = slots[MARKER_KEYS.indexOf(key)]?.value;
    if (value !== undefined && typeof value !== 'string') return held();
    return value;
  };
  const reserved: string[] = [...BETA_RESET_ROLE_IDS];
  for (const key of SINGLE_KEYS) {
    const value = text(key);
    if (value) { if (!id(value)) return held(); reserved.push(value); }
  }
  for (const key of ['BLOCKING_ROLE_IDS', 'INTROS_ROLES'] as const) {
    for (const value of (text(key) ?? '').split(',').map(value => value.trim()).filter(Boolean)) {
      if (!id(value)) return held(); reserved.push(value);
    }
  }
  const native = text('QR_NATIVE_ROLE_MAP');
  if (native) { try { reserved.push(...parseNativeRoleMap(native).roles); } catch { return held(); } }
  const full = text('FULL_RELEASE_ROLES');
  if (full) {
    let value: Record<string, unknown>;
    try { value = JSON.parse(full); } catch { return held(); }
    if (!value || !id(value.membership) || !Array.isArray(value.native) || value.native.length !== 10 || !value.native.every(id)) return held();
    reserved.push(value.membership, ...value.native);
  }
  check();
  return Object.freeze({ roles: Object.freeze([...new Set(reserved)]), check });
}
