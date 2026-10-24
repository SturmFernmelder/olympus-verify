/** Canonical policies must remain readable without the member shell or JavaScript.
 * The owner's .197 follow-up (24 Oct 2026) keeps /#/legal/* as an explicit
 * enhancement, never an implicit redirect based on a cookie. A valid cookie does
 * not prove the SPA can enter its current serving/standing gate. In particular,
 * do not authenticate before the always-available public policy responder.
 * This compatibility hook stays inert at both existing entry points: no D1,
 * provider read, session refresh, cookie write, query reflection or text rewrite. */
import type { Env } from './env';
export async function memberLegalNavigation(_request: Request, _env: Env, _path: string): Promise<Response | null> {
  return null;
}
