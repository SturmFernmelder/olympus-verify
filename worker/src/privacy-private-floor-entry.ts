/** Dedicated namespace owner. Its HTTP entry exposes no control route.
 * The original DO constructor creates empty schema only; authenticated initialization stays separate. */
export {PrivacyRecoveryFloor} from './privacy-recovery-floor';

export default {
 async fetch():Promise<Response>{
  return new Response('not found',{status:404,headers:{'Cache-Control':'no-store'}});
 }
};
