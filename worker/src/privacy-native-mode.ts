/** Owner .164 decision: serving uses the existing Native Epoch 2 SQL boundary.
 * Private recovery/Floor bindings are historical control-plane state, never a prerequisite
 * for public pages, sign-in, cron or an authenticated erasure request in this mode.
 */
import type {Env} from './env';

export function nativeErasureMode(env:Env):boolean {
  const value=Object.getOwnPropertyDescriptor(env,'PRIVACY_NATIVE_ERASURE_ENABLED');
  return !!value&&Object.hasOwn(value,'value')&&value.value==='true';
}

const PRIVATE_GATE=['PRIVACY_RECOVERY_FLOOR','PRIVACY_SERVING_GATE_SECRET','PRIVACY_CREDENTIAL_EPOCH','PRIVACY_SERVING_SOURCE_TREE','PRIVACY_SERVING_DATABASE_ID'] as const;
/** Capture only data descriptors. Removing an obsolete partial gate is not a fallback after
 * dispatch: the Native model is chosen before the first await and the SQL epoch remains bound.
 */
export function nativeServingEnvironment(env:Env):Env {
  if(!nativeErasureMode(env))return env;
  const descriptors=Object.getOwnPropertyDescriptors(env);
  for(const key of PRIVATE_GATE)delete descriptors[key];
  return Object.defineProperties(Object.create(null),descriptors) as Env;
}
